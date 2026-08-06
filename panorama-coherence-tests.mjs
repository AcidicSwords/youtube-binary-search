import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSession,
  goTo,
  workFromExtent,
  refine,
  reopen,
  setStepDistance,
  step,
  redo,
  undo,
  normalizeStepDistance,
  MIN_STEP_DISTANCE,
  MAX_STEP_DISTANCE
} from "./session.js";
import { getActionRanges, normalizeDirectionalReach } from "./range-geometry.js";
import {
  derivePanoramaBounds,
  panoramaPreferenceRequiresEstablish,
  createPanoramaController
} from "./panorama.js";
import { chooseNearestRate, sideRateStepFromResponse } from "./panorama-geometry.js";

assert.deepEqual(normalizeStepDistance(8), {
  backward: 8,
  forward: 8,
  linked: true,
  mode: "fixed",
  fraction: 1 / 16
});
assert.deepEqual(normalizeDirectionalReach({ backward: 5, forward: 15, linked: false }), {
  backward: 5, forward: 15, linked: false
});
assert.deepEqual(normalizeStepDistance({ backward: 5, forward: 15, linked: true }), {
  backward: 15, forward: 15, linked: true, mode: "fixed", fraction: 1 / 16
});
assert.deepEqual(normalizeStepDistance({ backward: 0.01, forward: 900, linked: false }), {
  backward: MIN_STEP_DISTANCE,
  forward: MAX_STEP_DISTANCE,
  linked: false,
  mode: "fixed",
  fraction: 1 / 16
});
assert.equal(panoramaPreferenceRequiresEstablish({ tailRate: 0.75 }), false);
assert.equal(panoramaPreferenceRequiresEstablish({ leadRate: 1.5 }), false);
assert.equal(panoramaPreferenceRequiresEstablish({ tailVisible: false }), false);
assert.equal(panoramaPreferenceRequiresEstablish({ tailVisible: true }), true);
assert.equal(panoramaPreferenceRequiresEstablish({ panoramaEnabled: false }), false);
assert.equal(panoramaPreferenceRequiresEstablish({ panoramaEnabled: true }), true);
// A legacy saved side-rate pair migrates once into the nearest symmetric
// cycling rate; the two sides are never configured independently again.
assert.equal(sideRateStepFromResponse({ tailRate: 0.75, leadRate: 1.25 }), 0.25);
assert.equal(sideRateStepFromResponse({ tailRate: 0.5, leadRate: 2 }), 0.75);

