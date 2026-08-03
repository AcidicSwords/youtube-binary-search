// Transient physical playback state. Transport never enters Undo history directly.
import { EPSILON, clamp } from "./range-geometry.js";

export const TRANSPORT_KIND = Object.freeze({
  IDLE: "idle",
  CONTEXT: "context",
  PLAYBACK: "playback"
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

export function createPlaybackTransport({
  departure,
  parentNeighborhood,
  parentResolutionBasis,
  returnModel,
  label = "Playback",
  operator = "playback",
  rate = 1,
  dynamic = false
}) {
  return {
    kind: TRANSPORT_KIND.PLAYBACK,
    phase: "starting",
    departure,
    entry: departure,
    parentNeighborhood,
    parentResolutionBasis,
    returnModel,
    label,
    operator,
    // The rate this playback owns. A Range wrap continues the same playback and
    // so keeps it; settling ends the playback and returns Center to 1x.
    rate,
    // Whether that rate is read off the map as the playback crosses it. A
    // dynamic playback re-derives `rate` at every poll; a fixed one never does.
    dynamic,
    enteredPath: false,
    cycles: 0,
    startedAt: Date.now()
  };
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

export function withTransportPhase(transport, phase) {
  return transport?.kind === TRANSPORT_KIND.IDLE
    ? transport
    : { ...transport, phase };
}

// Dynamic playback rate: the inverse of cumulative weight, bucketed.
//
// Weight says how much map a Section receives, which is a statement about how
// much attention it is owed. Expanded ground is ground to dwell on; compressed
// ground is ground to cross quickly. So rate runs opposite to weight, and on the
// same ladder: the weight scale and the playback-rate scale share the values
// 0.25 through 2, so the correspondence is a reflection of one ladder onto
// itself rather than a curve fitted to it. Neutral weight is the fixed point --
// ground you never deformed plays at the speed it always did.
//
// Buckets are compared in log space because weights compose by multiplication:
// 0.5 is as far from 1 as 2 is, and the ladder should agree.
export const DYNAMIC_RATE_LADDER = Object.freeze([
  Object.freeze({ weight: 0.25, rate: 2 }),
  Object.freeze({ weight: 0.5, rate: 1.5 }),
  Object.freeze({ weight: 0.75, rate: 1.25 }),
  Object.freeze({ weight: 1, rate: 1 }),
  Object.freeze({ weight: 1.25, rate: 0.75 }),
  Object.freeze({ weight: 1.5, rate: 0.5 }),
  Object.freeze({ weight: 2, rate: 0.25 })
]);

export function dynamicRateForWeight(weight) {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= 0) return 1;
  // The ends are stated as clamps, not as the nearest bucket: everything at or
  // beyond them shares their rate however far past it goes.
  if (value <= DYNAMIC_RATE_LADDER[0].weight) return DYNAMIC_RATE_LADDER[0].rate;
  const last = DYNAMIC_RATE_LADDER.at(-1);
  if (value >= last.weight) return last.rate;
  const target = Math.log(value);
  return DYNAMIC_RATE_LADDER.reduce((best, entry) =>
    Math.abs(Math.log(entry.weight) - target) < Math.abs(Math.log(best.weight) - target)
      ? entry
      : best
  ).rate;
}
