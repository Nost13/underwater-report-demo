@echo off
setlocal
cd /d "%~dp0"
set "DEMO_NODE=%~dp0runtime\node.exe"
if not exist "%DEMO_NODE%" (
  where node.exe >nul 2>nul
  if errorlevel 1 (
    echo Cannot find the included Node runtime.
    pause
    exit /b 1
  )
  set "DEMO_NODE=node.exe"
)
"%DEMO_NODE%" "%~dp0server.mjs"
endlocal
