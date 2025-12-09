/**
 * 차트 데이터 처리 로직
 * 
 * 시즌 분류 순서 (당시즌/차기시즌 우선, 정체재고는 그 외에서만):
 * 1. 당시즌 판단
 * 2. 차기시즌 판단
 * 3. 정체재고 판단 (당시즌/차기시즌 아닌 것 중 판매액 < 기준금액)
 * 4. 과시즌 (나머지)
 * 
 * SS 시즌 (3-8월):
 *   - 당시즌: yyN, yyS
 *   - 차기시즌: yyF, (yy+1)N, (yy+1)S 이후
 * 
 * FW 시즌 (9-2월):
 *   - 당시즌: yyN, yyF
 *   - 차기시즌: (yy+1)N, (yy+1)S, (yy+1)F 이후
 * 
 * 정체재고: 당시즌/차기시즌 제외한 것 중 판매액 < 기준금액(전체 ACC 재고 * 0.01%)
 * 과시즌: 당시즌/차기시즌/정체재고 제외한 나머지
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
 * 시즌 조건 생성 함수들 (월별로 동적 계산)
 */
function getSeasonConditions(yyyymm: string) {
  const { year, month } = parseYearMonth(yyyymm);
  const yy = year % 100;
  
  // FW: 9-2월, SS: 3-8월
  const isFW = month >= 9 || month <= 2;
  const baseYear = isFW && month <= 2 ? yy - 1 : yy;
  
  if (isFW) {
    // FW 시즌 (9-2월)
    return {
      currentSeasons: [`${baseYear}N`, `${baseYear}F`],
      nextSeasons: [`${baseYear+1}N`, `${baseYear+1}S`, `${baseYear+1}F`, `${baseYear+2}N`, `${baseYear+2}S`],
      activeSeasons: [`${baseYear}N`, `${baseYear}F`, `${baseYear+1}N`, `${baseYear+1}S`, `${baseYear+1}F`, `${baseYear+2}N`, `${baseYear+2}S`],
    };
  } else {
    // SS 시즌 (3-8월)
    return {
      currentSeasons: [`${yy}N`, `${yy}S`],
      nextSeasons: [`${yy}F`, `${yy+1}N`, `${yy+1}S`, `${yy+1}F`, `${yy+2}N`, `${yy+2}S`],
      activeSeasons: [`${yy}N`, `${yy}S`, `${yy}F`, `${yy+1}N`, `${yy+1}S`, `${yy+2}N`, `${yy+2}S`],
    };
  }
}

/**
 * 시즌 LIKE 조건 생성
 */
function buildSeasonLikeCondition(seasons: string[], columnName: string = 'b.sesn'): string {
  return seasons.map(s => `${columnName} LIKE '%${s}%'`).join(' OR ');
}

/**
 * 활성 시즌 NOT LIKE 조건 생성 (정체재고용)
 */
function buildActiveSeasonsNotLikeCondition(seasons: string[], columnName: string = 'b.sesn'): string {
  return seasons.map(s => `${columnName} NOT LIKE '%${s}%'`).join(' AND ');
}

/**
 * 최근 12개월 재고주수 및 재고택금액 데이터 조회 쿼리 생성
 */
