import assert from "node:assert/strict";
import {
  DEFAULT_GROUP_ID,
  createGuide,
  createGroup,
  createSectionFromTimes,
  groupDeletionPlan,
  deleteGroup
} from "./guide.js";
import {
  createSession,
  snapshotModel,
  planGuideGroupDeletion,
  deleteGuideGroup,
  step,
  settleStepSequence,
  switchEndpoint,
  undo
} from "./session.js";

function buildGroups() {
  const guide = createGuide("completion-groups");
  const terrain = createGroup(guide, "Terrain");
  const detail = createGroup(guide, "Detail");
  const section = createSectionFromTimes(guide, 10, 30, {
    groupId: terrain.id,
    label: "Terrain detail"
  }).section;
  return { guide, terrain, detail, section };
}

// Planning is a complete, stable description of the mutation. Callers never
// infer the heir from a conventional Group id or recreate the collision law.
{
  const { guide, terrain, detail, section } = buildGroups();
  const plan = groupDeletionPlan(guide, terrain.id);
  assert.deepEqual(plan, {
    allowed: true,
    reason: null,
    heirGroupId: DEFAULT_GROUP_ID,
    movedSectionIds: [section.id]
  });
  assert.deepEqual(deleteGroup(guide, terrain.id), plan,
    "Group mutation returns the exact plan it applied.");
  assert.equal(guide.sections.find(entry => entry.id === section.id).groupId, DEFAULT_GROUP_ID);
  assert.ok(guide.groups.some(entry => entry.id === detail.id));
}

// The conventional Map Group is ordinary. If it is removed, the plan reports
// the real surviving destination rather than claiming everything goes to Map.
{
  const { guide, detail } = buildGroups();
  const mapSection = createSectionFromTimes(guide, 40, 50, {
    groupId: DEFAULT_GROUP_ID,
    label: "Map section"
  }).section;
  const session = createSession({ duration: 100, guide });
  const plan = planGuideGroupDeletion(session, DEFAULT_GROUP_ID);
  assert.deepEqual(plan, {
    allowed: true,
    reason: null,
    heirGroupId: detail.id,
    movedSectionIds: [mapSection.id]
  });
  const removed = deleteGuideGroup(session, DEFAULT_GROUP_ID);
  assert.equal(removed.changed, true);
  assert.deepEqual(removed.value, plan,
    "Session returns the actual plan/result for status and confirmation copy.");
  assert.equal(
    removed.session.model.guide.sections.find(entry => entry.id === mapSection.id).groupId,
    detail.id
  );
  assert.equal(removed.session.history.length, 1);
  assert.equal(undo(removed.session).session.model.guide.groups.some(
    entry => entry.id === DEFAULT_GROUP_ID
  ), true, "Group removal remains one undoable semantic transaction.");
}

// Removing an unrelated Group cannot confiscate the deliberate "none drawn"
// presentation state.
{
  const { guide, terrain } = buildGroups();
  guide.visibleGroupId = null;
  const removed = deleteGroup(guide, terrain.id);
  assert.equal(removed.allowed, true);
  assert.equal(guide.visibleGroupId, null);
}

// The last Group and identity-collapsing removals are refused by the same plan
// consumed by mutation.
{
  const guide = createGuide("last-group");
  const last = groupDeletionPlan(guide, DEFAULT_GROUP_ID);
  assert.deepEqual(last, {
    allowed: false,
    reason: "last-group",
    heirGroupId: null,
    movedSectionIds: []
  });
  assert.deepEqual(deleteGroup(guide, DEFAULT_GROUP_ID), last);

  const layered = createGuide("collision");
  createSectionFromTimes(layered, 10, 20, {
    groupId: DEFAULT_GROUP_ID,
    label: "Same"
  });
  const other = createGroup(layered, "Other");
  const duplicate = createSectionFromTimes(layered, 10, 20, {
    groupId: other.id,
    label: "Same"
  }).section;
  const blocked = groupDeletionPlan(layered, other.id);
  assert.deepEqual(blocked, {
    allowed: false,
    reason: "duplicate-section",
    heirGroupId: DEFAULT_GROUP_ID,
    movedSectionIds: [duplicate.id]
  });
  assert.deepEqual(deleteGroup(layered, other.id), blocked);
}

