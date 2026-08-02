// Groups partition retained Sections while carrying two independent relations.
//
//   visible  — exactly one Group supplies Sections and endpoint Pins to Timeline
//   active   — any number of Groups may contribute multiplicative Weight
//
// Guide access remains complete regardless of visibility. These tests hold the
// singular Timeline owner, independent deformation stack, Pin visibility law,
// hidden-object navigation, and persistence repair.
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
  resolveSection,
  sectionIsActive,
  sectionIsVisible,
  groupIsVisible,
  orderedPins,
  allPins,
  partitionGuidePins,
  normalizeGuide,
  sanitizeGuide,
  validateGuide,
  sortedSections
} from "./guide.js";
import { createTimelineProjection } from "./timeline-projection.js";
import {
  createSession,
  createGuideGroup,
  setGuideGroupState,
  deleteGuideGroup,
  goToGuidePin,
  workFromExtent,
  saveExtentAsSection,
  deformSection,
  undo
} from "./session.js";

const DURATION = 100;
const extentOf = guide =>
  createTimelineProjection({ duration: DURATION, guide }).timelineExtent;

function build() {
  const guide = createGuide("groups");
  const terrain = createGroup(guide, "Terrain");
  const detail = createSectionFromTimes(guide, 20, 60, {
    weight: 2,
    groupId: DEFAULT_GROUP_ID
  }).section;
  const dead = createSectionFromTimes(guide, 70, 90, {
    weight: 0.5,
    groupId: terrain.id
  }).section;
  return { guide, terrain, detail, dead };
}

// --- One visible Group, any number active -------------------------------------
{
  const guide = createGuide("fresh");
  assert.deepEqual(guide.groups.map(group => group.id), [DEFAULT_GROUP_ID]);
  assert.equal(guide.version, 9);
  const group = createGroup(guide, "Terrain");
  assert.deepEqual(
    guide.groups.map(entry => ({
      id: entry.id,
      visible: groupIsVisible(guide, entry),
      active: entry.active
    })),
    [
      { id: group.id, visible: true, active: true },
      { id: DEFAULT_GROUP_ID, visible: false, active: true }
    ],
    "Creating a Group makes it the sole visible working layer without deactivating the layer below."
  );
  assert.equal(validateGuide(guide, DURATION), true);

  const authored = createSectionFromTimes(guide, 10, 20, {
    label: "Authored here",
    weight: 2
  }).section;
  assert.equal(authored.groupId, group.id,
    "A new Section belongs to the visible working Group unless another Group is named explicitly.");
}

// --- Identical Sections may stack across Groups, never accidentally within one --
{
  const guide = createGuide("stacked-identities");
  const terrain = createGroup(guide, "Terrain");
  const first = createSectionFromTimes(guide, 10, 30, {
    label: "Same",
    weight: 0.5
  });
  assert.equal(first.created, true);
  const detail = createGroup(guide, "Detail");
  const second = createSectionFromTimes(guide, 10, 30, {
    label: "Same",
    weight: 0.5
  });
  assert.equal(second.created, true,
    "The same retained relation in another Group is a separate deformation layer.");
  assert.notEqual(first.section.id, second.section.id);
  assert.notEqual(first.section.groupId, second.section.groupId);
  assert.equal(createTimelineProjection({ duration: 40, guide }).weightAtSource(20), 0.25,
    "Active identical layers multiply rather than one replacing the other.");

  const duplicate = createSectionFromTimes(guide, 10, 30, {
    label: "Same",
    weight: 0.5
  });
  assert.equal(duplicate.created, false,
    "Repeating the same Section inside one Group resolves to its existing identity.");

  const moved = assignSectionGroup(guide, first.section.id, detail.id);
  assert.equal(moved.changed, false);
  assert.equal(moved.reason, "duplicate-section",
    "Moving a Section cannot create an accidental duplicate inside the destination Group.");
  assert.equal(terrain.active, true);
}

