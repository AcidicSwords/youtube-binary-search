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

// Dynamic playback rate: the exact inverse of cumulative weight.
//
// Double the map a Section receives and it plays at half the rate; halve the map
// and it plays at double. Neutral is its own inverse, so ground nobody deformed
// plays at the speed it always did. Stated once:
//
//   weight x rate = 1
//
// which is the same as saying Timeline Space is crossed at a constant speed. The
// map already claims that expanded ground is bigger; playing it this way is that
// claim carried into time rather than a second scale invented to sit beside it.
//
// The bounds are the player's, not the law's. Past them the relation still holds
// on the map; the rate simply cannot follow any further, so it stops.
export const MIN_DYNAMIC_RATE = 0.25;
export const MAX_DYNAMIC_RATE = 2;

export function dynamicRateForWeight(weight) {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(MAX_DYNAMIC_RATE, Math.max(MIN_DYNAMIC_RATE, 1 / value));
}
