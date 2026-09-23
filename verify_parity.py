"""Compare normalized JavaScript and Python results for every contract case."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from verify import CORPUS, run_case, same


ROOT = Path(__file__).resolve().parent


def normalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: normalize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [normalize(item) for item in value]
    return value


def main() -> None:
    completed = subprocess.run(
        ["node", "verify.js", "--json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    javascript = {
        result["id"]: normalize(result["actual"])
        for result in json.loads(completed.stdout)
    }
    failures = []
    for case in CORPUS["cases"]:
        python_result = normalize(run_case(case))
        javascript_result = javascript.get(case["id"])
        if not same(python_result, javascript_result):
            failures.append((case["id"], python_result, javascript_result))

    for case_id, python_result, javascript_result in failures:
        print(f"FAIL {case_id}")
        print(f"  Python:     {json.dumps(python_result, ensure_ascii=False)}")
        print(f"  JavaScript: {json.dumps(javascript_result, ensure_ascii=False)}")
    print(
        f"{len(CORPUS['cases']) - len(failures)}/{len(CORPUS['cases'])} "
        "cross-language results match"
    )
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
