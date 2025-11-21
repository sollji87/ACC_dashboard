/**
 * 대시보드 데이터 처리 로직
 */

interface InventoryWeeksData {
  ITEM_STD: string;
  PERIOD_TYPE?: string; // 'monthly' or 'accumulated'
  CY_STOCK_WEEK_CNT: number;
  PY_STOCK_WEEK_CNT: number;
  CY_END_STOCK_TAG_AMT: number;
  PY_END_STOCK_TAG_AMT: number;
  CY_ACT_SALE_AMT: number;
  PY_ACT_SALE_AMT: number;
  SEQ: number;
}

/**
 * 전년 월 계산
 */
function getPreviousYearMonth(yyyymm: string): string {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  
  const prevYear = year - 1;
  return `${prevYear}${String(month).padStart(2, '0')}`;
}

/**
 * YYYYMM 형식에서 년월 추출 (예: '202510' -> {year: 2025, month: 10})
 */
function parseYearMonth(yyyymm: string): { year: number; month: number } {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  return { year, month };
}

/**
 * 재고주수 쿼리 생성 (당월 + 누적 데이터 포함)
 */
export function buildInventoryQuery(brandCode: string, yyyymm: string): string {
  const pyYyyymm = getPreviousYearMonth(yyyymm);
  const { year, month } = parseYearMonth(yyyymm);
  const pyYear = year - 1;
  
  // 누적 범위: 1월부터 해당월까지
  const cyAccumStart = `${year}01`;
  const pyAccumStart = `${pyYear}01`;

  return `
-- item: item 기준
with item as (
    select prdt_cd
            , sesn
            , case when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Headwear' then '모자'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Shoes'   then '신발'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Bag'     then '가방'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Acc_etc' then '기타ACC'
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
-- c6m_sale: 당월 TAG 매출 (재고주수 계산용 - 당월)
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
        and a.pst_yyyymm between '${yyyymm}' and '${yyyymm}' -- 당월 기준 
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
        and a.pst_yyyymm between '${pyYyyymm}' and '${pyYyyymm}'  -- 당월 기준
    group by b.item_std
)
-- c6m_sale_accumulated: 누적 TAG 매출 (재고주수 계산용 - 누적, 1월부터 해당월까지)
, c6m_sale_accumulated as(
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
        and a.pst_yyyymm between '${cyAccumStart}' and '${yyyymm}' -- 1월부터 해당월까지 누적
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
        and a.pst_yyyymm between '${pyAccumStart}' and '${pyYyyymm}'  -- 1월부터 해당월까지 누적
    group by b.item_std
)
-- act_sale: 당월 실판매출 (ACC 판매액 표시용 - 당월)
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
        and a.pst_yyyymm between '${yyyymm}' and '${yyyymm}' -- 당월
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
        and a.pst_yyyymm between '${pyYyyymm}' and '${pyYyyymm}' -- 당월
    group by b.item_std
)
-- act_sale_accumulated: 누적 실판매출 (ACC 판매액 표시용 - 누적, 1월부터 해당월까지)
, act_sale_accumulated as(
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
        and a.pst_yyyymm between '${cyAccumStart}' and '${yyyymm}' -- 1월부터 해당월까지 누적
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
        and a.pst_yyyymm between '${pyAccumStart}' and '${pyYyyymm}' -- 1월부터 해당월까지 누적
    group by b.item_std
)
-- 당월 데이터
select '전체' as item_std
        , 'monthly' as period_type
        , case when sum(case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
                , 1)
            else null
          end as cy_stock_week_cnt
        , case when sum(case when a.div='py' then b.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='py' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
                , 1)
            else null
          end as py_stock_week_cnt
        , sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) as cy_end_stock_tag_amt
        , sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) as py_end_stock_tag_amt
        , sum(case when a.div='cy' then d.act_sale_amt else 0 end) as cy_act_sale_amt
        , sum(case when a.div='py' then d.act_sale_amt else 0 end) as py_act_sale_amt
        , 0 as seq
from cm_stock a 
join c6m_sale b
on a.item_std = b.item_std
and a.div = b.div
join act_sale d
on a.item_std = d.item_std
and a.div = d.div
union all
-- 누적 데이터 (재고주수는 누적 평균, 기말재고는 동일, 판매액은 누적)
select '전체' as item_std
        , 'accumulated' as period_type
        , case when sum(case when a.div='cy' then b_acc.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='cy' then b_acc.c6m_tag_sale_amt else 0 end) / ${month} / 30 * 7),0)
                , 1)
            else null
          end as cy_stock_week_cnt
        , case when sum(case when a.div='py' then b_acc.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='py' then b_acc.c6m_tag_sale_amt else 0 end) / ${month} / 30 * 7),0)
                , 1)
            else null
          end as py_stock_week_cnt
        , sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) as cy_end_stock_tag_amt
        , sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) as py_end_stock_tag_amt
        , sum(case when a.div='cy' then d_acc.act_sale_amt else 0 end) as cy_act_sale_amt
        , sum(case when a.div='py' then d_acc.act_sale_amt else 0 end) as py_act_sale_amt
        , 0 as seq
from cm_stock a 
join c6m_sale_accumulated b_acc
on a.item_std = b_acc.item_std
and a.div = b_acc.div
join act_sale_accumulated d_acc
on a.item_std = d_acc.item_std
and a.div = d_acc.div
union all
-- 당월 데이터 - 아이템별
select a.item_std
        , 'monthly' as period_type
        , case when sum(case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
                , 1)
            else null
          end as cy_stock_week_cnt
        , case when sum(case when a.div='py' then b.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='py' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
                , 1)
            else null
          end as py_stock_week_cnt
        , sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) as cy_end_stock_tag_amt
        , sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) as py_end_stock_tag_amt
        , sum(case when a.div='cy' then d.act_sale_amt else 0 end) as cy_act_sale_amt
        , sum(case when a.div='py' then d.act_sale_amt else 0 end) as py_act_sale_amt
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
union all
-- 누적 데이터 - 아이템별
select a.item_std
        , 'accumulated' as period_type
        , case when sum(case when a.div='cy' then b_acc.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='cy' then b_acc.c6m_tag_sale_amt else 0 end) / ${month} / 30 * 7),0)
                , 1)
            else null
          end as cy_stock_week_cnt
        , case when sum(case when a.div='py' then b_acc.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='py' then b_acc.c6m_tag_sale_amt else 0 end) / ${month} / 30 * 7),0)
                , 1)
            else null
          end as py_stock_week_cnt
        , sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) as cy_end_stock_tag_amt
        , sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) as py_end_stock_tag_amt
        , sum(case when a.div='cy' then d_acc.act_sale_amt else 0 end) as cy_act_sale_amt
        , sum(case when a.div='py' then d_acc.act_sale_amt else 0 end) as py_act_sale_amt
        , c.seq
from cm_stock a 
join c6m_sale_accumulated b_acc
on a.item_std = b_acc.item_std
and a.div = b_acc.div
join act_sale_accumulated d_acc
on a.item_std = d_acc.item_std
and a.div = d_acc.div
join item_seq c
  on a.item_std = c.item_nm
group by a.item_std, c.seq
order by period_type, seq
  `;
}

