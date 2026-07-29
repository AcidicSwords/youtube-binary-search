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
const field = read("step-field.js");
const fieldGeometry = read("step-field-geometry.js");
const rangeGeometry = read("range-geometry.js");
const stepGesture = read("step-gesture.js");
const transport = read("transport.js");
const youtube = read("youtube.js");
const guide = read("guide.js");
const temporalProjection = read("temporal-projection.js");
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
  assert.equal(existsSync(retiredArtifact), false, `Retired installation artifact remains: ${retiredArtifact}`);
}

const docs = Object.fromEntries([
  "README.md", "SPEC.md", "IMPLEMENTATION.md", "INTERFACE.md", "DEVELOPMENT.md", "VALIDATION.md"
].map(path => [path, read(path)]));

assert.equal(pkg.version, "6.0.0");
assert.equal(docs["SPEC.md"].startsWith("# Binary YouTube Reader — Canonical Specification\n"), true);
assert.equal(docs["IMPLEMENTATION.md"].startsWith("# Binary YouTube Reader — Canonical Implementation\n"), true);
assert.equal(docs["INTERFACE.md"].startsWith("# Binary YouTube Reader — Interface Grammar\n"), true);
for (const name of ["SPEC.md", "IMPLEMENTATION.md", "INTERFACE.md", "DEVELOPMENT.md", "VALIDATION.md"]) {
  assert.equal(docs["README.md"].includes("`" + name + "`"), true, `README must link ${name}`);
}

const canonicalText = [html, ...Object.values(docs)].join("\n");
assert.doesNotMatch(html, /Step size/i, "Visible interface vocabulary must use Offset or Step distance.");
assert.doesNotMatch(canonicalText, /Canonical (Specification|Implementation) v\d/i, "Canonical documents must not embed stale release authority.");
assert.doesNotMatch(docs["README.md"], /Application Continue|F\s+Skim|C\s+Context/,
  "README must describe native playback and automatic Context rather than retired commands.");

assert.match(html, /player-panel[\s\S]*timeline-panel[\s\S]*command-workspace/, "Field, map, and command workspace must preserve vertical order.");
assert.match(html, /command-workspace[\s\S]*parameter-panel[\s\S]*navigation-panel[\s\S]*guide-panel/, "Desktop command workspace must be Parameters | Operators | Guide.");
assert.doesNotMatch(html, /id="pins-access"|id="focused-state"/, "Removed duplicate surfaces must not return.");
for (const retired of ["continue", "context-action", "skim", "speed-select", "pin-current-meta", "step-link"]) {
  assert.doesNotMatch(html, new RegExp(`id="${retired}"`), `Retired UI id remains: ${retired}`);
}
assert.match(html, /id="tail-pane"[\s\S]*id="player-tail"[\s\S]*id="tail-step-button"[\s\S]*id="tail-field-toggle"[\s\S]*id="step-backward-seconds"[\s\S]*id="tail-rate-select"/,
  "Tail controls must mirror Lead from the outside edge toward Center.");
assert.match(html, /id="lead-pane"[\s\S]*id="player-lead"[\s\S]*id="lead-rate-select"[\s\S]*id="lead-field-toggle"[\s\S]*id="lead-step-button"/,
  "Lead controls must remain object-local beneath its player.");
assert.match(html, /id="guide-sections-panel"[\s\S]*id="section-capture"[\s\S]*id="sections-list"/);
assert.match(html, /id="guide-pins-panel"[\s\S]*id="pin-capture"[\s\S]*id="pins-list"/);
assert.doesNotMatch(html, /guide-tab-sources|guide-sources-panel|Potential structure/,
  "Unimplemented Sources must not occupy interface space.");
assert.doesNotMatch(`${styles}\n${fieldCss}`, /source-placeholder|guide-counts/,
  "Removed placeholder and duplicate-count projections must not retain CSS.");
