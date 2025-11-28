# 설정 가이드

## 빠른 시작

### 1. 환경 변수 설정

`frontend` 폴더에 `.env.local` 파일을 생성하세요:

```bash
cd frontend
cp ../env.example .env.local
```

그리고 `.env.local` 파일을 열어 실제 값으로 수정하세요:

```env
# Snowflake 설정
SNOWFLAKE_ACCOUNT=your_account_here
SNOWFLAKE_USERNAME=your_username_here
SNOWFLAKE_PASSWORD=your_password_here
SNOWFLAKE_WAREHOUSE=your_warehouse_here
SNOWFLAKE_DATABASE=your_database_here
SNOWFLAKE_SCHEMA=your_schema_here
```

### 2. 앱 실행

```bash
# 의존성 설치 (처음 한 번만)
cd frontend
npm install

# 개발 서버 실행
npm run dev
```

앱은 `http://localhost:3001`에서 실행됩니다.

### 3. 루트에서 실행 (선택)

루트 디렉토리에서도 실행할 수 있습니다:

```bash
# 루트에서 실행
npm run dev
```

## Snowflake 설정

### Snowflake 계정 정보 확인

1. Snowflake 웹 콘솔에 로그인
2. 계정 URL에서 계정명 확인 (예: `xy12345.us-east-1`)
3. 사용자명과 비밀번호 확인
4. Warehouse, Database, Schema 이름 확인

### 연결 확인

Snowflake 연결은 Next.js API Routes에서 직접 처리됩니다.
`frontend/lib/snowflake.ts`에서 연결 로직을 확인할 수 있습니다.

## API 엔드포인트

모든 API는 Next.js API Routes로 제공됩니다:

### 재고 데이터 조회

```bash
# 모든 브랜드 재고
curl http://localhost:3001/api/dashboard/inventory/all?month=202510

# 단일 브랜드 재고
curl http://localhost:3001/api/dashboard/inventory?brandCode=M&month=202510

# 품번별 상세
curl http://localhost:3001/api/dashboard/inventory/detail?brandCode=M&itemStd=신발&month=202510
```

### 차트 데이터 조회

```bash
curl "http://localhost:3001/api/dashboard/chart?brandCode=M&yyyymm=202510&weeksType=4weeks&itemStd=all"
```

## 문제 해결

### Snowflake 연결 오류

- 계정명, 사용자명, 비밀번호가 정확한지 확인
- Warehouse가 활성화되어 있는지 확인
- 네트워크 방화벽 설정 확인
- `.env.local` 파일이 `frontend` 폴더에 있는지 확인

### 빌드 오류

```bash
# node_modules 삭제 후 재설치
cd frontend
rm -rf node_modules
npm install
```

## 배포

### Railway 배포

`railway.json` 설정이 포함되어 있습니다:

```bash
# Railway CLI로 배포
railway up
```

### Vercel 배포

1. GitHub에 push
2. Vercel에서 New Project 생성
3. Root Directory를 `frontend`로 설정
4. 환경 변수 설정 후 Deploy
