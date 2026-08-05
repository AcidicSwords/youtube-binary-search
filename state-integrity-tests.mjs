import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_GROUP_ID,
  PIN_KIND,
  assignSectionGroup,
  createGroup,
  createGuide,
  createSectionFromTimes,
  deleteGroup,
  ensurePin,
  orderedPins,
  sanitizeGuide,
  setGroupState,
  validateGuide
} from "./guide.js";
import {
  createSession,
  saveExtentAsSection,
  step
} from "./session.js";
import { projectionForModel } from "./timeline-projection.js";

const clone = value => structuredClone(value);

// A valid v8 Guide round-trips every retained dimension of Group membership.
{
  const source = createGuide("video-a");
  const terrain = createGroup(source, "Terrain", { id: "group-terrain" });
  const section = createSectionFromTimes(source, 10, 30, {
    id: "section-terrain",
    label: "Terrain Section",
    weight: 2,
    groupId: terrain.id
  }).section;
  setGroupState(source, terrain.id, { visible: false, active: true });

  const recovered = sanitizeGuide(clone(source), "video-a", 60);
  assert.equal(validateGuide(recovered, 60), true);
  assert.equal(recovered.groups.length, 2);
  // Compared by identity rather than by position: "the drawn Group is first" is
  // the ordering law, and with nothing drawn it makes no claim about order.
  const shape = groups => groups
    .map(group => ({ id: group.id, label: group.label, active: group.active }))
    .sort((first, second) => first.id.localeCompare(second.id));
  assert.deepEqual(shape(recovered.groups), shape(source.groups));
  assert.equal(recovered.visibleGroupId, source.visibleGroupId,
    "and an explicitly drawn-nothing Guide survives the round trip as such.");
  assert.equal(
    recovered.sections.find(item => item.id === section.id)?.groupId,
    terrain.id
  );
}

// Corrupt membership is repaired to Map; malformed Groups cannot invalidate the
// rest of a recoverable Guide.
{
  const source = createGuide("video-b");
  const section = createSectionFromTimes(source, 5, 15, {
    id: "section-repair"
  }).section;
  section.groupId = "group-missing";
  source.groups.push({
    id: "",
    label: "Broken",
    visible: "yes",
    active: true,
    createdAt: 1,
    updatedAt: 1
  });

  const recovered = sanitizeGuide(source, "video-b", 30);
  assert.equal(validateGuide(recovered, 30), true);
  assert.equal(recovered.sections[0].groupId, DEFAULT_GROUP_ID);
  assert.equal(recovered.groups.some(group => group.id === ""), false);
}

// Validation covers the complete v8 partition, not only Pins and Sections.
{
  const valid = createGuide("video-c");
  createSectionFromTimes(valid, 1, 2, { id: "section-valid" });
  assert.equal(validateGuide(valid, 10), true);

  const noGroups = clone(valid);
  delete noGroups.groups;
  assert.equal(validateGuide(noGroups, 10), false);

  const duplicateGroup = clone(valid);
  duplicateGroup.groups.push(clone(duplicateGroup.groups[0]));
  assert.equal(validateGuide(duplicateGroup, 10), false);

  const malformedState = clone(valid);
  malformedState.groups[0].active = "true";
  assert.equal(validateGuide(malformedState, 10), false);

  const invalidMembership = clone(valid);
  invalidMembership.sections[0].groupId = "missing";
  assert.equal(validateGuide(invalidMembership, 10), false);
}

// Every Group mutation updates the retained object it changes.
{
  const guide = createGuide("video-d");
  const group = createGroup(guide, "A", { id: "group-a" });
  const section = createSectionFromTimes(guide, 2, 8, {
    id: "section-a",
    groupId: DEFAULT_GROUP_ID
  }).section;

  group.updatedAt = 1;
  guide.updatedAt = 1;
  setGroupState(guide, group.id, { visible: false });
  assert.ok(group.updatedAt > 1);
  assert.equal(guide.updatedAt, group.updatedAt);

  section.updatedAt = 1;
  guide.updatedAt = 1;
  assignSectionGroup(guide, section.id, group.id);
  assert.ok(section.updatedAt > 1);
  assert.equal(section.groupId, group.id);
  assert.equal(guide.updatedAt, section.updatedAt);

  section.updatedAt = 1;
  guide.updatedAt = 1;
  deleteGroup(guide, group.id);
  assert.equal(section.groupId, DEFAULT_GROUP_ID);
  assert.ok(section.updatedAt > 1);
  assert.equal(guide.updatedAt, section.updatedAt);
}

