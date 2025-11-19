# ETL 스크립트 사용 가이드

## 설치

```bash
cd scripts/etl
pip install -r requirements.txt
```

## 사용 방법

1. **Snowflake에서 데이터 추출**
   - `frontend/public/data/raw/` 폴더에 CSV 파일 저장
   - 필수 컬럼: `prdt_cd`, `yearweek`, `tag_sale_amt`, `tag_stock_amt`

2. **ETL 실행**
   ```bash
   python run_etl.py
   ```

3. **결과 확인**
   - `frontend/public/data/processed/` 폴더에 정제된 데이터 저장됨
   - `acc_woi_*.csv`: 품번별 재고주수 데이터
   - `brand_summary_*.csv`: 브랜드별 요약 데이터

## 데이터 형식

### 입력 CSV 형식 (예시)
```csv
prdt_cd,yearweek,tag_sale_amt,tag_stock_amt,brand_cd,item_type
M12345,202401,1000000,5000000,M,모자
M12345,202402,1200000,4800000,M,모자
```

### 출력 데이터
- `woi_4w`: 4주 기준 재고주수
- `woi_8w`: 8주 기준 재고주수
- `woi_12w`: 12주 기준 재고주수

