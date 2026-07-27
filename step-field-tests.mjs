import assert from "node:assert/strict";
import {
  STEP_FIELD_PHASE,
  deriveStepField,
  chooseNearestRate,
  hasCenterDiscontinuity,
  resolveFieldPhase
} from "./step-field.js";

{
  const field = deriveStepField(50, 10, { start: 0, end: 100 });
  assert.deepEqual(field, {
    center: 50,
    tail: { target: 40, distance: 10, available: true },
    lead: { target: 60, distance: 10, available: true }
  });
}

{
  const field = deriveStepField(4, 10, { start: 0, end: 12 });
  assert.equal(field.tail.target, 0);
  assert.equal(field.tail.distance, 4);
  assert.equal(field.lead.target, 12);
  assert.equal(field.lead.distance, 8);
}

assert.equal(chooseNearestRate([0.25, 0.5, 1, 1.5, 2], 0.5), 0.5);
assert.equal(chooseNearestRate([1, 1.25, 1.5], 2), 1.5);
assert.equal(chooseNearestRate([], 2), 1);

assert.equal(hasCenterDiscontinuity(10, 10.1), false);
assert.equal(hasCenterDiscontinuity(10, 6), true);
assert.equal(hasCenterDiscontinuity(10, 13), true);

assert.equal(resolveFieldPhase({ enabled: false, suspended: false, sides: [] }), STEP_FIELD_PHASE.OFF);
assert.equal(resolveFieldPhase({ enabled: true, suspended: true, sides: [] }), STEP_FIELD_PHASE.SUSPENDED);
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: false, offset: 2 },
    { visible: true, available: true, held: false, offset: 3 }
  ]
}), STEP_FIELD_PHASE.UNFOLDING);
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 10 },
    { visible: true, available: true, held: false, offset: 6 }
  ]
}), STEP_FIELD_PHASE.PARTIAL);
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 10 },
    { visible: true, available: true, held: true, offset: 10 }
  ]
}), STEP_FIELD_PHASE.HELD);

console.log("All Step Field tests passed.");
