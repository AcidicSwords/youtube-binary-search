// One nullable visible-Group identity.
//
// Zero or one Group supplies Sections and endpoint Pins to Timeline while any
// number stay active. A nullable identity expresses those two valid states and
// makes two simultaneously drawn Groups unrepresentable. These tests protect
// that ownership, independent activity, membership, and source-time integrity.
import assert from "node:assert/strict";
import {
  DEFAULT_GROUP_ID,
  createGuide,
  createGroup,
  ensurePin,
  getPin,
  createSection,
  createSectionFromTimes,
  setGroupState,
  deleteGroup,
  assignSectionGroup,
  groupIsShown,
  shownGroup,
  sectionIsVisible,
  sectionWeightIsUsed,
  orderedPins,
  partitionGuidePins,
  sortedSections,
  normalizeGuide,
  sanitizeGuide,
  validateGuide,
  PIN_KIND
} from "./guide.js";
import { createTimelineProjection } from "./timeline-projection.js";

const DURATION = 100;
const extentOf = guide =>
  createTimelineProjection({ duration: DURATION, guide }).timelineExtent;
const everyPin = guide => {
  const { visible, hidden } = partitionGuidePins(guide);
  return [...visible, ...hidden];
};

// Two layers over one source: Map holds 0:20–0:60, Terrain holds 0:70–0:90 at
// 2x, and one standalone Pin sits at 0:05 belonging to no Section at all.
function build() {
  const guide = createGuide("group-coherence");
  const standalone = ensurePin(guide, 5, { kind: PIN_KIND.FREE }).pin;

  const mapSection = createSectionFromTimes(guide, 20, 60, {
    groupId: DEFAULT_GROUP_ID
  }).section;
  const terrain = createGroup(guide, "Terrain");
  const terrainSection = createSectionFromTimes(guide, 70, 90, {
    groupId: terrain.id,
    weighting: 2
  }).section;

  return {
    guide,
    terrain,
    standalone,
    mapSection,
    terrainSection,
    mapStart: getPin(guide, mapSection.startPinId),
    mapEnd: getPin(guide, mapSection.endPinId),
    terrainStart: getPin(guide, terrainSection.startPinId),
    terrainEnd: getPin(guide, terrainSection.endPinId)
  };
}

const visibleIds = guide => guide.groups
  .filter(group => groupIsShown(guide, group))
  .map(group => group.id);

// --- 1. At most one visible Group ---------------------------------------------
{
  const { guide, terrain } = build();
  assert.deepEqual(visibleIds(guide), [terrain.id],
    "The Group most recently created is the layer being worked on.");

  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  assert.deepEqual(visibleIds(guide), [DEFAULT_GROUP_ID],
    "Showing one layer hides the other in the same transition.");

  // The representation itself cannot say otherwise: there is one field, and it
  // holds one id.
  assert.equal(typeof guide.shownGroupId, "string");
  assert.equal(
    guide.groups.some(group => "visible" in group),
    false,
    "No Group carries a visibility of its own to disagree with the Guide."
  );
  assert.equal(shownGroup(guide).id, guide.shownGroupId);
}

// --- 2. Deterministic default visible Group -----------------------------------
{
  const fresh = createGuide("fresh");
  assert.equal(fresh.shownGroupId, DEFAULT_GROUP_ID,
    "A Guide with one Group draws it.");
  assert.equal(shownGroup(fresh).id, DEFAULT_GROUP_ID);

  // At most one, not exactly one. Hiding the only layer draws nothing, which is
  // how you look at the map undeformed and unmarked -- a state that was
  // unreachable while the law demanded a drawn Group at all times, and the one
  // Group state a single-Group Guide could not express.
  setGroupState(fresh, DEFAULT_GROUP_ID, { visible: false });
  assert.deepEqual(visibleIds(fresh), [],
    "The only Group can be hidden, and then nothing is drawn.");
  assert.equal(fresh.shownGroupId, null);
  assert.equal(shownGroup(fresh), null);

  setGroupState(fresh, DEFAULT_GROUP_ID, { visible: true });
  assert.deepEqual(visibleIds(fresh), [DEFAULT_GROUP_ID],
    "and naming it again draws it, with no other Group needed to trade places.");
}

