# ── bom-tool local dev server ─────────────────────────────────────────────────
# Starts the BOM Tool bridge on port 8002.
# Run from the bom-tool directory:
#   cd C:\Users\Suraj Tiwari\Desktop\Agents\bom-tool
#   .\start_local.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "=== bom-tool starting on :8002 ===" -ForegroundColor Cyan

# Load .env into current session
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#=]+)=(.*)$") {
            $key   = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Remove surrounding quotes if present
            $value = $value -replace '^["'']|["'']$', ''
            [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Host ".env loaded" -ForegroundColor Green
} else {
    Write-Host "WARNING: .env not found — vendor API calls may fail" -ForegroundColor Yellow
}

# Activate virtual environment if it exists
$venvPaths = @("venv\Scripts\Activate.ps1", ".venv\Scripts\Activate.ps1", "env\Scripts\Activate.ps1")
foreach ($venvPath in $venvPaths) {
    if (Test-Path $venvPath) {
        Write-Host "Activating virtualenv: $venvPath" -ForegroundColor Green
        & $venvPath
        break
    }
}

Write-Host ""
Write-Host "Docs: http://localhost:8002/docs" -ForegroundColor DarkGray
Write-Host ""

uvicorn frontend_bridge:app --host 0.0.0.0 --port 8002 --reload
