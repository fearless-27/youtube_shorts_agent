Write-Host "GHOSTPIPE v5.1 - Quick Start" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    Write-Host "Python launcher 'py' was not found. Install Python 3.11+ first." -ForegroundColor Red
    exit 1
}

$pythonVersion = & py -3 --version
Write-Host "Python version: $pythonVersion" -ForegroundColor Green

Write-Host "Creating virtual environment..."
& py -3 -m venv venv

Write-Host "Installing dependencies..."
& .\venv\Scripts\python.exe -m pip install --upgrade pip
& .\venv\Scripts\python.exe -m pip install -r pipeline\requirements.txt

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "FFmpeg not found. Install it from ffmpeg.org and add it to PATH." -ForegroundColor Yellow
}

if (-not (Test-Path .env)) {
    Copy-Item config\.env.template .env
    Write-Host "Created .env file from config\.env.template. Fill in your API keys." -ForegroundColor Green
}

foreach ($dir in @("downloads", "outputs", "logs", "dry_run_analysis")) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}

Write-Host "Ready to run:" -ForegroundColor Cyan
Write-Host "  .\venv\Scripts\Activate.ps1"
Write-Host "  python pipeline\ghostpipe_v5_1_pipeline.py"