import { NextRequest, NextResponse } from 'next/server';

/**
 * 입고예정금액 조회 API
 * GET /api/dashboard/incoming-amounts?brandCode=M&startMonth=2025-11&endMonth=2026-04
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = searchParams.get('brandCode');
    const startMonth = searchParams.get('startMonth');
    const endMonth = searchParams.get('endMonth');

    // 파라미터 검증
    if (!brandCode || !startMonth || !endMonth) {
      return NextResponse.json(
        {
          success: false,
          error: 'brandCode, startMonth, endMonth 파라미터가 필요합니다.',
        },
        { status: 400 }
      );
    }

    // NestJS 백엔드 API 호출
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const apiUrl = `${backendUrl}/api/dashboard/incoming-amounts?brandCode=${brandCode}&startMonth=${startMonth}&endMonth=${endMonth}`;

    console.log('🔍 백엔드 API 호출:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 백엔드 API 오류:', errorText);
      return NextResponse.json(
        {
          success: false,
          error: `백엔드 API 호출 실패: ${response.status}`,
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    console.log('✅ 입고예정금액 조회 성공:', result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ 입고예정금액 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '서버 오류',
      },
      { status: 500 }
    );
  }
}

