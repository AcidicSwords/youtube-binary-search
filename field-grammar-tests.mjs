import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STEP_FIELD_PHASE,
  deriveStepField,
  chooseDirectionalRate,
  resolveFieldPhase,
  sideActivationMode,
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
assert.equal(sideActivationMode(unfolding.tail, unfolding.phase), "go");
assert.equal(sideActivationMode(unfolding.lead, unfolding.phase), "go");

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
assert.equal(sideActivationMode(held.tail, held.phase), "step");
assert.equal(sideActivationMode(held.lead, held.phase), "step");

const coincident = deriveObservedField({
  targets,
  phase: STEP_FIELD_PHASE.COINCIDENT,
  centerAddress: 50,
  tailAddress: 50,
  leadAddress: 50
});
assert.equal(sideActivationMode(coincident.tail, coincident.phase), null);
assert.equal(sideActivationMode(coincident.lead, coincident.phase), null);

assert.equal(chooseDirectionalRate([0.25, 0.5, 1, 1.5, 2], 0.6, "tail"), 0.5);
assert.equal(chooseDirectionalRate([0.25, 0.5, 1, 1.5, 2], 1.8, "lead"), 2);
assert.equal(chooseDirectionalRate([1], 0.5, "tail"), null);
assert.equal(chooseDirectionalRate([1], 2, "lead"), null);

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
assert.equal(session.model.interval, null, "Retaining Field Span must not manufacture a movement Interval.");
assert.equal(session.model.guide.sections.length, 1);
assert.equal(session.model.guide.pins.length, 2);
assert.equal(session.model.guide.sections[0].provenance, "field-span");

const loop = createLoopTransport({ anchor: 50, start: 40, end: 60, source: "field-span" });
assert.equal(loop.source, "field-span");
assert.equal(loop.anchor, 50);

const html = readFileSync("index.html", "utf8");
const app = readFileSync("app.js", "utf8");
const fieldSource = readFileSync("step-field.js", "utf8");
const css = readFileSync("field-grammar.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.doesNotMatch(html, /class="observation-dock"/, "Playback must not remain a flat dock of peer modes.");
for (const id of [
  "continue", "context-action", "skim", "loop", "field-span-state",
  "field-span-loop", "field-span-retain", "field-span-fill", "observation-settings"
]) assert.match(html, new RegExp(`id=["']${id}["']`), `Missing Field grammar control: ${id}`);

assert.match(app, /onSelect:\s*selectFieldSide/);
assert.match(app, /operator:\s*selection\.role === "tail" \? "fieldTail" : "fieldLead"/);
assert.match(app, /saveExtentAsSection/);
assert.match(app, /startLoopExtent\(heldFieldSpan\(\),\s*"field-span"/);
assert.doesNotMatch(app, /transport\.wrapped = true/, "Continue must not wrap the Field across Range boundaries.");
assert.match(fieldSource, /from "\.\/step-field-geometry\.js"/);
assert.match(fieldSource, /chooseDirectionalRate/);
assert.match(fieldSource, /adapter\?\.mute\?\.\(\)/);
assert.match(css, /data-phase="unfolding"/);
assert.match(css, /data-phase="held"/);
assert.match(css, /field-span-fill/);
assert.match(packageJson.scripts.test, /field-grammar-tests\.mjs/);
assert.match(packageJson.scripts.check, /step-field-geometry\.js/);

console.log("Field grammar tests passed.");
