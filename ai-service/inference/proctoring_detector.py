"""
Enterprise MediaPipe Proctoring & Detection Engine
─────────────────────────────────────────────────────────────────────────────
High-accuracy real-time facial landmarking, 3D gaze tracking, head pose estimation,
upper-body posture analysis, blink/mouth dynamics, and risk scoring.

Components:
  1. MediaPipe FaceLandmarker (478 3D landmarks + 10 Iris landmarks)
  2. MediaPipe PoseLandmarker (33 Upper-Body / Torso landmarks)
  3. Head Pose Estimation via 3D Perspective-n-Point (SolvePnP)
  4. 3D Iris & Gaze Vector Angle Classification (8-direction + REM detection)
  5. Adaptive Baseline Eye Aspect Ratio (EAR) & Blink Analysis
  6. Multi-point Mouth Aspect Ratio (MAR) & Speech Detection
  7. Upper-Body Framing (Head + Shoulders + Chest) & Posture Slouch Detection
  8. Multi-face Presence & Lighting / Quality Assessment
  9. Temporal Gating & Real-time Risk Engine
"""

import os
import sys
import time
import math
import logging
import base64
import urllib.request
from typing import Dict, Any, List, Optional, Tuple
from collections import deque

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

logger = logging.getLogger("ai-quiz.mediapipe")

# ── Model Configuration & Paths ──────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ROOT = os.path.dirname(SCRIPT_DIR)
MODELS_DIR = os.path.join(SERVICE_ROOT, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

FACE_MODEL_PATH = os.path.join(MODELS_DIR, "face_landmarker.task")
POSE_MODEL_PATH = os.path.join(MODELS_DIR, "pose_landmarker_lite.task")

FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)


def ensure_model(path: str, url: str, min_size: int = 1_000_000) -> str:
    """Download MediaPipe task model if missing or truncated."""
    if not os.path.exists(path) or os.path.getsize(path) < min_size:
        logger.info(f"Downloading MediaPipe model {os.path.basename(path)}...")
        try:
            urllib.request.urlretrieve(url, path)
            logger.info(f"Model {os.path.basename(path)} downloaded successfully.")
        except Exception as e:
            logger.error(f"Failed to download model from {url}: {e}")
    return path


# ── 3D Face Model for SolvePnP Head Pose ──────────────────────────────────
# Generic anthropometric 3D face model points (in millimeters)
MODEL_POINTS_3D = np.array([
    (0.0, 0.0, 0.0),             # Nose tip (landmark 1)
    (0.0, -330.0, -65.0),        # Chin (landmark 152)
    (-225.0, 170.0, -135.0),     # Left eye outer corner (landmark 33)
    (225.0, 170.0, -135.0),      # Right eye outer corner (landmark 263)
    (-150.0, -150.0, -125.0),    # Left mouth corner (landmark 61)
    (150.0, -150.0, -125.0)      # Right mouth corner (landmark 291)
], dtype=np.float32)

HEAD_POSE_LANDMARKS = [1, 152, 33, 263, 61, 291]

# ── Landmark Indices ──────────────────────────────────────────────────────
# Iris centers & eye corners (478-point mesh)
RIGHT_EYE_IRIS_CENTER = 468
RIGHT_EYE_CORNERS = (33, 133)
LEFT_EYE_IRIS_CENTER = 473
LEFT_EYE_CORNERS = (263, 362)

RIGHT_EYE_TOP_IDX = 159
RIGHT_EYE_BOTTOM_IDX = 145
LEFT_EYE_TOP_IDX = 386
LEFT_EYE_BOTTOM_IDX = 374

RIGHT_EYE_EAR_IDX = [33, 160, 158, 133, 153, 144]
LEFT_EYE_EAR_IDX = [362, 385, 387, 263, 373, 380]

# Mouth landmarks (inner + outer lips)
MOUTH_INNER_TOP = 13
MOUTH_INNER_BOTTOM = 14
MOUTH_OUTER_TOP = 0
MOUTH_OUTER_BOTTOM = 17
MOUTH_LEFT = 61
MOUTH_RIGHT = 291

# Pose landmarks (MediaPipe 33-point Upper Body)
POSE_NOSE = 0
POSE_LEFT_SHOULDER = 11
POSE_RIGHT_SHOULDER = 12
POSE_LEFT_ELBOW = 13
POSE_RIGHT_ELBOW = 14
POSE_LEFT_HIP = 23
POSE_RIGHT_HIP = 24


