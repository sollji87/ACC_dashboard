/**
 * Next.js 내부 API 호출 함수
 * 백엔드 없이 Next.js API Routes 사용
 */

export interface ApiInventoryData {
  brandCode: string;
  month: string;
  salesYOY: number; // 기본값 (당월, 호환성 유지)
  inventoryYOY: number; // 기본값 (당월, 호환성 유지)
  accEndingInventory: number; // 기본값 (당월, 호환성 유지)
  accSalesAmount: number; // 실판매액 - 기본값 (당월, 호환성 유지)
  accTagSalesAmount?: number; // 택판매액 - 기본값 (당월)
  totalWeeks?: number; // 기본값 (당월, 호환성 유지)
  totalPreviousWeeks?: number; // 기본값 (당월, 호환성 유지)
  accInventoryDetail: any; // 기본값 (당월, 호환성 유지)
  // 당월/누적 데이터 분리
  monthly?: {
    salesYOY: number;
    inventoryYOY: number;
    accEndingInventory: number;
    accSalesAmount: number;
    accTagSalesAmount?: number;
    totalWeeks?: number;
    totalPreviousWeeks?: number;
    accInventoryDetail: any;
  };
  accumulated?: {
    salesYOY: number;
    inventoryYOY: number;
    accEndingInventory: number;
    accSalesAmount: number;
    accTagSalesAmount?: number;
    totalWeeks?: number;
    totalPreviousWeeks?: number;
    accInventoryDetail: any;
  };
}

/**
 * 모든 브랜드의 재고주수 데이터 조회
 */
