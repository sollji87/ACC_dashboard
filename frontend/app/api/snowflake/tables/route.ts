/**
 * Snowflake 테이블 목록 조회 API
 * GET /api/snowflake/tables
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const database = searchParams.get('database') || process.env.SNOWFLAKE_DATABASE || '';
    const schema = searchParams.get('schema') || process.env.SNOWFLAKE_SCHEMA || '';

    console.log(`🔍 테이블 목록 조회 시작 (Database: ${database}, Schema: ${schema})...`);
    
    // 연결
    const connection = await connectToSnowflake();
    console.log('✅ Snowflake 연결 성공');

    try {
      // 테이블 목록 조회
      let query = `
        SELECT 
          table_catalog as database_name,
          table_schema as schema_name,
          table_name,
          table_type,
          row_count,
          bytes,
          created,
          last_altered
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
      `;

      if (database) {
        query += ` AND table_catalog = '${database}'`;
      }
      if (schema) {
        query += ` AND table_schema = '${schema}'`;
      }

      query += ` ORDER BY table_catalog, table_schema, table_name`;

      const tables = await executeQuery(query, connection);
      
      console.log(`✅ 테이블 목록 조회 성공: ${tables.length}개 테이블`);

      return NextResponse.json({
        success: true,
        data: tables,
        count: tables.length,
      });
    } finally {
      // 연결 종료
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 테이블 목록 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: 500 }
    );
  }
}

