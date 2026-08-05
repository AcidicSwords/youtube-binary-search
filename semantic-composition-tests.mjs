import assert from "node:assert/strict";
import {
  EPSILON,
  getTargets,
  refineBlockReason
} from "./range-geometry.js";
import {
  completePlayback,
  createSession,
  goTo,
  localRefine,
  snapshotModel,
  step,
  switchActiveEnd
} from "./session.js";
import {
  createGuide,
  createSectionFromTimes,
  nextPin,
  orderedPins
} from "./guide.js";

function assertLoopContained(session) {
  const { activeSpan, range, neighborhood } = session.model;
  assert.ok(activeSpan);
  assert.ok(activeSpan.start >= neighborhood.L - EPSILON);
  assert.ok(activeSpan.end <= neighborhood.R + EPSILON);
  assert.ok(neighborhood.L >= range.start - EPSILON);
  assert.ok(neighborhood.R <= range.end + EPSILON);
  for (const frame of [activeSpan.departureNeighborhood, activeSpan.arrivalNeighborhood]) {
    assert.ok(frame.neighborhood.L <= activeSpan.start + EPSILON);
    assert.ok(frame.neighborhood.R >= activeSpan.end - EPSILON);
  }
}

// Shift+Refine owns local binary subdivision by drawing the new
// Current-to-midpoint traversal, independent of the previous Interval.
let composed = createSession({ duration: 100, current: 50 });
composed = goTo(composed, 70, { operator: "directA" }).session;
const replaced = localRefine(composed, "forward");
assert.equal(replaced.refineRelation, "draw");
assert.deepEqual(
  {
    start: replaced.session.model.activeSpan.start,
    end: replaced.session.model.activeSpan.end,
    departure: replaced.session.model.activeSpan.departure,
    arrival: replaced.session.model.activeSpan.arrival
  },
  { start: 70, end: 85, departure: 70, arrival: 85 }
);

const replacedBackward = localRefine(composed, "backward");
assert.equal(replacedBackward.refineRelation, "draw");
assert.deepEqual(
  {
    start: replacedBackward.session.model.activeSpan.start,
    end: replacedBackward.session.model.activeSpan.end,
    departure: replacedBackward.session.model.activeSpan.departure,
    arrival: replacedBackward.session.model.activeSpan.arrival
  },
  { start: 40, end: 70, departure: 70, arrival: 40 }
);

const replacedPast = localRefine(switchActiveEnd(composed).session, "forward");
assert.equal(replacedPast.refineRelation, "draw");
assert.deepEqual(
  {
    start: replacedPast.session.model.activeSpan.start,
    end: replacedPast.session.model.activeSpan.end,
    departure: replacedPast.session.model.activeSpan.departure,
    arrival: replacedPast.session.model.activeSpan.arrival
  },
  { start: 50, end: 75, departure: 50, arrival: 75 }
);
assertLoopContained(replacedPast.session);

// A direct Go remains a replacement boundary rather than silently inheriting
// the matrix anchor.
composed = replacedPast.session;
const beforeDirect = composed.model.neighborhood.C;
composed = goTo(composed, 90, { operator: "timeline" }).session;
assert.ok(Math.abs(composed.model.activeSpan.departure - beforeDirect) <= EPSILON);
assert.ok(Math.abs(composed.model.activeSpan.arrival - 90) <= EPSILON);

// Section endpoints are Pin operands. Previous/Next Pin is linear for
// Resolution, but each Pin hop records its own traversal Interval rather than
// stretching a Active Span across every crossed Pin.
const guide = createGuide("semantic-composition");
createSectionFromTimes(guide, 20, 40, { label: "First" });
createSectionFromTimes(guide, 60, 80, { label: "Second" });
assert.equal(orderedPins(guide).length, 4);

let pinComposition = createSession({ duration: 100, current: 10, guide });
pinComposition = goTo(pinComposition, 20, { operator: "targetA" }).session;
pinComposition = switchActiveEnd(pinComposition).session;
for (let pin = nextPin(guide, pinComposition.model.neighborhood.C, pinComposition.model.range);
  pin;
  pin = nextPin(guide, pinComposition.model.neighborhood.C, pinComposition.model.range)) {
  pinComposition = goTo(pinComposition, pin.t, {
    operator: "nextPin",
    mode: "linear"
  }).session;
  if (pin.t >= 80 - EPSILON) break;
}
assert.equal(pinComposition.model.activeSpan.departure, 60);
assert.equal(pinComposition.model.activeSpan.arrival, 80);
assert.deepEqual(
  { start: pinComposition.model.activeSpan.start, end: pinComposition.model.activeSpan.end },
  { start: 60, end: 80 }
);
assertLoopContained(pinComposition);

// Step, playback, and Pin traversal are the linear class. Step guards the
// approached Resolution midpoint; playback translates the approached endpoint;
// their Interval ownership remains distinct.
let linear = createSession({ duration: 200, current: 50 });
linear = goTo(linear, 70, { operator: "timeline" }).session; // 10—70—110
linear = step(linear, "forward", 5).session;
assert.deepEqual(linear.model.neighborhood, { L: 10, C: 75, R: 110, level: 0 });
assert.deepEqual(
  { start: linear.model.activeSpan.start, end: linear.model.activeSpan.end },
  { start: 50, end: 75 }
);
assertLoopContained(linear);

const playbackOrigin = snapshotModel(linear.model);
linear = completePlayback(linear, {
  departure: 75,
  current: 85,
  parentNeighborhood: playbackOrigin.neighborhood,
  parentResolutionBasis: playbackOrigin.neighborhoodBasis,
  returnModel: playbackOrigin
}).session;
assert.deepEqual(linear.model.neighborhood, { L: 10, C: 85, R: 120, level: 0 });
assert.deepEqual(
  { start: linear.model.activeSpan.start, end: linear.model.activeSpan.end },
  { start: 50, end: 85 }
);
assertLoopContained(linear);

linear = goTo(linear, 100, {
  operator: "nextPin",
  mode: "linear"
}).session;
assert.deepEqual(linear.model.neighborhood, { L: 10, C: 100, R: 135, level: 0 });
assert.deepEqual(
  {
    start: linear.model.activeSpan.start,
    end: linear.model.activeSpan.end,
    departure: linear.model.activeSpan.departure,
    arrival: linear.model.activeSpan.arrival
  },
  { start: 85, end: 100, departure: 85, arrival: 100 }
);
assertLoopContained(linear);

// Exhausted local discrimination and a true Range edge are distinct because
// their recovery operators are different.
const fine = { L: 49.98, C: 50, R: 50.02, level: 12 };
assert.deepEqual(getTargets(fine), { backward: null, forward: null });
assert.equal(refineBlockReason(fine, { start: 0, end: 100 }, "backward"), "refinement-limit");
assert.equal(
  refineBlockReason({ L: 0, C: 0, R: 10, level: 1 }, { start: 0, end: 100 }, "backward"),
  "range-start"
);

console.log("Semantic composition tests passed: Current-to-midpoint Local Refine drawing, one-sided linear endpoint pushes, Interval containment, and truthful Refine limits.");
