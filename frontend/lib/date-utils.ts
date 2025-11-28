/**
 * 날짜 및 데이터 변환 공통 유틸리티
 * 중복 코드 제거를 위해 공통 함수들을 모아둔 모듈
 */

/**
 * 현재 년월 반환 (YYYYMM 형식)
 */
export function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * 전년 월 계산 (1년 전)
 * @param yyyymm YYYYMM 형식의 년월
 * @returns 전년 동일 월 (YYYYMM 형식)
 */
export function getPreviousYearMonth(yyyymm: string): string {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  const prevYear = year - 1;
  return `${prevYear}${String(month).padStart(2, '0')}`;
}

/**
 * YYYYMM 형식에서 년월 추출
 * @param yyyymm YYYYMM 형식의 년월 (예: '202510')
 * @returns { year: number; month: number } (예: { year: 2025, month: 10 })
 */
export function parseYearMonth(yyyymm: string): { year: number; month: number } {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  return { year, month };
}

/**
 * 아이템명을 키로 변환
 * @param itemStd 한글 아이템 표준명 (예: '신발', '모자')
 * @returns 영문 아이템 키 (예: 'shoes', 'hat')
 */
export function getItemKey(itemStd: string): string {
  const mapping: { [key: string]: string } = {
    신발: 'shoes',
    모자: 'hat',
    가방: 'bag',
    기타ACC: 'other',
  };
  return mapping[itemStd] || itemStd;
}

/**
 * 아이템 키를 아이템명으로 변환
 * @param itemKey 영문 아이템 키 (예: 'shoes', 'hat')
 * @returns 한글 아이템 표준명 (예: '신발', '모자')
 */
export function getItemNameFromKey(itemKey: string): string {
  const mapping: { [key: string]: string } = {
    shoes: '신발',
    hat: '모자',
    bag: '가방',
    other: '기타ACC',
  };
  return mapping[itemKey] || itemKey;
}

/**
 * YYYY-MM 형식을 YYYYMM 형식으로 변환
 * @param dateStr YYYY-MM 형식의 날짜 (예: '2025-10')
 * @returns YYYYMM 형식의 날짜 (예: '202510')
 */
export function formatYearMonthCompact(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * YYYYMM 형식을 YYYY-MM 형식으로 변환
 * @param yyyymm YYYYMM 형식의 날짜 (예: '202510')
 * @returns YYYY-MM 형식의 날짜 (예: '2025-10')
 */
export function formatYearMonthDisplay(yyyymm: string): string {
  const year = yyyymm.substring(0, 4);
  const month = yyyymm.substring(4, 6);
  return `${year}-${month}`;
}