// --- 3. Switching the visible Group does not alter activity -------------------
{
  const { guide, terrain } = build();
  setGroupState(guide, terrain.id, { weightsEnabled: false });
  setGroupState(guide, DEFAULT_GROUP_ID, { weightsEnabled: true });
  const activityBefore = Object.fromEntries(
    guide.groups.map(group => [group.id, group.weightsEnabled])
  );

  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  assert.deepEqual(
    Object.fromEntries(guide.groups.map(group => [group.id, group.weightsEnabled])),
    activityBefore,
    "Changing which layer is drawn changes no layer's activity."
  );
  assert.deepEqual(visibleIds(guide), [DEFAULT_GROUP_ID]);

  setGroupState(guide, terrain.id, { visible: true });
  assert.deepEqual(
    Object.fromEntries(guide.groups.map(group => [group.id, group.weightsEnabled])),
    activityBefore,
    "and switching back changes none either."
  );
}

// --- 4. Hidden active Groups still deform the projection ----------------------
{
  const { guide, terrain } = build();
  // Terrain is visible and weightsEnabled: its 20 s Section at 2x adds 20 s of map.
  const bothDrawn = extentOf(guide);
  assert.equal(bothDrawn, DURATION + 20);

  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  assert.equal(extentOf(guide), bothDrawn,
    "Hiding a Group changes what is drawn, never what the projection computes.");
  assert.equal(sectionIsVisible(guide, guide.sections.find(s => s.groupId === terrain.id)), false,
    "The hidden layer supplies no Section bar,");
  assert.equal(sectionWeightIsUsed(guide, guide.sections.find(s => s.groupId === terrain.id)), true,
    "while remaining part of the density product. That is a baked layer.");

  setGroupState(guide, terrain.id, { weightsEnabled: false });
  assert.equal(extentOf(guide), DURATION,
    "Deactivating it is the separate decision that flattens the map.");
}

// --- 5. The visible Group is rendered first -----------------------------------
{
  const { guide, terrain } = build();
  assert.equal(guide.groups[0].id, terrain.id,
    "The Guide's order states the relation it renders.");
  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  assert.equal(guide.groups[0].id, DEFAULT_GROUP_ID);
  assert.equal(guide.groups[0].id, guide.shownGroupId,
    "so order and identity can never disagree.");
}

// --- 6. Explicit standalone Pins remain Timeline-visible ----------------------
{
  const { guide, standalone } = build();
  const drawn = () => orderedPins(guide).map(pin => pin.t);
  assert.ok(drawn().includes(standalone.t),
    "A Pin belonging to no Section is not a layer's to hide.");
  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  assert.ok(drawn().includes(standalone.t),
    "and switching layers does not take it away.");
}

// --- 7. Hidden-only endpoint Pins are excluded from the Timeline --------------
{
  const { guide, standalone, mapStart, mapEnd, terrainStart, terrainEnd } = build();
  // Terrain is visible: its endpoints are drawn, Map's are not.
  assert.deepEqual(
    orderedPins(guide).map(pin => pin.t).sort((a, b) => a - b),
    [standalone.t, terrainStart.t, terrainEnd.t],
    "Only the visible layer's endpoint Pins reach the Timeline."
  );

  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  assert.deepEqual(
    orderedPins(guide).map(pin => pin.t).sort((a, b) => a - b),
    [standalone.t, mapStart.t, mapEnd.t],
    "and the other layer's endpoints leave it."
  );

  assert.equal(everyPin(guide).length, 5,
    "Nothing was destroyed: every Pin is still retained.");
}

// --- 8. Shared endpoint Pins stay visible while any visible Section holds them -
{
  const { guide, terrain, mapEnd } = build();
  // Give Terrain a Section that shares Map's end Pin.
  const later = ensurePin(guide, 95, { kind: PIN_KIND.ENDPOINT }).pin;
  createSection(guide, mapEnd.id, later.id, { groupId: terrain.id });

  assert.ok(orderedPins(guide).some(pin => pin.id === mapEnd.id),
    "A shared Pin is drawn because a visible Section references it.");

  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  assert.ok(orderedPins(guide).some(pin => pin.id === mapEnd.id),
    "and it stays drawn under the other layer, which also references it.");

  // A Pin referenced only by hidden Sections is the case that must disappear.
  assert.equal(orderedPins(guide).some(pin => pin.id === later.id), false,
    "while a Pin only a hidden Section references does not.");
  assert.ok(everyPin(guide).some(pin => pin.id === later.id),
    "It remains retained and reachable in the Guide.");
}