function performStepSequence(directions, reach = 10) {
  let session = createSession({ duration: 100, current: 50 });
  const originModel = snapshotModel(session.model);
  const pending = {
    departure: 50,
    intervalDeparture: 50,
    originModel,
    started: false,
    lastDirection: null,
    visitedMinimum: 50,
    visitedMaximum: 50
  };
  for (const direction of directions) {
    const moved = step(session, direction, reach, {
      departure: pending.departure,
      intervalDeparture: pending.intervalDeparture,
      originInterval: originModel.interval,
      originResolution: originModel.resolution,
      originResolutionBasis: originModel.neighborhoodBasis,
      amend: pending.started
    });
    assert.equal(moved.changed, true);
    session = moved.session;
    pending.started = true;
    pending.lastDirection = direction;
    pending.visitedMinimum = Math.min(
      pending.visitedMinimum,
      session.model.resolution.C
    );
    pending.visitedMaximum = Math.max(
      pending.visitedMaximum,
      session.model.resolution.C
    );
  }
  return { session, pending };
}

// Departure/arrival equality no longer destroys the evidence that Step crossed
// a positive region. Settlement keeps one transaction and one contiguous
// Working Interval, never a durable Path.
{
  const { session, pending } = performStepSequence(["forward", "backward"]);
  assert.equal(session.model.resolution.C, pending.departure);
  assert.equal(session.history.length, 1);
  const settled = settleStepSequence(session, pending);
  assert.equal(settled.direction, null);
  assert.equal(settled.label, "Step Reversal");
  assert.equal(settled.retainedEnvelope, true);
  assert.deepEqual(
    {
      start: settled.interval.start,
      end: settled.interval.end,
      departure: settled.interval.departure,
      arrival: settled.interval.arrival,
      activeEnd: settled.interval.activeEnd
    },
    { start: 50, end: 60, departure: 60, arrival: 50, activeEnd: "start" }
  );
  assert.equal(settled.session.history.length, 1);
  assert.equal(settled.session.history[0].label, "Step Reversal");
  assert.equal("visitedMinimum" in settled.session.model, false);
  assert.equal("visitedMaximum" in settled.session.model, false);
  assert.equal("path" in settled.session.model, false);

  const switched = switchEndpoint(settled.session);
  assert.equal(switched.changed, true);
  assert.equal(switched.session.model.resolution.C, 60,
    "The retained endpoint frame supports deterministic Switch Endpoint.");
  const restored = undo(settled.session);
  assert.equal(restored.changed, true);
  assert.equal(restored.session.model.resolution.C, 50);
  assert.equal(restored.session.model.interval, null);
}

// A reversal may visit both sides of its departure. The sparse envelope keeps
// the complete contiguous residue and the final repeat chooses the active side.
{
  const { session, pending } = performStepSequence([
    "forward",
    "backward",
    "backward",
    "forward"
  ]);
  const settled = settleStepSequence(session, pending);
  assert.equal(settled.label, "Step Reversal");
  assert.deepEqual(
    {
      start: settled.interval.start,
      end: settled.interval.end,
      departure: settled.interval.departure,
      arrival: settled.interval.arrival,
      activeEnd: settled.interval.activeEnd
    },
    { start: 40, end: 60, departure: 40, arrival: 50, activeEnd: "end" }
  );
  assert.equal(settled.session.history.length, 1);
}

// Net movement keeps its ordinary Step result; settlement only names the open
// transaction and does not synthesize an envelope for a non-reversal.
{
  const { session, pending } = performStepSequence(["forward", "forward"]);
  const intervalBefore = session.model.interval;
  const settled = settleStepSequence(session, pending);
  assert.equal(settled.direction, "forward");
  assert.equal(settled.label, "Step Forward");
  assert.equal(settled.retainedEnvelope, false);
  assert.equal(settled.session.model.interval, intervalBefore);
  assert.equal(settled.session.history.length, 1);
}

console.log("Guide/Session completion tests passed: one Group deletion plan and sparse Step Reversal settlement.");
