// 수량 데이터 확인 스크립트
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
  
  // MLB 브랜드의 최근 주차 수량 데이터 확인
  const query = `
    WITH prdt AS (
      SELECT prdt_cd
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    )
    SELECT 
      '재고수량' as type,
      SUM(a.stock_qty) as total_qty,
      SUM(a.stock_tag_amt) as total_amt
    FROM prcs.dw_scs_dacum a
    INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
    WHERE a.brd_cd = 'M'
      AND '2025-12-21' BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
    
    UNION ALL
    
    SELECT 
      '매출수량(4주)' as type,
      SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) as total_qty,
      SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) as total_amt
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
        console.log('\n📊 MLB 브랜드 ACC 수량 데이터 (51주차 기준):');
        console.log('='.repeat(50));
        rows.forEach(row => {
          console.log(`${row.TYPE}:`);
          console.log(`  수량: ${row.TOTAL_QTY?.toLocaleString() || 0}`);
          console.log(`  금액: ${row.TOTAL_AMT?.toLocaleString() || 0}`);
          console.log('');
        });
        
        // 재고주수 계산
        if (rows.length >= 2) {
          const stockQty = rows[0].TOTAL_QTY || 0;
          const stockAmt = rows[0].TOTAL_AMT || 0;
          const saleQty = rows[1].TOTAL_QTY || 0;
          const saleAmt = rows[1].TOTAL_AMT || 0;
          
          console.log('📈 재고주수 계산:');
          console.log(`  금액기준: ${stockAmt} / (${saleAmt} / 4) = ${saleAmt > 0 ? (stockAmt / (saleAmt / 4)).toFixed(1) : 0}주`);
          console.log(`  수량기준: ${stockQty} / (${saleQty} / 4) = ${saleQty > 0 ? (stockQty / (saleQty / 4)).toFixed(1) : 0}주`);
        }
      }
      
      connection.destroy();
      console.log('\n연결 종료');
    }
  });
});

