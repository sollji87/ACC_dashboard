# 악세사리 재고주수 대시보드  
브랜드별 TAG 금액 기준 Weeks of Inventory 시각화 (MLB / MLB KIDS / DISCOVERY / DUVETICA / SERGIO TACCHINI)

본 프로젝트는 패션회사 FP&A 시각에서 **악세사리(ACC) 카테고리의 재고주수(Weeks of Inventory)**를  
**TAG 금액 기준**으로 계산하여, 4주·8주·12주 기준으로 비교 분석할 수 있는 웹 기반 대시보드이다.

데이터는 Snowflake에서 주차별 판매 TAG 금액·재고 TAG 금액을 CSV로 export하여  
Python에서 정제한 후, Next.js 대시보드에서 시각화한다.

---

# 1. 브랜드 정의 (Full Name + Snowflake 코드)

Snowflake에서는 브랜드가 약어 코드로 관리되므로  
UI에는 **풀네임**, ETL에서는 **코드**를 사용한다.

| 브랜드명(Full Name)               | 코드 | 설명 |
|----------------------------------|------|------|
| **MLB**                          | M    | 메인 MLB 브랜드 |
| **MLB KIDS**                     | I    | 어린이 라인 |
| **DISCOVERY EXPEDITION**        | X    | 아웃도어/라이프스타일 |
| **DUVETICA**                     | V    | 프리미엄 패딩 브랜드 |
| **SERGIO TACCHINI**             | ST   | 테니스·스포츠 헤리티지 |

**표준 표기법**  


MLB (M)
MLB KIDS (I)
DISCOVERY EXPEDITION (X)
DUVETICA (V)
SERGIO TACCHINI (ST)


---

# 2. 프로젝트 목적

기존 6개월(26주) 기준의 재고주수로는  
악세사리처럼 **논시즌·회전 빠른 카테고리**의 실제 재고 흐름을 파악하기 어려웠다.

따라서 업계 표준에 맞춰:

- **4주 기준** → 실제 회전 SKU 감지  
- **8주 기준** → 변동성 완화  
- **12주 기준** → 장기 흐름 비교  

이 3가지 기준의 TAG 금액 기반 재고주수를 대시보드에서 비교할 수 있도록 설계한다.

---

# 3. 재고주수 계산 정의 (TAG 금액 기준)

