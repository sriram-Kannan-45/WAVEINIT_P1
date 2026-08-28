import os
import sys

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

os.environ["SD_ENABLE_ASIO"] = "0"
os.environ["QT_QPA_PLATFORM"] = "offscreen"
os.environ["MPLBACKEND"] = "Agg"

import time
import math
import logging
import base64
import argparse
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from enum import Enum
import cv2
import numpy as np
import mediapipe as mp
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

logger = logging.getLogger("ai-service.mediapipe")

# ============================================================
# CLI ARGUMENTS & CONFIGURATION
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(description="LMS Participant Live AI Monitoring Pipeline")
    parser.add_argument("--camera", type=str, default="0", help="Camera index (e.g. 0) or video file path for simulation")
    parser.add_argument("--output", type=str, default="live_session_output.mp4", help="Path to output session recording (optional)")
    parser.add_argument("--excel", type=str, default="live_session_report.xlsx", help="Path to output Excel session report")
    parser.add_argument("--duration", type=float, default=60.0, help="Live session duration in seconds (default: 60.0, set 0 for manual stop)")
    parser.add_argument("--no-record", action="store_true", help="Disable recording video to disk")
    parser.add_argument("--headless", action="store_true", help="Run without cv2.imshow GUI window")
    args, _ = parser.parse_known_args()
    return args

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ROOT = os.path.dirname(SCRIPT_DIR)
MODELS_DIR = os.path.join(SERVICE_ROOT, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

FACE_MODEL_PATH = os.path.join(MODELS_DIR, "face_landmarker.task")
POSE_MODEL_PATH = os.path.join(MODELS_DIR, "pose_landmarker_lite.task")

if not os.path.exists(FACE_MODEL_PATH) and os.path.exists("face_landmarker.task"):
    FACE_MODEL_PATH = "face_landmarker.task"
elif not os.path.exists(FACE_MODEL_PATH) and os.path.exists(r"E:\agent\posture\face_landmarker.task"):
    FACE_MODEL_PATH = r"E:\agent\posture\face_landmarker.task"

# ------------------------------------------------------------
# 1. CENTRAL THRESHOLD CONFIGURATION
# ------------------------------------------------------------
# 3.0 seconds is ONLY the minimum continuous duration required to validate a violation.
# Violations < 3.0s are discarded (0s added).
# Violations >= 3.0s record the full actual continuous duration (e.g. 7.4s, 10.0s).
VIOLATION_SECONDS = 3.0

# Head-pose thresholds in degrees
YAW_INNER = 10.0
YAW_OUTER = 30.0
PITCH_INNER = 10.0
PITCH_OUTER = 20.0

YAW_LEFT_CUTOFF = 0.72
YAW_RIGHT_CUTOFF = 0.72
PITCH_UP_CUTOFF = 0.75
PITCH_DOWN_CUTOFF = 0.45

# Head pose smoothing & baseline
POSE_ALPHA = 0.35
PITCH_OFFSET = -5.0

# ============================================================
# EYE GAZE CONFIGURATION (RELIABLE MULTI-AXIS DETECTION)
# ============================================================

# Independent Hysteresis Thresholds (Deviations from Calibrated Neutral Baseline)
GAZE_ENTER_HORIZONTAL = 0.030  # dx threshold to enter Left / Right
GAZE_EXIT_HORIZONTAL = 0.017   # dx threshold to exit back to Straight

GAZE_ENTER_VERTICAL = 0.026    # dy threshold to enter Up / Down
GAZE_EXIT_VERTICAL = 0.014     # dy threshold to exit back to Straight

# Smoothing factor for iris positions
GAZE_SMOOTHING_ALPHA = 0.30

# Primary-side lock
PRIMARY_SIDE_LOCK = True

# Initial Neutral Calibration
CALIBRATION_FRAMES = 45  # Exactly 45 valid frames required to complete calibration

# Face Centering & Quality Audit Thresholds
FACE_CENTER_TOLERANCE_X = 0.22  # Face center X within [0.28, 0.72] of frame width
FACE_CENTER_TOLERANCE_Y = 0.22  # Face center Y within [0.28, 0.72] of frame height
MIN_FACE_SIZE_RATIO = 0.12      # Face width/height relative to frame
MAX_FACE_SIZE_RATIO = 0.85      # Face should not exceed 85% of frame
MIN_BRIGHTNESS = 35.0
MAX_BRIGHTNESS = 235.0

# Ignored directions (Looking Down is permitted for calculating/reading/coding)
IGNORED_HEAD_DIRECTIONS = {"Down"}
IGNORED_EYE_DIRECTIONS = {"Down"}

# Scoring weights (100 Marks Total)
MONITORING_SCORE_MAX = 60.0
MULTIPLE_FACE_SCORE_MAX = 10.0
NO_PERSON_SCORE_MAX = 10.0
MOBILE_SCORE_MAX = 20.0


# ============================================================
# SESSION LIFECYCLE ENUM
# ============================================================

class SessionState(str, Enum):
    CREATED = "CREATED"
    CALIBRATING = "CALIBRATING"
    CALIBRATION_FAILED = "CALIBRATION_FAILED"
    READY = "READY"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    ABORTED = "ABORTED"


# ============================================================
# HEAD POSE (solvePnP + Euler Angles)
# ============================================================

MODEL_POINTS = np.array([
    (0.0, 0.0, 0.0),          # Nose
    (0.0, -330.0, -65.0),     # Chin
    (-225.0, 170.0, -135.0),  # Left eye corner
    (225.0, 170.0, -135.0),   # Right eye corner
    (-150.0, -150.0, -125.0), # Left mouth corner
    (150.0, -150.0, -125.0),  # Right mouth corner
], dtype=np.float32)

LANDMARK_INDICES = [1, 152, 33, 263, 61, 291]


def rotation_matrix_to_euler_angles(R):
    sy = np.sqrt(R[0, 0] ** 2 + R[1, 0] ** 2)
    singular = sy < 1e-6

    if not singular:
        pitch = np.arctan2(R[2, 1], R[2, 2])
        yaw = np.arctan2(-R[2, 0], sy)
        roll = np.arctan2(R[1, 0], R[0, 0])
    else:
        pitch = np.arctan2(-R[1, 2], R[1, 1])
        yaw = np.arctan2(-R[2, 0], sy)
        roll = 0.0

    return float(np.degrees(pitch)), float(np.degrees(yaw)), float(np.degrees(roll))


def fuzzy_classify(value, inner_thresh, outer_thresh):
    abs_value = abs(value)

    if abs_value <= inner_thresh:
        confidence = 0.0
    elif abs_value >= outer_thresh:
        confidence = 1.0
    else:
        confidence = (abs_value - inner_thresh) / (outer_thresh - inner_thresh)

    sign = 1 if value >= 0 else -1
    return sign, confidence


# ============================================================
# GAZE / EYEBALL DETECTION PIPELINE
# ============================================================

RIGHT_IRIS_CENTER = 468
LEFT_IRIS_CENTER = 473

RIGHT_EYE_CORNERS = (33, 133)
LEFT_EYE_CORNERS = (263, 362)

RIGHT_EYE_VERTICAL = (159, 145)
LEFT_EYE_VERTICAL = (386, 374)


def point_xy(landmark, w, h):
    return np.array([landmark.x * w, landmark.y * h], dtype=np.float32)


def calculate_normalized_eye_ratios(landmarks, w: int, h: int) -> Tuple[float, float, Dict[str, Any]]:
    """
    Computes normalized horizontal and vertical iris position ratios.
    BUG FIX VERIFIED:
    - Right eye uses strictly right-eye landmarks: r_iris, r_c1, r_c2, r_top, r_bot.
    - Left eye uses strictly left-eye landmarks: l_iris, l_c1, l_c2, l_top, l_bot.
    - Zero divisions safely prevented with max(1.0, span).
    """
    r_iris = point_xy(landmarks[RIGHT_IRIS_CENTER], w, h)
    r_c1 = point_xy(landmarks[RIGHT_EYE_CORNERS[0]], w, h)
    r_c2 = point_xy(landmarks[RIGHT_EYE_CORNERS[1]], w, h)
    r_top = point_xy(landmarks[RIGHT_EYE_VERTICAL[0]], w, h)
    r_bot = point_xy(landmarks[RIGHT_EYE_VERTICAL[1]], w, h)

    l_iris = point_xy(landmarks[LEFT_IRIS_CENTER], w, h)
    l_c1 = point_xy(landmarks[LEFT_EYE_CORNERS[0]], w, h)
    l_c2 = point_xy(landmarks[LEFT_EYE_CORNERS[1]], w, h)
    l_top = point_xy(landmarks[LEFT_EYE_VERTICAL[0]], w, h)
    l_bot = point_xy(landmarks[LEFT_EYE_VERTICAL[1]], w, h)

    # Right Eye Horizontal & Vertical
    r_min_x, r_max_x = min(r_c1[0], r_c2[0]), max(r_c1[0], r_c2[0])
    r_h_span = max(1.0, r_max_x - r_min_x)
    r_h = float(np.clip((r_iris[0] - r_min_x) / r_h_span, 0.0, 1.0))
    r_v_span = max(1.0, abs(r_bot[1] - r_top[1]))
    r_v = float(np.clip((r_iris[1] - min(r_top[1], r_bot[1])) / r_v_span, 0.0, 1.0))

    # Left Eye Horizontal & Vertical (Uses l_bot[1], NOT r_bot[1])
    l_min_x, l_max_x = min(l_c1[0], l_c2[0]), max(l_c1[0], l_c2[0])
    l_h_span = max(1.0, l_max_x - l_min_x)
    l_h = float(np.clip((l_iris[0] - l_min_x) / l_h_span, 0.0, 1.0))
    l_v_span = max(1.0, abs(l_bot[1] - l_top[1]))
    l_v = float(np.clip((l_iris[1] - min(l_top[1], l_bot[1])) / l_v_span, 0.0, 1.0))

    avg_h = (r_h + l_h) / 2.0
    avg_v = (r_v + l_v) / 2.0

    eye_geom = {
        "r_iris": (int(r_iris[0]), int(r_iris[1])),
        "l_iris": (int(l_iris[0]), int(l_iris[1])),
        "r_corners": ((int(r_c1[0]), int(r_c1[1])), (int(r_c2[0]), int(r_c2[1]))),
        "l_corners": ((int(l_c1[0]), int(l_c1[1])), (int(l_c2[0]), int(l_c2[1]))),
        "r_v_pts": ((int(r_top[0]), int(r_top[1])), (int(r_bot[0]), int(r_bot[1]))),
        "l_v_pts": ((int(l_top[0]), int(l_top[1])), (int(l_bot[0]), int(l_bot[1]))),
    }

    return avg_h, avg_v, eye_geom


# ============================================================
# PARTICIPANT CENTERING & QUALITY AUDIT
# ============================================================

def audit_participant_framing(face_landmarks, frame_w: int, frame_h: int, gray_frame: np.ndarray) -> Dict[str, Any]:
    """
    Audits participant centering, distance, and lighting before/during calibration.
    """
    brightness = float(np.mean(gray_frame))
    contrast = float(np.std(gray_frame))

    if brightness < MIN_BRIGHTNESS:
        return {
            "passed": False,
            "reason": "POOR_LIGHTING_DARK",
            "message": "Lighting is too dark. Please increase ambient light.",
            "metrics": {"brightness": round(brightness, 1), "contrast": round(contrast, 1)}
        }
    if brightness > MAX_BRIGHTNESS:
        return {
            "passed": False,
            "reason": "POOR_LIGHTING_BRIGHT",
            "message": "Lighting is too bright. Please reduce glare.",
            "metrics": {"brightness": round(brightness, 1), "contrast": round(contrast, 1)}
        }

    xs = [lm.x for lm in face_landmarks]
    ys = [lm.y for lm in face_landmarks]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    face_w = max_x - min_x
    face_h = max_y - min_y
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0

    if face_w < MIN_FACE_SIZE_RATIO or face_h < MIN_FACE_SIZE_RATIO:
        return {
            "passed": False,
            "reason": "PARTICIPANT_TOO_FAR",
            "message": "Move closer to the camera.",
            "metrics": {"center_x": round(center_x, 3), "center_y": round(center_y, 3), "face_size": round(face_w, 3)}
        }
    if face_w > MAX_FACE_SIZE_RATIO or face_h > MAX_FACE_SIZE_RATIO:
        return {
            "passed": False,
            "reason": "PARTICIPANT_TOO_CLOSE",
            "message": "Move farther from the camera.",
            "metrics": {"center_x": round(center_x, 3), "center_y": round(center_y, 3), "face_size": round(face_w, 3)}
        }

    dx = center_x - 0.50
    dy = center_y - 0.50

    if dx < -FACE_CENTER_TOLERANCE_X:
        return {
            "passed": False,
            "reason": "PARTICIPANT_NOT_CENTERED",
            "message": "Move slightly right (you are too far left).",
            "metrics": {"center_x": round(center_x, 3), "center_y": round(center_y, 3)}
        }
    if dx > FACE_CENTER_TOLERANCE_X:
        return {
            "passed": False,
            "reason": "PARTICIPANT_NOT_CENTERED",
            "message": "Move slightly left (you are too far right).",
            "metrics": {"center_x": round(center_x, 3), "center_y": round(center_y, 3)}
        }
    if dy < -FACE_CENTER_TOLERANCE_Y:
        return {
            "passed": False,
            "reason": "PARTICIPANT_NOT_CENTERED",
            "message": "Move slightly down (you are too high in frame).",
            "metrics": {"center_x": round(center_x, 3), "center_y": round(center_y, 3)}
        }
    if dy > FACE_CENTER_TOLERANCE_Y:
        return {
            "passed": False,
            "reason": "PARTICIPANT_NOT_CENTERED",
            "message": "Move slightly up (you are too low in frame).",
            "metrics": {"center_x": round(center_x, 3), "center_y": round(center_y, 3)}
        }

    return {
        "passed": True,
        "reason": "FACE_CENTERED",
        "message": "Face centered and well-lit.",
        "metrics": {
            "brightness": round(brightness, 1),
            "contrast": round(contrast, 1),
            "center_x": round(center_x, 3),
            "center_y": round(center_y, 3),
            "face_width": round(face_w, 3),
            "face_height": round(face_h, 3),
        }
    }


class GazeClassifier:
    """
    MediaPipe binocular eye-gaze classifier with PRIMARY-SIDE LOCK.
    """
    def __init__(self, calibration_frames=CALIBRATION_FRAMES):
        self.current_direction = "Straight"
        self.smoothed_h = None
        self.smoothed_v = None
        self.neutral_x = 0.50
        self.neutral_y = 0.50
        self.calib_samples_x = []
        self.calib_samples_y = []
        self.calibration_frames = int(calibration_frames)
        self.is_calibrated = False

    def reset_calibration(self):
        self.calib_samples_x.clear()
        self.calib_samples_y.clear()
        self.is_calibrated = False
        self.smoothed_h = None
        self.smoothed_v = None
        self.current_direction = "Straight"

    def add_calibration_sample(self, raw_h: float, raw_v: float) -> Tuple[bool, float]:
        """
        Adds a sample during calibration phase.
        Returns (is_calibrated, progress_ratio).
        """
        if len(self.calib_samples_x) < self.calibration_frames:
            self.calib_samples_x.append(float(raw_h))
            self.calib_samples_y.append(float(raw_v))

            if len(self.calib_samples_x) >= self.calibration_frames:
                self.neutral_x = float(np.median(self.calib_samples_x))
                self.neutral_y = float(np.median(self.calib_samples_y))
                self.smoothed_h = self.neutral_x
                self.smoothed_v = self.neutral_y
                self.current_direction = "Straight"
                self.is_calibrated = True

        progress = min(1.0, len(self.calib_samples_x) / max(1, self.calibration_frames))
        return self.is_calibrated, progress

    def classify(self, raw_h: float, raw_v: float) -> Tuple[str, float, float, float, float, float]:
        if self.smoothed_h is None:
            self.smoothed_h = float(raw_h)
            self.smoothed_v = float(raw_v)
        else:
            self.smoothed_h = (
                GAZE_SMOOTHING_ALPHA * raw_h
                + (1.0 - GAZE_SMOOTHING_ALPHA) * self.smoothed_h
            )
            self.smoothed_v = (
                GAZE_SMOOTHING_ALPHA * raw_v
                + (1.0 - GAZE_SMOOTHING_ALPHA) * self.smoothed_v
            )

        dx = self.smoothed_h - self.neutral_x
        dy = self.smoothed_v - self.neutral_y

        abs_dx = abs(dx)
        abs_dy = abs(dy)

        # Primary horizontal side lock
        if self.current_direction == "Left":
            if dx <= -GAZE_EXIT_HORIZONTAL:
                confidence = min(1.0, abs_dx / max(GAZE_ENTER_HORIZONTAL * 1.8, 1e-6))
                return ("Left", confidence * 100.0, dx, dy, self.smoothed_h, self.smoothed_v)

        elif self.current_direction == "Right":
            if dx >= GAZE_EXIT_HORIZONTAL:
                confidence = min(1.0, abs_dx / max(GAZE_ENTER_HORIZONTAL * 1.8, 1e-6))
                return ("Right", confidence * 100.0, dx, dy, self.smoothed_h, self.smoothed_v)

        horizontal_candidate = None
        horizontal_conf = 0.0

        if dx <= -GAZE_ENTER_HORIZONTAL:
            horizontal_candidate = "Left"
            horizontal_conf = min(1.0, abs_dx / max(GAZE_ENTER_HORIZONTAL * 1.8, 1e-6))
        elif dx >= GAZE_ENTER_HORIZONTAL:
            horizontal_candidate = "Right"
            horizontal_conf = min(1.0, abs_dx / max(GAZE_ENTER_HORIZONTAL * 1.8, 1e-6))

        vertical_candidate = None
        vertical_conf = 0.0

        if dy <= -GAZE_ENTER_VERTICAL:
            vertical_candidate = "Up"
            vertical_conf = min(1.0, abs_dy / max(GAZE_ENTER_VERTICAL * 1.8, 1e-6))
        elif dy >= GAZE_ENTER_VERTICAL:
            vertical_candidate = "Down"
            vertical_conf = min(1.0, abs_dy / max(GAZE_ENTER_VERTICAL * 1.8, 1e-6))

        if horizontal_candidate is not None:
            if vertical_candidate is not None and vertical_conf > 0.90 and horizontal_conf < 0.45:
                self.current_direction = vertical_candidate
                final_conf = vertical_conf * 100.0
            else:
                self.current_direction = horizontal_candidate
                final_conf = horizontal_conf * 100.0
        elif vertical_candidate is not None:
            self.current_direction = vertical_candidate
            final_conf = vertical_conf * 100.0
        else:
            self.current_direction = "Straight"
            final_conf = 0.0

        return (self.current_direction, final_conf, dx, dy, self.smoothed_h, self.smoothed_v)


# ============================================================
# 3-SECOND CONTINUOUS VALIDATION & DURATION STATE MACHINE
# ============================================================

class ContinuousDirectionCounter:
    """
    Strict continuous-direction timer and actual violation interval tracker.
    
    Rules:
    - 3.0s is ONLY the minimum continuous validation threshold.
    - If continuous episode ends in < 3.0s: DISCARD (0s added, not recorded as valid violation).
    - If continuous episode reaches >= 3.0s: VALID violation with full actual continuous duration recorded (e.g. 7.4s).
    """
    def __init__(self, category_name: str, target_direction: str, threshold_seconds: float = 3.0):
        self.category_name = category_name
        self.target_direction = target_direction
        self.threshold_seconds = float(threshold_seconds)
        self.started_at: Optional[float] = None
        self.last_update_time: Optional[float] = None
        self.completed_intervals: List[Tuple[float, float]] = []
        self.completed_episodes: List[Dict[str, Any]] = []

    def update(self, detected_direction: str, current_time: float) -> Optional[Dict[str, Any]]:
        current_time = float(current_time)

        if detected_direction != self.target_direction:
            return self.close_episode(current_time)

        if self.started_at is None:
            self.started_at = current_time
            self.last_update_time = current_time
            return None

        if self.last_update_time is not None and current_time < self.last_update_time:
            closed = self.close_episode(current_time)
            self.started_at = current_time
            self.last_update_time = current_time
            return closed

        self.last_update_time = current_time
        return None

    def get_active_interval(self, current_time: float) -> Optional[Tuple[float, float]]:
        """Returns the ongoing interval if currently >= 3.0 seconds, else None."""
        if self.started_at is not None:
            elapsed = float(current_time) - self.started_at
            if elapsed >= self.threshold_seconds:
                return (self.started_at, float(current_time))
        return None

    def elapsed(self, detected_direction: str, current_time: float) -> float:
        if detected_direction != self.target_direction or self.started_at is None:
            return 0.0
        return max(0.0, float(current_time) - self.started_at)

    def close_episode(self, current_time: Optional[float] = None) -> Optional[Dict[str, Any]]:
        episode = None
        if self.started_at is not None:
            # End time is the last recorded moment participant was in target direction
            end_t = self.last_update_time if self.last_update_time is not None else (float(current_time) if current_time is not None else self.started_at)
            duration = max(0.0, end_t - self.started_at)
            
            # 3-second validation threshold: only record if >= 3.0s
            if duration >= self.threshold_seconds:
                interval = (self.started_at, end_t)
                self.completed_intervals.append(interval)
                episode = {
                    "start_time": self.started_at,
                    "end_time": end_t,
                    "duration": duration,
                    "category": self.category_name,
                    "direction": self.target_direction,
                    "status": "VALID_VIOLATION (>= 3.0s)",
                }
                self.completed_episodes.append(episode)
                
        self.started_at = None
        self.last_update_time = None
        return episode

    def reset_timer(self):
        self.close_episode()

    def get_all_intervals(self, current_time: Optional[float] = None) -> List[Tuple[float, float]]:
        intervals = list(self.completed_intervals)
        if current_time is not None:
            act = self.get_active_interval(current_time)
            if act:
                intervals.append(act)
        return intervals

    def get_all_episodes(self, current_time: Optional[float] = None) -> List[Dict[str, Any]]:
        episodes = list(self.completed_episodes)
        if current_time is not None and self.started_at is not None:
            duration = float(current_time) - self.started_at
            if duration >= self.threshold_seconds:
                episodes.append({
                    "start_time": self.started_at,
                    "end_time": float(current_time),
                    "duration": duration,
                    "category": self.category_name,
                    "direction": self.target_direction,
                    "status": "VALID_VIOLATION (>= 3.0s)",
                })
        return episodes


# ============================================================
# EXACT DURATION-BASED SCORE CALCULATION & INTERVAL UNION
# ============================================================

def merge_intervals(intervals: List[Tuple[float, float]]) -> List[List[float]]:
    """
    Merges overlapping or contiguous violation intervals so overlapping
    Eye and Head violations are counted only once (union duration).
    """
    if not intervals:
        return []
    valid = sorted(((float(a), float(b)) for a, b in intervals if b > a), key=lambda x: x[0])
    if not valid:
        return []
    merged = []
    for start, end in valid:
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return merged


def calculate_unique_violation_seconds(intervals: List[Tuple[float, float]]) -> float:
    """Calculates total unique violation duration from merged intervals."""
    merged = merge_intervals(intervals)
    return sum(end - start for start, end in merged)


def calculateEyeHeadScore(totalUniqueViolationSeconds: float, actualTestDurationSeconds: float) -> float:
    """
    Authoritative Formula:
    EyeHeadScore = (TotalUniqueValidEyeHeadViolationSeconds / ActualParticipantTestDurationSeconds) * 60
    Clamped between 0.0 and 60.0.
    """
    duration = max(0.0, float(actualTestDurationSeconds or 0.0))
    violation = max(0.0, float(totalUniqueViolationSeconds or 0.0))
    if duration <= 0.0:
        return 0.0
    violation = min(violation, duration)
    score = (violation / duration) * MONITORING_SCORE_MAX
    return max(0.0, min(MONITORING_SCORE_MAX, score))


def calculate_monitoring_score(violation_seconds: float, test_duration_seconds: float) -> Tuple[float, float]:
    """Returns (violation_percentage, eye_head_score)."""
    duration = max(0.0, float(test_duration_seconds or 0.0))
    violation = max(0.0, float(violation_seconds or 0.0))
    if duration <= 0.0:
        return 0.0, 0.0
    violation = min(violation, duration)
    percentage = (violation / duration) * 100.0
    score = calculateEyeHeadScore(violation, duration)
    return min(100.0, percentage), score


# ============================================================
# MOBILE DETECTOR INTERFACE
# ============================================================

def detect_mobile(frame: Optional[np.ndarray] = None) -> Dict[str, Any]:
    """
    Clean interface for mobile detector (e.g. YOLO / SSD / MobileNet).
    Currently returns clean unflagged status when no secondary model is loaded.
    """
    return {
        "detected": False,
        "count": 0,
        "confidence": 0.0,
        "status": "CLEAR"
    }


# ============================================================
# EXCEL GENERATOR (2-SHEET: REPORT + SUMMARY)
# ============================================================

def generate_excel_file(path: str, events: List[Dict[str, Any]], summary_metrics: Dict[str, Any]):
    wb = Workbook()

    # Sheet 1: Monitoring Report
    ws = wb.active
    ws.title = "Monitoring Report"

    headers = [
        "Time (sec)",
        "Event Type",
        "Direction",
        "Validation Status",
        "Actual Duration (sec)",
        "Unique Violation Time (sec)",
        "Eye + Head Score",
        "Final Score",
    ]

    header_fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)

    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    for row_idx, event in enumerate(events, 2):
        values = [
            event.get("Time", 0),
            event.get("Event Type", "Head"),
            event.get("Direction", "Left"),
            event.get("Validation Status", "VALID VIOLATION (>= 3.0s)"),
            event.get("Actual Duration (sec)", "3.0 sec"),
            event.get("Unique Violation Time (sec)", "3.0 sec"),
            event.get("Eye + Head Score", "0.00 / 60"),
            event.get("Final Score", "0.00 / 100"),
        ]
        for col_idx, value in enumerate(values, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.alignment = Alignment(horizontal="center")

    # Sheet 2: Summary
    summary = wb.create_sheet("Summary")
    cfg_dur = summary_metrics.get("configured_duration", summary_metrics.get("test_duration", 60.0))
    act_dur = summary_metrics.get("actual_test_duration", summary_metrics.get("test_duration", 60.0))
    calib_dur = summary_metrics.get("calibration_duration", 0.0)
    v_sec = summary_metrics.get("violation_seconds", 0.0)
    v_pct = summary_metrics.get("violation_percentage", 0.0)
    m_score = summary_metrics.get("monitoring_score", 0.0)
    mob_cnt = summary_metrics.get("mobile_count", 0)
    mob_score = summary_metrics.get("mobile_score", 0.0)
    mob_pct = (mob_score / MOBILE_SCORE_MAX * 100.0) if MOBILE_SCORE_MAX else 0.0
    mf_cnt = summary_metrics.get("multiple_face_count", 0)
    mf_score = summary_metrics.get("multiple_face_score", 0.0)
    mf_pct = (mf_score / MULTIPLE_FACE_SCORE_MAX * 100.0) if MULTIPLE_FACE_SCORE_MAX else 0.0
    np_det = summary_metrics.get("no_person_detected", False)
    np_score = summary_metrics.get("no_person_score", 0.0)
    np_pct = (np_score / NO_PERSON_SCORE_MAX * 100.0) if NO_PERSON_SCORE_MAX else 0.0
    
    # Authoritative scoring model:
    # Malpractice Risk Score (0 = Clean, 100 = Max Malpractice)
    final_malpractice = min(100.0, m_score + mob_score + mf_score + np_score)
    # Integrity Trust Score (100 = Clean, 0 = Max Malpractice)
    final_integrity = max(0.0, 100.0 - final_malpractice)

    summary_data = [
        ("LMS MONITORING SUMMARY", ""),
        ("--------------------------------", "--------------------------------"),
        ("SESSION INFORMATION", ""),
        ("  Configured Duration", f"{cfg_dur:.2f} sec"),
        ("  Actual Test Duration", f"{act_dur:.2f} sec"),
        ("  Calibration Duration", f"{calib_dur:.2f} sec"),
        ("", ""),
        ("MALPRACTICE SCORING SUMMARY", ""),
        ("  Component", "Violation / Count | Percentage | Penalty Score | Maximum"),
        ("  Eye + Head (MediaPipe)", f"{v_sec:.2f} sec | {v_pct:.2f}% | {m_score:.2f} | 60"),
        ("  Mobile Device", f"{mob_cnt} | {mob_pct:.2f}% | {mob_score:.2f} | 20"),
        ("  Multiple Face", f"{mf_cnt} | {mf_pct:.2f}% | {mf_score:.2f} | 10"),
        ("  No Person / Absence", f"{'Detected' if np_det else 'Not Detected'} | {np_pct:.2f}% | {np_score:.2f} | 10"),
        ("", ""),
        ("FINAL MALPRACTICE & INTEGRITY SCORES", ""),
        ("  Eye + Head Penalty Score", f"{m_score:.2f} / 60"),
        ("  Mobile Penalty Score", f"{mob_score:.2f} / 20"),
        ("  Multiple Face Penalty Score", f"{mf_score:.2f} / 10"),
        ("  No Person Penalty Score", f"{np_score:.2f} / 10"),
        ("  Total Malpractice Risk Score", f"{final_malpractice:.2f} / 100"),
        ("  Final Assessment Integrity Score", f"{final_integrity:.2f} / 100"),
        ("--------------------------------", "--------------------------------"),
        ("Exact Formula", "EyeHeadScore = (TotalUniqueValidEyeHeadViolationSeconds / ActualParticipantTestDurationSeconds) * 60"),
    ]

    for r, (label, val) in enumerate(summary_data, 1):
        c1 = summary.cell(r, 1, label)
        c2 = summary.cell(r, 2, val)
        if label.isupper() or "Total" in label or "SUMMARY" in label or "FINAL" in label:
            c1.font = Font(bold=True)
            c2.font = Font(bold=True)

    for sheet in (ws, summary):
        for column_cells in sheet.columns:
            max_length = 0
            col_letter = column_cells[0].column_letter
            for cell in column_cells:
                val_str = "" if cell.value is None else str(cell.value)
                max_length = max(max_length, len(val_str))
            sheet.column_dimensions[col_letter].width = min(max_length + 3, 50)

    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    try:
        wb.save(path)
        logger.info(f"[REPORT] Saved Excel to: {os.path.abspath(path)}")
    except PermissionError:
        fallback_path = os.path.splitext(path)[0] + "_output.xlsx"
        wb.save(fallback_path)
        logger.info(f"[REPORT] Saved report to fallback: {os.path.abspath(fallback_path)}")


# ============================================================
# FASTAPI & PROGRAMMATIC MEDIAPIPE PROCTOR ENGINE CLASS
# ============================================================

class MediaPipeProctorEngine:
    """
    Authoritative MediaPipe Proctoring Engine for LMS Assessment & API Services.
    Implements 3-second continuous threshold validation, Centering Audit, Calibration State Machine,
    Primary-Side Lock, and exact duration-based 60-mark Eye+Head scoring.
    """
    def __init__(self):
        self.options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=FACE_MODEL_PATH),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=4,
        )
        self.detector = None
        try:
            self.detector = mp.tasks.vision.FaceLandmarker.create_from_options(self.options)
            logger.info("MediaPipe FaceLandmarker loaded successfully in proctoring_detector.")
        except Exception as e:
            logger.warning(f"Could not load MediaPipe FaceLandmarker from {FACE_MODEL_PATH}: {e}")

        self.sessions: Dict[str, Dict[str, Any]] = {}

    def _get_or_create_session(self, session_id: str, configured_duration: Optional[float] = None) -> Dict[str, Any]:
        if session_id not in self.sessions:
            dur = float(configured_duration) if configured_duration is not None else 60.0
            self.sessions[session_id] = {
                "session_id": session_id,
                "state": SessionState.CREATED,
                "created_at": time.monotonic(),
                "calibration_started_at": None,
                "calibration_completed_at": None,
                "test_started_at": None,
                "test_ended_at": None,
                "configured_duration": dur,
                "gaze_classifier": GazeClassifier(),
                "smoothed_pose": None,
                "previous_pose": None,
                "counters": {
                    "head_left": ContinuousDirectionCounter("Head", "Left", VIOLATION_SECONDS),
                    "head_right": ContinuousDirectionCounter("Head", "Right", VIOLATION_SECONDS),
                    "head_up": ContinuousDirectionCounter("Head", "Up", VIOLATION_SECONDS),
                    "eye_left": ContinuousDirectionCounter("Eyeball", "Left", VIOLATION_SECONDS),
                    "eye_right": ContinuousDirectionCounter("Eyeball", "Right", VIOLATION_SECONDS),
                    "eye_up": ContinuousDirectionCounter("Eyeball", "Up", VIOLATION_SECONDS),
                },
                "multiple_face_detected": False,
                "multiple_face_count": 0,
                "no_person_detected": False,
                "mobile_count": 0,
                "mobile_score": 0.0,
                "events": [],
            }
        else:
            # Update configured duration if supplied and session not yet running
            if configured_duration is not None and self.sessions[session_id]["state"] in (SessionState.CREATED, SessionState.CALIBRATING, SessionState.READY):
                self.sessions[session_id]["configured_duration"] = float(configured_duration)

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

    def validate_calibration(self, b64_data: str, session_id: str = "default", configured_duration: Optional[float] = None) -> Dict[str, Any]:
        """
        Step-by-step Pre-Assessment Calibration Validator:
        1. Decodes frame & validates image quality
        2. Detects face count (must be exactly 1)
        3. Audits face centering & distance in frame
        4. Collects calibration sample across CALIBRATION_FRAMES (45 frames)
        5. Returns status='CALIBRATING' (passed=False, progress<1.0) until frame 45
        6. On frame 45, sets state='READY', status='CALIBRATION_PASSED' (passed=True, progress=1.0)
        """
        img = self.decode_b64(b64_data)
        if img is None:
            return {"passed": False, "status": "ERROR", "reason": "INVALID_IMAGE", "message": "Camera frame could not be read."}

        sess = self._get_or_create_session(session_id, configured_duration)
        if sess["calibration_started_at"] is None:
            sess["calibration_started_at"] = time.monotonic()
            sess["state"] = SessionState.CALIBRATING

        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        res = self.detector.detect(mp_img) if self.detector else None

        num_faces = len(res.face_landmarks) if (res and res.face_landmarks) else 0

        # Face count audit
        if num_faces == 0:
            sess["state"] = SessionState.CALIBRATION_FAILED
            sess["gaze_classifier"].reset_calibration()
            return {
                "passed": False,
                "status": "FACE_NOT_DETECTED",
                "reason": "FACE_NOT_DETECTED",
                "message": "No face detected in camera view. Please position yourself in front of the camera.",
                "progress": 0.0,
            }

        if num_faces > 1:
            sess["state"] = SessionState.CALIBRATION_FAILED
            sess["gaze_classifier"].reset_calibration()
            return {
                "passed": False,
                "status": "MULTIPLE_FACES",
                "reason": "MULTIPLE_FACES",
                "message": f"Multiple faces detected ({num_faces}). Only the candidate should be visible.",
                "progress": 0.0,
            }

        # Face centering & quality audit
        fl = res.face_landmarks[0]
        audit = audit_participant_framing(fl, w, h, gray)
        if not audit["passed"]:
            sess["state"] = SessionState.CALIBRATION_FAILED
            sess["gaze_classifier"].reset_calibration()
            return {
                "passed": False,
                "status": audit["reason"],
                "reason": audit["reason"],
                "message": audit["message"],
                "progress": 0.0,
                "metrics": audit.get("metrics", {})
            }

        # Extract eye ratios and add calibration sample
        if len(fl) > LEFT_IRIS_CENTER:
            raw_h, raw_v, _ = calculate_normalized_eye_ratios(fl, w, h)
            is_calibrated, progress = sess["gaze_classifier"].add_calibration_sample(raw_h, raw_v)
        else:
            return {
                "passed": False,
                "status": "INCOMPLETE_LANDMARKS",
                "reason": "INCOMPLETE_LANDMARKS",
                "message": "Iris landmarks not clearly visible. Please adjust camera angle.",
                "progress": 0.0,
            }

        if not is_calibrated:
            sess["state"] = SessionState.CALIBRATING
            return {
                "passed": False,
                "status": "CALIBRATING",
                "reason": "CALIBRATING",
                "message": f"Calibrating neutral gaze... {int(progress * 100)}% complete. Please look straight ahead.",
                "progress": round(progress, 2),
                "frame": len(sess["gaze_classifier"].calib_samples_x),
                "total_frames": CALIBRATION_FRAMES,
                "metrics": audit.get("metrics", {})
            }

        # Calibration completed!
        sess["state"] = SessionState.READY
        sess["calibration_completed_at"] = time.monotonic()
        return {
            "passed": True,
            "status": "CALIBRATION_PASSED",
            "reason": "CALIBRATION_PASSED",
            "message": "Calibration successful — participant centered and baseline established.",
            "progress": 1.0,
            "metrics": {
                "brightness": audit["metrics"]["brightness"],
                "contrast": audit["metrics"]["contrast"],
                "face_detected": True,
                "neutral_x": round(sess["gaze_classifier"].neutral_x, 3),
                "neutral_y": round(sess["gaze_classifier"].neutral_y, 3),
            }
        }

    def process_b64_frame(self, b64_data: str, session_id: str = "default", timestamp_ms: Optional[int] = None, configured_duration: Optional[float] = None) -> Dict[str, Any]:
        """
        Processes a live monitoring frame during an active assessment attempt.
        """
        img = self.decode_b64(b64_data)
        if img is None:
            return {"success": False, "error": "Invalid frame image data"}

        h, w = img.shape[:2]
        now_ts = time.monotonic()
        sess = self._get_or_create_session(session_id, configured_duration)

        # Transition to RUNNING state when first monitoring frame arrives
        if sess["state"] in (SessionState.CREATED, SessionState.READY, SessionState.CALIBRATING):
            sess["state"] = SessionState.RUNNING
            if sess["test_started_at"] is None:
                sess["test_started_at"] = now_ts

        test_start = sess["test_started_at"] or now_ts
        elapsed = max(0.0, now_ts - test_start)
        cntrs = sess["counters"]

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        res = self.detector.detect(mp_img) if self.detector else None

        face_count = len(res.face_landmarks) if (res and res.face_landmarks) else 0

        # ------------------------------------------------------------
        # 1. Multiple-Face Handling (Strict: Do NOT process face[0])
        # ------------------------------------------------------------
        if face_count >= 2:
            sess["multiple_face_detected"] = True
            sess["multiple_face_count"] += 1
            # Reset active single-participant direction timers
            for c in cntrs.values():
                c.reset_timer()
            sess["previous_pose"] = None
            sess["smoothed_pose"] = None
            head_dir, gaze_dir = "Multiple Faces", "Multiple Faces"
            head_conf, gaze_conf = 100.0, 100.0
            pitch, yaw = 0.0, 0.0
            status = "MULTIPLE_FACES"

        # ------------------------------------------------------------
        # 2. No-Person Handling (Face Absent)
        # ------------------------------------------------------------
        elif face_count == 0:
            sess["no_person_detected"] = True
            for c in cntrs.values():
                c.reset_timer()
            sess["previous_pose"] = None
            sess["smoothed_pose"] = None
            head_dir, gaze_dir = "Not Detected", "Not Detected"
            head_conf, gaze_conf = 0.0, 0.0
            pitch, yaw = 0.0, 0.0
            status = "NO_PERSON"

        # ------------------------------------------------------------
        # 3. Normal Single Participant Processing
        # ------------------------------------------------------------
        else:
            status = "RUNNING"
            fl = res.face_landmarks[0]

            # Head Pose solvePnP
            pts = np.array([(fl[idx].x * w, fl[idx].y * h) for idx in LANDMARK_INDICES], dtype=np.float32)
            focal = w
            cam_mat = np.array([[focal, 0, w / 2], [0, focal, h / 2], [0, 0, 1]], dtype=np.float32)
            dist = np.zeros((4, 1), dtype=np.float32)

            if sess["previous_pose"] is not None:
                succ, rvec, tvec = cv2.solvePnP(MODEL_POINTS, pts, cam_mat, dist,
                                               rvec=sess["previous_pose"][0].copy(),
                                               tvec=sess["previous_pose"][1].copy(),
                                               useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE)
            else:
                succ, rvec, tvec = cv2.solvePnP(MODEL_POINTS, pts, cam_mat, dist, flags=cv2.SOLVEPNP_ITERATIVE)

            if succ:
                sess["previous_pose"] = (rvec, tvec)
                rmat, _ = cv2.Rodrigues(rvec)
                p, y, r = rotation_matrix_to_euler_angles(rmat)
                if p > 90: p -= 180
                elif p < -90: p += 180
                p += PITCH_OFFSET

                if sess["smoothed_pose"] is None: sess["smoothed_pose"] = [p, y, r]
                else:
                    sess["smoothed_pose"][0] += POSE_ALPHA * (p - sess["smoothed_pose"][0])
                    sess["smoothed_pose"][1] += POSE_ALPHA * (y - sess["smoothed_pose"][1])
                    sess["smoothed_pose"][2] += POSE_ALPHA * (r - sess["smoothed_pose"][2])
                pitch, yaw, _ = sess["smoothed_pose"]

                y_sign, y_conf = fuzzy_classify(yaw, YAW_INNER, YAW_OUTER)
                p_sign, p_conf = fuzzy_classify(pitch, PITCH_INNER, PITCH_OUTER)

                horiz = "Right" if (y_sign > 0 and y_conf >= YAW_RIGHT_CUTOFF) else ("Left" if (y_sign < 0 and y_conf >= YAW_LEFT_CUTOFF) else None)
                vert = "Down" if (p_sign > 0 and p_conf >= PITCH_DOWN_CUTOFF) else ("Up" if (p_sign < 0 and p_conf >= PITCH_UP_CUTOFF) else None)

                cands = []
                if horiz: cands.append((horiz, y_conf))
                if vert: cands.append((vert, p_conf))
                if cands:
                    cands.sort(key=lambda x: x[1], reverse=True)
                    head_dir, head_conf = cands[0][0], cands[0][1] * 100.0
                else:
                    head_dir, head_conf = "Straight", 0.0
            else:
                head_dir, head_conf, pitch, yaw = "Straight", 0.0, 0.0, 0.0

            # Gaze
            if len(fl) > LEFT_IRIS_CENTER:
                try:
                    raw_h, raw_v, _ = calculate_normalized_eye_ratios(fl, w, h)
                    gaze_dir, gaze_conf, _, _, _, _ = sess["gaze_classifier"].classify(raw_h, raw_v)
                except Exception:
                    gaze_dir, gaze_conf = "Straight", 0.0
            else:
                gaze_dir, gaze_conf = "Straight", 0.0

            # Head counter update
            if head_dir in IGNORED_HEAD_DIRECTIONS or head_dir == "Straight":
                cntrs["head_left"].reset_timer()
                cntrs["head_right"].reset_timer()
                cntrs["head_up"].reset_timer()
            else:
                cntrs["head_left"].update(head_dir, now_ts)
                cntrs["head_right"].update(head_dir, now_ts)
                cntrs["head_up"].update(head_dir, now_ts)

            # Eye counter update
            if gaze_dir in IGNORED_EYE_DIRECTIONS or gaze_dir == "Straight":
                cntrs["eye_left"].close_episode(); cntrs["eye_right"].close_episode(); cntrs["eye_up"].close_episode()
            elif gaze_dir == "Left":
                cntrs["eye_right"].close_episode(); cntrs["eye_up"].close_episode()
                cntrs["eye_left"].update("Left", now_ts)
            elif gaze_dir == "Right":
                cntrs["eye_left"].close_episode(); cntrs["eye_up"].close_episode()
                cntrs["eye_right"].update("Right", now_ts)
            elif gaze_dir == "Up":
                cntrs["eye_left"].close_episode(); cntrs["eye_right"].close_episode()
                cntrs["eye_up"].update("Up", now_ts)

        # ------------------------------------------------------------
        # 4. Interval Union & Dynamic Score Calculation
        # ------------------------------------------------------------
        all_intervals = []
        for c in cntrs.values():
            all_intervals.extend(c.get_all_intervals(now_ts))

        unique_sec = calculate_unique_violation_seconds(all_intervals)
        actual_test_dur = max(1.0, elapsed)
        v_pct, m_score = calculate_monitoring_score(unique_sec, actual_test_dur)
        mf_score = MULTIPLE_FACE_SCORE_MAX if sess["multiple_face_detected"] else 0.0
        np_score = NO_PERSON_SCORE_MAX if sess["no_person_detected"] else 0.0
        mob_score = min(float(sess["mobile_score"]), MOBILE_SCORE_MAX)
        final_malpractice = min(100.0, m_score + mf_score + np_score + mob_score)
        final_integrity = max(0.0, 100.0 - final_malpractice)

        return {
            "success": True,
            "session_id": session_id,
            "state": sess["state"].value,
            "elapsed_seconds": round(elapsed, 2),
            "configured_duration": sess["configured_duration"],
            "actual_test_duration": round(actual_test_dur, 2),
            "face_count": face_count,
            "head_direction": head_dir,
            "head_confidence": round(head_conf, 1),
            "gaze_direction": gaze_dir,
            "gaze_confidence": round(gaze_conf, 1),
            "pitch": round(pitch, 1),
            "yaw": round(yaw, 1),
            "scoring": {
                "unique_violation_seconds": round(unique_sec, 2),
                "violation_percentage": round(v_pct, 2),
                "eye_head_score": round(m_score, 2),
                "multiple_face_score": round(mf_score, 2),
                "no_person_score": round(np_score, 2),
                "mobile_score": round(mob_score, 2),
                "final_malpractice_score": round(final_malpractice, 2),
                "final_integrity_score": round(final_integrity, 2),
                "final_score": round(final_malpractice, 2),
            },
            "events_count": len(all_intervals),
            "status": status
        }

    def generate_session_report(self, session_id: str, output_excel: str) -> str:
        sess = self.sessions.get(session_id)
        if not sess:
            raise ValueError(f"No active session found for ID: {session_id}")

        now_ts = time.monotonic()
        sess["state"] = SessionState.COMPLETED
        sess["test_ended_at"] = now_ts

        cntrs = sess["counters"]
        for c in cntrs.values():
            c.close_episode(now_ts)

        all_intervals = []
        all_episodes = []
        for c in cntrs.values():
            all_intervals.extend(c.get_all_intervals())
            all_episodes.extend(c.get_all_episodes())

        test_start = sess["test_started_at"] or sess["created_at"]
        calib_start = sess["calibration_started_at"] or sess["created_at"]
        calib_end = sess["calibration_completed_at"] or test_start
        calib_dur = max(0.0, calib_end - calib_start)

        unique_sec = calculate_unique_violation_seconds(all_intervals)
        actual_test_dur = max(1.0, now_ts - test_start)
        configured_dur = sess.get("configured_duration", actual_test_dur)

        v_pct, m_score = calculate_monitoring_score(unique_sec, actual_test_dur)
        mf_score = MULTIPLE_FACE_SCORE_MAX if sess["multiple_face_detected"] else 0.0
        np_score = NO_PERSON_SCORE_MAX if sess["no_person_detected"] else 0.0
        mob_score = min(float(sess["mobile_score"]), MOBILE_SCORE_MAX)
        final_malpractice = min(100.0, m_score + mf_score + np_score + mob_score)
        final_integrity = max(0.0, 100.0 - final_malpractice)

        all_episodes.sort(key=lambda x: x.get("start_time", 0.0))

        formatted_events = []
        for ep in all_episodes:
            rel_start = ep.get("start_time", test_start) - test_start
            formatted_events.append({
                "Time": round(max(0.0, rel_start), 2),
                "Event Type": ep.get("category", "Head"),
                "Direction": ep.get("direction", "Left"),
                "Validation Status": ep.get("status", "VALID VIOLATION (>= 3.0s)"),
                "Actual Duration (sec)": f"{ep.get('duration', 3.0):.1f} sec",
                "Unique Violation Time (sec)": f"{unique_sec:.2f} sec",
                "Eye + Head Score": f"{m_score:.2f} / 60",
                "Final Score": f"{final_malpractice:.2f} / 100",
            })

        summary_metrics = {
            "configured_duration": configured_dur,
            "actual_test_duration": actual_test_dur,
            "calibration_duration": calib_dur,
            "test_duration": actual_test_dur,
            "violation_seconds": unique_sec,
            "violation_percentage": v_pct,
            "monitoring_score": m_score,
            "multiple_face_detected": sess["multiple_face_detected"],
            "multiple_face_score": mf_score,
            "no_person_detected": sess["no_person_detected"],
            "no_person_score": np_score,
            "mobile_count": sess["mobile_count"],
            "mobile_score": mob_score,
            "final_score": final_malpractice,
            "final_percentage": final_malpractice,
        }

        generate_excel_file(output_excel, formatted_events, summary_metrics)
        return output_excel


