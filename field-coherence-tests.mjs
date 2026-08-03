import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSession,
  goTo,
  workFromExtent,
  refine,
  reopen,
  setStepReach,
  step,
  redo,
  returnState,
  normalizeStepReach,
  MIN_STEP_REACH_SECONDS,
  MAX_STEP_REACH_SECONDS
} from "./session.js";
import { getActionRanges, normalizeDirectionalReach } from "./range-geometry.js";
import {
  deriveFieldBounds,
  fieldPreferenceRequiresEstablish,
  createStepFieldController
} from "./step-field.js";
import { chooseNearestRate, breathRateFromResponse } from "./step-field-geometry.js";

assert.deepEqual(normalizeStepReach(8), {
  backward: 8,
  forward: 8,
  linked: true,
  mode: "fixed",
  fraction: 1 / 16
});
assert.deepEqual(normalizeDirectionalReach({ backward: 5, forward: 15, linked: false }), {
  backward: 5, forward: 15, linked: false
});
assert.deepEqual(normalizeStepReach({ backward: 5, forward: 15, linked: true }), {
  backward: 15, forward: 15, linked: true, mode: "fixed", fraction: 1 / 16
});
assert.deepEqual(normalizeStepReach({ backward: 0.01, forward: 900, linked: false }), {
  backward: MIN_STEP_REACH_SECONDS,
  forward: MAX_STEP_REACH_SECONDS,
  linked: false,
  mode: "fixed",
  fraction: 1 / 16
});
assert.equal(fieldPreferenceRequiresEstablish({ tailRate: 0.75 }), false);
assert.equal(fieldPreferenceRequiresEstablish({ leadRate: 1.5 }), false);
assert.equal(fieldPreferenceRequiresEstablish({ tailVisible: false }), false);
assert.equal(fieldPreferenceRequiresEstablish({ tailVisible: true }), true);
assert.equal(fieldPreferenceRequiresEstablish({ stepFieldEnabled: false }), false);
assert.equal(fieldPreferenceRequiresEstablish({ stepFieldEnabled: true }), true);
// A legacy saved side-rate pair migrates once into the nearest symmetric
// breathing rate; the two sides are never configured independently again.
assert.equal(breathRateFromResponse({ tailRate: 0.75, leadRate: 1.25 }), 0.25);
assert.equal(breathRateFromResponse({ tailRate: 0.5, leadRate: 2 }), 0.75);

{
  let session = createSession({ duration: 200, current: 100, stepReach: { backward: 5, forward: 15, linked: false } });
  let result = step(session, "forward");
  assert.equal(result.destination, 115);
  session = result.session;
  result = step(session, "backward");
  assert.equal(result.destination, 110, "Directional Steps form an explicit ratchet when offsets differ.");

  result = setStepReach(session, { backward: 10, forward: 10, linked: true });
  assert.deepEqual(result.session.model.stepReach, {
    backward: 10, forward: 10, linked: true, mode: "fixed", fraction: 1 / 16
  });
  const restored = returnState(result.session);
  assert.deepEqual(restored.session.model.stepReach, {
    backward: 5, forward: 15, linked: false, mode: "fixed", fraction: 1 / 16
  });
}

