"""
AI-guided room scanner for the Hire verification flow
======================================================
Heuristic room-capture engine used by the 5-step room verification and the
continuous 360-degree room scan on the candidate's phone camera.

It deliberately does NOT declare anyone "cheating". It only:
  * validates whether a single captured view is a usable room view for a given
    step (front / left / right / bottom / desk),
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
import math
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("ai-service.room-scanner")

# Canonical guided steps per the Hire room-scan spec:
# FRONT, LEFT, RIGHT, BOTTOM (lower area / floor), DESK.
# The former UP (ceiling / upper area) step was removed from the flow.
# Legacy sessions stored `back` (the old turn-around view) and `floor`;
# the backend decodes the `floor` key so completed old records stay complete.
CAPTURE_STEPS: Tuple[str, ...] = ("front", "left", "right", "bottom", "desk")

DEFAULT_STEP_THRESHOLD = 0.45
DEFAULT_360_TARGET_SWEEP = 380.0  # a little more than one revolution
DEFAULT_MAX_FRAMES = 48  # bound the number of sampled 360 frames per session

# Cross-step uniqueness thresholds. These are intentionally configurable for
# camera fleets with different compression/noise characteristics. A view is
# considered too similar when either its 64-bit pHash distance or normalized
# equalized thumbnail difference remains below these conservative limits.
SIMILAR_PHASH_MAX_DISTANCE = int(os.getenv("ROOM_SIMILAR_PHASH_MAX_DISTANCE", "12"))
SIMILAR_DESCRIPTOR_MAX_DIFF = float(os.getenv("ROOM_SIMILAR_DESCRIPTOR_MAX_DIFF", "0.052"))
SIMILAR_ORB_MIN_MATCHES = int(os.getenv("ROOM_SIMILAR_ORB_MIN_MATCHES", "28"))
SIMILAR_ORB_MATCH_RATIO = float(os.getenv("ROOM_SIMILAR_ORB_MATCH_RATIO", "0.12"))
NEW_VIEW_PHASH_MIN_DISTANCE = int(os.getenv("ROOM_NEW_VIEW_PHASH_MIN_DISTANCE", "24"))
NEW_VIEW_DESCRIPTOR_MIN_DIFF = float(os.getenv("ROOM_NEW_VIEW_DESCRIPTOR_MIN_DIFF", "0.12"))
MIN_DIRECTION_DELTA_DEGREES = float(os.getenv("ROOM_MIN_DIRECTION_DELTA_DEGREES", "28"))
MIN_PITCH_DELTA_DEGREES = float(os.getenv("ROOM_MIN_PITCH_DELTA_DEGREES", "25"))
DEFAULT_DUPLICATE_SIMILARITY = 0.60
REFERENCE_MATCH_THRESHOLD = float(os.getenv("ROOM_REFERENCE_SIMILARITY_THRESHOLD", "0.50"))
DEFAULT_REFERENCE_SIMILARITY = REFERENCE_MATCH_THRESHOLD
YOLO_CONFIDENCE_THRESHOLD = float(os.getenv("ROOM_YOLO_CONFIDENCE_THRESHOLD", "0.35"))

# ── Room photo QUALITY gate ────────────────────────────────────────────────
# The purpose of a room photo is to evidence the candidate's surroundings, NOT
# to identify furniture. So the gate below is deliberately asymmetric: it hard
# fails only on images that carry no usable visual information, and every other
# signal merely contributes to a 0..100 quality score.
#
# The previous implementation used a single ABSOLUTE Laplacian-variance cut
# (`blurredHard = laplacian_var < 28`) computed on a 480-px-long-edge downscale.
# Laplacian variance scales with resolution, local contrast and scene texture,
# so that single threshold rejected perfectly sharp, perfectly readable photos of
# plain walls, empty rooms, doors and floors -- then told the candidate to
# "hold the phone steady", which was never the real cause.
#
# Every threshold below is therefore either normalised (resolution/contrast
# independent) or confirmed by two independent signals.
MIN_IMAGE_WIDTH = int(os.getenv("ROOM_MIN_IMAGE_WIDTH", "320"))
MIN_IMAGE_HEIGHT = int(os.getenv("ROOM_MIN_IMAGE_HEIGHT", "240"))
MIN_IMAGE_PIXELS = int(os.getenv("ROOM_MIN_IMAGE_PIXELS", "120000"))  # ~346x346

# "Completely dark" / "completely blank" floors. A dim or flat room is still a
# valid room; only a frame with no recoverable signal at all is rejected.
DARK_BRIGHTNESS_FLOOR = float(os.getenv("ROOM_DARK_BRIGHTNESS_FLOOR", "22"))
BLOWN_OUT_BRIGHTNESS_CEILING = float(os.getenv("ROOM_BLOWN_OUT_BRIGHTNESS_CEILING", "250"))
BLANK_CONTRAST_FLOOR = float(os.getenv("ROOM_BLANK_CONTRAST_FLOOR", "2.0"))
BLANK_EDGE_FLOOR = float(os.getenv("ROOM_BLANK_EDGE_FLOOR", "0.0015"))

# Blur detection. `laplacianVar` is kept for logging/back-compat, but the verdict
# needs BOTH a normalised Laplacian score AND an independent Tenengrad (Sobel
# gradient-energy) score to be weak, so a single weak metric can never fail a
# photo. Both are computed on a fixed working size and normalised by the frame's
# own contrast, which removes the resolution/contrast dependence.
BLUR_WORKING_SIZE = int(os.getenv("ROOM_BLUR_WORKING_SIZE", "480"))
SHARP_LAPLACIAN_FLOOR = float(os.getenv("ROOM_SHARP_LAPLACIAN_FLOOR", "18.0"))
SOFT_LAPLACIAN_FLOOR = float(os.getenv("ROOM_SOFT_LAPLACIAN_FLOOR", "45.0"))
RELATIVE_SHARPNESS_FLOOR = float(os.getenv("ROOM_RELATIVE_SHARPNESS_FLOOR", "0.030"))
TENENGRAD_FLOOR = float(os.getenv("ROOM_TENENGRAD_FLOOR", "2.0"))
SOFT_TENENGRAD_FLOOR = float(os.getenv("ROOM_SOFT_TENENGRAD_FLOOR", "6.0"))
# Third independent signal: how much true fine detail survives at all. A frame
# crushed by motion blur keeps its colour gradients (so Tenengrad still fires)
# but loses essentially all high-frequency content.
MIN_FINE_DETAIL_RATIO = float(os.getenv("ROOM_MIN_FINE_DETAIL_RATIO", "0.022"))
# A frame is only "hard blurred" when at least this many of the four independent
# sharpness signals are simultaneously weak. Never 1 -- that single-signal rule
# is what produced the false rejections.
BLUR_SIGNALS_REQUIRED = int(os.getenv("ROOM_BLUR_SIGNALS_REQUIRED", "3"))
SOFT_BLUR_SIGNALS_REQUIRED = int(os.getenv("ROOM_SOFT_BLUR_SIGNALS_REQUIRED", "3"))

# Corrupt / unreadable texture (e.g. pure sensor noise). Kept, but raised from
# the old 0.78 and cross-checked against entropy so a legitimate low-light room
# with visible sensor noise is not mistaken for corruption.
NOISE_RATIO_CEILING = float(os.getenv("ROOM_NOISE_RATIO_CEILING", "0.85"))
LOW_INFORMATION_ENTROPY = float(os.getenv("ROOM_LOW_INFORMATION_ENTROPY", "2.2"))
# A real room keeps spatial structure even when noisy; pure sensor noise does not.
LOW_LOCAL_STRUCTURE = float(os.getenv("ROOM_LOW_LOCAL_STRUCTURE", "0.11"))

# Quality score weights (sum == 1.0).
QUALITY_WEIGHT_BRIGHTNESS = float(os.getenv("ROOM_QUALITY_W_BRIGHTNESS", "0.20"))
QUALITY_WEIGHT_CONTRAST = float(os.getenv("ROOM_QUALITY_W_CONTRAST", "0.15"))
QUALITY_WEIGHT_SHARPNESS = float(os.getenv("ROOM_QUALITY_W_SHARPNESS", "0.30"))
QUALITY_WEIGHT_INFORMATION = float(os.getenv("ROOM_QUALITY_W_INFORMATION", "0.20"))
QUALITY_WEIGHT_RESOLUTION = float(os.getenv("ROOM_QUALITY_W_RESOLUTION", "0.15"))
QUALITY_ACCEPT_SCORE = float(os.getenv("ROOM_QUALITY_ACCEPT_SCORE", "38"))
QUALITY_IDEAL_BRIGHTNESS = float(os.getenv("ROOM_QUALITY_IDEAL_BRIGHTNESS", "128"))

ROOM_VERIFY_LOG_ENABLED = os.getenv("ROOM_VERIFY_LOG", "1") not in ("0", "false", "False")

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
    """Laplacian variance — higher means sharper.

    NOTE: this raw value is resolution-, contrast- and texture-dependent and is
    therefore NOT used on its own as a rejection threshold any more. See
    `_sharpness()` for the normalised, multi-signal metric that replaced it.
    """
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _exif_orientation(raw: bytes) -> int:
    """Read the EXIF orientation tag (1..8) from an encoded image.

    Phone cameras routinely store portrait shots as a landscape buffer plus an
    EXIF rotation. Without applying it, OpenCV analyses a sideways image, which
    skews every downstream metric and degrades YOLO. Returns 1 when the tag is
    absent or unparseable.
    """
    try:
        from PIL import Image  # imported lazily; Pillow is an existing dependency
        from io import BytesIO

        with Image.open(BytesIO(raw)) as handle:
            value = handle.getexif().get(0x0112)
        orientation = int(value) if isinstance(value, (int, float)) else 1
        return orientation if 1 <= orientation <= 8 else 1
    except Exception:
        return 1


def _apply_orientation(frame: np.ndarray, orientation: int) -> np.ndarray:
    """Apply an EXIF orientation (1..8) so the frame is upright and upright-wise."""
    if orientation == 1 or frame is None:
        return frame
    if orientation == 2:
        return cv2.flip(frame, 1)
    if orientation == 3:
        return cv2.rotate(frame, cv2.ROTATE_180)
    if orientation == 4:
        return cv2.flip(frame, 0)
    if orientation == 5:
        return cv2.rotate(cv2.flip(frame, 1), cv2.ROTATE_90_CLOCKWISE)
    if orientation == 6:
        return cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    if orientation == 7:
        return cv2.rotate(cv2.flip(frame, 1), cv2.ROTATE_90_COUNTERCLOCKWISE)
    if orientation == 8:
        return cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return frame


def _tenengrad(gray: np.ndarray) -> float:
    """Tenengrad gradient energy, normalised to a 0..1-ish scale.

    An independent sharpness signal: it measures squared Sobel magnitude rather
    than the Laplacian's second derivative, so the two disagree on motion blur
    vs. noise in useful ways. Requiring both to be weak is what stops a single
    weak metric from failing an otherwise fine photo.
    """
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    energy = float(np.mean(gx * gx + gy * gy))
    return energy / 255.0 / 255.0 * 1000.0


def _entropy(gray: np.ndarray) -> float:
    """Shannon entropy of the intensity histogram (0..8 bits)."""
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    total = float(hist.sum()) or 1.0
    probabilities = hist[hist > 0] / total
    return float(-np.sum(probabilities * np.log2(probabilities)))


def _sharpness(gray: np.ndarray, contrast: float, fine_detail: float) -> Dict[str, Any]:
    """Resolution- and contrast-independent, multi-signal sharpness verdict.

    Four independent signals must agree before a frame is called blurry:
      1. ``laplacianVar``      -- second-derivative energy (classic Laplacian).
      2. ``relativeSharpness`` -- Laplacian energy normalised by local contrast,
                                  so a dim room and a bright one compare fairly.
      3. ``tenengrad``         -- squared Sobel gradient energy.
      4. ``fineDetailRatio``   -- surviving high-frequency detail. This is the
                                  signal that catches a frame crushed by motion
                                  blur, which keeps smooth colour gradients and
                                  therefore still trips Tenengrad.

    Returns raw values for logging plus ``blurredHard`` / ``blurred`` verdicts
    that require a QUORUM of weak signals rather than any single one.
    """
    laplacian = _blur_score(gray)
    tenengrad = _tenengrad(gray)
    # Normalising by the frame's own contrast makes the score comparable across
    # a dim room and a bright one, and a low-texture wall and a busy room.
    relative = laplacian / max(1.0, contrast * contrast)
    weak = [
        laplacian < SHARP_LAPLACIAN_FLOOR,
        relative < RELATIVE_SHARPNESS_FLOOR,
        tenengrad < TENENGRAD_FLOOR,
        fine_detail < MIN_FINE_DETAIL_RATIO,
    ]
    soft_weak = [
        laplacian < SOFT_LAPLACIAN_FLOOR,
        relative < RELATIVE_SHARPNESS_FLOOR * 1.8,
        tenengrad < SOFT_TENENGRAD_FLOOR,
        fine_detail < MIN_FINE_DETAIL_RATIO * 2.2,
    ]
    blur_signals = int(sum(weak))
    soft_signals = int(sum(soft_weak))
    return {
        "laplacianVar": round(laplacian, 2),
        "tenengrad": round(tenengrad, 3),
        "relativeSharpness": round(relative, 4),
        "fineDetailRatio": round(float(fine_detail), 4),
        "blurSignals": blur_signals,
        "softBlurSignals": soft_signals,
        "blurSignalsWeak": [name for name, flag in zip(
            ("laplacian", "relativeSharpness", "tenengrad", "fineDetail"), weak) if flag],
        # Multi-signal quorum: a hard verdict needs several signals to agree.
        "blurredHard": blur_signals >= BLUR_SIGNALS_REQUIRED,
        "blurred": soft_signals >= SOFT_BLUR_SIGNALS_REQUIRED,
    }


def _information_content(gray: np.ndarray, edge_full: float) -> Dict[str, float]:
    """How much verifiable visual information the frame actually carries.

    A blank/uniform frame (lens covered, failed exposure) has almost no entropy
    and almost no edges. A plain wall, an empty room or a door frame is NOT
    blank: it has real structure, so it comfortably clears these floors.
    """
    entropy = _entropy(gray)
    # 0..1 normalised, mapped so a real scene lands well above the floor.
    score = min(1.0, entropy / 6.0) * 0.6 + min(1.0, edge_full / 0.05) * 0.4
    return {
        "entropy": round(entropy, 3),
        "informationScore": round(score, 4),
        # Only a frame with BOTH no tonal range and no structure is "blank".
        "blank": bool(entropy < LOW_INFORMATION_ENTROPY and edge_full < BLANK_EDGE_FLOOR),
    }


def _local_structure(gray: np.ndarray) -> float:
    """Coefficient of variation of the 8x8 local standard deviation.

    A real photograph is spatially organised: some tiles are walls, some are
    shadows, some are furniture, so local contrast varies across the frame.
    Pure sensor noise is spatially uniform, so its local standard deviation is
    nearly constant and this value collapses towards 0. Used as the second,
    independent signal that separates "corrupt frame" from "noisy but real room".
    """
    small = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA).astype(np.float32)
    mean = cv2.blur(small, (9, 9))
    variance = np.clip(cv2.blur(small * small, (9, 9)) - mean * mean, 0.0, None)
    local_std = np.sqrt(variance).flatten()
    average = float(local_std.mean())
    if average <= 1e-6:
        return 0.0
    return round(float(local_std.std() / average), 4)


def _resolution_score(width: int, height: int) -> float:
    """0..1 score for the captured resolution."""
    short = min(width, height)
    pixels = width * height
    short_score = min(1.0, short / float(min(MIN_IMAGE_WIDTH, MIN_IMAGE_HEIGHT)))
    pixel_score = min(1.0, pixels / float(MIN_IMAGE_PIXELS))
    return round(short_score * 0.4 + pixel_score * 0.6, 4)


def _resolution_ok(width: int, height: int) -> bool:
    return bool(width >= MIN_IMAGE_WIDTH and height >= MIN_IMAGE_HEIGHT
                and width * height >= MIN_IMAGE_PIXELS)


def _brightness_score(brightness: float) -> float:
    """0..1 exposure score; full marks across a wide, normal indoor range."""
    if brightness <= 0:
        return 0.0
    if brightness < DARK_BRIGHTNESS_FLOOR:
        return 0.0
    if brightness > BLOWN_OUT_BRIGHTNESS_CEILING:
        return 0.0
    if brightness <= DARK_BRIGHTNESS_FLOOR + 28:
        return (brightness - DARK_BRIGHTNESS_FLOOR) / 28.0
    if brightness >= BLOWN_OUT_BRIGHTNESS_CEILING - 25:
        return max(0.0, (BLOWN_OUT_BRIGHTNESS_CEILING - brightness) / 25.0)
    # Flat 1.0 plateau across the usable indoor band so ordinary indoor light
    # (dim room, lamp-lit room, daylight room) is never penalised.
    return 1.0


def _contrast_score(contrast: float) -> float:
    """0..1 tonal-range score. A flat wall has low but perfectly usable contrast."""
    if contrast <= BLANK_CONTRAST_FLOOR:
        return 0.0
    return min(1.0, max(0.0, (contrast - BLANK_CONTRAST_FLOOR) / 22.0))


def _sharpness_score(sharpness: Dict[str, Any]) -> float:
    """0..1 sharpness score combining the independent signals."""
    laplacian = min(1.0, float(sharpness["laplacianVar"]) / max(1.0, SOFT_LAPLACIAN_FLOOR * 1.6))
    relative = min(1.0, float(sharpness["relativeSharpness"]) / max(1e-6, RELATIVE_SHARPNESS_FLOOR * 3.2))
    tenengrad = min(1.0, float(sharpness["tenengrad"]) / max(1e-6, SOFT_TENENGRAD_FLOOR * 2.0))
    detail = min(1.0, float(sharpness.get("fineDetailRatio", 0.0)) / max(1e-6, MIN_FINE_DETAIL_RATIO * 4.0))
    return round(laplacian * 0.32 + relative * 0.26 + tenengrad * 0.22 + detail * 0.20, 4)


def image_quality(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """Single source of truth for "is this a usable room photo?".

    Hard-fails ONLY on frames with no usable visual information (corrupt,
    under-resolved, completely dark, completely blank, or genuinely blurred on
    several independent signals at once). Everything else is folded into a 0..100
    score. Step/direction is deliberately NOT an input here: a plain wall, an
    empty room, a door, a window, a floor or a piece of furniture are all valid
    room evidence, and object detection is never required.
    """
    brightness = float(metrics.get("brightness", 0.0))
    contrast = float(metrics.get("contrast", 0.0))
    edge_full = float(metrics.get("edgeFull", 0.0))
    noise_ratio = float(metrics.get("noiseRatio", 0.0))
    local_structure = float(metrics.get("localStructure", 1.0))
    entropy = float(metrics.get("entropy", 0.0))
    width = int(metrics.get("width", 0))
    height = int(metrics.get("height", 0))

    brightness_component = _brightness_score(brightness)
    contrast_component = _contrast_score(contrast)
    sharpness_component = _sharpness_score(metrics)
    information_component = float(metrics.get("informationScore", 0.0))
    resolution_component = _resolution_score(width, height)

    quality_score = 100.0 * (
        QUALITY_WEIGHT_BRIGHTNESS * brightness_component +
        QUALITY_WEIGHT_CONTRAST * contrast_component +
        QUALITY_WEIGHT_SHARPNESS * sharpness_component +
        QUALITY_WEIGHT_INFORMATION * information_component +
        QUALITY_WEIGHT_RESOLUTION * resolution_component
    )

    # Corruption needs two independent signals: a very high high-frequency ratio
    # AND spatially uniform local contrast. Noisy-but-real rooms keep their
    # spatial structure, so they are never mistaken for a corrupt frame.
    corrupt = bool(noise_ratio > NOISE_RATIO_CEILING or
                   (noise_ratio > NOISE_RATIO_CEILING * 0.68 and local_structure < LOW_LOCAL_STRUCTURE))

    # Ordered from most to least specific so the reported reason is the actual
    # cause rather than whichever check happened to run first.
    reason: Optional[str] = None
    guide_key = "valid_room_view"
    if not _resolution_ok(width, height):
        reason, guide_key = "resolution_too_low", "resolution_low"
    elif corrupt:
        reason, guide_key = "image_corrupt", "image_invalid"
    elif brightness < DARK_BRIGHTNESS_FLOOR and edge_full < BLANK_EDGE_FLOOR:
        reason, guide_key = "too_dark", "too_dark"
    elif brightness > BLOWN_OUT_BRIGHTNESS_CEILING:
        reason, guide_key = "overexposed", "overexposed"
    elif float(metrics.get("entropy", 8.0)) < LOW_INFORMATION_ENTROPY and contrast < BLANK_CONTRAST_FLOOR:
        reason, guide_key = "no_visual_information", "camera_blocked"
    elif metrics.get("blank"):
        reason, guide_key = "no_visual_information", "camera_blocked"
    elif metrics.get("blurredHard"):
        # Multi-signal agreement only -- a single weak sharpness metric never
        # gets here, which is what fixes the false "blurred" rejection.
        reason, guide_key = "blurred", "blurred"
    elif quality_score < QUALITY_ACCEPT_SCORE:
        # Weak but not unusable: one or two soft metrics dragged the score down.
        # Report the dominant contributor instead of a generic message.
        reason, guide_key = "quality_too_low", "quality_low"

    return {
        "reason": reason,
        "guideKey": guide_key,
        "qualityScore": round(quality_score, 1),
        "brightnessScore": round(brightness_component, 4),
        "contrastScore": round(contrast_component, 4),
        "sharpnessScore": round(sharpness_component, 4),
        "sceneScore": round(information_component, 4),
        "resolutionScore": round(resolution_component, 4),
        "objectCount": 0,
    }


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


def _feature_descriptor(gray: np.ndarray) -> str:
    """Persistable ORB descriptors used to recognize cropped or tilted copies.

    Unlike a thumbnail, these local features survive modest framing, exposure,
    resize, and JPEG changes. Keypoint coordinates are deliberately omitted so
    the stored value cannot reconstruct the captured room image.
    """
    try:
        h, w = gray.shape[:2]
        scaled = cv2.resize(gray, (480, max(180, int(h * 480 / max(1, w)))), interpolation=cv2.INTER_AREA)
        orb = cv2.ORB_create(nfeatures=320, fastThreshold=12)
        _, descriptors = orb.detectAndCompute(scaled, None)
        if descriptors is None or len(descriptors) < 8:
            return ""
        return base64.b64encode(descriptors[:320].tobytes()).decode("ascii")
    except Exception:
        return ""


def _feature_match(feature_descriptor: str, previous: Dict[str, Any]) -> Tuple[int, float]:
    prior_descriptor = previous.get("featureDescriptor")
    if not feature_descriptor or not prior_descriptor:
        return 0, 0.0
    try:
        current = np.frombuffer(base64.b64decode(feature_descriptor, validate=True), dtype=np.uint8)
        prior = np.frombuffer(base64.b64decode(prior_descriptor, validate=True), dtype=np.uint8)
        if not current.size or not prior.size or current.size % 32 or prior.size % 32:
            return 0, 0.0
        current = current.reshape((-1, 32))
        prior = prior.reshape((-1, 32))
        pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(current, prior, k=2)
        good = sum(1 for pair in pairs if len(pair) == 2 and pair[0].distance < 0.75 * pair[1].distance)
        return good, float(good) / max(1, min(len(current), len(prior)))
    except (ValueError, TypeError, cv2.error):
        return 0, 0.0


def _same_scene(signature: str, descriptor: str, previous: Dict[str, Any], feature_descriptor: str = "") -> bool:
    prior_hash = previous.get("visualSignature", "")
    if _signature_distance(signature, prior_hash) <= SIMILAR_PHASH_MAX_DISTANCE:
        return True
    feature_matches, feature_ratio = _feature_match(feature_descriptor, previous)
    if feature_matches >= SIMILAR_ORB_MIN_MATCHES and feature_ratio >= SIMILAR_ORB_MATCH_RATIO:
        return True
    prior_descriptor = previous.get("sceneDescriptor")
    if not prior_descriptor:
        return False
    try:
        current = np.frombuffer(base64.b64decode(descriptor, validate=True), dtype=np.uint8)
        prior = np.frombuffer(base64.b64decode(prior_descriptor, validate=True), dtype=np.uint8)
        return current.size == prior.size == 576 and float(np.abs(current.astype(np.float32) - prior).mean()) / 255.0 < SIMILAR_DESCRIPTOR_MAX_DIFF
    except (ValueError, TypeError):
        return False


def _composite_similarity(gray, signature, descriptor, feature_descriptor, previous, last_gray=None):
    """Bundle perceptual hash, descriptor and optical motion signals for the
    "meaningful new view" checks used by the guided room steps.

    A single signal (hash distance, descriptor mean difference, or global
    pixel displacement) is never trusted alone -- the step verdict combines
    them so that a near-identical scene, a recompressed copy and a small
    hand-only camera shift are all treated as the same view.
    """
    prior_hash = previous.get("visualSignature", "")
    sig_distance = _signature_distance(signature, prior_hash)
    prior_descriptor = previous.get("sceneDescriptor")
    desc_diff = 1.0
    try:
        if prior_descriptor:
            current = np.frombuffer(base64.b64decode(descriptor, validate=True), dtype=np.uint8)
            prior = np.frombuffer(base64.b64decode(prior_descriptor, validate=True), dtype=np.uint8)
            if current.size == prior.size == 576:
                desc_diff = float(np.abs(current.astype(np.float32) - prior).mean()) / 255.0
    except (ValueError, TypeError):
        pass
    feature_matches, feature_ratio = _feature_match(feature_descriptor, previous)
    same_scene = (sig_distance <= SIMILAR_PHASH_MAX_DISTANCE or
                  desc_diff < SIMILAR_DESCRIPTOR_MAX_DIFF or
                  (feature_matches >= SIMILAR_ORB_MIN_MATCHES and feature_ratio >= SIMILAR_ORB_MATCH_RATIO))
    displacement, response = 0.0, 0.0
    if last_gray is not None:
        dx, dy, response = _visual_direction_displacement(last_gray, gray)
        displacement = float((dx * dx + dy * dy) ** 0.5)
    return {
        "sameScene": bool(same_scene),
        "hashSimilar": bool(sig_distance <= SIMILAR_PHASH_MAX_DISTANCE),
        "descriptorSimilar": bool(desc_diff < SIMILAR_DESCRIPTOR_MAX_DIFF),
        "featureSimilar": bool(feature_matches >= SIMILAR_ORB_MIN_MATCHES and
                               feature_ratio >= SIMILAR_ORB_MATCH_RATIO),
        "signatureDistance": int(sig_distance),
        "descriptorDiff": round(float(desc_diff), 3),
        "featureMatches": int(feature_matches),
        "featureMatchRatio": round(float(feature_ratio), 3),
        "displacement": round(displacement, 3),
        "response": round(float(response), 3),
    }


def _reference_similarity(signature: str, descriptor: str, feature_descriptor: str,
                          reference: Dict[str, Any]) -> float:
    """Robust bounded visual score from independent scene layout and local-feature signals.

    Validates room content rather than exact pixel framing. Tolerates camera shift,
    distance/zoom changes, rotation/tilt within reasonable limits, lighting/exposure changes,
    movement blur, and compression.
    """
    if not reference.get("visualSignature") or not reference.get("sceneDescriptor"):
        return 0.0
    distance = _signature_distance(signature, reference["visualSignature"])
    s_phash = max(0.0, min(1.0, 1.0 - (distance / 38.0)))

    s_thumb = 0.0
    try:
        current = np.frombuffer(base64.b64decode(descriptor, validate=True), dtype=np.uint8)
        prior = np.frombuffer(base64.b64decode(reference["sceneDescriptor"], validate=True), dtype=np.uint8)
        if current.size == 576 and prior.size == 576:
            c_img = current.reshape((24, 24)).astype(np.float32)
            p_img = prior.reshape((24, 24)).astype(np.float32)

            best_ncc = -1.0
            p_norm = p_img - np.mean(p_img)
            p_std = np.std(p_norm) + 1e-5
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    shifted = np.roll(np.roll(c_img, dx, axis=1), dy, axis=0)
                    c_norm = shifted - np.mean(shifted)
                    c_std = np.std(c_norm) + 1e-5
                    ncc = float(np.mean(p_norm * c_norm) / (p_std * c_std))
                    if ncc > best_ncc:
                        best_ncc = ncc
            s_ncc = max(0.0, min(1.0, best_ncc))

            c_adj = np.clip(c_img - np.mean(c_img) + np.mean(p_img), 0, 255)
            diff = float(np.abs(c_adj - p_img).mean()) / 255.0
            s_exp = math.exp(-diff / 0.25)
            s_thumb = max(0.0, min(1.0, s_ncc * 0.70 + s_exp * 0.30))
    except (ValueError, TypeError):
        s_thumb = 0.0

    matches, ratio = _feature_match(feature_descriptor, reference)
    if matches >= 8:
        match_score = min(1.0, matches / 24.0)
        ratio_score = min(1.0, ratio / 0.20)
        s_feat = match_score * ratio_score
        score = 0.45 * s_feat + 0.35 * s_thumb + 0.20 * s_phash
    elif matches >= 4:
        s_feat = min(0.35, ratio / 0.20)
        score = 0.25 * s_feat + 0.50 * s_thumb + 0.25 * s_phash
    else:
        score = 0.65 * s_thumb + 0.35 * s_phash
        if s_thumb < 0.45 and s_phash < 0.45:
            score = min(score, 0.35)

    return round(max(0.0, min(1.0, score)), 4)


try:
    from inference.laptop_pose_tracker import laptop_pose_tracker
except ImportError:
    try:
        from laptop_pose_tracker import laptop_pose_tracker
    except ImportError:
        laptop_pose_tracker = None


def _visual_direction_displacement(prior_gray: np.ndarray, current_gray: np.ndarray) -> Tuple[float, float, float]:
    """Calculate horizontal displacement dx, vertical dy, and correlation response.

    Uses cv2.phaseCorrelate with a Hann window on downscaled grayscale views.
    Returns (dx, dy, response).
    When the camera pans LEFT, scene features translate RIGHT (dx > 0).
    When the camera pans RIGHT, scene features translate LEFT (dx < 0).
    """
    try:
        h, w = prior_gray.shape[:2]
        target_w = 160
        target_h = max(32, int(h * target_w / w))
        p_small = cv2.resize(prior_gray, (target_w, target_h), interpolation=cv2.INTER_AREA).astype(np.float32)
        c_small = cv2.resize(current_gray, (target_w, target_h), interpolation=cv2.INTER_AREA).astype(np.float32)
        hann = cv2.createHanningWindow((target_w, target_h), cv2.CV_32F)
        (shift, response) = cv2.phaseCorrelate(p_small, c_small, hann)
        dx, dy = float(shift[0]), float(shift[1])
        return round(dx, 3), round(dy, 3), round(float(response), 3)
    except Exception:
        return 0.0, 0.0, 0.0


def _orb_direction_displacement(prior_gray: np.ndarray, current_gray: np.ndarray) -> Tuple[float, float, int, float]:
    """Estimate camera motion from matched local features.

    The median inlier displacement is more stable than whole-frame phase
    correlation when a hand, laptop screen, or exposure changes locally.
    Values are normalized to a 160-pixel frame width to match the existing
    visual-motion thresholds.
    """
    try:
        def scaled(gray):
            h, w = gray.shape[:2]
            return cv2.resize(gray, (320, max(96, int(h * 320 / max(1, w)))), interpolation=cv2.INTER_AREA)

        prior = scaled(prior_gray)
        current = scaled(current_gray)
        orb = cv2.ORB_create(nfeatures=500, fastThreshold=10)
        prior_points, prior_desc = orb.detectAndCompute(prior, None)
        current_points, current_desc = orb.detectAndCompute(current, None)
        if prior_desc is None or current_desc is None or len(prior_desc) < 10 or len(current_desc) < 10:
            return 0.0, 0.0, 0, 0.0
        pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(prior_desc, current_desc, k=2)
        good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < 0.78 * pair[1].distance]
        if len(good) < 8:
            return 0.0, 0.0, len(good), 0.0
        shifts = np.array([
            np.subtract(current_points[match.trainIdx].pt, prior_points[match.queryIdx].pt)
            for match in good
        ], dtype=np.float32)
        center = np.median(shifts, axis=0)
        residual = np.linalg.norm(shifts - center, axis=1)
        limit = max(3.0, float(np.median(residual)) * 2.5)
        inliers = shifts[residual <= limit]
        if len(inliers) < 8:
            return 0.0, 0.0, len(inliers), 0.0
        dx, dy = np.median(inliers, axis=0) * 0.5
        confidence = float(len(inliers)) / max(1, min(len(prior_desc), len(current_desc)))
        return round(float(dx), 3), round(float(dy), 3), len(inliers), round(confidence, 3)
    except (ValueError, TypeError, cv2.error):
        return 0.0, 0.0, 0, 0.0


def _pose_confirms_participant(laptop: Dict[str, Any]) -> bool:
    """Whether the webcam evidence shows the candidate, without punishing downtime.

    A pose tracker that is missing, still loading, timed out, or raised has no
    opinion about the participant. Reading that as "nobody was present" failed
    every sweep whenever MediaPipe was unavailable, which is an infrastructure
    fault rather than evidence against the candidate. Such cases fall back to the
    webcam person detection the callers already require alongside movement. A
    tracker that actually ran and saw nobody still fails the person gate.
    """
    if (laptop.get("mode") == "pose" and laptop.get("participantDetected") is True) or (
            laptop.get("mode") == "hand" and laptop.get("handDetected") is True):
        return True
    return laptop.get("poseVerdict") != "no_participant"


def _laptop_motion(frames: Optional[List[str]]) -> Dict[str, Any]:
    """Check webcam samples for upper-body/arm/posture change without saving them."""
    pose_res: Optional[Dict[str, Any]] = None
    if laptop_pose_tracker is not None and os.getenv("ENABLE_MEDIAPIPE_POSE", "false").lower() in ("true", "1", "yes"):
        try:
            res = laptop_pose_tracker.evaluate_motion(frames or [])
            if res.get("available"):
                if res.get("participantDetected") or res.get("mode") != "pose_no_participant":
                    return {
                        "available": True,
                        "moved": bool(res.get("moved")),
                        "score": float(res.get("score", 0.0)),
                        "pose_detected": res.get("mode") == "pose",
                        "participantDetected": res.get("participantDetected"),
                        "multiplePersonsDetected": bool(res.get("multiplePersonsDetected")),
                        "personCount": res.get("personCount"),
                        "mode": res.get("mode", "pose"),
                        "handDetected": bool(res.get("handDetected")),
                        "poseVerdict": "no_participant" if res.get("mode") == "pose_no_participant" else None,
                        "motionSource": res.get("motionSource"),
                        "armDirection": res.get("armDirection"),
                    }
                # Pose inference ran but found nobody in frame. That is
                # INCONCLUSIVE, not proof that the candidate stood still: during a
                # room sweep the candidate walks around holding the phone and is
                # routinely outside the laptop webcam's view. Returning here
                # reported "no movement" for every such frame, which froze the
                # sweep at its first sector forever (12% / 1 of 8). Measure the
                # real view change optically instead and keep the pose metadata so
                # guidance can still tell the user to step into view.
                pose_res = res
        except Exception as exc:
            logger.warning("Laptop pose tracker evaluation failed: %s", exc)

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
        return {"available": False, "moved": False, "score": 0.0,
                "participantDetected": None, "multiplePersonsDetected": False, "personCount": 0,
                "poseVerdict": "no_participant" if pose_res else None}
    scores = []
    for before, after in zip(views, views[1:]):
        delta = after.astype(np.int16) - before.astype(np.int16)
        delta -= int(np.median(delta))  # ignore ordinary exposure changes
        scores.append(float(np.mean(np.abs(delta) > 17)))
    moved = sum(score >= 0.012 for score in scores) >= 2 or max(scores) >= 0.035
    return {"available": True, "moved": moved, "score": round(max(scores), 4),
            "pose_detected": False,
            # No pose in a webcam sample is inconclusive while the candidate
            # moves around the room; the live YOLO review checks person presence.
            "participantDetected": None,
            # Distinguish "the pose tracker could not run" (no opinion) from
            # "the pose tracker ran and saw nobody" (a real finding). Only the
            # latter may fail the person gate.
            "poseVerdict": "no_participant" if pose_res else None,
            "multiplePersonsDetected": bool(pose_res.get("multiplePersonsDetected")) if pose_res else False,
            "personCount": pose_res.get("personCount") if pose_res else None,
            "mode": "optical_fallback"}


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
    """Composite per-step coverage in 0..1 plus an optional advisory reason.

    This function is ADVISORY ONLY. It reports how much verifiable visual
    information a view carries; it never decides whether a photo is acceptable.
    The accept/reject decision belongs to `image_quality()`, which is the single
    step-agnostic authority (see the module notes on the room-verification rule:
    a plain wall, an empty room, a door, a window, a floor or a piece of
    furniture are all valid room evidence).

    Two properties are guaranteed here:
      * `step` is a reporting label only. The coverage maths is identical for
        FRONT, LEFT, RIGHT, BOTTOM and DESK, so no direction can ever be held to
        a stricter bar than another. Band statistics (top/bottom/lower) inform
        guidance copy, never the number that is compared to the threshold.
      * No single weak metric can push a view down. Soft deficits are averaged
        into a bounded penalty instead of subtracted one at a time.
    """
    quality = float(metrics.get("qualityScore", 0.0))
    coverage = max(0.0, min(1.0, quality / 100.0))

    # Advisory guidance only -- deliberately never returned as a hard failure
    # reason, and deliberately identical for every step.
    reason: Optional[str] = None
    if coverage < 0.45:
        reason = "low_information"

    # Per-step hint used purely to pick helpful guidance copy after the fact.
    # This is NOT a quality requirement and cannot change the verdict.
    if step in ("desk", "bottom") and float(metrics.get("edgeBottom", 0.0)) < 0.01:
        reason = reason or "flat_band"
    return round(coverage, 3), reason


VEED_KEYS = {
    "front": {
        "poor": "front_poor",
        "ok": "front_ok",
    },
    "left": {"poor": "left_poor", "ok": "left_ok"},
    "right": {"poor": "right_poor", "ok": "right_ok"},
    "bottom": {"poor": "bottom_poor", "ok": "bottom_ok"},
    "desk": {"poor": "desk_poor", "ok": "desk_ok"},
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
            "steps": list(CAPTURE_STEPS),
            "error": self.init_error,
        }

    def _log_room_verify(self, step, session_id, metrics, detections, yolo_confidence,
                         coverage, threshold, valid, failure_reason, guide_key) -> None:
        """Structured [ROOM-VERIFY] diagnostics for every guided room photo.

        Emits step, resolution, brightness, contrast, the three blur signals,
        edge density, entropy, YOLO detection count/confidence, the scene score,
        the coverage/quality figures, the verdict and -- crucially -- the actual
        failure reason, so a false rejection is immediately attributable.
        """
        if not ROOM_VERIFY_LOG_ENABLED:
            return
        logger.info(
            "[ROOM-VERIFY] step=%s session=%s resolution=%sx%s workSize=%sx%s "
            "brightness=%s contrast=%s lapVariance=%s relativeSharpness=%s tenengrad=%s fineDetail=%s "
            "blurSignals=%s weakSignals=%s softBlur=%s hardBlur=%s edgeDensity=%s entropy=%s "
            "informationScore=%s localStructure=%s noiseRatio=%s "
            "brightnessScore=%s contrastScore=%s sharpnessScore=%s sceneScore=%s resolutionScore=%s "
            "objectCount=%s yoloConfidence=%s yoloAvailable=%s detected=%s "
            "coverage=%s threshold=%s qualityScore=%s qualityThreshold=%s "
            "verified=%s reason=%s guideKey=%s",
            step, session_id, metrics.get("width"), metrics.get("height"),
            metrics.get("widthWork"), metrics.get("heightWork"),
            metrics.get("brightness"), metrics.get("contrast"),
            metrics.get("laplacianVar"), metrics.get("relativeSharpness"), metrics.get("tenengrad"),
            metrics.get("fineDetailRatio"),
            metrics.get("blurSignals"), ",".join(metrics.get("blurSignalsWeak") or []) or "-",
            metrics.get("blurred"), metrics.get("blurredHard"),
            metrics.get("edgeFull"), metrics.get("entropy"), metrics.get("informationScore"),
            metrics.get("localStructure"), metrics.get("noiseRatio"),
            metrics.get("brightnessScore"), metrics.get("contrastScore"), metrics.get("sharpnessScore"),
            metrics.get("sceneScore"), metrics.get("resolutionScore"),
            len(detections), round(float(yolo_confidence or 0.0), 3), bool(self.yolo),
            ",".join(sorted({det["class_name"] for det in detections})) or "-",
            coverage, round(float(threshold), 3), metrics.get("qualityScore"), QUALITY_ACCEPT_SCORE,
            bool(valid), failure_reason or "valid_room_view", guide_key,
        )

    def cleanup_stale(self, max_idle_seconds: int = 900, max_sessions: int = 32) -> int:
        now = time.time()
        stale = [k for k, st in list(self.scan_states.items()) if now - st.get("ts", now) > max_idle_seconds]
        for key in stale:
            self.scan_states.pop(key, None)
        # Hard cap so a burst of unique session IDs cannot grow memory without bound.
        if len(self.scan_states) > max_sessions:
            by_idle = sorted(self.scan_states.items(), key=lambda pair: pair[1].get("ts", 0))
            for key, _ in by_idle[:len(self.scan_states) - max_sessions]:
                self.scan_states.pop(key, None)
        return len(stale)

    def decode_frame(self, frame_data: str) -> Optional[np.ndarray]:
        """Decode a base64 room capture and normalise it to an upright BGR frame.

        Phone cameras frequently store portrait shots as a landscape buffer plus
        an EXIF rotation tag. Orientation handling is therefore made EXPLICIT
        here, and it has to be: OpenCV 4.9+ applies the EXIF rotation inside
        `imdecode` by default, while 4.5-4.8 ignore it. Without pinning
        `IMREAD_IGNORE_ORIENTATION` the same photo would be rotated on some
        builds and left sideways on others -- and on 4.9+ it would be rotated a
        second time by the call below, leaving a portrait shot sideways and
        skewing every downstream metric. Decoding without orientation and
        applying the tag once keeps this stable across versions.
        """
        try:
            if "," in frame_data:
                frame_data = frame_data.split(",", 1)[1]
            raw = base64.b64decode(frame_data)
            if not raw:
                return None
            frame = cv2.imdecode(np.frombuffer(raw, np.uint8),
                                 cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
            if frame is None:
                return None
            orientation = _exif_orientation(raw)
            if orientation != 1:
                frame = _apply_orientation(frame, orientation)
            return frame
        except Exception:
            return None

    def _prepare(self, frame: np.ndarray) -> Tuple[np.ndarray, np.ndarray, Dict[str, float]]:
        original_height, original_width = frame.shape[:2]
        h, w = frame.shape[:2]
        if max(h, w) > BLUR_WORKING_SIZE:
            scale = float(BLUR_WORKING_SIZE) / max(h, w)
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        lum = _luminance(gray)
        smoothed = cv2.GaussianBlur(gray, (5, 5), 0)
        noise_ratio = float((gray.astype(np.float32) - smoothed.astype(np.float32)).std()) / (float(gray.std()) + 1.0)
        smoothness = _sharpness(gray, lum["contrast"], noise_ratio)
        edges = _edge_profile(frame)
        information = _information_content(gray, edges["edgeFull"])
        metrics = {
            "width": int(original_width),
            "height": int(original_height),
            "widthWork": int(w),
            "heightWork": int(h),
            "blurScore": smoothness["laplacianVar"],
            "laplacianVar": smoothness["laplacianVar"],
            "tenengrad": smoothness["tenengrad"],
            "relativeSharpness": smoothness["relativeSharpness"],
            "fineDetailRatio": smoothness["fineDetailRatio"],
            "blurSignals": smoothness["blurSignals"],
            "blurSignalsWeak": smoothness["blurSignalsWeak"],
            "blurred": smoothness["blurred"],
            "blurredHard": smoothness["blurredHard"],
            "noiseRatio": round(noise_ratio, 3),
            "localStructure": _local_structure(gray),
            **edges,
            **lum,
            **information,
        }
        metrics.update(image_quality(metrics))
        return frame, gray, metrics

    def _yolo_detections(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        if not self.yolo:
            return []
        try:
            results = self.yolo.model(frame, conf=YOLO_CONFIDENCE_THRESHOLD, verbose=False)
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
            raise RuntimeError("Room object detector failed") from exc

    def _observations(self, detections: List[Dict[str, Any]], frame_shape=None) -> List[Dict[str, Any]]:
        """Neutral, reviewable observations. Never a cheating verdict."""
        observations: List[Dict[str, Any]] = []

        def area(det):
            x1, y1, x2, y2 = det.get("box") or (0, 0, 0, 0)
            return max(0.0, x2 - x1) * max(0.0, y2 - y1)

        def iou(first, second):
            ax1, ay1, ax2, ay2 = first.get("box") or (0, 0, 0, 0)
            bx1, by1, bx2, by2 = second.get("box") or (0, 0, 0, 0)
            intersection = max(0.0, min(ax2, bx2) - max(ax1, bx1)) * max(0.0, min(ay2, by2) - max(ay1, by1))
            return intersection / max(1.0, area(first) + area(second) - intersection)

        screen_boxes = [det for det in detections if det["class_name"] in {"laptop", "tv", "monitor", "tv monitor"}]

        def rendered_inside_screen(det):
            x1, y1, x2, y2 = det.get("box") or (0, 0, 0, 0)
            cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
            for screen in screen_boxes:
                if screen is det:
                    continue
                sx1, sy1, sx2, sy2 = screen.get("box") or (0, 0, 0, 0)
                if sx1 <= cx <= sx2 and sy1 <= cy <= sy2 and area(det) <= area(screen) * 0.65:
                    return True
            return False

        frame_area = float(frame_shape[0] * frame_shape[1]) if frame_shape is not None else 1.0
        persons = sorted((det for det in detections
                          if det["class_name"] == "person" and det.get("confidence", 0) >= 0.45
                          and area(det) / max(1.0, frame_area) >= 0.015
                          and not rendered_inside_screen(det)),
                         key=lambda det: det.get("confidence", 0), reverse=True)
        distinct_persons: List[Dict[str, Any]] = []
        for person in persons:
            if any(iou(person, existing) >= 0.35 for existing in distinct_persons):
                continue
            distinct_persons.append(person)
        if len(distinct_persons) > 1:
            for person in distinct_persons[1:]:
                observations.append({
                    "objectType": "additional person",
                    "confidence": person["confidence"],
                    "box": person["box"],
                    "note": "Another person is visible in the room view.",
                })
        seen_laptops = 0
        for det in detections:
            if rendered_inside_screen(det):
                continue
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
        duplicate_threshold: float = DEFAULT_DUPLICATE_SIMILARITY,
    ) -> Dict[str, Any]:
        step = str(step or "").lower()
        if step not in CAPTURE_STEPS:
            return {"success": False, "error": f"Unsupported capture step: {step}"}
        frame = self.decode_frame(frame_data)
        if frame is None:
            return {"success": False, "error": "Camera frame could not be decoded",
                    "step": step, "valid": False, "reason": "image_corrupt",
                    "guideKey": "image_invalid", "qualityScore": 0,
                    "message": "The captured photo could not be read. Please take it again.",
                    "taMessage": "எடுக்கப்பட்ட புகைப்படத்தைப் படிக்க முடியவில்லை. மீண்டும் படம் எடுக்கவும்.",
                    "metrics": {}, "observations": [], "detectedObjects": []}

        _, gray, metrics = self._prepare(frame)
        signature = _visual_signature(gray)
        scene_descriptor = _scene_descriptor(gray)
        feature_descriptor = _feature_descriptor(gray)
        reading = _orientation_reading(orientation)
        laptop = _laptop_motion(laptop_frames) if require_laptop else {"available": True, "moved": True, "score": 0.0}

        detector_error = False
        try:
            detections = self._yolo_detections(frame)
        except RuntimeError:
            detector_error = True
            detections = []
        observations = self._observations(detections, frame.shape)
        labels = {item["class_name"] for item in detections}
        frame_area = max(1.0, float(frame.shape[0] * frame.shape[1]))
        device_area_ratio = max((
            max(0.0, float(det["box"][2]) - float(det["box"][0])) *
            max(0.0, float(det["box"][3]) - float(det["box"][1])) / frame_area
            for det in detections
            if det["class_name"] in {"laptop", "keyboard", "tv", "monitor"}
        ), default=0.0)

        coverage, _advisory = _step_coverage(metrics, step)
        yolo_confidence = max((float(det.get("confidence", 0.0)) for det in detections), default=0.0)

        # ── Step-agnostic image quality verdict ─────────────────────────────
        # `image_quality()` is the only authority on whether the pixels are
        # usable, and it is byte-for-byte identical for front / left / right /
        # back / bottom / desk. Object detection is a SUPPORTING signal only:
        # zero YOLO detections never invalidates a room photo, and the old
        # `workspace_missing` / `bottom_horizontal` gates that keyed off object
        # presence are gone (the latter even used to reject a perfectly good
        # BOTTOM view for showing a laptop).
        quality_reason = metrics.get("reason")
        quality_ok = quality_reason is None
        hard_blur = bool(metrics.get("blurredHard", False))
        invalid_texture = quality_reason == "image_corrupt"
        workspace_missing = False
        bottom_horizontal = False

        guide_key = VEED_KEYS[step]["ok"]
        if not quality_ok:
            # Use the REAL reason's guide key, never a generic fallback, so the
            # candidate is told what actually went wrong.
            guide_key = metrics.get("guideKey") or "image_invalid"
        elif coverage < threshold:
            # The frame passed every hard quality check but still landed under the
            # configured bar. Report that honestly instead of guessing at framing:
            # a per-step directional instruction here used to be sent for what is
            # really a marginal-quality photo.
            guide_key = "quality_low"
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

        state = self.scan_states.setdefault(f"step_{session_id}",
                                            {"ts": time.time(), "last": None, "lastGray": None, "accepted": {}})

        accepted = {item.get("step"): item for item in (prior_captures or []) if isinstance(item, dict) and item.get("visualSignature")}
        accepted.update(state.get("accepted", {}))
        last_gray = state.get("lastGray")

        # Composite "meaningful new view" gate. Every prior accepted step must be
        # either clearly separated from this frame by scene content OR by an
        # orientation change, otherwise this step is rejected as VIEW_TOO_SIMILAR.
        scene_signals: List[Dict[str, Any]] = []
        weak_change = bool(accepted)
        for name, item in accepted.items():
            if name == step:
                continue
            signals = _composite_similarity(gray, signature, scene_descriptor, feature_descriptor, item, last_gray)
            prior_orientation = _orientation_reading(item.get("orientation"))
            orientation_delta = None
            pitch_delta = None
            if reading and prior_orientation and reading["yaw"] is not None and prior_orientation["yaw"] is not None:
                orientation_delta = abs(_angular_delta(prior_orientation["yaw"], reading["yaw"]))
            if reading and prior_orientation and reading["pitch"] is not None and prior_orientation["pitch"] is not None:
                pitch_delta = abs(float(reading["pitch"]) - float(prior_orientation["pitch"]))
            orientation_proves_change = ((orientation_delta is not None and orientation_delta >= MIN_DIRECTION_DELTA_DEGREES) or
                                         (pitch_delta is not None and pitch_delta >= MIN_PITCH_DELTA_DEGREES))
            # ORB overlap catches cropped and tilted copies when sensors are
            # absent. With a strong sensor delta, moderate overlap is expected
            # between adjacent room views; exact/thumbnail duplicates and very
            # high side-view overlap remain blocked.
            effective_same_scene = signals["sameScene"]
            if orientation_proves_change and not signals["hashSimilar"] and not signals["descriptorSimilar"]:
                effective_same_scene = bool(step in ("left", "right") and signals["featureMatchRatio"] >= 0.28)
            meaningful = (orientation_delta is not None and orientation_delta >= MIN_DIRECTION_DELTA_DEGREES) or \
                (pitch_delta is not None and pitch_delta >= MIN_PITCH_DELTA_DEGREES) or \
                (signals["signatureDistance"] >= NEW_VIEW_PHASH_MIN_DISTANCE and signals["descriptorDiff"] >= NEW_VIEW_DESCRIPTOR_MIN_DIFF) or \
                (signals["displacement"] >= 1.5 and not signals["sameScene"] and signals["signatureDistance"] >= 16)
            weak_change = weak_change and not meaningful
            scene_signals.append({"step": name, "signatureDistance": signals["signatureDistance"],
                "descriptorDiff": signals["descriptorDiff"], "displacement": signals["displacement"],
                "featureMatches": signals["featureMatches"], "featureMatchRatio": signals["featureMatchRatio"],
                "response": signals["response"], "sameScene": effective_same_scene,
                "orientationDelta": orientation_delta, "pitchDelta": pitch_delta})
        same_view = any(signal["sameScene"] for signal in scene_signals) or weak_change

        wrong_direction = False
        if reading and step in ("left", "right"):
            front = _orientation_reading(accepted.get("front", {}).get("orientation"))
            if front:
                current_from_front = _angular_delta(front["yaw"], reading["yaw"])
                if abs(current_from_front) < MIN_DIRECTION_DELTA_DEGREES:
                    wrong_direction = True
                if step == "right":
                    left = _orientation_reading(accepted.get("left", {}).get("orientation"))
                    if left:
                        left_from_front = _angular_delta(front["yaw"], left["yaw"])
                        # LEFT and RIGHT must be on opposite sides of the FRONT
                        # reference. Merely continuing farther in the same
                        # direction cannot satisfy the RIGHT step.
                        if abs(left_from_front) < MIN_DIRECTION_DELTA_DEGREES or left_from_front * current_from_front >= 0:
                            wrong_direction = True
                        if abs(_angular_delta(left["yaw"], reading["yaw"])) < MIN_DIRECTION_DELTA_DEGREES * 2:
                            wrong_direction = True
        elif reading and step == "bottom":
            # Vertical tilt: the capture must be a distinct tilt from every
            # previously accepted view so the lower area is genuinely staged.
            reference_pitches = []
            for name, item in accepted.items():
                ref = _orientation_reading(item.get("orientation"))
                if ref and ref["pitch"] is not None:
                    reference_pitches.append((name, ref["pitch"]))
            if reading["pitch"] is None:
                wrong_direction = False
            elif not reference_pitches:
                # No prior reference orientation; framing/markup flags decide.
                wrong_direction = False
            elif all(abs(reading["pitch"] - pitch) < MIN_PITCH_DELTA_DEGREES * 0.6 for _, pitch in reference_pitches):
                wrong_direction = True
        elif not reading and step in ("left", "right"):
            # VISUAL FALLBACK: Orientation sensor is unavailable.
            # Never treat missing orientation data as "direction valid".
            # Require a meaningful scene/perspective change from the prior accepted
            # view; a static or tiny hand-induced shift stays "too similar".
            previous_step = {"left": "front", "right": "left"}[step]
            prev_item = accepted.get(previous_step)
            front_item = accepted.get("front")
            if prev_item:
                prev_sig = _composite_similarity(gray, signature, scene_descriptor, feature_descriptor, prev_item, last_gray)
                dist_prev = prev_sig["signatureDistance"]
                dist_front = _signature_distance(signature, front_item.get("visualSignature", "")) if front_item else 64
                if dist_prev < 14 or (step == "right" and dist_front < 18) or \
                   prev_sig["descriptorDiff"] < 0.065 or \
                   (dist_prev < 26 and prev_sig["displacement"] < 1.5):
                    wrong_direction = True
        elif not reading and step == "bottom":
            # BOTTOM should show the visible lower area. Without an orientation
            # sensor this used to be an ABSOLUTE edge-density cut
            # (edgeLower < 0.015), which rejected perfectly good shots of a plain
            # or dim floor. The test is now self-normalised -- the lower band
            # must be proportionally emptier than the rest of the frame -- and it
            # abstains entirely on a frame with no structure to compare, leaving
            # the content-based cross-step similarity gate as the authority.
            if (metrics["edgeFull"] >= BLANK_EDGE_FLOOR * 6
                    and metrics["edgeLower"] < metrics["edgeFull"] * 0.22):
                wrong_direction = True

        # The laptop is an independent live source: it must be available and,
        # when MediaPipe can make the determination, show exactly one
        # participant. Movement is corroborative. A user commonly finishes the
        # turn and steadies the phone before tapping Capture, so weak motion in
        # the final laptop frames must not override strong mobile evidence.
        laptop_camera_missing = require_laptop and not laptop["available"]
        participant_missing = require_laptop and laptop.get("participantDetected") is False
        multiple_participants = require_laptop and laptop.get("multiplePersonsDetected") is True
        orientation_proof = any(
            ((signal.get("orientationDelta") or 0) >= MIN_DIRECTION_DELTA_DEGREES or
             (signal.get("pitchDelta") or 0) >= MIN_PITCH_DELTA_DEGREES * 0.6)
            for signal in scene_signals
        )
        visual_proof = any(
            signal["signatureDistance"] >= NEW_VIEW_PHASH_MIN_DISTANCE and
            signal["descriptorDiff"] >= NEW_VIEW_DESCRIPTOR_MIN_DIFF and
            not signal["sameScene"]
            for signal in scene_signals
        )
        mobile_action_confirmed = not same_view and not wrong_direction and (orientation_proof or visual_proof)
        laptop_unconfirmed = require_laptop and step in ("left", "right", "bottom") and \
            not laptop["moved"] and not mobile_action_confirmed

        same_frame = False
        last = state.get("last")
        if last and last == fingerprint:
            same_frame = True
            # An identical re-submission is a duplicate, whatever its quality, so
            # it must never inherit a "blurred" explanation it did not earn.
            if quality_ok:
                guide_key = "duplicate_image"
        state["last"] = fingerprint
        state["lastGray"] = gray.copy()
        state["ts"] = time.time()

        if same_view or wrong_direction:
            guide_key = {"left": "move_left_further", "right": "move_right_further"}.get(step, "move_further")
        elif not quality_ok:
            # Keep the real reason's guide key: the copy must match the cause.
            guide_key = metrics.get("guideKey") or "image_invalid"
        elif laptop_camera_missing:
            guide_key = "laptop_camera_required"
        elif multiple_participants:
            guide_key = "multiple_participants"
        elif participant_missing:
            guide_key = "participant_missing"
        elif laptop_unconfirmed:
            guide_key = "movement_unconfirmed"
        valid = (quality_ok and coverage >= threshold and not same_frame and not same_view
                 and not wrong_direction and not laptop_camera_missing and not participant_missing
                 and not multiple_participants and not laptop_unconfirmed)
        if valid:
            state.setdefault("accepted", {})[step] = {"step": step, "visualSignature": signature,
                                                       "sceneDescriptor": scene_descriptor,
                                                       "featureDescriptor": feature_descriptor,
                                                       "orientation": reading}

        # Machine-readable ACTUAL failure reason. Never a generic
        # "photo not verified" placeholder -- the phone shows this verbatim.
        failure_reason = None
        if not valid:
            # Ordered most-specific first so the reported reason is the actual
            # cause. An identical resubmission is reported as a duplicate even
            # though it is also trivially "similar" to itself.
            if not quality_ok:
                failure_reason = quality_reason
            elif same_frame:
                failure_reason = "duplicate_image"
            elif same_view:
                failure_reason = "view_too_similar"
            elif wrong_direction:
                failure_reason = "wrong_direction"
            elif laptop_camera_missing:
                failure_reason = "webcam_unavailable"
            elif multiple_participants:
                failure_reason = "multiple_persons"
            elif participant_missing:
                failure_reason = "participant_not_visible"
            elif laptop_unconfirmed:
                failure_reason = "movement_unconfirmed"
            else:
                # Nothing else is wrong, so the only remaining cause is that the
                # frame scored below the configured bar. Report that rather than
                # the old generic "low_information" guess.
                failure_reason = "quality_below_threshold"

        message = self._message_for(step, guide_key)
        ta_message = self._message_for(step, guide_key, tamil=True)

        self._log_room_verify(step, session_id, metrics, detections, yolo_confidence,
                              coverage, threshold, valid, failure_reason, guide_key)

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
            "floorHorizontal": bottom_horizontal,
            "invalidTexture": invalid_texture,
            "visualSignature": signature,
            "sceneDescriptor": scene_descriptor,
            "featureDescriptor": feature_descriptor,
            "deviceAreaRatio": round(device_area_ratio, 3),
            "laptopMovement": laptop,
            "mobileActionConfirmed": bool(mobile_action_confirmed),
            "orientation": reading,
            "guideKey": guide_key,
            "reason": failure_reason or "valid_room_view",
            "message": message,
            "taMessage": ta_message,
            "observations": observations,
            "metrics": metrics,
            "detectedObjects": [d["class_name"] for d in detections],
            "sceneSignals": scene_signals[:4],
            "orientationDelta": max((signal["orientationDelta"] or 0 for signal in scene_signals), default=None),
            "opticalFlowScore": round(max((signal["displacement"] or 0 for signal in scene_signals), default=0.0), 3),
            "laptopMovementScore": round(float(laptop.get("score") or 0.0), 3),
            "phoneVisible": any(det["class_name"] in ("cell phone", "cellphone", "mobile phone", "smartphone") for det in detections),
            # ── Room-step quality diagnostics (task: return the real numbers) ──
            "qualityScore": metrics.get("qualityScore", 0),
            "qualityThreshold": QUALITY_ACCEPT_SCORE,
            "blurScore": metrics.get("laplacianVar", 0),
            "brightnessScore": metrics.get("brightnessScore", 0),
            "brightness": metrics.get("brightness", 0),
            "contrastScore": metrics.get("contrastScore", 0),
            "contrast": metrics.get("contrast", 0),
            "sharpnessScore": metrics.get("sharpnessScore", 0),
            "sceneScore": metrics.get("sceneScore", 0),
            "resolutionScore": metrics.get("resolutionScore", 0),
            "relativeSharpness": metrics.get("relativeSharpness", 0),
            "tenengrad": metrics.get("tenengrad", 0),
            "fineDetailRatio": metrics.get("fineDetailRatio", 0),
            "blurSignals": metrics.get("blurSignals", 0),
            "blurSignalsWeak": metrics.get("blurSignalsWeak") or [],
            "edgeDensity": metrics.get("edgeFull", 0),
            "entropy": metrics.get("entropy", 0),
            "noiseRatio": metrics.get("noiseRatio", 0),
            "localStructure": metrics.get("localStructure", 0),
            "width": metrics.get("width", 0),
            "height": metrics.get("height", 0),
            "resolution": f"{metrics.get('width', 0)}x{metrics.get('height', 0)}",
            "objectCount": len(detections),
            "yoloConfidence": round(yolo_confidence, 3),
            "yoloAvailable": bool(self.yolo),
            "detectorError": detector_error,
        }

    def analyze_180_recording(
        self, frames: List[str], session_id: str,
        orientations: Optional[List[Optional[Dict[str, Any]]]] = None,
        block_objects: bool = True,
        laptop_frames: Optional[List[str]] = None,
        require_laptop: bool = False,
        references: Optional[List[Dict[str, Any]]] = None,
        reference_threshold: float = DEFAULT_REFERENCE_SIMILARITY,
        detection_frames: int = 2,
        clear_frames: int = 3,
        same_area_threshold: float = 0.65,
    ) -> Dict[str, Any]:
        """Review one finished half-turn recording; never use live sector progress."""
        del session_id, clear_frames, same_area_threshold
        labels = ("Left", "Front-left", "Front", "Front-right", "Right")
        reference_map = {item.get("step"): item for item in (references or [])
                         if isinstance(item, dict) and item.get("step") in CAPTURE_STEPS}
        reviewed = []
        observations = []
        object_hits = {}
        computer_frames = []
        for original_index, encoded in enumerate(frames[:24]):
            frame = self.decode_frame(encoded)
            if frame is None:
                continue
            frame, gray, metrics = self._prepare(frame)
            if metrics.get("reason") is not None:
                continue
            signature = _visual_signature(gray)
            descriptor = _scene_descriptor(gray)
            features = _feature_descriptor(gray)
            detections = self._yolo_detections(frame)
            names = {item.get("class_name") for item in detections
                     if item.get("confidence", 0) >= 0.25}
            if any(k in names for k in ("laptop", "tv", "monitor", "tv monitor", "screen", "keyboard", "mouse", "desk", "chair")):
                computer_frames.append(original_index)
            for observation in self._observations(detections, frame.shape):
                observations.append(observation)
                kind = observation.get("objectType")
                if kind == "additional person" or (block_objects and kind in
                    {"additional phone", "tablet", "second laptop", "visible notes / book"}):
                    object_hits.setdefault(kind, []).append((original_index, observation))
            reviewed.append({"index": original_index, "frame": encoded,
                             "visualSignature": signature, "sceneDescriptor": descriptor,
                             "featureDescriptor": features, "thumb": _thumbnail(gray),
                             "scores": {name: _reference_similarity(signature, descriptor, features,
                                         reference_map.get(name, {})) for name in CAPTURE_STEPS}})

        laptop = _laptop_motion(laptop_frames) if require_laptop else {
            "available": True, "moved": True, "participantDetected": True}
        pose_seen = _pose_confirms_participant(laptop)
        webcam_person = not require_laptop
        webcam_multiple = False
        if require_laptop and self.yolo:
            for encoded in (laptop_frames or [])[-3:]:
                webcam = self.decode_frame(encoded)
                if webcam is None:
                    continue
                people = [item for item in self._yolo_detections(webcam)
                          if item.get("class_name") == "person" and item.get("confidence", 0) >= 0.45]
                webcam_person = webcam_person or bool(people)
                webcam_multiple = webcam_multiple or len(people) > 1

        n = len(reviewed)
        best_left = 0
        best_front = n // 2 if n else 0
        best_right = max(0, n - 1)
        left_agg_score = 0.0
        front_agg_score = 0.0
        right_agg_score = 0.0
        left_matched = False
        front_matched = False
        right_matched = False
        sequence_ok = False
        anchors_match = False

        if n >= 8:
            left_indices = list(range(0, max(2, int(round(n * 0.45)))))
            front_indices = list(range(max(1, int(round(n * 0.20))), min(n - 1, int(round(n * 0.80)) + 1)))
            right_indices = list(range(max(0, int(round(n * 0.55))), n))

            left_scores = [reviewed[i]["scores"]["left"] for i in left_indices]
            front_scores = [reviewed[i]["scores"]["front"] for i in front_indices]
            right_scores = [reviewed[i]["scores"]["right"] for i in right_indices]

            def _aggregate_section_score(scores: List[float]) -> float:
                if not scores:
                    return 0.0
                sorted_scores = sorted(scores, reverse=True)
                k = max(1, min(2, len(sorted_scores)))
                return round(float(sum(sorted_scores[:k]) / k), 4)

            left_agg_score = _aggregate_section_score(left_scores)
            front_agg_score = _aggregate_section_score(front_scores)
            right_agg_score = _aggregate_section_score(right_scores)

            best_left = max(range(n), key=lambda i: reviewed[i]["scores"]["left"])
            best_front = max(range(n), key=lambda i: reviewed[i]["scores"]["front"])
            best_right = max(range(n), key=lambda i: reviewed[i]["scores"]["right"])

            sequence_ok = best_left < best_right and (best_front >= best_left - 1 and best_front <= best_right + 1)
            left_matched = left_agg_score >= reference_threshold
            front_matched = front_agg_score >= reference_threshold
            right_matched = right_agg_score >= reference_threshold
            anchors_match = bool(left_matched and front_matched and right_matched and sequence_ok)

        changes = [_visual_difference(reviewed[index - 1]["thumb"], reviewed[index]["thumb"])
                   for index in range(1, n)]
        continuity = [_reference_similarity(reviewed[index]["visualSignature"],
                      reviewed[index]["sceneDescriptor"], reviewed[index]["featureDescriptor"], reviewed[index - 1])
                      for index in range(1, n)]
        movement_ok = n >= 8 and sum(change >= 0.015 for change in changes) >= 2
        continuity_ok = bool(continuity) and sum(score >= 0.15 for score in continuity) >= math.ceil(len(continuity) * 0.40)
        if anchors_match and best_left != best_right:
            movement_ok = movement_ok and _visual_difference(reviewed[best_left]["thumb"], reviewed[best_right]["thumb"]) >= 0.02
        if not computer_frames and (laptop_frames or references):
            computer_frames.append(best_front)
        pose_ok = not require_laptop or (pose_seen and laptop.get("moved") is True and
                                         webcam_person and not webcam_multiple)
        blocked = next(((kind, hits) for kind, hits in object_hits.items()
                        if len(hits) >= max(2, detection_frames)), None)
        checks = {"coverage": bool(anchors_match and movement_ok and continuity_ok),
                   "baseline": bool(anchors_match), "person": bool(webcam_person and pose_ok),
                   "computer": bool(computer_frames),
                   "unauthorizedObjects": blocked is None and not webcam_multiple}
        passed = bool(self.yolo) and all(checks.values())

        sample_indices = (best_left, (best_left + best_front) // 2, best_front,
                          (best_front + best_right) // 2, best_right) if n >= 5 else ()
        sampled = [reviewed[index] for index in sample_indices]
        sector_results = [
            {"sector": "Left", "similarity": left_agg_score, "matchedReference": "left",
             "status": "PASS" if left_matched else "LOW_MATCH"},
            {"sector": "Front-left", "similarity": round((left_agg_score + front_agg_score) / 2.0, 4),
             "matchedReference": "front" if front_agg_score > left_agg_score else "left",
             "status": "PASS" if (left_matched and front_matched) else "LOW_MATCH"},
            {"sector": "Front", "similarity": front_agg_score, "matchedReference": "front",
             "status": "PASS" if front_matched else "LOW_MATCH"},
            {"sector": "Front-right", "similarity": round((front_agg_score + right_agg_score) / 2.0, 4),
             "matchedReference": "right" if right_agg_score > front_agg_score else "front",
             "status": "PASS" if (front_matched and right_matched) else "LOW_MATCH"},
            {"sector": "Right", "similarity": right_agg_score, "matchedReference": "right",
             "status": "PASS" if right_matched else "LOW_MATCH"},
        ]
        while len(sector_results) < 5:
            sector_results.append({"sector": labels[len(sector_results)], "similarity": 0.0,
                                   "matchedReference": None, "status": "PENDING"})

        baseline_results = []
        for name in CAPTURE_STEPS:
            best = max(reviewed, key=lambda item: item["scores"][name]) if reviewed else None
            baseline_results.append({"step": name, "bestSimilarity": round(best["scores"][name], 4) if best else 0,
                                     "bestFrame": best["index"] if best else None,
                                     "role": "directional_gate" if name in {"left", "front", "right"} else "context"})

        verified_count = sum([left_matched, front_matched, right_matched])
        overall_similarity = round((left_agg_score + front_agg_score + right_agg_score) / 3.0, 4)
        l_pct = int(round(left_agg_score * 100))
        f_pct = int(round(front_agg_score * 100))
        r_pct = int(round(right_agg_score * 100))
        l_sym = "✓" if left_matched else "✗"
        f_sym = "✓" if front_matched else "✗"
        r_sym = "✓" if right_matched else "✗"

        failed_sections = []
        failed_ta = []
        if not left_matched:
            failed_sections.append("Left")
            failed_ta.append("இடது")
        if not front_matched:
            failed_sections.append("Front")
            failed_ta.append("முன்பக்க")
        if not right_matched:
            failed_sections.append("Right")
            failed_ta.append("வலது")

        if passed:
            verdict = "PASS"
        elif blocked is not None or webcam_multiple:
            verdict = "FLAG"
        else:
            verdict = "RETRY"

        if n < 8:
            reason = "recording_short"
            message = "The recording is too short. Record from left through front to right again."
            ta_message = "பதிவு மிகக் குறுகியது. இடமிருந்து முன் வழியாக வலதுபுறமாக மீண்டும் பதிவு செய்யவும்."
        elif blocked is not None:
            kind = blocked[0]
            reason = "remove_object"
            message = ("Another person was visible in the room. Make sure you are alone, then record the room again."
                       if kind == "additional person"
                       else f"A prohibited item ({kind}) was visible in the room. Remove it, then record the room again.")
            ta_message = ("அறையில் வேறொரு நபர் தென்பட்டார். நீங்கள் மட்டும் இருப்பதை உறுதிசெய்து மீண்டும் பதிவு செய்யவும்."
                          if kind == "additional person"
                          else f"அனுமதிக்கப்படாத பொருள் ({kind}) தென்பட்டது. அதை அகற்றிவிட்டு மீண்டும் பதிவு செய்யவும்.")
        elif webcam_multiple:
            reason = "remove_object"
            message = "Another person was visible in the laptop camera. Make sure you are alone, then record the room again."
            ta_message = "மடிக்கணினி கேமராவில் வேறொரு நபர் தென்பட்டார். நீங்கள் மட்டும் இருப்பதை உறுதிசெய்து மீண்டும் பதிவு செய்யவும்."
        elif not anchors_match:
            reason = "room_mismatch"
            if not sequence_ok and not failed_sections:
                message = "180° Room Scan: Sequence error. Please turn smoothly from Left → Front → Right."
                ta_message = "180° அறை ஸ்கேன் வரிசைப் பிழை. இடமிருந்து முன் வழியாக வலதுபுறமாக மெதுவாக திரும்பவும்."
            else:
                failed_str = " and ".join(failed_sections) if len(failed_sections) <= 2 else ", ".join(failed_sections)
                failed_ta_str = " மற்றும் ".join(failed_ta) if len(failed_ta) <= 2 else ", ".join(failed_ta)
                message = (
                    f"180° Room Scan: {verified_count}/3 views verified ("
                    f"Left: {l_pct}% {l_sym}, "
                    f"Front: {f_pct}% {f_sym}, "
                    f"Right: {r_pct}% {r_sym}). "
                    f"Please rescan the {failed_str} side."
                )
                ta_message = (
                    f"180° அறை ஸ்கேன்: {verified_count}/3 காட்சிகள் சரிபார்க்கப்பட்டன ("
                    f"இடது: {l_pct}% {l_sym}, "
                    f"முன்: {f_pct}% {f_sym}, "
                    f"வலது: {r_pct}% {r_sym}). "
                    f"{failed_ta_str} பகுதியை மீண்டும் ஸ்கேன் செய்யவும்."
                )
        elif not movement_ok or not continuity_ok:
            reason = "movement_unconfirmed"
            message = "The recording did not show one continuous left-to-right turn. Record again slowly."
            ta_message = "பதிவு தொடர்ச்சியான இடமிருந்து வலதுபுற சுழற்சியைக் காட்டவில்லை. மெதுவாக மீண்டும் பதிவு செய்யவும்."
        elif not pose_ok:
            reason = "laptop_motion_missing"
            message = "Keep yourself visible in the laptop camera and move the phone during the recording."
            ta_message = "மடிக்கணினி கேமராவில் நீங்கள் தெரிவதை உறுதிசெய்து பதிவின் போது தொலைபேசியை நகர்த்தவும்."
        elif not computer_frames:
            reason = "room_mismatch"
            message = "The laptop or desktop was not visible in the recording. Record it again."
            ta_message = "மடிக்கணினி அல்லது திரை பதிவில் தெரியவில்லை. மீண்டும் பதிவு செய்யவும்."
        else:
            reason = "scan_complete"
            message = (
                f"180° Room Scan Verified ✓ · "
                f"Left: {l_pct}% · "
                f"Front: {f_pct}% · "
                f"Right: {r_pct}% · "
                f"Proceeding to next step..."
            )
            ta_message = (
                f"180° அறை ஸ்கேன் சரிபார்க்கப்பட்டது ✓ · "
                f"இடது: {l_pct}% · "
                f"முன்: {f_pct}% · "
                f"வலது: {r_pct}% · "
                f"அடுத்த படிக்கு செல்கிறது..."
            )

        report = {"result": "PASS" if passed else "FAIL", "checks": checks,
                  "reviewedSectors": 5 if passed else 0, "arcDegrees": 180,
                  "coverageMode": "recorded_video", "baselineResults": baseline_results,
                  "computerSectors": computer_frames, "prohibitedObjects": observations[:20] if blocked else [],
                  "personSource": "laptop_webcam_mediapipe_yolo" if pose_ok else None}
        object_transition = None
        pending_object = None
        if blocked:
            kind, hits = blocked
            sector = min(4, round(hits[0][0] * 4 / max(1, len(frames) - 1)))
            object_transition = {"type": "DETECTED", "objectType": kind,
                                 "sector": sector,
                                 "frameIndex": hits[0][0],
                                 "confidence": hits[0][1].get("confidence", 0)}
            pending_object = {"objectType": kind, "sector": sector,
                              "label": labels[sector], "confidence": hits[0][1].get("confidence", 0),
                              "reason": "remove_object", "action": "REMOVE_AND_RESCAN"}
        return {"success": True, "step": "scan180", "arcDegrees": 180,
                "complete": passed, "sweepCovered": checks["coverage"],
                "verdict": verdict, "failureReason": reason,
                "rescanRequired": not passed, "detectorAvailable": bool(self.yolo),
                "coverage": 100 if anchors_match else round(verified_count / 3.0 * 100),
                "similarityReport": {"overallSimilarity": overall_similarity,
                                     "threshold": reference_threshold,
                                     "result": "PASS" if anchors_match else "FAIL",
                                     "verifiedViews": f"{verified_count}/3",
                                     "views": {
                                         "left": {"similarity": left_agg_score, "percentage": l_pct, "verified": bool(left_matched)},
                                         "front": {"similarity": front_agg_score, "percentage": f_pct, "verified": bool(front_matched)},
                                         "right": {"similarity": right_agg_score, "percentage": r_pct, "verified": bool(right_matched)},
                                     },
                                     "sectorResults": sector_results},
                "postScanReport": report,
                "sampledFrames": [item["frame"] for item in sampled] if checks["coverage"] else [],
                "mode": "recorded_video", "sectors": [{"sector": index, "label": label,
                    "verified": bool(passed)} for index, label in enumerate(labels)],
                "currentDirection": "Right", "pendingObject": pending_object,
                "objectTransition": object_transition, "observations": observations[:20],
                "motionEvidence": {"distinctTransitions": sum(change >= 0.020 for change in changes),
                    "continuousPairs": sum(score >= 0.20 for score in continuity),
                    "laptopPose": laptop}, "laptopMovement": laptop,
                "laptopMovementScore": float(laptop.get("score") or 0),
                "guideKey": reason, "message": message, "taMessage": ta_message}

    def analyze_180(
        self, frames: List[str], session_id: str,
        orientations: Optional[List[Optional[Dict[str, Any]]]] = None,
        block_objects: bool = True,
        laptop_frames: Optional[List[str]] = None,
        require_laptop: bool = False,
        references: Optional[List[Dict[str, Any]]] = None,
        reference_threshold: float = DEFAULT_REFERENCE_SIMILARITY,
        detection_frames: int = 2,
        clear_frames: int = 3,
        same_area_threshold: float = 0.65,
    ) -> Dict[str, Any]:
        """Guided LEFT → FRONT → RIGHT half-turn with recorded evidence.

        Phone yaw establishes travel when available. Without the sensor, the
        ordered saved-room views and visual continuity establish the half-turn.
        MediaPipe pose/hands confirms arm movement from the laptop camera.
        Neither elapsed time nor a repeated still image advances a sector.
        """
        if not frames:
            return {"success": False, "error": "No scan frames provided"}
        labels = ("Left", "Front-left", "Front", "Front-right", "Right")
        required = ("left", "front", "right")
        reference_map = {item.get("step"): item for item in (references or [])
                         if isinstance(item, dict) and item.get("step") in CAPTURE_STEPS
                         and item.get("visualSignature") and item.get("sceneDescriptor")}
        state_key = f"scan180_{session_id}"
        state = self.scan_states.setdefault(state_key, {
            "ts": time.time(), "samples": 0, "sectors": {}, "startYaw": None,
            "lastYaw": None, "direction": 0, "travel": 0.0, "mode": None,
            "visualFramesSinceSector": 0, "visualContinuity": 0,
            "poseSeen": False,
            "poseMotionWindows": 0, "webcamPersonSeen": False,
            "webcamMultiplePersons": False, "pending": None, "pendingClean": 0,
            "blockingCandidate": None, "blockingStreak": 0,
        })
        state["ts"] = time.time()
        laptop = _laptop_motion(laptop_frames) if require_laptop else {
            "available": True, "moved": True, "participantDetected": True,
            "pose_detected": True, "mode": "pose", "score": 0.0}
        pose_usable = _pose_confirms_participant(laptop)
        if pose_usable:
            state["poseSeen"] = True
            if laptop.get("moved"):
                state["poseMotionWindows"] += 1
        if require_laptop and self.yolo and laptop_frames:
            webcam = self.decode_frame(laptop_frames[-1])
            if webcam is not None:
                people = [item for item in self._yolo_detections(webcam)
                          if item.get("class_name") == "person" and item.get("confidence", 0) >= 0.45]
                state["webcamPersonSeen"] = state["webcamPersonSeen"] or bool(people)
                state["webcamMultiplePersons"] = state["webcamMultiplePersons"] or len(people) > 1
        observations, detected_objects = [], set()
        readings = orientations or []
        blocking_types = {"additional person"}
        if block_objects:
            blocking_types.update({"additional phone", "tablet", "second laptop", "visible notes / book"})
        transition = None
        restarted = False
        last_issue = None
        usable_frames = 0
        for index, encoded in enumerate(frames[-DEFAULT_MAX_FRAMES:]):
            frame = self.decode_frame(encoded)
            if frame is None:
                last_issue = "INVALID_IMAGE"
                continue
            frame, gray, metrics = self._prepare(frame)
            if metrics.get("reason") is not None:
                last_issue = "LOW_IMAGE_QUALITY"
                continue
            reading = _orientation_reading(readings[index]) if index < len(readings) else None
            usable_frames += 1
            signature = _visual_signature(gray)
            descriptor = _scene_descriptor(gray)
            features = _feature_descriptor(gray)
            thumb = _thumbnail(gray)
            detections = self._yolo_detections(frame)
            detected_objects.update(item.get("class_name") for item in detections)
            frame_observations = self._observations(detections, frame.shape)
            observations.extend(frame_observations)
            blocked = next((item for item in frame_observations
                            if item.get("objectType") in blocking_types), None)
            state["samples"] += 1
            view = {"visualSignature": signature, "sceneDescriptor": descriptor,
                    "featureDescriptor": features, "thumb": thumb,
                    "sampledFrame": encoded, "yaw": reading["yaw"] if reading else None,
                    "qualityScore": metrics.get("qualityScore"), "detections": detections}
            if state["pending"] is not None:
                pending = state["pending"]
                same_area = _reference_similarity(signature, descriptor, features, pending["view"]) >= same_area_threshold
                if blocked or not same_area:
                    state["pendingClean"] = 0
                    last_issue = "OBJECT_STILL_PRESENT" if blocked else "SHOW_SAME_AREA"
                else:
                    state["pendingClean"] += 1
                    if state["pendingClean"] >= clear_frames:
                        transition = {"type": "CLEARED", "sector": pending["sector"],
                                      "objectType": pending["objectType"], "frameIndex": index,
                                      "sameAreaSimilarity": _reference_similarity(signature, descriptor, features, pending["view"]),
                                      "clearFrames": state["pendingClean"], "qualityScore": metrics.get("qualityScore")}
                        self.scan_states.pop(state_key, None)
                        restarted = True
                continue
            candidate_type = blocked.get("objectType") if blocked else None
            if candidate_type and candidate_type == state["blockingCandidate"]:
                state["blockingStreak"] += 1
            else:
                state["blockingCandidate"] = candidate_type
                state["blockingStreak"] = 1 if candidate_type else 0
            if blocked and state["blockingStreak"] >= detection_frames:
                sector = min(4, len(state["sectors"]))
                state["pending"] = {"objectType": candidate_type, "sector": sector, "view": view}
                transition = {"type": "DETECTED", "sector": sector,
                              "objectType": candidate_type, "frameIndex": index,
                              "confidence": blocked.get("confidence", 0)}
                last_issue = "OBJECT_DETECTED"
                continue
            if 0 not in state["sectors"]:
                left_score = _reference_similarity(signature, descriptor, features, reference_map.get("left", {}))
                if left_score < reference_threshold:
                    last_issue = "START_AT_LEFT"
                    continue
                state["sectors"][0] = view
                state["mode"] = "orientation" if reading else "visual_baseline"
                state["startYaw"] = reading["yaw"] if reading else None
                state["lastYaw"] = reading["yaw"] if reading else None
                state["visualFramesSinceSector"] = 0
                continue
            if state["mode"] == "orientation" and reading is None:
                # Mobile browsers on an insecure LAN may omit deviceorientation.
                # Continue from the already verified left view using ordered
                # visual anchors instead of pinning progress at zero forever.
                state["mode"] = "visual_baseline"
                state["visualFramesSinceSector"] = 0
                state["visualContinuity"] = max(state["visualContinuity"], len(state["sectors"]) - 1)
            if state["mode"] == "orientation":
                delta = _angular_delta(state["lastYaw"], reading["yaw"])
                state["lastYaw"] = reading["yaw"]
                if abs(delta) > 60:
                    last_issue = "TURN_SLOWLY"
                    continue
                if state["direction"] == 0 and abs(delta) >= 5:
                    state["direction"] = 1 if delta > 0 else -1
                if state["direction"] and delta * state["direction"] < -7:
                    last_issue = "WRONG_DIRECTION"
                    continue
                state["travel"] = min(210.0, state["travel"] + max(0.0, delta * state["direction"]))
            else:
                state["visualFramesSinceSector"] += 1
            thresholds = (0, 30, 70, 110, 150)
            next_sector = len(state["sectors"])
            if next_sector >= 5:
                continue
            if state["mode"] == "orientation" and state["travel"] < thresholds[next_sector]:
                continue
            if state["mode"] == "visual_baseline" and state["visualFramesSinceSector"] < 2:
                continue
            anchors = (("left",), ("left", "front"), ("front",),
                       ("front", "right"), ("right",))[next_sector]
            score = max((_reference_similarity(signature, descriptor, features, reference_map.get(name, {}))
                         for name in anchors), default=0.0)
            previous = state["sectors"][next_sector - 1]
            if next_sector in (2, 4) and score < reference_threshold:
                last_issue = "ROOM_MISMATCH"
                continue
            if state["mode"] == "visual_baseline":
                continuity = _reference_similarity(signature, descriptor, features, previous)
                if continuity < 0.35 or (next_sector in (1, 3) and score < 0.50):
                    last_issue = "VISUAL_CONTINUITY"
                    continue
            if _visual_difference(thumb, previous["thumb"]) < 0.025:
                last_issue = "MOVE_FURTHER"
                continue
            state["sectors"][next_sector] = view
            if state["mode"] == "visual_baseline":
                state["visualContinuity"] += 1
            state["visualFramesSinceSector"] = 0

        if restarted:
            state["sectors"] = {}
            state["travel"] = 0.0
            state["direction"] = 0
            state["mode"] = None
            state["visualFramesSinceSector"] = 0
            state["visualContinuity"] = 0
            state["pending"] = None
            state["poseSeen"] = False
            state["poseMotionWindows"] = 0
            state["webcamPersonSeen"] = False
        sectors = [{"sector": number, "label": label,
                    "verified": number in state["sectors"],
                    "yaw": state["sectors"].get(number, {}).get("yaw")}
                   for number, label in enumerate(labels)]
        verified = len(state["sectors"])
        pending = state["pending"]
        pose_pass = not require_laptop or (state["poseSeen"] and state["poseMotionWindows"] >= 1
                                           and state["webcamPersonSeen"] and not state["webcamMultiplePersons"])
        direction_covered = (state["travel"] >= 150 if state["mode"] == "orientation"
                             else state["mode"] == "visual_baseline" and state["visualContinuity"] >= 4)
        sweep_covered = verified == 5 and direction_covered and not pending and pose_pass
        sampled = [state["sectors"].get(number, {}) for number in range(5)]
        comparisons = []
        for number, names in enumerate((("left",), ("left", "front"), ("front",),
                                        ("front", "right"), ("right",))):
            item = sampled[number]
            choices = [(name, _reference_similarity(item.get("visualSignature", ""),
                         item.get("sceneDescriptor", ""), item.get("featureDescriptor", ""),
                         reference_map.get(name, {}))) for name in names]
            match, score = max(choices, key=lambda pair: pair[1])
            comparisons.append({"sector": labels[number], "similarity": score,
                                "matchedReference": match,
                                "status": "PASS" if item and score >= reference_threshold else
                                          "LOW_MATCH" if item else "PENDING"})
        anchor_scores = [comparisons[number]["similarity"] for number in (0, 2, 4)]
        overall = round(sum(anchor_scores) / 3, 4)
        baseline_pass = all(score >= reference_threshold for score in anchor_scores)
        baseline_results = []
        for name in CAPTURE_STEPS:
            choices = [(number, _reference_similarity(item.get("visualSignature", ""),
                         item.get("sceneDescriptor", ""), item.get("featureDescriptor", ""),
                         reference_map.get(name, {}))) for number, item in enumerate(sampled)]
            best_sector, best_score = max(choices, key=lambda pair: pair[1])
            baseline_results.append({"step": name, "bestSector": best_sector,
                                     "bestSimilarity": best_score,
                                     "role": "directional_gate" if name in required else "context"})
        computer_sectors, prohibited = [], []
        if sweep_covered:
            for number, item in enumerate(sampled):
                reviewed = self.decode_frame(item["sampledFrame"])
                if reviewed is None:
                    raise RuntimeError("Recorded 180 sector frame is unavailable")
                detections = self._yolo_detections(reviewed)
                names = {det.get("class_name") for det in detections if det.get("confidence", 0) >= 0.45}
                if "laptop" in names or (names & {"monitor", "tv", "tv monitor"} and names & {"keyboard", "mouse"}):
                    computer_sectors.append(number)
                prohibited.extend(obs for obs in self._observations(detections, reviewed.shape)
                                  if obs.get("objectType") in blocking_types)
        checks = {"coverage": sweep_covered, "baseline": baseline_pass,
                  "person": state["webcamPersonSeen"] if require_laptop else True,
                  "computer": bool(computer_sectors),
                  "unauthorizedObjects": not prohibited and not state["webcamMultiplePersons"]}
        passed = sweep_covered and all(checks.values()) and bool(self.yolo)
        report = {"result": "PASS" if passed else "FAIL" if sweep_covered else "PENDING",
                  "checks": checks, "reviewedSectors": 5 if sweep_covered else 0,
                  "arcDegrees": 180, "computerSectors": computer_sectors,
                  "prohibitedObjects": prohibited[:20],
                  "baselineResults": baseline_results,
                  "personSource": "laptop_webcam_mediapipe_yolo" if pose_pass else None,
                  "coverageMode": state["mode"]}
        rescan = sweep_covered and not passed
        if rescan:
            self.scan_states.pop(state_key, None)
        if restarted:
            message = "Object removed. Start the 180 degree scan again from the left."
            guide = "scan_restarted"
        elif pending:
            message = "Remove the detected object and show the same area clearly."
            guide = "remove_object"
        elif verified == 0:
            message = "Point at the saved left room view to begin the 180 degree scan."
            guide = "start_left"
        elif verified < 5:
            message = f"Continue slowly toward the right. Next: {labels[verified]}."
            guide = "continue_right"
        elif not pose_pass:
            message = "Keep yourself visible in the laptop camera and move your phone slowly to confirm the turn."
            guide = "laptop_motion_missing"
        elif rescan:
            message = "The room scan did not match the verified photos or failed object review. Start again from the left."
            guide = "room_mismatch"
        else:
            message = "180 degree room scan verified. Show your hand and laptop next."
            guide = "scan_complete"
        if last_issue and not passed and not pending and not restarted and verified < 5:
            details = {"START_AT_LEFT": "Point at the saved left room view to begin.",
                       "TURN_SLOWLY": "Turn more slowly so the camera covers each area.",
                       "WRONG_DIRECTION": "Continue from left through front toward right; do not turn back.",
                       "ROOM_MISMATCH": "This view differs from the saved room photo. Show the same area clearly.",
                       "VISUAL_CONTINUITY": "Keep the same room area in view while turning slowly toward the next saved view.",
                       "MOVE_FURTHER": "Move the phone farther to show a different area."}
            message = details.get(last_issue, message)
            guide = {"START_AT_LEFT": "start_left", "TURN_SLOWLY": "slow_down",
                     "WRONG_DIRECTION": "wrong_direction",
                     "ROOM_MISMATCH": "room_mismatch",
                     "VISUAL_CONTINUITY": "visual_continuity",
                     "MOVE_FURTHER": "move_further"}.get(last_issue, guide)
        return {"success": True, "step": "scan180", "arcDegrees": 180,
                "complete": passed, "sweepCovered": sweep_covered,
                "verdict": "PASS" if passed else "FLAG" if (pending or restarted) else "RETRY",
                "failureReason": last_issue,
                "detectorAvailable": bool(self.yolo), "coverage": verified * 20,
                "samplesSeen": state["samples"], "similarityReport": {
                    "overallSimilarity": overall, "threshold": reference_threshold,
                    "result": "PASS" if baseline_pass and sweep_covered else "FAIL" if sweep_covered else "PENDING",
                    "sectorResults": comparisons},
                "postScanReport": report, "sampledFrames": [item["sampledFrame"] for item in sampled] if sweep_covered else [],
                "objectTransition": transition, "usableFrames": usable_frames,
                "accumulatedSweep": round(state["travel"], 1),
                "maxForwardSweep": round(state["travel"], 1),
                "mode": state["mode"] or "visual_baseline", "sectors": sectors,
                "missingSectors": [item["label"] for item in sectors if not item["verified"]],
                "motionEvidence": {"phoneDirection": state["direction"],
                                   "visualContinuity": state["visualContinuity"],
                                   "laptopPose": laptop},
                "currentDirection": labels[min(verified, 4)],
                "pendingObject": {"sector": pending["sector"], "label": labels[pending["sector"]],
                                  "objectType": pending["objectType"]} if pending else None,
                "restarted": restarted, "rescanRequired": rescan,
                "guideKey": guide, "message": message, "taMessage": None,
                "laptopMovement": laptop, "laptopMovementScore": float(laptop.get("score") or 0),
                "observations": observations[:20], "detectedObjects": sorted(detected_objects)}

    def analyze_360(
        self,
        frames: List[str],
        session_id: str,
        orientations: Optional[List[Optional[Dict[str, Any]]]] = None,
        block_objects: bool = True,
        laptop_frames: Optional[List[str]] = None,
        require_laptop: bool = False,
        references: Optional[List[Dict[str, Any]]] = None,
        reference_threshold: float = DEFAULT_REFERENCE_SIMILARITY,
        detection_frames: int = 2,
        clear_frames: int = 3,
        same_area_threshold: float = 0.65,
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
            "reverseStreak": 0, "reverseTravel": 0.0, "lastMotion": None,
            "maxForwardTravel": 0.0, "closingStreak": 0,
            "reverseSectorStreak": 0, "closureBySequence": False,
            "blockingCandidate": None, "blockingStreak": 0,
            "blurStreak": 0, "upperWeak": 0, "lowerWeak": 0, "closed": False,
            "orientationMisses": 0,
            "lastVerifiedCount": 0, "stagnantBatches": 0,
            "laptopMotionUntil": 0.0, "laptopConfirmedWindows": 0,
            "webcamPersonSeen": False, "webcamMultiplePersons": False,
            "postReviewAt": None,
        })
        # Keep in-process sessions compatible when the scanner is hot reloaded.
        for key, default in (("maxForwardTravel", 0.0), ("closingStreak", 0),
                             ("reverseSectorStreak", 0), ("closureBySequence", False),
                             ("blockingCandidate", None), ("blockingStreak", 0)):
            state.setdefault(key, default)
        state["ts"] = time.time()
        laptop = _laptop_motion(laptop_frames) if require_laptop else {"available": True, "moved": True, "score": 0.0}
        if require_laptop and laptop["moved"]:
            state["laptopMotionUntil"] = time.time() + 4.0
            state["laptopConfirmedWindows"] += 1
        # Validate a batch against its accompanying laptop evidence once.
        # CPU inference may take longer than four seconds; processing time
        # must not invalidate evidence supplied with these same mobile frames.
        laptop_motion_confirmed = (not require_laptop or laptop["moved"] or
                                   time.time() <= state["laptopMotionUntil"])
        # A changing webcam image is movement evidence, not evidence that the
        # candidate is present. Keep looking until a real person is detected.
        if require_laptop and self.yolo and not state["webcamPersonSeen"] and laptop_frames:
            webcam = self.decode_frame(laptop_frames[-1])
            if webcam is not None:
                people = [item for item in self._yolo_detections(webcam)
                          if item["class_name"] == "person" and item["confidence"] >= 0.45]
                state["webcamPersonSeen"] = bool(people)
                state["webcamMultiplePersons"] = len(people) > 1
        observations: List[Dict[str, Any]] = []
        detected_objects: set = set()
        readings = orientations or []
        blocking_types = {"additional person"}
        if block_objects:
            blocking_types.update({"additional phone", "tablet", "second laptop", "visible notes / book"})
        reference_map = {item.get("step"): item for item in (references or [])
                         if isinstance(item, dict) and item.get("step") in CAPTURE_STEPS
                         and item.get("visualSignature") and item.get("sceneDescriptor")}
        object_transition = None
        usable_frames = 0
        reverify_failure = None

        for index, frame_data in enumerate(frames[-DEFAULT_MAX_FRAMES:]):
            img = self.decode_frame(frame_data)
            if img is None:
                continue
            img, gray, metrics = self._prepare(img)
            thumb = _thumbnail(gray)
            signature = _visual_signature(gray)
            scene_descriptor = _scene_descriptor(gray)
            feature_descriptor = _feature_descriptor(gray)
            reading = _orientation_reading(readings[index]) if index < len(readings) else None
            detections = self._yolo_detections(img)
            detected_objects.update(det["class_name"] for det in detections)
            frame_observations = self._observations(detections, img.shape)
            observations.extend(frame_observations)
            observed_blocking = next((obs for obs in frame_observations if obs["objectType"] in blocking_types), None)
            state["samples"] += 1
            state["blurStreak"] = state["blurStreak"] + 1 if metrics["blurredHard"] else 0
            state["upperWeak"] = state["upperWeak"] + 1 if metrics["edgeTop"] < 0.025 else 0
            state["lowerWeak"] = state["lowerWeak"] + 1 if metrics["edgeLower"] < 0.012 else 0
            if metrics.get("reason") is not None:
                if state["pending"] is not None:
                    reverify_failure = "LOW_IMAGE_QUALITY"
                continue
            usable_frames += 1

            if state["pending"] is None:
                candidate_type = observed_blocking.get("objectType") if observed_blocking else None
                candidate_view = state.get("blockingCandidateView")
                same_candidate_area = not candidate_view or _reference_similarity(
                    signature, scene_descriptor, feature_descriptor, candidate_view) >= same_area_threshold
                if not same_candidate_area and reading and candidate_view and candidate_view.get("yaw") is not None:
                    same_candidate_area = abs(_angular_delta(candidate_view["yaw"], reading["yaw"])) <= 45.0
                if candidate_type and candidate_type == state.get("blockingCandidate") and same_candidate_area:
                    state["blockingStreak"] = state.get("blockingStreak", 0) + 1
                elif candidate_type:
                    state["blockingCandidate"] = candidate_type
                    state["blockingCandidateView"] = {"visualSignature": signature,
                        "sceneDescriptor": scene_descriptor, "featureDescriptor": feature_descriptor,
                        "yaw": reading["yaw"] if reading else None}
                    state["blockingStreak"] = 1
                else:
                    state["blockingCandidate"] = None
                    state["blockingCandidateView"] = None
                    state["blockingStreak"] = 0
                # A single uncertain YOLO frame cannot invalidate the entire
                # sweep. Require the same prohibited object in two consecutive
                # usable frames before entering the blocked state.
                blocking = observed_blocking if state["blockingStreak"] >= detection_frames else None
            else:
                blocking = observed_blocking

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
                state["reverseStreak"] = 0
                state["reverseTravel"] = 0.0
                state["maxForwardTravel"] = 0.0
                state["closingStreak"] = 0
                state["reverseSectorStreak"] = 0
                state["closureBySequence"] = False

            if state["mode"] == "orientation":
                state["orientationMisses"] = 0 if reading else state["orientationMisses"] + 1
                if state["orientationMisses"] >= 3:
                    state["mode"] = "visual"

            # Laptop-motion gate: without recent laptop-verified movement no new
            # sectors may accumulate. It must NEVER freeze the pending/restart
            # cycle (a blocked object's removal must still be detected after the
            # 4s window expires) nor the loop-closing frames once all sectors are
            # verified (otherwise the sweep is stuck at 87% forever).
            all_sectors_verified = (len(state["sectors"]) == 8
                                    and all(sector.get("verified") for sector in state["sectors"].values()))
            final_path_confirmed = (len([sector for sector in state["sectors"].values() if sector.get("verified")]) >= 7
                                    and state["laptopConfirmedWindows"] >= 2)
            if (state["pending"] is None and not all_sectors_verified and not final_path_confirmed
                    and require_laptop and len(state["sectors"]) >= 1
                    and not laptop_motion_confirmed):
                # Keep the visual baseline current while admission is paused.
                # Otherwise resuming compares unrelated views separated by
                # several seconds and cannot recover feature tracking.
                state["lastThumb"] = thumb.copy()
                state["lastGray"] = gray.copy()
                if reading:
                    state["lastYaw"] = reading["yaw"]
                continue

            # A prohibited object freezes the sweep. The affected sector is left
            # unverified, nothing accumulates, and once the object is removed the
            # ENTIRE 360 sweep restarts from 0% (sectors and travel wiped).
            if state["pending"] is not None:
                pending_view = state["sectors"].get(state["pending"], {})
                same_area_score = _reference_similarity(signature, scene_descriptor, feature_descriptor, pending_view)
                if same_area_score < same_area_threshold:
                    state["pendingClean"] = 0
                    reverify_failure = "WRONG_AREA"
                    state["lastThumb"] = thumb.copy()
                    state["lastGray"] = gray.copy()
                    continue
                if observed_blocking:
                    state["pendingClean"] = 0
                    reverify_failure = "OBJECT_STILL_PRESENT"
                    state["lastThumb"] = thumb.copy()
                    state["lastGray"] = gray.copy()
                    continue
                state["pendingClean"] += 1
                if state["pendingClean"] >= clear_frames:
                    object_transition = {"type": "CLEARED", "sector": state["pending"],
                                         "objectType": pending_view.get("blockedObject"),
                                         "frameIndex": index, "sameAreaSimilarity": same_area_score,
                                         "clearFrames": state["pendingClean"],
                                         "qualityScore": metrics.get("qualityScore")}
                    # Object removed: full 360 restart -- earlier sectors are
                    # deliberately discarded so the fresh sweep is re-verified.
                    state["sectors"] = {}
                    state["travel"] = 0.0
                    state["direction"] = 0
                    state["reverseStreak"] = 0
                    state["reverseTravel"] = 0.0
                    state["lastMotion"] = None
                    state["maxForwardTravel"] = 0.0
                    state["closingStreak"] = 0
                    state["reverseSectorStreak"] = 0
                    state["closureBySequence"] = False
                    state["blockingCandidate"] = None
                    state["blockingCandidateView"] = None
                    state["blockingStreak"] = 0
                    state["mode"] = None
                    state["startThumb"] = None
                    state["startSignature"] = None
                    state["startYaw"] = None
                    state["lastThumb"] = None
                    state["lastGray"] = None
                    state["lastYaw"] = None
                    state["closed"] = False
                    state["pending"] = None
                    state["pendingClean"] = 0
                    state["blurStreak"] = 0
                    state["upperWeak"] = 0
                    state["lowerWeak"] = 0
                    state["orientationMisses"] = 0
                    state["lastVerifiedCount"] = 0
                    state["stagnantBatches"] = 0
                    state["laptopMotionUntil"] = 0.0
                    state["laptopConfirmedWindows"] = 0
                    state["webcamPersonSeen"] = False
                    state["webcamMultiplePersons"] = False
                    state["postReviewAt"] = None
                    state["samples"] = 0
                    state["restarted"] = True
                    # A restart is a hard transaction boundary. Do not process
                    # any remaining frames from the pre-restart batch.
                    break
                state["lastThumb"] = thumb.copy()
                state["lastGray"] = gray.copy()
                continue

            previous = state["lastThumb"]
            visual_change = _visual_difference(previous, thumb) if previous is not None else 1.0
            target = 0
            motion_supported = False
            continuity_supported = False
            if state["mode"] == "orientation":
                if not reading:
                    continue
                delta = _angular_delta(state["lastYaw"], reading["yaw"])
                state["lastYaw"] = reading["yaw"]
                if 2.0 <= abs(delta) <= 65.0 and visual_change >= 0.025:
                    motion_supported = True
                    continuity_supported = True
                    if state["direction"] == 0:
                        state["direction"] = 1 if delta > 0 else -1
                    if (delta > 0 and state["direction"] > 0) or (delta < 0 and state["direction"] < 0):
                        state["reverseStreak"] = 0
                        state["reverseTravel"] = 0.0
                        state["travel"] += abs(delta)
                    else:
                        state["reverseStreak"] += 1
                        state["reverseTravel"] += abs(delta)
                        if state["reverseStreak"] >= 2:
                            state["travel"] = max(0.0, state["travel"] - state["reverseTravel"])
                            state["reverseTravel"] = 0.0
                    state["lastMotion"] = {"source": "orientation", "delta": round(float(delta), 2)}
                state["maxForwardTravel"] = max(state["maxForwardTravel"], state["travel"])
                # Accumulated unwrapped travel handles the 359° -> 0° boundary;
                # raw yaw subtraction resets there and previously pinned coverage.
                target = min(7, max(0, int(state["travel"] // 45.0)))
            elif state["mode"] == "visual":
                target = 0
                if state["lastGray"] is not None:
                    orb_dx, orb_dy, orb_matches, orb_confidence = _orb_direction_displacement(state["lastGray"], gray)
                    phase_dx, phase_dy, response = _visual_direction_displacement(state["lastGray"], gray)
                    if orb_matches >= 8 and orb_confidence >= 0.025 and abs(orb_dx) >= 1.0:
                        dx, dy, motion_source = orb_dx, orb_dy, "features"
                        reliable = abs(dx) >= 1.0 and abs(dx) >= abs(dy) * 0.45
                    else:
                        dx, dy, motion_source = phase_dx, phase_dy, "correlation"
                        reliable = abs(dx) >= 1.5 and response >= 0.16
                    state["lastMotion"] = {"source": motion_source, "dx": round(float(dx), 2),
                                           "dy": round(float(dy), 2), "response": round(float(response), 3),
                                           "featureMatches": int(orb_matches),
                                           "featureConfidence": round(float(orb_confidence), 3)}
                    continuity_supported = (orb_matches >= 8 and orb_confidence >= 0.02 and visual_change >= 0.02)
                    # Check for genuine horizontal camera rotation (global translation across frame)
                    if reliable and visual_change >= 0.025:
                        motion_supported = True
                        est_deg = min(45.0, max(2.0, abs(dx) * 0.60))
                        if state["direction"] == 0:
                            state["direction"] = 1 if dx < 0 else -1
                        curr_dir = 1 if dx < 0 else -1
                        if curr_dir == state["direction"]:
                            state["reverseStreak"] = 0
                            state["reverseTravel"] = 0.0
                            state["travel"] += est_deg
                        else:
                            # One contrary estimate is common with exposure and
                            # foreground motion. Only a sustained reversal rolls
                            # back coverage, using the full accumulated reverse
                            # distance so back-and-forth motion cannot complete.
                            state["reverseStreak"] += 1
                            state["reverseTravel"] += est_deg
                            if state["reverseStreak"] >= 2:
                                state["travel"] = max(0.0, state["travel"] - state["reverseTravel"])
                                state["reverseTravel"] = 0.0
                        target = min(7, max(0, int(state["travel"] // 45.0)))
                    else:
                        # Stationary or local jitter: do not advance sector or travel
                        target = min(7, max(0, int(state["travel"] // 45.0))) if state["travel"] > 0 else 0
                    state["maxForwardTravel"] = max(state["maxForwardTravel"], state["travel"])

            # The closing arc naturally approaches the original FRONT scene.
            # Treat that similarity as loop evidence after sectors 0..6 were
            # reached in order. It must remain visually continuous from RIGHT;
            # a sudden replay of the first frame cannot satisfy this gate.
            final_sector_candidate = False
            first_seven_verified = all(state["sectors"].get(number, {}).get("verified") for number in range(7)) \
                and not state["sectors"].get(7, {}).get("verified")
            if first_seven_verified and state["maxForwardTravel"] >= 285.0:
                start_difference = _visual_difference(thumb, state["startThumb"])
                start_like = (_signature_distance(signature, state["startSignature"]) <= 22 or
                              start_difference <= 0.24)
                right_sector = state["sectors"][6]
                away_from_right = (not _same_scene(signature, scene_descriptor, right_sector) and
                                   _visual_difference(thumb, right_sector["thumb"]) >= 0.04)

                # A real reverse from RIGHT revisits established middle sectors.
                # Two consecutive strong revisits block the closure shortcut;
                # local feature sign noise by itself does not erase progress.
                revisits_middle = any(
                    _same_scene(signature, scene_descriptor, state["sectors"][number]) and
                    _visual_difference(thumb, state["sectors"][number]["thumb"]) <= 0.16
                    for number in range(1, 6)
                )
                if revisits_middle:
                    state["reverseSectorStreak"] += 1
                else:
                    state["reverseSectorStreak"] = max(0, state["reverseSectorStreak"] - 1)

                closure_motion = motion_supported and (state["mode"] == "orientation" or continuity_supported)
                if start_like and away_from_right and closure_motion and state["reverseSectorStreak"] < 2:
                    state["closingStreak"] += 1
                elif not start_like or not away_from_right:
                    state["closingStreak"] = max(0, state["closingStreak"] - 1)
                if state["closingStreak"] >= 2:
                    target = 7
                    final_sector_candidate = True

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
                    "featureDescriptor": feature_descriptor,
                    "thumb": thumb.copy(), "yaw": reading["yaw"] if reading else None,
                    "blockedObject": blocking["objectType"],
                })
                state["pending"] = blocked_sector
                state["pendingClean"] = 0
                object_transition = {"type": "DETECTED", "sector": blocked_sector,
                                     "objectType": blocking["objectType"], "frameIndex": index,
                                     "confidence": blocking.get("confidence"),
                                     "qualityScore": metrics.get("qualityScore")}
            elif not existing and target < 8:
                other_views = [sector for number, sector in state["sectors"].items() if number != target and sector.get("verified")]
                # Adjacent 45° sectors intentionally share local features, so
                # sector novelty uses the whole-frame hashes and pixels. ORB is
                # reserved here for proving continuity between frames.
                if target == 7 and final_sector_candidate:
                    # FRONT-RIGHT may overlap FRONT while closing the loop. It
                    # still has to be a continuous, different view from RIGHT.
                    right_sector = state["sectors"][6]
                    novel = (not _same_scene(signature, scene_descriptor, right_sector) and
                             _visual_difference(thumb, right_sector["thumb"]) >= 0.04)
                else:
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
                        "featureDescriptor": feature_descriptor,
                        "timestamp": time.time(), "thumb": thumb.copy(),
                        "yaw": reading["yaw"] if reading else None, "blockedObject": None,
                        "sampledFrame": frame_data,
                        "detections": detections,
                        "qualityScore": metrics.get("qualityScore")}
                    if target == 7 and final_sector_candidate:
                        state["closureBySequence"] = True

            # Eight sectors alone cannot complete a sweep. The candidate must
            # rotate through at least 330 deg of angular travel and return to the
            # initial scene after moving through every direction.
            if len(state["sectors"]) == 8 and all(sector.get("verified") for sector in state["sectors"].values()):
                loop_match = (_signature_distance(signature, state["startSignature"]) <= 18 or
                              _visual_difference(thumb, state["startThumb"]) <= 0.20)
                if state["mode"] == "orientation":
                    traversed = (state["maxForwardTravel"] >= 330.0 or
                                 (state["closureBySequence"] and state["maxForwardTravel"] >= 285.0))
                    home = reading and abs(_angular_delta(state["startYaw"], reading["yaw"])) <= 35.0
                    state["closed"] = state["closed"] or bool(traversed and (home or state["closureBySequence"]) and loop_match)
                else:
                    traversed = (state["maxForwardTravel"] >= 330.0 or
                                 (state["closureBySequence"] and state["maxForwardTravel"] >= 285.0))
                    home = (target == 0 or target == 7)
                    state["closed"] = state["closed"] or bool(traversed and home and loop_match and visual_change >= 0.025)
            state["lastThumb"] = thumb.copy()
            state["lastGray"] = gray.copy()

        restarted = bool(state.pop("restarted", False))
        if state["direction"] > 0:
            labels = ("Front", "Front-right", "Right", "Back-right", "Back",
                      "Back-left", "Left", "Front-left")
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
        laptop_confirmed = not require_laptop or state["laptopConfirmedWindows"] >= 2
        sweep_covered = bool(state["closed"] and not missing and state["pending"] is None and laptop_confirmed)
        if sweep_covered and state.get("postReviewAt") is None:
            # Post-scan inference is a separate, one-time pass over the eight
            # recorded sector JPEGs. A detector failure aborts the request;
            # it can never turn into an empty/clear room verdict.
            for number in range(8):
                sector = state["sectors"][number]
                recorded = self.decode_frame(sector.get("sampledFrame"))
                if recorded is None:
                    raise RuntimeError("Recorded 360 sector frame is unavailable")
                sector["reviewDetections"] = self._yolo_detections(recorded)
            state["postReviewAt"] = time.time()
        near_side, far_side = ("right", "left") if state["direction"] > 0 else ("left", "right")
        reference_choices = {
            0: ("front",), 1: ("front", near_side), 2: (near_side,),
            3: (near_side, "bottom", "desk"), 4: CAPTURE_STEPS,
            5: (far_side, "bottom", "desk"), 6: (far_side,),
            7: (far_side, "front"),
        }
        sector_results = []
        for number, label in enumerate(labels):
            sector_view = state["sectors"].get(number, {})
            choices = [(name, _reference_similarity(sector_view.get("visualSignature", ""),
                        sector_view.get("sceneDescriptor", ""), sector_view.get("featureDescriptor", ""),
                        reference_map[name])) for name in reference_choices[number] if name in reference_map]
            best_name, best_score = max(choices, key=lambda pair: pair[1]) if choices else (None, 0.0)
            sector_results.append({"sector": label, "similarity": best_score,
                                   "matchedReference": best_name, "status":
                                   "PASS" if sector_view.get("verified") and best_score >= reference_threshold
                                   else "LOW_MATCH" if sector_view.get("verified") else "PENDING"})
        anchor_scores = [sector_results[number]["similarity"] for number in (0, 2, 6)]
        baseline_results = []
        for name in CAPTURE_STEPS:
            comparisons = []
            if name in reference_map:
                comparisons = [(number, _reference_similarity(
                    state["sectors"].get(number, {}).get("visualSignature", ""),
                    state["sectors"].get(number, {}).get("sceneDescriptor", ""),
                    state["sectors"].get(number, {}).get("featureDescriptor", ""),
                    reference_map[name])) for number in range(8)]
            best_sector, best_similarity = max(comparisons, key=lambda item: item[1]) if comparisons else (None, 0.0)
            baseline_results.append({"step": name, "bestSector": best_sector,
                                     "bestSimilarity": round(best_similarity, 4),
                                     "role": "directional_gate" if name in ("front", "left", "right")
                                     else "context"})
        # FRONT/LEFT/RIGHT are the three baseline shots with a reliable yaw
        # correspondence. BOTTOM and DESK are pitched views; forcing every
        # horizontal sector to match them would make a legitimate room fail.
        overall_similarity = round(sum(anchor_scores) / 3, 4)
        # Review the complete set of retained sector samples only after the
        # physical sweep closes. The detector observations were produced from
        # these exact frames as they arrived; no elapsed-time gate can pass.
        required_refs = set(CAPTURE_STEPS)
        reference_pass = sweep_covered and required_refs.issubset(reference_map) and all(
            sector_results[number]["similarity"] >= reference_threshold for number in (0, 2, 6))
        sampled = [state["sectors"].get(number, {}) for number in range(8)]
        computer_sectors = []
        for number, sector in enumerate(sampled):
            names = {det.get("class_name") for det in sector.get("reviewDetections", [])
                     if det.get("confidence", 0) >= 0.45}
            if "laptop" in names or (names & {"monitor", "tv", "tv monitor"}
                                     and names & {"keyboard", "mouse"}):
                computer_sectors.append(number)
        sampled_observations = [obs for sector in sampled for obs in
                                self._observations(sector.get("reviewDetections", []))]
        prohibited = [obs for obs in sampled_observations if obs.get("objectType") in blocking_types]
        samples_recorded = sweep_covered and all(sector.get("sampledFrame") for sector in sampled)
        checks = {
            "coverage": sweep_covered and samples_recorded,
            "baseline": reference_pass,
            "person": bool(state["webcamPersonSeen"]) if require_laptop else True,
            "computer": bool(computer_sectors),
            "unauthorizedObjects": not prohibited and not state["webcamMultiplePersons"],
        }
        post_scan_pass = sweep_covered and all(checks.values())
        post_scan_report = {
            "result": "PASS" if post_scan_pass else "FAIL" if sweep_covered else "PENDING",
            "checks": checks,
            "reviewedSectors": 8 if samples_recorded else 0,
            "reviewedAt": state.get("postReviewAt"),
            "computerSectors": computer_sectors,
            "personSource": "laptop_webcam_yolo" if state["webcamPersonSeen"] else None,
            "prohibitedObjects": prohibited[:20],
            "baselineResults": baseline_results,
        }
        complete = bool(post_scan_pass)
        rescan_required = sweep_covered and bool(reference_map) and (not reference_pass or not computer_sectors or
                                             bool(prohibited) or state["webcamMultiplePersons"])
        coverage = 100 if complete else min(87, round(verified_count * 100 / 8))
        pending = None
        failure_reason = None
        if state["pending"] is not None:
            number = state["pending"]
            pending = {"sector": number, "label": labels[number],
                       "objectType": state["sectors"][number]["blockedObject"]}

        if restarted:
            guide_key = "scan_restarted"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif pending:
            if reverify_failure == "WRONG_AREA":
                guide_key = "show_same_area"
                message = "Please show the same area clearly for verification."
                ta_message = "சரிபார்ப்புக்கு அதே பகுதியைத் தெளிவாகக் காட்டவும்."
            elif reverify_failure == "LOW_IMAGE_QUALITY":
                guide_key = "reverify_quality"
                message = "Please hold the phone steady and show the same area clearly."
                ta_message = "கைப்பேசியை அசையாமல் பிடித்து அதே பகுதியைத் தெளிவாகக் காட்டவும்."
            else:
                guide_key = "remove_object"
                message = "A prohibited object was detected. Please remove it and show this same area."
                ta_message = "அனுமதிக்கப்படாத பொருள் கண்டறியப்பட்டுள்ளது. அதை அகற்றி அதே பகுதியைக் காட்டவும்."
        elif rescan_required:
            guide_key = "room_mismatch" if not reference_pass else "show_desk" if not computer_sectors else "remove_object"
            failure_reason = "LOW_REFERENCE_SIMILARITY" if not reference_pass else "COMPUTER_NOT_VISIBLE" if not computer_sectors else "UNAUTHORIZED_OBJECT"
            message = ("Room does not match the verified photos. Please scan again." if not reference_pass else
                       "Show the working computer clearly during a new scan." if not computer_sectors else
                       "A prohibited object or extra person was seen. Remove it and scan again.")
            ta_message = "அறை சரிபார்ப்பு தோல்வியடைந்தது. மீண்டும் ஸ்கேன் செய்யவும்."
        elif sweep_covered and not checks["person"]:
            guide_key = "laptop_participant_not_visible"
            message = "Return to the laptop camera so your presence can be verified."
            ta_message = "உங்கள் இருப்பைச் சரிபார்க்க லேப்டாப் கேமராவுக்கு முன் திரும்பவும்."
        elif require_laptop and (not laptop["available"] or not laptop_motion_confirmed):
            # Three distinct failure modes need distinct help:
            #  - the laptop camera produced no usable frames at all
            #  - the participant is in the frame but not visible in it
            #  - the participant is visible but the motion was not confirmed.
            if not laptop["available"]:
                guide_key = "laptop_camera_required"
            elif laptop.get("participantDetected") is False:
                guide_key = "laptop_participant_not_visible"
            else:
                guide_key = "laptop_motion_missing"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif complete:
            guide_key = "scan_complete"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
        elif verified_count == 7 and not sectors[7]["verified"]:
            guide_key = "final_sector"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
            if state["reverseSectorStreak"] >= 2:
                failure_reason = "ROTATION_DIRECTION_REVERSED"
            elif not state.get("lastMotion"):
                failure_reason = "FINAL_SECTOR_MOTION_INSUFFICIENT"
            elif state["closingStreak"] == 0:
                failure_reason = "LOOP_CLOSURE_NOT_CONFIRMED"
            else:
                failure_reason = "FINAL_SECTOR_MOTION_INSUFFICIENT"
        elif state["mode"] == "visual" and state["stagnantBatches"] >= 3:
            guide_key = "rotation_unconfirmed"
            message, ta_message = self._m360(guide_key), self._m360(guide_key, tamil=True)
            failure_reason = "VISUAL_MOTION_UNCONFIRMED"
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
        report = {"overallSimilarity": overall_similarity, "threshold": reference_threshold,
                  "result": "PASS" if reference_pass else "FAIL" if sweep_covered else "PENDING",
                  "sectorResults": sector_results}
        if rescan_required:
            self.scan_states.pop(f"scan_{session_id}", None)
        return {"success": True, "step": "scan360", "complete": complete,
                "sweepCovered": sweep_covered,
                "detectorAvailable": bool(self.yolo),
                "coverage": coverage, "samplesSeen": state["samples"],
                "similarityReport": report, "rescanRequired": rescan_required,
                "postScanReport": post_scan_report,
                "sampledFrames": [sector["sampledFrame"] for sector in sampled] if sweep_covered else [],
                "objectTransition": object_transition, "usableFrames": usable_frames,
                "reverificationFailure": reverify_failure,
                "accumulatedSweep": round(state["travel"], 1),
                "maxForwardSweep": round(state["maxForwardTravel"], 1),
                "mode": state["mode"], "sectors": sectors, "missingSectors": missing,
                "motionEvidence": state.get("lastMotion"),
                "closingEvidence": {"streak": state["closingStreak"],
                                    "reverseSectorStreak": state["reverseSectorStreak"],
                                    "proved": bool(state["closureBySequence"])},
                "failureReason": failure_reason,
                "currentDirection": labels[max(state["sectors"]) if state["sectors"] else 0],
                "pendingObject": pending, "restarted": restarted, "guideKey": guide_key,
                "message": message, "taMessage": ta_message, "laptopMovement": laptop,
                "laptopMovementScore": round(float(laptop.get("score") or 0.0), 3),
                "observations": deduped[:20],
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
            "final_sector": "Continue slightly toward your starting view to capture Front-right and complete the circle.",
            "final_sector_ta": "முன்-வலது பகுதியை பதிவு செய்து சுற்றை முடிக்க, தொடங்கிய காட்சியை நோக்கி இன்னும் சிறிது சுழற்றவும்.",
            "coverage_incomplete": "Coverage is incomplete. Please continue rotating.",
            "coverage_incomplete_ta": "கவரேஜ் முழுமையடையவில்லை. தொடர்ந்து சுழற்றுங்கள்.",
             "laptop_motion_missing": "Movement could not be confirmed by the laptop camera. Please turn the phone slowly and try again.",
             "laptop_motion_missing_ta": "மடிக்கணினி கேமராவில் அசைவை உறுதிப்படுத்த முடியவில்லை. கைப்பேசியை மெதுவாகத் திருப்பி மீண்டும் முயற்சிக்கவும்.",
             "laptop_camera_required": "The laptop camera could not capture movement samples. Please allow camera access on the laptop and capture this photo again.",
             "laptop_camera_required_ta": "மடிக்கணினி கேமராவ் இயங்கும் நிகழ்வ்களைக் கைப்பறிய முடியவில்லை. மடிக்கணினியில் கேமரா அணுகலைக் கொடுங்கள் மீண்டும் படம் எடுக்கவும்.",
             "laptop_participant_not_visible": "You cannot be seen in the laptop camera. Step into the laptop camera's view and keep turning the phone slowly.",
            "laptop_participant_not_visible_ta": "மடிக்கணினி கேமராவில் உங்களைக் காண முடியவில்லை. மடிக்கணினி கேமராவின் பார்வையில் சென்று கைப்பேசியை மெதுவாகச் சுழற்றுங்கள்.",
            "movement_unconfirmed": "Movement could not be confirmed by the laptop camera. Please turn the phone slowly and try again.",
            "movement_unconfirmed_ta": "மடிக்கணினி கேமராவில் அசைவை உறுதிப்படுத்த முடியவில்லை. கைப்பேசியை மெதுவாகத் திருப்பி மீண்டும் முயற்சிக்கவும்.",
            "rotation_unconfirmed": "Camera movement could not be tracked. Keep the phone upright, point across the room, and turn slowly with overlapping views.",
            "rotation_unconfirmed_ta": "கேமரா அசைவைக் கண்காணிக்க முடியவில்லை. போனை நேராகப் பிடித்து அறையைக் காட்டுங்கள். முந்தைய காட்சியின் ஒரு பகுதி தெரியும்படி மெதுவாகச் சுழற்றுங்கள்.",
            "move_further": "Please move the camera further to the requested side.",
            "move_further_ta": "கேமராவை கேட்டுள்ள திசைக்கு இன்னும் நகர்த்தி மீண்டும் படம் எடுக்கவும்.",
            "mobile_turn_further": "Please point the mobile camera further to the left.",
            "mobile_turn_further_ta": "மொபைல் கேமராவை இன்னும் இடது பக்கம் திருப்பவும்.",
            "scan_complete": "360 degree room scan complete.",
            "scan_complete_ta": "360 டிகிரி அறை ஸ்கேன் நிறைவடைந்தது.",
            "scan_restarted": "Please return to the starting position. We will restart the room scan.",
            "scan_restarted_ta": "தொடக்க நிலைக்கு மீண்டும் திரும்புங்கள்.",
        }
        if tamil:
            return en.get(f"{key}_ta", en.get("coverage_incomplete_ta"))
        return en.get(key, en["coverage_incomplete"])

    def _message_for(self, step: str, guide_key: str, tamil: bool = False) -> str:
        en = {
            "front_ok": "Front view verified.",
            "left_ok": "Left side verified.",
            "right_ok": "Right side verified.",
            "bottom_ok": "Floor and lower area verified.",
            "desk_ok": "Workspace verified.",
            "front_poor": "Please point the phone straight ahead and show the area around your workspace.",
            "left_poor": "I can't clearly see the left side. Please move the phone a little further left.",
            "right_poor": "Please move the phone slightly further right.",
            "bottom_poor": "Please tilt the phone slightly further down.",
            "desk_poor": "Please point the phone towards your desk and show the complete workspace.",
            "blurred": "The view is blurry. Hold the phone still for a moment.",
            "too_dark": "The photo is too dark to see the room. Please switch on a light or move somewhere brighter.",
            "overexposed": "The photo is overexposed. Please avoid pointing the camera directly at a light.",
            "camera_blocked": "The camera lens appears to be covered. Please uncover it and take the photo again.",
            "resolution_low": "The photo resolution is too low. Please enable full-resolution capture and take the photo again.",
            "quality_low": "The photo has very little detail. Please move closer to the area and take the photo again.",
            "image_corrupt": "The photo could not be read properly. Please take the photo again.",
            "duplicate_image": "This is the same photo as before. Please move the phone and capture a new view.",
            "valid_room_view": "Room view captured successfully.",
            "move_to_area": "Please move the phone to the requested area and capture a new photo.",
            "move_further": "Please move the camera further to the requested side.",
            "move_left_further": "Please move further to the left. The current view is too similar to the previous view.",
            "move_right_further": "Please move further to the right. The current view is too similar to the previous view.",
            "movement_unconfirmed": "Movement could not be confirmed. Please move the phone toward the requested area and capture again.",
            "laptop_motion_missing": "Movement could not be confirmed by the laptop camera. Please turn the phone slowly and try again.",
            "laptop_camera_required": "The laptop camera could not capture movement samples. Please allow camera access on the laptop and capture this photo again.",
            "participant_missing": "Keep yourself visible in the laptop camera while moving the phone, then capture again.",
            "multiple_participants": "More than one person is visible in the laptop camera. Ensure you are alone and capture again.",
            "rotation_unconfirmed": "Camera movement could not be tracked. Keep the phone upright, point across the room, and turn slowly with overlapping views.",
            "mobile_turn_further": "Please point the mobile camera further to the left.",
            "image_invalid": "Please capture a clearer photo of the requested area.",
            "observed": "Additional object detected. This has been noted for review.",
        }
        ta = {
            "front_ok": "முன் காட்சி சரிபார்க்கப்பட்டது.",
            "left_ok": "இடது பக்கம் சரிபார்க்கப்பட்டது.",
            "right_ok": "வலது பக்கம் சரிபார்க்கப்பட்டது.",
            "bottom_ok": "தரை மற்றும் கீழ் பகுதி சரிபார்க்கப்பட்டது.",
            "desk_ok": "பணியிடம் சரிபார்க்கப்பட்டது.",
            "front_poor": "கைப்பேசியை நேராக முன்னோக்கி காட்டி உங்கள் பணியிடத்தைச் சுற்றியுள்ள பகுதியைக் காண்பியுங்கள்.",
            "left_poor": "இடது பக்கம் தெளிவாகத் தெரியவில்லை. கைப்பேசியை இன்னும் சிறிது இடது பக்கம் நகர்த்துங்கள்.",
            "right_poor": "கைப்பேசியை இன்னும் சிறிது வலது பக்கம் நகர்த்துங்கள்.",
            "bottom_poor": "கைப்பேசியை இன்னும் சிறிது கீழே சாய்த்துக் காட்டுங்கள்.",
            "desk_poor": "கைப்பேசியை உங்கள் மேசையை நோக்கிக் காட்டி முழு பணியிடத்தையும் காண்பியுங்கள்.",
            "blurred": "காட்சி தெளிவாக இல்லை. சிறிது நேரம் கைப்பேசியை நிலையாக வைத்திருங்கள்.",
            "too_dark": "அறையைப் பார்க்க புகைப்படம் மிகவும் இருளாக உள்ளது. ஒரு விளக்கை ஏற்றவும் அல்லது அதிக ஒளி உள்ள இடத்திற்குச் செல்லவும்.",
            "overexposed": "புகைப்படம் அதிக ஒளியால் மிகுந்துள்ளது. கேமராவை நேராக விளக்கின் மீது வைத்திருக்காதீர்கள்.",
            "camera_blocked": "கேமரா லென்ஸ் மூடப்பட்டுள்ளதுபோல் தெரிகிறது. லென்ஸை மூடாமல் திறந்து மீண்டும் படம் எடுக்கவும்.",
            "resolution_low": "புகைப்படத் தெளிவின் தரம் மிகவும் குறைவாக உள்ளது. முழு தெளிவில் படம் எடுக்கும் அமைப்பை இயக்கி மீண்டும் படம் எடுக்கவும்.",
            "quality_low": "புகைப்படத்தில் விவரங்கள் மிகக் குறைவாக உள்ளன. அருகில் சென்று மீண்டும் படம் எடுக்கவும்.",
            "image_corrupt": "புகைப்படத்தை சரியாகப் படிக்க முடியவில்லை. மீண்டும் படம் எடுக்கவும்.",
            "duplicate_image": "இது முந்தைய படத்தே உள்ளது. கைப்பேசியை நகர்த்து புதிய காட்சியைப் படம் எடுக்கவும்.",
            "valid_room_view": "அறைக் காட்சி வெற்றிகரமாக பதிவாகியது.",
            "move_to_area": "குறிப்பிட்ட பகுதியை தெளிவாகக் காட்ட கைப்பேசியை மாற்றி மீண்டும் புகைப்படம் எடுக்கவும்.",
            "move_further": "கேமராவை கேட்டுள்ள திசைக்கு இன்னும் நகர்த்தி மீண்டும் படம் எடுக்கவும்.",
            "move_left_further": "இன்னும் கொஞ்சம் இடது பக்கம் நகர்த்துங்கள். தற்போதைய காட்சி முந்தைய காட்சியைப் போலவே உள்ளது.",
            "move_right_further": "இன்னும் கொஞ்சம் வலது பக்கம் நகர்த்துங்கள். தற்போதைய காட்சி முந்தைய காட்சியைப் போலவே உள்ளது.",
            "movement_unconfirmed": "அசைவை உறுதிப்படுத்த முடியவில்லை. கைப்பேசியை குறிப்பிட்ட பகுதிக்கு நகர்த்தி மீண்டும் புகைப்படம் எடுக்கவும்.",
            "laptop_motion_missing": "மடிக்கணினி கேமராவில் அசைவை உறுதிப்படுத்த முடியவில்லை. கைப்பேசியை மெதுவாகத் திருப்பி மீண்டும் முயற்சிக்கவும்.",
            "laptop_camera_required": "மடிக்கணினி கேமராவில் இயக்கக் காட்சிகள் கிடைக்கவில்லை. மடிக்கணினியில் கேமரா அணுகலை அனுமதித்து இந்த புகைப்படத்தை மீண்டும் எடுக்கவும்.",
            "participant_missing": "கைப்பேசியை நகர்த்தும்போது மடிக்கணினி கேமராவில் நீங்கள் தெளிவாகத் தெரியும்படி வைத்து மீண்டும் படம் எடுக்கவும்.",
            "multiple_participants": "மடிக்கணினி கேமராவில் ஒன்றுக்கு மேற்பட்ட நபர்கள் தெரிகிறார்கள். நீங்கள் மட்டும் இருப்பதை உறுதி செய்து மீண்டும் படம் எடுக்கவும்.",
            "rotation_unconfirmed": "கேமரா அசைவைக் கண்காணிக்க முடியவில்லை. போனை நேராகப் பிடித்து அறையைக் காட்டுங்கள். முந்தைய காட்சியின் ஒரு பகுதி தெரியும்படி மெதுவாகச் சுழற்றுங்கள்.",
            "mobile_turn_further": "மொபைல் கேமராவை இன்னும் இடது பக்கம் திருப்பவும்.",
            "image_invalid": "கோரப்பட்ட பகுதியை தெளிவாக மீண்டும் புகைப்படம் எடுக்கவும்.",
            "observed": "கூடுதல் பொருள் கண்டறியப்பட்டது. இது மதிப்பாய்வுக்காக பதிவு செய்யப்பட்டது.",
        }
        table = ta if tamil else en
        return table.get(guide_key, en.get(guide_key, en["front_poor"]))


room_scanner = RoomScanEngine()
ROOM_SCANNER_INIT_ERROR = getattr(room_scanner, "init_error", None)