// --- Group deletion cannot collapse layered identities -------------------------
{
  const guide = createGuide("delete-conflict");
  createSectionFromTimes(guide, 10, 30, {
    label: "Same",
    groupId: DEFAULT_GROUP_ID
  });
  const layer = createGroup(guide, "Layer");
  createSectionFromTimes(guide, 10, 30, {
    label: "Same",
    groupId: layer.id
  });
  assert.equal(deleteGroup(guide, layer.id), false,
    "Removing a Group cannot silently merge a distinct layered Section into Map.");
  const blocked = deleteGuideGroup(
    createSession({ duration: DURATION, guide }),
    layer.id
  );
  assert.equal(blocked.changed, false);
  assert.equal(blocked.reason, "duplicate-section");
  assert.equal(guide.groups.some(group => group.id === layer.id), true);
  assert.equal(guide.sections.length, 2,
    "The rejected removal preserves both layers and creates no destructive compromise.");
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

  assert.equal(assignSectionGroup(guide, detail.id, terrain.id).changed, true);
  assert.equal(
    guide.sections.filter(section => section.groupId === terrain.id).length,
    2,
    "Moving a Section between Groups is a reassignment, not a copy."
  );
  assignSectionGroup(guide, detail.id, DEFAULT_GROUP_ID);
}

// --- Visibility and activity have different consequences -----------------------
{
  const { guide, terrain } = build();
  const undeformed = DURATION;
  // 20–60 at 2x adds 40; 70–90 at 0.5x removes 10.
  const bothActive = extentOf(guide);
  assert.equal(bothActive, undeformed + 40 - 10);

  assert.deepEqual(orderedPins(guide).map(pin => pin.t), [70, 90],
    "Only the visible Terrain layer supplies Timeline endpoint Pins.");

  setGroupState(guide, terrain.id, { visible: false });
  assert.equal(extentOf(guide), bothActive,
    "Changing the visible layer must not change the deformation stack.");
  assert.deepEqual(orderedPins(guide).map(pin => pin.t), [20, 60],
    "The fallback visible layer replaces Timeline topology atomically.");

  setGroupState(guide, terrain.id, { visible: true, active: false });
  assert.equal(extentOf(guide), undeformed + 40,
    "An inactive Group stops contributing to the density product.");
  assert.deepEqual(orderedPins(guide).map(pin => pin.t), [70, 90],
    "while remaining the sole visible Timeline layer.");

  setGroupState(guide, terrain.id, { visible: false });
  assert.equal(extentOf(guide), undeformed + 40);
  assert.deepEqual(orderedPins(guide).map(pin => pin.t), [20, 60]);
  assert.equal(allPins(guide).length, 4,
    "Nothing is destroyed: every Pin remains retained and editable in Guide.");
  assert.equal(sortedSections(guide).length, 2,
    "and every Section remains retained.");

  setGroupState(guide, terrain.id, { visible: true, active: true });
  assert.equal(extentOf(guide), bothActive);
  assert.deepEqual(orderedPins(guide).map(pin => pin.t), [70, 90]);
}


// --- Session entry points preserve the same singular visibility law -------------
{
  let session = createSession({ duration: DURATION, guide: createGuide("session") });
  const added = createGuideGroup(session, "Detail");
  assert.equal(added.changed, true);
  session = added.session;
  const detail = session.model.guide.groups[0];
  assert.equal(detail.label, "Detail");
  assert.equal(
    session.model.guide.groups.filter(group => groupIsVisible(session.model.guide, group)).length,
    1
  );

  const shown = setGuideGroupState(session, DEFAULT_GROUP_ID, { visible: true });
  assert.equal(shown.changed, true);
  session = shown.session;
  assert.equal(session.model.guide.groups[0].id, DEFAULT_GROUP_ID);
  assert.equal(session.model.guide.groups.find(group => group.id === detail.id).active, true,
    "Showing another layer does not deactivate hidden terrain.");

  const sole = createSession({ duration: DURATION, guide: createGuide("sole") });
  const blocked = setGuideGroupState(sole, DEFAULT_GROUP_ID, { visible: false });
  assert.equal(blocked.changed, false);
  assert.equal(blocked.session.history.length, 0,
    "An impossible ownerless Timeline creates no phantom history transaction.");

  const restored = undo(session);
  assert.equal(restored.changed, true);
  assert.equal(restored.session.model.guide.groups[0].id, detail.id,
    "Undo restores the same visible owner, not only equivalent booleans.");
}

