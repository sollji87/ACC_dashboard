/**
 * 브랜드 정보 타입 정의
 */
export interface Brand {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  logoColor: string; // 로고 배경색
}

/**
 * 브랜드 목록 (README.md 기준)
 */
export const BRANDS: Brand[] = [
  {
    id: 'mlb',
    name: 'MLB',
    code: 'M',
    description: '메인 MLB 브랜드',
    color: 'bg-gradient-to-br from-slate-700 to-slate-800',
    logoColor: 'bg-gradient-to-br from-slate-700 to-slate-800', // 세련된 다크 그레이
  },
  {
    id: 'mlb-kids',
    name: 'MLB KIDS',
    code: 'I',
    description: '어린이 라인',
    color: 'bg-[#6B9BD1]',
    logoColor: 'bg-[#6B9BD1]', // 코랄 블루 (Coral Blue)
  },
  {
    id: 'discovery',
    name: 'DISCOVERY',
    code: 'X',
    description: '아웃도어/라이프스타일',
    color: 'bg-[#00A67E]',
    logoColor: 'bg-[#00A67E]', // 에메랄드 그린 (Emerald)
  },
  {
    id: 'duvetica',
    name: 'DUVETICA',
    code: 'V',
    description: '프리미엄 패딩 브랜드',
    color: 'bg-[#9B72AA]',
    logoColor: 'bg-[#9B72AA]', // 퍼플 오키드 (Purple Orchid)
  },
  {
    id: 'sergio-tacchini',
    name: 'SERGIO TACCHINI',
    code: 'ST',
    description: '테니스·스포츠 헤리티지',
    color: 'bg-[#E2725B]',
    logoColor: 'bg-[#E2725B]', // 테라코타 (Terracotta)
  },
];

/**
 * 브랜드 ID로 브랜드 정보 조회
 */
export function getBrandById(id: string): Brand | undefined {
  return BRANDS.find((brand) => brand.id === id);
}

/**
 * 브랜드 코드로 브랜드 정보 조회
 */
export function getBrandByCode(code: string): Brand | undefined {
  return BRANDS.find((brand) => brand.code === code);
}

/**
 * 악세사리 아이템 타입
 */
export const ACC_ITEM_TYPES = [
  { id: 'shoes', name: '신발', code: 'SHOES' },
  { id: 'hat', name: '모자', code: 'HAT' },
  { id: 'bag', name: '가방', code: 'BAG' },
  { id: 'other', name: '기타ACC', code: 'OTHER' },
] as const;
