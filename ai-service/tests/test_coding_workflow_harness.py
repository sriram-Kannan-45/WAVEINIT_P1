"""Offline harness to validate the LangGraph coding workflow node sequencing."""
import sys
import json
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import coding_workflow as cw


def make_invoke(fail_times=0):
    counter = {"regens": 0}

    def invoke_json(prompt):
        text = prompt
        low = text.lower()
        if "intent analyzer" in low:
            return {"primaryConcept": "loops", "concepts": ["loops"], "constructs": ["for-loop"],
                    "forbiddenConcepts": [], "ioNotes": "", "difficultyHint": "easy",
                    "problemIntent": "test loops"}
        if "prompt guard" in low:
            return {"isValid": True, "reasons": [], "normalizedPrompt": "print numbers 1 to N"}
        if "final prompt-alignment" in low or "alignment" in low:
            return {"isAligned": True, "offTopicProblems": [], "reasons": []}
        if "test-case validator" in low:
            return {"isValid": True, "reasons": []}
        if "validator" in low:
            return {"isValid": True, "reasons": []}
        if "requirements engineer" in low or "requirements" in low:
            ref_sol = "import sys\ndef solve():\n    n = int(sys.stdin.readline().strip())\n    print(' '.join(map(str, range(1, n + 1))))\n\nif __name__ == '__main__':\n    solve()\n"
            starter = "import sys\n\ndef solve():\n    # Write your solution here\n    pass\n\nif __name__ == '__main__':\n    solve()\n"
            return {"languages": [{"language": "python", "starterCode": starter, "referenceSolution": ref_sol}],
                    "inputFormat": "N", "outputFormat": "line", "constraints": "c", "marks": 10,
                    "timeLimit": 5, "memoryLimit": 256, "starterCode": starter, "expectedSolution": ref_sol}
        if "test-case author" in low:
            return {"testCases": [
                {"input": "3", "expectedOutput": "1 2 3", "isHidden": False, "description": "sample"},
                {"input": "5", "expectedOutput": "1 2 3 4 5", "isHidden": False, "description": "five"},
                {"input": "1", "expectedOutput": "1", "isHidden": True, "description": "min"},
                {"input": "0", "expectedOutput": "", "isHidden": True, "description": "degenerate"},
            ]}
        if "problem author" in low:
            counter["regens"] += 1
            if counter["regens"] == 1 and fail_times > 0:
                # Force a bad draft that validation will reject -> triggers regen
                return {"problems": [{"title": "", "description": "short",
                                      "languages": [], "testCases": [],
                                      "tags": ["loops"]}]}
            return {"problems": [{
                "title": "Print 1 to N",
                "description": "Read N and print all numbers from 1 to N on a single line.",
                "difficulty": "EASY", "inputFormat": "single integer N",
                "outputFormat": "numbers 1..N space separated",
                "sampleInput": "3", "sampleOutput": "1 2 3",
                "explanation": "loop from 1 to N",
                "constraints": "1<=N<=100", "marks": 10, "timeLimit": 5, "memoryLimit": 256,
                "tags": ["loops"], "starterCode": "def solve():\n    pass\n",
                "expectedSolution": "import sys\ndef solve():\n    n=int(input())\n    print(*range(1,n+1))\n",
                "languages": [{"language": "python", "starterCode": "def solve():\n    pass\n",
                               "referenceSolution": "import sys\ndef solve():\n    n=int(input())\n    print(*range(1,n+1))\n"}],
                "testCases": [],
            }]}
        return {}

    return invoke_json, counter


def fake_execute(code, language, stdin_input, expected_output, time_limit=5):
    return {"passed": True, "actualOutput": expected_output, "verdict": "ACCEPTED"}


def main():
    print("=== Scenario 1: clean generation ===")
    invoke, _ = make_invoke(fail_times=0)
    out = cw.run_coding_workflow("print numbers 1 to N", invoke, execute_fn=fake_execute,
                                 count=1, difficulty="EASY", languages=["python"],
                                 max_retries=3, debug=True)
    print("Title:", out["title"])
    print("Problems:", len(out["problems"]))
    print("TestCases:", len(out["problems"][0]["testCases"]))
    print("Hidden:", [tc["isHidden"] for tc in out["problems"][0]["testCases"]])
    print("Trace:", out["trace"])
    print("Attempts:", out["attempts"])
    assert len(out["problems"]) == 1
    assert any(tc["isHidden"] for tc in out["problems"][0]["testCases"])
    print("OK\n")

    print("=== Scenario 2: regeneration on validation failure ===")
    invoke2, counter2 = make_invoke(fail_times=1)
    out2 = cw.run_coding_workflow("print numbers 1 to N", invoke2, execute_fn=fake_execute,
                                  count=1, difficulty="EASY", languages=["python"],
                                  max_retries=3, debug=True)
    print("Attempts used:", out2["attempts"], "(expect 2)")
    print("Trace:", out2["trace"])
    assert out2["attempts"] == 2
    print("OK\n")

    print("=== Scenario 3: persistent failure -> honest error (NO static fallback) ===")
    def always_bad(prompt):
        low = prompt.lower()
        if "intent analyzer" in low:
            return {"primaryConcept": "x", "concepts": [], "constructs": [],
                    "forbiddenConcepts": [], "ioNotes": "", "difficultyHint": "",
                    "problemIntent": "x"}
        if "prompt guard" in low:
            return {"isValid": True, "reasons": [], "normalizedPrompt": "some loop task"}
        if "test-case author" in low:
            return {"testCases": []}
        if "problem author" in low:
            return {"problems": [{"title": "", "description": "bad",
                                  "languages": [], "testCases": [], "tags": []}]}
        if "validator" in low:
            return {"isValid": False, "reasons": ["always invalid"]}
        if "alignment" in low:
            return {"isAligned": False, "offTopicProblems": ["x"], "reasons": ["off topic"]}
        return {}
    try:
        cw.run_coding_workflow("some loop task", always_bad, execute_fn=fake_execute,
                               count=1, difficulty="EASY", languages=["python"], max_retries=2)
        print("ERROR: expected a RuntimeError")
        sys.exit(1)
    except RuntimeError as e:
        print("Got expected RuntimeError:", str(e)[:120])
        print("OK\n")

    print("=== Scenario 4: empty LLM result -> honest error (no zero-problem success) ===")
    def empty_invoke(prompt):
        return {}
    try:
        cw.run_coding_workflow("print numbers", empty_invoke, execute_fn=fake_execute,
                               count=1, difficulty="EASY", languages=["python"], max_retries=2)
        print("ERROR: expected a RuntimeError")
        sys.exit(1)
    except RuntimeError as e:
        print("Got expected RuntimeError:", str(e)[:120])
        print("OK\n")

    print("ALL SCENARIOS PASSED")


if __name__ == "__main__":
    main()
