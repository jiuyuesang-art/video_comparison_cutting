@echo off
setlocal enabledelayedexpansion

REM Video Clip Detection System - Setup Script
REM Usage: setup.bat [/clean] [/skip-ffmpeg]
REM   /clean       - Clean install (removes node_modules first)
REM   /skip-ffmpeg - Skip FFmpeg installation check

echo ========================================
echo   Video Clip Detection System
echo   Dependency Installation
echo ========================================
echo.

REM Parse command line arguments
set CLEAN_INSTALL=0
set SKIP_FFMPEG=0
set CONFIRMED_CLEAN=0

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="/clean" (
    set CLEAN_INSTALL=1
    shift
    goto parse_args
)
if /i "%~1"=="/skip-ffmpeg" (
    set SKIP_FFMPEG=1
    shift
    goto parse_args
)
if /i "%~1"=="-clean" (
    set CLEAN_INSTALL=1
    shift
    goto parse_args
)
shift
goto parse_args

:args_done

set INSTALL_FAILED=0
set MISSING_DEPS=

REM Step 1: Check and install FFmpeg
echo [1/3] Checking FFmpeg installation...
echo.

if %SKIP_FFMPEG%==1 (
    echo     Skipping FFmpeg check (--skip-ffmpeg specified)
) else (
    where ffmpeg >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo     FFmpeg not found. Installing...
        echo.

        where winget >nul 2>&1
        if %ERRORLEVEL% equ 0 (
            echo     Using winget to install FFmpeg...
            winget install --id=Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
            if %ERRORLEVEL% equ 0 (
                echo     FFmpeg installed via winget successfully.
            ) else (
                echo     Winget installation failed. Trying alternative method...
                powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile 'ffmpeg.zip'}"
                powershell -Command "Expand-Archive -Path 'ffmpeg.zip' -DestinationPath 'C:\ffmpeg' -Force"
                setx PATH "%PATH%;C:\ffmpeg\ffmpeg\bin" >nul
                del ffmpeg.zip 2>nul
                echo     FFmpeg downloaded and extracted to C:\ffmpeg
                echo     Please restart your computer or run 'refreshenv' to update PATH
                set INSTALL_FAILED=1
                set MISSING_DEPS=!MISSING_DEPS! FFmpeg
            )
        ) else (
            echo     Winget not available. Downloading FFmpeg directly...
            powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile 'ffmpeg.zip'}"
            powershell -Command "Expand-Archive -Path 'ffmpeg.zip' -DestinationPath 'C:\ffmpeg' -Force"
            setx PATH "%PATH%;C:\ffmpeg\ffmpeg\bin" >nul
            del ffmpeg.zip 2>nul
            echo     FFmpeg downloaded and extracted to C:\ffmpeg
            echo     Please restart your computer or run 'refreshenv' to update PATH
            set INSTALL_FAILED=1
            set MISSING_DEPS=!MISSING_DEPS! FFmpeg
        )
    ) else (
        echo     FFmpeg is already installed.
        ffmpeg -version | findstr /C:"fffmpeg version"
    )
)
echo.

REM Step 2: Check and manage node_modules
echo [2/3] Checking node_modules...
echo.

REM Check if @xenova/transformers exists (contains CLIP model cache)
set PROTECT_MODELS=0
if exist "node_modules\@xenova\transformers" (
    echo     @xenova/transformers found - model cache detected
    set PROTECT_MODELS=1
)

if %CLEAN_INSTALL%==1 (
    if %PROTECT_MODELS%==1 (
        echo.
        echo     WARNING: CLIP model cache will be deleted!
        echo     Models in @xenova/transformers will be removed.
        echo     This may require re-downloading large model files.
        echo.
        set /p CONFIRMED_CLEAN_CHOICE="Continue with clean install? (y/N): "
        if /i "!CONFIRMED_CLEAN_CHOICE!"=="y" (
            echo.
            echo     Cleaning node_modules (user confirmed)...
            rd /s /q node_modules 2>nul
            echo     Done
            set CLEAN_DONE=1
            set PROTECT_MODELS=0
        ) else (
            echo.
            echo     Clean install cancelled. Preserving model cache.
            set CLEAN_DONE=0
        )
    ) else (
        echo     Performing clean installation...
        rd /s /q node_modules 2>nul
        echo     Done
        set CLEAN_DONE=1
    )
) else (
    if exist node_modules (
        if %PROTECT_MODELS%==1 (
            echo.
            echo     CLIP model cache detected!
            echo     Automatically preserving node_modules to protect model files.
            echo     Use "setup.bat /clean" to force clean installation.
            set CLEAN_DONE=0
        ) else (
            echo     Found existing node_modules
            echo     Checking for critical dependencies...

            if exist "node_modules\express" (
                echo     Dependencies appear to be installed
            )

            echo.
            echo     Options:
            echo     [1] Keep existing node_modules
            echo     [2] Clean and reinstall everything
            echo.
            set /p CLEAN_CHOICE="Enter your choice (1 or 2): "

            if "!CLEAN_CHOICE!"=="2" (
                echo.
                echo     Cleaning old node_modules...
                rd /s /q node_modules 2>nul
                echo     Done
                set CLEAN_DONE=1
            ) else (
                echo.
                echo     Skipping cleanup - keeping existing node_modules
                set CLEAN_DONE=0
            )
        )
    ) else (
        echo     No existing node_modules found
        set CLEAN_DONE=1
    )
)
echo.

