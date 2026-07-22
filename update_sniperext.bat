@echo off
setlocal

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
mkdir "%TEMP_EXTRACT%"

:: Extract zip
echo Extracting...
powershell -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_EXTRACT%' -Force"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Extraction failed.
    pause
    exit /b 1
)

:: Find the extracted folder (GitHub names it SniperEXT-fix-auth-token-capture)
for /d %%D in ("%TEMP_EXTRACT%\*") do set "EXTRACTED_DIR=%%D"

:: Read version from manifest.json
for /f "tokens=2 delims=:," %%A in ('findstr /C:"\"version\"" "%EXTRACTED_DIR%\manifest.json"') do (
    set "RAW_VERSION=%%~A"
)
:: Clean up whitespace and quotes
set "VERSION=%RAW_VERSION: =%"
set "VERSION=%VERSION:"=%"

echo.
echo Detected version: v%VERSION%
echo.

:: Set final folder name
set "FINAL_DIR=%BASE_DIR%\SniperEXT_v%VERSION%"

:: Remove old folder if exists
if exist "%FINAL_DIR%" (
    echo Removing old version at: %FINAL_DIR%
    rmdir /s /q "%FINAL_DIR%"
    timeout /t 2 /nobreak >nul
)

:: Create base directory if it doesn't exist
if not exist "%BASE_DIR%" mkdir "%BASE_DIR%"

:: Copy extracted folder to final location (xcopy works better than move for permissions)
echo Copying to: %FINAL_DIR%
xcopy "%EXTRACTED_DIR%" "%FINAL_DIR%\" /E /I /Y /Q >nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to copy files to %FINAL_DIR%
    echo Try running this .bat file as Administrator (right-click ^> Run as administrator)
    pause
    exit /b 1
)

:: Cleanup
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
