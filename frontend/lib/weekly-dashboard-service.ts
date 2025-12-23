/**
 * 주차별(실시간) 대시보드 서비스
 * 월결산 데이터와 분리하여 별도 관리
 */

import { parseWeekValue, getWeekStart, getWeekEnd } from './week-utils';

// 주차별 재고 데이터 인터페이스
export interface WeeklyInventoryData {
  weekKey: string;           // 주차 키 (예: 2025-W51)
  asofDate: string;          // 기준일 (일요일)
  brandCode: string;         // 브랜드 코드
  itemCategory: string;      // 중분류 (신발, 모자, 가방, 기타)
  stockTagAmt: number;       // 택재고금액 (원)
  stockQty: number;          // 재고수량
  // 전년 동기
  pyStockTagAmt: number;     // 전년 택재고금액 (원)
  pyStockQty: number;        // 전년 재고수량
}

// 중분류별 데이터 (재고 + 매출)
export interface ItemData {
  stockCurrent: number;   // 당년 재고 (백만원)
  stockPrevious: number;  // 전년 재고 (백만원)
  saleCurrent: number;    // 당년 매출 (백만원)
  salePrevious: number;   // 전년 매출 (백만원)
  weeks: number;          // 재고주수 (당년)
  previousWeeks: number;  // 재고주수 (전년)
}

// 주차별 브랜드 대시보드 데이터
export interface WeeklyBrandData {
  brandId: string;
  brandCode: string;
  weekKey: string;
  asofDate: string;
  // 중분류별 재고 (백만원 단위) - 기존 호환용
  shoes: { current: number; previous: number };
  hat: { current: number; previous: number };
  bag: { current: number; previous: number };
  other: { current: number; previous: number };
  // 중분류별 상세 (재고 + 매출 + 재고주수)
  shoesDetail: ItemData;
  hatDetail: ItemData;
  bagDetail: ItemData;
  otherDetail: ItemData;
  // 합계
  totalCurrent: number;      // 총 재고 (당년)
  totalPrevious: number;     // 총 재고 (전년)
  totalSaleCurrent: number;  // 총 매출 (당년)
  totalSalePrevious: number; // 총 매출 (전년)
  totalWeeks: number;        // 총 재고주수 (당년)
  totalPreviousWeeks: number;// 총 재고주수 (전년)
  inventoryYOY: number;      // 재고 전년대비 (%)
  salesYOY: number;          // 매출 전년대비 (%)
}

/**
 * 중분류명을 카테고리 키로 변환
 * 기존 월결산과 동일한 매핑 사용:
 * - Shoes → 신발
 * - Headwear → 모자
 * - Bag → 가방
 * - Acc_etc → 기타ACC
 */
export function mapItemCategory(prdt_hrrc2_nm: string): 'shoes' | 'hat' | 'bag' | 'other' {
  const name = (prdt_hrrc2_nm || '').toUpperCase();
  
  // Shoes 매핑
  if (name.includes('SHOES') || name.includes('신발') || name.includes('슈즈')) {
    return 'shoes';
  }
  // Headwear 매핑 (모자)
  if (name.includes('HEADWEAR') || name.includes('모자') || name.includes('HAT') || name.includes('캡')) {
    return 'hat';
  }
  // Bag 매핑
  if (name.includes('BAG') || name.includes('가방') || name.includes('백')) {
    return 'bag';
  }
  // 그 외는 기타ACC
  return 'other';
}

/**
 * 주차별 재고 데이터 조회 쿼리 생성
 * @param brandCode 브랜드 코드 (M, I, X, V, ST)
 * @param weekKey 주차 키 (예: 2025-51)
 */
export function buildWeeklyInventoryQuery(brandCode: string, weekKey: string): string {
  // weekKey 형식: "2025-51" -> 연도와 주차 추출
  const { year, week } = parseWeekValue(weekKey);
  const prevYear = year - 1;
  
  // 주차 키 형식 변환 (2025-51 -> 2025-W51)
  const weekKeyFormatted = `${year}-W${String(week).padStart(2, '0')}`;
  const prevWeekKeyFormatted = `${prevYear}-W${String(week).padStart(2, '0')}`;
  
  return `
    WITH sunday AS (
      SELECT
        d::date AS asof_dt,
        TO_CHAR(d::date, 'YYYY') AS yyyy,
        LPAD(WEEKOFYEAR(d::date)::STRING, 2, '0') AS ww,
        TO_CHAR(d::date, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(d::date)::STRING, 2, '0') AS week_key
      FROM (
        SELECT DATEADD(DAY, seq4(), DATE '${prevYear}-01-01') AS d
        FROM TABLE(GENERATOR(ROWCOUNT => 800))
      )
      WHERE d::date BETWEEN DATE '${prevYear}-01-01' AND DATE '${year}-12-31'
        AND DAYOFWEEKISO(d::date) = 7
    ),
    prdt AS (
      SELECT *
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'  -- 악세사리만 필터
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 당년 데이터 (악세사리만)
    cy_data AS (
      SELECT
        s.asof_dt,
        s.week_key,
        a.brd_cd,
        p.vtext2 AS prdt_hrrc2_nm,
        SUM(a.stock_tag_amt) AS stock_tag_amt,
        SUM(a.stock_qty) AS stock_qty
      FROM sunday s
      JOIN prcs.dw_scs_dacum a
        ON s.asof_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p  -- INNER JOIN으로 변경하여 악세사리만 조회
        ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
        AND s.week_key = '${weekKeyFormatted}'
      GROUP BY
        s.asof_dt,
        s.week_key,
        a.brd_cd,
        p.vtext2
      HAVING SUM(a.stock_tag_amt) <> 0
    ),
    -- 전년 동기 데이터 (악세사리만)
    py_data AS (
      SELECT
        s.asof_dt,
        s.week_key,
        a.brd_cd,
        p.vtext2 AS prdt_hrrc2_nm,
        SUM(a.stock_tag_amt) AS stock_tag_amt,
        SUM(a.stock_qty) AS stock_qty
      FROM sunday s
      JOIN prcs.dw_scs_dacum a
        ON s.asof_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p  -- INNER JOIN으로 변경하여 악세사리만 조회
        ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
        AND s.week_key = '${prevWeekKeyFormatted}'
      GROUP BY
        s.asof_dt,
        s.week_key,
        a.brd_cd,
        p.vtext2
      HAVING SUM(a.stock_tag_amt) <> 0
    )
    SELECT
      COALESCE(cy.week_key, '${weekKeyFormatted}') AS week_key,
      COALESCE(cy.asof_dt, NULL) AS asof_dt,
      '${brandCode}' AS brd_cd,
      COALESCE(cy.prdt_hrrc2_nm, py.prdt_hrrc2_nm) AS prdt_hrrc2_nm,
      COALESCE(cy.stock_tag_amt, 0) AS cy_stock_tag_amt,
      COALESCE(cy.stock_qty, 0) AS cy_stock_qty,
      COALESCE(py.stock_tag_amt, 0) AS py_stock_tag_amt,
      COALESCE(py.stock_qty, 0) AS py_stock_qty
    FROM cy_data cy
    FULL OUTER JOIN py_data py
      ON cy.prdt_hrrc2_nm = py.prdt_hrrc2_nm
    ORDER BY prdt_hrrc2_nm
  `;
}