{
  let session = createSession({ duration: 100, current: 50 });
  assert.equal(session.model.lastOperator, null);

  let result = goTo(session, 60, { operator: "timeline" });
  assert.equal(result.session.model.lastOperator, "timeline");
  session = result.session;

  result = refine(session, "forward");
  assert.equal(result.session.model.lastOperator, "refineForward");
  session = result.session;

  result = reopen(session);
  assert.equal(result.session.model.lastOperator, "reopen");
  session = result.session;

  result = workFromExtent(session, { start: 20, end: 80 });
  assert.equal(result.session.model.lastOperator, "section");
  session = result.session;

  result = step(session, "backward");
  assert.equal(result.session.model.lastOperator, "stepBackward");
  const undone = returnState(result.session);
  assert.equal(
    undone.session.model.lastOperator,
    "section",
    "Undo must restore the preview owner with the semantic frame."
  );
  assert.equal(
    redo(undone.session).session.model.lastOperator,
    "stepBackward",
    "Redo must restore the preview owner with the traversed frame."
  );
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

// Breathing asks for the rate its current phase intends and takes the nearest
// the source actually offers, so direction-filtered selection is not a separate
// policy any more.
assert.equal(chooseNearestRate([0.25, 0.5, 1, 1.5, 2], 0.5), 0.5);
assert.equal(chooseNearestRate([0.25, 0.5, 1, 1.5, 2], 1.5), 1.5);
assert.equal(chooseNearestRate([1], 0.5), 1);

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
  const styles = readFileSync("styles.css", "utf8");
  const view = readFileSync("view.js", "utf8");
  const implementation = readFileSync("IMPLEMENTATION.md", "utf8");
  const readme = readFileSync("README.md", "utf8");

  for (const id of [
    "field-inner-offset", "field-outer-offset", "field-breath-rate",
    "tail-player-surface", "lead-player-surface",
    "field-both-toggle", "nudge-seconds",
    "field-transport-state", "field-rate-state"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));

  for (const retired of ["step-link", "continue", "context-action", "skim", "speed-select"]) {
    assert.doesNotMatch(html, new RegExp(`id=["']${retired}["']`));
  }
  assert.equal((html.match(/id=["']field-breath-rate["']/g) || []).length, 1,
    "One breathing-rate pair replaces the two independent side rate controls.");
  assert.equal((html.match(/id=["']field-both-toggle["']/g) || []).length, 1);
  assert.match(html, /id=["']tail-pane["'][\s\S]*id=["']player-tail["']/);
  assert.match(html, /id=["']lead-pane["'][\s\S]*id=["']player-lead["']/);
  assert.doesNotMatch(fieldCss, /\.step-pane-action/, "Side players must not use a transparent overlay element.");
  assert.match(fieldCss, /\.side-player-surface iframe[\s\S]*pointer-events:\s*none/);
  assert.match(
    fieldCss,
    /\.pane-field-controls\s*\{[\s\S]*display:\s*flex[\s\S]*justify-content:\s*center/
  );
  // The Nudge quantum and the Panorama's offsets are both remembered settings,
  // so both are Parameters. They used to be split across a Tune popover on the
  // Panorama and the Parameters panel, which meant the answer to "where is the
  // setting?" depended on which setting.
  assert.match(
    html,
    /id="parameter-panel"[\s\S]*id="nudge-seconds"[\s\S]*id="field-inner-offset"[\s\S]*id="field-outer-offset"[\s\S]*id="field-breath-rate"/,
    "Every remembered setting lives in Parameters."
  );
  assert.doesNotMatch(html, /center-field-settings/,
    "The Panorama keeps no settings popover of its own.");
  assert.doesNotMatch(field, /bindSideStepSurface/,
    "Step Field must expose geometry while the application owns the shared Step gesture.");
  assert.match(app, /tail-player-surface[\s\S]*bindStepPress\(control/);
  assert.match(app, /lead-player-surface[\s\S]*bindStepPress\(control/);
  assert.match(fieldCss, /\.pane-field-controls\s*\{[\s\S]*z-index:\s*7/);
  assert.match(
    fieldCss,
    /@container \(max-width: 680px\)[\s\S]*grid-template-areas:\s*"center"\s*"tail"\s*"lead"/,
    "Phone layout must explicitly stack Center, Tail, Lead without relying on auto-placement."
  );
  assert.match(fieldCss, /\.step-pane \.player-wrap[\s\S]*min-height:\s*200px/);
  assert.match(
    styles,
    /\.center-transport-surface:hover:not\(:disabled\),[\s\S]*background:\s*transparent[\s\S]*transform:\s*none/,
    "Center hover may emphasize its transport icon but must not dim or shift the primary frame."
  );
  assert.match(app, /setStepReach as setSessionStepReach/);
  assert.match(app, /stepReach: currentFieldOffsets\(\)/);
  assert.match(app, /fieldFrame:\s*fieldOperatorPreview\(\)/);
  assert.match(
    app,
    /function fieldFrameRequest[\s\S]*FIELD_FRAME_OWNER\.CONTEXT[\s\S]*transport\.start[\s\S]*transport\.end/,
    "Context supplies the frozen observation window as the Frame's fixed edges."
  );
  assert.match(app, /const fieldFrames = createFieldFrameSequencer\(\)/,
    "One sequencer owns stable Field Frame identity and its revision.");
  assert.match(
    app,
    /function fieldStepPreview[\s\S]*kind,[\s\S]*projection\.stepTarget\([\s\S]*"backward"[\s\S]*projection\.stepTarget\([\s\S]*"forward"/,
    "Paused Field preview must consume the exact weighted Step destinations from the semantic owner."
  );
  assert.match(
    app,
    /fieldStepPreview\(center,\s*"pin"\)/,
    "Pin dragging must supply spatial Step targets rather than physical Field offsets."
  );
  assert.doesNotMatch(app, /onHoldOffsets:/);
  assert.doesNotMatch(field, /onHoldOffsets/);
  assert.match(app, /function changeFieldBoundary[\s\S]*state\.fieldBreath = normalizeFieldBreath/);
  assert.match(app, /seconds:\s*state\.contextSeconds/);
  assert.doesNotMatch(
    app,
    /fieldBreath\s*=\s*[^;\n]*contextSeconds|contextSeconds\s*=\s*[^;\n]*fieldBreath/,
    "Context duration and the physical Field relation must remain independently owned."
  );
  assert.match(
    app,
    /function changeFieldBoundary[\s\S]*boundary === "inner"[\s\S]*Math\.min\(amount, breath\.outer\)[\s\S]*Math\.max\(amount, breath\.inner\)[\s\S]*stepField\?\.reconfigureOffset\?\.\(\)/,
    "0 < inner < outer is enforced against the sibling bound and reconciled once."
  );
  assert.doesNotMatch(
    app,
    /lastStepReachEdited|stepReachLastEdited/,
    "Field tuning must not write a dead or cross-owned Step direction preference."
  );
  assert.match(
    app,
    /performStep\(selection\.direction, selection\.distance,\s*\{[\s\S]*carryRetained: selection\.carryRetained === true/,
    "All Step surfaces must preserve the shared semantic transaction while optionally carrying a retained Pin or Section."
  );
  assert.match(app, /stepField\?\.translateToCurrent/);
  assert.match(field, /BREATH_PHASE/);
  assert.doesNotMatch(field, /chooseDirectionalRate|requestStretchRate/,
    "The breathing runtime resolves rates from its phase, not from a side policy.");
  assert.match(field, /onAutoplayBlocked:[\s\S]*playback = "blocked"/);
  assert.match(field, /function beginStretch\(side, center, snapshot,[\s\S]*requestRate\(side, 1, true\)[\s\S]*side\.adapter\?\.play/,
    "Playback must refold and prime each side at 1× before directional divergence.");
  assert.match(field, /function driveSide\(role, center, snapshot, centerRunning, breathSide, participation\)[\s\S]*requestBreathRate\(side, breathSide\.rate\)/,
    "A breathing side must reconcile to the nearest supported rate for its current phase.");
  assert.match(view, /effectiveStepReach/);
  assert.match(app, /preferences\.stepReach = normalizeStepReach/);
  assert.match(implementation, /^# Video Cartography — Canonical Implementation/m);
  assert.doesNotMatch(readme, /Application Continue/);
  assert.match(readme, /Step size|Step Size/);
}

console.log("Field coherence tests passed: semantic Step size and physical Field offsets remain independent.");