# Initialize module-level singleton instance for FastAPI endpoints
proctor_engine = MediaPipeProctorEngine()


# ============================================================
# STANDALONE PIPELINE RUNNER
# ============================================================

def run_monitoring_session(config=None):
    if config is None:
        config = {}

    args = parse_args()
    cam_input = str(config.get("camera", args.camera))
    output_excel = str(config.get("excel", args.excel))
    output_video = str(config.get("output", args.output))
    configured_duration = float(config.get("duration", args.duration))
    record_session = bool(config.get("record", False))
    headless = bool(config.get("headless", args.headless))

    camera_source = int(cam_input) if cam_input.isdigit() else cam_input
    cap = cv2.VideoCapture(camera_source)
    if not cap.isOpened():
        if isinstance(camera_source, int) and os.path.exists("2.mp4"):
            print(f"[WARN] Live webcam {camera_source} not accessible. Falling back to simulation '2.mp4'.")
            camera_source = "2.mp4"
            cap = cv2.VideoCapture(camera_source)
        else:
            raise RuntimeError(f"Could not open camera/video source: {camera_source}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720

    writer = None
    if record_session:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(output_video, fourcc, 30.0, (width, height))

    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=FACE_MODEL_PATH),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=4,
    )

    gaze_classifier = GazeClassifier()
    counters = {
        "head_left": ContinuousDirectionCounter("Head", "Left", VIOLATION_SECONDS),
        "head_right": ContinuousDirectionCounter("Head", "Right", VIOLATION_SECONDS),
        "head_up": ContinuousDirectionCounter("Head", "Up", VIOLATION_SECONDS),
        "eye_left": ContinuousDirectionCounter("Eyeball", "Left", VIOLATION_SECONDS),
        "eye_right": ContinuousDirectionCounter("Eyeball", "Right", VIOLATION_SECONDS),
        "eye_up": ContinuousDirectionCounter("Eyeball", "Up", VIOLATION_SECONDS),
    }

    multiple_face_detected = False
    no_person_detected = False
    mobile_count = 0
    mobile_score = 0.0

    previous_pose = None
    smoothed_pose = None

    print("=" * 65)
    print("LMS LIVE PARTICIPANT MONITORING — EXACT 60-MARK DURATION PIPELINE")
    print("=" * 65)
    print(f"  Camera Source       : {camera_source}")
    print(f"  Validation Threshold: Continuous {VIOLATION_SECONDS:.1f}s minimum required per violation")
    print(f"  Scoring Formula     : (TotalUniqueViolationSeconds / ActualTestDurationSeconds) * 60")
    print(f"  Score Rules         : Eye+Head=60%, Mobile=20%, Multiple Face=10%, No Person=10%")
    print(f"  Excel Report        : {output_excel}")
    print("=" * 65 + "\n")

    # ------------------------------------------------------------
    # Phase 1: Pre-Assessment Calibration
    # ------------------------------------------------------------
    print("[1/2] Pre-Assessment Calibration Phase: Please center your face and look straight at the screen.")
    calib_start = time.monotonic()

    with mp.tasks.vision.FaceLandmarker.create_from_options(options) as landmarker:
        while not gaze_classifier.is_calibrated:
            success, frame = cap.read()
            if not success:
                break

            frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            res = landmarker.detect(mp_img)

            num_faces = len(res.face_landmarks) if (res and res.face_landmarks) else 0

            if num_faces == 1:
                fl = res.face_landmarks[0]
                audit = audit_participant_framing(fl, w, h, gray)
                if audit["passed"] and len(fl) > LEFT_IRIS_CENTER:
                    raw_h, raw_v, _ = calculate_normalized_eye_ratios(fl, w, h)
                    is_done, prog = gaze_classifier.add_calibration_sample(raw_h, raw_v)
                    cv2.putText(frame, f"Calibrating: {int(prog*100)}%", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
                else:
                    cv2.putText(frame, audit["message"], (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            elif num_faces > 1:
                cv2.putText(frame, "Multiple faces detected. Please be alone in frame.", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            else:
                cv2.putText(frame, "No face detected. Look into camera.", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            if not headless:
                try:
                    cv2.imshow("LMS Live AI Monitoring", frame)
                    if (cv2.waitKey(1) & 0xFF) == ord("q"): break
                except Exception: pass

    calib_end = time.monotonic()
    calib_duration = calib_end - calib_start
    print(f"✓ Calibration completed in {calib_duration:.1f}s. Starting Assessment Monitoring Phase...\n")

    # ------------------------------------------------------------
    # Phase 2: Assessment Monitoring (Actual Test Timer Starts Here)
    # ------------------------------------------------------------
    session_start = time.monotonic()
    frame_count = 0

    with mp.tasks.vision.FaceLandmarker.create_from_options(options) as landmarker:
        try:
            while True:
                success, frame = cap.read()
                if not success:
                    break

                frame_count += 1
                cur_mono = time.monotonic()
                elapsed = cur_mono - session_start

                frame = cv2.flip(frame, 1)
                h, w = frame.shape[:2]

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                res = landmarker.detect(mp_img)

                face_count = len(res.face_landmarks) if (res and res.face_landmarks) else 0

                # 1. Multiple face check (Strict: do not process face[0])
                if face_count >= 2:
                    multiple_face_detected = True
                    for c in counters.values():
                        c.reset_timer()
                    previous_pose = None
                    smoothed_pose = None
                    head_dir, gaze_dir = "Multiple Faces", "Multiple Faces"

                # 2. No person
                elif face_count == 0:
                    no_person_detected = True
                    for c in counters.values():
                        c.reset_timer()
                    previous_pose = None
                    smoothed_pose = None
                    head_dir, gaze_dir = "Not Detected", "Not Detected"

                # 3. Single participant
                else:
                    fl = res.face_landmarks[0]
                    pts = np.array([(fl[idx].x * w, fl[idx].y * h) for idx in LANDMARK_INDICES], dtype=np.float32)
                    focal = w
                    cam_mat = np.array([[focal, 0, w / 2], [0, focal, h / 2], [0, 0, 1]], dtype=np.float32)
                    dist = np.zeros((4, 1), dtype=np.float32)

                    if previous_pose is not None:
                        succ, rvec, tvec = cv2.solvePnP(MODEL_POINTS, pts, cam_mat, dist,
                                                       rvec=previous_pose[0].copy(), tvec=previous_pose[1].copy(),
                                                       useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE)
                    else:
                        succ, rvec, tvec = cv2.solvePnP(MODEL_POINTS, pts, cam_mat, dist, flags=cv2.SOLVEPNP_ITERATIVE)

                    if succ:
                        previous_pose = (rvec, tvec)
                        rmat, _ = cv2.Rodrigues(rvec)
                        p, y, r = rotation_matrix_to_euler_angles(rmat)
                        if p > 90: p -= 180
                        elif p < -90: p += 180
                        p += PITCH_OFFSET

                        if smoothed_pose is None: smoothed_pose = [p, y, r]
                        else:
                            smoothed_pose[0] += POSE_ALPHA * (p - smoothed_pose[0])
                            smoothed_pose[1] += POSE_ALPHA * (y - smoothed_pose[1])
                            smoothed_pose[2] += POSE_ALPHA * (r - smoothed_pose[2])
                        pitch, yaw, _ = smoothed_pose

                        y_sign, y_conf = fuzzy_classify(yaw, YAW_INNER, YAW_OUTER)
                        p_sign, p_conf = fuzzy_classify(pitch, PITCH_INNER, PITCH_OUTER)

                        horiz = "Right" if (y_sign > 0 and y_conf >= YAW_RIGHT_CUTOFF) else ("Left" if (y_sign < 0 and y_conf >= YAW_LEFT_CUTOFF) else None)
                        vert = "Down" if (p_sign > 0 and p_conf >= PITCH_DOWN_CUTOFF) else ("Up" if (p_sign < 0 and p_conf >= PITCH_UP_CUTOFF) else None)

                        cands = []
                        if horiz: cands.append((horiz, y_conf))
                        if vert: cands.append((vert, p_conf))
                        if cands:
                            cands.sort(key=lambda x: x[1], reverse=True)
                            head_dir = cands[0][0]
                        else:
                            head_dir = "Straight"
                    else:
                        head_dir = "Straight"

                    if len(fl) > LEFT_IRIS_CENTER:
                        try:
                            raw_h, raw_v, _ = calculate_normalized_eye_ratios(fl, w, h)
                            gaze_dir, _, _, _, _, _ = gaze_classifier.classify(raw_h, raw_v)
                        except Exception:
                            gaze_dir = "Straight"
                    else:
                        gaze_dir = "Straight"

                    # Head update
                    if head_dir in IGNORED_HEAD_DIRECTIONS or head_dir == "Straight":
                        counters["head_left"].reset_timer(); counters["head_right"].reset_timer(); counters["head_up"].reset_timer()
                    else:
                        counters["head_left"].update(head_dir, cur_mono)
                        counters["head_right"].update(head_dir, cur_mono)
                        counters["head_up"].update(head_dir, cur_mono)

                    # Eye update
                    if gaze_dir in IGNORED_EYE_DIRECTIONS or gaze_dir == "Straight":
                        counters["eye_left"].close_episode(); counters["eye_right"].close_episode(); counters["eye_up"].close_episode()
                    elif gaze_dir == "Left":
                        counters["eye_right"].close_episode(); counters["eye_up"].close_episode()
                        counters["eye_left"].update("Left", cur_mono)
                    elif gaze_dir == "Right":
                        counters["eye_left"].close_episode(); counters["eye_up"].close_episode()
                        counters["eye_right"].update("Right", cur_mono)
                    elif gaze_dir == "Up":
                        counters["eye_left"].close_episode(); counters["eye_right"].close_episode()
                        counters["eye_up"].update("Up", cur_mono)

                if configured_duration > 0 and elapsed >= configured_duration:
                    break

                if not headless:
                    try:
                        cv2.imshow("LMS Live AI Monitoring", frame)
                        if (cv2.waitKey(1) & 0xFF) == ord("q"): break
                    except Exception: pass
        except KeyboardInterrupt:
            pass

    cap.release()
    if writer is not None: writer.release()
    try: cv2.destroyAllWindows()
    except Exception: pass

    end_mono = time.monotonic()
    actual_test_dur = max(1.0, end_mono - session_start)

    # Close all active episodes cleanly
    for c in counters.values():
        c.close_episode(end_mono)

    # Collect all valid intervals and completed episodes from all 6 categories
    all_intervals = []
    all_episodes = []
    for c in counters.values():
        all_intervals.extend(c.get_all_intervals())
        all_episodes.extend(c.get_all_episodes())

    unique_sec = calculate_unique_violation_seconds(all_intervals)
    final_v_pct, final_m_score = calculate_monitoring_score(unique_sec, actual_test_dur)
    final_mf_score = MULTIPLE_FACE_SCORE_MAX if multiple_face_detected else 0.0
    final_np_score = NO_PERSON_SCORE_MAX if no_person_detected else 0.0
    final_mob_score = min(float(mobile_score), MOBILE_SCORE_MAX)
    final_malpractice = min(100.0, final_m_score + final_mf_score + final_np_score + final_mob_score)
    final_integrity = max(0.0, 100.0 - final_malpractice)

    all_episodes.sort(key=lambda x: x.get("start_time", 0.0))

    # Format events with full actual continuous duration
    formatted_events = []
    for ep in all_episodes:
        rel_start = ep.get("start_time", session_start) - session_start
        formatted_events.append({
            "Time": round(max(0.0, rel_start), 2),
            "Event Type": ep.get("category", "Head"),
            "Direction": ep.get("direction", "Left"),
            "Validation Status": ep.get("status", "VALID VIOLATION (>= 3.0s)"),
            "Actual Duration (sec)": f"{ep.get('duration', 3.0):.1f} sec",
            "Unique Violation Time (sec)": f"{unique_sec:.2f} sec",
            "Eye + Head Score": f"{final_m_score:.2f} / 60",
            "Final Score": f"{final_malpractice:.2f} / 100",
        })

    summary_metrics = {
        "configured_duration": configured_duration,
        "actual_test_duration": actual_test_dur,
        "calibration_duration": calib_duration,
        "test_duration": actual_test_dur,
        "violation_seconds": unique_sec,
        "violation_percentage": final_v_pct,
        "monitoring_score": final_m_score,
        "multiple_face_detected": multiple_face_detected,
        "multiple_face_score": final_mf_score,
        "no_person_detected": no_person_detected,
        "no_person_score": final_np_score,
        "mobile_count": mobile_count,
        "mobile_score": final_mob_score,
        "final_score": final_malpractice,
        "final_percentage": final_malpractice,
    }

    generate_excel_file(output_excel, formatted_events, summary_metrics)

    print("\n" + "=" * 65)
    print("LMS LIVE SESSION MONITORING REPORT")
    print("=" * 65)
    print(f"Configured Duration    : {configured_duration:.2f}s")
    print(f"Actual Test Duration   : {actual_test_dur:.2f}s ({frame_count:,} frames)")
    print(f"Calibration Duration   : {calib_duration:.2f}s")
    print(f"Unique Violation Time  : {unique_sec:.2f}s")
    print(f"Violation Percentage   : {final_v_pct:.2f}%")
    print(f"Eye + Head Score       : {final_m_score:.2f} / 60")
    print(f"Multiple Face Score    : {final_mf_score:.2f} / 10")
    print(f"No Person Score        : {final_np_score:.2f} / 10")
    print(f"Mobile Phone Score     : {final_mob_score:.2f} / 20")
    print(f"MALPRACTICE RISK SCORE : {final_malpractice:.2f} / 100")
    print(f"FINAL INTEGRITY SCORE  : {final_integrity:.2f} / 100")
    print(f"Excel Report           : {output_excel}")
    print("=" * 65 + "\n")

    return {
        "success": True,
        "configured_duration_seconds": configured_duration,
        "actual_test_duration_seconds": actual_test_dur,
        "calibration_duration_seconds": calib_duration,
        "unique_violation_seconds": unique_sec,
        "violation_percentage": final_v_pct,
        "eye_head_score": final_m_score,
        "multiple_face_score": final_mf_score,
        "no_person_score": final_np_score,
        "mobile_score": final_mob_score,
        "final_score": final_malpractice,
        "final_integrity_score": final_integrity,
        "excel_path": os.path.abspath(output_excel),
        "events": formatted_events,
    }


if __name__ == "__main__":
    run_monitoring_session()
