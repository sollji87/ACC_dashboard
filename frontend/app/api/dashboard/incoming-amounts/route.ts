import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { ensureBrandCode, ensureYearMonth } from '@/lib/request-validation';

/**
 * 입고예정금액 조회 API (Snowflake 직접 연결)
 * GET /api/dashboard/incoming-amounts?brandCode=M&startMonth=2025-11&endMonth=2026-04
 */
export async function GET(request: NextRequest) {
  let connection = null;
  let retries = 0;
  const MAX_RETRIES = 2;

  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = ensureBrandCode(searchParams.get('brandCode'));
    const startMonth = ensureYearMonth(searchParams.get('startMonth'), 'startMonth');
    const endMonth = ensureYearMonth(searchParams.get('endMonth'), 'endMonth');

    // 파라미터 검증
    const startYyyymm = startMonth.replace(/-/g, '');
    const endYyyymm = endMonth.replace(/-/g, '');

    while (retries <= MAX_RETRIES) {
      try {
        console.log(`📊 브랜드 ${brandCode} 입고예정금액 조회 시작 (${startMonth} ~ ${endMonth}) - 시도: ${retries + 1}`);
        connection = await connectToSnowflake();

        const sqlText = `
-- 발주 데이터 (합의납기연월 기준, 중분류별 집계)
with base as (
    select  a.brd_cd                              as brd_cd
          , d.vtext2                              as mid_cat
          , to_char(a.indc_dt_cnfm, 'YYYY-MM')    as indc_yyyymm
          , a.tag_price * a.ord_qty               as ord_amt
    from prcs.dw_ord a
    left join sap_fnf.mst_prdt d
      on a.prdt_cd = d.prdt_cd
    where 1 = 1
      and a.brd_cd = :1
      and d.vtext2 in ('Acc_etc', 'Bag', 'Headwear', 'Shoes')
      and a.PO_CLS_NM in (
            '내수/원화/세금계산서/DDP',
            '한국수입/외화/세금계산서/FOB',
            '한국수입/외화/FOB'
      )
      and a.indc_dt_cnfm is not null
      and to_char(a.indc_dt_cnfm, 'YYYYMM') between :2 and :3
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
`;

        const rows = await executeQuery(sqlText, connection, 0, [brandCode, startYyyymm, endYyyymm]);
        
        // 월별 중분류별로 집계
        const monthlyData = aggregateIncomingAmountsByMonth(rows);

        console.log(`✅ 브랜드 ${brandCode} 입고예정금액 조회 성공: ${monthlyData.length}개월 데이터`);

        return NextResponse.json({
          success: true,
          data: monthlyData,
        });
      } catch (error: any) {
        console.error(`❌ 입고예정금액 조회 실패 (시도: ${retries + 1}):`, error);
        if (error.message?.includes('terminated connection') && retries < MAX_RETRIES) {
          retries++;
          console.log(`재시도 중... (${retries}/${MAX_RETRIES})`);
          await disconnectFromSnowflake();
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw error;
        }
      } finally {
        if (connection) {
          await disconnectFromSnowflake();
        }
      }
    }

    return NextResponse.json(
      { success: false, error: 'Snowflake 연결 오류로 입고예정금액 조회에 실패했습니다.' },
      { status: 500 }
    );
  } catch (error) {
    console.error('❌ 입고예정금액 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '서버 오류',
      },
      { status: error instanceof Error && error.message.startsWith('유효하지 않은') ? 400 : 500 }
    );
  }
}

/**
 * 월별 중분류별로 입고예정금액 집계
 */
function aggregateIncomingAmountsByMonth(rows: any[]): any[] {
  const monthlyMap = new Map<string, { shoes: number; hat: number; bag: number; other: number }>();

  rows.forEach((row) => {
    const month = row['합의납기연월'];
    if (!month) return;

    const subCategory = row['중분류'];
    const amount = Number(row['발주금액']) || 0;

    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { shoes: 0, hat: 0, bag: 0, other: 0 });
    }
    const currentMonthData = monthlyMap.get(month)!;

    switch (subCategory) {
      case '신발':
        currentMonthData.shoes += amount;
        break;
      case '모자':
        currentMonthData.hat += amount;
        break;
      case '가방':
        currentMonthData.bag += amount;
        break;
      case '기타ACC':
        currentMonthData.other += amount;
        break;
      default:
        break;
    }
  });

  return Array.from(monthlyMap.entries())
    .map(([month, amounts]) => ({
      month,
      shoes: amounts.shoes,
      hat: amounts.hat,
      bag: amounts.bag,
      other: amounts.other,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
