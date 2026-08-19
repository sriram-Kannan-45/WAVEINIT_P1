"""
Enterprise YOLOv8 Proctoring Engine
====================================
Singleton camera monitoring and object detection service using Ultralytics YOLO.
Reused across Quiz, Coding, and Interview modules for PC and Mobile camera streams.
"""

import os
import sys
import time
import base64
import logging
from typing import Dict, Any, List, Optional, Tuple
from collections import deque

import cv2
import numpy as np

logger = logging.getLogger("ai-quiz.yolo-proctor")

class YOLOProctorEngine:
    """
    Unified YOLO Proctoring Engine that loads the model once and reuses it for
    concurrent monitoring sessions across Quiz, Coding, and Interview modules.
    """
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(YOLOProctorEngine, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        
        self.model = None
        self.model_path = None
        self.class_names = {}
        self.person_class_id = None
        self.phone_class_ids = []
        self.laptop_class_ids = []
        self.initialized_ok = False
        self.init_error = None
        
        # Session state memory: sessionId -> { last_event: ..., last_time: ..., event_counts: ... }
        self.session_states: Dict[str, Dict[str, Any]] = {}
        
        self._load_model()
        self._initialized = True

    def _find_model_file(self) -> Optional[str]:
        """
        Locates the specified YOLO model weights file across expected candidate paths.
        Strictly prioritizes newfolder/8/yolov8n.pt and its workspace counterparts.
        """
        script_dir = os.path.dirname(os.path.abspath(__file__))
        service_root = os.path.dirname(script_dir)
        workspace_root = os.path.dirname(service_root)

        candidates = [
            # Primary authoritative location
            os.path.join(service_root, "models", "yolov8n.pt"),
            # Specified path by user
            os.path.join(workspace_root, "newfolder", "8", "yolov8n.pt"),
            os.path.join(service_root, "newfolder", "8", "yolov8n.pt"),
            # Existing folder paths in workspace
            os.path.join(service_root, "New folder (8)", "yolo11s.pt"),
            os.path.join(service_root, "New folder (8)", "yolov8n.pt"),
            os.path.join(workspace_root, "ai-service", "New folder (8)", "yolo11s.pt"),
            os.path.join(workspace_root, "ai-service", "New folder (8)", "yolov8n.pt"),
            r"d:\New folder (8)\AI-Based-online-exam-proctoring-System\futurproctor\proctoring\ml_models\yolo11s.pt",
            r"d:\New folder (8)\best.pt",
        ]

        # Environment variable override if specified
        env_model = os.getenv("YOLO_MODEL_PATH")
        if env_model:
            candidates.insert(0, env_model)

        for path in candidates:
            if os.path.exists(path) and os.path.isfile(path) and os.path.getsize(path) > 1000:
                return os.path.abspath(path)
        return None

    def _load_model(self):
        """Loads the YOLO model into memory once."""
        try:
            from ultralytics import YOLO
        except ImportError as e:
            self.init_error = f"Ultralytics library not installed: {e}"
            logger.error(self.init_error)
            return

        model_file = self._find_model_file()
        if not model_file:
            self.init_error = "YOLO model initialization failed: newfolder/8/yolov8n.pt (file not found)"
            logger.error(self.init_error)
            return

        self.model_path = model_file
        try:
            logger.info(f"Loading YOLO model from {model_file}...")
            self.model = YOLO(model_file)
            
            # Introspect actual classes
            if hasattr(self.model, "names") and isinstance(self.model.names, dict):
                self.class_names = self.model.names
            elif hasattr(self.model, "names") and isinstance(self.model.names, (list, tuple)):
                self.class_names = {i: name for i, name in enumerate(self.model.names)}
            else:
                self.class_names = {}

            logger.info(f"YOLO model loaded successfully. Total classes: {len(self.class_names)}")
            logger.info(f"Detected classes: {self.class_names}")

            # Identify key class IDs dynamically from real class names
            self.phone_class_ids = []
            self.laptop_class_ids = []
            for cid, cname in self.class_names.items():
                name_lower = str(cname).lower()
                if name_lower in ("person", "candidate", "student", "user"):
                    self.person_class_id = cid
                elif any(p in name_lower for p in ["phone", "mobile", "cell", "cell phone", "smartphone"]):
                    self.phone_class_ids.append(cid)
                elif any(l in name_lower for l in ["laptop", "computer", "notebook"]):
                    self.laptop_class_ids.append(cid)

            self.initialized_ok = True
            self.init_error = None
        except Exception as e:
            self.init_error = f"YOLO model initialization failed: {model_file} ({e})"
            logger.error(self.init_error)
            self.initialized_ok = False

    def get_status(self) -> Dict[str, Any]:
        """Returns health and introspection status of the YOLO model."""
        return {
            "status": "UP" if self.initialized_ok else "ERROR",
            "model_path": self.model_path,
            "classes_count": len(self.class_names),
            "classes": self.class_names,
            "error": self.init_error,
            "active_sessions": len(self.session_states)
        }

    def decode_frame(self, b64_frame: str) -> Optional[np.ndarray]:
        """Decodes a base64 image data URL or raw string to OpenCV BGR numpy array."""
        try:
            if "," in b64_frame:
                b64_frame = b64_frame.split(",", 1)[1]
            frame_bytes = base64.b64decode(b64_frame)
            np_arr = np.frombuffer(frame_bytes, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            return img
        except Exception as e:
            logger.warning(f"Error decoding base64 frame: {e}")
            return None

    def analyze_frame(
        self,
        frame_data: str,
        session_id: str = "default",
        participant_id: Optional[Any] = None,
        module_type: str = "QUIZ",
        camera_source: str = "PC_CAMERA",
        confidence_threshold: float = 0.35,
        timestamp_ms: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Runs YOLO inference on a single video frame and produces structured proctoring events.
        """
        if not self.initialized_ok or self.model is None:
            return {
                "success": False,
                "error": self.init_error or "YOLO model initialization failed: newfolder/8/yolov8n.pt",
                "proctoring_event": None
            }

        start_time = time.time()
        img = self.decode_frame(frame_data)
        if img is None:
            return {
                "success": False,
                "error": "Invalid or unreadable image frame",
                "proctoring_event": None
            }

        h, w = img.shape[:2]

        # Resize if oversized for performance (max 640px)
        if max(h, w) > 640:
            scale = 640.0 / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

        # Run inference
        try:
            results = self.model(img, conf=confidence_threshold, verbose=False)
        except Exception as e:
            logger.error(f"Inference error: {e}")
            return {
                "success": False,
                "error": f"Inference execution failed: {e}",
                "proctoring_event": None
            }

        detections = []
        person_count = 0
        phone_count = 0
        detected_classes = []
        max_confidence = 0.0

        if results and len(results) > 0:
            boxes = results[0].boxes
            for box in boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                cls_name = self.class_names.get(cls_id, f"class_{cls_id}")
                xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]

                detections.append({
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": round(conf, 4),
                    "box": [round(coord, 1) for coord in xyxy]
                })

                detected_classes.append(cls_name)
                if conf > max_confidence:
                    max_confidence = conf

                if cls_id == self.person_class_id or str(cls_name).lower() == "person":
                    person_count += 1
                elif cls_id in self.phone_class_ids or "phone" in str(cls_name).lower() or "mobile" in str(cls_name).lower():
                    phone_count += 1

        # Determine Proctoring Event Type based on actual detections
        event_type = "NO_PERSON_DETECTED"
        severity = "MEDIUM"

        if phone_count > 0:
            event_type = "PHONE_DETECTED"
            severity = "HIGH"
        elif person_count > 1:
            event_type = "MULTIPLE_PERSONS_DETECTED"
            severity = "HIGH"
        elif person_count == 1:
            event_type = "PERSON_DETECTED"
            severity = "INFO"
        elif len(detections) > 0:
            event_type = "OBJECT_DETECTED"
            severity = "LOW"
        else:
            event_type = "NO_PERSON_DETECTED"
            severity = "MEDIUM"

        inference_time_ms = round((time.time() - start_time) * 1000, 2)
        current_time_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # Throttling & Session Tracking: avoid emitting identical events continuously
        session_key = f"{session_id}_{camera_source}"
        session_state = self.session_states.setdefault(session_key, {
            "last_event_type": None,
            "last_emitted_time": 0,
            "same_event_count": 0,
        })

        is_state_change = (session_state["last_event_type"] != event_type)
        time_since_last = time.time() - session_state["last_emitted_time"]
        should_emit_to_backend = is_state_change or (severity in ("HIGH", "MEDIUM") and time_since_last > 4.0) or (time_since_last > 10.0)

        if should_emit_to_backend:
            session_state["last_event_type"] = event_type
            session_state["last_emitted_time"] = time.time()

        proctoring_event = {
            "participantId": participant_id,
            "sessionId": session_id,
            "moduleType": module_type.upper(),
            "cameraSource": camera_source.upper(),
            "eventType": event_type,
            "severity": severity,
            "confidence": round(max_confidence, 2) if detections else 1.0,
            "timestamp": current_time_iso,
            "detectionsCount": len(detections),
            "detectedClasses": detected_classes,
            "inferenceTimeMs": inference_time_ms,
            "shouldBroadcast": should_emit_to_backend,
            "status": "MONITORING"
        }

        return {
            "success": True,
            "proctoring_event": proctoring_event,
            "detections": detections,
            "inference_time_ms": inference_time_ms
        }


# Global singleton instance
yolo_engine = YOLOProctorEngine()
