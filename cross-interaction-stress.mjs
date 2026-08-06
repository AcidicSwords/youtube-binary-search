// Interference between the object families.
//
// Every suite beside this one proves one family in isolation. This one crosses
// them: Groups against Focus, Weight, traversal and the Guide; Chapters against
// topography, Focus and history; the Pin routes against composition and the
// Shift layer; and Undo across all of it. The question each block asks is not
// "does this work" but "does doing this change what that means".
import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, currentText, dispatchDocument } = env;

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await flush(5);
await poll();
byId.get("context-duration").value = "0";
byId.get("context-duration").dispatch("change");
await flush();

// --- helpers ------------------------------------------------------------------
const rowText = row => descendants(row)
  .map(node => node.textContent)
  .filter(Boolean)
  .join(" ");
const sectionRows = () => descendants(byId.get("sections-list"))
  .filter(node => node.dataset.sectionGo);
const pinRows = () => descendants(byId.get("pins-list"))
  .filter(node => node.dataset.pinGo);
const chapterRows = () => descendants(byId.get("chapters-list"))
  .filter(node => node.dataset.chapterGo);
const inSections = key => descendants(byId.get("sections-list"))
  .filter(node => node.dataset[key] !== undefined);
const drawnBars = () => descendants(byId.get("section-lane"))
  .filter(node => node.dataset.sectionGo).length;
const drawnPins = () => descendants(byId.get("pin-lane"))
  .filter(node => node.dataset.pinGo || node.dataset.clusterIndex).length;
const chapterMarks = () => descendants(byId.get("chapter-lane"))
  .filter(node => node.className === "timeline-chapter");
const deformed = () => descendants(byId.get("topography-layer"))
  .some(node => String(node.className).includes("has-"));
const workingWindow = () => byId.get("section-window").textContent;
const undoLabel = () => byId.get("return-action").textContent;
const status = () => byId.get("status").textContent;

const clickIn = async (listId, target, options = {}) => {
  byId.get(listId).dispatch("click", { target, ...options });
  await flush();
};
const changeIn = async (listId, target) => {
  byId.get(listId).dispatch("change", { target });
  await flush();
};
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
const groupToggle = (groupId, state) => inSections("groupToggle")
  .find(node => node.dataset.groupToggle === groupId && node.dataset.groupState === state);
const setGroupState = async (groupId, state, value) => {
  const box = groupToggle(groupId, state);
  assert.ok(box, `Group ${groupId} must expose its ${state} control.`);
  box.checked = value;
  await changeIn("sections-list", box);
};
const selectSection = async index => {
  await clickIn("sections-list", sectionRows()[index]);
};
const groupIds = () => [...new Set(inSections("groupToggle").map(node => node.dataset.groupToggle))];

// Two disjoint retained Sections over a 100 s source: 0:10–0:20 and 1:00–1:20.
await makeSection(100, 200);
await makeSection(600, 800);
byId.get("release").click();
await flush();
assert.equal(sectionRows().length, 2);
assert.equal(pinRows().length, 4);

// Keep one empty layer available as the alternate Timeline owner. Visibility is
// singular: showing this layer hides Map without deactivating or deleting it.
await clickIn("sections-list", inSections("groupAdd")[0]);
const emptyLayer = groupIds().find(id => id !== "group-default");
assert.ok(emptyLayer);
await setGroupState("group-default", "visible", true);

// ==============================================================================
// 1. A Group's two states are independent, and each governs exactly one thing.
// ==============================================================================
await selectSection(0);
const weight = inSections("sectionWeighting")[0];
weight.value = "4";
await changeIn("sections-list", weight);
const deformedDuration = byId.get("duration-time").textContent;
assert.match(deformedDuration, /spatial/,
  "A Weight above 1 deforms the map.");
assert.equal(deformed(), true);
assert.equal(drawnBars(), 2);
assert.equal(drawnPins(), 4);

// Inactive: the terrain flattens, the topology stays.
await setGroupState("group-default", "weightsEnabled", false);
assert.doesNotMatch(byId.get("duration-time").textContent, /spatial/,
  "An inactive Group's Weights deform nothing.");
assert.equal(deformed(), false, "and draw no gradient.");
assert.equal(drawnBars(), 2, "while its Sections stay on the map.");
assert.equal(drawnPins(), 4, "with their endpoint Pins.");

