import { NextRequest, NextResponse } from 'next/server';
// 차트 쿼리 임시 비활성화로 인해 import 주석 처리
// import { executeQuery } from '@/lib/snowflake';
// import { buildWeeklyChartQuery, formatWeeklyChartData } from '@/lib/weekly-dashboard-service';

// 브랜드 코드 매핑
const BRAND_CODE_MAP: Record<string, string> = {
  'mlb': 'M',
  'mlb-kids': 'I',
  'discovery': 'X',
  'duvetica': 'V',
  'sergio-tacchini': 'ST',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const brandId = searchParams.get('brandId');
  const weeksForSale = parseInt(searchParams.get('weeksForSale') || '4', 10);
  const selectedItem = (searchParams.get('selectedItem') || 'all') as 'all' | 'shoes' | 'hat' | 'bag' | 'other';

  if (!brandId) {
    return NextResponse.json(
      { error: 'brandId is required' },
      { status: 400 }
    );
  }

  const brandCode = BRAND_CODE_MAP[brandId];
  if (!brandCode) {
    return NextResponse.json(
      { error: `Unknown brand: ${brandId}` },
      { status: 400 }
    );
  }

  try {
    // 🚧 차트 쿼리 임시 비활성화 - 성능 이슈로 인해 빈 데이터 반환
    // TODO: 쿼리 최적화 후 다시 활성화
    console.log('[weekly-chart] Chart query temporarily disabled - returning empty data');
    
    return NextResponse.json({
      success: true,
      brandId,
      brandCode,
      weeksForSale,
      selectedItem,
      data: [], // 빈 배열 반환
      message: '차트 데이터 준비중입니다.'
    });
  } catch (error) {
    console.error('[weekly-chart] Error:', error);
    return NextResponse.json({
      success: true,
      data: [],
      message: '차트 데이터 로드 실패'
    });
  }
}

