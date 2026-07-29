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

export function transportFieldRange(transport, range) {
  if (
    !range
    || !Number.isFinite(range.start)
    || !Number.isFinite(range.end)
  ) return null;
  if (
    transport?.kind === TRANSPORT_KIND.LOOP
    && Number.isFinite(transport.start)
    && Number.isFinite(transport.end)
  ) {
    return {
      start: Math.min(range.start, transport.start),
      end: Math.max(range.end, transport.end)
    };
  }
  return { start: range.start, end: range.end };
}

/**
 * Source extents that must remain metrically materialized while a physical
 * transport is active. Ordinary playback expands the complete active Range so
 * Center and either Field side always measure contiguous source time, including
 * behind the playback departure. Loop is also physical three-pane playback and
 * therefore expands Range plus any frozen operand beyond it. Context is
 * Center-only and owns its frozen window.
 */
export function transportMaterializedExtents(transport, range) {
  if (!transport || !range) return [];
  if (transport.kind === TRANSPORT_KIND.CONTEXT) {
    return Number.isFinite(transport.start) && Number.isFinite(transport.end)
      ? [{ start: transport.start, end: transport.end }]
      : [];
  }
  if (transport.kind === TRANSPORT_KIND.PLAYBACK) {
    const fieldRange = transportFieldRange(transport, range);
    return fieldRange ? [fieldRange] : [];
  }
  if (transport.kind === TRANSPORT_KIND.LOOP) {
    const fieldRange = transportFieldRange(transport, range);
    return fieldRange ? [fieldRange] : [];
  }
  return [];
}

export function deriveContextWindow(anchor, range, seconds, projection = null) {
  if (!Number.isFinite(anchor) || !range || !Number.isFinite(seconds) || seconds <= EPSILON) {
    return null;
  }

  const boundedAnchor = clamp(anchor, range.start, range.end);
  const halfDuration = seconds / 2;
  // Context is centered on the semantic traversal point. Range clips either
  // half independently rather than shifting surplus duration to the other
  // side, so observation never reaches more than half the setting past Current.
  const start = projection?.sourceStep
    ? projection.sourceStep(boundedAnchor, halfDuration, "backward", range)
    : Math.max(range.start, boundedAnchor - halfDuration);
  const end = projection?.sourceStep
    ? projection.sourceStep(boundedAnchor, halfDuration, "forward", range)
    : Math.min(range.end, boundedAnchor + halfDuration);

  return end - start > EPSILON ? { start, end } : null;
}

export function createContextTransport({ anchor, range, seconds, projection = null }) {
  const window = deriveContextWindow(anchor, range, seconds, projection);
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
    // Anchor is the return address, not a Loop boundary. A retained Section
    // Loop may observe an extent outside the active semantic Range.
    anchor,
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
