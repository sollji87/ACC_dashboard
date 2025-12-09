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
  // 기존 연결이 있으면 먼저 종료 (안전하게 새로 연결하기 위해)
  if (connection) {
    try {
      await disconnectFromSnowflake();
    } catch (error) {
      console.warn('기존 연결 종료 중 오류 (무시):', error);
      connection = null; // 강제로 null로 설정
    }
  }

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
        connection = null;
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
  let connectionToUse = conn || connection;

  // 연결이 없거나 종료된 경우 새로 연결
  if (!connectionToUse) {
    console.log('연결이 없어 새로 연결합니다.');
    connectionToUse = await connectToSnowflake();
  }

  return new Promise((resolve, reject) => {
    try {
      connectionToUse!.execute({
        sqlText,
        complete: (err, stmt, rows) => {
          if (err) {
            console.error('쿼리 실행 실패:', err);
            // 연결 종료 오류인 경우 연결을 null로 설정
            if (err.message && err.message.includes('terminated')) {
              connection = null;
            }
            reject(err);
          } else {
            console.log(`쿼리 실행 성공: ${rows?.length || 0}개 행 반환`);
            resolve((rows || []) as T[]);
          }
        },
      });
    } catch (error) {
      // 연결이 종료된 경우 새로 연결 시도
      if (error instanceof Error && error.message.includes('terminated')) {
        console.log('연결이 종료되어 재연결합니다.');
        connection = null;
        reject(new Error('연결이 종료되었습니다. 다시 시도해주세요.'));
      } else {
        reject(error);
      }
    }
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

