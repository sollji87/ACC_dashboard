/**
 * 대시보드 데이터 타입 정의
 */

export interface BrandDashboardData {
  brandId: string;
  brandName: string;
  brandCode: string;
  month: string; // YYYY-MM 형식
  salesYOY: number; // 매출액 YOY (%) - 기본값 (당월)
  inventoryYOY: number; // 기말재고 YOY (%) - 기본값 (당월)
  accEndingInventory: number; // ACC 기말재고 (백만원) - 기본값 (당월)
  accSalesAmount: number; // ACC 실판매액 (백만원) - 기본값 (당월)
  accTagSalesAmount?: number; // ACC 택판매액 (백만원) - 기본값 (당월)
  totalWeeks?: number; // 전체 재고주수 (당년) - 기본값 (당월)
  totalPreviousWeeks?: number; // 전체 재고주수 (전년) - 기본값 (당월)
  accInventoryDetail: { // 기본값 (당월)
    shoes: {
      current: number; // 당년 기말재고 (백만원)
      previous: number; // 전년 기말재고 (백만원)
      weeks: number; // 당년 재고주수 (주)
      previousWeeks: number; // 전년 재고주수 (주)
      salesCurrent?: number; // 당년 판매액 (백만원)
      salesPrevious?: number; // 전년 판매액 (백만원)
    };
    hat: {
      current: number;
      previous: number;
      weeks: number;
      previousWeeks: number;
      salesCurrent?: number;
      salesPrevious?: number;
    };
    bag: {
      current: number;
      previous: number;
      weeks: number;
      previousWeeks: number;
      salesCurrent?: number;
      salesPrevious?: number;
    };
    other: {
      current: number;
      previous: number;
      weeks: number;
      previousWeeks: number;
      salesCurrent?: number;
      salesPrevious?: number;
    };
  };
  // 당월/누적 데이터 분리
  monthly?: {
    salesYOY: number;
    inventoryYOY: number;
    accEndingInventory: number;
    accSalesAmount: number;
    accTagSalesAmount?: number;
    totalWeeks?: number;
    totalPreviousWeeks?: number;
    accInventoryDetail: {
      shoes: { current: number; previous: number; weeks: number; previousWeeks: number; salesCurrent?: number; salesPrevious?: number };
      hat: { current: number; previous: number; weeks: number; previousWeeks: number; salesCurrent?: number; salesPrevious?: number };
      bag: { current: number; previous: number; weeks: number; previousWeeks: number; salesCurrent?: number; salesPrevious?: number };
      other: { current: number; previous: number; weeks: number; previousWeeks: number; salesCurrent?: number; salesPrevious?: number };
    };
  };
  accumulated?: {
    salesYOY: number;
    inventoryYOY: number;
    accEndingInventory: number;
    accSalesAmount: number;
    accTagSalesAmount?: number;
    totalWeeks?: number;
    totalPreviousWeeks?: number;
    accInventoryDetail: {
      shoes: { current: number; previous: number; weeks: number; previousWeeks: number; salesCurrent?: number; salesPrevious?: number };
      hat: { current: number; previous: number; weeks: number; previousWeeks: number; salesCurrent?: number; salesPrevious?: number };
      bag: { current: number; previous: number; weeks: number; previousWeeks: number; salesCurrent?: number; salesPrevious?: number };
      other: { current: number; previous: number; weeks: number; previousWeeks: number; salesCurrent?: number; salesPrevious?: number };
    };
  };
}

import { fetchAllBrandsInventory, ApiInventoryData } from './api';
import { BRANDS } from './brands';

/**
 * 실제 Snowflake 데이터 조회
 */
