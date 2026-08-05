// Ghost Traverse against a live Session.
//
// The ledger suite proves what user time offers. This one proves what happens
// when a recalled Address is applied to a real semantic model: that the world
// the reader built survives the recall completely, that what appears is an
// ordinary Active Span, and that one held gesture is one Undo.
import assert from "node:assert/strict";
import {
  createSession,
  goTo,
  step,
  refine,
  saveExtentAsSection,
  setGuideSectionWeight,
  ghostTraverse,
  settleGhostSequence,
  checkpoint,
  undo,
  focusSection
} from "./session.js";
import { EPSILON } from "./range-geometry.js";
import { projectionForModel } from "./timeline-projection.js";
import { createGuide } from "./guide.js";
import {
  createUserTime,
  appendAtomicTraversal,
  appendContinuousTraversal,
  beginGhostRead,
  moveGhostRead,
  appendGhostInjection
} from "./user-time.js";

const DURATION = 300;
const RANGE = { start: 0, end: DURATION };

function projectionFor(session) {
  return projectionForModel(session.model);
}

// A world worth returning to: retained structure, a non-neutral Weight, a
// title, and a Group. None of it may move when Ghost does.
function buildWorld() {
  let session = createSession({ duration: DURATION, guide: createGuide("world") });
  session = goTo(session, 40, { operator: "timeline" }).session;
  session = goTo(session, 120, { operator: "timeline" }).session;
  const saved = saveExtentAsSection(session, { start: 40, end: 120 }, { label: "Middle" });
  session = saved.session;
  const sectionId = session.model.guide.sections.at(-1).id;
  session = setGuideSectionWeight(session, sectionId, 2).session;
  session = goTo(session, 200, { operator: "timeline" }).session;
  return { session, sectionId };
}

function worldFingerprint(model) {
  return JSON.stringify({
    pins: model.guide.pins.map(pin => [pin.id, pin.t, pin.kind]).sort(),
    sections: model.guide.sections.map(section => [
      section.id, section.startPinId, section.endPinId, section.weight, section.label || null
    ]).sort(),
    groups: model.guide.groups.map(group => [
      group.id, group.label || null, group.active
    ]).sort(),
    visibleGroupId: model.guide.visibleGroupId,
    range: [model.range.start, model.range.end],
    focus: model.focus ? [model.focus.kind, model.focus.sectionId || null] : null,
    stepReach: model.stepReach,
    duration: model.duration
  });
}

// ---------------------------------------------------------------------------
// The semantic world survives the recall entirely
// ---------------------------------------------------------------------------
{
  const { session } = buildWorld();
  const before = worldFingerprint(session.model);
  const anchor = session.model.resolution.C;

  const ghosted = ghostTraverse(session, 40, {
    anchor,
    direction: "backward",
    originResolution: session.model.resolution,
    originResolutionBasis: session.model.neighborhoodBasis,
    projection: projectionFor(session)
  });
  assert.equal(ghosted.changed, true);
  assert.equal(worldFingerprint(ghosted.session.model), before,
    "Recalling an earlier Address changes no Pin, Section, Group, Weight, title, Range or Focus.");
  assert.equal(ghosted.session.model.resolution.C, 40, "Only Current moves.");
  assert.equal(ghosted.place, 40, "and the player is asked to follow it.");

  // What appears is an ordinary Active Span, so every other operator can
  // act on it without knowing where it came from.
  const interval = ghosted.session.model.interval;
  assert.equal(interval.medium, "ghost", "It is marked as recalled,");
  assert.equal(interval.start, 40);
  assert.equal(interval.end, anchor, "spans from the recalled Address to the Anchor,");
  assert.equal(interval.activeEnd, "start",
    "and the recalled end is the active one: the Anchor is what stays fixed.");
  assert.equal(interval.direction, "backward");

  // Forward recall anchors the same way from the other side.
  const forward = ghostTraverse(session, 260, {
    anchor,
    direction: "forward",
    originResolution: session.model.resolution,
    projection: projectionFor(session)
  });
  assert.equal(forward.session.model.interval.activeEnd, "end");
  assert.equal(forward.session.model.interval.start, anchor);
}

