@echo off
echo ========================================
echo 재고주수 대시보드 서버 시작
echo ========================================
cd frontend
echo 현재 디렉토리: %CD%
echo.
echo Node.js 버전 확인...
node -v
echo.
echo npm 버전 확인...
npm -v
echo.
echo 의존성 확인 중...
if not exist "node_modules" (
    echo node_modules 폴더가 없습니다. 의존성을 설치합니다...
    call npm install
)
echo.
echo 개발 서버 시작 중...
echo 서버 주소: http://localhost:3001
echo.
echo 서버를 종료하려면 Ctrl+C를 누르세요.
echo ========================================
call npm run dev
pause