/**
 * 데이터 포맷팅
 */
export function formatInventoryData(
  rows: InventoryWeeksData[],
  brandCode: string,
  yyyymm: string
): any {
  console.log(`📊 [${brandCode}] 포맷팅 시작 - 받은 행 수:`, rows.length);
  console.log(`📊 [${brandCode}] 원본 데이터:`, rows);
  
  // 당월과 누적 데이터 분리
  const monthlyRows = rows.filter((r) => !r.PERIOD_TYPE || r.PERIOD_TYPE === 'monthly');
  const accumulatedRows = rows.filter((r) => r.PERIOD_TYPE === 'accumulated');
  
  const monthlyTotalRow = monthlyRows.find((r) => r.ITEM_STD === '전체');
  const monthlyItemRows = monthlyRows.filter((r) => r.ITEM_STD !== '전체');
  const accumulatedTotalRow = accumulatedRows.find((r) => r.ITEM_STD === '전체');
  const accumulatedItemRows = accumulatedRows.filter((r) => r.ITEM_STD !== '전체');
  
  console.log(`📊 [${brandCode}] 당월 전체 행:`, monthlyTotalRow);
  console.log(`📊 [${brandCode}] 당월 아이템 행들:`, monthlyItemRows);
  console.log(`📊 [${brandCode}] 누적 전체 행:`, accumulatedTotalRow);
  console.log(`📊 [${brandCode}] 누적 아이템 행들:`, accumulatedItemRows);

  // 당월 데이터 포맷팅
  const monthlyInventoryDetail: any = {};
  const accumulatedInventoryDetail: any = {};

  // 당월 데이터 포맷팅
  monthlyItemRows.forEach((row) => {
    const itemKey = getItemKey(row.ITEM_STD);
    const cyEndStock = Number(row.CY_END_STOCK_TAG_AMT) || 0;
    const pyEndStock = Number(row.PY_END_STOCK_TAG_AMT) || 0;
    const cyWeeks = Number(row.CY_STOCK_WEEK_CNT) || 0;
    const pyWeeks = Number(row.PY_STOCK_WEEK_CNT) || 0;
    const cySale = Number(row.CY_ACT_SALE_AMT) || 0;
    const pySale = Number(row.PY_ACT_SALE_AMT) || 0;
    
    monthlyInventoryDetail[itemKey] = {
      current: Math.round(cyEndStock / 1000000),
      previous: Math.round(pyEndStock / 1000000),
      weeks: cyWeeks,
      previousWeeks: pyWeeks,
      salesCurrent: Math.round(cySale / 1000000),
      salesPrevious: Math.round(pySale / 1000000),
    };
  });
  
  // 누적 데이터 포맷팅
  accumulatedItemRows.forEach((row) => {
    const itemKey = getItemKey(row.ITEM_STD);
    const cyEndStock = Number(row.CY_END_STOCK_TAG_AMT) || 0; // 기말재고는 동일 (최근연월)
    const pyEndStock = Number(row.PY_END_STOCK_TAG_AMT) || 0;
    const cyWeeks = Number(row.CY_STOCK_WEEK_CNT) || 0; // 누적 평균으로 계산된 재고주수
    const pyWeeks = Number(row.PY_STOCK_WEEK_CNT) || 0;
    const cySale = Number(row.CY_ACT_SALE_AMT) || 0; // 누적 판매액
    const pySale = Number(row.PY_ACT_SALE_AMT) || 0;
    
    accumulatedInventoryDetail[itemKey] = {
      current: Math.round(cyEndStock / 1000000),
      previous: Math.round(pyEndStock / 1000000),
      weeks: cyWeeks,
      previousWeeks: pyWeeks,
      salesCurrent: Math.round(cySale / 1000000),
      salesPrevious: Math.round(pySale / 1000000),
    };
  });
  
  // 모든 아이템에 기본값 설정
  const requiredItems = ['shoes', 'hat', 'bag', 'other'];
  const defaultItem = {
    current: 0,
    previous: 0,
    weeks: 0,
    previousWeeks: 0,
    salesCurrent: 0,
    salesPrevious: 0,
  };
  
  requiredItems.forEach((key) => {
    if (!monthlyInventoryDetail[key]) {
      monthlyInventoryDetail[key] = { ...defaultItem };
    }
    if (!accumulatedInventoryDetail[key]) {
      accumulatedInventoryDetail[key] = { ...defaultItem };
    }
  });
  
  console.log(`📊 [${brandCode}] 당월 accInventoryDetail:`, monthlyInventoryDetail);
  console.log(`📊 [${brandCode}] 누적 accInventoryDetail:`, accumulatedInventoryDetail);

  // 당월 합계 계산
  const monthlyTotalCySale = monthlyItemRows.reduce((sum, row) => sum + (Number(row.CY_ACT_SALE_AMT) || 0), 0);
  const monthlyTotalPySale = monthlyItemRows.reduce((sum, row) => sum + (Number(row.PY_ACT_SALE_AMT) || 0), 0);
  const monthlyTotalCyStock = monthlyItemRows.reduce((sum, row) => sum + (Number(row.CY_END_STOCK_TAG_AMT) || 0), 0);
  const monthlyTotalPyStock = monthlyItemRows.reduce((sum, row) => sum + (Number(row.PY_END_STOCK_TAG_AMT) || 0), 0);
  
  // 누적 합계 계산
  const accumulatedTotalCySale = accumulatedItemRows.reduce((sum, row) => sum + (Number(row.CY_ACT_SALE_AMT) || 0), 0);
  const accumulatedTotalPySale = accumulatedItemRows.reduce((sum, row) => sum + (Number(row.PY_ACT_SALE_AMT) || 0), 0);
  const accumulatedTotalCyStock = accumulatedItemRows.reduce((sum, row) => sum + (Number(row.CY_END_STOCK_TAG_AMT) || 0), 0);
  const accumulatedTotalPyStock = accumulatedItemRows.reduce((sum, row) => sum + (Number(row.PY_END_STOCK_TAG_AMT) || 0), 0);
  
  const result = {
    brandCode,
    month: yyyymm,
    // 당월 데이터
    monthly: {
      salesYOY: monthlyTotalPySale > 0 ? Math.round((monthlyTotalCySale / monthlyTotalPySale) * 100) : 0,
      inventoryYOY: monthlyTotalPyStock > 0 ? Math.round((monthlyTotalCyStock / monthlyTotalPyStock) * 100) : 0,
      accEndingInventory: Math.round(monthlyTotalCyStock / 1000000),
      accSalesAmount: Math.round(monthlyTotalCySale / 1000000),
      totalWeeks: Number(monthlyTotalRow?.CY_STOCK_WEEK_CNT) || 0,
      totalPreviousWeeks: Number(monthlyTotalRow?.PY_STOCK_WEEK_CNT) || 0,
      accInventoryDetail: monthlyInventoryDetail,
    },
    // 누적 데이터
    accumulated: {
      salesYOY: accumulatedTotalPySale > 0 ? Math.round((accumulatedTotalCySale / accumulatedTotalPySale) * 100) : 0,
      inventoryYOY: accumulatedTotalPyStock > 0 ? Math.round((accumulatedTotalCyStock / accumulatedTotalPyStock) * 100) : 0,
      accEndingInventory: Math.round(accumulatedTotalCyStock / 1000000), // 최근연월 동일
      accSalesAmount: Math.round(accumulatedTotalCySale / 1000000), // 누적
      totalWeeks: Number(accumulatedTotalRow?.CY_STOCK_WEEK_CNT) || 0, // 누적 평균
      totalPreviousWeeks: Number(accumulatedTotalRow?.PY_STOCK_WEEK_CNT) || 0,
      accInventoryDetail: accumulatedInventoryDetail,
    },
    // 기본값 (당월 데이터, 호환성 유지)
    salesYOY: monthlyTotalPySale > 0 ? Math.round((monthlyTotalCySale / monthlyTotalPySale) * 100) : 0,
    inventoryYOY: monthlyTotalPyStock > 0 ? Math.round((monthlyTotalCyStock / monthlyTotalPyStock) * 100) : 0,
    accEndingInventory: Math.round(monthlyTotalCyStock / 1000000),
    accSalesAmount: Math.round(monthlyTotalCySale / 1000000),
    totalWeeks: Number(monthlyTotalRow?.CY_STOCK_WEEK_CNT) || 0,
    totalPreviousWeeks: Number(monthlyTotalRow?.PY_STOCK_WEEK_CNT) || 0,
    accInventoryDetail: monthlyInventoryDetail,
  };
  
  console.log(`📊 [${brandCode}] 최종 반환 데이터:`, result);
  return result;
}

