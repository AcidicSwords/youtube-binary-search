// The user-time ledger: what the reader encountered, in the order they met it.
//
// This suite proves the ledger and its read cursor in isolation. It builds no
// Session, touches no DOM, and drives no player: everything here is a question
// about a sequence of Addresses and the order a reader met them in.
import assert from "node:assert/strict";
import {
  TRAVERSAL_KIND,
  UNIT_KIND,
  createUserTime,
  appendAtomicTraversal,
  appendSequenceTraversal,
  appendContinuousTraversal,
  beginGhostRead,
  moveGhostRead,
  appendGhostReplay,
  latestCursorAtAddress,
  cursorIsValid
} from "./user-time.js";
import { projectionForModel } from "./timeline-projection.js";
import { createGuide, createSectionFromTimes } from "./guide.js";

const DURATION = 300;
const RANGE = { start: 0, end: DURATION };
const neutralProjection = projectionForModel({
  duration: DURATION,
  guide: createGuide("neutral"),
  range: RANGE,
  resolution: { C: 0 },
  stepReach: null
});
const reach = seconds => ({ backward: seconds, forward: seconds });

const read = (userTime, current, options = {}) => beginGhostRead(userTime, {
  current,
  range: RANGE,
  projection: neutralProjection,
  stepReach: reach(5),
  ...options
});

