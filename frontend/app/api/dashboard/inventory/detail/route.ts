/**
 * 품번별 재고주수 데이터 조회 API
 * GET /api/dashboard/inventory/detail?brandCode=M&itemStd=신발&month=202510&periodType=monthly
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { buildProductDetailQuery, formatProductDetailData } from '@/lib/dashboard-service';
import { ensureBrandCode, ensureItemStd, ensureYyyymm } from '@/lib/request-validation';

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
    const rawBrandCode = searchParams.get('brandCode') || 'M';
    const rawItemStd = searchParams.get('itemStd') || '신발';
    const month = searchParams.get('month');
    const rawYyyymm = month || getCurrentYearMonth();
    const excludePurchase = searchParams.get('excludePurchase') === 'true';
    const brandCode = ensureBrandCode(rawBrandCode);
    const itemStd = ensureItemStd(rawItemStd);
    const yyyymm = ensureYyyymm(rawYyyymm);

    console.log(`📊 브랜드 ${brandCode} ${itemStd} 품번별 재고주수 조회 시작 (${yyyymm}, 사입제외: ${excludePurchase})`);

    let connection: any = null;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        // Snowflake 연결
        connection = await connectToSnowflake();

        // 쿼리 생성 및 실행
        const statement = buildProductDetailQuery(brandCode, itemStd, yyyymm, excludePurchase);
        const rows = await executeQuery(statement.sqlText, connection, 0, statement.binds);
        
        // 데이터 포맷팅 (시즌 정보를 위해 yyyymm 전달)
        const formattedData = formatProductDetailData(rows, itemStd, yyyymm);

        console.log(`✅ 브랜드 ${brandCode} ${itemStd} 품번별 재고주수 조회 성공: ${formattedData.monthly.length}개 품번 (당월), ${formattedData.accumulated.length}개 품번 (누적)`);

        return NextResponse.json({
          success: true,
          data: formattedData,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // 연결 종료 오류인 경우 재시도
        if (errorMessage.includes('terminated') && retryCount < maxRetries) {
          retryCount++;
          console.log(`연결 오류 발생, 재시도 ${retryCount}/${maxRetries}...`);
          // 연결을 null로 설정하여 다음 시도에서 새로 연결
          await disconnectFromSnowflake().catch(() => {});
          // 잠시 대기 후 재시도
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        // 재시도 불가능하거나 다른 오류인 경우
        throw error;
      } finally {
        // Snowflake 연결 종료
        if (connection) {
          try {
            await disconnectFromSnowflake();
          } catch (error) {
            console.warn('연결 종료 중 오류 (무시):', error);
          }
        }
      }
    }

    throw new Error('최대 재시도 횟수 초과');
  } catch (error) {
    console.error('❌ 품번별 재고주수 조회 실패:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: errorMessage.startsWith('유효하지 않은') ? 400 : 500 }
    );
  }
}
