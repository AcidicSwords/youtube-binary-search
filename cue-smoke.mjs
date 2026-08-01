// Cues enter the workflow without entering the Guide.
//
// A creator's chapters are a partition someone who understood the video already
// drew, so they are worth navigating immediately. They are offered, never
// placed: the Guide, the map, and traversal are untouched until the reader
// retains one, and retaining is the ordinary save.
import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, currentText } = env;

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await flush(5);
await poll();
byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");
await flush();

const cueRows = () => descendants(byId.get("cues-list"))
  .filter(node => node.dataset.cueGo);
const rowText = row => descendants(row)
  .map(node => node.textContent)
  .filter(Boolean)
  .join(" ");
const guideCounts = () => ({
  pins: byId.get("pins-list-count").textContent,
  sections: byId.get("sections-list-count").textContent
});
const timelinePins = () => descendants(byId.get("pin-lane"))
  .filter(node => node.dataset.pinGo).length;

// The source is 100 s; these chapters partition it.
const description = [
  "Thanks to my sponsor https://example.com",
  "0:00 Opening",
  "0:20 - The middle",
  "1:00 | The end",
  "Follow me @somebody"
].join("\n");

const emptyGuide = guideCounts();
assert.deepEqual(emptyGuide, { pins: "0", sections: "0" });
assert.equal(byId.get("cues-list-count").textContent, "0");

// --- Offering changes nothing that persists -----------------------------------
byId.get("cue-source").value = description;
byId.get("cue-capture").dispatch("submit");
await flush();

assert.equal(byId.get("cues-list-count").textContent, "3",
  "Only lines carrying an Address become Cues; the sponsor and handle are ignored.");
assert.deepEqual(guideCounts(), emptyGuide,
  "Offering Cues must not populate Pins or Sections.");
assert.equal(timelinePins(), 0,
  "An offered Cue must not be drawn on the map.");
assert.equal(byId.get("duration-time").textContent, "1:40",
  "An offered Cue deforms nothing.");
assert.equal(byId.get("return-action").disabled, true,
  "Offering candidates records no semantic transaction.");

const rows = cueRows();
assert.equal(rows.length, 3);
assert.match(rowText(rows[0]), /Opening/);
assert.match(rowText(rows[0]), /0:00–0:20/,
  "A chapter is a contiguous extent, not a bare point.");
assert.match(rowText(rows[2]), /1:00–1:40/,
  "The last chapter runs to the end of the source.");

// --- A Cue navigates like any retained object ---------------------------------
byId.get("cues-list").dispatch("click", { target: cueRows()[1] });
await flush();
assert.equal(currentText(), "Current 0:40",
  "Clicking a Cue centres Current in its extent.");
assert.match(byId.get("section-window").textContent, /0:20–1:00/,
  "and takes its extent as the Working Interval.");
assert.deepEqual(guideCounts(), emptyGuide,
  "Navigating a Cue still retains nothing.");

// --- Cues compose by the same rule as Sections --------------------------------
byId.get("cues-list").dispatch("click", { target: cueRows()[0] });
await flush();
assert.match(byId.get("section-window").textContent, /0:00–0:20/);
byId.get("cues-list").dispatch("click", { target: cueRows()[2], shiftKey: true });
await flush();
assert.match(byId.get("section-window").textContent, /0:00–1:40/,
  "Shift+click extends the Working Interval across both Cues, exactly as it does for Sections.");
assert.deepEqual(guideCounts(), emptyGuide,
  "Composing candidates retains nothing.");

// --- Retention is the moment a candidate becomes structure --------------------
byId.get("cues-list").dispatch("click", {
  target: descendants(byId.get("cues-list")).find(node => node.dataset.cueRetain === "1")
});
await flush();
assert.equal(guideCounts().sections, "1",
  "Retaining a Cue saves exactly one Section.");
const saved = descendants(byId.get("sections-list"))
  .filter(node => node.dataset.sectionGo)
  .map(rowText);
assert.ok(saved.some(text => text.includes("The middle")),
  "The creator's own title comes across, because it is the thing worth keeping.");
assert.ok(saved.some(text => text.includes("0:20–1:00")),
  "and its extent is the chapter's extent.");
assert.equal(byId.get("cues-list-count").textContent, "3",
  "Retaining one Cue leaves the rest on offer.");

// A retained Cue is indistinguishable from one the reader drew: it is on the
// map, it is Undoable, and it is an ordinary Section.
assert.equal(timelinePins(), 2, "Its endpoint Pins are now drawn on the map.");
byId.get("return-action").click();
await flush();
assert.deepEqual(guideCounts(), emptyGuide,
  "One Undo returns the retained Section to a candidate.");
assert.equal(byId.get("cues-list-count").textContent, "3",
  "Undo does not withdraw the offer.");

// --- Drawn on the map, and drawn only -----------------------------------------
// The list says what the creator called each part; only the map says where
// those parts fall against the structure already built. Drawing them must not
// smuggle in an operand: every pointer route in the timeline -- hit-testing,
// drag acquisition, Pin clustering -- dispatches on a data attribute, so a
// drawn Cue that carried one would become traversable by a rendering decision
// instead of by the reader retaining it.
const cueMarks = () => descendants(byId.get("cue-lane"))
  .filter(node => node.className === "timeline-cue");

assert.equal(byId.get("cue-lane-toggle").disabled, false,
  "With an offer standing there is something to draw.");
assert.equal(cueMarks().length, 0,
  "but an offer alone draws nothing.");

const undoLabelBeforeDrawing = byId.get("return-action").textContent;
byId.get("cue-lane-toggle").click();
await flush();
assert.equal(byId.get("cue-lane-toggle")["aria-pressed"], "true");
assert.equal(cueMarks().length, 3, "Show draws every offered Cue at once.");
assert.equal(timelinePins(), 0,
  "Drawing a Cue creates no Pin, so nothing new is clusterable or traversable.");
for (const mark of descendants(byId.get("cue-lane"))) {
  assert.deepEqual(Object.keys(mark.dataset || {}), [],
    "A drawn Cue carries no data attribute, so no pointer handler can dispatch on it.");
  assert.notEqual(mark.tagName, "BUTTON",
    "and it is a mark, not a control.");
}
assert.deepEqual(guideCounts(), emptyGuide,
  "Drawing retains nothing.");
assert.equal(byId.get("return-action").textContent, undoLabelBeforeDrawing,
  "and records no transaction, because it changed no state a transaction owns.");

byId.get("cue-lane-toggle").click();
await flush();
assert.equal(cueMarks().length, 0, "Hide withdraws the drawing.");
assert.equal(byId.get("cue-lane-toggle")["aria-pressed"], "false");

// --- Clearing the offer touches nothing else ----------------------------------
byId.get("cue-lane-toggle").click();
await flush();
byId.get("cue-clear").click();
await flush();
assert.equal(byId.get("cues-list-count").textContent, "0");
assert.equal(byId.get("cue-source").value, "");
assert.equal(cueMarks().length, 0,
  "Clearing the offer clears the drawing with it.");
assert.equal(byId.get("cue-lane-toggle").disabled, true);
assert.deepEqual(guideCounts(), emptyGuide);

console.log("Cue smoke passed: a pasted description offers navigable chapters without populating Pins, Sections, the map or history; Cues navigate and compose by the rules retained objects already use; drawing them on the map adds marks that carry no pointer semantics; and retaining one saves an ordinary Section carrying the creator's title.");
