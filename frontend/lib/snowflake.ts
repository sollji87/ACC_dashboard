/**
 * Snowflake 연결 및 쿼리 실행 유틸리티
 */

import * as snowflake from 'snowflake-sdk';

interface SnowflakeConnection {
  account: string;
  username: string;
  password: string;
  warehouse: string;
  database: string;
  schema: string;
}

let connection: snowflake.Connection | null = null;

/**
 * Snowflake 연결 생성
 */
export async function connectToSnowflake(): Promise<snowflake.Connection> {
  return new Promise((resolve, reject) => {
    const config: SnowflakeConnection = {
      account: process.env.SNOWFLAKE_ACCOUNT || '',
      username: process.env.SNOWFLAKE_USERNAME || '',
      password: process.env.SNOWFLAKE_PASSWORD || '',
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || '',
      database: process.env.SNOWFLAKE_DATABASE || '',
      schema: process.env.SNOWFLAKE_SCHEMA || '',
    };

    // 환경 변수 검증
    if (!config.account || !config.username || !config.password) {
      reject(new Error('Snowflake 환경 변수가 설정되지 않았습니다.'));
      return;
    }

    connection = snowflake.createConnection({
      account: config.account,
      username: config.username,
      password: config.password,
      warehouse: config.warehouse,
      database: config.database,
      schema: config.schema,
    });

    connection.connect((err, conn) => {
      if (err) {
        console.error('Snowflake 연결 실패:', err);
        reject(err);
      } else {
        console.log('Snowflake 연결 성공');
        connection = conn;
        resolve(conn);
      }
    });
  });
}

/**
 * SQL 쿼리 실행
 */
export async function executeQuery<T = any>(
  sqlText: string,
  conn?: snowflake.Connection
): Promise<T[]> {
  const connectionToUse = conn || connection;

  if (!connectionToUse) {
    throw new Error('Snowflake 연결이 없습니다. 먼저 connectToSnowflake()를 호출하세요.');
  }

  return new Promise((resolve, reject) => {
    connectionToUse.execute({
      sqlText,
      complete: (err, stmt, rows) => {
        if (err) {
          console.error('쿼리 실행 실패:', err);
          reject(err);
        } else {
          console.log(`쿼리 실행 성공: ${rows?.length || 0}개 행 반환`);
          resolve((rows || []) as T[]);
        }
      },
    });
  });
}

/**
 * Snowflake 연결 종료
 */
export async function disconnectFromSnowflake(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (connection) {
      connection.destroy((err) => {
        if (err) {
          console.error('연결 종료 실패:', err);
          reject(err);
        } else {
          console.log('Snowflake 연결 종료');
          connection = null;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

