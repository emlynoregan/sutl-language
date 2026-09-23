# sUTL 1.0 specification

This document defines **sUTL 1.0**, the sUTL Universal Transform Language.
“sUTL” is pronounced “subtle”. The normative definition is this document
together with `conformance.json`; historical implementations are evidence, not
the specification.

## Evidence policy

When sources disagree, use this order:

1. Explicit language documentation and examples whose intended result is stated.
2. Python 2 implementation and tests (`sUTL_py`, version 1.0.6), which saw
   extensive production use in 2017–2018.
3. Studio examples and the Haxe-generated JavaScript evaluator used to run them.
4. The earlier handwritten JavaScript implementation.
5. The old `sUTL-spec` README where later evidence did not supersede it.

Agreement among independent sources is stronger than any source alone. Where
sources disagree, sUTL 1.0 makes an explicit choice below. Every conformance
case is normative.

## Data model

sUTL operates on **MLSNBN** values. These are the
values that round-trip through JSON:

- map (JSON object with string keys)
- list (JSON array)
- string
- number
- boolean
- null

A transform is itself an MLSNBN value. There is no textual parser beyond JSON:
evaluation dispatches on the shape and reserved keys of the transform.

## Evaluation context

`evaluate(source, transform, library)` retains five pieces of context:

- **source**: the root input, selected by `$`
- **parent scope**: the caller's scope, selected by `@`
- **current builtin scope**: the scope after builtin arguments are added,
  selected by `^`
- **library**: named transforms, selected by `*`
- **root transform**: the original transform, selected by `~`
- **builtins**: host-provided primitive operations

The public `evaluate` call begins with the source as both root source and local
scope.

## Transform forms and precedence

Maps with reserved keys are recognized before ordinary map transforms:

1. `{"!": ...}` — evaluate transform
2. `{"!!": ...}` — alternate evaluate transform
3. `{"&": ...}` — builtin or library call
4. `{"'": ...}` — quote transform
5. `{":": ...}` — colon/literal transform
6. any other map — map transform

Lists and strings can also use compact builtin syntax. All remaining scalar
values are literal transforms.

### Literal and structural transforms

Numbers, booleans, and null evaluate to themselves. A normal map or list
evaluates each child transform and preserves the enclosing shape:

```json
{
  "name": "^$.user.name",
  "active": true
}
```

Strings are literals unless they match compact builtin/path syntax.

### Evaluate transform: `!`

```json
{
  "!": "<transform producing another transform>",
  "argument": "<transform>",
  "*": {
    "local-library-name": "<transform>"
  }
}
```

The value of `!` is evaluated to obtain a new transform. Other map members are
evaluated to form its local scope. Optional `*` constructs a replacement local
library. The constructed transform is then evaluated in that context.

This is sUTL's principal metaprogramming and function-call mechanism.

### Alternate evaluate transform: `!!`

The later Studio dialect separates the scope delta from the transform:

```json
{
  "!!": {"'": "<sub-transform>"},
  "s": {"argument": "<transform>"},
  "*": {
    "local-library-name": "<transform>"
  }
}
```

The value of `!!` is evaluated to obtain the next transform. `s` is evaluated
separately and merged into the current scope (or replaces a non-map scope).
Optional `*` supplies a local library. The next transform is then evaluated in
that context.

This form is documented on the rescued site and works in the handwritten
JavaScript evaluator. The Studio/HaxeJS implementation contains the form but
has a scope-merge defect, while the production Python 2 port omits it. Those
implementation gaps do not override the explicit language documentation.

### Builtin or library call: `&`

```json
{
  "&": "builtin-name",
  "argument": "<transform>"
}
```

Arguments are the other map members. A matching library transform can be
invoked using the same form; builtins may also be overridden through the
library.

### Quote transform: `'`

`{"'": value}` suppresses one level of normal evaluation while recursively
processing the quoted structure. Inside a quote, `{"''": transform}` escapes
back into normal evaluation.

```json
{
  "'": {
    "unevaluated": "^$.x",
    "evaluated": {"''": "^$.x"}
  }
}
```

