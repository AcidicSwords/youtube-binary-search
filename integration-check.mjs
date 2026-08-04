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
const projection = read("timeline-projection.js");
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
  "deformation-field",
  "timeline-ruler",
  "section-lane",
  "pin-lane",
  "pin-cluster-menu",
  "guide-toggle",
  "operator-toggle",
  "current-marker",
  "cursor-marker",
  "refine-backward",
  "reopen",
  "refine-forward",
  "step-backward",
  "switch-endpoint",
  "step-forward",
  "release",
  "deform",
  "deform-down",
  "deform-up",
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
  /id="refine-backward"[\s\S]*id="reopen"[\s\S]*id="refine-forward"[\s\S]*id="step-backward"[\s\S]*id="switch-endpoint"[\s\S]*id="step-forward"[\s\S]*id="release"[\s\S]*id="deform"[\s\S]*id="focus-toggle"[\s\S]*id="return-action"/
);
assert.match(
  styles,
  /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward switch-endpoint step-forward"[\s\S]*"release deform focus"/
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
assert.ok(app.includes('from "./timeline-projection.js"'));
assert.doesNotMatch(app, /from "\.\/traversal\.js"|from "\.\/structure\.js"/);

assert.match(view, /setAttribute\("role", "menuitem"\)/);
assert.match(view, /setAttribute\("aria-haspopup", "menu"\)/);
assert.doesNotMatch(view, /dataset\.overwriteSection|Overwrite/);
assert.match(view, /dataset\.sectionWeight/);
assert.match(view, /SECTION_WEIGHT_VALUES/);
assert.match(view, /timeline-section-span/);
assert.match(view, /function deformationInfluence[\s\S]*Math\.log2\(section\.weight\)[\s\S]*deformation-contours/);
assert.doesNotMatch(view, /timeline-fold|foldContributors|sectionCollapse|sectionExpand/);

assert.match(session, /export function localRefine/);
assert.match(
  session,
  /function retainedRefineIntervalRelation[\s\S]*classifyRetainedRefineRelation[\s\S]*export function refine[\s\S]*refineRelation:\s*intervalRelation\.relation/
);
assert.match(session, /export function releaseInterval/);
assert.match(session, /export function deformSection/);
assert.match(session, /export function setGuideSectionWeight/);
assert.match(session, /export function focusWorkingSection[\s\S]*FOCUS_KIND\.WORKING/);
assert.doesNotMatch(session, /overwriteGuideSection|replaceSectionExtent/);
assert.match(session, /syncIntervalEndpointFrames[\s\S]*containExtent/);
assert.match(session, /projectPlayback[\s\S]*translateNeighborhood[\s\S]*sourceInterval\?\.start[\s\S]*sourceInterval\?\.end/);
assert.match(session, /completePlayback[\s\S]*projectPlayback/);

assert.match(guide, /SECTION_WEIGHT_VALUES[\s\S]*0\.25[\s\S]*2/);
assert.match(guide, /export function setSectionWeight/);
assert.match(guide, /export function translateSection/);
assert.match(guide, /function timelineStops[\s\S]*projection\.orderedPinStops/);
assert.match(guide, /export function previousPin[\s\S]*timelineStops/);
assert.match(guide, /export function nextPin[\s\S]*timelineStops/);

assert.match(projection, /sourceToTimeline[\s\S]*timelineToSource/);
assert.match(projection, /export function createTimelineProjection/);
assert.match(projection, /contributors\.reduce[\s\S]*product \* activeWeight/);
assert.match(projection, /stepSourceByTimeline[\s\S]*timelineToSource/);
assert.doesNotMatch(projection, /affinity|materializ|collapse|fold/i);

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
assert.match(app, /function applyDeformWeight[\s\S]*deformSessionSection/);
assert.match(app, /function changeSectionWeight[\s\S]*setGuideSectionWeight/);
assert.match(app, /function focusOrUnfocus[\s\S]*focusWorkingSection/);
assert.match(
  app,
  /"section-lane"\]\.addEventListener\("click"[\s\S]*?selectSectionAsWorkingInterval/
);
// A plain Guide click replaces the Working Interval; Shift extends it to
// include the clicked object. One rule serves Pins and Sections alike, because
// an extent is what every operator consumes.
assert.match(
  app,
  /function handleGuideClick[\s\S]*?dataset\.sectionGo[\s\S]*?selectSectionAsWorkingInterval\(/
);
assert.match(
  app,
  /function handleGuideClick[\s\S]*?composing && extendIntervalToRetained\(\s*"pin"[\s\S]*?composing && extendIntervalToRetained\(\s*"section"/
);
assert.match(
  app,
  /function extendIntervalToRetained[\s\S]*?Math\.min\(interval\.start[\s\S]*?Math\.max\(interval\.end[\s\S]*?workFromExtent[\s\S]*?consumeShiftLayer\(\)/
);
assert.match(
  app,
  /function applyGuideState[\s\S]*?command-workspace[\s\S]*?rail-collapsed/
);
// X normalizes, and carries no modifier because it has one meaning. The ladder
// is edited in the Guide, where the Weight actually lives, so the keyboard no
// longer needs a chord for stepping it -- which is what the Alt chord was for,
// and why Deform was the only operator with one.
assert.match(app, /else if \(plain && key === "x"\) \{[\s\S]{0,80}toggleNormalize\(\)/);
assert.doesNotMatch(app, /event\.altKey\) stepDeformWeight\(-1\)/,
  "No operator carries an Alt chord.");
assert.match(app, /function toggleNormalize\(\)[\s\S]*?state\.normalize = wasNormalized \? null : scope/);
assert.match(app, /function timelineProjection\(\)[\s\S]*?normalize: state\.normalize/,
  "Normalize reaches the map through the one projection every operator measures with.");

assert.match(youtube, /place\(address, allowSeekAhead = true\)/);
assert.match(youtube, /isYouTubeApiReady/);
assert.match(app, /compactGuideLayout\(\) && state\.guideOpen/);
assert.doesNotMatch(app, /plain && event\.key === "Backspace"/);

console.log(`Integration check passed: ${references.size} DOM references, accessible v7 controls, matrix ownership, weighted timeline, independent Step configuration, Guide graph, and proper-Range playback are connected.`);
