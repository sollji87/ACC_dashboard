/**
 * 품번별 재고주수 데이터 조회 API
 * GET /api/dashboard/inventory/detail?brandCode=M&itemStd=신발&month=202510&periodType=monthly
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { buildProductDetailQuery, formatProductDetailData } from '@/lib/dashboard-service';

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
    const itemStd = searchParams.get('itemStd') || '신발';
    const month = searchParams.get('month');
    const yyyymm = month || getCurrentYearMonth();

    // SQL 인젝션 방지: brandCode 검증
    if (!/^[A-Za-z]{1,2}$/.test(brandCode)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 브랜드 코드입니다.' },
        { status: 400 }
      );
    }
    
    // itemStd 검증 (한글 또는 영어만 허용)
    const validItemStd = ['신발', '모자', '가방', '기타ACC', 'all'];
    if (!validItemStd.includes(itemStd)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 아이템 분류입니다.' },
        { status: 400 }
      );
    }
    
    // yyyymm 검증 (YYYYMM 형식)
    if (!/^\d{6}$/.test(yyyymm)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 월 형식입니다. (YYYYMM 형식 필요)' },
        { status: 400 }
      );
    }

    console.log(`📊 브랜드 ${brandCode} ${itemStd} 품번별 재고주수 조회 시작 (${yyyymm})`);

    // Snowflake 연결
    const connection = await connectToSnowflake();

    try {
      // 쿼리 생성 및 실행
      const query = buildProductDetailQuery(brandCode, itemStd, yyyymm);
      const rows = await executeQuery(query, connection);
      
      // 데이터 포맷팅 (시즌 정보를 위해 yyyymm 전달)
      const formattedData = formatProductDetailData(rows, itemStd, yyyymm);

      console.log(`✅ 브랜드 ${brandCode} ${itemStd} 품번별 재고주수 조회 성공: ${formattedData.monthly.length}개 품번 (당월), ${formattedData.accumulated.length}개 품번 (누적)`);

      return NextResponse.json({
        success: true,
        data: formattedData,
      });
    } finally {
      // Snowflake 연결 종료
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 품번별 재고주수 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: 500 }
    );
  }
}
