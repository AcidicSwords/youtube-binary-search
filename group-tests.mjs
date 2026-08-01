// Groups: a set of Sections carrying two independent states.
//
//   visible  — are its Sections and their endpoint Pins on the map?
//   active   — does its deformation apply?
//
// Nothing is frozen, so nothing can go stale. These tests hold the four states,
// the partition rule, the Pin visibility law that makes a standalone Pin usable
// inside compressed terrain, and the migration of guides written before Groups.
import assert from "node:assert/strict";
import {
  DEFAULT_GROUP_ID,
  createGuide,
  createGroup,
  createSectionFromTimes,
  setGroupState,
  assignSectionGroup,
  deleteGroup,
  resolveGroup,
  sectionIsActive,
  sectionIsVisible,
  orderedPins,
  allPins,
  normalizeGuide,
  sortedSections
} from "./guide.js";
import { createTimelineProjection } from "./timeline-projection.js";

const DURATION = 100;
const extentOf = guide =>
  createTimelineProjection({ duration: DURATION, guide }).timelineExtent;

function build() {
  const guide = createGuide("groups");
  const terrain = createGroup(guide, "Terrain");
  const detail = createSectionFromTimes(guide, 20, 60, { weight: 2 }).section;
  const dead = createSectionFromTimes(guide, 70, 90, {
    weight: 0.5,
    groupId: terrain.id
  }).section;
  return { guide, terrain, detail, dead };
}

// --- A Group is created with both states on -----------------------------------
{
  const guide = createGuide("fresh");
  assert.deepEqual(guide.groups.map(group => group.id), [DEFAULT_GROUP_ID]);
  assert.equal(guide.version, 8);
  const group = createGroup(guide, "Terrain");
  assert.deepEqual(
    { visible: group.visible, active: group.active },
    { visible: true, active: true },
    "A new Group starts fully present, so creating one changes nothing."
  );
}

// --- Groups partition the Sections ---------------------------------------------
// Every Section belongs to exactly one, so a Section can never be half-hidden.
{
  const { guide, terrain, detail, dead } = build();
  assert.equal(detail.groupId, DEFAULT_GROUP_ID,
    "A Section joins the default Group unless one is named.");
  assert.equal(dead.groupId, terrain.id);
  assert.ok(guide.sections.every(section => resolveGroup(guide, section.groupId)),
    "Every Section resolves to exactly one Group.");

  assert.equal(assignSectionGroup(guide, detail.id, terrain.id), true);
  assert.equal(
    guide.sections.filter(section => section.groupId === terrain.id).length,
    2,
    "Moving a Section between Groups is a reassignment, not a copy."
  );
  assignSectionGroup(guide, detail.id, DEFAULT_GROUP_ID);
}

// --- The four states ------------------------------------------------------------
{
  const { guide, terrain } = build();
  const undeformed = DURATION;
  // 20–60 at 2x adds 40; 70–90 at 0.5x removes 10.
  const bothActive = extentOf(guide);
  assert.equal(bothActive, undeformed + 40 - 10);

  // visible + active — authoring: Pins and deformation.
  assert.equal(orderedPins(guide).length, 4);

  // hidden + active — the baked map: terrain without landmarks.
  setGroupState(guide, terrain.id, { visible: false });
  assert.equal(extentOf(guide), bothActive,
    "Hiding a Group must not change the deformation it contributes.");
  assert.equal(orderedPins(guide).length, 2,
    "Its endpoint Pins leave the map and traversal with it.");

  // visible + inactive — topology without terrain.
  setGroupState(guide, terrain.id, { visible: true, active: false });
  assert.equal(extentOf(guide), undeformed + 40,
    "An inactive Group stops contributing to the density product.");
  assert.equal(orderedPins(guide).length, 4,
    "while its Pins remain on the map.");

  // hidden + inactive — dormant, and still retained.
  setGroupState(guide, terrain.id, { visible: false });
  assert.equal(extentOf(guide), undeformed + 40);
  assert.equal(orderedPins(guide).length, 2);
  assert.equal(allPins(guide).length, 4,
    "Nothing is destroyed: every Pin is still retained and editable.");
  assert.equal(sortedSections(guide).length, 2,
    "and every Section is still retained.");

  // Toggling is exact in both directions, because nothing was ever frozen.
  setGroupState(guide, terrain.id, { visible: true, active: true });
  assert.equal(extentOf(guide), bothActive);
  assert.equal(orderedPins(guide).length, 4);
}

// --- Editing a Weight inside an active Group updates the map at once ------------
// This is what freezing a map could not offer: there is nothing to invalidate.
{
  const { guide, dead } = build();
  const before = extentOf(guide);
  dead.weight = 0.125;
  assert.notEqual(extentOf(guide), before,
    "A live Group has no stale state to reconcile.");
}