// Showing another Group hides Map as a complete Timeline layer. Map remains
// inactive, so nothing is drawn and nothing is deformed.
await setGroupState(emptyLayer, "visible", true);
assert.equal(drawnBars(), 0);
assert.equal(drawnPins(), 0);
assert.equal(deformed(), false);

// Hidden and active is the background terrain: Weight with no landmarks.
await setGroupState("group-default", "weightsEnabled", true);
assert.equal(drawnBars(), 0, "A hidden active Group draws no Section bar.");
assert.equal(drawnPins(), 0, "and no endpoint Pin.");
assert.equal(deformed(), true, "while still deforming the Timeline.");
assert.equal(
  byId.get("duration-time").textContent,
  deformedDuration,
  "Hiding the active terrain changes the drawing and never the projection."
);

// The Guide is the inventory, not the drawing: hidden objects stay editable.
assert.equal(sectionRows().length, 2,
  "A hidden Section is still listed in the Guide, or it could never be brought back.");
assert.equal(pinRows().length, 4,
  "and so are its Pins.");
// At most one Group is drawn, and none is a state worth reaching. A radio has no
// gesture for clearing itself, so "draw nothing" was unreachable -- exactly-one
// was being kept by the widget rather than by the transaction.
assert.equal(groupToggle(emptyLayer, "visible").type, "checkbox",
  "Visibility is a checkbox, because drawing nothing is a state the Guide can hold.");
assert.equal(groupToggle(emptyLayer, "weightsEnabled").type, "checkbox",
  "Activity remains an independent stackable choice.");
assert.match(rowText(byId.get("pins-list")), /Hidden/,
  "The Guide names hidden Pins instead of dropping them from inventory.");

// Guide navigation reaches hidden structure without turning it into a Timeline
// operand. The row remains available while the Timeline stays empty.
const hiddenPinRow = pinRows()[0];
await clickIn("pins-list", hiddenPinRow);
assert.equal(drawnPins(), 0);
assert.match(currentText(), /0:10/,
  "The Guide moves Current to a hidden Address without revealing the Pin.");

// ==============================================================================
// 2. What the map does not draw, no operator can traverse to.
// ==============================================================================
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 10 });
await flush();
const compressedTerrainCurrent = currentText();
await press("ArrowRight", { shiftKey: true });
assert.equal(
  currentText(),
  "Current 1:40",
  "Pin traversal skips hidden Pins, exactly as the map does."
);
assert.notEqual(currentText(), compressedTerrainCurrent);
await press("ArrowRight", { shiftKey: true });
assert.match(status(), /no next Pin/,
  "and reports the absence rather than inventing a stop.");

// Show Map and the same key reaches them all again. Nothing was destroyed.
await setGroupState("group-default", "visible", true);
assert.equal(
  descendants(byId.get("pin-lane")).some(node => node.classList.contains("retained-selected")),
  false,
  "A Pin reached through the Guide does not become selected when its Group returns to the Timeline."
);
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 10 });
await flush();
const visited = [];
for (let index = 0; index < 4; index += 1) {
  await press("ArrowRight", { shiftKey: true });
  visited.push(currentText());
}
assert.deepEqual(
  visited,
  ["Current 0:10", "Current 0:20", "Current 1:00", "Current 1:20"],
  "Visibility is a drawing choice, and restoring it restores traversal exactly."
);

// ==============================================================================
// 3. Focus and Groups do not observe each other.
// ==============================================================================
await selectSection(0);
await clickIn("sections-list", inSections("focusSection")[0]);
assert.match(status(), /Focused/);
const focusedBars = drawnBars();
const focusedPins = drawnPins();

// Showing another layer while focused withdraws the drawing and keeps the viewport.
await setGroupState(emptyLayer, "visible", true);
assert.equal(drawnBars(), 0);
assert.equal(drawnPins(), 0);
await setGroupState("group-default", "visible", true);
assert.equal(drawnBars(), focusedBars,
  "and restoring visibility restores exactly what Focus was drawing.");
assert.equal(drawnPins(), focusedPins);

await clickIn("sections-list", inSections("unfocus")[0]);
assert.match(status(), /Restored Range/);

// ==============================================================================
// 4. Chapters are drawn through the same projection, and stay inert in all of it.
// ==============================================================================
byId.get("chapter-source").value = "0:00 A\n0:20 B\n0:50 C\n1:20 D";
byId.get("chapter-capture").dispatch("submit");
await flush();
assert.equal(chapterRows().length, 4);
byId.get("chapter-lane-toggle").click();
await flush();

