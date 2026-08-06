// The traversal-trace ledger: what the reader encountered, in the order they met it.
//
// This suite proves the ledger and its read cursor in isolation. It builds no
// Session, touches no DOM, and drives no player: everything here is a question
// about a sequence of Addresses and the order a reader met them in.
import assert from "node:assert/strict";
import {
  TRAVERSAL_KIND,
  UNIT_KIND,
  createTraversalTrace,
  appendAtomicTraversal,
  appendSequenceTraversal,
  appendObservedPassages,
  beginGhostRead,
  moveGhostRead,
  latestTracePositionAtAddress,
  tracePositionIsValid
} from "./traversal-trace.js";
import { projectionForModel } from "./timeline-projection.js";
import { createGuide, createSectionFromTimes } from "./guide.js";

const DURATION = 300;
const RANGE = { start: 0, end: DURATION };
const neutralProjection = projectionForModel({
  duration: DURATION,
  guide: createGuide("neutral"),
  range: RANGE,
  neighborhood: { C: 0 },
  stepDistance: null
});
const reach = seconds => ({ backward: seconds, forward: seconds });

const read = (traversalTrace, current, options = {}) => beginGhostRead(traversalTrace, {
  current,
  range: RANGE,
  projection: neutralProjection,
  stepDistance: reach(5),
  ...options
});

// Walk a whole direction and collect the Addresses it offers.
function walk(traversalTrace, ghostRead, direction, limit = 40) {
  const seen = [];
  let cursor = ghostRead;
  for (let index = 0; index < limit; index += 1) {
    const moved = moveGhostRead(traversalTrace, cursor, direction);
    if (!moved.changed) break;
    seen.push(moved.address);
    cursor = moved.read;
  }
  return { addresses: seen, read: cursor };
}

// ---------------------------------------------------------------------------
// Appending
// ---------------------------------------------------------------------------
{
  let traversalTrace = createTraversalTrace(10);
  assert.equal(traversalTrace.records.length, 0);
  assert.equal(traversalTrace.latestOccurrence.address, 10, "The ledger opens where the reader arrived.");

  const first = appendAtomicTraversal(traversalTrace, { from: 10, to: 40, cause: "refineForward" });
  assert.equal(first.changed, true);
  assert.equal(first.record.kind, TRAVERSAL_KIND.ATOMIC);
  assert.deepEqual(first.record.units, [{ kind: UNIT_KIND.JUMP, from: 10, to: 40 }]);
  assert.equal(first.traversalTrace.latestOccurrence.address, 40);
  traversalTrace = first.traversalTrace;

  // A movement that moved nothing is not an occurrence: recording it would put a
  // position in the stream the reader never distinguished from the one before.
  const still = appendAtomicTraversal(traversalTrace, { from: 40, to: 40, cause: "go" });
  assert.equal(still.changed, false, "A movement of nothing is not an encounter.");
  assert.equal(still.traversalTrace, traversalTrace, "and leaves the ledger untouched.");

  // Reversals inside one gesture survive. Collapsing a Step sequence to its
  // extremes would erase going out and coming back, which is the shape a reader
  // actually remembers.
  const sequence = appendSequenceTraversal(traversalTrace, {
    points: [40, 45, 50, 45],
    cause: "step-sequence"
  });
  assert.equal(sequence.record.kind, TRAVERSAL_KIND.SEQUENCE);
  assert.equal(sequence.record.units.length, 3, "Every leg of the gesture is kept.");
  assert.deepEqual(
    sequence.record.units.map(unit => unit.to),
    [45, 50, 45],
    "including the one that came back."
  );

  // Identity is assigned once and never reused.
  const ids = [first.record.id, sequence.record.id];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(sequence.traversalTrace.nextRecordId > sequence.record.id);
}

