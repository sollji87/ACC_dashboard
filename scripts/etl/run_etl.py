"""
악세사리 재고주수 ETL 스크립트
TAG 금액 기준 4주/8주/12주 평균 매출 계산 및 재고주수 계산
"""
import pandas as pd
import numpy as np
from pathlib import Path

# 경로 설정
BASE_DIR = Path(__file__).parent.parent.parent
RAW_DATA_DIR = BASE_DIR / "frontend" / "public" / "data" / "raw"
PROCESSED_DATA_DIR = BASE_DIR / "frontend" / "public" / "data" / "processed"

def calculate_weeks_of_inventory(df: pd.DataFrame) -> pd.DataFrame:
    """
    TAG 금액 기준 재고주수 계산
    
    Args:
        df: 원본 데이터프레임 (prdt_cd, yearweek, tag_sale_amt, tag_stock_amt 컬럼 필요)
    
    Returns:
        재고주수가 계산된 데이터프레임
    """
    # 품번별로 정렬
    df = df.sort_values(["prdt_cd", "yearweek"]).copy()
    
    # 품번별 그룹화하여 롤링 평균 계산
    df["avg_4w_tag_sale"] = (
        df.groupby("prdt_cd")["tag_sale_amt"]
        .rolling(window=4, min_periods=1)
        .mean()
        .reset_index(0, drop=True)
    )
    
    df["avg_8w_tag_sale"] = (
        df.groupby("prdt_cd")["tag_sale_amt"]
        .rolling(window=8, min_periods=1)
        .mean()
        .reset_index(0, drop=True)
    )
    
    df["avg_12w_tag_sale"] = (
        df.groupby("prdt_cd")["tag_sale_amt"]
        .rolling(window=12, min_periods=1)
        .mean()
        .reset_index(0, drop=True)
    )
    
    # 재고주수 계산 (TAG 기준)
    # 0으로 나누기 방지
    df["woi_4w"] = np.where(
        df["avg_4w_tag_sale"] > 0,
        df["tag_stock_amt"] / df["avg_4w_tag_sale"],
        np.nan
    )
    
    df["woi_8w"] = np.where(
        df["avg_8w_tag_sale"] > 0,
        df["tag_stock_amt"] / df["avg_8w_tag_sale"],
        np.nan
    )
    
    df["woi_12w"] = np.where(
        df["avg_12w_tag_sale"] > 0,
        df["tag_stock_amt"] / df["avg_12w_tag_sale"],
        np.nan
    )
    
    return df

def aggregate_by_brand_item(df: pd.DataFrame) -> pd.DataFrame:
    """
    브랜드·아이템·SKU 기준 집계
    """
    # 브랜드 코드 매핑 (README.md 기준)
    brand_mapping = {
        "M": "MLB",
        "I": "MLB KIDS",
        "X": "DISCOVERY EXPEDITION",
        "V": "DUVETICA",
        "ST": "SERGIO TACCHINI"
    }
    
    # 브랜드 코드 추출 (품번에서 첫 글자 또는 첫 두 글자)
    # 실제 데이터 구조에 맞게 수정 필요
    if "brand_cd" not in df.columns:
        # 품번에서 브랜드 코드 추출 (예시)
        df["brand_cd"] = df["prdt_cd"].str[:2].str.strip()
        # ST는 두 글자, 나머지는 한 글자
        df.loc[df["brand_cd"].str.startswith("ST"), "brand_cd"] = "ST"
        df.loc[~df["brand_cd"].isin(["ST", "M", "I", "X", "V"]), "brand_cd"] = df["prdt_cd"].str[0]
    
    df["brand_name"] = df["brand_cd"].map(brand_mapping).fillna("UNKNOWN")
    
    # 집계 (최신 주차 기준)
    latest_week = df["yearweek"].max()
    latest_df = df[df["yearweek"] == latest_week].copy()
    
    # 브랜드별 집계
    brand_summary = latest_df.groupby("brand_name").agg({
        "woi_4w": "mean",
        "woi_8w": "mean",
        "woi_12w": "mean",
        "tag_stock_amt": "sum",
        "prdt_cd": "count"
    }).reset_index()
    
    brand_summary.columns = [
        "brand_name",
        "avg_woi_4w",
        "avg_woi_8w",
        "avg_woi_12w",
        "total_stock_amt",
        "sku_count"
    ]
    
    return brand_summary

def main():
    """
    ETL 메인 실행 함수
    """
    print("🚀 악세사리 재고주수 ETL 시작...")
    
    # 원본 데이터 파일 찾기
    raw_files = list(RAW_DATA_DIR.glob("*.csv"))
    
    if not raw_files:
        print(f"⚠️  원본 데이터 파일을 찾을 수 없습니다: {RAW_DATA_DIR}")
        print("   Snowflake에서 추출한 CSV 파일을 위 경로에 저장해주세요.")
        return
    
    print(f"📁 발견된 원본 파일: {len(raw_files)}개")
    
    # 각 파일 처리
    for raw_file in raw_files:
        print(f"\n📊 처리 중: {raw_file.name}")
        
        try:
            # CSV 읽기
            df = pd.read_csv(raw_file, encoding="utf-8-sig")
            print(f"   - 읽은 행 수: {len(df)}")
            
            # 필수 컬럼 확인
            required_cols = ["prdt_cd", "yearweek", "tag_sale_amt", "tag_stock_amt"]
            missing_cols = [col for col in required_cols if col not in df.columns]
            
            if missing_cols:
                print(f"   ⚠️  필수 컬럼 누락: {missing_cols}")
                continue
            
            # 재고주수 계산
            df = calculate_weeks_of_inventory(df)
            
            # 브랜드별 집계
            brand_summary = aggregate_by_brand_item(df)
            
            # 결과 저장
            output_file = PROCESSED_DATA_DIR / f"acc_woi_{raw_file.stem}.csv"
            df.to_csv(output_file, index=False, encoding="utf-8-sig")
            print(f"   ✅ 저장 완료: {output_file}")
            
            # 브랜드별 요약 저장
            summary_file = PROCESSED_DATA_DIR / f"brand_summary_{raw_file.stem}.csv"
            brand_summary.to_csv(summary_file, index=False, encoding="utf-8-sig")
            print(f"   ✅ 요약 저장 완료: {summary_file}")
            
        except Exception as e:
            print(f"   ❌ 오류 발생: {str(e)}")
            import traceback
            traceback.print_exc()
    
    print("\n✨ ETL 완료!")

if __name__ == "__main__":
    main()

