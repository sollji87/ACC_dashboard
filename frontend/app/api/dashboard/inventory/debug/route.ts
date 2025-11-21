/**
 * 품번별 원본 데이터 디버깅 API
 * GET /api/dashboard/inventory/debug?productCode=M25N3ARNSPD5N&brandCode=M&month=202510
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';

function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const productCode = searchParams.get('productCode');
    const brandCode = searchParams.get('brandCode') || 'M';
    const month = searchParams.get('month');
    const yyyymm = month || getCurrentYearMonth();
    const pyYyyymm = yyyymm.substring(0, 4) === '2025' 
      ? `${parseInt(yyyymm.substring(0, 4)) - 1}${yyyymm.substring(4)}`
      : `${parseInt(yyyymm.substring(0, 4)) - 1}${yyyymm.substring(4)}`;

    if (!productCode) {
      return NextResponse.json(
        {
          success: false,
          error: 'productCode 파라미터가 필요합니다.',
        },
        { status: 400 }
      );
    }

    console.log(`🔍 품번 ${productCode} 디버깅 데이터 조회 시작 (브랜드: ${brandCode}, 월: ${yyyymm})`);

    // Snowflake 연결
    const connection = await connectToSnowflake();

    try {
      // 품번별 원본 데이터 조회 쿼리
      const query = `
-- item: 품번 정보
with item as (
    select prdt_cd
            , prdt_nm as product_name
            , sesn
            , case when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Headwear' then '모자'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Shoes'   then '신발'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Bag'     then '가방'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Acc_etc' then '기타ACC'
              end as item_std
    from sap_fnf.mst_prdt
    where 1=1
    and brd_cd = '${brandCode}'
    and prdt_cd = '${productCode}'
)
-- cm_stock: 당월 재고 (품번별)
, cm_stock as (
    -- 당해
    select 'cy' as div
            , b.prdt_cd
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm = '${yyyymm}'
    group by b.prdt_cd
    union all
    -- 전년
    select 'py' as div
            , b.prdt_cd
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b
        on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm = '${pyYyyymm}'
    group by b.prdt_cd
)
-- c6m_sale: 당월 TAG 매출 (재고주수 계산용)
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
        and a.pst_yyyymm between '${yyyymm}' and '${yyyymm}'
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
        and a.pst_yyyymm between '${pyYyyymm}' and '${pyYyyymm}'
    group by b.prdt_cd
)
-- act_sale: 당월 실판매출
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
        and a.pst_yyyymm between '${yyyymm}' and '${yyyymm}'
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
        and a.pst_yyyymm between '${pyYyyymm}' and '${pyYyyymm}'
    group by b.prdt_cd
)
-- 최종 조회: 원본 데이터 + 계산된 재고주수
select 
    max(i.prdt_cd) as product_code
    , max(i.product_name) as product_name
    , max(i.item_std) as item_std
    , max(i.sesn) as season
    , 'cy' as year_type
    , sum(s.cm_end_stock_tag_amt) as ending_inventory
    , sum(b.c6m_tag_sale_amt) as tag_sale_amount
    , sum(d.act_sale_amt) as act_sale_amount
    , sum(s.cm_end_stock_tag_amt) / nullif(sum(b.c6m_tag_sale_amt / 1 / 30 * 7), 0) as calculated_weeks
from item i
left join cm_stock s on i.prdt_cd = s.prdt_cd and s.div = 'cy'
left join c6m_sale b on i.prdt_cd = b.prdt_cd and b.div = 'cy'
left join act_sale d on i.prdt_cd = d.prdt_cd and d.div = 'cy'
group by i.prdt_cd
union all
select 
    max(i.prdt_cd) as product_code
    , max(i.product_name) as product_name
    , max(i.item_std) as item_std
    , max(i.sesn) as season
    , 'py' as year_type
    , sum(s.cm_end_stock_tag_amt) as ending_inventory
    , sum(b.c6m_tag_sale_amt) as tag_sale_amount
    , sum(d.act_sale_amt) as act_sale_amount
    , sum(s.cm_end_stock_tag_amt) / nullif(sum(b.c6m_tag_sale_amt / 1 / 30 * 7), 0) as calculated_weeks
from item i
left join cm_stock s on i.prdt_cd = s.prdt_cd and s.div = 'py'
left join c6m_sale b on i.prdt_cd = b.prdt_cd and b.div = 'py'
left join act_sale d on i.prdt_cd = d.prdt_cd and d.div = 'py'
group by i.prdt_cd
      `;

      console.log(`📝 실행 쿼리:`, query);
      const rows = await executeQuery(query, connection);

      console.log(`✅ 품번 ${productCode} 디버깅 데이터 조회 성공:`, rows);

      return NextResponse.json({
        success: true,
        productCode,
        brandCode,
        month: yyyymm,
        previousMonth: pyYyyymm,
        data: rows,
      });
    } finally {
      // Snowflake 연결 종료
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 품번 디버깅 데이터 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: 500 }
    );
  }
}

