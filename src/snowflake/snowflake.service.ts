import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as snowflake from 'snowflake-sdk';

@Injectable()
export class SnowflakeService {
  private readonly logger = new Logger(SnowflakeService.name);
  private connection: snowflake.Connection | null = null;

  constructor(private configService: ConfigService) {}

  /**
   * Snowflake 연결 생성
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection = snowflake.createConnection({
        account: this.configService.get<string>('SNOWFLAKE_ACCOUNT') || '',
        username: this.configService.get<string>('SNOWFLAKE_USERNAME') || '',
        password: this.configService.get<string>('SNOWFLAKE_PASSWORD') || '',
        warehouse: this.configService.get<string>('SNOWFLAKE_WAREHOUSE') || '',
        database: this.configService.get<string>('SNOWFLAKE_DATABASE') || '',
        schema: this.configService.get<string>('SNOWFLAKE_SCHEMA') || '',
      });

      this.connection.connect((err, conn) => {
        if (err) {
          this.logger.error('Snowflake 연결 실패:', err);
          reject(err);
        } else {
          this.logger.log('Snowflake 연결 성공');
          this.connection = conn;
          resolve();
        }
      });
    });
  }

  /**
   * SQL 쿼리 실행
   */
  async executeQuery<T = any>(sqlText: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        reject(new Error('Snowflake 연결이 없습니다. 먼저 connect()를 호출하세요.'));
        return;
      }

      this.connection.execute({
        sqlText,
        complete: (err, stmt, rows) => {
          if (err) {
            this.logger.error('쿼리 실행 실패:', err);
            reject(err);
          } else {
            this.logger.log(`쿼리 실행 성공: ${rows?.length || 0}개 행 반환`);
            resolve(rows as T[]);
          }
        },
      });
    });
  }

  /**
   * 브랜드별 악세사리 재고 조회
   */
  async getInventoryByBrand(): Promise<any[]> {
    const sqlText = `
      SELECT 
        brand,
        accessory_type,
        SUM(quantity) as total_quantity,
        COUNT(*) as item_count
      FROM inventory
      GROUP BY brand, accessory_type
      ORDER BY brand, accessory_type
    `;
    return this.executeQuery(sqlText);
  }

  /**
   * 연결 종료
   */
  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.destroy((err) => {
          if (err) {
            this.logger.error('연결 종료 실패:', err);
            reject(err);
          } else {
            this.logger.log('Snowflake 연결 종료');
            this.connection = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