// ---------------------------------------------------------------------------
// Direction is a direction in the Traversal Trace, not in source time
// ---------------------------------------------------------------------------
{
  // The reader went 10 → 40 → 25 → 70. Ghosting backward retraces that, which
  // moves forward through source time on one of its legs and backward on
  // another. Nothing about source order survives the recall.
  let traversalTrace = createTraversalTrace(10);
  for (const [from, to] of [[10, 40], [40, 25], [25, 70]]) {
    traversalTrace = appendAtomicTraversal(traversalTrace, { from, to, cause: "go" }).traversalTrace;
  }

  const backward = walk(traversalTrace, read(traversalTrace, 70), "backward");
  assert.deepEqual(backward.addresses, [25, 40, 10],
    "Ghosting backward reverses the reader's own path, whichever way source time runs.");

  const forward = walk(traversalTrace, read(traversalTrace, 10, { continuationPosition: null }), "forward");
  assert.deepEqual(forward.addresses, [40, 25, 70],
    "and forward replays it in the order it happened.");

  // The two are exact inverses.
  assert.deepEqual([...backward.addresses].reverse(), [10, 40, 25],
    "Backward from the end reaches the beginning.");

  // Walking past either end reports rather than wrapping.
  const exhausted = moveGhostRead(traversalTrace, backward.read, "backward");
  assert.equal(exhausted.changed, false);
  assert.equal(exhausted.reason, "stream-end");
}

// ---------------------------------------------------------------------------
// One occurrence is one position
// ---------------------------------------------------------------------------
{
  // A jump's arrival and the next jump's departure are the same occurrence seen
  // from either side. Offering it twice would spend a wheel notch going nowhere.
  let traversalTrace = createTraversalTrace(0);
  traversalTrace = appendSequenceTraversal(traversalTrace, {
    points: [0, 20, 40, 60],
    cause: "step-sequence"
  }).traversalTrace;
  const { addresses } = walk(traversalTrace, read(traversalTrace, 60), "backward");
  assert.deepEqual(addresses, [40, 20, 0],
    "Shared endpoints are one position, so every notch reaches somewhere new.");
}

// ---------------------------------------------------------------------------
// Continuous observation is traversable inside
// ---------------------------------------------------------------------------
{
  // Twenty seconds of playback was genuinely watched, so any Address inside it
  // can be recalled. It is subdivided by the Step law in force when the gesture
  // began, not by a fixed number of source seconds.
  let traversalTrace = createTraversalTrace(20);
  traversalTrace = appendObservedPassages(traversalTrace, {
    spans: [{ from: 20, to: 40 }],
    cause: "playback"
  }).traversalTrace;

  const forward = walk(traversalTrace, read(traversalTrace, 20), "forward");
  assert.deepEqual(forward.addresses, [25, 30, 35, 40],
    "A watched span offers the positions a Step of that size would reach.");
  const backward = walk(traversalTrace, read(traversalTrace, 40), "backward");
  assert.deepEqual(backward.addresses, [35, 30, 25, 20],
    "and offers them in reverse when recalled backward.");

  // The boundary is always reachable even when the span does not divide evenly.
  let uneven = createTraversalTrace(0);
  uneven = appendObservedPassages(uneven, {
    spans: [{ from: 0, to: 22 }],
    cause: "playback"
  }).traversalTrace;
  const partial = walk(uneven, read(uneven, 0), "forward");
  assert.deepEqual(partial.addresses, [5, 10, 15, 20, 22],
    "The last quantum may be short; the end of what was watched is never unreachable.");
}

// ---------------------------------------------------------------------------
// A span keeps the direction it was watched in
// ---------------------------------------------------------------------------
{
  // Playback that wrapped, or any transport observed backward, is recalled the
  // way it happened.
  let traversalTrace = createTraversalTrace(40);
  traversalTrace = appendObservedPassages(traversalTrace, {
    spans: [{ from: 40, to: 20 }],
    cause: "playback"
  }).traversalTrace;
  const backward = walk(traversalTrace, read(traversalTrace, 20), "backward");
  assert.deepEqual(backward.addresses, [25, 30, 35, 40],
    "Recalling a backward-watched span backward in the Traversal Trace moves forward in source time.");
}