// ---------------------------------------------------------------------------
// Focus and Range are the world Ghost is inside
// ---------------------------------------------------------------------------
{
  const { session, sectionId } = buildWorld();
  const focused = focusSection(session, sectionId, { projection: projectionFor(session) });
  assert.equal(focused.changed, true);
  const inFocus = focused.session;
  const anchor = inFocus.model.resolution.C;

  // A recalled Address outside the focused Range is refused, not clamped onto a
  // different point and not escaped by leaving Focus.
  const outside = ghostTraverse(inFocus, 10, {
    anchor,
    direction: "backward",
    projection: projectionFor(inFocus)
  });
  assert.equal(outside.changed, false);
  assert.equal(outside.reason, "ghost-outside-range");
  assert.equal(outside.session.model.focus?.sectionId, sectionId, "Focus is untouched by the refusal.");

  const inside = ghostTraverse(inFocus, 60, {
    anchor,
    direction: "backward",
    projection: projectionFor(inFocus)
  });
  assert.equal(inside.changed, true);
  assert.equal(inside.session.model.focus?.sectionId, sectionId, "and untouched by a successful recall.");
  assert.deepEqual(
    [inside.session.model.range.start, inside.session.model.range.end],
    [inFocus.model.range.start, inFocus.model.range.end],
    "Ghost never widens Range or opens Full Video to reach a recalled point."
  );
}

// ---------------------------------------------------------------------------
// One held gesture is one Undo, and Undo returns to the Anchor
// ---------------------------------------------------------------------------
{
  const { session } = buildWorld();
  const originModel = session.model;
  const anchor = originModel.resolution.C;
  const worldBefore = worldFingerprint(originModel);
  const historyBefore = session.history.length;

  // Every wheel notch amends one captured origin, so the gesture writes nothing
  // to history while it is being held.
  let gesturing = session;
  for (const address of [160, 120, 40]) {
    const amended = ghostTraverse(gesturing, address, {
      anchor,
      direction: "backward",
      originResolution: originModel.resolution,
      originResolutionBasis: originModel.neighborhoodBasis,
      projection: projectionFor(session),
      amend: true
    });
    assert.equal(amended.changed, true);
    gesturing = amended.session;
    assert.equal(gesturing.history.length, historyBefore,
      "A held Ghost gesture appends no history while it moves.");
  }

  const settled = checkpoint(gesturing, "Ghost Traverse", originModel);
  assert.equal(settled.session.history.length, historyBefore + 1,
    "Releasing writes exactly one transaction.");
  assert.equal(settled.session.history.at(-1).label, "Ghost Traverse");

  const returned = undo(settled.session);
  assert.equal(returned.changed, true);
  assert.equal(returned.session.model.resolution.C, anchor,
    "One Undo returns to the Anchor the gesture began from.");
  assert.equal(worldFingerprint(returned.session.model), worldBefore,
    "and the structure built before Ghost is still there, because Ghost never touched it.");
}

