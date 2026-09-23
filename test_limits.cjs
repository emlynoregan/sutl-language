const { LimitError, compileLimited, evaluateLimited } = require("./reference.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(evaluateLimited(null, 1, {}, { limits: { maxSteps: 1 } }) === 1, "literal");
try {
  evaluateLimited(null, { a: 1 }, {}, { limits: { maxSteps: 1 } });
  throw new Error("expected a step limit");
} catch (error) {
  assert(error instanceof LimitError && error.reason === "steps", error);
}
try {
  evaluateLimited(null, { a: 1 }, {}, { limits: { maxDepth: 1 } });
  throw new Error("expected a depth limit");
} catch (error) {
  assert(error instanceof LimitError && error.reason === "depth", error);
}
const source = { "!": "^$.loop", loop: { "!": "^$.loop" } };
try {
  evaluateLimited(source, source, {}, { limits: { maxDepth: 8 } });
  throw new Error("expected the loop to hit the depth limit");
} catch (error) {
  assert(error instanceof LimitError && error.reason === "depth", error);
}
const signal = AbortSignal.abort();
try {
  evaluateLimited(null, 1, {}, { signal });
  throw new Error("expected cancellation");
} catch (error) {
  assert(error instanceof LimitError && error.reason === "cancelled", error);
}
const program = compileLimited("^$.name", {}, { maxSteps: 100000, maxDepth: 256 });
assert(program.run({ name: "Ada" }) === "Ada", "compiled path");
console.log("limits ok");
