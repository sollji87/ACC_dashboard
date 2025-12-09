/**
 * 재고 예측 관련 타입 정의
 */

/**
 * 아이템 타입 (중분류)
 */
export type ItemType = 'shoes' | 'hat' | 'bag' | 'other';

/**
 * 중분류별 기준재고주수
 */
export interface ItemBaseStockWeeks {
  shoes: number; // 신발
  hat: number; // 모자
  bag: number; // 가방
  other: number; // 기타ACC
}

/**
 * 중분류별 매출액 성장률 YOY (%)
 */
export interface ItemYoyRate {
  shoes: number; // 신발 (예: 105 = 105%)
  hat: number; // 모자
  bag: number; // 가방
  other: number; // 기타ACC
}

/**
 * 월별 중분류별 입고예정금액
 */
export interface MonthlyItemIncomingAmount {
  month: string; // 'YYYY-MM' 형식
  shoes: number; // 신발 입고예정금액 (원)
  hat: number; // 모자 입고예정금액 (원)
  bag: number; // 가방 입고예정금액 (원)
  other: number; // 기타ACC 입고예정금액 (원)
}

/**
 * 법인별 예측 입력 데이터
 */
export interface ForecastInput {
  brandCode: string; // 브랜드 코드
  brandName: string; // 브랜드명
  yoyRate: ItemYoyRate; // 중분류별 매출액 성장률 YOY (예: 105 = 105%)
  baseStockWeeks: ItemBaseStockWeeks; // 중분류별 기준재고주수
  incomingAmounts: MonthlyItemIncomingAmount[]; // 월별 중분류별 입고예정금액
}

/**
 * 월별 입고예정금액 (하위 호환용)
 */
export interface MonthlyIncomingAmount {
  month: string; // 'YYYY-MM' 형식
  amount: number; // 입고예정금액 (원)
}

/**
 * 예측 결과 데이터
 */
export interface ForecastResult {
  month: string; // 'YYYY-MM' 형식
  // 판매택 (전년 동월 판매택 × YOY 성장률)
  forecastSales: number;
  // 기말재고택금액 (전월 기말재고 + 입고예정금액 - 판매택)
  endingInventory: number;
  // 재고주수 (기말재고택금액 / 주간평균판매액)
  stockWeeks: number;
  // 정상재고 기준 재고주수
  stockWeeksNormal: number;
  // 전년 동월 재고주수 (실적)
  previousStockWeeks?: number;
  previousStockWeeksNormal?: number;
  // 당년 예측 시즌별 재고
  currentSeasonStock: number;
  nextSeasonStock: number;
  oldSeasonStock: number;
  stagnantStock: number;
  totalStock: number;
  // 전년 동월 실적 시즌별 재고
  previousCurrentSeasonStock?: number;
  previousNextSeasonStock?: number;
  previousOldSeasonStock?: number;
  previousStagnantStock?: number;
  previousTotalStock?: number;
  // 당년 예측 시즌별 매출액
  currentSeasonSale?: number;
  nextSeasonSale?: number;
  oldSeasonSale?: number;
  stagnantSale?: number;
  totalSale?: number;
  // 전년 동월 실적 시즌별 매출액
  previousCurrentSeasonSale?: number;
  previousNextSeasonSale?: number;
  previousOldSeasonSale?: number;
  previousStagnantSale?: number;
  previousTotalSale?: number;
  // 당년 예측 비율
  currentSeasonRatio?: number;
  nextSeasonRatio?: number;
  oldSeasonRatio?: number;
  stagnantRatio?: number;
  // 전년 동월 비율
  previousCurrentSeasonRatio?: number;
  previousNextSeasonRatio?: number;
  previousOldSeasonRatio?: number;
  previousStagnantRatio?: number;
  // YOY
  stockYOY?: number;
  saleYOY?: number;
  // 매출액 비율
  currentSeasonSaleRatio?: number;
  nextSeasonSaleRatio?: number;
  oldSeasonSaleRatio?: number;
  stagnantSaleRatio?: number;
}

/**
 * 신규 발주가능 금액 계산 결과
 */
export interface OrderCapacity {
  targetMonth: string; // 목표 월 (4개월 후)
  baseStockWeeks: number; // 기준재고주수
  currentForecastStock: number; // 현재 예상재고
  targetStock: number; // 목표재고 (기준재고주수 × 주간평균 택판매액)
  orderCapacity: number; // 신규 발주가능 금액 (목표재고 - 현재 예상재고)
  weeklyAvgSales: number; // 주간평균 택판매액 (백만원, 소수점 제거)
  // 추가 정보
  yoyRate: number; // YOY 성장률 (%)
  monthlyAvgSales: number; // 월평균 택판매액 (백만원, 소수점 제거)
  weeksType: '4weeks' | '8weeks' | '12weeks'; // 재고주수 계산 기준
}

/**
 * 전체 예측 데이터 (실적 + 예측)
 */
export interface CombinedChartData {
  month: string;
  isActual: boolean; // true: 실적, false: 예측
  stockWeeks: number;
  previousStockWeeks: number;
  stockWeeksNormal: number;
  previousStockWeeksNormal: number;
  currentSeasonStock: number;
  nextSeasonStock: number;
  oldSeasonStock: number;
  stagnantStock: number;
  totalStock: number;
  previousCurrentSeasonStock?: number;
  previousNextSeasonStock?: number;
  previousOldSeasonStock?: number;
  previousStagnantStock?: number;
  previousTotalStock?: number;
  currentSeasonRatio?: number;
  nextSeasonRatio?: number;
  oldSeasonRatio?: number;
  stagnantRatio?: number;
  previousCurrentSeasonRatio?: number;
  previousNextSeasonRatio?: number;
  previousOldSeasonRatio?: number;
  previousStagnantRatio?: number;
  stockYOY?: number;
  saleYOY?: number;
  currentSeasonSale?: number;
  nextSeasonSale?: number;
  oldSeasonSale?: number;
  stagnantSale?: number;
  totalSale?: number;
  previousCurrentSeasonSale?: number;
  previousNextSeasonSale?: number;
  previousOldSeasonSale?: number;
  previousStagnantSale?: number;
  previousTotalSale?: number;
  currentSeasonSaleRatio?: number;
  nextSeasonSaleRatio?: number;
  oldSeasonSaleRatio?: number;
  stagnantSaleRatio?: number;
}

