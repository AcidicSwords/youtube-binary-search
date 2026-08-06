import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  createGroup,
  createGuide,
  createSectionFromTimes,
  groupDeletionPlan,
  setGroupState,
  setSectionWeighting
} from "./guide.js";
import { OPERATOR_MATRIX, operatorCells } from "./operator-grammar.js";
import {
  createTimelineProjection
} from "./timeline-projection.js";
import {
  OBSERVATION_POLICY,
  createPlaybackTransport,
  texturedRateForWeight,
  resolveTexturedRate,
  panoramaTriplet,
  texturedRatePolicy,
  fixedRatePolicy,
  playbackAllowsPanorama,
  rebasePlaybackTransport,
  resolveOfferedRate,
  retryPlaybackTransport,
  withPlaybackActualRate
} from "./transport.js";
import {
  DEFAULT_PANORAMA_CYCLE,
  panoramaSideRates
} from "./panorama-geometry.js";

const read = path => readFileSync(new URL(`./${path}`, import.meta.url), "utf8")
  .replace(/\r\n?/g, "\n");
const stripJsComments = source => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const sources = Object.fromEntries([
  "index.html",
  "app.js",
  "view.js",
  "styles.css",
  "session.js",
  "guide.js",
  "transport.js",
  "youtube.js",
  "browser-smoke.mjs",
  "interaction-smoke.mjs",
  "operator-grammar-tests.mjs",
  "guide-session-completion-tests.mjs",
  "package.json"
].map(path => [path, read(path)]));

const html = sources["index.html"];
const app = sources["app.js"];
const appCode = stripJsComments(app);
const view = sources["view.js"];
const styles = sources["styles.css"];
const session = sources["session.js"];
const guideSource = sources["guide.js"];
const transportSource = sources["transport.js"];
const youtube = sources["youtube.js"];
const browserSmoke = sources["browser-smoke.mjs"];
const interactionSmoke = sources["interaction-smoke.mjs"];
const pkg = JSON.parse(sources["package.json"]);

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const has = (source, pattern, message) => {
  pattern.lastIndex = 0;
  check(pattern.test(source), message);
};
const lacks = (source, pattern, message) => {
  pattern.lastIndex = 0;
  check(!pattern.test(source), message);
};
const same = (actual, expected, message) => check(
  JSON.stringify(actual) === JSON.stringify(expected),
  `${message} (received ${JSON.stringify(actual)})`
);
const topLevelFunction = (source, name) => {
  const start = source.search(new RegExp(
    `^[ \\t]*(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`,
    "m"
  ));
  if (start < 0) return "";
  const openingBrace = source.indexOf("{", start);
  if (openingBrace < 0) return "";
  const remainder = source.slice(openingBrace + 1);
  const next = remainder.search(/^[ \t]*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$]/m);
  return next < 0
    ? source.slice(start)
    : source.slice(start, openingBrace + 1 + next);
};

