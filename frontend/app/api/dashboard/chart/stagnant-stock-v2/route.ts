/**
 * 정체재고 계산 API (신규 정의)
 * GET /api/dashboard/chart/stagnant-stock-v2?brandCode=M&yyyymm=202510
 * 
 * 정체재고 정의:
 * 1. 활성 시즌 제외
 *    - 2025년 1-2월: 25N, 25S, 24F, 24S 제외
 *    - 2025년 3-8월: 25N, 25S, 25F, 24F 제외
 *    - 2025년 9-12월: 26N, 26S, 25F, 25S 제외
 *    - 전년은 시즌에서 1씩 빼면 됨
 * 
 * 2. 기준금액 = 브랜드의 해당 월 전체 재고 택금액 * 0.1%
 * 3. 품번별로 당월 판매택금액이 기준금액 미달인 경우 정체재고
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { ensureBrandCode, ensureYyyymm } from '@/lib/request-validation';

/**
 * 활성 시즌 목록 반환 (패션회사 SS/FW 기준)
 * 활성 시즌 = 당시즌 + 차기시즌 (정체재고 계산에서 제외)
 * 
 * SS 시즌 (3-8월): 25N, 25S, 25F, 26N, 26S, 27N, 27S
 * FW 시즌 (9-2월): 25N, 25F, 26N, 26S, 26F, 27N, 27S
 */
