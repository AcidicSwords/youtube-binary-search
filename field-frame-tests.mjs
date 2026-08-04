import assert from "node:assert/strict";
import {
  FIELD_FRAME_OWNER,
  FIELD_FRAME_DIRECTION,
  classifyDirection,
  contextFrame,
  operatorFrame,
  directFrame,
  resolveFieldFrame,
  framesEqual,
  frameIdentity,
  frameTransition,
  createFieldFrameSequencer
} from "./field-frame.js";

const range = { start: 0, end: 100 };

// Direction classification
{
  assert.equal(classifyDirection(10, 20), FIELD_FRAME_DIRECTION.FORWARD);
  assert.equal(classifyDirection(20, 10), FIELD_FRAME_DIRECTION.BACKWARD);
  assert.equal(classifyDirection(20, 20), FIELD_FRAME_DIRECTION.NONE);
  assert.equal(classifyDirection(20, Number.NaN), FIELD_FRAME_DIRECTION.NONE);
}

// Context framing has priority and keeps its bounded edges
{
  const frame = contextFrame({ start: 40, end: 60, current: 50, range });
  assert.deepEqual(
    { owner: frame.owner, tail: frame.tail, center: frame.center, lead: frame.lead },
    { owner: FIELD_FRAME_OWNER.CONTEXT, tail: 40, center: 50, lead: 60 }
  );
  const moving = contextFrame({ start: 40, end: 60, current: 50, cursor: 55, range });
  assert.equal(moving.center, 55, "Context Center follows Cursor.");
  assert.equal(moving.tail, 40, "Context Tail is the frozen window start.");
  assert.equal(moving.lead, 60, "Context Lead is the frozen window end.");
  assert.equal(frameIdentity(frame), frameIdentity(moving),
    "A Cursor crossing its own Context window is not a new Frame.");
}

// Operator fallback framing
{
  const frame = operatorFrame({
    kind: "refine",
    center: 50,
    backward: 25,
    forward: 75,
    range
  });
  assert.equal(frame.owner, FIELD_FRAME_OWNER.OPERATOR);
  assert.equal(frame.kind, "refine");
  assert.deepEqual([frame.tail, frame.center, frame.lead], [25, 50, 75]);

  const unknown = operatorFrame({ kind: "nonsense", center: 50, backward: 40, forward: 60, range });
  assert.equal(unknown.kind, "step", "An unknown operator falls back to Step framing.");

  const clipped = operatorFrame({ center: 5, backward: -30, forward: 400, range });
  assert.deepEqual([clipped.tail, clipped.center, clipped.lead], [0, 5, 100]);

  const inverted = operatorFrame({ center: 50, backward: 70, forward: 30, range });
  assert.ok(inverted.tail <= inverted.center && inverted.center <= inverted.lead,
    "Tail must stay behind Center and Lead ahead of it.");
}

// Direct manipulation validation
{
  assert.equal(directFrame({ kind: "pin", start: 1, center: 2, end: 3, range }).owner,
    FIELD_FRAME_OWNER.DIRECT);
  assert.equal(directFrame({ kind: "current", start: 1, center: 2, end: 3, range }).kind, "current");
  assert.equal(directFrame({ kind: "made-up", start: 1, center: 2, end: 3, range }), null);
  assert.equal(directFrame({ kind: "pin", center: 2, end: 3, range }), null,
    "An incomplete direct request cannot acquire Frame ownership.");
  assert.equal(resolveFieldFrame(null), null);
}

// Transitions
{
  const first = operatorFrame({ center: 20, backward: 10, forward: 30, range });
  const second = operatorFrame({ center: 30, backward: 20, forward: 40, range });
  const forward = frameTransition(first, second);
  assert.equal(forward.direction, FIELD_FRAME_DIRECTION.FORWARD);
  assert.equal(forward.outgoing, 20, "The previous Current becomes the transient outgoing frame.");
  assert.equal(forward.reframed, true);
  const still = frameTransition(second, second);
  assert.equal(still.direction, FIELD_FRAME_DIRECTION.NONE);
  assert.equal(still.outgoing, null);
  assert.equal(framesEqual(second, second), true);
}