// --- Session authoring always targets the visible working layer -----------------
{
  const guide = createGuide("session-layer-authoring");
  const terrain = createGroup(guide, "Terrain");
  createSectionFromTimes(guide, 10, 30, {
    label: "Same",
    groupId: terrain.id,
    weight: 0.5
  });
  const detail = createGroup(guide, "Detail");
  let session = createSession({ duration: DURATION, current: 20, guide });

  const selected = workFromExtent(session, { start: 10, end: 30 });
  assert.equal(selected.changed, true);
  session = selected.session;
  const deformed = deformSection(session, null, 2);
  assert.equal(deformed.changed, true);
  assert.equal(deformed.section.groupId, detail.id,
    "Implicit Deform creates or edits only the visible layer, never an identical hidden layer.");
  const hidden = deformed.session.model.guide.sections.find(section =>
    section.groupId === terrain.id
  );
  assert.equal(hidden.weight, 0.5);
  assert.equal(
    createTimelineProjection({ duration: DURATION, guide: deformed.session.model.guide })
      .weightAtSource(20),
    1,
    "The new visible 2× detail multiplies with the hidden 0.5× terrain."
  );

  const saved = saveExtentAsSection(
    createSession({ duration: DURATION, guide }),
    { start: 40, end: 50 },
    "Visible save"
  );
  assert.equal(saved.changed, true);
  assert.equal(saved.value.section.groupId, detail.id,
    "Every Session save route uses the same visible Group default as the Guide kernel."
  );
}

// --- Hidden topology remains reachable through Guide but not Timeline traversal --
{
  const guide = createGuide("hidden-navigation");
  const background = createGroup(guide, "Background");
  const hidden = createSectionFromTimes(guide, 10, 20, {
    groupId: background.id,
    weight: 0.125
  }).section;
  const visible = createGroup(guide, "Detail");
  createSectionFromTimes(guide, 40, 60, { groupId: visible.id, weight: 2 });
  const hiddenStart = resolveSection(guide, hidden.id).startPin;

  assert.equal(orderedPins(guide).some(pin => pin.id === hiddenStart.id), false,
    "A hidden endpoint is not a Timeline/Shift-Step stop.");
  const moved = goToGuidePin(
    createSession({ duration: DURATION, current: 50, guide }),
    hiddenStart.id
  );
  assert.equal(moved.changed, true);
  assert.equal(moved.session.model.resolution.C, 10,
    "Guide navigation reaches the canonical hidden Pin Address.");
  assert.equal(sectionIsVisible(moved.session.model.guide, hidden), false,
    "Navigating to it neither reveals nor spatially selects its hidden Section.");
}

// --- Hidden active broad terrain composes beneath the visible detail layer -------
{
  const guide = createGuide("layered-topography");
  const terrain = createGroup(guide, "Terrain");
  createSectionFromTimes(guide, 0, 15, { groupId: terrain.id, weight: 0.125 });
  createSectionFromTimes(guide, 15, 45, { groupId: terrain.id, weight: 4 });
  createSectionFromTimes(guide, 45, 60, { groupId: terrain.id, weight: 0.125 });
  const detail = createGroup(guide, "Detail");
  createSectionFromTimes(guide, 20, 30, { groupId: detail.id, weight: 2 });

  const projection = createTimelineProjection({ duration: 60, guide });
  assert.equal(projection.weightAtSource(10), 0.125);
  assert.equal(projection.weightAtSource(17), 4);
  assert.equal(projection.weightAtSource(25), 8,
    "Visible detail multiplies against hidden active terrain rather than replacing it.");
  const target = projection.stepTarget(14, 2.5, "forward", { start: 0, end: 60 });
  assert.ok(target > 15 && target < 16,
    "A fixed Timeline Step clears compressed terrain then becomes precise upon entering 4× terrain.");
}

