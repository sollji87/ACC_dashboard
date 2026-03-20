import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';
import { ensureBrandCode, ensureWeekCsv } from '@/lib/request-validation';

// 전년 동주차 매출 및 재고 조회 API (최적화: 하나의 쿼리로 모든 주차 조회)
// 예측 주차(52주차, 1주차...)에 해당하는 전년 매출, 재고, 재고주수를 반환

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandCode = ensureBrandCode(searchParams.get('brandCode'));
    const weekList = ensureWeekCsv(searchParams.get('weeks')); // 쉼표로 구분된 주차 목록 (예: "2025-W52,2026-W01,2026-W02")
    const selectedItem = searchParams.get('selectedItem') || 'all';
    const results: Record<string, { sale: number; stock: number; weeks: number }> = {};
    
    console.log(`📊 [weekly-prev-year-sales] 전년 데이터 조회 시작: brandCode=${brandCode}, weeks=${weekList.join(',')}, item=${selectedItem}`);
    
    // 주차 파싱하여 전년 주차 목록 생성
    const weekParams: { weekKey: string; prevYear: number; weekNum: number }[] = [];
    for (const weekKey of weekList) {
      const match = weekKey.match(/(\d{4})-W(\d{1,2})/);
      if (!match) {
        console.log(`⚠️ [weekly-prev-year-sales] 주차 파싱 실패: ${weekKey}`);
        continue;
      }
      const year = parseInt(match[1]);
      const weekNum = parseInt(match[2]);
      weekParams.push({ weekKey, prevYear: year - 1, weekNum });
    }
    
    if (weekParams.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }
    
    // 중분류 필터 조건
    const validSelectedItems = new Set(['all', 'shoes', 'hat', 'bag', 'other']);
    if (!validSelectedItems.has(selectedItem)) {
      return NextResponse.json({ error: 'Invalid selectedItem' }, { status: 400 });
    }

    const itemFilterValue = selectedItem === 'shoes' ? 'Shoes' 
      : selectedItem === 'hat' ? 'Headwear' 
      : selectedItem === 'bag' ? 'Bag' 
      : selectedItem === 'all' ? null : 'Acc_etc';
    
    const itemFilter = itemFilterValue ? 'AND p.prdt_hrrc2_nm = :2' : '';
    const weekBindStartIndex = itemFilterValue ? 3 : 2;
    
    // 주차 조건 생성 (전년 주차 필터)
    const weekConditions = weekParams.map((_, index) => {
      const yearBindIndex = weekBindStartIndex + index * 2;
      const weekBindIndex = yearBindIndex + 1;
      return `(YEAR(s.end_dt) = :${yearBindIndex} AND WEEKOFYEAR(s.end_dt) = :${weekBindIndex})`;
    }).join(' OR ');
    
    // 더 간단하고 빠른 쿼리 - sale_data에서 end_dt를 얻어 stock 조회
    const query = `
      WITH prdt AS (
        SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm
        FROM sap_fnf.mst_prdt
        WHERE vtext1 = 'ACC'
        QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
      ),
      -- 먼저 필요한 주차의 end_dt 찾기 (db_scs_w에서)
      week_dates AS (
        SELECT DISTINCT 
          s.end_dt,
          YEAR(s.end_dt) + 1 || '-W' || LPAD(WEEKOFYEAR(s.end_dt)::STRING, 2, '0') AS week_key
        FROM fnf.prcs.db_scs_w s
        WHERE s.brd_cd = :1
          AND (${weekConditions})
      ),
      -- 전년 1주 매출 (필요한 주차만 필터)
      sale_1w_data AS (
        SELECT 
          wd.week_key,
          wd.end_dt,
          ROUND(SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) / 1000000, 0) AS sale_1w
        FROM week_dates wd
        INNER JOIN fnf.prcs.db_scs_w s ON s.end_dt = wd.end_dt
        INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
        WHERE s.brd_cd = :1
          ${itemFilter}
        GROUP BY wd.week_key, wd.end_dt
      ),
      -- 전년 4주 매출 (재고주수 계산용)
      sale_4w_data AS (
        SELECT 
          sd.week_key,
          ROUND(SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) / 1000000, 0) AS sale_4w
        FROM sale_1w_data sd
        INNER JOIN fnf.prcs.db_scs_w s ON s.end_dt <= sd.end_dt AND s.end_dt > DATEADD(WEEK, -4, sd.end_dt)
        INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
        WHERE s.brd_cd = :1
          ${itemFilter}
        GROUP BY sd.week_key
      ),
      -- 전년 재고 (dw_scs_dacum 테이블에서 해당 end_dt가 start_dt~end_dt 범위에 있는 행)
      stock_data AS (
        SELECT 
          sd.week_key,
          ROUND(SUM(COALESCE(a.stock_tag_amt, 0)) / 1000000, 0) AS stock_amt
        FROM sale_1w_data sd
        INNER JOIN prcs.dw_scs_dacum a ON sd.end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
        INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
        WHERE a.brd_cd = :1
          ${itemFilter}
        GROUP BY sd.week_key
      )
      SELECT 
        sd.week_key,
        sd.sale_1w AS sale_amt,
        COALESCE(st.stock_amt, 0) AS stock_amt,
        CASE 
          WHEN COALESCE(s4.sale_4w, 0) > 0 
          THEN ROUND(COALESCE(st.stock_amt, 0) / (COALESCE(s4.sale_4w, 0) / 4), 1)
          ELSE 0 
        END AS stock_weeks
      FROM sale_1w_data sd
      LEFT JOIN stock_data st ON st.week_key = sd.week_key
      LEFT JOIN sale_4w_data s4 ON s4.week_key = sd.week_key
      ORDER BY sd.week_key
    `;
    
    console.log(`📊 [weekly-prev-year-sales] 최적화된 단일 쿼리 실행 (${weekParams.length}주차)`);
    
    const binds = [
      ...(itemFilterValue ? [brandCode, itemFilterValue] : [brandCode]),
      ...weekParams.flatMap(({ prevYear, weekNum }) => [prevYear, weekNum]),
    ];
    const rows = await executeQuery(query, undefined, 0, binds);
    
    // 결과를 weekKey별로 매핑
    for (const row of rows) {
      const weekKey = row.WEEK_KEY;
      results[weekKey] = {
        sale: row.SALE_AMT || 0,
        stock: row.STOCK_AMT || 0,
        weeks: row.STOCK_WEEKS || 0,
      };
    }
    
    // 조회되지 않은 주차는 0으로 초기화
    for (const { weekKey } of weekParams) {
      if (!results[weekKey]) {
        results[weekKey] = { sale: 0, stock: 0, weeks: 0 };
      }
    }
    
    console.log(`✅ [weekly-prev-year-sales] 조회 완료: ${Object.keys(results).length}주차 데이터`);
    
    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Error fetching prev year sales:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch prev year sales' },
      { status: error instanceof Error && error.message.startsWith('유효하지 않은') ? 400 : 500 }
    );
  }
}

