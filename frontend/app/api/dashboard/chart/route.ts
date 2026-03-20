import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { buildChartDataQuery, formatChartData } from '@/lib/chart-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = searchParams.get('brandCode');
    const yyyymm = searchParams.get('yyyymm');
    const weeksTypeParam = searchParams.get('weeksType');
    const weeksType = (weeksTypeParam as '4weeks' | '8weeks' | '12weeks') || '12weeks';
    const itemStd = searchParams.get('itemStd') || 'all';
    const excludePurchaseParam = searchParams.get('excludePurchase');
    const excludePurchase = excludePurchaseParam === 'true';
    const baseParam = searchParams.get('base');
    const base = (baseParam === 'quantity' ? 'quantity' : 'amount') as 'amount' | 'quantity';

    if (!brandCode || !yyyymm) {
      console.error('❌ 필수 파라미터 누락:', { brandCode, yyyymm });
      return NextResponse.json(
        { success: false, error: 'brandCode와 yyyymm 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    // SQL 인젝션 방지: 파라미터 검증
    if (!/^[A-Za-z]{1,2}$/.test(brandCode)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 브랜드 코드입니다.' },
        { status: 400 }
      );
    }
    
    if (!/^\d{6}$/.test(yyyymm)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 월 형식입니다. (YYYYMM 형식 필요)' },
        { status: 400 }
      );
    }
    
    const validItemStd = ['신발', '모자', '가방', '기타ACC', 'all'];
    if (!validItemStd.includes(itemStd)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 아이템 분류입니다.' },
        { status: 400 }
      );
    }

    console.log('📊 차트 데이터 조회 시작:', { brandCode, yyyymm, weeksType, itemStd, excludePurchase, base });

    const statement = buildChartDataQuery(brandCode, yyyymm, weeksType, itemStd, excludePurchase, base);
    console.log('📝 생성된 쿼리 길이:', statement.sqlText.length, '자');
    console.log('📝 쿼리 시작 부분:', statement.sqlText.substring(0, 300));

    const connection = await connectToSnowflake();
    try {
      const rows = await executeQuery(statement.sqlText, connection, 0, statement.binds);
      console.log('✅ 쿼리 실행 성공:', rows.length, '개 행 반환');
      console.log('📊 첫 번째 행 샘플:', rows[0]);
      
      const formattedData = formatChartData(rows, base);
      console.log('✅ 데이터 포맷팅 완료:', formattedData.length, '개 월 데이터');
      console.log('📊 포맷팅된 데이터 샘플:', formattedData[0]);

      return NextResponse.json({
        success: true,
        data: formattedData,
      });
    } catch (queryError) {
      console.error('❌ 쿼리 실행 실패:', queryError);
      throw queryError;
    } finally {
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 차트 데이터 조회 실패:', error);
    console.error('❌ 에러 상세:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
