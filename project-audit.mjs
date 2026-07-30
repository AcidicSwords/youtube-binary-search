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
const projection = read("timeline-projection.js");
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
  "source-field.js",
  "source-field-tests.mjs",
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

assert.equal(pkg.version, "7.0.0");
assert.match(docs["SPEC.md"], /^# Binary YouTube Reader — Canonical Specification\r?\n/);
assert.match(docs["IMPLEMENTATION.md"], /^# Binary YouTube Reader — Canonical Implementation\r?\n/);
assert.match(docs["INTERFACE.md"], /^# Binary YouTube Reader — Interface Grammar\r?\n/);
for (const name of ["SPEC.md", "IMPLEMENTATION.md", "INTERFACE.md", "DEVELOPMENT.md", "VALIDATION.md"]) {
  assert.ok(docs["README.md"].includes(`\`${name}\``), `README must link ${name}`);
}

const canonicalText = [html, ...Object.values(docs)].join("\n");
assert.doesNotMatch(canonicalText, /\bApplication Continue\b|\bSkim\b|Fold Point proxy/i);
assert.doesNotMatch(canonicalText, /Pin Forward\/Backward replaces Interval/i);
assert.doesNotMatch(html, /id="loop"|id="pin-backward"|id="pin-forward"/);

assert.match(html, /player-panel[\s\S]*timeline-panel[\s\S]*command-workspace/);
assert.match(app, /"player-panel",[\s\S]*"timeline-panel",[\s\S]*"parameter-panel",[\s\S]*"navigation-panel"[\s\S]*\.inert = compact && open/);
assert.doesNotMatch(app, /elements\["reader-column"\]\.inert/,
  "Compact Guide must not inert the Guide nested inside reader-column.");
assert.match(html, /command-workspace[\s\S]*parameter-panel[\s\S]*navigation-panel[\s\S]*guide-panel/);
assert.match(html, /id="timeline-ruler"[\s\S]*id="section-lane"[\s\S]*id="pin-lane"/);
assert.match(html, /timeline-legend[\s\S]*timeline-key-sections[\s\S]*timeline-key-interval[\s\S]*timeline-key-pins/);
assert.match(html, /id="timeline-current-time"[\s\S]*id="cursor-time"/);
assert.doesNotMatch(html, /id="fold-lane"/);
assert.match(html, /id="step-size-settings"[\s\S]*id="step-mode-fixed"[\s\S]*id="step-mode-adaptive"/);
assert.match(html, /data-step-fraction="0\.03125"[\s\S]*data-step-fraction="0\.0625"[\s\S]*data-step-fraction="0\.125"/);
assert.match(html, /Manual lateral distance/);
assert.match(html, /active Range’s weighted timeline width/);
const deformOptions = html.match(
  /<select id="deform-weight-select"[\s\S]*?>([\s\S]*?)<\/select>/
)?.[1];
assert.ok(deformOptions, "Deform requires a visible timeline-weight selector.");
assert.deepEqual(
  [...deformOptions.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]),
  ["0.25", "0.5", "0.75", "1", "1.25", "1.5", "1.75", "2"],
  "Deform must copy the familiar Tail/Lead scale exactly."
);

assert.match(
  styles,
  /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward switch-endpoint step-forward"[\s\S]*"release deform focus"/
);
for (const area of [
  "#refine-backward { grid-area: refine-backward; }",
  "#switch-endpoint { grid-area: switch-endpoint; }",
  "#release { grid-area: release; }",
  ".deform-control { grid-area: deform; }",
  "#focus-toggle { grid-area: focus; }"
]) assert.ok(styles.includes(area), `Missing matrix area: ${area}`);

assert.match(styles, /\.timeline-section-span\.compressed[\s\S]*linear-gradient/);
assert.match(styles, /\.timeline-section-span\.expanded[\s\S]*linear-gradient/);
assert.doesNotMatch(styles, /\.timeline-section-control/);
assert.match(styles, /\.guide-section-weight/);
assert.match(styles, /\.guide-section-profile/);
assert.match(
  styles,
  /@media \(pointer: coarse\)[\s\S]*\.timeline-section-body[\s\S]*var\(--touch\)/
);
assert.match(styles, /\.timeline-pin[\s\S]*width:\s*var\(--pin-hit-size\)/);
assert.doesNotMatch(styles, /\.timeline-fold-/);
assert.match(styles, /--control-height:\s*40px/);
assert.match(styles, /--touch:\s*48px/);
assert.equal((styles.match(/@media \(min-width: 1240px\)/g) || []).length, 2);
assert.equal((fieldCss.match(/@media \(min-width: 1240px\)/g) || []).length, 1);
assert.match(fieldCss, /@container \(max-width: 860px\)/);
assert.doesNotMatch(grammarCss, /field-transport-bar|transport-actions|transport-readouts/);

assert.match(session, /STEP_REACH_MODE[\s\S]*FIXED:\s*"fixed"[\s\S]*ADAPTIVE:\s*"adaptive"/);
assert.match(session, /DEFAULT_STEP_FRACTION\s*=\s*1\s*\/\s*16/);
assert.match(session, /export function effectiveStepReach/);
assert.match(session, /export function localRefine/);
assert.match(session, /export function refine/);
assert.match(session, /export function stepToPin/);
assert.match(session, /export function releaseInterval/);
assert.match(session, /export function deformSection/);
assert.match(session, /export function setGuideSectionWeight/);
assert.match(session, /export function goToGuidePin/);
assert.match(session, /export function goToGuideSection/);
assert.match(session, /export function switchEndpoint[\s\S]*nextSide[\s\S]*departure:\s*retainedDeparture[\s\S]*arrival:\s*departure/);

assert.match(guide, /SECTION_WEIGHT_VALUES[\s\S]*0\.25[\s\S]*2/);
assert.match(guide, /export function setSectionWeight/);
assert.match(guide, /export function sectionsForPin/);
assert.match(guide, /function translatedPinIds[\s\S]*section\.startPinId[\s\S]*section\.endPinId/);
assert.doesNotMatch(guide, /fold-topology-conflict|collapsedFrontier/);

assert.match(projection, /export function createTimelineProjection/);
assert.match(projection, /buildSegments/);
assert.match(projection, /contributors\.reduce[\s\S]*product \* activeWeight/);
assert.match(projection, /orderedPinStops/);
assert.match(projection, /weightAtSource/);
assert.doesNotMatch(projection, /affinity|materializ|collapse|fold/i);
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
assert.match(app, /function deformWorkingOrSelected/);
assert.match(app, /function changeSectionWeight/);
assert.match(app, /function focusOrUnfocus/);

assert.doesNotMatch(app, /createSkimTransport|startLoop|wrapLoopTransport/);
assert.doesNotMatch(view, /dataset\.loopSection/);
assert.match(view, /dataset\.sectionWeight/);
assert.match(view, /timeline-section-span/);
assert.match(view, /SECTION_WEIGHT_VALUES/);
assert.doesNotMatch(view, /timeline-fold|foldContributors|sectionCollapse|sectionExpand/);
assert.match(view, /timeline-ruler-tick/);
assert.match(view, /packTimelineSectionLanes/);
assert.match(view, /timelinePinClusterGap/);
assert.match(view, /COARSE_TIMELINE_PIN_HIT_SIZE\s*=\s*48/);
assert.match(view, /TIMELINE_SECTION_HIT_WIDTH\s*=\s*28/);
assert.match(view, /TIMELINE_SECTION_MAX_LANES\s*=\s*5/);
assert.match(view, /--pin-hit-size/);
assert.doesNotMatch(view, /dataset\.(references|pinKind)/);
assert.doesNotMatch(view, /--section-lane|--section-band-height/);
assert.doesNotMatch(app, /else if \(plain && event\.key === " "\)/);

assert.match(stepGesture, /createStepGestureController/);
assert.match(stepGesture, /bindStepPress/);
assert.doesNotMatch(field, /bindSideStepSurface/);
assert.match(fieldGeometry, /DEFAULT_FIELD_RESPONSE/);
assert.doesNotMatch(fieldGeometry, /stepSeconds|sideActivationMode/);
assert.doesNotMatch(field, /globalThis\.YT/);
assert.doesNotMatch(app, /globalThis\.YT/);
assert.doesNotMatch(`${app}\n${field}`, /\.raw\?\.\(|\.raw\(\)/,
  "Composition and Field code must not reach through the YouTube adapter.");
assert.match(youtube, /export function isYouTubeApiReady/);
assert.match(youtube, /releaseKeyboardFocus\(activeElement\)/);
assert.equal((youtube.match(/new\s+globalThis\.YT\.Player/g) || []).length, 1);
assert.doesNotMatch(rangeGeometry, /\bskim\b|logSpeed|chooseSupportedRate/i);

for (const required of [
  "v5.8-regression-tests.mjs",
  "timeline-projection-tests.mjs",
  "v7-deformation-tests.mjs",
  "v7-coherence-tests.mjs",
  "transport-tests.mjs",
  "endpoint-transposition-tests.mjs",
  "semantic-composition-tests.mjs",
  "semantic-audit-probes.mjs",
  "step-gesture-tests.mjs",
  "field-coherence-tests.mjs"
]) assert.ok(pkg.scripts.test.includes(required), `Missing test gate: ${required}`);
assert.match(pkg.scripts["test:semantic"], /semantic-state-space-tests\.mjs/);
assert.match(pkg.scripts.check, /npm run test:semantic/);
assert.match(pkg.scripts.audit, /integration-check\.mjs/);
assert.match(pkg.scripts.audit, /project-audit\.mjs/);

assert.match(docs["SPEC.md"], /Timeline Space/);
assert.match(docs["SPEC.md"], /source-contiguous/);
assert.match(docs["SPEC.md"], /one Undo transaction/);
assert.match(docs["IMPLEMENTATION.md"], /step-gesture\.js/);
assert.match(docs["IMPLEMENTATION.md"], /timeline-projection\.js/);
assert.match(docs["IMPLEMENTATION.md"], /positive spatial/);
assert.match(docs["VALIDATION.md"], /each wrap rebases each available side at most once/);
assert.match(docs["VALIDATION.md"], /1\/32[\s\S]*1\/16[\s\S]*1\/8/);
assert.match(docs["INTERFACE.md"], /bounded five-lane visual band/);
assert.match(docs["INTERFACE.md"], /complete extent the Working Interval/);

console.log("Project audit passed: v7 matrix, independent Step sizing, weighted Section graph, source-contiguous Range playback, timeline presentation, module boundaries, and canonical documents agree.");