const positions = () => chapterMarks().map(mark => mark.style.left);
const deformedPositions = positions();
assert.equal(deformedPositions.length, 4);
assert.notDeepEqual(
  deformedPositions,
  ["0%", "20%", "50%", "80%"],
  "A drawn Chapter is projected, so a Weight moves it exactly as it moves a Pin."
);

// Flatten the map and the marks return to their source fractions.
await setGroupState("group-default", "weightsEnabled", false);
assert.deepEqual(
  positions(),
  ["0%", "20%", "50%", "80%"],
  "Deactivating the Group flattens Chapter marks with everything else."
);
await setGroupState("group-default", "weightsEnabled", true);
assert.deepEqual(positions(), deformedPositions,
  "and reactivating restores them, because nothing about a Chapter was stored.");

// Focus clips them to the viewport rather than piling them against an edge.
await selectSection(0);
await clickIn("sections-list", inSections("focusSection")[0]);
assert.ok(chapterMarks().length < 4,
  "Focus draws only the Chapters inside the viewport.");
for (const mark of chapterMarks()) {
  const fraction = Number.parseFloat(mark.style.left);
  assert.ok(fraction >= 0 && fraction <= 100,
    "and every drawn mark lands inside the drawn map.");
}
await clickIn("sections-list", inSections("unfocus")[0]);
assert.equal(chapterMarks().length, 4, "Unfocus restores the whole set.");

// Through all of that, no Chapter became an operand.
assert.equal(byId.get("sections-list-count").textContent, "2");
assert.equal(byId.get("pins-list-count").textContent, "4");
for (const mark of descendants(byId.get("chapter-lane"))) {
  assert.deepEqual(Object.keys(mark.dataset || {}), [],
    "A drawn Chapter carries nothing a pointer handler dispatches on.");
}

// ==============================================================================
// 5. Composition crosses the families: Chapter with Section, Section with Pin.
// ==============================================================================
await clickIn("chapters-list", chapterRows()[0]);
assert.match(workingWindow(), /0:00–0:20/,
  "A Chapter takes its extent as the Active Span.");
await clickIn("sections-list", sectionRows()[1], { shiftKey: true });
assert.match(workingWindow(), /0:00–1:20/,
  "and a retained Section extends it by the same law.");
await clickIn("pins-list", pinRows()[0], { shiftKey: true });
assert.match(workingWindow(), /0:00–1:20/,
  "Extension is monotonic across every family at once.");

// The composed span is an ordinary extent, so Tag retains it.
const beforeCompose = sectionRows().length;
byId.get("retain").dispatch("click", { detail: 1, shiftKey: true });
await flush();
assert.equal(sectionRows().length, beforeCompose + 1,
  "A span composed from a Chapter and a Section retains like any other.");
byId.get("return-action").click();
await flush();
assert.equal(sectionRows().length, beforeCompose,
  "and one Undo removes it.");

// ==============================================================================
// 6. The Pin routes: reveal, unlink, and the Shift layer.
// ==============================================================================
await selectSection(0);
const revealStart = inSections("revealPin").find(node => node.textContent === "Start");
assert.ok(revealStart, "A selected Section names the Pin each endpoint is.");
const intervalBeforeReveal = workingWindow();
const currentBeforeReveal = currentText();
const undoBeforeReveal = undoLabel();
await clickIn("sections-list", revealStart);
assert.equal(byId.get("guide-tab-pins")["aria-selected"], "true",
  "Revealing switches to where Pins are operated on.");
assert.equal(workingWindow(), intervalBeforeReveal,
  "and moves no Active Span,");
assert.equal(currentText(), currentBeforeReveal, "no Current,");
assert.equal(undoLabel(), undoBeforeReveal, "and records no transaction.");
assert.ok(
  descendants(byId.get("pins-list")).some(node => node.classList.contains("retained-selected")),
  "The revealed Pin is the selected one."
);

// An armed Shift layer survives a reveal: revealing is not composing, so it
// must neither consume the arm nor compose with it. The layer under test is the
// Guide's own, because these are Guide clicks -- the operator matrix's layer
// speaks for the operator matrix.
await selectSection(0);
byId.get("guide-compose-toggle").click();
await flush();
assert.equal(byId.get("guide-compose-toggle")["aria-pressed"], "true");
const armedInterval = workingWindow();
await clickIn(
  "sections-list",
  inSections("revealPin").find(node => node.textContent === "End")
);
assert.equal(byId.get("guide-compose-toggle")["aria-pressed"], "true",
  "A reveal leaves the one-shot Shift layer armed for the click that composes.");
