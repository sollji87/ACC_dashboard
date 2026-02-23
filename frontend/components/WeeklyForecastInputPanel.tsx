'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fetchWeeklyIncomingAmounts, WeeklyIncomingAmountData } from '@/lib/api';
import { OrderCapacity } from '@/lib/forecast-types';
import { WEEKLY_FORECAST_CACHE_VERSION, hasCurrentWeeklyForecastCacheVersion } from '@/lib/weekly-forecast-cache';

interface WeeklyItemIncomingAmount {
  weekKey: string;
  weekLabel: string;
  shoes: number;
  hat: number;
  bag: number;
  other: number;
}

interface ItemYoyRate {
  shoes: number;
  hat: number;
  bag: number;
  other: number;
}

interface ItemBaseStockWeeks {
  shoes: number;
  hat: number;
  bag: number;
  other: number;
}

interface WeeklyForecastInputPanelProps {
  brandCode: string;  // 'M', 'I' 등 (DB용 코드)
  brandId?: string;   // 'mlb', 'discovery' 등 (API URL용 ID)
  brandName: string;
  currentWeek: string; // '2025-51' 형식
  selectedItem: 'all' | 'shoes' | 'hat' | 'bag' | 'other';
  actualData: any[]; // 실적 차트 데이터
  weeksType: '4weeks' | '8weeks' | '12weeks';
  onIncomingAmountsLoaded?: (data: WeeklyItemIncomingAmount[]) => void;
  onForecastCalculated: (forecastResults: any[], orderCapacity: OrderCapacity | null, incomingAmounts?: any[], orderCapacityByItem?: Record<string, OrderCapacity>, forecastResultsByItem?: Record<string, any[]>) => void;
}

// 주차 생성 함수 (현재 주차부터 미래 12주)
function generateForecastWeeks(currentWeek: string, count: number = 12): { weekKey: string; weekLabel: string }[] {
  const result: { weekKey: string; weekLabel: string }[] = [];
  
  // 현재 주차 파싱
  const match = currentWeek.match(/(\d{4})-(\d{1,2})/);
  if (!match) return result;
  
  let year = parseInt(match[1]);
  let week = parseInt(match[2]);
  
  for (let i = 1; i <= count; i++) {
    week++;
    if (week > 52) {
      week = 1;
      year++;
    }
    const weekKey = `${year}-W${String(week).padStart(2, '0')}`;
    result.push({
      weekKey,
      weekLabel: `${week}주차`,
    });
  }
  
  return result;
}

function getWeeklySalesAmount(row: any, windowSize: number): number {
  const saleAmount1w = Number(row?.saleAmount1w || 0);
  if (saleAmount1w > 0) return saleAmount1w;

  const saleAmountNw = Number(row?.saleAmount || 0);
  if (saleAmountNw > 0 && windowSize > 0) {
    return Math.round(saleAmountNw / windowSize);
  }

  return 0;
}

function getRecentWeeklySalesHistory(actualRows: any[], windowSize: number): number[] {
  if (!Array.isArray(actualRows) || actualRows.length === 0 || windowSize <= 1) {
    return [];
  }

  const requiredCount = windowSize - 1;
  const weeklySales = actualRows.map((row) => getWeeklySalesAmount(row, windowSize));
  return weeklySales.slice(-requiredCount);
}

function applyRollingSalesAmount(
  forecastRows: any[],
  windowSize: number,
  recentWeeklySales: number[] = [],
): any[] {
  return forecastRows.map((row, idx, arr) => {
    const history = [
      ...recentWeeklySales,
      ...arr.slice(0, idx + 1).map((item) => Number(item.saleAmount1w || 0)),
    ];
    const rollingTotal = history
      .slice(-windowSize)
      .reduce((sum, sale) => sum + sale, 0);

    return {
      ...row,
      saleAmount: rollingTotal,
    };
  });
}

