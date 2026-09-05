"""
Enterprise YOLO11s Mobile Camera Proctoring Engine
===================================================
Singleton mobile camera monitoring and composition validation engine using Ultralytics YOLO.
Dedicated exclusively to the Mobile Camera Pipeline (side-angle view) across Quiz, Coding,
and Interview modules.

Validates:
  1. Concurrent presence of `person` AND `laptop` classes in side-angle view
  2. Relative geometric positioning sanity checks
  3. Multi-frame rolling state machine to prevent single-frame false triggers
  4. Explicit state transitions:
     MOBILE_CAMERA_CONNECTING, PERMISSION_REQUIRED, POSITIONING_REQUIRED,
     WAITING_FOR_PERSON, WAITING_FOR_LAPTOP, VALID, WARNING, VIOLATION, DISCONNECTED
"""

import os
import sys

# Ensure headless execution
os.environ["QT_QPA_PLATFORM"] = "offscreen"
os.environ["MPLBACKEND"] = "Agg"
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"
os.environ["YOLO_VERBOSE"] = "False"

import time
import base64
import logging
from typing import Dict, Any, List, Optional, Tuple
from collections import deque
from .mobile_composition import evaluate_mobile

import cv2
import numpy as np

logger = logging.getLogger("ai-service.yolo-proctor")


