"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Sutl = require("./reference.js");

const root = __dirname;
const corpus = JSON.parse(fs.readFileSync(path.join(root, "conformance.json"), "utf8"));

function same(left, right) {
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return left === right;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => same(value, right[index]))
    );
  if (typeof left === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      same(leftKeys, rightKeys) &&
      leftKeys.every((key) => same(left[key], right[key]))
    );
  }
  return Object.is(left, right);
}

function bundleLibrary(bundle) {
  const declarations = bundle.library || [];
  const library = {};
  for (const declaration of declarations)
    if (declaration?.name && "transform-t" in declaration)
      library[declaration.name] = declaration["transform-t"];
  for (const required of bundle.declaration?.requires || []) {
    const match = declarations.find((item) => (item.name || "").startsWith(required));
    if (match) library[required] = match["transform-t"];
  }
  return library;
}

function runCase(testCase) {
  const source = testCase.source;
  const library = { ...(testCase.library || {}) };
  const mode = testCase.mode || "evaluate";
  if (mode === "evaluate")
    return Sutl.evaluate(source, testCase.transform, library);
  if (mode === "compilelib_evaluate") {
    const compiled = Sutl.compilelib(
      [testCase.declaration],
      testCase.distributions || [],
      library,
      Boolean(testCase.test),
    );
    if (compiled.fail) return { "compile-fail": compiled.fail };
    return Sutl.evaluate(source, testCase.declaration["transform-t"], compiled.lib);
  }
  if (mode === "declaration_test_t")
    return !Sutl.compilelib(
      [testCase.declaration],
      testCase.distributions || [],
      library,
      true,
    ).fail;
  if (mode === "studio_fixture_set") {
    const directory = path.join(root, path.dirname(testCase.fixture_glob));
    const files = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
    const failures = [];
    for (const name of files) {
      const fixture = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
      try {
        const actual = Sutl.evaluate(
          fixture.source,
          fixture.transform,
          bundleLibrary(fixture),
        );
        if (!same(actual, fixture.expected)) failures.push(fixture.id);
      } catch (error) {
        failures.push(`${fixture.id}: ${error.message}`);
      }
    }
    return { evaluated: files.length, failures };
  }
  throw new Error(`unknown conformance mode: ${mode}`);
}

const results = corpus.cases.map((testCase) => ({
  id: testCase.id,
  actual: runCase(testCase),
}));

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(results)}\n`);
  process.exit(0);
}

const failures = [];
for (const result of results) {
  const testCase = corpus.cases.find((item) => item.id === result.id);
  const actual = result.actual;
  if (!same(actual, testCase.expected))
    failures.push([testCase.id, testCase.expected, actual]);
}
for (const [id, expected, actual] of failures) {
  console.log(`FAIL ${id}`);
  console.log(`  expected: ${JSON.stringify(expected)}`);
  console.log(`  actual:   ${JSON.stringify(actual)}`);
}
console.log(`${corpus.cases.length - failures.length}/${corpus.cases.length} passed`);
process.exitCode = failures.length ? 1 : 0;
