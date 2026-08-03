import assert from "node:assert/strict";
import {
  TRANSPORT_KIND,
  dynamicRateForWeight,
  MIN_DYNAMIC_RATE,
  MAX_DYNAMIC_RATE,
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

// Dynamic playback rate is the exact inverse of cumulative weight: double the
// map a Section receives and it plays at half the rate. Neutral is its own
// inverse. The bounds belong to the player, not to the law.
{
  assert.equal(dynamicRateForWeight(1), 1, "Neutral is its own inverse.");
  assert.equal(dynamicRateForWeight(2), 0.5, "Double the map, half the rate.");
  assert.equal(dynamicRateForWeight(0.5), 2, "Half the map, double the rate.");
  assert.equal(dynamicRateForWeight(4), 0.25);

  // weight x rate = 1 wherever the player can follow it.
  for (const weight of [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]) {
    const rate = dynamicRateForWeight(weight);
    assert.ok(Math.abs(weight * rate - 1) < 1e-9,
      `weight x rate must be 1 inside the player's range (${weight}).`);
  }

  // Past the bounds the relation still holds on the map; the rate stops.
  assert.equal(dynamicRateForWeight(0.25), MAX_DYNAMIC_RATE);
  assert.equal(dynamicRateForWeight(0.125), MAX_DYNAMIC_RATE);
  assert.equal(dynamicRateForWeight(8), MIN_DYNAMIC_RATE);
  assert.equal(MIN_DYNAMIC_RATE, 0.25);
  assert.equal(MAX_DYNAMIC_RATE, 2);

  // Reciprocal weights give reciprocal rates, which is what makes it symmetric.
  for (const weight of [0.5, 0.75, 1, 1.5, 2]) {
    assert.ok(
      Math.abs(dynamicRateForWeight(weight) * dynamicRateForWeight(1 / weight) - 1) < 1e-9,
      `A weight and its reciprocal give reciprocal rates (${weight}).`
    );
  }

  // Monotone: more map always means more time on it, never less.
  const weights = [0.2, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 9];
  const rates = weights.map(dynamicRateForWeight);
  for (let index = 1; index < rates.length; index += 1) {
    assert.ok(rates[index] <= rates[index - 1],
      `Rate must not rise with weight (${weights[index - 1]} -> ${weights[index]}).`);
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

console.log("Transport tests passed: source Context, playback ownership, projection-stable Range transport, and a playback rate that is the exact inverse of cumulative weight.");
