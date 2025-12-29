import { Controller, Get, Query, Logger } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

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
    try {
      // month 파라미터 검증 및 기본값 설정
      const yyyymm = month || this.getCurrentYearMonth();
      
      const data = await this.dashboardService.getInventoryWeeks(brandCode, yyyymm);
      
      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('재고주수 조회 실패:', error);
      return {
        success: false,
        error: '재고주수 조회 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 모든 브랜드의 재고주수 조회
   * GET /api/dashboard/inventory/all?month=202510
   */
  @Get('inventory/all')
  async getAllBrandsInventory(@Query('month') month: string) {
    try {
      const yyyymm = month || this.getCurrentYearMonth();
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
      this.logger.error('전체 브랜드 재고주수 조회 실패:', error);
      return {
        success: false,
        error: '브랜드 재고주수 조회 중 오류가 발생했습니다.',
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
    try {
      if (!brandCode || !startMonth || !endMonth) {
        return {
          success: false,
          error: 'brandCode, startMonth, endMonth 파라미터가 필요합니다.',
        };
      }

      const data = await this.dashboardService.getIncomingAmounts(
        brandCode,
        startMonth,
        endMonth,
      );

      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('입고예정금액 조회 실패:', error);
      return {
        success: false,
        error: '입고예정금액 조회 중 오류가 발생했습니다.',
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
