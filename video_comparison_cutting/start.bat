@echo off
REM Video Clip Detection System - Start Script

echo ========================================
echo   Video Clip Detection System
echo ========================================
echo.

REM Step 1: Kill processes using ports
echo [1/4] Cleaning up port 3001 and 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo     Killing PID: %%a on port 3001
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo     Killing PID: %%a on port 5173
    taskkill /F /PID %%a >nul 2>&1
)
echo     Done
echo.

REM Step 2: Clean upload storage
echo [2/4] Cleaning upload storage...
if exist uploads (
    echo     Cleaning uploads directory...
    del /q "uploads\*" 2>nul
    echo     Done
) else (
    echo     No uploads directory found, skipping
)
echo.

REM Step 3: Check if dependencies are installed
echo [3/4] Checking dependencies...
if not exist node_modules (
    echo     Dependencies not found! Run setup.bat first.
    echo.
    pause
    exit /b 1
)
echo     Dependencies found
echo.

REM Step 4: Start development server
echo [4/4] Starting development server...
echo.
echo     Frontend: http://localhost:5173
echo     API:      http://localhost:3001
echo.
start cmd /k "npm run dev"

REM Wait for server to start
echo     Waiting for server to start...
timeout /t 5 /nobreak >nul

REM Open browser
start http://localhost:5173
echo.
echo ========================================
echo   Startup Complete!
echo ========================================
echo.
echo Visit: http://localhost:5173
echo.
echo Press any key to exit this window...
pause >nul
