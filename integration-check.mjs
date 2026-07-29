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
const stepGestureSource = read("step-gesture.js");

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
  "pin-backward", "switch-endpoint", "pin-forward", "return-action",
  "tail-field-toggle", "field-both-toggle", "lead-field-toggle",
  "tail-step-button", "lead-step-button", "step-backward-seconds", "step-forward-seconds",
  "context-seconds",
  "section-capture", "section-source", "focus-working-section", "save-section", "pin-capture", "pin-current",
  "sections-list", "pins-list", "leave-section"
]) assert.ok(htmlIds.has(required), `Missing required projection: ${required}`);

for (const removedPlaceholder of ["guide-tab-sources", "guide-sources-panel"]) {
  assert.equal(htmlIds.has(removedPlaceholder), false, `Placeholder projection remains: ${removedPlaceholder}`);
}

const source = [
  html, app, view, styles, fieldCss, sessionSource, transportSource, fieldSource, stepGestureSource
].join("\n");
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
assert.ok(app.includes('from "./step-gesture.js"'), "app.js must use the shared Step gesture boundary.");
assert.equal(app.includes('from "./traversal.js"'), false, "Legacy traversal.js import remains.");
assert.equal(app.includes('from "./structure.js"'), false, "Legacy structure.js import remains.");

assert.match(styles, /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward loop step-forward"[\s\S]*"pin-backward switch-endpoint pin-forward"/,
  "Navigation CSS must preserve the exact relational 3×3 matrix.");
assert.match(html, /id="refine-backward"[\s\S]*id="reopen"[\s\S]*id="refine-forward"[\s\S]*id="step-backward"[\s\S]*id="loop"[\s\S]*id="step-forward"[\s\S]*id="pin-backward"[\s\S]*id="switch-endpoint"[\s\S]*id="pin-forward"[\s\S]*id="return-action"/,
  "DOM order must match the matrix.");
assert.match(html, /id="return-action"[^>]*aria-keyshortcuts="Control\+Z Meta\+Z"/,
  "Undo must remain outside the matrix on the platform-standard shortcut.");
assert.match(styles, /touch-action:\s*manipulation/, "Controls must suppress accidental double-tap zoom without disabling page zoom.");
assert.match(styles, /\.timeline[^{]*\{[^}]*touch-action:\s*pan-y/s, "Timeline must preserve vertical page scrolling on touch devices.");
assert.match(
  fieldCss,
  /grid-template-areas:\s*"tail center lead"[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.1fr\) minmax\(0, 1fr\)/,
  "Wide Field must make Center only marginally larger without fixed tracks that clip a pane."
);

assert.match(view, /setAttribute\("role", "menuitem"\)/, "Pin clusters must expose keyboard-addressable menu items.");
assert.match(view, /setAttribute\("aria-haspopup", "menu"\)/, "Pin clusters must announce their popup relationship.");
assert.match(view, /dataset\.loopSection/, "Saved Sections must expose Loop in Guide.");
assert.match(view, /dataset\.overwriteSection/, "Saved Sections must expose explicit Working Section overwrite.");
assert.equal(/\bseek\s*:/.test(sessionSource), false, "Semantic transaction effects must use placement vocabulary.");
assert.match(sessionSource, /medium = "direct"/, "Direct movement must use canonical Interval vocabulary.");
assert.match(sessionSource, /export function completePlayback/, "Native playback must settle through Session.");
assert.match(sessionSource, /departureFrame:[\s\S]*arrivalFrame:/,
  "Intervals must retain both endpoint search frames.");
assert.match(sessionSource, /export function switchEndpoint[\s\S]*departure: arrival[\s\S]*arrival: departure/,
  "Endpoint Transposition must swap directed roles in the Session kernel.");
assert.match(sessionSource, /refineIntervalRelation[\s\S]*classifyRefineRelation[\s\S]*relation:\s*"shorten"/,
  "Refine must preserve the opposite endpoint only when its target remains inside the Loop.");
assert.match(sessionSource, /export function focusWorkingSection[\s\S]*kind:\s*FOCUS_KIND\.WORKING/,
  "Working Section Focus must be a Session relation independent from Guide persistence.");
assert.match(sessionSource, /export function overwriteGuideSection[\s\S]*replaceSectionExtent/,
  "Retained overwrite must be an explicit Guide transaction.");
assert.match(app, /function goToAdjacentPin[\s\S]*mode:\s*"linear"/,
  "Matrix Pin traversal must push the approached refinement endpoint.");
assert.match(sessionSource, /syncIntervalEndpointFrames[\s\S]*containExtent\(model\.resolution, model\.interval, model\.range\)/,
  "Every committed Loop must be contained by its active refinement frame.");
assert.match(sessionSource, /resolveIntervalEndpointFrame[\s\S]*containExtent\(resolved\.resolution, interval, range\)/,
  "Both Switch endpoint frames must contain the complete Loop.");
assert.match(sessionSource, /projectPlayback[\s\S]*stepIntervalAnchor[\s\S]*translateNeighborhood/,
  "Live and settled playback must share one endpoint-deformation projection.");
assert.match(sessionSource, /completePlayback[\s\S]*projectPlayback/,
  "Playback settlement must commit the same projection shown while playing.");
assert.match(view, /departureFrame[\s\S]*destinationScale[\s\S]*Switch Endpoint/,
  "Switch must expose the destination endpoint frame before traversal.");
assert.match(view, /refineBlockReason/,
  "Refine projection must distinguish Resolution exhaustion from a hard Range edge.");
assert.match(transportSource, /PLAYBACK:\s*"playback"/);
assert.match(transportSource, /LOOP:\s*"loop"/);
assert.doesNotMatch(transportSource, /CONTINUE|SKIM/);
assert.match(app, /result\?\.interval[\s\S]*startContext\(destination\)/, "Context must be automatic after traversal.");
assert.match(app, /createStepGestureController[\s\S]*bindStepPress/,
  "Keyboard, matrix, and Field Step controls must share one held-gesture owner.");
assert.match(app, /transport\.cycles \+= 1[\s\S]*placePlayer\(transport\.start\)[\s\S]*resumeAt[\s\S]*player\.play\(\)/,
  "Loop wraps must rebase the existing Field relation and immediately resume.");
assert.match(fieldSource, /mode:\s*"step"/);
assert.doesNotMatch(fieldSource, /mode:\s*"go"/);
assert.match(youtubeSource, /place\(address, allowSeekAhead = true\)/, "The YouTube adapter must expose placement rather than seek vocabulary.");
assert.match(youtubeSource, /isYouTubeApiReady/, "YouTube readiness must be owned by the adapter.");
assert.doesNotMatch(fieldGeometrySource, /stepSeconds/, "Field geometry must receive directional Offset objects only.");
assert.match(app, /compactGuideLayout\(\) && state\.guideOpen/, "Compact Guide must suspend background reader shortcuts.");
assert.match(app, /spatialKey\("s"\)[\s\S]*switchCurrentEndpoint\(\)/,
  "S must own Switch Endpoint.");
assert.doesNotMatch(app, /plain && event\.key === "Backspace"/,
  "Undo must use Ctrl/Cmd+Z rather than a destructive navigation key.");

console.log(`Integration check passed: ${references.size} DOM references, native playback, automatic Context, Field controls, Guide creation, and 3×3 operator geometry.`);