export async function getRealData(month: string = '2026-02'): Promise<BrandDashboardData[]> {
  try {
    const apiData = await fetchAllBrandsInventory(month);
    console.log('📊 API에서 받은 원본 데이터:', apiData);
    
    // 빈 배열이거나 데이터가 없으면 샘플 데이터 사용
    if (!apiData || apiData.length === 0) {
      console.warn('⚠️ API 데이터가 비어있음, 샘플 데이터 사용');
      return getSampleData(month);
    }
    
    // API 데이터를 프론트엔드 형식으로 변환
    const mappedData = apiData.map((data: ApiInventoryData) => {
      const brand = BRANDS.find(b => b.code === data.brandCode);
      console.log(`📊 브랜드 ${data.brandCode} 매핑:`, {
        brand: brand?.name,
        accInventoryDetail: data.accInventoryDetail,
      });
      
      // accInventoryDetail에 모든 필수 아이템이 있는지 확인하고 기본값 설정
      const defaultItem = {
        current: 0,
        previous: 0,
        weeks: 0,
        previousWeeks: 0,
        salesCurrent: 0,
        salesPrevious: 0,
      };
      
      // 당월/누적 데이터 분리
      const monthlyData = data.monthly || {
        salesYOY: data.salesYOY || 0,
        inventoryYOY: data.inventoryYOY || 0,
        accEndingInventory: data.accEndingInventory || 0,
        accSalesAmount: data.accSalesAmount || 0,
        accTagSalesAmount: data.accTagSalesAmount || 0,
        totalWeeks: data.totalWeeks || 0,
        totalPreviousWeeks: data.totalPreviousWeeks || 0,
        accInventoryDetail: data.accInventoryDetail || {},
      };
      
      const accumulatedData = data.accumulated || {
        salesYOY: data.salesYOY || 0,
        inventoryYOY: data.inventoryYOY || 0,
        accEndingInventory: data.accEndingInventory || 0,
        accSalesAmount: data.accSalesAmount || 0,
        accTagSalesAmount: data.accTagSalesAmount || 0,
        totalWeeks: data.totalWeeks || 0,
        totalPreviousWeeks: data.totalPreviousWeeks || 0,
        accInventoryDetail: data.accInventoryDetail || {},
      };
      
      // 기본값 설정
      const ensureInventoryDetail = (detail: any) => {
        return {
          shoes: detail?.shoes || defaultItem,
          hat: detail?.hat || defaultItem,
          bag: detail?.bag || defaultItem,
          other: detail?.other || defaultItem,
        };
      };
      
      return {
        brandId: brand?.id || '',
        brandName: brand?.name || '',
        brandCode: data.brandCode,
        month,
        // 기본값 (당월 데이터, 호환성 유지)
        salesYOY: monthlyData.salesYOY,
        inventoryYOY: monthlyData.inventoryYOY,
        accEndingInventory: monthlyData.accEndingInventory,
        accSalesAmount: monthlyData.accSalesAmount,
        accTagSalesAmount: monthlyData.accTagSalesAmount || data.accTagSalesAmount || 0,
        totalWeeks: monthlyData.totalWeeks,
        totalPreviousWeeks: monthlyData.totalPreviousWeeks,
        accInventoryDetail: ensureInventoryDetail(monthlyData.accInventoryDetail),
        // 당월/누적 데이터 분리
        monthly: {
          ...monthlyData,
          accInventoryDetail: ensureInventoryDetail(monthlyData.accInventoryDetail),
        },
        accumulated: {
          ...accumulatedData,
          accInventoryDetail: ensureInventoryDetail(accumulatedData.accInventoryDetail),
        },
      };
    });
    
    console.log('📊 최종 변환된 데이터:', mappedData);
    return mappedData;
  } catch (error) {
    console.error('실제 데이터 조회 실패, 샘플 데이터 사용:', error);
    return getSampleData(month);
  }
}

/**
 * 샘플 데이터 (백업용)
 */
