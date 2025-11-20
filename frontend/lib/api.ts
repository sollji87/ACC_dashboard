/**
 * Next.js 내부 API 호출 함수
 * 백엔드 없이 Next.js API Routes 사용
 */

export interface ApiInventoryData {
  brandCode: string;
  month: string;
  salesYOY: number;
  inventoryYOY: number;
  accEndingInventory: number;
  accSalesAmount: number;
  totalWeeks?: number;
  totalPreviousWeeks?: number;
  accInventoryDetail: {
    shoes: {
      current: number;
      previous: number;
      weeks: number;
      previousWeeks: number;
    };
    hat: {
      current: number;
      previous: number;
      weeks: number;
      previousWeeks: number;
    };
    bag: {
      current: number;
      previous: number;
      weeks: number;
      previousWeeks: number;
    };
    other: {
      current: number;
      previous: number;
      weeks: number;
      previousWeeks: number;
    };
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