/**
 * 아이템명을 키로 변환
 */
export function getItemKey(itemStd: string): string {
  const mapping: { [key: string]: string } = {
    신발: 'shoes',
    모자: 'hat',
    가방: 'bag',
    기타ACC: 'other',
  };
  return mapping[itemStd] || itemStd;
}

/**
 * 아이템 키를 아이템명으로 변환
 */
export function getItemNameFromKey(itemKey: string): string {
  const mapping: { [key: string]: string } = {
    shoes: '신발',
    hat: '모자',
    bag: '가방',
    other: '기타ACC',
  };
  return mapping[itemKey] || itemKey;
}

/**
 * 품번별 재고주수 쿼리 생성 (당월 + 누적 데이터 포함)
 */
export function buildProductDetailQuery(brandCode: string, itemStd: string, yyyymm: string): string {
  const pyYyyymm = getPreviousYearMonth(yyyymm);
  const { year, month } = parseYearMonth(yyyymm);
  const pyYear = year - 1;
  
  // 누적 범위: 1월부터 해당월까지
  const cyAccumStart = `${year}01`;
  const pyAccumStart = `${pyYear}01`;

  return `
-- item: item 기준 (특정 아이템만)
with item as (
    select prdt_cd
            , sesn
            , case when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Headwear' then '모자'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Shoes'   then '신발'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Bag'     then '가방'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Acc_etc' then '기타ACC'
              end as item_std
            , prdt_nm as product_name
    from sap_fnf.mst_prdt
    where 1=1
    and brd_cd = '${brandCode}'
    and case when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Headwear' then '모자'
             when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Shoes'   then '신발'
             when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Bag'     then '가방'
             when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Acc_etc' then '기타ACC'
        end = '${itemStd}'
)
-- cm_stock: 당월 재고 (품번별)
, cm_stock as (
    -- 당해
    select 'cy' as div
            , b.prdt_cd
            , b.product_name
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm = '${yyyymm}'
    group by b.prdt_cd, b.product_name
    union all
    -- 전년
    select 'py' as div
            , b.prdt_cd
            , b.product_name
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm = '${pyYyyymm}'
    group by b.prdt_cd, b.product_name
)
-- c6m_sale: 당월 TAG 매출 (재고주수 계산용 - 당월, 품번별)
, c6m_sale as(
    -- 당해
    select 'cy' as div
        , b.prdt_cd
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
        and a.pst_yyyymm between '${yyyymm}' and '${yyyymm}' -- 당월 기준 
    group by b.prdt_cd
    union all
    -- 전년
    select 'py' as div
        , b.prdt_cd
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
        and a.pst_yyyymm between '${pyYyyymm}' and '${pyYyyymm}'  -- 당월 기준
    group by b.prdt_cd
)
-- c6m_sale_accumulated: 누적 TAG 매출 (재고주수 계산용 - 누적, 1월부터 해당월까지, 품번별)
, c6m_sale_accumulated as(
    -- 당해
    select 'cy' as div
        , b.prdt_cd
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
        and a.pst_yyyymm between '${cyAccumStart}' and '${yyyymm}' -- 1월부터 해당월까지 누적
    group by b.prdt_cd
    union all
    -- 전년
    select 'py' as div
        , b.prdt_cd
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
        and a.pst_yyyymm between '${pyAccumStart}' and '${pyYyyymm}'  -- 1월부터 해당월까지 누적
    group by b.prdt_cd
)
-- act_sale: 당월 실판매출 (ACC 판매액 표시용 - 당월, 품번별)
, act_sale as(
    -- 당해
    select 'cy' as div
        , b.prdt_cd
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
        and a.pst_yyyymm between '${yyyymm}' and '${yyyymm}' -- 당월
    group by b.prdt_cd
    union all
    -- 전년
    select 'py' as div
        , b.prdt_cd
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
        and a.pst_yyyymm between '${pyYyyymm}' and '${pyYyyymm}' -- 당월
    group by b.prdt_cd
)
-- act_sale_accumulated: 누적 실판매출 (ACC 판매액 표시용 - 누적, 1월부터 해당월까지, 품번별)
, act_sale_accumulated as(
    -- 당해
    select 'cy' as div
        , b.prdt_cd
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
        and a.pst_yyyymm between '${cyAccumStart}' and '${yyyymm}' -- 1월부터 해당월까지 누적
    group by b.prdt_cd
    union all
    -- 전년
    select 'py' as div
        , b.prdt_cd
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
        and a.pst_yyyymm between '${pyAccumStart}' and '${pyYyyymm}' -- 1월부터 해당월까지 누적
    group by b.prdt_cd
)
-- 당월 데이터 - 품번별 (시즌 정보 포함)
select a.prdt_cd
        , max(a.product_name) as product_name
        , max(e.sesn) as sesn
        , 'monthly' as period_type
        , case when sum(case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='cy' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
                , 1)
            else null
          end as cy_stock_week_cnt
        , case when sum(case when a.div='py' then b.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='py' then b.c6m_tag_sale_amt else 0 end) / 1 / 30 * 7),0)
                , 1)
            else null
          end as py_stock_week_cnt
        , sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) as cy_end_stock_tag_amt
        , sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) as py_end_stock_tag_amt
        , sum(case when a.div='cy' then d.act_sale_amt else 0 end) as cy_act_sale_amt
        , sum(case when a.div='py' then d.act_sale_amt else 0 end) as py_act_sale_amt
from cm_stock a 
join item e on a.prdt_cd = e.prdt_cd
join c6m_sale b
on a.prdt_cd = b.prdt_cd
and a.div = b.div
join act_sale d
on a.prdt_cd = d.prdt_cd
and a.div = d.div
group by a.prdt_cd
union all
-- 누적 데이터 - 품번별 (시즌 정보 포함)
select a.prdt_cd
        , max(a.product_name) as product_name
        , max(e.sesn) as sesn
        , 'accumulated' as period_type
        , case when sum(case when a.div='cy' then b_acc.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='cy' then b_acc.c6m_tag_sale_amt else 0 end) / ${month} / 30 * 7),0)
                , 1)
            else null
          end as cy_stock_week_cnt
        , case when sum(case when a.div='py' then b_acc.c6m_tag_sale_amt else 0 end) > 0
            then round( sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) 
                / nullif(sum( (case when a.div='py' then b_acc.c6m_tag_sale_amt else 0 end) / ${month} / 30 * 7),0)
                , 1)
            else null
          end as py_stock_week_cnt
        , sum(case when a.div='cy' then a.cm_end_stock_tag_amt else 0 end) as cy_end_stock_tag_amt
        , sum(case when a.div='py' then a.cm_end_stock_tag_amt else 0 end) as py_end_stock_tag_amt
        , sum(case when a.div='cy' then d_acc.act_sale_amt else 0 end) as cy_act_sale_amt
        , sum(case when a.div='py' then d_acc.act_sale_amt else 0 end) as py_act_sale_amt
from cm_stock a 
join item e on a.prdt_cd = e.prdt_cd
join c6m_sale_accumulated b_acc
on a.prdt_cd = b_acc.prdt_cd
and a.div = b_acc.div
join act_sale_accumulated d_acc
on a.prdt_cd = d_acc.prdt_cd
and a.div = d_acc.div
group by a.prdt_cd
order by period_type, cy_end_stock_tag_amt desc
  `;
}

