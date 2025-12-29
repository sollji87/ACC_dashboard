import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';
import { BRANDS } from '@/lib/brands';
import { 
  WeeklyBrandData, 
  ItemData,
  formatWeeklyDashboardData 
} from '@/lib/weekly-dashboard-service';
import { parseWeekValue } from '@/lib/week-utils';

// 최적화된 쿼리 - 모든 브랜드를 한 번에 조회 (800일 생성 제거)
function buildOptimizedWeeklyQuery(weekKey: string): string {
  const { year, week } = parseWeekValue(weekKey);
  const prevYear = year - 1;
  
  // 직접 날짜 계산으로 800일 생성 제거
  return `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 해당 주차 종료일 (매출 테이블에서 직접 조회)
    week_dates AS (
      SELECT 
        MIN(CASE WHEN YEAR(end_dt) = ${year} AND WEEKOFYEAR(end_dt) = ${week} THEN end_dt END) AS cy_end_dt,
        MIN(CASE WHEN YEAR(end_dt) = ${prevYear} AND WEEKOFYEAR(end_dt) = ${week} THEN end_dt END) AS py_end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE (YEAR(end_dt) = ${year} OR YEAR(end_dt) = ${prevYear})
        AND WEEKOFYEAR(end_dt) = ${week}
    ),
    -- 당년 재고
    cy_stock AS (
      SELECT
        a.brd_cd,
        p.prdt_hrrc2_nm,
        SUM(a.stock_tag_amt) AS stock_tag_amt
      FROM week_dates wd
      JOIN prcs.dw_scs_dacum a
        ON wd.cy_end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd IN ('M', 'I', 'X', 'V', 'ST')
        AND wd.cy_end_dt IS NOT NULL
      GROUP BY a.brd_cd, p.prdt_hrrc2_nm
    ),
    -- 전년 재고
    py_stock AS (
      SELECT
        a.brd_cd,
        p.prdt_hrrc2_nm,
        SUM(a.stock_tag_amt) AS stock_tag_amt
      FROM week_dates wd
      JOIN prcs.dw_scs_dacum a
        ON wd.py_end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd IN ('M', 'I', 'X', 'V', 'ST')
        AND wd.py_end_dt IS NOT NULL
      GROUP BY a.brd_cd, p.prdt_hrrc2_nm
    ),
    -- 당년 해당 주차 매출 (표시용)
    cy_sale_week AS (
      SELECT
        s.brd_cd,
        p.prdt_hrrc2_nm,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS tag_sale_amt
      FROM week_dates wd
      JOIN fnf.prcs.db_scs_w s ON s.end_dt = wd.cy_end_dt
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd IN ('M', 'I', 'X', 'V', 'ST')
        AND wd.cy_end_dt IS NOT NULL
      GROUP BY s.brd_cd, p.prdt_hrrc2_nm
    ),
    -- 전년 해당 주차 매출 (표시용)
    py_sale_week AS (
      SELECT
        s.brd_cd,
        p.prdt_hrrc2_nm,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS tag_sale_amt
      FROM week_dates wd
      JOIN fnf.prcs.db_scs_w s ON s.end_dt = wd.py_end_dt
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd IN ('M', 'I', 'X', 'V', 'ST')
        AND wd.py_end_dt IS NOT NULL
      GROUP BY s.brd_cd, p.prdt_hrrc2_nm
    ),
    -- 당년 최근 4주 매출 (재고주수 계산용)
    cy_sale_4w AS (
      SELECT
        s.brd_cd,
        p.prdt_hrrc2_nm,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS tag_sale_4w_amt
      FROM week_dates wd
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wd.cy_end_dt
        AND s.end_dt > DATEADD(WEEK, -4, wd.cy_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd IN ('M', 'I', 'X', 'V', 'ST')
        AND wd.cy_end_dt IS NOT NULL
      GROUP BY s.brd_cd, p.prdt_hrrc2_nm
    ),
    -- 전년 최근 4주 매출 (재고주수 계산용)
    py_sale_4w AS (
      SELECT
        s.brd_cd,
        p.prdt_hrrc2_nm,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS tag_sale_4w_amt
      FROM week_dates wd
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wd.py_end_dt
        AND s.end_dt > DATEADD(WEEK, -4, wd.py_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd IN ('M', 'I', 'X', 'V', 'ST')
        AND wd.py_end_dt IS NOT NULL
      GROUP BY s.brd_cd, p.prdt_hrrc2_nm
    )
    SELECT
      COALESCE(cs.brd_cd, ps.brd_cd, csw.brd_cd, psw.brd_cd) AS brd_cd,
      COALESCE(cs.prdt_hrrc2_nm, ps.prdt_hrrc2_nm, csw.prdt_hrrc2_nm, psw.prdt_hrrc2_nm) AS prdt_hrrc2_nm,
      COALESCE(cs.stock_tag_amt, 0) AS cy_stock_tag_amt,
      COALESCE(ps.stock_tag_amt, 0) AS py_stock_tag_amt,
      COALESCE(csw.tag_sale_amt, 0) AS cy_tag_sale_amt,
      COALESCE(psw.tag_sale_amt, 0) AS py_tag_sale_amt,
      COALESCE(cs4w.tag_sale_4w_amt, 0) AS cy_tag_sale_4w_amt,
      COALESCE(ps4w.tag_sale_4w_amt, 0) AS py_tag_sale_4w_amt
    FROM cy_stock cs
    FULL OUTER JOIN py_stock ps ON cs.brd_cd = ps.brd_cd AND cs.prdt_hrrc2_nm = ps.prdt_hrrc2_nm
    FULL OUTER JOIN cy_sale_week csw ON COALESCE(cs.brd_cd, ps.brd_cd) = csw.brd_cd 
      AND COALESCE(cs.prdt_hrrc2_nm, ps.prdt_hrrc2_nm) = csw.prdt_hrrc2_nm
    FULL OUTER JOIN py_sale_week psw ON COALESCE(cs.brd_cd, ps.brd_cd, csw.brd_cd) = psw.brd_cd 
      AND COALESCE(cs.prdt_hrrc2_nm, ps.prdt_hrrc2_nm, csw.prdt_hrrc2_nm) = psw.prdt_hrrc2_nm
    LEFT JOIN cy_sale_4w cs4w ON COALESCE(cs.brd_cd, ps.brd_cd, csw.brd_cd, psw.brd_cd) = cs4w.brd_cd 
      AND COALESCE(cs.prdt_hrrc2_nm, ps.prdt_hrrc2_nm, csw.prdt_hrrc2_nm, psw.prdt_hrrc2_nm) = cs4w.prdt_hrrc2_nm
    LEFT JOIN py_sale_4w ps4w ON COALESCE(cs.brd_cd, ps.brd_cd, csw.brd_cd, psw.brd_cd) = ps4w.brd_cd 
      AND COALESCE(cs.prdt_hrrc2_nm, ps.prdt_hrrc2_nm, csw.prdt_hrrc2_nm, psw.prdt_hrrc2_nm) = ps4w.prdt_hrrc2_nm
    ORDER BY brd_cd, prdt_hrrc2_nm
  `;
}

