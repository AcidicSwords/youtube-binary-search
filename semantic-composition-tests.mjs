import assert from "node:assert/strict";
import {
  EPSILON,
  getTargets,
  refineBlockReason
} from "./range-geometry.js";
import {
  createSession,
  goTo,
  refine,
  switchEndpoint
} from "./session.js";
import {
  createGuide,
  createSectionFromTimes,
  nextPin,
  visiblePins
} from "./guide.js";

function locateWithRefine(session, target) {
  let current = session;
  let operations = 0;
  while (Math.abs(current.model.resolution.C - target) > EPSILON) {
    const direction = target < current.model.resolution.C ? "backward" : "forward";
    const result = refine(current, direction);
    assert.equal(result.changed, true, "A bracketed target must remain refinable.");
    current = result.session;
    operations += 1;
    assert.ok(operations < 32, "Binary location must converge.");
  }
  return current;
}

// Direct movement establishes the operand. Switch selects its other endpoint;
// all following matrix Refines edit that active endpoint without losing A.
const P = 40;
const A = 70;
const B = 13.375;
let composed = createSession({ duration: 100, current: P });
composed = goTo(composed, A, { operator: "directA" }).session;
composed = switchEndpoint(composed).session;
composed = locateWithRefine(composed, B);
assert.ok(Math.abs(composed.model.interval.departure - A) <= EPSILON);
assert.ok(Math.abs(composed.model.interval.arrival - B) <= EPSILON);
assert.ok(Math.abs(composed.model.interval.start - B) <= EPSILON);
assert.ok(Math.abs(composed.model.interval.end - A) <= EPSILON);

// A direct Go remains a replacement boundary rather than silently inheriting
// the matrix anchor.
const beforeDirect = composed.model.resolution.C;
composed = goTo(composed, 90, { operator: "timeline" }).session;
assert.ok(Math.abs(composed.model.interval.departure - beforeDirect) <= EPSILON);
assert.ok(Math.abs(composed.model.interval.arrival - 90) <= EPSILON);

// Section endpoints are Pin operands. Crossing the anchor may collapse the
// Interval, but the next matrix Pin establishes from that same Address and
// subsequent Pin crossings continue editing it.
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
    intervalMode: "edit"
  }).session;
  if (pin.t >= 80 - EPSILON) break;
}
assert.equal(pinComposition.model.interval.departure, 20);
assert.equal(pinComposition.model.interval.arrival, 80);
assert.deepEqual(
  { start: pinComposition.model.interval.start, end: pinComposition.model.interval.end },
  { start: 20, end: 80 }
);

// Exhausted local discrimination and a true Range edge are distinct because
// their recovery operators are different.
const fine = { L: 49.98, C: 50, R: 50.02, level: 12 };
assert.deepEqual(getTargets(fine), { backward: null, forward: null });
assert.equal(refineBlockReason(fine, { start: 0, end: 100 }, "backward"), "resolution-limit");
assert.equal(
  refineBlockReason({ L: 0, C: 0, R: 10, level: 1 }, { start: 0, end: 100 }, "backward"),
  "range-start"
);

console.log("Semantic composition tests passed: matrix endpoint editing, direct replacement, endpoint Pin traversal, collapse recovery, and truthful Refine limits.");
