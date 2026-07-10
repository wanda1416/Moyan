@echo off
REM Moyan artifact collector (Windows)
REM Copies build outputs from tauri target to <root>/dist/

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
set "BUNDLE_DIR=%ROOT%\tauri-app\src-tauri\target\release\bundle"
set "RELEASE_DIR=%ROOT%\tauri-app\src-tauri\target\release"
set "DIST_DIR=%ROOT%\dist"

echo === Moyan Artifact Collect ===
echo(

REM Clean and recreate dist/
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%" >nul 2>&1
mkdir "%DIST_DIR%" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to create %DIST_DIR%
    exit /b 1
)

set "COUNT=0"

REM --- NSIS installer ---
if exist "%BUNDLE_DIR%\nsis" call :copy_glob "%BUNDLE_DIR%\nsis\*-setup.exe"

REM --- MSI installer ---
if exist "%BUNDLE_DIR%\msi" call :copy_glob "%BUNDLE_DIR%\msi\*.msi"

REM --- macOS DMG ---
if exist "%BUNDLE_DIR%\dmg" call :copy_glob "%BUNDLE_DIR%\dmg\*.dmg"

REM --- macOS .app bundle ---
if exist "%BUNDLE_DIR%\macos" (
    for /d %%d in ("%BUNDLE_DIR%\macos\*.app") do (
        if exist "%%d" (
            xcopy /E /I /Y /Q "%%d" "%DIST_DIR%\%%~nxd" >nul
            echo   [OK] %%~nxd
            set /a COUNT+=1
        )
    )
)

REM --- Linux DEB ---
if exist "%BUNDLE_DIR%\deb" call :copy_glob "%BUNDLE_DIR%\deb\*.deb"

REM --- Linux RPM ---
if exist "%BUNDLE_DIR%\rpm" call :copy_glob "%BUNDLE_DIR%\rpm\*.rpm"

REM --- Linux AppImage ---
if exist "%BUNDLE_DIR%\appimage" call :copy_glob "%BUNDLE_DIR%\appimage\*.AppImage"

echo(
echo === Collect Summary ===
echo Total entries: !COUNT!
echo Output:        %DIST_DIR%
echo(
dir /B "%DIST_DIR%" 2>nul

endlocal
goto :eof

REM Helper: copy files matching a glob pattern
:copy_glob
for %%f in ("%~1") do (
    if exist "%%f" (
        copy /Y "%%f" "%DIST_DIR%\" >nul
        echo   [OK] %%~nxf
        set /a COUNT+=1
    )
)
goto :eof
