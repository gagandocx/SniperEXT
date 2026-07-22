@echo off
setlocal enabledelayedexpansion

:: ── SniperEXT Auto-Updater ──────────────────────────────────────────────────
:: Downloads the latest version from fix/auth-token-capture branch
:: and extracts it to F:\Automation\Amazon\Sniper\Unlocked\Updatedv1\SniperEXT_vX.X.X.X

set "BASE_DIR=F:\Automation\Amazon\Sniper\Unlocked\Updatedv1"
set "REPO=gagandocx/SniperEXT"
set "BRANCH=fix/auth-token-capture"
set "DOWNLOAD_URL=https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip"
set "TEMP_ZIP=%TEMP%\SniperEXT_latest.zip"
set "TEMP_EXTRACT=%TEMP%\SniperEXT_extract"

echo.
echo ============================================
echo   ShiftSniper Extension Updater
echo ============================================
echo.
echo Downloading latest from: %BRANCH%
echo.

:: Download the zip
curl -L -o "%TEMP_ZIP%" "%DOWNLOAD_URL%"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Download failed. Check your internet connection.
    pause
    exit /b 1
)
echo Download complete.

:: Clean temp extract folder
if exist "%TEMP_EXTRACT%" rmdir /s /q "%TEMP_EXTRACT%"
timeout /t 1 /nobreak >nul
mkdir "%TEMP_EXTRACT%"

:: Extract zip using PowerShell
echo Extracting...
powershell -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_EXTRACT%' -Force"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Extraction failed.
    pause
    exit /b 1
)

:: Find the extracted folder (GitHub names it SniperEXT-fix-auth-token-capture)
set "EXTRACTED_DIR="
for /d %%D in ("%TEMP_EXTRACT%\*") do set "EXTRACTED_DIR=%%D"

if "%EXTRACTED_DIR%"=="" (
    echo ERROR: Could not find extracted folder.
    pause
    exit /b 1
)

echo Found: %EXTRACTED_DIR%

:: Read version from manifest.json using PowerShell (more reliable)
for /f "delims=" %%V in ('powershell -Command "(Get-Content '%EXTRACTED_DIR%\manifest.json' | ConvertFrom-Json).version"') do set "VERSION=%%V"

echo.
echo Detected version: v%VERSION%
echo.

:: Set final folder name
set "FINAL_DIR=%BASE_DIR%\SniperEXT_v%VERSION%"

:: Create base directory if it doesn't exist
if not exist "%BASE_DIR%" (
    echo Creating directory: %BASE_DIR%
    mkdir "%BASE_DIR%"
)

:: Remove old folder if exists
if exist "%FINAL_DIR%" (
    echo Removing old version at: %FINAL_DIR%
    rmdir /s /q "%FINAL_DIR%"
    timeout /t 2 /nobreak >nul
)

:: Create target folder
mkdir "%FINAL_DIR%"

:: Copy all files using robocopy (most reliable on Windows)
echo Copying to: %FINAL_DIR%
robocopy "%EXTRACTED_DIR%" "%FINAL_DIR%" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul 2>&1

:: Robocopy exit codes: 0-7 = success, 8+ = error
if %ERRORLEVEL% GEQ 8 (
    echo.
    echo ERROR: Copy failed. Try running as Administrator.
    echo Right-click this .bat file ^> Run as administrator
    pause
    exit /b 1
)

:: Cleanup temp files
del "%TEMP_ZIP%" 2>nul
rmdir /s /q "%TEMP_EXTRACT%" 2>nul

echo.
echo ============================================
echo   SUCCESS!
echo ============================================
echo.
echo Version:  v%VERSION%
echo Location: %FINAL_DIR%
echo.
echo Load in Chrome:
echo   1. Go to chrome://extensions/
echo   2. Enable Developer mode
echo   3. Click "Load unpacked"
echo   4. Select: %FINAL_DIR%
echo.
echo ============================================
pause
