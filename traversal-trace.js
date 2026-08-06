// Traversal Trace: the order in which a reader actually encountered source Addresses.
//
// This is the fourth temporal order in the project and the only one that was
// missing. Source time is the video's own order. Timeline Space is the weighted
// projection through which source time is crossed. Semantic history is the
// sequence of committed states that Undo walks. None of them records the one
// thing a reader actually remembers: that they were somewhere before they were
// here.
//
// Undo answers "what was the world before this transaction?" and to answer it
// it must restore that world. Traversal Trace answers "where was I before this
// moment?", which is a different question and must not disturb anything: the
// Pins, Sections, Weights and Focus established since then are exactly what
// makes returning worth doing.
//
// The ledger is append-only for ordinary reader movement. Ghost merely changes
// the cursor within one frozen view of that ledger; it does not manufacture a
// second kind of occurrence. Ripple may append transient future Addresses to
// that view, and settling one through canonical Go records the resulting
// ordinary movement in the ledger.
//
// This module is a pure ledger. It reads no DOM, issues no media command, holds
// no Session, knows nothing of Guide topology, and never persists itself.
import { EPSILON, clamp } from "./range-geometry.js";

export const TRAVERSAL_KIND = Object.freeze({
  ATOMIC: "atomic",
  SEQUENCE: "sequence",
  CONTINUOUS: "continuous"
});

export const UNIT_KIND = Object.freeze({
  // Two Addresses the reader occupied, with nothing observed between them.
  JUMP: "jump",
  // Source time that was continuously watched, so any Address inside it was
  // genuinely seen and may be recalled.
  PASSAGE: "passage"
});

const near = (first, second) => Math.abs(first - second) <= EPSILON;

export function createTraversalTrace(initialAddress = 0) {
  const address = Number.isFinite(Number(initialAddress)) ? Number(initialAddress) : 0;
  return Object.freeze({
    nextRecordId: 1,
    records: Object.freeze([]),
    latestOccurrence: Object.freeze({
      address,
      recordId: null,
      unitIndex: null
    })
  });
}

function positiveUnit(unit) {
  return Number.isFinite(unit?.from)
    && Number.isFinite(unit?.to)
    && !near(unit.from, unit.to);
}

function appendTraceEntry(traversalTrace, { cause, kind, units, createdAt, provenance }) {
  const clean = (Array.isArray(units) ? units : []).filter(positiveUnit).map(unit =>
    Object.freeze({ kind: unit.kind, from: Number(unit.from), to: Number(unit.to) })
  );
  // A movement that moved nothing is not an occurrence. Recording it would put
  // a position in the stream the reader never distinguished from the one before.
  if (!clean.length) return { traversalTrace, record: null, changed: false };
  const record = Object.freeze({
    id: traversalTrace.nextRecordId,
    cause: String(cause || "unknown"),
    kind,
    units: Object.freeze(clean),
    createdAt: Number.isFinite(Number(createdAt)) ? Number(createdAt) : 0,
    ...(provenance ? { provenance: Object.freeze(provenance) } : {})
  });
  const last = clean.at(-1);
  return {
    changed: true,
    record,
    traversalTrace: Object.freeze({
      nextRecordId: traversalTrace.nextRecordId + 1,
      records: Object.freeze([...traversalTrace.records, record]),
      latestOccurrence: Object.freeze({
        address: last.to,
        recordId: record.id,
        unitIndex: clean.length - 1
      })
    })
  };
}

export function appendAtomicTraversal(traversalTrace, { from, to, cause, createdAt } = {}) {
  return appendTraceEntry(traversalTrace, {
    cause,
    kind: TRAVERSAL_KIND.ATOMIC,
    createdAt,
    units: [{ kind: UNIT_KIND.JUMP, from, to }]
  });
}

// A held or rapidly repeated gesture is one semantic decision but many
// encounters. The ledger keeps every one of them in order, including reversals:
// collapsing a Step sequence to its extremes would erase the fact that the
// reader went out and came back, which is exactly the shape they remember.
export function appendSequenceTraversal(traversalTrace, { points, cause, createdAt } = {}) {
  const ordered = (Array.isArray(points) ? points : [])
    .map(Number)
    .filter(Number.isFinite);
  const units = [];
  for (let index = 1; index < ordered.length; index += 1) {
    units.push({ kind: UNIT_KIND.JUMP, from: ordered[index - 1], to: ordered[index] });
  }
  return appendTraceEntry(traversalTrace, {
    cause,
    kind: TRAVERSAL_KIND.SEQUENCE,
    createdAt,
    units
  });
}

