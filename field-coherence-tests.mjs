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
import {
  getActionRanges,
  normalizeDirectionalReach
} from "./range-geometry.js";
import {
  deriveFieldBounds,
  chooseDirectionalRate,
  fieldPreferenceRequiresEstablish,
  createStepFieldController,
  normalizeFieldResponse
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
assert.deepEqual(normalizeStepReach({ backward: 5, forward: 15, linked: true }), {
  backward: 15,
  forward: 15,
  linked: true
}, "Linked Reach is one canonical value.");
assert.deepEqual(normalizeStepReach({ backward: 0.01, forward: 900, linked: false }), {
  backward: MIN_STEP_REACH_SECONDS,
  forward: MAX_STEP_REACH_SECONDS,
  linked: false
}, "Reach normalization owns the same bounds as the UI.");
assert.equal(fieldPreferenceRequiresEstablish({ tailRate: 0.75 }), false);
assert.equal(fieldPreferenceRequiresEstablish({ leadRate: 1.5 }), false);
assert.equal(fieldPreferenceRequiresEstablish({ tailVisible: false }), true);
assert.equal(fieldPreferenceRequiresEstablish({ stepFieldEnabled: false }), true);
assert.deepEqual(normalizeFieldResponse({ tailRate: 0.75, leadRate: 1.5 }), { tailRate: 0.75, leadRate: 1.5 });
assert.deepEqual(normalizeFieldResponse({ tailRate: 2, leadRate: 0.5 }), { tailRate: 0.5, leadRate: 2 });

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
  const originalYT = globalThis.YT;
  globalThis.YT = { Player() {} };
  let created = 0;
  const element = () => ({
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    dataset: {},
    classList: { toggle() {} },
    addEventListener() {},
    setAttribute() {},
    replaceChildren() {},
    appendChild() {}
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
      transportKind: "continue",
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
  assert.equal(controller.play(), false);
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
    "step-link",
    "step-backward-seconds",
    "step-forward-seconds",
    "tail-rate-select",
    "lead-rate-select",
    "field-transport-state",
    "field-rate-state"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));

  assert.doesNotMatch(html, /id=["']continue["'][^>]*sr-only/);
  assert.equal((html.match(/id=["']tail-rate-select["']/g) || []).length, 1);
  assert.equal((html.match(/id=["']lead-rate-select["']/g) || []).length, 1);
  assert.match(html, /id=["']tail-pane["'][\s\S]*id=["']tail-rate-select["'][\s\S]*id=["']tail-collapse["']/);
  assert.match(html, /id=["']lead-pane["'][\s\S]*id=["']lead-rate-select["'][\s\S]*id=["']lead-collapse["']/);
  const tailPaneStart = html.indexOf('id="tail-pane"');
const tailRateControl = html.indexOf('id="tail-rate-select"', tailPaneStart);
const tailPlayerWrap = html.indexOf('class="player-wrap"', tailPaneStart);
const leadPaneStart = html.indexOf('id="lead-pane"');
const leadRateControl = html.indexOf('id="lead-rate-select"', leadPaneStart);
const leadPlayerWrap = html.indexOf('class="player-wrap"', leadPaneStart);
assert.ok(
  tailPaneStart >= 0 && tailRateControl > tailPaneStart && tailRateControl < tailPlayerWrap,
  "Tail rate control remains in the pane header before the player selection overlay."
);
assert.ok(
  leadPaneStart >= 0 && leadRateControl > leadPaneStart && leadRateControl < leadPlayerWrap,
  "Lead rate control remains in the pane header before the player selection overlay."
);
assert.match(fieldCss, /\.step-pane-bar\s*\{[\s\S]*z-index:\s*7/);
assert.match(fieldCss, /\.step-pane-action\s*\{[\s\S]*z-index:\s*5/);
  assert.match(fieldCss, /@media \(max-width: 680px\)[\s\S]*\.tail-pane\s*\{[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*2;/);
assert.match(fieldCss, /@media \(max-width: 680px\)[\s\S]*\.lead-pane\s*\{[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*3;/);
assert.match(fieldCss, /@media \(max-width: 680px\)[\s\S]*\.step-pane-side \.player-wrap\s*\{[\s\S]*min-height:\s*200px;/);
  assert.match(fieldCss, /@media \(pointer: coarse\)[\s\S]*\.pane-rate-setting select[\s\S]*min-height: var\(--touch\)/);
  assert.match(app, /setStepReach as setSessionStepReach/);
  assert.match(app, /stepReach: currentStepReach\(\)/);
  assert.match(app, /getPreferences:[\s\S]*tailRate: state\.fieldResponse\.tailRate[\s\S]*leadRate: state\.fieldResponse\.leadRate/);
  assert.match(app, /stepField\?\.play\(\)/);
  assert.match(field, /DEFAULT_FIELD_RESPONSE/);
  assert.doesNotMatch(field, /tailRate: 0\.5/);
  assert.doesNotMatch(field, /leadRate: 2/);
  assert.match(field, /onAutoplayBlocked:[\s\S]*playback = "blocked"/);
  assert.match(view, /session\.model\.stepReach/);
  assert.match(app, /stepReachLastEdited: preferences\.stepReachLastEdited/);
  assert.match(app, /preferences\.stepReach = normalizeStepReach/);
  assert.match(implementation, /^# Binary YouTube Reader — Canonical Implementation/m);
  assert.doesNotMatch(implementation, /sole visible Continue\/Pause authority/);
  assert.doesNotMatch(implementation, /^# Binary YouTube Reader v5\.1/m);
  assert.doesNotMatch(readme, /Step Size/);
  assert.match(readme, /Application Continue/);
}

console.log("Field coherence tests passed.");
