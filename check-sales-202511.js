require('dotenv').config();
const snowflake = require('snowflake-sdk');

console.log('🔍 2025년 11월 매출 데이터 확인 중...\n');

const config = {
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USERNAME,
  password: process.env.SNOWFLAKE_PASSWORD,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA,
  role: process.env.SNOWFLAKE_ROLE,
};

// 필수 정보 체크
const required = ['account', 'username', 'password', 'warehouse', 'database', 'schema'];
const missing = required.filter(key => !config[key]);

if (missing.length > 0) {
  console.log('❌ 누락된 필수 정보:', missing.join(', '));
  console.log('\n.env 파일에 위 정보들을 입력해주세요!');
  process.exit(1);
}

const connection = snowflake.createConnection(config);

connection.connect((err, conn) => {
  if (err) {
    console.error('❌ Snowflake 연결 실패:', err.message);
    process.exit(1);
  }

  console.log('✅ Snowflake 연결 성공!\n');

  const yyyymm = '202511'; // 2025년 11월
  const prevYyyymm = '202510'; // 전월 (2025년 10월)
  const pyYyyymm = '202411'; // 전년 동월 (2024년 11월)

  // 매출 데이터 조회 쿼리 (택판매액, 실판매액)
  const query = `
-- item: ACC 아이템 기준
WITH item AS (
    SELECT prdt_cd, sesn,
        CASE 
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Headwear' THEN '모자'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Shoes' THEN '신발'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Bag' THEN '가방'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Acc_etc' THEN '기타ACC'
        END AS item_std
    FROM sap_fnf.mst_prdt
    WHERE prdt_hrrc1_nm = 'ACC'
),
-- 2025년 11월 매출 (택판매액, 실판매액)
sale_202511 AS (
    SELECT 
        a.brd_cd,
        b.item_std,
        COUNT(DISTINCT a.prdt_cd) as product_count,
        SUM(a.tag_sale_amt) as tag_sale_amt,
        SUM(a.act_sale_amt) as act_sale_amt,
        COUNT(*) as record_count
    FROM sap_fnf.dm_pl_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.shop_cd = c.sap_shop_cd
    WHERE a.pst_yyyymm = '${yyyymm}'
        AND c.chnl_cd <> '9' -- 수출제외
        AND b.item_std IS NOT NULL
    GROUP BY a.brd_cd, b.item_std
),
-- 2025년 10월 매출 (전월 비교용)
sale_202510 AS (
    SELECT 
        a.brd_cd,
        b.item_std,
        SUM(a.tag_sale_amt) as tag_sale_amt,
        SUM(a.act_sale_amt) as act_sale_amt
    FROM sap_fnf.dm_pl_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.shop_cd = c.sap_shop_cd
    WHERE a.pst_yyyymm = '${prevYyyymm}'
        AND c.chnl_cd <> '9' -- 수출제외
        AND b.item_std IS NOT NULL
    GROUP BY a.brd_cd, b.item_std
),
-- 2024년 11월 매출 (전년 동월 비교용)
sale_202411 AS (
    SELECT 
        a.brd_cd,
        b.item_std,
        SUM(a.tag_sale_amt) as tag_sale_amt,
        SUM(a.act_sale_amt) as act_sale_amt
    FROM sap_fnf.dm_pl_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.shop_cd = c.sap_shop_cd
    WHERE a.pst_yyyymm = '${pyYyyymm}'
        AND c.chnl_cd <> '9' -- 수출제외
        AND b.item_std IS NOT NULL
    GROUP BY a.brd_cd, b.item_std
)
SELECT 
    s.brd_cd as "브랜드",
    s.item_std as "아이템",
    s.product_count as "품번수",
    s.record_count as "레코드수",
    ROUND(s.tag_sale_amt / 1000000, 1) as "택판매액_백만원",
    s.tag_sale_amt as "택판매액_원",
    ROUND(s.act_sale_amt / 1000000, 1) as "실판매액_백만원",
    ROUND(COALESCE(prev.tag_sale_amt, 0) / 1000000, 1) as "전월택판매액_백만원",
    ROUND(COALESCE(py.tag_sale_amt, 0) / 1000000, 1) as "전년동월택판매액_백만원",
    CASE 
        WHEN COALESCE(prev.tag_sale_amt, 0) > 0 
        THEN ROUND((s.tag_sale_amt / prev.tag_sale_amt - 1) * 100, 1)
        ELSE NULL
    END as "전월대비변동률_퍼센트",
    CASE 
        WHEN COALESCE(py.tag_sale_amt, 0) > 0 
        THEN ROUND((s.tag_sale_amt / py.tag_sale_amt - 1) * 100, 1)
        ELSE NULL
    END as "전년동월대비변동률_퍼센트"
FROM sale_202511 s
LEFT JOIN sale_202510 prev ON s.brd_cd = prev.brd_cd AND s.item_std = prev.item_std
LEFT JOIN sale_202411 py ON s.brd_cd = py.brd_cd AND s.item_std = py.item_std
ORDER BY s.brd_cd, 
    CASE s.item_std 
        WHEN '신발' THEN 1
        WHEN '모자' THEN 2
        WHEN '가방' THEN 3
        WHEN '기타ACC' THEN 4
        ELSE 5
    END
  `;

  console.log(`📊 ${yyyymm} 매출 데이터 조회 중...\n`);

  conn.execute({
    sqlText: query,
    complete: (err, stmt, rows) => {
      if (err) {
        console.error('❌ 쿼리 실행 실패:', err.message);
        console.error('상세 오류:', err);
        conn.destroy();
        process.exit(1);
      }

      if (!rows || rows.length === 0) {
        console.log('⚠️  조회된 데이터가 없습니다.');
        console.log(`\n💡 확인 사항:`);
        console.log(`   1. ${yyyymm} 매출 데이터가 Snowflake에 업로드되었는지 확인`);
        console.log(`   2. 테이블명이 정확한지 확인 (sap_fnf.dm_pl_shop_prdt_m)`);
        console.log(`   3. pst_yyyymm 컬럼 형식이 'YYYYMM'인지 확인`);
      } else {
        console.log(`✅ 총 ${rows.length}개 행 조회 성공!\n`);
        console.log('='.repeat(140));
        console.log('📋 브랜드별·아이템별 매출 현황 (택판매액 기준)');
        console.log('='.repeat(140));
        console.log(
          '브랜드'.padEnd(8) +
          '아이템'.padEnd(10) +
          '품번수'.padStart(8) +
          '택판매액(백만원)'.padStart(18) +
          '실판매액(백만원)'.padStart(18) +
          '전월대비(%)'.padStart(12) +
          '전년동월대비(%)'.padStart(15)
        );
        console.log('-'.repeat(140));

        let totalTagSale = 0;
        let totalActSale = 0;
        let totalPrevTagSale = 0;
        let totalPyTagSale = 0;

        rows.forEach((row) => {
          const brand = row.브랜드 || '-';
          const item = row.아이템 || '-';
          const productCount = row.품번수 || 0;
          const tagSale = row.택판매액_백만원 || 0;
          const actSale = row.실판매액_백만원 || 0;
          const prevTagSale = row.전월택판매액_백만원 || 0;
          const pyTagSale = row.전년동월택판매액_백만원 || 0;
          const prevChange = row.전월대비변동률_퍼센트 !== null 
            ? `${row.전월대비변동률_퍼센트 > 0 ? '+' : ''}${row.전월대비변동률_퍼센트}%` 
            : 'N/A';
          const pyChange = row.전년동월대비변동률_퍼센트 !== null 
            ? `${row.전년동월대비변동률_퍼센트 > 0 ? '+' : ''}${row.전년동월대비변동률_퍼센트}%` 
            : 'N/A';

          console.log(
            brand.padEnd(8) +
            item.padEnd(10) +
            String(productCount).padStart(8) +
            String(tagSale.toLocaleString('ko-KR')).padStart(18) +
            String(actSale.toLocaleString('ko-KR')).padStart(18) +
            prevChange.padStart(12) +
            pyChange.padStart(15)
          );

          totalTagSale += row.택판매액_원 || 0;
          totalActSale += (row.실판매액_백만원 || 0) * 1000000;
          totalPrevTagSale += (row.전월택판매액_백만원 || 0) * 1000000;
          totalPyTagSale += (row.전년동월택판매액_백만원 || 0) * 1000000;
        });

        console.log('-'.repeat(140));
        console.log(
          '합계'.padEnd(18) +
          String(Math.round(totalTagSale / 1000000).toLocaleString('ko-KR')).padStart(18) +
          String(Math.round(totalActSale / 1000000).toLocaleString('ko-KR')).padStart(18) +
          (totalPrevTagSale > 0 ? String(Math.round((totalTagSale / totalPrevTagSale - 1) * 100 * 10) / 10).padStart(11) + '%' : 'N/A'.padStart(12)) +
          (totalPyTagSale > 0 ? String(Math.round((totalTagSale / totalPyTagSale - 1) * 100 * 10) / 10).padStart(14) + '%' : 'N/A'.padStart(15))
        );
        console.log('='.repeat(140));

        // 브랜드별 합계
        const brandSummary = {};
        rows.forEach((row) => {
          const brand = row.브랜드 || '-';
          if (!brandSummary[brand]) {
            brandSummary[brand] = {
              tagSale: 0,
              actSale: 0,
              prevTagSale: 0,
              pyTagSale: 0,
            };
          }
          brandSummary[brand].tagSale += row.택판매액_원 || 0;
          brandSummary[brand].actSale += (row.실판매액_백만원 || 0) * 1000000;
          brandSummary[brand].prevTagSale += (row.전월택판매액_백만원 || 0) * 1000000;
          brandSummary[brand].pyTagSale += (row.전년동월택판매액_백만원 || 0) * 1000000;
        });

        console.log('\n📊 브랜드별 합계 (택판매액 기준):');
        console.log('-'.repeat(100));
        Object.keys(brandSummary).sort().forEach((brand) => {
          const summary = brandSummary[brand];
          const tagSaleM = Math.round(summary.tagSale / 1000000);
          const prevChange = summary.prevTagSale > 0 
            ? `${Math.round((summary.tagSale / summary.prevTagSale - 1) * 100 * 10) / 10}%`
            : 'N/A';
          const pyChange = summary.pyTagSale > 0 
            ? `${Math.round((summary.tagSale / summary.pyTagSale - 1) * 100 * 10) / 10}%`
            : 'N/A';
          console.log(
            `${brand}: ${tagSaleM.toLocaleString('ko-KR')}백만원 (전월대비: ${prevChange}, 전년동월대비: ${pyChange})`
          );
        });

        console.log('\n💡 재고주수 계산을 위해서는 택판매액이 필요합니다.');
        console.log('   재고주수 = 재고금액 / (택판매액 / 30일 * 7일)');
      }

      // 연결 종료
      conn.destroy((err) => {
        if (err) {
          console.error('\n⚠️  연결 종료 중 오류:', err.message);
        } else {
          console.log('\n✅ 연결 종료 완료');
        }
        console.log('\n🎉 2025년 11월 매출 데이터 확인 완료!');
        process.exit(0);
      });
    },
  });
});


