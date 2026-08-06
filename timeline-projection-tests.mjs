import assert from "node:assert/strict";
import {
  SECTION_WEIGHTING_VALUES,
  createGuide,
  createSectionFromTimes,
  ensurePin,
  nextPin,
  normalizeGuide,
  previousPin,
  resolveSection,
  setSectionWeighting,
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
  SECTION_WEIGHTING_VALUES,
  [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 4]
);
const invalidGuide = createGuide("invalid-weight");
assert.throws(
  () => createSectionFromTimes(invalidGuide, 10, 20, { weighting: 0.6 }),
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
  weighting: 0.5
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
const compressedOverlap = createSectionFromTimes(
  overlapGuide,
  20,
  60,
  { weighting: 0.5 }
).section;
const expandedOverlap = createSectionFromTimes(
  overlapGuide,
  40,
  80,
  { weighting: 2 }
).section;
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
assert.deepEqual(
  [...new Set(overlap.segments.flatMap(segment => segment.sectionIds))].sort(),
  overlap.weightContributors.map(section => section.id).sort(),
  "The projection exposes the exact effective contributors used by its segments."
);

// A source-scoped bypass removes only its target contribution. Stored Weight
// remains canonical, overlapping contributors continue to act, and restoring
// the bypass reconstructs the exact original map.
const sectionBypass = createTimelineProjection({
  duration: 100,
  guide: overlapGuide,
  weightRelaxation: {
    kind: "section",
    sectionId: compressedOverlap.id
  }
});
assert.deepEqual(
  sectionBypass.weightContributors.map(section => section.id),
  [expandedOverlap.id]
);
assert.deepEqual(
  sectionBypass.segments.map(segment => [
    segment.start,
    segment.end,
    segment.weight
  ]),
  [
    [0, 40, 1],
    [40, 80, 2],
    [80, 100, 1]
  ]
);
assert.equal(resolveSection(overlapGuide, compressedOverlap.id).weighting, 0.5);
assert.equal(resolveSection(overlapGuide, expandedOverlap.id).weighting, 2);

const wholeBypass = createTimelineProjection({
  duration: 100,
  guide: overlapGuide,
  weightRelaxation: { kind: "all" }
});
assert.deepEqual(wholeBypass.weightContributors, []);
assert.deepEqual(
  wholeBypass.segments.map(segment => [
    segment.start,
    segment.end,
    segment.weight
  ]),
  [[0, 100, 1]],
  "A complete bypass is a fully neutral, positive identity projection."
);
assert.equal(wholeBypass.timelineExtent, 100);
assert.deepEqual(
  createTimelineProjection({ duration: 100, guide: overlapGuide }).segments,
  overlap.segments,
  "Restoring deformation reproduces the original projection exactly."
);

const staleBypass = createTimelineProjection({
  duration: 100,
  guide: overlapGuide,
  weightRelaxation: { kind: "section", sectionId: "missing-section" }
});
assert.equal(staleBypass.weightRelaxation, null);
assert.deepEqual(staleBypass.segments, overlap.segments);

const coextensiveGuide = createGuide("coextensive");
createSectionFromTimes(coextensiveGuide, 20, 60, { weighting: 0.5 });
createSectionFromTimes(coextensiveGuide, 20, 60, { weighting: 0.5, label: "Second" });
assert.equal(
  createTimelineProjection({ duration: 100, guide: coextensiveGuide })
    .effectiveWeightAtSource(40),
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
assert.equal(setSectionWeighting(guide, compressed.id, 2).changed, true);
assert.equal(resolveSection(guide, compressed.id).weighting, 2);
assert.equal(setSectionWeighting(guide, compressed.id, 3).changed, false);

let session = createSession({ duration: 100, current: 29 });
let saved = saveExtentAsSection(session, { start: 30, end: 50 }, "Weighted");
session = setGuideSectionWeight(
  saved.session,
  saved.value.section.id,
  0.5
).session;
session = step(session, "forward", 2).session;
assert.equal(session.model.neighborhood.C, 32);

const exactPin = ensurePin(session.model.guide, 40, { label: "Exact" }).pin;
const navigated = goToGuidePin(session, exactPin.id);
assert.equal(navigated.session.model.neighborhood.C, 40);
assert.equal(
  resolveSection(navigated.session.model.guide, saved.value.section.id).weighting,
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
// Groups arrived in v8; a legacy guide migrates into one default Group holding
// every Section, which is precisely the behaviour it already had.
assert.equal(migrated.version, 10);
assert.deepEqual(migrated.groups.map(group => group.id), ["group-default"]);
assert.ok(migrated.sections.every(section => section.groupId === "group-default"));
assert.equal(migrated.sections[0].weighting, 0.25);
assert.equal(migrated.sections[1].weighting, 1);
assert.equal("collapsed" in migrated.sections[0], false);
assert.equal("collapsed" in migrated.sections[1], false);

// The map is invertible, and nothing may be tolerant about which segment a
// coordinate lies in.
//
// Both lookups widened the segment by EPSILON before testing it. EPSILON is the
// tolerance between two Addresses — 40 ms of source — so the source lookup
// swallowed any segment shorter than that, and the Timeline lookup was not even
// a source quantity: 0.04 Timeline units, which under compression spans several
// whole segments. The two then disagreed, which is worse than either being
// wrong alone: a distance measured with the right segment was inverted with an
// earlier segment's weight, so x(σ) stopped being invertible and every Step and
// Nudge built on that round trip landed short. Deep inside nested compression a
// one-quantum Nudge advanced a fiftieth of a quantum, which read as nothing at
// all.
{
  const duration = 296;
  const range = { start: 0, end: duration };
  const nested = createGuide("round-trip");
  // Two compressions composing to 1/64, against an expansion of 16, so segments
  // on both sides are far shorter than the tolerance that used to be added.
  createSectionFromTimes(nested, 3.2, 102.56, { weighting: 0.125 });
  createSectionFromTimes(nested, 83.98, 102.56, { weighting: 0.125 });
  createSectionFromTimes(nested, 102.56, 126.8, { weighting: 4 });
  createSectionFromTimes(nested, 103.37, 123.23, { weighting: 4 });
  const projection = projectionForModel({
    duration, guide: nested, range, neighborhood: { C: 0 }, stepDistance: null
  });

  let worstIdentity = 0;
  for (let sample = 0; sample <= 20000; sample += 1) {
    const source = (sample / 20000) * duration;
    worstIdentity = Math.max(
      worstIdentity,
      Math.abs(projection.timelineToSource(projection.sourceToTimeline(source)) - source)
    );
  }
  assert.ok(worstIdentity < 1e-6,
    `Timeline Space is invertible everywhere (worst error ${worstIdentity}).`);

  // The property every Step and Nudge actually rests on: a source displacement
  // converted to a Timeline distance and stepped must arrive where it asked.
  let worstStep = 0;
  for (const displacement of [1 / 24, 0.25, 0.5, 1, 5]) {
    for (let sample = 0; sample <= 2000; sample += 1) {
      const source = (sample / 2000) * (duration - displacement);
      const wanted = source + displacement;
      const distance = Math.abs(
        projection.sourceToTimeline(wanted) - projection.sourceToTimeline(source)
      );
      worstStep = Math.max(
        worstStep,
        Math.abs(projection.stepTarget(source, distance, "forward", range) - wanted)
      );
    }
  }
  assert.ok(worstStep < 1e-6,
    `A Step of a converted source displacement lands on it, at every composed Weight (worst error ${worstStep}).`);
}

console.log("Timeline weight projection tests passed: including an exactly invertible map whose Step round trip closes at every composed Weight.");
