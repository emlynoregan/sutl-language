(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Sutl = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const isMap = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const isList = Array.isArray;
  const isString = (value) => typeof value === "string";
  const isNumber = (value) =>
    typeof value === "number" && Number.isFinite(value);
  const truthy = (value) => {
    if (value === null || value === false || value === 0 || value === "") return false;
    if (isList(value) && value.length === 0) return false;
    if (isMap(value) && Object.keys(value).length === 0) return false;
    return true;
  };
  const clone = (value) =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  function pathStep(values, selector) {
    const result = [];
    if (!isList(values)) return result;
    if (selector === null || selector === undefined || selector === "") return values;
    for (const value of values) {
      try {
        if (selector === "**") {
          result.push(value);
          const stack = [value];
          while (stack.length) {
            const current = stack.pop();
            if (isMap(current)) {
              const children = Object.values(current);
              result.push(...children);
              stack.push(...children);
            } else if (isList(current)) {
              result.push(...current);
              stack.push(...current);
            }
          }
        } else if (selector === "*") {
          if (isMap(value)) result.push(...Object.values(value));
          else if (isList(value)) result.push(...value);
        } else if (isMap(value) && isString(selector) && selector in value) {
          result.push(value[selector]);
        } else if (
          isList(value) &&
          Number.isInteger(selector) &&
          selector >= 0 &&
          selector < value.length
        ) {
          result.push(value[selector]);
        }
      } catch (_) {
        // Historical pathing deliberately discards an inapplicable branch.
      }
    }
    return result;
  }

  class Runner {
    constructor() {
      this.builtins = this.makeBuiltins();
    }

    evaluate(source, transform, library = {}) {
      return this.eval(source, transform, library, source, transform);
    }

    eval(scope, transform, library, source, rootTransform) {
      if (isMap(transform) && "!" in transform)
        return this.eval1(scope, transform, library, source, rootTransform);
      if (isMap(transform) && "!!" in transform)
        return this.eval2(scope, transform, library, source, rootTransform);
      if (isMap(transform) && "&" in transform)
        return this.evalBuiltin(scope, transform, library, source, rootTransform);
      if (isMap(transform) && "'" in transform)
        return this.quote(scope, transform["'"], library, source, rootTransform);
      if (isMap(transform) && ":" in transform) return transform[":"];
      if (isMap(transform))
        return this.evalMap(scope, transform, library, source, rootTransform);
      if (this.isCompact(transform))
        return this.evalCompact(scope, transform, library, source, rootTransform);
      if (isList(transform)) {
        const flatten = transform[0] === "&&";
        const values = flatten ? transform.slice(1) : transform;
        const result = values.map((item) =>
          this.eval(scope, item, library, source, rootTransform)
        );
        return flatten ? result.flatMap((item) => (isList(item) ? item : [item])) : result;
      }
      return transform;
    }

    quote(scope, transform, library, source, rootTransform) {
      if (isMap(transform) && "''" in transform)
        return this.eval(scope, transform["''"], library, source, rootTransform);
      if (isMap(transform))
        return Object.fromEntries(
          Object.entries(transform).map(([key, value]) => [
            String(key),
            this.quote(scope, value, library, source, rootTransform),
          ])
        );
      if (isList(transform))
        return transform.map((value) =>
          this.quote(scope, value, library, source, rootTransform)
        );
      return transform;
    }

    evalMap(scope, transform, library, source, rootTransform) {
      return Object.fromEntries(
        Object.entries(transform)
          .filter(([key]) => key !== "!" && key !== "&")
          .map(([key, value]) => [
            String(key),
            this.eval(scope, value, library, source, rootTransform),
          ])
      );
    }

    eval1(scope, transform, library, source, rootTransform) {
      const nextTransform = this.eval(
        scope,
        transform["!"],
        library,
        source,
        rootTransform
      );
      const nextScope = isMap(scope) ? { ...scope } : {};
      Object.assign(
        nextScope,
        this.evalMap(scope, transform, library, source, rootTransform)
      );
      const nextLibrary = isMap(transform["*"])
        ? this.evalMap(scope, transform["*"], library, source, rootTransform)
        : library;
      return this.eval(nextScope, nextTransform, nextLibrary, source, rootTransform);
    }

    eval2(scope, transform, library, source, rootTransform) {
      const nextTransform = this.eval(
        scope,
        transform["!!"],
        library,
        source,
        rootTransform
      );
      let nextScope = scope;
      if ("s" in transform) {
        const delta = this.eval(scope, transform.s, library, source, rootTransform);
        nextScope = isMap(delta)
          ? Object.assign(isMap(scope) ? { ...scope } : {}, delta)
          : delta;
      }
      const nextLibrary = isMap(transform["*"])
        ? this.evalMap(scope, transform["*"], library, source, rootTransform)
        : library;
      return this.eval(nextScope, nextTransform, nextLibrary, source, rootTransform);
    }

    isCompact(transform) {
      const parts = isString(transform)
        ? transform.split(".")
        : isList(transform)
          ? transform
          : [];
      const operation = parts[0];
      return (
        isString(operation) &&
        operation.length > 0 &&
        (operation[0] === "&" || operation[0] === "^") &&
        operation.slice(1) in this.builtins
      );
    }

    evalCompact(scope, transform, library, source, rootTransform) {
      let parts = isString(transform) ? transform.split(".") : [...transform];
      if (isString(transform)) {
        parts = parts.map((part) =>
          /^-?\d+$/.test(part) ? Number.parseInt(part, 10) : part
        );
      }
      const operation = parts[0];
      return this.evalBuiltin(
        scope,
        {
          "&": operation.slice(1),
          args: parts.slice(1),
          head: operation[0] === "^",
        },
        library,
        source,
        rootTransform
      );
    }

    evalBuiltin(scope, transform, library, source, rootTransform) {
      const args = transform.args;
      if (isList(args)) {
        let result;
        if (args.length === 0) {
          result = this.evalBuiltin(
            scope,
            { "&": transform["&"] },
            library,
            source,
            rootTransform
          );
        } else if (args.length === 1) {
          result = this.evalBuiltin(
            scope,
            {
              "&": transform["&"],
              b: this.eval(scope, args[0], library, source, rootTransform),
            },
            library,
            source,
            rootTransform
          );
        } else {
          result = this.eval(scope, args[0], library, source, rootTransform);
          args.slice(1).forEach((item, index) => {
            result = this.evalBuiltin(
              scope,
              {
                "&": transform["&"],
                a: result,
                b: this.eval(scope, item, library, source, rootTransform),
                notfirst: index > 0,
              },
              library,
              source,
              rootTransform
            );
          });
        }
        return transform.head
          ? isList(result) && result.length
            ? result[0]
            : null
          : result;
      }

      const name = transform["&"];
      const builtin = this.builtins[name];
      const libraryName = builtin ? `_override_${name}` : name;
      if (libraryName in library) {
        const call = { ...transform, "!": ["^*", libraryName] };
        delete call["&"];
        return this.eval1(scope, call, library, source, rootTransform);
      }
      if (!builtin) return null;

      const nextScope = isMap(scope) ? { ...scope } : {};
      Object.assign(
        nextScope,
        this.evalMap(scope, transform, library, source, rootTransform)
      );
      const nextLibrary = isMap(transform["*"])
        ? this.evalMap(scope, transform["*"], library, source, rootTransform)
        : library;
      return builtin(scope, nextScope, nextLibrary, source, rootTransform);
    }

    processPath(start, scope) {
      const left = scope.a;
      const right = scope.b;
      if (scope.notfirst) return pathStep(left, right);
      return pathStep(pathStep([start], left), right);
    }

    makeBuiltins() {
      const get = (scope, key, fallback) =>
        scope[key] === null || scope[key] === undefined ? fallback : scope[key];
      const binary = (left, right, operation) => (_parent, scope) => {
        try {
          return operation(left(scope), right(scope));
        } catch (_) {
          return null;
        }
      };
      const unary = (value, operation) => (_parent, scope) => {
        try {
          return operation(value(scope));
        } catch (_) {
          return null;
        }
      };
      const equal = (left, right) => {
        if (isNumber(left) && isNumber(right)) return left === right;
        if (typeof left !== typeof right) return false;
        if (left === null || right === null) return left === right;
        if (isMap(left) || isList(left)) return left === right;
        return left === right;
      };
      const add = (left, right) => {
        if ((isNumber(left) && isNumber(right)) || (isString(left) && isString(right)))
          return left + right;
        throw new TypeError("addition requires two numbers or two strings");
      };
      const numeric = (left, right, operation) => {
        if (!isNumber(left) || !isNumber(right))
          throw new TypeError("numeric operation requires two numbers");
        return operation(left, right);
      };
      const compare = (left, right, operation) =>
        isNumber(left) && isNumber(right) && operation(left, right);
      const stringValue = (value) => {
        if (isString(value)) return value;
        if (isNumber(value)) return String(value);
        if (typeof value === "boolean") return value ? "true" : "false";
        if (value === null) return "null";
        if (isMap(value)) return "map";
        if (isList(value)) return "list";
        return "unknown";
      };
      const numberValue = (value) => {
        if (isNumber(value)) return value;
        if (isString(value)) {
          if (value.trim() === "") return 0;
          const converted = Number(value);
          return Number.isFinite(converted) ? converted : 0;
        }
        if (typeof value === "boolean") return value ? 1 : 0;
        return 0;
      };
      const typeValue = (value) => {
        if (isMap(value)) return "map";
        if (isList(value)) return "list";
        if (isString(value)) return "string";
        if (isNumber(value)) return "number";
        if (typeof value === "boolean") return "boolean";
        if (value === null) return "null";
        return "unknown";
      };

      const builtins = {
        "+": binary((s) => get(s, "a", 0), (s) => get(s, "b", 0), add),
        "-": binary(
          (s) => get(s, "a", 0),
          (s) => get(s, "b", 0),
          (a, b) => numeric(a, b, (x, y) => x - y)
        ),
        x: binary(
          (s) => get(s, "a", 1),
          (s) => get(s, "b", 1),
          (a, b) => numeric(a, b, (x, y) => x * y)
        ),
        "/": binary(
          (s) => get(s, "a", 1),
          (s) => get(s, "b", 1),
          (a, b) => {
            if (!isNumber(a) || !isNumber(b) || b === 0)
              throw new TypeError("division requires numbers and a nonzero divisor");
            return a / b;
          }
        ),
        "=": binary((s) => get(s, "a", null), (s) => get(s, "b", null), equal),
        "!=": binary(
          (s) => get(s, "a", null),
          (s) => get(s, "b", null),
          (a, b) => !equal(a, b)
        ),
        ">": binary((s) => s.a, (s) => s.b, (a, b) => compare(a, b, (x, y) => x > y)),
        "<": binary((s) => s.a, (s) => s.b, (a, b) => compare(a, b, (x, y) => x < y)),
        ">=": binary((s) => s.a, (s) => s.b, (a, b) => compare(a, b, (x, y) => x >= y)),
        "<=": binary((s) => s.a, (s) => s.b, (a, b) => compare(a, b, (x, y) => x <= y)),
        "&&": binary(
          (s) => get(s, "a", false),
          (s) => get(s, "b", false),
          (a, b) => truthy(a) && truthy(b)
        ),
        "||": binary(
          (s) => get(s, "a", false),
          (s) => get(s, "b", false),
          (a, b) => truthy(a) || truthy(b)
        ),
        "!": unary((s) => get(s, "b", false), (value) => !truthy(value)),
      };

      builtins.if = (parent, scope, library, source, rootTransform) => {
        const branch = truthy(scope.cond) ? "true" : "false";
        return branch in scope
          ? this.eval(parent, scope[branch], library, source, rootTransform)
          : null;
      };
      builtins.reduce = (parent, scope, library, source, rootTransform) => {
        let accumulator = scope.accum;
        if (isList(scope.list)) {
          scope.list.forEach((item, ix) => {
            const itemScope = Object.assign(isMap(parent) ? { ...parent } : {}, scope, {
              item,
              accum: accumulator,
              ix,
            });
            accumulator = this.eval(
              itemScope,
              scope.t,
              library,
              source,
              rootTransform
            );
          });
        }
        return accumulator;
      };
      builtins["$"] = (_p, s, _l, src) => this.processPath(src, s);
      builtins["@"] = (p, s) => this.processPath(p, s);
      builtins["^"] = (_p, s) => this.processPath(s, s);
      builtins["*"] = (_p, s, l) => this.processPath(l, s);
      builtins["~"] = (_p, s, _l, _src, rootTransform) =>
        this.processPath(rootTransform, s);
      builtins["%"] = (_p, s) =>
        s.notfirst
          ? pathStep(s.a, s.b)
          : s.a === null || s.a === undefined
            ? pathStep([s.b], null)
            : pathStep([s.a], s.b);
      builtins.zip = (_p, s) =>
        !isList(s.list) || s.list.length === 0
          ? []
          : Array.from(
              { length: Math.min(...s.list.map((items) => items.length)) },
              (_, index) => s.list.map((items) => items[index])
            );
      builtins.removekeys = (_p, s) => {
        if (s.map === null || s.map === undefined) return null;
        const result = clone(s.map);
        for (const key of s.keys || []) delete result[key];
        return result;
      };
      builtins.len = (_p, s) => (isList(s.list) ? s.list.length : 0);
      builtins.keys = (_p, s) => (isMap(s.map) ? Object.keys(s.map).sort() : null);
      builtins.values = (_p, s) =>
        isMap(s.map) ? Object.keys(s.map).sort().map((key) => s.map[key]) : null;
      builtins.type = (_p, s) => typeValue(s.value);
      builtins.makemap = (_p, s) =>
        isList(s.value)
          ? Object.fromEntries(
              s.value.filter(
                (item) => isList(item) && item.length >= 2 && isString(item[0])
              )
            )
          : null;
      builtins.quicksort = (_p, s) =>
        s.list ? [...s.list].sort((a, b) => a - b) : s.list;
      builtins.head = (_p, s) => (isList(s.b) && s.b.length ? s.b[0] : null);
      builtins.tail = (_p, s) => (isList(s.b) ? s.b.slice(1) : null);
      builtins.split = (_p, s) => {
        if (!s.value || (s.max && !isNumber(s.max))) return null;
        const separator = s.sep || ",";
        if (!s.max) return String(s.value).split(String(separator));
        const pieces = String(s.value).split(String(separator));
        return pieces.length <= s.max + 1
          ? pieces
          : [...pieces.slice(0, s.max), pieces.slice(s.max).join(String(separator))];
      };
      builtins.trim = (_p, s) => (s.value ? stringValue(s.value).trim() : null);
      builtins.pos = (_p, s) =>
        s.value && s.sub ? String(s.value).indexOf(String(s.sub)) : null;
      builtins.string = (_p, s) => stringValue(s.value);
      builtins.number = (_p, s) => numberValue(s.value);
      builtins.boolean = (_p, s) => truthy(s.value);
      builtins.lower = (_p, s) => stringValue(s.value).toLowerCase();
      builtins.upper = (_p, s) => stringValue(s.value).toUpperCase();
      for (const name of Object.keys(builtins)) builtins[`has${name}`] = () => true;
      return builtins;
    }
  }

  function compilelib(declarations, distributions, seed = {}, test = false) {
    const runner = new Runner();
    const result = { ...seed };
    const failures = [];
    const addRequirements = (items) => {
      for (const declaration of items) {
        const declaredName = declaration.name || "";
        for (const required of declaration.requires || []) {
          if (required in result) continue;
          if (declaredName.startsWith(required)) {
            result[required] = declaration["transform-t"];
            continue;
          }
          const candidates = distributions
            .flatMap((distribution) => distribution)
            .filter((candidate) => (candidate.name || "").startsWith(required));
          if (!candidates.length) {
            failures.push(`missing requirement: ${required}`);
            continue;
          }
          let accepted = false;
          const candidateFailures = [];
          for (const candidate of candidates) {
            const before = { ...result };
            addRequirements([candidate]);
            if (test && "test-t" in candidate) {
              const candidateLibrary = Object.fromEntries(
                (candidate.requires || [])
                  .filter((name) => name in result)
                  .map((name) => [name, result[name]])
              );
              const failure = runner.evaluate(
                candidate["transform-t"],
                candidate["test-t"],
                candidateLibrary
              );
              if (truthy(failure)) {
                candidateFailures.push(failure);
                for (const key of Object.keys(result)) delete result[key];
                Object.assign(result, before);
                continue;
              }
            }
            result[required] = candidate["transform-t"];
            accepted = true;
            candidateFailures.length = 0;
            break;
          }
          if (!accepted) {
            if (candidateFailures.length) failures.push(...candidateFailures);
            else failures.push(`no acceptable declaration: ${required}`);
          }
        }
      }
    };
    addRequirements(declarations);
    if (test) {
      for (const declaration of declarations) {
        if (!("test-t" in declaration)) continue;
        const declarationLibrary = Object.fromEntries(
          (declaration.requires || [])
            .filter((name) => name in result)
            .map((name) => [name, result[name]])
        );
        const failure = runner.evaluate(
          declaration["transform-t"],
          declaration["test-t"],
          declarationLibrary
        );
        if (truthy(failure)) failures.push(failure);
      }
    }
    return failures.length ? { fail: failures } : { lib: result };
  }

  return {
    Runner,
    evaluate: (source, transform, library = {}) =>
      new Runner().evaluate(source, transform, library),
    compilelib,
    truthy,
  };
});
