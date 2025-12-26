'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fetchWeeklyIncomingAmounts, WeeklyIncomingAmountData } from '@/lib/api';
import { OrderCapacity } from '@/lib/forecast-types';

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
  brandCode: string;
  brandName: string;
  currentWeek: string; // '2025-51' 형식
  selectedItem: 'all' | 'shoes' | 'hat' | 'bag' | 'other';
  actualData: any[]; // 실적 차트 데이터
  weeksType: '4weeks' | '8weeks' | '12weeks';
  onIncomingAmountsLoaded?: (data: WeeklyItemIncomingAmount[]) => void;
  onForecastCalculated: (forecastResults: any[], orderCapacity: OrderCapacity | null, incomingAmounts?: any[]) => void;
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

export default function WeeklyForecastInputPanel({
  brandCode,
  brandName,
  currentWeek,
  selectedItem,
  actualData,
  weeksType,
  onIncomingAmountsLoaded,
  onForecastCalculated,
}: WeeklyForecastInputPanelProps) {
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
  const [prevYearData, setPrevYearData] = useState<Record<string, { sale: number; stock: number; weeks: number }>>({}); // 전년 동주차 데이터
  const [isLoadingPrevSales, setIsLoadingPrevSales] = useState(false);

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

  // 예측 계산 수행 및 저장
  const saveToLocalStorage = () => {
    try {
      const dataToSave = {
        yoyRateExPurchase,
        yoyRatePurchase,
        baseStockWeeks,
        incomingAmounts,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      setIsForecastReady(true);
      console.log('✅ 주차별 예측 설정 저장 완료');
      
      // 예측 계산 수행
      calculateForecast();
      
      alert('✅ 설정이 저장되었습니다.');
    } catch (error) {
      console.error('주차별 예측 설정 저장 실패:', error);
      alert('설정 저장에 실패했습니다.');
    }
  };

  // 예측 계산 함수
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
      
      // 월간 평균 매출 (주간 × 30/7)
      const monthlyAvgSales = Math.round(adjustedWeeklySales * 30 / 7);

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
      
      // 가장 최근 실적에서 시즌별 매출 비율 계산 (예측 구간에 적용)
      const totalSale = (latestData?.currentSeasonSale || 0) + (latestData?.nextSeasonSale || 0) + (latestData?.oldSeasonSale || 0) + (latestData?.stagnantSale || 0);
      const latestSaleRatios = {
        currentSeasonRatio: totalSale > 0 ? ((latestData?.currentSeasonSale || 0) / totalSale * 100) : 25,
        nextSeasonRatio: totalSale > 0 ? ((latestData?.nextSeasonSale || 0) / totalSale * 100) : 25,
        oldSeasonRatio: totalSale > 0 ? ((latestData?.oldSeasonSale || 0) / totalSale * 100) : 25,
        stagnantRatio: totalSale > 0 ? ((latestData?.stagnantSale || 0) / totalSale * 100) : 25,
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
      
      const forecastResults = forecastWeeks.map((week, index) => {
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

      // 12주차(마지막 예측 주차)의 예상 재고를 사용
      const lastForecastStock = forecastResults.length > 0 
        ? forecastResults[forecastResults.length - 1].totalStock 
        : 0;

      // 발주가능 금액 = 목표재고 - 예상재고(12주차)
      const orderCapacityAmount = targetStock - lastForecastStock;

      const orderCapacity: OrderCapacity = {
        targetMonth,
        baseStockWeeks: currentBaseWeeks,
        weeklyAvgSales: adjustedWeeklySales,
        monthlyAvgSales,
        targetStock,
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
  useEffect(() => {
    if (isForecastReady && actualData && actualData.length > 0) {
      calculateForecast();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForecastReady, actualData, selectedItem, weeksType, prevYearData]);

  // 전년 동주차 매출 조회 함수
  const loadPrevYearSales = async () => {
    if (forecastWeeks.length === 0) return;
    
    setIsLoadingPrevSales(true);
    try {
      const weekKeys = forecastWeeks.map(w => w.weekKey).join(',');
      const itemParam = selectedItem === 'all' ? 'all' : selectedItem;
      
      console.log(`📊 전년 동주차 매출 조회: ${weekKeys}`);
      const response = await fetch(`/api/weekly-prev-year-sales?brandCode=${brandCode}&weeks=${weekKeys}&selectedItem=${itemParam}`);
      const result = await response.json();
      
      if (result.success && result.data) {
        setPrevYearData(result.data);
        console.log('✅ 전년 동주차 데이터 조회 성공:', result.data);
      }
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
                (Snowflake에서 중분류별 자동 조회)
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

