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
const canonicalWeights = ["0.125", "0.25", "0.5", "0.75", "1", "1.25", "1.5", "1.75", "2", "4"];
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
const guideWeightControl = () => descendants(byId.get("sections-list")).find(node =>
  node.dataset.sectionWeight === sectionId
);
const setSectionWeight = async value => {
  let control = guideWeightControl();
  if (!control) {
    const sectionMain = descendants(byId.get("sections-list")).find(node =>
      node.dataset.sectionGo === sectionId
    );
    byId.get("sections-list").dispatch("click", { target: sectionMain });
    await flush();
    control = guideWeightControl();
  }
  assert.ok(control, "The selected Section must expose its Guide weight.");
  control.value = value;
  byId.get("sections-list").dispatch("change", { target: control });
};
assert.equal(weightControl.value, "1");
assert.deepEqual(
  weightControl.options.map(option => option.value),
  canonicalWeights,
  "Section weights must offer the whole canonical ladder."
);

let timelineNodes = descendants(byId.get("section-lane"));
assert.equal(
  timelineNodes.some(node => node.dataset.sectionWeight === sectionId),
  false,
  "Persistent tuning controls must not inflate Timeline Section lanes."
);

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
assert.equal(byId.get("duration-time").textContent, "1:40");
dispatchDocument("keydown", { key: "c", code: "KeyC" });
await flush();
assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 0.9× spatial"
);
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Undoing and redoing a weight edit must also remain timeline-only."
);

assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 0.9× spatial"
);
timelineNodes = descendants(byId.get("deformation-field"));
const gradient = timelineNodes.find(node =>
  node.classList.contains("deformation-atmosphere")
  && node.classList.contains("has-compression")
);
assert.ok(gradient);
assert.ok(
  descendants(byId.get("deformation-field"))
    .some(node => node.classList.contains("deformation-contours")),
  "Compression remains legible through projected source contours."
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
assert.equal(currentText(), "Current 0:30");
byId.get("step-forward").click();
await delay(180);
await flush();
assert.equal(currentText(), "Current 0:32");

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
assert.equal(currentText(), "Current 0:30");
dispatchDocument("keydown", { key: "D", code: "KeyD", shiftKey: true });
await flush();
assert.equal(currentText(), "Current 0:50");

// Focus changes Range but does not suspend the Section's spatial weight.
sectionNodes = descendants(byId.get("sections-list"));
const sectionMain = sectionNodes.find(node =>
  node.dataset.sectionGo === sectionId
);
byId.get("sections-list").dispatch("click", { target: sectionMain });
await flush();
assert.equal(currentText(), "Current 0:40");
assert.equal(
  byId.get("release-meta").textContent,
  "0:30–0:50",
  "Selecting a Section must make its full extent the Working Interval."
);
sectionNodes = descendants(byId.get("sections-list"));
const focusAction = sectionNodes.find(node =>
  node.dataset.focusSection === sectionId
);
byId.get("sections-list").dispatch("click", { target: focusAction });
await flush();
assert.equal(byId.get("range-label").textContent, "0:30–0:50");
assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 0.9× spatial"
);
// Focus makes the relation the world, so the focused extent is drawn across
// the whole timeline whatever its Weight.
assert.deepEqual(
  {
    left: byId.get("range-fill").style.left,
    width: byId.get("range-fill").style.width
  },
  { left: "0%", width: "100%" },
  "A focused Section must span the full timeline."
);
// The boundary that defines the world cannot be dragged from inside it. Such a
// drag could only ever pull the boundary inward — the Range it defines is also
// the limit the drag clamps to — while re-normalizing the drawn map under the
// finger on every move.
{
  const boundaryPin = descendants(byId.get("pin-lane"))
    .find(node => node.dataset.pinGo);
  assert.ok(boundaryPin, "A focused Section must still draw its endpoint Pins.");
  const rangeBeforeDrag = byId.get("range-label").textContent;
  byId.get("pin-lane").dispatch("pointerdown", {
    target: boundaryPin,
    pointerId: 55,
    button: 0,
    clientX: 300
  });
  await flush();
  assert.match(byId.get("status").textContent, /Unfocus to move the boundary/,
    "Dragging a focused boundary Pin must be refused, with the reason.");
  dispatchDocument("pointermove", { pointerId: 55, clientX: 700, buttons: 1 });
  dispatchDocument("pointerup", { pointerId: 55, clientX: 700 });
  await flush();
  assert.equal(byId.get("range-label").textContent, rangeBeforeDrag,
    "A refused drag moves no boundary.");
  assert.deepEqual(
    {
      left: byId.get("range-fill").style.left,
      width: byId.get("range-fill").style.width
    },
    { left: "0%", width: "100%" },
    "And the drawn scale never snaps around under the gesture."
  );
}