class YOLOProctorEngine:
    """
    Unified YOLO Mobile Proctoring Engine that loads yolo11s once and validates
    side-angle camera composition (person + laptop) for Quiz, Coding, and Interview.
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
        self.book_class_ids = []
        self.initialized_ok = False
        self.init_error = None

        # Session state memory: sessionId -> {
        #   last_event_type, last_state, consecutive_valid_frames,
        #   consecutive_missing_laptop, consecutive_missing_person,
        #   history: deque, last_frame_time
        # }
        self.session_states: Dict[str, Dict[str, Any]] = {}

        self._load_model()
        self._initialized = True

    def _find_model_file(self) -> Optional[str]:
        """
        Locates the specified YOLO model weights file across candidate paths,
        strictly prioritizing yolo11s.pt.
        """
        script_dir = os.path.dirname(os.path.abspath(__file__))
        service_root = os.path.dirname(script_dir)
        workspace_root = os.path.dirname(service_root)

        candidates = [
            # Specified yolo11s locations
            os.path.join(service_root, "New folder (8)", "yolo11s.pt"),
            os.path.join(workspace_root, "ai-service", "New folder (8)", "yolo11s.pt"),
            os.path.join(service_root, "models", "yolo11s.pt"),
            r"d:\New folder (8)\AI-Based-online-exam-proctoring-System\futurproctor\proctoring\ml_models\yolo11s.pt",
            # Fallback candidates
            os.path.join(service_root, "models", "yolov8n.pt"),
            os.path.join(service_root, "New folder (8)", "yolov8n.pt"),
            os.path.join(workspace_root, "newfolder", "8", "yolov8n.pt"),
        ]

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
            logger.info("Local model file not found in candidates, defaulting to 'yolo11s.pt' for automatic download")
            model_file = "yolo11s.pt"

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

            # Identify key class IDs dynamically from real class names
            self.phone_class_ids = []
            self.laptop_class_ids = []
            self.book_class_ids = []
            for cid, cname in self.class_names.items():
                name_lower = str(cname).lower()
                if name_lower in ("person", "candidate", "student", "user"):
                    self.person_class_id = cid
                elif any(p in name_lower for p in ["phone", "cell phone", "mobile", "smartphone"]):
                    self.phone_class_ids.append(cid)
                elif any(l in name_lower for l in ["laptop", "computer", "notebook", "tv", "monitor"]):
                    self.laptop_class_ids.append(cid)
                elif any(b in name_lower for b in ["book", "paper", "notes"]):
                    self.book_class_ids.append(cid)

            self.initialized_ok = True
            self.init_error = None
        except Exception as e:
            self.init_error = f"YOLO model initialization failed: {model_file} ({e})"
            logger.error(self.init_error)
            self.initialized_ok = False

    def get_status(self) -> Dict[str, Any]:
        """Returns health and introspection status of the YOLO model."""
        from importlib.metadata import version
        return {
            "status": "UP" if self.initialized_ok else "ERROR",
            "model_path": self.model_path,
            "ultralytics_version": version("ultralytics"),
            "device": str(self.model.device) if self.model is not None else None,
            "classes_count": len(self.class_names),
            "classes": self.class_names,
            "error": self.init_error,
            "active_sessions": len(self.session_states),
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

    def _get_session_state(self, session_key: str) -> Dict[str, Any]:
        if session_key not in self.session_states:
            self.session_states[session_key] = {
                "last_event_type": None,
                "last_state": "MOBILE_CAMERA_CONNECTING",
                "last_emitted_time": 0,
                "consecutive_valid": 0,
                "consecutive_no_person": 0,
                "consecutive_no_laptop": 0,
                "consecutive_multi_person": 0,
                "history": deque(maxlen=20),
                "last_frame_ts": time.time(),
            }
        return self.session_states[session_key]

    def cleanup_stale_sessions(
        self,
        max_idle_seconds: float = float(
            os.getenv("PROCTORING_SESSION_MAX_IDLE_SECONDS", "900")
        ),
    ) -> int:
        """Evict mobile-composition sessions whose frames stopped arriving.

        A single long-lived AI instance can accumulate session_states entries if a
        participant disconnects mid-assessment. Frames refresh ``last_frame_ts``;
        states idle longer than ``max_idle_seconds`` are dropped to bound memory.
        """
        now = time.time()
        stale = [
            key
            for key, st in list(self.session_states.items())
            if now - st.get("last_frame_ts", now) > max_idle_seconds
        ]
        for key in stale:
            self.session_states.pop(key, None)
        return len(stale)

    def validate_mobile_composition(
        self,
        detections: List[Dict[str, Any]],
        img_w: int,
        img_h: int,
        session_key: str,
    ) -> Tuple[str, str, str, float]:
        """
        Evaluates side-angle camera composition:
        Requires both 'person' and 'laptop' present concurrently, with valid
        relative positioning and rolling consecutive duration.

        Returns: (state, event_type, message, confidence)
        """
        state_data = self._get_session_state(session_key)

        persons = [d for d in detections if d["class_name"].lower() == "person" or d["class_id"] == self.person_class_id]
        laptops = [d for d in detections if d["class_id"] in self.laptop_class_ids or any(k in d["class_name"].lower() for k in ["laptop", "computer", "notebook", "tv", "monitor"])]
        phones = [d for d in detections if d["class_id"] in self.phone_class_ids or any(k in d["class_name"].lower() for k in ["phone", "cell"])]

        person_count = len(persons)
        laptop_count = len(laptops)
        phone_count = len(phones)

        # 1. Check Multiple Persons
        if person_count > 1:
            state_data["consecutive_multi_person"] += 1
            state_data["consecutive_valid"] = 0
            if state_data["consecutive_multi_person"] >= 2:
                return (
                    "VIOLATION",
                    "MULTIPLE_PERSONS_DETECTED",
                    f"Multiple people detected ({person_count} persons in view). Ensure you are alone.",
                    max([p["confidence"] for p in persons] or [0.9]),
                )
            return (
                "WARNING",
                "MULTIPLE_PERSONS_DETECTED",
                "Multiple people visible in side camera view.",
                0.8,
            )
        else:
            state_data["consecutive_multi_person"] = 0

        # 2. Check Unauthorized Secondary Phone in Mobile Feed
        if phone_count > 0:
            return (
                "VIOLATION",
                "PHONE_DETECTED",
                "Secondary mobile phone / electronic device detected in view.",
                max([p["confidence"] for p in phones]),
            )

        # 3. Check Person Presence
        if person_count == 0:
            state_data["consecutive_no_person"] += 1
            state_data["consecutive_valid"] = 0
            if state_data["consecutive_no_person"] >= 3:
                return (
                    "WAITING_FOR_PERSON",
                    "NO_PERSON_DETECTED",
                    "Candidate not detected — position mobile camera so your side profile is visible.",
                    0.9,
                )
            return (
                "POSITIONING_REQUIRED",
                "NO_PERSON_DETECTED",
                "Adjust camera angle to show candidate.",
                0.7,
            )
        else:
            state_data["consecutive_no_person"] = 0

        # 4. Check Laptop Presence
        if laptop_count == 0:
            state_data["consecutive_no_laptop"] += 1
            state_data["consecutive_valid"] = 0
            if state_data["consecutive_no_laptop"] >= 3:
                return (
                    "WAITING_FOR_LAPTOP",
                    "LAPTOP_NOT_DETECTED",
                    "Move phone so your laptop screen and workspace are visible in the frame.",
                    0.9,
                )
            return (
                "POSITIONING_REQUIRED",
                "LAPTOP_NOT_DETECTED",
                "Adjust phone to bring your laptop into view.",
                0.7,
            )
        else:
            state_data["consecutive_no_laptop"] = 0

        # 5. Relative Geometric Sanity Check
        # Ensure person and laptop occupy reasonable frame area and are not at opposite extremes
        p_box = persons[0]["box"]  # [x1, y1, x2, y2]
        l_box = laptops[0]["box"]

        p_area = (p_box[2] - p_box[0]) * (p_box[3] - p_box[1])
        l_area = (l_box[2] - l_box[0]) * (l_box[3] - l_box[1])
        total_frame_area = float(img_w * img_h)

        # Person should be at least 4% of frame; Laptop at least 2% of frame
        if (p_area / total_frame_area) < 0.04:
            return (
                "POSITIONING_REQUIRED",
                "COMPOSITION_INVALID",
                "Candidate is too far from mobile camera — move phone closer.",
                0.75,
            )

        if (l_area / total_frame_area) < 0.02:
            return (
                "POSITIONING_REQUIRED",
                "COMPOSITION_INVALID",
                "Laptop is too small or obscured — angle camera closer to desk.",
                0.75,
            )

        # Multi-frame consecutive confirmation
        state_data["consecutive_valid"] += 1
        avg_conf = (persons[0]["confidence"] + laptops[0]["confidence"]) / 2.0

        if state_data["consecutive_valid"] >= 2:
            return (
                "VALID",
                "COMPOSITION_VALID",
                "Good side-angle composition — participant and laptop are clearly visible.",
                round(avg_conf, 2),
            )
        else:
            return (
                "POSITIONING_REQUIRED",
                "COMPOSITION_STABILIZING",
                "Verifying camera position... hold still.",
                round(avg_conf, 2),
            )

    def analyze_frame(
        self,
        frame_data: str,
        session_id: str = "default",
        participant_id: Optional[Any] = None,
        module_type: str = "QUIZ",
        camera_source: str = "MOBILE_CAMERA",
        confidence_threshold: float = 0.35,
        timestamp_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Runs YOLO11s inference on a mobile stream frame and produces
        structured composition states and proctoring telemetry.
        """
        if not self.initialized_ok or self.model is None:
            return {
                "success": False,
                "error": self.init_error or "YOLO model initialization failed: yolo11s.pt",
                "proctoring_event": None,
                "composition_state": "DISCONNECTED",
            }

        start_time = time.time()
        img = self.decode_frame(frame_data)
        if img is None:
            return {
                "success": False,
                "error": "Invalid or unreadable image frame",
                "proctoring_event": None,
                "composition_state": "DISCONNECTED",
            }

        h, w = img.shape[:2]

        # Resize if oversized for performance (max 640px)
        if max(h, w) > 640:
            scale = 640.0 / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            h, w = img.shape[:2]

        # Run inference
        try:
            results = self.model(img, conf=confidence_threshold, verbose=False)
        except Exception as e:
            logger.error(f"Inference error: {e}")
            return {
                "success": False,
                "error": f"Inference execution failed: {e}",
                "proctoring_event": None,
                "composition_state": "DISCONNECTED",
            }

        detections = []
        detected_classes = []
        max_confidence = 0.0

        if results and len(results) > 0:
            boxes = results[0].boxes
            for box in boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                cls_name = self.class_names.get(cls_id, f"class_{cls_id}")
                xyxy = box.xyxy[0].tolist()

                detections.append({
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": round(conf, 4),
                    "box": [round(coord, 1) for coord in xyxy],
                })

                detected_classes.append(cls_name)
                if conf > max_confidence:
                    max_confidence = conf

        # Composition analysis
        session_key = f"{session_id}_{camera_source}"
        composition_state, event_type, user_msg, comp_conf = self.validate_mobile_composition(
            detections, w, h, session_key
        )
        mobile_evidence = {}
        if camera_source == "MOBILE_CAMERA" and module_type.upper() in ("QUIZ", "CODING", "INTERVIEW"):
            temporal = self._get_session_state(session_key).setdefault("assessment_mobile", {})
            mobile_evidence = evaluate_mobile(detections, w, h, temporal)
            composition_state = mobile_evidence["composition_state"]
            user_msg = mobile_evidence["user_message"]
            event_type = "COMPOSITION_VALID" if mobile_evidence["eligible"] else "COMPOSITION_STABILIZING"
            if mobile_evidence["phone_stable"]:
                event_type = "PHONE_DETECTED"
                comp_conf = mobile_evidence["phone_confidence"]

        severity_map = {
            "VALID": "INFO",
            "POSITIONING_REQUIRED": "INFO",
            "WAITING_FOR_PERSON": "LOW",
            "WAITING_FOR_LAPTOP": "LOW",
            "WARNING": "MEDIUM",
            "VIOLATION": "HIGH",
            "DISCONNECTED": "HIGH",
        }
        severity = severity_map.get(composition_state, "INFO")
        if mobile_evidence.get("phone_stable"):
            severity = "HIGH"

        inference_time_ms = round((time.time() - start_time) * 1000, 2)
        current_time_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # Throttling & state change detection
        state_data = self._get_session_state(session_key)
        state_data["last_frame_ts"] = time.time()
        is_state_change = (state_data["last_event_type"] != event_type) or (state_data["last_state"] != composition_state)
        time_since_last = time.time() - state_data["last_emitted_time"]
        should_emit = is_state_change or (severity in ("HIGH", "MEDIUM") and time_since_last > 4.0) or (time_since_last > 12.0)

        if should_emit:
            state_data["last_event_type"] = event_type
            state_data["last_state"] = composition_state
            state_data["last_emitted_time"] = time.time()

        proctoring_event = {
            "participantId": participant_id,
            "sessionId": session_id,
            "moduleType": module_type.upper(),
            "cameraSource": "MOBILE_CAMERA",
            "eventType": event_type,
            "compositionState": composition_state,
            "userMessage": user_msg,
            "severity": severity,
            "confidence": round(comp_conf, 2),
            "timestamp": current_time_iso,
            "detectionsCount": len(detections),
            "detectedClasses": detected_classes,
            "inferenceTimeMs": inference_time_ms,
            "shouldBroadcast": should_emit,
            "status": "MONITORING",
        }

        phones = [d for d in detections if d["class_id"] in self.phone_class_ids or any(k in d["class_name"].lower() for k in ["phone", "cell"])]
        persons = [d for d in detections if d["class_name"].lower() == "person" or d["class_id"] == self.person_class_id]
        laptops = [d for d in detections if d["class_id"] in self.laptop_class_ids or any(k in d["class_name"].lower() for k in ["laptop", "computer", "notebook", "tv", "monitor"])]
        books = [d for d in detections if d["class_id"] in self.book_class_ids or any(k in d["class_name"].lower() for k in ["book", "paper", "notes"])]

        return {
            "success": True,
            "composition_state": composition_state,
            "user_message": user_msg,
            "proctoring_event": proctoring_event,
            "detections": detections,
            "person_count": len(persons),
            "phone_count": len(phones),
            "laptop_count": len(laptops),
            "book_count": len(books),
            "inference_time_ms": inference_time_ms,
            "mobile_evidence": mobile_evidence,
        }


# Global singleton instance
yolo_engine = YOLOProctorEngine()