### Colon transform: `:`

`{":": value}` returns `value` without recursively evaluating it. It is a
compact whole-value literal form and is commonly used while constructing a
transform for later evaluation.

### List transforms and flattening

A normal list evaluates each item. A list beginning with the exact string
`"&&"` evaluates the remaining items and flattens one list level:

```json
["&&", [1, 2], 3, [4, 5]]
```

evaluates to `[1, 2, 3, 4, 5]`.

## Compact builtin syntax

### List form

```json
["&+", 1, 2, 3]
```

The first character controls result selection:

- `&name` returns the full builtin result.
- `^name` returns the first item of a list result, or null.

Arguments are reduced left-to-right for binary builtins.

The logical-and builtin is named `&&`, so its compact list spelling is
`"&&&"`. This is distinct from the exact flatten marker `"&&"`.

### String form

A compact string is split on dots and processed like list form:

```json
"^$.person.name"
```

is equivalent to a head-selecting call to path builtin `$` with the successive
path components `"person"` and `"name"`.

Numeric path components are converted to integer indexes.

## Paths

The sUTL syntax uses `^` for a head result and `&` for a list
result, followed by one of these selectors:

- `$` — root source
- `@` — parent/caller scope
- `^` — current builtin scope
- `*` — library
- `~` — root transform
- `%` — explicitly supplied value

Examples:

- `^$` — root source
- `^$.person.name` — first selected name
- `&$.people.*.name` — all names immediately under `people`
- `&$.**.name` — all recursively selected names
- `^*.map` — the library transform stored as `map`

Path components:

- a string selects a map member
- an integer selects a list item
- `*` selects every immediate map value or list item
- `**` recursively selects descendants

Missing selections produce an empty list in `&` form and null in `^` form.
Path traversal is deliberately forgiving: an inapplicable component discards
that branch rather than raising an error.

Raw pathing supplies its own starting value:

```json
["^%", {"person": {"name": "Fred"}}, "person", "name"]
```

evaluates to `"Fred"`.

The older spec's `#`/`##` notation describes an earlier dialect and is not part
of this sUTL 1.0.

## Builtins

The production Python implementation provides:

- arithmetic: `+`, `-`, `x`, `/`
- comparison: `=`, `!=`, `<`, `>`, `<=`, `>=`
- logical: `&&`, `||`, `!`
- control: `if`
- collections: `zip`, `removekeys`, `len`, `keys`, `values`, `makemap`,
  `reduce`, `quicksort`, `head`, `tail`
- conversion/string: `split`, `trim`, `pos`, `string`, `number`, `boolean`,
  `lower`, `upper`
- paths: `$`, `@`, `^`, `*`, `~`, `%`

`keys` and `values` use sorted keys in the later Python implementation. This
makes cross-host results deterministic and is adopted by the working dialect.

`reduce` exposes `item`, `accum`, and zero-based `ix` in the local scope.

Logical `&&`, `||`, and `!` return booleans after applying sUTL truthiness.
The production Python implementation accidentally leaked Python's
operand-returning `and`/`or` behavior; the explicit site reference and both
JavaScript implementations agree on boolean results.

## Declarations, distributions, and libraries

A declaration wraps a transform:

```json
{
  "name": "addone_example_org",
  "language": "sUTL",
  "transform-t": ["&+", "^@.value", 1],
  "requires": ["dependency"],
  "test-t": null
}
```

A distribution is an ordered list of declarations. `compilelib` recursively
matches each required name against declaration-name prefixes. The transform is
stored in the resulting library under the required name, not necessarily its
full declared name.

`test-t`, when enabled, is evaluated with the declaration's `transform-t` as
source. A falsey result passes; a truthy result describes failure.

The working runner reports a missing requirement as a compile failure instead
of silently constructing an incomplete library. Historical implementations
were inconsistent here; the explicit failure is a sUTL safety rule.

## Decisions fixed by sUTL 1.0

- **Numbers and division:** numbers have JSON-number semantics. Division is
  floating-point (`5 / 2` is `2.5`). Division by zero and invalid numeric
  operations return null.