// ---------------------------------------------------------------------------
// Weight subdivides a watched span, and the endpoints stay exact
// ---------------------------------------------------------------------------
{
  // The same twenty seconds of playback, half of it inside an expanded Section.
  // Ghost uses the ordinary projection Step law, so expanded terrain yields
  // finer source-time candidates -- the recalled span stays faithful to the map
  // the reader is looking at now, while the endpoints it was watched between
  // remain exactly what they were.
  const guide = createGuide("weighted");
  createSectionFromTimes(guide, 30, 40, { weighting: 4 });
  const weighted = projectionForModel({
    duration: DURATION,
    guide,
    range: RANGE,
    neighborhood: { C: 0 },
    stepDistance: null
  });
  let traversalTrace = createTraversalTrace(20);
  traversalTrace = appendObservedPassages(traversalTrace, {
    spans: [{ from: 20, to: 40 }],
    cause: "playback"
  }).traversalTrace;

  const { addresses } = walk(traversalTrace, beginGhostRead(traversalTrace, {
    current: 20,
    range: RANGE,
    projection: weighted,
    stepDistance: reach(5)
  }), "forward");

  assert.equal(addresses.at(-1), 40, "The watched boundary is exact whatever the terrain.");
  const neutralGaps = [];
  const expandedGaps = [];
  let previous = 20;
  for (const address of addresses) {
    (previous >= 30 ? expandedGaps : neutralGaps).push(address - previous);
    previous = address;
  }
  assert.ok(neutralGaps.length && expandedGaps.length, "The span crosses the boundary.");
  assert.ok(Math.max(...expandedGaps) < Math.min(...neutralGaps),
    "Expanded ground yields finer recall; the same wheel notch covers less source time.");
}

// ---------------------------------------------------------------------------
// The active Range is the world Ghost is in
// ---------------------------------------------------------------------------
{
  // Ghost preserves the semantic environment, so it cannot recall a point the
  // current Range excludes, and it must not silently clamp one onto a different
  // point. It reports instead.
  let traversalTrace = createTraversalTrace(10);
  for (const [from, to] of [[10, 30], [30, 200], [200, 45]]) {
    traversalTrace = appendAtomicTraversal(traversalTrace, { from, to, cause: "go" }).traversalTrace;
  }
  const focused = { start: 0, end: 100 };
  const ghostRead = beginGhostRead(traversalTrace, {
    current: 45,
    range: focused,
    projection: neutralProjection,
    stepDistance: reach(5)
  });
  const { addresses } = walk(traversalTrace, ghostRead, "backward");
  assert.deepEqual(addresses, [30, 10],
    "An Address outside the active Range is unavailable, not approximated.");
  assert.equal(ghostRead.blocked, true, "and the gesture can say why it stopped.");

  // A span is clipped to what the Range still contains.
  let spanning = createTraversalTrace(80);
  spanning = appendObservedPassages(spanning, {
    spans: [{ from: 80, to: 140 }],
    cause: "playback"
  }).traversalTrace;
  const clipped = beginGhostRead(spanning, {
    current: 80,
    range: focused,
    projection: neutralProjection,
    stepDistance: reach(5)
  });
  const inside = walk(spanning, clipped, "forward");
  assert.equal(inside.addresses.at(-1), 100, "A watched span stops at the edge of the Range.");
  assert.ok(inside.addresses.every(address => address <= 100 + 1e-9));
}

