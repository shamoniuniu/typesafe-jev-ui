$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host '未检测到 Node.js/npm，请先安装 Node.js 20.19+ 或 22.12+。' -ForegroundColor Red
    Read-Host '按 Enter 键退出'
    exit 1
}

if (-not (Test-Path 'node_modules')) {
    Write-Host '首次运行，正在安装依赖...' -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host '依赖安装失败，请检查网络后重试。' -ForegroundColor Red
        Read-Host '按 Enter 键退出'
        exit $LASTEXITCODE
    }
}

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host '已创建 .env。请稍后填写 TYPESAFE_API_KEY，未填写时只能打开界面，不能调用 Jev。' -ForegroundColor Yellow
}

$server = Start-Process 'npm.cmd' `
    -ArgumentList 'run', 'dev' `
    -WorkingDirectory $PSScriptRoot `
    -PassThru

Write-Host "服务正在启动，进程 ID：$($server.Id)" -ForegroundColor Cyan
Start-Sleep -Seconds 10
Start-Process 'http://localhost:5173/'
Write-Host '浏览器已打开。关闭服务窗口即可停止 Jev 调试台。' -ForegroundColor Green
