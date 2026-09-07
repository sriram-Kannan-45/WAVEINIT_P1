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

# 0. Install system graphics & GL libraries across Debian/Ubuntu or Azure Linux / Mariner
if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq && apt-get install -y -qq --no-install-recommends libgl1 libgl1-mesa-glx libglib2.0-0 libxcb1 libxext6 libsm6 libxrender1 || true
elif command -v tdnf >/dev/null 2>&1; then
    tdnf install -y mesa-libGL glib2 libxcb libXext || true
elif command -v yum >/dev/null 2>&1; then
    yum install -y mesa-libGL glib2 libxcb libXext || true
fi

export PYTHONPATH="/home/site/wwwroot:$(pwd):$PYTHONPATH"

# 1. Activate Python virtual environment safely if present (do not fail if absent)
if [ -f "/home/site/wwwroot/antenv/bin/activate" ]; then
    echo "Using virtual environment at /home/site/wwwroot/antenv"
    . /home/site/wwwroot/antenv/bin/activate
elif [ -f "antenv/bin/activate" ]; then
    echo "Using virtual environment at antenv"
    . antenv/bin/activate
elif [ -f "./antenv/bin/activate" ]; then
    echo "Using virtual environment at ./antenv"
    . ./antenv/bin/activate
elif [ -f "/antenv/bin/activate" ]; then
    echo "Using virtual environment at /antenv"
    . /antenv/bin/activate
elif [ -f ".venv/bin/activate" ]; then
    echo "Using virtual environment at .venv"
    . .venv/bin/activate
elif [ -f "venv/bin/activate" ]; then
    echo "Using virtual environment at venv"
    . venv/bin/activate
else
    echo "No local virtual environment script found; using container default Python: $(which python3 || which python)"
fi

# 1.5 Verify OpenCV headless works without missing native GL libraries
if ! python -c "import cv2" >/dev/null 2>&1; then
    echo "⚠️  OpenCV import failed; ensuring opencv-python-headless is installed..."
    python -m pip uninstall -y opencv-python opencv-contrib-python 2>/dev/null || true
    python -m pip install --no-cache-dir opencv-python-headless 2>/dev/null || true
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
if python -c "import gunicorn, uvicorn" >/dev/null 2>&1; then
    exec gunicorn -k uvicorn.workers.UvicornWorker --bind="${HOST}:${PORT}" main:app --timeout 120 --workers 1
elif python -c "import uvicorn" >/dev/null 2>&1; then
    exec python -m uvicorn main:app --host "${HOST}" --port "${PORT}" --timeout-keep-alive 120
elif command -v uvicorn >/dev/null 2>&1; then
    exec uvicorn main:app --host "${HOST}" --port "${PORT}" --timeout-keep-alive 120
else
    echo "❌ Error: Neither gunicorn nor uvicorn found in Python environment"
    exit 1
fi
