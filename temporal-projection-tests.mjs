import assert from "node:assert/strict";
import {
  createGuide,
  createSectionFromTimes,
  ensurePin,
  nextPin,
  normalizeGuide,
  previousPin,
  resolveSection,
  setSectionCollapsed,
  translateSection,
  validateGuide
} from "./guide.js";
import {
  createTemporalProjection,
  projectionForModel
} from "./temporal-projection.js";
import {
  createRoot,
  getTargets,
  stepNeighborhood,
  stepTarget
} from "./range-geometry.js";
import {
  createSession,
  focusSection,
  leaveSection,
  saveExtentAsSection,
  setRange,
  setGuideSectionCollapsed,
  step,
  stepToPin
} from "./session.js";
import { deriveStepField } from "./step-field-geometry.js";
import { deriveContextWindow } from "./transport.js";

const close = (actual, expected, message) => {
  assert.ok(
    Math.abs(actual - expected) <= 1e-6,
    `${message}: ${actual} !== ${expected}`
  );
};

const guide = createGuide("fold-video");
const sectionA = createSectionFromTimes(guide, 30, 45, {
  label: "Section A",
  collapsed: true
}).section;
const projection = createTemporalProjection({ duration: 180, guide });

assert.equal(validateGuide(guide, 180), true);
assert.equal(projection.effectiveDuration, 165);
assert.equal(projection.sourceToTraversal(29), 29);
assert.equal(projection.sourceToTraversal(30), 30);
assert.equal(projection.sourceToTraversal(37.5), 30);
assert.equal(projection.sourceToTraversal(45), 30);
assert.equal(projection.sourceToTraversal(46), 31);
assert.equal(projection.traversalToSource(30, "backward"), 30);
assert.equal(projection.traversalToSource(30, "forward"), 45);
assert.equal(projection.sourceDistance(30, 45), 0);

// Plain Step is continuous in quotient distance. An exact knot landing uses
// directional affinity, while starting on the knot exits its outward face.
assert.equal(
  projection.sourceStep(29, 1, "forward", { start: 0, end: 180 }),
  45
);
close(
  projection.sourceStep(29, 1.1, "forward", { start: 0, end: 180 }),
  45.1,
  "Step remains continuous immediately beyond a Fold"
);
assert.equal(
  projection.sourceStep(45, 1, "forward", { start: 0, end: 180 }),
  46
);
assert.equal(
  projection.sourceStep(46, 1, "backward", { start: 0, end: 180 }),
  30
);
assert.equal(
  projection.sourceStep(46, 1, "backward", { start: 45, end: 180 }),
  45,
  "Range cannot leak through its visible Fold face"
);
assert.equal(
  stepTarget(29, 2, "forward", { start: 0, end: 180 }, projection.metric),
  46
);
assert.deepEqual(
  projection.projectExtent({ start: 27, end: 50 }),
  { start: 27, end: 35 }
);

// Observation is source-contiguous. Context never borrows the navigational
// quotient and therefore may begin or end inside hidden source.
assert.deepEqual(
  deriveContextWindow(29, { start: 0, end: 180 }, 4, projection),
  { start: 27, end: 31 }
);

assert.deepEqual(
  {
    tail: deriveStepField(
      46,
      { backward: 2, forward: 2, linked: false },
      { start: 0, end: 180 },
      projection
    ).tail.target,
    lead: deriveStepField(
      29,
      { backward: 2, forward: 2, linked: false },
      { start: 0, end: 180 },
      projection
    ).lead.target
  },
  { tail: 44, lead: 31 },
  "Field targets remain source-contiguous even when Step uses the quotient metric."
);

assert.deepEqual(
  getTargets(createRoot(0, 30, 180), projection.metric),
  { backward: 15, forward: 112.5 },
  "Refine bisects lateral traversal distance"
);
assert.deepEqual(
  stepNeighborhood(
    { L: 20, C: 29, R: 47, level: 1 },
    45,
    { start: 0, end: 180 },
    1,
    projection.metric
  ),
  { L: 20, C: 45, R: 47, level: 1 },
  "A zero-width Fold crossing must not push an endpoint that already has one-Step midpoint headroom."
);

// Shift+Step sees ordered endpoint Pins at one coordinate. Ordinary interior
// Pins remain hidden until the covering Fold materializes.
const before = ensurePin(guide, 20, { label: "Before" }).pin;
const after = ensurePin(guide, 60, { label: "After" }).pin;
const internal = ensurePin(guide, 37, { label: "Internal" }).pin;
const lower = nextPin(guide, before.t, { start: 0, end: 180 }, projection);
const upper = nextPin(guide, lower.t, { start: 0, end: 180 }, projection);
assert.equal(lower.t, 30);
assert.equal(upper.t, 45);
assert.equal(upper.traversal, lower.traversal);
assert.equal(previousPin(guide, after.t, { start: 0, end: 180 }, projection).t, 45);
assert.equal(
  projection.orderedPinStops({ start: 0, end: 180 })
    .some(stop => stop.id === internal.id),
  false
);

