import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';

// 전년 동주차 매출 및 재고 조회 API
// 예측 주차(52주차, 1주차...)에 해당하는 전년 매출, 재고, 재고주수를 반환

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandCode = searchParams.get('brandCode');
  const weeks = searchParams.get('weeks'); // 쉼표로 구분된 주차 목록 (예: "2025-W52,2026-W01,2026-W02")
  const selectedItem = searchParams.get('selectedItem') || 'all';
  
  if (!brandCode || !weeks) {
    return NextResponse.json({ error: 'brandCode and weeks are required' }, { status: 400 });
  }
  
  try {
    const weekList = weeks.split(',');
    const results: Record<string, { sale: number; stock: number; weeks: number }> = {};
    
    console.log(`📊 [weekly-prev-year-sales] 전년 데이터 조회 시작: brandCode=${brandCode}, weeks=${weeks}, item=${selectedItem}`);
    
    // 중분류 필터 조건
    const itemFilter = selectedItem !== 'all' 
      ? `AND p.prdt_hrrc2_nm = '${selectedItem === 'shoes' ? 'Shoes' : selectedItem === 'hat' ? 'Headwear' : selectedItem === 'bag' ? 'Bag' : 'Acc_etc'}'` 
      : '';
    
    // 각 주차에 대해 전년 동주차 데이터 조회
    for (const weekKey of weekList) {
      // 2025-W52 -> 2024-W52 (전년 동주차)
      const match = weekKey.match(/(\d{4})-W(\d{1,2})/);
      if (!match) {
        console.log(`⚠️ [weekly-prev-year-sales] 주차 파싱 실패: ${weekKey}`);
        continue;
      }
      
      const year = parseInt(match[1]);
      const weekNum = parseInt(match[2]);
      const prevYear = year - 1;
      
      console.log(`📅 [weekly-prev-year-sales] ${weekKey} -> 전년: ${prevYear}년 ${weekNum}주차`);
      
      // 전년 동주차 매출, 재고, 재고주수 조회
      const query = `
        WITH prdt AS (
          SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
          FROM sap_fnf.mst_prdt
          WHERE vtext1 = 'ACC'
          QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
        ),
        week_dates AS (
          SELECT DISTINCT end_dt
          FROM fnf.prcs.db_scs_w
          WHERE YEAR(end_dt) = ${prevYear}
            AND WEEKOFYEAR(end_dt) = ${weekNum}
          LIMIT 1
        ),
        -- 전년 1주 매출
        sale_1w_data AS (
          SELECT 
            ROUND(SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) / 1000000, 0) AS sale_1w
          FROM fnf.prcs.db_scs_w s
          INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
          CROSS JOIN week_dates w
          WHERE s.brd_cd = '${brandCode}'
            AND s.end_dt = w.end_dt
            ${itemFilter}
        ),
        -- 전년 재고
        stock_data AS (
          SELECT 
            ROUND(SUM(COALESCE(a.stock_tag_amt, 0)) / 1000000, 0) AS stock_amt
          FROM prcs.dw_scs_dacum a
          INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
          CROSS JOIN week_dates w
          WHERE a.brd_cd = '${brandCode}'
            AND w.end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
            ${itemFilter}
        ),
        -- 전년 4주 매출 (재고주수 계산용)
        sale_4w_data AS (
          SELECT 
            ROUND(SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) / 1000000, 0) AS sale_4w
          FROM fnf.prcs.db_scs_w s
          INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
          CROSS JOIN week_dates w
          WHERE s.brd_cd = '${brandCode}'
            AND s.end_dt <= w.end_dt
            AND s.end_dt > DATEADD(WEEK, -4, w.end_dt)
            ${itemFilter}
        )
        SELECT 
          COALESCE((SELECT sale_1w FROM sale_1w_data), 0) AS sale_amt,
          COALESCE((SELECT stock_amt FROM stock_data), 0) AS stock_amt,
          CASE 
            WHEN COALESCE((SELECT sale_4w FROM sale_4w_data), 0) > 0 
            THEN ROUND(COALESCE((SELECT stock_amt FROM stock_data), 0) / (COALESCE((SELECT sale_4w FROM sale_4w_data), 0) / 4), 1)
            ELSE 0 
          END AS stock_weeks
      `;
      
      try {
        const rows = await executeQuery(query);
        if (rows.length > 0) {
          results[weekKey] = {
            sale: rows[0].SALE_AMT || 0,
            stock: rows[0].STOCK_AMT || 0,
            weeks: rows[0].STOCK_WEEKS || 0,
          };
          console.log(`✅ [weekly-prev-year-sales] ${weekKey}: 전년 매출=${results[weekKey].sale}, 재고=${results[weekKey].stock}, 재고주수=${results[weekKey].weeks}`);
        } else {
          results[weekKey] = { sale: 0, stock: 0, weeks: 0 };
        }
      } catch (err) {
        console.error(`❌ [weekly-prev-year-sales] ${weekKey} 조회 실패:`, err);
        results[weekKey] = { sale: 0, stock: 0, weeks: 0 };
      }
    }
    
    console.log(`📊 [weekly-prev-year-sales] 최종 결과:`, results);
    
    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Error fetching prev year sales:', error);
    return NextResponse.json({ error: 'Failed to fetch prev year sales' }, { status: 500 });
  }
}