// --- 9. The Guide separates visible and hidden Pins ---------------------------
{
  const { guide, standalone, terrainStart, terrainEnd, mapStart, mapEnd } = build();
  const partition = partitionGuidePins(guide);
  assert.deepEqual(
    partition.visible.map(pin => pin.t).sort((a, b) => a - b),
    [standalone.t, terrainStart.t, terrainEnd.t]
  );
  assert.deepEqual(
    partition.hidden.map(pin => pin.t).sort((a, b) => a - b),
    [mapStart.t, mapEnd.t]
  );
  assert.equal(
    partition.visible.length + partition.hidden.length,
    everyPin(guide).length,
    "The two sets partition the Pins: none is lost and none is counted twice."
  );
}

// --- 10. Deleting the visible Group promotes a deterministic fallback ---------
{
  const { guide, terrain, mapSection } = build();
  assert.equal(guide.shownGroupId, terrain.id);
  const sectionsBefore = sortedSections(guide).length;

  assert.equal(deleteGroup(guide, terrain.id).allowed, true);
  assert.equal(guide.shownGroupId, DEFAULT_GROUP_ID,
    "Removing the drawn layer promotes Map rather than leaving none.");
  assert.deepEqual(visibleIds(guide), [DEFAULT_GROUP_ID]);
  assert.equal(guide.groups[0].id, DEFAULT_GROUP_ID);
  assert.equal(sortedSections(guide).length, sectionsBefore,
    "and destroys no Section: a Group organizes Sections, it does not own them.");
  assert.ok(
    sortedSections(guide).every(section => section.groupId === DEFAULT_GROUP_ID),
    "Its Sections return to Map."
  );
  assert.ok(sortedSections(guide).some(section => section.id === mapSection.id));
  assert.equal(validateGuide(guide, DURATION), true);
}

// Deleting a Group that is not the drawn one leaves the drawn one alone.
{
  const { guide, terrain } = build();
  const spare = createGroup(guide, "Spare");
  setGroupState(guide, terrain.id, { visible: true });
  assert.equal(guide.shownGroupId, terrain.id);
  assert.equal(deleteGroup(guide, spare.id).allowed, true);
  assert.equal(guide.shownGroupId, terrain.id,
    "Removing an undrawn layer does not move the Timeline to another one.");
}

// --- 11. Reassigning a Section moves it between layers, not between states ----
{
  const { guide, terrain, mapSection } = build();
  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  assert.equal(sectionIsVisible(guide, mapSection), true);

  assignSectionGroup(guide, mapSection.id, terrain.id);
  assert.equal(sectionIsVisible(guide, mapSection), false,
    "A Section follows the layer it belongs to.");
  assert.equal(guide.shownGroupId, DEFAULT_GROUP_ID,
    "and moving it does not change which layer is drawn.");
}

