import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSession,
  setStepReach,
  step,
  returnState,
  normalizeStepReach
} from "./session.js";
import {
  getActionRanges,
  normalizeDirectionalReach
} from "./range-geometry.js";
import {
  deriveFieldBounds,
  chooseDirectionalRate
} from "./step-field.js";

assert.deepEqual(normalizeStepReach(8), {
  backward: 8,
  forward: 8,
  linked: true
});
assert.deepEqual(normalizeDirectionalReach({
  backward: 5,
  forward: 15,
  linked: false
}), {
  backward: 5,
  forward: 15,
  linked: false
});

{
  let session = createSession({
    duration: 200,
    current: 100,
    stepReach: { backward: 5, forward: 15, linked: false }
  });
  let result = step(session, "forward");
  assert.equal(result.destination, 115);
  session = result.session;
  result = step(session, "backward");
  assert.equal(result.destination, 110, "Directional Steps form an explicit ratchet when Reach differs.");

  result = setStepReach(session, { backward: 10, forward: 10, linked: true });
  assert.equal(result.changed, true);
  assert.deepEqual(result.session.model.stepReach, {
    backward: 10,
    forward: 10,
    linked: true
  });
  const restored = returnState(result.session);
  assert.deepEqual(restored.session.model.stepReach, {
    backward: 5,
    forward: 15,
    linked: false
  }, "Return restores semantic Step Reach.");
}

{
  const bounds = deriveFieldBounds({
    current: 50,
    stepReach: { backward: 5, forward: 15, linked: false },
    range: { start: 0, end: 100 }
  });
  assert.deepEqual(bounds.tail, {
    target: 45,
    reach: 5,
    constrained: false
  });
  assert.deepEqual(bounds.lead, {
    target: 65,
    reach: 15,
    constrained: false
  });
  assert.deepEqual(bounds.envelope, { start: 45, end: 65 });
  assert.deepEqual(bounds.requestedReach, {
    backward: 5,
    forward: 15,
    linked: false
  });
}

{
  const actions = getActionRanges(
    { L: 0, C: 50, R: 100, level: 0 },
    { start: 0, end: 100 },
    null,
    50,
    { backward: 5, forward: 15, linked: false }
  );
  assert.equal(actions.stepBackward.destination, 45);
  assert.equal(actions.stepForward.destination, 65);
}

assert.equal(chooseDirectionalRate([0.25, 0.5, 1, 1.5, 2], 0.75, "tail"), 0.5);
assert.equal(chooseDirectionalRate([0.25, 0.5, 1, 1.5, 2], 1.75, "lead"), 1.5);
assert.equal(chooseDirectionalRate([1], 0.5, "tail"), null);
assert.equal(chooseDirectionalRate([1], 2, "lead"), null);

{
  const html = readFileSync("index.html", "utf8");
  const app = readFileSync("app.js", "utf8");
  const field = readFileSync("step-field.js", "utf8");
  const view = readFileSync("view.js", "utf8");

  for (const id of [
    "step-link",
    "step-backward-seconds",
    "step-forward-seconds",
    "tail-rate-select",
    "lead-rate-select",
    "field-transport-state",
    "field-rate-state"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));

  assert.doesNotMatch(html, /id=["']continue["'][^>]*sr-only/);
  assert.match(app, /setStepReach as setSessionStepReach/);
  assert.match(app, /stepReach: currentStepReach\(\)/);
  assert.match(app, /stepField\?\.play\(\)/);
  assert.match(field, /tailRate: 0\.5/);
  assert.match(field, /leadRate: 2/);
  assert.match(field, /onAutoplayBlocked:[\s\S]*playback = "blocked"/);
  assert.match(view, /session\.model\.stepReach/);
}

console.log("Field coherence v5.5 tests passed.");