// Walk a whole direction and collect the Addresses it offers.
function walk(userTime, ghostRead, direction, limit = 40) {
  const seen = [];
  let cursor = ghostRead;
  for (let index = 0; index < limit; index += 1) {
    const moved = moveGhostRead(userTime, cursor, direction);
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
  let userTime = createUserTime(10);
  assert.equal(userTime.records.length, 0);
  assert.equal(userTime.latestOccurrence.address, 10, "The ledger opens where the reader arrived.");

  const first = appendAtomicTraversal(userTime, { from: 10, to: 40, cause: "refineForward" });
  assert.equal(first.changed, true);
  assert.equal(first.record.kind, TRAVERSAL_KIND.ATOMIC);
  assert.deepEqual(first.record.units, [{ kind: UNIT_KIND.JUMP, from: 10, to: 40 }]);
  assert.equal(first.userTime.latestOccurrence.address, 40);
  userTime = first.userTime;

  // A movement that moved nothing is not an occurrence: recording it would put a
  // position in the stream the reader never distinguished from the one before.
  const still = appendAtomicTraversal(userTime, { from: 40, to: 40, cause: "go" });
  assert.equal(still.changed, false, "A movement of nothing is not an encounter.");
  assert.equal(still.userTime, userTime, "and leaves the ledger untouched.");

  // Reversals inside one gesture survive. Collapsing a Step sequence to its
  // extremes would erase going out and coming back, which is the shape a reader
  // actually remembers.
  const sequence = appendSequenceTraversal(userTime, {
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
  assert.ok(sequence.userTime.nextRecordId > sequence.record.id);
}

// ---------------------------------------------------------------------------
// Direction is a direction in user time, not in source time
// ---------------------------------------------------------------------------
{
  // The reader went 10 → 40 → 25 → 70. Ghosting backward retraces that, which
  // moves forward through source time on one of its legs and backward on
  // another. Nothing about source order survives the recall.
  let userTime = createUserTime(10);
  for (const [from, to] of [[10, 40], [40, 25], [25, 70]]) {
    userTime = appendAtomicTraversal(userTime, { from, to, cause: "go" }).userTime;
  }

  const backward = walk(userTime, read(userTime, 70), "backward");
  assert.deepEqual(backward.addresses, [25, 40, 10],
    "Ghosting backward reverses the reader's own path, whichever way source time runs.");

  const forward = walk(userTime, read(userTime, 10, { resumeCursor: null }), "forward");
  assert.deepEqual(forward.addresses, [40, 25, 70],
    "and forward replays it in the order it happened.");

  // The two are exact inverses.
  assert.deepEqual([...backward.addresses].reverse(), [10, 40, 25],
    "Backward from the end reaches the beginning.");

  // Walking past either end reports rather than wrapping.
  const exhausted = moveGhostRead(userTime, backward.read, "backward");
  assert.equal(exhausted.changed, false);
  assert.equal(exhausted.reason, "stream-end");
}

// ---------------------------------------------------------------------------
// One occurrence is one position
// ---------------------------------------------------------------------------
{
  // A jump's arrival and the next jump's departure are the same occurrence seen
  // from either side. Offering it twice would spend a wheel notch going nowhere.
  let userTime = createUserTime(0);
  userTime = appendSequenceTraversal(userTime, {
    points: [0, 20, 40, 60],
    cause: "step-sequence"
  }).userTime;
  const { addresses } = walk(userTime, read(userTime, 60), "backward");
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
  let userTime = createUserTime(20);
  userTime = appendContinuousTraversal(userTime, {
    spans: [{ from: 20, to: 40 }],
    cause: "playback"
  }).userTime;

  const forward = walk(userTime, read(userTime, 20), "forward");
  assert.deepEqual(forward.addresses, [25, 30, 35, 40],
    "A watched span offers the positions a Step of that size would reach.");
  const backward = walk(userTime, read(userTime, 40), "backward");
  assert.deepEqual(backward.addresses, [35, 30, 25, 20],
    "and offers them in reverse when recalled backward.");

  // The boundary is always reachable even when the span does not divide evenly.
  let uneven = createUserTime(0);
  uneven = appendContinuousTraversal(uneven, {
    spans: [{ from: 0, to: 22 }],
    cause: "playback"
  }).userTime;
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
  let userTime = createUserTime(40);
  userTime = appendContinuousTraversal(userTime, {
    spans: [{ from: 40, to: 20 }],
    cause: "playback"
  }).userTime;
  const backward = walk(userTime, read(userTime, 20), "backward");
  assert.deepEqual(backward.addresses, [25, 30, 35, 40],
    "Recalling a backward-watched span backward in user time moves forward in source time.");
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
  createSectionFromTimes(guide, 30, 40, { weight: 4 });
  const weighted = projectionForModel({
    duration: DURATION,
    guide,
    range: RANGE,
    resolution: { C: 0 },
    stepReach: null
  });
  let userTime = createUserTime(20);
  userTime = appendContinuousTraversal(userTime, {
    spans: [{ from: 20, to: 40 }],
    cause: "playback"
  }).userTime;

  const { addresses } = walk(userTime, beginGhostRead(userTime, {
    current: 20,
    range: RANGE,
    projection: weighted,
    stepReach: reach(5)
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
  let userTime = createUserTime(10);
  for (const [from, to] of [[10, 30], [30, 200], [200, 45]]) {
    userTime = appendAtomicTraversal(userTime, { from, to, cause: "go" }).userTime;
  }
  const focused = { start: 0, end: 100 };
  const ghostRead = beginGhostRead(userTime, {
    current: 45,
    range: focused,
    projection: neutralProjection,
    stepReach: reach(5)
  });
  const { addresses } = walk(userTime, ghostRead, "backward");
  assert.deepEqual(addresses, [30, 10],
    "An Address outside the active Range is unavailable, not approximated.");
  assert.equal(ghostRead.blocked, true, "and the gesture can say why it stopped.");

  // A span is clipped to what the Range still contains.
  let spanning = createUserTime(80);
  spanning = appendContinuousTraversal(spanning, {
    spans: [{ from: 80, to: 140 }],
    cause: "playback"
  }).userTime;
  const clipped = beginGhostRead(spanning, {
    current: 80,
    range: focused,
    projection: neutralProjection,
    stepReach: reach(5)
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
  let userTime = createUserTime(0);
  for (const [from, to] of [[0, 10], [10, 20], [20, 30]]) {
    userTime = appendAtomicTraversal(userTime, { from, to, cause: "go" }).userTime;
  }
  // The boundary is where the stream stood when the gesture began. Records
  // beyond it -- including the replay this very gesture is about to append --
  // are not readable, so the cursor can never follow its own output.
  const boundary = userTime.records.length;
  const grown = appendAtomicTraversal(userTime, { from: 30, to: 90, cause: "go" }).userTime;
  const frozen = beginGhostRead(grown, {
    current: 30,
    frozenStreamEnd: boundary,
    range: RANGE,
    projection: neutralProjection,
    stepReach: reach(5)
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
    stepReach: reach(5)
  });
  assert.equal(unfrozen.positions.some(position => position.address === 90), true);
}

// ---------------------------------------------------------------------------
// Injection is append-only
// ---------------------------------------------------------------------------
{
  // Traverse A → B → C → D, then recall B. The stream becomes A → B → C → D → B',
  // where B' is the same Address as B and a different occurrence: it was reached
  // knowing what C and D turned out to be.
  const [A, B, C, D] = [10, 20, 30, 40];
  let userTime = createUserTime(A);
  for (const [from, to] of [[A, B], [B, C], [C, D]]) {
    userTime = appendAtomicTraversal(userTime, { from, to, cause: "go" }).userTime;
  }
  const before = userTime.records.length;
  const frozenEnd = userTime.records.length;

  let ghostRead = beginGhostRead(userTime, {
    current: D,
    frozenStreamEnd: frozenEnd,
    range: RANGE,
    projection: neutralProjection,
    stepReach: reach(5)
  });
  const visited = [];
  for (const expected of [C, B]) {
    const moved = moveGhostRead(userTime, ghostRead, "backward");
    assert.equal(moved.address, expected);
    visited.push({ address: moved.address, sourceCursor: moved.cursor });
    ghostRead = moved.read;
  }

  const replayed = appendGhostReplay(userTime, {
    anchor: D,
    anchorCursor: { recordId: userTime.records.at(-1).id, unitIndex: 0, address: D },
    visited,
    createdAt: 1
  });
  assert.equal(replayed.changed, true);
  assert.equal(replayed.userTime.records.length, before + 1, "One gesture writes one record.");
  assert.equal(replayed.record.kind, TRAVERSAL_KIND.GHOST_REPLAY);
  assert.equal(replayed.userTime.latestOccurrence.address, B,
    "The recalled Address becomes the live occurrence.");

  // Nothing was rewritten or dropped.
  for (let index = 0; index < before; index += 1) {
    assert.deepEqual(replayed.userTime.records[index], userTime.records[index],
      "Recalling the past does not edit it.");
  }

  // The new occurrence knows which one it came from.
  assert.equal(replayed.record.provenance.anchorAddress, D);
  assert.equal(replayed.record.provenance.recalledOccurrences.length, 2);
  assert.equal(replayed.record.provenance.recalledOccurrences.at(-1).address, B);

  // The resume cursor points at the historical occurrence, not the injected one,
  // so Ghosting forward next time retraces what originally followed B rather
  // than retracing the replay.
  assert.ok(cursorIsValid(replayed.userTime, replayed.resumeCursor, { range: RANGE }));
  assert.equal(replayed.resumeCursor.address, B);
  const resumed = beginGhostRead(replayed.userTime, {
    current: B,
    resumeCursor: replayed.resumeCursor,
    range: RANGE,
    projection: neutralProjection,
    stepReach: reach(5)
  });
  const forward = walk(replayed.userTime, resumed, "forward");
  assert.equal(forward.addresses[0], C,
    "Resuming continues through the historical successors of the recalled point.");
}

// ---------------------------------------------------------------------------
// Cursor validity
// ---------------------------------------------------------------------------
{
  let userTime = createUserTime(0);
  userTime = appendAtomicTraversal(userTime, { from: 0, to: 50, cause: "go" }).userTime;
  userTime = appendContinuousTraversal(userTime, {
    spans: [{ from: 50, to: 90 }],
    cause: "playback"
  }).userTime;
  const [jump, span] = userTime.records;

  assert.equal(cursorIsValid(userTime, { recordId: jump.id, unitIndex: 0, address: 50 }, {}), true);
  assert.equal(cursorIsValid(userTime, { recordId: jump.id, unitIndex: 0, address: 25 }, {}), false,
    "A jump was never occupied between its endpoints.");
  assert.equal(cursorIsValid(userTime, { recordId: span.id, unitIndex: 0, address: 70 }, {}), true,
    "A watched span was occupied throughout.");
  assert.equal(cursorIsValid(userTime, { recordId: span.id, unitIndex: 0, address: 120 }, {}), false);
  assert.equal(cursorIsValid(userTime, { recordId: 999, unitIndex: 0, address: 50 }, {}), false);
  assert.equal(cursorIsValid(userTime, null, {}), false);
  assert.equal(
    cursorIsValid(userTime, { recordId: span.id, unitIndex: 0, address: 70 }, { range: { start: 0, end: 60 } }),
    false,
    "A cursor the active Range excludes is not usable in this world."
  );

  assert.equal(
    latestCursorAtAddress(userTime, 50, { range: RANGE, projection: neutralProjection, stepReach: reach(5) }) >= 0,
    true
  );
  assert.equal(
    latestCursorAtAddress(userTime, 12.5, { range: RANGE, projection: neutralProjection, stepReach: reach(5) }),
    -1,
    "An Address the reader never occupied has no occurrence."
  );
}

// ---------------------------------------------------------------------------
// An empty stream is a boundary, not a crash
// ---------------------------------------------------------------------------
{
  const empty = createUserTime(0);
  const ghostRead = read(empty, 0);
  const moved = moveGhostRead(empty, ghostRead, "backward");
  assert.equal(moved.changed, false);
  assert.equal(moved.reason, "no-user-time");
  assert.equal(appendGhostReplay(empty, { anchor: 0, visited: [] }).changed, false,
    "A gesture that recalled nothing writes nothing.");
}

// A recall is not a journey, so recalling does not fold the stream in half
{
  // The reader walks forward deliberately, recalls back along it, and then goes
  // somewhere new. If the replay were offered back as somewhere to recall *to*,
  // the stream would be a palindrome: scrolling backward would walk forward
  // through the original journey and then turn around, which is disorienting
  // and says nothing the original records do not already say.
  const walked = [0, 10, 20, 30, 40];
  let userTime = createUserTime(walked[0]);
  for (let index = 1; index < walked.length; index += 1) {
    userTime = appendAtomicTraversal(userTime, {
      from: walked[index - 1],
      to: walked[index],
      cause: "timeline"
    }).userTime;
  }

  // Recall back along it.
  let ghostRead = read(userTime, 40);
  const visited = [];
  for (let notch = 0; notch < 3; notch += 1) {
    const moved = moveGhostRead(userTime, ghostRead, "backward");
    visited.push({ address: moved.address, sourceCursor: moved.cursor });
    ghostRead = moved.read;
  }
  assert.deepEqual(visited.map(entry => entry.address), [30, 20, 10],
    "Recalling walks back along what was walked.");

  const replayed = appendGhostReplay(userTime, {
    anchor: 40,
    anchorCursor: { recordId: userTime.records.at(-1).id, unitIndex: 0, address: 40 },
    visited,
    createdAt: 1
  });

  // The record is kept in full -- units, provenance, and its place in the order
  // are all part of what happened.
  assert.equal(replayed.record.kind, TRAVERSAL_KIND.GHOST_REPLAY);
  assert.equal(replayed.record.units.length, 3);
  assert.equal(replayed.record.provenance.recalledOccurrences.length, 3);

  // It is simply not offered back as somewhere to recall to.
  const after = read(replayed.userTime, 10);
  assert.deepEqual(
    after.positions.map(position => position.address),
    walked,
    "The readable stream stays the journey the reader actually made."
  );

  // And from the recalled Address, forward retraces what originally followed it
  // -- the reader resolves onto the historical occurrence, not the replayed one.
  const forward = walk(replayed.userTime, after, "forward");
  assert.deepEqual(forward.addresses, [20, 30, 40],
    "Ghosting forward from a recalled moment replays its original successors.");

  // Going somewhere new afterwards is ordinary navigation and does appear.
  const moved = appendAtomicTraversal(replayed.userTime, {
    from: 10, to: 90, cause: "timeline"
  }).userTime;
  const later = walk(moved, read(moved, 90), "backward");
  assert.deepEqual(later.addresses, [10, 40, 30, 20, 10, 0],
    "so a later backward recall reverses the journey: where they left from, then the walk itself.");
  // 10 appears twice because the reader genuinely stood there twice -- once on
  // the way out and once after recalling. What does not appear is the recall
  // between them, which was looking rather than going.
  assert.equal(later.addresses.filter(address => address === 10).length, 2);
  assert.equal(later.addresses.includes(20), true);
  assert.deepEqual(later.addresses.slice(1), [40, 30, 20, 10, 0],
    "and the tail is the original walk in reverse, with no fold in it.");
}

console.log("User time tests passed: append-only records that keep reversals, direction in user time independent of source order, shared endpoints as one position, watched spans subdivided by the frozen Step law and clipped to the active Range, a frozen readable stream, injection that adds an occurrence without editing the one it was recalled from, and a recall that is recorded in full without being offered back as somewhere to recall to.");
