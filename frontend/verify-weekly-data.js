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

  connection.execute({
    sqlText: verifyQuery,
    complete: (err, stmt, rows) => {
      if (err) {
        console.error('쿼리 실패:', err);
        connection.destroy();
        return;
      }
      
      console.log('=== 51주차 날짜 확인 ===');
      console.log(rows);
      
      // 재고 확인
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
      
      connection.execute({
        sqlText: stockQuery,
        complete: (err, stmt, rows) => {
          if (err) {
            console.error('재고 쿼리 실패:', err);
            connection.destroy();
            return;
          }
          
          console.log('\n=== MLB 51주차 재고 (2025-12-21 기준) ===');
          console.log(rows);
          
          let total = 0;
          rows.forEach(r => {
            total += r.STOCK_MILLION || 0;
          });
          console.log('\n총 재고 (백만원):', total);
          
          // 해당 주차 매출 확인 (1주치)
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
          
          connection.execute({
            sqlText: saleWeekQuery,
            complete: (err, stmt, rows) => {
              if (err) {
                console.error('해당주차 매출 쿼리 실패:', err);
              } else {
                console.log('\n=== MLB 51주차 해당주차 매출 (1주치) ===');
                console.log(rows);
                
                let totalWeekSale = 0;
                rows.forEach(r => {
                  totalWeekSale += r.SALE_MILLION || 0;
                });
                console.log('\n해당주차 매출 합계 (백만원):', totalWeekSale);
              }
              
              // 4주 매출도 확인
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
          
          connection.execute({
            sqlText: saleQuery,
            complete: (err, stmt, rows) => {
              if (err) {
                console.error('매출 쿼리 실패:', err);
              } else {
                console.log('\n=== MLB 51주차 최근 4주 매출 ===');
                console.log(rows);
                
                let totalSale = 0;
                rows.forEach(r => {
                  totalSale += r.SALE_MILLION || 0;
                });
                console.log('\n총 매출 (백만원, 최근 4주):', totalSale);
              }
              
              connection.destroy();
              console.log('\n검증 완료');
            }
          });
        }
      });
    }
  });
});

