import { NextRequest, NextResponse } from 'next/server';
import { connectToSnowflake, executeQuery, disconnectFromSnowflake } from '@/lib/snowflake';

/**
 * 특정 품번의 월별 재고/판매 추이 조회 API
 * GET /api/dashboard/product/monthly-trend?brandCode=M&productCode=M21S32SHS1111&endMonth=202510
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brandCode = searchParams.get('brandCode') || 'M';
    const productCode = searchParams.get('productCode');
    const endMonth = searchParams.get('endMonth') || '202510';

    if (!productCode) {
      return NextResponse.json(
        { success: false, error: '품번(productCode)이 필요합니다.' },
        { status: 400 }
      );
    }

    // SQL 인젝션 방지: brandCode와 productCode 검증
    // brandCode는 알파벳 1-2자리만 허용
    if (!/^[A-Za-z]{1,2}$/.test(brandCode)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 브랜드 코드입니다.' },
        { status: 400 }
      );
    }
    
    // productCode는 알파벳, 숫자, 하이픈, 언더스코어만 허용 (최대 50자)
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(productCode)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 품번 코드입니다.' },
        { status: 400 }
      );
    }
    
    // endMonth는 YYYYMM 형식만 허용
    if (!/^\d{6}$/.test(endMonth)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 월 형식입니다. (YYYYMM 형식 필요)' },
        { status: 400 }
      );
    }

    console.log(`📊 품번 월별 추이 조회: ${brandCode}, ${productCode}, ${endMonth}`);

    const connection = await connectToSnowflake();

    try {
      // 최근 12개월 계산
      const endYear = parseInt(endMonth.substring(0, 4));
      const endMon = parseInt(endMonth.substring(4, 6));
      
      const months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        let m = endMon - i;
        let y = endYear;
        while (m <= 0) {
          m += 12;
          y -= 1;
        }
        months.push(`${y}${m.toString().padStart(2, '0')}`);
      }

      // Create placeholders for IN clause
      const monthsPlaceholders = months.map(() => '?').join(',');

      const query = `
        WITH monthly_stock AS (
          SELECT
            a.yyyymm,
            SUM(a.end_stock_tag_amt) as end_stock_tag_amt
          FROM sap_fnf.dw_ivtr_shop_prdt_m a
          WHERE a.brd_cd = ?
            AND a.prdt_cd = ?
            AND a.yyyymm IN (${monthsPlaceholders})
          GROUP BY a.yyyymm
        ),
        monthly_sale AS (
          SELECT
            a.pst_yyyymm as yyyymm,
            SUM(a.act_sale_amt) as act_sale_amt,
            SUM(a.tag_sale_amt) as tag_sale_amt
          FROM sap_fnf.dm_pl_shop_prdt_m a
          LEFT JOIN sap_fnf.mst_shop c
            ON a.brd_cd = c.brd_cd
            AND a.shop_cd = c.sap_shop_cd
          WHERE a.brd_cd = ?
            AND a.prdt_cd = ?
            AND a.pst_yyyymm IN (${monthsPlaceholders})
            AND c.chnl_cd <> '9'
          GROUP BY a.pst_yyyymm
        )
        SELECT
          s.yyyymm,
          COALESCE(s.end_stock_tag_amt, 0) as end_stock_tag_amt,
          COALESCE(p.act_sale_amt, 0) as act_sale_amt,
          COALESCE(p.tag_sale_amt, 0) as tag_sale_amt
        FROM monthly_stock s
        LEFT JOIN monthly_sale p ON s.yyyymm = p.yyyymm
        ORDER BY s.yyyymm
      `;

      // Parameters: brandCode, productCode, ...months (for monthly_stock), brandCode, productCode, ...months (for monthly_sale)
      const params = [brandCode, productCode, ...months, brandCode, productCode, ...months];

      const rows = await executeQuery(query, params, connection);

      // 데이터 포맷팅
      const formattedData = rows.map((row: any) => {
        const yyyymm = row.YYYYMM || row.yyyymm;
        return {
          month: `${yyyymm.substring(0, 4)}-${yyyymm.substring(4, 6)}`,
          yyyymm: yyyymm,
          endStock: Math.round((Number(row.END_STOCK_TAG_AMT || row.end_stock_tag_amt) || 0) / 1000000), // 백만원 단위
          actSale: Math.round((Number(row.ACT_SALE_AMT || row.act_sale_amt) || 0) / 1000000), // 백만원 단위
          tagSale: Math.round((Number(row.TAG_SALE_AMT || row.tag_sale_amt) || 0) / 1000000), // 백만원 단위
        };
      });

      // 모든 12개월 데이터 채우기 (데이터 없는 월은 0으로)
      const fullData = months.map(m => {
        const existing = formattedData.find((d: any) => d.yyyymm === m);
        if (existing) return existing;
        return {
          month: `${m.substring(0, 4)}-${m.substring(4, 6)}`,
          yyyymm: m,
          endStock: 0,
          actSale: 0,
          tagSale: 0,
        };
      });

      console.log(`✅ 품번 월별 추이 조회 성공: ${fullData.length}개월`);

      return NextResponse.json({
        success: true,
        data: {
          productCode,
          monthlyTrend: fullData,
        },
      });
    } finally {
      await disconnectFromSnowflake();
    }
  } catch (error) {
    console.error('❌ 품번 월별 추이 조회 실패:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      },
      { status: 500 }
    );
  }
}

