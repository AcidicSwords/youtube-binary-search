import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`./${path}`, import.meta.url), "utf8");
const html = read("index.html");
const app = read("app.js");
const view = read("view.js");
const styles = read("styles.css");
const fieldCss = read("step-field.css");
const session = read("session.js");
const transport = read("transport.js");
const guide = read("guide.js");
const projection = read("temporal-projection.js");
const youtube = read("youtube.js");

const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
const htmlIds = new Set(ids);
assert.equal(htmlIds.size, ids.length, "Every DOM id must be unique.");

for (const match of html.matchAll(/aria-controls="([^"]+)"/g)) {
  for (const id of match[1].trim().split(/\s+/)) {
    assert.ok(htmlIds.has(id), `aria-controls references missing id: ${id}`);
  }
}

const labelled = new Set(
  [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map(match => match[1])
);
for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
  const attributes = match[2];
  const id = attributes.match(/\bid="([^"]+)"/)?.[1];
  if (!id || /\btype="hidden"/.test(attributes)) continue;
  assert.ok(
    labelled.has(id)
      || /\baria-label="[^"]+"/.test(attributes)
      || /\baria-labelledby="[^"]+"/.test(attributes),
    `Form control requires an accessible name: ${id}`
  );
}

for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
  assert.match(match[1], /\btype="(button|submit|reset)"/, "Every button must declare a type.");
}

