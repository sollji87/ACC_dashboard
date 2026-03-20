import { Controller, Get, Query, Logger } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ensureBrandCode, ensureYearMonth, ensureYyyymm } from '../common/request-validation';

@Controller('api/dashboard')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(private readonly dashboardService: DashboardService) {
    this.logger.log('DashboardController initialized');
  }

  /**
   * 헬스 체크
   */
  @Get('health')
  health() {
    return { status: 'ok', message: 'Dashboard API is running' };
  }

  /**
   * 브랜드별 악세사리 재고주수 조회
   * GET /api/dashboard/inventory?brandCode=M&month=202510
   */
  @Get('inventory')
  async getInventory(
    @Query('brandCode') brandCode: string = 'M',
    @Query('month') month: string,
  ) {
    const safeBrandCode = ensureBrandCode(brandCode);
    const yyyymm = month ? ensureYyyymm(month, 'month') : this.getCurrentYearMonth();

    try {
      const data = await this.dashboardService.getInventoryWeeks(safeBrandCode, yyyymm);
      
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 모든 브랜드의 재고주수 조회
   * GET /api/dashboard/inventory/all?month=202510
   */
  @Get('inventory/all')
  async getAllBrandsInventory(@Query('month') month: string) {
    const yyyymm = month ? ensureYyyymm(month, 'month') : this.getCurrentYearMonth();

    try {
      const brandCodes = ['M', 'I', 'X', 'V', 'ST'];
      
      const results = await Promise.all(
        brandCodes.map(async (brandCode) => {
          try {
            this.logger.log(`브랜드 ${brandCode} 조회 시작 (${yyyymm})`);
            const data = await this.dashboardService.getInventoryWeeks(brandCode, yyyymm);
            this.logger.log(`브랜드 ${brandCode} 조회 성공`);
            return data;
          } catch (error) {
            this.logger.error(`브랜드 ${brandCode} 조회 실패:`, error.message);
            this.logger.error(`에러 상세:`, error);
            return null;
          }
        }),
      );

      const validResults = results.filter(r => r !== null);
      this.logger.log(`총 ${validResults.length}개 브랜드 데이터 조회 성공`);

      return {
        success: true,
        data: validResults,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 입고예정금액 조회
   * GET /api/dashboard/incoming-amounts?brandCode=M&startMonth=2025-11&endMonth=2026-04
   */
  @Get('incoming-amounts')
  async getIncomingAmounts(
    @Query('brandCode') brandCode: string,
    @Query('startMonth') startMonth: string,
    @Query('endMonth') endMonth: string,
  ) {
    const safeBrandCode = ensureBrandCode(brandCode);
    const safeStartMonth = ensureYearMonth(startMonth, 'startMonth');
    const safeEndMonth = ensureYearMonth(endMonth, 'endMonth');

    try {
      const data = await this.dashboardService.getIncomingAmounts(
        safeBrandCode,
        safeStartMonth,
        safeEndMonth,
      );

      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('입고예정금액 조회 실패:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 현재 년월 반환 (YYYYMM 형식)
   */
  private getCurrentYearMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
  }
}
