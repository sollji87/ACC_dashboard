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
  onForecastCalculated: (forecastResults: any[], orderCapacity: OrderCapacity | null, incomingAmounts?: any[]) => void;
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
  const [yoyRate, setYoyRate] = useState<ItemYoyRate>({
    shoes: 100,
    hat: 100,
    bag: 100,
    other: 100,
  }); // 중분류별 매출액 성장률 YOY
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
        // yoyRate가 숫자인 경우 (구버전) 중분류별 객체로 변환
        if (typeof parsed.yoyRate === 'number') {
          setYoyRate({
            shoes: parsed.yoyRate,
            hat: parsed.yoyRate,
            bag: parsed.yoyRate,
            other: parsed.yoyRate,
          });
        } else {
          setYoyRate(parsed.yoyRate || {
            shoes: 100,
            hat: 100,
            bag: 100,
            other: 100,
          });
        }
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
        yoyRate,
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
          yoyRate[selectedItem]
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
        yoyRate,
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
  const handleCalculateForecast = () => {
    if (!actualData || actualData.length === 0) {
      alert('실적 데이터가 없습니다.');
      return;
    }

    if (selectedItem === 'all') {
      alert('중분류를 선택해주세요 (신발, 모자, 가방, 기타ACC).');
      return;
    }

    const forecastInput: ForecastInput = {
      brandCode,
      brandName,
      yoyRate,
      baseStockWeeks,
      incomingAmounts,
    };

    try {
      // 선택된 중분류에 대한 예측 계산
      const forecastResults = calculateForecast(actualData, forecastInput, weeksType, selectedItem);

      // 4개월 후 발주가능 금액 계산
      const orderCapacity = calculateOrderCapacity(
        actualData,
        forecastResults,
        baseStockWeeks[selectedItem],
        weeksType,
        yoyRate[selectedItem]
      );

      // 로컬 스토리지에 저장 (모든 중분류에 공통 적용)
      saveToLocalStorage();
      setIsForecastReady(true);

      // 부모 컴포넌트로 결과 전달 (입고예정금액 포함)
      onForecastCalculated(forecastResults, orderCapacity, incomingAmounts);

      alert('✅ 예측 설정이 저장되었습니다.\n\n모든 중분류(신발/모자/가방/기타ACC)에 자동 적용됩니다.');
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
                  <span className="font-semibold text-blue-600">매출YOY:</span>
                  <span className="font-bold text-blue-700">{yoyRate[selectedItem]}%</span>
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
            {/* 중분류별 매출액 성장률 YOY */}
            <div className="p-3 bg-blue-50 rounded-lg space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">
                중분류별 매출액 성장률 YOY:
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(yoyRate) as Array<keyof ItemYoyRate>).map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 w-16">{itemNames[key]}:</label>
                    <Input
                      type="number"
                      value={yoyRate[key]}
                      onChange={(e) =>
                        setYoyRate((prev) => ({
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
                (Snowflake에서 중분류별 자동 조회)
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
                disabled={selectedItem === 'all'}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50"
              >
                🔮 예측 설정 저장 및 계산
              </Button>
              {selectedItem === 'all' ? (
                <span className="text-xs text-red-600 self-center">
                  * 중분류를 선택해주세요
                </span>
              ) : (
                <span className="text-xs text-purple-600 self-center">
                  ※ 설정은 모든 중분류(신발/모자/가방/기타ACC)에 자동 적용됩니다
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
