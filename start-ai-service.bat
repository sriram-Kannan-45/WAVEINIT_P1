@echo off
echo Starting AI Quiz Service...
cd /d %~dp0
cd ai-service
echo Checking Python installation...
python --version
if errorlevel 1 (
    echo Python not found! Please install Python 3.8+
    pause
    exit /b 1
)
echo Installing requirements...
pip install -r requirements.txt
echo Starting FastAPI service on port 8000...
python main.py
pause
