import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
const youtube = read("youtube.js");
const docs = Object.fromEntries([
  "README.md",
  "SPEC.md",
  "IMPLEMENTATION.md",
  "INTERFACE.md",
  "DEVELOPMENT.md",
  "VALIDATION.md"
].map(path => [path, read(path)]));

assert.equal(pkg.version, "5.7.0");
assert.equal(docs["SPEC.md"].startsWith("# Binary YouTube Reader — Canonical Specification\n"), true);
assert.equal(docs["IMPLEMENTATION.md"].startsWith("# Binary YouTube Reader — Canonical Implementation\n"), true);
assert.equal(docs["INTERFACE.md"].startsWith("# Binary YouTube Reader — Interface Grammar\n"), true);
for (const name of ["SPEC.md", "IMPLEMENTATION.md", "INTERFACE.md", "DEVELOPMENT.md", "VALIDATION.md"]) {
  assert.equal(docs["README.md"].includes("`" + name + "`"), true, `README must link ${name}`);
}

const canonicalText = [html, ...Object.values(docs)].join("\n");
assert.doesNotMatch(html, /Step size/i, "Visible interface vocabulary must use Reach.");
assert.match(docs["SPEC.md"], /scalar runtime Step size/, "Retired scalar vocabulary must remain explicitly classified as a non-contract.");
assert.doesNotMatch(canonicalText, /Canonical (Specification|Implementation) v\d/i, "Canonical documents must not embed stale release authority.");

assert.match(html, /player-panel[\s\S]*timeline-panel[\s\S]*command-workspace/, "Media, map, and command workspace must preserve their vertical order.");
assert.match(html, /command-workspace[\s\S]*parameter-panel[\s\S]*navigation-panel[\s\S]*guide-panel/, "Desktop command workspace must be Parameters | Operators | Guide.");
assert.doesNotMatch(html, /id="pins-access"/, "Guide access must not duplicate retained-Pin traversal inside the operator matrix.");
assert.doesNotMatch(html, /id="focused-state"/, "Focused Section state belongs to Guide, not playback or map controls.");
assert.match(html, /transport-actions[\s\S]*id="continue"[\s\S]*id="context-action"[\s\S]*id="skim"[\s\S]*id="loop"/, "Playback and observation actions must share one dock.");
assert.match(html, /id="tail-rate-select"[\s\S]*id="player-tail"/, "Tail rate must remain object-local.");
assert.match(html, /id="lead-rate-select"[\s\S]*id="player-lead"/, "Lead rate must remain object-local.");

assert.match(styles, /--control-height:\s*40px/);
assert.match(styles, /--compact-control-height:\s*32px/);
assert.match(styles, /--touch:\s*48px/);
assert.equal((styles.match(/@media \(min-width: 1221px\)/g) || []).length, 1, "Desktop layout must have one owner.");
assert.doesNotMatch(fieldCss, /@media \(min-width: 1221px\)/, "Step Field CSS must not override application layout.");
assert.match(styles, /grid-template-areas:[\s\S]*"\. reopen \."[\s\S]*"refine-backward \. refine-forward"[\s\S]*"step-backward return step-forward"[\s\S]*"pin-backward pin-current pin-forward"/);
assert.match(fieldCss, /grid-template-columns:[\s\S]*minmax\(250px, 1fr\)[\s\S]*minmax\(500px, 1\.62fr\)[\s\S]*minmax\(250px, 1fr\)/);
assert.match(grammarCss, /\.field-transport-bar[\s\S]*\.transport-actions[\s\S]*\.transport-readouts[\s\S]*\.transport-status/);

for (const dead of [
  "interaction-grid",
  "state-strip",
  "secondary-tools",
  "pins-access",
  "focused-state",
  "deck-spacer",
  "settings-popover",
  "guide-access"
]) {
  const selectorPattern = new RegExp(`\\.${dead}(?![A-Za-z0-9_-])`);
  assert.equal(selectorPattern.test(`${styles}\n${fieldCss}\n${grammarCss}`), false, `Dead CSS selector remains: ${dead}`);
}

assert.match(styles, /@media \(pointer: coarse\)[\s\S]*button,[\s\S]*summary,[\s\S]*input,[\s\S]*select[\s\S]*min-height: var\(--touch\)/);
assert.match(fieldCss, /@media \(pointer: coarse\)[\s\S]*\.pane-collapse[\s\S]*height: var\(--touch\)/);
assert.match(grammarCss, /@media \(pointer: coarse\)[\s\S]*\.field-transport[\s\S]*min-height: var\(--touch\)/);

assert.doesNotMatch(app, /pins-access|focused-state/, "Composition root must not bind removed duplicate controls.");
assert.doesNotMatch(view, /pins-access-meta|focused-label|focused-state/, "Projection layer must not render removed duplicate controls.");

assert.doesNotMatch(app, /const DEFAULT_FIELD_RESPONSE/, "Field response default must have one owner.");
assert.match(fieldGeometry, /export const DEFAULT_FIELD_RESPONSE/);
assert.match(fieldGeometry, /export function normalizeFieldResponse/);
assert.doesNotMatch(fieldGeometry, /stepSeconds/, "Runtime Field geometry must accept directional Reach only.");
assert.doesNotMatch(field, /globalThis\.YT/, "Step Field must use the YouTube adapter readiness boundary.");
assert.match(youtube, /export function isYouTubeApiReady/);
assert.equal((`${app}\n${field}\n${fieldGeometry}`.match(/new\s+(?:globalThis\.)?YT\.Player/g) || []).length, 0);
assert.equal((youtube.match(/new\s+globalThis\.YT\.Player/g) || []).length, 1);

assert.match(pkg.scripts.audit, /integration-check\.mjs/);
assert.match(pkg.scripts.audit, /project-audit\.mjs/);
assert.match(pkg.scripts.check, /npm run audit/);

console.log("Project audit passed: interface ownership, operator geometry, documentation authority, CSS boundaries, touch geometry, and adapter contracts are coherent.");
