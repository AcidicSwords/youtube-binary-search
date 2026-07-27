// Transient observation and traversal values. Transport state never enters Return history directly.
import {
  EPSILON,
  clamp,
  chooseSupportedRate
} from "./range-geometry.js";

export const TRANSPORT_KIND = Object.freeze({
  IDLE: "idle",
  CONTEXT: "context",
  LOOP: "loop",
  CONTINUE: "continue",
  SKIM: "skim"
});

export function idleTransport() {
  return { kind: TRANSPORT_KIND.IDLE };
}

export function isTransportActive(transport) {
  return Boolean(transport && transport.kind !== TRANSPORT_KIND.IDLE);
}

export function isObservationalTransport(transport) {
  return transport?.kind === TRANSPORT_KIND.CONTEXT
    || transport?.kind === TRANSPORT_KIND.LOOP;
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
    startedAt: Date.now()
  };
}

export function createContinueTransport({
  departure,
  parentNeighborhood,
  parentResolutionBasis,
  returnModel,
  crossedResolution = false,
  wrapped = false,
  label = "Continue",
  operator = "continue"
}) {
  return {
    kind: TRANSPORT_KIND.CONTINUE,
    phase: "starting",
    departure,
    parentNeighborhood,
    parentResolutionBasis,
    returnModel,
    crossedResolution,
    wrapped,
    label,
    operator,
    enteredPath: false,
    startedAt: Date.now()
  };
}

export function createSkimTransport({
  departure,
  target,
  parentNeighborhood,
  parentResolutionBasis,
  returnModel,
  maxRate,
  rate = maxRate
}) {
  return {
    kind: TRANSPORT_KIND.SKIM,
    phase: "starting",
    departure,
    target,
    parentNeighborhood,
    parentResolutionBasis,
    returnModel,
    maxRate,
    rate: Number.isFinite(rate) ? rate : 1,
    enteredPath: false,
    startedAt: Date.now()
  };
}

export function withTransportPhase(transport, phase) {
  return transport?.kind === TRANSPORT_KIND.IDLE
    ? transport
    : { ...transport, phase };
}

/**
 * Skim holds one supported boosted rate for the whole path. It changes to 1×
 * only when the Forward destination is reached and Skim becomes Continue.
 */
export function desiredSkimRate(transport, _current, availableRates) {
  if (transport?.kind !== TRANSPORT_KIND.SKIM) return 1;
  const requested = Number.isFinite(transport.rate) ? transport.rate : transport.maxRate;
  return chooseSupportedRate(availableRates, requested);
}
