import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`./${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("index.html");
const styles = read("styles.css");
const fieldCss = read("step-field.css");
const grammarCss = read("field-grammar.css");
const app = read("app.js");
const view = read("view.js");
const session = read("session.js");
const guide = read("guide.js");
const projection = read("temporal-projection.js");
const transport = read("transport.js");
const field = read("step-field.js");
const fieldGeometry = read("step-field-geometry.js");
const rangeGeometry = read("range-geometry.js");
const stepGesture = read("step-gesture.js");
const youtube = read("youtube.js");

for (const retiredArtifact of [
  ".v5.2-patch-backup",
  "BRANCH_INSTALL.md",
  "DELETE_FILES.txt",
  "MANUAL_SMOKE.md",
  "PATCHSET.md",
  "SHA256SUMS",
  "TEST_REPORT.md",
  "structure.js",
  "traversal.js",
  "v5.2-regression-tests.mjs"
]) {
  assert.equal(existsSync(retiredArtifact), false, `Retired artifact remains: ${retiredArtifact}`);
}

const docs = Object.fromEntries([
  "README.md",
  "SPEC.md",
  "IMPLEMENTATION.md",
  "INTERFACE.md",
  "DEVELOPMENT.md",
  "VALIDATION.md"
].map(path => [path, read(path)]));

assert.equal(pkg.version, "6.0.0");
assert.ok(docs["SPEC.md"].startsWith("# Binary YouTube Reader — Canonical Specification\n"));
assert.ok(docs["IMPLEMENTATION.md"].startsWith("# Binary YouTube Reader — Canonical Implementation\n"));
assert.ok(docs["INTERFACE.md"].startsWith("# Binary YouTube Reader — Interface Grammar\n"));
for (const name of ["SPEC.md", "IMPLEMENTATION.md", "INTERFACE.md", "DEVELOPMENT.md", "VALIDATION.md"]) {
  assert.ok(docs["README.md"].includes(`\`${name}\``), `README must link ${name}`);
}

const canonicalText = [html, ...Object.values(docs)].join("\n");
assert.doesNotMatch(canonicalText, /\bApplication Continue\b|\bSkim\b|Fold Point proxy/i);
assert.doesNotMatch(canonicalText, /Pin Forward\/Backward replaces Interval/i);
assert.doesNotMatch(html, /id="loop"|id="pin-backward"|id="pin-forward"/);

assert.match(html, /player-panel[\s\S]*timeline-panel[\s\S]*command-workspace/);
assert.match(html, /command-workspace[\s\S]*parameter-panel[\s\S]*navigation-panel[\s\S]*guide-panel/);
assert.match(html, /id="timeline-ruler"[\s\S]*id="section-lane"[\s\S]*id="fold-lane"[\s\S]*id="pin-lane"/);
assert.match(html, /id="step-size-settings"[\s\S]*id="step-mode-fixed"[\s\S]*id="step-mode-adaptive"/);
assert.match(html, /data-step-fraction="0\.03125"[\s\S]*data-step-fraction="0\.0625"[\s\S]*data-step-fraction="0\.125"/);
assert.match(html, /Manual lateral distance/);
assert.match(html, /active Range’s lateral width/);

assert.match(
  styles,
  /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward switch-endpoint step-forward"[\s\S]*"release transpose focus"/
);
for (const area of [
  "#refine-backward { grid-area: refine-backward; }",
  "#switch-endpoint { grid-area: switch-endpoint; }",
  "#release { grid-area: release; }",
  "#transpose { grid-area: transpose; }",
  "#focus-toggle { grid-area: focus; }"
]) assert.ok(styles.includes(area), `Missing matrix area: ${area}`);

assert.match(styles, /\.timeline-fold-axis/);
assert.match(styles, /\.timeline-fold-pin\.offset-right::before/);
assert.match(styles, /\.timeline-fold-pin\.offset-left::before/);
assert.match(styles, /\.timeline-fold-rail\.interval-included/);
assert.match(styles, /@media \(pointer: coarse\)[\s\S]*\.timeline-fold-pin,[\s\S]*\.timeline-fold-hinge[\s\S]*width:\s*22px[\s\S]*\.timeline-fold-rail[\s\S]*width:\s*9px/);
assert.doesNotMatch(styles, /\.timeline-fold-(?:pin|hinge|rail)::after/);
assert.match(styles, /--control-height:\s*40px/);
assert.match(styles, /--touch:\s*48px/);
assert.equal((styles.match(/@media \(min-width: 1221px\)/g) || []).length, 1);
assert.doesNotMatch(fieldCss, /@media \(min-width: 1221px\)/);
assert.match(fieldCss, /@container \(max-width: 1180px\)/);
assert.doesNotMatch(grammarCss, /field-transport-bar|transport-actions|transport-readouts/);

