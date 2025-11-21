/**
 * Snowflake 연결 테스트 API
 * GET /api/snowflake/test
 */

import { NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';

export async function GET() {
  try {
    console.log('🔍 Snowflake 연결 테스트 시작...');
    
    // 연결
    const connection = await connectToSnowflake();
    console.log('✅ Snowflake 연결 성공');

    try {
      // 간단한 쿼리로 연결 확인
      const result = await executeQuery('SELECT CURRENT_VERSION() as version, CURRENT_DATABASE() as database, CURRENT_SCHEMA() as schema', connection);
      
      console.log('✅ 쿼리 실행 성공:', result);

      return NextResponse.json({
        success: true,
        message: 'Snowflake 연결 성공',
        data: result[0],
      });
    } finally {
      // 연결 종료
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ Snowflake 연결 테스트 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: 500 }
    );
  }
}

