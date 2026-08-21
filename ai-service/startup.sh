#!/bin/bash
set -e

# ==============================================================================
# Azure App Service Linux - FastAPI AI Microservice Startup Script
# ==============================================================================

# Ensure headless environment flags for OpenCV, Matplotlib, Qt, and MediaPipe
export QT_QPA_PLATFORM="offscreen"
export MPLBACKEND="Agg"
export OPENCV_VIDEOIO_PRIORITY_MSMF="0"
export YOLO_VERBOSE="False"
export PYTHONUNBUFFERED="1"
export GLOG_minloglevel="2"

# 1. Activate Python virtual environment safely if present (do not fail if absent)
if [ -f "/antenv/bin/activate" ]; then
    echo "Using virtual environment at /antenv"
    . /antenv/bin/activate
elif [ -f "./antenv/bin/activate" ]; then
    echo "Using virtual environment at ./antenv"
    . ./antenv/bin/activate
elif [ -f "/home/site/wwwroot/antenv/bin/activate" ]; then
    echo "Using virtual environment at /home/site/wwwroot/antenv"
    . /home/site/wwwroot/antenv/bin/activate
elif [ -f ".venv/bin/activate" ]; then
    echo "Using virtual environment at .venv"
    . .venv/bin/activate
elif [ -f "venv/bin/activate" ]; then
    echo "Using virtual environment at venv"
    . venv/bin/activate
else
    echo "No local virtual environment script found; using container default Python: $(which python3 || which python)"
fi

# 2. Determine target port (Azure sets PORT or WEBSITES_PORT, default to 8000)
PORT="${PORT:-${WEBSITES_PORT:-8000}}"
HOST="0.0.0.0"

echo "=============================================================================="
echo "🚀 Starting FastAPI AI Service on ${HOST}:${PORT}"
echo "Python version: $(python3 --version 2>/dev/null || python --version)"
echo "Working directory: $(pwd)"
echo "=============================================================================="

# 3. Start the ASGI server with Gunicorn (UvicornWorker) or fallback to Uvicorn directly
if command -v gunicorn >/dev/null 2>&1; then
    exec gunicorn -k uvicorn.workers.UvicornWorker --bind="${HOST}:${PORT}" main:app --timeout 120 --workers 1
else
    exec uvicorn main:app --host "${HOST}" --port "${PORT}" --timeout-keep-alive 120
fi
