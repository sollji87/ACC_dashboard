import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { ensureBrandCode, ensureYyyymm } from '@/lib/request-validation';

/**
 * 정체재고 상세 조회 API (검증용)
 * GET /api/dashboard/chart/stagnant-stock?brandCode=M&yyyymm=202510
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = ensureBrandCode(searchParams.get('brandCode'));
    const yyyymm = ensureYyyymm(searchParams.get('yyyymm'));

    const { year, month } = {
      year: parseInt(yyyymm.substring(0, 4)),
      month: parseInt(yyyymm.substring(4, 6))
    };

    // 최근 1개월 목록 생성
    const months: string[] = [];
    for (let i = 0; i >= 0; i--) {
      const date = new Date(year, month - 1 - i, 1);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      months.push(`${yyyy}${mm}`);
    }

    console.log(`📊 정체재고 조회: ${brandCode}, ${yyyymm}, 최근 1개월: ${months.join(', ')}`);

    const connection = await connectToSnowflake();

    try {
      // 정체재고 상세 조회 쿼리
      const query = `
-- item: ACC 아이템 기준
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
)
-- 최근 1개월 판매 이력이 있는 품번
, sold_products as (
    select distinct a.prdt_cd
    from sap_fnf.dm_pl_shop_prdt_m a
     left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where a.brd_cd = :1
    and a.pst_yyyymm >= :3
    and a.tag_sale_amt > 0
    and c.chnl_cd not in ('9', '99') -- 수출, 기타채널 제외
)
-- 25년 10월 재고 데이터
, stock_data as (
    select 
        a.prdt_cd,
        b.item_std,
        b.sesn,
        sum(a.end_stock_tag_amt) as end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = :1
        and a.yyyymm = :2
    group by a.prdt_cd, b.item_std, b.sesn
)
-- 정체재고 (판매 이력이 없는 품번)
select 
    s.prdt_cd,
    s.item_std,
    s.sesn,
    s.end_stock_tag_amt,
    case when sp.prdt_cd is null then '정체재고' else '판매이력있음' end as status
from stock_data s
left join sold_products sp on s.prdt_cd = sp.prdt_cd
where sp.prdt_cd is null -- 판매 이력이 없는 품번만
order by s.end_stock_tag_amt desc
      `;

      const rows = await executeQuery(query, connection, 0, [brandCode, yyyymm, months[0]]);

      // 집계 데이터
      const totalStagnantStock = rows.reduce((sum: number, row: any) => sum + (Number(row.END_STOCK_TAG_AMT) || 0), 0);
      const itemSummary = rows.reduce((acc: any, row: any) => {
        const itemStd = row.ITEM_STD || '기타';
        if (!acc[itemStd]) {
          acc[itemStd] = { count: 0, amount: 0 };
        }
        acc[itemStd].count += 1;
        acc[itemStd].amount += Number(row.END_STOCK_TAG_AMT) || 0;
        return acc;
      }, {});

      console.log(`✅ 정체재고 조회 성공: 총 ${rows.length}개 품번, 총액 ${totalStagnantStock.toLocaleString()}원`);

      return NextResponse.json({
        success: true,
        brandCode,
        yyyymm,
        months: months,
        summary: {
          totalProducts: rows.length,
          totalStagnantStock: totalStagnantStock,
          totalStagnantStockMillion: Math.round(totalStagnantStock / 1000000),
          itemSummary: itemSummary
        },
        topProducts: rows.slice(0, 20).map((row: any) => ({
          productCode: row.PRDT_CD,
          itemStd: row.ITEM_STD,
          season: row.SESN,
          endStockTagAmt: Number(row.END_STOCK_TAG_AMT) || 0,
          endStockTagAmtMillion: Math.round((Number(row.END_STOCK_TAG_AMT) || 0) / 1000000)
        })),
        allData: rows.map((row: any) => ({
          productCode: row.PRDT_CD,
          itemStd: row.ITEM_STD,
          season: row.SESN,
          endStockTagAmt: Number(row.END_STOCK_TAG_AMT) || 0
        }))
      });
    } finally {
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 정체재고 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: error instanceof Error && error.message.startsWith('유효하지 않은') ? 400 : 500 }
    );
  }
}
