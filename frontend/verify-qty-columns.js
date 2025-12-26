// 수량 컬럼 확인 스크립트
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
  
  // 매출 테이블 컬럼 확인
  const query = `
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'PRCS' 
      AND table_name = 'DB_SCS_W'
      AND (column_name LIKE '%QTY%' OR column_name LIKE '%qty%')
    ORDER BY column_name
  `;
  
  connection.execute({
    sqlText: query,
    complete: (err, stmt, rows) => {
      if (err) {
        console.error('쿼리 실패:', err);
      } else {
        console.log('\n📊 DB_SCS_W 테이블의 수량(QTY) 관련 컬럼들:');
        rows.forEach(row => {
          console.log('  -', row.COLUMN_NAME);
        });
      }
      
      // 재고 테이블도 확인
      const stockQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'PRCS' 
          AND table_name = 'DW_SCS_DACUM'
          AND (column_name LIKE '%QTY%' OR column_name LIKE '%qty%')
        ORDER BY column_name
      `;
      
      connection.execute({
        sqlText: stockQuery,
        complete: (err2, stmt2, rows2) => {
          if (err2) {
            console.error('재고 테이블 쿼리 실패:', err2);
          } else {
            console.log('\n📊 DW_SCS_DACUM 테이블의 수량(QTY) 관련 컬럼들:');
            rows2.forEach(row => {
              console.log('  -', row.COLUMN_NAME);
            });
          }
          
          connection.destroy();
          console.log('\n연결 종료');
        }
      });
    }
  });
});

