@echo off
echo.
echo ========================================
echo   MIRRA - First Time Setup
echo   100%% Local. 100%% Private.
echo ========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found! Install Python 3.10+
    echo Download from: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Run setup
python scripts/setup.py

pause
