import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // 보안 헤더 설정 (Helmet)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  // CORS 설정 강화
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  const allowedOrigins = frontendUrl ? [frontendUrl, 'http://localhost:3001'] : ['http://localhost:3001'];

  app.enableCors({
    origin: (origin, callback) => {
      // origin이 없는 경우 (같은 도메인 요청) 허용
      if (!origin) {
        return callback(null, true);
      }
      // 허용된 origin인지 확인
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
  console.log(`🔒 인증 API: http://localhost:${port}/auth/login`);
  console.log(`🔐 허용된 CORS origins: ${allowedOrigins.join(', ')}`);
}
bootstrap();