export function getSampleData(month: string = '2026-02'): BrandDashboardData[] {
  return [
    {
      brandId: 'mlb',
      brandName: 'MLB',
      brandCode: 'M',
      month,
      salesYOY: 104,
      inventoryYOY: 105,
      accEndingInventory: 12500,
      accSalesAmount: 3480,
      accInventoryDetail: {
        shoes: { current: 4500, previous: 4200, weeks: 12.5, previousWeeks: 11.8 },
        hat: { current: 3200, previous: 3000, weeks: 10.2, previousWeeks: 9.5 },
        bag: { current: 2800, previous: 2600, weeks: 8.7, previousWeeks: 8.1 },
        other: { current: 2000, previous: 1900, weeks: 6.3, previousWeeks: 5.9 },
      },
    },
    {
      brandId: 'mlb-kids',
      brandName: 'MLB KIDS',
      brandCode: 'I',
      month,
      salesYOY: 91,
      inventoryYOY: 88,
      accEndingInventory: 3200,
      accSalesAmount: 788,
      accInventoryDetail: {
        shoes: { current: 1200, previous: 1100, weeks: 9.8, previousWeeks: 9.2 },
        hat: { current: 800, previous: 750, weeks: 7.5, previousWeeks: 7.0 },
        bag: { current: 700, previous: 650, weeks: 6.2, previousWeeks: 5.8 },
        other: { current: 500, previous: 480, weeks: 4.5, previousWeeks: 4.2 },
      },
    },
    {
      brandId: 'discovery',
      brandName: 'DISCOVERY',
      brandCode: 'X',
      month,
      salesYOY: 85,
      inventoryYOY: 92,
      accEndingInventory: 9800,
      accSalesAmount: 3961,
      accInventoryDetail: {
        shoes: { current: 3500, previous: 3300, weeks: 11.2, previousWeeks: 10.5 },
        hat: { current: 2500, previous: 2400, weeks: 9.5, previousWeeks: 8.9 },
        bag: { current: 2200, previous: 2100, weeks: 8.1, previousWeeks: 7.6 },
        other: { current: 1600, previous: 1500, weeks: 5.8, previousWeeks: 5.4 },
      },
    },
    {
      brandId: 'duvetica',
      brandName: 'DUVETICA',
      brandCode: 'V',
      month,
      salesYOY: 187,
      inventoryYOY: 165,
      accEndingInventory: 2100,
      accSalesAmount: 346,
      accInventoryDetail: {
        shoes: { current: 800, previous: 750, weeks: 15.3, previousWeeks: 14.5 },
        hat: { current: 500, previous: 480, weeks: 12.1, previousWeeks: 11.4 },
        bag: { current: 450, previous: 420, weeks: 10.5, previousWeeks: 9.8 },
        other: { current: 350, previous: 330, weeks: 8.2, previousWeeks: 7.7 },
      },
    },
    {
      brandId: 'sergio-tacchini',
      brandName: 'SERGIO TACCHINI',
      brandCode: 'ST',
      month,
      salesYOY: 97,
      inventoryYOY: 95,
      accEndingInventory: 1800,
      accSalesAmount: 100,
      accInventoryDetail: {
        shoes: { current: 700, previous: 680, weeks: 14.2, previousWeeks: 13.5 },
        hat: { current: 400, previous: 390, weeks: 11.5, previousWeeks: 10.8 },
        bag: { current: 350, previous: 340, weeks: 9.8, previousWeeks: 9.2 },
        other: { current: 350, previous: 330, weeks: 7.6, previousWeeks: 7.1 },
      },
    },
  ];
}

/**
 * 월 목록 생성 (2026년 2월까지)
 * 월결산 데이터는 요청 시 수동으로 업데이트하므로 최대 월을 고정
 */
export function getMonthOptions(): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = [];
  
  // 최대 선택 가능 월: 2026년 2월
  const maxYear = 2026;
  const maxMonth = 2;
  
  // 2025년 12월부터 12개월 전까지
  for (let i = 0; i < 12; i++) {
    const date = new Date(maxYear, maxMonth - 1 - i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const value = `${year}-${month}`;
    
    const label = `${year}년 ${date.getMonth() + 1}월`;
    months.push({ value, label });
  }
  
  return months;
}
