// Transient physical playback state. Transport never enters Undo history directly.
import { EPSILON, clamp } from "./range-geometry.js";

export const TRANSPORT_KIND = Object.freeze({
  IDLE: "idle",
  CONTEXT: "context",
  PLAYBACK: "playback"
});

export const OBSERVATION_POLICY = Object.freeze({
  PANORAMA: "panorama",
  CENTER_ONLY: "center-only"
});

export const RATE_POLICY_KIND = Object.freeze({
  FIXED: "fixed",
  // Cumulative Weight is read as a playback texture, not as a correction. It
  // does not cancel the map's deformation and must not be named as though it
  // did: compressed regions play faster and expanded regions play slower, by
  // one rate step per octave, which is a fraction of exact inversion.
  DYNAMIC: "dynamic-weight-texture"
});

// One playback-rate step per octave of Weight, and one step between adjacent
// Panorama panes. Both are quarter steps, which is what makes the two compose:
// a Center anywhere on the ladder still has neighbours one step away.
export const CENTER_RATE_OCTAVE_STEP = 0.25;
export const PANORAMA_SIDE_STEP = 0.25;
const RATE_EPSILON = 1e-9;

export function idleTransport() {
  return { kind: TRANSPORT_KIND.IDLE };
}

export function isTransportActive(transport) {
  return Boolean(transport && transport.kind !== TRANSPORT_KIND.IDLE);
}

export function transportPanoramaRange(transport, range) {
  if (
    !range
    || !Number.isFinite(range.start)
    || !Number.isFinite(range.end)
  ) return null;
  return { start: range.start, end: range.end };
}

export function isProperRange(range, duration) {
  return Boolean(
    range
    && Number.isFinite(range.start)
    && Number.isFinite(range.end)
    && Number.isFinite(duration)
    && (
      range.start > EPSILON
      || range.end < duration - EPSILON
    )
  );
}

export function deriveContextWindow(anchor, range, seconds) {
  if (!Number.isFinite(anchor) || !range || !Number.isFinite(seconds) || seconds <= EPSILON) {
    return null;
  }

  const boundedAnchor = clamp(anchor, range.start, range.end);
  const halfDuration = seconds / 2;
  // Context is centered on the semantic traversal point. Range clips either
  // half independently rather than shifting surplus duration to the other
  // side, so observation never reaches more than half the setting past Current.
  const start = Math.max(range.start, boundedAnchor - halfDuration);
  const end = Math.min(range.end, boundedAnchor + halfDuration);

  return end - start > EPSILON ? { start, end } : null;
}

export function createContextTransport({ anchor, range, seconds }) {
  const window = deriveContextWindow(anchor, range, seconds);
  if (!window) return idleTransport();
  return {
    kind: TRANSPORT_KIND.CONTEXT,
    phase: "starting",
    anchor: clamp(anchor, range.start, range.end),
    start: window.start,
    end: window.end,
    // Where the watching began, which for a Context is the window's own start
    // rather than the Address that anchored it. Playback carries the same field
    // so that settling either transport can say what source time was actually
    // crossed; without it a Context window is watched and never recorded.
    entry: window.start,
    enteredWindow: false,
    startedAt: Date.now()
  };
}

