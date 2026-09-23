"""Run the normative sUTL 1.0 corpus against the Python reference."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from reference import compilelib, evaluate


ROOT = Path(__file__).resolve().parent
CORPUS = json.loads((ROOT / "conformance.json").read_text(encoding="utf-8"))


def same(left: Any, right: Any) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(
            same(left[key], right[key]) for key in left
        )
    if isinstance(left, list):
        return len(left) == len(right) and all(
            same(a, b) for a, b in zip(left, right)
        )
    return left == right


def bundle_library(bundle: dict[str, Any]) -> dict[str, Any]:
    declarations = bundle.get("library") or []
    library = {
        declaration["name"]: declaration["transform-t"]
        for declaration in declarations
        if isinstance(declaration, dict)
        and "name" in declaration
        and "transform-t" in declaration
    }
    for required in (bundle.get("declaration") or {}).get("requires", []):
        match = next(
            (
                declaration
                for declaration in declarations
                if declaration.get("name", "").startswith(required)
            ),
            None,
        )
        if match:
            library[required] = match["transform-t"]
    return library


def run_case(case: dict[str, Any]) -> Any:
    source = case.get("source")
    library = dict(case.get("library", {}))
    mode = case.get("mode", "evaluate")
    if mode == "evaluate":
        return evaluate(source, case["transform"], library)
    if mode == "compilelib_evaluate":
        compiled = compilelib(
            [case["declaration"]],
            case.get("distributions", []),
            seed=library,
            test=case.get("test", False),
        )
        if "fail" in compiled:
            return {"compile-fail": compiled["fail"]}
        return evaluate(source, case["declaration"]["transform-t"], compiled["lib"])
    if mode == "declaration_test_t":
        return "fail" not in compilelib(
            [case["declaration"]],
            case.get("distributions", []),
            seed=library,
            test=True,
        )
    if mode == "studio_fixture_set":
        failures = []
        paths = sorted(ROOT.glob(case["fixture_glob"]))
        for path in paths:
            fixture = json.loads(path.read_text(encoding="utf-8"))
            try:
                actual = evaluate(
                    fixture.get("source"),
                    fixture.get("transform"),
                    bundle_library(fixture),
                )
                if not same(actual, fixture.get("expected")):
                    failures.append(fixture["id"])
            except Exception as error:  # pragma: no cover - surfaced in output
                failures.append(f"{fixture['id']}: {error}")
        return {"evaluated": len(paths), "failures": failures}
    raise ValueError(f"unknown conformance mode: {mode}")


def main() -> None:
    failed = []
    for case in CORPUS["cases"]:
        actual = run_case(case)
        if not same(actual, case["expected"]):
            failed.append((case["id"], case["expected"], actual))
    for case_id, expected, actual in failed:
        print(f"FAIL {case_id}")
        print(f"  expected: {json.dumps(expected, ensure_ascii=False)}")
        print(f"  actual:   {json.dumps(actual, ensure_ascii=False)}")
    print(f"{len(CORPUS['cases']) - len(failed)}/{len(CORPUS['cases'])} passed")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
