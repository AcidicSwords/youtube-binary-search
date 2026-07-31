import assert from "node:assert/strict";
import {
  SECTION_WEIGHT_VALUES,
  createGuide,
  createSectionFromTimes,
  ensurePin,
  nextPin,
  normalizeGuide,
  previousPin,
  resolveSection,
  setSectionWeight,
  validateGuide
} from "./guide.js";
import {
  createTimelineProjection,
  projectionForModel
} from "./timeline-projection.js";
import {
  createRoot,
  getTargets,
  stepTarget
} from "./range-geometry.js";
import {
  createSession,
  focusSection,
  goToGuidePin,
  saveExtentAsSection,
  setGuideSectionWeight,
  step
} from "./session.js";

const close = (actual, expected, message = "values differ") => {
  assert.ok(
    Math.abs(actual - expected) <= 1e-6,
    `${message}: ${actual} !== ${expected}`
  );
};

assert.deepEqual(
  SECTION_WEIGHT_VALUES,
  [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 4]
);
const invalidGuide = createGuide("invalid-weight");
assert.throws(
  () => createSectionFromTimes(invalidGuide, 10, 20, { weight: 0.6 }),
  /canonical timeline weight/
);
assert.deepEqual(
  { pins: invalidGuide.pins.length, sections: invalidGuide.sections.length },
  { pins: 0, sections: 0 },
  "An invalid factor must fail before mutating Guide."
);

const guide = createGuide("weighted-video");
const compressed = createSectionFromTimes(guide, 30, 50, {
  label: "Compressed",
  weight: 0.5
}).section;
const projection = createTimelineProjection({ duration: 100, guide });

assert.equal(validateGuide(guide, 100), true);
assert.equal(projection.timelineExtent, 90);
assert.equal(projection.sourceToTimeline(29), 29);
assert.equal(projection.sourceToTimeline(30), 30);
assert.equal(projection.sourceToTimeline(40), 35);
assert.equal(projection.sourceToTimeline(50), 40);
assert.equal(projection.sourceToTimeline(60), 50);
assert.equal(projection.timelineToSource(35), 40);
assert.equal(projection.timelineDistance(30, 50), 10);
assert.equal(
  projection.stepSourceByTimeline(29, 2, "forward", { start: 0, end: 100 }),
  32
);
assert.equal(
  projection.stepSourceByTimeline(51, 1, "backward", { start: 0, end: 100 }),
  50
);
assert.equal(
  stepTarget(29, 2, "forward", { start: 0, end: 100 }, projection.metric),
  32
);
assert.deepEqual(
  projection.projectExtent({ start: 25, end: 55 }),
  { start: 25, end: 45 }
);
assert.deepEqual(
  getTargets(createRoot(0, 30, 100), projection.metric),
  { backward: 15, forward: 70 },
  "Refine bisects weighted timeline distance."
);

// Strict positivity makes the map one-to-one across every selectable weight.
for (let source = 0; source <= 100; source += 0.125) {
  close(
    projection.timelineToSource(projection.sourceToTimeline(source)),
    source,
    "source/timeline round trip"
  );
}
for (
  let coordinate = 0;
  coordinate <= projection.timelineExtent;
  coordinate += 0.125
) {
  close(
    projection.sourceToTimeline(projection.timelineToSource(coordinate)),
    coordinate,
    "timeline/source round trip"
  );
}

// Overlapping Sections are ordinary composed scale transforms. Multiplication
// is commutative, and reciprocal weights cancel in their shared span.
const overlapGuide = createGuide("overlap");
createSectionFromTimes(overlapGuide, 20, 60, { weight: 0.5 });
createSectionFromTimes(overlapGuide, 40, 80, { weight: 2 });
const overlap = createTimelineProjection({ duration: 100, guide: overlapGuide });
assert.deepEqual(
  overlap.segments.map(segment => [
    segment.start,
    segment.end,
    segment.weight
  ]),
  [
    [0, 20, 1],
    [20, 40, 0.5],
    [40, 60, 1],
    [60, 80, 2],
    [80, 100, 1]
  ]
);
assert.equal(overlap.timelineExtent, 110);

const coextensiveGuide = createGuide("coextensive");
createSectionFromTimes(coextensiveGuide, 20, 60, { weight: 0.5 });
createSectionFromTimes(coextensiveGuide, 20, 60, { weight: 0.5, label: "Second" });
assert.equal(
  createTimelineProjection({ duration: 100, guide: coextensiveGuide })
    .weightAtSource(40),
  0.25
);

// Every Pin remains a normal ordered operand, including Pins inside weighted
// Sections. Range boundaries remain synthetic stops.
const interior = ensurePin(guide, 40, { label: "Interior" }).pin;
const before = ensurePin(guide, 20, { label: "Before" }).pin;
const after = ensurePin(guide, 70, { label: "After" }).pin;
assert.equal(
  projection.orderedPinStops({ start: 0, end: 100 })
    .some(stop => stop.id === interior.id),
  true
);
assert.equal(nextPin(guide, before.t, { start: 0, end: 100 }, projection).t, 30);
assert.equal(previousPin(guide, after.t, { start: 0, end: 100 }, projection).t, 50);

// Weight edits are the only Section deformation mutation.
assert.equal(setSectionWeight(guide, compressed.id, 2).changed, true);
assert.equal(resolveSection(guide, compressed.id).weight, 2);
assert.equal(setSectionWeight(guide, compressed.id, 3).changed, false);

let session = createSession({ duration: 100, current: 29 });
let saved = saveExtentAsSection(session, { start: 30, end: 50 }, "Weighted");
session = setGuideSectionWeight(
  saved.session,
  saved.value.section.id,
  0.5
).session;
session = step(session, "forward", 2).session;
assert.equal(session.model.resolution.C, 32);

const exactPin = ensurePin(session.model.guide, 40, { label: "Exact" }).pin;
const navigated = goToGuidePin(session, exactPin.id);
assert.equal(navigated.session.model.resolution.C, 40);
assert.equal(
  resolveSection(navigated.session.model.guide, saved.value.section.id).weight,
  0.5,
  "Direct Guide navigation never mutates Section weight."
);

// Focus changes Range only. It does not suspend or reinterpret spatial weight.
const focused = focusSection(session, saved.value.section.id);
assert.equal(focused.changed, true);
assert.equal(
  projectionForModel(focused.session.model).timelineDistance(30, 50),
  10
);

// Version-six Fold state migrates once to the closest positive replacement.
const migrated = normalizeGuide({
  version: 6,
  pins: [
    { id: "pin-a", t: 10 },
    { id: "pin-b", t: 30 },
    { id: "pin-c", t: 40 },
    { id: "pin-d", t: 60 }
  ],
  sections: [
    {
      id: "section-a",
      startPinId: "pin-a",
      endPinId: "pin-b",
      collapsed: true
    },
    {
      id: "section-b",
      startPinId: "pin-c",
      endPinId: "pin-d",
      collapsed: false
    }
  ]
}, "legacy");
assert.equal(migrated.version, 7);
assert.equal(migrated.sections[0].weight, 0.25);
assert.equal(migrated.sections[1].weight, 1);
assert.equal("collapsed" in migrated.sections[0], false);
assert.equal("collapsed" in migrated.sections[1], false);

console.log("Timeline weight projection tests passed.");
