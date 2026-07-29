// Transient physical playback state. Transport never enters Undo history directly.
import { EPSILON, clamp } from "./range-geometry.js";

export const TRANSPORT_KIND = Object.freeze({
  IDLE: "idle",
  CONTEXT: "context",
  PLAYBACK: "playback",
  LOOP: "loop"
});

export function idleTransport() {
  return { kind: TRANSPORT_KIND.IDLE };
}

export function isTransportActive(transport) {
  return Boolean(transport && transport.kind !== TRANSPORT_KIND.IDLE);
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
  operator = "playback"
}) {
  return {
    kind: TRANSPORT_KIND.PLAYBACK,
    phase: "starting",
    departure,
    parentNeighborhood,
    parentResolutionBasis,
    returnModel,
    label,
    operator,
    enteredPath: false,
    startedAt: Date.now()
  };
}

export function createLoopTransport({ anchor, start, end, source = "interval" }) {
  if (
    !Number.isFinite(anchor)
    || !Number.isFinite(start)
    || !Number.isFinite(end)
    || end - start <= EPSILON
  ) return idleTransport();

  return {
    kind: TRANSPORT_KIND.LOOP,
    phase: "starting",
    source,
    anchor: clamp(anchor, start, end),
    start,
    end,
    enteredWindow: false,
    cycles: 0,
    startedAt: Date.now()
  };
}

export function withTransportPhase(transport, phase) {
  return transport?.kind === TRANSPORT_KIND.IDLE
    ? transport
    : { ...transport, phase };
}