export default function WeeklyForecastInputPanel({
  brandCode,
  brandId,
  brandName,
  currentWeek,
  selectedItem,
  actualData,
  weeksType,
  onIncomingAmountsLoaded,
  onForecastCalculated,
}: WeeklyForecastInputPanelProps) {
  // API URL용 brandId가 없으면 brandCode를 사용 (호환성)
  const effectiveBrandId = brandId || brandCode;
  const [isExpanded, setIsExpanded] = useState(false);
  const [yoyRateExPurchase, setYoyRateExPurchase] = useState<ItemYoyRate>({
    shoes: 105,
    hat: 105,
    bag: 105,
    other: 105,
  });
  const [yoyRatePurchase, setYoyRatePurchase] = useState<ItemYoyRate>({
    shoes: 100,
    hat: 100,
    bag: 100,
    other: 100,
  });
  const [baseStockWeeks, setBaseStockWeeks] = useState<ItemBaseStockWeeks>({
    shoes: 40,
    hat: 12,
    bag: 40,
    other: 40,
  });
  const [incomingAmounts, setIncomingAmounts] = useState<WeeklyItemIncomingAmount[]>([]);
  const [isLoadingIncoming, setIsLoadingIncoming] = useState(false);
  const [forecastWeeks, setForecastWeeks] = useState<{ weekKey: string; weekLabel: string }[]>([]);
  const [isForecastReady, setIsForecastReady] = useState(false);
  // 전년 동주차 데이터 (중분류별로 저장)
  const [prevYearDataByItem, setPrevYearDataByItem] = useState<Record<string, Record<string, { sale: number; stock: number; weeks: number }>>>({
    shoes: {},
    hat: {},
    bag: {},
    other: {},
  });
  
  // 현재 선택된 중분류의 전년 데이터 (호환성 유지) - useMemo로 안정적인 참조 유지
  const prevYearData = useMemo(() => {
    return prevYearDataByItem[selectedItem] || {};
  }, [prevYearDataByItem, selectedItem]);
  
  const [isLoadingPrevSales, setIsLoadingPrevSales] = useState(false);
  
  // 이전 actualData 길이를 추적하여 불필요한 재계산 방지
  const prevActualDataLengthRef = useRef<number>(0);

  // 로컬 스토리지 키
  const storageKey = `weekly_forecast_${brandCode}`;

  // 예측 주차 생성 및 로컬 스토리지 로드
  useEffect(() => {
    if (!currentWeek) return;

    const weeks = generateForecastWeeks(currentWeek, 12);
    setForecastWeeks(weeks);
    
    // 로컬 스토리지에서 저장된 데이터 불러오기
    try {
      const savedData = localStorage.getItem(storageKey);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (!hasCurrentWeeklyForecastCacheVersion(parsed)) {
          localStorage.removeItem(storageKey);
          console.log(`🧹 이전 캐시 버전 감지로 삭제: ${storageKey}`);
        } else {
          if (parsed.yoyRateExPurchase) {
            setYoyRateExPurchase(parsed.yoyRateExPurchase);
          }
          if (parsed.yoyRatePurchase) {
            setYoyRatePurchase(parsed.yoyRatePurchase);
          }
          if (parsed.baseStockWeeks) {
            setBaseStockWeeks(parsed.baseStockWeeks);
          }
          if (parsed.incomingAmounts && parsed.incomingAmounts.length > 0) {
            setIncomingAmounts(parsed.incomingAmounts);
            setIsForecastReady(true);
          }
          // 전년 동주차 데이터 복원 (중분류별)
          if (parsed.prevYearDataByItem) {
            setPrevYearDataByItem(parsed.prevYearDataByItem);
            const totalWeeks = Object.values(parsed.prevYearDataByItem).reduce((sum: number, data: any) => sum + Object.keys(data || {}).length, 0);
            console.log('✅ 저장된 전년 동주차 데이터 복원 (중분류별):', totalWeeks, '개 주차');
          } else if (parsed.prevYearData) {
            // 이전 형식 호환성 (단일 객체인 경우 현재 선택된 중분류에 할당)
            setPrevYearDataByItem(prev => ({ ...prev, [selectedItem]: parsed.prevYearData }));
            console.log('✅ 저장된 전년 동주차 데이터 복원 (레거시):', Object.keys(parsed.prevYearData).length, '개 주차');
          }
        }
      }
    } catch (error) {
      console.error('주차별 예측 데이터 로드 실패:', error);
    }

    // 새 주차에 대한 초기 입고예정금액 설정
    if (weeks.length > 0) {
      setIncomingAmounts(prev => {
        if (prev.length > 0) return prev;
        return weeks.map(w => ({
          weekKey: w.weekKey,
          weekLabel: w.weekLabel,
          shoes: 0,
          hat: 0,
          bag: 0,
          other: 0,
        }));
      });
    }
  }, [currentWeek, storageKey]);

  // 아이템별 차트 데이터 조회 함수
  const fetchChartDataForItem = async (itemType: 'shoes' | 'hat' | 'bag' | 'other'): Promise<any[]> => {
    try {
      const weeksForSale = weeksType === '4weeks' ? 4 : weeksType === '8weeks' ? 8 : 12;
      // 차트 API는 brandId('mlb')를 사용
      const url = `/api/weekly-chart?brandId=${encodeURIComponent(effectiveBrandId)}&weeksForSale=${weeksForSale}&selectedItem=${itemType}`;
      console.log(`📊 [${itemType}] 차트 데이터 조회:`, url);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`❌ [${itemType}] 차트 데이터 조회 실패:`, response.status);
        return [];
      }
      
      const result = await response.json();
      // API 응답 구조: { success, brandId, brandCode, weeksForSale, selectedItem, data: chartData }
      const chartData = result.data || result || [];
      console.log(`✅ [${itemType}] 차트 데이터 조회 성공:`, chartData.length, '개 주차');
      return chartData;
    } catch (error) {
      console.error(`❌ [${itemType}] 차트 데이터 조회 오류:`, error);
      return [];
    }
  };

  // 예측 계산 수행 및 저장 (모든 아이템에 대해 계산)
  const saveToLocalStorage = async () => {
    try {
      // 로컬 스토리지에서 최신 prevYearDataByItem 읽기 (React 상태 비동기 문제 해결)
      let latestPrevYearDataByItem = prevYearDataByItem;
      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          if (!hasCurrentWeeklyForecastCacheVersion(parsed)) {
            localStorage.removeItem(storageKey);
          } else if (parsed.prevYearDataByItem) {
            latestPrevYearDataByItem = parsed.prevYearDataByItem;
            console.log('📊 로컬 스토리지에서 최신 전년 데이터 로드:', 
              Object.entries(latestPrevYearDataByItem).map(([k, v]: [string, any]) => `${k}: ${Object.keys(v || {}).length}개`).join(', '));
          }
        }
      } catch (e) {
        console.log('⚠️ 로컬 스토리지 읽기 실패, 상태 사용');
      }
      
      // 모든 아이템에 대해 차트 데이터 조회 및 예측 계산 수행
      const itemTypes: ('shoes' | 'hat' | 'bag' | 'other')[] = ['shoes', 'hat', 'bag', 'other'];
      const orderCapacityByItem: Record<string, any> = {};
      const forecastResultsByItem: Record<string, any[]> = {};
      
      console.log('🔄 모든 아이템에 대해 예측 계산 시작...');
      
      // 각 아이템에 대해 순차적으로 API 호출 및 계산
      for (const item of itemTypes) {
        // 해당 아이템의 차트 데이터 조회
        const itemChartData = await fetchChartDataForItem(item);
        
        if (itemChartData && itemChartData.length > 0) {
          // 해당 아이템의 차트 데이터로 예측 계산 (최신 전년 데이터 사용)
          const result = calculateForecastForItemWithData(item, itemChartData, latestPrevYearDataByItem);
          if (result) {
            orderCapacityByItem[item] = result.orderCapacity;
            forecastResultsByItem[item] = result.forecastResults;
            console.log(`✅ [${item}] 예측 계산 완료 - 발주가능: ${result.orderCapacity.orderCapacity}백만원`);
          }
        } else {
          console.log(`⚠️ [${item}] 차트 데이터가 없어 예측 계산을 건너뜁니다.`);
        }
      }
      
      // "전체(all)" 아이템에 대한 예측 결과 생성 (각 아이템 합산)
      if (Object.keys(forecastResultsByItem).length === 4) {
        const allForecastResults: any[] = [];
        const shoesResults = forecastResultsByItem['shoes'] || [];
        const hatResults = forecastResultsByItem['hat'] || [];
        const bagResults = forecastResultsByItem['bag'] || [];
        const otherResults = forecastResultsByItem['other'] || [];
        
        // 각 주차별로 합산
        for (let i = 0; i < shoesResults.length; i++) {
          const shoes = shoesResults[i] || {};
          const hat = hatResults[i] || {};
          const bag = bagResults[i] || {};
          const other = otherResults[i] || {};
          
          const totalStock = (shoes.totalStock || 0) + (hat.totalStock || 0) + (bag.totalStock || 0) + (other.totalStock || 0);
          const previousTotalStock = (shoes.previousTotalStock || 0) + (hat.previousTotalStock || 0) + (bag.previousTotalStock || 0) + (other.previousTotalStock || 0);
          const saleAmount1w = (shoes.saleAmount1w || 0) + (hat.saleAmount1w || 0) + (bag.saleAmount1w || 0) + (other.saleAmount1w || 0);
          const saleAmount = (shoes.saleAmount || 0) + (hat.saleAmount || 0) + (bag.saleAmount || 0) + (other.saleAmount || 0);
          const prevYearSale = (shoes.prevYearSale || 0) + (hat.prevYearSale || 0) + (bag.prevYearSale || 0) + (other.prevYearSale || 0);
          
          // 시즌별 재고 합산 (당년)
          const currentSeasonStock = (shoes.currentSeasonStock || 0) + (hat.currentSeasonStock || 0) + (bag.currentSeasonStock || 0) + (other.currentSeasonStock || 0);
          const nextSeasonStock = (shoes.nextSeasonStock || 0) + (hat.nextSeasonStock || 0) + (bag.nextSeasonStock || 0) + (other.nextSeasonStock || 0);
          const oldSeasonStock = (shoes.oldSeasonStock || 0) + (hat.oldSeasonStock || 0) + (bag.oldSeasonStock || 0) + (other.oldSeasonStock || 0);
          const stagnantStock = (shoes.stagnantStock || 0) + (hat.stagnantStock || 0) + (bag.stagnantStock || 0) + (other.stagnantStock || 0);
          
          // 시즌별 재고 합산 (전년)
          const previousCurrentSeasonStock = (shoes.previousCurrentSeasonStock || 0) + (hat.previousCurrentSeasonStock || 0) + (bag.previousCurrentSeasonStock || 0) + (other.previousCurrentSeasonStock || 0);
          const previousNextSeasonStock = (shoes.previousNextSeasonStock || 0) + (hat.previousNextSeasonStock || 0) + (bag.previousNextSeasonStock || 0) + (other.previousNextSeasonStock || 0);
          const previousOldSeasonStock = (shoes.previousOldSeasonStock || 0) + (hat.previousOldSeasonStock || 0) + (bag.previousOldSeasonStock || 0) + (other.previousOldSeasonStock || 0);
          const previousStagnantStock = (shoes.previousStagnantStock || 0) + (hat.previousStagnantStock || 0) + (bag.previousStagnantStock || 0) + (other.previousStagnantStock || 0);
          
          // 시즌별 비율 계산
          const currentSeasonRatio = totalStock > 0 ? (currentSeasonStock / totalStock * 100) : 25;
          const nextSeasonRatio = totalStock > 0 ? (nextSeasonStock / totalStock * 100) : 25;
          const oldSeasonRatio = totalStock > 0 ? (oldSeasonStock / totalStock * 100) : 25;
          const stagnantRatio = totalStock > 0 ? (stagnantStock / totalStock * 100) : 25;

          // 전체(ALL)는 단순 평균이 아니라 합산값 기준으로 주수를 계산해야 급격한 점프를 방지할 수 있음
          const aggregatedStockWeeks = saleAmount1w > 0 ? (totalStock / saleAmount1w) : 0;
          const aggregatedPreviousStockWeeks = prevYearSale > 0 ? (previousTotalStock / prevYearSale) : 0;

          const normalStock = totalStock - stagnantStock;
          const previousNormalStock = previousTotalStock - previousStagnantStock;

          const itemNormalWeeklySales = [shoes, hat, bag, other].reduce((sum, item) => {
            const itemTotalStock = Number(item.totalStock || 0);
            const itemStagnantStock = Number(item.stagnantStock || 0);
            const itemNormalStock = itemTotalStock - itemStagnantStock;
            const itemStockWeeksNormal = Number(item.stockWeeksNormal || 0);
            if (itemStockWeeksNormal <= 0) return sum;
            return sum + (itemNormalStock / itemStockWeeksNormal);
          }, 0);

          const itemPreviousNormalWeeklySales = [shoes, hat, bag, other].reduce((sum, item) => {
            const itemPreviousTotalStock = Number(item.previousTotalStock || 0);
            const itemPreviousStagnantStock = Number(item.previousStagnantStock || 0);
            const itemPreviousNormalStock = itemPreviousTotalStock - itemPreviousStagnantStock;
            const itemPreviousStockWeeksNormal = Number(item.previousStockWeeksNormal || 0);
            if (itemPreviousStockWeeksNormal <= 0) return sum;
            return sum + (itemPreviousNormalStock / itemPreviousStockWeeksNormal);
          }, 0);

          const aggregatedStockWeeksNormal = itemNormalWeeklySales > 0 ? (normalStock / itemNormalWeeklySales) : 0;
          const aggregatedPreviousStockWeeksNormal = itemPreviousNormalWeeklySales > 0 ? (previousNormalStock / itemPreviousNormalWeeklySales) : 0;
          
          allForecastResults.push({
            month: shoes.month,
            weekKey: shoes.weekKey,
            weekLabel: shoes.weekLabel,
            isActual: false,
            totalStock,
            saleAmount1w,
            saleAmount,
            incomingAmount: (shoes.incomingAmount || 0) + (hat.incomingAmount || 0) + (bag.incomingAmount || 0) + (other.incomingAmount || 0),
            previousTotalStock,
            prevYearSale,
            stockWeeks: aggregatedStockWeeks,
            stockWeeksNormal: aggregatedStockWeeksNormal,
            previousStockWeeks: aggregatedPreviousStockWeeks,
            previousStockWeeksNormal: aggregatedPreviousStockWeeksNormal,
            stockYOY: previousTotalStock > 0 ? Math.round((totalStock / previousTotalStock) * 100) : 0,
            saleYOY: prevYearSale > 0 ? Math.round((saleAmount1w / prevYearSale) * 100) : 0,
            // 시즌별 재고 (당년)
            currentSeasonStock,
            nextSeasonStock,
            oldSeasonStock,
            stagnantStock,
            // 시즌별 재고 (전년)
            previousCurrentSeasonStock,
            previousNextSeasonStock,
            previousOldSeasonStock,
            previousStagnantStock,
            // 시즌별 비율 (당년)
            currentSeasonRatio,
            nextSeasonRatio,
            oldSeasonRatio,
            stagnantRatio,
            // 시즌별 비율 (전년) - 전년도 같은 비율 적용
            previousCurrentSeasonRatio: previousTotalStock > 0 ? (previousCurrentSeasonStock / previousTotalStock * 100) : currentSeasonRatio,
            previousNextSeasonRatio: previousTotalStock > 0 ? (previousNextSeasonStock / previousTotalStock * 100) : nextSeasonRatio,
            previousOldSeasonRatio: previousTotalStock > 0 ? (previousOldSeasonStock / previousTotalStock * 100) : oldSeasonRatio,
            previousStagnantRatio: previousTotalStock > 0 ? (previousStagnantStock / previousTotalStock * 100) : stagnantRatio,
          });
        }
        
        forecastResultsByItem['all'] = allForecastResults;
        
        // 전체 발주가능금액도 합산
        const allOrderCapacity = {
          targetMonth: orderCapacityByItem['shoes']?.targetMonth || '',
          baseStockWeeks: 0,
          weeklyAvgSales: (orderCapacityByItem['shoes']?.weeklyAvgSales || 0) + (orderCapacityByItem['hat']?.weeklyAvgSales || 0) + (orderCapacityByItem['bag']?.weeklyAvgSales || 0) + (orderCapacityByItem['other']?.weeklyAvgSales || 0),
          nWeeksTotal: (orderCapacityByItem['shoes']?.nWeeksTotal || 0) + (orderCapacityByItem['hat']?.nWeeksTotal || 0) + (orderCapacityByItem['bag']?.nWeeksTotal || 0) + (orderCapacityByItem['other']?.nWeeksTotal || 0),
          targetStock: (orderCapacityByItem['shoes']?.targetStock || 0) + (orderCapacityByItem['hat']?.targetStock || 0) + (orderCapacityByItem['bag']?.targetStock || 0) + (orderCapacityByItem['other']?.targetStock || 0),
          currentForecastStock: (orderCapacityByItem['shoes']?.currentForecastStock || 0) + (orderCapacityByItem['hat']?.currentForecastStock || 0) + (orderCapacityByItem['bag']?.currentForecastStock || 0) + (orderCapacityByItem['other']?.currentForecastStock || 0),
          orderCapacity: (orderCapacityByItem['shoes']?.orderCapacity || 0) + (orderCapacityByItem['hat']?.orderCapacity || 0) + (orderCapacityByItem['bag']?.orderCapacity || 0) + (orderCapacityByItem['other']?.orderCapacity || 0),
          yoyRate: 100,
          weeksType,
          itemType: 'all',
        };
        orderCapacityByItem['all'] = allOrderCapacity;
        
        console.log(`✅ [all] 전체 예측 결과 생성 완료 - 발주가능: ${allOrderCapacity.orderCapacity}백만원`);
      }
      
      const dataToSave = {
        cacheVersion: WEEKLY_FORECAST_CACHE_VERSION,
        yoyRateExPurchase,
        yoyRatePurchase,
        baseStockWeeks,
        incomingAmounts,
        prevYearDataByItem, // 전년 동주차 데이터 (중분류별)
        orderCapacityByItem, // 아이템별 발주가능금액
        forecastResultsByItem, // 아이템별 예측 결과
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      setIsForecastReady(true);
      console.log('✅ 주차별 예측 설정 저장 완료 (모든 아이템)');
      console.log('📊 아이템별 발주가능금액:', Object.keys(orderCapacityByItem).map(k => `${k}: ${orderCapacityByItem[k]?.orderCapacity}백만원`).join(', '));
      
      // 현재 선택된 아이템에 대해 부모 컴포넌트에 전달
      // 'all'인 경우에도 'all' 키 사용 (이제 'all' 키에 합산 데이터가 있음)
      const currentItemKey = selectedItem;
      if (forecastResultsByItem[currentItemKey] && orderCapacityByItem[currentItemKey]) {
        onForecastCalculated(
          forecastResultsByItem[currentItemKey], 
          orderCapacityByItem[currentItemKey], 
          incomingAmounts,
          orderCapacityByItem, // 모든 아이템별 발주가능금액 전달
          forecastResultsByItem // 모든 아이템별 예측결과 전달
        );
      }
      
      alert('✅ 설정이 저장되었습니다. (모든 아이템 적용)');
    } catch (error) {
      console.error('주차별 예측 설정 저장 실패:', error);
      alert('설정 저장에 실패했습니다.');
    }
  };

  // 특정 아이템에 대한 예측 계산 함수 (차트 데이터를 파라미터로 받음)
  const calculateForecastForItemWithData = (
    targetItem: 'shoes' | 'hat' | 'bag' | 'other', 
    itemChartData: any[],
    prevYearDataByItemParam?: Record<string, Record<string, { sale: number; stock: number; weeks: number }>>
  ): { forecastResults: any[], orderCapacity: any } | null => {
    if (!itemChartData || itemChartData.length === 0) {
      console.log(`⚠️ [${targetItem}] 실적 데이터가 없어 예측 계산을 건너뜁니다.`);
      return null;
    }

    try {
      const currentYoyRate = yoyRateExPurchase[targetItem] || 100;
      const currentBaseWeeks = baseStockWeeks[targetItem] || 40;
      // 전달된 prevYearDataByItemParam이 있으면 사용, 없으면 상태 사용
      const dataSource = prevYearDataByItemParam || prevYearDataByItem;
      const itemPrevYearData = dataSource[targetItem] || {};
      
      console.log(`📊 [${targetItem}] 전년 데이터 사용: ${Object.keys(itemPrevYearData).length}개 주차`);

      // 최근 실적 데이터에서 주간 평균 매출 계산
      const latestSaleData = itemChartData[itemChartData.length - 1];
      const nWeeksSale = latestSaleData?.saleAmount || latestSaleData?.tagSaleExcludePurchase || 0;
      
      const nWeeks = weeksType === '4weeks' ? 4 : weeksType === '8weeks' ? 8 : 12;
      const weeklyAvgSales = nWeeks > 0 ? Math.round(nWeeksSale / nWeeks) : 0;
      const adjustedWeeklySales = Math.round(weeklyAvgSales * (currentYoyRate / 100));

      const latestData = itemChartData[itemChartData.length - 1];
      const currentStock = latestData?.totalStock || 0;
      
      // 실적 데이터의 마지막 값에서 시즌별 비율 가져오기 (예측 구간에 적용)
      const latestSeasonRatios = {
        currentSeasonRatio: latestData?.currentSeasonRatio || (latestData?.currentSeasonStock / (latestData?.totalStock || 1) * 100) || 25,
        nextSeasonRatio: latestData?.nextSeasonRatio || (latestData?.nextSeasonStock / (latestData?.totalStock || 1) * 100) || 25,
        oldSeasonRatio: latestData?.oldSeasonRatio || (latestData?.oldSeasonStock / (latestData?.totalStock || 1) * 100) || 25,
        stagnantRatio: latestData?.stagnantRatio || (latestData?.stagnantStock / (latestData?.totalStock || 1) * 100) || 25,
      };

      // 예측 결과 계산
      let runningStock = currentStock;
      
      let forecastResults = forecastWeeks.map((week, index) => {
        const incomingForWeek = incomingAmounts.find(ia => ia.weekKey === week.weekKey);
        const incomingAmountRaw = incomingForWeek ? (incomingForWeek[targetItem] || 0) : 0;
        const incomingAmount = Math.round(incomingAmountRaw / 1000000);
        
        const prevData = itemPrevYearData[week.weekKey] || { sale: 0, stock: 0, weeks: 0 };
        const prevYearSale = prevData.sale;
        const prevYearStock = prevData.stock;
        const prevYearWeeks = prevData.weeks;
        const weekSale = prevYearSale > 0 
          ? Math.round(prevYearSale * (currentYoyRate / 100)) 
          : adjustedWeeklySales;
        
        const expectedStock = Math.round(runningStock + incomingAmount - weekSale);
        runningStock = Math.max(0, expectedStock);
        
        const expectedWeeks = adjustedWeeklySales > 0 ? runningStock / adjustedWeeklySales : 0;
        const stockYOY = prevYearStock > 0 ? Math.round((runningStock / prevYearStock) * 100) : 0;
        const saleYOY = prevYearSale > 0 ? Math.round((weekSale / prevYearSale) * 100) : 0;
        
        // 시즌별 재고 계산 (실적 비율 유지)
        const currentSeasonStock = Math.round(runningStock * latestSeasonRatios.currentSeasonRatio / 100);
        const nextSeasonStock = Math.round(runningStock * latestSeasonRatios.nextSeasonRatio / 100);
        const oldSeasonStock = Math.round(runningStock * latestSeasonRatios.oldSeasonRatio / 100);
        const stagnantStock = Math.round(runningStock * latestSeasonRatios.stagnantRatio / 100);
        
        // 전년 시즌별 재고 계산 (전년 전체 재고 * 실적 비율)
        const previousCurrentSeasonStock = Math.round(prevYearStock * latestSeasonRatios.currentSeasonRatio / 100);
        const previousNextSeasonStock = Math.round(prevYearStock * latestSeasonRatios.nextSeasonRatio / 100);
        const previousOldSeasonStock = Math.round(prevYearStock * latestSeasonRatios.oldSeasonRatio / 100);
        const previousStagnantStock = Math.round(prevYearStock * latestSeasonRatios.stagnantRatio / 100);

        // 정상재고 (전체 - 정체) 계산
        const normalStock = runningStock - stagnantStock;
        const prevNormalStock = prevYearStock - previousStagnantStock;
        
        // 정상재고 재고주수 계산
        const normalWeeklySales = adjustedWeeklySales * (1 - latestSeasonRatios.stagnantRatio / 100);
        const stockWeeksNormal = normalWeeklySales > 0 ? normalStock / normalWeeklySales : 0;
        const previousStockWeeksNormal = normalWeeklySales > 0 ? prevNormalStock / normalWeeklySales : 0;

        return {
          month: week.weekLabel,
          weekKey: week.weekKey,
          weekLabel: week.weekLabel,
          isActual: false,
          totalStock: runningStock,
          stockWeeks: Math.max(0, expectedWeeks),
          stockWeeksNormal: Math.max(0, stockWeeksNormal),
          previousStockWeeksNormal: Math.max(0, previousStockWeeksNormal),
          saleAmount1w: weekSale,
          saleAmount: weekSale,
          prevSaleAmount: prevYearSale,
          incomingAmount,
          // 전년 동주차 데이터
          previousTotalStock: prevYearStock,
          previousStockWeeks: prevYearWeeks,
          prevYearSale,
          // 전년 시즌별 재고 (전년 전체 재고 * 실적 비율)
          previousCurrentSeasonStock,
          previousNextSeasonStock,
          previousOldSeasonStock,
          previousStagnantStock,
          // YOY
          stockYOY,
          saleYOY,
          // 시즌별 재고 (예측)
          currentSeasonStock,
          nextSeasonStock,
          oldSeasonStock,
          stagnantStock,
          // 시즌별 비율 (실적 비율 유지)
          currentSeasonRatio: latestSeasonRatios.currentSeasonRatio,
          nextSeasonRatio: latestSeasonRatios.nextSeasonRatio,
          oldSeasonRatio: latestSeasonRatios.oldSeasonRatio,
          stagnantRatio: latestSeasonRatios.stagnantRatio,
          // 전년 시즌별 비율 (전년도 같은 비율 적용)
          previousCurrentSeasonRatio: latestSeasonRatios.currentSeasonRatio,
          previousNextSeasonRatio: latestSeasonRatios.nextSeasonRatio,
          previousOldSeasonRatio: latestSeasonRatios.oldSeasonRatio,
          previousStagnantRatio: latestSeasonRatios.stagnantRatio,
        };
      });
      const recentWeeklySales = getRecentWeeklySalesHistory(itemChartData, nWeeks);
      forecastResults = applyRollingSalesAmount(forecastResults, nWeeks, recentWeeklySales);

      const lastForecastStock = forecastResults.length > 0 
        ? forecastResults[forecastResults.length - 1].totalStock 
        : 0;

      const last4WeeksSales = forecastResults.length >= 12
        ? [forecastResults[8].saleAmount1w, forecastResults[9].saleAmount1w, forecastResults[10].saleAmount1w, forecastResults[11].saleAmount1w]
        : [];
      
      const nWeeksTotalFor12thWeek = last4WeeksSales.length === 4
        ? last4WeeksSales.reduce((sum, sale) => sum + sale, 0)
        : Math.round(adjustedWeeklySales * nWeeks);
      
      const weeklyAvgSalesFor12thWeek = last4WeeksSales.length === 4
        ? Math.round(nWeeksTotalFor12thWeek / 4)
        : adjustedWeeklySales;

      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + 3);
      const targetMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

      const targetStockFor12thWeek = Math.round(currentBaseWeeks * weeklyAvgSalesFor12thWeek);
      const orderCapacityAmount = targetStockFor12thWeek - lastForecastStock;

      const orderCapacity = {
        targetMonth,
        baseStockWeeks: currentBaseWeeks,
        weeklyAvgSales: weeklyAvgSalesFor12thWeek,
        nWeeksTotal: nWeeksTotalFor12thWeek,
        targetStock: targetStockFor12thWeek,
        currentForecastStock: lastForecastStock,
        orderCapacity: orderCapacityAmount,
        yoyRate: currentYoyRate,
        weeksType,
        itemType: targetItem,
      };
      
      return { forecastResults, orderCapacity };
    } catch (error) {
      console.error(`❌ [${targetItem}] 예측 계산 실패:`, error);
      return null;
    }
  };

  // 특정 아이템에 대한 예측 계산 함수 (현재 actualData 사용 - 호환성 유지)
  const calculateForecastForItem = (targetItem: 'shoes' | 'hat' | 'bag' | 'other'): { forecastResults: any[], orderCapacity: any } | null => {
    return calculateForecastForItemWithData(targetItem, actualData);
  };

  // 예측 계산 함수 (현재 선택된 아이템에 대해)
  const calculateForecast = () => {
    if (!actualData || actualData.length === 0) {
      console.log('⚠️ 실적 데이터가 없어 예측 계산을 건너뜁니다.');
      return;
    }

    try {
      // 현재 선택된 아이템의 YOY 비율과 기준 재고주수 ('all'인 경우 shoes 기준)
      const itemKey = selectedItem === 'all' ? 'shoes' : selectedItem;
      const currentYoyRate = yoyRateExPurchase[itemKey] || 100;
      const currentBaseWeeks = baseStockWeeks[itemKey] || 40;

      // 최근 실적 데이터에서 주간 평균 매출 계산
      // saleAmount는 이미 N주 합계이므로, 가장 최근 데이터의 saleAmount / N = 주간평균
      const latestSaleData = actualData[actualData.length - 1];
      const nWeeksSale = latestSaleData?.saleAmount || latestSaleData?.tagSaleExcludePurchase || 0;
      
      // weeksType에 따라 N 결정 (4weeks, 8weeks, 12weeks)
      const nWeeks = weeksType === '4weeks' ? 4 : weeksType === '8weeks' ? 8 : 12;
      const weeklyAvgSales = nWeeks > 0 ? Math.round(nWeeksSale / nWeeks) : 0;
      
      console.log(`📊 매출 계산: ${nWeeksSale}백만원 (${nWeeks}주 합계) / ${nWeeks} = ${weeklyAvgSales}백만원 (주간평균)`);
      
      // YOY 적용한 예상 주간 매출
      const adjustedWeeklySales = Math.round(weeklyAvgSales * (currentYoyRate / 100));
      
      // N주 매출 합계 (YOY 적용)
      const nWeeksTotal = Math.round(adjustedWeeklySales * nWeeks);

      // 3개월 후 목표 월 계산 (12주 후)
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + 3);
      const targetMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

      // 목표 재고 = 기준 재고주수 × 주간 평균 매출
      const targetStock = Math.round(currentBaseWeeks * adjustedWeeklySales);

      // 현재 재고 (최신 데이터)
      const latestData = actualData[actualData.length - 1];
      const currentStock = latestData?.totalStock || 0;

      // 가장 최근 실적에서 시즌별 재고 비율 계산 (예측 구간에 적용)
      const latestSeasonRatios = {
        currentSeasonRatio: latestData?.currentSeasonRatio || (latestData?.currentSeasonStock / (latestData?.totalStock || 1) * 100) || 0,
        nextSeasonRatio: latestData?.nextSeasonRatio || (latestData?.nextSeasonStock / (latestData?.totalStock || 1) * 100) || 0,
        oldSeasonRatio: latestData?.oldSeasonRatio || (latestData?.oldSeasonStock / (latestData?.totalStock || 1) * 100) || 0,
        stagnantRatio: latestData?.stagnantRatio || (latestData?.stagnantStock / (latestData?.totalStock || 1) * 100) || 0,
      };
      
      // 전년 시즌별 재고 비율 (가장 최근 실적의 전년 비율 사용)
      const prevSeasonRatios = {
        currentSeasonRatio: latestData?.previousCurrentSeasonRatio || (latestData?.previousCurrentSeasonStock / (latestData?.previousTotalStock || 1) * 100) || 0,
        nextSeasonRatio: latestData?.previousNextSeasonRatio || (latestData?.previousNextSeasonStock / (latestData?.previousTotalStock || 1) * 100) || 0,
        oldSeasonRatio: latestData?.previousOldSeasonRatio || (latestData?.previousOldSeasonStock / (latestData?.previousTotalStock || 1) * 100) || 0,
        stagnantRatio: latestData?.previousStagnantRatio || (latestData?.previousStagnantStock / (latestData?.previousTotalStock || 1) * 100) || 0,
      };
      
      // 가장 최근 실적에서 시즌별 1주 매출 비율 계산 (예측 구간에 적용)
      // 1주 매출 데이터가 있으면 사용, 없으면 N주 매출 사용
      const totalSale1w = (latestData?.currentSeasonSale1w || 0) + (latestData?.nextSeasonSale1w || 0) + (latestData?.oldSeasonSale1w || 0) + (latestData?.stagnantSale1w || 0);
      const totalSaleNw = (latestData?.currentSeasonSale || 0) + (latestData?.nextSeasonSale || 0) + (latestData?.oldSeasonSale || 0) + (latestData?.stagnantSale || 0);
      const totalSale = totalSale1w > 0 ? totalSale1w : totalSaleNw;
      
      const latestSaleRatios = {
        currentSeasonRatio: totalSale > 0 ? (((latestData?.currentSeasonSale1w || latestData?.currentSeasonSale || 0) / totalSale) * 100) : 25,
        nextSeasonRatio: totalSale > 0 ? (((latestData?.nextSeasonSale1w || latestData?.nextSeasonSale || 0) / totalSale) * 100) : 25,
        oldSeasonRatio: totalSale > 0 ? (((latestData?.oldSeasonSale1w || latestData?.oldSeasonSale || 0) / totalSale) * 100) : 25,
        stagnantRatio: totalSale > 0 ? (((latestData?.stagnantSale1w || latestData?.stagnantSale || 0) / totalSale) * 100) : 25,
      };
      
      // 전년 시즌별 매출 비율
      const prevTotalSale = (latestData?.previousCurrentSeasonSale || 0) + (latestData?.previousNextSeasonSale || 0) + (latestData?.previousOldSeasonSale || 0) + (latestData?.previousStagnantSale || 0);
      const prevSaleRatios = {
        currentSeasonRatio: prevTotalSale > 0 ? ((latestData?.previousCurrentSeasonSale || 0) / prevTotalSale * 100) : 25,
        nextSeasonRatio: prevTotalSale > 0 ? ((latestData?.previousNextSeasonSale || 0) / prevTotalSale * 100) : 25,
        oldSeasonRatio: prevTotalSale > 0 ? ((latestData?.previousOldSeasonSale || 0) / prevTotalSale * 100) : 25,
        stagnantRatio: prevTotalSale > 0 ? ((latestData?.previousStagnantSale || 0) / prevTotalSale * 100) : 25,
      };

      // 예측 결과 (미래 주차 데이터) - 주차별로 순차 계산
      let runningStock = currentStock; // 누적 재고 계산용
      
      let forecastResults = forecastWeeks.map((week, index) => {
        const incomingForWeek = incomingAmounts.find(ia => ia.weekKey === week.weekKey);
        
        // 입고금액: 원 단위 → 백만원 단위로 변환
        const incomingAmountRaw = incomingForWeek 
          ? (selectedItem === 'all' 
              ? (incomingForWeek.shoes || 0) + (incomingForWeek.hat || 0) + (incomingForWeek.bag || 0) + (incomingForWeek.other || 0)
              : (incomingForWeek[selectedItem] || 0)) 
          : 0;
        const incomingAmount = Math.round(incomingAmountRaw / 1000000); // 원 → 백만원
        
        // 해당 주차 예상 매출 = 전년 동주차 매출 × YOY%
        const prevData = prevYearData[week.weekKey] || { sale: 0, stock: 0, weeks: 0 };
        const prevYearSale = prevData.sale;
        const prevYearStock = prevData.stock;
        const prevYearWeeks = prevData.weeks;
        const weekSale = prevYearSale > 0 
          ? Math.round(prevYearSale * (currentYoyRate / 100)) 
          : adjustedWeeklySales; // 전년 데이터 없으면 주간평균 사용
        
        // 이번 주차 기말재고 = 이전 주차 기말재고 + 입고금액 - 택매출액
        const expectedStock = Math.round(runningStock + incomingAmount - weekSale);
        runningStock = Math.max(0, expectedStock); // 다음 주차 계산을 위해 업데이트
        
        // 예상 재고주수 = 예상재고 / 주간평균매출
        const expectedWeeks = adjustedWeeklySales > 0 ? runningStock / adjustedWeeklySales : 0;

        // 당년 시즌별 재고 분배 (최근 실적의 비율 적용)
        const currentSeasonStock = Math.round(runningStock * latestSeasonRatios.currentSeasonRatio / 100);
        const nextSeasonStock = Math.round(runningStock * latestSeasonRatios.nextSeasonRatio / 100);
        const oldSeasonStock = Math.round(runningStock * latestSeasonRatios.oldSeasonRatio / 100);
        const stagnantStock = Math.round(runningStock * latestSeasonRatios.stagnantRatio / 100);
        
        // 전년 동주차 재고 (API에서 조회한 데이터 사용)
        
        // 전년 시즌별 재고 분배
        const previousCurrentSeasonStock = Math.round(prevYearStock * prevSeasonRatios.currentSeasonRatio / 100);
        const previousNextSeasonStock = Math.round(prevYearStock * prevSeasonRatios.nextSeasonRatio / 100);
        const previousOldSeasonStock = Math.round(prevYearStock * prevSeasonRatios.oldSeasonRatio / 100);
        const previousStagnantStock = Math.round(prevYearStock * prevSeasonRatios.stagnantRatio / 100);

        console.log(`📅 ${week.weekLabel}: 전주재고=${index === 0 ? currentStock : '이전값'}, 입고=${incomingAmount}, 매출=${weekSale}, 기말재고=${runningStock}, 전년재고=${prevYearStock}, 전년매출=${prevYearSale}`);

        // 정상재고 재고주수 계산 (정체재고 제외)
        const stockWeeksNormal = Math.round(expectedWeeks * (1 - latestSeasonRatios.stagnantRatio / 100) * 10) / 10;
        const previousStockWeeksNormal = Math.round(prevYearWeeks * (1 - prevSeasonRatios.stagnantRatio / 100) * 10) / 10;

        // YOY 계산
        const stockYOY = prevYearStock > 0 ? Math.round((runningStock / prevYearStock) * 100) : 0;
        const saleYOY = prevYearSale > 0 ? Math.round((weekSale / prevYearSale) * 100) : 0;

        // 당년 시즌별 매출 계산 (예상 주간매출을 비율로 분배)
        const currentSeasonSale = Math.round(weekSale * latestSaleRatios.currentSeasonRatio / 100);
        const nextSeasonSale = Math.round(weekSale * latestSaleRatios.nextSeasonRatio / 100);
        const oldSeasonSale = Math.round(weekSale * latestSaleRatios.oldSeasonRatio / 100);
        const stagnantSale = Math.round(weekSale * latestSaleRatios.stagnantRatio / 100);
        
        // 전년 시즌별 매출 계산 (전년 매출을 비율로 분배)
        const previousCurrentSeasonSale = Math.round(prevYearSale * prevSaleRatios.currentSeasonRatio / 100);
        const previousNextSeasonSale = Math.round(prevYearSale * prevSaleRatios.nextSeasonRatio / 100);
        const previousOldSeasonSale = Math.round(prevYearSale * prevSaleRatios.oldSeasonRatio / 100);
        const previousStagnantSale = Math.round(prevYearSale * prevSaleRatios.stagnantRatio / 100);

        return {
          month: week.weekLabel,
          weekKey: week.weekKey,
          weekLabel: week.weekLabel,
          isActual: false,
          totalStock: runningStock,
          stockWeeks: Math.max(0, expectedWeeks),
          stockWeeksNormal: Math.max(0, stockWeeksNormal), // 정상재고 재고주수
          saleAmount1w: weekSale, // 해당 주차 예상 매출 (YOY 적용된 주간평균)
          saleAmount: weekSale, // 차트용
          prevSaleAmount: prevYearSale, // 차트용
          incomingAmount, // 백만원 단위 (입고예정금액)
          // 당년 시즌별 재고 (차트 막대 표시용)
          currentSeasonStock,
          nextSeasonStock,
          oldSeasonStock,
          stagnantStock,
          currentSeasonRatio: latestSeasonRatios.currentSeasonRatio,
          nextSeasonRatio: latestSeasonRatios.nextSeasonRatio,
          oldSeasonRatio: latestSeasonRatios.oldSeasonRatio,
          stagnantRatio: latestSeasonRatios.stagnantRatio,
          // 당년 시즌별 매출 (차트 막대 표시용)
          currentSeasonSale,
          nextSeasonSale,
          oldSeasonSale,
          stagnantSale,
          currentSeasonSaleRatio: latestSaleRatios.currentSeasonRatio,
          nextSeasonSaleRatio: latestSaleRatios.nextSeasonRatio,
          oldSeasonSaleRatio: latestSaleRatios.oldSeasonRatio,
          stagnantSaleRatio: latestSaleRatios.stagnantRatio,
          // 전년 동주차 시즌별 재고
          previousCurrentSeasonStock,
          previousNextSeasonStock,
          previousOldSeasonStock,
          previousStagnantStock,
          previousTotalStock: prevYearStock,
          previousStockWeeks: prevYearWeeks,
          previousStockWeeksNormal: Math.max(0, previousStockWeeksNormal), // 전년 정상재고 재고주수
          // 전년 동주차 시즌별 매출
          previousCurrentSeasonSale,
          previousNextSeasonSale,
          previousOldSeasonSale,
          previousStagnantSale,
          // 전년 비율 (차트용)
          previousCurrentSeasonRatio: prevSeasonRatios.currentSeasonRatio,
          previousNextSeasonRatio: prevSeasonRatios.nextSeasonRatio,
          previousOldSeasonRatio: prevSeasonRatios.oldSeasonRatio,
          previousStagnantRatio: prevSeasonRatios.stagnantRatio,
          // YOY
          stockYOY,
          saleYOY,
          prevYearSale, // 전년 동주차 매출
        };
      });
      const recentWeeklySales = getRecentWeeklySalesHistory(actualData, nWeeks);
      forecastResults = applyRollingSalesAmount(forecastResults, nWeeks, recentWeeklySales);

      // 12주차(마지막 예측 주차)의 예상 재고를 사용
      const lastForecastStock = forecastResults.length > 0 
        ? forecastResults[forecastResults.length - 1].totalStock 
        : 0;

      // 12주차 기준 최근 4주(9, 10, 11, 12주차) 평균 매출 계산
      const last4WeeksSales = forecastResults.length >= 12
        ? [
            forecastResults[8].saleAmount1w,  // 9주차
            forecastResults[9].saleAmount1w,  // 10주차
            forecastResults[10].saleAmount1w, // 11주차
            forecastResults[11].saleAmount1w, // 12주차
          ]
        : [];
      
      console.log('📊 12주차 기준 최근 4주 매출:', last4WeeksSales);
      console.log('📊 9주차 매출:', forecastResults[8]?.saleAmount1w, forecastResults[8]?.weekLabel);
      console.log('📊 10주차 매출:', forecastResults[9]?.saleAmount1w, forecastResults[9]?.weekLabel);
      console.log('📊 11주차 매출:', forecastResults[10]?.saleAmount1w, forecastResults[10]?.weekLabel);
      console.log('📊 12주차 매출:', forecastResults[11]?.saleAmount1w, forecastResults[11]?.weekLabel);
      
      const nWeeksTotalFor12thWeek = last4WeeksSales.length === 4
        ? last4WeeksSales.reduce((sum, sale) => sum + sale, 0)
        : nWeeksTotal; // fallback
      
      console.log('📊 12주차 기준 4주 합계:', nWeeksTotalFor12thWeek);
      
      const weeklyAvgSalesFor12thWeek = last4WeeksSales.length === 4
        ? Math.round(nWeeksTotalFor12thWeek / 4)
        : adjustedWeeklySales; // fallback
      
      console.log('📊 12주차 기준 주간평균:', weeklyAvgSalesFor12thWeek);

      // 목표 재고 = 기준 재고주수 × 12주차 기준 주간 평균 매출
      const targetStockFor12thWeek = Math.round(currentBaseWeeks * weeklyAvgSalesFor12thWeek);

      // 발주가능 금액 = 목표재고 - 예상재고(12주차)
      const orderCapacityAmount = targetStockFor12thWeek - lastForecastStock;

      const orderCapacity: OrderCapacity = {
        targetMonth,
        baseStockWeeks: currentBaseWeeks,
        weeklyAvgSales: weeklyAvgSalesFor12thWeek,
        nWeeksTotal: nWeeksTotalFor12thWeek,
        targetStock: targetStockFor12thWeek,
        currentForecastStock: lastForecastStock, // 12주차 예상재고
        orderCapacity: orderCapacityAmount,
        yoyRate: currentYoyRate,
        weeksType,
      };

      console.log('📊 주차별 예측 계산 결과:', orderCapacity);
      console.log(`📊 12주차 예상재고: ${lastForecastStock}`);

      // 부모 컴포넌트로 결과 전달
      onForecastCalculated(forecastResults, orderCapacity, incomingAmounts);
      
    } catch (error) {
      console.error('❌ 예측 계산 실패:', error);
    }
  };

  // 저장된 설정으로 자동 예측 실행 (전년 매출 데이터 변경 시에도 재계산)
  // 무한 루프 방지를 위해 actualData 배열 길이와 prevYearData 키 개수를 비교
  const prevYearDataKeyCount = Object.keys(prevYearData).length;
  const actualDataLength = actualData?.length || 0;
  
  useEffect(() => {
    // actualData가 없거나 이전과 동일하면 스킵
    if (!isForecastReady || !actualData || actualData.length === 0) {
      return;
    }

    // 전체(all)는 아이템 합산 전용 로직(saveToLocalStorage) 결과를 사용한다.
    // 여기서 단일 계산 로직을 다시 태우면 예측주수가 비정상적으로 튈 수 있음.
    if (selectedItem === 'all') {
      return;
    }
    
    // 이전과 동일한 데이터면 재계산 스킵 (무한 루프 방지)
    if (prevActualDataLengthRef.current === actualDataLength && actualDataLength > 0) {
      // prevYearData가 변경된 경우에만 재계산 (키 개수로 비교)
      // 하지만 키 개수가 0인 경우에는 처음 로딩이므로 계속 진행
      if (prevYearDataKeyCount === 0) {
        console.log('⏭️ 전년 데이터 없음, 예측 계산 스킵');
        return;
      }
    }
    
    prevActualDataLengthRef.current = actualDataLength;
    calculateForecast();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForecastReady, actualDataLength, selectedItem, weeksType, prevYearDataKeyCount]);

  // prevYearDataByItem 변경 시 자동 저장
  useEffect(() => {
    const totalWeeks = Object.values(prevYearDataByItem).reduce((sum, data) => sum + Object.keys(data || {}).length, 0);
    if (totalWeeks > 0) {
      try {
        const savedData = localStorage.getItem(storageKey);
        const parsed = savedData ? JSON.parse(savedData) : null;
        const existing = hasCurrentWeeklyForecastCacheVersion(parsed) ? parsed : {};
        const dataToSave = {
          ...existing,
          cacheVersion: WEEKLY_FORECAST_CACHE_VERSION,
          prevYearDataByItem,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        console.log('✅ 전년 동주차 데이터 자동 저장 완료 (중분류별):', totalWeeks, '개 주차');
      } catch (error) {
        console.error('❌ 전년 데이터 저장 실패:', error);
      }
    }
  }, [prevYearDataByItem, storageKey]);

  // 전년 동주차 매출 조회 함수 (모든 중분류 병렬 조회)
  const loadPrevYearSales = async () => {
    if (forecastWeeks.length === 0) return;
    
    setIsLoadingPrevSales(true);
    try {
      const weekKeys = forecastWeeks.map(w => w.weekKey).join(',');
      const itemTypes: ('shoes' | 'hat' | 'bag' | 'other')[] = ['shoes', 'hat', 'bag', 'other'];
      
      console.log(`📊 전년 동주차 매출 조회 (모든 중분류): ${weekKeys}`);
      
      // 모든 중분류에 대해 병렬 조회
      const results = await Promise.all(
        itemTypes.map(async (item) => {
          try {
            const response = await fetch(`/api/weekly-prev-year-sales?brandCode=${brandCode}&weeks=${weekKeys}&selectedItem=${item}`);
            const result = await response.json();
            return { item, data: result.success ? result.data : {} };
          } catch (error) {
            console.error(`❌ ${item} 전년 데이터 조회 실패:`, error);
            return { item, data: {} };
          }
        })
      );
      
      // 중분류별로 데이터 병합
      const newPrevYearDataByItem: Record<string, Record<string, { sale: number; stock: number; weeks: number }>> = {
        shoes: {},
        hat: {},
        bag: {},
        other: {},
      };
      
      results.forEach(({ item, data }) => {
        newPrevYearDataByItem[item] = data;
      });
      
      setPrevYearDataByItem(newPrevYearDataByItem);
      console.log('✅ 전년 동주차 데이터 조회 성공 (모든 중분류):', 
        Object.entries(newPrevYearDataByItem).map(([k, v]) => `${k}: ${Object.keys(v).length}개`).join(', ')
      );
    } catch (error) {
      console.error('❌ 전년 동주차 매출 조회 실패:', error);
    } finally {
      setIsLoadingPrevSales(false);
    }
  };

  // 주차별 입고예정금액 자동 조회 (전년 매출도 함께 조회)
  const handleLoadIncomingAmounts = async () => {
    if (forecastWeeks.length === 0) return;

    setIsLoadingIncoming(true);
    try {
      const startWeek = forecastWeeks[0].weekKey;
      const endWeek = forecastWeeks[forecastWeeks.length - 1].weekKey;

      console.log(`📦 주차별 입고예정금액 조회: ${startWeek} ~ ${endWeek}`);
      
      // 입고예정금액과 전년 매출 동시 조회
      const [data] = await Promise.all([
        fetchWeeklyIncomingAmounts(brandCode, startWeek, endWeek),
        loadPrevYearSales(), // 전년 동주차 매출도 함께 조회
      ]);

      // 기존 incomingAmounts 업데이트
      const updated = incomingAmounts.map((item) => {
        const found = data.find((d: WeeklyIncomingAmountData) => d.weekKey === item.weekKey);
        if (found) {
          return {
            weekKey: item.weekKey,
            weekLabel: item.weekLabel,
            shoes: found.shoes || 0,
            hat: found.hat || 0,
            bag: found.bag || 0,
            other: found.other || 0,
          };
        }
        return item;
      });

      setIncomingAmounts(updated);
      
      // 콜백 호출
      if (onIncomingAmountsLoaded) {
        onIncomingAmountsLoaded(updated);
      }

      console.log('✅ 주차별 입고예정금액 조회 성공:', updated);
      alert('✅ 입고예정금액을 성공적으로 불러왔습니다.');
    } catch (error) {
      console.error('❌ 주차별 입고예정금액 조회 실패:', error);
      alert('❌ 입고예정금액 조회에 실패했습니다.');
    } finally {
      setIsLoadingIncoming(false);
    }
  };

  // 입고예정금액 수정
  const handleIncomingAmountChange = (weekKey: string, item: keyof ItemYoyRate, value: number) => {
    setIncomingAmounts(prev => prev.map(w => 
      w.weekKey === weekKey ? { ...w, [item]: value } : w
    ));
  };

  // 숫자 포맷팅 (백만원 단위)
  const formatMillion = (value: number) => Math.round(value / 1000000);

  return (
    <Card className="border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
      <CardContent className="p-4">
        {/* 헤더 */}
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">📊</span>
            <span className="font-bold text-slate-900">
              {brandName} 재고 예측 설정
            </span>
            <span className="text-sm text-slate-500">
              ({selectedItem === 'all' ? '전체' : selectedItem === 'shoes' ? '신발' : selectedItem === 'hat' ? '모자' : selectedItem === 'bag' ? '가방' : '기타ACC'})
            </span>
            {isForecastReady && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                ✓ 설정완료
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">
              {isExpanded ? '접기' : '펼치기'}
            </span>
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>

        {/* 확장 컨텐츠 */}
        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* 중분류별 매출액 성장률 YOY */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
              <div className="text-sm font-semibold text-green-800 mb-2">
                중분류별 매출액 성장률 YOY:
              </div>
              <div className="grid grid-cols-4 gap-4">
                {(['shoes', 'hat', 'bag', 'other'] as const).map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 w-12">
                      {item === 'shoes' ? '신발' : item === 'hat' ? '모자' : item === 'bag' ? '가방' : '기타ACC'}:
                    </span>
                    <Input
                      type="number"
                      value={yoyRateExPurchase[item]}
                      onChange={(e) => setYoyRateExPurchase(prev => ({ ...prev, [item]: Number(e.target.value) }))}
                      className="w-20 h-8 text-center"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 중분류별 기준재고주수 */}
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-3 border border-blue-200">
              <div className="text-sm font-semibold text-blue-800 mb-2">
                중분류별 기준재고주수:
              </div>
              <div className="grid grid-cols-4 gap-4">
                {(['shoes', 'hat', 'bag', 'other'] as const).map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 w-12">
                      {item === 'shoes' ? '신발' : item === 'hat' ? '모자' : item === 'bag' ? '가방' : '기타ACC'}:
                    </span>
                    <Input
                      type="number"
                      value={baseStockWeeks[item]}
                      onChange={(e) => setBaseStockWeeks(prev => ({ ...prev, [item]: Number(e.target.value) }))}
                      className="w-20 h-8 text-center"
                    />
                    <span className="text-xs text-slate-500">주</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 입고예정금액 자동 조회 버튼 */}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleLoadIncomingAmounts}
                disabled={isLoadingIncoming}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoadingIncoming ? '조회 중...' : '📥 입고예정금액 불러오기'}
              </Button>
              <span className="text-xs text-slate-500">
                (입고예정금액 및 전년 동주차 데이터 조회)
              </span>
            </div>

            {/* 주차별 중분류별 입력 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">주차</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-700">신발 (백만원)</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-700">모자 (백만원)</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-700">가방 (백만원)</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-700">기타ACC (백만원)</th>
                  </tr>
                </thead>
                <tbody>
                  {incomingAmounts.map((row) => (
                    <tr key={row.weekKey} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-2 font-medium text-slate-700">
                        {row.weekKey}
                      </td>
                      {(['shoes', 'hat', 'bag', 'other'] as const).map((item) => (
                        <td key={item} className="py-2 px-2">
                          <Input
                            type="number"
                            value={formatMillion(row[item])}
                            onChange={(e) => handleIncomingAmountChange(row.weekKey, item, Number(e.target.value) * 1000000)}
                            className="w-full h-8 text-center"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 저장 버튼 */}
            <div className="flex justify-end gap-2">
              <Button
                onClick={saveToLocalStorage}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                💾 설정 저장
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
