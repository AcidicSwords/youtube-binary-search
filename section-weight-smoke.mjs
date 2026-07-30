import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const {
  byId,
  flush,
  poll,
  delay,
  dispatchDocument,
  currentText,
  center,
  tail,
  lead
} = env;
const canonicalWeights = ["0.25", "0.5", "0.75", "1", "1.25", "1.5", "1.75", "2"];
const playerCommandCounts = () => [
  center().commands.length,
  tail().commands.length,
  lead().commands.length
];

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await flush(5);
await poll();
await flush(3);
byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");

// Establish and retain 30–50 as an ordinary Section.
for (const clientX of [300, 500]) {
  byId.get("timeline").dispatch("click", {
    target: byId.get("timeline"),
    clientX
  });
  await flush();
}
byId.get("section-label").value = "Section A";
byId.get("section-label").dispatch("input");
byId.get("section-capture").dispatch("submit");
await flush();

let sectionNodes = descendants(byId.get("sections-list"));
let weightControl = sectionNodes.find(node => node.dataset.sectionWeight);
assert.ok(weightControl, "Every retained Section must expose its timeline weight.");
const sectionId = weightControl.dataset.sectionWeight;
assert.equal(weightControl.value, "1");
assert.deepEqual(
  weightControl.options.map(option => option.value),
  canonicalWeights,
  "Section weights must use the familiar Tail/Lead scale."
);

let timelineNodes = descendants(byId.get("section-lane"));
let timelineWeight = timelineNodes.find(node =>
  node.dataset.sectionWeight === sectionId
);
assert.ok(timelineWeight, "The same weight must be editable on the timeline.");
assert.equal(timelineWeight.value, "1");

// Compressing the Section changes only its positive lateral extent.
let commandsBeforeWeight = playerCommandCounts();
weightControl.value = "0.5";
byId.get("sections-list").dispatch("change", { target: weightControl });
await flush();
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Timeline compression must issue no player or Field command."
);
commandsBeforeWeight = playerCommandCounts();
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40.000");
dispatchDocument("keydown", { key: "c", code: "KeyC" });
await flush();
assert.equal(
  byId.get("duration-time").textContent,
  "1:30.000 spatial · 1:40.000 source"
);
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Undoing and redoing a weight edit must also remain timeline-only."
);

assert.equal(
  byId.get("duration-time").textContent,
  "1:30.000 spatial · 1:40.000 source"
);
timelineNodes = descendants(byId.get("section-lane"));
const gradient = timelineNodes.find(node =>
  node.classList.contains("timeline-section-span")
);
assert.ok(gradient.classList.contains("compressed"));
assert.ok(
  Number.parseFloat(gradient.style.width) > 0,
  "Compression remains a positive lateral span."
);
assert.equal(
  descendants(byId.get("pin-lane")).filter(node => node.dataset.pinGo).length,
  2,
  "Both endpoint Pins remain ordinary lateral operands."
);

// One spatial second reaches the Section boundary; the next consumes two
// source seconds at 0.5× density.
byId.get("release").click();
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: (29 / 90) * 1000
});
await flush();
byId.get("release").click();
byId.get("step-size-seconds").value = "1";
byId.get("step-size-seconds").dispatch("change");
byId.get("step-forward").click();
await delay(180);
await flush();
assert.equal(currentText(), "Current 0:30.000");
byId.get("step-forward").click();
await delay(180);
await flush();
assert.equal(currentText(), "Current 0:32.000");

// Shift+Step sees the same normally ordered Section endpoints.
byId.get("release").click();
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: (29 / 90) * 1000
});
await flush();
byId.get("release").click();
dispatchDocument("keydown", { key: "D", code: "KeyD", shiftKey: true });
await flush();
assert.equal(currentText(), "Current 0:30.000");
dispatchDocument("keydown", { key: "D", code: "KeyD", shiftKey: true });
await flush();
assert.equal(currentText(), "Current 0:50.000");

// Focus changes Range but does not suspend the Section's spatial weight.
sectionNodes = descendants(byId.get("sections-list"));
const focusAction = sectionNodes.find(node =>
  node.dataset.focusSection === sectionId
);
byId.get("sections-list").dispatch("click", { target: focusAction });
await flush();
assert.equal(byId.get("range-label").textContent, "0:30.000–0:50.000");
assert.equal(
  byId.get("duration-time").textContent,
  "1:30.000 spatial · 1:40.000 source"
);

byId.get("focus-toggle").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:00.000–1:40.000");

// Expansion uses the same control and the opposite gradient while preserving
// exact source duration and invertibility.
timelineWeight = descendants(byId.get("section-lane")).find(node =>
  node.dataset.sectionWeight === sectionId
);
commandsBeforeWeight = playerCommandCounts();
timelineWeight.value = "2";
byId.get("section-lane").dispatch("change", { target: timelineWeight });
await flush();
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Timeline expansion must issue no player or Field command."
);
assert.equal(
  byId.get("duration-time").textContent,
  "2:00.000 spatial · 1:40.000 source"
);
assert.ok(
  descendants(byId.get("section-lane"))
    .find(node => node.classList.contains("timeline-section-span"))
    .classList.contains("expanded")
);

// Restoring 1× recovers the identity timeline exactly.
timelineWeight = descendants(byId.get("section-lane")).find(node =>
  node.dataset.sectionWeight === sectionId
);
commandsBeforeWeight = playerCommandCounts();
timelineWeight.value = "1";
byId.get("section-lane").dispatch("change", { target: timelineWeight });
await flush();
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Restoring identity weight must remain a timeline-only edit."
);
assert.equal(byId.get("duration-time").textContent, "1:40.000");

// The matrix Deform action creates a Section at the selected spatial factor
// without handing anything to the media or Field layers.
byId.get("release").click();
for (const clientX of [600, 700]) {
  byId.get("timeline").dispatch("click", {
    target: byId.get("timeline"),
    clientX
  });
  await flush();
}
byId.get("deform-weight-select").value = "0.75";
byId.get("deform-weight-select").dispatch("change");
commandsBeforeWeight = playerCommandCounts();
byId.get("deform").click();
await flush();
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "The Deform operator must create weighted geometry without a player or Field command."
);
assert.equal(byId.get("sections-list-count").textContent, "2");
assert.equal(
  byId.get("duration-time").textContent,
  "1:37.500 spatial · 1:40.000 source"
);

// Existing Section weights remain editable during source playback without
// pausing, seeking, changing rate, or realigning either Field side.
byId.get("center-transport-surface").click();
await flush(3);
assert.equal(center().state, 1);
timelineWeight = descendants(byId.get("section-lane")).find(node =>
  node.dataset.sectionWeight === sectionId
);
commandsBeforeWeight = playerCommandCounts();
timelineWeight.value = "0.5";
byId.get("section-lane").dispatch("change", { target: timelineWeight });
await flush();
assert.equal(center().state, 1);
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Editing timeline weight during playback must leave all media runtime untouched."
);

console.log("Section weight smoke passed: shared familiar scale, timeline-only edits, positive compression, expansion, gradients, ordinary Pins, weighted Step, and identity recovery.");