assert.equal(workingWindow(), armedInterval,
  "and composes nothing itself.");
await clickIn("pins-list", pinRows()[3]);
assert.equal(byId.get("guide-compose-toggle")["aria-pressed"], "false",
  "The next click in the tab it landed on consumes the arm.");

// ==============================================================================
// 7. Unlink from the Pin, under a Group that is hiding it.
// ==============================================================================
// Two Sections meeting at one Address share the Pin holding them. The map is
// flattened first so a pixel means a known Address again -- the topography is
// the subject of other blocks, not this one.
await selectSection(0);
const flatten = inSections("sectionWeighting")[0];
flatten.value = "1";
await changeIn("sections-list", flatten);
byId.get("release").click();
await flush();
await makeSection(200, 400);
byId.get("release").click();
await flush();
const shared = pinRows().find(row => rowText(row).includes("anchors 2 Sections"));
assert.ok(shared, "Building adjacent Sections shares one endpoint Pin.");
await clickIn("pins-list", shared);
const unlinks = descendants(byId.get("pins-list"))
  .filter(node => node.dataset.unlinkSectionEndpoint);
assert.equal(unlinks.length, 2,
  "A shared Pin offers to release each Section it holds, named.");
assert.ok(
  unlinks.every(node => /Unlink Section \d+:\d\d–\d+:\d\d/.test(node.textContent)),
  "Each button names the Section rather than a Start/End role."
);

const pinsBeforeUnlink = pinRows().length;
await setGroupState(emptyLayer, "visible", true);
await clickIn("pins-list", descendants(byId.get("pins-list"))
  .find(node => node.dataset.unlinkSectionEndpoint));
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.equal(pinRows().length, pinsBeforeUnlink + 1,
  "Unlink works on a hidden Group: the Guide edits what the map is not drawing.");
assert.equal(drawnPins(), 0, "and the result stays undrawn while hidden.");
await setGroupState("group-default", "visible", true);
assert.ok(drawnPins() > 0, "Unhiding draws the new Pin with the rest.");

// Showing the Group was itself a transaction, so it Undoes first -- Guide edits
// and Group states share one stack rather than each keeping its own.
byId.get("return-action").click();
await flush();
assert.equal(drawnPins(), 0, "The first Undo reverses the Show.");
assert.equal(pinRows().length, pinsBeforeUnlink + 1, "and touches no topology.");
byId.get("return-action").click();
await flush();
assert.equal(pinRows().length, pinsBeforeUnlink,
  "The next reverses the Unlink performed while hidden.");
await setGroupState("group-default", "visible", true);

// ==============================================================================
// 8. A Group is a retained object: named, renamable, removable, non-destructive.
// ==============================================================================
await clickIn("sections-list", inSections("groupAdd")[0]);
const added = groupIds().find(id =>
  id !== "group-default" && id !== emptyLayer
);
assert.ok(added, "New Group creates one.");
// Every Group is an ordinary Group: each carries Rename and Remove, the default
// included. Only the last one refuses removal, and it says so at the moment of
// asking rather than by hiding the control.
const groupCount = groupIds().length;
assert.equal(inSections("renameGroup").length, groupCount,
  "Every Group carries Rename.");
assert.equal(inSections("deleteGroup").length, groupCount,
  "and every Group carries Remove.");
assert.ok(inSections("deleteGroup").every(control => !control.disabled),
  "None is refused while more than one Group exists.");

const sectionCountBefore = sectionRows().length;
await selectSection(0);
const groupSelect = inSections("sectionGroup")[0];
groupSelect.value = added;
await changeIn("sections-list", groupSelect);
assert.match(status(), /Move “Section \d/,
  "A Section is named by its Address wherever it has no title.");

// Its state governs the Section that moved, and only that one.
await setGroupState("group-default", "visible", true);
assert.ok(drawnBars() < sectionCountBefore,
  "Hiding one Group hides only its own Sections.");
assert.ok(drawnBars() > 0, "and leaves the rest drawn.");

await clickIn("sections-list", inSections("renameGroup")
  .find(node => node.dataset.renameGroup === added));
