/**
 * 주차별 품번별 재고주수 데이터 조회 API (컬러 포함)
 * GET /api/dashboard/inventory/detail-weekly?brandCode=M&itemStd=신발&week=2025-W51
 * 
 * 월별 대시보드와 동일한 시즌 분류 로직 적용:
 * - FW 시즌 (9월~2월): 당시즌=YYN,YYF / 차기시즌=(YY+1)N,(YY+1)S,(YY+1)F... / 과시즌=그 외
 * - SS 시즌 (3월~8월): 당시즌=YYN,YYS / 차기시즌=YYF,(YY+1)N,(YY+1)S... / 과시즌=그 외
 * - 정체재고: 과시즌 중 품번+컬러 기준 4주 판매가 택재고의 0.01% 미만
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { parseWeekValue } from '@/lib/week-utils';

// 아이템 필터 매핑 (prdt CTE에서 vtext2를 prdt_hrrc2_nm으로 alias함)
const ITEM_FILTER_MAP: Record<string, string> = {
  '신발': "AND p.prdt_hrrc2_nm = 'Shoes'",
  '모자': "AND p.prdt_hrrc2_nm = 'Headwear'",
  '가방': "AND p.prdt_hrrc2_nm = 'Bag'",
  '기타ACC': "AND (p.prdt_hrrc2_nm = 'Acc_etc' OR p.prdt_hrrc2_nm NOT IN ('Shoes', 'Headwear', 'Bag') OR p.prdt_hrrc2_nm IS NULL)",
  'all': '',
};

/**
 * 주차별 품번별 재고 쿼리 생성 (스타일&컬러 기준, 월별과 동일한 시즌 분류)
 */
