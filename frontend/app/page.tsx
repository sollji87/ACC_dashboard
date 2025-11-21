'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BRANDS } from '@/lib/brands';
import { getRealData, getSampleData, getMonthOptions, BrandDashboardData } from '@/lib/data';
import { BarChart3, ChevronDown } from 'lucide-react';

export default function Home() {
  const [selectedMonth, setSelectedMonth] = useState('2025-10');
  const [dashboardData, setDashboardData] = useState<BrandDashboardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const monthOptions = getMonthOptions();

  // 실제 데이터 로드
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        console.log('🔄 메인 페이지 데이터 로드 시작:', selectedMonth);
        const data = await getRealData(selectedMonth);
        console.log('✅ 메인 페이지 데이터 로드 완료:', data);
        console.log('📊 데이터 상세:', data.map(d => ({
          brandId: d.brandId,
          brandName: d.brandName,
          accEndingInventory: d.accEndingInventory,
          accSalesAmount: d.accSalesAmount,
          totalWeeks: d.totalWeeks,
          accInventoryDetail: d.accInventoryDetail,
        })));
        setDashboardData(data);
      } catch (error) {
        console.error('❌ 데이터 로딩 실패, 샘플 데이터 사용:', error);
        const data = getSampleData(selectedMonth);
        setDashboardData(data);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [selectedMonth]);

  // 브랜드별 데이터 매핑
  const brandDataMap = new Map(
    dashboardData.map((data) => [data.brandId, data])
  );
  
  console.log('📊 brandDataMap:', Array.from(brandDataMap.entries()));

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-8 flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="text-slate-700 font-semibold">데이터 로딩 중...</p>
          </div>
        </div>
      )}
      
      {/* 헤더 */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl shadow-lg">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                  악세사리 재고주수 대시보드
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px] border-slate-300 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">5개 브랜드</span>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="container mx-auto px-6 py-8">
        {/* 안내 문구 */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">브랜드 선택</h2>
          <p className="text-sm text-slate-600">
            분석할 브랜드를 클릭하여 상세 대시보드로 이동합니다
          </p>
        </div>

        {/* 브랜드 카드 그리드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {BRANDS.map((brand) => {
            const data = brandDataMap.get(brand.id);
            if (!data) {
              console.warn(`⚠️ 브랜드 ${brand.id} 데이터 없음`);
              return null;
            }
            console.log(`📊 브랜드 ${brand.name} 렌더링:`, {
              accEndingInventory: data.accEndingInventory,
              accSalesAmount: data.accSalesAmount,
              totalWeeks: data.totalWeeks,
            });

            return (
              <Card
                key={brand.id}
                className="group overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:border-slate-300 transition-all duration-300 flex flex-col h-full hover:-translate-y-1"
              >
                <CardHeader className="pb-4">
                  {/* 브랜드 헤더 */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`h-14 w-14 rounded-2xl ${brand.logoColor} flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                    >
                      {brand.code}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-xl font-bold text-slate-900 truncate">
                        {brand.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                          매출 {data.salesYOY}%
                        </span>
                        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                          재고 {data.inventoryYOY}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 전체 재고주수 요약 */}
                  {(() => {
                    const currentWeeks = data.totalWeeks || 0;
                    const previousWeeks = data.totalPreviousWeeks || 0;
                    const diff = currentWeeks - previousWeeks;
                    const isImproved = diff < 0; // 재고주수가 줄어들면 개선
                    
                    return (
                      <div className="mt-4 mb-2 py-3 px-0 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl border-2 border-blue-200/50 shadow-sm">
                        <div className="flex items-center justify-between gap-0 px-1">
                          <div className="flex-1 text-center min-w-0">
                            <p className="text-xs font-medium text-slate-600 mb-1">당년</p>
                            <div className="flex items-baseline justify-center gap-1">
                              <span className="font-bold text-blue-600 leading-none" style={{ fontSize: '20px' }}>
                                {currentWeeks.toFixed(1)}
                              </span>
                              <span className="text-sm font-medium text-slate-500" style={{ fontSize: '0.875rem' }}>주</span>
                            </div>
                          </div>
                          
                          <div className="flex-1 text-center border-l border-r border-slate-300/50 min-w-0">
                            <p className="text-xs font-medium text-slate-600 mb-1">전년</p>
                            <div className="flex items-baseline justify-center gap-1">
                              <span className="font-bold text-slate-700 leading-none" style={{ fontSize: '20px' }}>
                                {previousWeeks.toFixed(1)}
                              </span>
                              <span className="text-sm font-medium text-slate-500" style={{ fontSize: '0.875rem' }}>주</span>
                            </div>
                          </div>
                          
                          <div className="flex-1 text-center min-w-0">
                            <p className="text-xs font-medium text-slate-600 mb-1">
                              {isImproved ? '개선' : '악화'}
                            </p>
                            <div className="flex items-baseline justify-center gap-1">
                              <span className={`font-bold leading-none ${isImproved ? 'text-emerald-600' : 'text-red-600'}`} style={{ fontSize: '20px' }}>
                                {isImproved ? '-' : '+'}
                                {Math.abs(diff).toFixed(1)}
                              </span>
                              <span className="text-sm font-medium text-slate-500" style={{ fontSize: '0.875rem' }}>주</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 핵심 지표 */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-3 rounded-xl border-2 border-blue-200/50">
                      <p className="text-xs font-medium text-slate-600 mb-1">ACC 기말재고</p>
                      <p className="text-xl font-bold text-slate-900">
                        {formatNumber(data.accEndingInventory)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">백만원</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 p-3 rounded-xl border-2 border-purple-200/50">
                      <p className="text-xs font-medium text-slate-600 mb-1">ACC 판매액</p>
                      <p className="text-xl font-bold text-slate-900">
                        {formatNumber(data.accSalesAmount)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">백만원</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 pb-4 flex-1 flex flex-col bg-white">
                  {/* ACC 재고 상세보기 */}
                  <div className="mb-4 flex-1 -mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-1 w-1 rounded-full bg-blue-500"></div>
                      <h3 className="text-sm font-bold text-slate-900">
                        ACC 재고 상세보기 <span className="text-xs font-normal text-slate-500">(백만원, 주)</span>
                      </h3>
                    </div>
                    
                    {/* 헤더 */}
                    <div className="grid grid-cols-4 gap-2 mb-2 px-3 py-2 bg-slate-100 rounded-lg">
                      <div className="text-xs font-semibold text-slate-700"></div>
                      <div className="text-xs font-semibold text-slate-700 text-center">당년</div>
                      <div className="text-xs font-semibold text-slate-700 text-center">전년</div>
                      <div className="text-xs font-semibold text-slate-700 text-center">YOY</div>
                    </div>
                    
                    {/* 데이터 행 */}
                    <div className="space-y-1.5">
                      {/* 전체 합계 행 */}
                      <div className="grid grid-cols-4 gap-2 py-2 px-3 rounded-lg bg-blue-50 border-2 border-blue-200 items-center">
                        <div className="text-sm font-bold text-blue-900">전체</div>
                        <div className="text-xs text-center font-bold text-blue-900">
                          <div>{formatNumber(data.accEndingInventory)}</div>
                          <div className="text-blue-700">
                            {data.totalWeeks?.toFixed(1) || '0.0'}주
                          </div>
                        </div>
                        <div className="text-xs text-center text-blue-800">
                          <div>
                            {formatNumber(
                              data.accInventoryDetail.shoes.previous + 
                              data.accInventoryDetail.hat.previous + 
                              data.accInventoryDetail.bag.previous + 
                              data.accInventoryDetail.other.previous
                            )}
                          </div>
                          <div className="text-blue-700">
                            {data.totalPreviousWeeks?.toFixed(1) || '0.0'}주
                          </div>
                        </div>
                        <div className="text-xs text-center font-bold text-blue-900">
                          <div>{data.inventoryYOY}%</div>
                          <div className={`text-xs font-semibold ${(data.totalWeeks || 0) - (data.totalPreviousWeeks || 0) < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {((data.totalWeeks || 0) - (data.totalPreviousWeeks || 0)) < 0 ? '-' : '+'}{Math.abs((data.totalWeeks || 0) - (data.totalPreviousWeeks || 0)).toFixed(1)}주
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors items-center">
                        <div className="text-sm font-semibold text-slate-900">신발</div>
                        <div className="text-xs text-center font-semibold text-slate-900">
                          <div>{formatNumber(data.accInventoryDetail.shoes.current)}</div>
                          <div className="text-slate-500">{data.accInventoryDetail.shoes.weeks.toFixed(1)}주</div>
                        </div>
                        <div className="text-xs text-center text-slate-600">
                          <div>{formatNumber(data.accInventoryDetail.shoes.previous)}</div>
                          <div className="text-slate-500">{data.accInventoryDetail.shoes.previousWeeks.toFixed(1)}주</div>
                        </div>
                        <div className="text-xs text-center font-semibold text-slate-900">
                          <div>{Math.round((data.accInventoryDetail.shoes.current / data.accInventoryDetail.shoes.previous) * 100)}%</div>
                          <div className={`text-xs font-semibold ${(data.accInventoryDetail.shoes.weeks - data.accInventoryDetail.shoes.previousWeeks) < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {(data.accInventoryDetail.shoes.weeks - data.accInventoryDetail.shoes.previousWeeks) < 0 ? '-' : '+'}{Math.abs(data.accInventoryDetail.shoes.weeks - data.accInventoryDetail.shoes.previousWeeks).toFixed(1)}주
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors items-center">
                        <div className="text-sm font-semibold text-slate-900">모자</div>
                        <div className="text-xs text-center font-semibold text-slate-900">
                          <div>{formatNumber(data.accInventoryDetail.hat.current)}</div>
                          <div className="text-slate-500">{data.accInventoryDetail.hat.weeks.toFixed(1)}주</div>
                        </div>
                        <div className="text-xs text-center text-slate-600">
                          <div>{formatNumber(data.accInventoryDetail.hat.previous)}</div>
                          <div className="text-slate-500">{data.accInventoryDetail.hat.previousWeeks.toFixed(1)}주</div>
                        </div>
                        <div className="text-xs text-center font-semibold text-slate-900">
                          <div>{Math.round((data.accInventoryDetail.hat.current / data.accInventoryDetail.hat.previous) * 100)}%</div>
                          <div className={`text-xs font-semibold ${(data.accInventoryDetail.hat.weeks - data.accInventoryDetail.hat.previousWeeks) < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {(data.accInventoryDetail.hat.weeks - data.accInventoryDetail.hat.previousWeeks) < 0 ? '-' : '+'}{Math.abs(data.accInventoryDetail.hat.weeks - data.accInventoryDetail.hat.previousWeeks).toFixed(1)}주
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors items-center">
                        <div className="text-sm font-semibold text-slate-900">가방</div>
                        <div className="text-xs text-center font-semibold text-slate-900">
                          <div>{formatNumber(data.accInventoryDetail.bag.current)}</div>
                          <div className="text-slate-500">{data.accInventoryDetail.bag.weeks.toFixed(1)}주</div>
                        </div>
                        <div className="text-xs text-center text-slate-600">
                          <div>{formatNumber(data.accInventoryDetail.bag.previous)}</div>
                          <div className="text-slate-500">{data.accInventoryDetail.bag.previousWeeks.toFixed(1)}주</div>
                        </div>
                        <div className="text-xs text-center font-semibold text-slate-900">
                          <div>{Math.round((data.accInventoryDetail.bag.current / data.accInventoryDetail.bag.previous) * 100)}%</div>
                          <div className={`text-xs font-semibold ${(data.accInventoryDetail.bag.weeks - data.accInventoryDetail.bag.previousWeeks) < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {(data.accInventoryDetail.bag.weeks - data.accInventoryDetail.bag.previousWeeks) < 0 ? '-' : '+'}{Math.abs(data.accInventoryDetail.bag.weeks - data.accInventoryDetail.bag.previousWeeks).toFixed(1)}주
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors items-center">
                        <div className="text-sm font-semibold text-slate-900">기타ACC</div>
                        <div className="text-xs text-center font-semibold text-slate-900">
                          <div>{formatNumber(data.accInventoryDetail.other.current)}</div>
                          <div className="text-slate-500">{data.accInventoryDetail.other.weeks.toFixed(1)}주</div>
                        </div>
                        <div className="text-xs text-center text-slate-600">
                          <div>{formatNumber(data.accInventoryDetail.other.previous)}</div>
                          <div className="text-slate-500">{data.accInventoryDetail.other.previousWeeks.toFixed(1)}주</div>
                        </div>
                        <div className="text-xs text-center font-semibold text-slate-900">
                          <div>{Math.round((data.accInventoryDetail.other.current / data.accInventoryDetail.other.previous) * 100)}%</div>
                          <div className={`text-xs font-semibold ${(data.accInventoryDetail.other.weeks - data.accInventoryDetail.other.previousWeeks) < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {(data.accInventoryDetail.other.weeks - data.accInventoryDetail.other.previousWeeks) < 0 ? '-' : '+'}{Math.abs(data.accInventoryDetail.other.weeks - data.accInventoryDetail.other.previousWeeks).toFixed(1)}주
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 전체 대시보드 보기 버튼 */}
                  <Link href={`/dashboard/${brand.id}?month=${selectedMonth}`} className="mt-auto">
                    <Button className={`w-full ${brand.logoColor} hover:opacity-90 text-white shadow-md hover:shadow-lg transition-all`} size="sm">
                      전체 대시보드 보기
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
