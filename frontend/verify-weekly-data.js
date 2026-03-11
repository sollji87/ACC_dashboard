// MLB 51주차 데이터 검증 스크립트
const snowflake = require('snowflake-sdk');
require('dotenv').config({ path: '.env.local' });

const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USERNAME,
  password: process.env.SNOWFLAKE_PASSWORD,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE,
  role: process.env.SNOWFLAKE_ROLE,
});

connection.connect((err) => {
  if (err) {
    console.error('연결 실패:', err);
    return;
  }
  console.log('Snowflake 연결 성공\n');

  const runQuery = (sqlText, onSuccess) => {
    connection.execute({
      sqlText,
      complete: (queryErr, stmt, rows) => {
        if (queryErr) {
          onSuccess(queryErr);
          return;
        }

        onSuccess(null, rows);
      },
    });
  };

  const destroyConnection = () => {
    connection.destroy();
    console.log('\n검증 완료');
  };

  // MLB 51주차 검증 쿼리
  const verifyQuery = `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 51주차 종료일 확인
    week_dates AS (
      SELECT
        MIN(CASE WHEN YEAR(end_dt) = 2025 AND WEEKOFYEAR(end_dt) = 51 THEN end_dt END) AS cy_end_dt,
        MIN(CASE WHEN YEAR(end_dt) = 2024 AND WEEKOFYEAR(end_dt) = 51 THEN end_dt END) AS py_end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE (YEAR(end_dt) = 2025 OR YEAR(end_dt) = 2024)
        AND WEEKOFYEAR(end_dt) = 51
    )
    SELECT * FROM week_dates;
  `;

  const stockQuery = `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    )
    SELECT
      p.prdt_hrrc2_nm,
      SUM(a.stock_tag_amt) AS stock_tag_amt,
      ROUND(SUM(a.stock_tag_amt) / 1000000, 0) AS stock_million
    FROM prcs.dw_scs_dacum a
    INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
    WHERE a.brd_cd = 'M'
      AND DATE '2025-12-21' BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
    GROUP BY p.prdt_hrrc2_nm
    ORDER BY p.prdt_hrrc2_nm;
  `;

  const saleWeekQuery = `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    )
    SELECT
      p.prdt_hrrc2_nm,
      SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_tag_amt,
      ROUND(SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) / 1000000, 0) AS sale_million
    FROM fnf.prcs.db_scs_w s
    INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
    WHERE s.brd_cd = 'M'
      AND s.end_dt = DATE '2025-12-21'
    GROUP BY p.prdt_hrrc2_nm
    ORDER BY p.prdt_hrrc2_nm;
  `;

  const saleQuery = `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    )
    SELECT
      p.prdt_hrrc2_nm,
      SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_tag_amt,
      ROUND(SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) / 1000000, 0) AS sale_million
    FROM fnf.prcs.db_scs_w s
    INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
    WHERE s.brd_cd = 'M'
      AND s.end_dt <= DATE '2025-12-21'
      AND s.end_dt > DATEADD(WEEK, -4, DATE '2025-12-21')
    GROUP BY p.prdt_hrrc2_nm
    ORDER BY p.prdt_hrrc2_nm;
  `;

  runQuery(verifyQuery, (verifyErr, verifyRows) => {
    if (verifyErr) {
      console.error('쿼리 실패:', verifyErr);
      destroyConnection();
      return;
    }

    console.log('=== 51주차 날짜 확인 ===');
    console.log(verifyRows);

    runQuery(stockQuery, (stockErr, stockRows = []) => {
      if (stockErr) {
        console.error('재고 쿼리 실패:', stockErr);
        destroyConnection();
        return;
      }

      console.log('\n=== MLB 51주차 재고 (2025-12-21 기준) ===');
      console.log(stockRows);

      const totalStock = stockRows.reduce((sum, row) => sum + (row.STOCK_MILLION || 0), 0);
      console.log('\n총 재고 (백만원):', totalStock);

      runQuery(saleWeekQuery, (saleWeekErr, saleWeekRows = []) => {
        if (saleWeekErr) {
          console.error('해당주차 매출 쿼리 실패:', saleWeekErr);
        } else {
          console.log('\n=== MLB 51주차 해당주차 매출 (1주치) ===');
          console.log(saleWeekRows);

          const totalWeekSale = saleWeekRows.reduce((sum, row) => sum + (row.SALE_MILLION || 0), 0);
          console.log('\n해당주차 매출 합계 (백만원):', totalWeekSale);
        }

        runQuery(saleQuery, (saleErr, saleRows = []) => {
          if (saleErr) {
            console.error('매출 쿼리 실패:', saleErr);
          } else {
            console.log('\n=== MLB 51주차 최근 4주 매출 ===');
            console.log(saleRows);

            const totalSale = saleRows.reduce((sum, row) => sum + (row.SALE_MILLION || 0), 0);
            console.log('\n총 매출 (백만원, 최근 4주):', totalSale);
          }

          destroyConnection();
        });
      });
    });
  });
});

