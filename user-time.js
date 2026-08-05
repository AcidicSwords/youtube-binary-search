// User time: the order in which a reader actually encountered source Addresses.
//
// This is the fourth temporal order in the project and the only one that was
// missing. Source time is the video's own order. Timeline Space is the weighted
// projection through which source time is crossed. Semantic history is the
// sequence of committed states that Undo walks. None of them records the one
// thing a reader actually remembers: that they were somewhere before they were
// here.
//
// Undo answers "what was the world before this transaction?" and to answer it
// it must restore that world. User time answers "where was I before this
// moment?", which is a different question and must not disturb anything: the
// Pins, Sections, Weights and Focus established since then are exactly what
// makes returning worth doing.
//
// The ledger is append-only. Recalling an earlier Address and committing it
// writes a *new* occurrence at the live end, linked by provenance to the one it
// was recalled from. Nothing is ever rewritten or dropped, because arriving
// somewhere a second time — knowing what followed the first time — is not the
// same event as arriving there without knowing.
//
// This module is a pure ledger. It reads no DOM, issues no media command, holds
// no Session, knows nothing of Guide topology, and never persists itself.
import { EPSILON, clamp } from "./range-geometry.js";

export const TRAVERSAL_KIND = Object.freeze({
  ATOMIC: "atomic",
  SEQUENCE: "sequence",
  CONTINUOUS: "continuous",
  GHOST_INJECTION: "ghost-injection"
});

export const UNIT_KIND = Object.freeze({
  // Two Addresses the reader occupied, with nothing observed between them.
  JUMP: "jump",
  // Source time that was continuously watched, so any Address inside it was
  // genuinely seen and may be recalled.
  SPAN: "span"
});

const near = (first, second) => Math.abs(first - second) <= EPSILON;