// Sequencer: one revision per semantic movement
{
  const sequencer = createFieldFrameSequencer();
  const a = sequencer.resolve({ kind: "step", center: 20, backward: 10, forward: 30, range });
  assert.equal(a.revision, 1);
  assert.equal(a.direction, FIELD_FRAME_DIRECTION.NONE, "The first Frame has no prior position.");

  const b = sequencer.resolve({ kind: "step", center: 30, backward: 20, forward: 40, range });
  assert.equal(b.revision, 2);
  assert.equal(b.direction, FIELD_FRAME_DIRECTION.FORWARD);
  assert.equal(b.outgoing, 20);

  const repeat = sequencer.resolve({ kind: "step", center: 30, backward: 20, forward: 40, range });
  assert.equal(repeat.revision, 2, "Republishing the same state creates no new Frame.");
  assert.equal(repeat.direction, FIELD_FRAME_DIRECTION.NONE);

  const back = sequencer.resolve({ kind: "step", center: 20, backward: 10, forward: 30, range });
  assert.equal(back.revision, 3);
  assert.equal(back.direction, FIELD_FRAME_DIRECTION.BACKWARD);
}

// Rapid same-direction traversal reads as one continuing slideshow
{
  const sequencer = createFieldFrameSequencer();
  const centers = [10, 20, 30, 40, 50];
  const seen = centers.map(center =>
    sequencer.resolve({ kind: "step", center, backward: center - 10, forward: center + 10, range })
  );
  assert.deepEqual(
    seen.slice(1).map(frame => frame.direction),
    Array(4).fill(FIELD_FRAME_DIRECTION.FORWARD)
  );
  assert.deepEqual(seen.map(frame => frame.revision), [1, 2, 3, 4, 5]);
  assert.deepEqual(
    [seen.at(-1).tail, seen.at(-1).center, seen.at(-1).lead],
    [40, 50, 60],
    "The Field settles on the latest resulting Frame."
  );
}

// Context beginning, moving and ending performs no side-frame reassignment
{
  const sequencer = createFieldFrameSequencer();
  const before = sequencer.resolve({
    owner: FIELD_FRAME_OWNER.CONTEXT,
    start: 45,
    end: 55,
    current: 50,
    range
  });
  const during = sequencer.resolve({
    owner: FIELD_FRAME_OWNER.CONTEXT,
    start: 45,
    end: 55,
    current: 50,
    cursor: 52,
    range
  });
  const after = sequencer.resolve({
    owner: FIELD_FRAME_OWNER.CONTEXT,
    start: 45,
    end: 55,
    current: 52,
    range
  });
  assert.equal(before.revision, 1);
  assert.equal(during.revision, 1, "Context transport must not reframe the sides.");
  assert.equal(after.revision, 1, "Context settlement changes no side-frame ownership.");
  assert.deepEqual([during.tail, during.lead], [45, 55]);
  assert.deepEqual([after.tail, after.lead], [45, 55]);
  assert.equal(after.center, 52, "Center equals the accepted Cursor after Context stops.");
}

// Direct manipulation overrides, then one transition restores the ambient Frame
{
  const sequencer = createFieldFrameSequencer();
  sequencer.resolve({ kind: "step", center: 50, backward: 40, forward: 60, range });
  const dragging = sequencer.resolve({
    owner: FIELD_FRAME_OWNER.DIRECT,
    kind: "current",
    start: 65,
    center: 70,
    end: 75,
    range
  });
  assert.equal(dragging.owner, FIELD_FRAME_OWNER.DIRECT);
  assert.equal(dragging.revision, 2);
  const restored = sequencer.resolve({ kind: "step", center: 50, backward: 40, forward: 60, range });
  assert.equal(restored.owner, FIELD_FRAME_OWNER.OPERATOR);
  assert.equal(restored.revision, 3, "Ending a gesture is exactly one transition back.");
  sequencer.reset();
  assert.equal(sequencer.revision(), 0);
  assert.equal(sequencer.current(), null);
}

console.log("Field Frame tests passed: ownership priority, stable identity, directional transitions, Context edge persistence, and direct-manipulation validation.");
