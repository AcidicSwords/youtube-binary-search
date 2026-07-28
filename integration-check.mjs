import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`./${path}`, import.meta.url), "utf8");
const html = read("index.html");
const app = read("app.js");
const view = read("view.js");
const styles = read("styles.css");
const fieldCss = read("step-field.css");
const sessionSource = read("session.js");
const transportSource = read("transport.js");
const youtubeSource = read("youtube.js");
const fieldGeometrySource = read("step-field-geometry.js");
const fieldSource = read("step-field.js");

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

for (const removed of [
  "continue", "continue-label", "context-action", "context-label", "skim", "speed-select",
  "step-link", "pins-access", "focused-state", "focused-label", "field-span-loop", "field-span-retain"
]) {
  assert.equal(htmlIds.has(removed), false, `Retired or duplicate control remains: ${removed}`);
}

for (const required of [
  "range-fill", "resolution-fill", "interval-fill", "field-span-fill", "section-preview-fill",
  "pin-lane", "pin-cluster-menu", "current-marker", "cursor-marker", "guide-dialog",
  "refine-backward", "reopen", "refine-forward", "step-backward", "loop", "step-forward",
  "pin-backward", "return-action", "pin-forward",
  "tail-field-toggle", "field-both-toggle", "lead-field-toggle",
  "tail-step-button", "lead-step-button", "step-backward-seconds", "step-forward-seconds",
  "section-capture", "section-source", "save-section", "pin-capture", "pin-current",
  "sections-list", "pins-list", "guide-tab-sources", "leave-section"
]) assert.ok(htmlIds.has(required), `Missing required projection: ${required}`);

const source = [html, app, view, styles, fieldCss, sessionSource, transportSource, fieldSource].join("\n");
for (const obsolete of [
  "selectedMarkId", "selectedSpanId", "draftStartMarkId", "draftEndMarkId", "contextStack",
  "anchorMarkId", "bindPassageStart", "bindPassageEnd", "saveDraftSpan", "roleButton",
  "passage-label", "point-label", "exit-context", "undo-edit", "address-source"
]) assert.equal(source.includes(obsolete), false, `Obsolete state, term, or operator remains: ${obsolete}`);

assert.ok(app.includes('from "./session.js"'), "app.js must use the Session kernel.");
assert.ok(app.includes('from "./guide.js"'), "app.js must use the Guide model.");
assert.ok(app.includes('from "./transport.js"'), "app.js must use the transport kernel.");
assert.ok(app.includes('from "./view.js"'), "app.js must delegate DOM projection to view.js.");
assert.ok(app.includes('from "./range-geometry.js"'), "app.js must use the Range geometry kernel.");
assert.equal(app.includes('from "./traversal.js"'), false, "Legacy traversal.js import remains.");
assert.equal(app.includes('from "./structure.js"'), false, "Legacy structure.js import remains.");

assert.match(styles, /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward loop step-forward"[\s\S]*"pin-backward return pin-forward"/,
  "Navigation CSS must preserve the exact relational 3×3 matrix.");
assert.match(html, /id="refine-backward"[\s\S]*id="reopen"[\s\S]*id="refine-forward"[\s\S]*id="step-backward"[\s\S]*id="loop"[\s\S]*id="step-forward"[\s\S]*id="pin-backward"[\s\S]*id="return-action"[\s\S]*id="pin-forward"/,
  "DOM order must match the matrix.");
assert.match(styles, /touch-action:\s*manipulation/, "Controls must suppress accidental double-tap zoom without disabling page zoom.");
assert.match(styles, /\.timeline[^{]*\{[^}]*touch-action:\s*pan-y/s, "Timeline must preserve vertical page scrolling on touch devices.");
assert.match(fieldCss, /grid-template-columns:\s*minmax\(240px, 1fr\) minmax\(264px, 1\.1fr\) minmax\(240px, 1fr\)/,
  "Wide Field must make Center only marginally larger.");

assert.match(view, /setAttribute\("role", "menuitem"\)/, "Pin clusters must expose keyboard-addressable menu items.");
assert.match(view, /setAttribute\("aria-haspopup", "menu"\)/, "Pin clusters must announce their popup relationship.");
assert.match(view, /dataset\.loopSection/, "Saved Sections must expose Loop in Guide.");
assert.equal(/\bseek\s*:/.test(sessionSource), false, "Semantic transaction effects must use placement vocabulary.");
assert.match(sessionSource, /medium = "direct"/, "Direct movement must use canonical Interval vocabulary.");
assert.match(sessionSource, /export function completePlayback/, "Native playback must settle through Session.");
assert.match(transportSource, /PLAYBACK:\s*"playback"/);
assert.match(transportSource, /LOOP:\s*"loop"/);
assert.doesNotMatch(transportSource, /CONTINUE|SKIM/);
assert.match(app, /result\?\.interval[\s\S]*startContext\(destination\)/, "Context must be automatic after traversal.");
assert.match(app, /transport\.cycles \+= 1[\s\S]*placePlayer\(transport\.start\)[\s\S]*player\.play\(\)/,
  "Loop wraps must remain physical and immediately unpause.");
assert.match(fieldSource, /mode:\s*"step"/);
assert.doesNotMatch(fieldSource, /mode:\s*"go"/);
assert.match(youtubeSource, /place\(address, allowSeekAhead = true\)/, "The YouTube adapter must expose placement rather than seek vocabulary.");
assert.match(youtubeSource, /isYouTubeApiReady/, "YouTube readiness must be owned by the adapter.");
assert.doesNotMatch(fieldGeometrySource, /stepSeconds/, "Field geometry must receive directional Offset objects only.");
assert.match(app, /compactGuideLayout\(\) && state\.guideOpen/, "Compact Guide must suspend background reader shortcuts.");

console.log(`Integration check passed: ${references.size} DOM references, native playback, automatic Context, Field controls, Guide creation, and 3×3 operator geometry.`);
