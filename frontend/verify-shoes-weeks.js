/**
 * MLB 신발 재고주수 검증 스크립트
 * 4주 매출 기준으로 재고주수 계산 검증
 */

const snowflake = require('snowflake-sdk');

const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT || 'qz64889.ap-northeast-2.aws',
  username: process.env.SNOWFLAKE_USERNAME || 'SVC_ECS_ETL',
  password: process.env.SNOWFLAKE_PASSWORD || 'Svc_ecs_etl2024!@',
  database: process.env.SNOWFLAKE_DATABASE || 'FNF',
  schema: process.env.SNOWFLAKE_SCHEMA || 'PRCS',
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'FNF_DW_WH',
});

async function executeQuery(sql) {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      complete: (err, stmt, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    });
  });
}

async function verifyWeeksCalculation() {
  console.log('\n🔍 MLB 신발 재고주수 검증 시작\n');

  try {
    // 1. 연결
    await new Promise((resolve, reject) => {
      connection.connect((err, conn) => {
        if (err) reject(err);
        else resolve(conn);
      });
    });
    console.log('✅ Snowflake 연결 성공\n');

    // 2. 최근 12주 데이터 조회 - 신발만
    const query = `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm, sesn
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 최근 12주 종료일 목록
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
    -- 당년 재고 (신발만)
    cy_stock AS (
      SELECT
        rw.week_key,
        rw.end_dt,
        rw.week_num,
        SUM(a.stock_tag_amt) AS stock_tag_amt,
        SUM(a.stock_qty) AS stock_qty
      FROM recent_weeks rw
      JOIN prcs.dw_scs_dacum a
        ON rw.end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = 'M'
        AND p.prdt_hrrc2_nm = 'Shoes'
      GROUP BY rw.week_key, rw.end_dt, rw.week_num
    ),
    -- 당년 4주 매출 (신발만)
    cy_sale_4w AS (
      SELECT
        rw.week_key,
        rw.end_dt,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_4w_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_4w_qty
      FROM recent_weeks rw
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= rw.end_dt
        AND s.end_dt > DATEADD(WEEK, -4, rw.end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = 'M'
        AND p.prdt_hrrc2_nm = 'Shoes'
      GROUP BY rw.week_key, rw.end_dt
    )
    SELECT
      cs.week_key,
      cs.end_dt AS "종료일",
      cs.week_num AS "주차",
      ROUND(cs.stock_tag_amt / 1000000, 2) AS "재고금액_백만",
      ROUND(csa.sale_4w_amt / 1000000, 2) AS "4주매출_백만",
      ROUND(csa.sale_4w_amt / 4 / 1000000, 2) AS "주평균매출_백만",
      CASE 
        WHEN csa.sale_4w_amt > 0 
        THEN ROUND(cs.stock_tag_amt / (csa.sale_4w_amt / 4), 1)
        ELSE 0 
      END AS "재고주수_계산"
    FROM cy_stock cs
    LEFT JOIN cy_sale_4w csa ON cs.week_key = csa.week_key
    ORDER BY cs.end_dt ASC
    `;

    const rows = await executeQuery(query);
    
    console.log('📊 MLB 신발 - 주차별 재고주수 상세 데이터 (4주 매출 기준)');
    console.log('=' .repeat(100));
    console.log('주차키\t\t종료일\t\t주차\t재고(백만)\t4주매출(백만)\t주평균매출(백만)\t재고주수');
    console.log('-'.repeat(100));
    
    rows.forEach(row => {
      console.log(`${row.WEEK_KEY}\t${new Date(row['종료일']).toISOString().split('T')[0]}\t${row['주차']}\t${row['재고금액_백만']}\t\t${row['4주매출_백만']}\t\t${row['주평균매출_백만']}\t\t\t${row['재고주수_계산']}`);
    });
    
    console.log('=' .repeat(100));
    console.log('\n📝 재고주수 계산 공식:');
    console.log('   재고주수 = 재고택금액 / (4주 택매출 / 4)');
    console.log('   = 재고택금액 / 주당 평균 매출\n');

    // 3. 연결 종료
    connection.destroy((err, conn) => {
      if (err) console.error('연결 종료 오류:', err);
      else console.log('✅ 검증 완료');
    });

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    connection.destroy();
  }
}

verifyWeeksCalculation();
