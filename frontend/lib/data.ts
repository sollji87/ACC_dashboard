/**
 * 대시보드 데이터 타입 정의
 */

export interface BrandDashboardData {
  brandId: string;
  brandName: string;
  brandCode: string;
  month: string; // YYYY-MM 형식
  salesYOY: number; // 매출액 YOY (%)
  inventoryYOY: number; // 기말재고 YOY (%)
  accEndingInventory: number; // ACC 기말재고 (백만원)
  accSalesAmount: number; // ACC 판매액 (백만원)
  totalWeeks?: number; // 전체 재고주수 (당년)
  totalPreviousWeeks?: number; // 전체 재고주수 (전년)
  accInventoryDetail: {
    shoes: {
      current: number; // 당년 (백만원)
      previous: number; // 전년 (백만원)
      weeks: number; // 당년 재고주수 (주)
      previousWeeks: number; // 전년 재고주수 (주)
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

import { fetchAllBrandsInventory, ApiInventoryData } from './api';
import { BRANDS } from './brands';

/**
 * 실제 Snowflake 데이터 조회
 */
export async function getRealData(month: string = '2025-10'): Promise<BrandDashboardData[]> {
  try {
    const apiData = await fetchAllBrandsInventory(month);
    
    // API 데이터를 프론트엔드 형식으로 변환
    return apiData.map((data: ApiInventoryData) => {
      const brand = BRANDS.find(b => b.code === data.brandCode);
      return {
        brandId: brand?.id || '',
        brandName: brand?.name || '',
        brandCode: data.brandCode,
        month,
        salesYOY: data.salesYOY,
        inventoryYOY: data.inventoryYOY,
        accEndingInventory: data.accEndingInventory,
        accSalesAmount: data.accSalesAmount,
        totalWeeks: data.totalWeeks,
        totalPreviousWeeks: data.totalPreviousWeeks,
        accInventoryDetail: data.accInventoryDetail,
      };
    });
  } catch (error) {
    console.error('실제 데이터 조회 실패, 샘플 데이터 사용:', error);
    return getSampleData(month);
  }
}

/**
 * 샘플 데이터 (백업용)
 */
export function getSampleData(month: string = '2025-10'): BrandDashboardData[] {
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
 * 월 목록 생성 (최근 12개월)
 */
export function getMonthOptions(): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const value = `${year}-${month}`;
    const label = `${year}년 ${date.getMonth() + 1}월`;
    months.push({ value, label });
  }
  
  return months;
}

