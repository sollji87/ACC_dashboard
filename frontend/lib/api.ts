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
  accSalesAmount: number; // 기본값 (당월, 호환성 유지)
  totalWeeks?: number; // 기본값 (당월, 호환성 유지)
  totalPreviousWeeks?: number; // 기본값 (당월, 호환성 유지)
  accInventoryDetail: any; // 기본값 (당월, 호환성 유지)
  // 당월/누적 데이터 분리
  monthly?: {
    salesYOY: number;
    inventoryYOY: number;
    accEndingInventory: number;
    accSalesAmount: number;
    totalWeeks?: number;
    totalPreviousWeeks?: number;
    accInventoryDetail: any;
  };
  accumulated?: {
    salesYOY: number;
    inventoryYOY: number;
    accEndingInventory: number;
    accSalesAmount: number;
    totalWeeks?: number;
    totalPreviousWeeks?: number;
    accInventoryDetail: any;
  };
}

/**
 * 모든 브랜드의 재고주수 데이터 조회
 */
export async function fetchAllBrandsInventory(month: string): Promise<ApiInventoryData[]> {
  try {
    // YYYY-MM 형식을 YYYYMM 형식으로 변환
    const yyyymm = month.replace(/-/g, '');
    const apiUrl = `/api/dashboard/inventory/all?month=${yyyymm}`;
    
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
  month: string
): Promise<ApiInventoryData> {
  try {
    // YYYY-MM 형식을 YYYYMM 형식으로 변환
    const yyyymm = month.replace(/-/g, '');
    const apiUrl = `/api/dashboard/inventory?brandCode=${brandCode}&month=${yyyymm}`;
    
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
  weeks: number;
  previousWeeks: number;
  endingInventoryQty: number; // 기말재고 수량
  previousEndingInventoryQty: number;
  endingInventory: number; // 기말재고택(V+) 백만원
  previousEndingInventory: number;
  salesAmount: number; // 실판매액(V+) 백만원
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
  month: string
): Promise<ProductDetailResponse> {
  try {
    // YYYY-MM 형식을 YYYYMM 형식으로 변환
    const yyyymm = month.replace(/-/g, '');
    const apiUrl = `/api/dashboard/inventory/detail?brandCode=${brandCode}&itemStd=${encodeURIComponent(itemStd)}&month=${yyyymm}`;
    
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

