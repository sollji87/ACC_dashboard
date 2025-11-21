-- 전체 총괄 페이지 SQL 쿼리 (예시: MLB 브랜드 'M', 2025년 10월)
-- 각 브랜드별로 동일한 쿼리를 브랜드 코드만 변경하여 실행

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
    and brd_cd = 'M'  -- 브랜드 코드 (M=MLB, I=INNERMIX, X=DISCOVERY, V=KOLON SPORT, ST=STONE ISLAND)
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
    -- 당해 (2025년 10월)
    select 'cy' as div
            , b.item_std
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = 'M'
        and a.yyyymm = '202510'
    group by b.item_std
    union all
    -- 전년 (2024년 10월)
    select 'py' as div
            , b.item_std
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = 'M'
        and a.yyyymm = '202410'
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
        and a.brd_cd = 'M'
        and a.pst_yyyymm between '202510' and '202510' -- 최근 1개월 기준 
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
        and a.brd_cd = 'M'
        and a.pst_yyyymm between '202410' and '202410'  -- 최근 1개월 기준
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
        and a.brd_cd = 'M'
        and a.pst_yyyymm between '202510' and '202510'
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
        and a.brd_cd = 'M'
        and a.pst_yyyymm between '202410' and '202410'
    group by b.item_std
)
-- 최종 결과: 전체 합계
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
        , 0 as seq
from cm_stock a 
join c6m_sale b
on a.item_std = b.item_std
and a.div = b.div
join act_sale d
on a.item_std = d.item_std
and a.div = d.div
union all
-- 최종 결과: 아이템별 상세
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
order by seq;

-- ========================================
-- 주요 변경사항 (최근 수정):
-- 1. 아이템 코드 수정:
--    - SHOES: 신발
--    - HEAD: 모자  
--    - BAG: 가방
--    - EQ: 기타ACC
-- ========================================

