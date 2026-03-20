import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';
import { ensureBrandCode, ensureWeekKey } from '@/lib/request-validation';

/**
 * 주차별 입고예정금액 조회 API (Snowflake 직접 연결)
 * GET /api/dashboard/incoming-amounts-weekly?brandCode=M&startWeek=2025-W48&endWeek=2026-W10
 */
export async function GET(request: NextRequest) {
  let connection = null;
  let retries = 0;
  const MAX_RETRIES = 2;

  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = ensureBrandCode(searchParams.get('brandCode'));
    const startWeek = ensureWeekKey(searchParams.get('startWeek'), 'startWeek');
    const endWeek = ensureWeekKey(searchParams.get('endWeek'), 'endWeek');

    // 주차 파싱
    const parseWeek = (weekStr: string) => {
      const match = weekStr.match(/(\d{4})-W?(\d{1,2})/);
      if (match) {
        return { year: parseInt(match[1]), week: parseInt(match[2]) };
      }
      return null;
    };

    const start = parseWeek(startWeek);
    const end = parseWeek(endWeek);

    if (!start || !end) {
      throw new Error('유효하지 않은 주차 형식입니다. (YYYY-WNN 형식 필요)');
    }

    while (retries <= MAX_RETRIES) {
      try {
        console.log(`📊 브랜드 ${brandCode} 주차별 입고예정금액 조회 시작 (${startWeek} ~ ${endWeek}) - 시도: ${retries + 1}`);
        connection = await connectToSnowflake();

        // 주차별 입고예정금액 조회 쿼리
        const sqlText = `
-- 주차별 발주 데이터 (합의납기일자 기준, 중분류별 집계)
WITH base AS (
    SELECT  
        a.brd_cd AS brd_cd,
        d.vtext2 AS mid_cat,
        a.indc_dt_cnfm AS indc_dt,
        TO_CHAR(a.indc_dt_cnfm, 'YYYY') || '-W' || LPAD(WEEKOFYEAR(a.indc_dt_cnfm)::STRING, 2, '0') AS indc_week,
        WEEKOFYEAR(a.indc_dt_cnfm) AS week_num,
        YEAR(a.indc_dt_cnfm) AS year_num,
        a.tag_price * a.ord_qty AS ord_amt
    FROM prcs.dw_ord a
    LEFT JOIN sap_fnf.mst_prdt d
      ON a.prdt_cd = d.prdt_cd
    WHERE 1 = 1
      AND a.brd_cd = :1
      AND d.vtext2 IN ('Acc_etc', 'Bag', 'Headwear', 'Shoes')
      AND a.PO_CLS_NM IN (
            '내수/원화/세금계산서/DDP',
            '한국수입/외화/세금계산서/FOB',
            '한국수입/외화/FOB'
      )
      AND a.indc_dt_cnfm IS NOT NULL
      AND (
        (YEAR(a.indc_dt_cnfm) = :2 AND WEEKOFYEAR(a.indc_dt_cnfm) >= :3)
        OR (YEAR(a.indc_dt_cnfm) > :2 AND YEAR(a.indc_dt_cnfm) < :4)
        OR (YEAR(a.indc_dt_cnfm) = :4 AND WEEKOFYEAR(a.indc_dt_cnfm) <= :5)
      )
)
SELECT  
    brd_cd AS "브랜드",
    CASE 
        WHEN mid_cat = 'Shoes' THEN '신발'
        WHEN mid_cat = 'Headwear' THEN '모자'
        WHEN mid_cat = 'Bag' THEN '가방'
        WHEN mid_cat = 'Acc_etc' THEN '기타ACC'
        ELSE '기타ACC'
    END AS "중분류",
    indc_week AS "입고주차",
    year_num AS "년도",
    week_num AS "주차번호",
    SUM(ord_amt) AS "발주금액"
FROM base
GROUP BY brd_cd, mid_cat, indc_week, year_num, week_num
ORDER BY year_num, week_num, mid_cat
`;

        const rows = await executeQuery(sqlText, connection, 0, [
          brandCode,
          start.year,
          start.week,
          end.year,
          end.week,
        ]);
        
        // 주차별 중분류별로 집계
        const weeklyData = aggregateIncomingAmountsByWeek(rows);

        console.log(`✅ 브랜드 ${brandCode} 주차별 입고예정금액 조회 성공: ${weeklyData.length}주 데이터`);

        return NextResponse.json({
          success: true,
          data: weeklyData,
        });
      } catch (error: any) {
        console.error(`❌ 주차별 입고예정금액 조회 실패 (시도: ${retries + 1}):`, error);
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
    console.error('❌ 주차별 입고예정금액 조회 실패:', error);
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
 * 주차별 중분류별로 입고예정금액 집계
 */
function aggregateIncomingAmountsByWeek(rows: any[]): any[] {
  const weeklyMap = new Map<string, { 
    weekKey: string;
    year: number;
    weekNum: number;
    shoes: number; 
    hat: number; 
    bag: number; 
    other: number 
  }>();

  rows.forEach((row) => {
    const weekKey = row['입고주차'];
    if (!weekKey) return;

    const year = Number(row['년도']) || 0;
    const weekNum = Number(row['주차번호']) || 0;
    const subCategory = row['중분류'];
    const amount = Number(row['발주금액']) || 0;

    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, { 
        weekKey, 
        year, 
        weekNum, 
        shoes: 0, 
        hat: 0, 
        bag: 0, 
        other: 0 
      });
    }
    const currentWeekData = weeklyMap.get(weekKey)!;

    switch (subCategory) {
      case '신발':
        currentWeekData.shoes += amount;
        break;
      case '모자':
        currentWeekData.hat += amount;
        break;
      case '가방':
        currentWeekData.bag += amount;
        break;
      case '기타ACC':
        currentWeekData.other += amount;
        break;
      default:
        break;
    }
  });

  return Array.from(weeklyMap.values())
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.weekNum - b.weekNum;
    })
    .map(item => ({
      weekKey: item.weekKey,
      weekLabel: `${item.weekNum}주차`,
      year: item.year,
      weekNum: item.weekNum,
      shoes: item.shoes,
      hat: item.hat,
      bag: item.bag,
      other: item.other,
      total: item.shoes + item.hat + item.bag + item.other,
    }));
}