/**
 * 주차별 매출 데이터 조회 쿼리 생성
 * @param brandCode 브랜드 코드 (M, I, X, V, ST)
 * @param weekKey 주차 키 (예: 2025-51)
 */
export function buildWeeklySalesQuery(brandCode: string, weekKey: string): string {
  // weekKey 형식: "2025-51" -> 연도와 주차 추출
  const { year, week } = parseWeekValue(weekKey);
  
  return `
    WITH prdt AS (
      SELECT prdt_cd
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'  -- 악세사리만 필터
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 해당 주차의 종료일(일요일) 찾기
    week_info AS (
      SELECT DISTINCT end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE YEAR(end_dt) = ${year}
        AND WEEKOFYEAR(end_dt) = ${week}
    ),
    -- 당년 매출 (악세사리만)
    curr AS (
      SELECT
        s.brd_cd,
        w.end_dt,
        p.prdt_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS tag_sale_amt
      FROM week_info w
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt = w.end_dt
      INNER JOIN prdt p  -- 악세사리만
        ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
      GROUP BY s.brd_cd, w.end_dt, p.prdt_cd
      HAVING SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) <> 0
    ),
    -- 전년 동주차 매출 (악세사리만)
    prev AS (
      SELECT
        s.brd_cd,
        w.end_dt AS cy_end_dt,  -- 당해 주차 종료일로 맞춤
        p.prdt_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS tag_sale_amt
      FROM week_info w
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt = (DATE_TRUNC('week', DATEADD(YEAR, -1, w.end_dt)) + 6)
      INNER JOIN prdt p  -- 악세사리만
        ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
      GROUP BY s.brd_cd, w.end_dt, p.prdt_cd
      HAVING SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) <> 0
    )
    SELECT
      COALESCE(c.brd_cd, p.brd_cd, '${brandCode}') AS brd_cd,
      COALESCE(c.end_dt, p.cy_end_dt) AS end_dt,
      COALESCE(c.prdt_cd, p.prdt_cd) AS prdt_cd,
      COALESCE(c.tag_sale_amt, 0) AS cy_tag_sale_amt,
      COALESCE(p.tag_sale_amt, 0) AS py_tag_sale_amt
    FROM curr c
    FULL OUTER JOIN prev p
      ON c.prdt_cd = p.prdt_cd
    ORDER BY prdt_cd
  `;
}

/**
 * 주차별 매출+재고 통합 데이터 조회 쿼리 생성
 * 재고주수 계산을 위해 재고와 매출을 함께 조회
 */
export function buildWeeklyDashboardQuery(brandCode: string, weekKey: string): string {
  const { year, week } = parseWeekValue(weekKey);
  
  // 초간단 테스트 쿼리 - 재고만 조회
  return `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    )
    SELECT
      p.prdt_hrrc2_nm,
      SUM(a.stock_tag_amt) AS cy_stock_tag_amt,
      0 AS py_stock_tag_amt,
      0 AS cy_tag_sale_amt,
      0 AS py_tag_sale_amt
    FROM prcs.dw_scs_dacum a
    INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
    WHERE a.brd_cd = '${brandCode}'
      AND TO_DATE(a.start_dt) <= CURRENT_DATE
      AND TO_DATE(a.end_dt) >= CURRENT_DATE
    GROUP BY p.prdt_hrrc2_nm
    ORDER BY p.prdt_hrrc2_nm
  `;
}

/**
 * 재고주수 계산 (최근 4주 매출 기준)
 * 재고주수 = 재고금액 / 주평균매출
 * 주평균매출 = 4주 매출 합계 / 4
 * 따라서: 재고주수 = 재고금액 / (4주매출합계 / 4) = 재고금액 * 4 / 4주매출합계
 */
function calculateWeeks(stockAmt: number, sale4WeeksAmt: number): number {
  if (sale4WeeksAmt <= 0) return 0;
  // 4주 매출 합계를 4로 나눠 주평균 매출 산출 후 재고주수 계산
  const weeklyAvgSale = sale4WeeksAmt / 4;
  return Math.round((stockAmt / weeklyAvgSale) * 10) / 10;
}

/**
 * 빈 ItemData 생성
 */
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

/**
 * 쿼리 결과를 브랜드 대시보드 데이터로 변환 (재고만)
 */