export function buildChartDataQuery(
  brandCode: string,
  yyyymm: string,
  weeksType: '4weeks' | '8weeks' | '12weeks' = '12weeks',
  itemStd: string = 'all',
  excludePurchase: boolean = false,
  base: 'amount' | 'quantity' = 'amount'
): string {
  const { year, month } = parseYearMonth(yyyymm);
  
  // 최근 13개월 목록 생성 (입고금액 계산을 위해 한 달 더 이전 포함)
  const months: string[] = [];
  for (let i = 12; i >= 0; i--) {
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
  let monthsForAvg = 1;
  if (weeksType === '8weeks') monthsForAvg = 2;
  if (weeksType === '12weeks') monthsForAvg = 3;
  
  // 금액/수량 기준에 따른 컬럼명 선택
  const stockColumn = base === 'quantity' ? 'end_stock_qty' : 'end_stock_tag_amt';
  const saleColumn = base === 'quantity' ? 'sale_qty' : 'tag_sale_amt';
  
  return `
-- item: ACC 아이템 기준
WITH item AS (
    SELECT prdt_cd, sesn,
        CASE 
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Headwear' THEN '모자'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Shoes' THEN '신발'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Bag' THEN '가방'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Acc_etc' THEN '기타ACC'
        END AS item_std
    FROM sap_fnf.mst_prdt
    WHERE brd_cd = '${brandCode}'
      AND prdt_hrrc1_nm = 'ACC'
      ${itemStd !== 'all' ? `AND CASE 
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Headwear' THEN '모자'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Shoes' THEN '신발'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Bag' THEN '가방'
            WHEN prdt_hrrc1_nm = 'ACC' AND prdt_hrrc2_nm = 'Acc_etc' THEN '기타ACC'
        END = '${itemStd}'` : ''}
),

-- 월별 기준금액 계산 (전체 ACC 재고 * 0.01%)
monthly_threshold AS (
    SELECT 
        a.yyyymm,
        SUM(a.${stockColumn}) as total_stock_amt,
        SUM(a.${stockColumn}) * 0.0001 as threshold_amt
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = '${brandCode}'
      AND a.yyyymm IN (${[...months, ...pyMonths].map(m => `'${m}'`).join(',')})
      AND b.item_std IS NOT NULL
    GROUP BY a.yyyymm
),

-- 월별 품번별 판매 (금액 또는 수량)
monthly_sale_by_product AS (
    ${base === 'quantity' 
      ? `SELECT 
        TO_CHAR(a.pst_dt, 'YYYYMM') as yyyymm,
        a.prdt_cd,
        SUM(a.${saleColumn}) as tag_sale_amt
    FROM sap_fnf.dw_copa_d a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.cust_cd = c.sap_shop_cd
    WHERE a.brd_cd = '${brandCode}'
      AND TO_CHAR(a.pst_dt, 'YYYYMM') IN (${[...months, ...pyMonths].map(m => `'${m}'`).join(',')})
      AND b.item_std IS NOT NULL
      AND c.chnl_cd <> '9'
      ${excludePurchase ? "AND c.chnl_cd <> '8'" : ''}
    GROUP BY TO_CHAR(a.pst_dt, 'YYYYMM'), a.prdt_cd`
      : `SELECT 
        a.pst_yyyymm as yyyymm,
        a.prdt_cd,
        SUM(a.${saleColumn}) as tag_sale_amt
    FROM sap_fnf.dm_pl_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.shop_cd = c.sap_shop_cd
    WHERE a.brd_cd = '${brandCode}'
      AND a.pst_yyyymm IN (${[...months, ...pyMonths].map(m => `'${m}'`).join(',')})
      AND b.item_std IS NOT NULL
      AND c.chnl_cd <> '9'
      ${excludePurchase ? "AND c.chnl_cd <> '8'" : ''}
    GROUP BY a.pst_yyyymm, a.prdt_cd`
    }
),

-- 월별 품번별 재고 (금액 또는 수량)
monthly_stock_by_product AS (
    SELECT 
        a.yyyymm,
        a.prdt_cd,
        b.sesn,
        SUM(a.${stockColumn}) as end_stock_tag_amt
    FROM sap_fnf.dw_ivtr_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    WHERE a.brd_cd = '${brandCode}'
      AND a.yyyymm IN (${[...months, ...pyMonths].map(m => `'${m}'`).join(',')})
      AND b.item_std IS NOT NULL
    GROUP BY a.yyyymm, a.prdt_cd, b.sesn
),

-- 월별 시즌별 재고 분류 (당시즌/차기시즌 먼저 판단, 정체재고는 그 외에서만)
monthly_classified_stock AS (
    SELECT 
        s.yyyymm,
        s.prdt_cd,
        s.sesn,
        s.end_stock_tag_amt,
        COALESCE(p.tag_sale_amt, 0) as tag_sale_amt,
        t.threshold_amt,
        CAST(SUBSTRING(s.yyyymm, 1, 4) AS INT) as data_year,
        CAST(SUBSTRING(s.yyyymm, 5, 2) AS INT) as data_month,
        -- 시즌 분류 (당시즌/차기시즌 우선, 정체재고는 과시즌에서만)
        CASE 
            -- 1. 당시즌 (먼저 판단)
            WHEN (
                CASE WHEN CAST(SUBSTRING(s.yyyymm, 5, 2) AS INT) >= 9 OR CAST(SUBSTRING(s.yyyymm, 5, 2) AS INT) <= 2 THEN
                    CASE WHEN CAST(SUBSTRING(s.yyyymm, 5, 2) AS INT) <= 2 THEN
                        -- 1-2월 FW: 당시즌 = (yy-1)N, (yy-1)F
                        s.sesn LIKE '%' || CAST(CAST(SUBSTRING(s.yyyymm, 3, 2) AS INT) - 1 AS VARCHAR) || 'N%'
                        OR s.sesn LIKE '%' || CAST(CAST(SUBSTRING(s.yyyymm, 3, 2) AS INT) - 1 AS VARCHAR) || 'F%'
                    ELSE
                        -- 9-12월 FW: 당시즌 = yyN, yyF
                        s.sesn LIKE '%' || CAST(SUBSTRING(s.yyyymm, 3, 2) AS VARCHAR) || 'N%'
                        OR s.sesn LIKE '%' || CAST(SUBSTRING(s.yyyymm, 3, 2) AS VARCHAR) || 'F%'
                    END
                ELSE
                    -- 3-8월 SS: 당시즌 = yyN, yyS
                    s.sesn LIKE '%' || CAST(SUBSTRING(s.yyyymm, 3, 2) AS VARCHAR) || 'N%'
                    OR s.sesn LIKE '%' || CAST(SUBSTRING(s.yyyymm, 3, 2) AS VARCHAR) || 'S%'
                END
            ) THEN '당시즌'
            -- 2. 차기시즌
            WHEN (
                CASE WHEN CAST(SUBSTRING(s.yyyymm, 5, 2) AS INT) >= 9 OR CAST(SUBSTRING(s.yyyymm, 5, 2) AS INT) <= 2 THEN
                    CASE WHEN CAST(SUBSTRING(s.yyyymm, 5, 2) AS INT) <= 2 THEN
                        -- 1-2월 FW: 차기시즌 = yyN, yyS, yyF, (yy+1) 이후
                        s.sesn LIKE '%' || CAST(SUBSTRING(s.yyyymm, 3, 2) AS VARCHAR) || 'N%'
                        OR s.sesn LIKE '%' || CAST(SUBSTRING(s.yyyymm, 3, 2) AS VARCHAR) || 'S%'
                        OR s.sesn LIKE '%' || CAST(SUBSTRING(s.yyyymm, 3, 2) AS VARCHAR) || 'F%'
                        OR s.sesn LIKE '%' || CAST(CAST(SUBSTRING(s.yyyymm, 3, 2) AS INT) + 1 AS VARCHAR) || '%'
                    ELSE
                        -- 9-12월 FW: 차기시즌 = (yy+1)N, (yy+1)S, (yy+1)F, (yy+2) 이후
                        s.sesn LIKE '%' || CAST(CAST(SUBSTRING(s.yyyymm, 3, 2) AS INT) + 1 AS VARCHAR) || 'N%'
                        OR s.sesn LIKE '%' || CAST(CAST(SUBSTRING(s.yyyymm, 3, 2) AS INT) + 1 AS VARCHAR) || 'S%'
                        OR s.sesn LIKE '%' || CAST(CAST(SUBSTRING(s.yyyymm, 3, 2) AS INT) + 1 AS VARCHAR) || 'F%'
                        OR s.sesn LIKE '%' || CAST(CAST(SUBSTRING(s.yyyymm, 3, 2) AS INT) + 2 AS VARCHAR) || '%'
                    END
                ELSE
                    -- 3-8월 SS: 차기시즌 = yyF, (yy+1) 이후
                    s.sesn LIKE '%' || CAST(SUBSTRING(s.yyyymm, 3, 2) AS VARCHAR) || 'F%'
                    OR s.sesn LIKE '%' || CAST(CAST(SUBSTRING(s.yyyymm, 3, 2) AS INT) + 1 AS VARCHAR) || '%'
                    OR s.sesn LIKE '%' || CAST(CAST(SUBSTRING(s.yyyymm, 3, 2) AS INT) + 2 AS VARCHAR) || '%'
                END
            ) THEN '차기시즌'
            -- 3. 정체재고: 당시즌/차기시즌 아닌 것 중 판매액 < 기준금액
            WHEN COALESCE(p.tag_sale_amt, 0) < t.threshold_amt THEN '정체재고'
            -- 4. 과시즌 (나머지)
            ELSE '과시즌'
        END as season_type
    FROM monthly_stock_by_product s
    JOIN monthly_threshold t ON s.yyyymm = t.yyyymm
    LEFT JOIN monthly_sale_by_product p ON s.yyyymm = p.yyyymm AND s.prdt_cd = p.prdt_cd
),

-- 월별 시즌별 재고 집계
monthly_season_summary AS (
    SELECT 
        yyyymm,
        SUM(CASE WHEN season_type = '당시즌' THEN end_stock_tag_amt ELSE 0 END) as current_season_stock,
        SUM(CASE WHEN season_type = '차기시즌' THEN end_stock_tag_amt ELSE 0 END) as next_season_stock,
        SUM(CASE WHEN season_type = '과시즌' THEN end_stock_tag_amt ELSE 0 END) as old_season_stock,
        SUM(CASE WHEN season_type = '정체재고' THEN end_stock_tag_amt ELSE 0 END) as stagnant_stock,
        SUM(end_stock_tag_amt) as total_stock
    FROM monthly_classified_stock
    GROUP BY yyyymm
),

-- 월별 시즌별 매출액 집계
monthly_season_sale_summary AS (
    SELECT 
        yyyymm,
        SUM(CASE WHEN season_type = '당시즌' THEN tag_sale_amt ELSE 0 END) as current_season_sale,
        SUM(CASE WHEN season_type = '차기시즌' THEN tag_sale_amt ELSE 0 END) as next_season_sale,
        SUM(CASE WHEN season_type = '과시즌' THEN tag_sale_amt ELSE 0 END) as old_season_sale,
        SUM(CASE WHEN season_type = '정체재고' THEN tag_sale_amt ELSE 0 END) as stagnant_sale,
        SUM(tag_sale_amt) as total_sale
    FROM monthly_classified_stock
    GROUP BY yyyymm
),

-- 월별 재고주수 계산용 매출 (전체, 금액 또는 수량)
monthly_sale AS (
    ${base === 'quantity'
      ? `SELECT 
        TO_CHAR(a.pst_dt, 'YYYYMM') as yyyymm,
        SUM(a.${saleColumn}) as tag_sale_amt
    FROM sap_fnf.dw_copa_d a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.cust_cd = c.sap_shop_cd
    WHERE a.brd_cd = '${brandCode}'
      AND TO_CHAR(a.pst_dt, 'YYYYMM') IN (${[...months, ...pyMonths].map(m => `'${m}'`).join(',')})
      AND c.chnl_cd <> '9'
      ${excludePurchase ? "AND c.chnl_cd <> '8'" : ''}
    GROUP BY TO_CHAR(a.pst_dt, 'YYYYMM')`
      : `SELECT 
        a.pst_yyyymm as yyyymm,
        SUM(a.${saleColumn}) as tag_sale_amt
    FROM sap_fnf.dm_pl_shop_prdt_m a
    JOIN item b ON a.prdt_cd = b.prdt_cd
    LEFT JOIN sap_fnf.mst_shop c
        ON a.brd_cd = c.brd_cd
        AND a.shop_cd = c.sap_shop_cd
    WHERE a.brd_cd = '${brandCode}'
      AND a.pst_yyyymm IN (${[...months, ...pyMonths].map(m => `'${m}'`).join(',')})
      AND c.chnl_cd <> '9'
      ${excludePurchase ? "AND c.chnl_cd <> '8'" : ''}
    GROUP BY a.pst_yyyymm`
    }
),

-- 월별 정체재고 판매액 집계
monthly_stagnant_sale AS (
    SELECT 
        yyyymm,
        SUM(CASE WHEN season_type = '정체재고' THEN tag_sale_amt ELSE 0 END) as stagnant_sale_amt
    FROM monthly_classified_stock
    GROUP BY yyyymm
),

-- 월별 정상재고 판매액 (전체 - 정체재고)
monthly_normal_sale AS (
    SELECT 
        ms.yyyymm,
        ms.tag_sale_amt - COALESCE(mss.stagnant_sale_amt, 0) as normal_sale_amt
    FROM monthly_sale ms
    LEFT JOIN monthly_stagnant_sale mss ON ms.yyyymm = mss.yyyymm
),

-- 월별 평균 매출 (재고주수용 - 전체)
monthly_avg_sale AS (
    SELECT 
        yyyymm,
        ${weeksType === '4weeks' 
          ? 'tag_sale_amt as avg_tag_sale_amt' 
          : `AVG(tag_sale_amt) OVER (ORDER BY yyyymm ROWS BETWEEN ${monthsForAvg - 1} PRECEDING AND CURRENT ROW) as avg_tag_sale_amt`
        }
    FROM monthly_sale
),

-- 월별 평균 정상재고 판매액 (정상재고 재고주수용)
monthly_avg_normal_sale AS (
    SELECT 
        yyyymm,
        ${weeksType === '4weeks' 
          ? 'normal_sale_amt as avg_normal_sale_amt' 
          : `AVG(normal_sale_amt) OVER (ORDER BY yyyymm ROWS BETWEEN ${monthsForAvg - 1} PRECEDING AND CURRENT ROW) as avg_normal_sale_amt`
        }
    FROM monthly_normal_sale
),

-- 월별 정상재고 재고주수 계산용 (정상재고 / 정상재고 평균 판매)
-- 정상재고 = 전체 재고 - 정체재고
monthly_normal_stock_weeks AS (
    SELECT 
        ss.yyyymm,
        ss.total_stock - ss.stagnant_stock as normal_stock,
        mans.avg_normal_sale_amt,
        CASE 
            WHEN mans.avg_normal_sale_amt > 0 AND (mans.avg_normal_sale_amt / 30 * 7) > 0
            THEN ROUND((ss.total_stock - ss.stagnant_stock) / (mans.avg_normal_sale_amt / 30 * 7), 1)
            ELSE NULL
        END as normal_stock_weeks
    FROM monthly_season_summary ss
    LEFT JOIN monthly_avg_normal_sale mans ON ss.yyyymm = mans.yyyymm
)

-- 최종 결과
SELECT 
    ss.yyyymm,
    CASE WHEN ss.yyyymm IN (${months.map(m => `'${m}'`).join(',')}) THEN 'cy' ELSE 'py' END as div,
    CASE 
        WHEN mas.avg_tag_sale_amt > 0 AND (mas.avg_tag_sale_amt / 30 * 7) > 0
        THEN ROUND(ss.total_stock / (mas.avg_tag_sale_amt / 30 * 7), 1)
        ELSE NULL
    END as stock_weeks,
    ns.normal_stock_weeks,
    ss.current_season_stock,
    ss.next_season_stock,
    ss.old_season_stock,
    ss.stagnant_stock,
    ss.total_stock,
    sss.current_season_sale,
    sss.next_season_sale,
    sss.old_season_sale,
    sss.stagnant_sale,
    sss.total_sale
FROM monthly_season_summary ss
LEFT JOIN monthly_avg_sale mas ON ss.yyyymm = mas.yyyymm
LEFT JOIN monthly_normal_stock_weeks ns ON ss.yyyymm = ns.yyyymm
LEFT JOIN monthly_season_sale_summary sss ON ss.yyyymm = sss.yyyymm
ORDER BY ss.yyyymm
  `;
}

/**
 * 차트 데이터 포맷팅
 */
export function formatChartData(rows: any[], base: 'amount' | 'quantity' = 'amount'): any {
  if (!rows || rows.length === 0) return [];
  
  const cyData = rows.filter(r => (r.DIV || r.div) === 'cy');
  const pyData = rows.filter(r => (r.DIV || r.div) === 'py');
  
  // 월별로 매칭하여 차트 데이터 생성 (13개월 데이터, 첫 월은 전월 재고 계산용)
  const chartData = cyData.map((cy, index, arr) => {
    const yyyymm = cy.YYYYMM || cy.yyyymm;
    const monthStr = yyyymm.substring(4, 6);
    const year = parseInt(yyyymm.substring(0, 4));
    
    // 전월 데이터 찾기 (입고금액 계산용)
    const prevMonthCy = index > 0 ? arr[index - 1] : null;
    
    // 전년 동일 월 데이터 찾기
    const previousYear = year - 1;
    const previousYyyymm = `${previousYear}${monthStr}`;
    // pyData에서 먼저 찾고, 없으면 cyData에서 찾기 (months/pyMonths 중복 월 처리)
    let py = pyData.find(p => {
      const pYyyymm = p.YYYYMM || p.yyyymm;
      return pYyyymm === previousYyyymm;
    });
    if (!py) {
      // 중복 월인 경우 cyData에서 찾기 (예: 2024-10이 cy와 py 양쪽에 있어야 하는 경우)
      py = cyData.find(c => {
        const cYyyymm = c.YYYYMM || c.yyyymm;
        return cYyyymm === previousYyyymm;
      });
    }
    
    // 당년 시즌별 재고 (금액: 백만원 단위, 수량: 그대로)
    const divisor = base === 'quantity' ? 1 : 1000000;
    const cyCurrentSeasonStock = Math.round((Number(cy.CURRENT_SEASON_STOCK || cy.current_season_stock) || 0) / divisor);
    const cyNextSeasonStock = Math.round((Number(cy.NEXT_SEASON_STOCK || cy.next_season_stock) || 0) / divisor);
    const cyOldSeasonStock = Math.round((Number(cy.OLD_SEASON_STOCK || cy.old_season_stock) || 0) / divisor);
    const cyStagnantStock = Math.round((Number(cy.STAGNANT_STOCK || cy.stagnant_stock) || 0) / divisor);
    const cyTotalStock = Math.round((Number(cy.TOTAL_STOCK || cy.total_stock) || 0) / divisor);
    
    // 전월 재고 (입고금액 계산용)
    const prevMonthTotalStock = prevMonthCy 
      ? Math.round((Number(prevMonthCy.TOTAL_STOCK || prevMonthCy.total_stock) || 0) / divisor)
      : 0;
    
    // 전년 시즌별 재고 (금액: 백만원 단위, 수량: 그대로)
    const pyCurrentSeasonStock = Math.round((Number(py?.CURRENT_SEASON_STOCK || py?.current_season_stock) || 0) / divisor);
    const pyNextSeasonStock = Math.round((Number(py?.NEXT_SEASON_STOCK || py?.next_season_stock) || 0) / divisor);
    const pyOldSeasonStock = Math.round((Number(py?.OLD_SEASON_STOCK || py?.old_season_stock) || 0) / divisor);
    const pyStagnantStock = Math.round((Number(py?.STAGNANT_STOCK || py?.stagnant_stock) || 0) / divisor);
    const pyTotalStock = Math.round((Number(py?.TOTAL_STOCK || py?.total_stock) || 0) / divisor);
    
    // 당년 시즌별 매출액 (금액: 백만원 단위)
    const cyCurrentSeasonSale = Math.round((Number(cy.CURRENT_SEASON_SALE || cy.current_season_sale) || 0) / divisor);
    const cyNextSeasonSale = Math.round((Number(cy.NEXT_SEASON_SALE || cy.next_season_sale) || 0) / divisor);
    const cyOldSeasonSale = Math.round((Number(cy.OLD_SEASON_SALE || cy.old_season_sale) || 0) / divisor);
    const cyStagnantSale = Math.round((Number(cy.STAGNANT_SALE || cy.stagnant_sale) || 0) / divisor);
    const cyTotalSale = Math.round((Number(cy.TOTAL_SALE || cy.total_sale) || 0) / divisor);
    
    // 전년 시즌별 매출액 (금액: 백만원 단위)
    const pyCurrentSeasonSale = Math.round((Number(py?.CURRENT_SEASON_SALE || py?.current_season_sale) || 0) / divisor);
    const pyNextSeasonSale = Math.round((Number(py?.NEXT_SEASON_SALE || py?.next_season_sale) || 0) / divisor);
    const pyOldSeasonSale = Math.round((Number(py?.OLD_SEASON_SALE || py?.old_season_sale) || 0) / divisor);
    const pyStagnantSale = Math.round((Number(py?.STAGNANT_SALE || py?.stagnant_sale) || 0) / divisor);
    const pyTotalSale = Math.round((Number(py?.TOTAL_SALE || py?.total_sale) || 0) / divisor);
    
    // 재고택금액 YOY 계산 (당년 / 전년 * 100)
    const stockYOY = pyTotalStock !== 0 
      ? Math.round((cyTotalStock / pyTotalStock) * 1000) / 10 
      : 0;
    
    // 택매출 YOY 계산 (당년택매출 / 전년택매출 * 100)
    const saleYOY = pyTotalSale !== 0 
      ? Math.round((cyTotalSale / pyTotalSale) * 1000) / 10 
      : 0;
    
    // 당년 비율 계산 (전체 재고 중 각 카테고리 비율)
    const cyCurrentSeasonRatio = cyTotalStock > 0 
      ? Math.round((cyCurrentSeasonStock / cyTotalStock) * 100) 
      : 0;
    const cyNextSeasonRatio = cyTotalStock > 0 
      ? Math.round((cyNextSeasonStock / cyTotalStock) * 100) 
      : 0;
    const cyOldSeasonRatio = cyTotalStock > 0 
      ? Math.round((cyOldSeasonStock / cyTotalStock) * 100) 
      : 0;
    const cyStagnantRatio = cyTotalStock > 0 
      ? Math.round((cyStagnantStock / cyTotalStock) * 100) 
      : 0;
    
    // 전년 비율 계산
    const pyCurrentSeasonRatio = pyTotalStock > 0 
      ? Math.round((pyCurrentSeasonStock / pyTotalStock) * 100) 
      : 0;
    const pyNextSeasonRatio = pyTotalStock > 0 
      ? Math.round((pyNextSeasonStock / pyTotalStock) * 100) 
      : 0;
    const pyOldSeasonRatio = pyTotalStock > 0 
      ? Math.round((pyOldSeasonStock / pyTotalStock) * 100) 
      : 0;
    const pyStagnantRatio = pyTotalStock > 0 
      ? Math.round((pyStagnantStock / pyTotalStock) * 100) 
      : 0;
    
    // 당년 매출액 비율 계산 (전체 매출액 중 각 카테고리 비율)
    const cyCurrentSeasonSaleRatio = cyTotalSale > 0 
      ? Math.round((cyCurrentSeasonSale / cyTotalSale) * 100) 
      : 0;
    const cyNextSeasonSaleRatio = cyTotalSale > 0 
      ? Math.round((cyNextSeasonSale / cyTotalSale) * 100) 
      : 0;
    const cyOldSeasonSaleRatio = cyTotalSale > 0 
      ? Math.round((cyOldSeasonSale / cyTotalSale) * 100) 
      : 0;
    const cyStagnantSaleRatio = cyTotalSale > 0 
      ? Math.round((cyStagnantSale / cyTotalSale) * 100) 
      : 0;
    
    return {
      month: `${year}-${monthStr}`,
      stockWeeks: Number(cy.STOCK_WEEKS || cy.stock_weeks) || 0,
      previousStockWeeks: Number(py?.STOCK_WEEKS || py?.stock_weeks) || 0,
      // 정상재고 재고주수 추가 (전체 - 정체재고)
      stockWeeksNormal: Number(cy.NORMAL_STOCK_WEEKS || cy.normal_stock_weeks) || 0,
      previousStockWeeksNormal: Number(py?.NORMAL_STOCK_WEEKS || py?.normal_stock_weeks) || 0,
      // 당년 시즌별 재고택금액
      currentSeasonStock: cyCurrentSeasonStock,
      nextSeasonStock: cyNextSeasonStock,
      oldSeasonStock: cyOldSeasonStock,
      stagnantStock: cyStagnantStock,
      totalStock: cyTotalStock,
      // 전월 재고 (입고금액 계산용)
      previousMonthTotalStock: prevMonthTotalStock,
      // 전년 시즌별 재고택금액
      previousCurrentSeasonStock: pyCurrentSeasonStock,
      previousNextSeasonStock: pyNextSeasonStock,
      previousOldSeasonStock: pyOldSeasonStock,
      previousStagnantStock: pyStagnantStock,
      previousTotalStock: pyTotalStock,
      // 당년 비율 (%)
      currentSeasonRatio: cyCurrentSeasonRatio,
      nextSeasonRatio: cyNextSeasonRatio,
      oldSeasonRatio: cyOldSeasonRatio,
      stagnantRatio: cyStagnantRatio,
      // 전년 비율 (%)
      previousCurrentSeasonRatio: pyCurrentSeasonRatio,
      previousNextSeasonRatio: pyNextSeasonRatio,
      previousOldSeasonRatio: pyOldSeasonRatio,
      previousStagnantRatio: pyStagnantRatio,
      // YOY
      stockYOY: stockYOY,
      saleYOY: saleYOY,
      // 당년 시즌별 매출액
      currentSeasonSale: cyCurrentSeasonSale,
      nextSeasonSale: cyNextSeasonSale,
      oldSeasonSale: cyOldSeasonSale,
      stagnantSale: cyStagnantSale,
      totalSale: cyTotalSale,
      // 전년 시즌별 매출액
      previousCurrentSeasonSale: pyCurrentSeasonSale,
      previousNextSeasonSale: pyNextSeasonSale,
      previousOldSeasonSale: pyOldSeasonSale,
      previousStagnantSale: pyStagnantSale,
      previousTotalSale: pyTotalSale,
      // 당년 매출액 비율 (%)
      currentSeasonSaleRatio: cyCurrentSeasonSaleRatio,
      nextSeasonSaleRatio: cyNextSeasonSaleRatio,
      oldSeasonSaleRatio: cyOldSeasonSaleRatio,
      stagnantSaleRatio: cyStagnantSaleRatio
    };
  });
  
  // 첫 월(13개월 전)은 전월 재고 계산용이므로 제외하고 12개월만 반환
  return chartData.slice(1);
}
