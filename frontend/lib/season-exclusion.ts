export type ExcludeSeasonFilter = 'all' | 'excludeS' | 'excludeF';

export interface SeasonMasterMaps {
  dxMasterData?: Record<string, string>;
  dvMasterData?: Record<string, string>;
}

interface SeasonFilterProduct {
  productCode?: string;
  season?: string;
}

const BRAND_MASTER_PATTERNS: Record<string, RegExp> = {
  X: /D[XK][A-Z0-9]+/,
  V: /V[DX][A-Z0-9]+/,
};

function getBrandSeasonMaster(
  brandCode: string | undefined,
  { dxMasterData = {}, dvMasterData = {} }: SeasonMasterMaps
): Record<string, string> {
  if (brandCode === 'X') return dxMasterData;
  if (brandCode === 'V') return dvMasterData;
  return {};
}

export function extractSeasonMasterCode(productCode: string, brandCode?: string): string {
  if (!productCode) return '';

  const brandPattern = brandCode ? BRAND_MASTER_PATTERNS[brandCode] : undefined;
  if (brandPattern) {
    return productCode.match(brandPattern)?.[0] || '';
  }

  return (
    productCode.match(BRAND_MASTER_PATTERNS.X)?.[0] ||
    productCode.match(BRAND_MASTER_PATTERNS.V)?.[0] ||
    ''
  );
}

export function getSeasonMasterCategory(
  productCode: string,
  brandCode: string | undefined,
  masterMaps: SeasonMasterMaps
): string | null {
  const masterCode = extractSeasonMasterCode(productCode, brandCode);
  if (!masterCode) return null;

  const brandMaster = getBrandSeasonMaster(brandCode, masterMaps);
  const category = brandMaster[masterCode];
  return typeof category === 'string' ? category.toUpperCase() : null;
}

export function shouldIncludeProductByExcludeSeasonFilter(
  product: SeasonFilterProduct,
  excludeSeasonFilter: ExcludeSeasonFilter,
  brandCode: string | undefined,
  masterMaps: SeasonMasterMaps
): boolean {
  if (excludeSeasonFilter === 'all') {
    return true;
  }

  const season = (product.season || '').toUpperCase();
  const masterCategory = getSeasonMasterCategory(product.productCode || '', brandCode, masterMaps);
  const isSSeason = season.includes('S');
  const isFSeason = season.includes('F');
  const isSummerMaster = masterCategory === 'SUMMER';
  const isWinterMaster = masterCategory === 'WINTER';

  if (excludeSeasonFilter === 'excludeS') {
    return !isSSeason && !isSummerMaster;
  }

  if (excludeSeasonFilter === 'excludeF') {
    return !isFSeason && !isWinterMaster;
  }

  return true;
}
