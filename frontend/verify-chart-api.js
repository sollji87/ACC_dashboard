// 차트 API 쿼리 직접 실행
require('dotenv').config({ path: '.env.local' });
const snowflake = require('snowflake-sdk');

const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USERNAME,
  password: process.env.SNOWFLAKE_PASSWORD,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE,
});

connection.connect((err) => {
  if (err) {
    console.error('연결 실패:', err);
    return;
  }
  console.log('Snowflake 연결 성공!');
  
  const brandCode = 'M';
  const weeksForSale = 4;
  
  const query = `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    all_weeks AS (
      SELECT DISTINCT end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE end_dt <= CURRENT_DATE()
        AND end_dt >= DATEADD(WEEK, -14, CURRENT_DATE())
    ),
    recent_weeks AS (
      SELECT 
        end_dt,
        YEAR(end_dt) AS yyyy,
        WEEKOFYEAR(end_dt) AS week_num,
        TO_CHAR(end_dt, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(end_dt)::STRING, 2, '0') AS week_key,
        ROW_NUMBER() OVER (ORDER BY end_dt DESC) AS week_rank
      FROM all_weeks
      QUALIFY week_rank <= 12
    ),
    week_mapping AS (
      SELECT 
        rw.end_dt AS cy_end_dt,
        rw.week_key AS cy_week_key,
        rw.week_num,
        rw.yyyy AS cy_year,
        (SELECT MIN(end_dt) FROM fnf.prcs.db_sh_s_w 
         WHERE YEAR(end_dt) = rw.yyyy - 1 AND WEEKOFYEAR(end_dt) = rw.week_num) AS py_end_dt
      FROM recent_weeks rw
    ),
    cy_stock AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.cy_end_dt AS asof_dt,
        wm.week_num,
        SUM(a.stock_tag_amt) AS stock_tag_amt,
        SUM(a.stock_qty) AS stock_qty
      FROM week_mapping wm
      JOIN prcs.dw_scs_dacum a
        ON wm.cy_end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
      GROUP BY wm.cy_week_key, wm.cy_end_dt, wm.week_num
    ),
    py_stock AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.cy_end_dt AS asof_dt,
        wm.week_num,
        SUM(a.stock_tag_amt) AS stock_tag_amt,
        SUM(a.stock_qty) AS stock_qty
      FROM week_mapping wm
      JOIN prcs.dw_scs_dacum a
        ON wm.py_end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
        AND wm.py_end_dt IS NOT NULL
      GROUP BY wm.cy_week_key, wm.cy_end_dt, wm.week_num
    ),
    cy_sale AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.cy_end_dt AS asof_dt,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_mapping wm
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wm.cy_end_dt
        AND s.end_dt > DATEADD(WEEK, -${weeksForSale}, wm.cy_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
      GROUP BY wm.cy_week_key, wm.cy_end_dt
    ),
    py_sale AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.cy_end_dt AS asof_dt,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_mapping wm
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wm.py_end_dt
        AND s.end_dt > DATEADD(WEEK, -${weeksForSale}, wm.py_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        AND wm.py_end_dt IS NOT NULL
      GROUP BY wm.cy_week_key, wm.cy_end_dt
    )
    SELECT
      cs.week_key,
      cs.asof_dt,
      cs.week_num,
      cs.stock_qty AS cy_stock_qty,
      COALESCE(ps.stock_qty, 0) AS py_stock_qty,
      COALESCE(csa.sale_qty, 0) AS cy_sale_qty,
      COALESCE(psa.sale_qty, 0) AS py_sale_qty,
      CASE WHEN COALESCE(csa.sale_qty, 0) > 0 
        THEN ROUND(cs.stock_qty / (csa.sale_qty / ${weeksForSale}), 1)
        ELSE 0 END AS cy_weeks_qty,
      CASE WHEN COALESCE(psa.sale_qty, 0) > 0 
        THEN ROUND(COALESCE(ps.stock_qty, 0) / (psa.sale_qty / ${weeksForSale}), 1)
        ELSE 0 END AS py_weeks_qty
    FROM cy_stock cs
    LEFT JOIN py_stock ps ON cs.week_key = ps.week_key
    LEFT JOIN cy_sale csa ON cs.week_key = csa.week_key
    LEFT JOIN py_sale psa ON cs.week_key = psa.week_key
    ORDER BY cs.asof_dt ASC
  `;
  
  connection.execute({
    sqlText: query,
    complete: (err, stmt, rows) => {
      if (err) {
        console.error('쿼리 실패:', err);
      } else {
        console.log('\n📊 MLB 브랜드 차트 수량 데이터:');
        console.log('='.repeat(80));
        console.log('주차\t\t재고수량\t매출수량(4주)\t재고주수(수량)');
        console.log('-'.repeat(80));
        rows.forEach(row => {
          console.log(`${row.WEEK_KEY}\t${row.CY_STOCK_QTY?.toLocaleString()}\t${row.CY_SALE_QTY?.toLocaleString()}\t\t${row.CY_WEEKS_QTY}주`);
        });
      }
      
      connection.destroy();
      console.log('\n연결 종료');
    }
  });
});

