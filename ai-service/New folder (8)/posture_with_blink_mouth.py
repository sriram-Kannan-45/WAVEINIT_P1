"""
LMS Participant Monitoring / Proctoring Monitor
================================================

Monitors one participant during an online exam.  The required camera framing
is the participant's UPPER BODY:

    HEAD -> SHOULDERS -> CHEST

A short CALIBRATION phase runs before the exam so the participant can adjust
the camera.  The exam only begins once an acceptable framing baseline exists.

Pipeline:
    CAMERA CHECK
      -> CALIBRATION
      -> HEAD + FACE CHECK
      -> EYE + IRIS CHECK
      -> HEAD POSE CHECK
      -> UPPER BODY / CHEST CHECK
      -> CENTER POSITION CHECK
      -> MULTIPLE PERSON CHECK
      -> OBJECT CHECK (optional)
      -> CAMERA QUALITY CHECK
      -> BROWSER EVENT CHECK (optional, via an external agent)
      -> TEMPORAL VALIDATION  (confidence + persistence + duration + cooldown)
      -> EVENT ENGINE
      -> RISK ENGINE
      -> TRAINER DASHBOARD

Keys:
    q  quit
    d  toggle debug/developer mode
    r  re-run camera calibration

No detector fires a serious event from a single frame.  Every event passes
through CONFIDENCE + PERSISTENCE + DURATION + COOLDOWN first.

Browser-window / OS monitoring is NOT faked here.  A standalone Python webcam
monitor cannot see browser tab/focus/fullscreen state.  If you want those
events, a separate browser-extension / desktop agent can append JSON lines to
the file configured in PROCTOR_CONFIG["browser_event_file"] and this monitor
will ingest them (see BrowserEventMonitor).
"""

import os
import sys
import time
import json
import math
import argparse
import threading
import queue
import urllib.request
import urllib.error
import datetime
from collections import deque

import cv2
import numpy as np
import mediapipe as mp

from mediapipe.tasks.python import vision

BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
FaceLandmarkerResult = mp.tasks.vision.FaceLandmarkerResult
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
PoseLandmarkerResult = mp.tasks.vision.PoseLandmarkerResult
VisionRunningMode = mp.tasks.vision.RunningMode


# =====================================================================
# CONFIGURATION
# ---------------------------------------------------------------------
# Every threshold lives here.  Do not scatter hard-coded thresholds in the
# detector code.  Durations are in seconds.
# =====================================================================
PROCTOR_CONFIG = {
    # ---- identity / session ----
    "participant_name": "Participant",
    "session_id": "LMS-SESSION",
    "cam_index": 0,
    "flip_horizontal": True,

    # ---- presentation / output ----
    "debug_mode": False,
    "draw_eye_viz": True,                # live eye contours, iris centers & gaze movement vector arrows
    "draw_head_axes": True,              # live 3D RGB coordinate axes on nose tip
    "draw_on_face_metrics": True,        # live on-face Gaze, Head Pose, EAR & MAR readouts
    "draw_mesh": False,
    "log_events_to_file": True,
    "event_log_path": os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   "monitoring_events.jsonl"),

    # ---- performance ----
    "frame_skip_pose": 2,       # run pose inference every N frames
    "frame_skip_object": 12,    # run object detection every N frames

    # ---- calibration ----
    "calibration_seconds": 5.0,
    "calibration_min_samples": 20,
    "calibration_timeout_seconds": 30.0,

    # ---- face presence / absence (0-2s temp lost, 2-5s warn, >5s high) ----
    "face_temp_lost_seconds": 2.0,
    "face_warn_seconds": 2.0,
    "face_high_seconds": 5.0,

    # ---- multiple faces ----
    "multiple_face_seconds": 2.0,

    # ---- eye / iris ----
    "gaze_dead_zone": 0.08,          # normalized deviation below which = straight
    "eye_smoothing_alpha": 0.35,
    "eye_side_glance_seconds": 1.8,  # eyes held sideways while head straight
    "prolonged_gaze_seconds": 3.5,   # prolonged off-screen look
    "rem_window_seconds": 3.0,
    "rem_flip_threshold": 3,         # direction flips inside window => REM

    # ---- head pose ----
    "head_deviation_seconds": 2.0,
    "head_yaw_threshold": 12.0,
    "head_pitch_threshold": 10.0,
    "head_roll_threshold": 14.0,

    # ---- blink ----
    "ear_threshold": 0.21,
    "ear_personalization_enabled": True,  # personalize threshold from calibration EAR
    "ear_personalization_ratio": 0.75,    # personal threshold = calib_ear * this ratio
    "ear_personalization_min": 0.12,      # never personalize below this floor
    "ear_personalization_max": 0.28,      # never personalize above this ceiling
    "prolonged_closure_seconds": 2.0,
    "blink_rate_window_seconds": 60.0,

    # ---- mouth ----
    "mar_threshold": 0.18,
    "talking_seconds": 3.0,

    # ---- body / pose framing (high accuracy) ----
    "body_smoothing_alpha": 0.35,        # EMA smoothing for body overlays
    "body_warning_seconds": 2.0,
    "body_missing_seconds": 3.0,
    "shoulder_missing_seconds": 2.0,
    "chest_missing_seconds": 2.5,
    "body_shift_seconds": 2.0,
    "body_too_close_seconds": 2.0,
    "body_too_far_seconds": 2.0,
    "head_margin_top": 0.03,             # top boundary margin for head framing

    # ---- participant movement ----
    "movement_seconds": 2.0,
    "movement_px_threshold": 80,

    # ---- object detection (optional, cv2.dnn YOLO) ----
    "object_detection": {
        "enabled": False,
        "model_onnx": "yolov8n.onnx",
        "model_weights": "yolov4-tiny.weights",
        "model_config": "yolov4-tiny.cfg",
        "confidence_threshold": 0.5,
        "persistence_seconds": 2.0,
        "suspicious_classes": ["cell phone", "laptop", "book", "tv", "remote", "mouse"],
    },

    # ---- browser / OS events (external agent writes JSONL here) ----
    # Each line: {"event":"TAB_SWITCH"|"WINDOW_FOCUS_LOST"|"WINDOW_FOCUS_RETURNED"
    #             |"FULLSCREEN_EXIT"|"PAGE_VISIBILITY_HIDDEN", "detail":"..."}
    "browser_event_file": None,

    # ---- camera health / lighting ----
    "camera": {
        "dark_threshold": 40,
        "bright_threshold": 230,
        "blur_variance_threshold": 80.0,
        "frozen_diff_threshold": 0.5,
        "camera_warn_seconds": 3.0,
    },

    # ---- event engine ----
    "event_cooldown_seconds": 5.0,
    "risk": {
        "info": 2,
        "warning": 15,
        "high": 40,
        "decay_per_second": 1.0,
    },
    "risk_levels": [25, 50, 75],  # LOW / MEDIUM / HIGH / CRITICAL

    # ---- face size vs calibration baseline ----
    "face_too_close_ratio": 1.45,
    "face_too_far_ratio": 0.60,

    # ---- center alignment ----
    "center": {
        "slight_fraction": 0.15,   # |offset|<this  -> CENTERED
        "far_fraction": 0.28,      # |offset|>=this -> TOO FAR
        "duration_seconds": 2.0,
        "face_weight": 0.5,        # fusion weight for face-centroid offset
        "shoulder_weight": 0.5,    # fusion weight for shoulder-center offset
    },
}


# =====================================================================
# MODELS
# =====================================================================
def ensure_model(path, url, min_size=1_000_000):
    """Download a MediaPipe .task model once and cache it next to the script."""
    if not os.path.exists(path) or os.path.getsize(path) < min_size:
        print(f"[SETUP] Downloading {os.path.basename(path)} ...")
        urllib.request.urlretrieve(url, path)
        print(f"[SETUP] {os.path.basename(path)} downloaded.")
    return path


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

FACE_MODEL_PATH = os.path.join(SCRIPT_DIR, "face_landmarker.task")
FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

POSE_MODEL_PATH = os.path.join(SCRIPT_DIR, "pose_landmarker_lite.task")
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)

ensure_model(FACE_MODEL_PATH, FACE_MODEL_URL)


# =====================================================================
# LANDMARK INDEXES
# =====================================================================
# Head-pose PnP 3D model (generic face model, millimeters).
MODEL_POINTS = np.array([
    (0.0, 0.0, 0.0),             # Nose tip
    (0.0, -330.0, -65.0),        # Chin
    (-225.0, 170.0, -135.0),     # Left eye corner
    (225.0, 170.0, -135.0),      # Right eye corner
    (-150.0, -150.0, -125.0),    # Left mouth corner
    (150.0, -150.0, -125.0)      # Right mouth corner
], dtype=np.float32)

HEAD_POSE_LANDMARK_INDICES = [1, 152, 33, 263, 61, 291]

# Iris / gaze landmarks (478-point mesh): 468-477.
RIGHT_EYE_IRIS_CENTER = 468
RIGHT_EYE_CORNERS = (33, 133)
LEFT_EYE_IRIS_CENTER = 473
LEFT_EYE_CORNERS = (263, 362)

# Vertical eyelid bounds for up/down iris tracking.
RIGHT_EYE_TOP_IDX = 159
RIGHT_EYE_BOTTOM_IDX = 145
LEFT_EYE_TOP_IDX = 386
LEFT_EYE_BOTTOM_IDX = 374

# EAR 6-point sets.
RIGHT_EYE_EAR_IDX = [33, 160, 158, 133, 153, 144]
LEFT_EYE_EAR_IDX = [362, 385, 387, 263, 373, 380]

# Mouth.
MOUTH_TOP_IDX = 13
MOUTH_BOTTOM_IDX = 14
MOUTH_LEFT_IDX = 61
MOUTH_RIGHT_IDX = 291

# Pose landmark indexes (33-point pose model).
POSE_NOSE = 0
POSE_LEFT_SHOULDER = 11
POSE_RIGHT_SHOULDER = 12
POSE_LEFT_ELBOW = 13
POSE_RIGHT_ELBOW = 14
POSE_LEFT_WRIST = 15
POSE_RIGHT_WRIST = 16
POSE_LEFT_HIP = 23
POSE_RIGHT_HIP = 24


# =====================================================================
# SMALL HELPERS
# =====================================================================
def _landmark_xy(landmark, img_w, img_h):
    return np.array([landmark.x * img_w, landmark.y * img_h])


def _landmark_px(landmark, img_w, img_h):
    return (int(landmark.x * img_w), int(landmark.y * img_h))


def rotation_matrix_to_euler_angles(R):
    """3x3 rotation matrix -> (pitch, yaw, roll) in degrees, stable atan2 form."""
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
    return np.degrees(pitch), np.degrees(yaw), np.degrees(roll)


def fuzzy_classify(value, inner_thresh, outer_thresh):
    """(sign, confidence) instead of a hard cutoff; dead zone + linear ramp."""
    abs_val = abs(value)
    if abs_val <= inner_thresh:
        confidence = 0.0
    elif abs_val >= outer_thresh:
        confidence = 1.0
    else:
        confidence = (abs_val - inner_thresh) / (outer_thresh - inner_thresh)
    sign = 1 if value >= 0 else -1
    return sign, confidence


def calculate_ear(face_landmarks, eye_idx, img_w, img_h):
    """Eye Aspect Ratio (Soukupova & Cech)."""
    p1, p2, p3, p4, p5, p6 = [_landmark_xy(face_landmarks[i], img_w, img_h) for i in eye_idx]
    vertical_1 = np.linalg.norm(p2 - p6)
    vertical_2 = np.linalg.norm(p3 - p5)
    horizontal = np.linalg.norm(p1 - p4)
    if horizontal < 1e-6:
        return 0.0
    return float((vertical_1 + vertical_2) / (2.0 * horizontal))


def calculate_mar(face_landmarks, img_w, img_h):
    """Mouth Aspect Ratio (MAR): robust multi-point inner + outer lip measurement."""
    # Inner lip centers (13=upper inner, 14=lower inner)
    top_in = _landmark_xy(face_landmarks[13], img_w, img_h)
    bot_in = _landmark_xy(face_landmarks[14], img_w, img_h)
    v_in = np.linalg.norm(top_in - bot_in)

    # Outer lip centers (0=upper outer, 17=lower outer)
    top_out = _landmark_xy(face_landmarks[0], img_w, img_h)
    bot_out = _landmark_xy(face_landmarks[17], img_w, img_h)
    v_out = np.linalg.norm(top_out - bot_out)

    # Left and right mouth corners (61=left, 291=right)
    left = _landmark_xy(face_landmarks[61], img_w, img_h)
    right = _landmark_xy(face_landmarks[291], img_w, img_h)
    mouth_width = np.linalg.norm(left - right)

    if mouth_width < 1e-6:
        return 0.0

    # Weighted inner lip opening with outer lip baseline
    mar = float((v_in * 1.8 + v_out * 0.4) / (2.0 * mouth_width))
    return mar


def eye_horizontal_ratio(landmarks, iris_center_idx, corner_a_idx, corner_b_idx, img_w):
    """0..1 position of the iris along the eye's on-screen horizontal axis."""
    iris_x = landmarks[iris_center_idx].x * img_w
    ax = landmarks[corner_a_idx].x * img_w
    bx = landmarks[corner_b_idx].x * img_w
    left_x, right_x = (ax, bx) if ax <= bx else (bx, ax)
    eye_width = right_x - left_x
    if eye_width < 1e-3:
        return 0.5
    return float(np.clip((iris_x - left_x) / eye_width, 0.0, 1.0))


def eye_vertical_ratio(landmarks, iris_center_idx, top_idx, bottom_idx, img_h):
    """0..1 position of the iris between the upper and lower eyelid (0=top)."""
    iris_y = landmarks[iris_center_idx].y * img_h
    top_y = landmarks[top_idx].y * img_h
    bottom_y = landmarks[bottom_idx].y * img_h
    if bottom_y <= top_y + 1e-3:
        return 0.5
    return float(np.clip((iris_y - top_y) / (bottom_y - top_y), 0.0, 1.0))


def classify_gaze(ratio, inner_thresh=0.10, outer_thresh=0.22,
                  left_cutoff=0.6, right_cutoff=0.6):
    """Left / Right / Straight from the averaged gaze ratio (0.5 = centered)."""
    deviation = (ratio - 0.5) * 2.0
    sign, confidence = fuzzy_classify(deviation, inner_thresh, outer_thresh)
    gaze_state = ""
    if sign > 0:
        if confidence >= right_cutoff:
            gaze_state = "Right"
    else:
        if confidence >= left_cutoff:
            gaze_state = "Left"
    if not gaze_state:
        gaze_state = "Straight"
    return gaze_state, confidence * 100


def classify_eye_8dir(h_ratio, v_ratio, dead_zone=0.08, dead_zone_v=0.08, base_h=0.5, base_v=0.5):
    """9-direction eye label (8 directions + Straight) with confidence and arrow symbol relative to calibration baseline."""
    dh = h_ratio - (base_h if base_h is not None else 0.5)
    dv = v_ratio - (base_v if base_v is not None else 0.5)
    hd = "Right" if dh > dead_zone else ("Left" if dh < -dead_zone else "")
    vd = "Down" if dv > dead_zone_v else ("Up" if dv < -dead_zone_v else "")
    
    # Calculate confidence based on deviation magnitude beyond dead zone
    dev_mag = np.hypot(max(0.0, abs(dh) - dead_zone), max(0.0, abs(dv) - dead_zone_v))
    conf = min(100.0, max(50.0, 50.0 + (dev_mag / 0.15) * 50.0))
    
    if not hd and not vd:
        return "Straight", 100.0, "●"
    if hd and vd:
        arrow_map = {
            ("Up", "Right"): "↗",
            ("Up", "Left"): "↖",
            ("Down", "Right"): "↘",
            ("Down", "Left"): "↙",
        }
        return f"{vd}-{hd}", conf, arrow_map.get((vd, hd), "→")
    if hd:
        return hd, conf, "→" if hd == "Right" else "←"
    return vd, conf, "↓" if vd == "Down" else "↑"


