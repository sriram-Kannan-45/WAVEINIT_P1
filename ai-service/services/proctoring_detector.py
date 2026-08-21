"""
MediaPipe Proctoring Detector Forwarder
─────────────────────────────────────────────────────────────────────────────
Maintains backwards compatibility for legacy imports by re-exporting from
the dedicated `inference.proctoring_detector` module.
"""

from inference.proctoring_detector import (
    MediaPipeProctorEngine,
    proctor_engine,
    inspect_b64_with_gemini,
    logger,
)

__all__ = ["MediaPipeProctorEngine", "proctor_engine", "inspect_b64_with_gemini", "logger"]
