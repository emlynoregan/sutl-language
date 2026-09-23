"""Runtime limits on the reference runner. Not part of the hashed corpus."""

import reference


def loop():
    return {"!": "^$.loop", "loop": {"!": "^$.loop"}}


def main() -> None:
    assert reference.evaluate(None, 1, limits=reference.Limits(max_steps=1)) == 1
    try:
        reference.evaluate(None, {"a": 1}, limits=reference.Limits(max_steps=1))
    except reference.LimitError as error:
        assert error.reason == "steps"
    else:
        raise SystemExit("expected a step limit")
    try:
        reference.evaluate(None, {"a": 1}, limits=reference.Limits(max_depth=1))
    except reference.LimitError as error:
        assert error.reason == "depth"
    else:
        raise SystemExit("expected a depth limit")
    source = loop()
    try:
        reference.evaluate(source, source, limits=reference.Limits(max_depth=8))
    except reference.LimitError as error:
        assert error.reason == "depth"
    else:
        raise SystemExit("expected the loop to hit the depth limit")
    try:
        reference.evaluate(None, 1, cancel=lambda: True)
    except reference.LimitError as error:
        assert error.reason == "cancelled"
    else:
        raise SystemExit("expected cancellation")
    print("limits ok")


if __name__ == "__main__":
    main()
