'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getBrandById, BRANDS } from '@/lib/brands';
import { getRealData, getSampleData, getMonthOptions, BrandDashboardData } from '@/lib/data';
import { fetchProductDetails, ProductDetailResponse } from '@/lib/api';
import { getItemNameFromKey } from '@/lib/dashboard-service';
import { ArrowLeft, BarChart3, AlertTriangle, ChevronDown, ChevronUp, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, TooltipProps } from 'recharts';

// 재고주수 추이 차트용 커스텀 범례
const CustomStockWeeksLegend = ({ payload }: any) => {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-6 mt-4" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}>
      {payload.map((entry: any, index: number) => {
        const color = entry.color || '#64748b';
        const isDashed = entry.strokeDasharray;
        
        return (
          <div key={index} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ 
                backgroundColor: isDashed ? 'transparent' : color,
                border: `2px solid ${color}`,
                borderStyle: isDashed ? 'dashed' : 'solid'
              }}
            />
            <span className="text-xs text-slate-700" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif', color: color }}>
              {entry.value}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// 재고택금액 추이 차트용 커스텀 범례
const CustomInventoryLegend = ({ payload }: any) => {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-4 mt-4 flex-wrap" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}>
      {payload.map((entry: any, index: number) => {
        const isLine = entry.type === 'line';
        const color = entry.color || entry.fill || '#64748b';
        
        return (
          <div key={index} className="flex items-center gap-2">
            {isLine ? (
              <div className="w-4 h-0.5 rounded" style={{ backgroundColor: color }} />
            ) : (
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            )}
            <span className="text-xs text-slate-700" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}>
              {entry.value}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// 재고주수 추이 차트용 커스텀 툴팁
const CustomStockWeeksTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  const data = payload[0]?.payload;
  if (!data) return null;

  // 월 형식 변환 (2024-11 -> 24년 11월)
  const monthLabel = label || data.month || '';
  const formattedMonth = monthLabel.replace(/(\d{4})-(\d{2})/, (match: string, year: string, month: string) => {
    const shortYear = year.substring(2);
    return `${shortYear}년 ${parseInt(month)}월`;
  });

  // 당년 재고주수
  const stockWeeks = data.stockWeeks || 0;
  // 전년 재고주수
  const previousStockWeeks = data.previousStockWeeks || 0;
  // YOY 차이 (당년 - 전년)
  const weeksDiff = stockWeeks - previousStockWeeks;
  const isImproved = weeksDiff < 0;

  return (
    <div 
      className="border border-slate-200 rounded-lg shadow-lg p-4 min-w-[240px] bg-white" 
      style={{ 
        backgroundColor: '#ffffff',
        background: '#ffffff',
        opacity: 1,
        backdropFilter: 'none',
        zIndex: 9999
      }}
    >
      <div className="font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-200">
        {formattedMonth}
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#1e40af' }} />
            <span className="text-sm text-slate-600">당년 재고주수</span>
          </div>
          <span className="text-sm font-semibold text-slate-900">{stockWeeks.toFixed(1)}주</span>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#94a3b8' }} />
            <span className="text-sm text-slate-600">전년 재고주수</span>
          </div>
          <span className="text-sm font-semibold text-slate-900">{previousStockWeeks.toFixed(1)}주</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-600">YOY</span>
          <span className={`text-sm font-semibold ${isImproved ? 'text-emerald-600' : 'text-red-600'}`}>
            {isImproved ? '-' : '+'}{Math.abs(weeksDiff).toFixed(1)}주
          </span>
        </div>
      </div>
    </div>
  );
};

// 재고택금액 차트용 커스텀 툴팁
const CustomInventoryTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  const data = payload[0]?.payload;
  if (!data) return null;

  // 월 형식 변환 (2024-11 -> 24년 11월)
  const monthLabel = label || data.month || '';
  const formattedMonth = monthLabel.replace(/(\d{4})-(\d{2})/, (match: string, year: string, month: string) => {
    const shortYear = year.substring(2);
    return `${shortYear}년 ${parseInt(month)}월`;
  });

  // 당년 합계
  const totalStock = data.totalStock || 0;
  // 전년 합계
  const previousTotalStock = data.previousTotalStock || 0;
  // YOY
  const stockYOY = data.stockYOY || 0;

  // 시즌별 데이터 수집
  const seasonData = [
    { name: '당년-당시즌', value: data.currentSeasonStock || 0, color: '#3b82f6' },
    { name: '당년-차기시즌', value: data.nextSeasonStock || 0, color: '#8b5cf6' },
    { name: '당년-과시즌', value: data.oldSeasonStock || 0, color: '#94a3b8' },
    { name: '당년-정체재고', value: data.stagnantStock || 0, color: '#ef4444' },
    { name: '전년-당시즌', value: data.previousCurrentSeasonStock || 0, color: '#93c5fd' },
    { name: '전년-차기시즌', value: data.previousNextSeasonStock || 0, color: '#c4b5fd' },
    { name: '전년-과시즌', value: data.previousOldSeasonStock || 0, color: '#cbd5e1' },
    { name: '전년-정체재고', value: data.previousStagnantStock || 0, color: '#fca5a5' },
  ].filter(item => item.value > 0).sort((a, b) => b.value - a.value);

  return (
    <div 
      className="border border-slate-200 rounded-lg shadow-lg p-4 min-w-[280px] bg-white" 
      style={{ 
        backgroundColor: '#ffffff',
        background: '#ffffff',
        opacity: 1,
        backdropFilter: 'none',
        zIndex: 9999
      }}
    >
      <div className="font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-200">
        {formattedMonth}
      </div>
      
      <div className="space-y-2 mb-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-600">총재고택금액</span>
          <span className="text-sm font-semibold text-slate-900">{formatNumber(totalStock)}백만원</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-600">전년 재고택금액</span>
          <span className="text-sm font-semibold text-slate-900">{formatNumber(previousTotalStock)}백만원</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-600">YOY</span>
          <span className={`text-sm font-semibold ${stockYOY < 100 ? 'text-emerald-600' : 'text-red-600'}`}>
            {stockYOY.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-200">
        <div className="text-xs font-semibold text-slate-700 mb-2">시즌별 상세</div>
        <div className="space-y-1.5">
          {seasonData.map((item, index) => (
            <div key={index} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-sm" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-slate-600">{item.name}</span>
              </div>
              <span className="font-semibold text-slate-900">{formatNumber(item.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function BrandDashboard() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const brandId = params.brandId as string;
  const monthFromUrl = searchParams.get('month') || '2025-10';
  
  const [brand, setBrand] = useState(getBrandById(brandId));
  const [selectedMonth, setSelectedMonth] = useState(monthFromUrl);
  const [brandData, setBrandData] = useState<BrandDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [periodType, setPeriodType] = useState<'monthly' | 'accumulated'>('monthly'); // 당월/누적 토글
  const [selectedItem, setSelectedItem] = useState<string | null>(null); // 선택된 아이템 (shoes, hat, bag, other)
  const [productDetails, setProductDetails] = useState<ProductDetailResponse | null>(null); // 품번별 세부 데이터
  const [isLoadingDetails, setIsLoadingDetails] = useState(false); // 품번별 데이터 로딩 상태
  const [isDetailExpanded, setIsDetailExpanded] = useState<{ [key: string]: boolean }>({}); // 품번별 세부 내역 접기/펼치기 상태
  const [searchFilter, setSearchFilter] = useState<string>(''); // 검색 필터 (품번/품명)
  const [seasonFilter, setSeasonFilter] = useState<'all' | 'current' | 'old'>('all'); // 시즌 필터
  const [sortColumn, setSortColumn] = useState<'endingInventory' | 'salesAmount' | 'weeks' | null>(null); // 정렬 컬럼
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); // 정렬 방향
  const [weeksType, setWeeksType] = useState<'4weeks' | '8weeks' | '12weeks'>('12weeks'); // 4주/8주/12주 토글
  const [selectedItemForChart, setSelectedItemForChart] = useState<'all' | 'shoes' | 'hat' | 'bag' | 'other'>('all'); // 차트용 아이템 선택
  const [excludePurchase, setExcludePurchase] = useState<boolean>(false); // 사입제외 옵션
  const [chartData, setChartData] = useState<any>(null); // 차트 데이터
  const [isLoadingChart, setIsLoadingChart] = useState(false); // 차트 데이터 로딩 상태

  const monthOptions = getMonthOptions();

  useEffect(() => {
    const foundBrand = getBrandById(brandId);
    if (!foundBrand) {
      router.push('/');
      return;
    }
    setBrand(foundBrand);
  }, [brandId, router]);

  useEffect(() => {
    async function loadBrandSpecificData() {
      setIsLoading(true);
      try {
        const allData = await getRealData(selectedMonth);
        const data = allData.find((d) => d.brandId === brandId);
        setBrandData(data || null);
      } catch (error) {
        console.error(`브랜드 ${brandId} 데이터 로딩 실패, 샘플 데이터 사용:`, error);
        const allData = getSampleData(selectedMonth);
        const data = allData.find((d) => d.brandId === brandId);
        setBrandData(data || null);
      } finally {
        setIsLoading(false);
      }
    }
    loadBrandSpecificData();
  }, [selectedMonth, brandId]);

  // 선택된 아이템 변경 시 품번별 데이터 조회 및 자동 펼치기
  useEffect(() => {
    if (!selectedItem || !brand) {
      setProductDetails(null);
      return;
    }

    // 새로운 아이템 선택 시 자동으로 펼치기
    if (!isDetailExpanded[selectedItem]) {
      setIsDetailExpanded(prev => ({
        ...prev,
        [selectedItem]: true
      }));
    }

    const loadProductDetails = async () => {
      setIsLoadingDetails(true);
      try {
        const itemStd = getItemNameFromKey(selectedItem);
        const data = await fetchProductDetails(brand.code, itemStd, selectedMonth);
        setProductDetails(data);
      } catch (error) {
        console.error('품번별 데이터 로드 실패:', error);
        setProductDetails(null);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    loadProductDetails();
  }, [selectedItem, brand, selectedMonth]);

  // 차트 데이터 로드
  useEffect(() => {
    if (!brand) return;

    const loadChartData = async () => {
      setIsLoadingChart(true);
      try {
        const yyyymm = selectedMonth.replace(/-/g, '');
        const itemStd = selectedItemForChart === 'all' ? 'all' : getItemNameFromKey(selectedItemForChart);
        const url = `/api/dashboard/chart?brandCode=${encodeURIComponent(brand.code)}&yyyymm=${yyyymm}&weeksType=${weeksType}&itemStd=${encodeURIComponent(itemStd)}&excludePurchase=${excludePurchase}`;
        console.log('📊 차트 데이터 요청 URL:', url);
        
        const response = await fetch(url);
        console.log('📊 차트 데이터 응답 상태:', response.status);
        
        const result = await response.json();
        console.log('📊 차트 데이터 응답:', result);
        
        if (!response.ok) {
          throw new Error(result.error || `HTTP ${response.status}: 차트 데이터를 불러올 수 없습니다.`);
        }
        
        if (result.success && result.data) {
          console.log('✅ 차트 데이터 로드 성공:', result.data.length, '개 월');
          setChartData(result.data);
        } else {
          throw new Error(result.error || '차트 데이터를 불러올 수 없습니다.');
        }
      } catch (error) {
        console.error('❌ 차트 데이터 로드 실패:', error);
        console.error('❌ 에러 상세:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        setChartData(null);
      } finally {
        setIsLoadingChart(false);
      }
    };

    loadChartData();
  }, [brand, selectedMonth, weeksType, selectedItemForChart, excludePurchase]);

  if (!brand) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">로딩 중...</p>
      </div>
    );
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  const formatNumberWithDecimal = (num: number, decimals: number = 1) => {
    // 소수점을 유지하면서 천단위 콤마 적용
    if (isNaN(num) || num === null || num === undefined) return '0.0';
    const parts = num.toFixed(decimals).split('.');
    const integerPart = new Intl.NumberFormat('ko-KR').format(parseInt(parts[0]));
    return `${integerPart}.${parts[1]}`;
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
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                뒤로가기
              </Button>
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 ${brand.logoColor} rounded-2xl flex items-center justify-center shadow-lg`}>
                  <span className="text-white font-bold text-xl">{brand.code}</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                    {brand.name} 재고주수 대시보드
                  </h1>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* 당월/누적 토글 */}
              <div className="flex items-center gap-1 bg-blue-50 rounded-lg p-0.5 border border-blue-200">
                <button
                  onClick={() => setPeriodType('monthly')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                    periodType === 'monthly'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  당월
                </button>
                <button
                  onClick={() => setPeriodType('accumulated')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                    periodType === 'accumulated'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  누적
                </button>
              </div>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px]">
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
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="container mx-auto px-6 py-8">
        {brandData ? (
          <div className="space-y-6">
            {/* 아이템별 KPI 카드 */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {(() => {
                const periodData = periodType === 'accumulated' ? brandData.accumulated : brandData.monthly || brandData;
                const detail = periodData?.accInventoryDetail || brandData.accInventoryDetail;
                
                const items = [
                  { 
                    key: 'shoes', 
                    name: '신발', 
                    emoji: '👟',
                    data: detail?.shoes || { current: 0, previous: 0, weeks: 0, previousWeeks: 0, salesCurrent: 0, salesPrevious: 0 },
                    salesCurrent: detail?.shoes?.salesCurrent || 0,
                    salesPrevious: detail?.shoes?.salesPrevious || 0,
                    color: 'from-blue-50 to-blue-100',
                    borderColor: 'border-blue-200',
                    titleColor: 'text-blue-900',
                  },
                  { 
                    key: 'hat', 
                    name: '모자', 
                    emoji: '🧢',
                    data: detail?.hat || { current: 0, previous: 0, weeks: 0, previousWeeks: 0, salesCurrent: 0, salesPrevious: 0 },
                    salesCurrent: detail?.hat?.salesCurrent || 0,
                    salesPrevious: detail?.hat?.salesPrevious || 0,
                    color: 'from-emerald-50 to-emerald-100',
                    borderColor: 'border-emerald-200',
                    titleColor: 'text-emerald-900',
                  },
                  { 
                    key: 'bag', 
                    name: '가방', 
                    emoji: '🎒',
                    data: detail?.bag || { current: 0, previous: 0, weeks: 0, previousWeeks: 0, salesCurrent: 0, salesPrevious: 0 },
                    salesCurrent: detail?.bag?.salesCurrent || 0,
                    salesPrevious: detail?.bag?.salesPrevious || 0,
                    color: 'from-purple-50 to-purple-100',
                    borderColor: 'border-purple-200',
                    titleColor: 'text-purple-900',
                  },
                  { 
                    key: 'other', 
                    name: '기타ACC', 
                    emoji: '🧦',
                    data: detail?.other || { current: 0, previous: 0, weeks: 0, previousWeeks: 0, salesCurrent: 0, salesPrevious: 0 },
                    salesCurrent: detail?.other?.salesCurrent || 0,
                    salesPrevious: detail?.other?.salesPrevious || 0,
                    color: 'from-orange-50 to-orange-100',
                    borderColor: 'border-orange-200',
                    titleColor: 'text-orange-900',
                  },
                ];
                
                return items.map((item) => {
                const weeksDiff = item.data.weeks - item.data.previousWeeks;
                const isImproved = weeksDiff < 0;
                const inventoryYOY = item.data.previous > 0 
                  ? Math.round((item.data.current / item.data.previous) * 100) 
                  : 0;
                const salesYOY = item.salesPrevious > 0
                  ? Math.round((item.salesCurrent / item.salesPrevious) * 100)
                  : 0;
                const isSelected = selectedItem === item.key;

                // 동적 클래스 생성을 위한 색상 매핑
                const colorClasses: { [key: string]: { border: string; hover: string; selected: string } } = {
                  shoes: { border: 'border-blue-300', hover: 'hover:border-blue-400', selected: 'border-blue-500' },
                  hat: { border: 'border-emerald-300', hover: 'hover:border-emerald-400', selected: 'border-emerald-500' },
                  bag: { border: 'border-purple-300', hover: 'hover:border-purple-400', selected: 'border-purple-500' },
                  other: { border: 'border-orange-300', hover: 'hover:border-orange-400', selected: 'border-orange-500' },
                };
                
                const colorClass = colorClasses[item.key] || colorClasses.shoes;

                return (
                  <Card 
                    key={item.key} 
                    className={`shadow-sm border-slate-200 transition-all duration-300 cursor-pointer hover:shadow-lg ${colorClass.hover} ${
                      isSelected ? `border-2 ${colorClass.selected} shadow-lg scale-[1.02]` : ''
                    }`}
                    onClick={() => setSelectedItem(isSelected ? null : item.key)}
                  >
                    <CardHeader className="pb-0">
                      <CardTitle className={`text-lg font-bold ${item.titleColor} flex items-center gap-2`}>
                        <span>{item.emoji}</span>
                        <span>{item.name}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* 4x4 그리드: 첫 번째 열은 행 라벨, 나머지 3개 열은 데이터 */}
                      <div className="space-y-0">
                        {/* 헤더 행 */}
                        <div className="grid grid-cols-4 gap-2">
                          <div className="text-xs font-medium text-slate-600"></div>
                          <div className="text-xs font-medium text-slate-600 text-center">재고주수</div>
                          <div className="text-xs font-medium text-slate-600 text-center">기말재고</div>
                          <div className="text-xs font-medium text-slate-600 text-center">판매액</div>
                        </div>
                        
                        {/* 당년 행 */}
                        <div className="grid grid-cols-4 gap-2 items-center">
                          <div className="text-xs font-medium text-slate-600">당년</div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-900">
                              {item.data.weeks.toFixed(1)}주
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-900">
                              {formatNumber(item.data.current)}
                            </p>
                            <p className="text-xs text-slate-400">백만원</p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-900">
                              {formatNumber(item.salesCurrent)}
                            </p>
                            <p className="text-xs text-slate-400">백만원</p>
                          </div>
                        </div>
                        
                        {/* 전년 행 */}
                        <div className="grid grid-cols-4 gap-2 items-center">
                          <div className="text-xs font-medium text-slate-600">전년</div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-slate-700">
                              {item.data.previousWeeks.toFixed(1)}주
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-slate-700">
                              {formatNumber(item.data.previous)}
                            </p>
                            <p className="text-xs text-slate-400">백만원</p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-slate-700">
                              {formatNumber(item.salesPrevious)}
                            </p>
                            <p className="text-xs text-slate-400">백만원</p>
                          </div>
                        </div>
                        
                        {/* YOY/개선 행 */}
                        <div className="grid grid-cols-4 gap-2 items-center">
                          <div className="text-xs font-medium text-slate-600">YOY</div>
                          <div className="text-center">
                            <p className={`text-sm font-bold ${isImproved ? 'text-emerald-600' : 'text-red-600'}`}>
                              {isImproved ? '-' : '+'}
                              {Math.abs(weeksDiff).toFixed(1)}주
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-900">
                              {inventoryYOY}%
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-900">
                              {salesYOY}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              });
              })()}
            </div>

            {/* 4주 / 8주 / 12주 재고주수 비교 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>4주 / 8주 / 12주 재고주수 비교</CardTitle>
                    <CardDescription>
                      최근 12개월 재고주수 및 재고택금액 추이
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* 아이템 선택 */}
                    <div className="flex items-center gap-1 bg-emerald-50 rounded-lg p-0.5 border border-emerald-200">
                      <button
                        onClick={() => setSelectedItemForChart('all')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          selectedItemForChart === 'all'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        전체
                      </button>
                      <button
                        onClick={() => setSelectedItemForChart('shoes')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          selectedItemForChart === 'shoes'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        신발
                      </button>
                      <button
                        onClick={() => setSelectedItemForChart('hat')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          selectedItemForChart === 'hat'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        모자
                      </button>
                      <button
                        onClick={() => setSelectedItemForChart('bag')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          selectedItemForChart === 'bag'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        가방
                      </button>
                      <button
                        onClick={() => setSelectedItemForChart('other')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          selectedItemForChart === 'other'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        기타
                      </button>
                    </div>
                    {/* 4주/8주/12주 토글 */}
                    <div className="flex items-center gap-1 bg-blue-50 rounded-lg p-0.5 border border-blue-200">
                      <button
                        onClick={() => setWeeksType('4weeks')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          weeksType === '4weeks'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-blue-600 hover:bg-blue-100'
                        }`}
                      >
                        4주
                      </button>
                      <button
                        onClick={() => setWeeksType('8weeks')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          weeksType === '8weeks'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-blue-600 hover:bg-blue-100'
                        }`}
                      >
                        8주
                      </button>
                      <button
                        onClick={() => setWeeksType('12weeks')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          weeksType === '12weeks'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-blue-600 hover:bg-blue-100'
                        }`}
                      >
                        12주
                      </button>
                    </div>
                    {/* 사입제외 필터 */}
                    <div className="flex items-center gap-1 bg-orange-50 rounded-lg p-0.5 border border-orange-200">
                      <button
                        onClick={() => setExcludePurchase(false)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          !excludePurchase
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'text-orange-600 hover:bg-orange-100'
                        }`}
                      >
                        전체
                      </button>
                      <button
                        onClick={() => setExcludePurchase(true)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          excludePurchase
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'text-orange-600 hover:bg-orange-100'
                        }`}
                      >
                        사입제외
                      </button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingChart ? (
                  <div className="h-96 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
                    <span className="ml-3 text-slate-600">차트 데이터 로딩 중...</span>
                  </div>
                ) : chartData && chartData.length > 0 ? (
                  <div className="space-y-6">
                    {/* 재고주수 꺾은선 그래프 */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">재고주수 추이 (당년/전년)</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis 
                            dataKey="month" 
                            stroke="#64748b"
                            fontSize={12}
                            tick={{ fill: '#64748b' }}
                            domain={['dataMin', 'dataMax']}
                            padding={{ left: 0, right: 0 }}
                            angle={0}
                            height={60}
                            xAxisId={0}
                            allowDuplicatedCategory={false}
                          />
                          <YAxis 
                            stroke="#64748b"
                            fontSize={12}
                            tick={{ fill: '#64748b' }}
                            tickFormatter={(value) => new Intl.NumberFormat('ko-KR').format(value)}
                            width={60}
                            domain={(() => {
                              // chartData에서 모든 재고주수 값 수집
                              const allValues: number[] = [];
                              chartData.forEach((item: any) => {
                                if (item.stockWeeks != null && item.stockWeeks !== undefined) {
                                  allValues.push(item.stockWeeks);
                                }
                                if (item.previousStockWeeks != null && item.previousStockWeeks !== undefined) {
                                  allValues.push(item.previousStockWeeks);
                                }
                              });
                              
                              if (allValues.length === 0) return ['auto', 'auto'];
                              
                              const min = Math.min(...allValues);
                              const max = Math.max(...allValues);
                              
                              // 최소값-10주, 최대값+10주로 설정
                              return [Math.max(0, Math.floor(min - 10)), Math.ceil(max + 10)];
                            })()}
                          />
                          <Tooltip 
                            content={<CustomStockWeeksTooltip />}
                            contentStyle={{ 
                              backgroundColor: '#ffffff',
                              background: '#ffffff',
                              opacity: 1,
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: 0,
                              zIndex: 9999
                            }}
                            wrapperStyle={{ 
                              backgroundColor: '#ffffff',
                              background: '#ffffff',
                              opacity: 1,
                              zIndex: 9999
                            }}
                          />
                          <Legend content={<CustomStockWeeksLegend />} />
                          <Line 
                            type="natural" 
                            dataKey="stockWeeks" 
                            name="당년" 
                            stroke="#1e40af" 
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#1e40af' }}
                          />
                          <Line 
                            type="natural" 
                            dataKey="previousStockWeeks" 
                            name="전년" 
                            stroke="#94a3b8" 
                            strokeWidth={2.5}
                            strokeDasharray="5 5"
                            dot={{ r: 4, fill: '#94a3b8' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    
                    {/* 재고택금액 스택형 막대그래프 */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">재고택금액 추이 (시즌별, 백만원)-당년/전년 비교</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis 
                            dataKey="month" 
                            stroke="#64748b"
                            fontSize={12}
                            tick={{ fill: '#64748b' }}
                            domain={['dataMin', 'dataMax']}
                            padding={{ left: 0, right: 0 }}
                            angle={0}
                            height={60}
                            xAxisId={0}
                            allowDuplicatedCategory={false}
                          />
                          <YAxis 
                            yAxisId="left"
                            stroke="#64748b"
                            fontSize={12}
                            tick={{ fill: '#64748b' }}
                            tickFormatter={(value) => new Intl.NumberFormat('ko-KR').format(value)}
                            width={60}
                          />
                          <YAxis 
                            yAxisId="right"
                            orientation="right"
                            hide={true}
                          />
                          <Tooltip 
                            content={<CustomInventoryTooltip />}
                            contentStyle={{ 
                              backgroundColor: '#ffffff',
                              background: '#ffffff',
                              opacity: 1,
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: 0,
                              zIndex: 9999
                            }}
                            wrapperStyle={{ 
                              backgroundColor: '#ffffff',
                              background: '#ffffff',
                              opacity: 1,
                              zIndex: 9999
                            }}
                          />
                          <Legend content={<CustomInventoryLegend />} />
                          {/* 전년 스택형 막대 (먼저 그리기) */}
                          <Bar yAxisId="left" dataKey="previousNextSeasonStock" stackId="py" name="전년-차기시즌" fill="#c4b5fd" />
                          <Bar yAxisId="left" dataKey="previousCurrentSeasonStock" stackId="py" name="전년-당시즌" fill="#93c5fd" />
                          <Bar yAxisId="left" dataKey="previousOldSeasonStock" stackId="py" name="전년-과시즌" fill="#cbd5e1" />
                          <Bar yAxisId="left" dataKey="previousStagnantStock" stackId="py" name="전년-정체재고" fill="#fca5a5" />
                          {/* 당년 스택형 막대 (나중에 그리기) */}
                          <Bar yAxisId="left" dataKey="nextSeasonStock" stackId="cy" name="당년-차기시즌" fill="#8b5cf6" />
                          <Bar yAxisId="left" dataKey="currentSeasonStock" stackId="cy" name="당년-당시즌" fill="#3b82f6" />
                          <Bar yAxisId="left" dataKey="oldSeasonStock" stackId="cy" name="당년-과시즌" fill="#94a3b8" />
                          <Bar yAxisId="left" dataKey="stagnantStock" stackId="cy" name="당년-정체재고" fill="#ef4444" />
                          {/* YOY 라인 (Y축 표시 없이) */}
                          <Line 
                            yAxisId="right"
                            type="natural" 
                            dataKey="stockYOY" 
                            name="YOY" 
                            stroke="#ef4444" 
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#ef4444' }}
                            connectNulls={true}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="h-96 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
                    <p className="text-gray-400">차트 데이터를 불러올 수 없습니다.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 품번별 세부 내역 */}
            {selectedItem && (
              <Card className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsDetailExpanded(prev => ({
                            ...prev,
                            [selectedItem]: !prev[selectedItem]
                          }));
                        }}
                        className="text-slate-600 hover:text-slate-900 p-1"
                      >
                        {isDetailExpanded[selectedItem] ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </Button>
                      <div>
                        <CardTitle>{getItemNameFromKey(selectedItem)} 품번별 세부 내역</CardTitle>
                        <CardDescription>
                          {selectedMonth} 기준 품번별 재고 및 판매 현황
                        </CardDescription>
                        <p className="text-xs text-slate-500 mt-1">
                          현재 시즌: 25N, 26N {(() => {
                            const month = parseInt(selectedMonth.split('-')[1]);
                            if (month >= 9 || month <= 2) {
                              return ', 25F';
                            } else if (month >= 3 && month <= 8) {
                              return ', 25S';
                            }
                            return '';
                          })()} / 과거 시즌: 그 외 모든 시즌
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedItem(null);
                        setIsDetailExpanded(prev => ({
                          ...prev,
                          [selectedItem]: false
                        }));
                      }}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      닫기
                    </Button>
                  </div>
                </CardHeader>
                {isDetailExpanded[selectedItem] && (
                  <CardContent className="p-6">
                    {isLoadingDetails ? (
                      <div className="flex items-center justify-center py-12 px-6">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
                        <span className="ml-3 text-slate-600">품번별 데이터 로딩 중...</span>
                      </div>
                    ) : productDetails ? (
                      <div className="relative space-y-4">
                        {/* 필터 및 검색 영역 */}
                        <div className="flex flex-col sm:flex-row gap-3">
                          {/* 검색 필터 */}
                          <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                              type="text"
                              placeholder="품번 또는 품명으로 검색..."
                              value={searchFilter}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchFilter(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                          
                          {/* 시즌 필터 */}
                          <Select
                            value={seasonFilter}
                            onValueChange={(value: 'all' | 'current' | 'old') => setSeasonFilter(value)}
                          >
                            <SelectTrigger className="w-full sm:w-[180px]">
                              <SelectValue placeholder="시즌 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">전체 시즌</SelectItem>
                              <SelectItem value="current">현재 시즌</SelectItem>
                              <SelectItem value="old">과거 시즌</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 필터링 및 정렬된 데이터 */}
                        {(() => {
                          const data = periodType === 'accumulated' ? productDetails.accumulated : productDetails.monthly;
                          
                          // 필터링
                          let filtered = data.filter((product) => {
                            // 검색 필터
                            const searchLower = searchFilter.toLowerCase();
                            const matchesSearch = !searchFilter || 
                              product.productCode.toLowerCase().includes(searchLower) ||
                              (product.productName || '').toLowerCase().includes(searchLower);
                            
                            // 시즌 필터
                            const matchesSeason = seasonFilter === 'all' ||
                              (seasonFilter === 'current' && product.seasonCategory === 'current') ||
                              (seasonFilter === 'old' && product.seasonCategory === 'old');
                            
                            return matchesSearch && matchesSeason;
                          });
                          
                          // 정렬
                          if (sortColumn) {
                            filtered = [...filtered].sort((a, b) => {
                              let aValue: number;
                              let bValue: number;
                              
                              switch (sortColumn) {
                                case 'endingInventory':
                                  aValue = a.endingInventory;
                                  bValue = b.endingInventory;
                                  break;
                                case 'salesAmount':
                                  aValue = a.salesAmount;
                                  bValue = b.salesAmount;
                                  break;
                                case 'weeks':
                                  aValue = a.weeks;
                                  bValue = b.weeks;
                                  break;
                                default:
                                  return 0;
                              }
                              
                              if (sortDirection === 'asc') {
                                return aValue - bValue;
                              } else {
                                return bValue - aValue;
                              }
                            });
                          }
                          
                          // 시즌별 그룹핑
                          const currentSeasonProducts = filtered.filter(p => p.seasonCategory === 'current');
                          const oldSeasonProducts = filtered.filter(p => p.seasonCategory === 'old');
                          
                          return (
                            <div className="space-y-6">
                              {/* 현재 시즌 */}
                              {currentSeasonProducts.length > 0 && (
                                <div>
                                  <div className="mb-3 flex items-center gap-2">
                                    <div className="h-1 w-1 rounded-full bg-blue-500"></div>
                                    <h3 className="text-sm font-semibold text-slate-700">
                                      현재 시즌 ({(() => {
                                        const month = parseInt(selectedMonth.split('-')[1]);
                                        let seasons = '25N, 26N';
                                        if (month >= 9 || month <= 2) {
                                          seasons += ', 25F';
                                        } else if (month >= 3 && month <= 8) {
                                          seasons += ', 25S';
                                        }
                                        return seasons;
                                      })()}) - {currentSeasonProducts.length}개
                                    </h3>
                                  </div>
                                  <div className="overflow-x-auto overflow-y-auto max-h-[600px] border rounded-lg">
                                    <table className="w-full border-collapse table-fixed">
                                      <colgroup>
                                        <col className="w-[120px]" />
                                        <col className="w-[200px]" />
                                        <col className="w-[140px]" />
                                        <col className="w-[140px]" />
                                        <col className="w-[140px]" />
                                        <col className="w-[100px]" />
                                        <col className="w-[100px]" />
                                      </colgroup>
                                      <thead className="sticky top-0 z-10 bg-white shadow-sm">
                                        <tr className="border-b border-slate-200">
                                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-white">품번</th>
                                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-white">품명</th>
                                          <th 
                                            className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white cursor-pointer hover:bg-slate-50"
                                            onClick={() => {
                                              if (sortColumn === 'weeks') {
                                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                              } else {
                                                setSortColumn('weeks');
                                                setSortDirection('desc');
                                              }
                                            }}
                                          >
                                            <div className="flex items-center justify-center gap-1">
                                              재고주수
                                              {sortColumn === 'weeks' && (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                              )}
                                            </div>
                                          </th>
                                          <th 
                                            className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white cursor-pointer hover:bg-slate-50"
                                            onClick={() => {
                                              if (sortColumn === 'endingInventory') {
                                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                              } else {
                                                setSortColumn('endingInventory');
                                                setSortDirection('desc');
                                              }
                                            }}
                                          >
                                            <div className="flex items-center justify-center gap-1">
                                              기말재고
                                              {sortColumn === 'endingInventory' && (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                              )}
                                            </div>
                                          </th>
                                          <th 
                                            className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white cursor-pointer hover:bg-slate-50"
                                            onClick={() => {
                                              if (sortColumn === 'salesAmount') {
                                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                              } else {
                                                setSortColumn('salesAmount');
                                                setSortDirection('desc');
                                              }
                                            }}
                                          >
                                            <div className="flex items-center justify-center gap-1">
                                              판매액
                                              {sortColumn === 'salesAmount' && (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                              )}
                                            </div>
                                          </th>
                                          <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white">재고 YOY</th>
                                          <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white">판매 YOY</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {currentSeasonProducts.map((product) => {
                                          const weeksDiff = product.weeks - product.previousWeeks;
                                          const isImproved = weeksDiff < 0;
                                          return (
                                            <tr key={product.productCode} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                              <td className="py-3 px-4 text-sm font-mono text-slate-900">{product.productCode}</td>
                                              <td className="py-3 px-4 text-sm text-slate-700">{product.productName || '-'}</td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <div>
                                                  <p className="font-semibold text-slate-900">{formatNumberWithDecimal(product.weeks)}주</p>
                                                  <p className="text-xs text-slate-500">전년 {formatNumberWithDecimal(product.previousWeeks)}주</p>
                                                  <p className={`text-xs font-semibold ${isImproved ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {isImproved ? '-' : '+'}{formatNumberWithDecimal(Math.abs(weeksDiff))}주
                                                  </p>
                                                </div>
                                              </td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <div>
                                                  <p className="font-semibold text-slate-900">{formatNumber(product.endingInventory)}백만원</p>
                                                  <p className="text-xs text-slate-500">전년 {formatNumber(product.previousEndingInventory)}백만원</p>
                                                </div>
                                              </td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <div>
                                                  <p className="font-semibold text-slate-900">{formatNumber(product.salesAmount)}백만원</p>
                                                  <p className="text-xs text-slate-500">전년 {formatNumber(product.previousSalesAmount)}백만원</p>
                                                </div>
                                              </td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <span className={`font-semibold ${product.inventoryYOY >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                  {formatNumber(product.inventoryYOY)}%
                                                </span>
                                              </td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <span className={`font-semibold ${product.salesYOY >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                  {formatNumber(product.salesYOY)}%
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              
                              {/* 과거 시즌 */}
                              {oldSeasonProducts.length > 0 && (
                                <div>
                                  <div className="mb-3 flex items-center gap-2">
                                    <div className="h-1 w-1 rounded-full bg-slate-400"></div>
                                    <h3 className="text-sm font-semibold text-slate-700">이전 시즌 (그 외 모든 시즌) - {oldSeasonProducts.length}개</h3>
                                  </div>
                                  <div className="overflow-x-auto overflow-y-auto max-h-[600px] border rounded-lg">
                                    <table className="w-full border-collapse table-fixed">
                                      <colgroup>
                                        <col className="w-[120px]" />
                                        <col className="w-[200px]" />
                                        <col className="w-[140px]" />
                                        <col className="w-[140px]" />
                                        <col className="w-[140px]" />
                                        <col className="w-[100px]" />
                                        <col className="w-[100px]" />
                                      </colgroup>
                                      <thead className="sticky top-0 z-10 bg-white shadow-sm">
                                        <tr className="border-b border-slate-200">
                                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-white">품번</th>
                                          <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-white">품명</th>
                                          <th 
                                            className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white cursor-pointer hover:bg-slate-50"
                                            onClick={() => {
                                              if (sortColumn === 'weeks') {
                                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                              } else {
                                                setSortColumn('weeks');
                                                setSortDirection('desc');
                                              }
                                            }}
                                          >
                                            <div className="flex items-center justify-center gap-1">
                                              재고주수
                                              {sortColumn === 'weeks' && (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                              )}
                                            </div>
                                          </th>
                                          <th 
                                            className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white cursor-pointer hover:bg-slate-50"
                                            onClick={() => {
                                              if (sortColumn === 'endingInventory') {
                                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                              } else {
                                                setSortColumn('endingInventory');
                                                setSortDirection('desc');
                                              }
                                            }}
                                          >
                                            <div className="flex items-center justify-center gap-1">
                                              기말재고
                                              {sortColumn === 'endingInventory' && (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                              )}
                                            </div>
                                          </th>
                                          <th 
                                            className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white cursor-pointer hover:bg-slate-50"
                                            onClick={() => {
                                              if (sortColumn === 'salesAmount') {
                                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                              } else {
                                                setSortColumn('salesAmount');
                                                setSortDirection('desc');
                                              }
                                            }}
                                          >
                                            <div className="flex items-center justify-center gap-1">
                                              판매액
                                              {sortColumn === 'salesAmount' && (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                              )}
                                            </div>
                                          </th>
                                          <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white">재고 YOY</th>
                                          <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700 bg-white">판매 YOY</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {oldSeasonProducts.map((product) => {
                                          const weeksDiff = product.weeks - product.previousWeeks;
                                          const isImproved = weeksDiff < 0;
                                          return (
                                            <tr key={product.productCode} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                              <td className="py-3 px-4 text-sm font-mono text-slate-900">{product.productCode}</td>
                                              <td className="py-3 px-4 text-sm text-slate-700">{product.productName || '-'}</td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <div>
                                                  <p className="font-semibold text-slate-900">{formatNumberWithDecimal(product.weeks)}주</p>
                                                  <p className="text-xs text-slate-500">전년 {formatNumberWithDecimal(product.previousWeeks)}주</p>
                                                  <p className={`text-xs font-semibold ${isImproved ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {isImproved ? '-' : '+'}{formatNumberWithDecimal(Math.abs(weeksDiff))}주
                                                  </p>
                                                </div>
                                              </td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <div>
                                                  <p className="font-semibold text-slate-900">{formatNumber(product.endingInventory)}백만원</p>
                                                  <p className="text-xs text-slate-500">전년 {formatNumber(product.previousEndingInventory)}백만원</p>
                                                </div>
                                              </td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <div>
                                                  <p className="font-semibold text-slate-900">{formatNumber(product.salesAmount)}백만원</p>
                                                  <p className="text-xs text-slate-500">전년 {formatNumber(product.previousSalesAmount)}백만원</p>
                                                </div>
                                              </td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <span className={`font-semibold ${product.inventoryYOY >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                  {formatNumber(product.inventoryYOY)}%
                                                </span>
                                              </td>
                                              <td className="py-3 px-4 text-sm text-center">
                                                <span className={`font-semibold ${product.salesYOY >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                  {formatNumber(product.salesYOY)}%
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              
                              {filtered.length === 0 && (
                                <div className="text-center py-8 px-6 text-slate-500">
                                  조건에 맞는 품번 데이터가 없습니다.
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="text-center py-8 px-6 text-slate-500">
                        데이터를 불러올 수 없습니다.
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <CardTitle>데이터를 불러올 수 없습니다</CardTitle>
              <CardDescription>
                선택한 월의 데이터가 없습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => router.push('/')} variant="outline">
                브랜드 선택으로 돌아가기
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
