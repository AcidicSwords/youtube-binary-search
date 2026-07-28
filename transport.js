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

export function isObservationalTransport(transport) {
  return transport?.kind === TRANSPORT_KIND.CONTEXT;
}

export function deriveContextWindow(anchor, range, seconds, preRollSeconds = 1) {
  if (!Number.isFinite(anchor) || !range || !Number.isFinite(seconds) || seconds <= EPSILON) {
    return null;
  }

  const rangeDuration = Math.max(0, range.end - range.start);
  const duration = Math.min(seconds, rangeDuration);
  if (duration <= EPSILON) return null;

  const boundedAnchor = clamp(anchor, range.start, range.end);
  const latestStart = Math.max(range.start, range.end - duration);
  const start = clamp(boundedAnchor - Math.max(0, preRollSeconds), range.start, latestStart);
  const end = Math.min(range.end, start + duration);

  return end - start > EPSILON ? { start, end } : null;
}

export function createContextTransport({ anchor, range, seconds, preRollSeconds = 1 }) {
  const window = deriveContextWindow(anchor, range, seconds, preRollSeconds);
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
  crossedResolution = false,
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
    crossedResolution,
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
