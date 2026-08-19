"""
YOLO Proctor Engine Forwarder
─────────────────────────────────────────────────────────────────────────────
Maintains backwards compatibility for legacy imports by re-exporting from
the dedicated `inference.yolo_detector` module.
"""

from inference.yolo_detector import (
    YOLOProctorEngine,
    yolo_engine,
    logger,
)

__all__ = ["YOLOProctorEngine", "yolo_engine", "logger"]
