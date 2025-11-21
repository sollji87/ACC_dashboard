/**
 * 차트 데이터 처리 로직
 */

/**
 * YYYYMM 형식에서 년월 추출
 */
function parseYearMonth(yyyymm: string): { year: number; month: number } {
  const year = parseInt(yyyymm.substring(0, 4));
  const month = parseInt(yyyymm.substring(4, 6));
  return { year, month };
}

/**
 * 최근 12개월 재고주수 및 재고택금액 데이터 조회 쿼리 생성
 * 전체 아이템 기준 (아이템별이 아닌 전체)
 */
export function buildChartDataQuery(
  brandCode: string,
  yyyymm: string,
  weeksType: '4weeks' | '8weeks' | '12weeks' = '12weeks',
  itemStd: string = 'all',
  excludePurchase: boolean = false
): string {
  const { year, month } = parseYearMonth(yyyymm);
  
  // 최근 12개월 목록 생성
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(year, month - 1 - i, 1);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}${mm}`);
  }
  
  // 전년 동일 기간 목록
  const pyMonths: string[] = months.map(m => {
    const y = parseInt(m.substring(0, 4));
    const mNum = parseInt(m.substring(4, 6));
    return `${y - 1}${String(mNum).padStart(2, '0')}`;
  });
  
  // 재고주수 계산을 위한 기간 설정
  let monthsForAvg = 1; // 4주는 1개월
  if (weeksType === '8weeks') monthsForAvg = 2;
  if (weeksType === '12weeks') monthsForAvg = 3;
  
  // 시즌 분류는 SQL에서 월별로 처리 (각 월마다 다른 조건 적용)
  
  return `
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
    and brd_cd = '${brandCode}'
    and prdt_hrrc1_nm = 'ACC'
    ${itemStd !== 'all' ? `and case when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Headwear' then '모자'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Shoes'   then '신발'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Bag'     then '가방'
                    when prdt_hrrc1_nm = 'ACC' and prdt_hrrc2_nm = 'Acc_etc' then '기타ACC'
              end = '${itemStd}'` : ''}
)
-- 월별 재고 데이터 (당년)
, monthly_stock_cy as (
    select a.yyyymm
            , sum(end_stock_tag_amt) as end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm in (${months.map(m => `'${m}'`).join(',')})
    group by a.yyyymm
)
-- 월별 재고 데이터 (전년)
, monthly_stock_py as (
    select a.yyyymm
            , sum(end_stock_tag_amt) as end_stock_tag_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm in (${pyMonths.map(m => `'${m}'`).join(',')})
    group by a.yyyymm
)
-- 월별 매출 데이터 (재고주수 계산용 - 당년)
, monthly_sale_cy as (
    select a.pst_yyyymm as yyyymm
            , sum(tag_sale_amt) as tag_sale_amt
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
     left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd <> '9' -- 수출제외
        ${excludePurchase ? "and c.chnl_cd <> '8' -- 사입제외" : ''}
        and a.brd_cd = '${brandCode}'
        and a.pst_yyyymm in (${months.map(m => `'${m}'`).join(',')})
    group by a.pst_yyyymm
)
-- 월별 매출 데이터 (재고주수 계산용 - 전년)
, monthly_sale_py as (
    select a.pst_yyyymm as yyyymm
            , sum(tag_sale_amt) as tag_sale_amt
    from sap_fnf.dm_pl_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
     left join sap_fnf.mst_shop c
        on a.brd_cd = c.brd_cd
        and a.shop_cd = c.sap_shop_cd
    where 1=1
        and c.chnl_cd <> '9' -- 수출제외
        ${excludePurchase ? "and c.chnl_cd <> '8' -- 사입제외" : ''}
        and a.brd_cd = '${brandCode}'
        and a.pst_yyyymm in (${pyMonths.map(m => `'${m}'`).join(',')})
    group by a.pst_yyyymm
)
-- 월별 평균 매출 계산 (재고주수 계산용 - 당년)
-- 4주 기준은 당월 매출 사용, 8주/12주는 롤링 평균 사용
, monthly_avg_sale_cy as (
    select 
        yyyymm,
        ${weeksType === '4weeks' 
          ? 'tag_sale_amt' 
          : `avg(tag_sale_amt) over (order by yyyymm rows between ${monthsForAvg - 1} preceding and current row)`
        } as avg_tag_sale_amt
    from monthly_sale_cy
)
-- 월별 평균 매출 계산 (재고주수 계산용 - 전년)
, monthly_avg_sale_py as (
    select 
        yyyymm,
        ${weeksType === '4weeks' 
          ? 'tag_sale_amt' 
          : `avg(tag_sale_amt) over (order by yyyymm rows between ${monthsForAvg - 1} preceding and current row)`
        } as avg_tag_sale_amt
    from monthly_sale_py
)
-- 시즌별 재고 분류 (당년)
, stock_by_season_cy as (
    select 
        a.yyyymm,
        sum(case 
            -- 당시즌: 11-2월은 24F, 25N / 3-8월은 25S, 25N / 9-10월은 25N, 25F
            when cast(substring(a.yyyymm, 5, 2) as int) in (11, 12) or cast(substring(a.yyyymm, 5, 2) as int) in (1, 2)
                then case when (b.sesn like '%24F%' or b.sesn like '%25N%') then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 3 and 8
                then case when (b.sesn like '%25S%' or b.sesn like '%25N%') then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 9 and 10
                then case when (b.sesn like '%25N%' or b.sesn like '%25F%') then end_stock_tag_amt else 0 end
            else 0
        end) as current_season_stock,
        sum(case 
            -- 차기시즌: 11-2월은 25N, 25S, 26S, 26F / 3-8월은 26S, 26N, 25F / 9-10월은 26S, 26N, 26F
            when cast(substring(a.yyyymm, 5, 2) as int) in (11, 12) or cast(substring(a.yyyymm, 5, 2) as int) in (1, 2)
                then case when (b.sesn like '%25N%' or b.sesn like '%25S%' or b.sesn like '%26S%' or b.sesn like '%26F%') then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 3 and 8
                then case when (b.sesn like '%26S%' or b.sesn like '%26N%' or b.sesn like '%25F%') then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 9 and 10
                then case when (b.sesn like '%26S%' or b.sesn like '%26N%' or b.sesn like '%26F%') then end_stock_tag_amt else 0 end
            else 0
        end) as next_season_stock,
        sum(case 
            -- 과시즌: 당시즌과 차기시즌이 아닌 나머지
            when cast(substring(a.yyyymm, 5, 2) as int) in (11, 12) or cast(substring(a.yyyymm, 5, 2) as int) in (1, 2)
                then case when not ((b.sesn like '%24F%' or b.sesn like '%25N%') or (b.sesn like '%25N%' or b.sesn like '%25S%' or b.sesn like '%26S%' or b.sesn like '%26F%')) then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 3 and 8
                then case when not ((b.sesn like '%25S%' or b.sesn like '%25N%') or (b.sesn like '%26S%' or b.sesn like '%26N%' or b.sesn like '%25F%')) then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 9 and 10
                then case when not ((b.sesn like '%25N%' or b.sesn like '%25F%') or (b.sesn like '%26S%' or b.sesn like '%26N%' or b.sesn like '%26F%')) then end_stock_tag_amt else 0 end
            else 0
        end) as old_season_stock
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm in (${months.map(m => `'${m}'`).join(',')})
    group by a.yyyymm
)
-- 시즌별 재고 분류 (전년)
, stock_by_season_py as (
    select 
        a.yyyymm,
        sum(case 
            -- 당시즌: 11-2월은 23F, 24N / 3-8월은 24S, 24N / 9-10월은 24N, 24F
            when cast(substring(a.yyyymm, 5, 2) as int) in (11, 12) or cast(substring(a.yyyymm, 5, 2) as int) in (1, 2)
                then case when (b.sesn like '%23F%' or b.sesn like '%24N%') then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 3 and 8
                then case when (b.sesn like '%24S%' or b.sesn like '%24N%') then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 9 and 10
                then case when (b.sesn like '%24N%' or b.sesn like '%24F%') then end_stock_tag_amt else 0 end
            else 0
        end) as current_season_stock,
        sum(case 
            -- 차기시즌: 11-2월은 24N, 24S, 25S, 25F / 3-8월은 25S, 25N, 24F / 9-10월은 25S, 25N, 25F
            when cast(substring(a.yyyymm, 5, 2) as int) in (11, 12) or cast(substring(a.yyyymm, 5, 2) as int) in (1, 2)
                then case when (b.sesn like '%24N%' or b.sesn like '%24S%' or b.sesn like '%25S%' or b.sesn like '%25F%') then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 3 and 8
                then case when (b.sesn like '%25S%' or b.sesn like '%25N%' or b.sesn like '%24F%') then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 9 and 10
                then case when (b.sesn like '%25S%' or b.sesn like '%25N%' or b.sesn like '%25F%') then end_stock_tag_amt else 0 end
            else 0
        end) as next_season_stock,
        sum(case 
            -- 과시즌: 당시즌과 차기시즌이 아닌 나머지
            when cast(substring(a.yyyymm, 5, 2) as int) in (11, 12) or cast(substring(a.yyyymm, 5, 2) as int) in (1, 2)
                then case when not ((b.sesn like '%23F%' or b.sesn like '%24N%') or (b.sesn like '%24N%' or b.sesn like '%24S%' or b.sesn like '%25S%' or b.sesn like '%25F%')) then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 3 and 8
                then case when not ((b.sesn like '%24S%' or b.sesn like '%24N%') or (b.sesn like '%25S%' or b.sesn like '%25N%' or b.sesn like '%24F%')) then end_stock_tag_amt else 0 end
            when cast(substring(a.yyyymm, 5, 2) as int) between 9 and 10
                then case when not ((b.sesn like '%24N%' or b.sesn like '%24F%') or (b.sesn like '%25S%' or b.sesn like '%25N%' or b.sesn like '%25F%')) then end_stock_tag_amt else 0 end
            else 0
        end) as old_season_stock
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm in (${pyMonths.map(m => `'${m}'`).join(',')})
    group by a.yyyymm
)
-- 정체재고 (최근 1개월 이내 판매 없던 재고 - 당년)
, stagnant_stock_cy as (
    select 
        a.yyyymm,
        sum(a.end_stock_tag_amt) as stagnant_stock_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
     left join (
        -- 최근 1개월 판매 이력
        select distinct a.prdt_cd
        from sap_fnf.dm_pl_shop_prdt_m a
         left join sap_fnf.mst_shop c
            on a.brd_cd = c.brd_cd
            and a.shop_cd = c.sap_shop_cd
        where a.brd_cd = '${brandCode}'
        and a.pst_yyyymm >= '${months[Math.max(0, months.length - 1)]}'
        and a.tag_sale_amt > 0
        and c.chnl_cd <> '9' -- 수출제외
     ) c on a.prdt_cd = c.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm in (${months.map(m => `'${m}'`).join(',')})
        and c.prdt_cd is null -- 판매 이력이 없는 품번
    group by a.yyyymm
)
-- 정체재고 (최근 1개월 이내 판매 없던 재고 - 전년)
, stagnant_stock_py as (
    select 
        a.yyyymm,
        sum(a.end_stock_tag_amt) as stagnant_stock_amt
    from sap_fnf.dw_ivtr_shop_prdt_m a
     join item b on a.prdt_cd = b.prdt_cd
     left join (
        -- 최근 1개월 판매 이력
        select distinct a.prdt_cd
        from sap_fnf.dm_pl_shop_prdt_m a
         left join sap_fnf.mst_shop c
            on a.brd_cd = c.brd_cd
            and a.shop_cd = c.sap_shop_cd
        where a.brd_cd = '${brandCode}'
        and a.pst_yyyymm >= '${pyMonths[Math.max(0, pyMonths.length - 1)]}'
        and a.tag_sale_amt > 0
        and c.chnl_cd <> '9' -- 수출제외
     ) c on a.prdt_cd = c.prdt_cd
    where 1=1
        and a.brd_cd = '${brandCode}'
        and a.yyyymm in (${pyMonths.map(m => `'${m}'`).join(',')})
        and c.prdt_cd is null -- 판매 이력이 없는 품번
    group by a.yyyymm
)
-- 최종 결과 (당년)
select 
    ms.yyyymm,
    'cy' as div,
    case when mas.avg_tag_sale_amt > 0
        then round(ms.end_stock_tag_amt / nullif(mas.avg_tag_sale_amt / 30 * 7, 0), 1)
        else null
    end as stock_weeks,
    coalesce(sbs.current_season_stock, 0) as current_season_stock,
    coalesce(sbs.next_season_stock, 0) as next_season_stock,
    coalesce(sbs.old_season_stock, 0) as old_season_stock,
    coalesce(ss.stagnant_stock_amt, 0) as stagnant_stock