// --- 12. v8 to v9 migration preserves identity, activity, topology, membership -
{
  const legacy = {
    version: 8,
    videoId: "legacy",
    updatedAt: 10,
    groups: [
      { id: DEFAULT_GROUP_ID, label: "Map", visible: false, active: true, createdAt: 1, updatedAt: 1 },
      { id: "group-terrain", label: "Terrain", visible: true, active: false, createdAt: 2, updatedAt: 2 },
      { id: "group-spare", label: "Spare", visible: false, active: true, createdAt: 3, updatedAt: 3 }
    ],
    pins: [
      { id: "pin-a", t: 20, label: "A", kind: PIN_KIND.ENDPOINT, createdAt: 4, updatedAt: 4 },
      { id: "pin-b", t: 60, label: "B", kind: PIN_KIND.ENDPOINT, createdAt: 5, updatedAt: 5 },
      { id: "pin-free", t: 5, label: "Landmark", kind: PIN_KIND.FREE, createdAt: 6, updatedAt: 6 }
    ],
    sections: [
      {
        id: "sec-1",
        startPinId: "pin-a",
        endPinId: "pin-b",
        label: "Argument",
        weighting: 2,
        groupId: "group-terrain",
        createdAt: 7,
        updatedAt: 7
      }
    ]
  };

  const migrated = normalizeGuide(JSON.parse(JSON.stringify(legacy)), "legacy");

  assert.equal(migrated.version, 10, "The schema is v10.");
  assert.equal(migrated.shownGroupId, "group-terrain",
    "The Group v8 marked visible is the Group v9 names.");
  assert.equal(migrated.groups[0].id, "group-terrain",
    "and it is rendered first.");
  assert.equal(
    migrated.groups.filter(group => groupIsShown(migrated, group)).length,
    1
  );

  assert.deepEqual(
    migrated.groups.map(group => group.id).sort(),
    [DEFAULT_GROUP_ID, "group-spare", "group-terrain"],
    "Every Group identity survives."
  );
  assert.deepEqual(
    Object.fromEntries(migrated.groups.map(group => [group.id, group.weightsEnabled])),
    { [DEFAULT_GROUP_ID]: true, "group-terrain": false, "group-spare": true },
    "Activity is carried across exactly, and is independent of visibility."
  );
  assert.deepEqual(
    Object.fromEntries(migrated.groups.map(group => [group.id, group.label])),
    { [DEFAULT_GROUP_ID]: "Map", "group-terrain": "Terrain", "group-spare": "Spare" },
    "and so are labels."
  );

  assert.deepEqual(migrated.pins.map(pin => pin.id).sort(), ["pin-a", "pin-b", "pin-free"],
    "Every Pin identity survives.");
  assert.deepEqual(migrated.pins.map(pin => pin.t).sort((a, b) => a - b), [5, 20, 60],
    "at its exact source Address.");

  const section = migrated.sections.find(entry => entry.id === "sec-1");
  assert.ok(section, "The Section identity survives.");
  assert.equal(section.groupId, "group-terrain", "with its Group membership,");
  assert.equal(section.weighting, 2, "its Weight,");
  assert.equal(section.label, "Argument", "and its title.");
  assert.equal(section.startPinId, "pin-a", "Its endpoints are the same Pins.");
  assert.equal(section.endPinId, "pin-b");

  assert.equal(validateGuide(migrated, DURATION), true);
  assert.equal(
    validateGuide(sanitizeGuide(migrated, "legacy", DURATION), DURATION),
    true,
    "and the migrated Guide survives sanitisation unchanged in kind."
  );

  // Migration is idempotent: reading a v9 Guide again changes nothing.
  const again = normalizeGuide(JSON.parse(JSON.stringify(migrated)), "legacy");
  assert.equal(again.shownGroupId, migrated.shownGroupId);
  assert.deepEqual(
    again.groups.map(group => [group.id, group.weightsEnabled, group.label]),
    migrated.groups.map(group => [group.id, group.weightsEnabled, group.label])
  );
  assert.deepEqual(
    again.sections.map(entry => [entry.id, entry.groupId, entry.weighting]),
    migrated.sections.map(entry => [entry.id, entry.groupId, entry.weighting])
  );
}