// ---------------------------------------------------------------------------
// Freezing the readable stream
// ---------------------------------------------------------------------------
{
  // A gesture reads a stream that cannot change underneath it, so it can never
  // follow its own newly injected output.
  let traversalTrace = createTraversalTrace(0);
  for (const [from, to] of [[0, 10], [10, 20], [20, 30]]) {
    traversalTrace = appendAtomicTraversal(traversalTrace, { from, to, cause: "go" }).traversalTrace;
  }
  // The boundary is where the stream stood when the gesture began. Records
  // beyond it -- including the replay this very gesture is about to append --
  // are not readable, so the cursor can never follow its own output.
  const boundary = traversalTrace.records.length;
  const grown = appendAtomicTraversal(traversalTrace, { from: 30, to: 90, cause: "go" }).traversalTrace;
  const frozen = beginGhostRead(grown, {
    current: 30,
    frozenStreamEnd: boundary,
    range: RANGE,
    projection: neutralProjection,
    stepDistance: reach(5)
  });
  assert.equal(frozen.positions.some(position => position.address === 90), false,
    "A record appended after the boundary is invisible to the gesture.");
  const { addresses } = walk(grown, frozen, "backward");
  assert.deepEqual(addresses, [20, 10, 0],
    "The gesture reads only what existed when it began.");

  // Without a boundary the same ledger offers the later record, which is what
  // makes the boundary the thing doing the work.
  const unfrozen = beginGhostRead(grown, {
    current: 90,
    range: RANGE,
    projection: neutralProjection,
    stepDistance: reach(5)
  });
  assert.equal(unfrozen.positions.some(position => position.address === 90), true);
}

// ---------------------------------------------------------------------------
// Cursor validity
// ---------------------------------------------------------------------------
{
  let traversalTrace = createTraversalTrace(0);
  traversalTrace = appendAtomicTraversal(traversalTrace, { from: 0, to: 50, cause: "go" }).traversalTrace;
  traversalTrace = appendObservedPassages(traversalTrace, {
    spans: [{ from: 50, to: 90 }],
    cause: "playback"
  }).traversalTrace;
  const [jump, span] = traversalTrace.records;

  assert.equal(tracePositionIsValid(traversalTrace, { recordId: jump.id, unitIndex: 0, address: 50 }, {}), true);
  assert.equal(tracePositionIsValid(traversalTrace, { recordId: jump.id, unitIndex: 0, address: 25 }, {}), false,
    "A jump was never occupied between its endpoints.");
  assert.equal(tracePositionIsValid(traversalTrace, { recordId: span.id, unitIndex: 0, address: 70 }, {}), true,
    "A watched span was occupied throughout.");
  assert.equal(tracePositionIsValid(traversalTrace, { recordId: span.id, unitIndex: 0, address: 120 }, {}), false);
  assert.equal(tracePositionIsValid(traversalTrace, { recordId: 999, unitIndex: 0, address: 50 }, {}), false);
  assert.equal(tracePositionIsValid(traversalTrace, null, {}), false);
  assert.equal(
    tracePositionIsValid(traversalTrace, { recordId: span.id, unitIndex: 0, address: 70 }, { range: { start: 0, end: 60 } }),
    false,
    "A cursor the active Range excludes is not usable in this world."
  );

  assert.equal(
    latestTracePositionAtAddress(traversalTrace, 50, { range: RANGE, projection: neutralProjection, stepDistance: reach(5) }) >= 0,
    true
  );
  assert.equal(
    latestTracePositionAtAddress(traversalTrace, 12.5, { range: RANGE, projection: neutralProjection, stepDistance: reach(5) }),
    -1,
    "An Address the reader never occupied has no occurrence."
  );
}

// ---------------------------------------------------------------------------
// An empty stream is a boundary, not a crash
// ---------------------------------------------------------------------------
{
  const empty = createTraversalTrace(0);
  const ghostRead = read(empty, 0);
  const moved = moveGhostRead(empty, ghostRead, "backward");
  assert.equal(moved.changed, false);
  assert.equal(moved.reason, "stream-end");
}

