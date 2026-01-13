/**
 * 시즌별 재고 분류 API
 * GET /api/dashboard/chart/season-stock?brandCode=M&yyyymm=202510
 * 
 * 시즌 분류 기준:
 * 당시즌:
 *   - 1-2월: 24N, 24F, 25N
 *   - 3-8월: 25N, 25S
 *   - 9-12월: 25N, 25F, 26N
 * 
 * 차기시즌:
 *   - 1-2월: 25S, 25F 이후
 *   - 3-8월: 25F, 26S 이후
 *   - 9-12월: 26S, 26F 이후
 * 
 * 정체재고: 비활성 시즌 중 판매액 < 기준금액
 * 과시즌: 전체 - 당시즌 - 차기시즌 - 정체재고
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';

/**
 * 시즌 기준 (패션회사 SS/FW 기준)
 * 
 * SS 시즌 (3-8월):
 *   - 당시즌: 25N, 25S
 *   - 차기시즌: 25F, 26N, 26S 이후
 *   - 활성 시즌: 25N, 25S, 25F, 26N, 26S, 27N, 27S
 * 
 * FW 시즌 (9-2월):
 *   - 당시즌: 25N, 25F
 *   - 차기시즌: 26N, 26S, 26F 이후
 *   - 활성 시즌: 25N, 25F, 26N, 26S, 26F, 27N, 27S
 */

/**
 * 당시즌 조건 생성
 */
function getCurrentSeasonCondition(yyyymm: string): string {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  const yy = year % 100;
  
  if (month >= 3 && month <= 8) {
    // SS 시즌 (3-8월): 당시즌 = 25N, 25S
    return `(sesn LIKE '%${yy}N%' OR sesn LIKE '%${yy}S%')`;
  } else {
    // FW 시즌 (9-2월): 당시즌 = 25N, 25F
    // 1-2월은 전년도 FW 시즌
    const baseYear = month >= 9 ? yy : yy - 1;
    return `(sesn LIKE '%${baseYear}N%' OR sesn LIKE '%${baseYear}F%')`;
  }
}

/**
 * 차기시즌 조건 생성
 */
function getNextSeasonCondition(yyyymm: string): string {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  const yy = year % 100;
  
  if (month >= 3 && month <= 8) {
    // SS 시즌 (3-8월): 차기시즌 = 25F, 26N, 26S 이후
    return `(sesn LIKE '%${yy}F%' OR sesn LIKE '%${yy+1}N%' OR sesn LIKE '%${yy+1}S%' OR sesn LIKE '%${yy+1}F%' OR sesn LIKE '%${yy+2}%')`;
  } else {
    // FW 시즌 (9-2월): 차기시즌 = 26N, 26S, 26F 이후
    const baseYear = month >= 9 ? yy : yy - 1;
    return `(sesn LIKE '%${baseYear+1}N%' OR sesn LIKE '%${baseYear+1}S%' OR sesn LIKE '%${baseYear+1}F%' OR sesn LIKE '%${baseYear+2}%')`;
  }
}

/**
 * 당시즌 목록 반환
 */
function getCurrentSeasons(yyyymm: string): string[] {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  const yy = year % 100;
  
  if (month >= 3 && month <= 8) {
    // SS 시즌 (3-8월): 25N, 25S
    return [`${yy}N`, `${yy}S`];
  } else {
    // FW 시즌 (9-2월): 25N, 25F
    const baseYear = month >= 9 ? yy : yy - 1;
    return [`${baseYear}N`, `${baseYear}F`];
  }
}

/**
 * 차기시즌 목록 반환
 */
function getNextSeasons(yyyymm: string): string[] {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  const yy = year % 100;
  
  if (month >= 3 && month <= 8) {
    // SS 시즌 (3-8월): 25F, 26N, 26S, 27N, 27S
    return [`${yy}F`, `${yy+1}N`, `${yy+1}S`, `${yy+2}N`, `${yy+2}S`];
  } else {
    // FW 시즌 (9-2월): 26N, 26S, 26F, 27N, 27S
    const baseYear = month >= 9 ? yy : yy - 1;
    return [`${baseYear+1}N`, `${baseYear+1}S`, `${baseYear+1}F`, `${baseYear+2}N`, `${baseYear+2}S`];
  }
}