function buildWeeklyProductDetailQuery(brandCode: string, itemStd: string, weekKey: string): string {
  const { year, week } = parseWeekValue(weekKey);
  const prevYear = year - 1;
  const itemFilter = ITEM_FILTER_MAP[itemStd] || '';
  const currentYearYY = year % 100; // 2025 -> 25
  
  return `
    WITH prdt AS (
      SELECT prdt_cd, prdt_nm, vtext2 AS prdt_hrrc2_nm, sesn, zzsellpr AS tag_price
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 주차 종료일 찾기
    week_dates AS (
      SELECT 
        MAX(CASE WHEN YEAR(end_dt) = ${year} AND WEEKOFYEAR(end_dt) = ${week} THEN end_dt END) AS cy_end_dt,
        MAX(CASE WHEN YEAR(end_dt) = ${prevYear} AND WEEKOFYEAR(end_dt) = ${week} THEN end_dt END) AS py_end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE (YEAR(end_dt) = ${year} OR YEAR(end_dt) = ${prevYear})
        AND WEEKOFYEAR(end_dt) = ${week}
    ),
    -- 당년 재고 (품번+컬러별)
    cy_stock AS (
      SELECT
        a.prdt_cd,
        a.color_cd,
        p.prdt_nm,
        p.sesn,
        p.tag_price,
        MONTH(wd.cy_end_dt) AS cy_month,
        SUM(a.stock_tag_amt) AS stock_tag_amt,
        SUM(a.stock_qty) AS stock_qty
      FROM week_dates wd
      JOIN prcs.dw_scs_dacum a
        ON wd.cy_end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
        AND wd.cy_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY a.prdt_cd, a.color_cd, p.prdt_nm, p.sesn, p.tag_price, wd.cy_end_dt
    ),
    -- 전년 재고 (품번+컬러별)
    py_stock AS (
      SELECT
        a.prdt_cd,
        a.color_cd,
        MONTH(wd.py_end_dt) AS py_month,
        SUM(a.stock_tag_amt) AS stock_tag_amt,
        SUM(a.stock_qty) AS stock_qty
      FROM week_dates wd
      JOIN prcs.dw_scs_dacum a
        ON wd.py_end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
        AND wd.py_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY a.prdt_cd, a.color_cd, wd.py_end_dt
    ),
    -- 당년 4주 매출 (품번+컬러별)
    cy_sale_4w AS (
      SELECT
        s.prdt_cd,
        s.color_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_tag_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_dates wd
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wd.cy_end_dt
        AND s.end_dt > DATEADD(WEEK, -4, wd.cy_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        AND wd.cy_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY s.prdt_cd, s.color_cd
    ),
    -- 전년 4주 매출 (품번+컬러별)
    py_sale_4w AS (
      SELECT
        s.prdt_cd,
        s.color_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_tag_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_dates wd
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wd.py_end_dt
        AND s.end_dt > DATEADD(WEEK, -4, wd.py_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        AND wd.py_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY s.prdt_cd, s.color_cd
    ),
    -- 전체 재고 합계 (정체재고 threshold 계산용)
    total_stock AS (
      SELECT SUM(stock_tag_amt) AS total_stock_amt
      FROM cy_stock
    ),
    -- 시즌 분류 + 정체재고 판정 (월별과 동일한 로직)
    classified AS (
      SELECT
        cs.prdt_cd,
        cs.color_cd,
        cs.prdt_nm,
        cs.sesn,
        cs.tag_price,
        cs.cy_month,
        cs.stock_tag_amt AS cy_stock_tag_amt,
        cs.stock_qty AS cy_stock_qty,
        COALESCE(ps.stock_tag_amt, 0) AS py_stock_tag_amt,
        COALESCE(ps.stock_qty, 0) AS py_stock_qty,
        COALESCE(csa.sale_tag_amt, 0) AS cy_sale_tag_amt,
        COALESCE(csa.sale_qty, 0) AS cy_sale_qty,
        COALESCE(psa.sale_tag_amt, 0) AS py_sale_tag_amt,
        COALESCE(psa.sale_qty, 0) AS py_sale_qty,
        ts.total_stock_amt,
        ts.total_stock_amt * 0.0001 AS threshold_amt,
        -- 시즌 분류 (월별과 동일한 로직)
        CASE 
          -- FW 시즌 (9월~2월)
          WHEN cs.cy_month >= 9 OR cs.cy_month <= 2 THEN
            CASE 
              -- 당시즌: YYN, YYF
              WHEN cs.sesn LIKE '${currentYearYY}N%' OR cs.sesn LIKE '${currentYearYY}F%' THEN 'current'
              -- 차기시즌: (YY+1)N, (YY+1)S, (YY+1)F, (YY+2)N, (YY+2)S
              WHEN cs.sesn LIKE '${currentYearYY + 1}N%' OR cs.sesn LIKE '${currentYearYY + 1}S%' 
                OR cs.sesn LIKE '${currentYearYY + 1}F%' OR cs.sesn LIKE '${currentYearYY + 2}N%' 
                OR cs.sesn LIKE '${currentYearYY + 2}S%' THEN 'next'
              ELSE 'old'
            END
          -- SS 시즌 (3월~8월)
          ELSE
            CASE 
              -- 당시즌: YYN, YYS
              WHEN cs.sesn LIKE '${currentYearYY}N%' OR cs.sesn LIKE '${currentYearYY}S%' THEN 'current'
              -- 차기시즌: YYF, (YY+1)N, (YY+1)S, (YY+1)F, (YY+2)N, (YY+2)S
              WHEN cs.sesn LIKE '${currentYearYY}F%' OR cs.sesn LIKE '${currentYearYY + 1}N%' 
                OR cs.sesn LIKE '${currentYearYY + 1}S%' OR cs.sesn LIKE '${currentYearYY + 1}F%' 
                OR cs.sesn LIKE '${currentYearYY + 2}N%' OR cs.sesn LIKE '${currentYearYY + 2}S%' THEN 'next'
              ELSE 'old'
            END
        END AS season_class
      FROM cy_stock cs
      LEFT JOIN py_stock ps ON cs.prdt_cd = ps.prdt_cd AND cs.color_cd = ps.color_cd
      LEFT JOIN cy_sale_4w csa ON cs.prdt_cd = csa.prdt_cd AND cs.color_cd = csa.color_cd
      LEFT JOIN py_sale_4w psa ON cs.prdt_cd = psa.prdt_cd AND cs.color_cd = psa.color_cd
      CROSS JOIN total_stock ts
    ),
    -- 최종 데이터 (정체재고 판정 포함)
    final_data AS (
      SELECT
        prdt_cd,
        color_cd,
        prdt_nm,
        sesn,
        tag_price,
        cy_stock_tag_amt,
        cy_stock_qty,
        py_stock_tag_amt,
        py_stock_qty,
        cy_sale_tag_amt,
        cy_sale_qty,
        py_sale_tag_amt,
        py_sale_qty,
        threshold_amt,
        season_class,
        -- 정체재고: 과시즌(old)이면서 4주 판매 < 0.01%인 경우만
        CASE 
          WHEN season_class = 'old' AND cy_sale_tag_amt < threshold_amt THEN 'stagnant'
          ELSE season_class
        END AS final_season_class,
        -- 재고주수 계산 (4주 매출 기준)
        CASE 
          WHEN cy_sale_tag_amt > 0 THEN ROUND(cy_stock_tag_amt / (cy_sale_tag_amt / 4), 1)
          ELSE 0
        END AS cy_weeks,
        CASE 
          WHEN py_sale_tag_amt > 0 THEN ROUND(py_stock_tag_amt / (py_sale_tag_amt / 4), 1)
          ELSE 0
        END AS py_weeks
      FROM classified
    )
    SELECT
      prdt_cd AS "PRDT_CD",
      color_cd AS "COLOR_CD",
      prdt_nm AS "PRODUCT_NAME",
      sesn AS "SESN",
      tag_price AS "TAG_PRICE",
      final_season_class AS "SEASON_CATEGORY",
      ROUND(cy_stock_tag_amt / 1000000, 1) AS "CY_STOCK_MILLION",
      ROUND(py_stock_tag_amt / 1000000, 1) AS "PY_STOCK_MILLION",
      cy_stock_qty AS "CY_STOCK_QTY",
      py_stock_qty AS "PY_STOCK_QTY",
      ROUND(cy_sale_tag_amt / 1000000, 1) AS "CY_SALE_MILLION",
      ROUND(py_sale_tag_amt / 1000000, 1) AS "PY_SALE_MILLION",
      cy_sale_qty AS "CY_SALE_QTY",
      py_sale_qty AS "PY_SALE_QTY",
      cy_weeks AS "CY_WEEKS",
      py_weeks AS "PY_WEEKS",
      ROUND(threshold_amt / 1000000, 3) AS "THRESHOLD_MILLION"
    FROM final_data
    WHERE cy_stock_tag_amt > 0 OR cy_sale_tag_amt > 0
    ORDER BY final_season_class, cy_stock_tag_amt DESC
  `;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = searchParams.get('brandCode') || 'M';
    const itemStd = searchParams.get('itemStd') || '신발';
    const week = searchParams.get('week') || '';

    // 파라미터 검증
    if (!/^[A-Za-z]{1,2}$/.test(brandCode)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 브랜드 코드입니다.' },
        { status: 400 }
      );
    }
    
    const validItemStd = ['신발', '모자', '가방', '기타ACC', 'all'];
    if (!validItemStd.includes(itemStd)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 아이템 분류입니다.' },
        { status: 400 }
      );
    }
    
    // 주차 형식 검증 (YYYY-NN 또는 YYYY-WNN)
    if (!/^\d{4}-W?\d{2}$/.test(week)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 주차 형식입니다. (YYYY-NN 또는 YYYY-WNN 형식 필요)' },
        { status: 400 }
      );
    }
    
    // YYYY-WNN 형식을 YYYY-NN으로 정규화
    const normalizedWeek = week.replace('-W', '-');

    console.log(`📊 브랜드 ${brandCode} ${itemStd} 주차별 품번별 재고주수 조회 시작 (${normalizedWeek})`);

    let connection: any = null;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        connection = await connectToSnowflake();

        const query = buildWeeklyProductDetailQuery(brandCode, itemStd, normalizedWeek);
        const rows = await executeQuery(query, connection);
        
        // 데이터 포맷팅
        const formattedData = formatWeeklyProductDetailData(rows);

        console.log(`✅ 브랜드 ${brandCode} ${itemStd} 주차별 품번별 재고주수 조회 성공: ${formattedData.products.length}개 품번×컬러`);

        return NextResponse.json({
          success: true,
          data: formattedData,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('terminated') && retryCount < maxRetries) {
          retryCount++;
          console.log(`연결 오류 발생, 재시도 ${retryCount}/${maxRetries}...`);
          await disconnectFromSnowflake().catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        throw error;
      } finally {
        if (connection) {
          try {
            await disconnectFromSnowflake();
          } catch (error) {
            console.warn('연결 종료 중 오류 (무시):', error);
          }
        }
      }
    }

    throw new Error('최대 재시도 횟수 초과');
  } catch (error) {
    console.error('❌ 주차별 품번별 재고주수 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: 500 }
    );
  }
}

