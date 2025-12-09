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
import { ArrowLeft, BarChart3, AlertTriangle, ChevronDown, ChevronUp, Search, ArrowUp, ArrowDown, Download } from 'lucide-react';

// 커스텀 saveAs 함수 (file-saver 대체)
const saveAs = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  
  // 클릭 이벤트를 비동기로 트리거
  setTimeout(() => {
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 250);
  }, 0);
};
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, TooltipProps, LabelList } from 'recharts';
import ForecastInputPanel from '@/components/ForecastInputPanel';
import { combineActualAndForecast } from '@/lib/forecast-service';
import { OrderCapacity } from '@/lib/forecast-types';

// 재고주수 추이 차트용 커스텀 범례
const CustomStockWeeksLegend = ({ payload }: any) => {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-4 mt-4 flex-wrap" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}>
      {payload.map((entry: any, index: number) => {
        const color = entry.color || '#64748b';
        const isDashed = entry.strokeDasharray;
        
        const divStyle = isDashed 
          ? {
              backgroundColor: 'transparent',
              borderWidth: '2px',
              borderStyle: 'dashed' as const,
              borderColor: color
            }
          : {
              backgroundColor: color,
              borderWidth: '2px',
              borderStyle: 'solid' as const,
              borderColor: color
            };
        
        return (
          <div key={index} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={divStyle}
            />
            <span className="text-xs text-slate-700" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}>
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
  const monthLabel = typeof label === 'string' ? label : (data.month || '');
  const formattedMonth = String(monthLabel).replace(/(\d{4})-(\d{2})/, (match: string, year: string, month: string) => {
    const shortYear = year.substring(2);
    return `${shortYear}년 ${parseInt(month)}월`;
  });

  // 전체 재고주수
  const stockWeeks = data.stockWeeks || 0;
  const previousStockWeeks = data.previousStockWeeks || 0;
  const weeksDiff = stockWeeks - previousStockWeeks;
  const isImproved = weeksDiff < 0;

  // 정상재고 재고주수 (전체 - 정체재고)
  const stockWeeksNormal = data.stockWeeksNormal || 0;
  const previousStockWeeksNormal = data.previousStockWeeksNormal || 0;
  const weeksDiffNormal = stockWeeksNormal - previousStockWeeksNormal;
  const isImprovedNormal = weeksDiffNormal < 0;

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
      
      <div className="space-y-3">
        {/* 전체 재고 */}
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">전체 재고</div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#1e3a8a' }} />
                <span className="text-xs text-slate-600">당년</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{stockWeeks.toFixed(1)}주</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full border-2 border-dashed" style={{ borderColor: '#3b82f6' }} />
                <span className="text-xs text-slate-600">전년</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{previousStockWeeks.toFixed(1)}주</span>
            </div>
            <div className="flex justify-between items-center pl-4">
              <span className="text-xs text-slate-500">YOY</span>
              <span className={`text-xs font-semibold ${isImproved ? 'text-emerald-600' : 'text-red-600'}`}>
                {isImproved ? '-' : '+'}{Math.abs(weeksDiff).toFixed(1)}주
              </span>
            </div>
          </div>
        </div>

        {/* 정상재고 (전체 - 정체재고) */}
        <div className="pt-2 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-1.5">정상재고 (전체 - 정체재고)</div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f97316' }} />
                <span className="text-xs text-slate-600">당년</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{stockWeeksNormal.toFixed(1)}주</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full border-2 border-dashed" style={{ borderColor: '#fdba74' }} />
                <span className="text-xs text-slate-600">전년</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{previousStockWeeksNormal.toFixed(1)}주</span>
            </div>
            <div className="flex justify-between items-center pl-4">
              <span className="text-xs text-slate-500">YOY</span>
              <span className={`text-xs font-semibold ${isImprovedNormal ? 'text-emerald-600' : 'text-red-600'}`}>
                {isImprovedNormal ? '-' : '+'}{Math.abs(weeksDiffNormal).toFixed(1)}주
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 재고택금액 차트용 커스텀 비율 Label
const CustomRatioLabel = ({ x, y, width, height, value }: any) => {
  // value는 비율 값 (%)
  const ratio = typeof value === 'number' ? value : 0;
  
  // 비율이 0 이하이거나 막대가 너무 작으면 표시하지 않음
  if (ratio <= 0 || height < 20) return null;
  
  // 막대의 중간 위치 계산
  const labelX = x + width / 2;
  const labelY = y + height / 2;
  
  return (
    <text
      x={labelX}
      y={labelY}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={11}
      fontWeight="bold"
      style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}
    >
      {ratio}%
    </text>
  );
};

// 재고택금액 차트용 커스텀 툴팁
const CustomInventoryTooltip = ({ active, payload, label, mode }: any) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  const formatWeeks = (weeks: number) => {
    if (weeks === 0) return '-';
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(weeks) + '주';
  };

  const data = payload[0]?.payload;
  if (!data) return null;

  // 월 형식 변환 (2024-11 -> 24년 11월)
  const monthLabel = typeof label === 'string' ? label : (data.month || '');
  const formattedMonth = String(monthLabel).replace(/(\d{4})-(\d{2})/, (match: string, year: string, month: string) => {
    const shortYear = year.substring(2);
    return `${shortYear}년 ${parseInt(month)}월`;
  });

  // 당년 합계
  const totalStock = data.totalStock || 0;
  // 전년 합계
  const previousTotalStock = data.previousTotalStock || 0;
  // YOY
  const stockYOY = data.stockYOY || 0;
  // 당년 매출액
  const totalSale = data.totalSale || 0;

  // 매출액대비 모드일 때는 당년 재고택금액, 매출액, 재고주수 표시
  if (mode === 'sales') {
    // 전체 재고주수
    const stockWeeks = data.stockWeeks || 0;
    
    // 시즌별 재고주수 계산 (시즌별 재고택금액 / (시즌별 매출액 / 30 * 7))
    const calculateSeasonWeeks = (stock: number, sale: number) => {
      if (sale > 0 && (sale / 30 * 7) > 0) {
        return Math.round((stock / (sale / 30 * 7)) * 10) / 10;
      }
      return 0;
    };
    
    const oldSeasonWeeks = calculateSeasonWeeks(data.oldSeasonStock || 0, data.oldSeasonSale || 0);
    const currentSeasonWeeks = calculateSeasonWeeks(data.currentSeasonStock || 0, data.currentSeasonSale || 0);
    const nextSeasonWeeks = calculateSeasonWeeks(data.nextSeasonStock || 0, data.nextSeasonSale || 0);
    const stagnantWeeks = calculateSeasonWeeks(data.stagnantStock || 0, data.stagnantSale || 0);
    
    return (
      <div 
        className="border border-slate-200 rounded-lg shadow-lg p-4 min-w-[320px] bg-white" 
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
            <span className="text-sm text-slate-600">당년 재고택금액</span>
            <span className="text-sm font-semibold text-slate-900">{formatNumber(totalStock)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">당년 매출액</span>
            <span className="text-sm font-semibold text-slate-900">
              {formatNumber(totalSale)}
              {data.saleYOY > 0 && (
                <span className="ml-2 text-xs text-red-500">({data.saleYOY.toFixed(1)}%)</span>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">재고주수</span>
            <span className="text-sm font-semibold text-slate-900">{formatWeeks(stockWeeks)}</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-700 mb-2">시즌별 상세</div>
          <div className="space-y-2">
            {/* 과시즌 */}
            {((data.oldSeasonStock || 0) > 0 || (data.oldSeasonSale || 0) > 0) && (
              <div className="text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#94a3b8' }} />
                  <span className="text-slate-600 font-medium">과시즌</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pl-5 text-xs">
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">재고택금액</span>
                    <span className="font-semibold text-slate-900">{formatNumber(data.oldSeasonStock || 0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">매출액</span>
                    <span className="font-semibold text-slate-900">{formatNumber(data.oldSeasonSale || 0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">재고주수</span>
                    <span className="font-semibold text-slate-900">{formatWeeks(oldSeasonWeeks)}</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* 당시즌 */}
            {((data.currentSeasonStock || 0) > 0 || (data.currentSeasonSale || 0) > 0) && (
              <div className="text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
                  <span className="text-slate-600 font-medium">당시즌</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pl-5 text-xs">
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">재고택금액</span>
                    <span className="font-semibold text-slate-900">{formatNumber(data.currentSeasonStock || 0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">매출액</span>
                    <span className="font-semibold text-slate-900">{formatNumber(data.currentSeasonSale || 0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">재고주수</span>
                    <span className="font-semibold text-slate-900">{formatWeeks(currentSeasonWeeks)}</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* 차기시즌 */}
            {((data.nextSeasonStock || 0) > 0 || (data.nextSeasonSale || 0) > 0) && (
              <div className="text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#8b5cf6' }} />
                  <span className="text-slate-600 font-medium">차기시즌</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pl-5 text-xs">
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">재고택금액</span>
                    <span className="font-semibold text-slate-900">{formatNumber(data.nextSeasonStock || 0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">매출액</span>
                    <span className="font-semibold text-slate-900">{formatNumber(data.nextSeasonSale || 0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">재고주수</span>
                    <span className="font-semibold text-slate-900">{formatWeeks(nextSeasonWeeks)}</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* 정체재고 */}
            {((data.stagnantStock || 0) > 0 || (data.stagnantSale || 0) > 0) && (
              <div className="text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
                  <span className="text-slate-600 font-medium">정체재고</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pl-5 text-xs">
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">재고택금액</span>
                    <span className="font-semibold text-slate-900">{formatNumber(data.stagnantStock || 0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">매출액</span>
                    <span className="font-semibold text-slate-900">{formatNumber(data.stagnantSale || 0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] mb-0.5">재고주수</span>
                    <span className="font-semibold text-slate-900">{formatWeeks(stagnantWeeks)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 전년대비 모드일 때는 기존처럼 표시
  return (
    <div 
      className="border border-slate-200 rounded-lg shadow-lg p-4 min-w-[320px] bg-white" 
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
          <span className="text-sm text-slate-600">당년 재고택금액</span>
          <span className="text-sm font-semibold text-slate-900">{formatNumber(totalStock)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-600">전년 재고택금액</span>
          <span className="text-sm font-semibold text-slate-900">{formatNumber(previousTotalStock)}</span>
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
        <div className="space-y-2">
          {/* 과시즌 */}
          {((data.oldSeasonStock || 0) > 0 || (data.previousOldSeasonStock || 0) > 0) && (
            <div className="text-xs">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#94a3b8' }} />
                <span className="text-slate-600 font-medium">과시즌</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pl-5 text-xs">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">당년</span>
                  <span className="font-semibold text-slate-900">{formatNumber(data.oldSeasonStock || 0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">전년</span>
                  <span className="font-semibold text-slate-900">{formatNumber(data.previousOldSeasonStock || 0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">YOY</span>
                  <span className={`font-semibold ${(data.oldSeasonStock || 0) - (data.previousOldSeasonStock || 0) < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {((data.oldSeasonStock || 0) - (data.previousOldSeasonStock || 0)) >= 0 ? '+' : ''}{formatNumber((data.oldSeasonStock || 0) - (data.previousOldSeasonStock || 0))}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* 당시즌 */}
          {((data.currentSeasonStock || 0) > 0 || (data.previousCurrentSeasonStock || 0) > 0) && (
            <div className="text-xs">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
                <span className="text-slate-600 font-medium">당시즌</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pl-5 text-xs">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">당년</span>
                  <span className="font-semibold text-slate-900">{formatNumber(data.currentSeasonStock || 0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">전년</span>
                  <span className="font-semibold text-slate-900">{formatNumber(data.previousCurrentSeasonStock || 0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">YOY</span>
                  <span className={`font-semibold ${(data.currentSeasonStock || 0) - (data.previousCurrentSeasonStock || 0) < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {((data.currentSeasonStock || 0) - (data.previousCurrentSeasonStock || 0)) >= 0 ? '+' : ''}{formatNumber((data.currentSeasonStock || 0) - (data.previousCurrentSeasonStock || 0))}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* 차기시즌 */}
          {((data.nextSeasonStock || 0) > 0 || (data.previousNextSeasonStock || 0) > 0) && (
            <div className="text-xs">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#8b5cf6' }} />
                <span className="text-slate-600 font-medium">차기시즌</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pl-5 text-xs">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">당년</span>
                  <span className="font-semibold text-slate-900">{formatNumber(data.nextSeasonStock || 0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">전년</span>
                  <span className="font-semibold text-slate-900">{formatNumber(data.previousNextSeasonStock || 0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">YOY</span>
                  <span className={`font-semibold ${(data.nextSeasonStock || 0) - (data.previousNextSeasonStock || 0) < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {((data.nextSeasonStock || 0) - (data.previousNextSeasonStock || 0)) >= 0 ? '+' : ''}{formatNumber((data.nextSeasonStock || 0) - (data.previousNextSeasonStock || 0))}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* 정체재고 */}
          {((data.stagnantStock || 0) > 0 || (data.previousStagnantStock || 0) > 0) && (
            <div className="text-xs">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
                <span className="text-slate-600 font-medium">정체재고</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pl-5 text-xs">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">당년</span>
                  <span className="font-semibold text-slate-900">{formatNumber(data.stagnantStock || 0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">전년</span>
                  <span className="font-semibold text-slate-900">{formatNumber(data.previousStagnantStock || 0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] mb-0.5">YOY</span>
                  <span className={`font-semibold ${(data.stagnantStock || 0) - (data.previousStagnantStock || 0) < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {((data.stagnantStock || 0) - (data.previousStagnantStock || 0)) >= 0 ? '+' : ''}{formatNumber((data.stagnantStock || 0) - (data.previousStagnantStock || 0))}
                  </span>
                </div>
              </div>
            </div>
          )}
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
  const [seasonFilter, setSeasonFilter] = useState<'all' | 'current' | 'next' | 'stagnant' | 'old'>('all'); // 시즌 필터
  const [sortColumn, setSortColumn] = useState<'endingInventory' | 'salesAmount' | 'weeks' | null>(null); // 정렬 컬럼
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); // 정렬 방향
  const [weeksType, setWeeksType] = useState<'4weeks' | '8weeks' | '12weeks'>('4weeks'); // 4주/8주/12주 토글
  const [selectedItemForChart, setSelectedItemForChart] = useState<'all' | 'shoes' | 'hat' | 'bag' | 'other'>('all'); // 차트용 아이템 선택
  const [excludePurchase, setExcludePurchase] = useState<boolean>(false); // 사입제외 옵션
  const [chartBase, setChartBase] = useState<'amount' | 'quantity'>('amount'); // 금액기준/수량기준 토글
  const [chartData, setChartData] = useState<any>(null); // 차트 데이터
  const [isLoadingChart, setIsLoadingChart] = useState(false); // 차트 데이터 로딩 상태
  const [inventoryChartMode, setInventoryChartMode] = useState<'yoy' | 'sales'>('yoy'); // 재고택금액 추이 차트 모드 (전년대비/매출액대비)
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<any>(null); // 클릭한 품번 상세정보
  const [productMonthlyTrend, setProductMonthlyTrend] = useState<any[]>([]); // 품번별 월별 추이 데이터
  const [isLoadingMonthlyTrend, setIsLoadingMonthlyTrend] = useState(false); // 월별 추이 로딩 상태
  const [excludeSeasonFilter, setExcludeSeasonFilter] = useState<'all' | 'excludeS' | 'excludeF'>('all'); // 시즌 제외 필터
  const [dxMasterData, setDxMasterData] = useState<Record<string, string>>({}); // DX MASTER 품번별 서브카테고리 데이터
  
  // 예측 관련 상태
  const [forecastResults, setForecastResults] = useState<any[]>([]); // 예측 결과
  const [orderCapacity, setOrderCapacity] = useState<OrderCapacity | null>(null); // 발주가능 금액
  const [combinedChartData, setCombinedChartData] = useState<any[]>([]); // 실적 + 예측 결합 데이터

  const monthOptions = getMonthOptions();

  // DX MASTER 데이터 로드 (디스커버리 브랜드용)
  useEffect(() => {
    async function loadDxMasterData() {
      try {
        const response = await fetch('/dx-master.json');
        if (response.ok) {
          const data = await response.json();
          setDxMasterData(data);
          console.log('📦 DX MASTER 데이터 로드 완료:', Object.keys(data).length, '개 품번');
        }
      } catch (error) {
        console.error('DX MASTER 데이터 로드 실패:', error);
      }
    }
    loadDxMasterData();
  }, []);

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
        const url = `/api/dashboard/chart?brandCode=${encodeURIComponent(brand.code)}&yyyymm=${yyyymm}&weeksType=${weeksType}&itemStd=${encodeURIComponent(itemStd)}&excludePurchase=${excludePurchase}&base=${chartBase}`;
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
  }, [brand, selectedMonth, weeksType, selectedItemForChart, excludePurchase, chartBase]);

  // 예측 데이터와 실적 데이터 결합
  useEffect(() => {
    if (!chartData || chartData.length === 0) {
      setCombinedChartData([]);
      return;
    }

    if (forecastResults.length === 0) {
      // 예측 데이터가 없으면 실적 데이터만 사용
      setCombinedChartData(chartData.map((d: any) => ({ ...d, isActual: true })));
    } else {
      // 예측 데이터와 결합
      const combined = combineActualAndForecast(chartData, forecastResults);
      setCombinedChartData(combined);
    }
  }, [chartData, forecastResults]);

  // 예측 계산 완료 콜백
  const handleForecastCalculated = (results: any[], capacity: OrderCapacity | null) => {
    setForecastResults(results);
    setOrderCapacity(capacity);
    console.log('✅ 예측 계산 완료:', results.length, '개 월');
    console.log('📊 발주가능 금액:', capacity);
  };

  // 품번별 월별 추이 데이터 로드
  useEffect(() => {
    if (!selectedProductForDetail || !brand) {
      setProductMonthlyTrend([]);
      return;
    }

    const loadMonthlyTrend = async () => {
      setIsLoadingMonthlyTrend(true);
      try {
        const yyyymm = selectedMonth.replace(/-/g, '');
        const url = `/api/dashboard/product/monthly-trend?brandCode=${encodeURIComponent(brand.code)}&productCode=${encodeURIComponent(selectedProductForDetail.productCode)}&endMonth=${yyyymm}`;
        console.log('📊 품번 월별 추이 요청:', url);
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success && result.data?.monthlyTrend) {
          console.log('✅ 품번 월별 추이 로드 성공:', result.data.monthlyTrend.length, '개월');
          setProductMonthlyTrend(result.data.monthlyTrend);
        } else {
          console.error('❌ 품번 월별 추이 로드 실패:', result.error);
          setProductMonthlyTrend([]);
        }
      } catch (error) {
        console.error('❌ 품번 월별 추이 로드 에러:', error);
        setProductMonthlyTrend([]);
      } finally {
        setIsLoadingMonthlyTrend(false);
      }
    };

    loadMonthlyTrend();
  }, [selectedProductForDetail, brand, selectedMonth]);

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
                    onClick={() => {
                      const newItem = isSelected ? null : item.key;
                      setSelectedItem(newItem);
                      // 카드 클릭 시 차트 필터도 연동 (YOY 정확도 향상)
                      if (newItem) {
                        setSelectedItemForChart(newItem as 'all' | 'shoes' | 'hat' | 'bag' | 'other');
                      }
                    }}
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
                        <div className="grid grid-cols-4 gap-2 py-2 px-3">
                          <div className="text-xs font-medium text-slate-600"></div>
                          <div className="text-xs font-medium text-slate-600 text-center">재고주수</div>
                          <div className="text-xs font-medium text-slate-600 text-center">기말재고</div>
                          <div className="text-xs font-medium text-slate-600 text-center">판매액</div>
                        </div>
                        
                        {/* 당년 행 */}
                        <div className="grid grid-cols-4 gap-2 items-center py-2 px-3 rounded-lg bg-yellow-50">
                          <div className="text-xs font-medium text-slate-600">당년</div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-900">
                              {item.data.weeks.toFixed(1)}주
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-blue-900">
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
                        <div className="grid grid-cols-4 gap-2 items-center py-2 px-3">
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
                        <div className="grid grid-cols-4 gap-2 items-center py-2 px-3">
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

            {/* 재고 예측 입력 패널 */}
            {brand && chartData && chartData.length > 0 && (
              <ForecastInputPanel
                brandCode={brand.code}
                brandName={brand.name}
                lastActualMonth={selectedMonth}
                actualData={chartData}
                weeksType={weeksType}
                selectedItem={selectedItemForChart}
                onForecastCalculated={handleForecastCalculated}
              />
            )}

            {/* 발주가능 금액 표시 */}
            {orderCapacity && (
              <Card className="mb-6 border-green-200 bg-green-50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="w-full">
                      <h3 className="text-lg font-bold text-green-800 mb-3">
                        💰 신규 발주가능 금액 (4개월 후: {orderCapacity.targetMonth})
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-slate-500 text-xs mb-1">기준재고주수</div>
                          <div className="font-bold text-slate-800 text-lg">
                            {orderCapacity.baseStockWeeks.toFixed(1)}주
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-slate-500 text-xs mb-1">
                            주간평균판매액
                            <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                              YOY {orderCapacity.yoyRate}%
                            </span>
                            <span className="ml-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                              {orderCapacity.weeksType === '4weeks' ? '4주' : orderCapacity.weeksType === '8weeks' ? '8주' : '12주'}기준
                            </span>
                          </div>
                          <div className="font-bold text-slate-800 text-lg">
                            {orderCapacity.weeklyAvgSales.toLocaleString()}백만원
                          </div>
                          <div className="text-slate-400 text-xs mt-1">
                            = {orderCapacity.monthlyAvgSales.toLocaleString()}백만원/월 ÷ 30 × 7
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-slate-500 text-xs mb-1">목표재고 ({orderCapacity.baseStockWeeks}주 × {orderCapacity.weeklyAvgSales.toLocaleString()})</div>
                          <div className="font-bold text-blue-600 text-lg">
                            {orderCapacity.targetStock.toLocaleString()}백만원
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-slate-500 text-xs mb-1">예상재고 ({orderCapacity.targetMonth})</div>
                          <div className="font-bold text-slate-800 text-lg">
                            {orderCapacity.currentForecastStock.toLocaleString()}백만원
                          </div>
                        </div>
                        <div className={`p-3 rounded-lg shadow-sm ${
                          orderCapacity.orderCapacity > 0 ? 'bg-green-100' : 'bg-red-100'
                        }`}>
                          <div className="text-slate-500 text-xs mb-1">발주가능 금액</div>
                          <div className={`font-bold text-xl ${
                            orderCapacity.orderCapacity > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {orderCapacity.orderCapacity > 0 ? '+' : ''}{orderCapacity.orderCapacity.toLocaleString()}백만원
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

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
                    {/* 금액/수량 기준 필터 */}
                    <div className="flex items-center gap-1 bg-purple-50 rounded-lg p-0.5 border border-purple-200">
                      <button
                        onClick={() => setChartBase('amount')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          chartBase === 'amount'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-purple-600 hover:bg-purple-100'
                        }`}
                      >
                        금액기준
                      </button>
                      <button
                        onClick={() => setChartBase('quantity')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                          chartBase === 'quantity'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-purple-600 hover:bg-purple-100'
                        }`}
                      >
                        수량기준
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
                ) : combinedChartData && combinedChartData.length > 0 ? (
                  <div className="space-y-6">
                    {/* 재고주수 꺾은선 그래프 */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">
                        재고주수 추이 (당년/전년 × 전체/정상)
                        {forecastResults.length > 0 && (
                          <span className="ml-2 text-xs text-purple-600 font-normal">
                            (실선: 실적, 점선: 예측)
                          </span>
                        )}
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={combinedChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                              // combinedChartData에서 모든 재고주수 값 수집 (전체 + 당시즌)
                              const allValues: number[] = [];
                              combinedChartData.forEach((item: any) => {
                                if (item.stockWeeks != null && item.stockWeeks !== undefined) {
                                  allValues.push(item.stockWeeks);
                                }
                                if (item.previousStockWeeks != null && item.previousStockWeeks !== undefined) {
                                  allValues.push(item.previousStockWeeks);
                                }
                                if (item.stockWeeksNormal != null && item.stockWeeksNormal !== undefined) {
                                  allValues.push(item.stockWeeksNormal);
                                }
                                if (item.previousStockWeeksNormal != null && item.previousStockWeeksNormal !== undefined) {
                                  allValues.push(item.previousStockWeeksNormal);
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
                          {/* 전체 재고 기준 */}
                          <Line 
                            type="natural" 
                            dataKey="stockWeeks" 
                            name="당년(전체)" 
                            stroke="#1e3a8a" 
                            strokeWidth={2.5}
                            dot={(props: any) => {
                              const { cx, cy, payload } = props;
                              const isActual = payload.isActual !== false;
                              return (
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isActual ? 4 : 3}
                                  fill={isActual ? '#1e3a8a' : '#ffffff'}
                                  stroke="#1e3a8a"
                                  strokeWidth={isActual ? 0 : 2}
                                />
                              );
                            }}
                            strokeDasharray={(props: any) => {
                              // 예측 구간은 점선으로 표시
                              return undefined; // recharts는 개별 세그먼트 스타일을 지원하지 않으므로 전체적으로 처리
                            }}
                            connectNulls
                          />
                          <Line 
                            type="natural" 
                            dataKey="previousStockWeeks" 
                            name="전년(전체)" 
                            stroke="#3b82f6" 
                            strokeWidth={2.5}
                            strokeDasharray="5 5"
                            dot={{ r: 4, fill: '#3b82f6' }}
                          />
                          {/* 정상재고 기준 (전체 - 정체재고) */}
                          <Line 
                            type="natural" 
                            dataKey="stockWeeksNormal" 
                            name="당년(정상)" 
                            stroke="#f97316" 
                            strokeWidth={2.5}
                            dot={(props: any) => {
                              const { cx, cy, payload } = props;
                              const isActual = payload.isActual !== false;
                              return (
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isActual ? 4 : 3}
                                  fill={isActual ? '#f97316' : '#ffffff'}
                                  stroke="#f97316"
                                  strokeWidth={isActual ? 0 : 2}
                                />
                              );
                            }}
                            connectNulls
                          />
                          <Line 
                            type="natural" 
                            dataKey="previousStockWeeksNormal" 
                            name="전년(정상)" 
                            stroke="#fdba74" 
                            strokeWidth={2.5}
                            strokeDasharray="5 5"
                            dot={{ r: 4, fill: '#fdba74' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    
                    {/* 재고택금액 스택형 막대그래프 */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-700">
                          {inventoryChartMode === 'yoy' 
                            ? '재고택금액 추이 (시즌별, 백만원)-당년/전년 비교'
                            : '재고택금액 추이 (시즌별, 백만원)-당년재고/매출액 비교'
                          }
                        </h3>
                        <div className="flex items-center gap-1 bg-purple-50 rounded-lg p-0.5 border border-purple-200">
                          <button
                            onClick={() => setInventoryChartMode('yoy')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                              inventoryChartMode === 'yoy'
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'text-purple-600 hover:bg-purple-100'
                            }`}
                          >
                            전년대비
                          </button>
                          <button
                            onClick={() => setInventoryChartMode('sales')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                              inventoryChartMode === 'sales'
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'text-purple-600 hover:bg-purple-100'
                            }`}
                          >
                            매출액대비
                          </button>
                        </div>
                      </div>
                      {/* 하나의 ComposedChart에 stacked bar + YOY line */}
                      <ResponsiveContainer width="100%" height={350}>
                        <ComposedChart 
                          data={combinedChartData} 
                          margin={{ top: 20, right: 60, left: 20, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis 
                            dataKey="month" 
                            stroke="#64748b"
                            fontSize={12}
                            tick={{ fill: '#64748b' }}
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
                            yAxisId="sale"
                            orientation="right"
                            stroke="#64748b"
                            fontSize={12}
                            tick={{ fill: '#64748b' }}
                            tickFormatter={(value) => new Intl.NumberFormat('ko-KR').format(value)}
                            width={60}
                            hide={true}
                            domain={(() => {
                              // 재고택금액 최대값의 50%를 매출액 Y축 최대값으로 설정
                              if (!combinedChartData || combinedChartData.length === 0) return [0, 'auto'];
                              const maxStock = Math.max(
                                ...combinedChartData.map((item: any) => item.totalStock || 0)
                              );
                              const maxSaleAxis = Math.ceil(maxStock * 0.5 / 1000) * 1000; // 천 단위 반올림
                              return [0, maxSaleAxis];
                            })()}
                          />
                          <YAxis 
                            yAxisId="right"
                            orientation="right"
                            stroke="#ef4444"
                            fontSize={12}
                            tick={{ fill: '#ef4444' }}
                            tickFormatter={(value) => `${value.toFixed(0)}%`}
                            width={60}
                            domain={(() => {
                              // YOY 데이터 범위를 동적으로 계산 (라인이 상단에 보이도록 -200부터 시작)
                              if (!combinedChartData || combinedChartData.length === 0) return [-200, 150];
                              
                              const yoyKey = inventoryChartMode === 'yoy' ? 'stockYOY' : 'saleYOY';
                              const yoyValues = combinedChartData
                                .map((item: any) => item[yoyKey])
                                .filter((val: any) => val !== null && val !== undefined && !isNaN(val) && val > 0);
                              
                              if (yoyValues.length === 0) return [-200, 150];
                              
                              const maxYoy = Math.max(...yoyValues);
                              
                              // 최대값에 20% 여유 추가, 10단위 올림
                              const domainMax = Math.ceil((maxYoy + 20) / 10) * 10;
                              
                              // -200부터 시작하여 라인이 상단에 위치하도록
                              return [-200, domainMax];
                            })()}
                            hide={true}
                          />
                          <Tooltip 
                            content={(props: any) => <CustomInventoryTooltip {...props} mode={inventoryChartMode} />}
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
                          
                          {inventoryChartMode === 'sales' ? (
                            <>
                              {/* 택매출 YOY 라인 (먼저 렌더링하여 뒤에 배치, 투명하게) */}
                              <Line 
                                yAxisId="right"
                                type="natural" 
                                dataKey="saleYOY" 
                                name="YOY" 
                                stroke="#ef4444" 
                                strokeWidth={3}
                                strokeOpacity={0.4}
                                dot={{ r: 5, fill: '#ef4444', fillOpacity: 0.4, strokeWidth: 2, stroke: '#ffffff', strokeOpacity: 0.4 }}
                                activeDot={{ r: 6 }}
                                connectNulls={true}
                              />
                              {/* 매출액대비 모드: 당년 매출액 막대 (별도 Y축 사용, 재고택금액의 50% 높이) */}
                              <Bar yAxisId="sale" dataKey="nextSeasonSale" stackId="cy-sale" name="당년-차기시즌(매출)" fill="#c084fc" opacity={0.7}>
                                <LabelList content={<CustomRatioLabel />} dataKey="nextSeasonSaleRatio" />
                              </Bar>
                              <Bar yAxisId="sale" dataKey="currentSeasonSale" stackId="cy-sale" name="당년-당시즌(매출)" fill="#60a5fa" opacity={0.7}>
                                <LabelList content={<CustomRatioLabel />} dataKey="currentSeasonSaleRatio" />
                              </Bar>
                              <Bar yAxisId="sale" dataKey="oldSeasonSale" stackId="cy-sale" name="당년-과시즌(매출)" fill="#cbd5e1" opacity={0.7}>
                                <LabelList content={<CustomRatioLabel />} dataKey="oldSeasonSaleRatio" />
                              </Bar>
                              <Bar yAxisId="sale" dataKey="stagnantSale" stackId="cy-sale" name="당년-정체재고(매출)" fill="#f87171" opacity={0.7}>
                                <LabelList content={<CustomRatioLabel />} dataKey="stagnantSaleRatio" />
                              </Bar>
                              {/* 매출액대비 모드: 당년 재고택금액 막대 */}
                              <Bar yAxisId="left" dataKey="nextSeasonStock" stackId="cy" name="당년-차기시즌" fill="#8b5cf6">
                                <LabelList content={<CustomRatioLabel />} dataKey="nextSeasonRatio" />
                              </Bar>
                              <Bar yAxisId="left" dataKey="currentSeasonStock" stackId="cy" name="당년-당시즌" fill="#3b82f6">
                                <LabelList content={<CustomRatioLabel />} dataKey="currentSeasonRatio" />
                              </Bar>
                              <Bar yAxisId="left" dataKey="oldSeasonStock" stackId="cy" name="당년-과시즌" fill="#94a3b8">
                                <LabelList content={<CustomRatioLabel />} dataKey="oldSeasonRatio" />
                              </Bar>
                              <Bar yAxisId="left" dataKey="stagnantStock" stackId="cy" name="당년-정체재고" fill="#dc2626">
                                <LabelList content={<CustomRatioLabel />} dataKey="stagnantRatio" />
                              </Bar>
                            </>
                          ) : (
                            <>
                              {/* 재고택금액 YOY 라인 (먼저 렌더링하여 뒤에 배치, 투명하게) */}
                              <Line 
                                yAxisId="right"
                                type="natural" 
                                dataKey="stockYOY" 
                                name="YOY" 
                                stroke="#ef4444" 
                                strokeWidth={3}
                                strokeOpacity={0.4}
                                dot={{ r: 5, fill: '#ef4444', fillOpacity: 0.4, strokeWidth: 2, stroke: '#ffffff', strokeOpacity: 0.4 }}
                                activeDot={{ r: 6 }}
                                connectNulls={true}
                              />
                              {/* 전년대비 모드: 전년 스택형 막대 (재고택금액) */}
                              <Bar yAxisId="left" dataKey="previousNextSeasonStock" stackId="py" name="전년-차기시즌" fill="#c4b5fd">
                                <LabelList content={<CustomRatioLabel />} dataKey="previousNextSeasonRatio" />
                              </Bar>
                              <Bar yAxisId="left" dataKey="previousCurrentSeasonStock" stackId="py" name="전년-당시즌" fill="#93c5fd">
                                <LabelList content={<CustomRatioLabel />} dataKey="previousCurrentSeasonRatio" />
                              </Bar>
                              <Bar yAxisId="left" dataKey="previousOldSeasonStock" stackId="py" name="전년-과시즌" fill="#cbd5e1">
                                <LabelList content={<CustomRatioLabel />} dataKey="previousOldSeasonRatio" />
                              </Bar>
                              <Bar yAxisId="left" dataKey="previousStagnantStock" stackId="py" name="전년-정체재고" fill="#ec4899">
                                <LabelList content={<CustomRatioLabel />} dataKey="previousStagnantRatio" />
                              </Bar>
                              {/* 전년대비 모드: 당년 스택형 막대 (재고택금액) */}
                              <Bar yAxisId="left" dataKey="nextSeasonStock" stackId="cy" name="당년-차기시즌" fill="#8b5cf6">
                                <LabelList content={<CustomRatioLabel />} dataKey="nextSeasonRatio" />
                              </Bar>
                              <Bar yAxisId="left" dataKey="currentSeasonStock" stackId="cy" name="당년-당시즌" fill="#3b82f6">
                                <LabelList content={<CustomRatioLabel />} dataKey="currentSeasonRatio" />
                              </Bar>
                              <Bar yAxisId="left" dataKey="oldSeasonStock" stackId="cy" name="당년-과시즌" fill="#94a3b8">
                                <LabelList content={<CustomRatioLabel />} dataKey="oldSeasonRatio" />
                              </Bar>
                              <Bar yAxisId="left" dataKey="stagnantStock" stackId="cy" name="당년-정체재고" fill="#dc2626">
                                <LabelList content={<CustomRatioLabel />} dataKey="stagnantRatio" />
                              </Bar>
                            </>
                          )}
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
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <CardTitle>{getItemNameFromKey(selectedItem)} 품번별 세부 내역</CardTitle>
                          {/* 시즌 제외 필터 토글 */}
                          <div className="flex items-center gap-1 bg-purple-50 rounded-lg p-0.5 border border-purple-200">
                            <button
                              onClick={() => setExcludeSeasonFilter('all')}
                              className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                                excludeSeasonFilter === 'all'
                                  ? 'bg-purple-600 text-white shadow-sm'
                                  : 'text-purple-600 hover:bg-purple-100'
                              }`}
                            >
                              전체
                            </button>
                            <button
                              onClick={() => setExcludeSeasonFilter('excludeS')}
                              className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                                excludeSeasonFilter === 'excludeS'
                                  ? 'bg-purple-600 text-white shadow-sm'
                                  : 'text-purple-600 hover:bg-purple-100'
                              }`}
                            >
                              S시즌제외
                            </button>
                            <button
                              onClick={() => setExcludeSeasonFilter('excludeF')}
                              className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                                excludeSeasonFilter === 'excludeF'
                                  ? 'bg-purple-600 text-white shadow-sm'
                                  : 'text-purple-600 hover:bg-purple-100'
                              }`}
                            >
                              F시즌제외
                            </button>
                          </div>
                        </div>
                        <CardDescription>
                          {selectedMonth} 기준 품번별 재고 및 판매 현황
                        </CardDescription>
                        {/* 시즌 정의 - 한 줄 */}
                        <div className="mt-1.5 text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          {(() => {
                            const month = parseInt(selectedMonth.split('-')[1]);
                            const year = parseInt(selectedMonth.split('-')[0]);
                            const yy = year % 100;
                            const isFW = month >= 9 || month <= 2;
                            const thresholdText = productDetails && productDetails.thresholdAmt > 0 
                              ? ` (기준:${Math.round(productDetails.thresholdAmt / 1000000).toLocaleString()}백만)` 
                              : '';
                            
                            return (
                              <>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500"></span><strong>당시즌</strong> {isFW ? `${yy}N,${yy}F` : `${yy}N,${yy}S`}</span>
                                <span className="text-slate-300">|</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500"></span><strong>차기시즌</strong> {isFW ? `${yy+1}N,${yy+1}S,${yy+1}F~` : `${yy}F,${yy+1}N~`}</span>
                                <span className="text-slate-300">|</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-400"></span><strong>과시즌</strong> 그외(정체제외)</span>
                                <span className="text-slate-300">|</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500"></span><strong>정체재고</strong> 과시즌中 판매&lt;0.01%{thresholdText}</span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {/* 엑셀 다운로드 버튼 */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!productDetails) return;
                          
                          const products = periodType === 'monthly' ? productDetails.monthly : productDetails.accumulated;
                          
                          // CSV 헤더
                          const headers = ['시즌구분', '품번', '품명', '시즌', 'TAG가격', '재고주수', '전년재고주수', '기말재고(백만)', '전년기말재고(백만)', '판매액(백만)', '전년판매액(백만)', '재고YOY(%)', '판매YOY(%)'];
                          
                          // CSV 데이터
                          const csvData = products.map(p => {
                            const seasonLabel = p.seasonCategory === 'current' ? '당시즌' 
                              : p.seasonCategory === 'next' ? '차기시즌' 
                              : p.seasonCategory === 'stagnant' ? '정체재고' 
                              : '과시즌';
                            return [
                              seasonLabel,
                              p.productCode,
                              p.productName || '',
                              p.season || '',
                              p.tagPrice || '',
                              p.weeks,
                              p.previousWeeks,
                              p.endingInventory,
                              p.previousEndingInventory,
                              p.salesAmount,
                              p.previousSalesAmount,
                              p.inventoryYOY,
                              p.salesYOY
                            ];
                          });
                          
                          // BOM 추가 (한글 깨짐 방지)
                          const BOM = '\uFEFF';
                          const csvContent = BOM + [headers, ...csvData].map(row => row.join(',')).join('\n');
                          
                          // 파일명 생성 (영문+숫자로)
                          const itemCode = selectedItem === 'shoes' ? 'shoes' : 
                                          selectedItem === 'hat' ? 'hat' : 
                                          selectedItem === 'bag' ? 'bag' : 'etc';
                          const monthCode = selectedMonth.replace(/-/g, '');
                          const periodCode = periodType === 'monthly' ? 'monthly' : 'accumulated';
                          const fileName = `MLB_ACC_${itemCode}_${monthCode}_${periodCode}.csv`;
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          saveAs(blob, fileName);
                        }}
                        className="text-slate-600 hover:text-slate-800 gap-1"
                      >
                        <Download className="h-4 w-4" />
                        다운로드
                      </Button>
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
                            onValueChange={(value: 'all' | 'current' | 'next' | 'stagnant' | 'old') => setSeasonFilter(value)}
                          >
                            <SelectTrigger className="w-full sm:w-[180px]">
                              <SelectValue placeholder="시즌 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">전체 시즌</SelectItem>
                              <SelectItem value="current">당시즌</SelectItem>
                              <SelectItem value="next">차기시즌</SelectItem>
                              <SelectItem value="old">과시즌</SelectItem>
                              <SelectItem value="stagnant">정체재고</SelectItem>
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
                              product.seasonCategory === seasonFilter;
                            
                            // 시즌 제외 필터 (S시즌/F시즌 제외)
                            const season = product.season || '';
                            let matchesExcludeFilter = true;
                            
                            // 디스커버리(X) 브랜드인 경우 DX MASTER 서브카테고리도 참조
                            // 품번에서 DX(성인) 또는 DK(키즈)로 시작하는 부분 추출 (예: X25NDXSH1234 -> DXSH1234, X25NDKSH7535N -> DKSH7535N)
                            const productCode = product.productCode || '';
                            const dxCodeMatch = productCode.match(/D[XK][A-Z0-9]+/);
                            const dxCode = dxCodeMatch ? dxCodeMatch[0] : '';
                            const dxSubCategory = dxCode ? dxMasterData[dxCode] : null;
                            
                            if (excludeSeasonFilter === 'excludeS') {
                              // S시즌 제외 (예: 24S, 25S 등) + 디스커버리 SUMMER 서브카테고리
                              const isSSeason = season.includes('S');
                              const isSummerSubCategory = brand?.code === 'X' && dxSubCategory === 'SUMMER';
                              matchesExcludeFilter = !isSSeason && !isSummerSubCategory;
                            } else if (excludeSeasonFilter === 'excludeF') {
                              // F시즌 제외 (예: 24F, 25F 등) + 디스커버리 WINTER 서브카테고리
                              const isFSeason = season.includes('F');
                              const isWinterSubCategory = brand?.code === 'X' && dxSubCategory === 'WINTER';
                              matchesExcludeFilter = !isFSeason && !isWinterSubCategory;
                            }
                            
                            return matchesSearch && matchesSeason && matchesExcludeFilter;
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
                          
                          // 시즌별 그룹핑 (4가지: 당시즌, 차기시즌, 과시즌, 정체재고)
                          const currentSeasonProducts = filtered.filter(p => p.seasonCategory === 'current');
                          const nextSeasonProducts = filtered.filter(p => p.seasonCategory === 'next');
                          const oldSeasonProducts = filtered.filter(p => p.seasonCategory === 'old');
                          const stagnantProducts = filtered.filter(p => p.seasonCategory === 'stagnant');
                          
                          // 전체 데이터에서 재고주수 TOP 10 및 정체재고 중 재고금액 TOP 10 계산
                          const allProducts = [...currentSeasonProducts, ...nextSeasonProducts, ...oldSeasonProducts, ...stagnantProducts];
                          const top10WeeksCodes = [...allProducts]
                            .sort((a, b) => b.weeks - a.weeks)
                            .slice(0, 10)
                            .map(p => p.productCode);
                          const stagnantTop10InventoryCodes = [...stagnantProducts]
                            .sort((a, b) => b.endingInventory - a.endingInventory)
                            .slice(0, 10)
                            .map(p => p.productCode);
                          
                          // 테이블 렌더링 헬퍼 함수
                          const renderProductTable = (products: typeof filtered, title: string, colorClass: string) => {
                            if (products.length === 0) return null;
                            
                            // 합계 계산
                            const totalEndingInventoryQty = products.reduce((sum, p) => sum + (p.endingInventoryQty || 0), 0);
                            const totalPreviousEndingInventoryQty = products.reduce((sum, p) => sum + (p.previousEndingInventoryQty || 0), 0);
                            const totalEndingInventory = products.reduce((sum, p) => sum + p.endingInventory, 0);
                            const totalPreviousEndingInventory = products.reduce((sum, p) => sum + p.previousEndingInventory, 0);
                            const totalSalesAmount = products.reduce((sum, p) => sum + p.salesAmount, 0);
                            const totalPreviousSalesAmount = products.reduce((sum, p) => sum + p.previousSalesAmount, 0);
                            const totalInventoryYOY = totalPreviousEndingInventory > 0 ? Math.round((totalEndingInventory / totalPreviousEndingInventory) * 100) : 0;
                            const totalSalesYOY = totalPreviousSalesAmount > 0 ? Math.round((totalSalesAmount / totalPreviousSalesAmount) * 100) : 0;
                            // 가중평균 재고주수 계산 (재고금액 기준)
                            const weightedWeeks = products.reduce((sum, p) => sum + (p.weeks * p.endingInventory), 0);
                            const weightedPreviousWeeks = products.reduce((sum, p) => sum + (p.previousWeeks * p.previousEndingInventory), 0);
                            const avgWeeks = totalEndingInventory > 0 ? weightedWeeks / totalEndingInventory : 0;
                            const avgPreviousWeeks = totalPreviousEndingInventory > 0 ? weightedPreviousWeeks / totalPreviousEndingInventory : 0;
                            
                            return (
                              <div>
                                <div className="mb-3 flex items-center gap-2">
                                  <div className={`h-2 w-2 rounded-full ${colorClass}`}></div>
                                  <h3 className="text-sm font-semibold text-slate-700">{title} - {products.length}개</h3>
                                </div>
                                <div className="overflow-x-auto overflow-y-auto max-h-[400px] border rounded-lg">
                                  <table className="w-full border-collapse table-fixed">
                                    <colgroup>
                                      <col className="w-[120px]" />
                                      <col className="w-[200px]" />
                                      <col style={{ width: 'calc((100% - 320px) / 7)' }} />
                                      <col style={{ width: 'calc((100% - 320px) / 7)' }} />
                                      <col style={{ width: 'calc((100% - 320px) / 7)' }} />
                                      <col style={{ width: 'calc((100% - 320px) / 7)' }} />
                                      <col style={{ width: 'calc((100% - 320px) / 7)' }} />
                                      <col style={{ width: 'calc((100% - 320px) / 7)' }} />
                                      <col style={{ width: 'calc((100% - 320px) / 7)' }} />
                                    </colgroup>
                                    <thead className="sticky top-0 z-10 bg-white shadow-sm">
                                      <tr className="border-b border-slate-200">
                                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700 bg-white">품번</th>
                                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700 bg-white">품명</th>
                                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-700 bg-white">TAG가격</th>
                                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-700 bg-white cursor-pointer hover:bg-slate-50" onClick={() => { if (sortColumn === 'weeks') { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); } else { setSortColumn('weeks'); setSortDirection('desc'); } }}>
                                          <div className="flex items-center justify-center gap-1">재고주수 {sortColumn === 'weeks' && (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</div>
                                        </th>
                                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-700 bg-white">기말재고수량</th>
                                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-700 bg-white cursor-pointer hover:bg-slate-50" onClick={() => { if (sortColumn === 'endingInventory') { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); } else { setSortColumn('endingInventory'); setSortDirection('desc'); } }}>
                                          <div className="flex items-center justify-center gap-1">기말재고택(V+) {sortColumn === 'endingInventory' && (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</div>
                                        </th>
                                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-700 bg-white cursor-pointer hover:bg-slate-50" onClick={() => { if (sortColumn === 'salesAmount') { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); } else { setSortColumn('salesAmount'); setSortDirection('desc'); } }}>
                                          <div className="flex items-center justify-center gap-1">실판매액(V+) {sortColumn === 'salesAmount' && (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</div>
                                        </th>
                                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-700 bg-white">재고YOY</th>
                                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-700 bg-white">판매YOY</th>
                                      </tr>
                                      {/* TOTAL 합계 행 */}
                                      <tr className="border-b-2 border-slate-300 bg-slate-100">
                                        <td className="py-2 px-3 text-xs font-bold text-slate-800 bg-slate-100">TOTAL</td>
                                        <td className="py-2 px-3 text-xs font-bold text-slate-600 bg-slate-100">{products.length}개 품번</td>
                                        <td className="py-2 px-3 text-xs text-center bg-slate-100">
                                          {totalEndingInventoryQty > 0 ? (
                                            <p className="font-semibold text-slate-900">{formatNumber(Math.round((totalEndingInventory * 1000000) / totalEndingInventoryQty))}원</p>
                                          ) : (
                                            <p className="text-slate-400">-</p>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-xs text-center bg-slate-100">
                                          <div>
                                            <p className="font-bold text-slate-800">{formatNumberWithDecimal(avgWeeks)}주</p>
                                            <p className="text-[10px] text-slate-500">전년 {formatNumberWithDecimal(avgPreviousWeeks)}주</p>
                                            <p className={`text-[10px] font-semibold ${avgWeeks - avgPreviousWeeks < 0 ? 'text-emerald-600' : 'text-red-600'}`}>{avgWeeks - avgPreviousWeeks < 0 ? '-' : '+'}{formatNumberWithDecimal(Math.abs(avgWeeks - avgPreviousWeeks))}주</p>
                                          </div>
                                        </td>
                                        <td className="py-2 px-3 text-xs text-center bg-slate-100">
                                          <div>
                                            <p className="font-bold text-slate-800">{formatNumber(totalEndingInventoryQty)}</p>
                                            <p className="text-[10px] text-slate-500">전년 {formatNumber(totalPreviousEndingInventoryQty)}</p>
                                          </div>
                                        </td>
                                        <td className="py-2 px-3 text-xs text-center bg-slate-100">
                                          <div>
                                            <p className="font-bold text-slate-800">{formatNumber(totalEndingInventory)}백만</p>
                                            <p className="text-[10px] text-slate-500">전년 {formatNumber(totalPreviousEndingInventory)}백만</p>
                                          </div>
                                        </td>
                                        <td className="py-2 px-3 text-xs text-center bg-slate-100">
                                          <div>
                                            <p className="font-bold text-slate-800">{formatNumber(totalSalesAmount)}백만</p>
                                            <p className="text-[10px] text-slate-500">전년 {formatNumber(totalPreviousSalesAmount)}백만</p>
                                          </div>
                                        </td>
                                        <td className="py-2 px-3 text-xs text-center bg-slate-100">
                                          <span className={`font-bold ${totalInventoryYOY >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>{formatNumber(totalInventoryYOY)}%</span>
                                        </td>
                                        <td className="py-2 px-3 text-xs text-center bg-slate-100">
                                          <span className={`font-bold ${totalSalesYOY >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>{formatNumber(totalSalesYOY)}%</span>
                                        </td>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {products.map((product) => {
                                        const weeksDiff = product.weeks - product.previousWeeks;
                                        const isImproved = weeksDiff < 0;
                                        const isTop10Weeks = top10WeeksCodes.includes(product.productCode);
                                        const isStagnantTop10Inventory = stagnantTop10InventoryCodes.includes(product.productCode);
                                        const isHighRisk = isTop10Weeks || isStagnantTop10Inventory;
                                        
                                        return (
                                          <tr 
                                            key={product.productCode} 
                                            className={`border-b border-slate-100 transition-colors cursor-pointer ${isHighRisk ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}
                                            onClick={() => setSelectedProductForDetail(product)}
                                          >
                                            <td className="py-2 px-3 text-xs font-mono text-slate-900">
                                              <div className="flex items-center gap-1">
                                                {isTop10Weeks && <span title="재고주수 TOP 10" className="text-red-500">🔺</span>}
                                                {isStagnantTop10Inventory && !isTop10Weeks && <span title="정체재고 금액 TOP 10" className="text-orange-500">⚠️</span>}
                                                <span className="hover:underline text-blue-600">{product.productCode}</span>
                                              </div>
                                            </td>
                                            <td className="py-2 px-3 text-xs text-slate-700 truncate" title={product.productName}>{product.productName || '-'}</td>
                                            <td className="py-2 px-3 text-xs text-center">
                                              {product.tagPrice != null && product.tagPrice > 0 ? (
                                                <p className="font-semibold text-slate-900">{formatNumber(product.tagPrice)}원</p>
                                              ) : (
                                                <p className="text-slate-400">-</p>
                                              )}
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center">
                                              <div>
                                                <p className="font-semibold text-slate-900">{formatNumberWithDecimal(product.weeks)}주</p>
                                                <p className="text-[10px] text-slate-500">전년 {formatNumberWithDecimal(product.previousWeeks)}주</p>
                                                <p className={`text-[10px] font-semibold ${isImproved ? 'text-emerald-600' : 'text-red-600'}`}>{isImproved ? '-' : '+'}{formatNumberWithDecimal(Math.abs(weeksDiff))}주</p>
                                              </div>
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center">
                                              <div>
                                                <p className="font-semibold text-slate-900">{formatNumber(product.endingInventoryQty || 0)}</p>
                                                <p className="text-[10px] text-slate-500">전년 {formatNumber(product.previousEndingInventoryQty || 0)}</p>
                                              </div>
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center">
                                              <div>
                                                <p className="font-semibold text-slate-900">{formatNumber(product.endingInventory)}백만</p>
                                                <p className="text-[10px] text-slate-500">전년 {formatNumber(product.previousEndingInventory)}백만</p>
                                              </div>
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center">
                                              <div>
                                                <p className="font-semibold text-slate-900">{formatNumber(product.salesAmount)}백만</p>
                                                <p className="text-[10px] text-slate-500">전년 {formatNumber(product.previousSalesAmount)}백만</p>
                                              </div>
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center">
                                              <span className={`font-semibold ${product.inventoryYOY >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>{formatNumber(product.inventoryYOY)}%</span>
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center">
                                              <span className={`font-semibold ${product.salesYOY >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>{formatNumber(product.salesYOY)}%</span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          };

                          const month = parseInt(selectedMonth.split('-')[1]);
                          const year = parseInt(selectedMonth.split('-')[0]);
                          const yy = year % 100;
                          const isFW = month >= 9 || month <= 2;
                          
                          // 시즌별 합계 계산
                          const seasonSummary = [
                            {
                              key: 'current',
                              name: '당시즌',
                              season: isFW ? `${yy}N, ${yy}F` : `${yy}N, ${yy}S`,
                              products: currentSeasonProducts,
                              colorClass: 'bg-blue-500',
                              bgClass: 'bg-blue-50 border-blue-200',
                              textClass: 'text-blue-700'
                            },
                            {
                              key: 'next',
                              name: '차기시즌',
                              season: isFW ? `${yy+1}N~` : `${yy}F~`,
                              products: nextSeasonProducts,
                              colorClass: 'bg-violet-500',
                              bgClass: 'bg-violet-50 border-violet-200',
                              textClass: 'text-violet-700'
                            },
                            {
                              key: 'old',
                              name: '과시즌',
                              season: '그외',
                              products: oldSeasonProducts,
                              colorClass: 'bg-slate-400',
                              bgClass: 'bg-slate-50 border-slate-200',
                              textClass: 'text-slate-700'
                            },
                            {
                              key: 'stagnant',
                              name: '정체재고',
                              season: `<${productDetails?.thresholdAmt ? Math.round(productDetails.thresholdAmt / 1000000).toLocaleString() : '?'}백만`,
                              products: stagnantProducts,
                              colorClass: 'bg-red-500',
                              bgClass: 'bg-red-50 border-red-200',
                              textClass: 'text-red-700'
                            }
                          ];
                          
                          // 필터 결과 요약 계산
                          const totalProducts = periodType === 'monthly' ? productDetails.monthly : productDetails.accumulated;
                          const totalCount = totalProducts.length;
                          const filteredCount = filtered.length;
                          const totalInventorySum = totalProducts.reduce((sum, p) => sum + p.endingInventory, 0);
                          const filteredInventorySum = filtered.reduce((sum, p) => sum + p.endingInventory, 0);
                          const isFiltered = searchFilter.trim() !== '' || seasonFilter !== 'all';
                          
                          return (
                            <div className="space-y-6">
                              {/* 필터 결과 요약 바 */}
                              {isFiltered && (
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <span className="text-blue-600 text-sm">🔍</span>
                                    <span className="text-sm text-blue-800">
                                      전체 <strong>{formatNumber(totalCount)}</strong>개 중{' '}
                                      <strong className="text-blue-600">{formatNumber(filteredCount)}</strong>개 표시
                                    </span>
                                    <span className="text-slate-400">|</span>
                                    <span className="text-sm text-slate-600">
                                      재고 <strong className="text-blue-600">{formatNumber(filteredInventorySum)}</strong>백만원
                                      <span className="text-slate-400 ml-1">
                                        ({formatNumber(totalInventorySum)}백만원 중 {totalInventorySum > 0 ? Math.round((filteredInventorySum / totalInventorySum) * 100) : 0}%)
                                      </span>
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => { setSearchFilter(''); setSeasonFilter('all'); }}
                                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                                  >
                                    필터 초기화
                                  </button>
                                </div>
                              )}
                              
                              {/* 시즌별 요약 카드 */}
                              {/* chartData에서 현재 월의 시즌별 전년 데이터 가져오기 */}
                              {(() => {
                                const currentMonthChartData = chartData?.find((d: any) => d.month === selectedMonth);
                                const pyCurrentSeasonStock = currentMonthChartData?.previousCurrentSeasonStock || 0;
                                const pyNextSeasonStock = currentMonthChartData?.previousNextSeasonStock || 0;
                                const pyOldSeasonStock = currentMonthChartData?.previousOldSeasonStock || 0;
                                const pyStagnantStock = currentMonthChartData?.previousStagnantStock || 0;
                                
                                return null; // 값만 계산하고 렌더링은 하지 않음
                              })()}
                              <div className="grid grid-cols-4 gap-3">
                                {seasonSummary.map((season) => {
                                  const totalInventory = season.products.reduce((sum, p) => sum + p.endingInventory, 0);
                                  
                                  // chartData에서 현재 월의 시즌별 전년 데이터 사용
                                  const currentMonthChartData = chartData?.find((d: any) => d.month === selectedMonth);
                                  let previousSeasonStock = 0;
                                  if (currentMonthChartData) {
                                    if (season.key === 'current') previousSeasonStock = currentMonthChartData.previousCurrentSeasonStock || 0;
                                    else if (season.key === 'next') previousSeasonStock = currentMonthChartData.previousNextSeasonStock || 0;
                                    else if (season.key === 'old') previousSeasonStock = currentMonthChartData.previousOldSeasonStock || 0;
                                    else if (season.key === 'stagnant') previousSeasonStock = currentMonthChartData.previousStagnantStock || 0;
                                  }
                                  
                                  const yoyPercent = previousSeasonStock > 0 ? Math.round((totalInventory / previousSeasonStock) * 100) : 0;
                                  const productCount = season.products.length;
                                  
                                  return (
                                    <div 
                                      key={season.key}
                                      className={`rounded-lg border p-3 ${season.bgClass} cursor-pointer transition-all hover:shadow-md ${seasonFilter === season.key ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                                      onClick={() => setSeasonFilter(seasonFilter === season.key ? 'all' : season.key as any)}
                                    >
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className={`h-2.5 w-2.5 rounded-full ${season.colorClass}`}></div>
                                        <span className={`text-xs font-bold ${season.textClass}`}>{season.name}</span>
                                        <span className="text-[10px] text-slate-500 ml-auto">{season.season}</span>
                                      </div>
                                      <div className="flex items-end justify-between">
                                        <div>
                                          <p className={`text-lg font-bold ${season.textClass}`}>{formatNumber(totalInventory)}<span className="text-xs font-normal">백만</span></p>
                                          <p className="text-[10px] text-slate-500">{productCount}개 품번</p>
                                        </div>
                                        <div className="text-right">
                                          <p className={`text-xs font-semibold ${yoyPercent >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {yoyPercent > 0 ? `${formatNumber(yoyPercent)}%` : '-'}
                                          </p>
                                          <p className="text-[10px] text-slate-400">YOY</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              
                              {/* 당시즌 */}
                              {renderProductTable(
                                currentSeasonProducts, 
                                `당시즌 (${isFW ? `${yy}N, ${yy}F` : `${yy}N, ${yy}S`})`, 
                                'bg-blue-500'
                              )}
                              
                              {/* 차기시즌 */}
                              {renderProductTable(
                                nextSeasonProducts, 
                                `차기시즌 (${isFW ? `${yy+1}N, ${yy+1}S, ${yy+1}F 이후` : `${yy}F, ${yy+1}N 이후`})`, 
                                'bg-violet-500'
                              )}
                              
                              {/* 과시즌 */}
                              {renderProductTable(
                                oldSeasonProducts, 
                                '과시즌 (정체재고 제외)', 
                                'bg-slate-400'
                              )}
                              
                              {/* 정체재고 */}
                              {renderProductTable(
                                stagnantProducts, 
                                `정체재고 (과시즌 중 당월판매 < ${productDetails?.thresholdAmt ? Math.round(productDetails.thresholdAmt / 1000000).toLocaleString() + '백만원' : '기준금액'})`, 
                                'bg-red-500'
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
      
      {/* 품번 상세 정보 모달 */}
      {selectedProductForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedProductForDetail(null)}>
          <div 
            className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedProductForDetail.productCode}</h3>
                <p className="text-sm text-slate-500">{selectedProductForDetail.productName || '-'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedProductForDetail.seasonCategory === 'current' ? 'bg-blue-100 text-blue-700' :
                  selectedProductForDetail.seasonCategory === 'next' ? 'bg-violet-100 text-violet-700' :
                  selectedProductForDetail.seasonCategory === 'stagnant' ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {selectedProductForDetail.seasonCategory === 'current' ? '당시즌' :
                   selectedProductForDetail.seasonCategory === 'next' ? '차기시즌' :
                   selectedProductForDetail.seasonCategory === 'stagnant' ? '정체재고' : '과시즌'}
                </span>
                <button onClick={() => setSelectedProductForDetail(null)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
              </div>
            </div>
            
            {/* 모달 내용 */}
            <div className="p-6 space-y-6">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">시즌</p>
                  <p className="text-lg font-bold text-slate-900">{selectedProductForDetail.season || '-'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">재고주수</p>
                  <p className="text-lg font-bold text-slate-900">{formatNumberWithDecimal(selectedProductForDetail.weeks)}주</p>
                  <p className="text-xs text-slate-500">전년 {formatNumberWithDecimal(selectedProductForDetail.previousWeeks)}주</p>
                </div>
              </div>
              
              {/* 재고/판매 비교 */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="py-2 px-4 text-left text-xs font-semibold text-slate-700"></th>
                      <th className="py-2 px-4 text-center text-xs font-semibold text-slate-700">당년</th>
                      <th className="py-2 px-4 text-center text-xs font-semibold text-slate-700">전년</th>
                      <th className="py-2 px-4 text-center text-xs font-semibold text-slate-700">YOY</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="py-3 px-4 text-sm font-medium text-slate-700">기말재고</td>
                      <td className="py-3 px-4 text-center text-sm font-bold text-slate-900">{formatNumber(selectedProductForDetail.endingInventory)}백만</td>
                      <td className="py-3 px-4 text-center text-sm text-slate-600">{formatNumber(selectedProductForDetail.previousEndingInventory)}백만</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-sm font-bold ${selectedProductForDetail.inventoryYOY >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {formatNumber(selectedProductForDetail.inventoryYOY)}%
                        </span>
                      </td>
                    </tr>
                    <tr className="border-t">
                      <td className="py-3 px-4 text-sm font-medium text-slate-700">판매액(V+)</td>
                      <td className="py-3 px-4 text-center text-sm font-bold text-slate-900">{formatNumber(selectedProductForDetail.salesAmount)}백만</td>
                      <td className="py-3 px-4 text-center text-sm text-slate-600">{formatNumber(selectedProductForDetail.previousSalesAmount)}백만</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-sm font-bold ${selectedProductForDetail.salesYOY >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatNumber(selectedProductForDetail.salesYOY)}%
                        </span>
                      </td>
                    </tr>
                    <tr className="border-t">
                      <td className="py-3 px-4 text-sm font-medium text-slate-700">재고주수</td>
                      <td className="py-3 px-4 text-center text-sm font-bold text-slate-900">{formatNumberWithDecimal(selectedProductForDetail.weeks)}주</td>
                      <td className="py-3 px-4 text-center text-sm text-slate-600">{formatNumberWithDecimal(selectedProductForDetail.previousWeeks)}주</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-sm font-bold ${selectedProductForDetail.weeks <= selectedProductForDetail.previousWeeks ? 'text-emerald-600' : 'text-red-600'}`}>
                          {selectedProductForDetail.weeks <= selectedProductForDetail.previousWeeks ? '-' : '+'}{formatNumberWithDecimal(Math.abs(selectedProductForDetail.weeks - selectedProductForDetail.previousWeeks))}주
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              {/* 월별 재고/판매 추이 차트 */}
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-slate-700 mb-3">📊 월별 재고/판매 추이 (최근 12개월)</h4>
                {isLoadingMonthlyTrend ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <p className="text-sm text-slate-500">데이터 로딩 중...</p>
                  </div>
                ) : productMonthlyTrend.length > 0 ? (
                  <div className="h-[220px]">
                    {/* Y축 라벨 */}
                    <div className="flex justify-between text-[9px] text-slate-500 mb-1 px-1">
                      <span className="text-blue-600 font-medium">재고(백만)</span>
                      <span className="text-orange-600 font-medium">판매액(백만)</span>
                    </div>
                    <ResponsiveContainer width="100%" height={190}>
                      <ComposedChart
                        data={productMonthlyTrend}
                        margin={{ top: 5, right: 5, left: -5, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fontSize: 9, fill: '#64748b' }} 
                          tickFormatter={(value) => value.substring(5)} // MM만 표시
                        />
                        <YAxis 
                          yAxisId="left"
                          tick={{ fontSize: 9, fill: '#3b82f6' }} 
                          tickFormatter={(value) => formatNumber(value)}
                        />
                        <YAxis 
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 9, fill: '#f97316' }} 
                          tickFormatter={(value) => formatNumber(value)}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            `${formatNumber(value)}백만`,
                            name === 'endStock' ? '기말재고' : '판매액(V+)'
                          ]}
                          labelFormatter={(label) => `${label}`}
                          contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: '10px' }}
                          formatter={(value) => value === 'endStock' ? '기말재고' : '판매액(V+)'}
                        />
                        <Bar 
                          yAxisId="left"
                          dataKey="endStock" 
                          fill="#3b82f6" 
                          radius={[2, 2, 0, 0]}
                          name="endStock"
                        />
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="actSale" 
                          stroke="#f97316" 
                          strokeWidth={2}
                          dot={{ r: 3, fill: '#f97316' }}
                          name="actSale"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center">
                    <p className="text-sm text-slate-400">데이터가 없습니다</p>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white rounded-lg p-2 border">
                    <p className="text-[10px] text-slate-500">재고 YOY</p>
                    <p className={`text-sm font-bold ${selectedProductForDetail.inventoryYOY >= 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatNumber(selectedProductForDetail.inventoryYOY)}%
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border">
                    <p className="text-[10px] text-slate-500">판매 YOY</p>
                    <p className={`text-sm font-bold ${selectedProductForDetail.salesYOY >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatNumber(selectedProductForDetail.salesYOY)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
