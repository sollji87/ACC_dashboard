// MLB 신발 51주차 4주 매출 확인
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
  
  const query = `
    WITH prdt AS (
      SELECT prdt_cd
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC' AND vtext2 = 'Shoes'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    )
    SELECT 
      SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) / 1000000 AS sale_4w_million
    FROM fnf.prcs.db_scs_w s
    INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
    WHERE s.brd_cd = 'M'
      AND s.end_dt <= '2025-12-21'
      AND s.end_dt > DATEADD(WEEK, -4, '2025-12-21')
  `;
  
  connection.execute({
    sqlText: query,
    complete: (err, stmt, rows) => {
      if (err) {
        console.error('쿼리 실패:', err);
      } else {
        console.log('\n📊 MLB 신발 51주차 기준 4주 매출:');
        console.log('='.repeat(50));
        const sale4w = rows[0]?.SALE_4W_MILLION || 0;
        console.log(`4주 합계: ${Math.round(sale4w).toLocaleString()}백만원`);
        console.log(`주간 평균: ${Math.round(sale4w / 4).toLocaleString()}백만원`);
      }
      
      connection.destroy();
      console.log('\n연결 종료');
    }
  });
});