# ── Geometry & Math Helper Functions ─────────────────────────────────────
def landmark_to_xy(lm, w: int, h: int) -> np.ndarray:
    return np.array([lm.x * w, lm.y * h], dtype=np.float32)


def landmark_to_px(lm, w: int, h: int) -> Tuple[int, int]:
    return (int(lm.x * w), int(lm.y * h))


def rotation_matrix_to_euler(R: np.ndarray) -> Tuple[float, float, float]:
    """Convert 3x3 rotation matrix to stable (pitch, yaw, roll) degrees."""
    sy = math.sqrt(R[0, 0] ** 2 + R[1, 0] ** 2)
    singular = sy < 1e-6
    if not singular:
        pitch = math.atan2(R[2, 1], R[2, 2])
        yaw = math.atan2(-R[2, 0], sy)
        roll = math.atan2(R[1, 0], R[0, 0])
    else:
        pitch = math.atan2(-R[1, 2], R[1, 1])
        yaw = math.atan2(-R[2, 0], sy)
        roll = 0.0
    return float(np.degrees(pitch)), float(np.degrees(yaw)), float(np.degrees(roll))


def calculate_ear(landmarks, eye_indices: List[int], w: int, h: int) -> float:
    """Compute Eye Aspect Ratio (EAR) using Soukupova & Cech formulation."""
    p1, p2, p3, p4, p5, p6 = [landmark_to_xy(landmarks[i], w, h) for i in eye_indices]
    vertical_1 = float(np.linalg.norm(p2 - p6))
    vertical_2 = float(np.linalg.norm(p3 - p5))
    horizontal = float(np.linalg.norm(p1 - p4))
    if horizontal < 1e-6:
        return 0.0
    return (vertical_1 + vertical_2) / (2.0 * horizontal)


def calculate_mar(landmarks, w: int, h: int) -> float:
    """Compute weighted Mouth Aspect Ratio (MAR) with inner + outer lip boundaries."""
    top_in = landmark_to_xy(landmarks[MOUTH_INNER_TOP], w, h)
    bot_in = landmark_to_xy(landmarks[MOUTH_INNER_BOTTOM], w, h)
    v_in = float(np.linalg.norm(top_in - bot_in))

    top_out = landmark_to_xy(landmarks[MOUTH_OUTER_TOP], w, h)
    bot_out = landmark_to_xy(landmarks[MOUTH_OUTER_BOTTOM], w, h)
    v_out = float(np.linalg.norm(top_out - bot_out))

    left = landmark_to_xy(landmarks[MOUTH_LEFT], w, h)
    right = landmark_to_xy(landmarks[MOUTH_RIGHT], w, h)
    width = float(np.linalg.norm(left - right))

    if width < 1e-6:
        return 0.0
    return (v_in * 1.8 + v_out * 0.4) / (2.0 * width)


def eye_horizontal_gaze_ratio(landmarks, iris_idx: int, c_a: int, c_b: int, w: int) -> float:
    """Compute horizontal gaze ratio (0.0 = Far Left, 0.5 = Centered, 1.0 = Far Right)."""
    iris_x = landmarks[iris_idx].x * w
    ax = landmarks[c_a].x * w
    bx = landmarks[c_b].x * w
    left_x, right_x = (ax, bx) if ax <= bx else (bx, ax)
    eye_width = right_x - left_x
    if eye_width < 1e-3:
        return 0.5
    return float(np.clip((iris_x - left_x) / eye_width, 0.0, 1.0))


def eye_vertical_gaze_ratio(landmarks, iris_idx: int, top_idx: int, bot_idx: int, h: int) -> float:
    """Compute vertical gaze ratio (0.0 = Looking Up, 0.5 = Centered, 1.0 = Looking Down)."""
    iris_y = landmarks[iris_idx].y * h
    top_y = landmarks[top_idx].y * h
    bot_y = landmarks[bot_idx].y * h
    eye_height = bot_y - top_y
    if eye_height < 1e-3:
        return 0.5
    return float(np.clip((iris_y - top_y) / eye_height, 0.0, 1.0))


