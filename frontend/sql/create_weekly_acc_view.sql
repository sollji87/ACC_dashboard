-- =====================================================
-- 주차별 악세사리 재고/매출 집계 뷰 생성
-- Snowflake에서 실행해주세요
-- =====================================================

-- 1. 주차별 악세사리 재고 집계 뷰
CREATE OR REPLACE VIEW fnf.prcs.v_weekly_acc_stock AS
WITH sunday AS (
  SELECT
    d::date AS asof_dt,
    TO_CHAR(d::date, 'YYYY') AS yyyy,
    LPAD(WEEKOFYEAR(d::date)::STRING, 2, '0') AS ww,
    TO_CHAR(d::date, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(d::date)::STRING, 2, '0') AS week_key,
    WEEKOFYEAR(d::date) AS week_num
  FROM (
    SELECT DATEADD(DAY, seq4(), DATE '2024-01-01') AS d
    FROM TABLE(GENERATOR(ROWCOUNT => 800))
  )
  WHERE d::date BETWEEN DATE '2024-01-01' AND CURRENT_DATE()
    AND DAYOFWEEKISO(d::date) = 7
),
prdt AS (
  SELECT prdt_cd, vtext1 AS prdt_hrrc1_nm, vtext2 AS prdt_hrrc2_nm
  FROM sap_fnf.mst_prdt
  WHERE vtext1 = 'ACC'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
)
SELECT
  s.asof_dt,
  s.yyyy,
  s.ww,
  s.week_key,
  s.week_num,
  a.brd_cd,
  p.prdt_hrrc2_nm,
  SUM(a.stock_tag_amt) AS stock_tag_amt,
  SUM(a.stock_qty) AS stock_qty
FROM sunday s
JOIN prcs.dw_scs_dacum a
  ON s.asof_dt BETWEEN TO_DATE(a.start_dt) AND TO_DATE(a.end_dt)
INNER JOIN prdt p ON a.prdt_cd = p.prdt_cd
WHERE a.brd_cd IN ('M', 'I', 'X', 'V', 'ST')
GROUP BY
  s.asof_dt,
  s.yyyy,
  s.ww,
  s.week_key,
  s.week_num,
  a.brd_cd,
  p.prdt_hrrc2_nm
HAVING SUM(a.stock_tag_amt) <> 0;

-- 2. 주차별 악세사리 매출 집계 뷰 (최근 4주 매출 포함)
CREATE OR REPLACE VIEW fnf.prcs.v_weekly_acc_sale AS
WITH prdt AS (
  SELECT prdt_cd, vtext1 AS prdt_hrrc1_nm, vtext2 AS prdt_hrrc2_nm
  FROM sap_fnf.mst_prdt
  WHERE vtext1 = 'ACC'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY prdt_cd ORDER BY prdt_cd) = 1
),
weekly_sale AS (
  SELECT
    s.end_dt,
    YEAR(s.end_dt) AS yyyy,
    WEEKOFYEAR(s.end_dt) AS week_num,
    TO_CHAR(s.end_dt, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(s.end_dt)::STRING, 2, '0') AS week_key,
    s.brd_cd,
    p.prdt_hrrc2_nm,
    SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) AS sale_tag_amt
  FROM fnf.prcs.db_scs_w s
  INNER JOIN prdt p ON s.prdt_cd = p.prdt_cd
  WHERE s.brd_cd IN ('M', 'I', 'X', 'V', 'ST')
    AND s.end_dt >= DATE '2024-01-01'
  GROUP BY
    s.end_dt,
    YEAR(s.end_dt),
    WEEKOFYEAR(s.end_dt),
    TO_CHAR(s.end_dt, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(s.end_dt)::STRING, 2, '0'),
    s.brd_cd,
    p.prdt_hrrc2_nm
  HAVING SUM(COALESCE(s.sale_nml_tag_amt_cns, 0) + COALESCE(s.sale_ret_tag_amt_cns, 0)) <> 0
)
SELECT * FROM weekly_sale;

-- 3. 주차별 악세사리 재고/매출 통합 뷰 (대시보드용)
CREATE OR REPLACE VIEW fnf.prcs.v_weekly_acc_dashboard AS
WITH stock AS (
  SELECT 
    week_key,
    asof_dt,
    yyyy,
    week_num,
    brd_cd,
    prdt_hrrc2_nm,
    stock_tag_amt
  FROM fnf.prcs.v_weekly_acc_stock
),
-- 최근 4주 매출 합계 계산
sale_4w AS (
  SELECT
    s1.week_key,
    s1.brd_cd,
    s1.prdt_hrrc2_nm,
    SUM(s2.sale_tag_amt) AS sale_4w_amt
  FROM fnf.prcs.v_weekly_acc_sale s1
  JOIN fnf.prcs.v_weekly_acc_sale s2
    ON s1.brd_cd = s2.brd_cd
    AND s1.prdt_hrrc2_nm = s2.prdt_hrrc2_nm
    AND s2.end_dt <= s1.end_dt
    AND s2.end_dt > DATEADD(WEEK, -4, s1.end_dt)
  GROUP BY s1.week_key, s1.brd_cd, s1.prdt_hrrc2_nm
)
SELECT
  st.week_key,
  st.asof_dt,
  st.yyyy,
  st.week_num,
  st.brd_cd,
  st.prdt_hrrc2_nm,
  st.stock_tag_amt,
  COALESCE(sa.sale_4w_amt, 0) AS sale_4w_amt,
  CASE 
    WHEN COALESCE(sa.sale_4w_amt, 0) > 0 
    THEN ROUND(st.stock_tag_amt / (sa.sale_4w_amt / 4), 1)
    ELSE 0 
  END AS stock_weeks
FROM stock st
LEFT JOIN sale_4w sa
  ON st.week_key = sa.week_key
  AND st.brd_cd = sa.brd_cd
  AND st.prdt_hrrc2_nm = sa.prdt_hrrc2_nm;

-- =====================================================
-- 사용 예시
-- =====================================================

-- 특정 주차, 특정 브랜드의 중분류별 재고/매출 조회
-- SELECT * FROM fnf.prcs.v_weekly_acc_dashboard
-- WHERE week_key = '2025-W51' AND brd_cd = 'M';

-- 최근 12주 데이터 조회
-- SELECT * FROM fnf.prcs.v_weekly_acc_dashboard
-- WHERE brd_cd = 'M'
-- ORDER BY asof_dt DESC
-- LIMIT 100;