// 빈 ItemData 생성
function createEmptyItemData(): ItemData {
  return {
    stockCurrent: 0,
    stockPrevious: 0,
    saleCurrent: 0,
    salePrevious: 0,
    weeks: 0,
    previousWeeks: 0,
  };
}

// 빈 WeeklyBrandData 생성
function createEmptyBrandData(brandId: string, brandCode: string, weekKey: string): WeeklyBrandData {
  return {
    brandId,
    brandCode,
    weekKey,
    asofDate: '',
    shoes: { current: 0, previous: 0 },
    hat: { current: 0, previous: 0 },
    bag: { current: 0, previous: 0 },
    other: { current: 0, previous: 0 },
    shoesDetail: createEmptyItemData(),
    hatDetail: createEmptyItemData(),
    bagDetail: createEmptyItemData(),
    otherDetail: createEmptyItemData(),
    totalCurrent: 0,
    totalPrevious: 0,
    totalSaleCurrent: 0,
    totalSalePrevious: 0,
    totalWeeks: 0,
    totalPreviousWeeks: 0,
    inventoryYOY: 0,
    salesYOY: 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const weekKey = searchParams.get('week') || '';
    const brandCode = searchParams.get('brandCode') || '';

    if (!weekKey) {
      return NextResponse.json({ error: 'week parameter is required' }, { status: 400 });
    }

    // 최적화된 쿼리 - 모든 브랜드를 한 번에 조회
    const query = buildOptimizedWeeklyQuery(weekKey);
    console.log('[Weekly API] Executing optimized query for week:', weekKey);
    
    const rows = await executeQuery(query);
    console.log('[Weekly API] Query returned', rows.length, 'rows');
    
    // 브랜드별로 데이터 분류
    const allBrandsData: WeeklyBrandData[] = BRANDS.map(brand => {
      const brandRows = rows.filter((r: any) => r.BRD_CD === brand.code);
      if (brandRows.length === 0) {
        return createEmptyBrandData(brand.id, brand.code, weekKey);
      }
      return formatWeeklyDashboardData(brandRows, brand.id, brand.code, weekKey);
    });

    // 특정 브랜드만 조회
    if (brandCode) {
      const data = allBrandsData.find(d => d.brandCode === brandCode);
      return NextResponse.json({ data: data || allBrandsData[0] });
    }

    return NextResponse.json({ data: allBrandsData });
  } catch (error) {
    console.error('[Weekly API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weekly data', details: String(error) },
      { status: 500 }
    );
  }
}
