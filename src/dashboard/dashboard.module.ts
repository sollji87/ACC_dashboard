import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SnowflakeModule } from '../snowflake/snowflake.module';

@Module({
  imports: [SnowflakeModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
