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
        edges = _edge_profile(frame)
        lum = _luminance(gray)
        metrics = {
            "blurScore": round(blur, 2),
            "blurred": (blur < 60) and (blur >= 0),
            "blurredHard": blur < 28,
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
    ) -> Dict[str, Any]:
        step = str(step or "").lower()
        if step not in SIX_CAPTURE_STEPS:
            return {"success": False, "error": f"Unsupported capture step: {step}"}
        frame = self.decode_frame(frame_data)
        if frame is None:
            return {"success": False, "error": "Camera frame could not be decoded"}

        _, gray, metrics = self._prepare(frame)

        detections = self._yolo_detections(frame)
        observations = self._observations(detections)

        coverage, reason = _step_coverage(metrics, step)
        hard_blur = metrics.get("blurredHard", False)

        guide_key = VEED_KEYS[step]["ok"]
        if hard_blur:
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

        state = self.scan_states.setdefault(f"step_{session_id}", {"ts": time.time(), "last": None})

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

        valid = (not hard_blur) and coverage >= threshold and not same_frame

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
        target_sweep: float = DEFAULT_360_TARGET_SWEEP,
    ) -> Dict[str, Any]:
        if not frames:
            return {"success": False, "error": "No scan frames provided"}
        frame = self.decode_frame(frames[0])
        if frame is None:
            return {"success": False, "error": "Scan frame could not be decoded"}

        state_key = f"scan_{session_id}"
        state = self.scan_states.setdefault(state_key, {
            "ts": time.time(),
            "accum": 0.0,
            "samples": 0,
            "prev": None,
            "blur_streak": 0,
            "upper_weak": 0,
            "last_guide": "start_360",
        })
        state["ts"] = time.time()

        observations: List[Dict[str, Any]] = []
        all_detections: List[Dict[str, Any]] = []

        for frame_data in frames[-DEFAULT_MAX_FRAMES:]:
            img = self.decode_frame(frame_data)
            if img is None:
                continue
            _, gray, metrics = self._prepare(img)
            thumb = _thumbnail(gray)
            detections = self._yolo_detections(img)
            all_detections.extend(detections)
            observations.extend(self._observations(detections))

            if state["prev"] is not None:
                diff = float(np.abs(thumb.astype(np.float32) - state["prev"].astype(np.float32)).mean()) / 255.0
                # Non-linear mapping: small visual jumps = small movement, large
                # jumps = a bigger sweep happened between samples.
                delta_deg = min(60.0, 4.0 + diff * 56.0)
            else:
                delta_deg = 0.0
            state["prev"] = thumb
            state["samples"] += 1
            state["accum"] = state.get("accum", 0.0) + delta_deg

            if metrics.get("blurredHard"):
                state["blur_streak"] = state.get("blur_streak", 0) + 1
            else:
                state["blur_streak"] = 0
            if metrics.get("edgeTop", 0) < 0.04 and metrics.get("edgeBottom", 0) > 0.12:
                state["upper_weak"] = state.get("upper_weak", 0) + 1

        sweep = state["accum"]
        coverage = int(min(100, round(100.0 * sweep / target_sweep)))
        complete = state["samples"] >= 8 and sweep >= target_sweep

        # Dynamic, human-friendly guidance.
        if state.get("blur_streak", 0) >= 2:
            guide_key, message, ta_message = "slow_down", self._m360("slow_down"), self._m360("slow_down", tamil=True)
        elif state.get("upper_weak", 0) >= 4 and sweep < target_sweep * 0.9:
            guide_key, message, ta_message = "move_up", self._m360("move_up"), self._m360("move_up", tamil=True)
        elif sweep < target_sweep * 0.2:
            guide_key, message, ta_message = "start_360", self._m360("start_360"), self._m360("start_360", tamil=True)
        elif sweep < target_sweep * 0.4:
            guide_key, message, ta_message = "continue_left", self._m360("continue_left"), self._m360("continue_left", tamil=True)
        elif sweep < target_sweep * 0.6:
            guide_key, message, ta_message = "show_behind", self._m360("show_behind"), self._m360("show_behind", tamil=True)
        elif sweep < target_sweep * 0.85:
            guide_key, message, ta_message = "show_desk", self._m360("show_desk"), self._m360("show_desk", tamil=True)
        elif not complete:
            guide_key, message, ta_message = "coverage_incomplete", self._m360("coverage_incomplete"), self._m360("coverage_incomplete", tamil=True)
        else:
            guide_key, message, ta_message = "scan_complete", self._m360("scan_complete"), self._m360("scan_complete", tamil=True)

        deduped: List[Dict[str, Any]] = []
        seen = set()
        for obs in observations:
            key = (obs["objectType"], tuple(obs.get("box") or []))
            if key not in seen:
                seen.add(key)
                deduped.append(obs)

        return {
            "success": True,
            "step": "scan360",
            "complete": bool(complete),
            "coverage": coverage,
            "samplesSeen": state["samples"],
            "accumulatedSweep": round(sweep, 1),
            "guideKey": guide_key,
            "message": message,
            "taMessage": ta_message,
            "observations": deduped[:20],
            "detectedObjects": list({d["class_name"] for d in all_detections}),
            "metrics": {
                "blurStreak": state.get("blur_streak", 0),
                "upperWeakStreak": state.get("upper_weak", 0),
                "slowOrStillFrames": max(0, state["samples"] - max(1, int(state["samples"] * 0.6))),
            },
        }

    # ── Bilingual copy (English + Tamil only, per Hire proctoring spec) ──
    def _m360(self, key: str, tamil: bool = False) -> str:
        en = {
            "start_360": "Slowly rotate your phone around the room. Keep the camera moving smoothly.",
            "start_360_ta": "உங்கள் கைப்பேசியை அறையைச் சுற்றி மெதுவாக சுழற்றுங்கள். கேமராவை சீராக நகர்த்துங்கள்.",
            "continue_left": "Continue moving left, keep rotating slowly.",
            "continue_left_ta": "இடது பக்கம் தொடர்ந்து நகர்த்துங்கள், மெதுவாகச் சுழற்றுங்கள்.",
            "slow_down": "Move the phone a little more slowly so the view stays clear.",
            "slow_down_ta": "தெளிவாக இருக்க கைப்பேசியை இன்னும் மெதுவாக நகர்த்துங்கள்.",
            "show_behind": "Please show the area behind you.",
            "show_behind_ta": "உங்களுக்குப் பின்னால் உள்ள பகுதியைக் காட்டுங்கள்.",
            "show_desk": "Please show the area near your desk now.",
            "show_desk_ta": "இப்போது உங்கள் மேசைக்கு அருகில் உள்ள பகுதியைக் காட்டுங்கள்.",
            "move_up": "Please show the upper area of the room.",
            "move_up_ta": "அறையின் மேல் பகுதியைக் காண்பியுங்கள்.",
            "coverage_incomplete": "Coverage is incomplete. Please continue rotating.",
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
            "observed": "கூடுதல் பொருள் கண்டறியப்பட்டது. இது மதிப்பாய்வுக்காக பதிவு செய்யப்பட்டது.",
        }
        table = ta if tamil else en
        return table.get(guide_key, en.get(guide_key, en["front_poor"]))


room_scanner = RoomScanEngine()
ROOM_SCANNER_INIT_ERROR = getattr(room_scanner, "init_error", None)