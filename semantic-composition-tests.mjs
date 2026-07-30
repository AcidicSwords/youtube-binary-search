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
  switchEndpoint
} from "./session.js";
import {
  createGuide,
  createSectionFromTimes,
  nextPin,
  visiblePins
} from "./guide.js";

function assertLoopContained(session) {
  const { interval, range, resolution } = session.model;
  assert.ok(interval);
  assert.ok(interval.start >= resolution.L - EPSILON);
  assert.ok(interval.end <= resolution.R + EPSILON);
  assert.ok(resolution.L >= range.start - EPSILON);
  assert.ok(resolution.R <= range.end + EPSILON);
  for (const frame of [interval.departureFrame, interval.arrivalFrame]) {
    assert.ok(frame.resolution.L <= interval.start + EPSILON);
    assert.ok(frame.resolution.R >= interval.end - EPSILON);
  }
}

// Shift+Refine owns local binary subdivision by target membership. An inside
// midpoint shortens toward the preserved opposite endpoint; an outside midpoint
// replaces the Interval with the new traversal.
let composed = createSession({ duration: 100, current: 50 });
composed = goTo(composed, 70, { operator: "directA" }).session;
const replaced = localRefine(composed, "forward");
assert.equal(replaced.refineRelation, "replace");
assert.deepEqual(
  {
    start: replaced.session.model.interval.start,
    end: replaced.session.model.interval.end,
    departure: replaced.session.model.interval.departure,
    arrival: replaced.session.model.interval.arrival
  },
  { start: 70, end: 80, departure: 70, arrival: 80 }
);

const shortened = localRefine(composed, "backward");
assert.equal(shortened.refineRelation, "shorten");
assert.deepEqual(
  {
    start: shortened.session.model.interval.start,
    end: shortened.session.model.interval.end,
    departure: shortened.session.model.interval.departure,
    arrival: shortened.session.model.interval.arrival
  },
  { start: 50, end: 60, departure: 50, arrival: 60 }
);

const replacedPast = localRefine(switchEndpoint(composed).session, "forward");
assert.equal(replacedPast.refineRelation, "replace");
assert.deepEqual(
  {
    start: replacedPast.session.model.interval.start,
    end: replacedPast.session.model.interval.end,
    departure: replacedPast.session.model.interval.departure,
    arrival: replacedPast.session.model.interval.arrival
  },
  { start: 50, end: 75, departure: 50, arrival: 75 }
);
assertLoopContained(replacedPast.session);

// A direct Go remains a replacement boundary rather than silently inheriting
// the matrix anchor.
composed = replacedPast.session;
const beforeDirect = composed.model.resolution.C;
composed = goTo(composed, 90, { operator: "timeline" }).session;
assert.ok(Math.abs(composed.model.interval.departure - beforeDirect) <= EPSILON);
assert.ok(Math.abs(composed.model.interval.arrival - 90) <= EPSILON);

// Section endpoints are Pin operands. Pin Forward/Back is linear for
// Resolution, but each Pin hop records its own traversal Interval rather than
// stretching a Working Interval across every crossed Pin.
const guide = createGuide("semantic-composition");
createSectionFromTimes(guide, 20, 40, { label: "First" });
createSectionFromTimes(guide, 60, 80, { label: "Second" });
assert.equal(visiblePins(guide).length, 4);

let pinComposition = createSession({ duration: 100, current: 10, guide });
pinComposition = goTo(pinComposition, 20, { operator: "targetA" }).session;
pinComposition = switchEndpoint(pinComposition).session;
for (let pin = nextPin(guide, pinComposition.model.resolution.C, pinComposition.model.range);
  pin;
  pin = nextPin(guide, pinComposition.model.resolution.C, pinComposition.model.range)) {
  pinComposition = goTo(pinComposition, pin.t, {
    operator: "nextPin",
    mode: "linear"
  }).session;
  if (pin.t >= 80 - EPSILON) break;
}
assert.equal(pinComposition.model.interval.departure, 60);
assert.equal(pinComposition.model.interval.arrival, 80);
assert.deepEqual(
  { start: pinComposition.model.interval.start, end: pinComposition.model.interval.end },
  { start: 60, end: 80 }
);
assertLoopContained(pinComposition);

// Step, playback, and Pin traversal are the linear class. Step guards the
// approached Resolution midpoint; playback translates the approached endpoint;
// their Interval ownership remains distinct.
let linear = createSession({ duration: 200, current: 50 });
linear = goTo(linear, 70, { operator: "timeline" }).session; // 50—70—90
linear = step(linear, "forward", 5).session;
assert.deepEqual(linear.model.resolution, { L: 50, C: 75, R: 90, level: 0 });
assert.deepEqual(
  { start: linear.model.interval.start, end: linear.model.interval.end },
  { start: 50, end: 75 }
);
assertLoopContained(linear);

const playbackOrigin = snapshotModel(linear.model);
linear = completePlayback(linear, {
  departure: 75,
  current: 85,
  parentNeighborhood: playbackOrigin.resolution,
  parentResolutionBasis: playbackOrigin.resolutionBasis,
  returnModel: playbackOrigin
}).session;
assert.deepEqual(linear.model.resolution, { L: 50, C: 85, R: 100, level: 0 });
assert.deepEqual(
  { start: linear.model.interval.start, end: linear.model.interval.end },
  { start: 50, end: 85 }
);
assertLoopContained(linear);

linear = goTo(linear, 100, {
  operator: "nextPin",
  mode: "linear"
}).session;
assert.deepEqual(linear.model.resolution, { L: 50, C: 100, R: 115, level: 0 });
assert.deepEqual(
  {
    start: linear.model.interval.start,
    end: linear.model.interval.end,
    departure: linear.model.interval.departure,
    arrival: linear.model.interval.arrival
  },
  { start: 85, end: 100, departure: 85, arrival: 100 }
);
assertLoopContained(linear);

// Exhausted local discrimination and a true Range edge are distinct because
// their recovery operators are different.
const fine = { L: 49.98, C: 50, R: 50.02, level: 12 };
assert.deepEqual(getTargets(fine), { backward: null, forward: null });
assert.equal(refineBlockReason(fine, { start: 0, end: 100 }, "backward"), "resolution-limit");
assert.equal(
  refineBlockReason({ L: 0, C: 0, R: 10, level: 1 }, { start: 0, end: 100 }, "backward"),
  "range-start"
);

console.log("Semantic composition tests passed: membership-based Refine replacement/shortening, one-sided linear endpoint pushes, Interval containment, and truthful Refine limits.");
