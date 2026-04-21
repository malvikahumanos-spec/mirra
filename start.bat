@echo off
echo.
echo ========================================
echo   MIRRA - Your Mirra
echo   100%% Local. 100%% Private.
echo ========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found! Install Python 3.10+
    pause
    exit /b 1
)

:: Run start script
python scripts/start.py

pause
