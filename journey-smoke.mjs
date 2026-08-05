// The order a person actually moves through this.
//
// Other suites prove one family, or cross two deliberately. This one walks the
// app front to back the way someone using it would: arrive, load, orient, find
// something, mark it, build structure from it, take the creator's chapters,
// weight the result, put it on a layer, come back tomorrow, then move to the
// next video. Ordering is the point -- most of what breaks in practice breaks
// because step four left something behind that step nine reads.
import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, currentText, dispatchDocument } = env;

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

const rowText = row => descendants(row)
  .map(node => node.textContent)
  .filter(Boolean)
  .join(" ");
const sectionRows = () => descendants(byId.get("sections-list"))
  .filter(node => node.dataset.sectionGo);
const pinRows = () => descendants(byId.get("pins-list"))
  .filter(node => node.dataset.pinGo);
const cueRows = () => descendants(byId.get("cues-list"))
  .filter(node => node.dataset.cueGo);
const inSections = key => descendants(byId.get("sections-list"))
  .filter(node => node.dataset[key] !== undefined);
const groupNames = () => descendants(byId.get("sections-list"))
  .filter(node => String(node.className).includes("guide-group-name"))
  .map(node => node.textContent);
const drawnBars = () => descendants(byId.get("section-lane"))
  .filter(node => node.dataset.sectionGo).length;
const cueMarks = () => descendants(byId.get("cue-lane"))
  .filter(node => node.className === "timeline-cue");
const status = () => byId.get("status").textContent;
const press = async (key, options = {}) => {
  dispatchDocument("keydown", {
    key,
    ...options,
    preventDefault() {},
    target: { tagName: "BODY" }
  });
  await flush();
};
const clickIn = async (listId, target, options = {}) => {
  byId.get(listId).dispatch("click", { target, ...options });
  await flush();
};
const changeIn = async (listId, target) => {
  byId.get(listId).dispatch("change", { target });
  await flush();
};
const loadVideo = async url => {
  byId.get("youtube-url").value = url;
  byId.get("load-video").click();
  await flush(6);
  await poll();
  await flush(2);
};

// ==============================================================================
// 1. Arrive. Nothing is loaded, and nothing pretends otherwise.
// ==============================================================================
assert.match(status(), /Paste a link/,
  "The first instruction is the first thing to do.");
assert.equal(byId.get("sections-list-count").textContent, "0");
assert.equal(byId.get("cue-parse").disabled, true,
  "Chapters cannot be offered against a source that is not loaded.");
assert.equal(byId.get("cue-lane-toggle").disabled, true,
  "and there is nothing to draw.");
assert.equal(byId.get("center-transport-surface").disabled, true,
  "Playback has nothing to play.");

// ==============================================================================
// 2. Load. The map appears and states the one thing it now knows.
// ==============================================================================
await loadVideo("https://youtu.be/dQw4w9WgXcQ");
assert.match(status(), /Loaded/);
assert.equal(byId.get("duration-time").textContent, "1:40",
  "An undeformed map reports its source length and no stretch factor.");
assert.equal(byId.get("cue-parse").disabled, false,
  "Now chapters can be offered.");
byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");
await flush();

// ==============================================================================
// 3. Orient by narrowing. Refine is the operator someone reaches for first.
// ==============================================================================
// Current starts at the beginning, so the first move that can do anything is
// forward -- there is no source behind 0:00 to refine into.
const startedAt = currentText();
await press("e");
const afterFirstRefine = currentText();
assert.notEqual(afterFirstRefine, startedAt, "Refine forward moves Current.");
await press("e");
await press("q");
assert.match(byId.get("section-window").textContent, /\d/,
  "Refining establishes a Active Span, which is what every later operator consumes.");
const surveyed = byId.get("section-window").textContent;

// ==============================================================================
// 4. Mark the place. A Pin is the first retained object.
// ==============================================================================
await press("t");
assert.equal(pinRows().length, 1, "T tags exactly one Pin.");
assert.equal(byId.get("sections-list-count").textContent, "0",
  "and nothing else.");
const pinnedAt = pinRows()[0];
assert.match(rowText(pinnedAt), /\d:\d\d/,
  "The Pin states its Address, which is what it exists to remember.");

// ==============================================================================
// 5. Build a Section from the traversal that was just made.
// ==============================================================================
await press("T", { shiftKey: true });
assert.equal(sectionRows().length, 1,
  "Shift+T tags the Active Span as a Section.");
assert.match(byId.get("section-window").textContent, new RegExp(
  surveyed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 12)
), "Retaining does not disturb the extent it retained.");

// Name it, because an unnamed Section is only an Address.
await clickIn("sections-list", sectionRows()[0]);
await clickIn("sections-list", descendants(byId.get("sections-list"))
  .find(node => node.dataset.renameSection));