export function appendObservedPassages(traversalTrace, { spans, cause, createdAt } = {}) {
  const units = (Array.isArray(spans) ? spans : []).map(span => ({
    kind: UNIT_KIND.PASSAGE,
    from: Number(span?.from),
    to: Number(span?.to)
  }));
  return appendTraceEntry(traversalTrace, {
    cause,
    kind: TRAVERSAL_KIND.CONTINUOUS,
    createdAt,
    units
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// Every Address the frozen stream offers, in the order it was encountered.
//
// A Ghost gesture reads a stream that cannot change underneath it, so the whole
// readable sequence is resolved once when the gesture begins. That single
// decision settles three separate requirements at once: later movement cannot
// mutate the gesture's candidates, a Weight or Step change mid-gesture
// cannot move candidates the reader has already passed, and the Range that was
// active at the start is the Range the whole gesture obeys.
function passagePositions(unit, { range, projection, stepDistance }) {
  const forward = unit.to > unit.from;
  const low = Math.max(Math.min(unit.from, unit.to), range.start);
  const high = Math.min(Math.max(unit.from, unit.to), range.end);
  // A span the active Range excludes entirely was watched in a world this one
  // no longer contains; it offers nothing to recall.
  if (!(high - low > EPSILON)) return [];
  const clipped = { start: low, end: high };
  const first = forward ? low : high;
  const last = forward ? high : low;
  const direction = forward ? "forward" : "backward";
  const reach = Number(stepDistance?.[direction]);
  const positions = [first];
  if (!(reach > 0) || !projection?.stepTarget) return [...positions, last];

  let address = first;
  // Bounded by construction: every step is a positive Timeline distance, and the
  // loop stops at the boundary. The cap is a guard against a degenerate reach,
  // not a limit on how much of a span can be recalled.
  for (let guard = 0; guard < 4096; guard += 1) {
    const next = projection.stepTarget(address, reach, direction, clipped);
    if (!Number.isFinite(next) || near(next, address)) break;
    if (forward ? next >= last - EPSILON : next <= last + EPSILON) break;
    positions.push(next);
    address = next;
  }
  // The boundary is always reachable. The final quantum may be shorter than the
  // others; a span is not required to divide evenly.
  positions.push(last);
  return positions;
}

function readablePositions(traversalTrace, { frozenStreamEnd, range, projection, stepDistance }) {
  const limit = Number.isFinite(frozenStreamEnd)
    ? clamp(frozenStreamEnd, 0, traversalTrace.records.length)
    : traversalTrace.records.length;
  const bounds = {
    start: Number.isFinite(range?.start) ? range.start : Number.NEGATIVE_INFINITY,
    end: Number.isFinite(range?.end) ? range.end : Number.POSITIVE_INFINITY
  };
  const positions = [];
  let blocked = false;
  const push = (address, recordId, unitIndex, identity = {}) => {
    // Only *adjacent* duplicates are one position. A jump's arrival and the next
    // jump's departure are the same occurrence seen from either side, and
    // offering it twice would spend a wheel notch going nowhere. Two visits to
    // the same Address separated by other occurrences are two encounters and
    // must both survive -- that separation is the whole content of a return.
    const previous = positions.at(-1);
    if (previous && near(previous.address, address)) return;
    positions.push(Object.freeze({
      address,
      recordId,
      unitIndex,
      streamKind: "trace"
    }));
  };
  for (let index = 0; index < limit; index += 1) {
    const record = traversalTrace.records[index];
    record.units.forEach((unit, unitIndex) => {
      if (unit.kind === UNIT_KIND.PASSAGE) {
        const inside = passagePositions(unit, { range: bounds, projection, stepDistance });
        if (!inside.length) blocked = true;
        for (const address of inside) push(address, record.id, unitIndex);
        return;
      }
      for (const address of [unit.from, unit.to]) {
        // An Address outside the active Range belongs to a world this one has
        // narrowed away. Ghost preserves the semantic environment, so it cannot
        // silently clamp a recalled point onto a different one.
        if (address < bounds.start - EPSILON || address > bounds.end + EPSILON) {
          blocked = true;
          continue;
        }
        push(address, record.id, unitIndex);
      }
    });
  }
  return { positions: Object.freeze(positions), blocked };
}

export function latestTracePositionAtAddress(traversalTrace, address, options = {}) {
  const { positions } = readablePositions(traversalTrace, {
    frozenStreamEnd: options.frozenStreamEnd,
    range: options.range,
    projection: options.projection,
    stepDistance: options.stepDistance
  });
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    if (near(positions[index].address, address)) return index;
  }
  return -1;
}

export function tracePositionIsValid(traversalTrace, cursor, options = {}) {
  if (!cursor || !Number.isFinite(cursor.address)) return false;
  // A resume cursor describes the moment the reader is standing in. If they have
  // since moved, it describes somewhere else and must not be resumed from.
  if (Number.isFinite(options.current) && !near(options.current, cursor.address)) {
    return false;
  }
  const record = traversalTrace.records.find(entry => entry.id === cursor.recordId);
  if (!record) return false;
  const unit = record.units[cursor.unitIndex];
  if (!unit) return false;
  const low = Math.min(unit.from, unit.to);
  const high = Math.max(unit.from, unit.to);
  if (unit.kind === UNIT_KIND.JUMP) {
    if (!near(unit.from, cursor.address) && !near(unit.to, cursor.address)) return false;
  } else if (cursor.address < low - EPSILON || cursor.address > high + EPSILON) {
    return false;
  }
  const range = options.range;
  if (range && (cursor.address < range.start - EPSILON || cursor.address > range.end + EPSILON)) {
    return false;
  }
  return true;
}

// The read state for one held gesture. Everything it will ever consult is
// resolved here, so nothing that happens during the gesture can change what it
// offers.
export function beginGhostRead(traversalTrace, {
  current,
  continuationPosition = null,
  frozenStreamEnd,
  futureEntries = [],
  range,
  projection,
  stepDistance
} = {}) {
  const historical = readablePositions(traversalTrace, {
    frozenStreamEnd,
    range,
    projection,
    stepDistance
  });
  const bounds = {
    start: Number.isFinite(range?.start) ? range.start : Number.NEGATIVE_INFINITY,
    end: Number.isFinite(range?.end) ? range.end : Number.POSITIVE_INFINITY
  };
  const positions = [...historical.positions];
  if (!positions.length && Number.isFinite(Number(current))) {
    positions.push(Object.freeze({
      address: Number(current),
      recordId: null,
      unitIndex: null,
      streamKind: "trace"
    }));
  }
  for (const entry of Array.isArray(futureEntries) ? futureEntries : []) {
    const address = Number(entry?.address);
    if (
      !Number.isFinite(address)
      || address < bounds.start - EPSILON
      || address > bounds.end + EPSILON
    ) continue;
    const previous = positions.at(-1);
    if (previous && near(previous.address, address)) continue;
    positions.push(Object.freeze({
      address,
      recordId: null,
      unitIndex: null,
      streamKind: "future",
      prospect: Object.freeze({ ...entry })
    }));
  }
  let index = -1;
  // Ghost has one persistent position in one stream. A settled backward move
  // leaves the positions ahead available, and a settled forward move makes that
  // position part of the backward side. Direction never selects a second reader.
  if (continuationPosition && tracePositionIsValid(traversalTrace, continuationPosition, { range, current })) {
    index = positions.findIndex(position =>
      position.streamKind === "trace"
      && position.recordId === continuationPosition.recordId
      && position.unitIndex === continuationPosition.unitIndex
      && near(position.address, continuationPosition.address));
  }
  if (index < 0) {
    for (let candidate = positions.length - 1; candidate >= 0; candidate -= 1) {
      if (
        positions[candidate].streamKind === "trace"
        && near(positions[candidate].address, current)
      ) {
        index = candidate;
        break;
      }
    }
  }
  return Object.freeze({
    positions: Object.freeze(positions),
    blocked: historical.blocked,
    index,
    // Where the gesture began, which is the live occurrence Ghost anchors to.
    origin: Number.isFinite(current) ? current : 0
  });
}

// One wheel quantum. Backward and forward name a direction in *user* time; the
// source Address may move either way, because the reader's path did.
export function moveGhostRead(traversalTrace, ghostRead, direction) {
  if (!ghostRead?.positions?.length) {
    return { changed: false, reason: "no-traversal-trace", read: ghostRead };
  }
  const step = direction === "backward" ? -1 : 1;
  const from = ghostRead.index;
  // A gesture beginning at an Address the stream never recorded still has a
  // direction: backward enters at the live end, forward has nowhere to go.
  const next = from < 0
    ? (step < 0 ? ghostRead.positions.length - 1 : -1)
    : from + step;
  if (next < 0 || next >= ghostRead.positions.length) {
    return {
      changed: false,
      reason: ghostRead.blocked ? "range-blocked" : "stream-end",
      read: ghostRead
    };
  }
  const position = ghostRead.positions[next];
  return {
    changed: true,
    address: position.address,
    cursor: Object.freeze({
      streamKind: position.streamKind,
      recordId: position.recordId,
      unitIndex: position.unitIndex,
      address: position.address,
      ...(position.prospect ? { prospect: position.prospect } : {})
    }),
    read: Object.freeze({ ...ghostRead, index: next })
  };
}
