import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';

/**
 * MLB 10월 신발 사입제외 기준 4주 재고주수 계산용 택매출액 확인 API
 * GET /api/dashboard/chart/test-sales?brandCode=M&yyyymm=202510&itemStd=신발&excludePurchase=true
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = searchParams.get('brandCode') || 'M';
    const yyyymm = searchParams.get('yyyymm') || '202510';
    const itemStd = searchParams.get('itemStd') || '신발';
    const excludePurchaseParam = searchParams.get('excludePurchase');
    const excludePurchase = excludePurchaseParam === 'true';

    console.log('📊 택매출액 테스트 시작:', { brandCode, yyyymm, itemStd, excludePurchase });

    const connection = await connectToSnowflake();

    try {
      // 신발만 필터링하는 item CTE
      const itemFilter = itemStd === 'all' ? '' : `and case when prdt_hrrc1_nm='ACC' and prdt_hrrc2_nm='Shoes' then '신발'
                    when prdt_hrrc1_nm='ACC' and prdt_hrrc2_nm='Headwear' then '모자'
                    when prdt_hrrc1_nm='ACC' and prdt_hrrc2_nm='Bag' then '가방'
                    when prdt_hrrc1_nm='ACC' and prdt_hrrc2_nm='Acc_etc' then '기타ACC'
              end = '${itemStd}'`;

      const query = `
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
    ${itemFilter}
),
-- 당년 10월 매출 (사입제외)
monthly_sale_cy as (
    select 
        sum(tag_sale_amt) as tag_sale_amt,
        count(distinct a.prdt_cd) as product_count,
        count(*) as record_count
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
     left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd <> '9' -- 수출제외
        ${excludePurchase ? "and c.chnl_cd <> '8' -- 사입제외" : ''}
        and a.brd_cd = '${brandCode}'
        and a.pst_yyyymm = '${yyyymm}'
),
-- 채널별 매출 상세 (디버깅용)
channel_detail as (
    select 
        c.chnl_cd,
        c.chnl_nm,
        sum(tag_sale_amt) as tag_sale_amt,
        count(distinct a.prdt_cd) as product_count
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
     left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd <> '9' -- 수출제외
        ${excludePurchase ? "and c.chnl_cd <> '8' -- 사입제외" : ''}
        and a.brd_cd = '${brandCode}'
        and a.pst_yyyymm = '${yyyymm}'
    group by c.chnl_cd, c.chnl_nm
    order by tag_sale_amt desc
)
select 
    'summary' as type,
    ms.tag_sale_amt as tag_sale_amount,
    ms.product_count,
    ms.record_count,
    null as chnl_cd,
    null as chnl_nm
from monthly_sale_cy ms
union all
select 
    'channel_detail' as type,
    cd.tag_sale_amt as tag_sale_amount,
    cd.product_count,
    null as record_count,
    cd.chnl_cd,
    cd.chnl_nm
from channel_detail cd
order by type, tag_sale_amount desc
      `;

      const rows = await executeQuery(query, connection);

      console.log('✅ 택매출액 조회 성공:', rows);

      const summary = rows.find((r: any) => r.TYPE === 'summary');
      const channelDetails = rows.filter((r: any) => r.TYPE === 'channel_detail');

      return NextResponse.json({
        success: true,
        brandCode,
        yyyymm,
        itemStd,
        excludePurchase,
        summary: {
          tagSaleAmount: summary?.TAG_SALE_AMOUNT || 0,
          productCount: summary?.PRODUCT_COUNT || 0,
          recordCount: summary?.RECORD_COUNT || 0,
        },
        channelDetails: channelDetails.map((cd: any) => ({
          channelCode: cd.CHNL_CD,
          channelName: cd.CHNL_NM,
          tagSaleAmount: cd.TAG_SALE_AMOUNT,
          productCount: cd.PRODUCT_COUNT,
        })),
        rawData: rows,
      });
    } finally {
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 택매출액 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: 500 }
    );
  }
}

