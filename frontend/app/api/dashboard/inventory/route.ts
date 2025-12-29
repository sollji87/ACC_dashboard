/**
 * 단일 브랜드의 재고주수 데이터 조회 API
 * GET /api/dashboard/inventory?brandCode=M&month=202510
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { buildInventoryQuery, formatInventoryData } from '@/lib/dashboard-service';

/**
 * 현재 년월 반환 (YYYYMM 형식)
 */
function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = searchParams.get('brandCode') || 'M';
    const month = searchParams.get('month');
    const yyyymm = month || getCurrentYearMonth();

    console.log(`📊 브랜드 ${brandCode} 재고주수 조회 시작 (${yyyymm})`);

    // Snowflake 연결
    const connection = await connectToSnowflake();

    try {
      // 쿼리 생성 및 실행
      const { query, params } = buildInventoryQuery(brandCode, yyyymm);
      const rows = await executeQuery(query, params, connection);
      
      // 데이터 포맷팅
      const formattedData = formatInventoryData(rows, brandCode, yyyymm);

      console.log(`✅ 브랜드 ${brandCode} 재고주수 조회 성공`);

      return NextResponse.json({
        success: true,
        data: formattedData,
      });
    } finally {
      // Snowflake 연결 종료
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 브랜드 재고주수 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: 500 }
    );
  }
}

