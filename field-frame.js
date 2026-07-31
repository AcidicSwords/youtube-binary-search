// Pure Panoramic Phase Field frame geometry. The application owns selection;
// this module only normalizes source-address presentations and transitions.
import { EPSILON, clamp } from "./range-geometry.js";
import { deriveContextWindow } from "./transport.js";

export const FIELD_FRAME_OWNER = Object.freeze({
  CONTEXT: "context",
  OPERATOR: "operator",
  DIRECT: "direct"
});

export const FIELD_FRAME_DIRECTION = Object.freeze({
  BACKWARD: "backward",
  NONE: "none",
  FORWARD: "forward"
});

export function normalizeFieldFrame(value, range) {
  if (!value || !range) return null;
  const rawCenter = Number(value.center);
  const rawStart = Number(value.start);
  const rawEnd = Number(value.end);
  if (![rawCenter, rawStart, rawEnd].every(Number.isFinite)) return null;
  const center = clamp(rawCenter, range.start, range.end);
  const start = clamp(rawStart, range.start, center);
  const end = clamp(rawEnd, center, range.end);
  return {
    owner: Object.values(FIELD_FRAME_OWNER).includes(value.owner)
      ? value.owner
      : FIELD_FRAME_OWNER.OPERATOR,
    kind: String(value.kind || value.owner || "frame"),
    start,
    center,
    end,
    backwardDistance: Number.isFinite(Number(value.backwardDistance))
      ? Math.max(0, Number(value.backwardDistance))
      : Math.max(0, center - start),
    forwardDistance: Number.isFinite(Number(value.forwardDistance))
      ? Math.max(0, Number(value.forwardDistance))
      : Math.max(0, end - center),
    revision: Number.isInteger(value.revision) ? value.revision : 0,
    direction: Object.values(FIELD_FRAME_DIRECTION).includes(value.direction)
      ? value.direction
      : FIELD_FRAME_DIRECTION.NONE
  };
}

export function deriveContextFrame({ anchor, range, seconds, revision = 0 }) {
  const window = deriveContextWindow(anchor, range, seconds);
  if (!window) return null;
  const center = clamp(anchor, window.start, window.end);
  return normalizeFieldFrame({
    owner: FIELD_FRAME_OWNER.CONTEXT,
    kind: "context",
    start: window.start,
    center,
    end: window.end,
    revision
  }, range);
}

export function fieldFrameDirection(previous, next) {
  if (!previous || !next) return FIELD_FRAME_DIRECTION.NONE;
  if (next.center > previous.center + EPSILON) return FIELD_FRAME_DIRECTION.FORWARD;
  if (next.center < previous.center - EPSILON) return FIELD_FRAME_DIRECTION.BACKWARD;
  return FIELD_FRAME_DIRECTION.NONE;
}

export function transitionFieldFrame(previous, next, revision = 0) {
  if (!next) return null;
  const direction = fieldFrameDirection(previous, next);
  return {
    ...next,
    revision,
    direction,
    outgoing: previous
      ? {
          start: previous.start,
          center: previous.center,
          end: previous.end
        }
      : null
  };
}

export function retainContextFrame(frame, center, range) {
  if (!frame || frame.owner !== FIELD_FRAME_OWNER.CONTEXT) return null;
  const boundedCenter = clamp(center, frame.start, frame.end);
  return normalizeFieldFrame({
    ...frame,
    center: boundedCenter,
    start: frame.start,
    end: frame.end,
    backwardDistance: undefined,
    forwardDistance: undefined
  }, range);
}
