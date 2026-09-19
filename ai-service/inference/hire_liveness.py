"""Temporal head-movement checks for the Hire identity gate.

Yaw is the nose offset in inter-eye distances in the raw (unmirrored) frame.
The first two observations precede the spoken movement instruction. Requiring
two adjacent target observations rejects a single noisy landmark reading.
"""

from statistics import median


def check_movement(observations, challenge, neutral_yaw=None, previous_yaw=None):
    if len(observations) < 4:
        return {"completed": False, "detectedMovement": None}

    yaw = [float(item["yaw"]) for item in observations]
    start = median(yaw[:2]) if previous_yaw is None else float(previous_yaw)
    neutral = start if neutral_yaw is None else float(neutral_yaw)
    target = yaw[2:]

    if challenge == "TURN_LEFT":
        # The raw webcam nose moves to image right when the person turns left.
        matches = [value - neutral >= 0.065 and value - start >= 0.055 for value in target]
        movement = "LEFT"
    elif challenge == "TURN_RIGHT":
        matches = [neutral - value >= 0.065 and start - value >= 0.055 for value in target]
        movement = "RIGHT"
    elif challenge == "LOOK_CENTER":
        # A center frame must follow a right-facing pose, not a static face.
        started_right = neutral - start >= 0.055
        matches = [started_right and abs(value - neutral) <= 0.045
                   and value - start >= 0.05 for value in target]
        movement = "CENTER"
    elif challenge == "BLINK":
        eyes = [float(item["eyeOpen"]) for item in observations]
        open_level = max(median(eyes[:2]), max(eyes) * 0.75)
        matches = [eyes[i] <= open_level * 0.65 and eyes[i + 1] >= open_level * 0.8
                   for i in range(2, len(eyes) - 1)]
        return {"completed": any(matches), "detectedMovement": "BLINK" if any(matches) else None,
                "neutralYaw": neutral}
    else:
        raise ValueError("Unsupported liveness challenge")

    pair = next((i for i, (left, right) in enumerate(zip(matches, matches[1:])) if left and right), None)
    completed = pair is not None
    return {"completed": completed, "detectedMovement": movement if completed else None,
            "neutralYaw": neutral,
            "poseYaw": median(target[pair:pair + 2]) if completed else None}
