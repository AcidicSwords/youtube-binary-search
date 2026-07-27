import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STEP_FIELD_PHASE,
  deriveFieldBounds,
  deriveStepField,
  chooseNearestRate,
  hasCenterDiscontinuity,
  resolveFieldPhase
} from "./step-field.js";

{
  const bounds = deriveFieldBounds({
    current: 50,
    stepSeconds: 10,
    range: { start: 0, end: 100 }
  });
  assert.deepEqual(bounds, {
    current: 50,
    requestedReach: { backward: 10, forward: 10, linked: true },
    tail: { target: 40, reach: 10, constrained: false },
    lead: { target: 60, reach: 10, constrained: false },
    envelope: { start: 40, end: 60 },
    constraint: "none"
  });

  const field = deriveStepField(50, 10, { start: 0, end: 100 });
  assert.equal(field.center, 50);
  assert.equal(field.tail.target, 40);
  assert.equal(field.tail.distance, 10);
  assert.equal(field.tail.available, true);
  assert.equal(field.lead.target, 60);
  assert.equal(field.lead.distance, 10);
  assert.equal(field.lead.available, true);
  assert.equal(field.constraint, "none");
}

{
  const field = deriveStepField(4, 10, { start: 0, end: 12 });
  assert.equal(field.tail.target, 0);
  assert.equal(field.tail.distance, 4);
  assert.equal(field.tail.constrained, true);
  assert.equal(field.lead.target, 12);
  assert.equal(field.lead.distance, 8);
  assert.equal(field.lead.constrained, true);
  assert.equal(field.constraint, "both");
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

{
  const html = readFileSync("index.html", "utf8");
  const css = readFileSync("step-field.css", "utf8");
  const app = readFileSync("app.js", "utf8");
  const fieldSource = readFileSync("step-field.js", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  for (const id of [
    "step-field", "player-tail", "player", "player-lead", "tail-step", "lead-step",
    "tail-collapse", "lead-collapse", "tail-restore", "lead-restore", "step-field-toggle"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing Step Field DOM id: ${id}`);
  }

  assert.match(app, /createStepFieldController/);
  assert.match(app, /onSelect:\s*selectFieldSide/);
  assert.match(app, /function selectFieldSide\(selection\)/);
  assert.match(app, /if \(selection\.mode === "step"\) \{\s*performStep\(selection\.direction\)/s);
  assert.doesNotMatch(app, /Recenter(?: Tail| Lead)?/i);
  assert.match(fieldSource, /setAttribute\?\.\("tabindex", "-1"\)/);
  assert.match(fieldSource, /setAttribute\?\.\("aria-hidden", "true"\)/);
  assert.match(fieldSource, /const fieldShown = loaded && prefs\.stepFieldEnabled/);
  assert.match(fieldSource, /if \(snapshot\.videoLoaded\) ensurePlayers\(prefs\)/);
  assert.match(css, /\.step-field\.field-off/);
  assert.match(css, /tail-collapsed/);
  assert.match(css, /lead-collapsed/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(min-width: 1221px\)/);
  assert.match(packageJson.scripts.check, /step-field\.js/);
  assert.match(packageJson.scripts.test, /step-field-tests\.mjs/);
}

console.log("All Step Field tests passed.");
