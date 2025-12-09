# 재고주수 대시보드 서버 테스트 스크립트
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "재고주수 대시보드 서버 시작 테스트" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 현재 디렉토리 확인
$currentDir = Get-Location
Write-Host "현재 디렉토리: $currentDir" -ForegroundColor Yellow

# frontend 폴더로 이동
Set-Location -Path "frontend"
Write-Host "frontend 폴더로 이동 완료" -ForegroundColor Green
Write-Host ""

# Node.js 확인
Write-Host "Node.js 버전 확인 중..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    Write-Host "✓ Node.js 버전: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js가 설치되어 있지 않습니다!" -ForegroundColor Red
    Write-Host "  Node.js를 설치해주세요: https://nodejs.org/" -ForegroundColor Red
    pause
    exit
}
Write-Host ""

# npm 확인
Write-Host "npm 버전 확인 중..." -ForegroundColor Yellow
try {
    $npmVersion = npm -v
    Write-Host "✓ npm 버전: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ npm이 설치되어 있지 않습니다!" -ForegroundColor Red
    pause
    exit
}
Write-Host ""

# node_modules 확인
Write-Host "의존성 확인 중..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "✓ node_modules 폴더 존재" -ForegroundColor Green
} else {
    Write-Host "✗ node_modules 폴더가 없습니다. 설치를 시작합니다..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ 의존성 설치 실패!" -ForegroundColor Red
        pause
        exit
    }
    Write-Host "✓ 의존성 설치 완료" -ForegroundColor Green
}
Write-Host ""

# 포트 확인
Write-Host "포트 3001 사용 여부 확인 중..." -ForegroundColor Yellow
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port3001) {
    Write-Host "⚠ 포트 3001이 이미 사용 중입니다!" -ForegroundColor Yellow
    Write-Host "  사용 중인 프로세스: $($port3001.OwningProcess)" -ForegroundColor Yellow
} else {
    Write-Host "✓ 포트 3001 사용 가능" -ForegroundColor Green
}
Write-Host ""

# 서버 시작
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "개발 서버 시작 중..." -ForegroundColor Cyan
Write-Host "서버 주소: http://localhost:3001" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "서버를 종료하려면 Ctrl+C를 누르세요." -ForegroundColor Yellow
Write-Host ""

# 서버 실행
npm run dev














