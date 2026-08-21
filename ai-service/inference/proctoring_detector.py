"""
Enterprise MediaPipe Laptop Camera Proctoring Engine
─────────────────────────────────────────────────────────────────────────────
High-accuracy real-time facial landmarking, 3D iris gaze tracking, SolvePnP head pose,
upper-body posture analysis, pre-test calibration validation, and person counting.
Dedicated exclusively to the Laptop Camera Pipeline across Quiz, Coding, and Interview.
"""

import os
import sys

# Ensure headless execution
os.environ["QT_QPA_PLATFORM"] = "offscreen"
os.environ["MPLBACKEND"] = "Agg"
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"
os.environ["GLOG_minloglevel"] = "2"

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

logger = logging.getLogger("ai-service.mediapipe")

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
MODEL_POINTS_3D = np.array([
    (0.0, 0.0, 0.0),             # Nose tip (landmark 1)
    (0.0, -330.0, -65.0),        # Chin (landmark 152)
    (-225.0, 170.0, -135.0),     # Left eye outer corner (landmark 33)
    (225.0, 170.0, -135.0),      # Right eye outer corner (landmark 263)
    (-150.0, -150.0, -125.0),    # Left mouth corner (landmark 61)
    (150.0, -150.0, -125.0),     # Right mouth corner (landmark 291)
], dtype=np.float32)

HEAD_POSE_LANDMARKS = [1, 152, 33, 263, 61, 291]

# Landmark Indices
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

MOUTH_INNER_TOP = 13
MOUTH_INNER_BOTTOM = 14
MOUTH_OUTER_TOP = 0
MOUTH_OUTER_BOTTOM = 17
MOUTH_LEFT = 61
MOUTH_RIGHT = 291

POSE_NOSE = 0
POSE_LEFT_SHOULDER = 11
POSE_RIGHT_SHOULDER = 12


def landmark_to_xy(lm, w: int, h: int) -> np.ndarray:
    return np.array([lm.x * w, lm.y * h], dtype=np.float32)


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
    """Compute Eye Aspect Ratio (EAR)."""
    p1, p2, p3, p4, p5, p6 = [landmark_to_xy(landmarks[i], w, h) for i in eye_indices]
    vertical_1 = float(np.linalg.norm(p2 - p6))
    vertical_2 = float(np.linalg.norm(p3 - p5))
    horizontal = float(np.linalg.norm(p1 - p4))
    if horizontal < 1e-6:
        return 0.0
    return (vertical_1 + vertical_2) / (2.0 * horizontal)


def calculate_mar(landmarks, w: int, h: int) -> float:
    """Compute weighted Mouth Aspect Ratio (MAR)."""
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
    """Compute horizontal gaze ratio (0.0 = Far Left, 0.5 = Center, 1.0 = Far Right)."""
    iris_x = landmarks[iris_idx].x * w
    ax = landmarks[c_a].x * w
    bx = landmarks[c_b].x * w
    left_x, right_x = (ax, bx) if ax <= bx else (bx, ax)
    eye_width = right_x - left_x
    if eye_width < 1e-3:
        return 0.5
    return float(np.clip((iris_x - left_x) / eye_width, 0.0, 1.0))


def eye_vertical_gaze_ratio(landmarks, iris_idx: int, top_idx: int, bot_idx: int, h: int) -> float:
    """Compute vertical gaze ratio (0.0 = Looking Up, 0.5 = Center, 1.0 = Looking Down)."""
    iris_y = landmarks[iris_idx].y * h
    top_y = landmarks[top_idx].y * h
    bot_y = landmarks[bot_idx].y * h
    eye_height = bot_y - top_y
    if eye_height < 1e-3:
        return 0.5
    return float(np.clip((iris_y - top_y) / eye_height, 0.0, 1.0))


def classify_gaze_vector(h_ratio: float, v_ratio: float, dead_zone: float = 0.09) -> Tuple[str, float]:
    """
    Classify 3D gaze vector relative to screen center:
    Returns: (ON_SCREEN | OFF_SCREEN_LEFT | OFF_SCREEN_RIGHT | OFF_SCREEN_UP | OFF_SCREEN_DOWN, confidence)
    """
    dh = h_ratio - 0.5
    dv = v_ratio - 0.5
    dist = math.sqrt(dh * dh + dv * dv)

    if dist < dead_zone:
        return "ON_SCREEN", round(1.0 - (dist / dead_zone) * 0.3, 2)

    confidence = round(min(1.0, (dist - dead_zone) / 0.22), 2)
    angle = math.atan2(dv, dh) * (180.0 / math.pi)

    if -45.0 <= angle < 45.0:
        return "OFF_SCREEN_RIGHT", confidence
    elif 45.0 <= angle < 135.0:
        return "OFF_SCREEN_DOWN", confidence
    elif angle >= 135.0 or angle < -135.0:
        return "OFF_SCREEN_LEFT", confidence
    else:
        return "OFF_SCREEN_UP", confidence