/**
 * 품번별 데이터 인터페이스
 */
interface ProductDetailData {
  PRDT_CD: string;
  PRODUCT_NAME: string;
  SESN?: string; // 시즌 정보
  PERIOD_TYPE: 'monthly' | 'accumulated';
  CY_STOCK_WEEK_CNT: number;
  PY_STOCK_WEEK_CNT: number;
  CY_END_STOCK_TAG_AMT: number;
  PY_END_STOCK_TAG_AMT: number;
  CY_ACT_SALE_AMT: number;
  PY_ACT_SALE_AMT: number;
}

/**
 * 품번별 데이터 포맷팅
 */
export function formatProductDetailData(
  rows: ProductDetailData[],
  itemStd: string,
  yyyymm?: string
): any {
  console.log(`📊 [${itemStd}] 품번별 데이터 포맷팅 시작 - 받은 행 수:`, rows.length);
  console.log(`📊 [${itemStd}] 원본 데이터:`, rows);
  
  // 당월과 누적 데이터 분리
  const monthlyRows = rows.filter(row => row.PERIOD_TYPE === 'monthly');
  const accumulatedRows = rows.filter(row => row.PERIOD_TYPE === 'accumulated');
  
  console.log(`📊 [${itemStd}] 당월 행 수:`, monthlyRows.length);
  console.log(`📊 [${itemStd}] 누적 행 수:`, accumulatedRows.length);

  // 현재 연도 및 월 추출
  let currentYear: number;
  let currentMonth: number;
  if (yyyymm) {
    const parsed = parseYearMonth(yyyymm);
    currentYear = parseInt(parsed.year.toString().substring(2, 4)); // 뒤 2자리만
    currentMonth = parsed.month;
  } else {
    const now = new Date();
    currentYear = parseInt(now.getFullYear().toString().substring(2, 4));
    currentMonth = now.getMonth() + 1;
  }

  // 시즌 기준 그룹핑을 위한 헬퍼 함수
  // 현재 시즌 판단 규칙:
  // - 25N, 26N: 항상 현재 시즌
  // - 25F: 9월~2월 기간일 때만 현재 시즌
  // - 25S: 3월~8월 기간일 때만 현재 시즌 (25S는 기본적으로 과거 시즌)
  const getSeasonCategory = (prdtCd: string, sesn?: string): 'current' | 'old' => {
    // 시즌 정보가 있으면 시즌 코드로 판단
    if (sesn) {
      const sesnUpper = sesn.toUpperCase();
      
      // 25N, 26N은 항상 현재 시즌
      if (sesnUpper.includes(`${currentYear}N`) || sesnUpper.includes(`${currentYear + 1}N`)) {
        return 'current';
      }
      
      // 25F는 9월~2월 기간일 때만 현재 시즌
      if (sesnUpper.includes(`${currentYear}F`)) {
        if (currentMonth >= 9 || currentMonth <= 2) {
          return 'current';
        }
        return 'old';
      }
      
      // 25S는 3월~8월 기간일 때만 현재 시즌
      if (sesnUpper.includes(`${currentYear}S`)) {
        if (currentMonth >= 3 && currentMonth <= 8) {
          return 'current';
        }
        return 'old';
      }
    }
    
    // 시즌 정보가 없으면 품번 코드 앞 2자리로 판단 (현재 연도 또는 다음 연도)
    const codePrefix = parseInt(prdtCd.substring(0, 2));
    if (!isNaN(codePrefix) && (codePrefix === currentYear || codePrefix === currentYear + 1)) {
      return 'current';
    }
    
    return 'old';
  };

  // 당월 데이터 포맷팅 및 필터링 (기말재고 0이고 판매액 0인 항목 제거)
  const monthlyProducts = monthlyRows
    .map((row) => {
      const cyEndStock = Number(row.CY_END_STOCK_TAG_AMT) || 0;
      const pyEndStock = Number(row.PY_END_STOCK_TAG_AMT) || 0;
      const cyWeeks = Number(row.CY_STOCK_WEEK_CNT) || 0;
      const pyWeeks = Number(row.PY_STOCK_WEEK_CNT) || 0;
      const cySale = Number(row.CY_ACT_SALE_AMT) || 0;
      const pySale = Number(row.PY_ACT_SALE_AMT) || 0;
      
      const seasonCategory = getSeasonCategory(row.PRDT_CD, row.SESN);
      
      return {
        productCode: row.PRDT_CD,
        productName: row.PRODUCT_NAME || row.PRDT_CD,
        season: row.SESN || '',
        seasonCategory: seasonCategory,
        weeks: cyWeeks,
        previousWeeks: pyWeeks,
        endingInventory: Math.round(cyEndStock / 1000000),
        previousEndingInventory: Math.round(pyEndStock / 1000000),
        salesAmount: Math.round(cySale / 1000000),
        previousSalesAmount: Math.round(pySale / 1000000),
        inventoryYOY: pyEndStock > 0 ? Math.round((cyEndStock / pyEndStock) * 100) : 0,
        salesYOY: pySale > 0 ? Math.round((cySale / pySale) * 100) : 0,
      };
    })
    .filter((product) => {
      // 기말재고가 0이고 판매액도 0인 항목 제거
      return product.endingInventory !== 0 || product.salesAmount !== 0;
    });
  
  // 누적 데이터 포맷팅 및 필터링 (기말재고 0이고 판매액 0인 항목 제거)
  const accumulatedProducts = accumulatedRows
    .map((row) => {
      const cyEndStock = Number(row.CY_END_STOCK_TAG_AMT) || 0;
      const pyEndStock = Number(row.PY_END_STOCK_TAG_AMT) || 0;
      const cyWeeks = Number(row.CY_STOCK_WEEK_CNT) || 0;
      const pyWeeks = Number(row.PY_STOCK_WEEK_CNT) || 0;
      const cySale = Number(row.CY_ACT_SALE_AMT) || 0;
      const pySale = Number(row.PY_ACT_SALE_AMT) || 0;
      const seasonCategory = getSeasonCategory(row.PRDT_CD, row.SESN);
      
      return {
        productCode: row.PRDT_CD,
        productName: row.PRODUCT_NAME || row.PRDT_CD,
        season: row.SESN || '',
        seasonCategory: seasonCategory,
        weeks: cyWeeks,
        previousWeeks: pyWeeks,
        endingInventory: Math.round(cyEndStock / 1000000),
        previousEndingInventory: Math.round(pyEndStock / 1000000),
        salesAmount: Math.round(cySale / 1000000),
        previousSalesAmount: Math.round(pySale / 1000000),
        inventoryYOY: pyEndStock > 0 ? Math.round((cyEndStock / pyEndStock) * 100) : 0,
        salesYOY: pySale > 0 ? Math.round((cySale / pySale) * 100) : 0,
      };
    })
    .filter((product) => {
      // 기말재고가 0이고 판매액도 0인 항목 제거
      return product.endingInventory !== 0 || product.salesAmount !== 0;
    });
  
  console.log(`📊 [${itemStd}] 최종 포맷팅 결과:`, {
    monthly: monthlyProducts.length,
    accumulated: accumulatedProducts.length,
  });
  
  return {
    itemStd,
    monthly: monthlyProducts,
    accumulated: accumulatedProducts,
  };
}


