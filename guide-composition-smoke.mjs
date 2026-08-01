// Composition in the Guide.
//
// A plain click replaces the Working Interval with the clicked object. Shift
// extends it to include the clicked object. One rule covers Pins and Sections
// because an extent — not a set of objects — is what every operator already
// consumes, so a composition is immediately Deformable, Focusable, and
// retainable as one parent Section. Nesting is what falls out of that, rather
// than a feature of its own.
import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll } = env;

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

// Two disjoint retained Sections over a 100 s source: 0:10–0:20 and 1:00–1:20.
for (const [from, to] of [[100, 200], [600, 800]]) {
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: from });
  await flush();
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: to });
  await flush();
  byId.get("section-capture").dispatch("submit");
  await flush();
}
byId.get("release").click();
await flush();

const sectionRows = () => descendants(byId.get("sections-list"))
  .filter(node => node.dataset.sectionGo);
const pinRows = () => descendants(byId.get("pins-list"))
  .filter(node => node.dataset.pinGo);
const workingWindow = () => byId.get("section-window").textContent;
// A row's own textContent does not aggregate its children here, so match on the
// line that actually carries the Address.
const rowText = row => descendants(row)
  .map(node => node.textContent)
  .filter(Boolean)
  .join(" ");
const rowShowing = (rows, text) => {
  const row = rows.find(node => rowText(node).includes(text));
  assert.ok(row, `Expected a Guide row showing ${text}.`);
  return row;
};
const clickSection = async (text, options = {}) => {
  byId.get("sections-list").dispatch("click", {
    target: rowShowing(sectionRows(), text),
    ...options
  });
  await flush();
};

assert.equal(sectionRows().length, 2, "Two retained Sections are needed to compose.");

// --- A plain click replaces ---------------------------------------------------
await clickSection("0:10–0:20");
assert.match(workingWindow(), /0:10–0:20/,
  "A plain click makes the clicked Section the Working Interval.");
await clickSection("1:00–1:20");
assert.match(workingWindow(), /1:00–1:20/,
  "A second plain click replaces rather than composing, so the ordinary meaning of a click is always reachable.");

// --- Shift extends ------------------------------------------------------------
await clickSection("0:10–0:20");
await clickSection("1:00–1:20", { shiftKey: true });
assert.match(workingWindow(), /0:10–1:20/,
  "Shift+click extends the Working Interval to span both Sections.");

// Extension is monotonic: composing again can only grow the extent.
await clickSection("0:10–0:20", { shiftKey: true });
assert.match(workingWindow(), /0:10–1:20/,
  "Composing an already contained Section leaves the span unchanged.");

// And a plain click still starts over.
await clickSection("0:10–0:20");
assert.match(workingWindow(), /0:10–0:20/,
  "A plain click starts over rather than extending.");

// --- The same rule reaches a Pin ----------------------------------------------
byId.get("pins-list").dispatch("click", {
  target: rowShowing(pinRows(), "1:20"),
  shiftKey: true
});
await flush();
assert.match(workingWindow(), /0:10–1:20/,
  "Shift+click on a Pin extends the same Working Interval by the same rule.");

// --- The Shift layer composes exactly as the Shift key does -------------------
// Pointer-only use must reach every meaning the keyboard reaches.
await clickSection("0:10–0:20");
byId.get("shift-layer-toggle").click();
await flush();
assert.equal(byId.get("shift-layer-state").textContent, "On");
await clickSection("1:00–1:20");
assert.match(workingWindow(), /0:10–1:20/,
  "The Shift layer composes as the Shift key does.");
assert.equal(byId.get("shift-layer-state").textContent, "Off",
  "Composing consumes the one-shot Shift layer.");

// --- The payoff: a span is an ordinary extent ---------------------------------
// So Deform retains it as one parent Section containing the two it was composed
// from. Nesting by construction, with no nesting feature.
const before = sectionRows().length;
byId.get("deform").dispatch("click", { detail: 1 });
await flush();
assert.equal(sectionRows().length, before + 1,
  "Deforming a composed span retains it as a new Section.");
const spans = sectionRows().map(rowText);
assert.ok(spans.some(text => text.includes("0:10–1:20")),
  "The new Section spans both Sections it was composed from.");
assert.ok(spans.some(text => text.includes("0:10–0:20")),
  "The Sections it was composed from survive inside it.");
assert.ok(spans.some(text => text.includes("1:00–1:20")),
  "Both children survive inside the parent.");

// One Undo removes the parent and leaves its children, because composing and
// retaining are ordinary transactions rather than a special nesting mode.
byId.get("return-action").click();
await flush();
assert.equal(sectionRows().length, before,
  "Undo removes the retained parent without disturbing its children.");

console.log("Guide composition smoke passed: a plain click replaces, Shift extends across Pins and Sections alike, extension is monotonic, the one-shot Shift layer composes and is consumed, and a composed span Deforms into a parent Section containing its children.");
