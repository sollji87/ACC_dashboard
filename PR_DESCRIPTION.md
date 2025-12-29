## 🔒 보안 취약점 수정 및 개선

이 PR은 코드베이스에서 발견된 심각한 보안 취약점들을 수정하고 인증 시스템을 구현합니다.

### 🚨 수정된 치명적 보안 취약점

#### 1. SQL Injection 방어 (CRITICAL - OWASP #3)
- **문제**: 156개 이상의 SQL 인젝션 취약점 발견
- **해결**: 모든 SQL 쿼리를 파라미터화된 쿼리로 변환
- **영향받는 파일**:
  - 백엔드: `snowflake.service.ts`, `dashboard.service.ts`
  - 프론트엔드: 14개 API route 파일, 3개 서비스 파일
- **변경사항**: 템플릿 리터럴 `${변수}` → `?` 플레이스홀더 + binds 파라미터

#### 2. 인증/인가 시스템 구현 (CRITICAL - OWASP #1)
- **문제**: 모든 API 엔드포인트가 인증 없이 공개 접근 가능
- **해결**: JWT 기반 인증 시스템 구현
- **새로운 기능**:
  - `/auth/login` 엔드포인트 추가 (POST)
  - 전역 JWT 가드 적용
  - `@Public()` 데코레이터로 공개 엔드포인트 관리
  - 환경 변수 기반 사용자 인증

#### 3. 보안 헤더 및 CORS 강화 (MEDIUM)
- **Helmet.js 통합**:
  - Content Security Policy (CSP)
  - HTTP Strict Transport Security (HSTS)
  - X-Frame-Options, X-Content-Type-Options 등
- **CORS 설정 개선**:
  - 모든 origin 허용 제거
  - 화이트리스트 기반 origin 검증
  - 허용 메소드 및 헤더 명시

### 📝 변경된 파일

#### 백엔드 (NestJS)
- ✨ **신규**: `src/auth/*` (7개 파일 - 인증 모듈 전체)
- 🔧 `src/snowflake/snowflake.service.ts`
- 🔧 `src/dashboard/dashboard.service.ts`
- 🔧 `src/dashboard/dashboard.controller.ts`
- 🔧 `src/app.module.ts`
- 🔧 `src/app.controller.ts`
- 🔧 `src/main.ts`
- 📦 `package.json` (새 의존성 추가)

#### 프론트엔드 (Next.js)
- 🔧 `frontend/lib/snowflake.ts`
- 🔧 `frontend/lib/dashboard-service.ts`
- 🔧 `frontend/lib/chart-service.ts`
- 🔧 14개 API route 파일

#### 설정
- 📝 `env.example` (인증 관련 환경 변수 추가)

### 📊 보안 개선 효과

| 항목 | 개선 전 | 개선 후 |
|------|---------|---------|
| SQL Injection | ❌ 156+ 취약점 | ✅ 0개 (완전 제거) |
| 인증/인가 | ❌ 없음 | ✅ JWT 기반 인증 |
| CORS | ⚠️ 모든 origin 허용 | ✅ 화이트리스트 검증 |
| 보안 헤더 | ❌ 없음 | ✅ Helmet 적용 |
| 입력 검증 | ⚠️ 부분적 | ✅ 전역 ValidationPipe |

### 🔐 새로운 환경 변수

프로덕션 배포 전 `.env` 파일에 다음 값들을 설정해야 합니다:

```env
AUTH_USERNAME=admin
AUTH_PASSWORD=강력한-비밀번호로-변경
JWT_SECRET=무작위-생성된-시크릿-키
JWT_EXPIRES_IN=24h
```

### 🧪 테스트 방법

#### 1. 로그인 테스트
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'
```

#### 2. 인증된 API 호출
```bash
# 토큰 받기
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}' | jq -r .access_token)

# 보호된 엔드포인트 호출
curl http://localhost:3000/api/dashboard/inventory?brandCode=M \
  -H "Authorization: Bearer $TOKEN"
```

#### 3. 공개 엔드포인트 테스트
```bash
# Health check (인증 불필요)
curl http://localhost:3000/api/dashboard/health
```

### ⚠️ Breaking Changes

- **모든 API 엔드포인트가 이제 JWT 인증 필요** (health check 제외)
- 프론트엔드에서 API 호출 시 `Authorization: Bearer <token>` 헤더 추가 필요
- `.env` 파일에 인증 관련 환경 변수 설정 필수

### 🚀 다음 단계 권장사항

1. **필수**:
   - [ ] `.env` 파일에 강력한 비밀번호와 JWT 시크릿 설정
   - [ ] 프로덕션 환경에서 인증 테스트

2. **권장** (향후 개선):
   - [ ] Rate limiting 추가 (brute force 방어)
   - [ ] 감사 로깅 구현
   - [ ] 프론트엔드 로그인 UI 구현
   - [ ] Refresh token 메커니즘 추가
   - [ ] 데이터베이스 기반 사용자 관리

### 📚 관련 이슈

- SQL Injection 취약점 수정
- 인증 시스템 부재
- CORS 설정 취약점

---

**검토 포인트**:
- [ ] 모든 SQL 쿼리가 파라미터화되었는지 확인
- [ ] 인증이 필요한 엔드포인트가 제대로 보호되는지 확인
- [ ] 공개 엔드포인트(`@Public()`)가 적절한지 확인
- [ ] 빌드 및 테스트 통과 확인
