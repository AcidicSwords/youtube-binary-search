// Pure Field Frame resolution.
//
// A Field Frame is the stable Tail–Center–Lead presentation used outside
// ordinary Center playback. It is not a semantic operator: it is a perceptual
// projection of the state produced by an operator, by Context, or by a direct
// manipulation.
//
// This module is DOM-free and I/O-free. It never mutates Session, never seeks a
// player, never derives semantic operator targets of its own, and owns neither
// Context transport nor breathing.
import { EPSILON, clamp } from "./range-geometry.js";

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

export const FIELD_FRAME_ACTIVATION = Object.freeze({
  STEP_TO_ADDRESS: "step-to-address"
});

const OPERATOR_FRAME_KINDS = Object.freeze([
  "step",
  "refine",
  "reopen",
  "resolution",
  "section",
  "go"
]);

const DIRECT_FRAME_KINDS = Object.freeze([
  "current",
  "pin",
  "section",
  "range"
]);

// A Frame edge closer than this to its neighbour carries no separate identity.
const FRAME_TOLERANCE = 0.02;

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeActivation(activation) {
  return activation?.kind === FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS
    ? Object.freeze({ kind: FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS })
    : null;
}

function normalizeRange(range) {
  const start = finite(range?.start);
  const end = finite(range?.end);
  if (start === null || end === null || end < start) return null;
  return { start, end };
}

export function classifyDirection(from, to, tolerance = FRAME_TOLERANCE) {
  const previous = finite(from);
  const next = finite(to);
  if (previous === null || next === null) return FIELD_FRAME_DIRECTION.NONE;
  if (next - previous > tolerance) return FIELD_FRAME_DIRECTION.FORWARD;
  if (previous - next > tolerance) return FIELD_FRAME_DIRECTION.BACKWARD;
  return FIELD_FRAME_DIRECTION.NONE;
}

// Every Frame is ordered Tail ≤ Center ≤ Lead inside Range. Ordering here is a
// presentation guarantee; it never rewrites the semantic addresses it received.
function orderFrame({ owner, kind, tail, center, lead, range, activation = null }) {
  const bounds = normalizeRange(range);
  const middle = finite(center);
  if (!bounds || middle === null) return null;
  const clampedCenter = clamp(middle, bounds.start, bounds.end);
  const rawTail = finite(tail);
  const rawLead = finite(lead);
  return {
    owner,
    kind,
    tail: clamp(
      rawTail === null ? clampedCenter : Math.min(rawTail, clampedCenter),
      bounds.start,
      clampedCenter
    ),
    center: clampedCenter,
    lead: clamp(
      rawLead === null ? clampedCenter : Math.max(rawLead, clampedCenter),
      clampedCenter,
      bounds.end
    ),
    activation: normalizeActivation(activation)
  };
}

// Context has priority over operator framing, but only while Context is
// enabled. Its edges are the bounded Context window and never follow Cursor.
export function contextFrame({ start, end, current, cursor, range }) {
  const bounds = normalizeRange(range);
  const edgeStart = finite(start);
  const edgeEnd = finite(end);
  if (!bounds || edgeStart === null || edgeEnd === null || edgeEnd < edgeStart) {
    return null;
  }
  // The edges are the frozen observation window. Center is the moving Cursor,
  // but a Cursor that has not yet arrived can never drag an edge with it.
  const anchor = finite(cursor) ?? finite(current);
  const center = clamp(
    anchor === null ? edgeStart : anchor,
    edgeStart,
    edgeEnd
  );
  const frame = orderFrame({
    owner: FIELD_FRAME_OWNER.CONTEXT,
    kind: "context",
    tail: edgeStart,
    center,
    lead: edgeEnd,
    range
  });
  if (!frame) return null;
  return { ...frame, edges: { start: frame.tail, end: frame.lead } };
}

export function operatorFrame({
  kind = "step",
  center,
  backward,
  forward,
  range,
  activation = null
}) {
  return orderFrame({
    owner: FIELD_FRAME_OWNER.OPERATOR,
    kind: OPERATOR_FRAME_KINDS.includes(kind) ? kind : "step",
    tail: backward,
    center,
    lead: forward,
    range,
    activation
  });
}

// Direct manipulation temporarily supplies an exact Frame. It is validated, not
// invented: an incomplete or non-finite request cannot acquire Frame ownership.
export function directFrame({ kind, start, center, end, range }) {
  if (!DIRECT_FRAME_KINDS.includes(kind)) return null;
  if (finite(start) === null || finite(end) === null || finite(center) === null) {
    return null;
  }
  return orderFrame({
    owner: FIELD_FRAME_OWNER.DIRECT,
    kind,
    tail: start,
    center,
    lead: end,
    range
  });
}