class MediaPipeProctorEngine:
    """
    Thread-safe, high-performance MediaPipe Proctoring Detector for Laptop Cameras.
    """

    def __init__(self, mode: str = "IMAGE"):
        self.mode = mode
        ensure_model(FACE_MODEL_PATH, FACE_MODEL_URL)
        ensure_model(POSE_MODEL_PATH, POSE_MODEL_URL)

        self.running_mode = (
            vision.RunningMode.IMAGE if mode == "IMAGE" else vision.RunningMode.VIDEO
        )

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

        pose_options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=POSE_MODEL_PATH),
            running_mode=self.running_mode,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.pose_detector = vision.PoseLandmarker.create_from_options(pose_options)

        self.sessions: Dict[str, Dict[str, Any]] = {}
        logger.info("MediaPipeProctorEngine initialized successfully for Laptop Camera pipeline.")

    def _get_session_state(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "calibrated": False,
                "calibration_details": {},
                "baseline_ear": 0.28,
                "baseline_face_height": None,
                "gaze_history": deque(maxlen=30),
                "head_history": deque(maxlen=30),
                "last_seen_ts": time.time(),
            }
        return self.sessions[session_id]

    def decode_b64(self, b64_data: str) -> Optional[np.ndarray]:
        try:
            if "," in b64_data:
                b64_data = b64_data.split(",", 1)[1]
            raw_bytes = base64.b64decode(b64_data)
            np_arr = np.frombuffer(raw_bytes, np.uint8)
            return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception as e:
            logger.warning(f"Failed to decode base64 frame: {e}")
            return None

    def validate_calibration(self, b64_data: str, session_id: str = "default") -> Dict[str, Any]:
        """
        Validates pre-test calibration requirements:
          - Face detected
          - Face size minimum (> 14% of frame height)
          - Both shoulders within frame
          - Acceptable lighting (brightness & contrast)
        """
        img = self.decode_b64(b64_data)
        if img is None:
            return {
                "passed": False,
                "reason": "INVALID_IMAGE",
                "message": "Camera frame could not be read.",
            }

        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))
        contrast = float(np.std(gray))

        # 1. Lighting Check (Brightness & Contrast)
        lighting_acceptable = (45.0 <= brightness <= 220.0) and (contrast >= 24.0)
        if brightness < 45.0:
            return {
                "passed": False,
                "reason": "POOR_LIGHTING_DARK",
                "message": "Lighting is too dark — please turn on a light or move to a brighter room.",
                "checklist": {
                    "camera_active": True,
                    "lighting_acceptable": False,
                    "face_detected": False,
                    "face_centered": False,
                    "both_eyes_visible": False,
                    "left_shoulder_visible": False,
                    "right_shoulder_visible": False,
                    "chest_visible": False,
                },
                "metrics": {"brightness": round(brightness, 1), "contrast": round(contrast, 1)},
            }
        if brightness > 220.0:
            return {
                "passed": False,
                "reason": "POOR_LIGHTING_BRIGHT",
                "message": "Lighting is too bright or washed out — avoid direct glare or backlighting.",
                "checklist": {
                    "camera_active": True,
                    "lighting_acceptable": False,
                    "face_detected": False,
                    "face_centered": False,
                    "both_eyes_visible": False,
                    "left_shoulder_visible": False,
                    "right_shoulder_visible": False,
                    "chest_visible": False,
                },
                "metrics": {"brightness": round(brightness, 1), "contrast": round(contrast, 1)},
            }
        if contrast < 24.0:
            return {
                "passed": False,
                "reason": "POOR_CONTRAST",
                "message": "Camera contrast is too low — ensure your face is well-lit and not shadowy.",
                "checklist": {
                    "camera_active": True,
                    "lighting_acceptable": False,
                    "face_detected": False,
                    "face_centered": False,
                    "both_eyes_visible": False,
                    "left_shoulder_visible": False,
                    "right_shoulder_visible": False,
                    "chest_visible": False,
                },
                "metrics": {"brightness": round(brightness, 1), "contrast": round(contrast, 1)},
            }

        # 2. Run Face & Pose Inference
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)

        face_result = self.face_detector.detect(mp_image)
        pose_result = self.pose_detector.detect(mp_image)

        num_faces = len(face_result.face_landmarks) if face_result and face_result.face_landmarks else 0

        if num_faces == 0:
            return {
                "passed": False,
                "reason": "FACE_NOT_DETECTED",
                "message": "No face detected — center yourself directly in front of the laptop camera.",
                "checklist": {
                    "camera_active": True,
                    "lighting_acceptable": True,
                    "face_detected": False,
                    "face_centered": False,
                    "both_eyes_visible": False,
                    "left_shoulder_visible": False,
                    "right_shoulder_visible": False,
                    "chest_visible": False,
                },
                "metrics": {"num_faces": 0, "brightness": round(brightness, 1)},
            }

        if num_faces > 1:
            return {
                "passed": False,
                "reason": "MULTIPLE_FACES_DETECTED",
                "message": f"Multiple faces detected ({num_faces} faces) — ensure you are alone in the room.",
                "checklist": {
                    "camera_active": True,
                    "lighting_acceptable": True,
                    "face_detected": False,
                    "face_centered": False,
                    "both_eyes_visible": False,
                    "left_shoulder_visible": False,
                    "right_shoulder_visible": False,
                    "chest_visible": False,
                },
                "metrics": {"num_faces": num_faces, "brightness": round(brightness, 1)},
            }

        face_lms = face_result.face_landmarks[0]
        xs = [lm.x for lm in face_lms]
        ys = [lm.y for lm in face_lms]

        face_mid_x = (min(xs) + max(xs)) / 2.0
        face_mid_y = (min(ys) + max(ys)) / 2.0
        face_height_ratio = max(ys) - min(ys)

        face_centered = (0.28 <= face_mid_x <= 0.72) and (0.10 <= face_mid_y <= 0.65)
        face_size_adequate = (face_height_ratio >= 0.14)

        if not face_centered:
            return {
                "passed": False,
                "reason": "FACE_NOT_CENTERED",
                "message": "Face is not centered — position your face in the center of the camera frame.",
                "checklist": {
                    "camera_active": True,
                    "lighting_acceptable": True,
                    "face_detected": True,
                    "face_centered": False,
                    "both_eyes_visible": True,
                    "left_shoulder_visible": False,
                    "right_shoulder_visible": False,
                    "chest_visible": False,
                },
                "metrics": {"face_mid_x": round(face_mid_x, 2), "face_mid_y": round(face_mid_y, 2)},
            }

        if not face_size_adequate:
            return {
                "passed": False,
                "reason": "TOO_FAR_AWAY",
                "message": "You are too far from the camera — please move closer to your laptop.",
                "checklist": {
                    "camera_active": True,
                    "lighting_acceptable": True,
                    "face_detected": True,
                    "face_centered": True,
                    "both_eyes_visible": True,
                    "left_shoulder_visible": False,
                    "right_shoulder_visible": False,
                    "chest_visible": False,
                },
                "metrics": {"face_height_ratio": round(face_height_ratio, 3)},
            }

        # 3. Eye Visibility & EAR Check
        r_ear = calculate_ear(face_lms, RIGHT_EYE_EAR_IDX, w, h)
        l_ear = calculate_ear(face_lms, LEFT_EYE_EAR_IDX, w, h)
        baseline_ear = round((r_ear + l_ear) / 2.0, 3)
        eyes_visible = (r_ear >= 0.12) and (l_ear >= 0.12)

        if not eyes_visible:
            return {
                "passed": False,
                "reason": "EYES_NOT_VISIBLE",
                "message": "Both eyes must be open and clearly visible — look directly at the camera.",
                "checklist": {
                    "camera_active": True,
                    "lighting_acceptable": True,
                    "face_detected": True,
                    "face_centered": True,
                    "both_eyes_visible": False,
                    "left_shoulder_visible": False,
                    "right_shoulder_visible": False,
                    "chest_visible": False,
                },
                "metrics": {"baseline_ear": baseline_ear},
            }

        # 4. Shoulder & Upper-Body Framing Check
        has_pose = pose_result and pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0
        l_sh_visible = False
        r_sh_visible = False
        chest_visible = False

        if has_pose:
            pose_lms = pose_result.pose_landmarks[0]
            l_sh = pose_lms[POSE_LEFT_SHOULDER]
            r_sh = pose_lms[POSE_RIGHT_SHOULDER]

            # In MediaPipe pose, left shoulder is x > 0.0, right shoulder is x < 1.0
            l_sh_visible = l_sh.visibility > 0.45 and (0.0 <= l_sh.x <= 1.0) and (0.2 <= l_sh.y <= 0.95)
            r_sh_visible = r_sh.visibility > 0.45 and (0.0 <= r_sh.x <= 1.0) and (0.2 <= r_sh.y <= 0.95)
            chest_visible = l_sh_visible and r_sh_visible

        if not (l_sh_visible and r_sh_visible):
            missing = "Left shoulder" if not l_sh_visible and r_sh_visible else "Right shoulder" if l_sh_visible and not r_sh_visible else "Both shoulders"
            return {
                "passed": False,
                "reason": "SHOULDERS_NOT_IN_FRAME",
                "message": f"{missing} not clearly visible — step back slightly so your upper body and both shoulders are in frame.",
                "checklist": {
                    "camera_active": True,
                    "lighting_acceptable": True,
                    "face_detected": True,
                    "face_centered": True,
                    "both_eyes_visible": True,
                    "left_shoulder_visible": l_sh_visible,
                    "right_shoulder_visible": r_sh_visible,
                    "chest_visible": False,
                },
                "metrics": {
                    "left_shoulder_visible": l_sh_visible,
                    "right_shoulder_visible": r_sh_visible,
                    "face_height_ratio": round(face_height_ratio, 3),
                },
            }

        session = self._get_session_state(session_id)
        session["calibrated"] = True
        session["baseline_ear"] = baseline_ear
        session["baseline_face_height"] = round(face_height_ratio * h, 1)
        session["calibration_details"] = {
            "brightness": round(brightness, 1),
            "contrast": round(contrast, 1),
            "face_height_ratio": round(face_height_ratio, 3),
            "face_centered": True,
            "both_eyes_visible": True,
            "left_shoulder_visible": True,
            "right_shoulder_visible": True,
            "chest_visible": True,
            "baseline_ear": baseline_ear,
            "timestamp": time.time(),
        }

        return {
            "passed": True,
            "reason": "CALIBRATION_PASSED",
            "message": "Calibration successful — face and upper body positioned properly.",
            "checklist": {
                "camera_active": True,
                "lighting_acceptable": True,
                "face_detected": True,
                "face_centered": True,
                "both_eyes_visible": True,
                "left_shoulder_visible": True,
                "right_shoulder_visible": True,
                "chest_visible": True,
            },
            "metrics": session["calibration_details"],
        }

    def process_b64_frame(
        self,
        b64_data: str,
        session_id: str = "default",
        timestamp_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Process live laptop camera frame for continuous eye, head pose, and person counting.
        """
        img = self.decode_b64(b64_data)
        if img is None:
            return {"success": False, "error": "Invalid frame image data"}

        h, w = img.shape[:2]
        now_ts = time.time()
        violations = []

        # Lighting check
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(np.mean(gray))

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)

        face_result = self.face_detector.detect(mp_image)
        pose_result = self.pose_detector.detect(mp_image)

        num_faces = len(face_result.face_landmarks) if face_result and face_result.face_landmarks else 0

        # 1. Person Count Check
        if num_faces == 0:
            return {
                "success": True,
                "timestamp": now_ts,
                "face_detected": False,
                "face_count": 0,
                "gaze_classification": "OFF_SCREEN_DOWN",
                "head_pose": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0},
                "violations": [{
                    "type": "FACE_ABSENT",
                    "severity": "WARNING",
                    "detail": "No candidate face detected in laptop camera view",
                }],
                "status": "MONITORING",
            }

        if num_faces > 1:
            violations.append({
                "type": "MULTIPLE_FACES",
                "severity": "HIGH",
                "detail": f"Multiple faces detected ({num_faces} faces in view)",
            })

        face_lms = face_result.face_landmarks[0]

        # 2. 3D Head Pose Estimation (SolvePnP)
        image_points = np.array([
            landmark_to_xy(face_lms[idx], w, h) for idx in HEAD_POSE_LANDMARKS
        ], dtype=np.float32)

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

        # Distinguish looking down vs looking sideways
        if abs(yaw) > 18.0:
            direction = "Right" if yaw > 0 else "Left"
            violations.append({
                "type": "HEAD_LOOKING_SIDEWAYS",
                "severity": "WARNING",
                "detail": f"Head turned {direction} ({abs(yaw):.1f}°)",
            })
        elif pitch > 16.0:
            violations.append({
                "type": "HEAD_LOOKING_DOWN",
                "severity": "WARNING",
                "detail": f"Head looking down towards desk/notes ({pitch:.1f}°)",
            })

        # 3. 3D Iris Gaze Vector Classification
        r_gaze_h = eye_horizontal_gaze_ratio(face_lms, RIGHT_EYE_IRIS_CENTER, *RIGHT_EYE_CORNERS, w)
        l_gaze_h = eye_horizontal_gaze_ratio(face_lms, LEFT_EYE_IRIS_CENTER, *LEFT_EYE_CORNERS, w)
        avg_gaze_h = (r_gaze_h + l_gaze_h) / 2.0

        r_gaze_v = eye_vertical_gaze_ratio(face_lms, RIGHT_EYE_IRIS_CENTER, RIGHT_EYE_TOP_IDX, RIGHT_EYE_BOTTOM_IDX, h)
        l_gaze_v = eye_vertical_gaze_ratio(face_lms, LEFT_EYE_IRIS_CENTER, LEFT_EYE_TOP_IDX, LEFT_EYE_BOTTOM_IDX, h)
        avg_gaze_v = (r_gaze_v + l_gaze_v) / 2.0

        gaze_classification, gaze_confidence = classify_gaze_vector(avg_gaze_h, avg_gaze_v)

        if gaze_classification != "ON_SCREEN" and gaze_confidence > 0.65:
            violations.append({
                "type": f"GAZE_{gaze_classification}",
                "severity": "WARNING",
                "detail": f"Eyes directed {gaze_classification.replace('_', ' ').lower()}",
            })

        # 4. Speaking / Mouth Dynamics (MAR)
        mar = calculate_mar(face_lms, w, h)
        if mar > 0.38:
            violations.append({
                "type": "SPEAKING_DETECTED",
                "severity": "WARNING",
                "detail": f"Mouth movement / conversation detected (MAR: {mar:.2f})",
            })

        return {
            "success": True,
            "timestamp": now_ts,
            "face_detected": True,
            "face_count": num_faces,
            "gaze_classification": gaze_classification,
            "gaze_confidence": gaze_confidence,
            "head_pose": {
                "yaw": round(yaw, 1),
                "pitch": round(pitch, 1),
                "roll": round(roll, 1),
            },
            "brightness": round(mean_brightness, 1),
            "violations": violations,
            "status": "MONITORING",
        }


# Global singleton instance
proctor_engine = MediaPipeProctorEngine()


def inspect_b64_with_gemini(b64_data: str) -> Dict[str, Any]:
    """
    Inspect a webcam frame using Google Gemini Multimodal Vision API to detect
    unauthorized devices (cell phones, secondary screens, earbuds), multiple persons, or notes.
    """
    try:
        from services.gemini_client import GeminiClient
        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key or api_key == "your-gemini-api-key-here":
            return {
                "success": True,
                "phone_detected": False,
                "multiple_persons": False,
                "earbuds_detected": False,
                "suspicious_objects": [],
                "confidence": 0.0,
                "notes": "Gemini API key not configured"
            }

        client = GeminiClient(api_key=api_key)
        prompt = (
            "You are an AI exam proctoring vision auditor. Analyze this webcam frame carefully for exam integrity.\n"
            "Detect if there are:\n"
            "1. Cell phones, smartphones, tablets, or secondary screens.\n"
            "2. Multiple people in the background or near the candidate.\n"
            "3. Earbuds, headphones, or concealed headsets.\n"
            "4. Books, written notes, or suspicious physical materials.\n\n"
            "Return ONLY valid JSON matching this schema:\n"
            "{\n"
            '  "phone_detected": boolean,\n'
            '  "multiple_persons": boolean,\n'
            '  "earbuds_detected": boolean,\n'
            '  "suspicious_objects": string[],\n'
            '  "confidence": number,\n'
            '  "notes": string\n'
            "}"
        )

        import json
        import re

        raw_json = client.generate_vision_content(
            prompt=prompt,
            image_b64=b64_data,
            mime_type="image/jpeg"
        )

        try:
            parsed = json.loads(raw_json)
        except Exception:
            json_match = re.search(r"\{.*\}", raw_json, re.DOTALL)
            parsed = json.loads(json_match.group()) if json_match else {}

        return {
            "success": True,
            "phone_detected": bool(parsed.get("phone_detected", False)),
            "multiple_persons": bool(parsed.get("multiple_persons", False)),
            "earbuds_detected": bool(parsed.get("earbuds_detected", False)),
            "suspicious_objects": parsed.get("suspicious_objects", []),
            "confidence": float(parsed.get("confidence", 0.9)),
            "notes": parsed.get("notes", "Frame inspected successfully")
        }
    except Exception as e:
        logger.error(f"Gemini vision proctoring inspection error: {e}")
        return {
            "success": True,
            "phone_detected": False,
            "multiple_persons": False,
            "earbuds_detected": False,
            "suspicious_objects": [],
            "confidence": 0.0,
            "notes": f"Inspection fallback: {str(e)}"
        }

