import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";
import { resolveSection } from "./guide.js";
import { projectionForModel } from "./timeline-projection.js";

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
byId.get("context-duration").value = "0";
byId.get("context-duration").dispatch("change");

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
byId.get("section-retain-form").dispatch("submit");
await flush();

let sectionNodes = descendants(byId.get("sections-list"));
let weightControl = sectionNodes.find(node => node.dataset.sectionWeighting);
assert.ok(weightControl, "Every retained Section must expose its timeline weight.");
const sectionId = weightControl.dataset.sectionWeighting;
const guideWeightControl = () => descendants(byId.get("sections-list")).find(node =>
  node.dataset.sectionWeighting === sectionId
);
const setSectionWeighting = async value => {
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
  timelineNodes.some(node => node.dataset.sectionWeighting === sectionId),
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
  "Timeline compression must issue no player or Panorama command."
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
timelineNodes = descendants(byId.get("topography-layer"));
const gradient = timelineNodes.find(node =>
  node.classList.contains("weight-gradient")
  && node.classList.contains("has-compression")
);
assert.ok(gradient);
assert.ok(
  descendants(byId.get("topography-layer"))
    .some(node => node.classList.contains("source-time-grid")),
  "Compression remains legible through projected source sourceGridLines."
);
assert.equal(
  descendants(byId.get("pin-lane")).filter(node => node.dataset.pinGo).length,
  2,
  "Both endpoint Pins remain ordinary lateral operands."
);

// A Timeline-acquired Section scopes X. Geometry and atmosphere consume the
// same effective projection while the Guide retains the exact stored Weight
// and history remains untouched.
const acquiredSection = descendants(byId.get("section-lane"))
  .find(node => node.dataset.sectionGo === sectionId);
byId.get("section-lane").dispatch("click", { target: acquiredSection });
await flush();
const sectionBypassHistory = byId.get("return-meta").textContent;
dispatchDocument("keydown", { key: "x", code: "KeyX" });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40");
assert.equal(byId.get("weight-relaxation-toggle")["aria-pressed"], "true");
assert.equal(byId.get("weight-relaxation-toggle-label").textContent, "Restore Section");
assert.equal(guideWeightControl().value, "0.5",
  "Bypassing a Section never edits its stored Weight.");
const sectionBypassAtmosphere = descendants(byId.get("topography-layer"))
  .find(node => node.classList.contains("weight-gradient"));
assert.equal(sectionBypassAtmosphere.classList.contains("has-compression"), false);
assert.equal(sectionBypassAtmosphere.classList.contains("has-expansion"), false);
assert.equal(byId.get("return-meta").textContent, sectionBypassHistory,
  "A transient bypass creates no history transaction.");
dispatchDocument("keydown", { key: "x", code: "KeyX" });
await flush();
assert.match(byId.get("duration-time").textContent, /^1:40 .*0\.9.* spatial$/);

// One spatial second reaches the Section boundary; the next consumes two
// source seconds at 0.5× density.
byId.get("release").click();
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: (29 / 90) * 1000
});
await flush();
byId.get("release").click();
byId.get("step-distance").value = "1";
byId.get("step-distance").dispatch("change");
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
// section-window is where an extent is printed; release-meta names what
// Release will remove rather than reprinting the same range beside it.
assert.match(
  byId.get("section-window").textContent,
  /0:30–0:50/,
  "Selecting a Section must make its full extent the Active Span."
);
assert.equal(byId.get("release-meta").textContent, "Active Span");
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
await setSectionWeighting("2");
await flush();
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Timeline expansion must issue no player or Panorama command."
);
assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 1.2× spatial"
);
assert.ok(
  descendants(byId.get("topography-layer"))
    .some(node =>
      node.classList.contains("weight-gradient")
      && node.classList.contains("has-expansion")
    )
);

// Restoring 1× recovers the identity timeline exactly.
commandsBeforeWeight = playerCommandCounts();
await setSectionWeighting("1");
await flush();
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Restoring identity weight must remain a timeline-only edit."
);
assert.equal(byId.get("duration-time").textContent, "1:40");

// Selecting the Section establishes its Active Span and derives selection
// for both aligned endpoint Pins. Focus reuses that identity.
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
  "Active Span alignment must select both endpoint Pins."
);
assert.match(byId.get("status").textContent, /Active Span/);
assert.equal(byId.get("sections-list-count").textContent, "1");
byId.get("focus-toggle").click();
await flush();
assert.match(byId.get("range-label").textContent, /0:30–0:50/);
assert.equal(byId.get("sections-list-count").textContent, "1");
byId.get("focus-toggle").click();
await flush();
dispatchDocument("keydown", { key: "x", code: "KeyX", altKey: true });
await flush();
assert.equal(byId.get("sections-list-count").textContent, "1");
await setSectionWeighting("1");
await flush();

