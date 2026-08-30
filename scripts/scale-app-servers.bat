@echo off
setlocal enabledelayedexpansion

REM ============================================================================
REM WAVE INIT LMS — AUTO SCALING CONTROLLER SCRIPT (WINDOWS)
REM Scales Participant Application Server instances behind ONE Load Balancer
REM ============================================================================

set INSTANCES=%1
if "%INSTANCES%"=="" (
    echo Usage: scale-app-servers.bat [number_of_instances]
    echo Example: scale-app-servers.bat 4
    exit /b 1
)

if %INSTANCES% LSS 2 (
    echo [ERROR] Minimum production setup requires at least 2 Application Servers.
    exit /b 1
)

echo ============================================================================
echo 🚀 Scaling Participant Application Servers to %INSTANCES% instances...
echo ============================================================================

docker compose -f docker-compose.production.yml up -d --scale app-server-1=%INSTANCES% --no-recreate

echo ============================================================================
echo 🔄 Reloading ONE Managed Load Balancer configuration...
echo ============================================================================

docker exec lms-load-balancer nginx -s reload

echo ✅ Successfully scaled to %INSTANCES% App Server instances behind ONE Load Balancer.