// --- A standalone Pin is never hidden -------------------------------------------
// This is what makes the workflow work: compress dead terrain in a hidden Group,
// drop a Pin on the one thing inside it worth reaching, and the Pin stays
// reachable while the terrain around it stays compressed.
{
  const { guide, terrain } = build();
  const landmark = { id: "pin-standalone", t: 80, label: "Worth reaching", createdAt: 1 };
  guide.pins.push(landmark);
  setGroupState(guide, terrain.id, { visible: false, active: true });

  const visible = orderedPins(guide).map(pin => pin.id);
  assert.ok(visible.includes("pin-standalone"),
    "A Pin belonging to no Section is never hidden by a Group.");
  assert.equal(visible.length, 3,
    "while the hidden Group's endpoint Pins stay off the map.");
  assert.equal(extentOf(guide), DURATION + 40 - 10,
    "and the terrain it sits in is still compressed.");
}

// --- A Pin shared across Groups follows the visible one -------------------------
{
  const guide = createGuide("shared");
  const other = createGroup(guide, "Other");
  const first = createSectionFromTimes(guide, 10, 50, { weight: 2 }).section;
  // A second Section reusing the same end Pin, in a different Group.
  createSectionFromTimes(guide, 50, 90, { weight: 2, groupId: other.id });
  setGroupState(guide, DEFAULT_GROUP_ID, { visible: false });
  const visible = orderedPins(guide).map(pin => pin.t);
  assert.ok(visible.includes(50),
    "A Pin stays on the map while any Section referencing it is visible.");
  assert.ok(!visible.includes(10),
    "and leaves it when every referencing Section is hidden.");
  assert.equal(sectionIsVisible(guide, first), false);
  assert.equal(sectionIsActive(guide, first), true);
}

// --- Deleting a Group returns its Sections rather than destroying them -----------
{
  const { guide, terrain } = build();
  const before = sortedSections(guide).length;
  assert.equal(deleteGroup(guide, DEFAULT_GROUP_ID), false,
    "The default Group is where Sections come home to, so it cannot be deleted.");
  assert.equal(deleteGroup(guide, terrain.id), true);
  assert.equal(sortedSections(guide).length, before,
    "A Group is an organizing choice, not an owner.");
  assert.ok(guide.sections.every(section => section.groupId === DEFAULT_GROUP_ID));
  assert.equal(extentOf(guide), DURATION + 40 - 10,
    "and the deformation its Sections carry is unchanged.");
}

// --- Guides written before Groups migrate into one ------------------------------
{
  const migrated = normalizeGuide({
    version: 7,
    pins: [
      { id: "pin-a", t: 10, createdAt: 1 },
      { id: "pin-b", t: 40, createdAt: 2 }
    ],
    sections: [{ id: "sec-1", startPinId: "pin-a", endPinId: "pin-b", weight: 2, createdAt: 1 }]
  }, "legacy");
  assert.equal(migrated.version, 8);
  assert.deepEqual(migrated.groups.map(group => group.id), [DEFAULT_GROUP_ID]);
  assert.ok(migrated.sections.every(section => section.groupId === DEFAULT_GROUP_ID));
  assert.equal(extentOf(migrated), DURATION + 30,
    "A migrated guide deforms exactly as it did before Groups existed.");

  // And Group states survive a round trip.
  const round = normalizeGuide(JSON.parse(JSON.stringify(migrated)), "legacy");
  assert.equal(round.groups.length, 1);
  const withGroups = createGuide("rt");
  const extra = createGroup(withGroups, "Terrain");
  setGroupState(withGroups, extra.id, { visible: false, active: false });
  const restored = normalizeGuide(JSON.parse(JSON.stringify(withGroups)), "rt");
  const restoredExtra = restored.groups.find(group => group.label === "Terrain");
  assert.ok(restoredExtra, "A named Group survives persistence.");
  assert.deepEqual(
    { visible: restoredExtra.visible, active: restoredExtra.active },
    { visible: false, active: false },
    "and so do both of its states."
  );
}

// --- The two states drive two different renderings ------------------------------
// A gradient shows deformation, so it follows active. A bar is a mark, so it
// follows visible. Same object, different attribute, different consequence.
{
  const { guide, terrain } = build();
  const drawnBars = () => sortedSections(guide).filter(section => sectionIsVisible(guide, section));
  const gradientSources = () => sortedSections(guide).filter(section => sectionIsActive(guide, section));

  setGroupState(guide, terrain.id, { visible: false, active: true });
  assert.equal(drawnBars().some(section => section.groupId === terrain.id), false,
    "A hidden Group draws no Section bar.");
  assert.equal(gradientSources().some(section => section.groupId === terrain.id), true,
    "while still contributing the deformation its gradient shows.");

  setGroupState(guide, terrain.id, { visible: true, active: false });
  assert.equal(drawnBars().some(section => section.groupId === terrain.id), true,
    "An inactive Group still draws its Section bar.");
  assert.equal(gradientSources().some(section => section.groupId === terrain.id), false,
    "while contributing no deformation, so no gradient.");
}

console.log("Group tests passed: four states over one partition, deformation following active, endpoint Pins following visible, standalone Pins never hidden, live Weight edits with nothing to invalidate, non-destructive deletion, and migration of guides written before Groups.");
