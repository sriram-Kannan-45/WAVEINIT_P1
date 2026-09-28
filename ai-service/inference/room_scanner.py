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


def _laptop_motion(frames: Optional[List[str]]) -> Dict[str, Any]:
    """Check webcam samples for upper-body/arm/posture change without saving them."""
    pose_res: Optional[Dict[str, Any]] = None
    if laptop_pose_tracker is not None:
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
                "participantDetected": None, "multiplePersonsDetected": False, "personCount": 0}
    scores = []
    for before, after in zip(views, views[1:]):
        delta = after.astype(np.int16) - before.astype(np.int16)
        delta -= int(np.median(delta))  # ignore ordinary exposure changes
        scores.append(float(np.mean(np.abs(delta) > 17)))
    moved = sum(score >= 0.012 for score in scores) >= 2 or max(scores) >= 0.035
    return {"available": True, "moved": moved, "score": round(max(scores), 4),
            "pose_detected": False,
            "participantDetected": pose_res.get("participantDetected") if pose_res else None,
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

        detections = self._yolo_detections(frame)
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
            "reverseStreak": 0, "reverseTravel": 0.0, "lastMotion": None,
            "maxForwardTravel": 0.0, "closingStreak": 0,
            "reverseSectorStreak": 0, "closureBySequence": False,
            "blockingCandidate": None, "blockingStreak": 0,
            "blurStreak": 0, "upperWeak": 0, "lowerWeak": 0, "closed": False,
            "orientationMisses": 0,
            "lastVerifiedCount": 0, "stagnantBatches": 0,
            "laptopMotionUntil": 0.0, "laptopConfirmedWindows": 0,
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
            if metrics["blurredHard"] or metrics["brightness"] < 38 or metrics["noiseRatio"] > 0.78:
                continue

            if state["pending"] is None:
                candidate_type = observed_blocking.get("objectType") if observed_blocking else None
                if candidate_type and candidate_type == state.get("blockingCandidate"):
                    state["blockingStreak"] = state.get("blockingStreak", 0) + 1
                elif candidate_type:
                    state["blockingCandidate"] = candidate_type
                    state["blockingStreak"] = 1
                else:
                    state["blockingCandidate"] = None
                    state["blockingStreak"] = 0
                # A single uncertain YOLO frame cannot invalidate the entire
                # sweep. Require the same prohibited object in two consecutive
                # usable frames before entering the blocked state.
                blocking = observed_blocking if state["blockingStreak"] >= 2 else None
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
                if observed_blocking:
                    state["pendingClean"] = 0
                    state["lastThumb"] = thumb.copy()
                    state["lastGray"] = gray.copy()
                    continue
                state["pendingClean"] += 1
                if state["pendingClean"] >= 2:
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
                        "yaw": reading["yaw"] if reading else None, "blockedObject": None}
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
        complete = bool(state["closed"] and not missing and state["pending"] is None and laptop_confirmed)
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
            guide_key = "remove_object"
            message = "A prohibited object was detected. Please remove it from the room."
            ta_message = "அனுமதிக்கப்படாத பொருள் கண்டறியப்பட்டுள்ளது. அதை அகற்றவும்."
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
        return {"success": True, "step": "scan360", "complete": complete,
                "coverage": coverage, "samplesSeen": state["samples"],
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