byId.get("focus-toggle").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:00–1:40");
// Unfocused, the same Section is once more a band inside the whole map.
assert.deepEqual(
  {
    left: byId.get("range-fill").style.left,
    width: byId.get("range-fill").style.width
  },
  { left: "0%", width: "100%" },
  "The unfocused world is the whole source."
);

// Expansion uses the same control and the opposite field while preserving
// exact source duration and invertibility.
commandsBeforeWeight = playerCommandCounts();
await setSectionWeight("2");
await flush();
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Timeline expansion must issue no player or Field command."
);
assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 1.2× spatial"
);
assert.ok(
  descendants(byId.get("deformation-field"))
    .some(node =>
      node.classList.contains("deformation-atmosphere")
      && node.classList.contains("has-expansion")
    )
);

// Restoring 1× recovers the identity timeline exactly.
commandsBeforeWeight = playerCommandCounts();
await setSectionWeight("1");
await flush();
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Restoring identity weight must remain a timeline-only edit."
);
assert.equal(byId.get("duration-time").textContent, "1:40");

// Selecting the Section establishes its Working Interval and derives selection
// for both aligned endpoint Pins. Deform and Focus reuse that identity.
byId.get("release").click();
const retainedSectionMain = descendants(byId.get("sections-list"))
  .find(node => node.dataset.sectionGo);
assert.ok(retainedSectionMain);
byId.get("sections-list").dispatch("click", {
  target: retainedSectionMain
});
await flush();
assert.equal(
  descendants(byId.get("pin-lane"))
    .filter(node => node.dataset.pinGo && node.classList.contains("extent-selected"))
    .length,
  2,
  "Working Interval alignment must select both endpoint Pins."
);
assert.match(byId.get("status").textContent, /Working Interval/);
assert.equal(byId.get("sections-list-count").textContent, "1");
byId.get("focus-toggle").click();
await flush();
assert.match(byId.get("range-label").textContent, /0:30–0:50/);
assert.equal(byId.get("sections-list-count").textContent, "1");
byId.get("focus-toggle").click();
await flush();
dispatchDocument("keydown", { key: "t", code: "KeyT", altKey: true });
await flush();
assert.equal(byId.get("sections-list-count").textContent, "1");
await setSectionWeight("1");
await flush();

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
commandsBeforeWeight = playerCommandCounts();
dispatchDocument("keydown", { key: "t", code: "KeyT", altKey: true });
await flush();
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "The Deform operator must create weighted geometry without a player or Field command."
);
assert.equal(byId.get("sections-list-count").textContent, "2");
assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 0.975× spatial"
);

// Plain T is a reversible normalize/restore toggle; Shift and Alt move
// one step up or down the same canonical ladder.
dispatchDocument("keydown", { key: "t", code: "KeyT" });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40");
dispatchDocument("keydown", { key: "t", code: "KeyT" });
await flush();
assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 0.975× spatial"
);
dispatchDocument("keydown", { key: "t", code: "KeyT", shiftKey: true });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40");
dispatchDocument("keydown", { key: "t", code: "KeyT", altKey: true });
await flush();
assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 0.975× spatial"
);
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Every Deform chord must remain a timeline-only edit."
);

// Existing Section weights remain editable during source playback without
// pausing, seeking, changing rate, or realigning either Field side.
sectionNodes = descendants(byId.get("sections-list"));
byId.get("sections-list").dispatch("click", {
  target: sectionNodes.find(node => node.dataset.sectionGo === sectionId)
});
await flush();
byId.get("center-transport-surface").click();
await flush(3);
assert.equal(center().state, 1);
commandsBeforeWeight = playerCommandCounts();
await setSectionWeight("0.5");
await flush();
assert.equal(center().state, 1);
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Editing Guide weight during playback must leave all media runtime untouched."
);

// The Deform steppers use the same hold-repeat binding as every other increment
// control, so they fire on press rather than on click.
{
  const weightBefore = descendants(byId.get("sections-list"))
    .find(node => node.dataset.sectionWeight)?.value;
  byId.get("deform-up").dispatch("pointerdown", { button: 0, pointerId: 95 });
  byId.get("deform-up").dispatch("pointerup", { pointerId: 95 });
  await flush(2);
  const weightAfter = descendants(byId.get("sections-list"))
    .find(node => node.dataset.sectionWeight)?.value;
  assert.notEqual(weightAfter, weightBefore,
    "Pressing the Deform stepper must raise the Section weight one step.");
  byId.get("deform-down").dispatch("pointerdown", { button: 0, pointerId: 96 });
  byId.get("deform-down").dispatch("pointerup", { pointerId: 96 });
  await flush(2);
  assert.equal(
    descendants(byId.get("sections-list")).find(node => node.dataset.sectionWeight)?.value,
    weightBefore,
    "The paired stepper must return it."
  );
}

console.log("Section weight smoke passed: shared familiar scale, Guide-only tuning, positive compression, expansion, gradients, ordinary Pins, weighted Step, and identity recovery.");