// Tag creates a Section; its Weight is then assigned in Guide without handing
// anything to the media or Panorama layers.
byId.get("release").click();
for (const clientX of [600, 700]) {
  byId.get("timeline").dispatch("click", {
    target: byId.get("timeline"),
    clientX
  });
  await flush();
}
commandsBeforeWeight = playerCommandCounts();
// Weight is assigned in the Guide, where the value lives.
byId.get("section-retain-form").dispatch("submit");
await flush(3);
{
  const select = descendants(byId.get("sections-list"))
    .find(node => node.dataset.sectionWeighting !== undefined);
  select.value = "0.75";
  byId.get("sections-list").dispatch("change", { target: select });
  await env.delay(350);
  await flush(3);
}
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Assigning a Weight must not issue a player or Panorama command."
);
assert.equal(byId.get("sections-list-count").textContent, "2");
assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 0.975× spatial"
);

// X bypasses topography: the complete map is drawn and measured as if the
// Weights were neutral while every stored Weight remains untouched.
const weightsBeforeBypass = descendants(byId.get("sections-list"))
  .filter(node => node.dataset.sectionWeighting !== undefined)
  .map(node => node.value);
const historyBeforeBypass = byId.get("return-meta").textContent;

dispatchDocument("keydown", { key: "x", code: "KeyX" });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40",
  "A complete weight relaxation draws the map straight.");
assert.deepEqual(
  descendants(byId.get("sections-list"))
    .filter(node => node.dataset.sectionWeighting !== undefined)
    .map(node => node.value),
  weightsBeforeBypass,
  "and changes no Weight, because it is a way of looking rather than an edit.");
assert.equal(byId.get("return-meta").textContent, historyBeforeBypass,
  "and records no transaction, so it costs nothing to use before a drag.");

dispatchDocument("keydown", { key: "x", code: "KeyX" });
await flush();
assert.equal(
  byId.get("duration-time").textContent,
  "1:40 · 0.975× spatial",
  "Pressing it again restores every Weight exactly."
);

assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Bypassing and restoring topography issue no player or Panorama command."
);

// Existing Section weights remain editable during source playback without
// pausing, seeking, changing rate, or realigning either Panorama side.
sectionNodes = descendants(byId.get("sections-list"));
byId.get("sections-list").dispatch("click", {
  target: sectionNodes.find(node => node.dataset.sectionGo === sectionId)
});
await flush();
byId.get("center-transport-surface").click();
await flush(3);
assert.equal(center().state, 1);
commandsBeforeWeight = playerCommandCounts();
await setSectionWeighting("0.5");
await flush();
assert.equal(center().state, 1);
assert.deepEqual(
  playerCommandCounts(),
  commandsBeforeWeight,
  "Editing Guide weight during playback must leave all media runtime untouched."
);

// Weight is assigned in the Guide, and only there. Tag owns the matrix's
// retention position; weight relaxation is a separate auxiliary operation.
{
  const select = () => descendants(byId.get("sections-list"))
    .find(node => node.dataset.sectionWeighting !== undefined);
  const before = select().value;
  const control = select();
  control.value = "1.5";
  byId.get("sections-list").dispatch("change", { target: control });
  await env.delay(350);
  await flush(3);
  assert.equal(select().value, "1.5",
    "The Guide selector assigns the Weight.");
  assert.notEqual(select().value, before);
}


