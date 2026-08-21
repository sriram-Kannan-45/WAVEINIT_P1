#!/bin/bash
set -e

echo "🔧 Installing required system graphics and GL libraries for OpenCV & MediaPipe..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq --no-install-recommends \
  libxcb1 \
  libx11-6 \
  libxext6 \
  libsm6 \
  libxrender1 \
  libglib2.0-0 \
  libegl1 \
  libgl1 \
  libxcb-render0 \
  libxcb-shape0 \
  libxcb-xfixes0 || true

# Activate virtual environment if present
if [ -d "/home/site/wwwroot/antenv" ]; then
  source /home/site/wwwroot/antenv/bin/activate
elif [ -d "./antenv" ]; then
  source ./antenv/bin/activate
fi

echo "🚀 Starting Gunicorn ASGI Server on port 8000..."
exec gunicorn -k uvicorn.workers.UvicornWorker --bind=0.0.0.0:8000 main:app --timeout 120
