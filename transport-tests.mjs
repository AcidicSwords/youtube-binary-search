import assert from "node:assert/strict";
import {
  TRANSPORT_KIND,
  dynamicRateForWeight,
  DYNAMIC_RATE_LADDER,
  idleTransport,
  deriveContextWindow,
  createContextTransport,
  createPlaybackTransport,
  isProperRange,
  isTransportActive,
  rebasePlaybackTransport,
  transportFieldRange,
  withTransportPhase
} from "./transport.js";

assert.deepEqual(deriveContextWindow(50, { start: 0, end: 100 }, 5), { start: 47.5, end: 52.5 });
assert.deepEqual(deriveContextWindow(0, { start: 0, end: 100 }, 5), { start: 0, end: 2.5 });
assert.deepEqual(deriveContextWindow(100, { start: 0, end: 100 }, 5), { start: 97.5, end: 100 });
assert.deepEqual(deriveContextWindow(12, { start: 10, end: 13 }, 5), { start: 10, end: 13 });
assert.deepEqual(
  deriveContextWindow(50, { start: 0, end: 100 }, 0.5),
  { start: 49.75, end: 50.25 }
);
assert.equal(deriveContextWindow(12, { start: 12, end: 12 }, 5), null);

const idle = idleTransport();
const context = createContextTransport({
  anchor: 50,
  range: { start: 0, end: 100 },
  seconds: 5
});
const playback = createPlaybackTransport({
  departure: 50,
  parentNeighborhood: { L: 0, C: 50, R: 100 },
  parentResolutionBasis: "range",
  returnModel: {}
});

assert.equal(context.kind, TRANSPORT_KIND.CONTEXT);
assert.deepEqual(
  { start: context.start, anchor: context.anchor, end: context.end },
  { start: 47.5, anchor: 50, end: 52.5 }
);
assert.equal(playback.kind, TRANSPORT_KIND.PLAYBACK);
assert.equal(playback.cycles, 0);
assert.equal(Object.hasOwn(TRANSPORT_KIND, "LOOP"), false);
assert.equal(isTransportActive(idle), false);
assert.equal(isTransportActive(context), true);
assert.equal(withTransportPhase(playback, "playing").phase, "playing");
assert.equal(isProperRange({ start: 0, end: 100 }, 100), false);
assert.equal(isProperRange({ start: 10, end: 100 }, 100), true);
assert.equal(isProperRange({ start: 0, end: 90 }, 100), true);
const wrapped = rebasePlaybackTransport(playback, 10, 1234);
assert.equal(wrapped.cycles, 1);
assert.equal(wrapped.enteredPath, false);
assert.equal(wrapped.entry, 10);
assert.equal(wrapped.startedAt, 1234);
assert.equal(playback.cycles, 0, "Range wrap metadata is immutable and Session-independent");

assert.deepEqual(
  transportFieldRange(playback, { start: 40, end: 80 }),
  { start: 40, end: 80 }
);

// Dynamic playback rate: weight says how much attention ground is owed, so rate
// runs opposite to it. The two ladders share their values, which is what makes
// the correspondence a reflection rather than a fitted curve.
{
  // The stated ends are clamps, not nearest buckets.
  assert.equal(dynamicRateForWeight(0.25), 2);
  assert.equal(dynamicRateForWeight(0.125), 2, "Everything at or below the low end shares its rate.");
  assert.equal(dynamicRateForWeight(2), 0.25);
  assert.equal(dynamicRateForWeight(4), 0.25, "and everything at or above the high end shares its.");

  // Ground nobody deformed plays at the speed it always did.
  assert.equal(dynamicRateForWeight(1), 1);

  // Monotone: more map always means more time on it, never less.
  const weights = [0.2, 0.25, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 1.9, 2, 5];
  const rates = weights.map(dynamicRateForWeight);
  for (let index = 1; index < rates.length; index += 1) {
    assert.ok(rates[index] <= rates[index - 1],
      `Rate must not rise with weight (${weights[index - 1]} -> ${weights[index]}).`);
  }

  // Buckets are compared multiplicatively, because weights compose that way:
  // 0.5 is as far from neutral as 2 is, and lands the same distance down.
  assert.equal(dynamicRateForWeight(0.5), 1.5);
  assert.equal(dynamicRateForWeight(1.5), 0.5);

  // Every rate the ladder can produce is one a player can be asked for.
  for (const entry of DYNAMIC_RATE_LADDER) {
    assert.ok(entry.rate >= 0.25 && entry.rate <= 2,
      "The ladder never asks for a rate outside the range players offer.");
  }
  assert.equal(dynamicRateForWeight(0), 1, "A nonsense weight changes nothing.");
  assert.equal(dynamicRateForWeight(Number.NaN), 1);
}

// A playback owns its rate and whether that rate follows the map.
{
  const fixed = createPlaybackTransport({ departure: 0, rate: 1.5 });
  assert.equal(fixed.rate, 1.5);
  assert.equal(fixed.dynamic, false, "A playback is fixed unless it says otherwise.");
  const dynamic = createPlaybackTransport({ departure: 0, rate: 1, dynamic: true });
  assert.equal(dynamic.dynamic, true);
  assert.equal(rebasePlaybackTransport(dynamic, 0).dynamic, true,
    "A Range wrap continues the same playback, so it stays dynamic.");
  assert.equal(rebasePlaybackTransport(fixed, 0).rate, 1.5,
    "and a fixed one keeps its rate across the wrap.");
}

console.log("Transport tests passed: source Context, playback ownership, projection-stable Range transport, and the inverse weight-to-rate ladder.");