## ✔ 재고주수 공식  
```text
재고주수(Weeks of Inventory) = TAG 재고금액 / (기간평균 TAG 매출금액)


TAG 재고금액: 재고자산 중 TAG 기준 금액

TAG 매출금액: 판매 발생시점의 TAG 기준 매출

평균기간:

최근 4주 평균 TAG 판매금액

최근 8주 평균 TAG 판매금액

최근 12주 평균 TAG 판매금액

4. 데이터 흐름 (ETL Pipeline)

Snowflake Extract

ACC 품번 주차별 TAG 매출

기준일 TAG 재고금액

시즌/아이템 분류

CSV export

raw CSV 저장
public/data/raw/

Python ETL 정제

4/8/12주 평균 TAG 판매금액 계산

TAG 기준 재고주수 계산

브랜드·아이템·SKU 기준 집계

결과를 public/data/processed/ 로 저장

Next.js 대시보드에서 읽어서 시각화

5. 기술 스택
Frontend

Next.js (App Router)

React

Typescript

Tailwind CSS

shadcn/ui

Recharts 또는 Chart.js

Backend (선택)

Nest.js

실시간 API·필터링·권한 관리 등 향후 확장 용도

ETL

Python (pandas)

Snowflake → CSV 추출 정제

DevOps

GitHub

Vercel (Next.js 배포)

6. 폴더 구조
.
├─ public/
│  └─ data/
│     ├─ raw/               # Snowflake 추출 원본 CSV
│     └─ processed/         # Python 정제 완료 데이터
├─ scripts/
│  └─ etl/
│     ├─ run_etl.py         # ETL 메인 로직
│     └─ requirements.txt
├─ src/
│  ├─ app/                  # Next.js App Router
│  ├─ components/           # UI + 그래프 컴포넌트
│  └─ lib/                  # CSV 로더, 유틸 함수
└─ nest-app/                # Nest.js (선택)

7. Python ETL (TAG 금액 기준 계산 예시)
import pandas as pd

df = pd.read_csv("public/data/raw/sales_stock_raw.csv")

df = df.sort_values(["prdt_cd", "yearweek"])

# 평균 TAG 매출(4/8/12주)
df["avg_4w_tag_sale"] = (
    df.groupby("prdt_cd")["tag_sale_amt"]
      .rolling(4).mean().reset_index(0, drop=True)
)

df["avg_8w_tag_sale"] = (
    df.groupby("prdt_cd")["tag_sale_amt"]
      .rolling(8).mean().reset_index(0, drop=True)
)

df["avg_12w_tag_sale"] = (
    df.groupby("prdt_cd")["tag_sale_amt"]
      .rolling(12).mean().reset_index(0, drop=True)
)

# 재고주수 계산 (TAG 기준)
df["woi_4w"] = df["tag_stock_amt"] / df["avg_4w_tag_sale"]
df["woi_8w"] = df["tag_stock_amt"] / df["avg_8w_tag_sale"]
df["woi_12w"] = df["tag_stock_amt"] / df["avg_12w_tag_sale"]

df.to_csv("public/data/processed/acc_woi_by_prdt.csv", index=False)

8. 대시보드 주요 기능
✔ 브랜드별 ACC 재고주수 현황

브랜드 기준:

MLB (M)

MLB KIDS (I)

DISCOVERY EXPEDITION (X)

DUVETICA (V)

SERGIO TACCHINI (ST)

✔ 아이템 기준 Drill-down

모자

신발

가방

기타ACC

✔ 4/8/12주 재고주수 비교 그래프

민감도 높은 SKU 탐색

과재고/부족재고 자동 식별

✔ 시즌·브랜드·아이템 필터(shadcn Select)
✔ 과재고/부족재고 램프

< 3주 → 재고 부족

3~6주 → 정상

12주 → 과재고

9. 4주 / 8주 / 12주 기준 재고주수 비교 시나리오

ACC 분석의 핵심은 TAG 금액 기준 4·8·12주 평균 매출 대비 재고주수를 비교하는 것이다.

9.1 비교 그래프 구성
① 멀티라인 그래프 (SKU 기준)

X축: SKU 또는 Item

Y축: 재고주수

Series:

WOI_4W

WOI_8W

WOI_12W

→ 잘팔리는 SKU는 4주 기준에서 가장 민감하게 드러남

② 브랜드 × 기준별 히트맵

행: 브랜드(MLB·KIDS·DISC·DVT·ST)

열: 4주 / 8주 / 12주

색상범주: 부족 / 정상 / 과다

③ 브랜드별 Box Plot

ACC 판매 변동성 비교

브랜드별 편차

아웃라이어(위험 SKU) 탐색

10. 분석 인사이트 예시
✔ 4주 기준

실매출 흐름 실시간 반영

히트SKU · 부족재고 즉시 감지

리오더 타이밍 최적화

✔ 8주 기준

단기 변동성 완화

브랜드별 안정적 기준

✔ 12주 기준

장기 트렌드 비교용

ACC에서는 다소 둔감하지만 참고용으로 적절

11. Vercel 배포

GitHub push

Vercel → New Project

Next.js 자동 인식

Deploy

public/data/processed/ 포함 필수 (정적 데이터 기반)

12. 향후 확장 아이디어

Nest.js → Snowflake 실시간 API 연동

Dead-stock 자동 감지

브랜드별 안전재고(Safety Stock) 알고리즘 적용

AI 기반 “월간 ACC 인사이트” 자동 생성

전년·전월 대비 재고주수 YoY/DoD 지표 자동 계산

본 README는 악세사리(ACC) 카테고리의 회전특성과 FP&A 요구사항을 기반으로
TAG 금액 기준 재고주수 분석을 수행하기 위해 설계되었습니다.