assert.equal(byId.get("guide-dialog-title").textContent, "Rename Group");
byId.get("guide-dialog-input").value = "Baked terrain";
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.ok(
  inSections("sectionGroup")[0].children.some(option => option.textContent === "Baked terrain"),
  "A renamed Group is named the same way everywhere it is offered."
);

await clickIn("sections-list", inSections("deleteGroup")
  .find(node => node.dataset.deleteGroup === added));
assert.match(byId.get("guide-dialog-message").textContent, /moves to “Map”; nothing is deleted/);
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.equal(sectionRows().length, sectionCountBefore,
  "Removing a Group destroys none of its Sections.");
assert.equal(groupIds().length, 2,
  "and leaves Map plus the retained empty alternate layer.");
assert.equal(drawnBars(), sectionCountBefore,
  "Its Sections return to the map's own visibility, not the removed Group's.");

byId.get("return-action").click();
await flush();
assert.equal(groupIds().length, 3, "One Undo restores the removed Group,");
assert.ok(drawnBars() < sectionCountBefore, "with the state it was removed in.");

// ==============================================================================
// 9. History stays one stack through all of it.
// ==============================================================================
// Every Guide edit above was a transaction. Redo is settled first so the stack
// starts with nothing pending -- block 8 ended on an Undo, which leaves one
// redoable entry by design -- and the round trip is then exact.
while (byId.get("redo-action").disabled !== true) {
  byId.get("redo-action").click();
  await flush();
}
const built = {
  sections: byId.get("sections-list-count").textContent,
  pins: byId.get("pins-list-count").textContent,
  groups: groupIds().length,
  duration: byId.get("duration-time").textContent
};

let guard = 0;
while (byId.get("return-action").disabled !== true && guard < 400) {
  byId.get("return-action").click();
  await flush();
  guard += 1;
}
assert.ok(guard < 400, "Undo terminates rather than cycling.");
assert.equal(byId.get("sections-list-count").textContent, "0",
  "Undoing everything empties the Guide.");
assert.equal(byId.get("pins-list-count").textContent, "0");
assert.equal(groupIds().length, 1,
  "The empty default Group remains reachable after every Section is undone.");
assert.equal(byId.get("duration-time").textContent, "1:40",
  "and the map returns to the undeformed source.");
assert.equal(byId.get("chapters-list-count").textContent, "4",
  "Chapters survive: they are an offer, not history.");
assert.equal(chapterMarks().length, 4,
  "and so does the drawing of them, which no transaction ever owned.");

// Redo returns the whole construction, Groups and all.
let redone = 0;
while (byId.get("redo-action").disabled !== true && redone < 400) {
  byId.get("redo-action").click();
  await flush();
  redone += 1;
}
assert.equal(redone, guard,
  "Redo replays exactly the transactions Undo removed, no more and no fewer.");
assert.deepEqual(
  {
    sections: byId.get("sections-list-count").textContent,
    pins: byId.get("pins-list-count").textContent,
    groups: groupIds().length,
    duration: byId.get("duration-time").textContent
  },
  built,
  "and the construction it returns is the one it walked back from."
);

// Hovering a Pin row shows where it is, exactly as hovering a Section row does.
// A Guide entry you cannot locate on the map without clicking it is a list.
{
  const row = descendants(byId.get("pins-list"))
    .find(node => node.dataset.pinPreviewId !== undefined);
  assert.ok(row, "Pin rows carry a preview identity.");
  assert.equal(byId.get("pin-preview-marker").hidden, true);
  byId.get("pins-list").dispatch("pointerover", { target: row });
  await flush(2);
  assert.equal(byId.get("pin-preview-marker").hidden, false,
    "Hovering a Pin marks its Address on the Timeline.");
  byId.get("pins-list").dispatch("pointerout", { target: row });
  await flush(2);
  assert.equal(byId.get("pin-preview-marker").hidden, true,
    "and leaving it clears the mark, having moved nothing.");
}

console.log("Cross-interaction stress passed: Group visibility and activity govern drawing and topography independently and are observed by traversal but never by the projection; Chapters project through topography and Focus while staying inert; composition crosses Chapters, Sections and Pins by one law; reveal moves nothing and preserves an armed Shift layer; Unlink works from the Pin under a hidden Group; a Group renames and removes non-destructively; one history stack Undoes and Redoes the whole construction; every Group offers rename and remove with only the last refused; and hovering a Pin row marks its Address on the map.");
