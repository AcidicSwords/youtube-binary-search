import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STEP_FIELD_PHASE,
  deriveStepField,
  chooseDirectionalRate,
  resolveFieldPhase,
  deriveObservedField
} from "./step-field-geometry.js";
import { createSession, saveExtentAsSection } from "./session.js";

const targets = deriveStepField(50, { backward: 10, forward: 10, linked: true }, { start: 0, end: 100 });
const unfolding = deriveObservedField({
  targets,
  phase: STEP_FIELD_PHASE.UNFOLDING,
  centerAddress: 54,
  tailAddress: 52,
  leadAddress: 58,
  tailHeld: false,
  leadHeld: false
});
assert.deepEqual(unfolding.span, {
  start: 52,
  end: 58,
  duration: 6,
  available: true,
  held: false
});

const held = deriveObservedField({
  targets: deriveStepField(60, { backward: 10, forward: 10, linked: true }, { start: 0, end: 100 }),
  phase: STEP_FIELD_PHASE.HELD,
  centerAddress: 60,
  tailAddress: 50,
  leadAddress: 70,
  tailHeld: true,
  leadHeld: true
});
assert.equal(held.span.held, true);
assert.deepEqual({ start: held.span.start, end: held.span.end }, { start: 50, end: 70 });

assert.equal(chooseDirectionalRate([0.25, 0.5, 1, 1.5, 2], 0.6, "tail"), 0.5);
assert.equal(chooseDirectionalRate([0.25, 0.5, 1, 1.5, 2], 1.8, "lead"), 2);
assert.equal(chooseDirectionalRate([1], 0.5, "tail"), null);
assert.equal(chooseDirectionalRate([1], 2, "lead"), null);

assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 0 },
    { visible: true, available: true, held: true, offset: 0 }
  ]
}), STEP_FIELD_PHASE.COINCIDENT, "Held zero-offset sides remain physically coincident.");
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 10 },
    { visible: true, available: true, held: true, offset: 10 }
  ]
}), STEP_FIELD_PHASE.HELD);

let session = createSession({ duration: 100, current: 50 });
const retained = saveExtentAsSection(session, { start: 40, end: 60 }, "Field reading", "field-span");
assert.equal(retained.changed, true);
session = retained.session;
assert.equal(session.model.interval, null, "Retaining a Field span must not manufacture a movement Interval.");
assert.equal(session.model.guide.sections.length, 1);
assert.equal(session.model.guide.pins.length, 2);
assert.equal(session.model.guide.sections[0].provenance, "field-span");

const html = readFileSync("index.html", "utf8");
const app = readFileSync("app.js", "utf8");
const fieldSource = readFileSync("step-field.js", "utf8");
const css = readFileSync("field-grammar.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

for (const retired of ["continue", "context-action", "skim", "speed-select", "field-span-loop", "field-span-retain", "loop"]) {
  assert.doesNotMatch(html, new RegExp(`id=["']${retired}["']`), `Retired playback control remains: ${retired}`);
}
for (const id of [
  "field-transport-state", "field-both-toggle", "field-span-fill",
  "tail-field-toggle", "lead-field-toggle",
  "section-capture", "section-source", "pin-capture", "pin-current",
  "release", "deform", "deform-down", "deform-up", "focus-toggle", "shift-layer-toggle",
  "step-size-seconds", "step-mode-fixed", "step-mode-adaptive"
]) assert.match(html, new RegExp(`id=["']${id}["']`), `Missing v5.8 Field/Guide control: ${id}`);

assert.match(app, /function applyPlayerEffect\(result[\s\S]*result\?\.interval[\s\S]*startContext\(destination\)/,
  "Committed traversal must invoke automatic Context when enabled.");
assert.match(
  app,
  /const sideStep = role => event => \{[\s\S]*stepField\?\.getStepSelection[\s\S]*carryRetained: event\?\.altKey === true \|\| state\.carryModifier/
);
assert.match(app, /bindStepPress\(control[\s\S]*tap:\s*tapStep/);
assert.match(
  app,
  /function rangeLoops\(\)[\s\S]*isProperRange\(activeRange\(\), model\(\)\.duration\)/,
  "Every proper Range must be the stable playback loop operand."
);
assert.match(app, /function wrapPlaybackRange\([\s\S]*rebasePlaybackTransport\(transport,\s*range\.start\)[\s\S]*placePlayer\(range\.start\)[\s\S]*resumeAt[\s\S]*player\.play\(\)/,
  "Range wrap must rebase the Field without a Session transaction.");
assert.doesNotMatch(app, /createLoopTransport|TRANSPORT_KIND\.LOOP|data-loop-section/);
assert.doesNotMatch(
  app,
  /transportMaterializedExtents|expandedExtents/,
  "Playback and Context must not mutate timeline weighting."
);
assert.match(app, /saveExtentAsSection/);
assert.doesNotMatch(app, /createSkimTransport|completeSkim|reachSkimDestination/);
assert.match(fieldSource, /FIELD_SIDE_MODE/);
assert.match(
  fieldSource,
  /function stretch\(role\)[\s\S]*suspendedNow = suspensionRequired\(snapshot\)[\s\S]*beginStretch\(side, center, snapshot, \{ play: centerRunning && !suspendedNow \}\)/,
  "Stretch must use live suspension state before delegating to the deterministic refold-then-diverge transition."
);
assert.match(fieldSource, /function beginStretch\(side, center, snapshot,[\s\S]*side\.offset = 0[\s\S]*requestRate\(side, 1, true\)[\s\S]*(?:adapter\?\.place|adapter\?\.cue)[\s\S]*side\.adapter\?\.play/,
  "Every running Stretch must refold to Center at 1× before future divergence.");
assert.doesNotMatch(fieldSource, /onHoldOffsets/,
  "Hold and Stretch must never persist a measured runtime offset.");
assert.doesNotMatch(app, /onHoldOffsets:/,
  "The application must not expose a Hold-to-configuration write path.");
assert.match(app, /function changeFieldOffset[\s\S]*state\.fieldOffsets = normalizeStepReach/,
  "Only explicit Offset input changes may update configured Field offsets.");
assert.match(fieldSource, /function beginStretch\(side, center, snapshot,[\s\S]*requestRate\(side, 1, true\)[\s\S]*side\.adapter\?\.play/,
  "Side playback must prime at 1× inside the same Stretch transition.");
assert.match(fieldSource, /function driveSide\(role, center, centerDelta, snapshot, centerRunning\)[\s\S]*requestStretchRate\(side\)/,
  "Directional rate must be requested only after a side is running and its capabilities are observable.");
assert.match(css, /data-phase="unfolding"/);
assert.match(css, /data-phase="held"/);
assert.match(css, /field-span-fill/);
assert.match(packageJson.scripts.test, /field-grammar-tests\.mjs/);
assert.match(packageJson.scripts.check, /step-field-geometry\.js/);

console.log("Field grammar tests passed: automatic Context, independent Hold/Stretch offsets, Range looping, side Step, and Guide retention.");