// Ripple endpoints extend the forward side of the same stream
{
  const [A, B, C, D] = [10, 20, 30, 40];
  let traversalTrace = createTraversalTrace(A);
  for (const [from, to] of [[A, B], [B, C], [C, D]]) {
    traversalTrace = appendAtomicTraversal(traversalTrace, { from, to, cause: "go" }).traversalTrace;
  }
  const futures = [
    { id: "future-1", address: 70 },
    { id: "future-2", address: 90 }
  ];
  let stream = read(traversalTrace, D, {
    futureEntries: futures
  });
  assert.deepEqual(
    stream.positions.map(position => position.address),
    [A, B, C, D, 70, 90],
    "Ripple endpoints are appended after the current Trace without becoming a second reader."
  );
  const forward = moveGhostRead(traversalTrace, stream, "forward");
  assert.equal(forward.address, 70);
  assert.equal(forward.cursor.streamKind, "future");
  assert.equal(forward.cursor.prospect.id, "future-1");
  const backToCurrent = moveGhostRead(traversalTrace, forward.read, "backward");
  assert.equal(backToCurrent.address, D);
  const intoUndo = moveGhostRead(traversalTrace, backToCurrent.read, "backward");
  assert.equal(intoUndo.address, C);
  const redoAgain = moveGhostRead(traversalTrace, intoUndo.read, "forward");
  assert.equal(redoAgain.address, D,
    "One held gesture can alternate backward and forward across the same pivot.");
  const futureAgain = moveGhostRead(traversalTrace, redoAgain.read, "forward");
  assert.equal(futureAgain.address, 70,
    "and can cross from recorded traversal into Ripple future again without switching modes.");
}

// A resume cursor describes where the reader is standing
{
  let traversalTrace = createTraversalTrace(0);
  for (const [from, to] of [[0, 10], [10, 20]]) {
    traversalTrace = appendAtomicTraversal(traversalTrace, { from, to, cause: "go" }).traversalTrace;
  }
  const cursor = { recordId: traversalTrace.records[0].id, unitIndex: 0, address: 10 };
  assert.equal(tracePositionIsValid(traversalTrace, cursor, { current: 10 }), true);
  assert.equal(tracePositionIsValid(traversalTrace, cursor, { current: 20 }), false,
    "A reader who has moved on is no longer standing in the moment it describes.");

  // The whole matrix, because a cursor is an offer to replay history and every
  // way it can go stale is a way to replay somebody else's. Each of these is a
  // separate reason, and none of them is covered by the others.
  const sequence = appendSequenceTraversal(traversalTrace, {
    points: [20, 30, 25],
    cause: "step-sequence"
  }).traversalTrace;
  const sequenceId = sequence.records.at(-1).id;
  // The two malformed Addresses are aimed at real records whose arithmetic
  // would otherwise accept them: `null` coerces to 0, which the 0 -> 10 jump
  // genuinely has an endpoint at, and "30" coerces to 30, which the sequence
  // genuinely reaches. Only an Address that is a number gets that far.
  for (const [label, candidate, options] of [
    ["a cursor with no Address at all",
      { recordId: traversalTrace.records[0].id, unitIndex: 0, address: null }, {}],
    ["an Address that is not a number",
      { recordId: sequenceId, unitIndex: 0, address: "30" }, {}],
    ["a record the ledger never held", { recordId: 4096, unitIndex: 0, address: 10 }, {}],
    ["a unit index past the end of its record", { recordId: sequenceId, unitIndex: 7, address: 30 }, {}],
    ["an Address belonging to a different unit of the same record",
      { recordId: sequenceId, unitIndex: 0, address: 25 }, {}],
    ["an Address the active Range excludes",
      { recordId: sequenceId, unitIndex: 0, address: 30 }, { range: { start: 0, end: 22 } }],
    ["a reader standing somewhere else",
      { recordId: sequenceId, unitIndex: 0, address: 30 }, { current: 25 }]
  ]) {
    assert.equal(tracePositionIsValid(sequence, candidate, options), false,
      `A resume cursor is refused for ${label}.`);
  }

  // And the same cursor, with nothing wrong with it, is accepted -- so the
  // matrix above is measuring the reasons and not a blanket refusal.
  assert.equal(
    tracePositionIsValid(sequence, { recordId: sequenceId, unitIndex: 0, address: 30 }, {
      current: 30,
      range: { start: 0, end: 100 }
    }),
    true,
    "A cursor with none of those faults still resumes."
  );
}


console.log("Traversal Trace tests passed: recorded movement keeps reversals, direction is independent of source order, shared endpoints are one position, watched spans follow the frozen Step law and active Range, and Ripple futures extend the same bidirectional frozen stream.");
