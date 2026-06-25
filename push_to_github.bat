@echo off
setlocal EnableDelayedExpansion
title strenth-web GitHub Push

cd /d "%~dp0"

echo.
echo ============================================================
echo   strenth-web ko GitHub par push kar rahe hain
echo   Repo: https://github.com/strenth-ai/ai-workspace-proto
echo ============================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git installed nahi hai.
    pause
    exit /b 1
)

REM ── Safety: block if secrets accidentally staged ──────────────────────────
echo [CHECK] Secrets scan kar raha hoon...
git diff --cached --name-only > "%TEMP%\staged.txt" 2>nul
git status --short >> "%TEMP%\staged.txt" 2>nul

findstr /i "credentials.json" "%TEMP%\staged.txt" >nul
if not errorlevel 1 (
    echo [BLOCKED] credentials.json staged hai! Push rok diya.
    echo .gitignore check karein.
    pause
    exit /b 1
)

findstr /i "azure-deploy.ps1" "%TEMP%\staged.txt" >nul
if not errorlevel 1 (
    echo [BLOCKED] azure-deploy.ps1 staged hai! Push rok diya.
    echo Yeh file secrets contain karta hai — kabhi commit mat karo.
    pause
    exit /b 1
)

findstr /i "\.env$" "%TEMP%\staged.txt" >nul
if not errorlevel 1 (
    echo [BLOCKED] .env file staged hai! Push rok diya.
    pause
    exit /b 1
)

del "%TEMP%\staged.txt" >nul 2>&1

REM ── Show what will be committed ───────────────────────────────────────────
echo.
echo [INFO] Staged changes:
git status --short
echo.

set /p MSG="Commit message daalein: "
if "!MSG!"=="" set MSG="chore: update"

git add -p
git commit -m "!MSG!"

echo.
echo [PUSH] GitHub par push kar raha hoon...
git push origin HEAD

if errorlevel 1 (
    echo [ERROR] Push fail. PAT ya internet check karein.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   SUCCESS! GitHub Action ab automatically deploy karega.
echo   Actions: https://github.com/strenth-ai/ai-workspace-proto/actions
echo ============================================================
echo.
pause
