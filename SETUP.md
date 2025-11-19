# 설정 가이드

## 빠른 시작

### 1. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하세요:

```bash
cp env.example .env
```

그리고 `.env` 파일을 열어 실제 값으로 수정하세요:

```env
PORT=3000

# Snowflake 설정
SNOWFLAKE_ACCOUNT=your_account_here
SNOWFLAKE_USERNAME=your_username_here
SNOWFLAKE_PASSWORD=your_password_here
SNOWFLAKE_WAREHOUSE=your_warehouse_here
SNOWFLAKE_DATABASE=your_database_here
SNOWFLAKE_SCHEMA=your_schema_here

# OpenAI 설정
OPENAI_API_KEY=sk-your-api-key-here

# 프론트엔드 URL
FRONTEND_URL=http://localhost:3001
```

### 2. 백엔드 실행

```bash
# 의존성 설치 (처음 한 번만)
npm install

# 개발 서버 실행
npm run start:dev
```

백엔드는 `http://localhost:3000`에서 실행됩니다.

### 3. 프론트엔드 실행

새 터미널 창에서:

```bash
cd frontend

# 의존성 설치 (처음 한 번만)
npm install

# 개발 서버 실행
npm run dev
```

프론트엔드는 `http://localhost:3001`에서 실행됩니다.

## Snowflake 설정

### Snowflake 계정 정보 확인

1. Snowflake 웹 콘솔에 로그인
2. 계정 URL에서 계정명 확인 (예: `xy12345.us-east-1`)
3. 사용자명과 비밀번호 확인
4. Warehouse, Database, Schema 이름 확인

### 테이블 구조

Snowflake에 다음과 같은 구조의 테이블이 있어야 합니다:

```sql
CREATE TABLE inventory (
  brand VARCHAR(255),
  accessory_type VARCHAR(255),
  quantity NUMBER,
  -- 기타 필요한 컬럼들
);
```

실제 테이블 구조에 맞게 `src/snowflake/snowflake.service.ts`의 `getInventoryByBrand()` 메서드를 수정하세요.

## OpenAI 설정

1. [OpenAI Platform](https://platform.openai.com/)에 로그인
2. API Keys 섹션에서 새 API 키 생성
3. `.env` 파일의 `OPENAI_API_KEY`에 키 값 입력

## 파일 업로드 형식

### CSV 파일 형식 예시

```csv
brand,accessory_type,quantity
NIKE,Watch,100
ADIDAS,Bag,50
PUMA,Sunglasses,75
```

### Excel 파일 형식

Excel 파일도 동일한 컬럼 구조를 가져야 합니다:
- `brand` 또는 `Brand`: 브랜드명
- `accessory_type` 또는 `Accessory Type`: 악세사리 타입
- `quantity` 또는 `Quantity`: 수량

## API 테스트

### 재고 데이터 조회

```bash
curl http://localhost:3000/api/dashboard/inventory
```

### 파일 업로드

```bash
curl -X POST \
  -F "file=@your-file.csv" \
  http://localhost:3000/api/dashboard/upload
```

### AI 인사이트 생성

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"data": [{"brand": "NIKE", "accessoryType": "Watch", "quantity": 100}]}' \
  http://localhost:3000/api/dashboard/insights
```

## 문제 해결

### Snowflake 연결 오류

- 계정명, 사용자명, 비밀번호가 정확한지 확인
- Warehouse가 활성화되어 있는지 확인
- 네트워크 방화벽 설정 확인

### 파일 업로드 오류

- 파일 크기가 10MB 이하인지 확인
- 파일 형식이 CSV 또는 Excel인지 확인
- `uploads` 폴더가 존재하고 쓰기 권한이 있는지 확인

### OpenAI API 오류

- API 키가 유효한지 확인
- API 사용량 한도 확인
- 인터넷 연결 확인

