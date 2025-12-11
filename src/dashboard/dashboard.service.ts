import { Injectable, Logger } from '@nestjs/common';
import { SnowflakeService } from '../snowflake/snowflake.service';

interface InventoryWeeksData {
  ITEM_STD: string;
  CY_STOCK_WEEK_CNT: number;
  PY_STOCK_WEEK_CNT: number;
  CY_END_STOCK_TAG_AMT: number;
  PY_END_STOCK_TAG_AMT: number;
  CY_ACT_SALE_AMT: number;
  PY_ACT_SALE_AMT: number;
  CY_TAG_SALE_AMT: number;
  PY_TAG_SALE_AMT: number;
  SEQ: number;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly snowflakeService: SnowflakeService) {}

  /**
   * 브랜드별 악세사리 재고주수 조회
   * @param brandCode 브랜드 코드 (M, MK, DX, DV, ST)
   * @param yyyymm 조회 월 (예: 202510)
   */
  async getInventoryWeeks(brandCode: string, yyyymm: string): Promise<any> {
    try {
      this.logger.log(`Snowflake 연결 시작 (브랜드: ${brandCode}, 월: ${yyyymm})`);
      await this.snowflakeService.connect();
      this.logger.log(`Snowflake 연결 성공`);

      // 전년 월 계산 (1년 전)
      const pyYyyymm = this.getPreviousYearMonth(yyyymm);

      const query = `
-- item: item 기준
with item as (
    select prdt_cd
            , sesn
            , case when prdt_hrrc1_nm='ACC' and prdt_hrrc2_nm='Headwear' then '모자'
                    when prdt_hrrc1_nm='ACC' and prdt_hrrc2_nm='Shoes' then '신발'
                    when prdt_hrrc1_nm='ACC' and prdt_hrrc2_nm='Bag' then '가방'
                    when prdt_hrrc1_nm='ACC' and prdt_hrrc2_nm='Acc_etc' then '기타ACC'
              end as item_std
    from sap_fnf.mst_prdt
    where 1=1
    and brd_cd = '${brandCode}'
)
-- item_seq: 아이템 정렬 순서
, item_seq as (
    select '신발' as item_nm, 1 as seq
    union all select '모자' as item_nm, 2 as seq
    union all select '가방' as item_nm, 3 as seq
    union all select '기타ACC' as item_nm, 4 as seq
)
-- cm_stock: 당월 재고
, cm_stock as (
    -- 당해
    select 'cy' as div
            , b.item_std
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm = '${yyyymm}'
    group by b.item_std
    union all
    -- 전년
    select 'py' as div
            , b.item_std
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm = '${pyYyyymm}'
    group by b.item_std
)
-- c6m_sale: 최근 1개월 TAG 매출 (재고주수 계산용)
, c6m_sale as(
    -- 당해
    select 'cy' as div
        , b.item_std
        , sum(tag_sale_amt) as c6m_tag_sale_amt
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd <> '9' -- 수출제외
        and a.brd_cd = '${brandCode}'
        and a.pst_yyyymm between '${yyyymm}' and '${yyyymm}' -- 최근 1개월 기준 
    group by b.item_std
    union all
    -- 전년
    select 'py' as div
        , b.item_std
        , sum(tag_sale_amt) as c6m_tag_sale_amt
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd <> '9' -- 수출제외
        and a.brd_cd = '${brandCode}'
        and a.pst_yyyymm between '${pyYyyymm}' and '${pyYyyymm}'  -- 최근 1개월 기준
    group by b.item_std
)
-- act_sale: 실판매출 (ACC 판매액 표시용)
, act_sale as(
    -- 당해
    select 'cy' as div
        , b.item_std
        , sum(act_sale_amt) as act_sale_amt
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd <> '9' -- 수출제외
        and a.brd_cd = '${brandCode}'
        and a.pst_yyyymm between '${yyyymm}' and '${yyyymm}'
    group by b.item_std
    union all
    -- 전년
    select 'py' as div
        , b.item_std
        , sum(act_sale_amt) as act_sale_amt
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd <> '9' -- 수출제외
        and a.brd_cd = '${brandCode}'
        and a.pst_yyyymm between '${pyYyyymm}' and '${pyYyyymm}'
    group by b.item_std
)
select '전체' as item_std
        , round( sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) 
            / nullif(sum( (case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
            , 1) as cy_stock_week_cnt
        , round( sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) 
            / nullif(sum( (case when a.div='py' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
            , 1) as py_stock_week_cnt
        , sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) as cy_end_stock_tag_amt
        , sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) as py_end_stock_tag_amt
        , sum(case when a.div='cy' then d.act_sale_amt else 0 end) as cy_act_sale_amt
        , sum(case when a.div='py' then d.act_sale_amt else 0 end) as py_act_sale_amt
        , sum(case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) as cy_tag_sale_amt
        , sum(case when a.div='py' then b.c6m_tag_sale_amt else 0 end) as py_tag_sale_amt
        , 0 as seq
from cm_stock a 
join c6m_sale b
on a.item_std = b.item_std
and a.div = b.div
join act_sale d
on a.item_std = d.item_std
and a.div = d.div
union all
select a.item_std
        , round( sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) 
            / nullif(sum( (case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
            , 1) as cy_stock_week_cnt
        , round( sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) 
            / nullif(sum( (case when a.div='py' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
            , 1) as py_stock_week_cnt
        , sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) as cy_end_stock_tag_amt
        , sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) as py_end_stock_tag_amt
        , sum(case when a.div='cy' then d.act_sale_amt else 0 end) as cy_act_sale_amt
        , sum(case when a.div='py' then d.act_sale_amt else 0 end) as py_act_sale_amt
        , sum(case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) as cy_tag_sale_amt
        , sum(case when a.div='py' then b.c6m_tag_sale_amt else 0 end) as py_tag_sale_amt
        , c.seq
from cm_stock a 
join c6m_sale b
on a.item_std = b.item_std
and a.div = b.div
join act_sale d
on a.item_std = d.item_std
and a.div = d.div
join item_seq c
  on a.item_std = c.item_nm
group by a.item_std, c.seq
order by seq
      `;

      this.logger.log(`쿼리 실행 시작`);
      const rows = await this.snowflakeService.executeQuery<InventoryWeeksData>(query);
      this.logger.log(`쿼리 실행 완료: ${rows.length}개 행 반환`);
      
      await this.snowflakeService.disconnect();
      this.logger.log(`Snowflake 연결 종료`);

      const formattedData = this.formatInventoryData(rows, brandCode, yyyymm);
      this.logger.log(`데이터 포맷팅 완료`);
      return formattedData;
    } catch (error) {
      this.logger.error('재고주수 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 전년 월 계산 (1년 전)
   */
  private getPreviousYearMonth(yyyymm: string): string {
    const year = parseInt(yyyymm.substring(0, 4));
    const month = yyyymm.substring(4, 6);
    return `${year - 1}${month}`;
  }

  /**
   * Snowflake 데이터를 프론트엔드 형식으로 변환
   */
  private formatInventoryData(rows: InventoryWeeksData[], brandCode: string, yyyymm: string) {
    const totalRow = rows.find(r => r.ITEM_STD === '전체');
    const itemRows = rows.filter(r => r.ITEM_STD !== '전체');

    const accInventoryDetail: any = {};
    
    itemRows.forEach(row => {
      const itemKey = this.getItemKey(row.ITEM_STD);
      accInventoryDetail[itemKey] = {
        current: Math.round(row.CY_END_STOCK_TAG_AMT / 1000000), // 백만원 단위
        previous: Math.round(row.PY_END_STOCK_TAG_AMT / 1000000),
        weeks: row.CY_STOCK_WEEK_CNT || 0,
        previousWeeks: row.PY_STOCK_WEEK_CNT || 0,
      };
    });

    // 실판매액 (기존 로직 유지)
    const totalCySale = itemRows.reduce((sum, row) => sum + (row.CY_ACT_SALE_AMT || 0), 0);
    const totalPySale = itemRows.reduce((sum, row) => sum + (row.PY_ACT_SALE_AMT || 0), 0);
    
    // 택판매액 (추가)
    const totalCyTagSale = itemRows.reduce((sum, row) => sum + (row.CY_TAG_SALE_AMT || 0), 0);
    const totalPyTagSale = itemRows.reduce((sum, row) => sum + (row.PY_TAG_SALE_AMT || 0), 0);
    
    // 매출액 YOY 계산 (택판매액 기준)
    const salesYOY = totalPyTagSale > 0 ? Math.round((totalCyTagSale / totalPyTagSale) * 100) : 0;

    // 기말재고 YOY 계산
    const totalCyStock = itemRows.reduce((sum, row) => sum + (row.CY_END_STOCK_TAG_AMT || 0), 0);
    const totalPyStock = itemRows.reduce((sum, row) => sum + (row.PY_END_STOCK_TAG_AMT || 0), 0);
    const inventoryYOY = totalPyStock > 0 ? Math.round((totalCyStock / totalPyStock) * 100) : 0;

    return {
      brandCode,
      month: yyyymm,
      salesYOY,
      inventoryYOY,
      accEndingInventory: Math.round(totalCyStock / 1000000), // 백만원
      accSalesAmount: Math.round(totalCySale / 1000000), // 백만원 (실판매액)
      accTagSalesAmount: Math.round(totalCyTagSale / 1000000), // 백만원 (택판매액)
      totalWeeks: totalRow?.CY_STOCK_WEEK_CNT || 0, // 전체 재고주수 (당년)
      totalPreviousWeeks: totalRow?.PY_STOCK_WEEK_CNT || 0, // 전체 재고주수 (전년)
      accInventoryDetail,
    };
  }

  /**
   * 아이템명을 키로 변환
   */
  private getItemKey(itemStd: string): string {
    const mapping: { [key: string]: string } = {
      '신발': 'shoes',
      '모자': 'hat',
      '가방': 'bag',
      '기타ACC': 'other',
    };
    return mapping[itemStd] || 'other';
  }

  /**
   * 입고예정금액 조회
   * @param brandCode 브랜드 코드
   * @param startMonth 시작 월 (YYYY-MM)
   * @param endMonth 종료 월 (YYYY-MM)
   */
  async getIncomingAmounts(
    brandCode: string,
    startMonth: string,
    endMonth: string,
  ): Promise<any> {
    try {
      this.logger.log(
        `입고예정금액 조회 시작 (브랜드: ${brandCode}, 기간: ${startMonth} ~ ${endMonth})`,
      );
      await this.snowflakeService.connect();

      const rows = await this.snowflakeService.getIncomingAmounts(
        brandCode,
        startMonth,
        endMonth,
      );

      await this.snowflakeService.disconnect();

      // 월별로 집계
      const monthlyData = this.aggregateIncomingAmountsByMonth(rows);

      this.logger.log(`입고예정금액 조회 완료: ${monthlyData.length}개 월`);
      return monthlyData;
    } catch (error) {
      this.logger.error('입고예정금액 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 입고예정금액을 월별 중분류별로 집계 (합의납기연월 기준)
   */
  private aggregateIncomingAmountsByMonth(rows: any[]): any[] {
    // 월별 중분류별 집계 맵
    const monthlyMap = new Map<
      string,
      { shoes: number; hat: number; bag: number; other: number }
    >();

    rows.forEach((row) => {
      // 합의납기연월 기준으로 집계
      const month = row['합의납기연월'];
      const itemStd = row['중분류'];
      if (!month || !itemStd) return;

      const amount = Number(row['발주금액']) || 0;

      // 월별 데이터 초기화
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { shoes: 0, hat: 0, bag: 0, other: 0 });
      }

      const monthData = monthlyMap.get(month)!;

      // 중분류별 금액 누적
      switch (itemStd) {
        case '신발':
          monthData.shoes += amount;
          break;
        case '모자':
          monthData.hat += amount;
          break;
        case '가방':
          monthData.bag += amount;
          break;
        case '기타ACC':
          monthData.other += amount;
          break;
      }
    });

    // 월별 데이터 배열로 변환 및 정렬
    const result = Array.from(monthlyMap.entries())
      .map(([month, amounts]) => ({
        month,
        shoes: Math.round(amounts.shoes), // 원 단위
        hat: Math.round(amounts.hat),
        bag: Math.round(amounts.bag),
        other: Math.round(amounts.other),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return result;
  }
}