assert.match(styles, /\.guide-tabs\s*\{[\s\S]*grid-template-columns:\s*1fr 1fr/,
  "The two implemented Guide tabs must not reserve a third empty track.");
assert.match(html, /<option value="interval">Working Section<\/option>/,
  "Section creation must name its semi-persistent operand accurately.");
assert.match(html, /<option value="selected-pins">Two selected Pins<\/option>/,
  "Any two selected Pins must be available as one linked Section.");
assert.match(html, /id="section-lane"/,
  "Expanded Section spans and collapsed Section Pins require one dedicated timeline lane.");
assert.match(html, /id="focus-working-section"[\s\S]*id="save-section"/,
  "Working Section focus must remain independent from explicit persistence.");
assert.match(
  html,
  /id="context-seconds"[^>]*type="number"[^>]*min="0"[^>]*max="300"[^>]*step="0\.25"/,
  "Context must accept bounded custom durations rather than a closed preset list."
);
assert.equal(
  (html.match(/Ctrl\/⌘ Z/g) || []).length,
  1,
  "The keyboard reference must not duplicate Undo."
);

assert.match(styles, /--control-height:\s*40px/);
assert.match(styles, /--compact-control-height:\s*32px/);
assert.match(styles, /--touch:\s*48px/);
assert.equal((styles.match(/@media \(min-width: 1221px\)/g) || []).length, 1, "Desktop layout must have one owner.");
assert.doesNotMatch(fieldCss, /@media \(min-width: 1221px\)/, "Step Field CSS must not override application layout.");
assert.match(styles, /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward loop step-forward"[\s\S]*"pin-backward switch-endpoint pin-forward"/);
assert.match(
  fieldCss,
  /grid-template-areas:\s*"tail center lead"[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.1fr\) minmax\(0, 1fr\)/
);
assert.match(fieldCss, /\.step-pane\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  "Pane content tracks must shrink instead of clipping Lead.");
assert.match(styles, /\.player-panel\s*\{[\s\S]*container-type:\s*inline-size/,
  "Step Field breakpoints must follow actual panel width.");
assert.match(fieldCss, /@container \(max-width: 1180px\)/);
assert.match(fieldCss, /\.pane-field-controls[\s\S]*z-index:\s*7/);
assert.match(fieldCss, /--field-step-track:[\s\S]*\.tail-field-controls[\s\S]*var\(--field-step-track\)/,
  "Mirrored controls must share named function-width tracks.");
assert.match(grammarCss, /field-span-fill/);
assert.doesNotMatch(grammarCss, /field-transport-bar|transport-actions|transport-readouts|transport-status/,
  "The retired generic playback dock must not retain CSS ownership.");

for (const dead of [
  "interaction-grid", "state-strip", "secondary-tools", "pins-access", "focused-state",
  "deck-spacer", "settings-popover", "guide-access", "capture-bar", "capture-actions",
  "step-field-settings", "link-setting", "number-setting"
]) {
  const selectorPattern = new RegExp(`\\.${dead}(?![A-Za-z0-9_-])`);
  assert.equal(selectorPattern.test(`${styles}\n${fieldCss}\n${grammarCss}`), false, `Dead CSS selector remains: ${dead}`);
}

assert.match(styles, /@media \(pointer: coarse\)[\s\S]*button,[\s\S]*summary,[\s\S]*input,[\s\S]*select[\s\S]*min-height: var\(--touch\)/);
assert.match(fieldCss, /@media \(pointer: coarse\)[\s\S]*\.pane-collapse[\s\S]*height: var\(--touch\)/);
assert.match(styles, /\.timeline-section-fold::after[\s\S]*inset:\s*-18px/,
  "The faint Fold marker must retain a practical coarse-pointer hit area.");

assert.doesNotMatch(app, /pins-access|focused-state|createSkimTransport|completeSkim|reachSkimDestination/);
assert.doesNotMatch(view, /pins-access-meta|focused-label|focused-state|\bskim\b/i);
assert.doesNotMatch(rangeGeometry, /\bskim\b|logSpeed|chooseSupportedRate/i,
  "Retired Skim mechanics must not remain in the Range kernel.");
assert.doesNotMatch(app, /const DEFAULT_FIELD_RESPONSE/, "Field response default must have one owner.");
assert.match(fieldGeometry, /export const DEFAULT_FIELD_RESPONSE/);
assert.match(fieldGeometry, /export function normalizeFieldResponse/);
assert.doesNotMatch(fieldGeometry, /stepSeconds|sideActivationMode/);
assert.doesNotMatch(field, /globalThis\.YT/, "Step Field must use the YouTube adapter readiness boundary.");
assert.match(youtube, /export function isYouTubeApiReady/);
assert.equal((`${app}\n${field}\n${fieldGeometry}`.match(/new\s+(?:globalThis\.)?YT\.Player/g) || []).length, 0);
assert.equal((youtube.match(/new\s+globalThis\.YT\.Player/g) || []).length, 1);
assert.match(transport, /PLAYBACK:\s*"playback"/);
assert.doesNotMatch(transport, /CONTINUE|SKIM/);
assert.doesNotMatch(transport, /isObservationalTransport/,
  "Transport ownership must branch on its explicit kind rather than a redundant classifier.");
assert.match(stepGesture, /createStepGestureController/);
assert.match(stepGesture, /bindStepPress/);
assert.match(app, /createStepGestureController[\s\S]*bindStepPress/);
assert.doesNotMatch(field, /bindSideStepSurface/,
  "The Field controller must expose Step geometry without owning a second DOM path.");
assert.match(session, /export function projectPlayback/);
assert.match(session, /export function completePlayback[\s\S]*projectPlayback/);
assert.match(session, /projectionForModel/);
assert.match(view, /projectPlayback[\s\S]*dataset\.live/);
assert.match(view, /dataset\.sectionCollapse/);
assert.match(view, /dataset\.sectionExpand/);
assert.match(app, /centerPauseRequest[\s\S]*handoffTransport/);
assert.match(app, /function startLoop\(\)[\s\S]*handoffTransport[\s\S]*currentInterval\(\)/);
assert.match(
  app,
  /function wrapLoopTransport\([\s\S]*transport\.cycles \+= 1[\s\S]*resumeAt/,
  "Natural end and polling must share one Loop-wrap implementation."
);

assert.match(pkg.scripts.test, /v5\.8-regression-tests\.mjs/);
assert.match(pkg.scripts.test, /temporal-projection-tests\.mjs/);
assert.match(pkg.scripts.test, /endpoint-transposition-tests\.mjs/);
assert.match(pkg.scripts.test, /semantic-composition-tests\.mjs/);
assert.match(pkg.scripts.test, /semantic-audit-probes\.mjs/);
assert.match(pkg.scripts.test, /step-gesture-tests\.mjs/);
assert.match(pkg.scripts["test:semantic"], /semantic-state-space-tests\.mjs/);
assert.match(pkg.scripts.test, /field-runtime-tests\.mjs/);
assert.doesNotMatch(pkg.scripts.test, /v5\.2-regression-tests\.mjs/);
assert.match(pkg.scripts.audit, /integration-check\.mjs/);
assert.match(pkg.scripts.audit, /project-audit\.mjs/);
assert.match(pkg.scripts.check, /npm run audit/);
assert.match(pkg.scripts.check, /step-gesture-smoke\.mjs/);
assert.match(pkg.scripts.check, /transport-coherence-smoke\.mjs/);
assert.match(pkg.scripts.check, /section-folding-smoke\.mjs/);
assert.match(docs["IMPLEMENTATION.md"], /step-gesture\.js/);
assert.match(docs["IMPLEMENTATION.md"], /temporal-projection\.js/);
assert.match(docs["SPEC.md"], /one Undo transaction/);
assert.match(docs["SPEC.md"], /Traversal Time/);
assert.match(docs["SPEC.md"], /source-contiguous/);
assert.match(docs["VALIDATION.md"], /each wrap places each side once/);
assert.match(guide, /collapsed:\s*options\.collapsed === true/);
assert.match(guide, /fold-topology-conflict/);
assert.match(temporalProjection, /export function createTemporalProjection/);
assert.match(temporalProjection, /expandedExtents/);
assert.doesNotMatch(temporalProjection, /player|document|window/,
  "Temporal projection must remain a pure semantic/presentation mapping.");

console.log("Project audit passed: v6 temporal folding, shared retained objects, source-contiguous playback, folded traversal, held-Step gestures, transport handoffs, mirrored Field controls, Guide ownership, CSS boundaries, and adapter contracts are coherent.");
