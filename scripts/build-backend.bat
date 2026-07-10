@echo off
REM Moyan Python backend build script (Windows)
REM Pack agent-core into a standalone executable via PyInstaller

setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
set "AGENT_DIR=%ROOT%\agent-core"

echo === Moyan Backend Build (Windows) ===

if not exist "%AGENT_DIR%\.venv\Scripts\python.exe" (
    echo [ERROR] %AGENT_DIR%\.venv not found. Run setup first.
    exit /b 1
)

REM Install PyInstaller if missing
echo [1/3] Checking pyinstaller...
call "%AGENT_DIR%\.venv\Scripts\activate.bat" >nul 2>&1
python -m pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo     Installing pyinstaller...
    python -m pip install pyinstaller
    if errorlevel 1 (
        echo [ERROR] Failed to install pyinstaller.
        exit /b 1
    )
)

REM Clean old artifacts
echo [2/3] Cleaning old build...
if exist "%AGENT_DIR%\build" rmdir /s /q "%AGENT_DIR%\build"
if exist "%AGENT_DIR%\dist"  rmdir /s /q "%AGENT_DIR%\dist"

REM Pack
echo [3/3] Running PyInstaller...
cd /d "%AGENT_DIR%"
pyinstaller moyan-backend.spec --noconfirm
set "EXITCODE=%ERRORLEVEL%"

REM Deactivate venv (defensive: not all venvs ship deactivate.bat)
if exist "%AGENT_DIR%\.venv\Scripts\deactivate.bat" (
    call "%AGENT_DIR%\.venv\Scripts\deactivate.bat" >nul 2>&1
)

if not "%EXITCODE%"=="0" (
    echo [ERROR] PyInstaller build failed with exit code %EXITCODE%.
    exit /b %EXITCODE%
)

echo.
echo === Done ===
echo Backend built: %AGENT_DIR%\dist\moyan-backend.exe
echo (onefile mode: a single self-contained exe, ~50 MB)
endlocal