def compute_world_torso_ratio(world_lms, cfg):
    """Torso-height / shoulder-width ratio in metric (meter) world space.

    pose_world_landmarks are hip-centered, real-world-scale estimates that
    are largely invariant to camera distance and pitch. When both shoulders
    and both hips are visible in world space, this ratio is a much more
    reliable, person-specific alternative to a fixed anthropometric constant
    (e.g. 1.30) for estimating torso height when hips fall outside the pixel
    frame (a common situation in tight upper-body webcam framing).
    """
    if world_lms is None:
        return None
    lms = world_lms.landmark if hasattr(world_lms, "landmark") else world_lms
    n = len(lms)
    needed = [POSE_LEFT_SHOULDER, POSE_RIGHT_SHOULDER, POSE_LEFT_HIP, POSE_RIGHT_HIP]
    if n <= max(needed):
        return None
    if not all(pose_landmark_visible(lms[i]) for i in needed):
        return None

    def v(i):
        return np.array([lms[i].x, lms[i].y, lms[i].z], dtype=np.float64)

    sl, sr = v(POSE_LEFT_SHOULDER), v(POSE_RIGHT_SHOULDER)
    hl, hr = v(POSE_LEFT_HIP), v(POSE_RIGHT_HIP)
    shoulder_width = np.linalg.norm(sr - sl)
    if shoulder_width < 1e-4:
        return None
    shoulder_center = (sl + sr) / 2.0
    hip_center = (hl + hr) / 2.0
    torso_height = np.linalg.norm(hip_center - shoulder_center)

    ratio = float(torso_height / shoulder_width)
    lo = cfg.get("world_ratio_min", 0.75) if cfg else 0.75
    hi = cfg.get("world_ratio_max", 2.20) if cfg else 2.20
    if not (lo <= ratio <= hi):
        return None  # discard outliers (bad detection frame)
    return ratio


class WorldRatioEstimator:
    """Slow EMA of the participant's personal world-space torso/shoulder
    ratio, learned opportunistically whenever hips are visible in world
    space. Falls back to a config default until enough evidence accrues.
    """
    def __init__(self, cfg):
        self.alpha = cfg.get("world_ratio_smoothing_alpha", 0.10)
        self.default_ratio = 1.30
        self.value = None
        self.samples = 0

    def update(self, ratio):
        if ratio is None:
            return
        if self.value is None:
            self.value = ratio
        else:
            self.value = self.value + self.alpha * (ratio - self.value)
        self.samples += 1

    def get(self):
        if self.value is not None and self.samples >= 5:
            return self.value
        return self.default_ratio


def pose_landmark_visible(lm):
    """True if a pose landmark is usable (x/y present, visibility/presence ok)."""
    if lm.x is None or lm.y is None:
        return False
    vis = getattr(lm, "visibility", None)
    pres = getattr(lm, "presence", None)
    if vis is None:
        vis = 1.0
    if pres is None:
        pres = 1.0
    return vis > 0.3 and pres > 0.3


# =====================================================================
# TEMPORAL EVENT ENGINE
# ---------------------------------------------------------------------
# Detection -> Confidence -> Persistence -> Duration -> Cooldown -> Event.
# Risk score = weighted accumulation of events with slow decay.  It is a
# MONITORING RISK, never a "cheating probability".
# =====================================================================
EVENT_CANONICAL_NAMES = {
    "Face Absent": "FACE_ABSENT",
    "Participant Face Absent": "FACE_ABSENT",
    "Face not detected": "FACE_ABSENT",
    "Face Not Detected": "FACE_ABSENT",
    "FACE_ABSENT": "FACE_ABSENT",
    "Face Returned": "FACE_RETURNED",
    "FACE_RETURNED": "FACE_RETURNED",
    "Multiple Faces": "MULTIPLE_PERSONS_DETECTED",
    "Multiple Faces Detected": "MULTIPLE_PERSONS_DETECTED",
    "Multiple Participants Detected": "MULTIPLE_PERSONS_DETECTED",
    "Multiple Persons Detected": "MULTIPLE_PERSONS_DETECTED",
    "MULTIPLE_PERSONS_DETECTED": "MULTIPLE_PERSONS_DETECTED",
    "Face Too Close": "FACE_TOO_CLOSE",
    "Face Too Far": "FACE_TOO_FAR",
    "Possible Side Glance": "EYES_LOOKING_RIGHT",
    "Possible Desk Look": "EYES_LOOKING_DOWN",
    "Possible Desk / Notes Look": "EYES_LOOKING_DOWN",
    "Eyes Looking Left": "EYES_LOOKING_LEFT",
    "Eyes Looking Right": "EYES_LOOKING_RIGHT",
    "Eyes Looking Up": "EYES_LOOKING_UP",
    "Eyes Looking Down": "EYES_LOOKING_DOWN",
    "Eyes Looking Up-Left": "EYES_LOOKING_UP_LEFT",
    "Eyes Looking Up-Right": "EYES_LOOKING_UP_RIGHT",
    "Eyes Looking Down-Left": "EYES_LOOKING_DOWN_LEFT",
    "Eyes Looking Down-Right": "EYES_LOOKING_DOWN_RIGHT",
    "EYES_LOOKING_LEFT": "EYES_LOOKING_LEFT",
    "EYES_LOOKING_RIGHT": "EYES_LOOKING_RIGHT",
    "EYES_LOOKING_UP": "EYES_LOOKING_UP",
    "EYES_LOOKING_DOWN": "EYES_LOOKING_DOWN",
    "EYES_LOOKING_UP_LEFT": "EYES_LOOKING_UP_LEFT",
    "EYES_LOOKING_UP_RIGHT": "EYES_LOOKING_UP_RIGHT",
    "EYES_LOOKING_DOWN_LEFT": "EYES_LOOKING_DOWN_LEFT",
    "EYES_LOOKING_DOWN_RIGHT": "EYES_LOOKING_DOWN_RIGHT",
    "Prolonged Off-Screen Look": "PROLONGED_OFF_SCREEN_GAZE",
    "Prolonged Off-Screen Gaze": "PROLONGED_OFF_SCREEN_GAZE",
    "PROLONGED_OFF_SCREEN_GAZE": "PROLONGED_OFF_SCREEN_GAZE",
    "Prolonged Eye Closure": "PROLONGED_EYE_CLOSURE",
    "Eyes Closed - Prolonged": "PROLONGED_EYE_CLOSURE",
    "PROLONGED_EYE_CLOSURE": "PROLONGED_EYE_CLOSURE",
    "Eyes Not Reliably Visible": "EYES_NOT_RELIABLY_VISIBLE",
    "EYES_NOT_RELIABLY_VISIBLE": "EYES_NOT_RELIABLY_VISIBLE",
    "Excessive Blink Rate": "EXCESSIVE_BLINK_PATTERN",
    "EXCESSIVE_BLINK_PATTERN": "EXCESSIVE_BLINK_PATTERN",
    "Head Turned Left": "HEAD_TURNED_LEFT",
    "Head Turned Right": "HEAD_TURNED_RIGHT",
    "HEAD_TURNED_LEFT": "HEAD_TURNED_LEFT",
    "HEAD_TURNED_RIGHT": "HEAD_TURNED_RIGHT",
    "Head Looking Up": "HEAD_LOOKING_UP",
    "Head Looking Down": "HEAD_LOOKING_DOWN",
    "HEAD_LOOKING_UP": "HEAD_LOOKING_UP",
    "HEAD_LOOKING_DOWN": "HEAD_LOOKING_DOWN",
    "Head Deviated (Left)": "HEAD_TURNED_LEFT",
    "Head Deviated (Right)": "HEAD_TURNED_RIGHT",
    "Head Deviated (Up)": "HEAD_LOOKING_UP",
    "Head Deviated (Down)": "HEAD_LOOKING_DOWN",
    "Head Tilted Left": "HEAD_TILT_LEFT",
    "Head Tilted Right": "HEAD_TILT_RIGHT",
    "HEAD_TILT_LEFT": "HEAD_TILT_LEFT",
    "HEAD_TILT_RIGHT": "HEAD_TILT_RIGHT",
    "Repeated Head Movement": "REPEATED_HEAD_MOVEMENT",
    "Upper Body Not Visible": "BODY_NOT_VISIBLE",
    "Participant Body Not Visible": "BODY_NOT_VISIBLE",
    "Both Shoulders Missing": "BOTH_SHOULDERS_MISSING",
    "BOTH_SHOULDERS_MISSING": "BOTH_SHOULDERS_MISSING",
    "Left Shoulder Missing": "LEFT_SHOULDER_MISSING",
    "LEFT_SHOULDER_MISSING": "LEFT_SHOULDER_MISSING",
    "Right Shoulder Missing": "RIGHT_SHOULDER_MISSING",
    "RIGHT_SHOULDER_MISSING": "RIGHT_SHOULDER_MISSING",
    "Chest Not Visible": "CHEST_NOT_VISIBLE",
    "CHEST_NOT_VISIBLE": "CHEST_NOT_VISIBLE",
    "Area Below Chest Not Visible": "BELOW_CHEST_NOT_VISIBLE",
    "Body Too Close": "BODY_TOO_CLOSE",
    "Body Too Far": "BODY_TOO_FAR",
    "Participant Body Too Close": "BODY_TOO_CLOSE",
    "Participant Body Too Far": "BODY_TOO_FAR",
    "BODY_TOO_CLOSE": "BODY_TOO_CLOSE",
    "BODY_TOO_FAR": "BODY_TOO_FAR",
    "Body Shifted": "PARTICIPANT_OUT_OF_CENTER",
    "Body Shifted Left": "PARTICIPANT_OUT_OF_CENTER",
    "Body Shifted Right": "PARTICIPANT_OUT_OF_CENTER",
    "Participant Not Centered": "PARTICIPANT_OUT_OF_CENTER",
    "PARTICIPANT_OUT_OF_CENTER": "PARTICIPANT_OUT_OF_CENTER",
    "Possible Talking": "POSSIBLE_TALKING",
    "Cell Phone Detected": "CELL_PHONE_DETECTED",
    "Possible Cell Phone Detected": "CELL_PHONE_DETECTED",
    "CELL_PHONE_DETECTED": "CELL_PHONE_DETECTED",
    "Book Detected": "BOOK_DETECTED",
    "BOOK_DETECTED": "BOOK_DETECTED",
    "Laptop Detected": "LAPTOP_DETECTED",
    "LAPTOP_DETECTED": "LAPTOP_DETECTED",
    "Camera Lost / Disconnected": "CAMERA_DISCONNECTED",
    "CAMERA_DISCONNECTED": "CAMERA_DISCONNECTED",
    "Camera Frame Frozen": "CAMERA_FROZEN",
    "CAMERA_FROZEN": "CAMERA_FROZEN",
    "Camera Blurry / Poor Visibility": "CAMERA_BLUR",
    "Camera Blur": "CAMERA_BLUR",
    "CAMERA_BLUR": "CAMERA_BLUR",
    "Lighting Too Dark": "CAMERA_DARK",
    "CAMERA_DARK": "CAMERA_DARK",
    "Lighting Too Bright": "CAMERA_TOO_BRIGHT",
    "CAMERA_TOO_BRIGHT": "CAMERA_TOO_BRIGHT",
    "Warning: Improve Lighting": "CAMERA_DARK",
    "Tab Switch": "TAB_SWITCH",
    "TAB_SWITCH": "TAB_SWITCH",
    "Window Focus Lost": "WINDOW_FOCUS_LOST",
    "WINDOW_FOCUS_LOST": "WINDOW_FOCUS_LOST",
    "Fullscreen Exit": "FULLSCREEN_EXIT",
    "FULLSCREEN_EXIT": "FULLSCREEN_EXIT",
    "Page Visibility Hidden": "PAGE_VISIBILITY_HIDDEN",
    "PAGE_VISIBILITY_HIDDEN": "PAGE_VISIBILITY_HIDDEN",
}

class EventEngine:
    def __init__(self, config):
        self.cfg = config
        self.timeline = []
        self.cooldowns = {}
        self.risk = 0.0
        self.last_risk_update = time.time()
        self.event_queue = queue.Queue()
        self.backend_url = config.get("backend_url", "http://localhost:3001").rstrip("/")
        self.auth_token = config.get("auth_token", "")
        self._stop_worker = threading.Event()
        self._worker_thread = threading.Thread(target=self._http_dispatcher_worker, daemon=True)
        self._worker_thread.start()

    def _http_dispatcher_worker(self):
        while not self._stop_worker.is_set():
            try:
                ev = self.event_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            if ev is None:
                break

            # Attempt posting to backend endpoint
            api_endpoint = f"{self.backend_url}/api/proctoring/events"
            headers = {"Content-Type": "application/json"}
            if self.auth_token:
                headers["Authorization"] = f"Bearer {self.auth_token}"

            payload_bytes = json.dumps(ev, ensure_ascii=False).encode("utf-8")
            req = urllib.request.Request(api_endpoint, data=payload_bytes, headers=headers, method="POST")

            success = False
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(req, timeout=4.0) as resp:
                        if resp.status in (200, 201):
                            success = True
                            break
                except Exception as e:
                    time.sleep(0.5 * (2 ** attempt))

            self.event_queue.task_done()

    def stop(self):
        self._stop_worker.set()
        try:
            self.event_queue.put_nowait(None)
        except Exception:
            pass

    def _tick_risk(self, now):
        dt = max(0.0, now - self.last_risk_update)
        self.last_risk_update = now
        self.risk = max(0.0, self.risk - self.cfg["risk"]["decay_per_second"] * dt)

    def canonical_event_type(self, raw_name):
        if raw_name in EVENT_CANONICAL_NAMES:
            return EVENT_CANONICAL_NAMES[raw_name]
        # Clean fallback to UPPER_SNAKE_CASE
        clean = raw_name.upper().replace(" ", "_").replace("/", "_").replace("-", "_")
        return clean

    def emit(self, event_type, severity, confidence=1.0, duration=0.0,
             metadata=None, risk_weight=None):
        now = time.time()
        self._tick_risk(now)
        cooldown = self.cfg.get("event_cooldown_seconds", 5.0)
        if now - self.cooldowns.get(event_type, 0.0) < cooldown:
            return None
        self.cooldowns[event_type] = now

        canon_type = self.canonical_event_type(event_type)

        if risk_weight is None:
            sev_key = severity.lower()
            risk_weight = self.cfg["risk"].get(sev_key, 10)
            risk_weight = risk_weight * max(0.0, min(1.0, float(confidence)))
        self.risk = min(100.0, self.risk + risk_weight)

        iso_ts = datetime.datetime.now().isoformat(timespec="seconds")
        idem_key = f"{self.cfg.get('session_id', 'sess')}_{canon_type}_{int(now*1000)}"

        ev = {
            "monitoringSessionId": self.cfg.get("session_id", "LMS-SESSION"),
            "attemptId": self.cfg.get("attempt_id") or 0,
            "participantId": self.cfg.get("participant_id") or self.cfg.get("participant_name", "Participant"),
            "quizId": self.cfg.get("quiz_id") or 0,
            "eventType": canon_type,
            "severity": severity.upper(),
            "confidence": round(float(confidence), 3),
            "duration": round(float(duration), 2),
            "timestamp": iso_ts,
            "metadata": metadata or {},
            "idempotencyKey": idem_key,
        }

        self.timeline.append(ev)
        if len(self.timeline) > 200:
            self.timeline.pop(0)

        # Enqueue for backend HTTP ingestion
        self.event_queue.put(ev)

        # Local file logging if enabled
        if self.cfg.get("log_events_to_file"):
            try:
                with open(self.cfg["event_log_path"], "a", encoding="utf-8") as f:
                    f.write(json.dumps(ev, ensure_ascii=False) + "\n")
            except OSError:
                pass

        icon = {"INFO": ">>", "WARNING": "!!", "HIGH": "!!", "CRITICAL": "!!!"}.get(severity.upper(), ">>")
        print(f"{time.strftime('%H:%M:%S')} {icon} [{severity.upper()}] {canon_type} "
              f"(conf {ev['confidence']:.0%}, dur {duration:.1f}s)")
        return ev

    def risk_level(self):
        levels = self.cfg["risk_levels"]
        if self.risk >= levels[2]:
            return "CRITICAL"
        if self.risk >= levels[1]:
            return "HIGH"
        if self.risk >= levels[0]:
            return "MEDIUM"
        return "LOW"