// Overlap, nesting, coincidence, and touching all compose as one normalized
// Fold union. Per-Section unfold changes only that contributor.
const nested = createSectionFromTimes(guide, 32, 36, {
  label: "Nested",
  collapsed: true
}).section;
const crossing = createSectionFromTimes(guide, 34, 50, {
  label: "Crossing",
  collapsed: true
}).section;
const touching = createSectionFromTimes(guide, 50, 60, {
  label: "Touching",
  collapsed: true
}).section;
let union = createTemporalProjection({ duration: 180, guide });
assert.equal(union.folds.length, 1);
assert.deepEqual(
  { start: union.folds[0].start, end: union.folds[0].end },
  { start: 30, end: 60 }
);
assert.equal(union.folds[0].sectionIds.length, 4);
assert.equal(setSectionCollapsed(guide, crossing.id, false).changed, true);
union = createTemporalProjection({ duration: 180, guide });
assert.equal(union.folds[0].sectionIds.includes(crossing.id), false);
assert.equal(validateGuide(guide, 180), true);

// Moving a Section moves its two shared endpoints only. Contained annotations
// and child Sections retain their independent source addresses.
setSectionCollapsed(guide, crossing.id, true);
const beforeInternal = internal.t;
const beforeNested = resolveSection(guide, nested.id);
const moved = translateSection(guide, sectionA.id, 5, 180);
assert.equal(moved.changed, true);
assert.deepEqual(
  { start: moved.section.start, end: moved.section.end },
  { start: 35, end: 50 }
);
assert.equal(internal.t, beforeInternal);
assert.deepEqual(
  {
    start: resolveSection(guide, nested.id).start,
    end: resolveSection(guide, nested.id).end
  },
  { start: beforeNested.start, end: beforeNested.end }
);

// Session composition: plain Step includes a zero-width Fold in source, while
// Pin traversal can visit the stacked endpoints without consuming distance.
let session = createSession({ duration: 180, current: 29 });
let result = saveExtentAsSection(session, { start: 30, end: 45 }, "Folded");
session = setGuideSectionCollapsed(result.session, result.value.section.id, true).session;
session = step(session, "forward", 1).session;
assert.equal(session.model.resolution.C, 45);
assert.deepEqual(
  { start: session.model.interval.start, end: session.model.interval.end },
  { start: 29, end: 45 }
);

let pinSession = createSession({
  duration: 180,
  current: 29,
  guide: session.model.guide
});
pinSession = stepToPin(pinSession, 30, "forward").session;
pinSession = stepToPin(pinSession, 45, "forward").session;
assert.deepEqual(
  {
    departure: pinSession.model.interval.departure,
    arrival: pinSession.model.interval.arrival
  },
  { departure: 29, arrival: 45 }
);

// Focus materializes the selected Fold union without mutating persisted flags;
// Unfocus restores the original projection. A hard Range cut materializes its
// Fold, while latent Current/Working endpoints do not.
const focused = focusSection(session, result.value.section.id);
assert.equal(focused.changed, true);
assert.equal(
  projectionForModel(focused.session.model).folds.some(fold =>
    fold.sectionIds.includes(result.value.section.id)
  ),
  false
);
assert.equal(
  resolveSection(
    focused.session.model.guide,
    result.value.section.id
  ).collapsed,
  true
);
const left = leaveSection(focused.session);
assert.equal(left.changed, true);
assert.equal(
  projectionForModel(left.session.model).folds.some(fold =>
    fold.sectionIds.includes(result.value.section.id)
  ),
  true
);

const partialRange = setRange(session, 35, 80, 45, "Partial Fold Range");
assert.equal(partialRange.changed, true);
assert.equal(
  projectionForModel(partialRange.session.model).folds.length,
  0
);
const latent = {
  ...session.model,
  resolution: createRoot(0, 37, 180),
  interval: {
    ...session.model.interval,
    start: 29,
    end: 37,
    departure: 29,
    arrival: 37
  }
};
assert.equal(
  projectionForModel(latent).folds.length,
  1,
  "Latent semantic state does not expose hidden Fold structure"
);

const persisted = normalizeGuide(
  JSON.parse(JSON.stringify(guide)),
  "fold-video"
);
assert.equal(persisted.version, 6);
assert.equal(persisted.sections.some(section => section.collapsed), true);

console.log("Temporal projection v6 tests passed.");