- **Argument eagerness:** members of a structured builtin call are evaluated
  before dispatch. Transforms intended for later evaluation, including `if`
  branches, must be quoted.
- **Evaluate order:** `!` evaluates its next transform first, then evaluates and
  merges the remaining call members into scope, then evaluates the next
  transform. `!!` separately evaluates its transform and optional `s` scope
  delta and is preferred for new higher-order code.
- **Invalid operands:** numeric operations return null for incompatible
  non-null operands. Numeric null/missing arguments use each builtin's identity
  default (`0` for `+`/`-`, `1` for `x`/`/`). Ordering comparisons require two
  numbers and otherwise return false. Collection builtins return their
  documented empty or null result. Conversion builtins never raise host
  exceptions.
- **`zip` length:** unequal inputs truncate to the shortest list.
- **Library builtin overrides:** a library member named
  `_override_<builtin>` replaces that builtin for the evaluation.
- **Library compilation:** candidates are tried in distribution order. A
  candidate whose `test-t` fails is rolled back completely before the next
  candidate is tried. A missing requirement is a compile failure.
- **Map ordering:** general map member order is not semantic. `keys` returns
  sorted keys and `values` follows that same sorted-key order.

## Observed implementation differences

The executable corpus currently produces these historical differences:

- The handwritten JavaScript implementation predates deterministic sorted
  `keys`/`values` and the `string`/`number` conversion builtins.
- The production Python 2 implementation does not implement the documented
  Studio-era `!!` form.
- Studio/HaxeJS implements `!!` but merges the evaluated next transform into
  scope instead of the evaluated `s` delta, producing null in the corpus's
  scope-delta case. The handwritten JavaScript implementation matches the site
  documentation.
- Studio/HaxeJS returns null for an unparseable numeric string, whereas the
  site reference and Python tests require `0`; this is treated as a Haxe bug.
- Both JavaScript implementations allow host-language coercion in ordering
  comparisons (for example `"2" < 10`). The site reference explicitly requires
  numeric operands and false otherwise, so host coercion is treated as a bug.
- Neither JavaScript implementation exposes Python's direct `zip` builtin in
  the same form. The older spec instead describes `zip` as a core-library
  transform, and also disagrees about truncation versus null padding.
- Python returns operands from logical `&&`/`||`; both JavaScript
  implementations and the site reference return booleans. Boolean results are
  therefore canonical.
- Python 2 integer division differs from both JavaScript implementations. The
  working dialect uses a JSON-number result and floating division.

## Runtime limits

Evaluation is unbounded unless the host sets a limit. A limit does not change
a result that finishes inside the budget. Implementations from release 1.1.0
provide this facility. The 1.0 conformance corpus is unchanged, and it is run
with no limits.

A **step** is one entry into evaluation of a transform, or one entry into a
quote walk. **Depth** is how many of those entries are on the stack. The
outermost entry is depth 1.

The host may set:

- `max_steps` — the most steps that may start. `0` means no step limit.
- `max_depth` — the deepest entry that may start. `0` means no depth limit.
- a cancellation signal — checked at every step. Go uses `context.Context`,
  JavaScript uses `AbortSignal`, and Python uses a zero-argument callable that
  returns true once the host has cancelled.

The entry that would exceed a limit, or that finds the host already cancelled,
does not run. The implementation stops and reports `steps`, `depth`, or
`cancelled`. It does not return a partial value. With both limits unset and no
cancellation, the result is the ordinary sUTL 1.0 result.

Negative limits are rejected before evaluation starts.

## Conformance rule

An implementation conforms to sUTL 1.0 only if it produces the expected result
for every case in `conformance.json`, including declaration compilation and the
Studio fixture set. Map member order is ignored when comparing results; list
order, scalar type, and scalar value are significant.

For teaching, prefer the explicit `!!` form when constructing higher-order
transforms. The compact `!` form remains part of the language for compatibility
with production transforms, but its historical evaluation-order differences
should not be used as a programming technique.
