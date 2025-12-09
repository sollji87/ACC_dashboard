/**
 * 재고 예측 계산 서비스
 */

import {
  ForecastInput,
  ForecastResult,
  OrderCapacity,
  CombinedChartData,
  MonthlyIncomingAmount,
} from './forecast-types';

/**
 * 월 문자열을 Date 객체로 변환
 */
function parseMonth(monthStr: string): Date {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * Date 객체를 'YYYY-MM' 문자열로 변환
 */
function formatMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * N개월 전/후 월 계산
 */
function addMonths(monthStr: string, months: number): string {
  const date = parseMonth(monthStr);
  date.setMonth(date.getMonth() + months);
  return formatMonth(date);
}

/**
 * 전년 동월 계산
 */
function getPreviousYearMonth(monthStr: string): string {
  return addMonths(monthStr, -12);
}

/**
 * 최근 N개월 평균 택판매액 계산
 * @param actualData 실적 데이터
 * @param targetMonth 목표 월
 * @param months 평균 계산 기간 (1, 2, 3개월)
 */
function calculateAverageTagSales(
  actualData: any[],
  targetMonth: string,
  months: number = 1
): number {
  const targetDate = parseMonth(targetMonth);
  const tagSalesData: number[] = [];

  for (let i = 0; i < months; i++) {
    const checkDate = new Date(targetDate);
    checkDate.setMonth(checkDate.getMonth() - i);
    const checkMonth = formatMonth(checkDate);

    const monthData = actualData.find((d) => d.month === checkMonth);
    if (monthData && monthData.totalSale) {
      // totalSale은 택판매액 (백만원 단위)
      tagSalesData.push(monthData.totalSale);
    }
  }

  if (tagSalesData.length === 0) return 0;

  const avgMonthlyTagSales = tagSalesData.reduce((sum, val) => sum + val, 0) / tagSalesData.length;
  // 주간 평균 택판매액 = 월평균 택판매액 / 30 * 7
  return avgMonthlyTagSales / 30 * 7;
}

/**
 * 재고 예측 계산
 * @param actualData 실적 데이터 (차트 데이터)
 * @param forecastInput 예측 입력 데이터
 * @param weeksType 재고주수 계산 기준 (4주/8주/12주)
 * @param selectedItem 선택된 중분류 (shoes, hat, bag, other)
 */
export function calculateForecast(
  actualData: any[],
  forecastInput: ForecastInput,
  weeksType: '4weeks' | '8weeks' | '12weeks' = '4weeks',
  selectedItem: 'shoes' | 'hat' | 'bag' | 'other' = 'shoes'
): ForecastResult[] {
  const results: ForecastResult[] = [];
  
  // 재고주수 계산 기준 (1개월/2개월/3개월)
  const monthsForAvg = weeksType === '4weeks' ? 1 : weeksType === '8weeks' ? 2 : 3;
  
  // 마지막 실적 월 찾기
  const lastActualMonth = actualData[actualData.length - 1]?.month;
  if (!lastActualMonth) return results;
  
  // 마지막 실적의 기말재고택금액 (백만원 단위를 원 단위로 변환)
  let previousEndingInventory = (actualData[actualData.length - 1]?.totalStock || 0) * 1000000;
  
  // 예측 판매액 기록 (최근 N개월 평균 계산용)
  const forecastSalesHistory: number[] = [];
  
  // 월별 예측 계산
  for (const monthlyIncoming of forecastInput.incomingAmounts) {
    const { month } = monthlyIncoming;
    const yoyRate = forecastInput.yoyRate;
    
    // 전년 동월 데이터 찾기
    const previousYearMonth = getPreviousYearMonth(month);
    const previousYearData = actualData.find((d) => d.month === previousYearMonth);
    
    if (!previousYearData) {
      console.warn(`전년 동월 데이터 없음: ${previousYearMonth}`);
      continue;
    }
    
    // 전년 동월 재고주수 (실적)
    const previousStockWeeks = previousYearData.stockWeeks || 0;
    const previousStockWeeksNormal = previousYearData.stockWeeksNormal || 0;
    
    // 1. 택판매액 계산 (전년 동월 택판매액 × YOY 성장률)
    // totalSale은 택판매액 (백만원 단위)이므로 원 단위로 변환
    const previousYearTagSales = (previousYearData.totalSale || 0) * 1000000;
    const forecastTagSales = previousYearTagSales * (yoyRate / 100);
    
    // 예측 택판매액 기록 (월별)
    forecastSalesHistory.push(forecastTagSales);
    
    // 2. 선택된 중분류의 입고예정금액 사용
    const incoming = monthlyIncoming[selectedItem] || 0;
    
    // 3. 기말재고택금액 계산
    // 기말재고 = 전월 기말재고 + 입고예정금액 - 택판매액
    const endingInventory = previousEndingInventory + incoming - forecastTagSales;
    
    // 4. 재고주수 계산 (YOY 반영된 예상 택판매액 기준)
    // 주간평균 택판매액 = 최근 N개월 예상 택판매액 평균 / 30 * 7
    let weeklyAvgTagSales: number;
    
    if (forecastSalesHistory.length >= monthsForAvg) {
      // 예측 구간 데이터가 충분하면 예측 택판매액만 사용
      const recentTagSales = forecastSalesHistory.slice(-monthsForAvg);
      const avgMonthlyTagSales = recentTagSales.reduce((sum, val) => sum + val, 0) / recentTagSales.length;
      weeklyAvgTagSales = avgMonthlyTagSales / 30 * 7;
    } else {
      // 예측 구간 데이터가 부족하면 실적 + 예측 혼합
      const actualTagSalesData: number[] = [];
      for (let i = 1; i <= monthsForAvg - forecastSalesHistory.length; i++) {
        const checkMonth = addMonths(lastActualMonth, -i + 1);
        const monthData = actualData.find((d) => d.month === checkMonth);
        if (monthData && monthData.totalSale) {
          // totalSale은 택판매액 (백만원 단위)
          actualTagSalesData.push(monthData.totalSale * 1000000); // 백만원 -> 원
        }
      }
      const combinedTagSales = [...actualTagSalesData, ...forecastSalesHistory];
      const avgMonthlyTagSales = combinedTagSales.length > 0 
        ? combinedTagSales.reduce((sum, val) => sum + val, 0) / combinedTagSales.length 
        : 0;
      weeklyAvgTagSales = avgMonthlyTagSales / 30 * 7;
    }
    
    const stockWeeks = weeklyAvgTagSales > 0 ? endingInventory / weeklyAvgTagSales : 0;
    
    // 5. 시즌별 재고 예측 (전년 동월 비율 적용)
    const currentSeasonRatio = (previousYearData.currentSeasonStock || 0) / (previousYearData.totalStock || 1);
    const nextSeasonRatio = (previousYearData.nextSeasonStock || 0) / (previousYearData.totalStock || 1);
    const oldSeasonRatio = (previousYearData.oldSeasonStock || 0) / (previousYearData.totalStock || 1);
    const stagnantRatio = (previousYearData.stagnantStock || 0) / (previousYearData.totalStock || 1);
    
    // 6. 시즌별 매출액 예측 (전년 동월 비율 × YOY 성장률)
    const currentSeasonSaleRatio = (previousYearData.currentSeasonSale || 0) / (previousYearData.totalSale || 1);
    const nextSeasonSaleRatio = (previousYearData.nextSeasonSale || 0) / (previousYearData.totalSale || 1);
    const oldSeasonSaleRatio = (previousYearData.oldSeasonSale || 0) / (previousYearData.totalSale || 1);
    const stagnantSaleRatio = (previousYearData.stagnantSale || 0) / (previousYearData.totalSale || 1);
    
    // 백만원 단위로 변환
    const endingInventoryMillion = endingInventory / 1000000;
    const forecastTagSalesMillion = forecastTagSales / 1000000;
    
    // 비율 계산 (당년 예측)
    const cyCurrentSeasonRatio = endingInventoryMillion > 0 
      ? Math.round((Math.round(endingInventoryMillion * currentSeasonRatio) / endingInventoryMillion) * 100) 
      : 0;
    const cyNextSeasonRatio = endingInventoryMillion > 0 
      ? Math.round((Math.round(endingInventoryMillion * nextSeasonRatio) / endingInventoryMillion) * 100) 
      : 0;
    const cyOldSeasonRatio = endingInventoryMillion > 0 
      ? Math.round((Math.round(endingInventoryMillion * oldSeasonRatio) / endingInventoryMillion) * 100) 
      : 0;
    const cyStagnantRatio = endingInventoryMillion > 0 
      ? Math.round((Math.round(endingInventoryMillion * stagnantRatio) / endingInventoryMillion) * 100) 
      : 0;
    
    // 비율 계산 (전년 동월)
    const pyTotalStock = previousYearData.totalStock || 0;
    const pyCurrentSeasonRatio = pyTotalStock > 0 
      ? Math.round(((previousYearData.currentSeasonStock || 0) / pyTotalStock) * 100) 
      : 0;
    const pyNextSeasonRatio = pyTotalStock > 0 
      ? Math.round(((previousYearData.nextSeasonStock || 0) / pyTotalStock) * 100) 
      : 0;
    const pyOldSeasonRatio = pyTotalStock > 0 
      ? Math.round(((previousYearData.oldSeasonStock || 0) / pyTotalStock) * 100) 
      : 0;
    const pyStagnantRatio = pyTotalStock > 0 
      ? Math.round(((previousYearData.stagnantStock || 0) / pyTotalStock) * 100) 
      : 0;
    
    // YOY 계산
    const stockYOY = pyTotalStock > 0 
      ? Math.round((endingInventoryMillion / pyTotalStock) * 1000) / 10 
      : 0;
    const saleYOY = (previousYearData.totalSale || 0) > 0 
      ? Math.round((forecastTagSalesMillion / (previousYearData.totalSale || 1)) * 1000) / 10 
      : 0;
    
    results.push({
      month,
      forecastSales: forecastTagSalesMillion, // 택판매액 (백만원 단위)
      endingInventory: endingInventoryMillion,
      stockWeeks: Math.round(stockWeeks * 10) / 10,
      stockWeeksNormal: Math.round(stockWeeks * (1 - stagnantRatio) * 10) / 10,
      // 전년 동월 재고주수 (실적)
      previousStockWeeks: previousStockWeeks,
      previousStockWeeksNormal: previousStockWeeksNormal,
      // 당년 예측 재고 (시즌별)
      currentSeasonStock: Math.round(endingInventoryMillion * currentSeasonRatio),
      nextSeasonStock: Math.round(endingInventoryMillion * nextSeasonRatio),
      oldSeasonStock: Math.round(endingInventoryMillion * oldSeasonRatio),
      stagnantStock: Math.round(endingInventoryMillion * stagnantRatio),
      totalStock: Math.round(endingInventoryMillion),
      // 전년 동월 실적 재고 (시즌별)
      previousCurrentSeasonStock: previousYearData.currentSeasonStock || 0,
      previousNextSeasonStock: previousYearData.nextSeasonStock || 0,
      previousOldSeasonStock: previousYearData.oldSeasonStock || 0,
      previousStagnantStock: previousYearData.stagnantStock || 0,
      previousTotalStock: previousYearData.totalStock || 0,
      // 당년 예측 비율
      currentSeasonRatio: cyCurrentSeasonRatio,
      nextSeasonRatio: cyNextSeasonRatio,
      oldSeasonRatio: cyOldSeasonRatio,
      stagnantRatio: cyStagnantRatio,
      // 전년 동월 비율
      previousCurrentSeasonRatio: pyCurrentSeasonRatio,
      previousNextSeasonRatio: pyNextSeasonRatio,
      previousOldSeasonRatio: pyOldSeasonRatio,
      previousStagnantRatio: pyStagnantRatio,
      // YOY
      stockYOY: stockYOY,
      saleYOY: saleYOY,
      // 당년 예측 택판매액 (시즌별, 전년 비중 × YOY)
      currentSeasonSale: Math.round(forecastTagSalesMillion * currentSeasonSaleRatio),
      nextSeasonSale: Math.round(forecastTagSalesMillion * nextSeasonSaleRatio),
      oldSeasonSale: Math.round(forecastTagSalesMillion * oldSeasonSaleRatio),
      stagnantSale: Math.round(forecastTagSalesMillion * stagnantSaleRatio),
      totalSale: Math.round(forecastTagSalesMillion),
      // 전년 동월 실적 매출액 (시즌별)
      previousCurrentSeasonSale: previousYearData.currentSeasonSale || 0,
      previousNextSeasonSale: previousYearData.nextSeasonSale || 0,
      previousOldSeasonSale: previousYearData.oldSeasonSale || 0,
      previousStagnantSale: previousYearData.stagnantSale || 0,
      previousTotalSale: previousYearData.totalSale || 0,
      // 택판매액 비율 (당년 예측)
      currentSeasonSaleRatio: forecastTagSalesMillion > 0 
        ? Math.round((Math.round(forecastTagSalesMillion * currentSeasonSaleRatio) / forecastTagSalesMillion) * 100) 
        : 0,
      nextSeasonSaleRatio: forecastTagSalesMillion > 0 
        ? Math.round((Math.round(forecastTagSalesMillion * nextSeasonSaleRatio) / forecastTagSalesMillion) * 100) 
        : 0,
      oldSeasonSaleRatio: forecastTagSalesMillion > 0 
        ? Math.round((Math.round(forecastTagSalesMillion * oldSeasonSaleRatio) / forecastTagSalesMillion) * 100) 
        : 0,
      stagnantSaleRatio: forecastTagSalesMillion > 0 
        ? Math.round((Math.round(forecastTagSalesMillion * stagnantSaleRatio) / forecastTagSalesMillion) * 100) 
        : 0,
    });
    
    // 다음 월을 위해 현재 기말재고 저장
    previousEndingInventory = endingInventory;
  }
  
  return results;
}

/**
 * 4개월 후 신규 발주가능 금액 계산
 * @param actualData 실적 데이터
 * @param forecastResults 예측 결과
 * @param baseStockWeeks 기준재고주수
 * @param weeksType 재고주수 계산 기준
 * @param yoyRate YOY 성장률 (%)
 */
export function calculateOrderCapacity(
  actualData: any[],
  forecastResults: ForecastResult[],
  baseStockWeeks: number,
  weeksType: '4weeks' | '8weeks' | '12weeks' = '4weeks',
  yoyRate: number = 100
): OrderCapacity | null {
  if (forecastResults.length < 4) {
    console.warn('4개월 후 예측 데이터가 부족합니다.');
    return null;
  }
  
  // 4개월 후 데이터
  const fourMonthsLater = forecastResults[3];
  
  // 재고주수 계산 기준
  const monthsForAvg = weeksType === '4weeks' ? 1 : weeksType === '8weeks' ? 2 : 3;
  
  // 예측 택판매액 기반 주간평균 택판매액 계산 (백만원 단위)
  // 4개월 후 시점 기준 최근 N개월 예측 택판매액 사용
  let weeklyAvgTagSales: number;
  let monthlyAvgTagSales: number;
  
  if (forecastResults.length >= monthsForAvg) {
    // 예측 데이터에서 최근 N개월 택판매액 평균 계산 (forecastSales는 택판매액)
    const recentTagSales = forecastResults.slice(0, 4).slice(-monthsForAvg);
    monthlyAvgTagSales = recentTagSales.reduce((sum, f) => sum + (f.forecastSales || 0), 0) / recentTagSales.length;
    weeklyAvgTagSales = monthlyAvgTagSales / 30 * 7; // 백만원 단위
  } else {
    // 실적 데이터 기반
    const lastActualMonth = actualData[actualData.length - 1]?.month;
    if (!lastActualMonth) return null;
    weeklyAvgTagSales = calculateAverageTagSales(actualData, lastActualMonth, monthsForAvg); // 백만원 단위
    monthlyAvgTagSales = weeklyAvgTagSales / 7 * 30; // 역산
  }
  
  // 목표재고 = 기준재고주수 × 주간평균 택판매액 (백만원 단위)
  const targetStock = baseStockWeeks * weeklyAvgTagSales;
  
  // 현재 예상재고 (4개월 후, 백만원 단위)
  const currentForecastStock = fourMonthsLater.endingInventory;
  
  // 신규 발주가능 금액 (백만원 단위)
  const orderCapacityAmt = targetStock - currentForecastStock;
  
  return {
    targetMonth: fourMonthsLater.month,
    baseStockWeeks,
    currentForecastStock: Math.round(currentForecastStock), // 백만원 단위, 소수점 제거
    targetStock: Math.round(targetStock), // 백만원 단위, 소수점 제거
    orderCapacity: Math.round(orderCapacityAmt), // 백만원 단위, 소수점 제거
    weeklyAvgSales: Math.round(weeklyAvgTagSales), // 주간평균 택판매액 (백만원 단위), 소수점 제거
    // 추가 정보
    yoyRate: yoyRate,
    monthlyAvgSales: Math.round(monthlyAvgTagSales), // 월평균 택판매액 (백만원), 소수점 제거
    weeksType: weeksType,
  };
}

/**
 * 실적 데이터와 예측 데이터 결합
 * @param actualData 실적 데이터
 * @param forecastResults 예측 결과
 */
export function combineActualAndForecast(
  actualData: any[],
  forecastResults: ForecastResult[]
): CombinedChartData[] {
  const combined: CombinedChartData[] = [];
  
  // 실적 데이터 추가
  actualData.forEach((data) => {
    combined.push({
      ...data,
      isActual: true,
    });
  });
  
  // 예측 데이터 추가 (전년 동월 실적 포함)
  forecastResults.forEach((forecast) => {
    combined.push({
      month: forecast.month,
      isActual: false,
      stockWeeks: forecast.stockWeeks,
      previousStockWeeks: forecast.previousStockWeeks || 0, // 전년 동월 재고주수 (실적)
      stockWeeksNormal: forecast.stockWeeksNormal,
      previousStockWeeksNormal: forecast.previousStockWeeksNormal || 0, // 전년 동월 정상재고 재고주수
      // 당년 예측 재고
      currentSeasonStock: forecast.currentSeasonStock,
      nextSeasonStock: forecast.nextSeasonStock,
      oldSeasonStock: forecast.oldSeasonStock,
      stagnantStock: forecast.stagnantStock,
      totalStock: forecast.totalStock,
      // 전년 동월 실적 재고
      previousCurrentSeasonStock: forecast.previousCurrentSeasonStock || 0,
      previousNextSeasonStock: forecast.previousNextSeasonStock || 0,
      previousOldSeasonStock: forecast.previousOldSeasonStock || 0,
      previousStagnantStock: forecast.previousStagnantStock || 0,
      previousTotalStock: forecast.previousTotalStock || 0,
      // 당년 예측 매출액
      currentSeasonSale: forecast.currentSeasonSale || 0,
      nextSeasonSale: forecast.nextSeasonSale || 0,
      oldSeasonSale: forecast.oldSeasonSale || 0,
      stagnantSale: forecast.stagnantSale || 0,
      totalSale: forecast.totalSale || 0,
      // 전년 동월 실적 매출액
      previousCurrentSeasonSale: forecast.previousCurrentSeasonSale || 0,
      previousNextSeasonSale: forecast.previousNextSeasonSale || 0,
      previousOldSeasonSale: forecast.previousOldSeasonSale || 0,
      previousStagnantSale: forecast.previousStagnantSale || 0,
      previousTotalSale: forecast.previousTotalSale || 0,
      // 비율
      currentSeasonRatio: forecast.currentSeasonRatio || 0,
      nextSeasonRatio: forecast.nextSeasonRatio || 0,
      oldSeasonRatio: forecast.oldSeasonRatio || 0,
      stagnantRatio: forecast.stagnantRatio || 0,
      previousCurrentSeasonRatio: forecast.previousCurrentSeasonRatio || 0,
      previousNextSeasonRatio: forecast.previousNextSeasonRatio || 0,
      previousOldSeasonRatio: forecast.previousOldSeasonRatio || 0,
      previousStagnantRatio: forecast.previousStagnantRatio || 0,
      // YOY
      stockYOY: forecast.stockYOY || 0,
      saleYOY: forecast.saleYOY || 0,
      // 매출액 비율
      currentSeasonSaleRatio: forecast.currentSeasonSaleRatio || 0,
      nextSeasonSaleRatio: forecast.nextSeasonSaleRatio || 0,
      oldSeasonSaleRatio: forecast.oldSeasonSaleRatio || 0,
      stagnantSaleRatio: forecast.stagnantSaleRatio || 0,
    });
  });
  
  return combined;
}

/**
 * 예측 기간 생성 (현재 월 + 1부터 6개월)
 * @param lastActualMonth 마지막 실적 월 ('YYYY-MM')
 * @param months 예측 기간 (기본 6개월)
 */
export function generateForecastMonths(lastActualMonth: string, months: number = 6): string[] {
  const result: string[] = [];
  for (let i = 1; i <= months; i++) {
    result.push(addMonths(lastActualMonth, i));
  }
  return result;
}

/**
 * 기본 입고예정금액 생성 (0원)
 */
export function generateDefaultIncomingAmounts(months: string[]): MonthlyIncomingAmount[] {
  return months.map((month) => ({
    month,
    amount: 0,
  }));
}