function getActiveSeasons(yyyymm: string): string[] {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  const yy = year % 100; // 2025 -> 25
  
  if (month >= 3 && month <= 8) {
    // SS 시즌 (3-8월): 25N, 25S, 25F, 26N, 26S, 27N, 27S
    return [`${yy}N`, `${yy}S`, `${yy}F`, `${yy+1}N`, `${yy+1}S`, `${yy+2}N`, `${yy+2}S`];
  } else {
    // FW 시즌 (9-2월): 25N, 25F, 26N, 26S, 26F, 27N, 27S
    // 1-2월은 전년도 FW 시즌
    const baseYear = month >= 9 ? yy : yy - 1;
    return [`${baseYear}N`, `${baseYear}F`, `${baseYear+1}N`, `${baseYear+1}S`, `${baseYear+1}F`, `${baseYear+2}N`, `${baseYear+2}S`];
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = ensureBrandCode(searchParams.get('brandCode') || 'M');
    const yyyymm = ensureYyyymm(searchParams.get('yyyymm') || '202510');

    console.log(`📊 정체재고 V2 조회: ${brandCode}, ${yyyymm}`);
    
    const connection = await connectToSnowflake();

    try {
      // 활성 시즌 목록 생성
      const activeSeasons = getActiveSeasons(yyyymm);
      console.log(`📊 활성 시즌 (제외 대상): ${activeSeasons.join(', ')}`);
      
      // 활성 시즌 조건 생성 (예: sesn NOT LIKE '%25N%' AND sesn NOT LIKE '%25S%' ...)
      const activeSeasonsCondition = activeSeasons
        .map(s => `sesn NOT LIKE '%${s}%'`)
        .join(' AND ');

      // 정체재고 계산 쿼리
      const query = `
-- 1. ACC 품번 정보
WITH item AS (
    SELECT 
        prdt_cd,
        sesn,
        CASE 
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Headwear' THEN '모자'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Shoes' THEN '신발'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Bag' THEN '가방'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Acc_etc' THEN '기타ACC'
        END AS item_std
    FROM sap_fnf.mst_prdt
    WHERE brd_cd = :1
),

-- 2. 기준금액 계산: 브랜드별 ACC 전체 재고 택금액 * 0.01%
total_stock AS (
    SELECT 
        SUM(a.end_stock_tag_amt) as total_stock_amt,
        SUM(a.end_stock_tag_amt) * 0.0001 as threshold_amt  -- 0.01%
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = :1
      AND a.yyyymm = :2
      AND b.item_std IS NOT NULL
),

-- 3. 품번별 재고택금액
stock_by_product AS (
    SELECT 
        a.prdt_cd,
        b.sesn,
        b.item_std,
        SUM(a.end_stock_tag_amt) as end_stock_tag_amt
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = :1
      AND a.yyyymm = :2
      AND b.item_std IS NOT NULL
    GROUP BY a.prdt_cd, b.sesn, b.item_std
),

-- 4. 품번별 당월 판매택금액
sale_by_product AS (
    SELECT 
        a.prdt_cd,
        SUM(a.tag_sale_amt) as tag_sale_amt
    FROM sap_fnf.dm_pl_shop_prdt_m a
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.shop_cd = c.sap_shop_cd
    WHERE a.brd_cd = :1
      AND a.pst_yyyymm = :2
      AND c.chnl_cd NOT IN ('9', '99')  -- 수출, 기타채널 제외
    GROUP BY a.prdt_cd
),

-- 5. 정체재고 계산 (활성 시즌 제외 + 판매액 기준금액 미달)
stagnant_products AS (
    SELECT 
        s.prdt_cd,
        s.sesn,
        s.item_std,
        s.end_stock_tag_amt,
        COALESCE(p.tag_sale_amt, 0) as tag_sale_amt,
        t.threshold_amt,
        CASE 
            WHEN COALESCE(p.tag_sale_amt, 0) < t.threshold_amt THEN '정체재고'
            ELSE '정상재고'
        END as stock_status
    FROM stock_by_product s
    CROSS JOIN total_stock t
    LEFT JOIN sale_by_product p ON s.prdt_cd = p.prdt_cd
    WHERE ${activeSeasonsCondition}  -- 활성 시즌 제외
)

-- 6. 결과 집계
SELECT 
    :1 as brand_code,
    :2 as yyyymm,
    (SELECT total_stock_amt FROM total_stock) as total_stock_amt,
    (SELECT threshold_amt FROM total_stock) as threshold_amt,
    SUM(CASE WHEN stock_status = '정체재고' THEN end_stock_tag_amt ELSE 0 END) as stagnant_stock_amt,
    SUM(end_stock_tag_amt) as non_active_stock_amt,
    COUNT(CASE WHEN stock_status = '정체재고' THEN 1 END) as stagnant_product_count,
    COUNT(*) as non_active_product_count
FROM stagnant_products
`;

      console.log('📊 쿼리 실행 중...');
      const summaryResult = await executeQuery(query, connection, 0, [brandCode, yyyymm]);
      
      // 상세 품번 목록 조회 (상위 20개)
      const detailQuery = `
WITH item AS (
    SELECT 
        prdt_cd,
        sesn,
        CASE 
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Headwear' THEN '모자'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Shoes' THEN '신발'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Bag' THEN '가방'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Acc_etc' THEN '기타ACC'
        END AS item_std
    FROM sap_fnf.mst_prdt
    WHERE brd_cd = :1
),
total_stock AS (
    SELECT 
        SUM(a.end_stock_tag_amt) * 0.0001 as threshold_amt  -- 0.01%
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = :1
      AND a.yyyymm = :2
      AND b.item_std IS NOT NULL
),
stock_by_product AS (
    SELECT 
        a.prdt_cd,
        b.sesn,
        b.item_std,
        SUM(a.end_stock_tag_amt) as end_stock_tag_amt
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = :1
      AND a.yyyymm = :2
      AND b.item_std IS NOT NULL
    GROUP BY a.prdt_cd, b.sesn, b.item_std
),
sale_by_product AS (
    SELECT 
        a.prdt_cd,
        SUM(a.tag_sale_amt) as tag_sale_amt
    FROM sap_fnf.dm_pl_shop_prdt_m a
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.shop_cd = c.sap_shop_cd
    WHERE a.brd_cd = :1
      AND a.pst_yyyymm = :2
      AND c.chnl_cd NOT IN ('9', '99')
    GROUP BY a.prdt_cd
)
SELECT 
    s.prdt_cd,
    s.sesn,
    s.item_std,
    s.end_stock_tag_amt,
    COALESCE(p.tag_sale_amt, 0) as tag_sale_amt,
    t.threshold_amt
FROM stock_by_product s
CROSS JOIN total_stock t
LEFT JOIN sale_by_product p ON s.prdt_cd = p.prdt_cd
WHERE ${activeSeasonsCondition}
  AND COALESCE(p.tag_sale_amt, 0) < t.threshold_amt
ORDER BY s.end_stock_tag_amt DESC
LIMIT 20
`;

      const detailResult = await executeQuery(detailQuery, connection, 0, [brandCode, yyyymm]);

      // 아이템별 집계 조회
      const itemSummaryQuery = `
WITH item AS (
    SELECT 
        prdt_cd,
        sesn,
        CASE 
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Headwear' THEN '모자'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Shoes' THEN '신발'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Bag' THEN '가방'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Acc_etc' THEN '기타ACC'
        END AS item_std
    FROM sap_fnf.mst_prdt
    WHERE brd_cd = :1
),
total_stock AS (
    SELECT 
        SUM(a.end_stock_tag_amt) * 0.0001 as threshold_amt  -- 0.01%
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = :1
      AND a.yyyymm = :2
      AND b.item_std IS NOT NULL
),
stock_by_product AS (
    SELECT 
        a.prdt_cd,
        b.sesn,
        b.item_std,
        SUM(a.end_stock_tag_amt) as end_stock_tag_amt
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = :1
      AND a.yyyymm = :2
      AND b.item_std IS NOT NULL
    GROUP BY a.prdt_cd, b.sesn, b.item_std
),
sale_by_product AS (
    SELECT 
        a.prdt_cd,
        SUM(a.tag_sale_amt) as tag_sale_amt
    FROM sap_fnf.dm_pl_shop_prdt_m a
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.shop_cd = c.sap_shop_cd
    WHERE a.brd_cd = :1
      AND a.pst_yyyymm = :2
      AND c.chnl_cd NOT IN ('9', '99')
    GROUP BY a.prdt_cd
)
SELECT 
    s.item_std,
    COUNT(*) as product_count,
    SUM(s.end_stock_tag_amt) as stagnant_stock_amt
FROM stock_by_product s
CROSS JOIN total_stock t
LEFT JOIN sale_by_product p ON s.prdt_cd = p.prdt_cd
WHERE ${activeSeasonsCondition}
  AND COALESCE(p.tag_sale_amt, 0) < t.threshold_amt
GROUP BY s.item_std
ORDER BY stagnant_stock_amt DESC
`;

      const itemSummaryResult = await executeQuery(itemSummaryQuery, connection, 0, [brandCode, yyyymm]);

      const summary = summaryResult[0] || {};
      
      console.log(`✅ 정체재고 V2 조회 성공`);
      console.log(`   - 전체 재고 택금액: ${Number(summary.TOTAL_STOCK_AMT || 0).toLocaleString()}원`);
      console.log(`   - 기준금액 (0.1%): ${Number(summary.THRESHOLD_AMT || 0).toLocaleString()}원`);
      console.log(`   - 정체재고 금액: ${Number(summary.STAGNANT_STOCK_AMT || 0).toLocaleString()}원`);
      console.log(`   - 정체재고 품번 수: ${summary.STAGNANT_PRODUCT_COUNT || 0}개`);

      return NextResponse.json({
        success: true,
        brandCode,
        yyyymm,
        activeSeasons: activeSeasons,
        activeSeasonsDescription: `활성 시즌 제외: ${activeSeasons.join(', ')}`,
        summary: {
          totalStockAmt: Number(summary.TOTAL_STOCK_AMT || 0),
          totalStockAmtMillion: Math.round(Number(summary.TOTAL_STOCK_AMT || 0) / 1000000),
          thresholdAmt: Number(summary.THRESHOLD_AMT || 0),
          thresholdAmtMillion: Math.round(Number(summary.THRESHOLD_AMT || 0) / 1000000),
          stagnantStockAmt: Number(summary.STAGNANT_STOCK_AMT || 0),
          stagnantStockAmtMillion: Math.round(Number(summary.STAGNANT_STOCK_AMT || 0) / 1000000),
          nonActiveStockAmt: Number(summary.NON_ACTIVE_STOCK_AMT || 0),
          nonActiveStockAmtMillion: Math.round(Number(summary.NON_ACTIVE_STOCK_AMT || 0) / 1000000),
          stagnantProductCount: Number(summary.STAGNANT_PRODUCT_COUNT || 0),
          nonActiveProductCount: Number(summary.NON_ACTIVE_PRODUCT_COUNT || 0),
          stagnantRatio: Number(summary.TOTAL_STOCK_AMT) > 0 
            ? Math.round((Number(summary.STAGNANT_STOCK_AMT || 0) / Number(summary.TOTAL_STOCK_AMT)) * 1000) / 10
            : 0,
        },
        itemSummary: itemSummaryResult.map((row: any) => ({
          itemStd: row.ITEM_STD,
          productCount: Number(row.PRODUCT_COUNT || 0),
          stagnantStockAmt: Number(row.STAGNANT_STOCK_AMT || 0),
          stagnantStockAmtMillion: Math.round(Number(row.STAGNANT_STOCK_AMT || 0) / 1000000),
        })),
        topProducts: detailResult.map((row: any) => ({
          productCode: row.PRDT_CD,
          season: row.SESN,
          itemStd: row.ITEM_STD,
          endStockTagAmt: Number(row.END_STOCK_TAG_AMT || 0),
          endStockTagAmtMillion: Math.round(Number(row.END_STOCK_TAG_AMT || 0) / 1000000),
          tagSaleAmt: Number(row.TAG_SALE_AMT || 0),
          thresholdAmt: Number(row.THRESHOLD_AMT || 0),
        })),
      });

    } finally {
      await disconnectFromSnowflake();
    }

  } catch (error) {
    console.error('❌ 정체재고 V2 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: error instanceof Error && error.message.startsWith('유효하지 않은') ? 400 : 500 }
    );
  }
}