/**
 * 활성 시즌 목록 반환 (정체재고 제외 대상 = 당시즌 + 차기시즌)
 */
function getActiveSeasons(yyyymm: string): string[] {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  const yy = year % 100;
  
  if (month >= 3 && month <= 8) {
    // SS 시즌 (3-8월): 25N, 25S, 25F, 26N, 26S, 27N, 27S
    return [`${yy}N`, `${yy}S`, `${yy}F`, `${yy+1}N`, `${yy+1}S`, `${yy+2}N`, `${yy+2}S`];
  } else {
    // FW 시즌 (9-2월): 25N, 25F, 26N, 26S, 26F, 27N, 27S
    const baseYear = month >= 9 ? yy : yy - 1;
    return [`${baseYear}N`, `${baseYear}F`, `${baseYear+1}N`, `${baseYear+1}S`, `${baseYear+1}F`, `${baseYear+2}N`, `${baseYear+2}S`];
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const brandCode = searchParams.get('brandCode') || 'M';
  const yyyymm = searchParams.get('yyyymm') || '202510';

  try {
    console.log(`📊 시즌별 재고 조회: ${brandCode}, ${yyyymm}`);
    
    const connection = await connectToSnowflake();

    try {
      const currentSeasons = getCurrentSeasons(yyyymm);
      const nextSeasons = getNextSeasons(yyyymm);
      const activeSeasons = getActiveSeasons(yyyymm);
      
      const currentSeasonCondition = getCurrentSeasonCondition(yyyymm);
      const nextSeasonCondition = getNextSeasonCondition(yyyymm);
      
      // 활성 시즌 제외 조건 (정체재고 계산용)
      const activeSeasonsCondition = activeSeasons
        .map(s => `sesn NOT LIKE '%${s}%'`)
        .join(' AND ');

      console.log(`📊 당시즌: ${currentSeasons.join(', ')}`);
      console.log(`📊 차기시즌: ${nextSeasons.join(', ')}`);
      console.log(`📊 활성 시즌 (정체재고 제외): ${activeSeasons.join(', ')}`);

      // 시즌별 재고 계산 쿼리
      const query = `
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
    WHERE brd_cd = '${brandCode}'
),

-- 전체 ACC 재고
total_stock AS (
    SELECT 
        SUM(a.end_stock_tag_amt) as total_stock_amt,
        SUM(a.end_stock_tag_amt) * 0.0001 as threshold_amt
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = '${brandCode}'
      AND a.yyyymm = '${yyyymm}'
      AND b.item_std IS NOT NULL
),

-- 품번별 재고
stock_by_product AS (
    SELECT 
        a.prdt_cd,
        b.sesn,
        b.item_std,
        SUM(a.end_stock_tag_amt) as end_stock_tag_amt
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = '${brandCode}'
      AND a.yyyymm = '${yyyymm}'
      AND b.item_std IS NOT NULL
    GROUP BY a.prdt_cd, b.sesn, b.item_std
),

-- 품번별 당월 판매택금액
sale_by_product AS (
    SELECT 
        a.prdt_cd,
        SUM(a.tag_sale_amt) as tag_sale_amt
    FROM sap_fnf.dm_pl_shop_prdt_m a
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.shop_cd = c.sap_shop_cd
    WHERE a.brd_cd = '${brandCode}'
      AND a.pst_yyyymm = '${yyyymm}'
      AND c.chnl_cd NOT IN ('9', '99')
    GROUP BY a.prdt_cd
),

-- 시즌별 분류 (정체재고 먼저 판단, 그 다음 당시즌/차기시즌/과시즌)
classified_stock AS (
    SELECT 
        s.prdt_cd,
        s.sesn,
        s.item_std,
        s.end_stock_tag_amt,
        COALESCE(p.tag_sale_amt, 0) as tag_sale_amt,
        t.threshold_amt,
        CASE 
            -- 1. 정체재고 (비활성 시즌 중 판매액 < 기준금액) - 최우선
            WHEN ${activeSeasonsCondition.replace(/sesn/g, 's.sesn')} 
                 AND COALESCE(p.tag_sale_amt, 0) < t.threshold_amt THEN '정체재고'
            -- 2. 당시즌 (정체재고가 아닌 것 중)
            WHEN ${currentSeasonCondition.replace(/sesn/g, 's.sesn')} THEN '당시즌'
            -- 3. 차기시즌 (정체재고, 당시즌이 아닌 것 중)
            WHEN ${nextSeasonCondition.replace(/sesn/g, 's.sesn')} THEN '차기시즌'
            -- 4. 과시즌 (나머지 = 비활성 시즌 중 판매액 >= 기준금액 + 활성시즌 중 당시즌/차기시즌 아닌 것)
            ELSE '과시즌'
        END as season_type
    FROM stock_by_product s
    CROSS JOIN total_stock t
    LEFT JOIN sale_by_product p ON s.prdt_cd = p.prdt_cd
)

-- 결과 집계
SELECT 
    season_type,
    COUNT(*) as product_count,
    SUM(end_stock_tag_amt) as stock_amt
FROM classified_stock
GROUP BY season_type
ORDER BY 
    CASE season_type 
        WHEN '당시즌' THEN 1 
        WHEN '차기시즌' THEN 2 
        WHEN '과시즌' THEN 3 
        WHEN '정체재고' THEN 4 
    END
`;

      console.log('📊 쿼리 실행 중...');
      const result = await executeQuery(query, connection);
      
      // 전체 재고 조회
      const totalQuery = `
SELECT SUM(a.end_stock_tag_amt) as total_amt
FROM sap_fnf.dw_ivtr_shop_prdt_m a
JOIN (
    SELECT prdt_cd,
        CASE 
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Headwear' THEN '모자'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Shoes' THEN '신발'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Bag' THEN '가방'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Acc_etc' THEN '기타ACC'
        END AS item_std
    FROM sap_fnf.mst_prdt
    WHERE brd_cd = '${brandCode}'
) b ON a.prdt_cd = b.prdt_cd
WHERE a.brd_cd = '${brandCode}'
  AND a.yyyymm = '${yyyymm}'
  AND b.item_std IS NOT NULL
`;
      const totalResult = await executeQuery(totalQuery, connection);
      const totalAmt = Number(totalResult[0]?.TOTAL_AMT || 0);

      console.log(`✅ 시즌별 재고 조회 성공`);
      
      // 결과 정리
      const seasonData: any = {};
      result.forEach((row: any) => {
        seasonData[row.SEASON_TYPE] = {
          productCount: Number(row.PRODUCT_COUNT || 0),
          stockAmt: Number(row.STOCK_AMT || 0),
          stockAmtMillion: Math.round(Number(row.STOCK_AMT || 0) / 1000000),
        };
      });

      return NextResponse.json({
        success: true,
        brandCode,
        yyyymm,
        currentSeasons,
        nextSeasons,
        activeSeasons,
        totalStockAmt: totalAmt,
        totalStockAmtMillion: Math.round(totalAmt / 1000000),
        thresholdAmt: totalAmt * 0.0001,
        seasonData,
        summary: {
          당시즌: seasonData['당시즌'] || { productCount: 0, stockAmt: 0, stockAmtMillion: 0 },
          차기시즌: seasonData['차기시즌'] || { productCount: 0, stockAmt: 0, stockAmtMillion: 0 },
          과시즌: seasonData['과시즌'] || { productCount: 0, stockAmt: 0, stockAmtMillion: 0 },
          정체재고: seasonData['정체재고'] || { productCount: 0, stockAmt: 0, stockAmtMillion: 0 },
        },
      });

    } finally {
      await disconnectFromSnowflake();
    }

  } catch (error) {
    console.error('❌ 시즌별 재고 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: 500 }
    );
  }
}