// --- 12b. v9 to v10: the drawn Group is read from the old visibleGroupId key -- // lexicon-allow: v9 Guide back-compat
// v9 named the drawn Group `visibleGroupId` on the Guide; v10 renames it // lexicon-allow: v9 Guide back-compat
// `shownGroupId`. A v9 save must still open on the Group it drew, and an
// explicit "draw nothing" must still survive the round trip.
{
  const v9 = {
    version: 9,
    videoId: "v9",
    updatedAt: 10,
    visibleGroupId: "group-terrain", // lexicon-allow: v9 Guide back-compat
    groups: [
      { id: DEFAULT_GROUP_ID, label: "Map", active: true, createdAt: 1, updatedAt: 1 },
      { id: "group-terrain", label: "Terrain", active: false, createdAt: 2, updatedAt: 2 }
    ],
    pins: [
      { id: "pin-a", t: 20, label: "A", kind: PIN_KIND.ENDPOINT, createdAt: 4, updatedAt: 4 },
      { id: "pin-b", t: 60, label: "B", kind: PIN_KIND.ENDPOINT, createdAt: 5, updatedAt: 5 }
    ],
    sections: [
      { id: "sec-1", startPinId: "pin-a", endPinId: "pin-b", label: "Argument", weight: 2, groupId: "group-terrain", createdAt: 7, updatedAt: 7 }
    ]
  };

  const migrated = normalizeGuide(JSON.parse(JSON.stringify(v9)), "v9");
  assert.equal(migrated.version, 10, "A v9 Guide upgrades to v10.");
  assert.equal(migrated.shownGroupId, "group-terrain",
    "The drawn Group is read from the v9 visibleGroupId key."); // lexicon-allow: v9 Guide back-compat
  assert.equal(migrated.groups[0].id, "group-terrain", "and rendered first.");
  assert.deepEqual(
    Object.fromEntries(migrated.groups.map(group => [group.id, group.weightsEnabled])),
    { [DEFAULT_GROUP_ID]: true, "group-terrain": false },
    "Activity crosses unchanged.");
  assert.equal(migrated.sections.find(entry => entry.id === "sec-1").weighting, 2,
    "and Weight crosses unchanged.");

  // "Draw nothing" is a choice, written as a null id; it survives under either
  // key name.
  const drawnNothing = normalizeGuide(
    JSON.parse(JSON.stringify({ ...v9, visibleGroupId: null })), // lexicon-allow: v9 Guide back-compat
    "v9"
  );
  assert.equal(drawnNothing.shownGroupId, null,
    "A v9 Guide that drew nothing still draws nothing after upgrade.");
}

// --- 13. Temporal Topography is unchanged by where visibility is recorded -------------
// The whole point of moving the fact is that nothing computed from it moves.
{
  const { guide } = build();
  const drawnFirst = extentOf(guide);

  // A second active layer over the same source multiplies with the first.
  const overlay = createGroup(guide, "Overlay");
  createSectionFromTimes(guide, 70, 90, { groupId: overlay.id, weighting: 2 });
  // 20 s of source under two active 2x layers is drawn at 4x: 80 s of map in
  // place of 20 s, so the whole map is 100 - 20 + 80.
  assert.equal(extentOf(guide), DURATION - 20 + 80,
    "Two active layers over one span compose multiplicatively, not additively.");

  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  assert.equal(extentOf(guide), DURATION - 20 + 80,
    "and which of them is drawn does not enter that arithmetic.");

  setGroupState(guide, overlay.id, { weightsEnabled: false });
  assert.equal(extentOf(guide), drawnFirst,
    "Only activity does.");
}

// --- 14. Source time and retained Addresses are untouched ---------------------
{
  const { guide, standalone, mapStart, mapEnd, terrainStart, terrainEnd } = build();
  const addresses = () => everyPin(guide)
    .map(pin => pin.t)
    .sort((a, b) => a - b);
  const before = addresses();

  setGroupState(guide, DEFAULT_GROUP_ID, { visible: true });
  setGroupState(guide, DEFAULT_GROUP_ID, { weightsEnabled: false });
  deleteGroup(guide, guide.groups.find(group => group.label === "Terrain").id);

  assert.deepEqual(addresses(), before,
    "No visibility, activity, or layer removal moves a retained Address."
  );
  assert.deepEqual(before, [standalone.t, mapStart.t, mapEnd.t, terrainStart.t, terrainEnd.t]
    .sort((a, b) => a - b));

  // Source duration is a property of the source, never of the drawing.
  assert.equal(
    createTimelineProjection({ duration: DURATION, guide }).duration,
    DURATION,
    "Source duration is unchanged by anything a layer does."
  );
}

