'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  ForecastInput,
  ItemBaseStockWeeks,
  ItemYoyRate,
  MonthlyItemIncomingAmount,
  OrderCapacity,
} from '@/lib/forecast-types';
import {
  generateForecastMonths,
  calculateForecast,
  calculateOrderCapacity,
} from '@/lib/forecast-service';
import { fetchIncomingAmounts } from '@/lib/api';

interface ForecastInputPanelProps {
  brandCode: string;
  brandName: string;
  lastActualMonth: string; // 'YYYY-MM' 형식
  actualData: any[]; // 실적 차트 데이터
  weeksType: '4weeks' | '8weeks' | '12weeks';
  selectedItem: 'all' | 'shoes' | 'hat' | 'bag' | 'other'; // 선택된 중분류
  onForecastCalculated: (
    forecastResults: any[], 
    orderCapacity: OrderCapacity | null, 
    incomingAmounts?: any[],
    orderCapacityByItem?: Record<string, OrderCapacity>,
    forecastResultsByItem?: Record<string, any[]>
  ) => void;
}

export default function ForecastInputPanel({
  brandCode,
  brandName,
  lastActualMonth,
  actualData,
  weeksType,
  selectedItem,
  onForecastCalculated,
}: ForecastInputPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [yoyRateExPurchase, setYoyRateExPurchase] = useState<ItemYoyRate>({
    shoes: 100,
    hat: 100,
    bag: 100,
    other: 100,
  }); // 중분류별 사입제외 매출액 성장률 YOY
  const [yoyRatePurchase, setYoyRatePurchase] = useState<ItemYoyRate>({
    shoes: 100,
    hat: 100,
    bag: 100,
    other: 100,
  }); // 중분류별 사입 매출액 성장률 YOY
  const [baseStockWeeks, setBaseStockWeeks] = useState<ItemBaseStockWeeks>({
    shoes: 40,
    hat: 40,
    bag: 40,
    other: 40,
  });
  const [incomingAmounts, setIncomingAmounts] = useState<MonthlyItemIncomingAmount[]>([]);
  const [isLoadingIncoming, setIsLoadingIncoming] = useState(false);
  const [forecastMonths, setForecastMonths] = useState<string[]>([]);
  const [isForecastReady, setIsForecastReady] = useState(false); // 예측 설정 완료 여부

  // 로컬 스토리지 키 (브랜드별 공통 - 모든 중분류에 동일하게 적용)
  const storageKey = `forecast_${brandCode}`;

  // 로컬 스토리지에서 데이터 불러오기 (브랜드별 공통 - 모든 중분류에 적용)
  useEffect(() => {
    if (!lastActualMonth) return;

    const months = generateForecastMonths(lastActualMonth, 6);
    setForecastMonths(months);
    
    // 로컬 스토리지에서 저장된 데이터 불러오기 (한 번 설정하면 모든 중분류에 적용)
    try {
      const savedData = localStorage.getItem(storageKey);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        const defaultYoy = { shoes: 100, hat: 100, bag: 100, other: 100 };
        
        // 사입제외 YOY (구버전 호환: yoyRate가 있으면 사입제외로 사용)
        if (parsed.yoyRateExPurchase) {
          setYoyRateExPurchase(parsed.yoyRateExPurchase);
        } else if (typeof parsed.yoyRate === 'number') {
          setYoyRateExPurchase({
            shoes: parsed.yoyRate,
            hat: parsed.yoyRate,
            bag: parsed.yoyRate,
            other: parsed.yoyRate,
          });
        } else if (parsed.yoyRate) {
          setYoyRateExPurchase(parsed.yoyRate);
        } else {
          setYoyRateExPurchase(defaultYoy);
        }
        
        // 사입 YOY
        setYoyRatePurchase(parsed.yoyRatePurchase || defaultYoy);
        
        setBaseStockWeeks(parsed.baseStockWeeks || {
          shoes: 40,
          hat: 40,
          bag: 40,
          other: 40,
        });
        
        // 저장된 입고예정금액이 있으면 사용, 없으면 0으로 초기화
        if (parsed.incomingAmounts && parsed.incomingAmounts.length > 0) {
          setIncomingAmounts(parsed.incomingAmounts);
          setIsForecastReady(true);
        } else {
          setIncomingAmounts(
            months.map((month) => ({
              month,
              shoes: 0,
              hat: 0,
              bag: 0,
              other: 0,
            }))
          );
        }
      } else {
        // 저장된 데이터가 없으면 기본값으로 초기화
        setIncomingAmounts(
          months.map((month) => ({
            month,
            shoes: 0,
            hat: 0,
            bag: 0,
            other: 0,
          }))
        );
      }
    } catch (error) {
      console.error('로컬 스토리지 데이터 로드 실패:', error);
      // 에러 발생 시 기본값으로 초기화
      setIncomingAmounts(
        months.map((month) => ({
          month,
          shoes: 0,
          hat: 0,
          bag: 0,
          other: 0,
        }))
      );
    }
  }, [lastActualMonth, brandCode]); // brandCode 변경 시에도 다시 로드

  // 저장된 데이터가 있거나 중분류가 변경되면 자동으로 예측 실행
  useEffect(() => {
    if (isForecastReady && actualData && actualData.length > 0 && selectedItem !== 'all') {
      const forecastInput: ForecastInput = {
        brandCode,
        brandName,
        yoyRate: yoyRateExPurchase, // 하위호환용
        yoyRateExPurchase,
        yoyRatePurchase,
        baseStockWeeks,
        incomingAmounts,
      };

      try {
        const forecastResults = calculateForecast(actualData, forecastInput, weeksType, selectedItem);
        const orderCapacity = calculateOrderCapacity(
          actualData,
          forecastResults,
          baseStockWeeks[selectedItem],
          weeksType,
          yoyRateExPurchase[selectedItem]
        );
        onForecastCalculated(forecastResults, orderCapacity, incomingAmounts);
        console.log(`✅ 저장된 설정으로 자동 예측 실행 완료 (${selectedItem})`);
      } catch (error) {
        console.error('❌ 자동 예측 실행 실패:', error);
      }
    }
  }, [isForecastReady, actualData, selectedItem, weeksType]);

  // 입고예정금액 자동 조회
  const handleLoadIncomingAmounts = async () => {
    if (forecastMonths.length === 0) return;

    setIsLoadingIncoming(true);
    try {
      const startMonth = forecastMonths[0];
      const endMonth = forecastMonths[forecastMonths.length - 1];

      const data = await fetchIncomingAmounts(brandCode, startMonth, endMonth);

      // 기존 incomingAmounts 업데이트
      const updated = incomingAmounts.map((item) => {
        const found = data.find((d: any) => d.month === item.month);
        if (found) {
          return {
            month: item.month,
            shoes: found.shoes || 0,
            hat: found.hat || 0,
            bag: found.bag || 0,
            other: found.other || 0,
          };
        }
        return item;
      });

      setIncomingAmounts(updated);
      alert('입고예정금액을 성공적으로 불러왔습니다.');
    } catch (error) {
      console.error('입고예정금액 조회 실패:', error);
      alert('입고예정금액 조회에 실패했습니다.');
    } finally {
      setIsLoadingIncoming(false);
    }
  };

  // 중분류별 입고예정금액 변경
  const handleIncomingAmountChange = (
    month: string,
    itemType: 'shoes' | 'hat' | 'bag' | 'other',
    value: string
  ) => {
    const numValue = parseFloat(value) || 0;
    setIncomingAmounts((prev) =>
      prev.map((item) =>
        item.month === month
          ? { ...item, [itemType]: numValue * 1000000 } // 백만원 -> 원
          : item
      )
    );
  };

  // 로컬 스토리지에 저장 (브랜드별 공통)
  const saveToLocalStorage = () => {
    try {
      const dataToSave = {
        yoyRateExPurchase,
        yoyRatePurchase,
        yoyRate: yoyRateExPurchase, // 하위호환용
        baseStockWeeks,
        incomingAmounts,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      console.log('✅ 예측 설정 저장 완료 (모든 중분류 공통):', storageKey);
    } catch (error) {
      console.error('❌ 로컬 스토리지 저장 실패:', error);
    }
  };

  // 예측 계산 실행 (한 번 실행하면 모든 중분류에 자동 적용)
  // 아이템별 차트 데이터 조회 함수
  const fetchChartDataForItem = async (itemType: 'shoes' | 'hat' | 'bag' | 'other'): Promise<any[]> => {
    try {
      const yyyymm = lastActualMonth.replace(/-/g, '');
      const itemStdMap: Record<string, string> = {
        shoes: '신발',
        hat: '모자',
        bag: '가방',
        other: '기타ACC',
      };
      const itemStd = itemStdMap[itemType];
      const url = `/api/dashboard/chart?brandCode=${encodeURIComponent(brandCode)}&yyyymm=${yyyymm}&weeksType=${weeksType}&itemStd=${encodeURIComponent(itemStd)}&excludePurchase=true&base=amount`;
      console.log(`📊 [${itemType}] 월결산 차트 데이터 조회:`, url);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`❌ [${itemType}] 차트 데이터 조회 실패:`, response.status);
        return [];
      }
      
      const result = await response.json();
      const chartData = result.data || result || [];
      console.log(`✅ [${itemType}] 월결산 차트 데이터 조회 성공:`, chartData.length, '개 월');
      return chartData;
    } catch (error) {
      console.error(`❌ [${itemType}] 차트 데이터 조회 오류:`, error);
      return [];
    }
  };

  const handleCalculateForecast = async () => {
    if (!actualData || actualData.length === 0) {
      alert('실적 데이터가 없습니다.');
      return;
    }

    try {
      console.log('🔄 모든 아이템에 대해 월결산 예측 계산 시작...');
      
      const itemTypes: ('shoes' | 'hat' | 'bag' | 'other')[] = ['shoes', 'hat', 'bag', 'other'];
      const orderCapacityByItem: Record<string, OrderCapacity> = {};
      const forecastResultsByItem: Record<string, any[]> = {};
      
      // 각 아이템에 대해 순차적으로 API 호출 및 계산
      for (const item of itemTypes) {
        // 해당 아이템의 차트 데이터 조회
        const itemChartData = await fetchChartDataForItem(item);
        
        if (itemChartData && itemChartData.length > 0) {
          const forecastInput: ForecastInput = {
            brandCode,
            brandName,
            yoyRate: yoyRateExPurchase,
            yoyRateExPurchase,
            yoyRatePurchase,
            baseStockWeeks,
            incomingAmounts,
          };
          
          // 해당 아이템의 예측 계산
          const forecastResults = calculateForecast(itemChartData, forecastInput, weeksType, item);
          const orderCapacity = calculateOrderCapacity(
            itemChartData,
            forecastResults,
            baseStockWeeks[item],
            weeksType,
            yoyRateExPurchase[item]
          );
          
          if (orderCapacity) {
            orderCapacityByItem[item] = orderCapacity;
            forecastResultsByItem[item] = forecastResults;
            console.log(`✅ [${item}] 월결산 예측 계산 완료 - 발주가능: ${orderCapacity.orderCapacity}백만원`);
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
        
        // 각 월별로 합산
        for (let i = 0; i < shoesResults.length; i++) {
          const shoes = shoesResults[i] || {};
          const hat = hatResults[i] || {};
          const bag = bagResults[i] || {};
          const other = otherResults[i] || {};
          
          const totalStock = (shoes.totalStock || 0) + (hat.totalStock || 0) + (bag.totalStock || 0) + (other.totalStock || 0);
          const previousTotalStock = (shoes.previousTotalStock || 0) + (hat.previousTotalStock || 0) + (bag.previousTotalStock || 0) + (other.previousTotalStock || 0);
          
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
          
          // 시즌별 매출액 합산 (당년 예측)
          const currentSeasonSale = (shoes.currentSeasonSale || 0) + (hat.currentSeasonSale || 0) + (bag.currentSeasonSale || 0) + (other.currentSeasonSale || 0);
          const nextSeasonSale = (shoes.nextSeasonSale || 0) + (hat.nextSeasonSale || 0) + (bag.nextSeasonSale || 0) + (other.nextSeasonSale || 0);
          const oldSeasonSale = (shoes.oldSeasonSale || 0) + (hat.oldSeasonSale || 0) + (bag.oldSeasonSale || 0) + (other.oldSeasonSale || 0);
          const stagnantSale = (shoes.stagnantSale || 0) + (hat.stagnantSale || 0) + (bag.stagnantSale || 0) + (other.stagnantSale || 0);
          const totalSale = (shoes.totalSale || 0) + (hat.totalSale || 0) + (bag.totalSale || 0) + (other.totalSale || 0);
          
          // 시즌별 매출액 합산 (전년)
          const previousCurrentSeasonSale = (shoes.previousCurrentSeasonSale || 0) + (hat.previousCurrentSeasonSale || 0) + (bag.previousCurrentSeasonSale || 0) + (other.previousCurrentSeasonSale || 0);
          const previousNextSeasonSale = (shoes.previousNextSeasonSale || 0) + (hat.previousNextSeasonSale || 0) + (bag.previousNextSeasonSale || 0) + (other.previousNextSeasonSale || 0);
          const previousOldSeasonSale = (shoes.previousOldSeasonSale || 0) + (hat.previousOldSeasonSale || 0) + (bag.previousOldSeasonSale || 0) + (other.previousOldSeasonSale || 0);
          const previousStagnantSale = (shoes.previousStagnantSale || 0) + (hat.previousStagnantSale || 0) + (bag.previousStagnantSale || 0) + (other.previousStagnantSale || 0);
          const previousTotalSale = (shoes.previousTotalSale || 0) + (hat.previousTotalSale || 0) + (bag.previousTotalSale || 0) + (other.previousTotalSale || 0);
          
          // 사입제외/사입 택매출액 합산 (당년 예측)
          const totalSaleExPurchase = (shoes.totalSaleExPurchase || 0) + (hat.totalSaleExPurchase || 0) + (bag.totalSaleExPurchase || 0) + (other.totalSaleExPurchase || 0);
          const totalSalePurchase = (shoes.totalSalePurchase || 0) + (hat.totalSalePurchase || 0) + (bag.totalSalePurchase || 0) + (other.totalSalePurchase || 0);
          
          // 사입제외/사입 택매출액 합산 (전년)
          const previousTotalSaleExPurchase = (shoes.previousTotalSaleExPurchase || 0) + (hat.previousTotalSaleExPurchase || 0) + (bag.previousTotalSaleExPurchase || 0) + (other.previousTotalSaleExPurchase || 0);
          const previousTotalSalePurchase = (shoes.previousTotalSalePurchase || 0) + (hat.previousTotalSalePurchase || 0) + (bag.previousTotalSalePurchase || 0) + (other.previousTotalSalePurchase || 0);
          
          // 재고주수 합산
          const stockWeeks = (shoes.stockWeeks || 0) + (hat.stockWeeks || 0) + (bag.stockWeeks || 0) + (other.stockWeeks || 0);
          const previousStockWeeks = (shoes.previousStockWeeks || 0) + (hat.previousStockWeeks || 0) + (bag.previousStockWeeks || 0) + (other.previousStockWeeks || 0);
          const stockWeeksNormal = (shoes.stockWeeksNormal || 0) + (hat.stockWeeksNormal || 0) + (bag.stockWeeksNormal || 0) + (other.stockWeeksNormal || 0);
          const previousStockWeeksNormal = (shoes.previousStockWeeksNormal || 0) + (hat.previousStockWeeksNormal || 0) + (bag.previousStockWeeksNormal || 0) + (other.previousStockWeeksNormal || 0);
          
          // 시즌별 비율 계산
          const currentSeasonRatio = totalStock > 0 ? (currentSeasonStock / totalStock * 100) : 25;
          const nextSeasonRatio = totalStock > 0 ? (nextSeasonStock / totalStock * 100) : 25;
          const oldSeasonRatio = totalStock > 0 ? (oldSeasonStock / totalStock * 100) : 25;
          const stagnantRatio = totalStock > 0 ? (stagnantStock / totalStock * 100) : 25;
          
          // 매출액 비율 계산
          const currentSeasonSaleRatio = totalSale > 0 ? Math.round((currentSeasonSale / totalSale) * 100) : 0;
          const nextSeasonSaleRatio = totalSale > 0 ? Math.round((nextSeasonSale / totalSale) * 100) : 0;
          const oldSeasonSaleRatio = totalSale > 0 ? Math.round((oldSeasonSale / totalSale) * 100) : 0;
          const stagnantSaleRatio = totalSale > 0 ? Math.round((stagnantSale / totalSale) * 100) : 0;
          
          allForecastResults.push({
            month: shoes.month,
            isActual: false,
            totalStock,
            previousTotalStock,
            stockWeeks: stockWeeks / 4,
            previousStockWeeks: previousStockWeeks / 4,
            stockWeeksNormal: stockWeeksNormal / 4,
            previousStockWeeksNormal: previousStockWeeksNormal / 4,
            stockYOY: previousTotalStock > 0 ? Math.round((totalStock / previousTotalStock) * 100) : 0,
            saleYOY: previousTotalSale > 0 ? Math.round((totalSale / previousTotalSale) * 100) : 0,
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
            // 시즌별 비율 (재고)
            currentSeasonRatio,
            nextSeasonRatio,
            oldSeasonRatio,
            stagnantRatio,
            previousCurrentSeasonRatio: previousTotalStock > 0 ? (previousCurrentSeasonStock / previousTotalStock * 100) : currentSeasonRatio,
            previousNextSeasonRatio: previousTotalStock > 0 ? (previousNextSeasonStock / previousTotalStock * 100) : nextSeasonRatio,
            previousOldSeasonRatio: previousTotalStock > 0 ? (previousOldSeasonStock / previousTotalStock * 100) : oldSeasonRatio,
            previousStagnantRatio: previousTotalStock > 0 ? (previousStagnantStock / previousTotalStock * 100) : stagnantRatio,
            // 시즌별 매출액 (당년 예측)
            currentSeasonSale,
            nextSeasonSale,
            oldSeasonSale,
            stagnantSale,
            totalSale,
            // 사입제외/사입 택매출액 (당년 예측)
            totalSaleExPurchase,
            totalSalePurchase,
            // 시즌별 매출액 (전년)
            previousCurrentSeasonSale,
            previousNextSeasonSale,
            previousOldSeasonSale,
            previousStagnantSale,
            previousTotalSale,
            // 사입제외/사입 택매출액 (전년)
            previousTotalSaleExPurchase,
            previousTotalSalePurchase,
            // 시즌별 매출액 비율
            currentSeasonSaleRatio,
            nextSeasonSaleRatio,
            oldSeasonSaleRatio,
            stagnantSaleRatio,
          });
        }
        
        forecastResultsByItem['all'] = allForecastResults;
        
        // 전체 발주가능금액도 합산
        const totalWeeklyAvgSales = (orderCapacityByItem['shoes']?.weeklyAvgSales || 0) + (orderCapacityByItem['hat']?.weeklyAvgSales || 0) + (orderCapacityByItem['bag']?.weeklyAvgSales || 0) + (orderCapacityByItem['other']?.weeklyAvgSales || 0);
        
        // 기준재고주수는 가중평균으로 계산 (주간평균 매출액 기준)
        const weightedBaseStockWeeks = totalWeeklyAvgSales > 0 
          ? (
              (orderCapacityByItem['shoes']?.baseStockWeeks || 0) * (orderCapacityByItem['shoes']?.weeklyAvgSales || 0) +
              (orderCapacityByItem['hat']?.baseStockWeeks || 0) * (orderCapacityByItem['hat']?.weeklyAvgSales || 0) +
              (orderCapacityByItem['bag']?.baseStockWeeks || 0) * (orderCapacityByItem['bag']?.weeklyAvgSales || 0) +
              (orderCapacityByItem['other']?.baseStockWeeks || 0) * (orderCapacityByItem['other']?.weeklyAvgSales || 0)
            ) / totalWeeklyAvgSales
          : (baseStockWeeks.shoes + baseStockWeeks.hat + baseStockWeeks.bag + baseStockWeeks.other) / 4;
        
        // 월평균 매출도 합산
        const totalMonthlyAvgSales = (orderCapacityByItem['shoes']?.monthlyAvgSales || 0) + (orderCapacityByItem['hat']?.monthlyAvgSales || 0) + (orderCapacityByItem['bag']?.monthlyAvgSales || 0) + (orderCapacityByItem['other']?.monthlyAvgSales || 0);
        
        const allOrderCapacity: OrderCapacity = {
          targetMonth: orderCapacityByItem['shoes']?.targetMonth || '',
          baseStockWeeks: weightedBaseStockWeeks,
          weeklyAvgSales: totalWeeklyAvgSales,
          monthlyAvgSales: totalMonthlyAvgSales,
          currentForecastStock: (orderCapacityByItem['shoes']?.currentForecastStock || 0) + (orderCapacityByItem['hat']?.currentForecastStock || 0) + (orderCapacityByItem['bag']?.currentForecastStock || 0) + (orderCapacityByItem['other']?.currentForecastStock || 0),
          targetStock: (orderCapacityByItem['shoes']?.targetStock || 0) + (orderCapacityByItem['hat']?.targetStock || 0) + (orderCapacityByItem['bag']?.targetStock || 0) + (orderCapacityByItem['other']?.targetStock || 0),
          orderCapacity: (orderCapacityByItem['shoes']?.orderCapacity || 0) + (orderCapacityByItem['hat']?.orderCapacity || 0) + (orderCapacityByItem['bag']?.orderCapacity || 0) + (orderCapacityByItem['other']?.orderCapacity || 0),
          yoyRate: 100,
          weeksType,
        };
        orderCapacityByItem['all'] = allOrderCapacity;
        
        console.log(`✅ [all] 전체 월결산 예측 결과 생성 완료 - 발주가능: ${allOrderCapacity.orderCapacity}백만원`);
      }
      
      // 로컬 스토리지에 저장
      const dataToSave = {
        yoyRateExPurchase,
        yoyRatePurchase,
        yoyRate: yoyRateExPurchase,
        baseStockWeeks,
        incomingAmounts,
        orderCapacityByItem,
        forecastResultsByItem,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      setIsForecastReady(true);
      console.log('✅ 월결산 예측 설정 저장 완료 (모든 아이템)');
      
      // 현재 선택된 아이템에 대해 부모 컴포넌트에 전달
      const currentItemKey = selectedItem;
      if (forecastResultsByItem[currentItemKey] && orderCapacityByItem[currentItemKey]) {
        onForecastCalculated(
          forecastResultsByItem[currentItemKey], 
          orderCapacityByItem[currentItemKey], 
          incomingAmounts,
          orderCapacityByItem,
          forecastResultsByItem
        );
      }
      
      alert('✅ 예측 설정이 저장되었습니다.\n\n모든 중분류(신발/모자/가방/기타ACC/전체)에 자동 적용됩니다.');
    } catch (error) {
      console.error('예측 계산 실패:', error);
      alert('예측 계산에 실패했습니다.');
    }
  };

  const itemNames = {
    shoes: '신발',
    hat: '모자',
    bag: '가방',
    other: '기타ACC',
  };

  return (
    <Card className="mb-6 border-purple-200 shadow-sm">
      <CardContent className="p-4">
        {/* 토글 헤더 */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
              <h3 className="text-base font-bold text-slate-800">
                📊 {brandName} 재고 예측 설정
                {selectedItem !== 'all' && (
                  <span className="ml-2 text-sm text-purple-600">
                    ({itemNames[selectedItem]})
                  </span>
                )}
                {isForecastReady && (
                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                    ✓ 설정완료
                  </span>
                )}
              </h3>
            </div>
            
            {/* 요약 정보 (접힌 상태에서 표시) */}
            {!isExpanded && selectedItem !== 'all' && (
              <div className="ml-6 flex items-center gap-6 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-blue-600">사입제외YOY:</span>
                  <span className="font-bold text-blue-700">{yoyRateExPurchase[selectedItem]}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-emerald-600">사입YOY:</span>
                  <span className="font-bold text-emerald-700">{yoyRatePurchase[selectedItem]}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-purple-600">목표 재고주수:</span>
                  <span className="font-bold text-purple-700">
                    {baseStockWeeks[selectedItem]}주
                  </span>
                </div>
                {isForecastReady && (
                  <div className="text-xs text-green-600">
                    (저장된 설정 자동 적용 중)
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              {isExpanded ? '접기' : '펼치기'}
            </span>
            <svg
              className={`w-5 h-5 text-slate-600 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {/* 입력 폼 */}
        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* 중분류별 매출액 성장률 YOY (사입제외) */}
            <div className="p-3 bg-blue-50 rounded-lg space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">
                중분류별 매출액 성장률 YOY <span className="text-green-600">(사입제외)</span>:
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(yoyRateExPurchase) as Array<keyof ItemYoyRate>).map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 w-16">{itemNames[key]}:</label>
                    <Input
                      type="number"
                      value={yoyRateExPurchase[key]}
                      onChange={(e) =>
                        setYoyRateExPurchase((prev) => ({
                          ...prev,
                          [key]: parseFloat(e.target.value) || 100,
                        }))
                      }
                      className="w-20 text-right text-sm"
                      step="0.1"
                    />
                    <span className="text-xs text-slate-600">%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 중분류별 매출액 성장률 YOY (사입) */}
            <div className="p-3 bg-emerald-50 rounded-lg space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">
                중분류별 매출액 성장률 YOY <span className="text-emerald-600">(사입)</span>:
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(yoyRatePurchase) as Array<keyof ItemYoyRate>).map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 w-16">{itemNames[key]}:</label>
                    <Input
                      type="number"
                      value={yoyRatePurchase[key]}
                      onChange={(e) =>
                        setYoyRatePurchase((prev) => ({
                          ...prev,
                          [key]: parseFloat(e.target.value) || 100,
                        }))
                      }
                      className="w-20 text-right text-sm"
                      step="0.1"
                    />
                    <span className="text-xs text-slate-600">%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 중분류별 기준재고주수 */}
            <div className="p-3 bg-purple-50 rounded-lg space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">
                중분류별 기준재고주수:
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(baseStockWeeks) as Array<keyof ItemBaseStockWeeks>).map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 w-16">{itemNames[key]}:</label>
                    <Input
                      type="number"
                      value={baseStockWeeks[key]}
                      onChange={(e) =>
                        setBaseStockWeeks((prev) => ({
                          ...prev,
                          [key]: parseFloat(e.target.value) || 40,
                        }))
                      }
                      className="w-20 text-right text-sm"
                      step="0.1"
                    />
                    <span className="text-xs text-slate-600">주</span>
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
                (입고예정금액 조회)
              </span>
            </div>

            {/* 월별 중분류별 입력 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2 text-left font-semibold">
                      월
                    </th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold">
                      신발 (백만원)
                    </th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold">
                      모자 (백만원)
                    </th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold">
                      가방 (백만원)
                    </th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold">
                      기타ACC (백만원)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {forecastMonths.map((month) => {
                    const amounts = incomingAmounts.find((i) => i.month === month);

                    return (
                      <tr key={month} className="hover:bg-slate-50">
                        <td className="border border-slate-300 px-3 py-2 font-medium">
                          {month}
                        </td>
                        <td className="border border-slate-300 px-2 py-1">
                          <Input
                            type="number"
                            value={Math.round((amounts?.shoes || 0) / 1000000)}
                            onChange={(e) =>
                              handleIncomingAmountChange(month, 'shoes', e.target.value)
                            }
                            className="w-full text-right"
                            step="1"
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-1">
                          <Input
                            type="number"
                            value={Math.round((amounts?.hat || 0) / 1000000)}
                            onChange={(e) =>
                              handleIncomingAmountChange(month, 'hat', e.target.value)
                            }
                            className="w-full text-right"
                            step="1"
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-1">
                          <Input
                            type="number"
                            value={Math.round((amounts?.bag || 0) / 1000000)}
                            onChange={(e) =>
                              handleIncomingAmountChange(month, 'bag', e.target.value)
                            }
                            className="w-full text-right"
                            step="1"
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-1">
                          <Input
                            type="number"
                            value={Math.round((amounts?.other || 0) / 1000000)}
                            onChange={(e) =>
                              handleIncomingAmountChange(month, 'other', e.target.value)
                            }
                            className="w-full text-right"
                            step="1"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 계산 버튼 */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={handleCalculateForecast}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              >
                🔮 예측 설정 저장 및 계산
              </Button>
              <span className="text-xs text-purple-600 self-center">
                ※ 설정은 모든 중분류(신발/모자/가방/기타ACC/전체)에 자동 적용됩니다
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
