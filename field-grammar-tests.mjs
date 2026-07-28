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
import { createLoopTransport } from "./transport.js";

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

const loop = createLoopTransport({ anchor: 50, start: 40, end: 60, source: "section:test" });
assert.deepEqual({ start: loop.start, end: loop.end }, { start: 40, end: 60 });
assert.equal(loop.source, "section:test");
assert.equal(loop.cycles, 0);

const html = readFileSync("index.html", "utf8");
const app = readFileSync("app.js", "utf8");
const fieldSource = readFileSync("step-field.js", "utf8");
const css = readFileSync("field-grammar.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

for (const retired of ["continue", "context-action", "skim", "speed-select", "field-span-loop", "field-span-retain"]) {
  assert.doesNotMatch(html, new RegExp(`id=["']${retired}["']`), `Retired playback control remains: ${retired}`);
}
for (const id of [
  "loop", "field-transport-state", "field-both-toggle", "field-span-fill",
  "tail-field-toggle", "lead-field-toggle", "tail-step-button", "lead-step-button",
  "section-capture", "section-source", "pin-capture", "pin-current"
]) assert.match(html, new RegExp(`id=["']${id}["']`), `Missing v5.8 Field/Guide control: ${id}`);

assert.match(app, /function applyPlayerEffect\(result[\s\S]*result\?\.interval[\s\S]*startContext\(destination\)/,
  "Committed traversal must invoke automatic Context when enabled.");
assert.match(app, /function selectFieldSide\(selection\)[\s\S]*performStep\(selection\.direction, selection\.distance\)/);
assert.match(app, /function startLoopExtent\(extent[\s\S]*createLoopTransport/);
assert.match(app, /transport\.cycles \+= 1[\s\S]*placePlayer\(transport\.start\)[\s\S]*player\.play\(\)/,
  "Loop wrap must place at the frozen start and unpause without a Session transaction.");
assert.match(app, /data-loop-section/);
assert.match(app, /saveExtentAsSection/);
assert.doesNotMatch(app, /createSkimTransport|completeSkim|reachSkimDestination/);
assert.match(fieldSource, /FIELD_SIDE_MODE/);
assert.match(fieldSource, /function stretch\(role\)[\s\S]*const center = clamp\([\s\S]*snapshot\.center\?\.time[\s\S]*parkSide\(side, center\)/,
  "Stretch must snap/refold to the physical Center before future divergence.");
assert.match(fieldSource, /function hold\(role\)[\s\S]*onHoldOffsets/,
  "Holding mid-stretch must commit the measured offset as the new Step distance.");
assert.match(app, /commitStepReach\(next, "Hold Field Offset", \{ settle: false, translate: false \}\)/,
  "Holding a Field offset must not interrupt the Center playback that produced it.");
assert.match(fieldSource, /ensureSidePlaying\(side\)[\s\S]*requestStretchRate\(side\)/,
  "Side playback must prime before requesting a directional rate.");
assert.match(css, /data-phase="unfolding"/);
assert.match(css, /data-phase="held"/);
assert.match(css, /field-span-fill/);
assert.match(packageJson.scripts.test, /field-grammar-tests\.mjs/);
assert.match(packageJson.scripts.check, /step-field-geometry\.js/);

console.log("Field grammar tests passed: automatic Context, safe side-player parking, Hold/Stretch, side Step, frozen Loop, and Guide retention.");
