#!/usr/bin/env bash
set -e

# ==============================================================================
# WAVE INIT LMS — AUTO SCALING CONTROLLER SCRIPT (LINUX / UNIX)
# Scales Participant Application Server instances behind ONE Load Balancer
# ==============================================================================

INSTANCES=$1

if [ -z "$INSTANCES" ]; then
    echo "Usage: ./scale-app-servers.sh [number_of_instances]"
    echo "Example: ./scale-app-servers.sh 4"
    exit 1
fi

if [ "$INSTANCES" -lt 2 ]; then
    echo "[ERROR] Minimum production setup requires at least 2 Application Servers."
    exit 1
fi

echo "=============================================================================="
echo "🚀 Scaling Participant Application Servers to ${INSTANCES} instances..."
echo "=============================================================================="

docker compose -f docker-compose.production.yml up -d --scale app-server-1="${INSTANCES}" --no-recreate

echo "=============================================================================="
echo "🔄 Reloading ONE Managed Load Balancer configuration..."
echo "=============================================================================="

docker exec lms-load-balancer nginx -s reload

echo "✅ Successfully scaled to ${INSTANCES} App Server instances behind ONE Load Balancer."
