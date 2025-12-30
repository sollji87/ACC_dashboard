import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // CORS 설정
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  app.enableCors({
    origin: frontendUrl ? [frontendUrl, 'http://localhost:3001'] : true, // 모든 origin 허용 (프로덕션에서는 특정 도메인만 허용 권장)
    credentials: true,
  });

  // Validation Pipe 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);
  console.log(`🚀 서버가 포트 ${port}에서 실행 중입니다.`);
  console.log(`📊 대시보드 API: http://localhost:${port}/api/dashboard`);
}
bootstrap();
