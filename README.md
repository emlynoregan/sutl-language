# sUTL language

This repository is the normative definition of **sUTL 1.0**, the sUTL
Universal Transform Language (pronounced “subtle”).

sUTL is a pure programming language for transforming maps, lists, strings,
numbers, booleans, and null. Programs are values in that same data model.

## Normative artifacts

- [`SPEC.md`](SPEC.md) defines the language.
- [`conformance.json`](conformance.json) contains 88 required executable cases.
- [`schema/conformance.schema.json`](schema/conformance.schema.json) describes
  the corpus format.
- [`fixtures/studio/`](fixtures/studio/) contains 44 complete programs from the
  original sUTL Studio with implementation-independent expected results.
- [`core-library.json`](core-library.json) is the 44-declaration production
  library written in sUTL.
- [`contract.json`](contract.json) pins the language version and corpus hash.

An implementation conforms to sUTL 1.0 only when it passes every case in the
corpus. Release 1.1.0 adds host runtime limits, described in
[`SPEC.md`](SPEC.md). Those limits do not change a result that finishes inside
its budget, and the corpus is still run with no limits.

## Reference verification

The dependency-free `reference.py` and `reference.js` files bootstrap the first
two implementations and verify the contract:

```powershell
python verify.py
node verify.js
python verify_parity.py
```

They are included to make the specification independently executable. Released
packages live in the separate
[`sutl-py`](https://github.com/emlynoregan/sutl-py),
[`sutl-js`](https://github.com/emlynoregan/sutl-js), and
[`sutl-go`](https://github.com/emlynoregan/sutl-go) repositories.

## Versioning

Language changes use semantic versioning. Clarifications that do not alter any
required result are patches. Additive language features are minor versions.
Any changed result for an existing valid program requires a major version.

## License

Apache License 2.0.
