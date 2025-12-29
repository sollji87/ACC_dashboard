'use client';

import { DataSourceType, getWeekOptions, getCurrentWeekValue, WeekOption } from '@/lib/week-utils';
import { getMonthOptions } from '@/lib/data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Clock } from 'lucide-react';

interface DataSourceToggleProps {
  dataSource: DataSourceType;
  onDataSourceChange: (type: DataSourceType) => void;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  selectedWeek: string;
  onWeekChange: (week: string) => void;
}

export default function DataSourceToggle({
  dataSource,
  onDataSourceChange,
  selectedMonth,
  onMonthChange,
  selectedWeek,
  onWeekChange,
}: DataSourceToggleProps) {
  const monthOptions = getMonthOptions();
  const weekOptions = getWeekOptions();

  return (
    <div className="flex items-center gap-3">
      {/* 데이터 소스 토글 버튼 */}
      <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
        <button
          onClick={() => onDataSourceChange('monthly')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            dataSource === 'monthly'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="h-4 w-4" />
          월결산
        </button>
        <button
          onClick={() => onDataSourceChange('weekly')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            dataSource === 'weekly'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="h-4 w-4" />
          주차별
        </button>
      </div>

      {/* 월/주 선택 드롭다운 */}
      {dataSource === 'monthly' ? (
        <Select value={selectedMonth} onValueChange={onMonthChange}>
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
      ) : (
        <div className="flex items-center gap-2">
          <Select value={selectedWeek} onValueChange={onWeekChange}>
            <SelectTrigger className="w-[180px] border-slate-300 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs text-slate-500">{option.dateRange}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* 데이터 준비중 표시 */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="h-2 w-2 bg-amber-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-amber-700">데이터 준비중</span>
          </div>
        </div>
      )}
    </div>
  );
}