export function resolveFieldFrame(request) {
  if (!request || typeof request !== "object") return null;
  if (request.owner === FIELD_FRAME_OWNER.CONTEXT) return contextFrame(request);
  if (request.owner === FIELD_FRAME_OWNER.DIRECT) return directFrame(request);
  return operatorFrame(request);
}

// Frame identity deliberately excludes Center. A Context Cursor crossing its
// own window keeps one Frame. Edge ownership or activation changing creates a
// new Frame, so an observational presentation cannot retain stale actionability.
export function frameIdentity(frame) {
  if (!frame) return "none";
  return [
    frame.owner,
    frame.kind,
    frame.tail.toFixed(3),
    frame.lead.toFixed(3),
    frame.activation?.kind || "observe"
  ].join("|");
}

export function framesEqual(first, second, tolerance = FRAME_TOLERANCE) {
  if (!first || !second) return first === second;
  return first.owner === second.owner
    && first.kind === second.kind
    && Math.abs(first.tail - second.tail) <= tolerance
    && Math.abs(first.lead - second.lead) <= tolerance
    && (first.activation?.kind || null) === (second.activation?.kind || null);
}

export function frameTransition(previous, next, options = {}) {
  if (!next) return null;
  const tolerance = Number.isFinite(options.tolerance)
    ? options.tolerance
    : FRAME_TOLERANCE;
  const direction = previous
    ? classifyDirection(previous.center, next.center, tolerance)
    : FIELD_FRAME_DIRECTION.NONE;
  return {
    direction,
    from: previous ? { ...previous } : null,
    to: { ...next },
    // A movement may use the previous Current as one transient outgoing frame
    // so it visibly passes toward the trailing side. There is never a second
    // reassignment behind it.
    outgoing: previous && direction !== FIELD_FRAME_DIRECTION.NONE
      ? previous.center
      : null,
    reframed: !framesEqual(previous, next, tolerance)
  };
}

// One sequencer owns stable Frame identity for a Field. `revision` advances only
// when the settled Frame changes, so Context transport, breathing, and repeated
// republishing of the same state never look like new movements.
export function createFieldFrameSequencer(options = {}) {
  const tolerance = Number.isFinite(options.tolerance)
    ? options.tolerance
    : FRAME_TOLERANCE;
  let settled = null;
  let revision = 0;
  let transition = null;

  function resolve(request) {
    const next = resolveFieldFrame(request);
    if (!next) return null;
    const previous = settled;
    const reframed = !framesEqual(previous, next, tolerance);
    const moved = previous
      ? classifyDirection(previous.center, next.center, tolerance)
      : FIELD_FRAME_DIRECTION.NONE;
    if (reframed) {
      revision += 1;
      transition = frameTransition(previous, next, { tolerance });
    } else if (transition) {
      // The same Frame with a moving Center (Context) keeps its transition
      // descriptor but stops advertising an unfinished directional move.
      transition = { ...transition, direction: FIELD_FRAME_DIRECTION.NONE, outgoing: null };
    }
    settled = next;
    return descriptor(reframed ? transition?.direction ?? moved : FIELD_FRAME_DIRECTION.NONE, reframed);
  }

  function descriptor(direction, reframed = false) {
    if (!settled) return null;
    return {
      owner: settled.owner,
      kind: settled.kind,
      tail: settled.tail,
      center: settled.center,
      lead: settled.lead,
      activation: settled.activation ? { ...settled.activation } : null,
      direction: direction ?? FIELD_FRAME_DIRECTION.NONE,
      revision,
      reframed,
      outgoing: reframed ? transition?.outgoing ?? null : null,
      identity: frameIdentity(settled)
    };
  }

  return {
    resolve,
    current: () => descriptor(FIELD_FRAME_DIRECTION.NONE),
    settled: () => (settled ? { ...settled } : null),
    revision: () => revision,
    reset() {
      settled = null;
      transition = null;
      revision = 0;
    }
  };
}

// A Frame edge that has collapsed onto Center carries no perceptual
// information. Callers use this to decide whether a side is worth displaying.
export function frameSideAvailable(frame, role) {
  if (!frame) return false;
  return role === "tail"
    ? frame.center - frame.tail > EPSILON
    : frame.lead - frame.center > EPSILON;
}
