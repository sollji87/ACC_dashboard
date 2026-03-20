/**
 * 차트 데이터 검증 API
 * MLB 신발 4주 재고주수 확인용
 * GET /api/dashboard/chart/verify?brandCode=M&itemStd=신발&month=202510&weeksType=4weeks
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { buildChartDataQuery } from '@/lib/chart-service';
import { ensureBrandCode, ensureItemStd, ensureYyyymm } from '@/lib/request-validation';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = ensureBrandCode(searchParams.get('brandCode') || 'M');
    const yyyymm = ensureYyyymm(searchParams.get('month') || '202510', 'month');
    const weeksTypeParam = searchParams.get('weeksType');
    const weeksType = (weeksTypeParam as '4weeks' | '8weeks' | '12weeks') || '4weeks';
    const itemStd = ensureItemStd(searchParams.get('itemStd') || '신발');

    console.log('🔍 차트 데이터 검증 시작:', { brandCode, yyyymm, weeksType, itemStd });

    const connection = await connectToSnowflake();

    try {
      // 차트 쿼리 실행
      const chartStatement = buildChartDataQuery(brandCode, yyyymm, weeksType, itemStd);
      const chartRows = await executeQuery(chartStatement.sqlText, connection, 0, chartStatement.binds);
      
      // 202510 데이터 찾기
      const targetMonth = chartRows.find((r: any) => {
        const yyyymmValue = r.YYYYMM || r.yyyymm;
        return yyyymmValue === yyyymm && (r.DIV || r.div) === 'cy';
      });
      
      const previousYear = parseInt(yyyymm.substring(0, 4)) - 1;
      const pyYyyymm = `${previousYear}${yyyymm.substring(4)}`;
      const previousMonth = chartRows.find((r: any) => {
        const yyyymmValue = r.YYYYMM || r.yyyymm;
        return yyyymmValue === pyYyyymm && (r.DIV || r.div) === 'py';
      });

      // 당월 데이터 직접 계산 쿼리 (4주 기준)
      const directQuery = `
-- item: 신발만
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
    and brd_cd = :1
    and prdt_hrrc1_nm = 'ACC'
    and case when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Headwear' then '모자'
             when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Shoes'   then '신발'
             when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Bag'     then '가방'
             when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Acc_etc' then '기타ACC'
        end = :2
)
-- 당월 재고
, cm_stock as (
    select 'cy' as div
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = :1
        and a.yyyymm = :3
    union all
    select 'py' as div
            , sum(end_stock_tag_amt) as cm_end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = :1
        and a.yyyymm = :4
)
-- 최근 4개월 매출 (당년)
, last4m_sale_cy as (
    select sum(tag_sale_amt) as tag_sale_amt
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
     left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd not in ('9', '99')
        and a.brd_cd = :1
        and a.pst_yyyymm >= to_char(add_months(to_date(:3, 'YYYYMM'), -3), 'YYYYMM')
        and a.pst_yyyymm <= :3
)
-- 최근 4개월 매출 (전년)
, last4m_sale_py as (
    select sum(tag_sale_amt) as tag_sale_amt
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
     left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd not in ('9', '99')
        and a.brd_cd = :1
        and a.pst_yyyymm >= to_char(add_months(to_date(:4, 'YYYYMM'), -3), 'YYYYMM')
        and a.pst_yyyymm <= :4
)
select 
    'cy' as div,
    cs.cm_end_stock_tag_amt as ending_inventory,
    s.tag_sale_amt / 4.0 / 30 * 7 as avg_weekly_sale,
    round(cs.cm_end_stock_tag_amt / nullif(s.tag_sale_amt / 4.0 / 30 * 7, 0), 1) as calculated_weeks
from cm_stock cs
cross join last4m_sale_cy s
where cs.div = 'cy'
union all
select 
    'py' as div,
    cs.cm_end_stock_tag_amt as ending_inventory,
    s.tag_sale_amt / 4.0 / 30 * 7 as avg_weekly_sale,
    round(cs.cm_end_stock_tag_amt / nullif(s.tag_sale_amt / 4.0 / 30 * 7, 0), 1) as calculated_weeks
from cm_stock cs
cross join last4m_sale_py s
where cs.div = 'py'
      `;

      const directRows = await executeQuery(directQuery, connection, 0, [
        brandCode,
        itemStd,
        yyyymm,
        pyYyyymm,
      ]);

      return NextResponse.json({
        success: true,
        brandCode,
        itemStd,
        month: yyyymm,
        weeksType,
        chartData: {
          currentYear: {
            yyyymm: targetMonth?.YYYYMM || targetMonth?.yyyymm,
            stockWeeks: targetMonth?.STOCK_WEEKS || targetMonth?.stock_weeks,
          },
          previousYear: {
            yyyymm: previousMonth?.YYYYMM || previousMonth?.yyyymm,
            stockWeeks: previousMonth?.STOCK_WEEKS || previousMonth?.stock_weeks,
          },
        },
        directCalculation: {
          currentYear: directRows.find((r: any) => r.DIV === 'cy' || r.div === 'cy'),
          previousYear: directRows.find((r: any) => r.DIV === 'py' || r.div === 'py'),
        },
      });
    } finally {
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 차트 데이터 검증 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: error instanceof Error && error.message.startsWith('유효하지 않은') ? 400 : 500 }
    );
  }
}