// --- Visible and hidden Pins form a complete disjoint Guide partition ------------
{
  const { guide, terrain } = build();
  setGroupState(guide, terrain.id, { visible: false });
  const partition = partitionGuidePins(guide);
  assert.equal(partition.visible.length, 2);
  assert.equal(partition.hidden.length, 2);
  assert.equal(new Set([...partition.visible, ...partition.hidden].map(pin => pin.id)).size, 4);
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
  const first = createSectionFromTimes(guide, 10, 50, {
    weight: 2,
    groupId: DEFAULT_GROUP_ID
  }).section;
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
  assert.equal(migrated.version, 9);
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
    { visible: groupIsVisible(restored, restoredExtra), active: restoredExtra.active },
    { visible: false, active: false },
    "and so do both of its states."
  );
}


// --- v8 saves migrate deterministically to one named visible Group ------------
// v8 wrote a visible flag on every Group, so a save could record several
// visible Groups or none. v9 names one on the Guide, which cannot express
// either fault -- so migration is where the ambiguity is resolved, once, in
// favour of the first Group the older save marked visible.
{
  const legacyTwoVisible = {
    version: 8,
    videoId: "repair",
    pins: [],
    sections: [],
    groups: [
      { id: DEFAULT_GROUP_ID, label: "Map", visible: true, active: true, createdAt: 1, updatedAt: 1 },
      { id: "group-second", label: "Second", visible: true, active: false, createdAt: 2, updatedAt: 2 }
    ]
  };
  const migrated = normalizeGuide(JSON.parse(JSON.stringify(legacyTwoVisible)), "repair");
  assert.equal(migrated.version, 9);
  assert.equal(
    migrated.groups.filter(group => groupIsVisible(migrated, group)).length,
    1,
    "Two visible Groups in a v8 save resolve to exactly one."
  );
  assert.equal(migrated.visibleGroupId, DEFAULT_GROUP_ID,
    "and it is the first one the save marked visible.");
  assert.equal(migrated.groups[0].id, migrated.visibleGroupId,
    "which is rendered first.");
  assert.equal(
    migrated.groups.find(group => group.id === "group-second").active,
    false,
    "Activity crosses the migration untouched."
  );
  assert.equal(
    migrated.groups.find(group => group.id === "group-second").label,
    "Second",
    "and so do labels and identities."
  );
  assert.equal(validateGuide(migrated, DURATION), true);

  // None visible is the other v8 fault, and resolves to Map.
  const legacyNoneVisible = JSON.parse(JSON.stringify(legacyTwoVisible));
  legacyNoneVisible.groups.forEach(group => { group.visible = false; });
  const repaired = normalizeGuide(legacyNoneVisible, "repair");
  assert.equal(repaired.visibleGroupId, DEFAULT_GROUP_ID,
    "A v8 save with no visible Group resolves to Map rather than to nothing.");
  assert.equal(validateGuide(repaired, DURATION), true);

  // A v9 Guide naming a Group that does not exist is repaired the same way.
  const danglingSource = createGuide("dangling");
  createGroup(danglingSource, "Ghost");
  const dangling = JSON.parse(JSON.stringify(danglingSource));
  dangling.visibleGroupId = "group-missing";
  const resolved = normalizeGuide(dangling, "dangling");
  assert.ok(
    resolved.groups.some(group => group.id === resolved.visibleGroupId),
    "A named visible Group always exists."
  );
  assert.equal(validateGuide(resolved, DURATION), true);

  // And the invariant is checkable: a Guide whose named layer is not drawn
  // first states one relation and renders another.
  const disordered = createGuide("disordered");
  createGroup(disordered, "Later");
  disordered.visibleGroupId = DEFAULT_GROUP_ID;
  assert.equal(validateGuide(disordered, DURATION), false,
    "A Guide that names one visible Group and renders another cannot pass.");
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

console.log("Group tests passed: one visible Timeline layer, independent active deformation stack, hidden Guide navigation, endpoint visibility, multiplicative layering, non-destructive deletion, and deterministic persistence repair.");