// Basic DOM integrity remains part of integration: the composition root may
// refer to an element only when the document actually owns it.
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const htmlIds = new Set(ids);
check(htmlIds.size === ids.length, "Every DOM id is unique.");
for (const match of html.matchAll(/aria-controls="([^"]+)"/g)) {
  for (const id of match[1].trim().split(/\s+/)) {
    check(htmlIds.has(id), `aria-controls references missing id ${id}.`);
  }
}
const labelled = new Set(
  [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map(match => match[1])
);
for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
  const attributes = match[2];
  const id = attributes.match(/\bid="([^"]+)"/)?.[1];
  if (!id || /\btype="hidden"/.test(attributes)) continue;
  check(
    labelled.has(id)
      || /\baria-label="[^"]+"/.test(attributes)
      || /\baria-labelledby="[^"]+"/.test(attributes),
    `Form control ${id} has an accessible name.`
  );
}
for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
  check(/\btype="(?:button|submit|reset)"/.test(match[1]), "Every button declares its type.");
}
const domReferences = new Set([
  ...[...`${app}\n${view}`.matchAll(/elements\["([^"]+)"\]/g)].map(match => match[1]),
  ...[...`${app}\n${view}`.matchAll(/elements\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(match => match[1])
]);
for (const id of domReferences) {
  check(htmlIds.has(id), `Runtime DOM reference ${id} exists in index.html.`);
}

// The matrix grammar is frozen, shared, and physically proved in Chromium.
const expectedMatrix = [
  ["refine-backward", "reopen", "refine-forward"],
  ["step-backward", "switch-endpoint", "step-forward"],
  ["release", "retain", "focus-toggle"]
];
const expectedKeys = ["Q", "W", "E", "A", "S", "D", "R", "T", "F"];
same(OPERATOR_MATRIX.map(row => row.map(cell => cell.id)), expectedMatrix,
  "The grammar fixture is exactly QWE / ASD / RTF.");
same(operatorCells().map(cell => cell.key), expectedKeys,
  "The fixture assigns the canonical key to every matrix cell.");
const deck = html.match(
  /<div class="navigation-deck">([\s\S]*?)<\/div>\s*<div class="operator-auxiliary-actions">/
)?.[1] || "";
check(Boolean(deck), "Operators has one navigation-deck followed by auxiliary actions.");
const deckButtons = [...deck.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
  .map(match => ({
    attributes: match[1],
    body: match[2],
    id: match[1].match(/\bid="([^"]+)"/)?.[1]
  }));
same(deckButtons.map(button => button.id), expectedMatrix.flat(),
  "DOM order contains exactly the nine canonical matrix cells.");
for (const [index, button] of deckButtons.entries()) {
  const key = expectedKeys[index];
  check(new RegExp(`<kbd>\\s*${key}\\s*<\\/kbd>`).test(button.body),
    `${button.id} visibly carries ${key}.`);
  check((button.attributes.match(/aria-keyshortcuts="([^"]+)"/)?.[1] || "")
    .split(/\s+/).includes(key), `${button.id} advertises ${key} to assistive technology.`);
}
const areaBlock = styles.match(
  /\.navigation-deck\s*\{[\s\S]*?grid-template-areas:\s*([\s\S]*?);/
)?.[1] || "";
same(
  [...areaBlock.matchAll(/"([^"]+)"/g)].map(match => match[1].trim().split(/\s+/)),
  [
    ["refine-backward", "reopen", "refine-forward"],
    ["step-backward", "switch-endpoint", "step-forward"],
    ["release", "retain", "focus"]
  ],
  "CSS areas express the same three rows."
);
has(styles, /\.navigation-deck\s*\{[\s\S]*?aspect-ratio:\s*1\s*;/,
  "The matrix container is square.");
has(styles, /#retain\s*\{\s*grid-area:\s*retain\s*;\s*\}/,
  "Tag occupies the Tag CSS area.");
lacks(areaBlock, /\bdeform\b/i, "No dead Deform area remains in the matrix.");
has(sources["operator-grammar-tests.mjs"], /from "\.\/operator-grammar\.js"/,
  "The pure grammar fixture is consumed by its proof suite.");
for (const proof of [
  /getBoundingClientRect\(\)/,
  /rows\.size,\s*3/,
  /columns\.size,\s*3/,
  /childCount,\s*9/,
  /matrix\.cells\[2\]\[1\]\.id,\s*"retain"/,
  /Shifted operator labels preserve the square matrix dimensions/
]) has(browserSmoke, proof, `Chromium geometry proof includes ${proof}.`);
for (const [key, consequence] of [
  ["w", /reopenFully\(\)/],
  ["q", /refine\("backward"/],
  ["s", /switchActiveEnd\(/],
  ["e", /refine\("forward"/]
]) {
  has(appCode, new RegExp(`spatialKey\\("${key}"\\)[\\s\\S]{0,180}?${consequence.source}`),
    `${key.toUpperCase()} reaches its canonical matrix consequence.`);
}
has(appCode, /code === "KeyA"[\s\S]{0,180}?directionalStep\("backward"\)/,
  "A reaches Step Backward.");
has(appCode, /code === "KeyD"[\s\S]{0,180}?directionalStep\("forward"\)/,
  "D reaches Step Forward.");
has(appCode, /plain && key === "r"[\s\S]{0,100}?releaseActiveSpan\(\)/,
  "R reaches Release.");
has(appCode, /plain && key === "f"[\s\S]{0,100}?focusOrUnfocus\(\)/,
  "F reaches Focus / Unfocus.");

// Tag has one grammar on pointer, keyboard, preview, and Guide surfaces.
has(appCode, /elements\.retain\.addEventListener\("click"[\s\S]*?retainActiveSpanAsSection\([\s\S]*?source:\s*"interval"[\s\S]*?retainCurrentAsPin\(/,
  "The Tag button routes Shift to Section and plain input to Current Pin.");
has(appCode, /event\.shiftKey[\s\S]{0,180}?key === "t"[\s\S]{0,220}?retainActiveSpanAsSection\(/,
  "Shift+T tags the Active Span as a Section.");
has(appCode, /plain && key === "t"[\s\S]{0,120}?retainCurrentAsPin\(/,
  "Plain T tags Current as a Pin.");
has(view, /const retainLabel = shiftLayer \? "Retain Section" : "Retain Pin"/,
  "The visible Tag label follows Shift state, not Interval presence.");
has(view, /retainMeta = shiftLayer[\s\S]*?positiveActiveSpan[\s\S]*?→ Section[\s\S]*?Current \$\{formatTime\(semanticCurrent\)\} → Pin/,
  "Tag meta names its exact operand and retained result.");
has(view, /elements\.retain\.disabled\s*=\s*interactionLocked\s*\|\|\s*\(shiftLayer && !positiveActiveSpan\)/,
  "Only shifted Tag requires a positive Active Span.");
has(view, /retain:\s*shiftLayer\s*\?\s*positiveActiveSpan\s*:\s*\{ start: semanticCurrent, end: semanticCurrent \}/,
  "Tag preview follows the same Pin/Section operand law.");
has(topLevelFunction(appCode, "retainCurrentAsPin"), /!result\.changed[\s\S]*?result\.value\?\.pin[\s\S]*?selectTimelineRetained\(\{ kind: "pin"/,
  "Duplicate Retain Pin acquires the existing exact Pin.");
has(topLevelFunction(appCode, "retainActiveSpanAsSection"), /reason === "duplicate-section"[\s\S]*?selectTimelineRetained\(\{ kind: "section"/,
  "Duplicate Retain Section acquires the existing exact Section.");
lacks(html, /<kbd>\s*P\s*<\/kbd>|Shift\s*\+\s*P|aria-keyshortcuts="[^"]*(?:^|\s)(?:Shift\+)?P(?:\s|$)/i,
  "No visible or accessible P binding remains.");
lacks(appCode, /key\s*===\s*"p"|code\s*===\s*"KeyP"/,
  "Runtime has no P/Shift+P Tag route.");

// X is one transient auxiliary bypass, never a Weight edit or a tenth operator.
const deckIndex = html.indexOf('class="navigation-deck"');
const bypassIndex = html.indexOf('id="weight-relaxation-toggle"');
const historyIndex = html.indexOf('class="history-actions"');
check(deckIndex >= 0 && deckIndex < bypassIndex && bypassIndex < historyIndex,
  "Toggle Deformation is outside the matrix and before history inside Operators.");
has(html, /id="weight-relaxation-toggle"[^>]*aria-pressed="false"/,
  "The auxiliary pointer route exposes resolved pressed state.");
has(html, /id="weight-relaxation-toggle"[^>]*aria-keyshortcuts="X"/,
  "The auxiliary pointer route exposes X and resolved pressed state.");
lacks(html, /timeline-normalize|>\s*Normalize\s*</i,
  "Timeline has no Normalize control or product label.");
lacks(styles, /\.timeline-normalize\b/, "Dead Timeline Normalize CSS is absent.");
has(appCode, /weightRelaxation:\s*null/, "Composition state explicitly owns weightRelaxation.");
lacks(appCode, /state\.normalize\b|toggleNormalize\b/, "No parallel normalize state or operation remains.");
has(appCode, /plain && key === "x"[\s\S]{0,120}?toggleWeightRelaxation\(\)/,
  "Plain X reaches the same Toggle Deformation consequence as the button.");
const toggleWeightRelaxation = topLevelFunction(appCode, "toggleWeightRelaxation");
has(toggleWeightRelaxation, /directManipulationActive\(\)/,
  "X refuses a projection change during direct manipulation.");
// One predicate answers "is a gesture in progress", so no caller can name a
// subset of the drags by hand and quietly omit one.
const manipulation = topLevelFunction(appCode, "directManipulationActive");
has(manipulation, /state\.dragHandle \|\| state\.guideDrag \|\| state\.currentDrag/,
  "A gesture in progress is every drag, named once.");
has(topLevelFunction(appCode, "commitNativeGo"), /directManipulationActive\(\)/,
  "The player's own placement is never read back as a native seek mid-gesture.");
has(toggleWeightRelaxation, /settleBeforeAction\(\{ transport: false \}\)/,
  "X settles pending spatial transactions without stopping playback.");
has(toggleWeightRelaxation, /restoring \? null : scope/,
  "The same scope restores and another scope transfers the one bypass.");
lacks(toggleWeightRelaxation, /checkpoint|persist|accept\(|player\.(?:pause|play|setRate|place)/,
  "X creates no history/persistence entry and issues no direct player command.");
has(topLevelFunction(appCode, "resolvedWeightRelaxationScope"), /state\.timelineSelection[\s\S]*?kind === "section"/,
  "Only an acquired Timeline Section scopes X.");
has(appCode, /deleteGuideSection[\s\S]{0,320}?state\.weightRelaxation[\s\S]{0,160}?= null/,
  "Deleting the bypass target clears it.");
has(topLevelFunction(appCode, "resetSourceScopedState"), /state\.weightRelaxation = null/,
  "Source replacement clears the bypass.");
lacks(session, /export function deformSection|DEFAULT_DEFORM_WEIGHT|applyDeformWeight/,
  "The dead Deform Session surface is removed.");

// Effective projection behavior is exercised as behavior, not certified by a
// comment. Overlap survives a one-Section bypass; whole-map bypass is identity.
{
  const guide = createGuide("projection-audit");
  const expanded = createSectionFromTimes(guide, 2, 8, {
    id: "expanded",
    weighting: 2
  }).section;
  const compressed = createSectionFromTimes(guide, 4, 6, {
    id: "compressed",
    weighting: 0.5
  }).section;
  const weighted = createTimelineProjection({ duration: 10, guide });
  const sectionBypass = createTimelineProjection({
    duration: 10,
    guide,
    weightRelaxation: { kind: "section", sectionId: expanded.id }
  });
  const allBypass = createTimelineProjection({
    duration: 10,
    guide,
    weightRelaxation: { kind: "all" }
  });
  check(weighted.effectiveWeightAtSource(3) === 2, "Stored active Weight deforms the effective map.");
  check(sectionBypass.effectiveWeightAtSource(3) === 1, "A Section bypass removes only its target.");
  check(sectionBypass.effectiveWeightAtSource(5) === compressed.weighting,
    "An overlapping Section still contributes while its neighbor is bypassed.");
  same(sectionBypass.weightContributors.map(section => section.id), [compressed.id],
    "Projection exposes exactly its effective contributors.");
  same(allBypass.weightContributors, [], "Whole-map bypass exposes no weighted contributors.");
  check(allBypass.timelineExtent === 10 && allBypass.sourceToTimeline(7.25) === 7.25,
    "Whole-map bypass is the positive identity projection.");
  for (const source of [0, 1.25, 4.5, 8.75, 10]) {
    check(Math.abs(weighted.timelineToSource(weighted.sourceToTimeline(source)) - source) < 1e-9,
      `Weighted projection remains singly invertible at ${source}.`);
  }
}
const topographyRenderer = topLevelFunction(view, "renderTemporalTopography");
has(topographyRenderer, /projection\.weightContributors/,
  "Atmosphere and sourceGridLines consume effective projection contributors.");
lacks(topographyRenderer, /sortedSections\(|guide\(\)\.sections|state\(\)\.session\.model\.guide/,
  "Atmosphere does not reread raw stored Guide weights.");
for (const api of ["localRefine", "refine", "step", "stepToPin", "switchActiveEnd"]) {
  has(session, new RegExp(`export function ${api}\\([^)]*options = \\{\\}`),
    `${api} accepts operation-scoped projection options.`);
}
const previewTransition = topLevelFunction(session, "previewTransition");
check(
  (previewTransition.match(/projection:\s*options\.projection/g) || []).length === 9,
  "Every projection-aware operator preview forwards the effective projection used by commit."
);
has(appCode, /function timelineProjection\(\)[\s\S]*?weightRelaxation:\s*validWeightRelaxation\(\)/,
  "The composition root creates one bypass-aware projection.");
has(topLevelFunction(appCode, "commitNativeGo"), /projection:\s*timelineProjection\(\)/,
  "A paused native seek reconciles through the effective projection.");
has(topLevelFunction(appCode, "startNativePlaybackSession"), /projection:\s*timelineProjection\(\)/,
  "Native Play reconciles its starting Address through the effective projection.");
has(appCode, /texturedRatePolicy|RATE_POLICY_KIND\.DYNAMIC[\s\S]*?timelineProjection\(\)\.effectiveWeightAtSource/,
  "Explicit dynamic playback reads the effective projection.");
has(topLevelFunction(appCode, "handleTimelineClick"), /state\.timelineSelection = null[\s\S]*?moveToAddress\(/,
  "Bare Timeline Go clears the acquired operand before moving.");
const release = topLevelFunction(appCode, "releaseActiveSpan");
has(release, /releaseSessionInterval\(state\.session\)/, "Release delegates semantic residue to Session.");
has(release, /state\.timelineSelection = null/, "Release also clears the Timeline operand.");
lacks(release, /guideSelection\s*=\s*null|weightRelaxation\s*=|focus\s*=|setRange/,
  "Release does not mutate Guide focus, bypass, Focus, or Range.");

// Playback owns observation, requested policy, and confirmed adapter rate as
// independent facts. Rebase and retry preserve those policies.
{
  const panorama = createPlaybackTransport({
    departure: 2,
    observationPolicy: OBSERVATION_POLICY.PANORAMA,
    ratePolicy: fixedRatePolicy(1),
    offeredRates: [0.5, 1, 2],
    actualRate: 1
  });
  const shiftedOne = createPlaybackTransport({
    departure: 2,
    observationPolicy: OBSERVATION_POLICY.CENTER_ONLY,
    ratePolicy: fixedRatePolicy(1),
    offeredRates: [0.5, 1, 2],
    actualRate: 1
  });
  const LADDER = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const onLadder = { offeredRates: LADDER };
  check(playbackAllowsPanorama(panorama, onLadder), "Plain fixed 1x playback owns Panorama.");
  check(!playbackAllowsPanorama(shiftedOne, onLadder), "Shift fixed 1x remains Center-only.");
  // Panorama follows Center wherever a complete triplet exists, which the
  // quarter-step ladder provides from 0.5x to 1.75x. Only the ends of the
  // ladder, where a neighbour is missing, leave Center playing alone.
  check(playbackAllowsPanorama(withPlaybackActualRate(panorama, 1.5), onLadder),
    "A confirmed 1.5x still has both neighbours, so Panorama continues.");
  check(!playbackAllowsPanorama(withPlaybackActualRate(panorama, 2), onLadder),
    "At the top of the ladder there is no Lead, so Center plays alone.");
  check(!playbackAllowsPanorama(withPlaybackActualRate(panorama, 1), { offeredRates: [0.5, 1, 1.5, 2] }),
    "A ladder without quarter steps cannot hold a triplet, and is not faked.");
  check(playbackAllowsPanorama(withPlaybackActualRate(panorama, 1), onLadder),
    "Confirmed return to 1x restores only Panorama-owned observation.");
  check(texturedRateForWeight(8) === 0.25 && texturedRateForWeight(0.125) === 1.75,
    "Weight is read as one rate step per octave, not as an inverse.");
  check(resolveTexturedRate(4, LADDER) === 0.5 && resolveTexturedRate(0.25, LADDER) === 1.5,
    "and resolved onto the ladder the adapter offers.");
  same(panoramaTriplet(1.25, LADDER), { tail: 1, center: 1.25, lead: 1.5 },
    "Every Panorama-capable Center has an exact adjacent triplet.");
  const tieWish = Math.sqrt(0.5);
  check(resolveOfferedRate(tieWish, [0.5, 1]) === 1,
    "Log-space offer ties resolve toward neutral 1x.");
  const dynamic = createPlaybackTransport({
    departure: 2,
    observationPolicy: OBSERVATION_POLICY.CENTER_ONLY,
    ratePolicy: texturedRatePolicy(),
    offeredRates: [0.25, 0.5, 1, 2, 4],
    weighting: 2,
    actualRate: 0.5
  });
  for (const continued of [retryPlaybackTransport(dynamic), rebasePlaybackTransport(dynamic, 0)]) {
    check(continued.observationPolicy === dynamic.observationPolicy,
      "Retry/wrap preserves observation policy.");
    same(continued.ratePolicy, dynamic.ratePolicy, "Retry/wrap preserves rate policy.");
    check(continued.actualRate === dynamic.actualRate, "Retry/wrap preserves confirmed actual rate.");
  }
}
for (const symbol of [
  "OBSERVATION_POLICY",
  "RATE_POLICY_KIND",
  "requestedRate",
  "actualRate",
  "resolveOfferedRate",
  "texturedRateForWeight",
  "resolveTexturedRate",
  "panoramaTriplet"
]) has(transportSource, new RegExp(`\\b${symbol}\\b`), `Transport exposes ${symbol}.`);
// User time is written by the routes that actually move the reader, and by no
// others. The ledger itself is proven in traversal-trace-tests; what matters here is
// that the composition root feeds it from the right places -- a recorder wired
// to the wrong route would produce a plausible stream describing a journey
// nobody took.
has(topLevelFunction(appCode, "accept"), /recordTraversal\(previousModel, options\)/,
  "Every accepted semantic movement writes one occurrence.");
has(topLevelFunction(appCode, "flushPendingStep"), /recordTraversalSequence\(pending\.traversalPoints, "step-sequence"\)/,
  "A held Step gesture writes every intermediate Address it passed, in order.");
has(topLevelFunction(appCode, "settleNudgeGesture"),
  /target\?\.kind === "current"[\s\S]{0,160}?recordTraversalSequence\(gesture\.traversalPoints/,
  "A Nudge writes a traversal only when Current itself moved.");
has(topLevelFunction(appCode, "settleTransport"), /recordObservedSpans\(active, current\)/,
  "Watched source time is recorded as spans, so Ghost can recall inside it.");
has(topLevelFunction(appCode, "recordObservedSpans"), /transport\.cycles[\s\S]*spans\.push/,
  "and a wrapped Range contributes one directed span per crossing.");
// Being told where to sit is a consequence of a movement, never a movement.
lacks(topLevelFunction(appCode, "placePlayer"), /recordTraversal/,
  "Programmatic placement writes no occurrence.");
lacks(topLevelFunction(appCode, "recordTraversal"), /guideChanged|weight|label/i,
  "Editing the world without moving the reader is not an encounter.");

has(appCode, /function handlePlaybackRateChange\(rate\)[\s\S]*?withPlaybackActualRate\(state\.transport, rate\)/,
  "Adapter rate events update transport actualRate.");
has(appCode, /onPlaybackRateChange:\s*handlePlaybackRateChange/,
  "The YouTube adapter rate callback is wired at the composition root.");
has(youtube, /videoId:\s*loadedVideoId\(rawPlayer\)/,
  "Adapter snapshots report actual loaded source identity.");
has(topLevelFunction(appCode, "wrapPlaybackRange"), /rebasePlaybackTransport[\s\S]*?resolvePlaybackRate[\s\S]*?player\.setRate/,
  "Proper-Range wrap rebases and rederives the active policy.");
has(appCode, /retryPlaybackTransport\(state\.transport\)[\s\S]{0,500}?resolvePlaybackRate[\s\S]{0,300}?player\.setRate/,
  "Playback retry reapplies the active rate policy.");
has(appCode, /availableRates[\s\S]{0,500}?RATE_POLICY_KIND\.FIXED[\s\S]{0,500}?resolvePlaybackRate/,
  "Expanded rate offers retune active fixed Shift playback.");
has(styles, /\.center-transport-overlay\s*\{[^}]*pointer-events:\s*none/,
  "The full iframe overlay is non-blocking.");
has(styles, /\.center-transport-surface\s*\{[^}]*pointer-events:\s*auto/,
  "Only the centered parent Play control captures pointer input.");
has(browserSmoke, /native controls reachable|control-bar pointer|centerAccess/i,
  "Chromium checks native player control accessibility while paused.");

// A source change has one generation-owned boundary, and recovery explicitly
// reports whether evidence is safe to rewrite.
const loadRequest = topLevelFunction(appCode, "createLoadRequest");
has(loadRequest, /loadGeneration \+= 1[\s\S]*?Object\.freeze\(\{[\s\S]*?generation:[\s\S]*?videoId:[\s\S]*?startSeconds:[\s\S]*?metadataStartedAt:/,
  "Every load owns one immutable generation request.");
has(topLevelFunction(appCode, "currentLoadRequest"), /request\.generation === pendingLoad\.generation[\s\S]*?request\.videoId === pendingLoad\.videoId/,
  "Current generation and requested identity are checked together.");
has(topLevelFunction(appCode, "initializeVideo"), /!snapshot\.videoId \|\| snapshot\.videoId !== request\.videoId/,
  "Initialization also requires the adapter's actual source identity.");
const sourceBoundary = topLevelFunction(appCode, "transitionSourceBoundary");
for (const owner of [
  /stepGesture\?\.cancel/,
  /finishCurrentDrag[\s\S]*cancel: true/,
  /finishGuideDrag[\s\S]*cancel: true/,
  /cancelRangeDrag\(\)/,
  /settleNudgeGesture\(\)/,
  /flushPendingStep/,
  /settleTransport/,
  /persistGuide\(\)/,
  /clearNativeGo\(\)/,
  /clearProgrammaticPlacement\(\)/,
  /closePinClusterMenu\(\)/,
  /resetSourceScopedState\(\)/
]) has(sourceBoundary, owner, `Source transition resolves owner ${owner}.`);
has(topLevelFunction(appCode, "handlePlayerError"), /transitionSourceBoundary\(\)/,
  "Player errors use the same source-transition boundary.");
const recovery = topLevelFunction(appCode, "readStoredGuide");
for (const field of [
  "guide",
  "sourcePrefix",
  "exact",
  "sanitized",
  "discardedCount",
  "unreadableHigherPriorityRecords",
  "quarantineSucceeded",
  "safeToRewriteCurrent"
]) has(recovery, new RegExp(`\\b${field}\\b`), `Guide recovery returns ${field}.`);
has(recovery, /quarantineUnreadableGuides\(unreadable\)[\s\S]*?safeToRewriteCurrent:\s*unreadable\.length === 0 \|\| quarantineSucceeded/,
  "Unreadable higher-priority evidence gates destructive rewrite.");
has(topLevelFunction(appCode, "persistGuide"), /safeToRewriteCurrent === false[\s\S]*?return false/,
  "Persistence refuses to overwrite evidence when quarantine failed.");
has(appCode, /No saved Guide|no saved Guide|No Guide was saved|unreadable|damaged saved record/i,
  "Recovery status distinguishes absence from damaged evidence.");

// Group lifecycle, modifier ownership, Nudge, Step Reversal, and Panorama defaults
// retain one implementation per consequence.
{
  const guide = createGuide("groups");
  const other = createGroup(guide, "Other", { id: "group-other" });
  const section = createSectionFromTimes(guide, 1, 3, {
    id: "section-other",
    groupId: other.id
  }).section;
  same(groupDeletionPlan(guide, other.id), {
    allowed: true,
    reason: null,
    heirGroupId: "group-default",
    movedSectionIds: [section.id]
  }, "Group deletion exposes its exact shared plan and real heir.");
  setGroupState(guide, other.id, { visible: false, weightsEnabled: true });
  const hiddenActive = createTimelineProjection({ duration: 5, guide });
  check(guide.shownGroupId === null, "No Group drawn is a valid Guide state.");
  check(hiddenActive.effectiveWeightAtSource(2) === 1,
    "A hidden active 1x Section remains an effective contributor without changing density.");
  setSectionWeighting(guide, section.id, 2);
  const hiddenWeighted = createTimelineProjection({ duration: 5, guide });
  check(hiddenWeighted.effectiveWeightAtSource(2) === 2,
    "Hidden Group activity remains independent and contributes Weight.");
}
has(guideSource, /export function groupDeletionPlan\([\s\S]*?allowed[\s\S]*?reason[\s\S]*?heirGroupId[\s\S]*?movedSectionIds/,
  "Guide owns one explicit Group deletion plan.");
has(session, /planGuideGroupDeletion[\s\S]*?groupDeletionPlan/,
  "Session consumes the Guide deletion plan instead of duplicating it.");
has(appCode, /function consumeShiftLayer\(owner\)[\s\S]*?state\.shiftLayers\?\.\[owner\]/,
  "Latched Shift is consumed by named owner.");
has(appCode, /shiftLayers:\s*\{ matrix: false, guide: false \}/,
  "Matrix and Guide own separate Shift latches.");
lacks(appCode, /consumeShiftLayer\(\s*\)/,
  "No ownerless Shift-layer consumption remains.");
has(topLevelFunction(appCode, "resetSourceScopedState"), /state\.shiftLayers = \{ matrix: false, guide: false \}/,
  "Source reset clears both surface latches.");
// One wheel, two readers, one registration. Ghost takes precedence while G is
// held; otherwise the wheel is Nudge's exactly as before. A second listener
// would let both act on one notch.
check((appCode.match(/addEventListener\("wheel",\s*handleReaderWheel/g) || []).length === 1,
  "One document wheel handler dispatches Timeline and off-map wheel input.");
check((appCode.match(/addEventListener\("wheel"/g) || []).length === 1,
  "and it is the only wheel listener, so no notch is read twice.");
has(topLevelFunction(appCode, "handleReaderWheel"),
  /state\.ghostKeyHeld && handleGhostWheel\(event\)[\s\S]*handleNudgeWheel\(event\)/,
  "Ghost owns the wheel while G is held; Nudge owns it otherwise.");
const nudgeWheel = topLevelFunction(appCode, "handleNudgeWheel");
has(topLevelFunction(appCode, "wheelPixels"), /Math\.abs\(event\.deltaX\) > Math\.abs\(event\.deltaY\)/,
  "Nudge selects the dominant wheel axis.");
has(topLevelFunction(appCode, "wheelPixels"), /deltaMode === 1[\s\S]*deltaMode === 2/,
  "and reads line and page deltas in their own units rather than as pixels.");
has(nudgeWheel, /overTimeline \? \{ kind: "current" \} : selectedNudgeTarget\(\)/,
  "Only target resolution differs between Timeline and off-map wheel routes.");
has(nudgeWheel, /if \(!target\) return;[\s\S]*?event\.preventDefault/,
  "Wheel default is prevented only after an operand is acquired.");
has(nudgeWheel, /state\.nudgeWheel\.accumulator \+= raw[\s\S]*?Math\.trunc\(state\.nudgeWheel\.accumulator \/ NUDGE_WHEEL_THRESHOLD\)/,
  "High-resolution wheel input accumulates toward one shared quantum.");
// Reaching a quantum and batching an Undo entry are different jobs. While they
// shared the gesture's lifetime, a scroll gentler than one threshold per event
// lost its progress every time the reader paused, and never nudged at all.
lacks(nudgeWheel, /gesture\.accumulator/,
  "The wheel accumulator does not live on the Undo-batching gesture.");
has(topLevelFunction(appCode, "resetSourceScopedState"), /state\.nudgeWheel = null/,
  "and a partial Nudge does not survive a change of source.");
has(session, /export function settleStepSequence[\s\S]*?Step Reversal[\s\S]*?visitedMinimum[\s\S]*?visitedMaximum/,
  "Step settlement retains a sparse transient reversal envelope.");
has(sources["guide-session-completion-tests.mjs"], /visitedMinimum[\s\S]*?visitedMaximum[\s\S]*?Step Reversal[\s\S]*?history\.length, 1/,
  "Step Reversal has focused one-transaction coverage.");
same(DEFAULT_PANORAMA_CYCLE, { inner: 0.25, outer: 2.5, rate: 0.25 },
  "Panorama ships with conservative 0.25-2.5 second defaults.");
same(panoramaSideRates(DEFAULT_PANORAMA_CYCLE.rate), {
  center: 1,
  tailRate: 0.75,
  leadRate: 1.25
}, "Default Panorama rates are 0.75x / 1x / 1.25x.");
has(html, /id="field-inner-offset"[^>]*max="300"[^>]*value="0\.25"/,
  "Panorama defaults do not restrict the selectable inner-offset range.");
has(html, /id="field-outer-offset"[^>]*max="300"[^>]*value="2\.5"/,
  "Panorama defaults do not restrict the selectable outer-offset range.");
has(interactionSmoke, /savedPanoramaCycle = \{ inner: 3, outer: 12, rate: 0\.4 \}/,
  "Saved Panorama coverage uses values wider than the shipped defaults.");
has(interactionSmoke, /3–12 s · 0\.6× \/ 1\.4×/,
  "Saved non-preset Panorama rates have truthful presentation coverage.");
has(interactionSmoke, /panoramaCycle,[\s\S]*savedPanoramaCycle/,
  "Saved Panorama coverage proves the valid persisted preference remains unchanged.");

// Required completion suites must exist and be executed by a package script.
const scriptCorpus = Object.values(pkg.scripts || {}).join(" && ");
for (const suite of [
  "operator-grammar-tests.mjs",
  "timeline-projection-tests.mjs",
  "section-weight-smoke.mjs",
  "transport-tests.mjs",
  "youtube-tests.mjs",
  "panorama-cycle-tests.mjs",
  "guide-session-completion-tests.mjs",
  "nudge-tests.mjs",
  "browser-smoke.mjs"
]) {
  check(existsSync(new URL(`./${suite}`, import.meta.url)), `${suite} exists.`);
  check(scriptCorpus.includes(suite), `${suite} is part of an automated package gate.`);
}

// The contract requires adversarial source/recovery scenarios, not only static
// implementation strings. Keep this search deliberately semantic and outside
// the two gauges so explanatory audit prose cannot satisfy it.
const behavioralSuites = readdirSync(new URL("./", import.meta.url))
  .filter(name => name.endsWith(".mjs"))
  .filter(name => ![
    "integration-check.mjs",
    "project-audit.mjs",
    "browser-harness.mjs",
    "smoke-harness.mjs"
  ].includes(name));
const behaviorCorpus = behavioralSuites.map(name => read(name)).join("\n");
has(behaviorCorpus, /stale[\s\S]{0,600}CUED|CUED[\s\S]{0,600}stale/i,
  "A behavioral suite covers a stale CUED event across load generations.");
has(behaviorCorpus, /quarantine[\s\S]{0,800}(?:throw|fail|error)|(?:throw|fail|error)[\s\S]{0,800}quarantine/i,
  "A behavioral suite covers Guide quarantine-write failure.");
has(behaviorCorpus, /source[\s-]?change[\s\S]{0,900}(?:Nudge|pending Step|Section drag|Playback|Context)/i,
  "Behavioral coverage changes source while a transient owner is active.");

if (failures.length) {
  console.error(`Integration check failed (${failures.length}):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Integration check passed: QWE / ASD / RTF and Tag, transient X bypass, one effective projection, playback/source ownership, Guide recovery, modifiers/Nudge, Step Reversal, native controls, and conservative Panorama defaults agree."
  );
}
