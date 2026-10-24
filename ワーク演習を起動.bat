@echo off
rem Nespe Work exercise (AI grading) launcher - double-click to start the local server
cd /d "%~dp0"
title Nespe Work Server
rem Use UTF-8 so the server's Japanese log is shown correctly
chcp 65001 >nul

rem Check Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js not found. Please install it from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

rem If a server is already running on port 8787, just open the browser
netstat -ano | findstr "LISTENING" | findstr ":8787" >nul 2>nul
if %errorlevel%==0 (
  echo Server is already running. Opening the browser...
  start http://localhost:8787/apps/work.html
  timeout /t 2 >nul
  exit /b 0
)

rem Notice if the API key is not set
if not exist "server\.env" if "%ANTHROPIC_API_KEY%"=="" (
  echo [Notice] ANTHROPIC_API_KEY is not set.
  echo          To use AI grading, set it in server\.env  ^(see server\.env.example^).
  echo          You can still read problems without it.
  echo.
)

rem Open the browser after ~2s in the background. The server runs in THIS window.
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:8787/apps/work.html"

echo Starting server... To stop: press Ctrl+C or close this window.
echo URL: http://localhost:8787/apps/work.html
echo.
node server\relay.js

echo.
echo Server stopped. If there is an error above, please review it.
pause