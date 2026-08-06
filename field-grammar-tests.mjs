import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PANORAMA_STATE,
  chooseNearestRate,
  derivePanorama,
  resolveFieldPhase,
  deriveObservedField
} from "./step-field-geometry.js";
import { createSession, saveExtentAsSection } from "./session.js";

const targets = derivePanorama(50, { backward: 10, forward: 10, linked: true }, { start: 0, end: 100 });
const unfolding = deriveObservedField({
  targets,
  phase: PANORAMA_STATE.UNFOLDING,
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
  targets: derivePanorama(60, { backward: 10, forward: 10, linked: true }, { start: 0, end: 100 }),
  phase: PANORAMA_STATE.HELD,
  centerAddress: 60,
  tailAddress: 50,
  leadAddress: 70,
  tailHeld: true,
  leadHeld: true
});
assert.equal(held.span.held, true);
assert.deepEqual({ start: held.span.start, end: held.span.end }, { start: 50, end: 70 });

assert.equal(chooseNearestRate([0.25, 0.5, 1, 1.5, 2], 0.6), 0.5);
assert.equal(chooseNearestRate([0.25, 0.5, 1, 1.5, 2], 1.8), 2);
assert.equal(chooseNearestRate([1], 0.5), 1);

assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 0 },
    { visible: true, available: true, held: true, offset: 0 }
  ]
}), PANORAMA_STATE.COINCIDENT, "Held zero-offset sides remain physically coincident.");
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 10 },
    { visible: true, available: true, held: true, offset: 10 }
  ]
}), PANORAMA_STATE.HELD);

let session = createSession({ duration: 100, current: 50 });
const retained = saveExtentAsSection(session, { start: 40, end: 60 }, "Field reading", "field-span");
assert.equal(retained.changed, true);
session = retained.session;
assert.equal(session.model.activeSpan, null, "Retaining a Field span must not manufacture a movement Interval.");
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
  "field-transport-state", "field-both-toggle", "panorama-window-fill",
  "field-inner-offset", "field-outer-offset", "field-breath-rate",
  "section-retain-form", "section-source", "pin-retain-form", "pin-current",
  "release", "retain", "focus-toggle", "shift-layer-toggle",
  "step-size-seconds", "step-mode-fixed", "step-mode-adaptive"
]) assert.match(html, new RegExp(`id=["']${id}["']`), `Missing Field/Guide control: ${id}`);

assert.match(app, /function applyPlayerEffect\(result[\s\S]*result\?\.activeSpan[\s\S]*startContext\(destination\)/,
  "Committed traversal must invoke automatic Context when enabled.");
assert.match(
  app,
  /const sideStep = role => event => \{[\s\S]*panorama\?\.getStepSelection[\s\S]*carryRetained: event\?\.altKey === true \|\| state\.carryModifier/
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
  /function stretch\(role = "both"\)[\s\S]*suspendedNow = suspensionRequired\(snapshot\)[\s\S]*resumeBreath\(runtime\.breath[\s\S]*beginStretch\(sides\[name\], center, snapshot, \{ play: centerRunning && !suspendedNow \}\)/,
  "Stretch must use live suspension state and resume the breathing cycle from its attained relation."
);
// A fresh leg is for discontinuities only: a scrub, a Range wrap, or Panorama
// returning after Center played alone. It restarts the phase, which is what
// makes an ordinary Weight-bucket change -- which never arrives here -- keep its
// direction, its offset and its deadline.
assert.match(fieldSource, /function startBreathCycle\(center, snapshot[\s\S]*restartPanoramaCycle\(runtime\.breath, configured, now\(\)\)[\s\S]*Math\.min\(bounds\.inner, bounds\.outer\)/,
  "A discontinuity must begin a fresh breath leg at the inner boundary and expand outward.");
assert.match(fieldSource, /function beginStretch\(side, center, snapshot,[\s\S]*requestRate\(side, 1, true\)[\s\S]*(?:adapter\?\.place|adapter\?\.cue)[\s\S]*side\.adapter\?\.play/,
  "Every running breath must prime its side at 1× before directional-rate discovery.");
assert.doesNotMatch(fieldSource, /onHoldOffsets/,
  "Hold and Stretch must never persist a measured runtime offset.");
assert.doesNotMatch(app, /onHoldOffsets:/,
  "The application must not expose a Hold-to-configuration write path.");
assert.match(app, /function changeFieldBoundary[\s\S]*state\.panoramaCycle = normalizeFieldBreath/,
  "Only explicit Inner/Outer Offset input may update the configured Field relation.");
assert.doesNotMatch(app, /state\.fieldOffsets\s*=/,
  "Two independent side Offsets are replaced by one bounded breathing relation.");
assert.match(fieldSource, /function beginStretch\(side, center, snapshot,[\s\S]*requestRate\(side, 1, true\)[\s\S]*side\.adapter\?\.play/,
  "Side playback must prime at 1× inside the same Stretch transition.");
assert.match(fieldSource, /function driveField\(center, centerDelta, snapshot, centerRunning\)[\s\S]*advanceBreath\(runtime\.breath/,
  "The whole Field breathes as one relation, so the state machine advances once per tick.");
assert.match(fieldSource, /function driveSide\(role, center, snapshot, centerRunning, breathSide, participation\)[\s\S]*ensureSidePlaying\(side\);\s*requestBreathRate\(side, breathSide\.rate\)/,
  "Breathing rate must be requested only after a side is running and its capabilities are observable.");
assert.match(css, /data-phase="unfolding"/);
assert.match(css, /data-phase="held"/);
assert.match(css, /panorama-window-fill/);
assert.match(packageJson.scripts.test, /field-grammar-tests\.mjs/);
assert.match(packageJson.scripts.check, /step-field-geometry\.js/);

console.log("Field grammar tests passed: automatic Context, independent Hold/Stretch offsets, Range looping, side Step, and Guide retention.");