class ConditionTracker:
    """Tracks a boolean condition and reports how long it has persisted.

    `update()` returns the current active duration.  `crossed(threshold)` is
    True only on the frame the active duration passes `threshold`, so each
    threshold crossing fires exactly once per activation (no event spam and
    no repeated risk accumulation while a condition simply persists).
    """

    def __init__(self, name=""):
        self.name = name
        self.active_since = None
        self.last_dur = 0.0
        self.prev_dur = 0.0

    def update(self, condition, now):
        if condition:
            if self.active_since is None:
                self.active_since = now
                self.prev_dur = 0.0
                self.last_dur = 0.0
            else:
                self.prev_dur = self.last_dur
            self.last_dur = now - self.active_since
            return self.last_dur
        self.active_since = None
        self.prev_dur = 0.0
        self.last_dur = 0.0
        return 0.0

    def crossed(self, threshold):
        return (self.active_since is not None
                and self.prev_dur < threshold <= self.last_dur)

    @property
    def is_active(self):
        return self.active_since is not None


# =====================================================================
# CAMERA HEALTH / LIGHTING
# =====================================================================
def frame_stats(frame, prev_gray):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    blur_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    frozen = 0.0
    if prev_gray is not None:
        frozen = float(np.mean(np.abs(gray.astype(np.int16) - prev_gray.astype(np.int16))))
    return gray, brightness, blur_var, frozen


# =====================================================================
# OPTIONAL OBJECT DETECTION (cv2.dnn YOLO)
# ---------------------------------------------------------------------
# Disabled by default.  Enable in PROCTOR_CONFIG["object_detection"]["enabled"]
# and place either a YOLOv8 ONNX export (model_onnx) or YOLOv4-tiny
# weights+cfg next to the script.
# =====================================================================
COCO_NAMES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
    "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
    "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
    "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
    "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush",
]


class ObjectDetector:
    def __init__(self, cfg):
        self.cfg = cfg
        self.net = None
        self.is_onnx = False
        self.load()

    def load(self):
        base = SCRIPT_DIR
        onnx = os.path.join(base, self.cfg.get("model_onnx", ""))
        weights = os.path.join(base, self.cfg.get("model_weights", ""))
        cfg_file = os.path.join(base, self.cfg.get("model_config", ""))
        if os.path.exists(onnx):
            try:
                self.net = cv2.dnn.readNetFromONNX(onnx)
                self.is_onnx = True
                print("[SETUP] Object detector loaded (YOLO ONNX).")
            except cv2.error:
                self.net = None
        elif os.path.exists(weights) and os.path.exists(cfg_file):
            try:
                self.net = cv2.dnn.readNet(weights, cfg_file)
                self.is_onnx = False
                print("[SETUP] Object detector loaded (YOLO weights+cfg).")
            except cv2.error:
                self.net = None
        if self.net is None:
            print("[SETUP] Object detection ENABLED in config but no model files found - "
                  "disabled. Place yolov8n.onnx or yolov4-tiny.{weights,cfg} next to the script.")

    def _postprocess_onnx(self, outs, w, h):
        data = outs[0]  # (1, 84, 8400)
        data = data[0].T  # (8400, 84)
        boxes_xywh = data[:, :4]
        scores = data[:, 4:]
        class_ids = np.argmax(scores, axis=1)
        confs = scores[np.arange(len(scores)), class_ids]
        keep = confs >= self.cfg["confidence_threshold"]
        dets = []
        for xywh, cid, conf in zip(boxes_xywh[keep], class_ids[keep], confs[keep]):
            cx, cy, bw, bh = xywh
            x1 = int((cx - bw / 2) * w)
            y1 = int((cy - bh / 2) * h)
            x2 = int((cx + bw / 2) * w)
            y2 = int((cy + bh / 2) * h)
            dets.append((x1, y1, x2, y2, int(cid), float(conf)))
        return dets

    def _postprocess_v4(self, outs, w, h):
        dets = []
        for out in outs:
            rows = out[0]
            for row in rows:
                obj_conf = row[4]
                if obj_conf < self.cfg["confidence_threshold"]:
                    continue
                scores = row[5:]
                class_id = int(np.argmax(scores))
                conf = float(scores[class_id] * obj_conf)
                if conf < self.cfg["confidence_threshold"]:
                    continue
                cx, cy, bw, bh = row[:4]
                x1 = int((cx - bw / 2) * w)
                y1 = int((cy - bh / 2) * h)
                x2 = int((cx + bw / 2) * w)
                y2 = int((cy + bh / 2) * h)
                dets.append((x1, y1, x2, y2, class_id, conf))
        return dets

    def detect(self, frame_bgr):
        if self.net is None:
            return []
        h, w = frame_bgr.shape[:2]
        blob = cv2.dnn.blobFromImage(frame_bgr, 1 / 255.0, (640, 640), (0, 0, 0),
                                     swapRB=True, crop=False)
        self.net.setInput(blob)
        if self.is_onnx:
            outs = [self.net.forward()]
            dets = self._postprocess_onnx(outs, w, h)
        else:
            outs = self.net.forward(self.net.getUnconnectedOutLayersNames())
            dets = self._postprocess_v4(outs, w, h)
        if not dets:
            return []
        boxes = [d[:4] for d in dets]
        idx = cv2.dnn.NMSBoxes(boxes, [d[5] for d in dets],
                               self.cfg["confidence_threshold"], 0.4)
        if idx is None or len(idx) == 0:
            return []
        result = []
        for i in np.array(idx).flatten():
            d = dets[i]
            name = COCO_NAMES[d[4]] if 0 <= d[4] < len(COCO_NAMES) else "object"
            if name in self.cfg["suspicious_classes"]:
                result.append((d[0], d[1], d[2], d[3], name, d[5]))
        return result


# =====================================================================
# BROWSER / OS EVENTS (external agent JSONL ingestion)
# =====================================================================
BROWSER_EVENT_SEVERITY = {
    "TAB_SWITCH": "WARNING",
    "PAGE_VISIBILITY_HIDDEN": "WARNING",
    "WINDOW_FOCUS_LOST": "WARNING",
    "WINDOW_FOCUS_RETURNED": "INFO",
    "FULLSCREEN_EXIT": "WARNING",
}


class BrowserEventMonitor:
    """Ingests JSONL lines appended by a browser-extension/desktop agent.

    This Python webcam monitor cannot observe browser tab/focus/fullscreen
    state itself.  We do NOT fake it: if PROCTOR_CONFIG["browser_event_file"]
    is set and an external agent writes events there, we read and log them.
    """

    def __init__(self, path):
        self.path = path
        self.offset = 0 if (path and os.path.exists(path)) else None

    def enabled(self):
        return self.path is not None

    def poll(self, engine):
        if self.offset is None:
            return
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                f.seek(self.offset)
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    ev_name = obj.get("event", "")
                    sev = BROWSER_EVENT_SEVERITY.get(ev_name, "WARNING")
                    engine.emit(ev_name, sev, confidence=1.0,
                                metadata={"detail": obj.get("detail", "")})
                self.offset = f.tell()
        except OSError:
            pass


# =====================================================================
# DRAWING HELPERS
# =====================================================================
def draw_face_mesh_contours(image, landmark_list, connections,
                            color=(80, 110, 250), thickness=1):
    """Draw face-mesh connections with cv2 (replaces removed drawing_utils)."""
    h, w = image.shape[:2]
    lm = landmark_list.landmark if hasattr(landmark_list, "landmark") else landmark_list
    for conn in connections:
        cv2.line(image,
                 (int(lm[conn.start].x * w), int(lm[conn.start].y * h)),
                 (int(lm[conn.end].x * w), int(lm[conn.end].y * h)),
                 color, thickness)


