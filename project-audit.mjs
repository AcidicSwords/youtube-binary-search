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
const field = read("step-field.js");
const fieldGeometry = read("step-field-geometry.js");
const transport = read("transport.js");
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
  "traversal.js"
]) {
  assert.equal(existsSync(retiredArtifact), false, `Retired installation artifact remains: ${retiredArtifact}`);
}

const docs = Object.fromEntries([
  "README.md", "SPEC.md", "IMPLEMENTATION.md", "INTERFACE.md", "DEVELOPMENT.md", "VALIDATION.md"
].map(path => [path, read(path)]));

assert.equal(pkg.version, "5.8.3");
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
assert.match(html, /id="tail-pane"[\s\S]*id="player-tail"[\s\S]*id="tail-rate-select"[\s\S]*id="tail-field-toggle"[\s\S]*id="tail-step-button"/,
  "Tail controls must remain object-local beneath its player.");
assert.match(html, /id="lead-pane"[\s\S]*id="player-lead"[\s\S]*id="lead-rate-select"[\s\S]*id="lead-field-toggle"[\s\S]*id="lead-step-button"/,
  "Lead controls must remain object-local beneath its player.");
assert.match(html, /id="guide-sections-panel"[\s\S]*id="section-capture"[\s\S]*id="sections-list"/);
assert.match(html, /id="guide-pins-panel"[\s\S]*id="pin-capture"[\s\S]*id="pins-list"/);

assert.match(styles, /--control-height:\s*40px/);
assert.match(styles, /--compact-control-height:\s*32px/);
assert.match(styles, /--touch:\s*48px/);
assert.equal((styles.match(/@media \(min-width: 1221px\)/g) || []).length, 1, "Desktop layout must have one owner.");
assert.doesNotMatch(fieldCss, /@media \(min-width: 1221px\)/, "Step Field CSS must not override application layout.");
assert.match(styles, /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward loop step-forward"[\s\S]*"pin-backward return pin-forward"/);
assert.match(fieldCss, /grid-template-columns:\s*minmax\(240px, 1fr\) minmax\(264px, 1\.1fr\) minmax\(240px, 1fr\)/);
assert.match(fieldCss, /\.pane-field-controls[\s\S]*z-index:\s*7/);
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

assert.doesNotMatch(app, /pins-access|focused-state|createSkimTransport|completeSkim|reachSkimDestination/);
assert.doesNotMatch(view, /pins-access-meta|focused-label|focused-state|\bskim\b/i);
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

assert.match(pkg.scripts.test, /v5\.8-regression-tests\.mjs/);
assert.doesNotMatch(pkg.scripts.test, /v5\.2-regression-tests\.mjs/);
assert.match(pkg.scripts.audit, /integration-check\.mjs/);
assert.match(pkg.scripts.audit, /project-audit\.mjs/);
assert.match(pkg.scripts.check, /npm run audit/);

console.log("Project audit passed: v5.8.3 documentation, shared Field activation, composable Step intervals, native playback settlement, Field ownership, Guide creation, operator geometry, CSS boundaries, and adapter contracts are coherent.");
