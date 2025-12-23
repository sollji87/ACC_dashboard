'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fetchWeeklyIncomingAmounts, WeeklyIncomingAmountData } from '@/lib/api';

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
  onIncomingAmountsLoaded?: (data: WeeklyItemIncomingAmount[]) => void;
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
  onIncomingAmountsLoaded,
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

  // 로컬 스토리지에 저장
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
      alert('✅ 설정이 저장되었습니다.');
    } catch (error) {
      console.error('주차별 예측 설정 저장 실패:', error);
      alert('설정 저장에 실패했습니다.');
    }
  };

  // 주차별 입고예정금액 자동 조회
  const handleLoadIncomingAmounts = async () => {
    if (forecastWeeks.length === 0) return;

    setIsLoadingIncoming(true);
    try {
      const startWeek = forecastWeeks[0].weekKey;
      const endWeek = forecastWeeks[forecastWeeks.length - 1].weekKey;

      console.log(`📦 주차별 입고예정금액 조회: ${startWeek} ~ ${endWeek}`);
      const data = await fetchWeeklyIncomingAmounts(brandCode, startWeek, endWeek);

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
            {/* 중분류별 매출액 성장률 YOY (사입제외) */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
              <div className="text-sm font-semibold text-green-800 mb-2">
                중분류별 매출액 성장률 YOY <span className="text-green-600">(사입제외)</span>:
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

            {/* 중분류별 매출액 성장률 YOY (사입) */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 border border-purple-200">
              <div className="text-sm font-semibold text-purple-800 mb-2">
                중분류별 매출액 성장률 YOY <span className="text-purple-600">(사입)</span>:
              </div>
              <div className="grid grid-cols-4 gap-4">
                {(['shoes', 'hat', 'bag', 'other'] as const).map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 w-12">
                      {item === 'shoes' ? '신발' : item === 'hat' ? '모자' : item === 'bag' ? '가방' : '기타ACC'}:
                    </span>
                    <Input
                      type="number"
                      value={yoyRatePurchase[item]}
                      onChange={(e) => setYoyRatePurchase(prev => ({ ...prev, [item]: Number(e.target.value) }))}
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