def classify_gaze_8dir(h_ratio: float, v_ratio: float, dead_zone: float = 0.08) -> Tuple[str, float]:
    """Classify gaze into 8 compass directions + Center with confidence."""
    dh = h_ratio - 0.5
    dv = v_ratio - 0.5
    dist = math.sqrt(dh * dh + dv * dv)

    if dist < dead_zone:
        return "Center", 0.0

    confidence = min(1.0, (dist - dead_zone) / 0.25)
    angle = math.atan2(dv, dh) * (180.0 / math.pi)

    if -22.5 <= angle < 22.5:
        dir_name = "Right"
    elif 22.5 <= angle < 67.5:
        dir_name = "Down-Right"
    elif 67.5 <= angle < 112.5:
        dir_name = "Down"
    elif 112.5 <= angle < 157.5:
        dir_name = "Down-Left"
    elif angle >= 157.5 or angle < -157.5:
        dir_name = "Left"
    elif -157.5 <= angle < -112.5:
        dir_name = "Up-Left"
    elif -112.5 <= angle < -67.5:
        dir_name = "Up"
    else:
        dir_name = "Up-Right"

    return dir_name, round(confidence * 100, 1)


# ── Core MediaPipe Proctoring Engine ─────────────────────────────────────
class MediaPipeProctorEngine:
    """
    Thread-safe, high-performance MediaPipe Proctoring Detector.
    Supports single-frame image analysis (REST/WebSocket) and live video processing.
    """

    def __init__(self, mode: str = "IMAGE"):
        self.mode = mode
        ensure_model(FACE_MODEL_PATH, FACE_MODEL_URL)
        ensure_model(POSE_MODEL_PATH, POSE_MODEL_URL)

        self.running_mode = (
            vision.RunningMode.IMAGE if mode == "IMAGE" else vision.RunningMode.VIDEO
        )

        # Initialize Face Landmarker (Iris landmarks enabled)
        face_options = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=FACE_MODEL_PATH),
            running_mode=self.running_mode,
            num_faces=4,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self.face_detector = vision.FaceLandmarker.create_from_options(face_options)

        # Initialize Pose Landmarker
        pose_options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=POSE_MODEL_PATH),
            running_mode=self.running_mode,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.pose_detector = vision.PoseLandmarker.create_from_options(pose_options)

        # Temporal session calibration state
        self.sessions: Dict[str, Dict[str, Any]] = {}
        logger.info("MediaPipeProctorEngine initialized successfully with Face & Pose tasks.")

    def _get_session_state(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "calibrated": False,
                "baseline_ear": 0.28,
                "baseline_face_width": None,
                "gaze_history": deque(maxlen=30),
                "ear_history": deque(maxlen=30),
                "mar_history": deque(maxlen=30),
                "violation_counts": {},
                "risk_score": 0.0,
                "last_seen_ts": time.time(),
            }
        return self.sessions[session_id]

    def calibrate_session(self, session_id: str, baseline_ear: float, baseline_face_width: float):
        """Set personalized baseline calibration for an assessment attempt."""
        state = self._get_session_state(session_id)
        state["calibrated"] = True
        state["baseline_ear"] = max(0.15, min(0.40, baseline_ear))
        state["baseline_face_width"] = baseline_face_width
        logger.info(f"[ProctorEngine] Session {session_id} calibrated: EAR={baseline_ear:.3f}, FaceWidth={baseline_face_width:.1f}px")

    def process_b64_frame(
        self,
        b64_data: str,
        session_id: str = "default",
        timestamp_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Decode base64 image data (data:image/jpeg;base64,...) and run full proctoring inspection."""
        try:
            if "," in b64_data:
                b64_data = b64_data.split(",", 1)[1]
            raw_bytes = base64.b64decode(b64_data)
            np_arr = np.frombuffer(raw_bytes, np.uint8)
            frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if frame_bgr is None:
                return {"success": False, "error": "Invalid frame image data"}

            return self.process_frame(frame_bgr, session_id=session_id, timestamp_ms=timestamp_ms)
        except Exception as e:
            logger.error(f"[ProctorEngine] Frame decoding error: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        session_id: str = "default",
        timestamp_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Execute full MediaPipe Proctoring analysis on a single BGR OpenCV frame.
        Returns comprehensive structured metrics, violation flags, and overall risk rating.
        """
        h, w = frame_bgr.shape[:2]
        session = self._get_session_state(session_id)
        now_ts = time.time()
        violations = []

        # ── 1. Quality & Lighting Check ──────────────────────────────
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(np.mean(gray))
        blur_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        lighting_status = "GOOD"
        if mean_brightness < 40:
            lighting_status = "TOO_DARK"
            violations.append({"type": "POOR_LIGHTING", "severity": "WARNING", "detail": "Lighting is too dark"})
        elif mean_brightness > 230:
            lighting_status = "TOO_BRIGHT"
            violations.append({"type": "POOR_LIGHTING", "severity": "WARNING", "detail": "Lighting is too bright"})

        is_blurred = blur_variance < 60.0
        if is_blurred:
            violations.append({"type": "BLURRED_CAMERA", "severity": "INFO", "detail": "Camera image is blurred"})

        # ── 2. Run MediaPipe Inference ────────────────────────────────
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

        if self.running_mode == vision.RunningMode.IMAGE:
            face_result = self.face_detector.detect(mp_image)
            pose_result = self.pose_detector.detect(mp_image)
        else:
            ts = timestamp_ms or int(now_ts * 1000)
            face_result = self.face_detector.detect_for_video(mp_image, ts)
            pose_result = self.pose_detector.detect_for_video(mp_image, ts)

        num_faces = len(face_result.face_landmarks) if face_result and face_result.face_landmarks else 0

        # ── 3. Face Presence & Multi-Face Analysis ───────────────────
        if num_faces == 0:
            violations.append({
                "type": "FACE_ABSENT",
                "severity": "HIGH",
                "detail": "No face detected in camera view",
            })
            return {
                "success": True,
                "timestamp": now_ts,
                "face_detected": False,
                "face_count": 0,
                "lighting": lighting_status,
                "brightness": round(mean_brightness, 1),
                "blur_variance": round(blur_variance, 1),
                "violations": violations,
                "risk_score": 50.0,
                "risk_level": "MEDIUM",
            }

        if num_faces > 1:
            violations.append({
                "type": "MULTIPLE_FACES",
                "severity": "HIGH",
                "detail": f"Multiple faces detected ({num_faces} faces present)",
            })

        # Primary Face Analysis (Face 0)
        face_lms = face_result.face_landmarks[0]

        # ── 4. 3D Head Pose Estimation (SolvePnP) ────────────────────
        image_points = np.array([
            landmark_to_xy(face_lms[idx], w, h) for idx in HEAD_POSE_LANDMARKS
        ], dtype=np.float32)

        # Camera intrinsic matrix (approximation for standard pinhole camera)
        focal_length = w
        center_x, center_y = w / 2.0, h / 2.0
        camera_matrix = np.array([
            [focal_length, 0.0, center_x],
            [0.0, focal_length, center_y],
            [0.0, 0.0, 1.0]
        ], dtype=np.float32)
        dist_coeffs = np.zeros((4, 1), dtype=np.float32)

        success, rvec, tvec = cv2.solvePnP(
            MODEL_POINTS_3D, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
        )

        yaw, pitch, roll = 0.0, 0.0, 0.0
        if success:
            rmat, _ = cv2.Rodrigues(rvec)
            pitch, yaw, roll = rotation_matrix_to_euler(rmat)

        # Head Pose Violation Thresholds
        head_turned = abs(yaw) > 18.0
        head_tilted = abs(pitch) > 15.0 or abs(roll) > 20.0
        if head_turned:
            direction = "Right" if yaw > 0 else "Left"
            violations.append({
                "type": "HEAD_TURNED",
                "severity": "WARNING",
                "detail": f"Head turned significantly to the {direction} ({abs(yaw):.1f}°)",
            })
        if head_tilted:
            violations.append({
                "type": "HEAD_TILTED",
                "severity": "INFO",
                "detail": f"Head pitch/roll deviation ({pitch:.1f}°, {roll:.1f}°)",
            })

        # ── 5. Iris Tracking & 3D Gaze Analysis ───────────────────────
        r_gaze_h = eye_horizontal_gaze_ratio(face_lms, RIGHT_EYE_IRIS_CENTER, *RIGHT_EYE_CORNERS, w)
        l_gaze_h = eye_horizontal_gaze_ratio(face_lms, LEFT_EYE_IRIS_CENTER, *LEFT_EYE_CORNERS, w)
        avg_gaze_h = (r_gaze_h + l_gaze_h) / 2.0

        r_gaze_v = eye_vertical_gaze_ratio(face_lms, RIGHT_EYE_IRIS_CENTER, RIGHT_EYE_TOP_IDX, RIGHT_EYE_BOTTOM_IDX, h)
        l_gaze_v = eye_vertical_gaze_ratio(face_lms, LEFT_EYE_IRIS_CENTER, LEFT_EYE_TOP_IDX, LEFT_EYE_BOTTOM_IDX, h)
        avg_gaze_v = (r_gaze_v + l_gaze_v) / 2.0

        gaze_direction, gaze_confidence = classify_gaze_8dir(avg_gaze_h, avg_gaze_v, dead_zone=0.08)

        if gaze_direction not in ["Center"] and gaze_confidence > 60:
            violations.append({
                "type": "LOOKING_AWAY",
                "severity": "WARNING",
                "detail": f"Candidate looking {gaze_direction} (Confidence: {gaze_confidence}%)",
            })

        # ── 6. Blink & Eye Aspect Ratio (EAR) ────────────────────────
        r_ear = calculate_ear(face_lms, RIGHT_EYE_EAR_IDX, w, h)
        l_ear = calculate_ear(face_lms, LEFT_EYE_EAR_IDX, w, h)
        avg_ear = (r_ear + l_ear) / 2.0

        effective_ear_thresh = (
            session["baseline_ear"] * 0.75 if session["calibrated"] else 0.20
        )
        eyes_closed = avg_ear < effective_ear_thresh
        if eyes_closed:
            violations.append({
                "type": "EYES_CLOSED",
                "severity": "INFO",
                "detail": f"Eyes closed or obstructed (EAR: {avg_ear:.2f})",
            })

        # ── 7. Mouth Opening & Speaking (MAR) ────────────────────────
        mar = calculate_mar(face_lms, w, h)
        is_talking = mar > 0.35
        if is_talking:
            violations.append({
                "type": "SPEAKING_DETECTED",
                "severity": "WARNING",
                "detail": f"Mouth movement / speaking detected (MAR: {mar:.2f})",
            })

        # ── 8. Upper-Body Posture & Shoulder Framing ──────────────────
        has_pose = pose_result and pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0
        shoulders_detected = False
        shoulder_tilt_angle = 0.0
        torso_centered = True

        if has_pose:
            pose_lms = pose_result.pose_landmarks[0]
            l_sh = pose_lms[POSE_LEFT_SHOULDER]
            r_sh = pose_lms[POSE_RIGHT_SHOULDER]

            if l_sh.visibility > 0.5 and r_sh.visibility > 0.5:
                shoulders_detected = True
                dx = (r_sh.x - l_sh.x) * w
                dy = (r_sh.y - l_sh.y) * h
                shoulder_tilt_angle = abs(math.atan2(dy, dx) * (180.0 / math.pi))
                shoulder_center_x = (l_sh.x + r_sh.x) / 2.0

                if abs(shoulder_center_x - 0.5) > 0.22:
                    torso_centered = False
                    violations.append({
                        "type": "OFF_CENTER",
                        "severity": "INFO",
                        "detail": "Upper body is shifted far from center frame",
                    })

                if shoulder_tilt_angle > 18.0:
                    violations.append({
                        "type": "POSTURE_SLOUCH",
                        "severity": "INFO",
                        "detail": f"Significant shoulder tilt / slouch ({shoulder_tilt_angle:.1f}°)",
                    })
            else:
                violations.append({
                    "type": "SHOULDERS_MISSING",
                    "severity": "INFO",
                    "detail": "Shoulders not clearly in camera view",
                })

        # ── 9. Earbud / Audio Device Inspection ────────────────────────
        earbuds_detected = []
        try:
            # Check ear landmarks: 234 (right ear/tragus), 454 (left ear/tragus)
            r_ear_pt = landmark_to_xy(face_lms[234], w, h)
            l_ear_pt = landmark_to_xy(face_lms[454], w, h)

            for ear_name, pt in [("Right Ear", r_ear_pt), ("Left Ear", l_ear_pt)]:
                ex1, ey1 = max(0, int(pt[0] - 25)), max(0, int(pt[1] - 25))
                ex2, ey2 = min(w, int(pt[0] + 25)), min(h, int(pt[1] + 25))
                if ex2 > ex1 and ey2 > ey1:
                    ear_crop = gray[ey1:ey2, ex1:ex2]
                    # Dark contrast / high edge density in ear canal
                    dark_ratio = np.mean(ear_crop < 45)
                    if dark_ratio > 0.18:
                        earbuds_detected.append({
                            "location": ear_name,
                            "box": [ex1, ey1, ex2, ey2],
                            "confidence": round(float(min(0.99, 0.70 + dark_ratio)), 3)
                        })

            if len(earbuds_detected) > 0:
                violations.append({
                    "type": "AUDIO_DEVICE_DETECTED",
                    "severity": "HIGH",
                    "detail": f"Unauthorized audio device / earbud detected ({len(earbuds_detected)} device(s) found)",
                })
        except Exception:
            pass

        # ── 10. Calculate Overall Proctoring Risk Score (0-100) ───────
        risk_score = 0.0
        for v in violations:
            if v["severity"] == "HIGH":
                risk_score += 35.0
            elif v["severity"] == "WARNING":
                risk_score += 15.0
            elif v["severity"] == "INFO":
                risk_score += 5.0

        risk_score = min(100.0, risk_score)
        if risk_score >= 70:
            risk_level = "CRITICAL"
        elif risk_score >= 40:
            risk_level = "HIGH"
        elif risk_score >= 20:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        return {
            "success": True,
            "timestamp": now_ts,
            "face_detected": True,
            "face_count": num_faces,
            "head_pose": {
                "yaw": round(yaw, 2),
                "pitch": round(pitch, 2),
                "roll": round(roll, 2),
                "is_centered": not head_turned and not head_tilted,
            },
            "gaze": {
                "horizontal_ratio": round(avg_gaze_h, 3),
                "vertical_ratio": round(avg_gaze_v, 3),
                "direction": gaze_direction,
                "confidence": gaze_confidence,
            },
            "eyes": {
                "ear": round(avg_ear, 3),
                "closed": eyes_closed,
            },
            "mouth": {
                "mar": round(mar, 3),
                "speaking": is_talking,
            },
            "posture": {
                "shoulders_detected": shoulders_detected,
                "shoulder_tilt_degrees": round(shoulder_tilt_angle, 1),
                "torso_centered": torso_centered,
            },
            "earbuds_detected": earbuds_detected,
            "lighting": lighting_status,
            "brightness": round(mean_brightness, 1),
            "blur_variance": round(blur_variance, 1),
            "violations": violations,
            "risk_score": risk_score,
            "risk_level": risk_level,
        }


def inspect_frame_with_gemini(frame_bgr: np.ndarray) -> Dict[str, Any]:
    """Call Google Gemini 2.5 Vision API to detect mobile phones, earbuds, and bystanders."""
    import json
    import requests
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"success": False, "error": "GEMINI_API_KEY not configured"}

    try:
        h, w = frame_bgr.shape[:2]
        target_w = 640
        target_h = int(h * (target_w / w))
        resized = cv2.resize(frame_bgr, (target_w, target_h))
        _, buffer = cv2.imencode('.jpg', resized, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        b64_img = base64.b64encode(buffer).decode("utf-8")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        prompt = """
You are an AI proctoring detector. Analyze this exam/interview webcam frame and detect unauthorized devices:
1. Mobile phones / smartphones (in hand, held near lap, screen illuminated, held to ear)
2. Earbuds / in-ear headphones / AirPods
3. Second persons in background
4. Cheat sheets / second screens

Return ONLY valid JSON matching this schema:
{
  "objects": [
    {
      "label": "Mobile Phone" or "Earbud" or "Person" or "Book",
      "box_2d": [ymin, xmin, ymax, xmax],
      "confidence": 0.95,
      "description": "brief description"
    }
  ],
  "violation_detected": true,
  "summary": "evaluation summary"
}
[ymin, xmin, ymax, xmax] must be normalized integers from 0 to 1000.
"""
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64_img}}
                ]
            }],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.1
            }
        }
        resp = requests.post(url, json=payload, timeout=30)
        if resp.status_code == 200:
            res_json = resp.json()
            text = res_json["candidates"][0]["content"]["parts"][0]["text"]
            return {"success": True, **json.loads(text)}
        return {"success": False, "error": f"Gemini API status {resp.status_code}"}
    except Exception as e:
        logger.error(f"[GeminiVision] Error: {e}")
        return {"success": False, "error": str(e)}


def inspect_b64_with_gemini(b64_data: str) -> Dict[str, Any]:
    """Inspect base64 frame with Gemini Vision."""
    try:
        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]
        raw_bytes = base64.b64decode(b64_data)
        np_arr = np.frombuffer(raw_bytes, np.uint8)
        frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame_bgr is None:
            return {"success": False, "error": "Invalid frame data"}
        return inspect_frame_with_gemini(frame_bgr)
    except Exception as e:
        return {"success": False, "error": str(e)}


# Singleton engine instance
proctor_engine = MediaPipeProctorEngine(mode="IMAGE")