// --- 15. Hidden Guide navigation, and the Shift Step stop set ----------------
// These two are interface-level relations rather than model arithmetic, so they
// are proved through the running application. The Guide reaches a hidden object
// without spatially exposing it; Shift Step reaches only what is drawn.
{
  const { createSmokeEnvironment, descendants } = await import("./smoke-harness.mjs");
  const env = createSmokeEnvironment();
  const { byId, flush, poll, currentText, dispatchDocument } = env;
  await import("./app.js");
  window.onYouTubeIframeAPIReady();
  await flush();
  byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
  byId.get("load-video").click();
  await flush(6);
  await poll();
  byId.get("context-seconds").value = "0";
  byId.get("context-seconds").dispatch("change");
  await flush();

  const inSections = key => descendants(byId.get("sections-list"))
    .filter(node => node.dataset[key] !== undefined);
  const sectionRows = () => descendants(byId.get("sections-list"))
    .filter(node => node.dataset.sectionGo);
  const timelinePins = () => descendants(byId.get("pin-lane"))
    .filter(node => node.dataset.pinGo || node.dataset.clusterIndex);
  const press = async (key, options = {}) => {
    dispatchDocument("keydown", {
      key,
      ...options,
      preventDefault() {},
      target: { tagName: "BODY" }
    });
    await flush();
  };
  const makeSection = async (from, to) => {
    byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: from });
    await flush();
    byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: to });
    await flush();
    byId.get("section-retain-form").dispatch("submit");
    await flush();
  };

  await makeSection(100, 200);
  await makeSection(600, 800);
  byId.get("release").click();
  await flush();

  // Put the first Section on a second layer, then draw Map again, so 0:10-0:20
  // is retained but not drawn while 1:00-1:20 is.
  byId.get("sections-list").dispatch("click", { target: inSections("groupAdd")[0] });
  await flush();
  const layerId = [...new Set(inSections("groupToggle").map(node => node.dataset.groupToggle))]
    .find(id => id !== DEFAULT_GROUP_ID);
  byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
  await flush();
  const groupSelect = inSections("sectionGroup")[0];
  groupSelect.value = layerId;
  byId.get("sections-list").dispatch("change", { target: groupSelect });
  await flush();
  const mapVisible = inSections("groupToggle").find(node =>
    node.dataset.groupToggle === DEFAULT_GROUP_ID
    && node.dataset.groupState === "visible");
  mapVisible.checked = true;
  byId.get("sections-list").dispatch("change", { target: mapVisible });
  await flush();

  assert.equal(timelinePins().length, 2,
    "Only the drawn layer's endpoint Pins are on the Timeline.");

  // Shift Step reaches what is drawn, and nothing that is not.
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 5 });
  await flush();
  const stops = [];
  for (let index = 0; index < 4; index += 1) {
    await press("ArrowRight", { shiftKey: true });
    stops.push(currentText());
  }
  assert.equal(stops.some(stop => stop.includes("0:10") || stop.includes("0:20")), false,
    "A hidden Section's endpoints are not traversal stops.");
  assert.ok(stops.includes("Current 1:00") && stops.includes("Current 1:20"),
    "while the drawn Section's endpoints are.");

  // Guide navigation to the hidden Section moves Current and does nothing else.
  const before = {
    drawnPins: timelinePins().length,
    shownGroup: inSections("groupToggle")
      .filter(node => node.dataset.groupState === "visible")
      .map(node => `${node.dataset.groupToggle}:${node.checked}`)
      .join(","),
    sections: sectionRows().length,
    pins: byId.get("pins-list-count").textContent
  };
  const hiddenRow = sectionRows().find(row =>
    descendants(row).map(node => node.textContent).join(" ").includes("0:10"));
  assert.ok(hiddenRow, "A hidden Section is still listed in the Guide.");
  byId.get("sections-list").dispatch("click", { target: hiddenRow });
  await flush();

  assert.equal(currentText(), "Current 0:15",
    "Navigating a hidden Section moves Current to its canonical source Address.");
  assert.equal(timelinePins().length, before.drawnPins,
    "without revealing it,");
  assert.equal(
    inSections("groupToggle")
      .filter(node => node.dataset.groupState === "visible")
      .map(node => `${node.dataset.groupToggle}:${node.checked}`)
      .join(","),
    before.shownGroup,
    "without switching the visible Group,"
  );
  assert.equal(
    timelinePins().filter(node => node.classList.contains("extent-selected")).length,
    0,
    "without creating a Timeline selection,"
  );
  assert.equal(sectionRows().length, before.sections,
    "and without creating another retained object.");
  assert.equal(byId.get("pins-list-count").textContent, before.pins);
}

console.log("Group coherence tests passed: one nullable visible-Group identity, deterministic default and fallback, independent layer activity, hidden-but-active topography, standalone and shared Pin visibility, complete Guide partition, non-destructive Group removal, and v8 and v9 saves upgrading to v10 with the drawn Group and Weights intact.");
