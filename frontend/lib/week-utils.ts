/**
 * 주차 관련 유틸리티 함수들
 * 월결산 / 실시간(주차별) 데이터 소스 전환을 위한 헬퍼 함수 모음
 */

// 데이터 소스 타입 정의
export type DataSourceType = 'monthly' | 'weekly';

// 주차 옵션 인터페이스
export interface WeekOption {
  value: string;      // 'YYYY-WW' 형식 (예: '2025-51')
  label: string;      // 표시 레이블 (예: '2025년 51주차')
  startDate: Date;    // 주차 시작일
  endDate: Date;      // 주차 종료일
  dateRange: string;  // 날짜 범위 문자열 (예: '12/16 ~ 12/22')
}

/**
 * ISO 주차 계산 (ISO 8601 표준)
 * 월요일을 주의 시작으로 함
 */
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * ISO 연도 계산 (주차 기준)
 */
export function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/**
 * 특정 주차의 시작일(월요일) 계산
 */
export function getWeekStart(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const isoWeekStart = simple;
  if (dow <= 4) {
    isoWeekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  } else {
    isoWeekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  }
  return isoWeekStart;
}

/**
 * 특정 주차의 종료일(일요일) 계산
 */
export function getWeekEnd(year: number, week: number): Date {
  const start = getWeekStart(year, week);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

/**
 * 날짜를 MM/DD 형식으로 포맷
 */
function formatDateShort(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day}`;
}

/**
 * 특정 연도의 마지막 ISO 주차 계산 (52 또는 53)
 */
function getLastISOWeekOfYear(year: number): number {
  // 12월 28일은 항상 해당 연도의 마지막 주에 속함
  const dec28 = new Date(year, 11, 28);
  return getISOWeek(dec28);
}

/**
 * 최근 12주의 주차 옵션 생성
 */
export function getWeekOptions(): WeekOption[] {
  const weeks: WeekOption[] = [];
  const now = new Date();
  
  // 현재 주차 계산
  const currentWeek = getISOWeek(now);
  const currentYear = getISOWeekYear(now);
  
  // 최근 12주 생성 (현재 주 포함)
  for (let i = 0; i < 12; i++) {
    let week = currentWeek - i;
    let year = currentYear;
    
    // 연도 조정 - week이 0 이하면 전년도로 이동
    while (week < 1) {
      year--;
      // 전년도의 실제 마지막 주차 (52 또는 53)
      const lastWeekOfPrevYear = getLastISOWeekOfYear(year);
      week += lastWeekOfPrevYear;
    }
    
    const startDate = getWeekStart(year, week);
    const endDate = getWeekEnd(year, week);
    
    weeks.push({
      value: `${year}-${String(week).padStart(2, '0')}`,
      label: `${year}년 ${week}주차`,
      startDate,
      endDate,
      dateRange: `${formatDateShort(startDate)} ~ ${formatDateShort(endDate)}`,
    });
  }
  
  return weeks;
}

/**
 * 주차 값에서 연도와 주차 번호 추출
 */
export function parseWeekValue(weekValue: string): { year: number; week: number } {
  const [year, week] = weekValue.split('-').map(Number);
  return { year, week };
}

/**
 * 현재 주차 값 반환
 */
export function getCurrentWeekValue(): string {
  const now = new Date();
  const week = getISOWeek(now);
  const year = getISOWeekYear(now);
  return `${year}-${String(week).padStart(2, '0')}`;
}