const projectionSource = `${app}\n${view}`;
const references = new Set([
  ...[...projectionSource.matchAll(/elements\["([^"]+)"\]/g)].map(match => match[1]),
  ...[...projectionSource.matchAll(/elements\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(match => match[1])
]);
const missing = [...references].filter(id => !htmlIds.has(id));
assert.deepEqual(missing, [], `Missing DOM ids: ${missing.join(", ")}`);

for (const removed of [
  "continue",
  "context-action",
  "skim",
  "speed-select",
  "loop",
  "pin-backward",
  "pin-forward",
  "step-link",
  "pins-access",
  "focused-state"
]) assert.equal(htmlIds.has(removed), false, `Retired control remains: ${removed}`);

for (const required of [
  "range-fill",
  "resolution-fill",
  "interval-fill",
  "field-span-fill",
  "section-preview-fill",
  "timeline-ruler",
  "section-lane",
  "fold-lane",
  "pin-lane",
  "pin-cluster-menu",
  "current-marker",
  "cursor-marker",
  "refine-backward",
  "reopen",
  "refine-forward",
  "step-backward",
  "switch-endpoint",
  "step-forward",
  "release",
  "transpose",
  "focus-toggle",
  "return-action",
  "step-size-settings",
  "step-mode-fixed",
  "step-mode-adaptive",
  "step-size-seconds",
  "step-fraction-32",
  "step-fraction-16",
  "step-fraction-8",
  "shift-layer-toggle",
  "section-capture",
  "section-source",
  "focus-working-section",
  "save-section",
  "pin-capture",
  "pin-current",
  "sections-list",
  "pins-list",
  "leave-section"
]) assert.ok(htmlIds.has(required), `Missing required projection: ${required}`);

assert.match(
  html,
  /id="refine-backward"[\s\S]*id="reopen"[\s\S]*id="refine-forward"[\s\S]*id="step-backward"[\s\S]*id="switch-endpoint"[\s\S]*id="step-forward"[\s\S]*id="release"[\s\S]*id="transpose"[\s\S]*id="focus-toggle"[\s\S]*id="return-action"/
);
assert.match(
  styles,
  /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward switch-endpoint step-forward"[\s\S]*"release transpose focus"/
);
assert.match(html, /id="return-action"[^>]*aria-keyshortcuts="Z"/);
assert.match(html, /id="redo-action"[^>]*aria-keyshortcuts="C"/);
assert.match(styles, /touch-action:\s*manipulation/);
assert.match(styles, /\.timeline[^{]*\{[^}]*touch-action:\s*pan-y/s);
assert.match(
  fieldCss,
  /grid-template-areas:\s*"tail center lead"[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.1fr\) minmax\(0, 1fr\)/
);

assert.ok(app.includes('from "./session.js"'));
assert.ok(app.includes('from "./guide.js"'));
assert.ok(app.includes('from "./transport.js"'));
assert.ok(app.includes('from "./view.js"'));
assert.ok(app.includes('from "./range-geometry.js"'));
assert.ok(app.includes('from "./step-gesture.js"'));
assert.ok(app.includes('from "./temporal-projection.js"'));
assert.doesNotMatch(app, /from "\.\/traversal\.js"|from "\.\/structure\.js"/);

assert.match(view, /setAttribute\("role", "menuitem"\)/);
assert.match(view, /setAttribute\("aria-haspopup", "menu"\)/);
assert.match(view, /dataset\.overwriteSection/);
assert.match(view, /dataset\.sectionCollapse/);
assert.match(view, /dataset\.sectionExpand/);
assert.match(view, /dataset\.foldContributors/);
assert.match(view, /timeline-fold-pin/);

assert.match(session, /export function localRefine/);
assert.match(session, /export function refine[\s\S]*refineRelation:\s*"retain"/);
assert.match(session, /export function releaseInterval/);
assert.match(session, /export function transposeSection/);
assert.match(session, /export function focusWorkingSection[\s\S]*FOCUS_KIND\.WORKING/);
assert.match(session, /export function overwriteGuideSection[\s\S]*replaceSectionExtent/);
assert.match(session, /syncIntervalEndpointFrames[\s\S]*containExtent/);
assert.match(session, /projectPlayback[\s\S]*translateNeighborhood[\s\S]*sourceInterval\?\.start[\s\S]*sourceInterval\?\.end/);
assert.match(session, /completePlayback[\s\S]*projectPlayback/);

assert.match(guide, /collapsed:\s*options\.collapsed === true/);
assert.match(guide, /export function translateSection/);
assert.match(guide, /function traversalStops[\s\S]*projection\.orderedPinStops/);
assert.match(guide, /export function previousPin[\s\S]*traversalStops/);
assert.match(guide, /export function nextPin[\s\S]*traversalStops/);

assert.match(projection, /sourceToTraversal[\s\S]*traversalToSource/);
assert.match(projection, /normalizeFoldUnion/);
assert.match(projection, /boundaryPinIds/);
assert.match(projection, /sourceStep[\s\S]*originFold/);

assert.match(transport, /PLAYBACK:\s*"playback"/);
assert.match(transport, /CONTEXT:\s*"context"/);
assert.doesNotMatch(transport, /\bLOOP\s*:|CONTINUE|SKIM/);
assert.match(
  transport,
  /halfDuration\s*=\s*seconds\s*\/\s*2[\s\S]*boundedAnchor - halfDuration[\s\S]*boundedAnchor \+ halfDuration/,
  "Context must remain centered in source time."
);
assert.match(app, /function wrapPlaybackRange[\s\S]*rebasePlaybackTransport\(transport,\s*range\.start\)[\s\S]*placePlayer\(range\.start\)[\s\S]*resumeAt[\s\S]*player\.play\(\)/);
assert.match(app, /createStepGestureController[\s\S]*bindStepPress/);
assert.match(app, /function goToAdjacentPin[\s\S]*stepToPinSession/);
assert.match(app, /function releaseWorkingInterval[\s\S]*releaseSessionInterval/);
assert.match(app, /function transposeWorkingOrSelected[\s\S]*transposeSessionSection/);
assert.match(app, /function focusOrUnfocus[\s\S]*focusWorkingSection/);

assert.match(youtube, /place\(address, allowSeekAhead = true\)/);
assert.match(youtube, /isYouTubeApiReady/);
assert.match(app, /compactGuideLayout\(\) && state\.guideOpen/);
assert.doesNotMatch(app, /plain && event\.key === "Backspace"/);

console.log(`Integration check passed: ${references.size} DOM references, accessible v6 controls, matrix ownership, transposed timeline, independent Step configuration, Guide graph, and proper-Range playback are connected.`);
