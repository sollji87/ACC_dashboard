const BRAND_CODE_PATTERN = /^[A-Za-z]{1,2}$/;
const YYYYMM_PATTERN = /^\d{6}$/;
const YYYY_MM_PATTERN = /^\d{4}-\d{2}$/;
const WEEK_KEY_PATTERN = /^\d{4}-W?\d{2}$/;
const PRODUCT_CODE_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_$]{1,255}$/;

export const VALID_ITEM_STDS = ['신발', '모자', '가방', '기타ACC', 'all'] as const;

function fail(message: string): never {
  throw new Error(message);
}

export function ensureBrandCode(value: string | null, fieldName: string = 'brandCode'): string {
  if (!value || !BRAND_CODE_PATTERN.test(value)) {
    fail(`유효하지 않은 ${fieldName}입니다.`);
  }

  return value;
}

export function ensureYyyymm(value: string | null, fieldName: string = 'yyyymm'): string {
  if (!value || !YYYYMM_PATTERN.test(value)) {
    fail(`유효하지 않은 ${fieldName}입니다. (YYYYMM 형식 필요)`);
  }

  return value;
}

export function ensureYearMonth(value: string | null, fieldName: string): string {
  if (!value || !YYYY_MM_PATTERN.test(value)) {
    fail(`유효하지 않은 ${fieldName}입니다. (YYYY-MM 형식 필요)`);
  }

  return value;
}

export function ensureItemStd(value: string | null, fieldName: string = 'itemStd'): typeof VALID_ITEM_STDS[number] {
  const normalized = value || 'all';
  if (!VALID_ITEM_STDS.includes(normalized as (typeof VALID_ITEM_STDS)[number])) {
    fail(`유효하지 않은 ${fieldName}입니다.`);
  }

  return normalized as (typeof VALID_ITEM_STDS)[number];
}

export function ensureProductCode(value: string | null, fieldName: string = 'productCode'): string {
  if (!value || !PRODUCT_CODE_PATTERN.test(value)) {
    fail(`유효하지 않은 ${fieldName}입니다.`);
  }

  return value;
}

export function ensureSnowflakeIdentifier(value: string | null, fieldName: string): string {
  if (!value || !IDENTIFIER_PATTERN.test(value)) {
    fail(`유효하지 않은 ${fieldName}입니다.`);
  }

  return value;
}

export function ensureWeekKey(value: string | null, fieldName: string = 'week'): string {
  if (!value || !WEEK_KEY_PATTERN.test(value)) {
    fail(`유효하지 않은 ${fieldName}입니다. (YYYY-WNN 형식 필요)`);
  }

  return value.includes('-W') ? value : value.replace('-', '-W');
}

export function ensureWeekCsv(value: string | null, fieldName: string = 'weeks'): string[] {
  if (!value) {
    fail(`${fieldName} 파라미터가 필요합니다.`);
  }

  const weeks = value
    .split(',')
    .map((week) => week.trim())
    .filter(Boolean)
    .map((week) => ensureWeekKey(week, fieldName));

  if (weeks.length === 0) {
    fail(`유효한 ${fieldName} 값이 없습니다.`);
  }

  return weeks;
}
