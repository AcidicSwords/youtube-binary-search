import assert from "node:assert/strict";
import {
  FIELD_FRAME_DIRECTION,
  FIELD_FRAME_OWNER,
  deriveContextFrame,
  fieldFrameDirection,
  normalizeFieldFrame,
  retainContextFrame,
  transitionFieldFrame
} from "./field-frame.js";

const range = { start: 0, end: 100 };
const context = deriveContextFrame({ anchor: 50, range, seconds: 10, revision: 3 });
assert.deepEqual(context, {
  owner: FIELD_FRAME_OWNER.CONTEXT,
  kind: "context",
  start: 45,
  center: 50,
  end: 55,
  backwardDistance: 5,
  forwardDistance: 5,
  revision: 3,
  direction: FIELD_FRAME_DIRECTION.NONE
});
assert.deepEqual(deriveContextFrame({ anchor: 2, range, seconds: 10 }), {
  owner: FIELD_FRAME_OWNER.CONTEXT,
  kind: "context",
  start: 0,
  center: 2,
  end: 7,
  backwardDistance: 2,
  forwardDistance: 5,
  revision: 0,
  direction: FIELD_FRAME_DIRECTION.NONE
});
assert.equal(fieldFrameDirection(context, { ...context, center: 60 }), "forward");
assert.equal(fieldFrameDirection(context, { ...context, center: 40 }), "backward");
assert.equal(fieldFrameDirection(context, { ...context, center: 50 }), "none");
const next = normalizeFieldFrame({ owner: "operator", kind: "step", start: 50, center: 60, end: 70 }, range);
assert.equal(transitionFieldFrame(context, next, 4).direction, "forward");
assert.deepEqual(retainContextFrame(context, 53, range), {
  ...context,
  center: 53,
  backwardDistance: 8,
  forwardDistance: 2
});
console.log("All Field frame tests passed: stable Context geometry and directional slideshow transitions.");
