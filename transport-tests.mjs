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

assert.deepEqual(deriveContextWindow(50, { start: 0, end: 100 }, 5), { start: 47.5, end: 52.5 });
assert.deepEqual(deriveContextWindow(0, { start: 0, end: 100 }, 5), { start: 0, end: 2.5 });
assert.deepEqual(deriveContextWindow(100, { start: 0, end: 100 }, 5), { start: 97.5, end: 100 });
assert.deepEqual(deriveContextWindow(12, { start: 10, end: 13 }, 5), { start: 10, end: 13 });
assert.deepEqual(
  deriveContextWindow(50, { start: 0, end: 100 }, 0.5),
  { start: 49.75, end: 50.25 },
  "Fractional Context must still cross Current symmetrically."
);
assert.equal(deriveContextWindow(12, { start: 12, end: 12 }, 5), null);

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
assert.deepEqual(
  { start: context.start, anchor: context.anchor, end: context.end },
  { start: 47.5, anchor: 50, end: 52.5 },
  "The traversal point must bisect Context."
);
assert.equal(playback.kind, TRANSPORT_KIND.PLAYBACK);
assert.equal(loop.kind, TRANSPORT_KIND.LOOP);
assert.deepEqual({ start: loop.start, end: loop.end }, { start: 40, end: 50 });
assert.equal(loop.cycles, 0);
assert.equal(isTransportActive(idle), false);
assert.equal(isTransportActive(context), true);

console.log("Transport tests passed: Context windows, native playback settlement, and frozen Loop operands.");
