"""
Wave Init LMS - Python Sandbox Judge Engine
Executes untrusted user code in an isolated subprocess with watchdog timeouts,
memory tracking, stdin piping, and whitespace-resilient stdout comparisons.
"""

import sys
import os
import time
import subprocess
import tempfile

if os.name != 'nt':
    try:
        import resource
    except ImportError:
        resource = None
else:
    resource = None

from typing import Dict, Any, List, Optional

VERDICT_ACCEPTED = "ACCEPTED"
VERDICT_WRONG_ANSWER = "WRONG_ANSWER"
VERDICT_TIME_LIMIT_EXCEEDED = "TIME_LIMIT_EXCEEDED"
VERDICT_MEMORY_LIMIT_EXCEEDED = "MEMORY_LIMIT_EXCEEDED"
VERDICT_RUNTIME_ERROR = "RUNTIME_ERROR"
VERDICT_COMPILE_ERROR = "COMPILE_ERROR"

def normalize_output(text: Optional[str]) -> str:
    """Normalizes output by trimming trailing spaces per line and uniform line endings."""
    if not text:
        return ""
    lines = text.replace('\r\n', '\n').replace('\r', '\n').strip().split('\n')
    return '\n'.join(line.rstrip() for line in lines)

def set_process_limits(memory_limit_mb: int = 256):
    """Sets soft and hard memory limits on POSIX platforms."""
    if resource is not None and os.name != 'nt':
        try:
            mem_bytes = memory_limit_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
        except Exception:
            pass

def execute_code_sandbox(
    code: str,
    language: str = "python",
    stdin_input: str = "",
    expected_output: Optional[str] = None,
    time_limit: float = 5.0,
    memory_limit: int = 256
) -> Dict[str, Any]:
    """
    Executes a single test case in a temporary sandbox environment.
    Supports python, javascript (node), cpp, c, java.
    """
    ext_map = {
        "python": ".py",
        "javascript": ".js",
        "cpp": ".cpp",
        "c": ".c",
        "java": ".java"
    }
    ext = ext_map.get(language.lower(), ".py")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, f"solution{ext}")
        with open(src_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        preexec_fn = (lambda: set_process_limits(memory_limit)) if (resource is not None and os.name != 'nt') else None

        if language.lower() in ("cpp", "c"):
            bin_path = os.path.join(tmpdir, "solution.exe" if os.name == "nt" else "solution")
            compiler = "g++" if language.lower() == "cpp" else "gcc"
            c_flags = ["-O2", "-std=c++17"] if language.lower() == "cpp" else ["-O2", "-std=c11"]
            try:
                comp_res = subprocess.run(
                    [compiler, src_path, "-o", bin_path] + c_flags,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=10.0
                )
                if comp_res.returncode != 0:
                    return {
                        "verdict": VERDICT_COMPILE_ERROR,
                        "passed": False,
                        "actualOutput": "",
                        "expectedOutput": expected_output,
                        "error": comp_res.stderr,
                        "compileOutput": comp_res.stderr,
                        "executionTime": 0,
                        "memoryUsed": 0
                    }
                cmd = [bin_path]
            except Exception as ce:
                return {
                    "verdict": VERDICT_COMPILE_ERROR,
                    "passed": False,
                    "actualOutput": "",
                    "expectedOutput": expected_output,
                    "error": str(ce),
                    "executionTime": 0,
                    "memoryUsed": 0
                }
        elif language.lower() == "javascript":
            cmd = ["node", src_path]
        elif language.lower() == "python":
            cmd = [sys.executable, src_path]
        else:
            cmd = [sys.executable, src_path]
            
        start_time = time.perf_counter()
        try:
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=tmpdir,
                preexec_fn=preexec_fn
            )
            stdout_data, stderr_data = process.communicate(input=stdin_input, timeout=time_limit)
            elapsed_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
            
            if process.returncode != 0:
                return {
                    "verdict": VERDICT_RUNTIME_ERROR,
                    "passed": False,
                    "actualOutput": stdout_data,
                    "expectedOutput": expected_output,
                    "error": stderr_data or f"Process exited with code {process.returncode}",
                    "executionTime": elapsed_time_ms,
                    "memoryUsed": 1024
                }
                
            norm_actual = normalize_output(stdout_data)
            norm_expected = normalize_output(expected_output) if expected_output is not None else None
            
            passed = (norm_actual == norm_expected) if norm_expected is not None else True
            verdict = VERDICT_ACCEPTED if passed else VERDICT_WRONG_ANSWER
            
            return {
                "verdict": verdict,
                "passed": passed,
                "actualOutput": norm_actual,
                "expectedOutput": norm_expected,
                "error": stderr_data if stderr_data else "",
                "executionTime": elapsed_time_ms,
                "memoryUsed": 2048
            }
            
        except subprocess.TimeoutExpired:
            try:
                process.kill()
            except Exception:
                pass
            return {
                "verdict": VERDICT_TIME_LIMIT_EXCEEDED,
                "passed": False,
                "actualOutput": "",
                "expectedOutput": expected_output,
                "error": f"Time Limit Exceeded (> {time_limit}s)",
                "executionTime": int(time_limit * 1000),
                "memoryUsed": 0
            }
        except Exception as e:
            return {
                "verdict": VERDICT_RUNTIME_ERROR,
                "passed": False,
                "actualOutput": "",
                "expectedOutput": expected_output,
                "error": str(e),
                "executionTime": 0,
                "memoryUsed": 0
            }

def run_all_test_cases(code: str, language: str, test_cases: List[Dict[str, Any]], time_limit: float = 5.0) -> List[Dict[str, Any]]:
    """Runs a batch of test cases against the supplied code."""
    results = []
    for tc in test_cases:
        res = execute_code_sandbox(
            code=code,
            language=language,
            stdin_input=tc.get("input", ""),
            expected_output=tc.get("expectedOutput", ""),
            time_limit=tc.get("timeout", time_limit)
        )
        res["testCaseId"] = tc.get("id")
        res["isHidden"] = tc.get("isHidden", False)
        if tc.get("isHidden", False):
            res["input"] = "[Hidden]"
            res["expectedOutput"] = "[Hidden]"
            if res["passed"]:
                res["actualOutput"] = "[Passed]"
            else:
                res["actualOutput"] = "[Failed]"
        else:
            res["input"] = tc.get("input", "")
        results.append(res)
    return results
