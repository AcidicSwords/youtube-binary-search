// Composition in the Guide.
//
// A plain click replaces the Active Span with the clicked object. Shift
// extends it to include the clicked object. One rule covers Pins and Sections
// because an extent — not a set of objects — is what every operator already
// consumes, so a composition is immediately Focusable and retainable as one
// parent Section. Nesting is what falls out of that, rather
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
  assert.ok(
    row,
    `Expected a Guide row showing ${text}; rows were ${rows.map(rowText).join(" | ")}.`
  );
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
  "A plain click makes the clicked Section the Active Span.");
await clickSection("1:00–1:20");
assert.match(workingWindow(), /1:00–1:20/,
  "A second plain click replaces rather than composing, so the ordinary meaning of a click is always reachable.");

// --- Shift extends ------------------------------------------------------------
await clickSection("0:10–0:20");
await clickSection("1:00–1:20", { shiftKey: true });
assert.match(workingWindow(), /0:10–1:20/,
  "Shift+click extends the Active Span to span both Sections.");

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
  "Shift+click on a Pin extends the same Active Span by the same rule.");

// --- A Shift layer belongs to the surface that armed it -----------------------
// Both surfaces surface a one-shot Shift, and each one means "the next click
// *here*". Arming Shift in the operator matrix to take a local Refine, and then
// clicking a row in the Guide, used to compose that row: one global boolean
// spoke for two places. Pressing Shift to extend a Section and then pressing
// Space was the same fault reaching transport.
await clickSection("0:10–0:20");
byId.get("shift-layer-toggle").click();
await flush();
assert.equal(byId.get("shift-layer-state").textContent, "On");
await clickSection("1:00–1:20");
assert.match(workingWindow(), /1:00–1:20/,
  "The matrix layer does not compose a Guide click; the plain click replaces.");
assert.equal(byId.get("shift-layer-state").textContent, "On",
  "and the matrix layer is still armed, because nothing in the matrix spent it.");
byId.get("shift-layer-toggle").click();
await flush();
assert.equal(byId.get("shift-layer-state").textContent, "Off");

// Physical Shift supplies its own one gesture and consumes neither surface's
// latched layer.
await clickSection("0:10–0:20");
byId.get("shift-layer-toggle").click();
await flush();
await clickSection("1:00–1:20", { shiftKey: true });
assert.match(workingWindow(), /0:10–1:20/);
assert.equal(byId.get("shift-layer-state").textContent, "On",
  "Physical Shift must not consume the matrix latch.");
byId.get("shift-layer-toggle").click();
await flush();

await clickSection("0:10–0:20");
byId.get("guide-compose-toggle").click();
await flush();
await clickSection("1:00–1:20", { shiftKey: true });
assert.equal(byId.get("guide-compose-toggle")["aria-pressed"], "true",
  "Physical Shift must not consume the Guide latch.");
byId.get("guide-compose-toggle").click();
await flush();

// --- Composition is reachable from the Guide itself ---------------------------
// The operator matrix's Shift layer is inert while the compact Guide is open, so
// on a phone the Guide had no route to composition at all. It owns its own.
await clickSection("0:10–0:20");
byId.get("guide-compose-toggle").click();
await flush();
assert.equal(byId.get("guide-compose-toggle")["aria-pressed"], "true");
assert.equal(byId.get("shift-layer-state").textContent, "Off",
  "and arming the Guide's layer says nothing about the operator matrix.");
await clickSection("1:00–1:20");
assert.match(workingWindow(), /0:10–1:20/,
  "Composing from the Guide extends exactly as Shift does.");
assert.equal(byId.get("guide-compose-toggle")["aria-pressed"], "false",
  "and the Guide releases its one-shot layer.");
await clickSection("0:10–0:20");
assert.match(workingWindow(), /0:10–0:20/,
  "so the next plain click starts over.");
// Re-compose the span the next section acts on.
await clickSection("1:00–1:20", { shiftKey: true });
assert.match(workingWindow(), /0:10–1:20/);

// --- The payoff: a span is an ordinary extent ---------------------------------
// So Tag retains it as one parent Section containing the two it was composed
// from. Nesting by construction, with no nesting feature.
const before = sectionRows().length;
byId.get("tag").dispatch("click", { detail: 1, shiftKey: true });
await flush();
assert.equal(sectionRows().length, before + 1,
  "Tagging a composed span retains it as a new Section.");
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

console.log("Guide composition smoke passed: a plain click replaces, Shift extends across Pins and Sections alike, extension is monotonic, the one-shot Shift layer composes and is consumed, and Tag retains a composed span as a parent Section containing its children.");