assert.match(session, /STEP_REACH_MODE[\s\S]*FIXED:\s*"fixed"[\s\S]*ADAPTIVE:\s*"adaptive"/);
assert.match(session, /DEFAULT_STEP_FRACTION\s*=\s*1\s*\/\s*16/);
assert.match(session, /export function effectiveStepReach/);
assert.match(session, /export function localRefine/);
assert.match(session, /export function refine/);
assert.match(session, /export function stepToPin/);
assert.match(session, /export function releaseInterval/);
assert.match(session, /export function transposeSection/);
assert.match(session, /export function goToGuidePin/);
assert.match(session, /export function goToGuideSection/);
assert.match(session, /export function switchEndpoint[\s\S]*nextSide[\s\S]*departure:\s*retainedDeparture[\s\S]*arrival:\s*departure/);

assert.match(guide, /export function setSectionCollapsed/);
assert.match(guide, /export function sectionsForPin/);
assert.match(guide, /function translatedPinIds[\s\S]*section\.startPinId[\s\S]*section\.endPinId/);
assert.doesNotMatch(guide, /fold-topology-conflict|collapsedFrontier/);

assert.match(projection, /export function createTemporalProjection/);
assert.match(projection, /normalizeFoldUnion/);
assert.match(projection, /boundaryPins/);
assert.match(projection, /orderedPinStops/);
assert.match(projection, /expandedSectionIds/);
assert.match(projection, /expandedExtents/);
assert.doesNotMatch(projection, /player|document|window/);

assert.match(transport, /PLAYBACK:\s*"playback"/);
assert.match(transport, /CONTEXT:\s*"context"/);
assert.match(transport, /export function isProperRange/);
assert.match(transport, /export function rebasePlaybackTransport/);
assert.doesNotMatch(transport, /\bLOOP\s*:|CONTINUE|SKIM/);

assert.match(app, /preferences\.fieldOffsets/);
assert.doesNotMatch(app, /onHoldOffsets:/);
assert.doesNotMatch(field, /onHoldOffsets/);
assert.match(app, /function changeFieldOffset[\s\S]*state\.fieldOffsets\s*=/);
assert.match(app, /function setStepMode/);
assert.match(app, /function setStepFraction/);
assert.match(app, /function wrapPlaybackRange/);
assert.match(app, /rebasePlaybackTransport\(transport,\s*range\.start\)/);
assert.match(app, /function releaseWorkingInterval/);
assert.match(app, /function transposeWorkingOrSelected/);
assert.match(app, /function focusOrUnfocus/);

assert.doesNotMatch(app, /createSkimTransport|startLoop|wrapLoopTransport/);
assert.doesNotMatch(view, /dataset\.loopSection/);
assert.match(view, /dataset\.sectionCollapse/);
assert.match(view, /dataset\.sectionExpand/);
assert.match(view, /dataset\.foldContributors/);
assert.match(view, /timeline-fold-cursor/);
assert.match(view, /timeline-ruler-tick/);
assert.match(view, /hingePins[\s\S]*Math\.max\(18/);

assert.match(stepGesture, /createStepGestureController/);
assert.match(stepGesture, /bindStepPress/);
assert.doesNotMatch(field, /bindSideStepSurface/);
assert.match(fieldGeometry, /DEFAULT_FIELD_RESPONSE/);
assert.doesNotMatch(fieldGeometry, /stepSeconds|sideActivationMode/);
assert.doesNotMatch(field, /globalThis\.YT/);
assert.match(youtube, /export function isYouTubeApiReady/);
assert.equal((youtube.match(/new\s+globalThis\.YT\.Player/g) || []).length, 1);
assert.doesNotMatch(rangeGeometry, /\bskim\b|logSpeed|chooseSupportedRate/i);

for (const required of [
  "v5.8-regression-tests.mjs",
  "temporal-projection-tests.mjs",
  "v6-transposition-tests.mjs",
  "transport-tests.mjs",
  "endpoint-transposition-tests.mjs",
  "semantic-composition-tests.mjs",
  "semantic-audit-probes.mjs",
  "step-gesture-tests.mjs",
  "field-coherence-tests.mjs"
]) assert.ok(pkg.scripts.test.includes(required), `Missing test gate: ${required}`);
assert.match(pkg.scripts["test:semantic"], /semantic-state-space-tests\.mjs/);
assert.match(pkg.scripts.audit, /integration-check\.mjs/);
assert.match(pkg.scripts.audit, /project-audit\.mjs/);

assert.match(docs["SPEC.md"], /Traversal Time/);
assert.match(docs["SPEC.md"], /source-contiguous/);
assert.match(docs["SPEC.md"], /one Undo transaction/);
assert.match(docs["IMPLEMENTATION.md"], /step-gesture\.js/);
assert.match(docs["IMPLEMENTATION.md"], /temporal-projection\.js/);
assert.match(docs["VALIDATION.md"], /each wrap rebases each available side at most once/);
assert.match(docs["VALIDATION.md"], /1\/32[\s\S]*1\/16[\s\S]*1\/8/);

console.log("Project audit passed: v6 matrix, independent Step sizing, transposed Section graph, source-contiguous Range playback, timeline presentation, module boundaries, and canonical documents agree.");
