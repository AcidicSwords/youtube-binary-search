import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const view = readFileSync(new URL("./view.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const visibleSource = `${html}\n${view}`;
const sessionSource = readFileSync(new URL("./session.js", import.meta.url), "utf8");
const youtubeSource = readFileSync(new URL("./youtube.js", import.meta.url), "utf8");
const files = [
  html,
  app,
  view,
  styles,
  readFileSync(new URL("./guide.js", import.meta.url), "utf8"),
  sessionSource,
  readFileSync(new URL("./range-geometry.js", import.meta.url), "utf8")
];

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));

const htmlIdList = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(htmlIdList).size, htmlIdList.length, "Every DOM id must be unique.");

for (const match of html.matchAll(/aria-controls="([^"]+)"/g)) {
  for (const id of match[1].trim().split(/\s+/)) {
    assert.ok(htmlIds.has(id), `aria-controls references missing id: ${id}`);
  }
}

const labelledControls = new Set([...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map(match => match[1]));
for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
  const attributes = match[2];
  const id = attributes.match(/\bid="([^"]+)"/)?.[1];
  if (!id || /\btype="hidden"/.test(attributes)) continue;
  const hasAccessibleName = labelledControls.has(id)
    || /\baria-label="[^"]+"/.test(attributes)
    || /\baria-labelledby="[^"]+"/.test(attributes);
  assert.ok(hasAccessibleName, `Form control requires an accessible name: ${id}`);
}

for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
  assert.match(match[1], /\btype="(button|submit|reset)"/, "Every button must declare its type.");
}
const projectionSource = `${app}\n${view}`;
const bracketRefs = [...projectionSource.matchAll(/elements\["([^"]+)"\]/g)].map(match => match[1]);
const dotRefs = [...projectionSource.matchAll(/elements\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(match => match[1]);
const references = new Set([...bracketRefs, ...dotRefs]);
const missing = [...references].filter(id => !htmlIds.has(id));
assert.deepEqual(missing, [], `Missing DOM ids: ${missing.join(", ")}`);

for (const required of [
  "range-fill",
  "resolution-fill",
  "interval-fill",
  "section-preview-fill",
  "pin-lane",
  "pin-cluster-menu",
  "current-marker",
  "cursor-marker",
  "guide-dialog",
  "refine-backward",
  "refine-forward",
  "reopen",
  "return-action",
  "step-backward",
  "step-forward",
  "pin-current",
  "pin-backward",
  "pin-forward",
  "sections-list",
  "pins-list",
  "guide-tab-sources",
  "leave-section"
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
  "roleButton",
  "passage-label",
  "point-label",
  "exit-context",
  "undo-edit",
  "address-source"
]) {
  assert.equal(source.includes(obsolete), false, `Obsolete state, term, or operator remains: ${obsolete}`);
}

for (const obsoleteVisible of [
  /\bMark(s|ed|ing)?\b/i,
  /\bNarrow\b/i,
  /\bWiden\b/i,
  /\bUndo\b/i,
  /\bRepeat\b/i,
  /\bPlay\b/i,
  /\bEarlier\b/i,
  /\bLater\b/i,
  /\bTraversal\b/i
]) {
  assert.equal(obsoleteVisible.test(visibleSource), false, `Legacy visible vocabulary remains: ${obsoleteVisible}`);
}

assert.ok(app.includes('from "./session.js"'), "app.js must use the Session kernel.");
assert.ok(app.includes('from "./guide.js"'), "app.js must use the Guide model.");
assert.ok(app.includes('from "./transport.js"'), "app.js must use the transport kernel.");
assert.ok(app.includes('from "./view.js"'), "app.js must delegate DOM projection to view.js.");
assert.ok(app.includes('from "./range-geometry.js"'), "app.js must use the Range geometry kernel.");
assert.equal(app.includes('from "./traversal.js"'), false, "Legacy traversal.js import remains.");
assert.equal(app.includes('from "./structure.js"'), false, "Legacy structure.js import remains.");

assert.match(styles, /grid-template-areas:[\s\S]*reopen[\s\S]*refine-backward[\s\S]*return[\s\S]*refine-forward[\s\S]*step-settings[\s\S]*step-backward[\s\S]*step-forward[\s\S]*pin-current[\s\S]*pin-backward[\s\S]*pins-access[\s\S]*pin-forward/,
  "Navigation CSS must preserve the backward / shared spine / forward grammar.");
assert.match(styles, /touch-action:\s*manipulation/, "Controls must suppress accidental double-tap zoom without disabling page zoom.");
assert.match(styles, /\.timeline[^{]*\{[^}]*touch-action:\s*pan-y/s, "Timeline must preserve vertical page scrolling on touch devices.");
assert.match(view, /setAttribute\("role", "menuitem"\)/, "Pin clusters must expose keyboard-addressable menu items.");
assert.match(view, /setAttribute\("aria-haspopup", "menu"\)/, "Pin clusters must announce their popup relationship.");
assert.match(view, /setAttribute\?\.\("aria-expanded", "true"\)/, "Pin clusters must expose expanded state while open.");
assert.equal(/\bseek\s*:/.test(sessionSource), false, "Semantic transaction effects must use placement vocabulary.");
assert.match(sessionSource, /medium = "direct"/, "Direct movement must use canonical Interval vocabulary.");
assert.match(youtubeSource, /place\(address, allowSeekAhead = true\)/, "The YouTube adapter must expose placement rather than seek vocabulary.");
assert.match(app, /compactGuideLayout\(\) && state\.guideOpen/, "Compact Guide must suspend background reader shortcuts.");
assert.match(sessionSource, /Direct placement is scale-independent/, "Direct Go must explicitly escape recursive Resolution.");

console.log(`Integration check passed: ${references.size} DOM references, canonical vocabulary, accessibility contracts, and spatial control geometry.`);