export function formatWeeklyInventoryData(
  rows: any[],
  brandId: string,
  brandCode: string,
  weekKey: string
): WeeklyBrandData {
  // 초기값
  const result: WeeklyBrandData = {
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

  if (!rows || rows.length === 0) {
    return result;
  }

  // 기준일 설정
  const firstRow = rows.find(r => r.ASOF_DT);
  if (firstRow) {
    result.asofDate = firstRow.ASOF_DT;
  }

  // 중분류별 집계
  for (const row of rows) {
    const category = mapItemCategory(row.PRDT_HRRC2_NM || '');
    const cyAmt = Number(row.CY_STOCK_TAG_AMT) || 0;
    const pyAmt = Number(row.PY_STOCK_TAG_AMT) || 0;

    // 원 -> 백만원 변환
    const cyAmtMillion = Math.round(cyAmt / 1000000);
    const pyAmtMillion = Math.round(pyAmt / 1000000);
    
    result[category].current += cyAmtMillion;
    result[category].previous += pyAmtMillion;
    
    // Detail 업데이트
    const detailKey = `${category}Detail` as keyof WeeklyBrandData;
    (result[detailKey] as ItemData).stockCurrent += cyAmtMillion;
    (result[detailKey] as ItemData).stockPrevious += pyAmtMillion;
  }

  // 합계 계산
  result.totalCurrent = result.shoes.current + result.hat.current + result.bag.current + result.other.current;
  result.totalPrevious = result.shoes.previous + result.hat.previous + result.bag.previous + result.other.previous;

  // YOY 계산
  if (result.totalPrevious > 0) {
    result.inventoryYOY = Math.round((result.totalCurrent / result.totalPrevious) * 100);
  }

  return result;
}

/**
 * 통합 쿼리 결과를 브랜드 대시보드 데이터로 변환 (재고 + 매출 + 재고주수)
 */
export function formatWeeklyDashboardData(
  rows: any[],
  brandId: string,
  brandCode: string,
  weekKey: string
): WeeklyBrandData {
  // 초기값
  const result: WeeklyBrandData = {
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

  if (!rows || rows.length === 0) {
    return result;
  }

  // 중분류별 4주 매출 합계 (재고주수 계산용) 임시 저장
  const sale4wByCategory: Record<string, { cy: number; py: number }> = {
    shoes: { cy: 0, py: 0 },
    hat: { cy: 0, py: 0 },
    bag: { cy: 0, py: 0 },
    other: { cy: 0, py: 0 },
  };

  // 중분류별 집계
  for (const row of rows) {
    const category = mapItemCategory(row.PRDT_HRRC2_NM || '');
    const cyStock = Number(row.CY_STOCK_TAG_AMT) || 0;
    const pyStock = Number(row.PY_STOCK_TAG_AMT) || 0;
    const cySale = Number(row.CY_TAG_SALE_AMT) || 0;  // 해당 주차 매출
    const pySale = Number(row.PY_TAG_SALE_AMT) || 0;  // 해당 주차 매출
    const cySale4w = Number(row.CY_TAG_SALE_4W_AMT) || 0;  // 4주 매출 (재고주수용)
    const pySale4w = Number(row.PY_TAG_SALE_4W_AMT) || 0;  // 4주 매출 (재고주수용)

    // 원 -> 백만원 변환
    const cyStockMillion = Math.round(cyStock / 1000000);
    const pyStockMillion = Math.round(pyStock / 1000000);
    const cySaleMillion = Math.round(cySale / 1000000);
    const pySaleMillion = Math.round(pySale / 1000000);
    
    // 4주 매출도 백만원 변환
    sale4wByCategory[category].cy += Math.round(cySale4w / 1000000);
    sale4wByCategory[category].py += Math.round(pySale4w / 1000000);
    
    // 기존 호환용
    result[category].current += cyStockMillion;
    result[category].previous += pyStockMillion;
    
    // Detail 업데이트 (표시용 매출 = 해당 주차 매출)
    const detailKey = `${category}Detail` as keyof WeeklyBrandData;
    const detail = result[detailKey] as ItemData;
    detail.stockCurrent += cyStockMillion;
    detail.stockPrevious += pyStockMillion;
    detail.saleCurrent += cySaleMillion;
    detail.salePrevious += pySaleMillion;
  }

  // 각 중분류별 재고주수 계산 (4주 매출 기준)
  for (const category of ['shoes', 'hat', 'bag', 'other'] as const) {
    const detailKey = `${category}Detail` as keyof WeeklyBrandData;
    const detail = result[detailKey] as ItemData;
    // 재고주수 = 재고 / (4주 매출 / 4)
    detail.weeks = calculateWeeks(detail.stockCurrent, sale4wByCategory[category].cy);
    detail.previousWeeks = calculateWeeks(detail.stockPrevious, sale4wByCategory[category].py);
  }

  // 합계 계산
  result.totalCurrent = result.shoesDetail.stockCurrent + result.hatDetail.stockCurrent + 
                        result.bagDetail.stockCurrent + result.otherDetail.stockCurrent;
  result.totalPrevious = result.shoesDetail.stockPrevious + result.hatDetail.stockPrevious + 
                         result.bagDetail.stockPrevious + result.otherDetail.stockPrevious;
  result.totalSaleCurrent = result.shoesDetail.saleCurrent + result.hatDetail.saleCurrent + 
                            result.bagDetail.saleCurrent + result.otherDetail.saleCurrent;
  result.totalSalePrevious = result.shoesDetail.salePrevious + result.hatDetail.salePrevious + 
                             result.bagDetail.salePrevious + result.otherDetail.salePrevious;

  // 총 4주 매출 합계
  const totalSale4wCy = sale4wByCategory.shoes.cy + sale4wByCategory.hat.cy + 
                        sale4wByCategory.bag.cy + sale4wByCategory.other.cy;
  const totalSale4wPy = sale4wByCategory.shoes.py + sale4wByCategory.hat.py + 
                        sale4wByCategory.bag.py + sale4wByCategory.other.py;

  // 총 재고주수 계산 (4주 매출 기준)
  result.totalWeeks = calculateWeeks(result.totalCurrent, totalSale4wCy);
  result.totalPreviousWeeks = calculateWeeks(result.totalPrevious, totalSale4wPy);

  // YOY 계산
  if (result.totalPrevious > 0) {
    result.inventoryYOY = Math.round((result.totalCurrent / result.totalPrevious) * 100);
  }
  if (result.totalSalePrevious > 0) {
    result.salesYOY = Math.round((result.totalSaleCurrent / result.totalSalePrevious) * 100);
  }

  return result;
}

/**
 * 주차별 재고주수 추이 차트 데이터 인터페이스
 */
export interface WeeklyChartData {
  weekKey: string;       // 주차 키 (예: 2025-W51)
  weekLabel: string;     // 주차 라벨 (예: 2025년 51주차)
  dateRange: string;     // 날짜 범위 (예: 12/15 ~ 12/21)
  asofDate: string;      // 기준일
  stockAmount: number;   // 당년 재고금액 (백만원)
  saleAmount: number;    // 당년 매출금액 (백만원) - 선택한 N주 합계
  weeks: number;         // 당년 재고주수
  totalStock: number;    // 총 재고금액 (백만원)
  // 전년 데이터
  prevStockAmount: number;  // 전년 재고금액 (백만원)
  prevSaleAmount: number;   // 전년 매출금액 (백만원)
  prevWeeks: number;        // 전년 재고주수
  prevTotalStock: number;   // 전년 총 재고금액 (백만원)
  // 시즌별 당년 재고금액 (백만원)
  currentSeasonStock: number;  // 당시즌
  nextSeasonStock: number;     // 차기시즌
  oldSeasonStock: number;      // 과시즌
  stagnantStock: number;       // 정체재고
  // 시즌별 전년 재고금액 (백만원)
  previousCurrentSeasonStock: number;
  previousNextSeasonStock: number;
  previousOldSeasonStock: number;
  previousStagnantStock: number;
  // 시즌별 비율 (%)
  currentSeasonRatio: number;
  nextSeasonRatio: number;
  oldSeasonRatio: number;
  stagnantRatio: number;
  previousCurrentSeasonRatio: number;
  previousNextSeasonRatio: number;
  previousOldSeasonRatio: number;
  previousStagnantRatio: number;
  // YOY
  stockYOY: number;
  // 중분류별 당년 재고주수
  shoesWeeks: number;
  hatWeeks: number;
  bagWeeks: number;
  otherWeeks: number;
  // 중분류별 전년 재고주수
  prevShoesWeeks: number;
  prevHatWeeks: number;
  prevBagWeeks: number;
  prevOtherWeeks: number;
  // 중분류별 재고금액
  shoesStock: number;
  hatStock: number;
  bagStock: number;
  otherStock: number;
}

/**
 * 주차별 재고주수 추이 조회 쿼리 생성
 * @param brandCode 브랜드 코드
 * @param weeksForSale 매출 기준 주수 (4, 8, 12)
 * @param selectedItem 선택한 아이템 (all, shoes, hat, bag, other)
 */
export function buildWeeklyChartQuery(
  brandCode: string, 
  weeksForSale: number = 4,
  selectedItem: 'all' | 'shoes' | 'hat' | 'bag' | 'other' = 'all'
): string {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  
  // 아이템 필터 조건 생성
  let itemFilter = '';
  if (selectedItem !== 'all') {
    const itemMap: Record<string, string[]> = {
      'shoes': ['SHOES', '신발', '슈즈'],
      'hat': ['HEADWEAR', '모자', 'HAT', '캡'],
      'bag': ['BAG', '가방', '백'],
      'other': [] // other는 위 3가지를 제외한 나머지
    };
    
    if (selectedItem === 'other') {
      itemFilter = `AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%SHOES%' 
                    AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%신발%'
                    AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%슈즈%'
                    AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%HEADWEAR%'
                    AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%모자%'
                    AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%HAT%'
                    AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%캡%'
                    AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%BAG%'
                    AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%가방%'
                    AND UPPER(p.prdt_hrrc2_nm) NOT LIKE '%백%'`;
    } else {
      const keywords = itemMap[selectedItem];
      const conditions = keywords.map(k => `UPPER(p.prdt_hrrc2_nm) LIKE '%${k}%'`).join(' OR ');
      itemFilter = `AND (${conditions})`;
    }
  }
  
  return `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 최근 12주 일요일 목록 (당년)
    recent_sundays AS (
      SELECT
        d::date AS asof_dt,
        TO_CHAR(d::date, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(d::date)::STRING, 2, '0') AS week_key,
        WEEKOFYEAR(d::date) AS week_num,
        YEAR(d::date) AS year_num,
        ROW_NUMBER() OVER (ORDER BY d::date DESC) AS week_rank
      FROM (
        SELECT DATEADD(DAY, seq4(), DATE '${prevYear}-01-01') AS d
        FROM TABLE(GENERATOR(ROWCOUNT => 800))
      )
      WHERE d::date BETWEEN DATE '${prevYear}-01-01' AND CURRENT_DATE()
        AND DAYOFWEEKISO(d::date) = 7
      QUALIFY week_rank <= 12
    ),
    -- 전년 동주차 일요일 목록
    prev_year_sundays AS (
      SELECT
        rs.asof_dt AS cy_asof_dt,
        rs.week_key AS cy_week_key,
        rs.week_num,
        rs.year_num AS cy_year,
        DATEADD(YEAR, -1, rs.asof_dt)::date AS py_asof_dt,
        (rs.year_num - 1) AS py_year
      FROM recent_sundays rs
    ),
    -- 당년 재고 (중분류별)
    cy_stock AS (
      SELECT
        s.week_key,
        s.asof_dt,
        s.week_num,
        p.prdt_hrrc2_nm,
        SUM(a.stock_tag_amt) AS stock_tag_amt
      FROM recent_sundays s
      JOIN prcs.dw_scs_dacum a
        ON s.asof_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
      GROUP BY s.week_key, s.asof_dt, s.week_num, p.prdt_hrrc2_nm
    ),
    -- 전년 재고 (중분류별)
    py_stock AS (
      SELECT
        pys.cy_week_key AS week_key,
        pys.cy_asof_dt AS asof_dt,
        pys.week_num,
        p.prdt_hrrc2_nm,
        SUM(a.stock_tag_amt) AS stock_tag_amt
      FROM prev_year_sundays pys
      JOIN prcs.dw_scs_dacum a
        ON pys.py_asof_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
      GROUP BY pys.cy_week_key, pys.cy_asof_dt, pys.week_num, p.prdt_hrrc2_nm
    ),
    -- 매출 종료일 목록 (최근 N주 매출 계산용 - 당년)
    sale_weeks_cy AS (
      SELECT DISTINCT end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE end_dt BETWEEN DATEADD(WEEK, -${weeksForSale + 12}, CURRENT_DATE()) AND CURRENT_DATE()
    ),
    -- 매출 종료일 목록 (최근 N주 매출 계산용 - 전년)
    sale_weeks_py AS (
      SELECT DISTINCT end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE end_dt BETWEEN DATEADD(WEEK, -${weeksForSale + 12}, DATEADD(YEAR, -1, CURRENT_DATE())) 
        AND DATEADD(YEAR, -1, CURRENT_DATE())
    ),
    -- 당년 N주 매출 합계 (중분류별)
    cy_sale AS (
      SELECT
        rs.week_key,
        rs.asof_dt,
        p.prdt_hrrc2_nm,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt
      FROM recent_sundays rs
      CROSS JOIN sale_weeks_cy sw
      JOIN fnf.prcs.db_scs_w s ON s.end_dt = sw.end_dt
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        AND sw.end_dt <= rs.asof_dt
        AND sw.end_dt > DATEADD(WEEK, -${weeksForSale}, rs.asof_dt)
      GROUP BY rs.week_key, rs.asof_dt, p.prdt_hrrc2_nm
    ),
    -- 전년 N주 매출 합계 (중분류별)
    py_sale AS (
      SELECT
        pys.cy_week_key AS week_key,
        pys.cy_asof_dt AS asof_dt,
        p.prdt_hrrc2_nm,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt
      FROM prev_year_sundays pys
      CROSS JOIN sale_weeks_py sw
      JOIN fnf.prcs.db_scs_w s ON s.end_dt = sw.end_dt
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        AND sw.end_dt <= pys.py_asof_dt
        AND sw.end_dt > DATEADD(WEEK, -${weeksForSale}, pys.py_asof_dt)
      GROUP BY pys.cy_week_key, pys.cy_asof_dt, p.prdt_hrrc2_nm
    )
    SELECT
      COALESCE(cy.week_key, py.week_key) AS week_key,
      COALESCE(cy.asof_dt, py.asof_dt) AS asof_dt,
      COALESCE(cy.week_num, py.week_num) AS week_num,
      COALESCE(cy.prdt_hrrc2_nm, py.prdt_hrrc2_nm) AS prdt_hrrc2_nm,
      COALESCE(cy.stock_tag_amt, 0) AS cy_stock_tag_amt,
      COALESCE(cys.sale_amt, 0) AS cy_sale_amt,
      COALESCE(py.stock_tag_amt, 0) AS py_stock_tag_amt,
      COALESCE(pys.sale_amt, 0) AS py_sale_amt
    FROM cy_stock cy
    FULL OUTER JOIN py_stock py 
      ON cy.week_key = py.week_key AND cy.prdt_hrrc2_nm = py.prdt_hrrc2_nm
    LEFT JOIN cy_sale cys 
      ON COALESCE(cy.week_key, py.week_key) = cys.week_key 
      AND COALESCE(cy.prdt_hrrc2_nm, py.prdt_hrrc2_nm) = cys.prdt_hrrc2_nm
    LEFT JOIN py_sale pys 
      ON COALESCE(cy.week_key, py.week_key) = pys.week_key 
      AND COALESCE(cy.prdt_hrrc2_nm, py.prdt_hrrc2_nm) = pys.prdt_hrrc2_nm
    ORDER BY COALESCE(cy.asof_dt, py.asof_dt) ASC, COALESCE(cy.prdt_hrrc2_nm, py.prdt_hrrc2_nm)
  `;
}

/**
 * 주차별 시즌별 재고금액 조회 쿼리 생성 (정체재고는 품번+컬러 조합으로 판별)
 * 
 * 시즌 분류:
 * - 당시즌: FW(9-2월)에는 yyN/yyF, SS(3-8월)에는 yyN/yyS
 * - 차기시즌: FW에는 (yy+1)N/S/F, SS에는 yyF/(yy+1)N/S
 * - 정체재고: 당시즌/차기시즌 아닌 것 중 품번+컬러별 매출액 < 기준금액(전체재고 * 0.01%)
 * - 과시즌: 나머지
 */
export function buildWeeklySeasonChartQuery(
  brandCode: string
): string {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const yy = currentYear % 100;
  
  return `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm, sesn
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 최근 12주 일요일 목록 (당년)
    recent_sundays AS (
      SELECT
        d::date AS asof_dt,
        TO_CHAR(d::date, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(d::date)::STRING, 2, '0') AS week_key,
        WEEKOFYEAR(d::date) AS week_num,
        YEAR(d::date) AS year_num,
        MONTH(d::date) AS month_num,
        ROW_NUMBER() OVER (ORDER BY d::date DESC) AS week_rank
      FROM (
        SELECT DATEADD(DAY, seq4(), DATE '${prevYear}-01-01') AS d
        FROM TABLE(GENERATOR(ROWCOUNT => 800))
      )
      WHERE d::date BETWEEN DATE '${prevYear}-01-01' AND CURRENT_DATE()
        AND DAYOFWEEKISO(d::date) = 7
      QUALIFY week_rank <= 12
    ),
    -- 전년 동주차 일요일 목록
    prev_year_sundays AS (
      SELECT
        rs.asof_dt AS cy_asof_dt,
        rs.week_key AS cy_week_key,
        rs.week_num,
        rs.month_num,
        rs.year_num AS cy_year,
        DATEADD(YEAR, -1, rs.asof_dt)::date AS py_asof_dt,
        (rs.year_num - 1) AS py_year
      FROM recent_sundays rs
    ),
    -- 각 주차별 전체 재고 (정체재고 기준금액 산출용)
    weekly_total_stock AS (
      SELECT
        s.week_key,
        s.asof_dt,
        SUM(a.stock_tag_amt) AS total_stock_amt
      FROM recent_sundays s
      JOIN prcs.dw_scs_dacum a
        ON s.asof_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
      GROUP BY s.week_key, s.asof_dt
    ),
    -- 기준금액 (0.01%)
    weekly_threshold AS (
      SELECT
        week_key,
        asof_dt,
        total_stock_amt * 0.0001 AS threshold_amt
      FROM weekly_total_stock
    ),
    -- 최근 4주 품번+컬러별 판매금액 (정체재고 판별용)
    recent_sale_by_color AS (
      SELECT
        rs.week_key,
        rs.asof_dt,
        s.prdt_cd,
        s.color_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt
      FROM recent_sundays rs
      JOIN fnf.prcs.db_scs_w s 
        ON s.end_dt <= rs.asof_dt AND s.end_dt > DATEADD(WEEK, -4, rs.asof_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
      GROUP BY rs.week_key, rs.asof_dt, s.prdt_cd, s.color_cd
    ),
    -- 당년 품번+컬러별 재고
    cy_stock_color AS (
      SELECT
        s.week_key,
        s.asof_dt,
        s.week_num,
        s.month_num,
        a.prdt_cd,
        a.color_cd,
        p.sesn,
        p.prdt_hrrc2_nm,
        SUM(a.stock_tag_amt) AS stock_tag_amt
      FROM recent_sundays s
      JOIN prcs.dw_scs_dacum a
        ON s.asof_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
      GROUP BY s.week_key, s.asof_dt, s.week_num, s.month_num, a.prdt_cd, a.color_cd, p.sesn, p.prdt_hrrc2_nm
    ),
    -- 당년 시즌 분류
    cy_classified AS (
      SELECT
        c.week_key,
        c.asof_dt,
        c.week_num,
        c.prdt_cd,
        c.color_cd,
        c.sesn,
        c.stock_tag_amt,
        COALESCE(sl.sale_amt, 0) AS sale_amt,
        t.threshold_amt,
        CASE
          -- 1. 당시즌 (FW: 9-2월에는 yyN/yyF, SS: 3-8월에는 yyN/yyS)
          WHEN (
            CASE WHEN c.month_num >= 9 OR c.month_num <= 2 THEN
              CASE WHEN c.month_num <= 2 THEN
                c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'N%'
                OR c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'F%'
              ELSE
                c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'N%'
                OR c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'F%'
              END
            ELSE
              c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'N%'
              OR c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'S%'
            END
          ) THEN '당시즌'
          -- 2. 차기시즌
          WHEN (
            CASE WHEN c.month_num >= 9 OR c.month_num <= 2 THEN
              CASE WHEN c.month_num <= 2 THEN
                c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'N%'
                OR c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'S%'
                OR c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'F%'
                OR c.sesn LIKE '%' || CAST(${yy} + 1 AS VARCHAR) || '%'
              ELSE
                c.sesn LIKE '%' || CAST(${yy} + 1 AS VARCHAR) || 'N%'
                OR c.sesn LIKE '%' || CAST(${yy} + 1 AS VARCHAR) || 'S%'
                OR c.sesn LIKE '%' || CAST(${yy} + 1 AS VARCHAR) || 'F%'
                OR c.sesn LIKE '%' || CAST(${yy} + 2 AS VARCHAR) || '%'
              END
            ELSE
              c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'F%'
              OR c.sesn LIKE '%' || CAST(${yy} + 1 AS VARCHAR) || '%'
              OR c.sesn LIKE '%' || CAST(${yy} + 2 AS VARCHAR) || '%'
            END
          ) THEN '차기시즌'
          -- 3. 정체재고 (품번+컬러별 판매 < 기준금액)
          WHEN COALESCE(sl.sale_amt, 0) < t.threshold_amt THEN '정체재고'
          -- 4. 과시즌
          ELSE '과시즌'
        END AS season_type
      FROM cy_stock_color c
      LEFT JOIN recent_sale_by_color sl
        ON c.week_key = sl.week_key AND c.prdt_cd = sl.prdt_cd AND c.color_cd = sl.color_cd
      JOIN weekly_threshold t ON c.week_key = t.week_key
    ),
    -- 당년 시즌별 집계
    cy_season_summary AS (
      SELECT
        week_key,
        asof_dt,
        week_num,
        SUM(CASE WHEN season_type = '당시즌' THEN stock_tag_amt ELSE 0 END) AS current_season_stock,
        SUM(CASE WHEN season_type = '차기시즌' THEN stock_tag_amt ELSE 0 END) AS next_season_stock,
        SUM(CASE WHEN season_type = '과시즌' THEN stock_tag_amt ELSE 0 END) AS old_season_stock,
        SUM(CASE WHEN season_type = '정체재고' THEN stock_tag_amt ELSE 0 END) AS stagnant_stock,
        SUM(stock_tag_amt) AS total_stock
      FROM cy_classified
      GROUP BY week_key, asof_dt, week_num
    ),
    -- 전년 품번+컬러별 재고
    py_stock_color AS (
      SELECT
        pys.cy_week_key AS week_key,
        pys.cy_asof_dt AS asof_dt,
        pys.week_num,
        pys.month_num,
        a.prdt_cd,
        a.color_cd,
        p.sesn,
        p.prdt_hrrc2_nm,
        SUM(a.stock_tag_amt) AS stock_tag_amt
      FROM prev_year_sundays pys
      JOIN prcs.dw_scs_dacum a
        ON pys.py_asof_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
      GROUP BY pys.cy_week_key, pys.cy_asof_dt, pys.week_num, pys.month_num, a.prdt_cd, a.color_cd, p.sesn, p.prdt_hrrc2_nm
    ),
    -- 전년 최근 4주 품번+컬러별 판매금액
    py_recent_sale_by_color AS (
      SELECT
        pys.cy_week_key AS week_key,
        pys.cy_asof_dt AS asof_dt,
        s.prdt_cd,
        s.color_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt
      FROM prev_year_sundays pys
      JOIN fnf.prcs.db_scs_w s 
        ON s.end_dt <= pys.py_asof_dt AND s.end_dt > DATEADD(WEEK, -4, pys.py_asof_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
      GROUP BY pys.cy_week_key, pys.cy_asof_dt, s.prdt_cd, s.color_cd
    ),
    -- 전년 전체 재고 (정체재고 기준금액 산출용)
    py_total_stock AS (
      SELECT
        pys.cy_week_key AS week_key,
        pys.cy_asof_dt AS asof_dt,
        SUM(a.stock_tag_amt) AS total_stock_amt
      FROM prev_year_sundays pys
      JOIN prcs.dw_scs_dacum a
        ON pys.py_asof_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
      GROUP BY pys.cy_week_key, pys.cy_asof_dt
    ),
    py_threshold AS (
      SELECT
        week_key,
        asof_dt,
        total_stock_amt * 0.0001 AS threshold_amt
      FROM py_total_stock
    ),
    -- 전년 시즌 분류
    py_classified AS (
      SELECT
        c.week_key,
        c.asof_dt,
        c.week_num,
        c.prdt_cd,
        c.color_cd,
        c.sesn,
        c.stock_tag_amt,
        COALESCE(sl.sale_amt, 0) AS sale_amt,
        t.threshold_amt,
        CASE
          -- 전년 시즌 분류 (전년 기준)
          WHEN (
            CASE WHEN c.month_num >= 9 OR c.month_num <= 2 THEN
              CASE WHEN c.month_num <= 2 THEN
                c.sesn LIKE '%' || CAST(${yy} - 2 AS VARCHAR) || 'N%'
                OR c.sesn LIKE '%' || CAST(${yy} - 2 AS VARCHAR) || 'F%'
              ELSE
                c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'N%'
                OR c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'F%'
              END
            ELSE
              c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'N%'
              OR c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'S%'
            END
          ) THEN '당시즌'
          WHEN (
            CASE WHEN c.month_num >= 9 OR c.month_num <= 2 THEN
              CASE WHEN c.month_num <= 2 THEN
                c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'N%'
                OR c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'S%'
                OR c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'F%'
                OR c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || '%'
              ELSE
                c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'N%'
                OR c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'S%'
                OR c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || 'F%'
                OR c.sesn LIKE '%' || CAST(${yy} + 1 AS VARCHAR) || '%'
              END
            ELSE
              c.sesn LIKE '%' || CAST(${yy} - 1 AS VARCHAR) || 'F%'
              OR c.sesn LIKE '%' || CAST(${yy} AS VARCHAR) || '%'
              OR c.sesn LIKE '%' || CAST(${yy} + 1 AS VARCHAR) || '%'
            END
          ) THEN '차기시즌'
          WHEN COALESCE(sl.sale_amt, 0) < COALESCE(t.threshold_amt, 0) THEN '정체재고'
          ELSE '과시즌'
        END AS season_type
      FROM py_stock_color c
      LEFT JOIN py_recent_sale_by_color sl
        ON c.week_key = sl.week_key AND c.prdt_cd = sl.prdt_cd AND c.color_cd = sl.color_cd
      LEFT JOIN py_threshold t ON c.week_key = t.week_key
    ),
    -- 전년 시즌별 집계
    py_season_summary AS (
      SELECT
        week_key,
        asof_dt,
        week_num,
        SUM(CASE WHEN season_type = '당시즌' THEN stock_tag_amt ELSE 0 END) AS current_season_stock,
        SUM(CASE WHEN season_type = '차기시즌' THEN stock_tag_amt ELSE 0 END) AS next_season_stock,
        SUM(CASE WHEN season_type = '과시즌' THEN stock_tag_amt ELSE 0 END) AS old_season_stock,
        SUM(CASE WHEN season_type = '정체재고' THEN stock_tag_amt ELSE 0 END) AS stagnant_stock,
        SUM(stock_tag_amt) AS total_stock
      FROM py_classified
      GROUP BY week_key, asof_dt, week_num
    )
    SELECT
      COALESCE(cy.week_key, py.week_key) AS week_key,
      COALESCE(cy.asof_dt, py.asof_dt) AS asof_dt,
      COALESCE(cy.week_num, py.week_num) AS week_num,
      -- 당년 시즌별 재고
      COALESCE(cy.current_season_stock, 0) AS cy_current_season_stock,
      COALESCE(cy.next_season_stock, 0) AS cy_next_season_stock,
      COALESCE(cy.old_season_stock, 0) AS cy_old_season_stock,
      COALESCE(cy.stagnant_stock, 0) AS cy_stagnant_stock,
      COALESCE(cy.total_stock, 0) AS cy_total_stock,
      -- 전년 시즌별 재고
      COALESCE(py.current_season_stock, 0) AS py_current_season_stock,
      COALESCE(py.next_season_stock, 0) AS py_next_season_stock,
      COALESCE(py.old_season_stock, 0) AS py_old_season_stock,
      COALESCE(py.stagnant_stock, 0) AS py_stagnant_stock,
      COALESCE(py.total_stock, 0) AS py_total_stock
    FROM cy_season_summary cy
    FULL OUTER JOIN py_season_summary py
      ON cy.week_key = py.week_key
    ORDER BY COALESCE(cy.asof_dt, py.asof_dt) ASC
  `;
}

/**
 * 주차별 재고주수 추이 데이터 포맷팅 (시즌별 데이터 포함)
 */
export function formatWeeklyChartData(
  rows: any[], 
  weeksForSale: number = 4,
  seasonRows: any[] = []  // 시즌별 데이터
): WeeklyChartData[] {
  // 시즌별 데이터를 weekKey 기준으로 맵핑
  const seasonMap = new Map<string, {
    cyCurrentSeasonStock: number;
    cyNextSeasonStock: number;
    cyOldSeasonStock: number;
    cyStagnantStock: number;
    cyTotalStock: number;
    pyCurrentSeasonStock: number;
    pyNextSeasonStock: number;
    pyOldSeasonStock: number;
    pyStagnantStock: number;
    pyTotalStock: number;
  }>();

  for (const row of seasonRows) {
    const weekKey = row.WEEK_KEY || row.week_key;
    seasonMap.set(weekKey, {
      cyCurrentSeasonStock: Number(row.CY_CURRENT_SEASON_STOCK || row.cy_current_season_stock || 0),
      cyNextSeasonStock: Number(row.CY_NEXT_SEASON_STOCK || row.cy_next_season_stock || 0),
      cyOldSeasonStock: Number(row.CY_OLD_SEASON_STOCK || row.cy_old_season_stock || 0),
      cyStagnantStock: Number(row.CY_STAGNANT_STOCK || row.cy_stagnant_stock || 0),
      cyTotalStock: Number(row.CY_TOTAL_STOCK || row.cy_total_stock || 0),
      pyCurrentSeasonStock: Number(row.PY_CURRENT_SEASON_STOCK || row.py_current_season_stock || 0),
      pyNextSeasonStock: Number(row.PY_NEXT_SEASON_STOCK || row.py_next_season_stock || 0),
      pyOldSeasonStock: Number(row.PY_OLD_SEASON_STOCK || row.py_old_season_stock || 0),
      pyStagnantStock: Number(row.PY_STAGNANT_STOCK || row.py_stagnant_stock || 0),
      pyTotalStock: Number(row.PY_TOTAL_STOCK || row.py_total_stock || 0),
    });
  }

  // 주차별로 그룹핑 (당년/전년 분리)
  const weeklyMap = new Map<string, {
    weekKey: string;
    asofDate: string;
    weekNum: number;
    cyCategories: Map<string, { stock: number; sale: number }>;  // 당년
    pyCategories: Map<string, { stock: number; sale: number }>;  // 전년
  }>();

  for (const row of rows) {
    const weekKey = row.WEEK_KEY || row.week_key;
    const asofDate = row.ASOF_DT || row.asof_dt;
    const weekNum = row.WEEK_NUM || row.week_num;
    const category = mapItemCategory(row.PRDT_HRRC2_NM || row.prdt_hrrc2_nm || '');
    const cyStockAmt = Number(row.CY_STOCK_TAG_AMT || row.cy_stock_tag_amt || 0);
    const cySaleAmt = Number(row.CY_SALE_AMT || row.cy_sale_amt || 0);
    const pyStockAmt = Number(row.PY_STOCK_TAG_AMT || row.py_stock_tag_amt || 0);
    const pySaleAmt = Number(row.PY_SALE_AMT || row.py_sale_amt || 0);

    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, {
        weekKey,
        asofDate: asofDate?.toString().split('T')[0] || '',
        weekNum,
        cyCategories: new Map(),
        pyCategories: new Map()
      });
    }

    const weekData = weeklyMap.get(weekKey)!;
    
    // 당년 데이터
    const cyExisting = weekData.cyCategories.get(category) || { stock: 0, sale: 0 };
    weekData.cyCategories.set(category, {
      stock: cyExisting.stock + cyStockAmt,
      sale: cyExisting.sale + cySaleAmt
    });
    
    // 전년 데이터
    const pyExisting = weekData.pyCategories.get(category) || { stock: 0, sale: 0 };
    weekData.pyCategories.set(category, {
      stock: pyExisting.stock + pyStockAmt,
      sale: pyExisting.sale + pySaleAmt
    });
  }

  // 결과 배열 생성
  const result: WeeklyChartData[] = [];
  
  for (const [weekKey, data] of weeklyMap) {
    // 당년 중분류별 합계
    const cyShoesData = data.cyCategories.get('shoes') || { stock: 0, sale: 0 };
    const cyHatData = data.cyCategories.get('hat') || { stock: 0, sale: 0 };
    const cyBagData = data.cyCategories.get('bag') || { stock: 0, sale: 0 };
    const cyOtherData = data.cyCategories.get('other') || { stock: 0, sale: 0 };

    // 전년 중분류별 합계
    const pyShoesData = data.pyCategories.get('shoes') || { stock: 0, sale: 0 };
    const pyHatData = data.pyCategories.get('hat') || { stock: 0, sale: 0 };
    const pyBagData = data.pyCategories.get('bag') || { stock: 0, sale: 0 };
    const pyOtherData = data.pyCategories.get('other') || { stock: 0, sale: 0 };

    // 당년 전체 합계
    const cyTotalStock = cyShoesData.stock + cyHatData.stock + cyBagData.stock + cyOtherData.stock;
    const cyTotalSale = cyShoesData.sale + cyHatData.sale + cyBagData.sale + cyOtherData.sale;

    // 전년 전체 합계
    const pyTotalStock = pyShoesData.stock + pyHatData.stock + pyBagData.stock + pyOtherData.stock;
    const pyTotalSale = pyShoesData.sale + pyHatData.sale + pyBagData.sale + pyOtherData.sale;

    // 재고주수 계산 (N주 매출 평균 기준)
    const calcWeeks = (stock: number, sale: number) => {
      if (sale <= 0) return 0;
      const weeklyAvgSale = sale / weeksForSale;
      return Math.round((stock / weeklyAvgSale) * 10) / 10;
    };

    // weekKey에서 연도 추출 (예: 2025-W51 -> 2025)
    const yearMatch = data.weekKey.match(/^(\d{4})-W/);
    const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
    
    // 날짜 범위 계산 (asofDate는 일요일, 월요일은 6일 전)
    let dateRange = '';
    if (data.asofDate) {
      const dateStr = String(data.asofDate).split('T')[0];
      const [yearStr, monthStr, dayStr] = dateStr.split('-');
      if (yearStr && monthStr && dayStr) {
        const endYear = parseInt(yearStr, 10);
        const endMonth = parseInt(monthStr, 10);
        const endDay = parseInt(dayStr, 10);
        
        const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));
        const startDate = new Date(endDate);
        startDate.setUTCDate(endDate.getUTCDate() - 6);
        
        const formatDate = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        dateRange = `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
      }
    }
    
    // 시즌별 데이터 가져오기
    const seasonData = seasonMap.get(weekKey) || {
      cyCurrentSeasonStock: 0,
      cyNextSeasonStock: 0,
      cyOldSeasonStock: 0,
      cyStagnantStock: 0,
      cyTotalStock: 0,
      pyCurrentSeasonStock: 0,
      pyNextSeasonStock: 0,
      pyOldSeasonStock: 0,
      pyStagnantStock: 0,
      pyTotalStock: 0,
    };

    // 시즌별 비율 계산
    const cySeasonTotal = seasonData.cyTotalStock || 1;
    const pySeasonTotal = seasonData.pyTotalStock || 1;

    const calcRatio = (amt: number, total: number) => 
      total > 0 ? Math.round((amt / total) * 100) : 0;

    // YOY 계산
    const stockYOY = seasonData.pyTotalStock > 0 
      ? Math.round(((seasonData.cyTotalStock - seasonData.pyTotalStock) / seasonData.pyTotalStock) * 100)
      : 0;

    result.push({
      weekKey: data.weekKey,
      weekLabel: `${year}년 ${data.weekNum}주차`,
      dateRange,
      asofDate: data.asofDate,
      // 당년 데이터
      stockAmount: Math.round(cyTotalStock / 1000000),
      saleAmount: Math.round(cyTotalSale / 1000000),
      weeks: calcWeeks(cyTotalStock, cyTotalSale),
      totalStock: Math.round(seasonData.cyTotalStock / 1000000),
      // 전년 데이터
      prevStockAmount: Math.round(pyTotalStock / 1000000),
      prevSaleAmount: Math.round(pyTotalSale / 1000000),
      prevWeeks: calcWeeks(pyTotalStock, pyTotalSale),
      prevTotalStock: Math.round(seasonData.pyTotalStock / 1000000),
      // 당년 시즌별 재고금액 (백만원)
      currentSeasonStock: Math.round(seasonData.cyCurrentSeasonStock / 1000000),
      nextSeasonStock: Math.round(seasonData.cyNextSeasonStock / 1000000),
      oldSeasonStock: Math.round(seasonData.cyOldSeasonStock / 1000000),
      stagnantStock: Math.round(seasonData.cyStagnantStock / 1000000),
      // 전년 시즌별 재고금액 (백만원)
      previousCurrentSeasonStock: Math.round(seasonData.pyCurrentSeasonStock / 1000000),
      previousNextSeasonStock: Math.round(seasonData.pyNextSeasonStock / 1000000),
      previousOldSeasonStock: Math.round(seasonData.pyOldSeasonStock / 1000000),
      previousStagnantStock: Math.round(seasonData.pyStagnantStock / 1000000),
      // 시즌별 비율 (%)
      currentSeasonRatio: calcRatio(seasonData.cyCurrentSeasonStock, cySeasonTotal),
      nextSeasonRatio: calcRatio(seasonData.cyNextSeasonStock, cySeasonTotal),
      oldSeasonRatio: calcRatio(seasonData.cyOldSeasonStock, cySeasonTotal),
      stagnantRatio: calcRatio(seasonData.cyStagnantStock, cySeasonTotal),
      previousCurrentSeasonRatio: calcRatio(seasonData.pyCurrentSeasonStock, pySeasonTotal),
      previousNextSeasonRatio: calcRatio(seasonData.pyNextSeasonStock, pySeasonTotal),
      previousOldSeasonRatio: calcRatio(seasonData.pyOldSeasonStock, pySeasonTotal),
      previousStagnantRatio: calcRatio(seasonData.pyStagnantStock, pySeasonTotal),
      // YOY
      stockYOY,
      // 중분류별 당년 재고주수
      shoesWeeks: calcWeeks(cyShoesData.stock, cyShoesData.sale),
      hatWeeks: calcWeeks(cyHatData.stock, cyHatData.sale),
      bagWeeks: calcWeeks(cyBagData.stock, cyBagData.sale),
      otherWeeks: calcWeeks(cyOtherData.stock, cyOtherData.sale),
      // 중분류별 전년 재고주수
      prevShoesWeeks: calcWeeks(pyShoesData.stock, pyShoesData.sale),
      prevHatWeeks: calcWeeks(pyHatData.stock, pyHatData.sale),
      prevBagWeeks: calcWeeks(pyBagData.stock, pyBagData.sale),
      prevOtherWeeks: calcWeeks(pyOtherData.stock, pyOtherData.sale),
      // 중분류별 재고금액
      shoesStock: Math.round(cyShoesData.stock / 1000000),
      hatStock: Math.round(cyHatData.stock / 1000000),
      bagStock: Math.round(cyBagData.stock / 1000000),
      otherStock: Math.round(cyOtherData.stock / 1000000),
    });
  }

  // 날짜 오름차순 정렬
  return result.sort((a, b) => {
    if (a.asofDate && b.asofDate) {
      const dateA = new Date(a.asofDate);
      const dateB = new Date(b.asofDate);
      return dateA.getTime() - dateB.getTime();
    }
    const parseWeekKey = (key: string) => {
      const match = key.match(/(\d{4})-W(\d{2})/);
      if (match) {
        return parseInt(match[1]) * 100 + parseInt(match[2]);
      }
      return 0;
    };
    return parseWeekKey(a.weekKey) - parseWeekKey(b.weekKey);
  });
}