{
  let session = createSession({ duration: 200, current: 100, stepDistance: { backward: 5, forward: 15, linked: false } });
  let result = step(session, "forward");
  assert.equal(result.destination, 115);
  session = result.session;
  result = step(session, "backward");
  assert.equal(result.destination, 110, "Directional Steps form an explicit ratchet when offsets differ.");

  result = setStepDistance(session, { backward: 10, forward: 10, linked: true });
  assert.deepEqual(result.session.model.stepDistance, {
    backward: 10, forward: 10, linked: true, mode: "fixed", fraction: 1 / 16
  });
  const restored = undo(result.session);
  assert.deepEqual(restored.session.model.stepDistance, {
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
  const undone = undo(result.session);
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
  const bounds = derivePanoramaBounds({
    current: 50,
    stepDistance: { backward: 5, forward: 15, linked: false },
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

// Cycling asks for the rate its current phase intends and takes the nearest
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
  const controller = createPanoramaController({
    document,
    getSnapshot: () => ({
      videoLoaded: true,
      videoId: "single-player-contract",
      current: 50,
      range: { start: 0, end: 100 },
      stepDistance: { backward: 10, forward: 10, linked: true },
      transportKind: "playback",
      center: { time: 50, rate: 1, state: 1, availableRates: [0.5, 1, 2] }
    }),
    getPreferences: () => ({
      panoramaEnabled: false,
      tailVisible: true,
      leadVisible: true,
      tailRate: 0.5,
      leadRate: 2
    }),
    createPlayer: () => { created += 1; return null; }
  });
  controller.tick();
  assert.equal(created, 0, "Disabling Step Panorama preserves the single-player reader boundary.");
  globalThis.YT = originalYT;
}

{
  const html = readFileSync("index.html", "utf8");
  const app = readFileSync("app.js", "utf8");
  const field = readFileSync("panorama.js", "utf8");
  const panoramaCss = readFileSync("panorama.css", "utf8");
  const styles = readFileSync("styles.css", "utf8");
  const view = readFileSync("view.js", "utf8");
  const implementation = readFileSync("IMPLEMENTATION.md", "utf8");
  const readme = readFileSync("README.md", "utf8");

  for (const id of [
    "panorama-inner-offset", "panorama-outer-offset", "panorama-cycle-rate",
    "tail-player-surface", "lead-player-surface",
    "panorama-both-toggle", "nudge-distance",
    "panorama-transport-state", "panorama-rate-state"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));

  for (const retired of ["step-link", "continue", "context-action", "skim", "speed-select"]) {
    assert.doesNotMatch(html, new RegExp(`id=["']${retired}["']`));
  }
  assert.equal((html.match(/id=["']panorama-cycle-rate["']/g) || []).length, 1,
    "One cycling-rate pair replaces the two independent side rate controls.");
  assert.equal((html.match(/id=["']panorama-both-toggle["']/g) || []).length, 1);
  assert.match(html, /id=["']tail-pane["'][\s\S]*id=["']player-tail["']/);
  assert.match(html, /id=["']lead-pane["'][\s\S]*id=["']player-lead["']/);
  assert.doesNotMatch(panoramaCss, /\.step-pane-action/, "Side players must not use a transparent overlay element.");
  assert.match(panoramaCss, /\.side-player-surface iframe[\s\S]*pointer-events:\s*none/);
  assert.match(
    panoramaCss,
    /\.pane-panorama-controls\s*\{[\s\S]*display:\s*flex[\s\S]*justify-content:\s*center/
  );
  // The Nudge quantum and the Panorama's offsets are both remembered settings,
  // so both are State & Settings. They used to be split across a Tune popover on the
  // Panorama and the State & Settings panel, which meant the answer to "where is the
  // setting?" depended on which setting.
  assert.match(
    html,
    /id="parameter-panel"[\s\S]*id="nudge-distance"[\s\S]*id="panorama-inner-offset"[\s\S]*id="panorama-outer-offset"[\s\S]*id="panorama-cycle-rate"/,
    "Every remembered setting lives in State & Settings."
  );
  assert.doesNotMatch(html, /center-panorama-settings/,
    "The Panorama keeps no settings popover of its own.");
  assert.doesNotMatch(field, /bindSideStepSurface/,
    "Step Panorama must expose geometry while the application owns the shared Step gesture.");
  assert.match(app, /tail-player-surface[\s\S]*bindStepPress\(control/);
  assert.match(app, /lead-player-surface[\s\S]*bindStepPress\(control/);
  assert.match(panoramaCss, /\.pane-panorama-controls\s*\{[\s\S]*z-index:\s*7/);
  assert.match(
    panoramaCss,
    /@container \(max-width: 680px\)[\s\S]*grid-template-areas:\s*"center"\s*"tail"\s*"lead"/,
    "Phone layout must explicitly stack Center, Tail, Lead without relying on auto-placement."
  );
  assert.match(panoramaCss, /\.step-pane \.player-wrap[\s\S]*min-height:\s*200px/);
  assert.match(
    styles,
    /\.center-transport-surface:hover:not\(:disabled\),[\s\S]*background:\s*transparent[\s\S]*transform:\s*none/,
    "Center hover may emphasize its transport icon but must not dim or shift the primary frame."
  );
  assert.match(app, /setStepDistance as setSessionStepDistance/);
  assert.match(app, /stepDistance: currentPanoramaOffsets\(\)/);
  assert.match(app, /panoramaFrame:\s*panoramaOperatorPreview\(\)/);
  assert.match(
    app,
    /function panoramaFrameRequest[\s\S]*PANORAMA_FRAME_OWNER\.CONTEXT[\s\S]*transport\.start[\s\S]*transport\.end/,
    "Context supplies the frozen observation window as the Frame's fixed edges."
  );
  assert.match(app, /const panoramaFrames = createPanoramaFrameSequencer\(\)/,
    "One sequencer owns stable Panorama Frame identity and its revision.");
  assert.match(
    app,
    /function panoramaStepPreview[\s\S]*kind,[\s\S]*projection\.stepTarget\([\s\S]*"backward"[\s\S]*projection\.stepTarget\([\s\S]*"forward"/,
    "Paused Panorama preview must consume the exact weighted Step destinations from the semantic owner."
  );
  assert.match(
    app,
    /panoramaStepPreview\(center,\s*"pin"\)/,
    "Pin dragging must supply spatial Step targets rather than physical Panorama offsets."
  );
  assert.doesNotMatch(app, /onHoldOffsets:/);
  assert.doesNotMatch(field, /onHoldOffsets/);
  assert.match(app, /function changePanoramaBoundary[\s\S]*state\.panoramaCycle = normalizePanoramaCycle/);
  assert.match(app, /seconds:\s*state\.contextDuration/);
  assert.doesNotMatch(
    app,
    /panoramaCycle\s*=\s*[^;\n]*contextDuration|contextDuration\s*=\s*[^;\n]*panoramaCycle/,
    "Context duration and the physical Panorama relation must remain independently owned."
  );
  assert.match(
    app,
    /function changePanoramaBoundary[\s\S]*boundary === "inner"[\s\S]*Math\.min\(amount, cycle\.outer\)[\s\S]*Math\.max\(amount, cycle\.inner\)[\s\S]*panorama\?\.reconfigureOffset\?\.\(\)/,
    "0 < inner < outer is enforced against the sibling bound and reconciled once."
  );
  assert.doesNotMatch(
    app,
    /lastStepDistanceEdited|stepDistanceLastEdited/,
    "Panorama tuning must not write a dead or cross-owned Step direction preference."
  );
  assert.match(
    app,
    /performStep\(selection\.direction, selection\.distance,\s*\{[\s\S]*carryRetained: selection\.carryRetained === true/,
    "All Step surfaces must preserve the shared semantic transaction while optionally carrying a retained Pin or Section."
  );
  assert.match(app, /panorama\?\.translateToCurrent/);
  assert.match(field, /PANORAMA_DIRECTION/);
  assert.doesNotMatch(field, /chooseDirectionalRate|requestStretchRate/,
    "The cycling runtime resolves rates from its phase, not from a side policy.");
  assert.match(field, /onAutoplayBlocked:[\s\S]*playback = "blocked"/);
  assert.match(field, /function beginStretch\(side, center, snapshot,[\s\S]*requestRate\(side, 1, true\)[\s\S]*side\.adapter\?\.play/,
    "Playback must refold and prime each side at 1× before directional divergence.");
  assert.match(field, /function driveSide\(role, center, snapshot, centerRunning, cycleSide, participation\)[\s\S]*requestSideRateStep\(side, cycleSide\.rate\)/,
    "A cycling side must reconcile to the nearest supported rate for its current phase.");
  assert.match(view, /effectiveStepDistance/);
  assert.match(app, /preferences\.stepDistance = normalizeStepDistance/);
  assert.match(implementation, /^# Video Cartography — Canonical Implementation/m);
  assert.doesNotMatch(readme, /Application Continue/);
  assert.match(readme, /Step Distance/);
}

console.log("Panorama coherence tests passed: semantic Step Distance and physical Panorama offsets remain independent.");
