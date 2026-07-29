import assert from "node:assert/strict";
import {
  TRANSPORT_KIND,
  idleTransport,
  deriveContextWindow,
  createContextTransport,
  createPlaybackTransport,
  createLoopTransport,
  isTransportActive
} from "./transport.js";

assert.deepEqual(deriveContextWindow(50, { start: 0, end: 100 }, 5, 1), { start: 49, end: 54 });
assert.deepEqual(deriveContextWindow(0, { start: 0, end: 100 }, 5, 1), { start: 0, end: 5 });
assert.deepEqual(deriveContextWindow(100, { start: 0, end: 100 }, 5, 1), { start: 95, end: 100 });
assert.deepEqual(deriveContextWindow(12, { start: 10, end: 13 }, 5, 1), { start: 10, end: 13 });
assert.deepEqual(
  deriveContextWindow(50, { start: 0, end: 100 }, 0.5, 1),
  { start: 49.5, end: 50 },
  "A custom Context shorter than pre-roll must still include Current."
);
assert.equal(deriveContextWindow(12, { start: 12, end: 12 }, 5, 1), null);

const idle = idleTransport();
const context = createContextTransport({ anchor: 50, range: { start: 0, end: 100 }, seconds: 5 });
const playback = createPlaybackTransport({
  departure: 50,
  parentNeighborhood: { L: 0, C: 50, R: 100 },
  parentResolutionBasis: "range",
  returnModel: {}
});
const loop = createLoopTransport({ anchor: 50, start: 40, end: 50 });

assert.equal(context.kind, TRANSPORT_KIND.CONTEXT);
assert.equal(playback.kind, TRANSPORT_KIND.PLAYBACK);
assert.equal(loop.kind, TRANSPORT_KIND.LOOP);
assert.deepEqual({ start: loop.start, end: loop.end }, { start: 40, end: 50 });
assert.equal(loop.cycles, 0);
assert.equal(isTransportActive(idle), false);
assert.equal(isTransportActive(context), true);

console.log("Transport tests passed: Context windows, native playback settlement, and frozen Loop operands.");
