import { BadRequestException } from '@nestjs/common';

const BRAND_CODE_PATTERN = /^[A-Za-z]{1,2}$/;
const YYYYMM_PATTERN = /^\d{6}$/;
const YYYY_MM_PATTERN = /^\d{4}-\d{2}$/;

function fail(message: string): never {
  throw new BadRequestException(message);
}

export function ensureBrandCode(value: string | null | undefined, fieldName: string = 'brandCode'): string {
  if (!value || !BRAND_CODE_PATTERN.test(value)) {
    fail(`유효하지 않은 ${fieldName}입니다.`);
  }

  return value;
}

export function ensureYyyymm(value: string | null | undefined, fieldName: string = 'yyyymm'): string {
  if (!value || !YYYYMM_PATTERN.test(value)) {
    fail(`유효하지 않은 ${fieldName}입니다. (YYYYMM 형식 필요)`);
  }

  return value;
}

export function ensureYearMonth(value: string | null | undefined, fieldName: string): string {
  if (!value || !YYYY_MM_PATTERN.test(value)) {
    fail(`유효하지 않은 ${fieldName}입니다. (YYYY-MM 형식 필요)`);
  }

  return value;
}
