import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`./${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("index.html");
const styles = read("styles.css");
const fieldCss = read("step-field.css");
const grammarCss = read("field-grammar.css");
const app = read("app.js");
const field = read("step-field.js");
const fieldGeometry = read("step-field-geometry.js");
const youtube = read("youtube.js");
const docs = Object.fromEntries([
  "README.md", "SPEC.md", "IMPLEMENTATION.md", "DEVELOPMENT.md", "VALIDATION.md"
].map(path => [path, read(path)]));

assert.equal(pkg.version, "5.6.0");
assert.equal(docs["SPEC.md"].startsWith("# Binary YouTube Reader — Canonical Specification\n"), true);
assert.equal(docs["IMPLEMENTATION.md"].startsWith("# Binary YouTube Reader — Canonical Implementation\n"), true);
for (const name of ["SPEC.md", "IMPLEMENTATION.md", "DEVELOPMENT.md", "VALIDATION.md"]) {
  assert.equal(docs["README.md"].includes("`" + name + "`"), true, `README must link ${name}`);
}

const canonicalText = [html, ...Object.values(docs)].join("\n");
assert.doesNotMatch(html, /Step size/i, "Visible interface vocabulary must use Reach.");
assert.match(docs["SPEC.md"], /scalar runtime Step size/, "Retired scalar vocabulary must remain explicitly classified as a non-contract.");
assert.doesNotMatch(canonicalText, /Canonical (Specification|Implementation) v\d/i, "Canonical documents must not embed stale release authority.");

assert.match(styles, /--control-height:\s*40px/);
assert.match(styles, /--compact-control-height:\s*32px/);
assert.match(styles, /--touch:\s*48px/);
assert.equal((styles.match(/@media \(min-width: 1221px\)/g) || []).length, 1, "Desktop layout must have one owner.");
assert.doesNotMatch(fieldCss, /@media \(min-width: 1221px\)/, "Step Field CSS must not override application layout.");
for (const dead of ["observation-dock", "context-control", "compact-select", "observation-button", "skim-speed", "rate-setting", "fixed-rate"]) {
  const selectorPattern = new RegExp(`\\.${dead}(?![A-Za-z0-9_-])`);
  assert.equal(selectorPattern.test(`${styles}\n${fieldCss}\n${grammarCss}`), false, `Dead CSS selector remains: ${dead}`);
}
assert.match(grammarCss, /@media \(pointer: coarse\)[\s\S]*\.field-transport[\s\S]*min-height: var\(--touch\)/);
assert.match(fieldCss, /@media \(pointer: coarse\)[\s\S]*\.pane-collapse[\s\S]*height: var\(--touch\)/);

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

console.log("Project audit passed: canonical docs, CSS ownership, touch geometry, adapter boundaries, and version contracts are coherent.");