// Presentation law: Step Distance is a distance on the map, so inside a weighted
// Section a given map distance covers a different amount of source time. Every
// readout that announces a movement must state the source time it will actually
// cross, or the interface reads "10s · to 0:43" beside a Current of 0:38.
{
  byId.get("context-duration").value = "0";
  byId.get("context-duration").dispatch("change");
  byId.get("step-mode-fixed").dispatch("click", { detail: 1 });
  byId.get("step-distance").value = "10";
  byId.get("step-distance").dispatch("change");
  await flush();
  const readout = id => byId.get(id).textContent;
  const spanOf = text => text.split("·")[0].trim();
  const destinationOf = text => text.split("to ")[1]?.trim();
  const seconds = stamp => {
    const parts = String(stamp).split(":").map(Number);
    return parts.reduce((total, part) => total * 60 + part, 0);
  };
  const currentSeconds = () => seconds(currentText().replace("Current ", ""));

  // At neutral Weight the map and the source correspond, so the announced span
  // is the plain configured distance.
  await setSectionWeighting("1");
  await flush();
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 100 });
  await flush();
  const neutralForward = readout("step-forward-meta");
  assert.equal(
    Math.round(seconds(destinationOf(neutralForward)) - currentSeconds()),
    10,
    "At 1x the announced Step destination is ten source seconds ahead."
  );
  assert.equal(spanOf(neutralForward), "10s");

  // Inside a 2x Section the same map distance covers half the source time, and
  // the announced span must follow the destination rather than the setting.
  await setSectionWeighting("2");
  await flush();
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 400 });
  await flush();
  const weightedForward = readout("step-forward-meta");
  const crossed = seconds(destinationOf(weightedForward)) - currentSeconds();
  assert.ok(crossed > 0 && crossed < 10,
    `A 2x Section must shorten the source distance one Step crosses, got ${crossed}.`);
  assert.equal(
    spanOf(weightedForward),
    `${crossed}s`,
    "The announced span must equal the source time actually crossed."
  );
  assert.notEqual(spanOf(weightedForward), "10s",
    "The raw map distance must never be announced as the source distance.");
  // The configured setting keeps its own number: it is a map distance, stated
  // in the source time it equals at neutral Weight.
  assert.equal(readout("step-size-summary"), "10 units · manual");
}

// Selecting a Section and the Panorama Frame it publishes use the same effective
// midpoint. An asymmetric overlapping Weight makes this observably different
// from the arithmetic source midpoint.
{
  // With Section A at 2x, source 30 and 40 project to 25% and 41.667% of the
  // complete 120-unit map.
  for (const clientX of [250, 1000 * (50 / 120)]) {
    byId.get("timeline").dispatch("click", {
      target: byId.get("timeline"),
      clientX
    });
    await flush(2);
  }
  byId.get("retain").dispatch("click", { shiftKey: true });
  await flush(3);
  const overlapWeight = descendants(byId.get("sections-list")).find(node =>
    node.dataset.sectionWeighting
    && node.dataset.sectionWeighting !== sectionId
  );
  assert.ok(overlapWeight, "The asymmetric overlap must be retained.");
  overlapWeight.value = "4";
  byId.get("sections-list").dispatch("change", { target: overlapWeight });
  await flush(2);

  const outer = descendants(byId.get("section-lane")).find(node =>
    node.dataset.sectionGo === sectionId
  );
  byId.get("section-lane").dispatch("click", { target: outer });
  await flush(3);
  await poll();
  await flush(3);
  const currentGuideKey = [...env.localStorage.values.keys()]
    .find(key => key.includes(":v9:"));
  const storedGuide = JSON.parse(env.localStorage.values.get(currentGuideKey));
  const outerSection = resolveSection(storedGuide, sectionId);
  const effective = projectionForModel({
    duration: 100,
    range: { start: 0, end: 100 },
    guide: storedGuide
  });
  const expectedCenter = effective.timelineMidpoint(
    outerSection.start,
    outerSection.end
  );
  assert.notEqual(expectedCenter, outerSection.midpoint,
    "The asymmetric overlap must distinguish effective and arithmetic midpoints.");
  assert.ok(Math.abs(center().currentTime - expectedCenter) < 1e-6,
    `Section navigation centers Current in effective Timeline Space; got ${center().currentTime}, expected ${expectedCenter}.`);
  assert.ok(Math.abs(tail().currentTime - outerSection.start) < 1e-6);
  assert.ok(Math.abs(lead().currentTime - outerSection.end) < 1e-6,
    "The Panorama uses Start / effective midpoint / End for that same Section.");
}

// Scope follows what is acquired, and bare Timeline selection makes the
// complete-map bypass reachable after working with Sections.
byId.get("release").click();
await flush(3);
const weightedSpan = byId.get("duration-time").textContent;
dispatchDocument("keydown", { key: "x", code: "KeyX" });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40",
  "With nothing acquired, X straightens the whole Timeline.");
assert.equal(byId.get("weight-relaxation-toggle")["aria-pressed"], "true",
  "and the auxiliary Operators action states that active scope.");
dispatchDocument("keydown", { key: "x", code: "KeyX" });
await flush();
assert.equal(byId.get("duration-time").textContent, weightedSpan,
  "and pressing it again restores every Weight exactly as it was.");

console.log("Section weight smoke passed: shared familiar scale, Guide-only tuning, positive compression, expansion, gradients, ordinary Pins, weighted Step, and identity recovery.");