def draw_eye_viz(frame, eye_ear_idx, iris_idx, lm, img_w, img_h, prev_iris=None,
                 label="L", direction="Straight", conf=100.0, arrow="●"):
    """Vivid eye contour + iris center + gaze vector line + directional movement arrow."""
    pts = [_landmark_px(lm[i], img_w, img_h) for i in eye_ear_idx]
    
    # 1. Eyelid contour (emerald green)
    cv2.polylines(frame, [np.array(pts)], True, (0, 230, 120), 1)
    
    # 2. Reference center point (eye corner midpoint)
    ref = ((pts[0][0] + pts[3][0]) // 2, (pts[0][1] + pts[3][1]) // 2)
    iris = _landmark_px(lm[iris_idx], img_w, img_h)
    
    cv2.circle(frame, ref, 2, (180, 180, 180), -1)
    
    # 3. Iris center point (bright magenta dot)
    cv2.circle(frame, iris, 4, (255, 0, 255), -1)
    cv2.line(frame, ref, iris, (255, 0, 255), 2)
    
    # 4. Gaze movement vector arrow
    dx, dy = iris[0] - ref[0], iris[1] - ref[1]
    if np.hypot(dx, dy) >= 2:
        arrow_tip = (int(iris[0] + dx * 2.2), int(iris[1] + dy * 2.2))
        cv2.arrowedLine(frame, ref, arrow_tip, (0, 255, 255), 2, tipLength=0.35)
    elif prev_iris is not None and np.hypot(iris[0] - prev_iris[0], iris[1] - prev_iris[1]) > 1:
        cv2.arrowedLine(frame, prev_iris, iris, (0, 255, 255), 2, tipLength=0.35)

    # 5. On-eye floating direction badge
    badge_x = min(p[0] for p in pts) - 5
    badge_y = min(p[1] for p in pts) - 8
    if badge_y > 15:
        dir_col = (0, 255, 100) if direction == "Straight" else (0, 215, 255)
        text = f"{label}: {direction} {conf:.0f}%"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
        cv2.rectangle(frame, (badge_x - 2, badge_y - th - 3), (badge_x + tw + 4, badge_y + 3), (15, 15, 25), -1)
        cv2.putText(frame, text, (badge_x, badge_y), cv2.FONT_HERSHEY_SIMPLEX, 0.35, dir_col, 1)

def draw_text(frame, text, pos, color=(255, 255, 255), scale=0.5,
              thickness=1, bg=False):
    if bg:
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
        x, y = pos
        cv2.rectangle(frame, (x, y - th - 6), (x + tw + 8, y + 4), (0, 0, 0), -1)
    cv2.putText(frame, text, pos, cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness)


def blend_panel(frame, x, y, w, h, alpha=0.45):
    sub = frame[y:y + h, x:x + w]
    panel = np.zeros_like(sub)
    panel[:] = (18, 18, 30)
    cv2.addWeighted(sub, 1 - alpha, panel, alpha, 0, sub)


def draw_dashed_line(img, pt1, pt2, color, thickness=1, dash_len=8, gap_len=5):
    dist = np.hypot(pt2[0] - pt1[0], pt2[1] - pt1[1])
    if dist < 1e-3:
        return
    d_x = (pt2[0] - pt1[0]) / dist
    d_y = (pt2[1] - pt1[1]) / dist
    cur = 0.0
    while cur < dist:
        p1 = (int(pt1[0] + cur * d_x), int(pt1[1] + cur * d_y))
        p2 = (int(pt1[0] + min(dist, cur + dash_len) * d_x), int(pt1[1] + min(dist, cur + dash_len) * d_y))
        cv2.line(img, p1, p2, color, thickness)
        cur += dash_len + gap_len


def draw_glass_card(img, x, y, w, h, bg_color=(18, 18, 26), alpha=0.75, border_color=(45, 45, 55)):
    img_h, img_w = img.shape[:2]
    x, y = max(0, int(x)), max(0, int(y))
    w, h = min(int(w), img_w - x), min(int(h), img_h - y)
    if w <= 0 or h <= 0:
        return
    sub = img[y:y+h, x:x+w]
    overlay = np.zeros_like(sub)
    overlay[:] = bg_color
    cv2.addWeighted(sub, 1 - alpha, overlay, alpha, 0, sub)
    cv2.rectangle(img, (x, y), (x + w, y + h), border_color, 1)



# =====================================================================
# TEMPORAL JITTER SUPPRESSION (Body Spatial-Temporal Filter)
# =====================================================================
class BodySmoother:
    """Adaptive Exponential Moving Average (EMA) filter for body geometry."""
    def __init__(self, alpha=0.35):
        self.alpha = alpha
        self.smoothed_center = None
        self.smoothed_width = None
        self.smoothed_torso_h = None
        self.smoothed_chest_y = None

    def reset(self):
        self.smoothed_center = None
        self.smoothed_width = None
        self.smoothed_torso_h = None
        self.smoothed_chest_y = None

    def smooth(self, center, width, torso_h, chest_y=None):
        if self.smoothed_center is None:
            self.smoothed_center = center
            self.smoothed_width = width
            self.smoothed_torso_h = torso_h
            self.smoothed_chest_y = chest_y
            return center, width, torso_h, chest_y

        a = self.alpha
        cx = self.smoothed_center[0] + a * (center[0] - self.smoothed_center[0])
        cy = self.smoothed_center[1] + a * (center[1] - self.smoothed_center[1])
        self.smoothed_center = (cx, cy)

        if width is not None and self.smoothed_width is not None:
            self.smoothed_width = self.smoothed_width + a * (width - self.smoothed_width)
        else:
            self.smoothed_width = width or self.smoothed_width

        if torso_h is not None and self.smoothed_torso_h is not None:
            self.smoothed_torso_h = self.smoothed_torso_h + a * (torso_h - self.smoothed_torso_h)
        else:
            self.smoothed_torso_h = torso_h or self.smoothed_torso_h

        if chest_y is not None and self.smoothed_chest_y is not None:
            self.smoothed_chest_y = self.smoothed_chest_y + a * (chest_y - self.smoothed_chest_y)
        else:
            self.smoothed_chest_y = chest_y or self.smoothed_chest_y

        return self.smoothed_center, self.smoothed_width, self.smoothed_torso_h, self.smoothed_chest_y

# =====================================================================
# BODY REGION (PoseLandmarker)
# =====================================================================
def compute_body_region(pose_lms, img_w, img_h, cfg=None, baseline=None,
                         world_torso_ratio=None):
    """Estimate shoulders and chest from MediaPipe pose landmarks.

    Dynamically calculates torso geometry between the shoulder line and hip region.
    Framing requirement: upper body covering HEAD -> SHOULDERS -> CHEST.

    world_torso_ratio: optional personalized (torso_height / shoulder_width)
    ratio learned from pose_world_landmarks (metric, tilt-invariant). Used
    instead of the fixed 1.30 anthropometric constant when hips fall outside
    the pixel frame, per WorldRatioEstimator.
    """
    if not pose_lms:
        return None
    lms = pose_lms.landmark if hasattr(pose_lms, "landmark") else pose_lms
    n = len(lms)
    vis_l = n > POSE_LEFT_SHOULDER and pose_landmark_visible(lms[POSE_LEFT_SHOULDER])
    vis_r = n > POSE_RIGHT_SHOULDER and pose_landmark_visible(lms[POSE_RIGHT_SHOULDER])
    if not vis_l and not vis_r:
        return None

    sl = _landmark_px(lms[POSE_LEFT_SHOULDER], img_w, img_h) if vis_l else None
    sr = _landmark_px(lms[POSE_RIGHT_SHOULDER], img_w, img_h) if vis_r else None

    if sl is not None and sr is not None:
        center = ((sl[0] + sr[0]) / 2.0, (sl[1] + sr[1]) / 2.0)
        width = float(np.hypot(sr[0] - sl[0], sr[1] - sl[1]))
    elif sl is not None:
        center = (float(sl[0]), float(sl[1]))
        width = None
    else:
        center = (float(sr[0]), float(sr[1]))
        width = None

    # Check hip landmarks for torso calculation
    vis_hip_l = n > POSE_LEFT_HIP and pose_landmark_visible(lms[POSE_LEFT_HIP])
    vis_hip_r = n > POSE_RIGHT_HIP and pose_landmark_visible(lms[POSE_RIGHT_HIP])
    hl = _landmark_px(lms[POSE_LEFT_HIP], img_w, img_h) if vis_hip_l else None
    hr = _landmark_px(lms[POSE_RIGHT_HIP], img_w, img_h) if vis_hip_r else None

    hips_estimated = False
    if vis_hip_l and vis_hip_r:
        hip_center_y = (hl[1] + hr[1]) / 2.0
        hip_center_x = (hl[0] + hr[0]) / 2.0
        torso_height = max(hip_center_y - center[1], 0.15 * img_h)
        hip_confidence = 0.95
    elif vis_hip_l:
        hip_center_y = float(hl[1])
        hip_center_x = float(hl[0])
        torso_height = max(hip_center_y - center[1], 0.15 * img_h)
        hip_confidence = 0.65
    elif vis_hip_r:
        hip_center_y = float(hr[1])
        hip_center_x = float(hr[0])
        torso_height = max(hip_center_y - center[1], 0.15 * img_h)
        hip_confidence = 0.65
    else:
        # Upper body webcam view: hips are outside the frame. Estimate torso
        # height from shoulder width using the participant's own learned
        # metric ratio (tilt/distance invariant) when available, otherwise
        # fall back to a generic anthropometric constant.
        hips_estimated = True
        hip_confidence = 0.55 if world_torso_ratio is not None else 0.40
        ratio = world_torso_ratio if world_torso_ratio is not None else 1.30
        if width:
            torso_height = ratio * width
        else:
            torso_height = 0.45 * img_h
        torso_height = max(torso_height, 0.20 * img_h)
        hip_center_y = center[1] + torso_height
        hip_center_x = center[0]

    chest_y = center[1] + (torso_height * 0.22)

    # Frame boundary validation
    side_margin = int(0.02 * img_w)
    top_margin = int(0.02 * img_h)
    bottom_margin_pct = cfg.get("chest_min_margin_pct", 0.02) if cfg else 0.02
    bottom_margin = int(bottom_margin_pct * img_h)

    sh_l_in_frame = vis_l and (side_margin <= sl[0] <= img_w - side_margin) and (top_margin <= sl[1] <= img_h - bottom_margin)
    sh_r_in_frame = vis_r and (side_margin <= sr[0] <= img_w - side_margin) and (top_margin <= sr[1] <= img_h - bottom_margin)
    chest_in_frame = chest_y <= (img_h - bottom_margin)
    torso_in_frame = chest_in_frame and (sh_l_in_frame or sh_r_in_frame)

    # Torso bounding polygon coordinates
    bc_hw = int((width * 0.44) if width else (0.18 * img_w))
    hip_hw = int((width * 0.38) if width else (0.16 * img_w))
    pt_tl = sl if sl else (int(center[0] - bc_hw), int(center[1]))
    pt_tr = sr if sr else (int(center[0] + bc_hw), int(center[1]))
    pt_br = hr if vis_hip_r else (int(center[0] + hip_hw), int(hip_center_y))
    pt_bl = hl if vis_hip_l else (int(center[0] - hip_hw), int(hip_center_y))
    torso_poly = np.array([pt_tl, pt_tr, pt_br, pt_bl], dtype=np.int32)

    vis_el_l = n > POSE_LEFT_ELBOW and pose_landmark_visible(lms[POSE_LEFT_ELBOW])
    vis_el_r = n > POSE_RIGHT_ELBOW and pose_landmark_visible(lms[POSE_RIGHT_ELBOW])
    vis_nose = n > POSE_NOSE and pose_landmark_visible(lms[POSE_NOSE])

    return {
        "shoulder_l": sl, "shoulder_r": sr,
        "shoulder_center": center, "shoulder_width": width,
        "chest_y": chest_y,
        "hips_visible": not hips_estimated, "hips_estimated": hips_estimated,
        "hip_y": hip_center_y, "hip_center": (hip_center_x, hip_center_y),
        "hip_confidence": hip_confidence, "torso_height": torso_height,
        "torso_poly": torso_poly,
        "shoulder_l_visible": vis_l, "shoulder_r_visible": vis_r,
        "shoulder_l_in_frame": sh_l_in_frame, "shoulder_r_in_frame": sh_r_in_frame,
        "chest_in_frame": chest_in_frame,
        "torso_in_frame": torso_in_frame,
        "elbow_l": _landmark_px(lms[POSE_LEFT_ELBOW], img_w, img_h) if vis_el_l else None,
        "elbow_r": _landmark_px(lms[POSE_RIGHT_ELBOW], img_w, img_h) if vis_el_r else None,
        "nose": _landmark_px(lms[POSE_NOSE], img_w, img_h) if vis_nose else None,
    }


# =====================================================================
# CALIBRATION
# =====================================================================
def run_calibration(cap, face_landmarker, pose_landmarker, cfg, shared, ts=None):
    """3-5s calibration phase.  Returns a baseline dict.

    The participant is shown framing instructions.  The exam does NOT start
    until enough good samples (face visible) have been captured.  Results are
    read from `shared` (the dict the LIVE_STREAM callbacks already write to).
    `ts` is a mutable single-frame timestamp counter ([0]) shared with the
    monitoring loop so timestamps stay monotonically increasing across
    calibration -> monitoring (and across recalibration).
    """
    if ts is None:
        ts = [0]
    img_h, img_w = cap.get(cv2.CAP_PROP_FRAME_HEIGHT), cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    img_h, img_w = int(img_h), int(img_w)

    print("[SETUP] Starting CAMERA CALIBRATION ...")
    start = time.time()
    samples = []
    instructions = [
        "CAMERA CALIBRATION",
        "Look straight at the camera.",
        "Keep your head centered.",
        "Keep both shoulders visible.",
        "Position the camera so your head, shoulders,",
        "and chest are clearly visible.",
        "",
        "Hold still for the countdown...",
    ]

    while time.time() - start < cfg["calibration_seconds"] or len(samples) < cfg["calibration_min_samples"]:
        if time.time() - start > cfg.get("calibration_timeout_seconds", 30.0):
            print("[ALERT] Calibration timed out - no face detected. "
                  "Please face the camera and re-run. Exiting.")
            return None
        ok, frame = cap.read()
        if not ok:
            break
        if cfg["flip_horizontal"]:
            frame = cv2.flip(frame, 1)

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts[0] += 1
        face_landmarker.detect_async(mp_image, ts[0])
        pose_landmarker.detect_async(mp_image, ts[0])
        time.sleep(0.02)

        fr = shared["face"]
        pr = shared["pose"]
        faces = fr.face_landmarks if (fr and fr.face_landmarks) else []
        poses = pr.pose_landmarks if (pr and pr.pose_landmarks) else []

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))

        if faces:
            fl = faces[0]
            xs = [lm.x * img_w for lm in fl]
            ys = [lm.y * img_h for lm in fl]
            face_cx, face_cy = float(np.mean(xs)), float(np.mean(ys))
            face_size = float(max(xs) - min(xs))

            img_pts = []
            for idx in HEAD_POSE_LANDMARK_INDICES:
                lm = fl[idx]
                img_pts.append((int(lm.x * img_w), int(lm.y * img_h)))
            img_pts = np.array(img_pts, dtype=np.float32)
            focal = img_w
            cam = np.array([[focal, 0, img_w / 2],
                            [0, focal, img_h / 2],
                            [0, 0, 1]], dtype=np.float32)
            okp, rvec, tvec = cv2.solvePnP(MODEL_POINTS, img_pts, cam,
                                           np.zeros((4, 1), dtype=np.float32),
                                           flags=cv2.SOLVEPNP_ITERATIVE)
            pitch = yaw = roll = 0.0
            if okp:
                rmat, _ = cv2.Rodrigues(rvec)
                pitch, yaw, roll = rotation_matrix_to_euler_angles(rmat)
                if pitch > 90:
                    pitch -= 180
                elif pitch < -90:
                    pitch += 180

            h_ratios, v_ratios = [], []
            if len(fl) > 477:
                hr = eye_horizontal_ratio(fl, RIGHT_EYE_IRIS_CENTER, *RIGHT_EYE_CORNERS, img_w)
                hl = eye_horizontal_ratio(fl, LEFT_EYE_IRIS_CENTER, *LEFT_EYE_CORNERS, img_w)
                vr = eye_vertical_ratio(fl, RIGHT_EYE_IRIS_CENTER,
                                        RIGHT_EYE_TOP_IDX, RIGHT_EYE_BOTTOM_IDX, img_h)
                vl = eye_vertical_ratio(fl, LEFT_EYE_IRIS_CENTER,
                                        LEFT_EYE_TOP_IDX, LEFT_EYE_BOTTOM_IDX, img_h)
                h_ratios.append((hr + hl) / 2.0)
                v_ratios.append((vr + vl) / 2.0)

            # Personal EAR baseline sample (natural eye openness), used later
            # to derive a per-participant blink/closure threshold instead of
            # one fixed global EAR cutoff.
            right_ear = calculate_ear(fl, RIGHT_EYE_EAR_IDX, img_w, img_h)
            left_ear = calculate_ear(fl, LEFT_EYE_EAR_IDX, img_w, img_h)
            ear_sample = (right_ear + left_ear) / 2.0

            body = compute_body_region(poses[0] if poses else None, img_w, img_h, cfg) if poses else None
            sample = {
                "face_center": (face_cx, face_cy),
                "face_size": face_size,
                "pitch": pitch, "yaw": yaw, "roll": roll,
                "gaze_h": float(np.mean(h_ratios)) if h_ratios else 0.5,
                "gaze_v": float(np.mean(v_ratios)) if v_ratios else 0.5,
                "brightness": brightness,
                "body": body,
                "ear": ear_sample,
            }
            samples.append(sample)

        overlay = frame.copy()
        blend_panel(overlay, 40, 40, img_w - 80, 260)
        y = 80
        for line in instructions:
            cv2.putText(overlay, line, (70, y), cv2.FONT_HERSHEY_SIMPLEX,
                        0.6, (255, 255, 255), 1)
            y += 28
        left = int(time.time() - start)
        cv2.putText(overlay, f"{max(0, int(cfg['calibration_seconds'] - (time.time() - start)))}s "
                             f"- samples {len(samples)}/{cfg['calibration_min_samples']}",
                    (70, y + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 1)
        if not samples:
            cv2.putText(overlay, "NO FACE DETECTED - please face the camera and center your head.",
                        (70, y + 46), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        # Guide lines during calibration.
        if samples and samples[-1]["body"]:
            b = samples[-1]["body"]
            if b["shoulder_l"] and b["shoulder_r"]:
                cv2.line(overlay, b["shoulder_l"], b["shoulder_r"], (0, 215, 255), 2)
                cv2.putText(overlay, "SHOULDER LINE", (max(10, b["shoulder_l"][0] - 120), b["shoulder_l"][1] - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 215, 255), 1)
        cv2.line(overlay, (img_w // 2, 40), (img_w // 2, img_h - 40), (120, 120, 120), 1)

        cv2.imshow('LMS Proctoring Monitor', overlay)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            return None

    if not samples:
        print("[ALERT] Calibration failed - no face samples captured. Exiting.")
        return None

    def avg(key):
        vals = [s[key] for s in samples if s[key] is not None]
        return float(np.mean(vals)) if vals else 0.0

    bodies = [s["body"] for s in samples if s["body"]]
    sw_vals = [b["shoulder_width"] for b in bodies if b.get("shoulder_width")]
    th_vals = [b["torso_height"] for b in bodies if b.get("torso_height")]
    fs_vals = [s["face_size"] for s in samples if s.get("face_size")]
    ear_vals = [s["ear"] for s in samples if s.get("ear") is not None]

    # Derive a personalized EAR (eye-openness) baseline. Some participants
    # naturally have a lower/higher resting EAR (hooded eyelids, eye shape,
    # camera angle); a single global 0.21 cutoff either misses their blinks
    # or falsely flags "eyes closed" on their normal open-eye state.
    ear_baseline = float(np.mean(ear_vals)) if ear_vals else None
    personal_ear_threshold = None
    if ear_baseline is not None and cfg.get("ear_personalization_enabled", True):
        ratio = cfg.get("ear_personalization_ratio", 0.75)
        lo = cfg.get("ear_personalization_min", 0.12)
        hi = cfg.get("ear_personalization_max", 0.28)
        personal_ear_threshold = float(np.clip(ear_baseline * ratio, lo, hi))

    baseline = {
        "face_center": (float(np.mean([s["face_center"][0] for s in samples])),
                        float(np.mean([s["face_center"][1] for s in samples]))),
        "face_size": avg("face_size"),
        "face_size_std": float(np.std(fs_vals)) if fs_vals else 5.0,
        "pitch": avg("pitch"), "yaw": avg("yaw"), "roll": avg("roll"),
        "gaze_h": avg("gaze_h"), "gaze_v": avg("gaze_v"),
        "brightness": avg("brightness") if "brightness" in samples[0] else None,
        "ear_baseline": ear_baseline,
        "ear_threshold": personal_ear_threshold,  # None => caller falls back to cfg default
        "body": {
            "shoulder_center": (float(np.mean([b["shoulder_center"][0] for b in bodies])),
                                float(np.mean([b["shoulder_center"][1] for b in bodies]))) if bodies else None,
            "shoulder_width": float(np.mean(sw_vals)) if sw_vals else None,
            "shoulder_width_std": float(np.std(sw_vals)) if sw_vals else 10.0,
            "torso_height": float(np.mean(th_vals)) if th_vals else None,
            "torso_height_std": float(np.std(th_vals)) if th_vals else 15.0,
            "chest_y": float(np.mean([b["chest_y"] for b in bodies])) if bodies else None,
            "samples_with_pose": len(bodies),
        },
        "img_w": img_w, "img_h": img_h,
    }
    print(f"[SETUP] Calibration complete: face size {baseline['face_size']:.0f}px, "
          f"gaze ({baseline['gaze_h']:.2f},{baseline['gaze_v']:.2f}), "
          f"pose samples {baseline['body']['samples_with_pose']}, "
          f"EAR baseline {ear_baseline if ear_baseline is None else round(ear_baseline, 3)} "
          f"(personal threshold "
          f"{personal_ear_threshold if personal_ear_threshold is None else round(personal_ear_threshold, 3)}).")
    return baseline


# =====================================================================
# MAIN MONITORING LOOP
# =====================================================================
def main():
    parser = argparse.ArgumentParser(description="LMS Participant Proctoring Monitor")
    parser.add_argument("--session-id", default=os.getenv("PROCTOR_SESSION_ID", PROCTOR_CONFIG.get("session_id", "LMS-SESSION")))
    parser.add_argument("--attempt-id", type=int, default=int(os.getenv("PROCTOR_ATTEMPT_ID", 0)))
    parser.add_argument("--participant-id", default=os.getenv("PROCTOR_PARTICIPANT_ID", PROCTOR_CONFIG.get("participant_name", "Participant")))
    parser.add_argument("--quiz-id", type=int, default=int(os.getenv("PROCTOR_QUIZ_ID", 0)))
    parser.add_argument("--backend-url", default=os.getenv("BACKEND_URL", "http://localhost:3001"))
    parser.add_argument("--token", default=os.getenv("PROCTOR_TOKEN", ""))
    parser.add_argument("--headless", action="store_true", default=os.getenv("PROCTOR_HEADLESS", "false").lower() == "true")
    parser.add_argument("--cam", type=int, default=PROCTOR_CONFIG.get("cam_index", 0))
    args, _ = parser.parse_known_args()

    cfg = PROCTOR_CONFIG.copy()
    cfg["session_id"] = args.session_id
    cfg["attempt_id"] = args.attempt_id
    cfg["participant_id"] = args.participant_id
    cfg["participant_name"] = str(args.participant_id)
    cfg["quiz_id"] = args.quiz_id
    cfg["backend_url"] = args.backend_url
    cfg["auth_token"] = args.token
    cfg["headless"] = args.headless
    cfg["cam_index"] = args.cam

    engine = EventEngine(cfg)

    face_model_path = FACE_MODEL_PATH
    pose_model_path = ensure_model(POSE_MODEL_PATH, POSE_MODEL_URL)

    shared = {"face": None, "face_ts": 0.0, "pose": None, "pose_ts": 0.0}

    def face_result_cb(result: FaceLandmarkerResult, output_image, timestamp_ms):
        shared["face"] = result
        shared["face_ts"] = time.time()

    def pose_result_cb(result: PoseLandmarkerResult, output_image, timestamp_ms):
        shared["pose"] = result
        shared["pose_ts"] = time.time()

    face_options = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=face_model_path),
        running_mode=VisionRunningMode.LIVE_STREAM,
        num_faces=4,
        min_face_detection_confidence=0.50,
        min_face_presence_confidence=0.50,
        min_tracking_confidence=0.50,
        result_callback=face_result_cb,
    )
    pose_options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=pose_model_path),
        running_mode=VisionRunningMode.LIVE_STREAM,
        num_poses=4,
        min_pose_detection_confidence=0.50,
        min_pose_presence_confidence=0.50,
        min_tracking_confidence=0.50,
        result_callback=pose_result_cb,
    )

    cap = cv2.VideoCapture(cfg["cam_index"])
    if not cap.isOpened():
        raise RuntimeError("Could not open the webcam (index 0). Try another index in PROCTOR_CONFIG['cam_index'].")

    prev_pose = {}          # face_idx -> (rvec, tvec) PnP seed
    prev_face_count = 0
    gaze_anomaly_state = {}
    blink_state = {}
    mouth_state = {}
    eye_motion = {}         # face_idx -> per-eye movement state
    smoothed_angles = {}
    smoothed_gaze = {}
    smoothed_gaze_v = {}
    frame_timestamp_ms = [0]
    pose_frame_counter = 0

    # Smoothing for pose.
    SMOOTHING_ALPHA = 0.35
    GAZE_SMOOTHING_ALPHA = 0.35

    def smooth(face_idx, pitch, yaw, roll):
        prev = smoothed_angles.get(face_idx)
        if prev is None:
            smoothed_angles[face_idx] = (pitch, yaw, roll)
            return pitch, yaw, roll
        p = prev[0] + SMOOTHING_ALPHA * (pitch - prev[0])
        y = prev[1] + SMOOTHING_ALPHA * (yaw - prev[1])
        r = prev[2] + SMOOTHING_ALPHA * (roll - prev[2])
        smoothed_angles[face_idx] = (p, y, r)
        return p, y, r

    def smooth_gaze(face_idx, ratio, cache):
        prev = cache.get(face_idx)
        if prev is None:
            cache[face_idx] = ratio
            return ratio
        new_ratio = prev + GAZE_SMOOTHING_ALPHA * (ratio - prev)
        cache[face_idx] = new_ratio
        return new_ratio

    # ---- condition trackers (persistence / duration) ----
    T = {
        "face_absent": ConditionTracker("face_absent"),
        "multiple_faces": ConditionTracker("multiple_faces"),
        "no_body": ConditionTracker("no_body"),
        "body_shift": ConditionTracker("body_shift"),
        "body_too_close": ConditionTracker("body_too_close"),
        "body_too_far": ConditionTracker("body_too_far"),
        "sh_l_missing": ConditionTracker("sh_l_missing"),
        "sh_r_missing": ConditionTracker("sh_r_missing"),
        "sh_both_missing": ConditionTracker("sh_both_missing"),
        "chest_missing": ConditionTracker("chest_missing"),
        "movement": ConditionTracker("movement"),
        "camera_lost": ConditionTracker("camera_lost"),
        "camera_frozen": ConditionTracker("camera_frozen"),
        "camera_blurry": ConditionTracker("camera_blurry"),
        "lighting_bad": ConditionTracker("lighting_bad"),
        "head_dev": ConditionTracker("head_dev"),
        "eye_not_visible": ConditionTracker("eye_not_visible"),
        "rem": ConditionTracker("rem"),
        "object_visible": ConditionTracker("object_visible"),
    }
    gaze_trackers = {}      # face_idx -> tracker for side glance
    desk_trackers = {}      # face_idx -> tracker for desk look
    unusual_trackers = {}   # face_idx -> unusual combo

    # ---- optional detectors ----
    object_detector = ObjectDetector(cfg["object_detection"]) if cfg["object_detection"]["enabled"] else None
    browser_mon = BrowserEventMonitor(cfg["browser_event_file"])
    if browser_mon.enabled():
        print("[SETUP] Browser event monitor enabled - ingesting from "
              f"{cfg['browser_event_file']}")

    # ==================================================================
    # CALIBRATION
    # ==================================================================
    with FaceLandmarker.create_from_options(face_options) as face_lm, \
            PoseLandmarker.create_from_options(pose_options) as pose_lm:
        baseline = run_calibration(cap, face_lm, pose_lm, cfg, shared, frame_timestamp_ms)
        if baseline is None:
            cap.release()
            cv2.destroyAllWindows()
            return

        # Per-participant EAR threshold learned during calibration, falling
        # back to the global config default when personalization is off or
        # calibration didn't yield a usable sample.
        active_ear_threshold = baseline.get("ear_threshold") or cfg["ear_threshold"]

        engine.emit("Exam Started", "INFO", metadata={"calibration": "complete"}, risk_weight=0)
        print("[INFO] Monitoring active. Keys: q=quit  d=debug  r=recalibrate")

        prev_gray = None
        eye_total_blinks = 0
        blink_times = deque(maxlen=200)
        fps_history = deque(maxlen=30)
        last_obj_phone_detected = False
        body_smoother = BodySmoother(alpha=cfg.get("body_smoothing_alpha", 0.35))
        world_ratio_estimator = WorldRatioEstimator(cfg)

        while cap.isOpened():
            ok, frame = cap.read()
            now = time.time()
            if not ok:
                T["camera_lost"].update(True, now)
                if T["camera_lost"].crossed(cfg["camera"]["camera_warn_seconds"]):
                    engine.emit("Camera Lost / Disconnected", "HIGH",
                                duration=T["camera_lost"].last_dur,
                                metadata={"camera_status": "LOST"})
                cv2.putText(frame if frame is not None else np.zeros((480, 640, 3), dtype=np.uint8),
                            "CAMERA: LOST", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0,
                            (0, 0, 255), 2)
                cv2.imshow('LMS Proctoring Monitor',
                           frame if frame is not None else np.zeros((480, 640, 3), dtype=np.uint8))
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
                continue
            if cfg["flip_horizontal"]:
                frame = cv2.flip(frame, 1)

            T["camera_lost"].update(False, now)

            img_h, img_w, _ = frame.shape

            # Safe defaults so later panels/overlays never read undefined
            # locals on frames with no face or before CENTER ALIGNMENT runs.
            pitch, yaw, roll = 0.0, 0.0, 0.0
            center_label = "CENTERED"
            face_cx = face_cy = None

            # ---- camera health / lighting (cheap, every frame) ----
            gray, brightness, blur_var, frozen_diff = frame_stats(frame, prev_gray)
            prev_gray = gray

            camera_status = "GOOD"
            if T["camera_lost"].active_since is not None:
                camera_status = "LOST"
            elif brightness < cfg["camera"]["dark_threshold"] or \
                    brightness > cfg["camera"]["bright_threshold"]:
                camera_status = "POOR"

            fdur = T["camera_frozen"].update(frozen_diff < cfg["camera"]["frozen_diff_threshold"], now)
            if T["camera_frozen"].crossed(cfg["camera"]["camera_warn_seconds"]):
                engine.emit("Camera Frame Frozen", "WARNING", duration=fdur,
                            metadata={"camera_status": "POOR"})

            bdur = T["camera_blurry"].update(blur_var < cfg["camera"]["blur_variance_threshold"], now)
            if T["camera_blurry"].crossed(cfg["camera"]["camera_warn_seconds"]):
                engine.emit("Camera Blurry / Poor Visibility", "WARNING", duration=bdur,
                            metadata={"camera_status": "POOR"})

            # lighting (system warning, never a participant violation)
            if brightness < cfg["camera"]["dark_threshold"] or \
                    brightness > cfg["camera"]["bright_threshold"]:
                light = "LOW" if brightness < cfg["camera"]["dark_threshold"] else "EXCESSIVE"
                ldur = T["lighting_bad"].update(True, now)
                if T["lighting_bad"].crossed(cfg["camera"]["camera_warn_seconds"]):
                    engine.emit("Warning: Improve Lighting", "WARNING", duration=ldur,
                                metadata={"lighting": light, "brightness": round(brightness, 1)})
            else:
                light = "GOOD"
                T["lighting_bad"].update(False, now)

            # ---- run inference (async) ----
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            frame_timestamp_ms[0] += 1
            face_lm.detect_async(mp_image, frame_timestamp_ms[0])
            if pose_frame_counter % cfg["frame_skip_pose"] == 0:
                pose_lm.detect_async(mp_image, frame_timestamp_ms[0])
            pose_frame_counter += 1

            result = shared["face"]
            pose_result = shared["pose"]

            # ==================================================================
            # ASYNC RESULT VALIDATION & STALENESS CHECK
            # ==================================================================
            face_is_stale = (now - shared.get("face_ts", 0.0) > 0.65) if shared.get("face_ts") else True
            pose_is_stale = (now - shared.get("pose_ts", 0.0) > 0.85) if shared.get("pose_ts") else True

            # ==================================================================
            # FACE PRESENCE / MULTIPLE FACES
            # ==================================================================
            faces = result.face_landmarks if (result and result.face_landmarks and not face_is_stale) else []
            poses = pose_result.pose_landmarks if (pose_result and pose_result.pose_landmarks and not pose_is_stale) else []
            world_poses = (pose_result.pose_world_landmarks
                           if (pose_result and cfg.get("use_world_landmarks", True)
                               and getattr(pose_result, "pose_world_landmarks", None)
                               and not pose_is_stale)
                           else [])
            face_count = len(faces)
            pose_count = len(poses)

            # Opportunistically learn this participant's metric torso/shoulder
            # ratio whenever hips are visible in world space (tilt-invariant).
            if world_poses:
                world_ratio_estimator.update(
                    compute_world_torso_ratio(world_poses[0], cfg))

            # ── 1. Participant Absence & Return Handling ──
            if face_count == 0:
                fdur = T["face_absent"].update(True, now)
                if T["face_absent"].crossed(cfg["face_high_seconds"]):
                    engine.emit("FACE_ABSENT", "HIGH", duration=fdur,
                                metadata={"duration": round(fdur, 2), "faceCount": 0, "status": "ABSENT"})
                elif T["face_absent"].crossed(cfg["face_warn_seconds"]):
                    engine.emit("FACE_ABSENT", "WARNING", duration=fdur,
                                metadata={"duration": round(fdur, 2), "faceCount": 0, "status": "ABSENT"})
            else:
                # Was the face absent for >= face_warn_seconds? If so, emit FACE_RETURNED!
                if T["face_absent"].is_active and T["face_absent"].last_dur >= cfg["face_warn_seconds"]:
                    absent_duration = T["face_absent"].last_dur
                    engine.emit("FACE_RETURNED", "INFO", confidence=1.0, duration=absent_duration,
                                metadata={"absenceDuration": round(absent_duration, 2),
                                          "returnTimestamp": datetime.datetime.now().isoformat(),
                                          "faceCount": face_count},
                                risk_weight=0)
                T["face_absent"].update(False, now)

            # ── 2. Multiple Person Detection ──
            if face_count >= 2:
                mdur = T["multiple_faces"].update(True, now)
                if T["multiple_faces"].crossed(cfg["multiple_face_seconds"]):
                    sev = "HIGH" if face_count >= 3 else "WARNING"
                    conf = min(0.98, 0.70 + 0.10 * face_count)
                    face_boxes = []
                    for fi, flm in enumerate(faces):
                        xs = [lm.x * img_w for lm in flm]
                        ys = [lm.y * img_h for lm in flm]
                        face_boxes.append({"faceIndex": fi, "box": [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]})
                    engine.emit("MULTIPLE_PERSONS_DETECTED", sev,
                                confidence=conf, duration=mdur,
                                metadata={"faceCount": face_count, "faces": face_boxes})
            else:
                T["multiple_faces"].update(False, now)

            # ---- face-count change: clear per-face caches (indices are positional) ----
            if face_count != prev_face_count:
                prev_pose.clear()
                smoothed_angles.clear()
                smoothed_gaze.clear()
                smoothed_gaze_v.clear()
                gaze_anomaly_state.clear()
                blink_state.clear()
                mouth_state.clear()
                eye_motion.clear()
            prev_face_count = face_count

            # ==================================================================
            # BODY / POSE REGION FRAMING (HIGH ACCURACY)
            # Computed BEFORE center-alignment so the fused center estimate
            # below can use the shoulder center in the same frame.
            # ==================================================================
            body = None
            if poses:
                body = compute_body_region(
                    poses[0], img_w, img_h, cfg, baseline,
                    world_torso_ratio=world_ratio_estimator.get())

            if body:
                # Apply temporal jitter smoothing to body geometry
                s_center, s_width, s_torso_h, s_chest_y = body_smoother.smooth(
                    body["shoulder_center"], body["shoulder_width"], body["torso_height"], body["chest_y"]
                )
                body["shoulder_center"] = s_center
                body["shoulder_width"] = s_width
                body["torso_height"] = s_torso_h
                body["chest_y"] = s_chest_y
            else:
                body_smoother.reset()

            # ==================================================================
            # CENTER ALIGNMENT (face center vs camera center, fused with
            # shoulder center when available)
            # ---------------------------------------------------------------
            # Face-only centering falsely fires "off-center" on a simple head
            # turn even though the participant's body/torso hasn't moved.
            # Fusing the face-centroid offset with the shoulder-centroid
            # offset (when the body is detected) makes "Center yourself"
            # track actual body position rather than momentary head yaw.
            # ==================================================================
            if faces:
                fl = faces[0]
                xs = [lm.x * img_w for lm in fl]
                face_cx = float(np.mean(xs))
                face_offset = (face_cx - img_w / 2) / img_w

                a = cfg["center"]
                if body and body.get("shoulder_center"):
                    shoulder_offset = (body["shoulder_center"][0] - img_w / 2) / img_w
                    fw = a.get("face_weight", 0.5)
                    sw = a.get("shoulder_weight", 0.5)
                    total_w = fw + sw if (fw + sw) > 0 else 1.0
                    offset = (fw * face_offset + sw * shoulder_offset) / total_w
                else:
                    offset = face_offset

                if abs(offset) < a["slight_fraction"]:
                    center_label = "CENTERED"
                elif abs(offset) < a["far_fraction"]:
                    center_label = "SLIGHTLY " + ("RIGHT" if offset > 0 else "LEFT")
                else:
                    center_label = "TOO FAR " + ("RIGHT" if offset > 0 else "LEFT")
                if center_label.startswith("TOO FAR"):
                    cdur = T["body_shift"].update(True, now)
                    if T["body_shift"].crossed(a["duration_seconds"]):
                        engine.emit(f"Body Shifted {center_label.split(' ',1)[1]}", "WARNING",
                                    duration=cdur,
                                    metadata={"position": center_label,
                                              "offset": round(offset, 3),
                                              "face_offset": round(face_offset, 3)})
                else:
                    T["body_shift"].update(False, now)

            # Compute Visibility Score (0-100) based on framing criteria
            coverage_score = 0
            if face_count > 0:
                coverage_score += 25
            if body:
                if body["shoulder_l_in_frame"]:
                    coverage_score += 25
                if body["shoulder_r_in_frame"]:
                    coverage_score += 25
                if body["chest_in_frame"]:
                    coverage_score += 25
            coverage_score = min(100, max(0, coverage_score))

            # Scale/Distance evaluation against statistical baseline tolerance.
            # Primary: sigma-based envelope (mean +/- k*std) learned during
            # calibration, per the plan's "Statistical Posture Tolerance
            # Envelope". Falls back to fixed ratios only when no calibration
            # std is available. A relative-std floor prevents an unusually
            # still calibration (near-zero std) from producing an
            # unrealistically tight band that triggers on normal breathing.
            is_too_close = False
            is_too_far = False
            k = cfg.get("distance_sigma_multiplier", 2.5)
            min_rel_std = cfg.get("min_relative_std", 0.08)

            if body and body["shoulder_width"] and baseline and baseline.get("body") and baseline["body"].get("shoulder_width"):
                base_sw = baseline["body"]["shoulder_width"]
                std_sw = baseline["body"].get("shoulder_width_std", 0.0) or 0.0
                std_sw = max(std_sw, min_rel_std * base_sw)
                lower = base_sw - k * std_sw
                upper = base_sw + k * std_sw
                is_too_close = body["shoulder_width"] > upper
                is_too_far = body["shoulder_width"] < max(lower, 1e-6)
            elif faces and baseline and baseline.get("face_size"):
                xs = [lm.x * img_w for lm in faces[0]]
                cur_face_size = float(max(xs) - min(xs))
                base_fs = baseline["face_size"]
                std_fs = baseline.get("face_size_std", 0.0) or 0.0
                std_fs = max(std_fs, min_rel_std * base_fs)
                lower = base_fs - k * std_fs
                upper = base_fs + k * std_fs
                is_too_close = cur_face_size > upper
                is_too_far = cur_face_size < max(lower, 1e-6)

            # Check if head is cut off at top of frame
            head_top_cutoff = False
            if faces:
                min_face_y = min(lm.y * img_h for lm in faces[0])
                if min_face_y < (cfg.get("head_margin_top", 0.03) * img_h):
                    head_top_cutoff = True

            # Determine Body Status & Guidance
            guidance_warning = None
            if body is None:
                body_status = "Not Detected"
                guidance_warning = "Body not detected in camera"
                if pose_count == 0:
                    ndur = T["no_body"].update(True, now)
                    if T["no_body"].crossed(cfg["body_missing_seconds"]):
                        engine.emit("Participant Body Not Visible", "WARNING", duration=ndur,
                                    metadata={"body_position": "outside_camera"})
                else:
                    T["no_body"].update(False, now)
            else:
                T["no_body"].update(False, now)

                # Individual Shoulder presence & framing checks (Section 12)
                both_missing = (not body["shoulder_l_in_frame"] and not body["shoulder_r_in_frame"])
                if both_missing:
                    shdur = T["sh_both_missing"].update(True, now)
                    if T["sh_both_missing"].crossed(cfg["shoulder_missing_seconds"]):
                        engine.emit("BOTH_SHOULDERS_MISSING", "WARNING", duration=shdur,
                                    metadata={"leftShoulderVisible": body["shoulder_l_in_frame"],
                                              "rightShoulderVisible": body["shoulder_r_in_frame"],
                                              "coverageScore": coverage_score})
                else:
                    T["sh_both_missing"].update(False, now)
                    if not body["shoulder_l_in_frame"]:
                        shdur = T["sh_l_missing"].update(True, now)
                        if T["sh_l_missing"].crossed(cfg["shoulder_missing_seconds"]):
                            engine.emit("LEFT_SHOULDER_MISSING", "WARNING", duration=shdur,
                                        metadata={"leftShoulderVisible": False,
                                                  "rightShoulderVisible": body["shoulder_r_in_frame"],
                                                  "coverageScore": coverage_score})
                    else:
                        T["sh_l_missing"].update(False, now)

                    if not body["shoulder_r_in_frame"]:
                        shdur = T["sh_r_missing"].update(True, now)
                        if T["sh_r_missing"].crossed(cfg["shoulder_missing_seconds"]):
                            engine.emit("RIGHT_SHOULDER_MISSING", "WARNING", duration=shdur,
                                        metadata={"leftShoulderVisible": body["shoulder_l_in_frame"],
                                                  "rightShoulderVisible": False,
                                                  "coverageScore": coverage_score})
                    else:
                        T["sh_r_missing"].update(False, now)

                # Chest Visibility check (Section 13 - Framing warning)
                if body["shoulder_l_in_frame"] and body["shoulder_r_in_frame"] and not body["chest_in_frame"]:
                    cdur = T["chest_missing"].update(True, now)
                    if T["chest_missing"].crossed(cfg.get("chest_missing_seconds", 2.5)):
                        engine.emit("CHEST_NOT_VISIBLE", "WARNING", duration=cdur,
                                    metadata={"chestY": round(body["chest_y"], 1),
                                              "coverageScore": coverage_score,
                                              "category": "FRAMING"})
                else:
                    T["chest_missing"].update(False, now)

                # Distance trackers (Section 15)
                cdur = T["body_too_close"].update(is_too_close, now)
                if T["body_too_close"].crossed(cfg["body_too_close_seconds"]):
                    engine.emit("BODY_TOO_CLOSE", "WARNING", duration=cdur,
                                metadata={"body_position": "too_close", "coverageScore": coverage_score})
                fdur = T["body_too_far"].update(is_too_far, now)
                if T["body_too_far"].crossed(cfg["body_too_far_seconds"]):
                    engine.emit("BODY_TOO_FAR", "WARNING", duration=fdur,
                                metadata={"body_position": "too_far", "coverageScore": coverage_score})

                # Context-aware diagnostic guidance messages
                if is_too_close:
                    body_status = "Too Close"
                    guidance_warning = "Move camera farther away"
                elif is_too_far:
                    body_status = "Too Far"
                    guidance_warning = "Move closer to camera"
                elif head_top_cutoff:
                    body_status = "Partially Visible"
                    guidance_warning = "Raise camera / keep head visible in frame"
                elif not body["shoulder_l_in_frame"] or not body["shoulder_r_in_frame"]:
                    body_status = "Partially Visible"
                    guidance_warning = "Keep both shoulders visible in frame"
                elif not body["chest_in_frame"]:
                    body_status = "Partially Visible"
                    guidance_warning = "Adjust camera to keep chest visible"
                elif center_label.startswith("TOO FAR"):
                    body_status = "Partially Visible"
                    guidance_warning = "Center yourself in camera view"
                elif coverage_score >= 75:
                    body_status = "Visible"
                    guidance_warning = None
                else:
                    body_status = "Partially Visible"
                    guidance_warning = "Adjust camera framing"



            # ==================================================================
            # PARTICIPANT MOVEMENT
            # ---------------------------------------------------------------
            # Reference point: shoulder center when the body is detected,
            # else the face centroid (mean of all face landmarks, matching
            # what CENTER ALIGNMENT uses) - NOT a single arbitrary landmark,
            # which is noisy and not representative of overall position.
            # ==================================================================
            ref_center = None
            if body and body["shoulder_center"]:
                ref_center = np.array(body["shoulder_center"])
            elif faces:
                fl0 = faces[0]
                if face_cx is None:
                    face_cx = float(np.mean([lm.x * img_w for lm in fl0]))
                face_cy = float(np.mean([lm.y * img_h for lm in fl0]))
                ref_center = np.array([face_cx, face_cy])
            if ref_center is not None and baseline["body"]["shoulder_center"]:
                base = np.array(baseline["body"]["shoulder_center"])
                disp = float(np.linalg.norm(ref_center - base))
                moved = disp > cfg["movement_px_threshold"]
                if moved:
                    mdur = T["movement"].update(True, now)
                    if T["movement"].crossed(cfg["movement_seconds"]):
                        engine.emit("Participant Moving Significantly", "INFO", duration=mdur,
                                    metadata={"displacement_px": round(disp, 1)})
                else:
                    was_moved = T["movement"].is_active
                    T["movement"].update(False, now)
                    if was_moved:
                        engine.emit("Participant Repositioned / Returned", "INFO",
                                    metadata={"displacement_px": round(disp, 1)}, risk_weight=0)

            # ==================================================================
            # FACE-LEVEL DETECTORS (blink, mouth, head pose, gaze, combos)
            # ==================================================================
            eyes_visible = True
            current_eyes_dir = "Straight"
            current_head_h = ""
            current_head_v = ""
            blink_total = 0
            mar_display = 0.0
            ear_display = 0.0
            gaze_conf = 0.0
            mouth_open_any = False

            if faces:
                for face_idx, fl in enumerate(faces):
                    image_points = []
                    for idx in HEAD_POSE_LANDMARK_INDICES:
                        lm = fl[idx]
                        image_points.append((int(lm.x * img_w), int(lm.y * img_h)))
                    image_points = np.array(image_points, dtype=np.float32)

                    # ================= BLINK =================
                    # Uses the per-participant EAR threshold learned during
                    # calibration (active_ear_threshold) instead of a single
                    # fixed value, so naturally narrower/wider eyes don't
                    # produce false "prolonged closure" or missed blinks.
                    right_ear = calculate_ear(fl, RIGHT_EYE_EAR_IDX, img_w, img_h)
                    left_ear = calculate_ear(fl, LEFT_EYE_EAR_IDX, img_w, img_h)
                    avg_ear = (right_ear + left_ear) / 2.0
                    ear_display = avg_ear

                    if face_idx not in blink_state:
                        blink_state[face_idx] = {
                            "eyes_closed": False, "closed_since": None,
                            "blink_count": 0, "prolonged_alerted": False,
                        }
                    b_state = blink_state[face_idx]
                    if avg_ear < active_ear_threshold:
                        if not b_state["eyes_closed"]:
                            b_state["eyes_closed"] = True
                            b_state["closed_since"] = now
                            b_state["prolonged_alerted"] = False
                        elif (now - b_state["closed_since"] > cfg["prolonged_closure_seconds"]
                              and not b_state["prolonged_alerted"]):
                            engine.emit("Eyes Closed - Prolonged", "WARNING",
                                        duration=now - b_state["closed_since"],
                                        metadata={"ear": round(avg_ear, 3),
                                                  "threshold": round(active_ear_threshold, 3)})
                            b_state["prolonged_alerted"] = True
                    else:
                        if b_state["eyes_closed"]:
                            closed_duration = (now - b_state["closed_since"]) if b_state["closed_since"] else 0.0
                            if closed_duration < cfg["prolonged_closure_seconds"]:
                                b_state["blink_count"] += 1
                                blink_times.append(now)
                                eye_total_blinks += 1
                                engine.emit("Blink", "INFO", duration=closed_duration,
                                            metadata={"blink_count": b_state["blink_count"]},
                                            risk_weight=0)
                            b_state["eyes_closed"] = False
                            b_state["closed_since"] = None
                            b_state["prolonged_alerted"] = False
                    blink_total = max(blink_total, b_state["blink_count"])

                    # ================= MOUTH =================
                    mar = calculate_mar(fl, img_w, img_h)
                    mar_display = mar
                    if face_idx not in mouth_state:
                        mouth_state[face_idx] = {
                            "mouth_open": False, "open_since": None, "talking_alerted": False,
                        }
                    m_state = mouth_state[face_idx]
                    if mar > cfg["mar_threshold"]:
                        mouth_open_any = True
                        if not m_state["mouth_open"]:
                            m_state["mouth_open"] = True
                            m_state["open_since"] = now
                            m_state["talking_alerted"] = False
                        elif (now - m_state["open_since"] > cfg["talking_seconds"]
                              and not m_state["talking_alerted"]):
                            engine.emit("Possible Talking", "WARNING",
                                        duration=now - m_state["open_since"],
                                        metadata={"mar": round(mar, 3)})
                            m_state["talking_alerted"] = True
                    else:
                        if m_state["mouth_open"]:
                            m_state["mouth_open"] = False
                            m_state["open_since"] = None
                            m_state["talking_alerted"] = False

                    # ================= HEAD POSE =================
                    guess = prev_pose.get(face_idx)
                    if guess is not None:
                        success_pnp, rvec, tvec = cv2.solvePnP(
                            MODEL_POINTS, image_points,
                            np.array([[img_w, 0, img_w / 2],
                                      [0, img_w, img_h / 2],
                                      [0, 0, 1]], dtype=np.float32),
                            np.zeros((4, 1), dtype=np.float32),
                            rvec=guess[0].copy(), tvec=guess[1].copy(),
                            useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE)
                    else:
                        success_pnp, rvec, tvec = cv2.solvePnP(
                            MODEL_POINTS, image_points,
                            np.array([[img_w, 0, img_w / 2],
                                      [0, img_w, img_h / 2],
                                      [0, 0, 1]], dtype=np.float32),
                            np.zeros((4, 1), dtype=np.float32),
                            flags=cv2.SOLVEPNP_ITERATIVE)

                    pitch = yaw = roll = 0.0
                    pose_label = "Straight"
                    current_head_h = ""
                    current_head_v = ""
                    if success_pnp:
                        prev_pose[face_idx] = (rvec, tvec)
                        rmat, _ = cv2.Rodrigues(rvec)
                        pitch, yaw, roll = rotation_matrix_to_euler_angles(rmat)
                        if pitch > 90:
                            pitch -= 180
                        elif pitch < -90:
                            pitch += 180
                        pitch += -5.0  # PITCH_OFFSET for typical camera tilt
                        pitch, yaw, roll = smooth(face_idx, pitch, yaw, roll)

                        # Baseline-compensated Head Pose Deviation (Section 10)
                        base_pitch = baseline.get("pitch", 0.0) if baseline else 0.0
                        base_yaw = baseline.get("yaw", 0.0) if baseline else 0.0
                        base_roll = baseline.get("roll", 0.0) if baseline else 0.0

                        rel_pitch = pitch - base_pitch
                        rel_yaw = yaw - base_yaw
                        rel_roll = roll - base_roll

                        YAW_INNER = cfg.get("head_yaw_threshold", 12.0) * 0.6
                        YAW_OUTER = cfg.get("head_yaw_threshold", 12.0)
                        PITCH_INNER = cfg.get("head_pitch_threshold", 10.0) * 0.6
                        PITCH_OUTER = cfg.get("head_pitch_threshold", 10.0)
                        ROLL_INNER = cfg.get("head_roll_threshold", 14.0) * 0.6
                        ROLL_OUTER = cfg.get("head_roll_threshold", 14.0)

                        yaw_sign, yaw_conf = fuzzy_classify(rel_yaw, YAW_INNER, YAW_OUTER)
                        pitch_sign, pitch_conf = fuzzy_classify(rel_pitch, PITCH_INNER, PITCH_OUTER)
                        roll_sign, roll_conf = fuzzy_classify(rel_roll, ROLL_INNER, ROLL_OUTER)

                        horizontal_state = "Right" if (yaw_sign > 0 and yaw_conf >= 0.50) else ("Left" if (yaw_sign < 0 and yaw_conf >= 0.50) else "")
                        vertical_state = "Down" if (pitch_sign > 0 and pitch_conf >= 0.50) else ("Up" if (pitch_sign < 0 and pitch_conf >= 0.50) else "")
                        tilt_state = "Right" if (roll_sign > 0 and roll_conf >= 0.60) else ("Left" if (roll_sign < 0 and roll_conf >= 0.60) else "")

                        current_head_h = horizontal_state
                        current_head_v = vertical_state
                        if horizontal_state and vertical_state:
                            pose_label = f"Looking {vertical_state}-{horizontal_state}"
                        elif horizontal_state:
                            pose_label = f"Looking {horizontal_state}"
                        elif vertical_state:
                            pose_label = f"Looking {vertical_state}"
                        elif tilt_state:
                            pose_label = f"Tilted {tilt_state}"
                        else:
                            pose_label = "Straight"

                        # Head deviation persistence & event emission
                        if horizontal_state:
                            hdur = T["head_dev"].update(True, now)
                            if T["head_dev"].crossed(cfg["head_deviation_seconds"]):
                                engine.emit(f"HEAD_TURNED_{horizontal_state.upper()}", "WARNING", duration=hdur,
                                            metadata={"head": pose_label, "yaw": round(yaw, 1), "pitch": round(pitch, 1), "roll": round(roll, 1)})
                        elif vertical_state:
                            hdur = T["head_dev"].update(True, now)
                            if T["head_dev"].crossed(cfg["head_deviation_seconds"]):
                                engine.emit(f"HEAD_LOOKING_{vertical_state.upper()}", "WARNING", duration=hdur,
                                            metadata={"head": pose_label, "yaw": round(yaw, 1), "pitch": round(pitch, 1), "roll": round(roll, 1)})
                        elif tilt_state:
                            hdur = T["head_dev"].update(True, now)
                            if T["head_dev"].crossed(cfg["head_deviation_seconds"]):
                                engine.emit(f"HEAD_TILT_{tilt_state.upper()}", "WARNING", duration=hdur,
                                            metadata={"head": pose_label, "yaw": round(yaw, 1), "pitch": round(pitch, 1), "roll": round(roll, 1)})
                        else:
                            T["head_dev"].update(False, now)

                    # ================= IRIS / GAZE (Separate L/R + 8-Dir with Head Pose Compensation) =================
                    eye_ok = len(fl) > 477
                    left_eye_dir, right_eye_dir = "Straight", "Straight"
                    left_eye_conf, right_eye_conf = 100.0, 100.0
                    left_arrow, right_arrow = "●", "●"
                    if eye_ok:
                        base_gh = baseline.get("gaze_h", 0.5) if baseline else 0.5
                        base_gv = baseline.get("gaze_v", 0.5) if baseline else 0.5

                        rh = eye_horizontal_ratio(fl, RIGHT_EYE_IRIS_CENTER, *RIGHT_EYE_CORNERS, img_w)
                        lh = eye_horizontal_ratio(fl, LEFT_EYE_IRIS_CENTER, *LEFT_EYE_CORNERS, img_w)
                        rv = eye_vertical_ratio(fl, RIGHT_EYE_IRIS_CENTER,
                                                RIGHT_EYE_TOP_IDX, RIGHT_EYE_BOTTOM_IDX, img_h)
                        lv = eye_vertical_ratio(fl, LEFT_EYE_IRIS_CENTER,
                                                LEFT_EYE_TOP_IDX, LEFT_EYE_BOTTOM_IDX, img_h)

                        # Individual eye direction classification with personalized baseline
                        dead_zone = cfg.get("gaze_dead_zone", 0.08)
                        right_eye_dir, right_eye_conf, right_arrow = classify_eye_8dir(rh, rv, dead_zone, dead_zone, base_gh, base_gv)
                        left_eye_dir, left_eye_conf, left_arrow = classify_eye_8dir(lh, lv, dead_zone, dead_zone, base_gh, base_gv)

                        # Combined smoothed gaze
                        combined_h = (rh + lh) / 2.0
                        combined_v = (rv + lv) / 2.0
                        combined_h = smooth_gaze(face_idx, combined_h, smoothed_gaze)
                        combined_v = smooth_gaze(face_idx, combined_v, smoothed_gaze_v)
                        current_eyes_dir, gaze_conf, gaze_arrow = classify_eye_8dir(combined_h, combined_v, dead_zone, dead_zone, base_gh, base_gv)

                        # ---- eye movement speed & distance tracking ----
                        if face_idx not in eye_motion:
                            eye_motion[face_idx] = {
                                "hhist": deque(maxlen=200),
                                "vhist": deque(maxlen=200),
                                "iris": {"r": None, "l": None},
                            }
                        em = eye_motion[face_idx]
                        eye_speed = 0.0
                        for eye_key, iris_idx in (("r", RIGHT_EYE_IRIS_CENTER),
                                                  ("l", LEFT_EYE_IRIS_CENTER)):
                            cur = _landmark_px(fl[iris_idx], img_w, img_h)
                            prev = em["iris"][eye_key]
                            if prev is not None:
                                eye_speed += np.hypot(cur[0] - prev[0], cur[1] - prev[1])
                            em["iris"][eye_key] = cur
                            # Always draw eye contours, iris center and gaze vector when enabled
                            if cfg.get("draw_eye_viz", True) or cfg["debug_mode"]:
                                draw_eye_viz(frame,
                                             RIGHT_EYE_EAR_IDX if eye_key == "r" else LEFT_EYE_EAR_IDX,
                                             iris_idx, fl, img_w, img_h, prev,
                                             label="R" if eye_key == "r" else "L",
                                             direction=right_eye_dir if eye_key == "r" else left_eye_dir,
                                             conf=right_eye_conf if eye_key == "r" else left_eye_conf,
                                             arrow=right_arrow if eye_key == "r" else left_arrow)
                        eye_speed /= 2.0  # px per frame

                        # ---- REM (rapid direction flips in window) ----
                        dh = combined_h - base_gh
                        sign = 0 if abs(dh) < dead_zone else (1 if dh > 0 else -1)
                        em["hhist"].append((now, sign))
                        window = [s for t, s in em["hhist"] if now - t <= cfg["rem_window_seconds"]]
                        flips = sum(1 for i in range(1, len(window))
                                    if window[i] != 0 and window[i - 1] != 0
                                    and window[i] != window[i - 1])
                        if flips >= cfg["rem_flip_threshold"]:
                            rdur = T["rem"].update(True, now)
                            if T["rem"].crossed(1.0):
                                engine.emit("Rapid Eye Movement", "WARNING", duration=rdur,
                                            metadata={"flips": flips})
                        else:
                            T["rem"].update(False, now)

                        # ---- eyes not visible ----
                        if avg_ear < 0.12 and not b_state["eyes_closed"]:
                            eyes_visible = False
                            edur = T["eye_not_visible"].update(True, now)
                            if T["eye_not_visible"].crossed(1.5):
                                engine.emit("EYES_NOT_RELIABLY_VISIBLE", "WARNING", duration=edur)
                        else:
                            T["eye_not_visible"].update(False, now)

                        # ── GAZE COMPENSATION WITH HEAD POSE (Section 5) ──
                        # Case A: Head straight + Eyes looking sideways/off-screen -> emit eye gaze event.
                        # Case B: Head turned + Eyes aligned with head -> head turned event accounts for it (no duplicate eye violation).
                        # Case C: Head turned + Eyes deviated strongly FURTHER -> emit eye event if persists.
                        head_aligned = (horizontal_state and current_eyes_dir in (horizontal_state, f"Up-{horizontal_state}", f"Down-{horizontal_state}"))
                        is_independent_eye_dev = (current_eyes_dir != "Straight") and (not head_aligned or abs(yaw) < 8.0)

                        if is_independent_eye_dev:
                            t_eye = gaze_trackers.setdefault(face_idx, ConditionTracker("eye_dir"))
                            edur = t_eye.update(True, now)
                            if t_eye.crossed(cfg.get("prolonged_gaze_seconds", 3.5)):
                                engine.emit("PROLONGED_OFF_SCREEN_GAZE", "WARNING", duration=edur,
                                            metadata={"gazeDirection": current_eyes_dir,
                                                      "leftEyeDirection": left_eye_dir,
                                                      "rightEyeDirection": right_eye_dir,
                                                      "gazeHorizontalRatio": round(combined_h, 3),
                                                      "gazeVerticalRatio": round(combined_v, 3),
                                                      "headYaw": round(yaw, 1),
                                                      "headPitch": round(pitch, 1),
                                                      "headRoll": round(roll, 1),
                                                      "confidence": round(gaze_conf / 100.0, 3)})
                            elif t_eye.crossed(cfg.get("eye_side_glance_seconds", 1.8)):
                                canon_eye_event = f"EYES_LOOKING_{current_eyes_dir.upper().replace('-', '_')}"
                                engine.emit(canon_eye_event, "WARNING", duration=edur,
                                            metadata={"gazeDirection": current_eyes_dir,
                                                      "leftEyeDirection": left_eye_dir,
                                                      "rightEyeDirection": right_eye_dir,
                                                      "gazeHorizontalRatio": round(combined_h, 3),
                                                      "gazeVerticalRatio": round(combined_v, 3),
                                                      "headYaw": round(yaw, 1),
                                                      "headPitch": round(pitch, 1),
                                                      "headRoll": round(roll, 1),
                                                      "confidence": round(gaze_conf / 100.0, 3)})
                        else:
                            if face_idx in gaze_trackers:
                                gaze_trackers[face_idx].update(False, now)

                        # ---- head + eye combination ----
                        combo = None
                        if current_head_h == "" and current_head_v == "" and current_eyes_dir in ("Left", "Right"):
                            combo = "Possible Side Glance"
                        elif current_head_v == "Down" and current_eyes_dir == "Down":
                            combo = "Possible Desk Look"
                        elif (current_head_h in ("Left", "Right") and
                              current_eyes_dir in ("Left", "Right") and
                              current_head_h != current_eyes_dir):
                            combo = "Unusual Eye/Head Movement"

                        if combo == "Possible Desk Look":
                            t = desk_trackers.setdefault(face_idx, ConditionTracker("desk"))
                            cdt = t.update(True, now)
                            if t.crossed(cfg.get("prolonged_gaze_seconds", 3.5)):
                                engine.emit("Possible Desk / Notes Look", "WARNING", duration=cdt,
                                            metadata={"gaze_direction": current_eyes_dir, "head": "Down"})
                        else:
                            for tk in desk_trackers.values():
                                tk.update(False, now)

                        if combo == "Unusual Eye/Head Movement":
                            t = unusual_trackers.setdefault(face_idx, ConditionTracker("unusual"))
                            cdt = t.update(True, now)
                            if t.crossed(1.8):
                                engine.emit("Unusual Eye/Head Movement", "WARNING", duration=cdt,
                                            metadata={"gaze_direction": current_eyes_dir, "head": current_head_h})
                        else:
                            for tk in unusual_trackers.values():
                                tk.update(False, now)

                        # off-screen glance anomaly (head straight + eyes confident)
                        if cfg["debug_mode"]:
                            pass

                    else:
                        eyes_visible = False
                        T["eye_not_visible"].update(True, now)

                    # ================= OVERLAY (per face) =================
                    fxs = [lm.x * img_w for lm in fl]
                    fys = [lm.y * img_h for lm in fl]
                    f_min_x, f_max_x = int(min(fxs)), int(max(fxs))
                    f_min_y, f_max_y = int(min(fys)), int(max(fys))
                    f_w = f_max_x - f_min_x
                    f_h = f_max_y - f_min_y

                    # Draw Face Bounding Box & Face Detected badge
                    pad_x, pad_y = int(f_w * 0.15), int(f_h * 0.15)
                    box_x1 = max(0, f_min_x - pad_x)
                    box_y1 = max(0, f_min_y - pad_y)
                    box_x2 = min(img_w, f_max_x + pad_x)
                    box_y2 = min(img_h, f_max_y + pad_y)
                    cv2.rectangle(frame, (box_x1, box_y1), (box_x2, box_y2), (0, 200, 100), 2)

                    # Face Detected pill
                    badge_x = min(img_w - 150, box_x2 - 30)
                    badge_y = max(20, box_y1 - 10)
                    cv2.circle(frame, (badge_x + 8, badge_y - 4), 6, (0, 200, 100), -1)
                    cv2.putText(frame, "Face Detected", (badge_x + 18, badge_y - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 220, 100), 1)
                    cv2.putText(frame, "0.92", (badge_x + 18, badge_y + 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 220, 100), 1)

                    # Eye Gaze vector line
                    if eye_ok and len(fl) > 477:
                        r_iris = _landmark_px(fl[RIGHT_EYE_IRIS_CENTER], img_w, img_h)
                        l_iris = _landmark_px(fl[LEFT_EYE_IRIS_CENTER], img_w, img_h)
                        cv2.line(frame, (r_iris[0] - 15, r_iris[1]), (l_iris[0] + 15, l_iris[1]), (255, 0, 255), 2)
                        cv2.circle(frame, r_iris, 3, (255, 255, 255), -1)
                        cv2.circle(frame, l_iris, 3, (255, 255, 255), -1)
                        cv2.circle(frame, r_iris, 7, (255, 0, 255), 1)
                        cv2.circle(frame, l_iris, 7, (255, 0, 255), 1)

                    if cfg["draw_mesh"]:
                        draw_face_mesh_contours(frame, fl,
                                                vision.FaceLandmarksConnections.FACE_LANDMARKS_CONTOURS,
                                                color=(220, 220, 220), thickness=1)

                    # On-face 3D Head Pose Axes & Live Telemetry Overlay
                    if (cfg.get("draw_head_axes", True) or cfg["debug_mode"]) and success_pnp:
                        cam = np.array([[img_w, 0, img_w / 2],
                                        [0, img_w, img_h / 2],
                                        [0, 0, 1]], dtype=np.float32)
                        axis = np.array([(120, 0, 0), (0, 120, 0), (0, 0, 120)], dtype=np.float32)
                        a2d, _ = cv2.projectPoints(axis, rvec, tvec, cam, np.zeros((4, 1), dtype=np.float32))
                        pn = (int(image_points[0][0]), int(image_points[0][1]))
                        colors = [(0, 0, 255), (0, 255, 0), (255, 0, 0)]  # X=Red, Y=Green, Z=Blue
                        for i, c in enumerate(colors):
                            cv2.line(frame, pn, (int(a2d[i][0][0]), int(a2d[i][0][1])), c, 2)

                    if cfg.get("draw_on_face_metrics", True) or cfg["debug_mode"]:
                        # 1. Gaze State & Head Pose badge neatly above face box
                        gaze_col = (0, 255, 0) if current_eyes_dir == "Straight" else (0, 165, 255)
                        pose_col = (0, 255, 0) if pose_label == "Straight" else (0, 215, 255)
                        
                        top_badge_y = max(24, box_y1 - 10)
                        draw_text(frame, f"Gaze: {current_eyes_dir} ({gaze_conf:.0f}%) | {pose_label} (Y:{yaw:+.1f})",
                                  (box_x1, top_badge_y), gaze_col if current_eyes_dir != "Straight" else pose_col, 0.45, 1, bg=True)
                        
                        # 2. EAR & MAR Readouts neatly below face box
                        ear_col = (0, 0, 255) if b_state["eyes_closed"] else (0, 255, 0)
                        mar_col = (0, 165, 255) if m_state["mouth_open"] else (0, 255, 0)
                        bot_badge_y = min(img_h - 15, box_y2 + 18)
                        draw_text(frame, f"EAR: {avg_ear:.2f} | Blinks: {b_state['blink_count']} | MAR: {mar:.2f} ({'Open' if m_state['mouth_open'] else 'Closed'})",
                                  (box_x1, bot_badge_y), ear_col if b_state["eyes_closed"] else mar_col, 0.42, 1, bg=True)

                        # Anomaly banner above if glancing away with head straight
                        if combo == "Possible Side Glance":
                            draw_text(frame, "ANOMALY: EYES OFF-SCREEN", (box_x1, max(15, box_y1 - 32)), (0, 0, 255), 0.52, 2, bg=True)

            # ==================================================================
            # OBJECT DETECTION (optional, every N frames)
            # ==================================================================
            last_obj_phone_detected = False
            if object_detector is not None and pose_frame_counter % cfg["frame_skip_object"] == 0:
                dets = object_detector.detect(frame)
                obj_found = len(dets) > 0
                if obj_found:
                    for (x1, y1, x2, y2, name, conf) in dets:
                        if "phone" in name.lower():
                            last_obj_phone_detected = True
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 165, 255), 2)
                        draw_text(frame, f"{name.upper()} {conf:.0%}", (x1, y1 - 6),
                                  (0, 165, 255), 0.5, 1, bg=True)
                    odur = T["object_visible"].update(True, now)
                    if T["object_visible"].crossed(cfg["object_detection"]["persistence_seconds"]):
                        names = sorted({n for (_, _, _, _, n, _) in dets})
                        has_phone = any("phone" in n.lower() for n in names)
                        if has_phone:
                            phone_conf = max(c for (_, _, _, _, n, c) in dets if "phone" in n.lower())
                            engine.emit("Cell Phone Detected", "HIGH",
                                        confidence=phone_conf,
                                        duration=odur, metadata={"objects": names, "violation": "UNAUTHORIZED_MOBILE_PHONE"})
                        else:
                            engine.emit(f"Possible {names[0].title()} Detected", "WARNING",
                                        confidence=max(c for (_, _, _, _, _, c) in dets),
                                        duration=odur, metadata={"objects": names})
                else:
                    T["object_visible"].update(False, now)

            # ==================================================================
            # BROWSER EVENTS (external agent ingestion)
            # ==================================================================
            browser_mon.poll(engine)

            # ==================================================================
            # CENTER VERTICAL DASHED LINE
            # ==================================================================
            draw_dashed_line(frame, (img_w // 2, 20), (img_w // 2, img_h - 40),
                             (160, 160, 160), thickness=1, dash_len=8, gap_len=6)

            # ==================================================================
            # BODY FRAMING OVERLAYS (Pose Landmarks, Lines & Regions)
            # ==================================================================
            if body:
                # Torso boundary polygon / bounding trapezoid
                if "torso_poly" in body and body["torso_poly"] is not None:
                    cv2.polylines(frame, [body["torso_poly"]], isClosed=True,
                                  color=(0, 220, 100), thickness=2)

                # Pose skeleton landmarks
                if body["shoulder_l"] and body["shoulder_r"]:
                    # Cyan/blue upper arm connections if elbows visible
                    if body.get("elbow_l"):
                        cv2.line(frame, body["shoulder_l"], body["elbow_l"], (220, 180, 0), 2)
                        cv2.circle(frame, body["elbow_l"], 4, (120, 255, 120), -1)
                    if body.get("elbow_r"):
                        cv2.line(frame, body["shoulder_r"], body["elbow_r"], (220, 180, 0), 2)
                        cv2.circle(frame, body["elbow_r"], 4, (120, 255, 120), -1)

                    # Shoulder connection
                    cv2.line(frame, body["shoulder_l"], body["shoulder_r"], (220, 100, 0), 3)
                    cv2.circle(frame, body["shoulder_l"], 5, (0, 180, 255), -1)
                    cv2.circle(frame, body["shoulder_r"], 5, (0, 180, 255), -1)

                    # Shoulder Line (yellow dashed)
                    sh_y = int(body["shoulder_center"][1])
                    draw_dashed_line(frame, (20, sh_y), (img_w - 20, sh_y), (0, 215, 255),
                                     thickness=2, dash_len=10, gap_len=6)
                    cv2.putText(frame, "SHOULDER LINE", (30, sh_y - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 215, 255), 1)

                # Spine / Body center line
                sc_pt = (int(body["shoulder_center"][0]), int(body["shoulder_center"][1]))
                chest_pt = (int(body["shoulder_center"][0]), min(img_h - 10, int(body["chest_y"])))
                cv2.line(frame, sc_pt, chest_pt, (0, 220, 80), 2)
                cv2.circle(frame, sc_pt, 5, (0, 255, 120), -1)
                mid_spine = (int(body["shoulder_center"][0]), int(body["shoulder_center"][1] + (body["chest_y"] - body["shoulder_center"][1]) * 0.5))
                cv2.circle(frame, mid_spine, 4, (0, 255, 120), -1)
                cv2.putText(frame, "Body Center", (mid_spine[0] + 8, mid_spine[1] - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 220, 100), 1)
                cv2.putText(frame, "0.89", (mid_spine[0] + 8, mid_spine[1] + 12),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 220, 100), 1)

            # Framing guidance banner at top
            if guidance_warning and face_count > 0:
                draw_text(frame, f"WARNING: {guidance_warning}", (img_w // 2 - 180, 36),
                          (0, 140, 255), 0.55, 2, bg=True)

            # ==================================================================
            # RISK ENGINE (continuous decay)
            # ==================================================================
            engine._tick_risk(now)
            risk_level = engine.risk_level()
            status_color = (0, 200, 0)
            if engine.risk >= 50:
                status_color = (0, 0, 255)
            elif engine.risk >= 25:
                status_color = (0, 140, 255)

            # ==================================================================
            # LEFT MONITORING PANEL
            # ==================================================================
            draw_glass_card(frame, 14, 14, 215, 335)
            live_dot = (0, 200, 0) if camera_status == "GOOD" else (0, 0, 255)
            cv2.circle(frame, (28, 36), 6, live_dot, -1)
            cv2.putText(frame, f"{cfg['participant_name']}   LIVE",
                        (40, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

            # Accurate diagnostic state (Sections 1, 18, 22, 26)
            if face_count == 0 or face_is_stale:
                f_val, f_col = ("Absent" if T["face_absent"].last_dur >= cfg["face_warn_seconds"] else "Not Detected"), (0, 0, 255)
                e_val, e_col = "Unknown", (0, 165, 255)
                p_val, p_col = "Unknown", (0, 165, 255)
            elif face_count == 1:
                f_val, f_col = "OK", (0, 200, 0)
                e_val, e_col = ("OK" if eyes_visible else "Not Visible"), ((0, 200, 0) if eyes_visible else (0, 165, 255))
                p_val, p_col = center_label, ((0, 200, 0) if center_label == "CENTERED" else (0, 165, 255))
            else:
                f_val, f_col = f"Multiple ({face_count})", (0, 0, 255)
                e_val, e_col = ("OK" if eyes_visible else "Not Visible"), ((0, 200, 0) if eyes_visible else (0, 165, 255))
                p_val, p_col = center_label, ((0, 200, 0) if center_label == "CENTERED" else (0, 165, 255))

            left_rows = [
                ("Face", f_val, f_col),
                ("Eyes", e_val, e_col),
                ("Body", "OK" if body_status == "Visible" else body_status,
                 (0, 200, 0) if body_status == "Visible" else (0, 0, 255) if body_status == "Not Detected" else (0, 165, 255)),
                ("Position", p_val, p_col),
                ("Multiple People", "No" if face_count <= 1 else f"Yes ({face_count})",
                 (0, 200, 0) if face_count <= 1 else (0, 0, 255)),
                ("Phone Detected", "Yes" if last_obj_phone_detected else "No",
                 (0, 0, 255) if last_obj_phone_detected else (0, 200, 0)),
                ("Browser", "Active" if browser_mon.enabled() else "Not Connected",
                 (0, 200, 0) if browser_mon.enabled() else (160, 160, 160)),
                ("Camera", "Good" if camera_status == "GOOD" else camera_status.title(),
                 (0, 200, 0) if camera_status == "GOOD" else (0, 0, 255)),
                ("Lighting", "Good" if light == "GOOD" else light.title(),
                 (0, 200, 0) if light == "GOOD" else (0, 165, 255)),
            ]
            ly = 68
            for label, value, color in left_rows:
                cv2.putText(frame, label, (24, ly), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (190, 190, 190), 1)
                cv2.putText(frame, value, (132, ly), cv2.FONT_HERSHEY_SIMPLEX, 0.40, color, 1)
                ly += 21

            cv2.line(frame, (22, 266), (218, 266), (45, 45, 55), 1)
            cv2.putText(frame, "Monitoring Risk", (24, 286), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1)
            cv2.putText(frame, f"{risk_level} ({int(engine.risk)}/100)",
                        (24, 314), cv2.FONT_HERSHEY_SIMPLEX, 0.65, status_color, 2)

            # ==================================================================
            # RIGHT TOP PANEL (Head Pose & Metrics)
            # ==================================================================
            r_w, r_x = 200, img_w - 214
            draw_glass_card(frame, r_x, 14, r_w, 204)
            cv2.putText(frame, "Head Pose", (r_x + 14, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (220, 220, 220), 1)
            cv2.putText(frame, f"Pitch:   {pitch:+.1f} deg", (r_x + 22, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (190, 190, 190), 1)
            cv2.putText(frame, f"Yaw:     {yaw:+.1f} deg", (r_x + 22, 78), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (190, 190, 190), 1)
            cv2.putText(frame, f"Roll:     {roll:+.1f} deg", (r_x + 22, 96), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (190, 190, 190), 1)

            cv2.putText(frame, "Gaze", (r_x + 14, 126), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (190, 190, 190), 1)
            cv2.putText(frame, current_eyes_dir, (r_x + 100, 126), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                        (0, 200, 0) if current_eyes_dir == "Straight" else (0, 165, 255), 1)

            blinks_per_min = len([t for t in blink_times if now - t <= 60.0])
            cv2.putText(frame, "Blink Rate", (r_x + 14, 154), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (190, 190, 190), 1)
            cv2.putText(frame, f"{blinks_per_min}/min", (r_x + 100, 154), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 0), 1)

            cv2.putText(frame, "Mouth", (r_x + 14, 182), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (190, 190, 190), 1)
            cv2.putText(frame, "Open" if mouth_open_any else "Closed", (r_x + 100, 182), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                        (0, 200, 0) if not mouth_open_any else (0, 165, 255), 1)

            # ==================================================================
            # RIGHT MIDDLE PANEL (Events)
            # ==================================================================
            draw_glass_card(frame, r_x, 226, r_w, 180)
            cv2.putText(frame, "Events", (r_x + 14, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (220, 220, 220), 1)
            recent_events = engine.timeline[-5:]
            ey = 276
            for ev in recent_events:
                sev_color = {"INFO": (0, 220, 100), "WARNING": (0, 215, 255),
                             "HIGH": (0, 0, 255)}.get(ev["severity"], (255, 255, 255))
                ts = ev["timestamp"][11:19]
                cv2.putText(frame, ts, (r_x + 12, ey), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (0, 215, 255), 1)
                # Short event label
                ev_label = ev["eventType"]
                if len(ev_label) > 17:
                    ev_label = ev_label[:15] + ".."
                cv2.putText(frame, ev_label, (r_x + 72, ey), cv2.FONT_HERSHEY_SIMPLEX, 0.36, sev_color, 1)
                ey += 20

            # ==================================================================
            # RIGHT BOTTOM PANEL (Legend)
            # ==================================================================
            leg_y = img_h - 160
            draw_glass_card(frame, r_x, leg_y, r_w, 122)
            cv2.putText(frame, "Legend", (r_x + 14, leg_y + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (220, 220, 220), 1)

            cv2.circle(frame, (r_x + 22, leg_y + 44), 3, (255, 255, 255), -1)
            cv2.putText(frame, "Face Landmarks", (r_x + 36, leg_y + 48), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (190, 190, 190), 1)

            cv2.line(frame, (r_x + 16, leg_y + 64), (r_x + 28, leg_y + 64), (255, 0, 255), 2)
            cv2.circle(frame, (r_x + 22, leg_y + 64), 3, (255, 0, 255), -1)
            cv2.putText(frame, "Eye Gaze", (r_x + 36, leg_y + 68), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (190, 190, 190), 1)

            cv2.line(frame, (r_x + 16, leg_y + 84), (r_x + 28, leg_y + 84), (0, 200, 100), 2)
            cv2.circle(frame, (r_x + 22, leg_y + 84), 3, (0, 200, 100), -1)
            cv2.putText(frame, "Pose Landmarks", (r_x + 36, leg_y + 88), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (190, 190, 190), 1)

            draw_dashed_line(frame, (r_x + 16, leg_y + 104), (r_x + 28, leg_y + 104), (0, 215, 255), 1, 4, 3)
            cv2.putText(frame, "Shoulder Line", (r_x + 36, leg_y + 108), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (190, 190, 190), 1)

            # ==================================================================
            # BOTTOM STATUS BAR
            # ==================================================================
            bar_y = img_h - 28
            cv2.rectangle(frame, (0, bar_y), (img_w, img_h), (12, 12, 16), -1)

            # FPS calculation
            fps_history.append(now)
            if len(fps_history) > 1:
                fps = (len(fps_history) - 1) / max(fps_history[-1] - fps_history[0], 1e-4)
            else:
                fps = 30.0

            cv2.putText(frame, "Status: ", (14, bar_y + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (160, 160, 160), 1)
            cv2.putText(frame, "Monitoring", (62, bar_y + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 200, 0), 1)

            center_text = f"Resolution: {img_w} x {img_h}   FPS: {fps:.1f}"
            (tw, _), _ = cv2.getTextSize(center_text, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
            cv2.putText(frame, center_text, ((img_w - tw) // 2, bar_y + 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (170, 170, 170), 1)

            cv2.putText(frame, "Recording: ", (img_w - 140, bar_y + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (160, 160, 160), 1)
            cv2.putText(frame, "OFF", (img_w - 60, bar_y + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 255), 1)

            # ==================================================================
            # FACE-LEVEL QUICK STATUS (absence tiers)
            # ==================================================================
            if face_count == 0:
                fd = T["face_absent"].update(True, now)
                if fd < cfg["face_temp_lost_seconds"]:
                    draw_text(frame, "Face temporarily lost", (img_w // 2 - 110, 36),
                              (0, 215, 255), 0.55, 2, bg=True)
                elif fd < cfg["face_high_seconds"]:
                    draw_text(frame, "WARNING: Face not detected", (img_w // 2 - 140, 36),
                              (0, 140, 255), 0.55, 2, bg=True)
                else:
                    draw_text(frame, "ALERT: Participant face absent", (img_w // 2 - 160, 36),
                              (0, 0, 255), 0.60, 2, bg=True)
            elif face_count > 1:
                draw_text(frame, f"ALERT: MULTIPLE FACES ({face_count})", (img_w // 2 - 140, 36),
                          (0, 0, 255), 0.60, 2, bg=True)

            # debug header
            if cfg["debug_mode"]:
                cv2.putText(frame, "DEBUG MODE", (14, img_h - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 165, 255), 1)

            # ==================================================================
            # DISPLAY + KEYS
            # ==================================================================
            if not cfg.get("headless", False):
                cv2.imshow('LMS Proctoring Monitor', frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('d'):
                    cfg["debug_mode"] = not cfg["debug_mode"]
                    print("[INFO] Debug mode:", "ON" if cfg["debug_mode"] else "OFF")
                elif key == ord('r'):
                    engine.emit("Recalibration Started", "INFO", risk_weight=0)
                    baseline = run_calibration(cap, face_lm, pose_lm, cfg, shared, frame_timestamp_ms)
                    if baseline is None:
                        break
                    active_ear_threshold = baseline.get("ear_threshold") or cfg["ear_threshold"]
                    engine.emit("Recalibration Complete", "INFO", risk_weight=0)
            else:
                time.sleep(0.01)

    cap.release()
    if not cfg.get("headless", False):
        cv2.destroyAllWindows()
    engine.stop()

    phone_events = [e for e in engine.timeline if e.get("eventType") == "CELL_PHONE_DETECTED"]
    session_report = {
        "sessionId": cfg.get("session_id", "LMS-SESSION"),
        "attemptId": cfg.get("attempt_id") or 0,
        "participant": cfg.get("participant_name", "Participant"),
        "totalEvents": len(engine.timeline),
        "finalRiskScore": round(engine.risk, 1),
        "finalRiskLevel": engine.risk_level(),
        "mobilePhoneDetected": len(phone_events) > 0,
        "phoneEventsCount": len(phone_events),
        "phoneEventDetails": phone_events,
        "generatedAt": datetime.datetime.now().isoformat()
    }
    report_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "session_proctoring_report.json")
    try:
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(session_report, f, indent=2)
        print(f"[REPORT] Final Proctoring Summary Report saved to {report_path}")
        if session_report["mobilePhoneDetected"]:
            print(f"[ALERT] *** UNAUTHORIZED MOBILE PHONE WAS DETECTED ({len(phone_events)} times) AND RECORDED IN RESULT REPORT ***")
    except Exception as e:
        print(f"[WARN] Could not save summary report: {e}")

    print("[INFO] Session ended. Events logged to",
          cfg["event_log_path"] if cfg["log_events_to_file"] else "(disabled)")


if __name__ == "__main__":
    main()