// ---------------------------------------------------------------------------
// A gesture that wanders and comes back retains what it crossed
// ---------------------------------------------------------------------------
{
  const { session } = buildWorld();
  const anchor = session.model.resolution.C;

  // Out to 40 and back to the Anchor: net displacement nothing, but the reader
  // crossed a positive extent and that extent is what they now have in view.
  let gesturing = session;
  for (const address of [120, 40, 120, anchor]) {
    const amended = ghostTraverse(gesturing, address, {
      anchor,
      direction: address <= 120 ? "backward" : "forward",
      originResolution: session.model.resolution,
      projection: projectionFor(session),
      amend: true
    });
    if (amended.changed) gesturing = amended.session;
  }
  assert.equal(Math.abs(gesturing.model.resolution.C - anchor) <= EPSILON, true,
    "The gesture ended where it started.");

  const settled = settleGhostSequence(gesturing, {
    changed: true,
    anchor,
    visitedMinimum: 40,
    visitedMaximum: anchor,
    lastSourceDirection: "forward",
    projection: projectionFor(session)
  });
  assert.equal(settled.changed, true);
  assert.equal(settled.session.model.interval.start, 40);
  assert.equal(settled.session.model.interval.end, anchor,
    "The positive extent crossed is retained, exactly as a Step Reversal retains its own.");
  assert.equal(settled.session.model.interval.activeEnd, "end",
    "The last source movement supplies the viewpoint.");

  // A gesture that never left has nothing to retain.
  const still = settleGhostSequence(session, {
    changed: true,
    anchor,
    visitedMinimum: anchor,
    visitedMaximum: anchor,
    projection: projectionFor(session)
  });
  assert.equal(still.changed, false);
  assert.equal(still.reason, "ghost-round-trip");

  // A gesture that ended somewhere else keeps the Interval it already drew.
  const displaced = settleGhostSequence(gesturing, {
    changed: true,
    anchor: 40,
    visitedMinimum: 40,
    visitedMaximum: anchor,
    projection: projectionFor(session)
  });
  assert.equal(displaced.changed, false);
  assert.equal(displaced.reason, "ghost-displaced");
}

// ---------------------------------------------------------------------------
// Recall lands on what was recorded, not on what the map would compute now
// ---------------------------------------------------------------------------
{
  // A Refine under one Weight map reached an exact source Address. Change the
  // map, then recall it: Ghost must land where the reader actually was, not
  // recompute a midpoint from terrain that did not exist at the time.
  const { session, sectionId } = buildWorld();
  const departure = session.model.resolution.C;
  const refined = refine(session, "backward", { projection: projectionFor(session) });
  assert.equal(refined.changed, true);
  const recorded = refined.session.model.resolution.C;

  let userTime = createUserTime(departure);
  userTime = appendAtomicTraversal(userTime, {
    from: departure,
    to: recorded,
    cause: "refineBackward"
  }).userTime;

  // The terrain moves underneath.
  const reweighted = setGuideSectionWeight(refined.session, sectionId, 0.25).session;
  const wouldBeNow = refine(reweighted, "backward", {
    projection: projectionForModel(reweighted.model)
  });
  assert.notEqual(
    Math.abs(wouldBeNow.session.model.resolution.C - recorded) <= EPSILON,
    true,
    "The same operator under the new map would reach somewhere else."
  );

  const ghostRead = beginGhostRead(userTime, {
    current: recorded,
    range: RANGE,
    projection: projectionForModel(reweighted.model),
    stepReach: { backward: 5, forward: 5 }
  });
  const moved = moveGhostRead(userTime, ghostRead, "backward");
  assert.equal(moved.changed, true);
  assert.equal(moved.address, departure,
    "Ghost recalls the Address the reader occupied, and never re-executes the operator.");
}

