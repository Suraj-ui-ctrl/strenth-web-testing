# ── bom-tool Python environment setup ─────────────────────────────────────────
# Run ONCE before the first start_local.ps1 call.
#   cd C:\Users\Suraj Tiwari\Desktop\Agents\bom-tool
#   .\setup_venv.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "=== bom-tool venv setup ===" -ForegroundColor Cyan

# Create venv if it doesn't exist
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate
& "venv\Scripts\Activate.ps1"

Write-Host "Installing dependencies..." -ForegroundColor Yellow
pip install --upgrade pip --quiet
pip install -r requirements_bridge.txt

Write-Host ""
Write-Host "Setup complete. Run .\start_local.ps1 to start." -ForegroundColor Green
