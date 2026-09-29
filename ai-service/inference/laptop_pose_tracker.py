"""MediaPipe corroboration for the guided room sweep's laptop camera."""

import base64
import threading
import time

import cv2
import numpy as np


class LaptopPoseTracker:
    def __init__(self):
        self.landmarker = None
        self.hand_landmarker = None
        self.retry_at = 0.0
        self._lock = threading.Lock()

    def _detect_poses(self, frames):
        import mediapipe as mp
        found = []
        with self._lock:
            if self.landmarker is None:
                self.landmarker = mp.solutions.pose.Pose(
                    static_image_mode=True, model_complexity=0,
                    min_detection_confidence=0.5)
            for frame in frames:
                result = self.landmarker.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                if result.pose_landmarks:
                    found.append([(point.x, point.y, point.visibility)
                                  for point in result.pose_landmarks.landmark])
        return found

    def _detect_hand_tracks(self, frames):
        """Track MediaPipe hand centers by handedness across webcam samples."""
        import mediapipe as mp
        tracks = {}
        with self._lock:
            if self.hand_landmarker is None:
                self.hand_landmarker = mp.solutions.hands.Hands(
                    static_image_mode=True, max_num_hands=2,
                    min_detection_confidence=0.45)
            for frame_index, frame in enumerate(frames):
                result = self.hand_landmarker.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                for hand_index, landmarks in enumerate(result.multi_hand_landmarks or []):
                    handedness = (result.multi_handedness or [])
                    label = (handedness[hand_index].classification[0].label
                             if hand_index < len(handedness) else f"hand_{hand_index}")
                    points = landmarks.landmark
                    center_x = sum(points[index].x for index in (0, 5, 17)) / 3.0
                    center_y = sum(points[index].y for index in (0, 5, 17)) / 3.0
                    tracks.setdefault(label, []).append((frame_index, center_x, center_y))
        return tracks

    @staticmethod
    def _track_motion(tracks):
        best_travel = 0.0
        best_direction = None
        for positions in tracks.values():
            if len(positions) < 2 or positions[-1][0] == positions[0][0]:
                continue
            xs = [point[1] for point in positions]
            ys = [point[2] for point in positions]
            travel = float(np.hypot(max(xs) - min(xs), max(ys) - min(ys)))
            if travel > best_travel:
                best_travel = travel
                dx = positions[-1][1] - positions[0][1]
                best_direction = "RIGHT" if dx > 0.025 else "LEFT" if dx < -0.025 else "VERTICAL"
        return best_travel, best_direction

    def evaluate_motion(self, frames):
        if time.monotonic() < self.retry_at:
            return {"available": False, "moved": False, "score": 0.0,
                    "participantDetected": None, "multiplePersonsDetected": False,
                    "personCount": 0, "mode": "pose_unavailable"}
        images = []
        for encoded in (frames or [])[:6]:
            try:
                raw = base64.b64decode(str(encoded).split(',', 1)[-1], validate=True)
                image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
                if image is not None:
                    images.append(cv2.resize(image, (320, 240)))
            except (ValueError, TypeError):
                continue
        if len(images) < 3:
            return {"available": False, "moved": False, "score": 0.0,
                    "participantDetected": None, "multiplePersonsDetected": False,
                    "personCount": 0, "mode": "pose_missing_frames"}
        try:
            poses = self._detect_poses(images)
        except Exception:
            poses = None
        try:
            hand_tracks = self._detect_hand_tracks(images)
        except Exception:
            hand_tracks = None
        if poses is None and hand_tracks is None:
            return {"available": False, "moved": False, "score": 0.0,
                    "participantDetected": None, "multiplePersonsDetected": False,
                    "personCount": 0, "mode": "pose_unavailable"}
        if not poses and not hand_tracks:
            return {"available": True, "moved": False, "score": 0.0,
                    "participantDetected": False, "multiplePersonsDetected": False,
                    "personCount": 0, "mode": "pose_no_participant"}
        # Compare each wrist with the same shoulder across frames. A raised
        # phone arm often moves vertically while its horizontal position stays
        # nearly fixed, so both axes matter. Hands landmarks corroborate a
        # wrist that the body-pose model missed or temporarily occluded.
        pose_tracks = {15: [], 16: []}
        for frame_index, pose in enumerate(poses or []):
            if len(pose) < 17:
                continue
            shoulders = [pose[11], pose[12]]
            wrists = [pose[15], pose[16]]
            visible_shoulders = [point for point in shoulders if point[2] >= 0.35]
            if not visible_shoulders:
                continue
            center_x = sum(point[0] for point in visible_shoulders) / len(visible_shoulders)
            center_y = sum(point[1] for point in visible_shoulders) / len(visible_shoulders)
            for side, wrist in zip((15, 16), wrists):
                if wrist[2] >= 0.35:
                    pose_tracks[side].append((frame_index, wrist[0] - center_x, wrist[1] - center_y))
        pose_travel, pose_direction = self._track_motion(pose_tracks)
        hand_travel, hand_direction = self._track_motion(hand_tracks or {})
        travel = max(pose_travel, hand_travel)
        moved = travel >= 0.06
        # MediaPipe Pose exposes one person per frame. A list of poses here
        # represents successive frames; the webcam object detector checks for
        # multiple simultaneous people in the scan.
        return {"available": True, "moved": bool(moved), "score": round(travel, 4),
                "participantDetected": True if poses else None,
                "multiplePersonsDetected": False, "personCount": 1 if poses else 0,
                "mode": "pose" if poses else "hand", "pose_detected": bool(poses),
                "handDetected": bool(hand_tracks),
                "motionSource": "mediapipe_pose" if pose_travel >= hand_travel else "mediapipe_hands",
                "armDirection": (pose_direction if pose_travel >= hand_travel else hand_direction) if moved else None}


laptop_pose_tracker = LaptopPoseTracker()