// ---------------------------------------------------------------------------
// The whole shape: recall, inject, sever, replay, retain
// ---------------------------------------------------------------------------
{
  // The acceptance scenario in miniature. The reader traverses forward, recalls
  // an earlier point, severs the present, then replays that point's successors
  // knowing how the story ended -- and retains a Section entirely in the past
  // without ever dropping a temporary Pin or remembering a timestamp.
  const [A, B, C, D] = [30, 60, 90, 150];
  let session = createSession({ duration: DURATION, guide: createGuide("shape") });
  let userTime = createUserTime(A);
  session = goTo(session, A, { operator: "timeline" }).session;
  for (const [from, to] of [[A, B], [B, C], [C, D]]) {
    session = goTo(session, to, { operator: "timeline" }).session;
    userTime = appendAtomicTraversal(userTime, { from, to, cause: "go" }).userTime;
  }
  const streamBefore = userTime.records.length;

  // Recall backward to A.
  const frozenEnd = userTime.records.length;
  let ghostRead = beginGhostRead(userTime, {
    current: D,
    frozenStreamEnd: frozenEnd,
    range: RANGE,
    projection: projectionFor(session),
    stepReach: { backward: 5, forward: 5 }
  });
  const visited = [];
  let gesturing = session;
  for (const expected of [C, B, A]) {
    const moved = moveGhostRead(userTime, ghostRead, "backward");
    assert.equal(moved.address, expected);
    ghostRead = moved.read;
    visited.push({ address: moved.address, sourceCursor: moved.cursor });
    gesturing = ghostTraverse(gesturing, moved.address, {
      anchor: D,
      direction: "backward",
      originResolution: session.model.resolution,
      projection: projectionFor(session),
      amend: true
    }).session;
  }
  assert.equal(gesturing.model.resolution.C, A);
  assert.equal(gesturing.model.interval.start, A);
  assert.equal(gesturing.model.interval.end, D, "The Active Span reaches back to the Anchor.");

  // Session settlement and the ledger are different consequences of one gesture.
  // The Session retains the Anchor relation as a Active Span; user time
  // records only where the reader landed.
  const replay = appendGhostInjection(userTime, {
    anchor: D,
    anchorCursor: { recordId: userTime.records.at(-1).id, unitIndex: 0, address: D },
    landing: A,
    recalledCursor: visited.at(-1).sourceCursor,
    scan: { candidateCount: visited.length, visitedMinimum: A, visitedMaximum: D },
    createdAt: 1
  });
  userTime = replay.userTime;
  assert.equal(replay.record.units.length, 1,
    "The ledger keeps one landing, not the scan that found it,");
  assert.equal(gesturing.model.interval.start, A);
  assert.equal(gesturing.model.interval.end, D,
    "while the Session keeps the whole Anchor relation.");
  assert.equal(userTime.records.length, streamBefore + 1);
  assert.equal(userTime.records.slice(0, streamBefore).length, streamBefore,
    "Everything that already happened is still there.");

  // Sever the present. Current stays; the resume cursor is untouched by this.
  const severed = { ...gesturing, model: { ...gesturing.model, interval: null } };
  assert.equal(severed.model.resolution.C, A);

  // Replay A's successors, now knowing D.
  let resumed = beginGhostRead(userTime, {
    current: A,
    resumeCursor: replay.resumeCursor,
    frozenStreamEnd: userTime.records.length,
    range: RANGE,
    projection: projectionFor(session),
    stepReach: { backward: 5, forward: 5 }
  });
  const forward = moveGhostRead(userTime, resumed, "forward");
  assert.equal(forward.address, B,
    "Ghosting forward follows what originally came after A, not the replay just written.");

  const anchored = ghostTraverse(severed, forward.address, {
    anchor: A,
    direction: "forward",
    originResolution: severed.model.resolution,
    projection: projectionFor(session),
    amend: true
  });
  assert.equal(anchored.changed, true);
  assert.equal(anchored.session.model.interval.start, A);
  assert.equal(anchored.session.model.interval.end, B,
    "The new relation is anchored at the live occurrence of A, entirely earlier than D.");

  // That Interval is ordinary, so retaining it is the ordinary save.
  const retained = saveExtentAsSection(
    anchored.session,
    { start: anchored.session.model.interval.start, end: anchored.session.model.interval.end },
    { label: "Recognised" }
  );
  assert.equal(retained.changed, true);
  const section = retained.session.model.guide.sections.at(-1);
  const pinAt = id => retained.session.model.guide.pins.find(pin => pin.id === id)?.t;
  assert.equal(pinAt(section.startPinId), A);
  assert.equal(pinAt(section.endPinId), B,
    "An ordinary Section, made entirely of the past, with no special command.");
}

console.log("Ghost tests passed: the semantic world survives a recall untouched, Focus and Range bound it, a held gesture is one Undo that returns to the Anchor, a round trip retains the extent it crossed, recall lands on recorded Addresses rather than recomputed ones, and severing then replaying anchors an ordinary Section entirely in the past.");
