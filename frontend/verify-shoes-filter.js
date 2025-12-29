// 신발 필터 테스트
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
  
  // prdt CTE에서 vtext2 값 확인
  const query = `
    SELECT DISTINCT vtext2
    FROM sap_fnf.mst_prdt
    WHERE vtext1 = 'ACC'
    ORDER BY vtext2
  `;
  
  connection.execute({
    sqlText: query,
    complete: (err, stmt, rows) => {
      if (err) {
        console.error('쿼리 실패:', err);
      } else {
        console.log('\n📊 ACC 상품의 vtext2 (중분류) 값들:');
        rows.forEach(row => {
          console.log('  -', row.VTEXT2);
        });
      }
      
      connection.destroy();
      console.log('\n연결 종료');
    }
  });
});

