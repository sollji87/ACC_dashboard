/**
 * Snowflake 테이블 컬럼 정보 조회 API
 * GET /api/snowflake/table/columns?database=xxx&schema=xxx&table=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { ensureSnowflakeIdentifier } from '@/lib/request-validation';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const database = ensureSnowflakeIdentifier(searchParams.get('database'), 'database');
    const schema = ensureSnowflakeIdentifier(searchParams.get('schema'), 'schema');
    const table = ensureSnowflakeIdentifier(searchParams.get('table'), 'table');

    console.log(`🔍 테이블 컬럼 정보 조회 시작 (${database}.${schema}.${table})...`);
    
    // 연결
    const connection = await connectToSnowflake();
    console.log('✅ Snowflake 연결 성공');

    try {
      // 컬럼 정보 조회
      const query = `
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          is_nullable,
          column_default,
          comment
        FROM information_schema.columns
        WHERE table_catalog = :1
          AND table_schema = :2
          AND table_name = :3
        ORDER BY ordinal_position
      `;

      const columns = await executeQuery(query, connection, 0, [database, schema, table]);
      
      console.log(`✅ 컬럼 정보 조회 성공: ${columns.length}개 컬럼`);

      return NextResponse.json({
        success: true,
        data: columns,
        count: columns.length,
        table: {
          database,
          schema,
          table,
        },
      });
    } finally {
      // 연결 종료
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 컬럼 정보 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: error instanceof Error && error.message.startsWith('유효하지 않은') ? 400 : 500 }
    );
  }
}

