"""Hire-only mobile framing policy. It never uses person or body presence as a gate."""

import time

CONFIDENCE = 0.35
VALID_FRAMES = 2
LOSS_FRAMES = 3
MAX_FRAME_GAP = 5.0


def evaluate_hire_mobile(detections, hand_landmarks, width, height, state, now=None):
    now = time.monotonic() if now is None else now
    if now - state.get("sample_at", now) > MAX_FRAME_GAP:
        state.clear()
    state["sample_at"] = now
    area = max(1, width * height)

    def objects(names, min_area=0):
        found = []
        for item in detections:
            if item.get("class_name", "").lower() not in names or item.get("confidence", 0) < CONFIDENCE:
                continue
            x1, y1, x2, y2 = item.get("box", [0, 0, 0, 0])
            visible = max(0, min(width, x2) - max(0, x1)) * max(0, min(height, y2) - max(0, y1))
            if visible / area >= min_area:
                found.append(item)
        return found

    laptops = objects({"laptop"}, 0.02)
    persons = objects({"person"}, 0.04)
    phones = objects({"cell phone"})
    books = objects({"book"})
    tables = objects({"dining table"}, 0.03)

    # Side views can overlap both hands into one detected landmark set. A
    # reliable visible hand is enough for the hands-in-workspace signal.
    hands = []
    for landmarks in hand_landmarks or []:
        points = [(float(x), float(y)) for x, y in landmarks if 0 <= x <= 1 and 0 <= y <= 1]
        if len(points) >= 5:
            hands.append((sum(x for x, _ in points) / len(points), sum(y for _, y in points) / len(points)))
    hands_visible = bool(hands)

    # A table detection is useful but many real desks are not labeled as a
    # COCO dining table. Also accept a laptop with visible surrounding work
    # area and a hand near it, while rejecting a close-up filled by the laptop.
    workspace_visible = bool(tables)
    if laptops and hands_visible and not workspace_visible:
        x1, y1, x2, y2 = laptops[0]["box"]
        laptop_width = max(1, x2 - x1)
        laptop_area = max(0, x2 - x1) * max(0, y2 - y1) / area
        surrounding = max(x1, width - x2) >= width * 0.08 or height - y2 >= height * 0.08
        hand_near_laptop = any(
            (x1 - laptop_width * 0.5) / width <= x <= (x2 + laptop_width * 0.5) / width
            and y >= max(0, y1 / height - 0.15)
            for x, y in hands
        )
        workspace_visible = laptop_area <= 0.72 and surrounding and hand_near_laptop

    present = bool(laptops and hands_visible and workspace_visible)
    state["valid_frames"] = state.get("valid_frames", 0) + 1 if present else 0
    state["loss_frames"] = 0 if present else state.get("loss_frames", 0) + 1
    state["phone_frames"] = state.get("phone_frames", 0) + 1 if phones else 0
    if state["valid_frames"] >= VALID_FRAMES:
        state["eligible"] = True
    elif state["loss_frames"] >= LOSS_FRAMES:
        state["eligible"] = False
    eligible = bool(state.get("eligible", False))

    other = "MULTIPLE_FACES" if len(persons) > 2 else "SECONDARY_DEVICE" if len(laptops) > 1 else "BOOK_NOTES_DETECTED" if books else None
    state["other_frames"] = state.get("other_frames", 0) + 1 if other and state.get("other") == other else (1 if other else 0)
    state["other"] = other

    missing = None if present else "LAPTOP" if not laptops else "HANDS" if not hands_visible else "WORKSPACE"
    guidance = {
        "LAPTOP": ("WAITING_FOR_LAPTOP", "Please adjust the phone so your laptop is visible."),
        "HANDS": ("WAITING_FOR_HANDS", "Please keep both hands visible near your workspace."),
        "WORKSPACE": ("WAITING_FOR_WORKSPACE", "Please show your laptop and workspace clearly."),
    }
    composition, message = guidance[missing] if missing else (
        ("VALID", "Hands, laptop, and workspace visible.") if eligible else
        ("POSITIONING_REQUIRED", "Hold the camera steady while your workspace is verified."))

    return {
        "eligible": eligible,
        "framing_mode": "HIRE_WORKSPACE",
        "person_detected": bool(persons),  # observation only; never required
        "hand_count": len(hands),
        "hands_detected": hands_visible,
        "laptop_detected": bool(laptops),
        "workspace_detected": workspace_visible,
        "guidance_key": missing,
        "phone_stable": state["phone_frames"] >= VALID_FRAMES,
        "phone_confidence": max((p["confidence"] for p in phones), default=0),
        "composition_state": composition,
        "user_message": message,
        "in_loss_grace": eligible and not present,
        "other_violation": other if state["other_frames"] >= VALID_FRAMES else None,
        "other_confidence": max((item.get("confidence", 0) for item in detections), default=0),
    }
