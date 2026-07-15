@echo off
title LMS AI Quiz - Clean Startup
color 0C

echo ==================================================
echo   LMS AI Quiz Feature - Clean Restart
echo ==================================================
echo.

echo [1/3] Stopping existing Node.js processes...
taskkill /f /im node.exe >nul 2>&1

echo [2/3] Cleaning Vite cache...
if exist "%~dp0frontend\.vite" rd /s /q "%~dp0frontend\.vite"
if exist "%~dp0frontend\node_modules\.vite" rd /s /q "%~dp0frontend\node_modules\.vite"
if exist "%~dp0frontend\dist" rd /s /q "%~dp0frontend\dist"

echo [3/3] Starting all services...
call "%~dp0start-all.bat"