assert.equal(byId.get("guide-dialog-title").textContent, "Rename Section");
byId.get("guide-dialog-input").value = "The argument";
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.ok(sectionRows().some(row => rowText(row).includes("The argument")),
  "A named Section is called by its name.");

// ==============================================================================
// 6. Give it weight. The map deforms and says so as a factor.
// ==============================================================================
await clickIn("sections-list", sectionRows()[0]);
const weight = inSections("sectionWeight")[0];
assert.ok(weight, "A selected Section exposes its Weight.");
weight.value = "4";
await changeIn("sections-list", weight);
assert.match(byId.get("duration-time").textContent, /spatial/,
  "Weight is reported as a factor on the source, never as a second duration.");
assert.doesNotMatch(byId.get("duration-time").textContent, /^\d+:\d\d$/);

// ==============================================================================
// 7. Take the creator's own divisions. Offered, never placed.
// ==============================================================================
const sectionsBeforeCues = sectionRows().length;
const pinsBeforeCues = pinRows().length;
byId.get("cue-source").value = [
  "Chapters",
  "0:00 Cold open",
  "0:35 The claim",
  "1:15 What it costs"
].join("\n");
byId.get("cue-capture").dispatch("submit");
await flush();
assert.equal(cueRows().length, 3);
assert.equal(sectionRows().length, sectionsBeforeCues,
  "Offering chapters retains nothing.");
assert.equal(pinRows().length, pinsBeforeCues);

// Put them on the map to see where they fall against what is already built.
byId.get("cue-lane-toggle").click();
await flush();
assert.equal(cueMarks().length, 3);
assert.equal(sectionRows().length, sectionsBeforeCues,
  "and drawing them still retains nothing.");

// One of them is worth keeping.
await clickIn("cues-list", descendants(byId.get("cues-list"))
  .find(node => node.dataset.cueRetain === "1"));
assert.equal(sectionRows().length, sectionsBeforeCues + 1,
  "Retaining a chapter saves one ordinary Section.");
assert.ok(sectionRows().some(row => rowText(row).includes("The claim")),
  "carrying the creator's own title.");
assert.equal(cueRows().length, 3, "and leaves the rest on offer.");

// ==============================================================================
// 8. Compose the two into one span, and keep that too.
// ==============================================================================
await clickIn("sections-list", sectionRows()[0]);
await clickIn("sections-list", sectionRows()[1], { shiftKey: true });
const composed = byId.get("section-window").textContent;
const beforeCompose = sectionRows().length;
byId.get("tag").dispatch("click", { detail: 1, shiftKey: true });
await flush();
assert.equal(sectionRows().length, beforeCompose + 1,
  "A composed span is an ordinary extent, so Tag retains it as a parent.");
assert.match(composed, /\d:\d\d–\d:\d\d/);

// ==============================================================================
// 9. Work inside one of them.
// ==============================================================================
await clickIn("sections-list", sectionRows()[0]);
await clickIn("sections-list", inSections("focusSection")[0]);
assert.match(status(), /Focused/);
const focusedCurrent = currentText();
await press("q");
assert.notEqual(currentText(), focusedCurrent,
  "Operators keep working inside a Focus.");
await clickIn("sections-list", inSections("leaveSection")[0]);
assert.match(status(), /Restored Range/,
  "and leaving restores the containing Range exactly.");

// ==============================================================================
// 10. Put the survey work on its own layer and bake it.
// ==============================================================================
const allSections = sectionRows().length;
await clickIn("sections-list", inSections("groupAdd")[0]);
assert.match(status(), /empty, so the map is blank/,
  "A new layer takes the Timeline, so the blank map is explained rather than discovered.");
assert.equal(drawnBars(), 0);
const layerId = [...new Set(inSections("groupToggle").map(node => node.dataset.groupToggle))]
  .find(id => id !== "group-default");

await clickIn("sections-list", inSections("renameGroup")[0]);
byId.get("guide-dialog-input").value = "Survey";
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.ok(groupNames().includes("Survey"));

// Move one Section onto it.
await clickIn("sections-list", sectionRows()[0]);
const groupSelect = inSections("sectionGroup")[0];
groupSelect.value = layerId;
await changeIn("sections-list", groupSelect);
assert.equal(drawnBars(), 1, "The layer draws exactly its own Sections.");

// Bake: put Map back on the Timeline while Survey keeps deforming it.
const surveyVisible = inSections("groupToggle")
  .find(node => node.dataset.groupToggle === "group-default"
    && node.dataset.groupState === "visible");
surveyVisible.checked = true;
await changeIn("sections-list", surveyVisible);
assert.equal(drawnBars(), allSections - 1,
  "Map is on the Timeline again with its own Sections.");
