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
   * SQL 쿼리 실행 (파라미터화된 쿼리 지원)
   * @param sqlText SQL 쿼리 문자열 (? 플레이스홀더 사용)
   * @param binds 바인딩할 파라미터 배열
   */
  async executeQuery<T = any>(sqlText: string, binds?: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        reject(new Error('Snowflake 연결이 없습니다. 먼저 connect()를 호출하세요.'));
        return;
      }

      this.connection.execute({
        sqlText,
        binds: binds || [],
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
   * 입고예정금액 조회 (발주 데이터 기반)
   * @param brandCode 브랜드 코드
   * @param startMonth 시작 월 (YYYY-MM)
   * @param endMonth 종료 월 (YYYY-MM)
   */
  async getIncomingAmounts(
    brandCode: string,
    startMonth: string,
    endMonth: string,
  ): Promise<any[]> {
    // YYYY-MM 형식을 YYYYMM으로 변환 (모든 하이픈 제거)
    const startYyyymm = startMonth.replace(/-/g, '');
    const endYyyymm = endMonth.replace(/-/g, '');

    const sqlText = `
-- 발주 데이터 (합의납기연월 기준, 중분류별 집계)
with base as (
    select  a.brd_cd                              as brd_cd
          , d.vtext2                              as mid_cat        -- 중분류
          , to_char(a.indc_dt_cnfm, 'YYYY-MM')    as indc_yyyymm    -- 합의납기연월
          , a.tag_price * a.ord_qty               as ord_amt        -- 발주금액
    from prcs.dw_ord a
    left join sap_fnf.mst_prdt d
      on a.prdt_cd = d.prdt_cd
    where 1 = 1
      -- 브랜드 필터
      and a.brd_cd = ?
      -- 중분류 필터 (ACC만)
      and d.vtext2 in ('Acc_etc', 'Bag', 'Headwear', 'Shoes')
      -- PO_CLS_NM 필터
      and a.PO_CLS_NM in (
            '내수/원화/세금계산서/DDP',
            '한국수입/외화/세금계산서/FOB',
            '한국수입/외화/FOB'
      )
      -- 합의납기일 존재
      and a.indc_dt_cnfm is not null
      -- 합의납기연월이 범위 내에 있는 경우만
      and to_char(a.indc_dt_cnfm, 'YYYYMM') between ? and ?
)
select  brd_cd                                as "브랜드"
      , case
          when mid_cat = 'Shoes' then '신발'
          when mid_cat = 'Headwear' then '모자'
          when mid_cat = 'Bag' then '가방'
          when mid_cat = 'Acc_etc' then '기타ACC'
          else '기타ACC'
        end                                   as "중분류"
      , indc_yyyymm                           as "합의납기연월"
      , sum(ord_amt)                          as "발주금액"
from base
group by brd_cd, mid_cat, indc_yyyymm
order by brd_cd, indc_yyyymm, mid_cat
;
    `;

    return this.executeQuery(sqlText, [brandCode, startYyyymm, endYyyymm]);
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

