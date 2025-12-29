import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // CORS 설정 - 보안 강화: 허용된 origin만 접근 가능
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  const allowedOrigins = frontendUrl
    ? [frontendUrl, 'http://localhost:3001']
    : ['http://localhost:3001'];

  app.enableCors({
    origin: (origin, callback) => {
      // origin이 없는 경우 (서버 간 요청, curl 등) 또는 허용된 origin인 경우 허용
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS 차단: ${origin}`);
        callback(new Error('CORS policy violation'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
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