// Retention rejects source-impossible extents at the Session boundary.
{
  const session = createSession({ duration: 60, current: 0 });
  const negative = saveExtentAsSection(
    session,
    { start: -1, end: 5 },
    "negative"
  );
  assert.equal(negative.changed, false);
  assert.equal(negative.reason, "extent-out-of-bounds");

  const overflow = saveExtentAsSection(
    session,
    { start: 55, end: 61 },
    "overflow"
  );
  assert.equal(overflow.changed, false);
  assert.equal(overflow.reason, "extent-out-of-bounds");

  const valid = saveExtentAsSection(
    session,
    { start: 0, end: 60 },
    "whole"
  );
  assert.equal(valid.changed, true);
  assert.equal(validateGuide(valid.session.model.guide, 60), true);
}

// Map visibility defines map operands; standalone landmarks remain reachable.
{
  const guide = createGuide("video-e");
  const hidden = createGroup(guide, "Hidden", { id: "group-hidden" });
  const section = createSectionFromTimes(guide, 10, 20, {
    id: "section-hidden",
    groupId: hidden.id
  }).section;
  const standalone = ensurePin(guide, 30, {
    id: "pin-standalone",
    kind: PIN_KIND.EXPLICIT
  }).pin;
  setGroupState(guide, hidden.id, { visible: false });

  const visibleIds = orderedPins(guide).map(pin => pin.id);
  assert.equal(visibleIds.includes(section.startPinId), false);
  assert.equal(visibleIds.includes(section.endPinId), false);
  assert.equal(visibleIds.includes(standalone.id), true);
}

// The Field-to-Step bridge is exact across deformed and overlapping terrain:
// map distance to the displayed source Address lands on that Address.
{
  const guide = createGuide("video-f");
  createSectionFromTimes(guide, 0, 30, {
    id: "section-expanded",
    weight: 2
  });
  createSectionFromTimes(guide, 15, 45, {
    id: "section-compressed",
    weight: 0.5
  });
  const session = createSession({
    duration: 60,
    current: 10,
    guide
  });
  const projection = projectionForModel(session.model);
  const target = 40;
  const distance = projection.timelineDistance(
    session.model.neighborhood.C,
    target
  );
  const moved = step(session, "forward", distance);
  assert.equal(moved.changed, true);
  assert.ok(Math.abs(moved.session.model.neighborhood.C - target) < 1e-6);
}

// Composition-root guards ensure alternate routes retain the same owner.
{
  const app = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const view = fs.readFileSync(new URL("./view.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

  assert.ok(app.includes('const STORAGE_V9_PREFIX = "binary-youtube-reader:v9:";'));
  assert.ok(app.includes('const STORAGE_V8_PREFIX = "binary-youtube-reader:v8:";'));
  assert.ok(
    app.indexOf("[STORAGE_V8_PREFIX") < app.indexOf("[STORAGE_V7_PREFIX")
  );
  assert.ok(app.includes("resetSourceScopedState();"));
  assert.ok(app.includes("state.cues = [];"));
  assert.ok(app.includes("return orderedPins(sourceGuide)"));
  assert.ok(app.includes("timelineProjection().timelineDistance("));
  assert.ok(app.includes("selection.address"));
  assert.ok(app.includes("accept(moved, {"));
  assert.ok(app.includes("accept(result, {"));
  assert.ok(app.includes("accept(created, {"));
  assert.equal(app.includes("state.session = moved.session;"), false);

  assert.ok(view.includes('"Stop Context and Play from Current"'));
  assert.ok(html.includes("Current; drag to Step, Shift-drag for precision"));
  assert.ok(html.includes("one unit equals one source second"));
}

console.log("State integrity tests passed.");
