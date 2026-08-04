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
  DYNAMIC: "dynamic"
});

export function idleTransport() {
  return { kind: TRANSPORT_KIND.IDLE };
}

export function isTransportActive(transport) {
  return Boolean(transport && transport.kind !== TRANSPORT_KIND.IDLE);
}

export function transportFieldRange(transport, range) {
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

// Dynamic playback rate is the exact inverse of cumulative effective Weight.
// The projection owns Weight; the media adapter's current offer owns which rate
// can actually be requested. Transport adds no second set of bounds.
export function dynamicRateForWeight(weight) {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return 1 / value;
}

export function resolvePlaybackRate(
  transport,
  { offeredRates = [1], weight = 1 } = {}
) {
  if (transport?.kind !== TRANSPORT_KIND.PLAYBACK) return 1;
  const wish = transport.ratePolicy?.kind === RATE_POLICY_KIND.DYNAMIC
    ? dynamicRateForWeight(weight)
    : positiveRate(transport.ratePolicy?.wish);
  return resolveOfferedRate(wish, offeredRates);
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

// Panorama is an observation policy, not a synonym for 1x. The sides are
// available only while that policy owns playback and the adapter confirms an
// actual rate compatible with their fixed temporal relation.
export function playbackAllowsPanorama(transport) {
  const RATE_EPSILON = 1e-9;
  return Boolean(
    transport?.kind === TRANSPORT_KIND.PLAYBACK
    && transport.observationPolicy === OBSERVATION_POLICY.PANORAMA
    && Math.abs(positiveRate(transport.actualRate) - 1) <= RATE_EPSILON
  );
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
