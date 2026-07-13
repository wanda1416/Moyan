@echo off
REM Moyan Python backend build script (Windows)
REM Pack agent-core into a standalone executable via PyInstaller

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
set "AGENT_DIR=%ROOT%\agent-core"

echo === Moyan Backend Build (Windows) ===

if not exist "%AGENT_DIR%\.venv\Scripts\python.exe" (
    echo [ERROR] %AGENT_DIR%\.venv not found. Run setup first.
    exit /b 1
)

set "VENV_PYTHON=%AGENT_DIR%\.venv\Scripts\python.exe"
echo Using Python: %VENV_PYTHON%

REM Install PyInstaller if missing
echo [1/3] Checking pyinstaller...
"%VENV_PYTHON%" -m pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo     Installing pyinstaller...
    "%VENV_PYTHON%" -m pip install pyinstaller
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
"%VENV_PYTHON%" -m PyInstaller moyan-backend.spec --noconfirm
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    echo [ERROR] PyInstaller build failed with exit code %EXITCODE%.
    exit /b %EXITCODE%
)

REM ── Post-build diagnostics ──
echo.
echo === Post-build Diagnostics ===
for %%F in ("%AGENT_DIR%\dist\moyan-backend\moyan-backend.exe") do echo   Exe size: %%~zF bytes

REM Check _internal directory size
set "INTERNAL_DIR=%AGENT_DIR%\dist\moyan-backend\_internal"
if exist "%INTERNAL_DIR%" (
    set "TOTAL_SIZE=0"
    for /R "%INTERNAL_DIR%" %%F in (*) do set /a TOTAL_SIZE+=%%~zF
    set /a TOTAL_MB=!TOTAL_SIZE!/1048576
    echo   _internal/: ~!TOTAL_MB! MB
) else (
    echo   [WARN] _internal/ directory not found!
)

REM Check warn file for missing critical modules
set "WARN_FILE=%AGENT_DIR%\build\moyan-backend\warn-moyan-backend.txt"
if exist "%WARN_FILE%" (
    for %%M in (fastapi uvicorn pydantic onnxruntime faiss numpy PIL) do (
        findstr /C:"missing module named %%M -" "%WARN_FILE%" >nul 2>&1
        if not errorlevel 1 echo   [WARN] missing module: %%M
    )
) else (
    echo   [WARN] warn file not found: %WARN_FILE%
)

echo.
echo === Done ===
echo Backend built: %AGENT_DIR%\dist\moyan-backend\

REM Exit with PyInstaller's exit code
endlocal & exit /b %EXITCODE%