assert.ok(
  inSections("groupToggle").some(node =>
    node.dataset.groupToggle === layerId
    && node.dataset.groupState === "active"
    && node.checked === true),
  "and the hidden layer stays active, which is what baking means."
);

// ==============================================================================
// 10b. Undo the way someone actually uses it: after a mistake, immediately.
// ==============================================================================
// Deleting the Section the map is focused on changes the scope of everything
// drawn, so it is announced rather than discovered; and a Pin is named the way
// every other sentence names one.
await clickIn("sections-list", inSections("groupToggle")
  .find(node => node.dataset.groupToggle === layerId
    && node.dataset.groupState === "visible"));
const layerVisible = inSections("groupToggle")
  .find(node => node.dataset.groupToggle === layerId
    && node.dataset.groupState === "visible");
layerVisible.checked = true;
await changeIn("sections-list", layerVisible);
await clickIn("sections-list", sectionRows()[0]);
await clickIn("sections-list", inSections("focusSection")[0]);
const focusedRange = byId.get("range-label").textContent;
await clickIn("sections-list", inSections("deleteSection")[0]);
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.match(status(), /focused Section and restored/,
  "Deleting the focused Section says the map's scope just changed.");
assert.notEqual(byId.get("range-label").textContent, focusedRange);
byId.get("return-action").click();
await flush();
assert.match(status(), /Undid/, "and one Undo takes the mistake back.");

// Put Map back on the Timeline for the steps that follow.
const mapVisible = inSections("groupToggle")
  .find(node => node.dataset.groupToggle === "group-default"
    && node.dataset.groupState === "visible");
mapVisible.checked = true;
await changeIn("sections-list", mapVisible);

// A Pin that holds Sections says so, and names itself the way it is named
// everywhere else rather than quoting a bare Address as a title.
const anchoring = pinRows().find(row => rowText(row).includes("anchors"));
if (anchoring) {
  await clickIn("pins-list", anchoring);
  await clickIn("pins-list", descendants(byId.get("pins-list"))
    .find(node => node.dataset.deletePin));
  assert.match(byId.get("guide-dialog-message").textContent, /the Pin at \d+:\d\d/,
    "An unnamed Pin is called the Pin at its Address, never quoted as a title.");
  assert.doesNotMatch(byId.get("guide-dialog-message").textContent, / 1 Section that reference it/,
    "and the count and the verb agree.");
  byId.get("guide-dialog-cancel").click();
  await flush();
}

// ==============================================================================
// 11. Come back tomorrow. Everything is where it was left.
// ==============================================================================
const before = {
  sections: byId.get("sections-list-count").textContent,
  pins: byId.get("pins-list-count").textContent,
  names: groupNames().join("|"),
  duration: byId.get("duration-time").textContent,
  bars: drawnBars()
};
await loadVideo("https://youtu.be/dQw4w9WgXcQ");
assert.deepEqual(
  {
    sections: byId.get("sections-list-count").textContent,
    pins: byId.get("pins-list-count").textContent,
    names: groupNames().join("|"),
    duration: byId.get("duration-time").textContent,
    bars: drawnBars()
  },
  before,
  "Reopening the same video restores the Guide, its layers, and the deformation they produce."
);
assert.equal(byId.get("return-action").disabled, true,
  "History does not survive the session, because it describes a session.");

// ==============================================================================
// 12. Move to the next video. Nothing from the last one comes along.
// ==============================================================================
await loadVideo("https://youtu.be/AAAAAAAAAAA");
assert.equal(byId.get("sections-list-count").textContent, "0",
  "A different source starts with its own empty Guide.");
assert.equal(byId.get("pins-list-count").textContent, "0");
assert.equal(byId.get("cues-list-count").textContent, "0",
  "and the previous creator's chapters do not follow: their Addresses mean nothing here.");
assert.equal(cueMarks().length, 0, "so nothing of theirs is drawn.");
assert.equal(byId.get("cue-source").value, "",
  "and the box they were pasted into is empty.");
assert.equal(byId.get("duration-time").textContent, "1:40",
  "The new map is undeformed.");
assert.equal(groupNames().length <= 1, true,
  "The previous video's layers do not appear over this one.");

// And going back returns the first video's work untouched.
await loadVideo("https://youtu.be/dQw4w9WgXcQ");
assert.equal(byId.get("sections-list-count").textContent, before.sections,
  "Returning to the first video finds its Guide exactly as it was.");
assert.equal(groupNames().join("|"), before.names);

console.log("Journey smoke passed: arrive, load, orient by Refine, Pin, retain a Section, name and weight it, offer and draw the creator's chapters, retain one, compose a parent, focus and leave, build and bake a layer, reopen the same video to find everything, and move to another video without a trace of the last.");