REM Step 3: Install dependencies
echo [3/3] Installing dependencies...
echo.

REM Only run npm install if we cleaned node_modules or if it doesn't exist
if %CLEAN_DONE%==1 (
    echo     Running npm install...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo.
        echo ========================================
        echo   Installation Failed!
        echo ========================================
        echo.
        echo     Some dependencies could not be installed.
        echo     Error code: %ERRORLEVEL%
        echo.
        echo     Common solutions:
        echo     1. Check your internet connection
        echo     2. Try running: npm cache clean --force
        echo.
        echo     If you see sharp/libvips errors:
        echo     - npm config set sharp_binary_host https://npmmirror.com/mirrors/sharp
        echo     - npm config set sharp_libvips_binary_host https://npmmirror.com/mirrors/sharp-libvips
        echo     - npm install
        echo.
        set INSTALL_FAILED=1
        set MISSING_DEPS=!MISSING_DEPS! npm_dependencies
    )
) else (
    echo     Skipping npm install - node_modules preserved
    echo     If you encounter issues, run: npm install
)
echo.

REM Step 4: Verify critical dependencies
echo [4/4] Verifying dependencies...
echo.

set VERIFY_PASSED=1

if exist node_modules (
    if not exist "node_modules\express" (
        echo     [X] express - NOT FOUND
        set VERIFY_PASSED=0
        set INSTALL_FAILED=1
        set MISSING_DEPS=!MISSING_DEPS! express
    ) else (
        echo     [OK] express
    )

    if not exist "node_modules\fluent-ffmpeg" (
        echo     [X] fluent-ffmpeg - NOT FOUND
        set VERIFY_PASSED=0
        set INSTALL_FAILED=1
        set MISSING_DEPS=!MISSING_DEPS! fluent-ffmpeg
    ) else (
        echo     [OK] fluent-ffmpeg
    )

    if not exist "node_modules\sharp" (
        echo     [X] sharp - NOT FOUND
        set VERIFY_PASSED=0
        set INSTALL_FAILED=1
        set MISSING_DEPS=!MISSING_DEPS! sharp
    ) else (
        echo     [OK] sharp
    )

    if not exist "node_modules\@xenova\transformers" (
        echo     [X] @xenova/transformers - NOT FOUND
        set VERIFY_PASSED=0
        set INSTALL_FAILED=1
        set MISSING_DEPS=!MISSING_DEPS! @xenova/transformers
    ) else (
        echo     [OK] @xenova/transformers
    )
)

if %SKIP_FFMPEG%==0 (
    where ffmpeg >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo     [X] FFmpeg - NOT FOUND
        set VERIFY_PASSED=0
        set INSTALL_FAILED=1
        set MISSING_DEPS=!MISSING_DEPS! FFmpeg
    ) else (
        echo     [OK] FFmpeg
    )
)
echo.

REM Final result
echo ========================================
if %INSTALL_FAILED%==1 (
    echo   Setup Completed with Errors
) else (
    echo   Setup Complete!
)
echo ========================================
echo.

if %INSTALL_FAILED%==0 (
    echo     All dependencies installed successfully!
    echo.
    echo     You can now run start.bat to launch the application.
) else (
    echo     WARNING: Some dependencies could not be installed.
    echo.
    if defined MISSING_DEPS (
        echo     Missing dependencies: !MISSING_DEPS!
        echo.
    )
    echo     Please resolve the issues above and run setup.bat again.
)

if %PROTECT_MODELS%==1 (
    echo.
    echo     Note: CLIP model cache has been preserved.
)

echo.
pause
endlocal
exit /b %INSTALL_FAILED%
