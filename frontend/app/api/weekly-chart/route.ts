import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';
import { parseWeekValue } from '@/lib/week-utils';

// 브랜드 코드 매핑
const BRAND_CODE_MAP: Record<string, string> = {
  'mlb': 'M',
  'mlb-kids': 'I',
  'discovery': 'X',
  'duvetica': 'V',
  'sergio-tacchini': 'ST',
};

// 아이템 필터 매핑 (prdt CTE에서 vtext2를 prdt_hrrc2_nm으로 alias함)
// vtext2 값: Shoes, Headwear, Bag, Acc_etc, [X]ACC, null
const ITEM_FILTER_MAP: Record<string, string> = {
  'all': '',  // 전체
  'shoes': "AND p.prdt_hrrc2_nm = 'Shoes'",
  'hat': "AND p.prdt_hrrc2_nm = 'Headwear'",
  'bag': "AND p.prdt_hrrc2_nm = 'Bag'",
  'other': "AND (p.prdt_hrrc2_nm NOT IN ('Shoes', 'Headwear', 'Bag') OR p.prdt_hrrc2_nm IS NULL)",
};

// 최적화된 차트 쿼리 - 최근 12주 재고주수 추이 + 시즌별 분류
function buildOptimizedChartQuery(brandCode: string, weeksForSale: number, selectedItem: string = 'all'): string {
  const itemFilter = ITEM_FILTER_MAP[selectedItem] || '';
  
  return `
    WITH prdt AS (
      SELECT prdt_cd, vtext2 AS prdt_hrrc2_nm, sesn
      FROM sap_fnf.mst_prdt
      WHERE vtext1 = 'ACC'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
    ),
    -- 최근 12주 종료일 목록 (매출 테이블에서 직접 조회)
    all_weeks AS (
      SELECT DISTINCT end_dt
      FROM fnf.prcs.db_sh_s_w
      WHERE end_dt <= CURRENT_DATE()
        AND end_dt >= DATEADD(WEEK, -14, CURRENT_DATE())
    ),
    recent_weeks AS (
      SELECT 
        end_dt,
        YEAR(end_dt) AS yyyy,
        MONTH(end_dt) AS mm,
        WEEKOFYEAR(end_dt) AS week_num,
        TO_CHAR(end_dt, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(end_dt)::STRING, 2, '0') AS week_key,
        ROW_NUMBER() OVER (ORDER BY end_dt DESC) AS week_rank
      FROM all_weeks
      QUALIFY week_rank <= 12
    ),
    -- 전년 동주차 매핑
    week_mapping AS (
      SELECT 
        rw.end_dt AS cy_end_dt,
        rw.week_key AS cy_week_key,
        rw.week_num,
        rw.yyyy AS cy_year,
        rw.mm AS cy_month,
        -- 전년 동주차 종료일 찾기
        (SELECT MIN(end_dt) FROM fnf.prcs.db_sh_s_w 
         WHERE YEAR(end_dt) = rw.yyyy - 1 AND WEEKOFYEAR(end_dt) = rw.week_num) AS py_end_dt
      FROM recent_weeks rw
    ),
    -- 당년 재고 (금액 + 수량) - 시즌별 분류 포함
    cy_stock_detail AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.cy_end_dt AS asof_dt,
        wm.week_num,
        wm.cy_month,
        a.prdt_cd,
        a.color_cd,
        p.sesn,
        SUBSTRING(p.sesn, 3, 1) AS sesn_type,  -- S, F, N 등
        SUM(a.stock_tag_amt) AS stock_tag_amt,
        SUM(a.stock_qty) AS stock_qty
      FROM week_mapping wm
      JOIN prcs.dw_scs_dacum a
        ON wm.cy_end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
        ${itemFilter}
      GROUP BY wm.cy_week_key, wm.cy_end_dt, wm.week_num, wm.cy_month, a.prdt_cd, a.color_cd, p.sesn
    ),
    -- 당년 4주 매출 (정체재고 계산용) - 품번+컬러별
    cy_sale_by_color AS (
      SELECT
        wm.cy_week_key AS week_key,
        s.prdt_cd,
        s.color_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt
      FROM week_mapping wm
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wm.cy_end_dt
        AND s.end_dt > DATEADD(WEEK, -4, wm.cy_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        ${itemFilter}
      GROUP BY wm.cy_week_key, s.prdt_cd, s.color_cd
    ),
    -- 주차별 전체 재고 합계 (정체재고 threshold 계산용)
    cy_total_by_week AS (
      SELECT week_key, SUM(stock_tag_amt) AS total_stock
      FROM cy_stock_detail
      GROUP BY week_key
    ),
    -- 시즌 분류 + 정체재고 판정 (월별과 동일한 로직)
    -- 당시즌/차기시즌/과시즌/정체재고 정의:
    -- FW 시즌 (9월~2월): 당시즌=YYN,YYF / 차기시즌=(YY+1)N,(YY+1)S,(YY+1)F... / 과시즌=그 외
    -- SS 시즌 (3월~8월): 당시즌=YYN,YYS / 차기시즌=YYF,(YY+1)N,(YY+1)S... / 과시즌=그 외
    -- 정체재고: 과시즌 중 품번+컬러 기준 4주 판매가 택재고의 0.01% 미만
    cy_classified AS (
      SELECT
        sd.week_key,
        sd.asof_dt,
        sd.week_num,
        sd.cy_month,
        sd.stock_tag_amt,
        sd.stock_qty,
        sd.sesn,
        -- 연도 2자리 추출 (예: 2025 -> 25)
        SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT AS current_year,
        -- 시즌 분류 (월별과 동일한 로직)
        CASE 
          -- FW 시즌 (9월~2월)
          WHEN sd.cy_month >= 9 OR sd.cy_month <= 2 THEN
            CASE 
              -- 당시즌: YYN, YYF
              WHEN sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'N%' 
                OR sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'F%' THEN 'current'
              -- 차기시즌: (YY+1)N, (YY+1)S, (YY+1)F, (YY+2)N, (YY+2)S
              WHEN sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
          -- SS 시즌 (3월~8월)
          ELSE
            CASE 
              -- 당시즌: YYN, YYS
              WHEN sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'N%' 
                OR sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'S%' THEN 'current'
              -- 차기시즌: YYF, (YY+1)N, (YY+1)S, (YY+1)F, (YY+2)N, (YY+2)S
              WHEN sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'F%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
        END AS season_class,
        -- 정체재고 판정: 과시즌 중에서만 4주 매출이 택재고의 0.01% 미만인 경우
        -- 먼저 과시즌인지 확인하고, 과시즌인 경우에만 판매 조건 체크
        COALESCE(sc.sale_amt, 0) AS sale_amt_for_stagnant,
        tw.total_stock * 0.0001 AS threshold_amt
      FROM cy_stock_detail sd
      LEFT JOIN cy_sale_by_color sc 
        ON sd.week_key = sc.week_key AND sd.prdt_cd = sc.prdt_cd AND sd.color_cd = sc.color_cd
      LEFT JOIN cy_total_by_week tw ON sd.week_key = tw.week_key
    ),
    -- 정체재고 최종 판정 (과시즌 중에서만)
    cy_with_stagnant AS (
      SELECT
        week_key,
        asof_dt,
        week_num,
        cy_month,
        stock_tag_amt,
        stock_qty,
        season_class,
        sale_amt_for_stagnant,
        -- 정체재고: 과시즌(old)이면서 판매 < 0.01%인 경우만
        CASE 
          WHEN season_class = 'old' AND sale_amt_for_stagnant < threshold_amt THEN 1
          ELSE 0
        END AS is_stagnant
      FROM cy_classified
    ),
    -- 당년 시즌별 집계 (재고 + 정체재고 매출 포함)
    cy_season_agg AS (
      SELECT
        week_key,
        asof_dt,
        week_num,
        SUM(stock_tag_amt) AS total_stock,
        SUM(stock_qty) AS total_qty,
        SUM(CASE WHEN season_class = 'current' THEN stock_tag_amt ELSE 0 END) AS current_season_stock,
        SUM(CASE WHEN season_class = 'next' THEN stock_tag_amt ELSE 0 END) AS next_season_stock,
        SUM(CASE WHEN season_class = 'old' AND is_stagnant = 0 THEN stock_tag_amt ELSE 0 END) AS old_season_stock,
        SUM(CASE WHEN is_stagnant = 1 THEN stock_tag_amt ELSE 0 END) AS stagnant_stock,
        -- 정체재고 매출 (품번+컬러별 4주 매출 합산)
        SUM(CASE WHEN is_stagnant = 1 THEN sale_amt_for_stagnant ELSE 0 END) AS stagnant_sale
      FROM cy_with_stagnant
      GROUP BY week_key, asof_dt, week_num
    ),
    -- 전년 재고 (금액 + 수량) - 시즌별 분류 포함
    py_stock_detail AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.py_end_dt AS asof_dt,
        wm.week_num,
        MONTH(wm.py_end_dt) AS py_month,
        a.prdt_cd,
        a.color_cd,
        p.sesn,
        SUBSTRING(p.sesn, 3, 1) AS sesn_type,
        SUM(a.stock_tag_amt) AS stock_tag_amt,
        SUM(a.stock_qty) AS stock_qty
      FROM week_mapping wm
      JOIN prcs.dw_scs_dacum a
        ON wm.py_end_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
      INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
      WHERE a.brd_cd = '${brandCode}'
        AND wm.py_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY wm.cy_week_key, wm.py_end_dt, wm.week_num, a.prdt_cd, a.color_cd, p.sesn
    ),
    -- 전년 4주 매출 (정체재고 계산용)
    py_sale_by_color AS (
      SELECT
        wm.cy_week_key AS week_key,
        s.prdt_cd,
        s.color_cd,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt
      FROM week_mapping wm
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wm.py_end_dt
        AND s.end_dt > DATEADD(WEEK, -4, wm.py_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        AND wm.py_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY wm.cy_week_key, s.prdt_cd, s.color_cd
    ),
    py_total_by_week AS (
      SELECT week_key, SUM(stock_tag_amt) AS total_stock
      FROM py_stock_detail
      GROUP BY week_key
    ),
    -- 전년 시즌 분류 + 정체재고 판정 (월별과 동일한 로직)
    py_classified AS (
      SELECT
        sd.week_key,
        sd.asof_dt,
        sd.week_num,
        sd.py_month,
        sd.stock_tag_amt,
        sd.stock_qty,
        sd.sesn,
        -- 시즌 분류 (월별과 동일한 로직 - 전년 기준)
        CASE 
          -- FW 시즌 (9월~2월)
          WHEN sd.py_month >= 9 OR sd.py_month <= 2 THEN
            CASE 
              -- 당시즌: YYN, YYF (전년 기준)
              WHEN sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'N%' 
                OR sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'F%' THEN 'current'
              -- 차기시즌
              WHEN sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
          -- SS 시즌 (3월~8월)
          ELSE
            CASE 
              -- 당시즌: YYN, YYS
              WHEN sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'N%' 
                OR sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'S%' THEN 'current'
              -- 차기시즌
              WHEN sd.sesn LIKE SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2) || 'F%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR sd.sesn LIKE LPAD((SUBSTRING(TO_CHAR(sd.asof_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
        END AS season_class,
        COALESCE(sc.sale_amt, 0) AS sale_amt_for_stagnant,
        tw.total_stock * 0.0001 AS threshold_amt
      FROM py_stock_detail sd
      LEFT JOIN py_sale_by_color sc 
        ON sd.week_key = sc.week_key AND sd.prdt_cd = sc.prdt_cd AND sd.color_cd = sc.color_cd
      LEFT JOIN py_total_by_week tw ON sd.week_key = tw.week_key
    ),
    -- 전년 정체재고 최종 판정 (과시즌 중에서만)
    py_with_stagnant AS (
      SELECT
        week_key,
        asof_dt,
        week_num,
        py_month,
        stock_tag_amt,
        stock_qty,
        season_class,
        sale_amt_for_stagnant,
        CASE 
          WHEN season_class = 'old' AND sale_amt_for_stagnant < threshold_amt THEN 1
          ELSE 0
        END AS is_stagnant
      FROM py_classified
    ),
    py_season_agg AS (
      SELECT
        week_key,
        asof_dt,
        week_num,
        SUM(stock_tag_amt) AS total_stock,
        SUM(stock_qty) AS total_qty,
        SUM(CASE WHEN season_class = 'current' THEN stock_tag_amt ELSE 0 END) AS current_season_stock,
        SUM(CASE WHEN season_class = 'next' THEN stock_tag_amt ELSE 0 END) AS next_season_stock,
        SUM(CASE WHEN season_class = 'old' AND is_stagnant = 0 THEN stock_tag_amt ELSE 0 END) AS old_season_stock,
        SUM(CASE WHEN is_stagnant = 1 THEN stock_tag_amt ELSE 0 END) AS stagnant_stock,
        -- 전년 정체재고 매출
        SUM(CASE WHEN is_stagnant = 1 THEN sale_amt_for_stagnant ELSE 0 END) AS stagnant_sale
      FROM py_with_stagnant
      GROUP BY week_key, asof_dt, week_num
    ),
    -- 당년 1주 매출 (해당 주차만) - 시즌별 분류 포함
    cy_sale_1w_detail AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.cy_end_dt AS asof_dt,
        wm.cy_month,
        p.sesn,
        CASE 
          WHEN wm.cy_month >= 9 OR wm.cy_month <= 2 THEN
            CASE 
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'N%' 
                OR p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'F%' THEN 'current'
              WHEN p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
          ELSE
            CASE 
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'N%' 
                OR p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'S%' THEN 'current'
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
        END AS season_class,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_mapping wm
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt = wm.cy_end_dt  -- 해당 주차만 (1주)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        ${itemFilter}
      GROUP BY wm.cy_week_key, wm.cy_end_dt, wm.cy_month, p.sesn
    ),
    cy_sale_1w AS (
      SELECT
        week_key,
        asof_dt,
        SUM(sale_amt) AS sale_amt_1w,
        SUM(sale_qty) AS sale_qty_1w,
        SUM(CASE WHEN season_class = 'current' THEN sale_amt ELSE 0 END) AS current_season_sale_1w,
        SUM(CASE WHEN season_class = 'next' THEN sale_amt ELSE 0 END) AS next_season_sale_1w,
        SUM(CASE WHEN season_class = 'old' THEN sale_amt ELSE 0 END) AS old_season_sale_1w
      FROM cy_sale_1w_detail
      GROUP BY week_key, asof_dt
    ),
    -- 당년 N주 매출 (전체 + 시즌별) - 월별과 동일한 시즌 분류
    cy_sale_detail AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.cy_end_dt AS asof_dt,
        wm.cy_month,
        p.sesn,
        -- 시즌 분류 (월별과 동일한 로직)
        CASE 
          -- FW 시즌 (9월~2월)
          WHEN wm.cy_month >= 9 OR wm.cy_month <= 2 THEN
            CASE 
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'N%' 
                OR p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'F%' THEN 'current'
              WHEN p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
          -- SS 시즌 (3월~8월)
          ELSE
            CASE 
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'N%' 
                OR p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'S%' THEN 'current'
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2) || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.cy_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
        END AS season_class,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_mapping wm
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wm.cy_end_dt
        AND s.end_dt > DATEADD(WEEK, -${weeksForSale}, wm.cy_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        ${itemFilter}
      GROUP BY wm.cy_week_key, wm.cy_end_dt, wm.cy_month, p.sesn
    ),
    cy_sale AS (
      SELECT
        week_key,
        asof_dt,
        SUM(sale_amt) AS sale_amt,
        SUM(sale_qty) AS sale_qty,
        -- 시즌별 매출 (월별과 동일한 시즌 분류)
        SUM(CASE WHEN season_class = 'current' THEN sale_amt ELSE 0 END) AS current_season_sale,
        SUM(CASE WHEN season_class = 'next' THEN sale_amt ELSE 0 END) AS next_season_sale,
        SUM(CASE WHEN season_class = 'old' THEN sale_amt ELSE 0 END) AS old_season_sale
      FROM cy_sale_detail
      GROUP BY week_key, asof_dt
    ),
    -- 전년 1주 매출 (해당 주차만) - 시즌별 분류 포함
    py_sale_1w_detail AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.cy_end_dt AS asof_dt,
        MONTH(wm.py_end_dt) AS py_month,
        p.sesn,
        CASE 
          WHEN MONTH(wm.py_end_dt) >= 9 OR MONTH(wm.py_end_dt) <= 2 THEN
            CASE 
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'N%' 
                OR p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'F%' THEN 'current'
              WHEN p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
          ELSE
            CASE 
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'N%' 
                OR p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'S%' THEN 'current'
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
        END AS season_class,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_mapping wm
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt = wm.py_end_dt  -- 전년 해당 주차만 (1주)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        AND wm.py_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY wm.cy_week_key, wm.cy_end_dt, wm.py_end_dt, p.sesn
    ),
    py_sale_1w AS (
      SELECT
        week_key,
        asof_dt,
        SUM(sale_amt) AS sale_amt_1w,
        SUM(sale_qty) AS sale_qty_1w,
        SUM(CASE WHEN season_class = 'current' THEN sale_amt ELSE 0 END) AS current_season_sale_1w,
        SUM(CASE WHEN season_class = 'next' THEN sale_amt ELSE 0 END) AS next_season_sale_1w,
        SUM(CASE WHEN season_class = 'old' THEN sale_amt ELSE 0 END) AS old_season_sale_1w
      FROM py_sale_1w_detail
      GROUP BY week_key, asof_dt
    ),
    -- 전년 N주 매출 (전체 + 시즌별) - 월별과 동일한 시즌 분류
    py_sale_detail AS (
      SELECT
        wm.cy_week_key AS week_key,
        wm.cy_end_dt AS asof_dt,
        MONTH(wm.py_end_dt) AS py_month,
        p.sesn,
        -- 시즌 분류 (월별과 동일한 로직 - 전년 기준)
        CASE 
          -- FW 시즌 (9월~2월)
          WHEN MONTH(wm.py_end_dt) >= 9 OR MONTH(wm.py_end_dt) <= 2 THEN
            CASE 
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'N%' 
                OR p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'F%' THEN 'current'
              WHEN p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
          -- SS 시즌 (3월~8월)
          ELSE
            CASE 
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'N%' 
                OR p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'S%' THEN 'current'
              WHEN p.sesn LIKE SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2) || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'S%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 1)::VARCHAR, 2, '0') || 'F%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'N%'
                OR p.sesn LIKE LPAD((SUBSTRING(TO_CHAR(wm.py_end_dt, 'YY'), 1, 2)::INT + 2)::VARCHAR, 2, '0') || 'S%' THEN 'next'
              ELSE 'old'
            END
        END AS season_class,
        SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_amt,
        SUM(COALESCE(s.sale_nml_qty_cns, 0) + COALESCE(s.sale_ret_qty_cns, 0)) AS sale_qty
      FROM week_mapping wm
      JOIN fnf.prcs.db_scs_w s
        ON s.end_dt <= wm.py_end_dt
        AND s.end_dt > DATEADD(WEEK, -${weeksForSale}, wm.py_end_dt)
      INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
      WHERE s.brd_cd = '${brandCode}'
        AND wm.py_end_dt IS NOT NULL
        ${itemFilter}
      GROUP BY wm.cy_week_key, wm.cy_end_dt, wm.py_end_dt, p.sesn
    ),
    py_sale AS (
      SELECT
        week_key,
        asof_dt,
        SUM(sale_amt) AS sale_amt,
        SUM(sale_qty) AS sale_qty,
        -- 시즌별 매출 (월별과 동일한 시즌 분류)
        SUM(CASE WHEN season_class = 'current' THEN sale_amt ELSE 0 END) AS current_season_sale,
        SUM(CASE WHEN season_class = 'next' THEN sale_amt ELSE 0 END) AS next_season_sale,
        SUM(CASE WHEN season_class = 'old' THEN sale_amt ELSE 0 END) AS old_season_sale
      FROM py_sale_detail
      GROUP BY week_key, asof_dt
    )
    SELECT
      cs.week_key,
      cs.asof_dt,
      cs.week_num,
      -- 금액 (백만원)
      ROUND(cs.total_stock / 1000000, 0) AS cy_stock_million,
      ROUND(COALESCE(ps.total_stock, 0) / 1000000, 0) AS py_stock_million,
      ROUND(COALESCE(csa.sale_amt, 0) / 1000000, 0) AS cy_sale_million,
      ROUND(COALESCE(psa.sale_amt, 0) / 1000000, 0) AS py_sale_million,
      -- 수량
      cs.total_qty AS cy_stock_qty,
      COALESCE(ps.total_qty, 0) AS py_stock_qty,
      COALESCE(csa.sale_qty, 0) AS cy_sale_qty,
      COALESCE(psa.sale_qty, 0) AS py_sale_qty,
      -- 시즌별 당년 재고 (백만원)
      ROUND(cs.current_season_stock / 1000000, 0) AS cy_current_season,
      ROUND(cs.next_season_stock / 1000000, 0) AS cy_next_season,
      ROUND(cs.old_season_stock / 1000000, 0) AS cy_old_season,
      ROUND(cs.stagnant_stock / 1000000, 0) AS cy_stagnant,
      -- 시즌별 전년 재고 (백만원)
      ROUND(COALESCE(ps.current_season_stock, 0) / 1000000, 0) AS py_current_season,
      ROUND(COALESCE(ps.next_season_stock, 0) / 1000000, 0) AS py_next_season,
      ROUND(COALESCE(ps.old_season_stock, 0) / 1000000, 0) AS py_old_season,
      ROUND(COALESCE(ps.stagnant_stock, 0) / 1000000, 0) AS py_stagnant,
      -- 시즌별 당년 매출 (백만원)
      ROUND(COALESCE(csa.current_season_sale, 0) / 1000000, 0) AS cy_current_season_sale,
      ROUND(COALESCE(csa.next_season_sale, 0) / 1000000, 0) AS cy_next_season_sale,
      ROUND(COALESCE(csa.old_season_sale, 0) / 1000000, 0) AS cy_old_season_sale,
      ROUND(COALESCE(cs.stagnant_sale, 0) / 1000000, 0) AS cy_stagnant_sale,
      -- 시즌별 전년 매출 (백만원)
      ROUND(COALESCE(psa.current_season_sale, 0) / 1000000, 0) AS py_current_season_sale,
      ROUND(COALESCE(psa.next_season_sale, 0) / 1000000, 0) AS py_next_season_sale,
      ROUND(COALESCE(psa.old_season_sale, 0) / 1000000, 0) AS py_old_season_sale,
      ROUND(COALESCE(ps.stagnant_sale, 0) / 1000000, 0) AS py_stagnant_sale,
      -- 1주 매출 (해당 주차만, 백만원)
      ROUND(COALESCE(csa1w.sale_amt_1w, 0) / 1000000, 0) AS cy_sale_1w_million,
      ROUND(COALESCE(psa1w.sale_amt_1w, 0) / 1000000, 0) AS py_sale_1w_million,
      -- 시즌별 1주 매출 (백만원)
      ROUND(COALESCE(csa1w.current_season_sale_1w, 0) / 1000000, 0) AS cy_current_season_sale_1w,
      ROUND(COALESCE(csa1w.next_season_sale_1w, 0) / 1000000, 0) AS cy_next_season_sale_1w,
      ROUND(COALESCE(csa1w.old_season_sale_1w, 0) / 1000000, 0) AS cy_old_season_sale_1w,
      ROUND(COALESCE(psa1w.current_season_sale_1w, 0) / 1000000, 0) AS py_current_season_sale_1w,
      ROUND(COALESCE(psa1w.next_season_sale_1w, 0) / 1000000, 0) AS py_next_season_sale_1w,
      ROUND(COALESCE(psa1w.old_season_sale_1w, 0) / 1000000, 0) AS py_old_season_sale_1w,
      -- 재고주수 (금액기준)
      CASE WHEN COALESCE(csa.sale_amt, 0) > 0 
        THEN ROUND(cs.total_stock / (csa.sale_amt / ${weeksForSale}), 1)
        ELSE 0 END AS cy_weeks,
      CASE WHEN COALESCE(psa.sale_amt, 0) > 0 
        THEN ROUND(COALESCE(ps.total_stock, 0) / (psa.sale_amt / ${weeksForSale}), 1)
        ELSE 0 END AS py_weeks,
      -- 재고주수 (수량기준)
      CASE WHEN COALESCE(csa.sale_qty, 0) > 0 
        THEN ROUND(cs.total_qty / (csa.sale_qty / ${weeksForSale}), 1)
        ELSE 0 END AS cy_weeks_qty,
      CASE WHEN COALESCE(psa.sale_qty, 0) > 0 
        THEN ROUND(COALESCE(ps.total_qty, 0) / (psa.sale_qty / ${weeksForSale}), 1)
        ELSE 0 END AS py_weeks_qty
    FROM cy_season_agg cs
    LEFT JOIN py_season_agg ps ON cs.week_key = ps.week_key
    LEFT JOIN cy_sale csa ON cs.week_key = csa.week_key
    LEFT JOIN py_sale psa ON cs.week_key = psa.week_key
    LEFT JOIN cy_sale_1w csa1w ON cs.week_key = csa1w.week_key
    LEFT JOIN py_sale_1w psa1w ON cs.week_key = psa1w.week_key
    ORDER BY cs.asof_dt ASC
  `;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const brandId = searchParams.get('brandId');
  const weeksForSale = parseInt(searchParams.get('weeksForSale') || '4', 10);
  const selectedItem = (searchParams.get('selectedItem') || 'all') as 'all' | 'shoes' | 'hat' | 'bag' | 'other';

  if (!brandId) {
    return NextResponse.json(
      { error: 'brandId is required' },
      { status: 400 }
    );
  }

  const brandCode = BRAND_CODE_MAP[brandId];
  if (!brandCode) {
    return NextResponse.json(
      { error: `Unknown brand: ${brandId}` },
      { status: 400 }
    );
  }

  try {
    console.log('[weekly-chart] Executing optimized query for brand:', brandCode, 'weeksForSale:', weeksForSale, 'selectedItem:', selectedItem);
    
    const query = buildOptimizedChartQuery(brandCode, weeksForSale, selectedItem);
    const rows = await executeQuery(query);
    
    console.log('[weekly-chart] Query returned', rows.length, 'rows');
    
    // 첫 번째 행 데이터 확인 (디버깅용)
    if (rows.length > 0) {
      console.log('[weekly-chart] First row sample:', JSON.stringify(rows[0], null, 2));
    }

    // 데이터 포맷팅 (프론트엔드 필드명에 맞춤)
    const chartData = rows.map((row: any) => {
      const cyTotal = row.CY_STOCK_MILLION || 0;
      const pyTotal = row.PY_STOCK_MILLION || 0;
      const cyCurrent = row.CY_CURRENT_SEASON || 0;
      const cyNext = row.CY_NEXT_SEASON || 0;
      const cyOld = row.CY_OLD_SEASON || 0;
      const cyStagnant = row.CY_STAGNANT || 0;
      const pyCurrent = row.PY_CURRENT_SEASON || 0;
      const pyNext = row.PY_NEXT_SEASON || 0;
      const pyOld = row.PY_OLD_SEASON || 0;
      const pyStagnant = row.PY_STAGNANT || 0;
      
      // 비율 계산 (%)
      const cyCurrentRatio = cyTotal > 0 ? Math.round((cyCurrent / cyTotal) * 100) : 0;
      const cyNextRatio = cyTotal > 0 ? Math.round((cyNext / cyTotal) * 100) : 0;
      const cyOldRatio = cyTotal > 0 ? Math.round((cyOld / cyTotal) * 100) : 0;
      const cyStagnantRatio = cyTotal > 0 ? Math.round((cyStagnant / cyTotal) * 100) : 0;
      const pyCurrentRatio = pyTotal > 0 ? Math.round((pyCurrent / pyTotal) * 100) : 0;
      const pyNextRatio = pyTotal > 0 ? Math.round((pyNext / pyTotal) * 100) : 0;
      const pyOldRatio = pyTotal > 0 ? Math.round((pyOld / pyTotal) * 100) : 0;
      const pyStagnantRatio = pyTotal > 0 ? Math.round((pyStagnant / pyTotal) * 100) : 0;
      
      // YOY 계산
      const stockYOY = pyTotal > 0 ? Math.round((cyTotal / pyTotal) * 100) : 0;
      const saleYOY = (row.PY_SALE_MILLION || 0) > 0 
        ? Math.round(((row.CY_SALE_MILLION || 0) / row.PY_SALE_MILLION) * 100) : 0;
      
      return {
        weekKey: row.WEEK_KEY,
        weekLabel: `${row.WEEK_NUM}주차`,
        asofDate: row.ASOF_DT ? new Date(row.ASOF_DT).toISOString().split('T')[0] : '',
        // 재고금액 (백만원)
        totalStock: cyTotal,
        stockAmount: cyTotal,
        prevTotalStock: pyTotal,
        prevStockAmount: pyTotal,
        // 재고수량
        stockQty: row.CY_STOCK_QTY || 0,
        prevStockQty: row.PY_STOCK_QTY || 0,
        // 매출금액 N주 합계 (백만원)
        saleAmount: row.CY_SALE_MILLION || 0,
        prevSaleAmount: row.PY_SALE_MILLION || 0,
        // 1주 매출 (해당 주차만, 백만원)
        saleAmount1w: row.CY_SALE_1W_MILLION || 0,
        prevSaleAmount1w: row.PY_SALE_1W_MILLION || 0,
        // 시즌별 1주 매출
        currentSeasonSale1w: row.CY_CURRENT_SEASON_SALE_1W || 0,
        nextSeasonSale1w: row.CY_NEXT_SEASON_SALE_1W || 0,
        oldSeasonSale1w: row.CY_OLD_SEASON_SALE_1W || 0,
        // 정체재고 1주 매출: N주 매출에서 정체재고 비율을 적용
        stagnantSale1w: (() => {
          const totalNw = (row.CY_CURRENT_SEASON_SALE || 0) + (row.CY_NEXT_SEASON_SALE || 0) + (row.CY_OLD_SEASON_SALE || 0) + (row.CY_STAGNANT_SALE || 0);
          const stagnantRatio = totalNw > 0 ? ((row.CY_STAGNANT_SALE || 0) / totalNw) : 0;
          return Math.round((row.CY_SALE_1W_MILLION || 0) * stagnantRatio);
        })(),
        previousCurrentSeasonSale1w: row.PY_CURRENT_SEASON_SALE_1W || 0,
        previousNextSeasonSale1w: row.PY_NEXT_SEASON_SALE_1W || 0,
        previousOldSeasonSale1w: row.PY_OLD_SEASON_SALE_1W || 0,
        previousStagnantSale1w: (() => {
          const totalNw = (row.PY_CURRENT_SEASON_SALE || 0) + (row.PY_NEXT_SEASON_SALE || 0) + (row.PY_OLD_SEASON_SALE || 0) + (row.PY_STAGNANT_SALE || 0);
          const stagnantRatio = totalNw > 0 ? ((row.PY_STAGNANT_SALE || 0) / totalNw) : 0;
          return Math.round((row.PY_SALE_1W_MILLION || 0) * stagnantRatio);
        })(),
        // 매출수량
        saleQty: row.CY_SALE_QTY || 0,
        prevSaleQty: row.PY_SALE_QTY || 0,
        // 재고주수 (금액기준)
        weeks: row.CY_WEEKS || 0,
        prevWeeks: row.PY_WEEKS || 0,
        totalWeeks: row.CY_WEEKS || 0,
        prevTotalWeeks: row.PY_WEEKS || 0,
        // 정상재고 재고주수 (정체재고 제외)
        stockWeeksNormal: Math.round((row.CY_WEEKS || 0) * (1 - cyStagnantRatio / 100) * 10) / 10,
        previousStockWeeksNormal: Math.round((row.PY_WEEKS || 0) * (1 - pyStagnantRatio / 100) * 10) / 10,
        // 재고주수 (수량기준)
        weeksQty: row.CY_WEEKS_QTY || 0,
        prevWeeksQty: row.PY_WEEKS_QTY || 0,
        // 시즌별 당년 재고 (백만원)
        currentSeasonStock: cyCurrent,
        nextSeasonStock: cyNext,
        oldSeasonStock: cyOld,
        stagnantStock: cyStagnant,
        // 시즌별 전년 재고 (백만원)
        previousCurrentSeasonStock: pyCurrent,
        previousNextSeasonStock: pyNext,
        previousOldSeasonStock: pyOld,
        previousStagnantStock: pyStagnant,
        // 시즌별 비율 (%)
        currentSeasonRatio: cyCurrentRatio,
        nextSeasonRatio: cyNextRatio,
        oldSeasonRatio: cyOldRatio,
        stagnantRatio: cyStagnantRatio,
        previousCurrentSeasonRatio: pyCurrentRatio,
        previousNextSeasonRatio: pyNextRatio,
        previousOldSeasonRatio: pyOldRatio,
        previousStagnantRatio: pyStagnantRatio,
        // 시즌별 당년 매출 (백만원)
        currentSeasonSale: row.CY_CURRENT_SEASON_SALE || 0,
        nextSeasonSale: row.CY_NEXT_SEASON_SALE || 0,
        oldSeasonSale: row.CY_OLD_SEASON_SALE || 0,
        stagnantSale: row.CY_STAGNANT_SALE || 0,
        // 시즌별 전년 매출 (백만원)
        previousCurrentSeasonSale: row.PY_CURRENT_SEASON_SALE || 0,
        previousNextSeasonSale: row.PY_NEXT_SEASON_SALE || 0,
        previousOldSeasonSale: row.PY_OLD_SEASON_SALE || 0,
        previousStagnantSale: row.PY_STAGNANT_SALE || 0,
        // 시즌별 매출 비율 (%)
        currentSeasonSaleRatio: (row.CY_SALE_MILLION || 0) > 0 ? Math.round(((row.CY_CURRENT_SEASON_SALE || 0) / row.CY_SALE_MILLION) * 100) : 0,
        nextSeasonSaleRatio: (row.CY_SALE_MILLION || 0) > 0 ? Math.round(((row.CY_NEXT_SEASON_SALE || 0) / row.CY_SALE_MILLION) * 100) : 0,
        oldSeasonSaleRatio: (row.CY_SALE_MILLION || 0) > 0 ? Math.round(((row.CY_OLD_SEASON_SALE || 0) / row.CY_SALE_MILLION) * 100) : 0,
        stagnantSaleRatio: (row.CY_SALE_MILLION || 0) > 0 ? Math.round(((row.CY_STAGNANT_SALE || 0) / row.CY_SALE_MILLION) * 100) : 0,
        // YOY
        stockYOY,
        saleYOY,
      };
    });

    console.log('[weekly-chart] Formatted', chartData.length, 'chart data points');

    return NextResponse.json({
      success: true,
      brandId,
      brandCode,
      weeksForSale,
      selectedItem,
      data: chartData,
    });
  } catch (error) {
    console.error('[weekly-chart] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weekly chart data', details: String(error) },
      { status: 500 }
    );
  }
}
