import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const files = [
  html,
  app,
  readFileSync(new URL("./styles.css", import.meta.url), "utf8"),
  readFileSync(new URL("./structure.js", import.meta.url), "utf8"),
  readFileSync(new URL("./traversal.js", import.meta.url), "utf8")
];

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
const bracketRefs = [...app.matchAll(/elements\["([^"]+)"\]/g)].map(match => match[1]);
const dotRefs = [...app.matchAll(/elements\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(match => match[1]);
const references = new Set([...bracketRefs, ...dotRefs]);
const missing = [...references].filter(id => !htmlIds.has(id));
assert.deepEqual(missing, [], `Missing DOM ids: ${missing.join(", ")}`);

for (const required of [
  "range-fill",
  "resolution-fill",
  "repeat-fill",
  "section-preview-fill",
  "mark-lane",
  "sections-list",
  "marks-list",
  "unfocus-section"
]) {
  assert.ok(htmlIds.has(required), `Missing required projection: ${required}`);
}

const source = files.join("\n");
for (const obsolete of [
  "selectedMarkId",
  "selectedSpanId",
  "draftStartMarkId",
  "draftEndMarkId",
  "contextStack",
  "anchorMarkId",
  "bindPassageStart",
  "bindPassageEnd",
  "saveDraftSpan",
  "roleButton"
]) {
  assert.equal(source.includes(obsolete), false, `Obsolete state or operator remains: ${obsolete}`);
}

console.log(`Integration check passed: ${references.size} DOM references, 0 missing.`);
