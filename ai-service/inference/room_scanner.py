"""
AI-guided room scanner for the Hire verification flow
======================================================
Heuristic room-capture engine used by the 6-step room verification and the
continuous 360-degree room scan on the candidate's phone camera.

It deliberately does NOT declare anyone "cheating". It only:
  * validates whether a single captured view is a usable room view for a given
    step (front / left / back / right / desk / floor),
  * estimates directional sweep coverage during the 360 scan,
  * records neutral observations (extra person, secondary devices, books) that
    are persisted for a human reviewer to evaluate.

The engine is fully self-contained (OpenCV + NumPy) so it works even when the
YOLO model is unavailable; when YOLO is available its detections are merged in
for object-level observations.

Note on coverage: without a compass/orientation sensor we estimate the angular
sweep from the visual difference between consecutive sampled frames. This is
intentionally conservative: a candidate who keeps the phone stationary can
never reach the target sweep, while a slow continuous rotation with distinct
frames does.
"""

import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("MPLBACKEND", "Agg")

import time
import base64
import hashlib
import logging
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("ai-service.room-scanner")

SIX_CAPTURE_STEPS: Tuple[str, ...] = ("front", "left", "back", "right", "desk", "floor")

DEFAULT_STEP_THRESHOLD = 0.45
DEFAULT_360_TARGET_SWEEP = 380.0  # a little more than one revolution
DEFAULT_MAX_FRAMES = 48  # bound the number of sampled 360 frames per session

# Neutral observation rules: known YOLO class names we surface to reviewers.
OBSERVABLE_CLASSES = {
    "cell phone": "additional phone",
    "cellphone": "additional phone",
    "mobile phone": "additional phone",
    "smartphone": "additional phone",
    "tv": "additional monitor",
    "tv monitor": "additional monitor",
    "monitor": "additional monitor",
    "tablet": "tablet",
    "book": "visible notes / book",
    "booklet": "visible notes / book",
    "notes": "visible notes / book",
    "paper": "visible notes / book",
    "laptop": "second laptop",
    "notebook computer": "second laptop",
    "computer": "second laptop",
    "remote": "remote control",
    "board": "whiteboard / board",
}


