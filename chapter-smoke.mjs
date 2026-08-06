// Chapters enter the workflow without entering the Guide.
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
byId.get("context-duration").value = "0";
byId.get("context-duration").dispatch("change");
await flush();

const chapterRows = () => descendants(byId.get("chapters-list"))
  .filter(node => node.dataset.chapterGo);
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
assert.equal(byId.get("chapters-list-count").textContent, "0");

// --- Offering changes nothing that persists -----------------------------------
byId.get("chapter-source").value = description;
byId.get("chapter-capture").dispatch("submit");
await flush();

assert.equal(byId.get("chapters-list-count").textContent, "3",
  "Only lines carrying an Address become Chapters; the sponsor and handle are ignored.");
assert.deepEqual(guideCounts(), emptyGuide,
  "Offering Chapters must not populate Pins or Sections.");
assert.equal(timelinePins(), 0,
  "An offered Chapter must not be drawn on the map.");
assert.equal(byId.get("duration-time").textContent, "1:40",
  "An offered Chapter deforms nothing.");
assert.equal(byId.get("return-action").disabled, true,
  "Offering candidates records no semantic transaction.");

const rows = chapterRows();
assert.equal(rows.length, 3);
assert.match(rowText(rows[0]), /Opening/);
assert.match(rowText(rows[0]), /0:00–0:20/,
  "A chapter is a contiguous extent, not a bare point.");
assert.match(rowText(rows[2]), /1:00–1:40/,
  "The last chapter runs to the end of the source.");

// --- A Chapter navigates like any retained object ---------------------------------
byId.get("chapters-list").dispatch("click", { target: chapterRows()[1] });
await flush();
assert.equal(currentText(), "Current 0:40",
  "Clicking a Chapter centres Current in its extent.");
assert.match(byId.get("section-window").textContent, /0:20–1:00/,
  "and takes its extent as the Active Span.");
assert.deepEqual(guideCounts(), emptyGuide,
  "Navigating a Chapter still retains nothing.");

// --- Chapters compose by the same rule as Sections --------------------------------
byId.get("chapters-list").dispatch("click", { target: chapterRows()[0] });
await flush();
assert.match(byId.get("section-window").textContent, /0:00–0:20/);
byId.get("chapters-list").dispatch("click", { target: chapterRows()[2], shiftKey: true });
await flush();
assert.match(byId.get("section-window").textContent, /0:00–1:40/,
  "Shift+click extends the Active Span across both Chapters, exactly as it does for Sections.");
assert.deepEqual(guideCounts(), emptyGuide,
  "Composing candidates retains nothing.");

// --- Retention is the moment a candidate becomes structure --------------------
byId.get("chapters-list").dispatch("click", {
  target: descendants(byId.get("chapters-list")).find(node => node.dataset.chapterRetain === "1")
});
await flush();
assert.equal(guideCounts().sections, "1",
  "Retaining a Chapter saves exactly one Section.");
const saved = descendants(byId.get("sections-list"))
  .filter(node => node.dataset.sectionGo)
  .map(rowText);
assert.ok(saved.some(text => text.includes("The middle")),
  "The creator's own title comes across, because it is the thing worth keeping.");
assert.ok(saved.some(text => text.includes("0:20–1:00")),
  "and its extent is the chapter's extent.");
assert.equal(byId.get("chapters-list-count").textContent, "3",
  "Retaining one Chapter leaves the rest on offer.");

// A retained Chapter is indistinguishable from one the reader drew: it is on the
// map, it is Undoable, and it is an ordinary Section.
assert.equal(timelinePins(), 2, "Its endpoint Pins are now drawn on the map.");
byId.get("return-action").click();
await flush();
assert.deepEqual(guideCounts(), emptyGuide,
  "One Undo returns the retained Section to a candidate.");
assert.equal(byId.get("chapters-list-count").textContent, "3",
  "Undo does not withdraw the offer.");

// --- Drawn on the map, and drawn only -----------------------------------------
// The list says what the creator called each part; only the map says where
// those parts fall against the structure already built. Drawing them must not
// smuggle in an operand: every pointer route in the timeline -- hit-testing,
// drag acquisition, Pin clustering -- dispatches on a data attribute, so a
// drawn Chapter that carried one would become traversable by a rendering decision
// instead of by the reader retaining it.
const chapterMarks = () => descendants(byId.get("chapter-lane"))
  .filter(node => node.className === "timeline-chapter");

assert.equal(byId.get("chapter-lane-toggle").disabled, false,
  "With an offer standing there is something to draw.");
assert.equal(chapterMarks().length, 0,
  "but an offer alone draws nothing.");

const undoLabelBeforeDrawing = byId.get("return-action").textContent;
byId.get("chapter-lane-toggle").click();
await flush();
assert.equal(byId.get("chapter-lane-toggle")["aria-pressed"], "true");
assert.equal(chapterMarks().length, 3, "Show draws every offered Chapter at once.");
for (const mark of chapterMarks()) {
  assert.ok(Number.parseFloat(mark.style.width) > 0,
    "Every offered chapter is drawn as its complete extent, not reduced to a tick.");
}
// A chapter title may only occupy the map up to where the next chapter begins.
// A fixed cap let neighbours closer than that cap overlap into one unreadable
// run of words, which is worse than showing fewer names.
{
  const names = descendants(byId.get("chapter-lane"))
    .filter(node => node.className === "timeline-chapter-name")
    .map(node => ({
      left: Number.parseFloat(node.style.left),
      room: Number.parseFloat(node.style.maxWidth)
    }))
    .sort((first, second) => first.left - second.left);
  assert.equal(names.length, 3, "Every drawn Chapter is named.");
  for (const [index, name] of names.entries()) {
    const nextLeft = names[index + 1]?.left ?? 100;
    assert.ok(name.room <= nextLeft - name.left + 0.001,
      "A name is bounded by the room before the next Chapter, so names cannot collide.");
  }
}

assert.equal(timelinePins(), 0,
  "Drawing a Chapter creates no Pin, so nothing new is clusterable or traversable.");
for (const mark of descendants(byId.get("chapter-lane"))) {
  assert.deepEqual(Object.keys(mark.dataset || {}), [],
    "A drawn Chapter carries no data attribute, so no pointer handler can dispatch on it.");
  assert.notEqual(mark.tagName, "BUTTON",
    "and it is a mark, not a control.");
}
assert.deepEqual(guideCounts(), emptyGuide,
  "Drawing retains nothing.");
assert.equal(byId.get("return-action").textContent, undoLabelBeforeDrawing,
  "and records no transaction, because it changed no state a transaction owns.");

byId.get("chapter-lane-toggle").click();
await flush();
assert.equal(chapterMarks().length, 0, "Hide withdraws the drawing.");
assert.equal(byId.get("chapter-lane-toggle")["aria-pressed"], "false");

// --- Clearing the offer touches nothing else ----------------------------------
byId.get("chapter-lane-toggle").click();
await flush();
byId.get("chapter-clear").click();
await flush();
assert.equal(byId.get("chapters-list-count").textContent, "0");
assert.equal(byId.get("chapter-source").value, "");
assert.equal(chapterMarks().length, 0,
  "Clearing the offer clears the drawing with it.");
assert.equal(byId.get("chapter-lane-toggle").disabled, true);
assert.deepEqual(guideCounts(), emptyGuide);

console.log("Chapter smoke passed: a pasted description offers navigable chapters without populating Pins, Sections, the map or history; Chapters navigate and compose by the rules retained objects already use; drawing them on the map adds marks that carry no pointer semantics; and retaining one saves an ordinary Section carrying the creator's title.");
