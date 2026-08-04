import assert from "node:assert/strict";
import {
  OBSERVATION_POLICY,
  RATE_POLICY_KIND,
  TRANSPORT_KIND,
  desiredCenterRate,
  resolveCenterRate,
  panoramaTriplet,
  offerIsKnown,
  dynamicRatePolicy,
  fixedRatePolicy,
  idleTransport,
  deriveContextWindow,
  createContextTransport,
  createPlaybackTransport,
  isProperRange,
  isTransportActive,
  playbackAllowsPanorama,
  rebasePlaybackTransport,
  resolveOfferedRate,
  resolvePlaybackRate,
  retryPlaybackTransport,
  transportFieldRange,
  withPlaybackActualRate,
  withPlaybackRatePolicy,
  withPlaybackRequestedRate,
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
assert.equal(playback.observationPolicy, OBSERVATION_POLICY.PANORAMA);
assert.deepEqual(playback.ratePolicy, fixedRatePolicy(1));
assert.equal(playback.requestedRate, 1);
assert.equal(playback.actualRate, 1);
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

// Cumulative Weight is read as a playback texture, not as a correction.
//
//   c*(W) = 1 - 0.25*log2(W)
//
// One rate step per octave. This deliberately falls far short of inverting the
// map -- the previous law made rate the exact reciprocal of Weight, so W = 4
// played at 0.25x and W = 8 asked for 0.125x, a rate no player offers. The aim
// is a readable texture over a continuous playback: compressed regions play
// faster, expanded regions slower, and the useful middle of the ladder stays
// inside what the Panorama can hold.
const LADDER = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
{
  assert.equal(desiredCenterRate(1), 1, "Neutral plays at 1x.");
  assert.equal(desiredCenterRate(2), 0.75, "A doubling costs exactly one step.");
  assert.equal(desiredCenterRate(0.5), 1.25, "A halving gains exactly one step.");
  assert.equal(desiredCenterRate(4), 0.5, "Two octaves, two steps.");
  assert.equal(desiredCenterRate(0.125), 1.75);
  assert.equal(desiredCenterRate(8), 0.25);
  assert.equal(desiredCenterRate(0), 1, "A nonsense weight changes nothing.");
  assert.equal(desiredCenterRate(Number.NaN), 1);

  // Every canonical Weight, resolved onto the ladder a player actually offers.
  for (const [weight, expected] of [
    [0.125, 1.75], [0.25, 1.5], [0.5, 1.25], [0.75, 1], [1, 1],
    [1.25, 1], [1.5, 0.75], [1.75, 0.75], [2, 0.75], [4, 0.5], [8, 0.25]
  ]) {
    assert.equal(resolveCenterRate(weight, LADDER), expected,
      `Weight ${weight} plays Center at ${expected}x.`);
  }

  // Weights compose by multiplication, which is addition in octave space.
  for (const [factors, expected] of [
    [[0.5, 2], 1], [[2, 2], 0.5], [[0.5, 0.5], 1.5],
    [[0.25, 0.5], 1.75], [[2, 2, 2], 0.25]
  ]) {
    const composed = factors.reduce((product, factor) => product * factor, 1);
    assert.equal(resolveCenterRate(composed, LADDER), expected,
      `${factors.join(" x ")} composes to Center ${expected}x.`);
  }

  // Center changes at half-octave boundaries, and an exact tie -- which lands
  // precisely on one -- resolves toward 1x, so a boundary belongs to the calmer
  // of the two rates.
  for (const octave of [-3, -2, -1, 0, 1, 2]) {
    const boundary = Math.pow(2, octave + 0.5);
    const desired = desiredCenterRate(boundary);
    const lower = Math.round((desired - 0.125) * 4) / 4;
    const upper = lower + 0.25;
    const toward = Math.abs(lower - 1) < Math.abs(upper - 1) ? lower : upper;
    assert.equal(resolveCenterRate(boundary, LADDER), toward,
      `An exact tie at W = 2^${octave + 0.5} resolves toward 1x.`);
    assert.notEqual(
      resolveCenterRate(boundary * (1 - 1e-6), LADDER),
      resolveCenterRate(boundary * (1 + 1e-6), LADDER),
      `W = 2^${octave + 0.5} is a genuine bucket boundary.`
    );
  }

  // Monotone: more map always means more time on it, never less.
  const weights = [0.125, 0.2, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];
  const rates = weights.map(weight => resolveCenterRate(weight, LADDER));
  for (let index = 1; index < rates.length; index += 1) {
    assert.ok(rates[index] <= rates[index - 1],
      `Rate must not rise with Weight (${weights[index - 1]} -> ${weights[index]}).`);
  }
}

// Panorama needs a complete symmetric triplet, one rung either side of Center.
{
  for (const [center, expected] of [
    [0.5, [0.25, 0.5, 0.75]], [0.75, [0.5, 0.75, 1]], [1, [0.75, 1, 1.25]],
    [1.25, [1, 1.25, 1.5]], [1.5, [1.25, 1.5, 1.75]], [1.75, [1.5, 1.75, 2]]
  ]) {
    assert.deepEqual(
      panoramaTriplet(center, LADDER),
      { tail: expected[0], center: expected[1], lead: expected[2] },
      `Center ${center}x has an exact adjacent triplet.`
    );
  }
  assert.equal(panoramaTriplet(0.25, LADDER), null,
    "At the bottom of the ladder there is no Tail, so Center plays alone.");
  assert.equal(panoramaTriplet(2, LADDER), null,
    "and at the top there is no Lead.");

  // A missing neighbour suspends Panorama rather than substituting an
  // asymmetric triplet, which would break the one relation the Field rests on.
  assert.equal(panoramaTriplet(1, [0.5, 1, 1.25, 1.5]), null,
    "A ladder without 0.75x cannot hold a triplet at 1x.");
  assert.equal(panoramaTriplet(1, [0.5, 0.75, 1, 1.5]), null,
    "Neither can one without 1.25x.");

  // An adapter that has not reported its ladder has not reported a missing one.
  assert.equal(offerIsKnown([]), false);
  assert.equal(offerIsKnown([1]), false, "The default answer is not a ladder.");
  assert.equal(offerIsKnown(LADDER), true);
}

// Offered-rate resolution uses multiplicative distance and prefers neutral at
// an exact geometric tie. The stored wish is never replaced by this resolution.
{
  assert.equal(resolveOfferedRate(1.4, [1, 2]), 1);
  assert.equal(resolveOfferedRate(1.5, [1, 2]), 2,
    "1.5x is multiplicatively nearer 2x even though additive distance ties.");
  assert.equal(resolveOfferedRate(Math.sqrt(2), [1, 2]), 1,
    "A geometric tie resolves toward 1x.");
  assert.equal(resolveOfferedRate(1 / Math.sqrt(2), [0.5, 1]), 1,
    "The tie rule is symmetric below 1x.");
  assert.equal(resolveOfferedRate(2, [2, 1, 2, -1, Number.NaN]), 2,
    "Offers are normalized without assuming a ladder.");
  assert.equal(resolveOfferedRate(2, []), 1, "An absent offer safely resolves to 1x.");
}

// Observation and rate are separate policy dimensions. requestedRate is the
// current offer's resolution; actualRate changes only on adapter confirmation.
{
  const panorama = createPlaybackTransport({
    departure: 0,
    observationPolicy: OBSERVATION_POLICY.PANORAMA,
    ratePolicy: fixedRatePolicy(1),
    offeredRates: [0.5, 1, 2],
    actualRate: 1
  });
  assert.equal(playbackAllowsPanorama(panorama), true);

  const shiftedAtOne = createPlaybackTransport({
    departure: 0,
    observationPolicy: OBSERVATION_POLICY.CENTER_ONLY,
    ratePolicy: fixedRatePolicy(1),
    offeredRates: [1]
  });
  assert.equal(shiftedAtOne.requestedRate, 1);
  assert.equal(playbackAllowsPanorama(shiftedAtOne), false,
    "Shift fixed 1x remains Center-only.");

  const nativeChanged = withPlaybackActualRate(panorama, 1.5);
  assert.equal(nativeChanged.ratePolicy.wish, 1,
    "A native rate event does not rewrite the stored fixed wish.");
  assert.equal(nativeChanged.requestedRate, 1,
    "Nor does confirmation impersonate the request.");
  assert.equal(nativeChanged.actualRate, 1.5);
  assert.equal(playbackAllowsPanorama(nativeChanged), false,
    "An actual incompatible rate suspends Panorama without changing policy.");
  assert.equal(playbackAllowsPanorama(withPlaybackActualRate(panorama, 1.01)), false,
    "Source-time equality tolerance must not blur playback-rate compatibility.");
  assert.equal(playbackAllowsPanorama(withPlaybackActualRate(nativeChanged, 1)), true);
  assert.equal(withPlaybackActualRate(nativeChanged, 0), nativeChanged,
    "Invalid adapter events cannot corrupt actual-rate authority.");
}

// Fixed wishes survive a provisional [1x] offer and can be resolved again when
// YouTube later publishes its complete ladder.
{
  const fixed = createPlaybackTransport({
    departure: 0,
    observationPolicy: OBSERVATION_POLICY.CENTER_ONLY,
    ratePolicy: fixedRatePolicy(2),
    offeredRates: [1],
    actualRate: 1
  });
  assert.equal(fixed.ratePolicy.kind, RATE_POLICY_KIND.FIXED);
  assert.equal(fixed.ratePolicy.wish, 2);
  assert.equal(fixed.requestedRate, 1);
  const expandedResolution = resolvePlaybackRate(fixed, {
    offeredRates: [0.5, 1, 1.5, 2]
  });
  assert.equal(expandedResolution, 2);
  const retuned = withPlaybackRequestedRate(fixed, expandedResolution);
  assert.equal(retuned.requestedRate, 2);
  assert.equal(retuned.actualRate, 1,
    "A rate request is not confirmation that the adapter accepted it.");
  assert.equal(retuned.ratePolicy.wish, 2);

  const wrapped = rebasePlaybackTransport(retuned, 10);
  assert.equal(wrapped.ratePolicy.wish, 2,
    "A fixed Range wrap retains the wish rather than freezing an old offer.");
  assert.equal(resolvePlaybackRate(wrapped, { offeredRates: [1, 1.5] }), 1.5);
  const retry = retryPlaybackTransport(wrapped, 1500);
  assert.deepEqual(retry.ratePolicy, wrapped.ratePolicy);
  assert.equal(resolvePlaybackRate(retry, { offeredRates: [1, 2] }), 2,
    "Retry reapplies fixed policy against the current offer.");
}

// Dynamic policy is rederived at the active source Address for retries and
// Range wrap; rebasing never turns it into a fixed bucket.
{
  const dynamic = createPlaybackTransport({
    departure: 20,
    observationPolicy: OBSERVATION_POLICY.CENTER_ONLY,
    ratePolicy: dynamicRatePolicy(),
    offeredRates: LADDER,
    weight: 4,
    actualRate: 0.5
  });
  assert.equal(dynamic.ratePolicy.kind, RATE_POLICY_KIND.DYNAMIC);
  assert.equal(dynamic.requestedRate, 0.5, "Two octaves of Weight cost two rate steps.");

  const wrapped = rebasePlaybackTransport(dynamic, 10, 1234);
  assert.equal(wrapped.cycles, 1);
  assert.equal(wrapped.entry, 10);
  assert.equal(wrapped.observationPolicy, OBSERVATION_POLICY.CENTER_ONLY);
  assert.equal(wrapped.ratePolicy.kind, RATE_POLICY_KIND.DYNAMIC);
  assert.equal(wrapped.actualRate, 0.5);
  assert.equal(resolvePlaybackRate(wrapped, {
    offeredRates: LADDER,
    weight: 0.25
  }), 1.5, "Wrap rederives dynamic rate from Weight at Range Start.");

  const retry = retryPlaybackTransport(wrapped, 2000);
  assert.equal(retry.retries, 1);
  assert.equal(retry.cycles, 1, "Retry is not a Range cycle.");
  assert.equal(retry.entry, 10);
  assert.equal(retry.observationPolicy, wrapped.observationPolicy);
  assert.deepEqual(retry.ratePolicy, wrapped.ratePolicy);
  assert.equal(retry.requestedRate, wrapped.requestedRate);
  assert.equal(retry.actualRate, wrapped.actualRate);
  assert.equal(retry.startedAt, 2000);

  const fixed = withPlaybackRatePolicy(dynamic, fixedRatePolicy(Math.sqrt(2)), {
    offeredRates: [1, 2]
  });
  assert.deepEqual(fixed.ratePolicy, fixedRatePolicy(Math.sqrt(2)));
  assert.equal(fixed.requestedRate, 1,
    "A log-space tie between 1x and 2x resolves toward neutral.");
}

console.log("Transport tests passed: source Context, explicit playback observation/rate policy, authoritative actual rate, policy-preserving retry/wrap, log-space offer resolution, a log-compressed Weight texture of one rate step per octave, and Panorama triplets that suspend rather than turn asymmetric.");
