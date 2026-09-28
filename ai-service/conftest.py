"""Pytest bootstrap for the AI service.

`main.py` and the test-suite both import the service as top-level packages
(`inference.*`, and so on) with `ai-service/` as the working root. Running
`pytest` from the repository root would otherwise put the repository root on
`sys.path` instead, so those imports fail with `ModuleNotFoundError`. Adding this
directory keeps the tests runnable from either location.
"""

import os
import sys

SERVICE_ROOT = os.path.dirname(os.path.abspath(__file__))

if SERVICE_ROOT not in sys.path:
    sys.path.insert(0, SERVICE_ROOT)
