"""Temporal policy for quiz/coding side-camera detections (no model or I/O)."""
import time

CONFIDENCE = 0.35
VALID_FRAMES = 2  # Existing composition confirmation window.
LOSS_FRAMES = 3   # Existing missing-object window, now actually retains validity.
MAX_FRAME_GAP = 5.0


def evaluate_mobile(detections, width, height, state, now=None):
    now = time.monotonic() if now is None else now
    if now - state.get("sample_at", now) > MAX_FRAME_GAP:
        state.clear()
    state["sample_at"] = now
    area = max(1, width * height)

    def objects(name, min_area=0):
        matches = []
        for item in detections:
            if item.get("class_name", "").lower() != name or item.get("confidence", 0) < CONFIDENCE:
                continue
            x1, y1, x2, y2 = item.get("box", [0, 0, 0, 0])
            visible_area = max(0, min(width, x2) - max(0, x1)) * max(0, min(height, y2) - max(0, y1))
            if visible_area / area >= min_area:
                matches.append(item)
        return matches

    # Border-touching boxes are allowed: reliable visible evidence matters,
    # not whether the whole body or laptop fits inside the frame.
    persons = objects("person", 0.04)
    laptops = objects("laptop", 0.02)
    phones = objects("cell phone")
    present = bool(persons and laptops)
    state["valid_frames"] = state.get("valid_frames", 0) + 1 if present else 0
    state["loss_frames"] = 0 if present else state.get("loss_frames", 0) + 1
    state["phone_frames"] = state.get("phone_frames", 0) + 1 if phones else 0
    if state["valid_frames"] >= VALID_FRAMES:
        state["eligible"] = True
    elif state["loss_frames"] >= LOSS_FRAMES:
        state["eligible"] = False
    eligible = bool(state.get("eligible", False))
    phone_stable = state["phone_frames"] >= VALID_FRAMES
    # Preserve the existing mobile multi-person (>2), extra-screen and book
    # rules while applying the same temporal confirmation as phone detection.
    other = "MULTIPLE_FACES" if len(persons) > 2 else "SECONDARY_DEVICE" if len(laptops) > 1 else "BOOK_NOTES_DETECTED" if objects("book") else None
    state["other_frames"] = state.get("other_frames", 0) + 1 if other and state.get("other") == other else (1 if other else 0)
    state["other"] = other
    composition = "VALID" if eligible else "POSITIONING_REQUIRED"
    message = "Person and laptop verified." if eligible else "Hold the camera steady while person and laptop are verified."
    if not eligible and not present:
        composition = "WAITING_FOR_PERSON" if not persons else "WAITING_FOR_LAPTOP"
        message = "Position the mobile camera to show both you and your laptop."
    return {
        "eligible": eligible,
        "person_detected": bool(persons),
        "laptop_detected": bool(laptops),
        "phone_stable": phone_stable,
        "phone_confidence": max((p["confidence"] for p in phones), default=0),
        "composition_state": composition,
        "user_message": message,
        "in_loss_grace": eligible and not present,
        "other_violation": other if state["other_frames"] >= VALID_FRAMES else None,
        "other_confidence": max((item.get("confidence", 0) for item in detections), default=0),
    }
