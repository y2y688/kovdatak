@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Kovdatak Build Script (Windows)
echo ========================================

REM Check required tools
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm not found, please install Node.js
    exit /b 1
)

REM Change to script directory
cd /d "%~dp0"

echo [1/4] Cleaning previous builds...
REM Ensure no running Kovdatak process
taskkill /F /IM Kovdatak.exe 2>nul
if exist "pykovdatak\web-react-dist" (
    rmdir /s /q "pykovdatak\web-react-dist"
)
if exist "dist" (
    rmdir /s /q "dist"
)
if exist "build" (
    rmdir /s /q "build"
)

echo [2/4] Building frontend React app...
cd frontend
call npm ci
if %ERRORLEVEL% neq 0 (
    echo [WARN] npm ci failed, trying npm install...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed
        exit /b 1
    )
)
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend build failed
    exit /b 1
)
cd ..

echo [3/4] Checking Python dependencies...
if not exist "pykovdatak\.venv" (
    echo [INFO] Virtual environment not found, creating...
    cd pykovdatak
    python -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create virtual environment
        exit /b 1
    )
    cd ..
)

echo [INFO] Installing/updating Python dependencies...
cd pykovdatak
call .venv\Scripts\activate.bat
pip install -r requirements.txt
pip install pyinstaller
cd ..

echo [4/4] Using PyInstaller to package...
REM Run PyInstaller from root directory using optimized spec
cd pykovdatak
call .venv\Scripts\activate.bat
cd ..
pyinstaller kovdatak_portable_optimized.spec --clean
if %ERRORLEVEL% neq 0 (
    echo [ERROR] PyInstaller packaging failed
    exit /b 1
)

echo.
echo ========================================
echo   Build successful!
echo ========================================
echo.
echo Output directory: dist\Kovdatak\
echo.
echo Files included:
dir /b dist\Kovdatak\
echo.
echo Usage:
echo   1. Copy dist\Kovdatak\ directory to target computer
echo   2. Run Kovdatak.exe
echo   3. Browser will automatically open http://127.0.0.1:8787
echo.
echo Tip: You can compress dist\Kovdatak\ directory for distribution
echo ========================================

rem pause