function positiveRate(value, fallback = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function fixedRatePolicy(wish = 1) {
  return {
    kind: RATE_POLICY_KIND.FIXED,
    wish: positiveRate(wish)
  };
}

export function dynamicRatePolicy() {
  return { kind: RATE_POLICY_KIND.DYNAMIC };
}

function normalizeRatePolicy(policy) {
  return policy?.kind === RATE_POLICY_KIND.DYNAMIC
    ? dynamicRatePolicy()
    : fixedRatePolicy(policy?.wish);
}

function normalizeObservationPolicy(policy) {
  return policy === OBSERVATION_POLICY.CENTER_ONLY
    ? OBSERVATION_POLICY.CENTER_ONLY
    : OBSERVATION_POLICY.PANORAMA;
}

function normalizedOfferedRates(rates) {
  const offered = [...new Set(
    (Array.isArray(rates) ? rates : [])
      .map(Number)
      .filter(rate => Number.isFinite(rate) && rate > 0)
  )].sort((a, b) => a - b);
  return offered.length ? offered : [1];
}

// Playback-rate distances are multiplicative: 0.5x is as far below 1x as 2x
// is above it. Resolve a stored wish in that same log space. At an exact
// geometric midpoint, prefer the offer nearer neutral so the adapter changes
// the observation as little as possible; the numeric order is only a final,
// deterministic tie-break for reciprocal offers equally far from neutral.
export function resolveOfferedRate(wish, rates) {
  const target = positiveRate(wish);
  const offered = normalizedOfferedRates(rates);
  const SCORE_EPSILON = 1e-12;

  return offered.reduce((best, candidate) => {
    const score = Math.abs(Math.log(candidate / target));
    const bestScore = Math.abs(Math.log(best / target));
    if (score < bestScore - SCORE_EPSILON) return candidate;
    if (Math.abs(score - bestScore) > SCORE_EPSILON) return best;

    const neutralDistance = Math.abs(Math.log(candidate));
    const bestNeutralDistance = Math.abs(Math.log(best));
    if (neutralDistance < bestNeutralDistance - SCORE_EPSILON) return candidate;
    if (Math.abs(neutralDistance - bestNeutralDistance) > SCORE_EPSILON) return best;
    return Math.min(candidate, best);
  });
}

// The desired Center rate for a cumulative Weight.
//
//   c*(W) = 1 − 0.25·log₂W
//
// Weights compose by multiplication, which is addition in octave space, so the
// rate is linear in octaves: every doubling of Weight slows Center by one step
// and every halving accelerates it by one. This deliberately falls far short of
// inverting the map — W = 4 plays at 0.5×, not 0.25× — because the aim is a
// readable texture over a continuous playback, not constant Timeline velocity.
export function desiredCenterRate(weight) {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return 1 - CENTER_RATE_OCTAVE_STEP * Math.log2(value);
}

// Snapping the desired Center rate onto whatever ladder the adapter offers.
//
// This is a different question from `resolveOfferedRate`, which resolves a
// stored Shift-playback wish and reasons in log space because a wish of 2× is
// as far from 1× as 0.5× is. Here the candidates are rungs of an evenly spaced
// quarter-step ladder and the desired value is already expressed on it, so
// nearest is measured linearly. An exact tie — which lands precisely on a
// half-octave of Weight — resolves toward 1×, so the boundaries of the buckets
// belong to the calmer of the two rates.
export function resolveCenterRate(weight, rates) {
  const target = desiredCenterRate(weight);
  const offered = normalizedOfferedRates(rates);
  return offered.reduce((best, candidate) => {
    const distance = Math.abs(candidate - target);
    const bestDistance = Math.abs(best - target);
    if (distance < bestDistance - RATE_EPSILON) return candidate;
    if (distance > bestDistance + RATE_EPSILON) return best;
    const neutral = Math.abs(candidate - 1);
    const bestNeutral = Math.abs(best - 1);
    if (neutral < bestNeutral - RATE_EPSILON) return candidate;
    if (neutral > bestNeutral + RATE_EPSILON) return best;
    return Math.min(candidate, best);
  });
}

// Panorama needs a complete symmetric triplet: one rate step below Center for
// Tail and one above for Lead. Both must actually be offered. A missing
// neighbour yields no triplet rather than an asymmetric substitute, because
// unequal side steps would break the one relation the Panorama rests on — Tail and
// Lead equally displaced from Center, cycling at one shared speed.
export function panoramaTriplet(centerRate, rates) {
  const center = positiveRate(centerRate);
  const tail = center - PANORAMA_SIDE_STEP;
  const lead = center + PANORAMA_SIDE_STEP;
  if (!(tail > 0)) return null;
  const offered = normalizedOfferedRates(rates);
  const offers = rate => offered.some(value => Math.abs(value - rate) <= RATE_EPSILON);
  if (!offers(center) || !offers(tail) || !offers(lead)) return null;
  return { tail, center, lead };
}

// An adapter that has not yet reported its ladder has not reported a *missing*
// ladder. YouTube commonly answers 1x until playback has actually begun, so an
// unknown offer is treated as capable and re-evaluated when the real list
// arrives — the rule the Panorama already follows everywhere else.
export function offerIsKnown(rates) {
  return Array.isArray(rates)
    && rates.filter(rate => Number.isFinite(Number(rate)) && Number(rate) > 0).length > 1;
}

export function resolvePlaybackRate(
  transport,
  { offeredRates = [1], weight = 1 } = {}
) {
  if (transport?.kind !== TRANSPORT_KIND.PLAYBACK) return 1;
  return transport.ratePolicy?.kind === RATE_POLICY_KIND.DYNAMIC
    ? resolveCenterRate(weight, offeredRates)
    : resolveOfferedRate(positiveRate(transport.ratePolicy?.wish), offeredRates);
}

export function createPlaybackTransport({
  departure,
  parentNeighborhood,
  parentResolutionBasis,
  returnModel,
  label = "Playback",
  operator = "playback",
  observationPolicy = OBSERVATION_POLICY.PANORAMA,
  ratePolicy = fixedRatePolicy(1),
  offeredRates = [1],
  weight = 1,
  actualRate = 1
}) {
  const transport = {
    kind: TRANSPORT_KIND.PLAYBACK,
    phase: "starting",
    departure,
    entry: departure,
    parentNeighborhood,
    parentResolutionBasis,
    returnModel,
    label,
    operator,
    observationPolicy: normalizeObservationPolicy(observationPolicy),
    ratePolicy: normalizeRatePolicy(ratePolicy),
    // requestedRate is the current offer's resolution of ratePolicy. It is a
    // command candidate, not evidence that the iframe accepted it.
    requestedRate: 1,
    // Only the adapter's playback-rate event confirms actualRate.
    actualRate: positiveRate(actualRate),
    enteredPath: false,
    cycles: 0,
    retries: 0,
    startedAt: Date.now()
  };
  return {
    ...transport,
    requestedRate: resolvePlaybackRate(transport, { offeredRates, weight })
  };
}

export function withPlaybackRequestedRate(transport, requestedRate) {
  if (transport?.kind !== TRANSPORT_KIND.PLAYBACK) return transport;
  const rate = positiveRate(requestedRate, null);
  return rate === null || rate === transport.requestedRate
    ? transport
    : { ...transport, requestedRate: rate };
}

export function withPlaybackActualRate(transport, actualRate) {
  if (transport?.kind !== TRANSPORT_KIND.PLAYBACK) return transport;
  const rate = positiveRate(actualRate, null);
  return rate === null || rate === transport.actualRate
    ? transport
    : { ...transport, actualRate: rate };
}

export function withPlaybackRatePolicy(transport, ratePolicy, options = {}) {
  if (transport?.kind !== TRANSPORT_KIND.PLAYBACK) return transport;
  const next = { ...transport, ratePolicy: normalizeRatePolicy(ratePolicy) };
  return withPlaybackRequestedRate(next, resolvePlaybackRate(next, options));
}

// Panorama is an observation policy, not a synonym for 1x. It runs wherever the
// confirmed Center rate has a complete triplet on the adapter's ladder, which on
// YouTube's quarter-step ladder is 0.5x to 1.75x. Outside that window Center
// plays alone — a presentation consequence, never the end of the Playback
// transaction. The adapter's confirmed rate is authoritative; a rate that was
// merely requested has not yet moved anything.
export function playbackAllowsPanorama(transport, { offeredRates = null } = {}) {
  if (transport?.kind !== TRANSPORT_KIND.PLAYBACK) return false;
  if (transport.observationPolicy !== OBSERVATION_POLICY.PANORAMA) return false;
  const actual = positiveRate(transport.actualRate);
  if (!offerIsKnown(offeredRates)) {
    return Math.abs(actual - 1) <= RATE_EPSILON;
  }
  return panoramaTriplet(actual, offeredRates) !== null;
}

export function rebasePlaybackTransport(
  transport,
  entry = transport?.entry ?? transport?.departure,
  startedAt = Date.now()
) {
  if (transport?.kind !== TRANSPORT_KIND.PLAYBACK) return transport;
  return {
    ...transport,
    phase: "starting",
    entry,
    enteredPath: false,
    cycles: (transport.cycles || 0) + 1,
    startedAt
  };
}

export function retryPlaybackTransport(transport, startedAt = Date.now()) {
  if (transport?.kind !== TRANSPORT_KIND.PLAYBACK) return transport;
  return {
    ...transport,
    phase: "starting",
    enteredPath: false,
    retries: (transport.retries || 0) + 1,
    startedAt
  };
}

export function withTransportPhase(transport, phase) {
  return transport?.kind === TRANSPORT_KIND.IDLE
    ? transport
    : { ...transport, phase };
}
