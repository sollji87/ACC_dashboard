import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [ConfigModule, DashboardModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
