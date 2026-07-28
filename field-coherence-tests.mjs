import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSession,
  setStepReach,
  step,
  returnState,
  normalizeStepReach,
  MIN_STEP_REACH_SECONDS,
  MAX_STEP_REACH_SECONDS
} from "./session.js";
import { getActionRanges, normalizeDirectionalReach } from "./range-geometry.js";
import {
  deriveFieldBounds,
  chooseDirectionalRate,
  fieldPreferenceRequiresEstablish,
  createStepFieldController,
  normalizeFieldResponse
} from "./step-field.js";

assert.deepEqual(normalizeStepReach(8), { backward: 8, forward: 8, linked: true });
assert.deepEqual(normalizeDirectionalReach({ backward: 5, forward: 15, linked: false }), {
  backward: 5, forward: 15, linked: false
});
assert.deepEqual(normalizeStepReach({ backward: 5, forward: 15, linked: true }), {
  backward: 15, forward: 15, linked: true
});
assert.deepEqual(normalizeStepReach({ backward: 0.01, forward: 900, linked: false }), {
  backward: MIN_STEP_REACH_SECONDS,
  forward: MAX_STEP_REACH_SECONDS,
  linked: false
});
assert.equal(fieldPreferenceRequiresEstablish({ tailRate: 0.75 }), false);
assert.equal(fieldPreferenceRequiresEstablish({ leadRate: 1.5 }), false);
assert.equal(fieldPreferenceRequiresEstablish({ tailVisible: false }), true);
assert.equal(fieldPreferenceRequiresEstablish({ stepFieldEnabled: false }), true);
assert.deepEqual(normalizeFieldResponse({ tailRate: 0.75, leadRate: 1.5 }), { tailRate: 0.75, leadRate: 1.5 });
assert.deepEqual(normalizeFieldResponse({ tailRate: 2, leadRate: 0.5 }), { tailRate: 0.5, leadRate: 2 });

{
  let session = createSession({ duration: 200, current: 100, stepReach: { backward: 5, forward: 15, linked: false } });
  let result = step(session, "forward");
  assert.equal(result.destination, 115);
  session = result.session;
  result = step(session, "backward");
  assert.equal(result.destination, 110, "Directional Steps form an explicit ratchet when offsets differ.");

  result = setStepReach(session, { backward: 10, forward: 10, linked: true });
  assert.deepEqual(result.session.model.stepReach, { backward: 10, forward: 10, linked: true });
  const restored = returnState(result.session);
  assert.deepEqual(restored.session.model.stepReach, { backward: 5, forward: 15, linked: false });
}

{
  const bounds = deriveFieldBounds({
    current: 50,
    stepReach: { backward: 5, forward: 15, linked: false },
    range: { start: 0, end: 100 }
  });
  assert.deepEqual(bounds.tail, { target: 45, reach: 5, constrained: false });
  assert.deepEqual(bounds.lead, { target: 65, reach: 15, constrained: false });
  assert.deepEqual(bounds.envelope, { start: 45, end: 65 });
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
  const originalYT = globalThis.YT;
  globalThis.YT = { Player() {} };
  let created = 0;
  const element = () => ({
    hidden: false, disabled: false, value: "", textContent: "", dataset: {},
    classList: { toggle() {} }, addEventListener() {}, setAttribute() {},
    replaceChildren() {}, appendChild() {}
  });
  const elements = new Map();
  const document = {
    hidden: false,
    createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  };
  const controller = createStepFieldController({
    document,
    getSnapshot: () => ({
      videoLoaded: true,
      videoId: "single-player-contract",
      current: 50,
      range: { start: 0, end: 100 },
      stepReach: { backward: 10, forward: 10, linked: true },
      transportKind: "playback",
      center: { time: 50, rate: 1, state: 1, availableRates: [0.5, 1, 2] }
    }),
    getPreferences: () => ({
      stepFieldEnabled: false,
      tailVisible: true,
      leadVisible: true,
      tailRate: 0.5,
      leadRate: 2
    }),
    createPlayer: () => { created += 1; return null; }
  });
  controller.tick();
  assert.equal(created, 0, "Disabling Step Field preserves the single-player reader boundary.");
  globalThis.YT = originalYT;
}

{
  const html = readFileSync("index.html", "utf8");
  const app = readFileSync("app.js", "utf8");
  const field = readFileSync("step-field.js", "utf8");
  const fieldCss = readFileSync("step-field.css", "utf8");
  const view = readFileSync("view.js", "utf8");
  const implementation = readFileSync("IMPLEMENTATION.md", "utf8");
  const readme = readFileSync("README.md", "utf8");

  for (const id of [
    "step-backward-seconds", "step-forward-seconds",
    "tail-rate-select", "lead-rate-select",
    "tail-field-toggle", "lead-field-toggle", "field-both-toggle",
    "field-transport-state", "field-rate-state"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));

  for (const retired of ["step-link", "continue", "context-action", "skim", "speed-select"]) {
    assert.doesNotMatch(html, new RegExp(`id=["']${retired}["']`));
  }
  assert.equal((html.match(/id=["']tail-rate-select["']/g) || []).length, 1);
  assert.equal((html.match(/id=["']lead-rate-select["']/g) || []).length, 1);
  assert.match(html, /id=["']tail-pane["'][\s\S]*id=["']player-tail["'][\s\S]*id=["']tail-rate-select["']/);
  assert.match(html, /id=["']lead-pane["'][\s\S]*id=["']player-lead["'][\s\S]*id=["']lead-rate-select["']/);
  assert.match(fieldCss, /\.step-pane-action\s*\{[\s\S]*z-index:\s*5/);
  assert.match(fieldCss, /\.pane-field-controls\s*\{[\s\S]*z-index:\s*7/);
  assert.match(fieldCss, /@media \(max-width: 680px\)[\s\S]*\.tail-pane\s*\{[\s\S]*grid-row:\s*2;/);
  assert.match(fieldCss, /@media \(max-width: 680px\)[\s\S]*\.lead-pane\s*\{[\s\S]*grid-row:\s*3;/);
  assert.match(fieldCss, /\.step-pane \.player-wrap[\s\S]*min-height:\s*200px/);
  assert.match(app, /setStepReach as setSessionStepReach/);
  assert.match(app, /stepReach: currentStepReach\(\)/);
  assert.match(app, /onHoldOffsets:[\s\S]*commitStepReach/);
  assert.match(app, /performStep\(selection\.direction, selection\.distance\)/);
  assert.match(app, /stepField\?\.translateToCurrent/);
  assert.match(field, /DEFAULT_FIELD_RESPONSE/);
  assert.match(field, /onAutoplayBlocked:[\s\S]*playback = "blocked"/);
  assert.match(field, /side\.adapter\?\.setRate\?\.\(1\)[\s\S]*ensureSidePlaying/);
  assert.match(view, /session\.model\.stepReach/);
  assert.match(app, /preferences\.stepReach = normalizeStepReach/);
  assert.match(implementation, /^# Binary YouTube Reader — Canonical Implementation/m);
  assert.doesNotMatch(readme, /Application Continue/);
  assert.doesNotMatch(readme, /Step Size/);
}

console.log("Field coherence tests passed: offsets own Step geometry, native playback owns activation, and Field controls remain local.");