export async function fetchAllBrandsInventory(month: string, excludePurchase: boolean = true): Promise<ApiInventoryData[]> {
  try {
    // YYYY-MM 형식을 YYYYMM 형식으로 변환
    const yyyymm = month.replace(/-/g, '');
    const apiUrl = `/api/dashboard/inventory/all?month=${yyyymm}&excludePurchase=${excludePurchase}`;
    
    console.log(`🔍 내부 API 호출 시작:`, apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 응답 상태:`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API 오류 응답:`, errorText);
      throw new Error(`API 호출 실패: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`📦 API 응답 데이터:`, result);

    if (!result.success) {
      throw new Error(result.error || 'API 오류');
    }

    console.log(`✅ 데이터 조회 성공 (${yyyymm}):`, result.data.length, '개 브랜드');
    return result.data;
  } catch (error) {
    console.error('❌ 재고 데이터 조회 실패:', error);
    console.error('❌ 에러 상세:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * 단일 브랜드의 재고주수 데이터 조회
 */
export async function fetchBrandInventory(
  brandCode: string,
  month: string,
  excludePurchase: boolean = true
): Promise<ApiInventoryData> {
  try {
    // YYYY-MM 형식을 YYYYMM 형식으로 변환
    const yyyymm = month.replace(/-/g, '');
    const apiUrl = `/api/dashboard/inventory?brandCode=${brandCode}&month=${yyyymm}&excludePurchase=${excludePurchase}`;
    
    console.log(`🔍 내부 API 호출 시작 (단일 브랜드):`, apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 응답 상태 (단일 브랜드):`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API 오류 응답 (단일 브랜드):`, errorText);
      throw new Error(`API 호출 실패: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'API 오류');
    }

    console.log(`✅ 데이터 조회 성공 (단일 브랜드 ${brandCode}, ${yyyymm})`);
    return result.data;
  } catch (error) {
    console.error('❌ 단일 브랜드 재고 데이터 조회 실패:', error);
    console.error('❌ 에러 상세:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * 품번별 재고주수 데이터 조회
 */
export interface ProductDetailData {
  productCode: string;
  productName: string;
  season?: string; // 시즌 정보
  seasonCategory?: 'current' | 'next' | 'old' | 'stagnant'; // 당시즌 / 차기시즌 / 과시즌 / 정체재고
  tagPrice?: number | null; // TAG 가격
  weeks: number;
  previousWeeks: number;
  endingInventoryQty: number; // 기말재고 수량
  previousEndingInventoryQty: number;
  endingInventory: number; // 기말재고택(V+) 백만원
  endingInventoryRaw: number; // 기말재고택 원본 (원 단위, 합계 계산용)
  previousEndingInventory: number;
  tagSalesAmount: number; // 택판매액(V+) 백만원
  tagSalesAmountRaw: number; // 택판매액 원본 (원 단위, 합계 계산용)
  previousTagSalesAmount: number;
  salesAmount: number; // 실판매액(V+) 백만원
  salesAmountRaw: number; // 실판매액 원본 (원 단위, 합계 계산용)
  previousSalesAmount: number;
  inventoryYOY: number;
  salesYOY: number;
}

export interface ProductDetailResponse {
  itemStd: string;
  monthly: ProductDetailData[];
  accumulated: ProductDetailData[];
  thresholdAmt: number; // 정체재고 판별 기준금액 (원 단위)
}

export async function fetchProductDetails(
  brandCode: string,
  itemStd: string,
  month: string,
  excludePurchase: boolean = false
): Promise<ProductDetailResponse> {
  try {
    // YYYY-MM 형식을 YYYYMM 형식으로 변환
    const yyyymm = month.replace(/-/g, '');
    const apiUrl = `/api/dashboard/inventory/detail?brandCode=${brandCode}&itemStd=${encodeURIComponent(itemStd)}&month=${yyyymm}&excludePurchase=${excludePurchase}`;
    
    console.log(`🔍 품번별 데이터 조회 시작:`, apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 응답 상태 (품번별):`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API 오류 응답 (품번별):`, errorText);
      throw new Error(`API 호출 실패: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'API 오류');
    }

    console.log(`✅ 품번별 데이터 조회 성공 (${brandCode} ${itemStd}, ${yyyymm})`);
    return result.data;
  } catch (error) {
    console.error('❌ 품번별 재고 데이터 조회 실패:', error);
    console.error('❌ 에러 상세:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * 주차별 품번별 재고 데이터 (스타일&컬러 기준)
 */
export interface WeeklyProductDetailData {
  productCode: string;
  colorCode: string;
  productName: string;
  season: string;
  seasonCategory: 'current' | 'next' | 'old' | 'stagnant';
  tagPrice: number | null;
  endingInventory: number; // 기말재고 (백만원)
  prevEndingInventory: number;
  endingInventoryQty: number; // 기말재고 수량
  prevEndingInventoryQty: number;
  // 4주 매출 (재고주수 계산용, 백만원)
  fourWeekSalesAmount: number;
  prevFourWeekSalesAmount: number;
  fourWeekSalesQty: number;
  prevFourWeekSalesQty: number;
  // 1주 매출 (해당 주차만, 백만원)
  oneWeekSalesAmount: number;
  prevOneWeekSalesAmount: number;
  oneWeekSalesQty: number;
  prevOneWeekSalesQty: number;
  weeks: number; // 재고주수
  prevWeeks: number;
  inventoryYOY: number;
  salesYOY: number;
}

export interface WeeklyProductDetailResponse {
  products: WeeklyProductDetailData[];
  thresholdAmt: number; // 정체재고 판별 기준금액 (원 단위)
}

/**
 * 주차별 품번별 재고 데이터 조회 (스타일&컬러 기준)
 */
export async function fetchWeeklyProductDetails(
  brandCode: string,
  itemStd: string,
  week: string
): Promise<WeeklyProductDetailResponse> {
  try {
    const apiUrl = `/api/dashboard/inventory/detail-weekly?brandCode=${brandCode}&itemStd=${encodeURIComponent(itemStd)}&week=${week}`;
    
    console.log(`🔍 주차별 품번별 데이터 조회 시작:`, apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 응답 상태 (주차별 품번별):`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API 오류 응답 (주차별 품번별):`, errorText);
      throw new Error(`API 호출 실패: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'API 오류');
    }

    console.log(`✅ 주차별 품번별 데이터 조회 성공 (${brandCode} ${itemStd}, ${week}): ${result.data.products.length}개`);
    return result.data;
  } catch (error) {
    console.error('❌ 주차별 품번별 재고 데이터 조회 실패:', error);
    throw error;
  }
}

/**
 * 입고예정금액 조회 (중분류별)
 */
export interface IncomingAmountData {
  month: string; // 'YYYY-MM' 형식
  shoes: number; // 신발 (원 단위)
  hat: number; // 모자 (원 단위)
  bag: number; // 가방 (원 단위)
  other: number; // 기타ACC (원 단위)
}

export async function fetchIncomingAmounts(
  brandCode: string,
  startMonth: string,
  endMonth: string
): Promise<IncomingAmountData[]> {
  try {
    const apiUrl = `/api/dashboard/incoming-amounts?brandCode=${brandCode}&startMonth=${startMonth}&endMonth=${endMonth}`;
    
    console.log(`🔍 입고예정금액 조회 시작:`, apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 응답 상태 (입고예정금액):`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API 오류 응답 (입고예정금액):`, errorText);
      throw new Error(`API 호출 실패: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'API 오류');
    }

    console.log(`✅ 입고예정금액 조회 성공 (${brandCode}, ${startMonth} ~ ${endMonth})`);
    return result.data;
  } catch (error) {
    console.error('❌ 입고예정금액 조회 실패:', error);
    console.error('❌ 에러 상세:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * 주차별 입고예정금액 조회 (중분류별)
 */
export interface WeeklyIncomingAmountData {
  weekKey: string;   // '2025-W51' 형식
  weekLabel: string; // '51주차'
  year: number;
  weekNum: number;
  shoes: number;     // 신발 (원 단위)
  hat: number;       // 모자 (원 단위)
  bag: number;       // 가방 (원 단위)
  other: number;     // 기타ACC (원 단위)
  total: number;     // 합계 (원 단위)
}

export async function fetchWeeklyIncomingAmounts(
  brandCode: string,
  startWeek: string,
  endWeek: string
): Promise<WeeklyIncomingAmountData[]> {
  try {
    const apiUrl = `/api/dashboard/incoming-amounts-weekly?brandCode=${brandCode}&startWeek=${startWeek}&endWeek=${endWeek}`;
    
    console.log(`🔍 주차별 입고예정금액 조회 시작:`, apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 응답 상태 (주차별 입고예정금액):`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API 오류 응답 (주차별 입고예정금액):`, errorText);
      throw new Error(`API 호출 실패: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'API 오류');
    }

    console.log(`✅ 주차별 입고예정금액 조회 성공 (${brandCode}, ${startWeek} ~ ${endWeek})`);
    return result.data;
  } catch (error) {
    console.error('❌ 주차별 입고예정금액 조회 실패:', error);
    console.error('❌ 에러 상세:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
