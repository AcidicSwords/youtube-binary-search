import assert from "node:assert/strict";
import {
  TRANSPORT_KIND,
  idleTransport,
  deriveContextWindow,
  createContextTransport,
  createLoopTransport,
  createContinueTransport,
  createSkimTransport,
  isTransportActive,
  isObservationalTransport,
  desiredSkimRate
} from "./transport.js";

assert.deepEqual(deriveContextWindow(50, { start: 0, end: 100 }, 5, 1), { start: 49, end: 54 });
assert.deepEqual(deriveContextWindow(0, { start: 0, end: 100 }, 5, 1), { start: 0, end: 5 });
assert.deepEqual(deriveContextWindow(100, { start: 0, end: 100 }, 5, 1), { start: 95, end: 100 });
assert.deepEqual(deriveContextWindow(12, { start: 10, end: 13 }, 5, 1), { start: 10, end: 13 });
assert.equal(deriveContextWindow(12, { start: 12, end: 12 }, 5, 1), null);

const idle = idleTransport();
const context = createContextTransport({ anchor: 50, range: { start: 0, end: 100 }, seconds: 5 });
const loop = createLoopTransport({ anchor: 50, start: 40, end: 50 });
const continuation = createContinueTransport({
  departure: 50,
  parentNeighborhood: { L: 0, C: 50, R: 100 },
  returnModel: {}
});
const skim = createSkimTransport({
  departure: 50,
  target: 75,
  parentNeighborhood: { L: 0, C: 50, R: 100 },
  returnModel: {},
  maxRate: 2
});

assert.equal(context.kind, TRANSPORT_KIND.CONTEXT);
assert.equal(loop.kind, TRANSPORT_KIND.LOOP);
assert.equal(continuation.kind, TRANSPORT_KIND.CONTINUE);
assert.equal(isTransportActive(idle), false);
assert.equal(isTransportActive(context), true);
assert.equal(isObservationalTransport(context), true);
assert.equal(isObservationalTransport(loop), true);
assert.equal(isObservationalTransport(continuation), false);
assert.equal(desiredSkimRate(skim, 50, [1, 1.5, 2]), 2);
assert.equal(desiredSkimRate(skim, 75, [1, 1.5, 2]), 1);

console.log("Transport tests passed: Context windows, observation/commit classes, and Skim rate.");
