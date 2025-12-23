// MLB 51주차 해당주차 매출 검증
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

  // 해당 주차 매출 (1주치만)
  const query = `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    )
    SELECT
      p.prdt_hrrc2_nm,
      ROUND(SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) / 1000000, 0) AS sale_million
    FROM fnf.prcs.db_scs_w s
    INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
    WHERE s.brd_cd = 'M'
      AND s.end_dt = DATE '2025-12-21'
    GROUP BY p.prdt_hrrc2_nm
    ORDER BY p.prdt_hrrc2_nm
  `;

  connection.execute({
    sqlText: query,
    complete: (err, stmt, rows) => {
      if (err) {
        console.error('쿼리 실패:', err);
      } else {
        console.log('=== MLB 51주차 해당주차 매출 (1주치, 백만원) ===');
        let total = 0;
        rows.forEach(r => {
          console.log(`${r.PRDT_HRRC2_NM}: ${r.SALE_MILLION}`);
          total += r.SALE_MILLION || 0;
        });
        console.log(`\n합계: ${total} 백만원`);
        console.log('\n* UI에 표시되는 ACC 택판매액은 이 값이어야 함');
      }
      connection.destroy();
    }
  });
});

