/**
 * 주차별 품번별 재고주수 데이터 조회 API (컬러 포함)
 * GET /api/dashboard/inventory/detail-weekly?brandCode=M&itemStd=신발&week=2025-W51
 * 
 * 월별 대시보드와 동일한 시즌 분류 로직 적용:
 * - FW 시즌 (9월~2월): 당시즌=YYN,YYF / 차기시즌=(YY+1)N,(YY+1)S,(YY+1)F... / 과시즌=그 외
 * - SS 시즌 (3월~8월): 당시즌=YYN,YYS / 차기시즌=YYF,(YY+1)N,(YY+1)S... / 과시즌=그 외
 * - 정체재고: 과시즌 중 품번+컬러 기준 4주 판매가 택재고의 0.0025% 미만 (주차별 기준: 월 0.01%의 1/4)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import type { SnowflakeStatement } from '@/lib/snowflake';
import { ensureBrandCode, ensureItemStd, ensureWeekKey } from '@/lib/request-validation';
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
function buildWeeklyProductDetailQuery(
  brandCode: string,
  itemStd: string,
  weekKey: string
): SnowflakeStatement {
  const { year, week } = parseWeekValue(weekKey);
  const prevYear = year - 1;
  const itemFilter = ITEM_FILTER_MAP[itemStd] || '';
  const currentYearYY = year % 100; // 2025 -> 25
  const previousSeasonYY = currentYearYY - 1;
  const nextSeasonYY = currentYearYY + 1;
  const nextNextSeasonYY = currentYearYY + 2;
  
  const sqlText = `
    WITH prdt AS (
      SELECT prdt_cd, prdt_nm, vtext2 AS prdt_hrrc2_nm, sesn, zzsellpr AS tag_price
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 주차 종료일 찾기
    week_dates AS (
      SELECT 
        MAX(CASE WHEN YEAR(end_dt) = :1 AND WEEKOFYEAR(end_dt) = :2 THEN end_dt END) AS cy_end_dt,
        MAX(CASE WHEN YEAR(end_dt) = :3 AND WEEKOFYEAR(end_dt) = :2 THEN end_dt END) AS py_end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE (YEAR(end_dt) = :1 OR YEAR(end_dt) = :3)
        AND WEEKOFYEAR(end_dt) = :2
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
      WHERE a.brd_cd = :4
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
      WHERE a.brd_cd = :4
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
      WHERE s.brd_cd = :4
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
      WHERE s.brd_cd = :4
        AND wd.py_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY s.prdt_cd, s.color_cd
    ),
    -- 당년 1주 매출 (해당 주차만, 품번+컬러별)
    cy_sale_1w AS (
      SELECT
        s.prdt_cd,
        s.color_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_tag_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_dates wd
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt = wd.cy_end_dt  -- 해당 주차만 (1주)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = :4
        AND wd.cy_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY s.prdt_cd, s.color_cd
    ),
    -- 전년 1주 매출 (해당 주차만, 품번+컬러별)
    py_sale_1w AS (
      SELECT
        s.prdt_cd,
        s.color_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_tag_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_dates wd
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt = wd.py_end_dt  -- 전년 해당 주차만 (1주)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = :4
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
        COALESCE(csa.sale_tag_amt, 0) AS cy_sale_4w_tag_amt,
        COALESCE(csa.sale_qty, 0) AS cy_sale_4w_qty,
        COALESCE(psa.sale_tag_amt, 0) AS py_sale_4w_tag_amt,
        COALESCE(psa.sale_qty, 0) AS py_sale_4w_qty,
        COALESCE(cs1w.sale_tag_amt, 0) AS cy_sale_1w_tag_amt,
        COALESCE(cs1w.sale_qty, 0) AS cy_sale_1w_qty,
        COALESCE(ps1w.sale_tag_amt, 0) AS py_sale_1w_tag_amt,
        COALESCE(ps1w.sale_qty, 0) AS py_sale_1w_qty,
        ts.total_stock_amt,
        ts.total_stock_amt * 0.000025 AS threshold_amt,  -- 주차별 기준 0.0025%
        -- 시즌 분류 (FW: 9월~차년도 2월, SS: 3월~8월)
        -- FW 시즌 중 1-2월은 전년도 FW 시즌으로 처리
        CASE 
          -- FW 시즌 후반부 (1-2월): 전년도 시즌 기준
          WHEN cs.cy_month <= 2 THEN
            CASE 
              -- 당시즌: (YY-1)N, (YY-1)F (예: 2026년 1월 → 25N, 25F)
              WHEN cs.sesn LIKE LPAD(:5::VARCHAR, 2, '0') || 'N%' OR cs.sesn LIKE LPAD(:5::VARCHAR, 2, '0') || 'F%' THEN 'current'
              -- 차기시즌: YYN, YYS, YYF~ (예: 2026년 1월 → 26N, 26S, 26F~)
              WHEN cs.sesn LIKE LPAD(:6::VARCHAR, 2, '0') || 'N%' OR cs.sesn LIKE LPAD(:6::VARCHAR, 2, '0') || 'S%' 
                OR cs.sesn LIKE LPAD(:6::VARCHAR, 2, '0') || 'F%' OR cs.sesn LIKE LPAD(:7::VARCHAR, 2, '0') || 'N%' 
                OR cs.sesn LIKE LPAD(:7::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
          -- FW 시즌 전반부 (9-12월): 당년도 시즌 기준
          WHEN cs.cy_month >= 9 THEN
            CASE 
              -- 당시즌: YYN, YYF
              WHEN cs.sesn LIKE LPAD(:6::VARCHAR, 2, '0') || 'N%' OR cs.sesn LIKE LPAD(:6::VARCHAR, 2, '0') || 'F%' THEN 'current'
              -- 차기시즌: (YY+1)N, (YY+1)S, (YY+1)F, (YY+2)N, (YY+2)S
              WHEN cs.sesn LIKE LPAD(:7::VARCHAR, 2, '0') || 'N%' OR cs.sesn LIKE LPAD(:7::VARCHAR, 2, '0') || 'S%' 
                OR cs.sesn LIKE LPAD(:7::VARCHAR, 2, '0') || 'F%' OR cs.sesn LIKE LPAD(:8::VARCHAR, 2, '0') || 'N%' 
                OR cs.sesn LIKE LPAD(:8::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
          -- SS 시즌 (3월~8월)
          ELSE
            CASE 
              -- 당시즌: YYN, YYS
              WHEN cs.sesn LIKE LPAD(:6::VARCHAR, 2, '0') || 'N%' OR cs.sesn LIKE LPAD(:6::VARCHAR, 2, '0') || 'S%' THEN 'current'
              -- 차기시즌: YYF, (YY+1)N, (YY+1)S, (YY+1)F, (YY+2)N, (YY+2)S
              WHEN cs.sesn LIKE LPAD(:6::VARCHAR, 2, '0') || 'F%' OR cs.sesn LIKE LPAD(:7::VARCHAR, 2, '0') || 'N%' 
                OR cs.sesn LIKE LPAD(:7::VARCHAR, 2, '0') || 'S%' OR cs.sesn LIKE LPAD(:7::VARCHAR, 2, '0') || 'F%' 
                OR cs.sesn LIKE LPAD(:8::VARCHAR, 2, '0') || 'N%' OR cs.sesn LIKE LPAD(:8::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
        END AS season_class
      FROM cy_stock cs
      LEFT JOIN py_stock ps ON cs.prdt_cd = ps.prdt_cd AND cs.color_cd = ps.color_cd
      LEFT JOIN cy_sale_4w csa ON cs.prdt_cd = csa.prdt_cd AND cs.color_cd = csa.color_cd
      LEFT JOIN py_sale_4w psa ON cs.prdt_cd = psa.prdt_cd AND cs.color_cd = psa.color_cd
      LEFT JOIN cy_sale_1w cs1w ON cs.prdt_cd = cs1w.prdt_cd AND cs.color_cd = cs1w.color_cd
      LEFT JOIN py_sale_1w ps1w ON cs.prdt_cd = ps1w.prdt_cd AND cs.color_cd = ps1w.color_cd
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
        cy_sale_4w_tag_amt,
        cy_sale_4w_qty,
        py_sale_4w_tag_amt,
        py_sale_4w_qty,
        cy_sale_1w_tag_amt,
        cy_sale_1w_qty,
        py_sale_1w_tag_amt,
        py_sale_1w_qty,
        threshold_amt,
        season_class,
        -- 정체재고: 과시즌(old)이면서 4주 판매 < 0.0025%인 경우만 (주차별 기준)
        CASE 
          WHEN season_class = 'old' AND cy_sale_4w_tag_amt < threshold_amt THEN 'stagnant'
          ELSE season_class
        END AS final_season_class,
        -- 재고주수 계산 (4주 매출 기준)
        CASE 
          WHEN cy_sale_4w_tag_amt > 0 THEN ROUND(cy_stock_tag_amt / (cy_sale_4w_tag_amt / 4), 1)
          ELSE 0
        END AS cy_weeks,
        CASE 
          WHEN py_sale_4w_tag_amt > 0 THEN ROUND(py_stock_tag_amt / (py_sale_4w_tag_amt / 4), 1)
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
      -- 재고 (정수 반올림, weekly-chart와 동일)
      ROUND(cy_stock_tag_amt / 1000000, 0) AS "CY_STOCK_MILLION",
      ROUND(py_stock_tag_amt / 1000000, 0) AS "PY_STOCK_MILLION",
      cy_stock_qty AS "CY_STOCK_QTY",
      py_stock_qty AS "PY_STOCK_QTY",
      -- 4주 매출 (재고주수 계산용)
      ROUND(cy_sale_4w_tag_amt / 1000000, 0) AS "CY_SALE_4W_MILLION",
      ROUND(py_sale_4w_tag_amt / 1000000, 0) AS "PY_SALE_4W_MILLION",
      cy_sale_4w_qty AS "CY_SALE_4W_QTY",
      py_sale_4w_qty AS "PY_SALE_4W_QTY",
      -- 1주 매출 (해당 주차만)
      ROUND(cy_sale_1w_tag_amt / 1000000, 0) AS "CY_SALE_1W_MILLION",
      ROUND(py_sale_1w_tag_amt / 1000000, 0) AS "PY_SALE_1W_MILLION",
      cy_sale_1w_qty AS "CY_SALE_1W_QTY",
      py_sale_1w_qty AS "PY_SALE_1W_QTY",
      cy_weeks AS "CY_WEEKS",
      py_weeks AS "PY_WEEKS",
      ROUND(threshold_amt / 1000000, 3) AS "THRESHOLD_MILLION"
    FROM final_data
    WHERE cy_stock_tag_amt > 0 OR cy_sale_4w_tag_amt > 0
    ORDER BY final_season_class, cy_stock_tag_amt DESC
  `;

  return {
    sqlText,
    binds: [year, week, prevYear, brandCode, previousSeasonYY, currentYearYY, nextSeasonYY, nextNextSeasonYY],
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = ensureBrandCode(searchParams.get('brandCode') || 'M');
    const itemStd = ensureItemStd(searchParams.get('itemStd') || '신발');
    const normalizedWeek = ensureWeekKey(searchParams.get('week') || '').replace('-W', '-');

    console.log(`📊 브랜드 ${brandCode} ${itemStd} 주차별 품번별 재고주수 조회 시작 (${normalizedWeek})`);

    let connection: any = null;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        connection = await connectToSnowflake();

        const statement = buildWeeklyProductDetailQuery(brandCode, itemStd, normalizedWeek);
        const rows = await executeQuery(statement.sqlText, connection, 0, statement.binds);
        
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
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: errorMessage.startsWith('유효하지 않은') ? 400 : 500 }
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
    // 4주 매출 (백만원) - 재고주수 계산용
    fourWeekSalesAmount: row.CY_SALE_4W_MILLION || 0,
    prevFourWeekSalesAmount: row.PY_SALE_4W_MILLION || 0,
    // 4주 매출 수량
    fourWeekSalesQty: row.CY_SALE_4W_QTY || 0,
    prevFourWeekSalesQty: row.PY_SALE_4W_QTY || 0,
    // 1주 매출 (해당 주차만, 백만원)
    oneWeekSalesAmount: row.CY_SALE_1W_MILLION || 0,
    prevOneWeekSalesAmount: row.PY_SALE_1W_MILLION || 0,
    // 1주 매출 수량
    oneWeekSalesQty: row.CY_SALE_1W_QTY || 0,
    prevOneWeekSalesQty: row.PY_SALE_1W_QTY || 0,
    // 재고주수
    weeks: row.CY_WEEKS || 0,
    prevWeeks: row.PY_WEEKS || 0,
    // YOY 계산
    inventoryYOY: row.PY_STOCK_MILLION > 0 
      ? Math.round((row.CY_STOCK_MILLION / row.PY_STOCK_MILLION) * 100) 
      : 0,
    salesYOY: row.PY_SALE_4W_MILLION > 0 
      ? Math.round((row.CY_SALE_4W_MILLION / row.PY_SALE_4W_MILLION) * 100) 
      : 0,
  }));

  return {
    products,
    thresholdAmt,
  };
}
