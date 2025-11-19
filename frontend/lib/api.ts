/**
 * 백엔드 API 호출 함수
 */

// 환경 변수 확인 및 설정
const getApiBaseUrl = () => {
  // 클라이언트 사이드에서 환경 변수 확인
  if (typeof window !== 'undefined') {
    // 런타임에 환경 변수 확인 (빌드 후에도 변경 가능)
    const runtimeUrl = (window as any).__NEXT_PUBLIC_API_URL__ || process.env.NEXT_PUBLIC_API_URL;
    if (runtimeUrl) {
      console.log('✅ API URL (런타임):', runtimeUrl);
      return runtimeUrl;
    }
  }
  
  // 빌드 타임 환경 변수
  const buildTimeUrl = process.env.NEXT_PUBLIC_API_URL;
  if (buildTimeUrl) {
    console.log('✅ API URL (빌드타임):', buildTimeUrl);
    return buildTimeUrl;
  }
  
  // 기본값 (개발 환경)
  const defaultUrl = 'http://localhost:3000';
  console.warn('⚠️ NEXT_PUBLIC_API_URL이 설정되지 않았습니다. 기본값 사용:', defaultUrl);
  return defaultUrl;
};

// 임시: Vercel 배포용 하드코딩 (환경 변수 문제 해결 전까지)
const API_BASE_URL = 
  typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')
    ? 'https://web-production-01345.up.railway.app'
    : getApiBaseUrl();

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
    const apiUrl = `${API_BASE_URL}/api/dashboard/inventory/all?month=${yyyymm}`;
    
    console.log(`🔍 API 호출 시작:`, apiUrl);
    console.log(`🔍 환경 변수 확인:`, {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      API_BASE_URL,
    });
    
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
    const yyyymm = month.replace('-', '');
    
    const response = await fetch(
      `${API_BASE_URL}/api/dashboard/inventory?brandCode=${brandCode}&month=${yyyymm}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'API 오류');
    }

    return result.data;
  } catch (error) {
    console.error('재고 데이터 조회 실패:', error);
    throw error;
  }
}