/**
 * 주차별 품번별 데이터 포맷팅
 */
function formatWeeklyProductDetailData(rows: any[]): {
  products: any[];
  thresholdAmt: number;
} {
  const thresholdAmt = rows.length > 0 ? (rows[0].THRESHOLD_MILLION || 0) * 1000000 : 0;
  
  const products = rows.map((row: any) => ({
    productCode: row.PRDT_CD || '',
    colorCode: row.COLOR_CD || '',
    productName: row.PRODUCT_NAME || row.PRDT_CD || '',
    season: row.SESN || '',
    seasonCategory: row.SEASON_CATEGORY || 'old',
    tagPrice: row.TAG_PRICE || null,
    // 재고 (백만원)
    endingInventory: row.CY_STOCK_MILLION || 0,
    prevEndingInventory: row.PY_STOCK_MILLION || 0,
    // 재고 수량
    endingInventoryQty: row.CY_STOCK_QTY || 0,
    prevEndingInventoryQty: row.PY_STOCK_QTY || 0,
    // 4주 매출 (백만원)
    salesAmount: row.CY_SALE_MILLION || 0,
    prevSalesAmount: row.PY_SALE_MILLION || 0,
    // 매출 수량
    salesQty: row.CY_SALE_QTY || 0,
    prevSalesQty: row.PY_SALE_QTY || 0,
    // 재고주수
    weeks: row.CY_WEEKS || 0,
    prevWeeks: row.PY_WEEKS || 0,
    // YOY 계산
    inventoryYOY: row.PY_STOCK_MILLION > 0 
      ? Math.round((row.CY_STOCK_MILLION / row.PY_STOCK_MILLION) * 100) 
      : 0,
    salesYOY: row.PY_SALE_MILLION > 0 
      ? Math.round((row.CY_SALE_MILLION / row.PY_SALE_MILLION) * 100) 
      : 0,
  }));

  return {
    products,
    thresholdAmt,
  };
}

