@echo off
chcp 65001 >nul
echo ========================================
echo 재고주수 대시보드 서버 시작
echo ========================================
echo.

cd /d "%~dp0frontend"
if errorlevel 1 (
    echo [오류] frontend 폴더를 찾을 수 없습니다!
    pause
    exit /b 1
)

echo [1/4] Node.js 확인 중...
where node >nul 2>&1
if errorlevel 1 (
    echo [오류] Node.js가 설치되어 있지 않습니다!
    echo        https://nodejs.org/ 에서 설치해주세요.
    pause
    exit /b 1
)
node -v
echo.

echo [2/4] npm 확인 중...
where npm >nul 2>&1
if errorlevel 1 (
    echo [오류] npm이 설치되어 있지 않습니다!
    pause
    exit /b 1
)
npm -v
echo.

echo [3/4] 의존성 확인 중...
if not exist "node_modules" (
    echo [정보] node_modules 폴더가 없습니다. 설치를 시작합니다...
    call npm install
    if errorlevel 1 (
        echo [오류] 의존성 설치 실패!
        pause
        exit /b 1
    )
    echo [완료] 의존성 설치 완료
) else (
    echo [완료] node_modules 폴더 존재
)
echo.

echo [4/4] 포트 확인 중...
netstat -ano | findstr ":3001" >nul 2>&1
if not errorlevel 1 (
    echo [경고] 포트 3001이 이미 사용 중입니다!
    echo        다른 프로세스를 종료하거나 다른 포트를 사용하세요.
    echo.
    echo        다른 포트로 실행하려면:
    echo        npx next dev -p 3002
    echo.
    pause
)

echo ========================================
echo 개발 서버 시작 중...
echo 서버 주소: http://localhost:3001
echo ========================================
echo.
echo 서버를 종료하려면 Ctrl+C를 누르세요.
echo.

call npm run dev

pause
