from monthly_stock_cy ms
left join monthly_avg_sale_cy mas on ms.yyyymm = mas.yyyymm
left join stock_by_season_cy sbs on ms.yyyymm = sbs.yyyymm
left join stagnant_stock_cy ss on ms.yyyymm = ss.yyyymm
union all
-- 최종 결과 (전년)
select 
    ms.yyyymm,
    'py' as div,
    case when mas.avg_tag_sale_amt > 0
        then round(ms.end_stock_tag_amt / nullif(mas.avg_tag_sale_amt / 30 * 7, 0), 1)
        else null
    end as stock_weeks,
    coalesce(sbs.current_season_stock, 0) as current_season_stock,
    coalesce(sbs.next_season_stock, 0) as next_season_stock,
    coalesce(sbs.old_season_stock, 0) as old_season_stock,
    coalesce(ss.stagnant_stock_amt, 0) as stagnant_stock
from monthly_stock_py ms
left join monthly_avg_sale_py mas on ms.yyyymm = mas.yyyymm
left join stock_by_season_py sbs on ms.yyyymm = sbs.yyyymm
left join stagnant_stock_py ss on ms.yyyymm = ss.yyyymm
order by yyyymm, div
  `;
}

/**
 * 차트 데이터 포맷팅
 */
export function formatChartData(rows: any[]): any {
  if (!rows || rows.length === 0) return [];
  
  const cyData = rows.filter(r => (r.DIV || r.div) === 'cy');
  const pyData = rows.filter(r => (r.DIV || r.div) === 'py');
  
  // 월별로 매칭하여 차트 데이터 생성
  const chartData = cyData.map(cy => {
    const yyyymm = cy.YYYYMM || cy.yyyymm;
    const month = yyyymm.substring(4, 6);
    const year = parseInt(yyyymm.substring(0, 4));
    
    // 전년 동일 월 데이터 찾기 (1년 전)
    const previousYear = year - 1;
    const previousYyyymm = `${previousYear}${month}`;
    const py = pyData.find(p => {
      const pYyyymm = p.YYYYMM || p.yyyymm;
      return pYyyymm === previousYyyymm;
    });
    
    // 당년 재고택금액 (시즌별 합계)
    const cyCurrentSeasonStock = Math.round((Number(cy.CURRENT_SEASON_STOCK || cy.current_season_stock) || 0) / 1000000);
    const cyNextSeasonStock = Math.round((Number(cy.NEXT_SEASON_STOCK || cy.next_season_stock) || 0) / 1000000);
    const cyOldSeasonStock = Math.round((Number(cy.OLD_SEASON_STOCK || cy.old_season_stock) || 0) / 1000000);
    const cyStagnantStock = Math.round((Number(cy.STAGNANT_STOCK || cy.stagnant_stock) || 0) / 1000000);
    const cyTotalStock = cyCurrentSeasonStock + cyNextSeasonStock + cyOldSeasonStock + cyStagnantStock;
    
    // 전년 재고택금액 (시즌별 합계)
    const pyCurrentSeasonStock = Math.round((Number(py?.CURRENT_SEASON_STOCK || py?.current_season_stock) || 0) / 1000000);
    const pyNextSeasonStock = Math.round((Number(py?.NEXT_SEASON_STOCK || py?.next_season_stock) || 0) / 1000000);
    const pyOldSeasonStock = Math.round((Number(py?.OLD_SEASON_STOCK || py?.old_season_stock) || 0) / 1000000);
    const pyStagnantStock = Math.round((Number(py?.STAGNANT_STOCK || py?.stagnant_stock) || 0) / 1000000);
    const pyTotalStock = pyCurrentSeasonStock + pyNextSeasonStock + pyOldSeasonStock + pyStagnantStock;
    
    // YOY 계산 (당년 / 전년 * 100)
    const stockYOY = pyTotalStock !== 0 
      ? Math.round((cyTotalStock / pyTotalStock) * 100 * 10) / 10 
      : 0;
    
    return {
      month: `${year}-${month}`,
      stockWeeks: Number(cy.STOCK_WEEKS || cy.stock_weeks) || 0,
      previousStockWeeks: Number(py?.STOCK_WEEKS || py?.stock_weeks) || 0,
      // 당년 시즌별 재고택금액
      currentSeasonStock: cyCurrentSeasonStock,
      nextSeasonStock: cyNextSeasonStock,
      oldSeasonStock: cyOldSeasonStock,
      stagnantStock: cyStagnantStock,
      totalStock: cyTotalStock,
      // 전년 시즌별 재고택금액
      previousCurrentSeasonStock: pyCurrentSeasonStock,
      previousNextSeasonStock: pyNextSeasonStock,
      previousOldSeasonStock: pyOldSeasonStock,
      previousStagnantStock: pyStagnantStock,
      previousTotalStock: pyTotalStock,
      // YOY
      stockYOY: stockYOY,
    };
  });
  
  return chartData;
}