export function createUserTime(initialAddress = 0) {
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

function appendRecord(userTime, { cause, kind, units, createdAt, provenance }) {
  const clean = (Array.isArray(units) ? units : []).filter(positiveUnit).map(unit =>
    Object.freeze({ kind: unit.kind, from: Number(unit.from), to: Number(unit.to) })
  );
  // A movement that moved nothing is not an occurrence. Recording it would put
  // a position in the stream the reader never distinguished from the one before.
  if (!clean.length) return { userTime, record: null, changed: false };
  const record = Object.freeze({
    id: userTime.nextRecordId,
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
    userTime: Object.freeze({
      nextRecordId: userTime.nextRecordId + 1,
      records: Object.freeze([...userTime.records, record]),
      latestOccurrence: Object.freeze({
        address: last.to,
        recordId: record.id,
        unitIndex: clean.length - 1
      })
    })
  };
}

export function appendAtomicTraversal(userTime, { from, to, cause, createdAt } = {}) {
  return appendRecord(userTime, {
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
export function appendSequenceTraversal(userTime, { points, cause, createdAt } = {}) {
  const ordered = (Array.isArray(points) ? points : [])
    .map(Number)
    .filter(Number.isFinite);
  const units = [];
  for (let index = 1; index < ordered.length; index += 1) {
    units.push({ kind: UNIT_KIND.JUMP, from: ordered[index - 1], to: ordered[index] });
  }
  return appendRecord(userTime, {
    cause,
    kind: TRAVERSAL_KIND.SEQUENCE,
    createdAt,
    units
  });
}

export function appendContinuousTraversal(userTime, { spans, cause, createdAt } = {}) {
  const units = (Array.isArray(spans) ? spans : []).map(span => ({
    kind: UNIT_KIND.SPAN,
    from: Number(span?.from),
    to: Number(span?.to)
  }));
  return appendRecord(userTime, {
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
// decision settles three separate requirements at once: the gesture cannot
// follow its own newly injected output, a Weight or Step change mid-gesture
// cannot move candidates the reader has already passed, and the Range that was
// active at the start is the Range the whole gesture obeys.
function spanPositions(unit, { range, projection, stepReach }) {
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
  const reach = Number(stepReach?.[direction]);
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

function readablePositions(userTime, { frozenStreamEnd, range, projection, stepReach }) {
  const limit = Number.isFinite(frozenStreamEnd)
    ? clamp(frozenStreamEnd, 0, userTime.records.length)
    : userTime.records.length;
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
      occurrenceKind: identity.occurrenceKind || "arrival",
      recalledFrom: identity.recalledFrom || null
    }));
  };
  for (let index = 0; index < limit; index += 1) {
    const record = userTime.records[index];
    // A scan is not a journey, but a landing is.
    //
    // The wheel motion used to find a moment is search, and copying it into the
    // stream made it a palindrome: scrolling backward walked forward through the
    // original journey and turned around. Only the settled landing is recorded,
    // and it is one jump from the live Anchor to the Address re-entered -- so
    // this contributes exactly one new position, and re-entering a moment stays
    // in the record where it belongs.
    const injected = record.kind === TRAVERSAL_KIND.GHOST_INJECTION;
    record.units.forEach((unit, unitIndex) => {
      if (unit.kind === UNIT_KIND.SPAN) {
        const inside = spanPositions(unit, { range: bounds, projection, stepReach });
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
        const landing = injected && near(address, unit.to);
        push(address, record.id, unitIndex, landing
          ? {
            occurrenceKind: "injection",
            recalledFrom: record.provenance?.recalledOccurrence || null
          }
          : {});
      }
    });
  }
  return { positions: Object.freeze(positions), blocked };
}

export function latestCursorAtAddress(userTime, address, options = {}) {
  const { positions } = readablePositions(userTime, {
    frozenStreamEnd: options.frozenStreamEnd,
    range: options.range,
    projection: options.projection,
    stepReach: options.stepReach
  });
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    if (near(positions[index].address, address)) return index;
  }
  return -1;
}

export function cursorIsValid(userTime, cursor, options = {}) {
  if (!cursor || !Number.isFinite(cursor.address)) return false;
  // A resume cursor describes the moment the reader is standing in. If they have
  // since moved, it describes somewhere else and must not be resumed from.
  if (Number.isFinite(options.current) && !near(options.current, cursor.address)) {
    return false;
  }
  const record = userTime.records.find(entry => entry.id === cursor.recordId);
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
export function beginGhostRead(userTime, {
  current,
  resumeCursor = null,
  frozenStreamEnd,
  range,
  projection,
  stepReach
} = {}) {
  const frozen = readablePositions(userTime, {
    frozenStreamEnd,
    range,
    projection,
    stepReach
  });
  let index = -1;
  // The resume cursor is the historical occurrence a previous landing re-entered.
  // Following it means "what originally came after this moment", which is only a
  // question a forward gesture asks -- a backward gesture is asking what led to
  // the present re-entry, and that is the live stream. The caller decides which,
  // and having decided at activation it does not switch mid-gesture: reversing
  // the wheel retraces the cursor already chosen.
  if (resumeCursor && cursorIsValid(userTime, resumeCursor, { range, current })) {
    index = frozen.positions.findIndex(position =>
      position.recordId === resumeCursor.recordId
      && position.unitIndex === resumeCursor.unitIndex
      && near(position.address, resumeCursor.address));
  }
  if (index < 0) {
    for (let candidate = frozen.positions.length - 1; candidate >= 0; candidate -= 1) {
      if (near(frozen.positions[candidate].address, current)) {
        index = candidate;
        break;
      }
    }
  }
  return Object.freeze({
    positions: frozen.positions,
    blocked: frozen.blocked,
    index,
    // Where the gesture began, which is the live occurrence Ghost anchors to.
    origin: Number.isFinite(current) ? current : 0
  });
}

// One wheel quantum. Backward and forward name a direction in *user* time; the
// source Address may move either way, because the reader's path did.
export function moveGhostRead(userTime, ghostRead, direction) {
  if (!ghostRead?.positions?.length) {
    return { changed: false, reason: "no-user-time", read: ghostRead };
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
      recordId: position.recordId,
      unitIndex: position.unitIndex,
      address: position.address
    }),
    read: Object.freeze({ ...ghostRead, index: next })
  };
}

// Releasing at a recalled Address injects that landing, and nothing else.
//
// The scan and the landing are different events. Scrolling while G is held
// inspects prior user time; it may cross many occurrences and reverse direction,
// and none of that is a journey the reader took -- it is the search they used to
// find one moment. Writing it down made the stream a palindrome and spent later
// wheel detents crossing the reader's own search motion.
//
// What is written is one jump: from the live Anchor to the Address re-entered.
// It is linked in both directions -- to the Anchor it was recalled *from*, and
// to the historical occurrence it re-enters -- because those are the two
// questions worth asking at a re-entry. Backward asks what led here; forward
// asks what originally followed the moment now standing in.
//
// A gesture that returns to its Anchor writes nothing, because its one unit
// spans no distance and `appendRecord` refuses those wherever they come from --
// a zero-distance occurrence would sit in the stream indistinguishable from its
// neighbour and cost a future detent to pass. The Session may still retain the
// ground crossed; that is a different consequence of the same gesture.
export function appendGhostInjection(userTime, {
  anchor,
  anchorCursor,
  landing,
  recalledCursor,
  scan,
  createdAt
} = {}) {
  const from = Number(anchor);
  const to = Number(landing);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { userTime, record: null, occurrence: null, resumeCursor: null, changed: false };
  }
  const appended = appendRecord(userTime, {
    cause: "ghost",
    kind: TRAVERSAL_KIND.GHOST_INJECTION,
    createdAt,
    units: [{ kind: UNIT_KIND.JUMP, from, to }],
    provenance: {
      anchorOccurrence: anchorCursor ? Object.freeze({ ...anchorCursor }) : null,
      recalledOccurrence: recalledCursor ? Object.freeze({ ...recalledCursor }) : null,
      // The search itself is kept as evidence, never as traversal.
      scan: Object.freeze({
        candidateCount: Number(scan?.candidateCount) || 0,
        visitedMinimum: Number(scan?.visitedMinimum),
        visitedMaximum: Number(scan?.visitedMaximum),
        directionChanges: Number(scan?.directionChanges) || 0
      })
    }
  });
  if (!appended.changed) {
    return { userTime, record: null, occurrence: null, resumeCursor: null, changed: false };
  }
  return {
    ...appended,
    occurrence: appended.userTime.latestOccurrence,
    // The historical occurrence that was re-entered, so an immediately forward
    // gesture can resume its original successors rather than retracing the live
    // stream it has just been added to.
    resumeCursor: recalledCursor ? Object.freeze({ ...recalledCursor }) : null
  };
}