def _blur_score(gray: np.ndarray) -> float:
    """Laplacian variance — higher means sharper."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _edge_profile(frame: np.ndarray) -> Dict[str, float]:
    """Edge density in full frame, top half and bottom half."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 60, 160)
    h, w = edges.shape
    total = float(edges.shape[1] * edges.shape[0])
    full = float(np.count_nonzero(edges)) / max(1.0, total)
    top = float(np.count_nonzero(edges[: h // 2, :])) / max(1.0, h // 2 * w)
    bottom = float(np.count_nonzero(edges[h // 2 :, :])) / max(1.0, (h - h // 2) * w)
    lower = float(np.count_nonzero(edges[int(h * 0.7) :, :])) / max(1.0, int(h * 0.3) * w)
    return {
        "edgeFull": round(full, 4),
        "edgeTop": round(top, 4),
        "edgeBottom": round(bottom, 4),
        "edgeLower": round(lower, 4),
    }


def _luminance(gray: np.ndarray) -> Dict[str, float]:
    return {
        "brightness": round(float(gray.mean()), 1),
        "contrast": round(float(gray.std()), 1),
    }


def _thumbnail(gray: np.ndarray, size: int = 48) -> np.ndarray:
    """Downscaled grayscale thumb for cross-frame comparison."""
    return cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)


def _dhash_hex(thumb: np.ndarray) -> str:
    """Compact perceptual fingerprint for the same-frame retry guard on 360."""
    diff = thumb[:, 1:] > thumb[:, :-1]
    bits = np.packbits(diff.astype(np.uint8), axis=1).flatten()
    return hashlib.sha1(bits.tobytes()).hexdigest()


def _visual_signature(gray: np.ndarray) -> str:
    """Perceptual hash of the view; small exposure changes keep a close hash."""
    small = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    low = cv2.dct(small)[:8, :8]
    median = float(np.median(low[1:, :]))
    bits = (low > median).flatten()
    return f"{sum(int(bit) << index for index, bit in enumerate(bits)):016x}"


def _signature_distance(first: str, second: str) -> int:
    try:
        return (int(first, 16) ^ int(second, 16)).bit_count()
    except (TypeError, ValueError):
        return 64


def _visual_difference(first: np.ndarray, second: np.ndarray) -> float:
    return float(np.abs(first.astype(np.float32) - second.astype(np.float32)).mean()) / 255.0


def _scene_descriptor(gray: np.ndarray) -> str:
    """Small normalized image feature; never retains a camera photograph."""
    thumb = cv2.resize(gray, (24, 24), interpolation=cv2.INTER_AREA)
    return base64.b64encode(cv2.equalizeHist(thumb).tobytes()).decode("ascii")


def _same_scene(signature: str, descriptor: str, previous: Dict[str, Any]) -> bool:
    prior_hash = previous.get("visualSignature", "")
    if _signature_distance(signature, prior_hash) <= 12:
        return True
    prior_descriptor = previous.get("sceneDescriptor")
    if not prior_descriptor:
        return False
    try:
        current = np.frombuffer(base64.b64decode(descriptor, validate=True), dtype=np.uint8)
        prior = np.frombuffer(base64.b64decode(prior_descriptor, validate=True), dtype=np.uint8)
        return current.size == prior.size == 576 and float(np.abs(current.astype(np.float32) - prior).mean()) / 255.0 < 0.052
    except (ValueError, TypeError):
        return False


def _laptop_motion(frames: Optional[List[str]]) -> Dict[str, Any]:
    """Check short webcam samples for hand/arm/posture change without saving them."""
    views = []
    for encoded in (frames or [])[:6]:
        try:
            raw = base64.b64decode(str(encoded).split(",", 1)[-1], validate=True)
            image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
            if image is None:
                continue
            image = cv2.resize(image, (160, 120), interpolation=cv2.INTER_AREA)
            if 25 < float(image.mean()) < 245:
                views.append(cv2.GaussianBlur(image[28:, :], (3, 3), 0))
        except (ValueError, TypeError):
            continue
    if len(views) < 3:
        return {"available": False, "moved": False, "score": 0.0}
    scores = []
    for before, after in zip(views, views[1:]):
        delta = after.astype(np.int16) - before.astype(np.int16)
        delta -= int(np.median(delta))  # ignore ordinary exposure changes
        scores.append(float(np.mean(np.abs(delta) > 17)))
    moved = sum(score >= 0.012 for score in scores) >= 2 or max(scores) >= 0.035
    return {"available": True, "moved": moved, "score": round(max(scores), 4)}


def _angular_delta(first: float, second: float) -> float:
    return (float(second) - float(first) + 540.0) % 360.0 - 180.0


def _orientation_reading(value: Any) -> Optional[Dict[str, float]]:
    if not isinstance(value, dict):
        return None
    yaw = value.get("yaw")
    if not isinstance(yaw, (int, float)) or not np.isfinite(yaw):
        return None
    pitch = value.get("pitch")
    return {"yaw": float(yaw) % 360.0,
            "pitch": float(pitch) if isinstance(pitch, (int, float)) and np.isfinite(pitch) else None}


def _step_coverage(metrics: Dict[str, float], step: str) -> Tuple[float, Optional[str]]:
    """Composite per-step coverage in 0..1 plus an optional retry reason.

    Returns (coverage, reason). A `reason` is only set when the view is clearly
    unusable (blurred or too dark) so we can give specific guidance.
    """
    brightness = metrics["brightness"]
    contrast = metrics["contrast"]
    edge_full = metrics["edgeFull"]
    edge_bottom = metrics["edgeBottom"]
    edge_lower = metrics["edgeLower"]
    edge_top = metrics["edgeTop"]
    blurred_soft = metrics["blurred"]
    fine = min(0.45, edge_full * 18.0)
    coverage_base = 0.30 + fine
    reason = None

    if metrics["blurredHard"]:
        coverage_base -= 0.3
        reason = reason or "blurred"
    elif blurred_soft:
        coverage_base -= 0.12
        reason = reason or "blurred"
    else:
        coverage_base += 0.1
    if brightness < 45:
        coverage_base -= 0.22
        reason = reason or "dark"
    elif brightness > 244:
        coverage_base -= 0.2
        reason = reason or "lighting"
    elif 40 <= brightness <= 235:
        coverage_base += 0.06
    if contrast >= 10 or brightness < 150:
        coverage_base += 0.03

    if step == "desk":
        # A desk view is expected to be object-rich in the lower half.
        coverage_base += min(0.2, edge_bottom * 5.5)
        if edge_bottom < 0.03:
            coverage_base -= 0.14
            reason = reason or "desk_flat"
    elif step == "floor":
        # The floor appears in the bottom band; require some detail there.
        coverage_base += min(0.22, edge_lower * 6.0)
        if edge_lower < 0.015:
            coverage_base -= 0.14
            reason = reason or "floor_flat"
    elif step in ("front", "left", "back", "right"):
        # Side views need overall texture variety so we can distinguish angles.
        coverage_base += min(0.12, edge_top * 4.0)
        if edge_full < 0.02 and step == "back":
            coverage_base -= 0.1

    coverage = max(0.0, min(1.0, coverage_base))
    return round(coverage, 3), reason


VEED_KEYS = {
    "front": {
        "poor": "front_poor",
        "ok": "front_ok",
    },
    "left": {"poor": "left_poor", "ok": "left_ok"},
    "back": {"poor": "back_poor", "ok": "back_ok"},
    "right": {"poor": "right_poor", "ok": "right_ok"},
    "desk": {"poor": "desk_poor", "ok": "desk_ok"},
    "floor": {"poor": "floor_poor", "ok": "floor_ok"},
}


class RoomScanEngine:
    _instance: Optional["RoomScanEngine"] = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(RoomScanEngine, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        self.yolo = None
        self.initialized_ok = True
        self.init_error = None
        try:
            from inference.yolo_detector import yolo_engine

            if yolo_engine and getattr(yolo_engine, "initialized_ok", False):
                self.yolo = yolo_engine
            else:
                logger.info("Room scanner running without YOLO (heuristic mode only).")
        except Exception as exc:  # pragma: no cover - import guard
            logger.info("Room scanner running without YOLO: %s", exc)
        self.scan_states: Dict[str, Dict[str, Any]] = {}
        self._initialized = True

    def get_status(self) -> Dict[str, Any]:
        return {
            "status": "UP" if self.initialized_ok else "ERROR",
            "yolo_available": bool(self.yolo),
            "active_scans": len(self.scan_states),
            "steps": list(SIX_CAPTURE_STEPS),
            "error": self.init_error,
        }

    def cleanup_stale(self, max_idle_seconds: int = 900) -> int:
        now = time.time()
        stale = [k for k, st in list(self.scan_states.items()) if now - st.get("ts", now) > max_idle_seconds]
        for key in stale:
            self.scan_states.pop(key, None)
        return len(stale)

    def decode_frame(self, frame_data: str) -> Optional[np.ndarray]:
        try:
            if "," in frame_data:
                frame_data = frame_data.split(",", 1)[1]
            raw = base64.b64decode(frame_data)
            arr = np.frombuffer(raw, np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def _prepare(self, frame: np.ndarray) -> Tuple[np.ndarray, np.ndarray, Dict[str, float]]:
        h, w = frame.shape[:2]
        if max(h, w) > 480:
            scale = 480.0 / max(h, w)
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blur = _blur_score(gray)
        smoothed = cv2.GaussianBlur(gray, (5, 5), 0)
        noise_ratio = float((gray.astype(np.float32) - smoothed.astype(np.float32)).std()) / (float(gray.std()) + 1.0)
        edges = _edge_profile(frame)
        lum = _luminance(gray)
        metrics = {
            "blurScore": round(blur, 2),
            "blurred": (blur < 60) and (blur >= 0),
            "blurredHard": blur < 28,
            "noiseRatio": round(noise_ratio, 3),
            **edges,
            **lum,
        }
        return frame, gray, metrics

    def _yolo_detections(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        if not self.yolo:
            return []
        try:
            results = self.yolo.model(frame, conf=0.35, verbose=False)
            detections: List[Dict[str, Any]] = []
            if results and len(results) > 0:
                for box in results[0].boxes:
                    cls_id = int(box.cls[0].item())
                    conf = float(box.conf[0].item())
                    name = str(self.yolo.class_names.get(cls_id, f"class_{cls_id}")).lower()
                    xyxy = [round(v, 1) for v in box.xyxy[0].tolist()]
                    detections.append({"class_name": name, "confidence": round(conf, 3), "box": xyxy})
            return detections
        except Exception as exc:
            logger.warning("room-scanner yolo inference failed: %s", exc)
            return []

    def _observations(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Neutral, reviewable observations. Never a cheating verdict."""
        observations: List[Dict[str, Any]] = []
        persons = [d for d in detections if d["class_name"] == "person"]
        if len(persons) > 1:
            for person in persons[1:]:
                observations.append({
                    "objectType": "additional person",
                    "confidence": person["confidence"],
                    "box": person["box"],
                    "note": "Another person is visible in the room view.",
                })
        seen_laptops = 0
        for det in detections:
            label = OBSERVABLE_CLASSES.get(det["class_name"])
            if not label:
                continue
            if label == "second laptop":
                seen_laptops += 1
                if seen_laptops <= 1:
                    continue  # the working laptop is expected
            observations.append({
                "objectType": label,
                "confidence": det["confidence"],
                "box": det["box"],
                "note": f"{label} detected.",
            })
        return observations[:20]

    def analyze_step(
        self,
        frame_data: str,
        step: str,
        session_id: str,
        threshold: float = DEFAULT_STEP_THRESHOLD,
        prior_captures: Optional[List[Dict[str, Any]]] = None,
        orientation: Optional[Dict[str, Any]] = None,
        laptop_frames: Optional[List[str]] = None,
        require_laptop: bool = False,
    ) -> Dict[str, Any]:
        step = str(step or "").lower()
        if step not in SIX_CAPTURE_STEPS:
            return {"success": False, "error": f"Unsupported capture step: {step}"}
        frame = self.decode_frame(frame_data)
        if frame is None:
            return {"success": False, "error": "Camera frame could not be decoded"}

        _, gray, metrics = self._prepare(frame)
        signature = _visual_signature(gray)
        scene_descriptor = _scene_descriptor(gray)
        reading = _orientation_reading(orientation)
        laptop = _laptop_motion(laptop_frames) if require_laptop else {"available": True, "moved": True, "score": 0.0}

        detections = self._yolo_detections(frame)
        observations = self._observations(detections)
        labels = {item["class_name"] for item in detections}

        coverage, reason = _step_coverage(metrics, step)
        hard_blur = metrics.get("blurredHard", False)
        invalid_texture = metrics.get("noiseRatio", 0) > 0.78
        workspace_missing = (step == "desk" and self.yolo is not None and
            not (labels & {"laptop", "keyboard", "mouse", "dining table", "tv", "monitor"}) and
            metrics["edgeBottom"] < 0.065)
        floor_horizontal = step == "floor" and bool(labels & {"laptop", "keyboard", "tv", "monitor"})

        guide_key = VEED_KEYS[step]["ok"]
        if invalid_texture:
            guide_key = "image_invalid"
        elif hard_blur:
            guide_key = "blurred"
        elif coverage < threshold:
            guide_key = VEED_KEYS[step]["poor"]
        else:
            # Even when valid, surface an observation-neutralized instruction
            # if a notable observation exists (display only; no verdict).
            for obs in observations:
                if obs["objectType"] != "additional person":
                    guide_key = "observed"
                    break

        # Persist a compact fingerprint of the last accepted view so a repeated
        # image (however valid) cannot masquerade as the next capture step.
        fingerprint = hashlib.sha1(gray.tobytes()).hexdigest()[:24]

        state = self.scan_states.setdefault(f"step_{session_id}", {"ts": time.time(), "last": None, "accepted": {}})

        accepted = {item.get("step"): item for item in (prior_captures or []) if isinstance(item, dict) and item.get("visualSignature")}
        accepted.update(state.get("accepted", {}))
        same_view = any(_same_scene(signature, scene_descriptor, item)
                        for name, item in accepted.items() if name != step)
        laptop_unconfirmed = require_laptop and (not laptop["available"] or (step != "front" and not laptop["moved"]))
        wrong_direction = False
        if reading and step in ("left", "back", "right"):
            previous_step = {"left": "front", "back": "left", "right": "back"}[step]
            previous = _orientation_reading(accepted.get(previous_step, {}).get("orientation"))
            front = _orientation_reading(accepted.get("front", {}).get("orientation"))
            if previous and abs(_angular_delta(previous["yaw"], reading["yaw"])) < 28:
                wrong_direction = True
            if step == "back" and front and abs(_angular_delta(front["yaw"], reading["yaw"])) < 105:
                wrong_direction = True
        if reading and step == "floor":
            desk = _orientation_reading(accepted.get("desk", {}).get("orientation"))
            if desk and desk["pitch"] is not None and reading["pitch"] is not None and abs(reading["pitch"] - desk["pitch"]) < 18:
                wrong_direction = True

        same_frame = False
        last = state.get("last")
        if last and last == fingerprint:
            same_frame = True
            if hard_blur or reason == "blurred":
                guide_key = "blurred"
            else:
                guide_key = VEED_KEYS[step]["poor"]
        state["last"] = fingerprint
        state["ts"] = time.time()

        if same_view or wrong_direction:
            guide_key = "move_left_further" if step == "left" else "move_to_area"
        elif workspace_missing:
            guide_key = "desk_poor"
        elif floor_horizontal:
            guide_key = "floor_poor"
        elif laptop_unconfirmed:
            guide_key = "movement_unconfirmed"
        valid = (not hard_blur) and not invalid_texture and coverage >= threshold and not same_frame and not same_view and not wrong_direction and not laptop_unconfirmed and not workspace_missing and not floor_horizontal
        if valid:
            state.setdefault("accepted", {})[step] = {"step": step, "visualSignature": signature,
                                                       "sceneDescriptor": scene_descriptor, "orientation": reading}

        message = self._message_for(step, guide_key)
        ta_message = self._message_for(step, guide_key, tamil=True)

        return {
            "success": True,
            "step": step,
            "valid": bool(valid),
            "coverage": coverage,
            "threshold": round(float(threshold), 3),
            "confidence": round(min(0.99, max(0.3, 0.45 + coverage * 0.5)), 3),
            "sameFrame": same_frame,
            "sameView": same_view,
            "wrongDirection": wrong_direction,
            "workspaceMissing": workspace_missing,
            "floorHorizontal": floor_horizontal,
            "invalidTexture": invalid_texture,
            "visualSignature": signature,
            "sceneDescriptor": scene_descriptor,
            "laptopMovement": laptop,
            "orientation": reading,
            "guideKey": guide_key,
            "message": message,
            "taMessage": ta_message,
            "observations": observations,
            "metrics": metrics,
            "detectedObjects": [d["class_name"] for d in detections],
        }

    def analyze_360(
        self,
        frames: List[str],
        session_id: str,
        orientations: Optional[List[Optional[Dict[str, Any]]]] = None,
        block_objects: bool = True,
        laptop_frames: Optional[List[str]] = None,
        require_laptop: bool = False,
    ) -> Dict[str, Any]:
        """Verify eight distinct directions and a return to the starting view."""
        if not frames:
            return {"success": False, "error": "No scan frames provided"}
        labels = ("Front", "Front-left", "Left", "Back-left", "Back", "Back-right", "Right", "Front-right")
        state = self.scan_states.setdefault(f"scan_{session_id}", {
            "ts": time.time(), "samples": 0, "mode": None, "sectors": {},
            "startThumb": None, "startSignature": None, "startYaw": None,
            "lastThumb": None, "lastGray": None, "lastYaw": None,
            "travel": 0.0, "direction": 0, "pending": None, "pendingClean": 0,
            "blurStreak": 0, "upperWeak": 0, "lowerWeak": 0, "closed": False,
            "orientationMisses": 0,
            "lastVerifiedCount": 0, "stagnantBatches": 0,
            "laptopMotionUntil": 0.0, "laptopConfirmedWindows": 0,
        })
        state["ts"] = time.time()
        laptop = _laptop_motion(laptop_frames) if require_laptop else {"available": True, "moved": True, "score": 0.0}
        if require_laptop and laptop["moved"]:
            state["laptopMotionUntil"] = time.time() + 4.0
            state["laptopConfirmedWindows"] += 1
        observations: List[Dict[str, Any]] = []
        detected_objects: set = set()
        readings = orientations or []
        blocking_types = {"additional person"}
        if block_objects:
            blocking_types.update({"additional phone", "tablet", "second laptop", "visible notes / book"})

        for index, frame_data in enumerate(frames[-DEFAULT_MAX_FRAMES:]):
            img = self.decode_frame(frame_data)
            if img is None:
                continue
            img, gray, metrics = self._prepare(img)
            thumb = _thumbnail(gray)
            signature = _visual_signature(gray)
            scene_descriptor = _scene_descriptor(gray)
            reading = _orientation_reading(readings[index]) if index < len(readings) else None
            detections = self._yolo_detections(img)
            detected_objects.update(det["class_name"] for det in detections)
            frame_observations = self._observations(detections)
            observations.extend(frame_observations)
            blocking = next((obs for obs in frame_observations if obs["objectType"] in blocking_types), None)
            state["samples"] += 1
            state["blurStreak"] = state["blurStreak"] + 1 if metrics["blurredHard"] else 0
            state["upperWeak"] = state["upperWeak"] + 1 if metrics["edgeTop"] < 0.025 else 0
            state["lowerWeak"] = state["lowerWeak"] + 1 if metrics["edgeLower"] < 0.012 else 0
            if metrics["blurredHard"] or metrics["brightness"] < 38 or metrics["noiseRatio"] > 0.78:
                continue

            if state["mode"] is None:
                state["mode"] = "orientation" if reading else "visual"
                state["startThumb"] = thumb.copy()
                state["startSignature"] = signature
                state["startYaw"] = reading["yaw"] if reading else None
                state["lastYaw"] = state["startYaw"]
            elif state["mode"] == "visual" and reading and len(state["sectors"]) <= 1 and state["pending"] is None:
                state["mode"] = "orientation"
                state["sectors"].clear()
                state["startThumb"] = thumb.copy()
                state["startSignature"] = signature
                state["startYaw"] = reading["yaw"]
                state["lastYaw"] = reading["yaw"]
                state["travel"] = 0.0
                state["direction"] = 0

            if state["mode"] == "orientation":
                state["orientationMisses"] = 0 if reading else state["orientationMisses"] + 1
                if state["orientationMisses"] >= 3:
                    state["mode"] = "visual"

            if require_laptop and len(state["sectors"]) >= 1 and time.time() > state["laptopMotionUntil"]:
                continue

            # An object blocks only its current sector. Two clean views of that
            # same area clear the warning without discarding earlier sectors.
            if state["pending"] is not None:
                pending = state["pending"]
                anchor = state["sectors"].get(pending, {})
                same_area = (reading and anchor.get("yaw") is not None and
                             abs(_angular_delta(anchor["yaw"], reading["yaw"])) <= 30) or (
                                 not reading and _signature_distance(anchor.get("visualSignature", ""), signature) <= 20)
                if blocking:
                    state["pendingClean"] = 0
                elif same_area:
                    state["pendingClean"] += 1
                    if state["pendingClean"] >= 2:
                        anchor.update({"verified": True, "visualSignature": signature,
                                       "sceneDescriptor": scene_descriptor,
                                       "timestamp": time.time(), "thumb": thumb.copy(), "blockedObject": None})
                        state["pending"] = None
                        state["pendingClean"] = 0
                        if reading:
                            state["lastYaw"] = reading["yaw"]
                state["lastThumb"] = thumb.copy()
                state["lastGray"] = gray.copy()
                continue

            previous = state["lastThumb"]
            visual_change = _visual_difference(previous, thumb) if previous is not None else 1.0
            target = 0
            if state["mode"] == "orientation":
                if not reading:
                    continue
                delta = _angular_delta(state["lastYaw"], reading["yaw"])
                state["lastYaw"] = reading["yaw"]
                if 3 <= abs(delta) <= 60 and visual_change >= 0.035:
                    if state["direction"] == 0:
                        state["direction"] = 1 if delta > 0 else -1
                    state["travel"] += delta
                forward = max(0.0, state["direction"] * state["travel"])
                target = min(7, int(forward // 45))
            elif state["sectors"]:
                target = min(7, max(state["sectors"]) + 1)

            existing = state["sectors"].get(target)
            if state["mode"] == "visual" and existing and len(state["sectors"]) == 8:
                # Once every sector has a view, map later frames to the
                # nearest observed area while waiting for the start scene.
                target = min(state["sectors"], key=lambda number:
                             _signature_distance(signature, state["sectors"][number]["visualSignature"]))
                existing = state["sectors"][target]

            if blocking:
                blocked_sector = target if not existing else target
                state["sectors"].setdefault(blocked_sector, {})
                state["sectors"][blocked_sector].update({
                    "verified": False, "visualSignature": signature, "timestamp": time.time(),
                    "sceneDescriptor": scene_descriptor,
                    "thumb": thumb.copy(), "yaw": reading["yaw"] if reading else None,
                    "blockedObject": blocking["objectType"],
                })
                state["pending"] = blocked_sector
                state["pendingClean"] = 0
            elif not existing and target < 8:
                other_views = [sector for number, sector in state["sectors"].items() if number != target and sector.get("verified")]
                novel = all(not _same_scene(signature, scene_descriptor, sector) and
                            _visual_difference(thumb, sector["thumb"]) >= 0.035 for sector in other_views)
                overlap = True
                if state["mode"] == "visual" and state["lastGray"] is not None:
                    orb = cv2.ORB_create(nfeatures=250)
                    _, prior_desc = orb.detectAndCompute(state["lastGray"], None)
                    _, current_desc = orb.detectAndCompute(gray, None)
                    overlap = False
                    if prior_desc is not None and current_desc is not None and len(prior_desc) >= 8 and len(current_desc) >= 8:
                        pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(prior_desc, current_desc, k=2)
                        overlap = sum(1 for pair in pairs if len(pair) == 2 and pair[0].distance < 0.78 * pair[1].distance) >= 8
                if novel and overlap and (target == 0 or visual_change >= 0.035):
                    state["sectors"][target] = {"verified": True, "visualSignature": signature,
                        "sceneDescriptor": scene_descriptor,
                        "timestamp": time.time(), "thumb": thumb.copy(),
                        "yaw": reading["yaw"] if reading else None, "blockedObject": None}

            # Eight sectors alone cannot complete a sweep. The phone must
            # return to the initial scene after moving through them.
            if len(state["sectors"]) == 8 and all(sector.get("verified") for sector in state["sectors"].values()):
                loop_match = (_signature_distance(signature, state["startSignature"]) <= 18 or
                              _visual_difference(thumb, state["startThumb"]) <= 0.20)
                if state["mode"] == "orientation":
                    traversed = state["direction"] * state["travel"] >= 330
                    home = reading and abs(_angular_delta(state["startYaw"], reading["yaw"])) <= 30
                    state["closed"] = state["closed"] or bool(traversed and home and loop_match)
                else:
                    state["closed"] = state["closed"] or bool(target == 0 and loop_match and visual_change >= 0.035)
            state["lastThumb"] = thumb.copy()
            state["lastGray"] = gray.copy()

        sectors = [{"sector": number, "label": label, "verified": bool(state["sectors"].get(number, {}).get("verified")),
                    "visualSignature": state["sectors"].get(number, {}).get("visualSignature"),
                    "timestamp": state["sectors"].get(number, {}).get("timestamp"),
                    "yaw": state["sectors"].get(number, {}).get("yaw"),
                    "blockedObject": state["sectors"].get(number, {}).get("blockedObject")}
                   for number, label in enumerate(labels)]
        missing = [sector["label"] for sector in sectors if not sector["verified"]]
        verified_count = sum(sector["verified"] for sector in sectors)
        state["stagnantBatches"] = 0 if verified_count > state["lastVerifiedCount"] else state["stagnantBatches"] + 1
        state["lastVerifiedCount"] = verified_count
        laptop_confirmed = not require_laptop or state["laptopConfirmedWindows"] >= 3
        complete = bool(state["closed"] and not missing and state["pending"] is None and laptop_confirmed)
        coverage = 100 if complete else min(87, round(verified_count * 100 / 8))
        pending = None
        if state["pending"] is not None:
            number = state["pending"]
            pending = {"sector": number, "label": labels[number],
                       "objectType": state["sectors"][number]["blockedObject"]}

        if pending:
            guide_key = "remove_object"
            message = f"{pending['objectType'].capitalize()} detected in the {pending['label']} area. Please remove it and slowly show this area again."
            tamil_objects = {"additional phone": "கூடுதல் கைப்பேசி", "tablet": "டேப்லெட்",
                             "second laptop": "கூடுதல் மடிக்கணினி", "visible notes / book": "குறிப்புகள் அல்லது புத்தகம்",
                             "additional person": "மற்றொரு நபர்"}
            ta_message = f"{pending['label']} பகுதியில் {tamil_objects.get(pending['objectType'], pending['objectType'])} கண்டறியப்பட்டுள்ளது. அதை அகற்றிவிட்டு இந்த பகுதியை மீண்டும் மெதுவாகக் காட்டவும்."
        elif require_laptop and (not laptop["available"] or (not laptop["moved"] and time.time() > state["laptopMotionUntil"])):
            guide_key = "movement_unconfirmed"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif complete:
            guide_key = "scan_complete"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif verified_count == 8:
            guide_key = "return_to_start"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif state["blurStreak"] >= 2:
            guide_key = "slow_down"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif state["upperWeak"] >= 4:
            guide_key = "move_up"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif state["lowerWeak"] >= 4:
            guide_key = "show_lower"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif verified_count >= 3 and not sectors[4]["verified"]:
            guide_key = "show_behind"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif state["stagnantBatches"] >= 2 and state["mode"] == "orientation" and state["direction"]:
            guide_key = "move_right" if state["direction"] > 0 else "move_left"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif state["mode"] == "orientation" and state["direction"]:
            guide_key = "continue_right" if state["direction"] > 0 else "continue_left"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        else:
            guide_key = "coverage_incomplete"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)

        deduped: List[Dict[str, Any]] = []
        seen = set()
        for obs in observations:
            key = (obs["objectType"], tuple(obs.get("box") or []))
            if key not in seen:
                seen.add(key)
                deduped.append(obs)
        return {"success": True, "step": "scan360", "complete": complete,
                "coverage": coverage, "samplesSeen": state["samples"],
                "accumulatedSweep": round(state["direction"] * state["travel"], 1),
                "mode": state["mode"], "sectors": sectors, "missingSectors": missing,
                "currentDirection": labels[max(state["sectors"]) if state["sectors"] else 0],
                "pendingObject": pending, "guideKey": guide_key, "message": message,
                "taMessage": ta_message, "laptopMovement": laptop, "observations": deduped[:20],
                "detectedObjects": sorted(detected_objects)}

    # ── Bilingual copy (English + Tamil only, per Hire proctoring spec) ──
    def _m360(self, key: str, tamil: bool = False) -> str:
        en = {
            "start_360": "Now slowly rotate your phone around the room.",
            "start_360_ta": "இப்போது கைப்பேசியை மெதுவாக சுற்றி அறையை காட்டவும்.",
            "continue_left": "Continue moving left, keep rotating slowly.",
            "continue_left_ta": "இடது பக்கம் தொடர்ந்து நகர்த்துங்கள், மெதுவாகச் சுழற்றுங்கள்.",
            "continue_right": "Continue turning right, keep rotating slowly.",
            "continue_right_ta": "வலது பக்கம் தொடர்ந்து திரும்புங்கள், மெதுவாகச் சுழற்றுங்கள்.",
            "move_right": "Move slightly to the right and show the next area.",
            "move_right_ta": "சிறிது வலது பக்கம் நகர்ந்து அடுத்த பகுதியைக் காட்டவும்.",
            "move_left": "Move slightly to the left and show the next area.",
            "move_left_ta": "சிறிது இடது பக்கம் நகர்ந்து அடுத்த பகுதியைக் காட்டவும்.",
            "slow_down": "Move the phone a little more slowly so the view stays clear.",
            "slow_down_ta": "தெளிவாக இருக்க கைப்பேசியை இன்னும் மெதுவாக நகர்த்துங்கள்.",
            "show_behind": "Please show the area behind you.",
            "show_behind_ta": "உங்களுக்குப் பின்னால் உள்ள பகுதியைக் காட்டுங்கள்.",
            "show_desk": "Please show the area near your desk now.",
            "show_desk_ta": "இப்போது உங்கள் மேசைக்கு அருகில் உள்ள பகுதியைக் காட்டுங்கள்.",
            "move_up": "Please show the upper area of the room.",
            "move_up_ta": "அறையின் மேல் பகுதியைக் காண்பியுங்கள்.",
            "show_lower": "Please show the lower area of the room.",
            "show_lower_ta": "அறையின் கீழ்ப் பகுதியைக் காட்டவும்.",
            "return_to_start": "Continue rotating until the starting area is visible again.",
            "return_to_start_ta": "தொடக்கப் பகுதி மீண்டும் தெரியும் வரை தொடர்ந்து சுற்றவும்.",
            "coverage_incomplete": "Coverage is incomplete. Please continue rotating.",
            "movement_unconfirmed": "Movement could not be confirmed by the laptop camera. Please turn the phone slowly and try again.",
            "movement_unconfirmed_ta": "மடிக்கணினி கேமராவில் அசைவை உறுதிப்படுத்த முடியவில்லை. கைப்பேசியை மெதுவாகத் திருப்பி மீண்டும் முயற்சிக்கவும்.",
            "coverage_incomplete_ta": "கவரேஜ் முழுமையடையவில்லை. தொடர்ந்து சுழற்றுங்கள்.",
            "scan_complete": "360 degree room scan complete.",
            "scan_complete_ta": "360 டிகிரி அறை ஸ்கேன் நிறைவடைந்தது.",
        }
        if tamil:
            return en.get(f"{key}_ta", en.get("coverage_incomplete_ta"))
        return en.get(key, en["coverage_incomplete"])

    def _message_for(self, step: str, guide_key: str, tamil: bool = False) -> str:
        en = {
            "front_ok": "Front view verified.",
            "left_ok": "Left side verified.",
            "back_ok": "Back side verified.",
            "right_ok": "Right side verified.",
            "desk_ok": "Workspace verified.",
            "floor_ok": "Floor and lower area verified.",
            "front_poor": "Please point the phone straight ahead and show the area around your workspace.",
            "left_poor": "I can't clearly see the left side. Please move the phone a little further left.",
            "back_poor": "Please turn the phone slightly more so I can see the area behind you.",
            "right_poor": "Please move the phone slightly further right.",
            "desk_poor": "Please point the phone towards your desk and show the complete workspace.",
            "floor_poor": "Please tilt the phone slightly further down.",
            "blurred": "The view is blurry. Hold the phone still for a moment.",
            "move_to_area": "Please move the phone to the requested area and capture a new photo.",
            "move_left_further": "Please move the phone further to the left and capture again.",
            "movement_unconfirmed": "Movement could not be confirmed. Please move the phone toward the requested area and capture again.",
            "image_invalid": "Please capture a clearer photo of the requested area.",
            "observed": "Additional object detected. This has been noted for review.",
        }
        ta = {
            "front_ok": "முன் காட்சி சரிபார்க்கப்பட்டது.",
            "left_ok": "இடது பக்கம் சரிபார்க்கப்பட்டது.",
            "back_ok": "பின் பக்கம் சரிபார்க்கப்பட்டது.",
            "right_ok": "வலது பக்கம் சரிபார்க்கப்பட்டது.",
            "desk_ok": "பணியிடம் சரிபார்க்கப்பட்டது.",
            "floor_ok": "தரை மற்றும் கீழ் பகுதி சரிபார்க்கப்பட்டது.",
            "front_poor": "கைப்பேசியை நேராக முன்னோக்கி காட்டி உங்கள் பணியிடத்தைச் சுற்றியுள்ள பகுதியைக் காண்பியுங்கள்.",
            "left_poor": "இடது பக்கம் தெளிவாகத் தெரியவில்லை. கைப்பேசியை இன்னும் சிறிது இடது பக்கம் நகர்த்துங்கள்.",
            "back_poor": "பின்னால் உள்ள பகுதியைப் பார்க்க கைப்பேசியை இன்னும் சிறிது திருப்புங்கள்.",
            "right_poor": "கைப்பேசியை இன்னும் சிறிது வலது பக்கம் நகர்த்துங்கள்.",
            "desk_poor": "கைப்பேசியை உங்கள் மேசையை நோக்கிக் காட்டி முழு பணியிடத்தையும் காண்பியுங்கள்.",
            "floor_poor": "கைப்பேசியை இன்னும் சிறிது கீழே சாய்த்துக் காட்டுங்கள்.",
            "blurred": "காட்சி தெளிவாக இல்லை. சிறிது நேரம் கைப்பேசியை நிலையாக வைத்திருங்கள்.",
            "move_to_area": "குறிப்பிட்ட பகுதியை தெளிவாகக் காட்ட கைப்பேசியை மாற்றி மீண்டும் புகைப்படம் எடுக்கவும்.",
            "move_left_further": "கைப்பேசியை இன்னும் இடது பக்கம் திருப்பி மீண்டும் புகைப்படம் எடுக்கவும்.",
            "movement_unconfirmed": "அசைவை உறுதிப்படுத்த முடியவில்லை. கைப்பேசியை குறிப்பிட்ட பகுதிக்கு நகர்த்தி மீண்டும் புகைப்படம் எடுக்கவும்.",
            "image_invalid": "கோரப்பட்ட பகுதியை தெளிவாக மீண்டும் புகைப்படம் எடுக்கவும்.",
            "observed": "கூடுதல் பொருள் கண்டறியப்பட்டது. இது மதிப்பாய்வுக்காக பதிவு செய்யப்பட்டது.",
        }
        table = ta if tamil else en
        return table.get(guide_key, en.get(guide_key, en["front_poor"]))


room_scanner = RoomScanEngine()
ROOM_SCANNER_INIT_ERROR = getattr(room_scanner, "init_error", None)
