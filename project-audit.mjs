import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`./${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("index.html");
const styles = read("styles.css");
const fieldCss = read("step-field.css");
const grammarCss = read("field-grammar.css");
const app = read("app.js");
const format = read("format.js");
const view = read("view.js");
const session = read("session.js");
const guide = read("guide.js");
const projection = read("timeline-projection.js");
const transport = read("transport.js");
const field = read("step-field.js");
const fieldGeometry = read("step-field-geometry.js");
const fieldFrame = read("field-frame.js");
const rangeGeometry = read("range-geometry.js");
const stepGesture = read("step-gesture.js");
const youtube = read("youtube.js");

// Artifacts of a finished patch or migration. Each one described a state the
// project has since left, so keeping it means shipping a document that
// contradicts the code -- STABILIZATION_NOTES.md still said Guides persist
// under a v8 key after v9 replaced it.
for (const retiredArtifact of [
  ".v5.2-patch-backup",
  "BRANCH_INSTALL.md",
  "DELETE_FILES.txt",
  "MANUAL_SMOKE.md",
  "PATCHSET.md",
  "SHA256SUMS",
  "STABILIZATION_NOTES.md",
  "TEST_REPORT.md",
  "coherence.patch.gz.b64.00",
  "coherence.patch.gz.b64.01",
  "coherence.patch.gz.b64.02",
  "source-field.js",
  "source-field-tests.mjs",
  "structure.js",
  "traversal.js",
  "v5.2-regression-tests.mjs"
]) {
  assert.equal(existsSync(retiredArtifact), false, `Retired artifact remains: ${retiredArtifact}`);
}

const docs = Object.fromEntries([
  "README.md",
  "PROJECT.md",
  "GLOSSARY.md",
  "SPEC.md",
  "IMPLEMENTATION.md",
  "INTERFACE.md",
  "DEVELOPMENT.md",
  "VALIDATION.md"
].map(path => [path, read(path)]));

function cssHex(name) {
  const match = styles.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `Missing CSS color token --${name}.`);
  return match[1];
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

assert.equal(pkg.name, "video-cartography");
// The DOM-free gate stays the fast one; the browser gate is separate because it
// needs Chromium and answers different questions. `verify` is both.
assert.equal(pkg.scripts["test:browser"], "node browser-smoke.mjs");
assert.equal(pkg.scripts.verify, "npm run check && npm run test:browser");
assert.ok(pkg.devDependencies?.["playwright-core"],
  "The browser gate declares its dependency.");
// The browsers the runner downloads must match the library that will drive
// them. Naming a version in the workflow made it a second place to state one
// fact: the caret range drifted to 1.62 while the workflow stayed at 1.49, the
// runner fetched browsers the library never looked for, and the browser gate
// could not pass on any commit. One place states it.
{
  const workflow = read(".github/workflows/verify.yml");
  assert.match(workflow, /playwright@"\$\(node -p 'require\("playwright-core\/package\.json"\)\.version'\)"/,
    "The workflow installs browsers for the playwright-core version it resolved.");
  assert.doesNotMatch(workflow, /playwright@\d/,
    "and never names a Playwright version of its own.");
}
assert.equal(pkg.version, "8.0.0");
assert.ok(pkg.description, "The package must carry the project description.");
assert.match(docs["SPEC.md"], /^# Video Cartography — Canonical Specification\r?\n/);
assert.match(docs["IMPLEMENTATION.md"], /^# Video Cartography — Canonical Implementation\r?\n/);
assert.match(docs["INTERFACE.md"], /^# Video Cartography — Interface Grammar\r?\n/);
for (const name of ["PROJECT.md", "GLOSSARY.md", "SPEC.md", "IMPLEMENTATION.md", "INTERFACE.md", "DEVELOPMENT.md", "VALIDATION.md"]) {
  assert.ok(docs["README.md"].includes(`\`${name}\``), `README must link ${name}`);
}

// Drawings, mechanism and gauges must state one law. Each of these was a live
// contradiction: a ladder the code does not use, a claim that no Pin is ever
// hidden after Group visibility made that routine, a Current drag described as
// Go where the law is Step, and an Address input described as clamping where
// Validation requires rejection.
assert.doesNotMatch(docs["IMPLEMENTATION.md"], /0\.25×–2×/,
  "The canonical Weight ladder is 0.125x-4x.");
assert.match(docs["IMPLEMENTATION.md"], /0\.125×–4×/);
assert.doesNotMatch(docs["README.md"], /hidden Pins,/,
  "Group visibility makes Timeline-hidden, Guide-reachable Pins ordinary.");
assert.doesNotMatch(docs["IMPLEMENTATION.md"], /Current marker: acquired on pointer-down, then exact Go/,
  "Releasing a Current drag commits a Step, not a Go.");
// Checked across every canonical document, not one: the contradiction this
// replaced survived in SPEC.md because the assertion named only INTERFACE.md.
for (const [name, text] of Object.entries(docs)) {
  assert.doesNotMatch(text, /clamp against Range/,
    `${name}: exact Address input rejects rather than clamps.`);
}
assert.match(docs["INTERFACE.md"], /reject anything outside Range/);

// The testing map is a gauge like any other, and an incomplete one is worse than
// none: twenty suites once held laws no document named, so the volume read as
// accumulation instead of coverage. Adding a suite without saying what it holds
// fails here, and so does naming a suite that no longer exists.
{
  const suites = readdirSync(new URL("./", import.meta.url))
    .filter(name => name.endsWith(".mjs") && !name.endsWith("-harness.mjs"));
  const listed = new Set(
    (docs["DEVELOPMENT.md"].match(/`[a-z0-9.-]+\.mjs`/g) || [])
      .map(entry => entry.slice(1, -1))
  );
  for (const suite of suites) {
    assert.ok(listed.has(suite), `DEVELOPMENT.md must say what \`${suite}\` holds.`);
  }
  for (const entry of listed) {
    assert.ok(suites.includes(entry), `DEVELOPMENT.md names a suite that does not exist: ${entry}`);
  }
}
assert.match(docs["SPEC.md"], /reject anything outside\nRange/);
assert.match(app, /function parseAddress[\s\S]*parts\.slice\(1\)\.some\(part => Number\(part\) >= 60\)/,
  "and refuses timecode parts that are not timecode.");

const canonicalText = [html, ...Object.values(docs)].join("\n");
// Names of things this project no longer has. Every entry was once described in
// a canonical document after the thing itself was gone: the Tune popover
// survived in three of them because moving the controls into Parameters changed
// no assertion. A retired interface element is a retired name.
assert.doesNotMatch(canonicalText, /\bApplication Continue\b|\bSkim\b|Fold Point proxy/i);
assert.doesNotMatch(canonicalText, /Tune popover|Tune disclosure|field-settings-popover/i,
  "The Panorama's Tune popover is gone: its controls are Parameters.");
assert.doesNotMatch(canonicalText, /Pin Forward\/Backward replaces Interval/i);
assert.doesNotMatch(html, /id="loop"|id="pin-backward"|id="pin-forward"/);

assert.match(html, /player-panel[\s\S]*timeline-panel[\s\S]*command-workspace/);
assert.match(app, /"player-panel",[\s\S]*"timeline-panel",[\s\S]*"parameter-panel",[\s\S]*"navigation-panel"[\s\S]*\.inert = compact && guideVisible/);
assert.doesNotMatch(app, /elements\["reader-column"\]\.inert/,
  "Compact Guide must not inert the Guide nested inside reader-column.");
assert.match(html, /command-workspace[\s\S]*parameter-panel[\s\S]*navigation-panel[\s\S]*guide-panel/);
assert.match(html, /id="guide-toggle"[^>]*aria-controls="command-workspace"/);
assert.match(html, /id="operator-toggle"[^>]*aria-controls="command-workspace"/);
assert.match(styles, /\.reader-column\.rail-collapsed[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*0/);
assert.match(styles, /\.command-workspace\.is-collapsed[\s\S]*visibility:\s*hidden/);
assert.match(styles, /\.navigation-panel\s*\{[\s\S]*?order:\s*2/);
assert.match(styles, /\.parameter-panel\s*\{[\s\S]*?order:\s*3/);
assert.match(styles, /\.guide-panel\s*\{[\s\S]*?order:\s*1/);
assert.match(app, /rail\.classList\.toggle\("is-collapsed",\s*!compact && !open\)/);
assert.match(app, /rail\.classList\.toggle\("mode-guide"[\s\S]*rail\.classList\.toggle\("mode-controls"/);
assert.match(app, /elements\[id\]\.hidden = !controlsVisible/);
assert.match(app, /"reader-column"\]\.classList\.toggle\("rail-collapsed",\s*!compact && !open\)/);
assert.match(html, /id="timeline-ruler"[\s\S]*id="section-lane"[\s\S]*id="pin-lane"/);
assert.match(html, /timeline-legend[\s\S]*timeline-key-sections[\s\S]*timeline-key-interval[\s\S]*timeline-key-pins/);
// Current reads its own Address on the map, under its marker. The header keeps
// only what the map does not already answer.
assert.doesNotMatch(html, /id="timeline-current-time"/,
  "Current must not be reprinted in the timeline header.");
assert.match(html, /id="cursor-time"[\s\S]*id="duration-time"/);
assert.match(view, /current-marker-time[\s\S]*currentMarkerTime\.textContent = formatTime\(candidate\)/);
assert.doesNotMatch(html, /id="fold-lane"/);
assert.match(html, /id="step-size-settings"[\s\S]*id="step-mode-fixed"[\s\S]*id="step-mode-adaptive"/);
assert.match(html, /data-step-fraction="0\.03125"[\s\S]*data-step-fraction="0\.0625"[\s\S]*data-step-fraction="0\.125"/);
assert.match(html, /Manual distance/);
// Step distance is a Timeline distance. The setting must say so, because the
// number only equals source seconds at neutral Weight.
assert.match(html, /Step distance is measured across the Timeline/);
assert.match(html, /active Range’s weighted Timeline width/);
// T is Tag: retaining what you are looking at is the thing reached for most, so
// it holds the key nearest the hand. Deform holds X. The pair T/Shift+T used to
// be P/Shift+P, far enough from the rest that Deform became the habitual way to
// make a Section -- which is how Deform acquired a creation job it never wanted.
assert.match(html, /id="pin-current"[^>]*aria-keyshortcuts="T"[^>]*>Tag as Pin</);
assert.match(html, /id="save-section"[^>]*aria-keyshortcuts="Shift\+T"[^>]*>Tag as Section</);
assert.doesNotMatch(html, /aria-keyshortcuts="P"|aria-keyshortcuts="Shift\+P"/,
  "P is unbound; nothing claims it.");
assert.match(html, /id="deform"[^>]*aria-keyshortcuts="X"/);
assert.match(html, /id="deform-down"[^>]*aria-keyshortcuts="Alt\+X"/);
assert.match(html, /id="deform-up"[^>]*aria-keyshortcuts="Shift\+X"/);
assert.doesNotMatch(html, /id="deform-weight-select"/);

assert.match(
  styles,
  /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward switch-endpoint step-forward"[\s\S]*"release deform focus"/
);
for (const area of [
  "#refine-backward { grid-area: refine-backward; }",
  "#switch-endpoint { grid-area: switch-endpoint; }",
  "#release { grid-area: release; }",
  ".deform-control { grid-area: deform; }",
  "#focus-toggle { grid-area: focus; }"
]) assert.ok(styles.includes(area), `Missing matrix area: ${area}`);

assert.match(styles, /\.deformation-atmosphere[\s\S]*linear-gradient/);
assert.match(styles, /\.deformation-contours i[\s\S]*linear-gradient/);
assert.match(view, /function sectionColor[\s\S]*#ff8a70[\s\S]*#c7d0dd/);
assert.match(
  styles,
  /\.pin-cluster-menu\s*\{[^}]*display:\s*grid[^}]*width:\s*min\(276px,[^}]*max-height:\s*184px[^}]*overflow-y:\s*auto/
);
assert.match(app, /pin-cluster-menu"\]\.addEventListener\("pointerdown"[\s\S]*beginGuideDrag\("pin"[\s\S]*origin:\s*"cluster-menu"/);
assert.match(app, /pin-cluster-menu"\]\.addEventListener\("click"[\s\S]*activatePinClusterChoice/);
// A Pin in the cluster menu is one control obeying the map's rule: click Goes,
// drag moves. A separate drag handle is a grammar used nowhere else.
assert.doesNotMatch(view, /pin-cluster-drag/,
  "The cluster menu must not carry a separate drag handle.");
assert.match(view, /button\.dataset\.pinGo = pin\.id[\s\S]*button\.dataset\.pinDrag = pin\.id/);
assert.match(app, /"pin-lane"\]\.addEventListener\("pointerdown"[\s\S]*beginGuideDrag\("pin"/);
// Alignment is geometric and may be shared; identity is not. Indication derives
// only from Pins currently on Timeline, and every Pin standing at a boundary is
// indicated rather than one chosen by array order.
assert.match(app, /function syncIntervalPinSelection[\s\S]*const alignedAt = address => orderedPins\(guide\(\)\)\s*\.filter\(pin => Math\.abs\(pin\.t - address\) <= EPSILON\)/,
  "Working-Interval endpoint indication may derive only from Pins currently on Timeline.");
assert.doesNotMatch(app, /function syncIntervalPinSelection[\s\S]*orderedPins\(guide\(\)\)\.find\(/,
  "and must not choose one coincident identity by array order.");
assert.match(app, /guideRetained:\s*null/);
assert.match(app, /function retainedIsOnTimeline[\s\S]*pinIsVisible[\s\S]*sectionIsVisible/);
assert.match(view, /state\(\)\.guideRetained\?\.kind === "section"/);
assert.match(view, /state\(\)\.guideRetained\?\.kind === "pin"/);
assert.match(app, /surface:\s*"guide"/,
  "Guide navigation must be distinguishable from Timeline operand acquisition.");
assert.doesNotMatch(app, /togglePinSelection|selectTimelinePin|data-select-pin/);
assert.match(app, /key === "t"[\s\S]*saveCurrentIntervalAsSection\(event,[\s\S]*source:\s*"interval"[\s\S]*useFormLabel:\s*false/);
assert.match(app, /plain && key === "t"[\s\S]*pinCurrent\(event,\s*\{\s*useFormLabel:\s*false\s*\}\)/);
assert.doesNotMatch(app, /key === "t"[\s\S]{0,180}openGuide\("(?:pins|sections)"\)/);
assert.doesNotMatch(app, /key === "p"/, "P is unbound.");
assert.match(view, /guideTitleActions[\s\S]*guide-title-rename[\s\S]*guide-title-delete/);
// Unlink acts on a shared Pin, so it lives with Pins and names the Section it
// releases. Reading a Section to operate on a Pin put the one object the
// operation is about out of view.
assert.match(view, /pin-unlink-actions[\s\S]*Unlink \$\{sectionDisplayName\(section\)\}/);
// One definition of an unnamed Section's name, shared by the kernel's
// transaction labels and every context with no Address field of its own.
assert.match(format, /export function sectionDisplayName[\s\S]*Section \$\{formatRange\(section\)\}/);
assert.match(session, /import \{ sectionDisplayName \} from "\.\/format\.js"/);
assert.doesNotMatch(session, /"Untitled Section"/);
assert.match(app, /const sectionName = sectionDisplayName/);
assert.doesNotMatch(view, /Unlink \$\{role === "start" \? "Start" : "End"\}/);
// And the Section states which Pin each endpoint is, rather than leaving it to
// be found by Address in a list ordered by Address.
assert.match(view, /dataset\.revealPin = revealPinId/);
// Address equality is not identity equality: Unlink deliberately makes
// coincident Pins, so a creation path may reuse exactly one match and must
// never pick among several.
assert.match(guide, /export function pinsAt/);
assert.match(guide, /matches\.length === 1 \? matches\[0\] : null/);
assert.match(app, /function revealPin[\s\S]*selectGuideTab\("pins"\)[\s\S]*kind: "pin"/);
assert.doesNotMatch(view, /Relink|data\.linkSectionEndpoint/);
assert.doesNotMatch(view, /guide-item-more|guide-secondary-actions|More actions for/);
assert.doesNotMatch(styles, /\.guide-item-more|\.guide-secondary-actions/);
assert.match(view, /dataset\.pinDrag\s*=\s*pin\.id/);
// The Temporal Topography owns spatial direct manipulation. Guide must not
// contain a second drag implementation.
assert.doesNotMatch(app, /"sections-list"\]\.addEventListener\("pointerdown"/,
  "Guide Section rows must not own a drag gesture.");
assert.doesNotMatch(app, /"pins-list"\]\.addEventListener\("pointerdown"/,
  "Guide Pin rows must not own a drag gesture.");
assert.match(app, /function sectionWireRole[\s\S]*SECTION_END_GRIP[\s\S]*return "midpoint"/,
  "The Section wire resolves its own roles from where it was pressed.");
assert.match(app, /"section-lane"\]\.addEventListener\("pointerdown"[\s\S]*?sectionWireRole\(body, event\)[\s\S]*?beginGuideDrag\("section"[\s\S]*?beginGuideDrag\(\s*"pin"/,
  "Pressing the wire acquires an endpoint Pin or the whole Section.");
assert.doesNotMatch(view, /timeline-section-node/,
  "No separate Section node chrome may be drawn over the map.");
assert.doesNotMatch(styles, /\.timeline-section-node/);
// Relative dragging converts pixels through the drawn span, so a focused map
// drags at the scale it is actually drawn at.
assert.match(app, /function sourceFromRelativeDragDelta[\s\S]*surfaceWidth[\s\S]*fractionToDistance[\s\S]*originClientX[\s\S]*viewStart[\s\S]*viewEnd/);
// A Pin has one Address and no extent, so a miniature track of that single
// point is the map redrawn at useless scale. Position is read and moved on the
// Temporal Topography; the Guide holds the exact Address.
assert.doesNotMatch(view, /pinPositionButton|pin-position-track/,
  "A Pin row must not redraw the map to place one point.");
assert.doesNotMatch(styles, /\.pin-position-track|\.endpoint-button/);
assert.doesNotMatch(view, /dataset\.sectionDrag/,
  "Guide's full-map profile is a read-only positional representation.");
// Guide is the exact editor: Address inputs plus the shared Nudge increments.
assert.match(view, /function addressControl\([\s\S]*dataset\.addressInput/);
assert.match(view, /function nudgeButton\([\s\S]*dataset\.nudgeTarget/);
assert.doesNotMatch(view, /className = "section-endpoints"/,
  "Guide shows one compact Address line, not a second positional track.");
assert.match(app, /function applyGuideAddressInput[\s\S]*moveGuidePin[\s\S]*moveGuideSection[\s\S]*checkpoint\(/,
  "Guide numeric editing and Timeline manipulation must call the same operation.");
assert.match(app, /function nudgeTarget\(target, direction, options = \{\}\)/);
assert.match(app, /function handleTimelineWheel[\s\S]*event\.shiftKey[\s\S]*event\.preventDefault\(\)[\s\S]*NUDGE_WHEEL_THRESHOLD/,
  "Shift-wheel nudging prevents the browser default only for an acquired target.");
assert.match(app, /function settleNudgeGesture[\s\S]*checkpoint\(state\.session, gesture\.label/,
  "One wheel series or held-key repetition settles as one Undo transaction.");
assert.match(app, /function beginCurrentDrag[\s\S]*state\.currentDrag = \{/,
  "Current is its own gesture owner on the Temporal Topography.");
assert.match(app, /function finishCurrentDrag[\s\S]*completePendingStep\(\)/,
  "Dragging Current settles as one Step transaction.");
assert.match(app, /function cancelActiveManipulation[\s\S]*currentDrag[\s\S]*guideDrag[\s\S]*dragHandle/,
  "Escape must cancel the live gesture before it closes anything behind it.");
assert.match(app, /if \(!cancelActiveManipulation\(\)\) stopOrClose\(\)/);
assert.match(app, /previewGuideAddressInput[\s\S]*placePlayer\(frame\.center\)/,
  "An exact edit must present the Frame its drag presents.");
assert.doesNotMatch(view, /guide-action-move/);
assert.match(app, /function previewGuideDrag[\s\S]*kind:\s*"section"[\s\S]*start:[\s\S]*center:[\s\S]*end:/);
assert.match(field, /function previewExtent[\s\S]*renderPreview/);
assert.match(field, /function clearPreview[\s\S]*restore/);
assert.match(app, /function sectionForSelectedPinExtent[\s\S]*startPinId[\s\S]*endPinId/);
assert.match(app, /function handleTimelineClick[\s\S]*closest\("\[data-section-go\]"\)/);
assert.doesNotMatch(styles, /\.timeline-section-control/);
assert.match(styles, /\.guide-section-weight/);
assert.match(styles, /\.guide-section-profile/);
assert.match(styles, /\.timeline-section-midpoint\s*\{/);
assert.match(styles, /\.timeline-section-relation\s*\{[^}]*repeating-linear-gradient\(/);
assert.match(view, /const pinTop\s*=\s*17[\s\S]*const trackTop\s*=\s*44[\s\S]*const sectionTop\s*=\s*rulerTop\s*\+\s*38/);
assert.match(view, /\["start",\s*projected\.start[\s\S]*\["midpoint",\s*midpointCoordinate[\s\S]*\["end",\s*projected\.end/);
// Increment controls repeat while held; a click-only binding cannot.
assert.match(app, /function bindHoldRepeat\(container, selector, act, \{ onSettle[\s\S]*HOLD_REPEAT_INTERVAL_MS/);
// One hold is one decision, so a held ladder control settles as one checkpoint
// rather than one per repeat. Weight uses the same origin-and-settle shape as
// Nudge instead of a second history mechanism of its own.
assert.match(app, /function beginWeightGesture[\s\S]*function settleWeightGesture[\s\S]*checkpoint\(state\.session/);
assert.match(app, /bindHoldRepeat\(\s*elements\["deform-up"\][\s\S]*onSettle: settleWeightGesture/);
// Every deferred gesture settles before the next transaction begins.
assert.match(app, /function settleBeforeAction[\s\S]*settleNudgeGesture\(\);\s*settleWeightGesture\(\);/);
// Cue retention is an ordinary accepted Guide transaction, so it persists.
assert.match(app, /function retainCue[\s\S]*accept\(pinned,[\s\S]*accept\(saved,/);
assert.doesNotMatch(app, /function retainCue[\s\S]*state\.session = (pinned|saved)\.session/);
assert.match(app, /bindGuideNudgeControls\(elements\["sections-list"\]\)/);
assert.match(app, /bindGuideNudgeControls\(elements\["pins-list"\]\)/);
assert.match(app, /bindHoldRepeat\(\s*elements\["deform-up"\],\s*null/);
// Nudge is a movement magnitude and sits with Step Reach, not with the Field's
// physical observation settings.
assert.match(html, /id="step-size-settings"[\s\S]*id="step-size-seconds"[\s\S]*id="nudge-seconds"[\s\S]*<\/details>/);
assert.doesNotMatch(html, /field-settings-popover[\s\S]{0,400}nudge-seconds/);
// One gutter and one control height across a Guide card.
assert.match(styles, /\.guide-item \{[\s\S]*--guide-gutter:[\s\S]*--guide-control:/);
for (const rule of ["guide-item-main", "guide-item-actions", "guide-addresses"]) {
  assert.match(
    styles,
    new RegExp(`\\.${rule} \\{[^}]*var\\(--guide-gutter\\)`),
    `${rule} must share the Guide gutter.`
  );
}
assert.match(styles, /\.section-item \.guide-item-actions \{[^}]*minmax\(0, 1fr\)/,
  "Guide action columns must be able to shrink inside the clipped card.");
// Current moves by Step law, never by Go, so a drag or Nudge extends or
// shortens the retained traversal instead of redrawing it.
assert.match(app, /function stepCurrentBySourceDelta[\s\S]*stepSession\(/);
assert.doesNotMatch(app, /function finishCurrentDrag[\s\S]*moveToAddress\(drag\.candidate/,
  "Dragging Current must not commit a Go.");
assert.match(app, /function finishCurrentDrag[\s\S]*performStep\(/);
assert.match(
  styles,
  /@media \(pointer: coarse\)[\s\S]*\.timeline-section-body[\s\S]*var\(--touch\)/
);
assert.match(styles, /\.timeline-pin[\s\S]*width:\s*var\(--pin-hit-size\)/);
assert.match(styles, /\.timeline-pin\.snap-target::before[\s\S]*var\(--success\)/);
assert.doesNotMatch(styles, /\.timeline-fold-/);
assert.match(styles, /--control-height:\s*40px/);
assert.match(styles, /--touch:\s*48px/);
assert.match(styles, /\.navigation-deck\s*\{[\s\S]*aspect-ratio:\s*1[\s\S]*grid-template-rows:\s*repeat\(3/);
assert.match(styles, /\.tool-disclosure > summary\s*\{[\s\S]*font-size:\s*0\.72rem[\s\S]*font-weight:\s*650/);
assert.match(styles, /\.tool-disclosure > summary span \+ span[\s\S]*font:\s*600 0\.7rem/);
assert.doesNotMatch(styles, /\.tool-disclosure > summary span:last-child/);
assert.match(styles, /@media \(min-width: 1240px\)[\s\S]*\.parameter-panel\s*\{[\s\S]*grid-template-columns:\s*1fr/);
assert.equal((styles.match(/@media \(min-width: 1240px\)/g) || []).length, 2);
assert.equal((fieldCss.match(/@media \(min-width: 1240px\)/g) || []).length, 1);
assert.match(fieldCss, /@container \(max-width: 860px\)/);
assert.doesNotMatch(grammarCss, /field-transport-bar|transport-actions|transport-readouts/);

assert.match(session, /STEP_REACH_MODE[\s\S]*FIXED:\s*"fixed"[\s\S]*ADAPTIVE:\s*"adaptive"/);
assert.match(session, /DEFAULT_STEP_FRACTION\s*=\s*1\s*\/\s*16/);
assert.match(session, /export function effectiveStepReach/);
assert.match(session, /export function localRefine/);
assert.match(session, /export function refine/);
assert.match(session, /export function stepToPin/);
assert.match(session, /export function releaseInterval/);
assert.match(session, /export function deformSection/);
assert.match(session, /export function setGuideSectionWeight/);
assert.match(session, /export function goToGuidePin/);
assert.match(session, /export function goToGuideSection/);
assert.match(session, /export function workFromExtent/);
assert.match(session, /export function unlinkGuideSectionEndpoint/);
assert.match(session, /export function linkGuidePins/);
assert.match(session, /export function switchEndpoint[\s\S]*nextSide[\s\S]*departure:\s*retainedDeparture[\s\S]*arrival:\s*departure/);

assert.match(guide, /SECTION_WEIGHT_VALUES[\s\S]*0\.25[\s\S]*2/);
assert.match(guide, /export function setSectionWeight/);
assert.match(guide, /export function sectionsForPin/);
assert.match(guide, /export function unlinkSectionEndpoint/);
assert.match(guide, /export function canLinkPins/);
assert.match(guide, /export function linkPins/);
assert.doesNotMatch(guide, /provenance:\s*`unlink:/);
assert.match(app, /PIN_SNAP_DISTANCE_PX\s*=\s*16/);
assert.match(app, /function pinSnapCandidate[\s\S]*canLinkPins[\s\S]*snapTargetPinId/);
assert.match(app, /linkGuidePins\([\s\S]*drag\.snapTargetPinId[\s\S]*"Link Pins"/);
assert.match(guide, /function translatedPinIds[\s\S]*section\.startPinId[\s\S]*section\.endPinId/);
assert.doesNotMatch(guide, /fold-topology-conflict|collapsedFrontier/);

assert.match(projection, /export function createTimelineProjection/);
assert.match(projection, /buildSegments/);
assert.match(projection, /contributors\.reduce[\s\S]*product \* activeWeight/);
assert.match(projection, /orderedPinStops/);
assert.match(projection, /weightAtSource/);
assert.doesNotMatch(projection, /affinity|materializ|collapse|fold/i);
assert.doesNotMatch(projection, /player|document|window/);

assert.match(transport, /PLAYBACK:\s*"playback"/);
assert.match(transport, /CONTEXT:\s*"context"/);
assert.match(transport, /export function isProperRange/);
assert.match(transport, /export function rebasePlaybackTransport/);
assert.doesNotMatch(transport, /\bLOOP\s*:|CONTINUE|SKIM/);

assert.match(app, /preferences\.fieldBreath/);
assert.doesNotMatch(app, /onHoldOffsets:/);
assert.doesNotMatch(field, /onHoldOffsets/);
assert.match(app, /function changeFieldBoundary[\s\S]*state\.fieldBreath\s*=/);
// Field Frame resolution is pure and owns no transport, breathing, or Session.
assert.match(fieldFrame, /export function createFieldFrameSequencer/);
assert.match(fieldFrame, /export function contextFrame/);
assert.match(fieldFrame, /export function operatorFrame/);
assert.match(fieldFrame, /export function directFrame/);
assert.doesNotMatch(fieldFrame, /document\.(?:getElementById|createElement|querySelector)|window\.(?:set|add|match)|createYouTubePlayer|addEventListener/);
assert.doesNotMatch(fieldFrame, /import .*session\.js|import .*guide\.js|import .*transport\.js|import .*timeline-projection\.js/);
// The breathing state machine is pure geometry; the controller owns its runtime.
assert.match(fieldGeometry, /export function advanceBreath/);
assert.match(fieldGeometry, /export function holdBreath/);
assert.match(fieldGeometry, /export function effectiveBreathBounds/);
assert.match(field, /runtime\.frameGeneration/);
// The Field transition is an opacity cue only. Translating the panes reads as a
// shake: nothing can actually travel between roles, because three iframes cannot
// be reparented.
assert.doesNotMatch(
  fieldCss,
  /@keyframes field-[a-z-]+\s*\{[^}]*translateX/,
  "Field transitions must not translate the panes."
);
assert.match(fieldCss, /@keyframes field-role-settled/);
assert.match(fieldCss, /@keyframes field-role-arriving/);
// The pane bar creates a stacking context, so it must out-rank the full-bleed
// transport surface or its Tune popover cannot be clicked.
const barZ = Number(fieldCss.match(/\.step-pane-bar\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
const surfaceZ = Number(styles.match(/\.center-transport-surface\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
assert.ok(Number.isFinite(barZ) && Number.isFinite(surfaceZ));
assert.ok(
  barZ > surfaceZ,
  "The pane bar must paint above the play/pause surface so Tune inputs stay clickable."
);
// Coalescing comes from parkSide recording the newest desired address before
// any early return, so a late callback decodes the current Frame by itself.
assert.match(field, /side\.desiredAddress = target;[\s\S]{0,800}?if \(!force && \(alreadyThere \|\| recentlyPlaced\)\)/,
  "parkSide must record the newest desired address before it may return early.");
assert.doesNotMatch(field, /placementGeneration/,
  "An inert stale-frame token must not survive as decoration.");
assert.match(app, /function setStepMode/);
assert.match(app, /function setStepFraction/);
assert.match(app, /function wrapPlaybackRange/);
assert.match(app, /rebasePlaybackTransport\(transport,\s*range\.start\)/);
assert.match(app, /function releaseWorkingInterval/);
assert.match(app, /function deformWorkingOrSelected/);
assert.match(app, /function changeSectionWeight/);
assert.match(app, /function focusOrUnfocus/);

assert.doesNotMatch(app, /createSkimTransport|startLoop|wrapLoopTransport/);
assert.doesNotMatch(view, /dataset\.loopSection/);
assert.match(view, /dataset\.sectionWeight/);
assert.match(view, /timeline-section-span/);
assert.match(view, /function deformationInfluence[\s\S]*Math\.log2\(section\.weight\)[\s\S]*deformation-contours/);
assert.match(view, /function deformationInfluence[\s\S]*spanRatio[\s\S]*Math\.sqrt[\s\S]*dilution/);
assert.match(view, /SECTION_WEIGHT_VALUES/);
assert.doesNotMatch(view, /timeline-fold|foldContributors|sectionCollapse|sectionExpand/);
assert.match(view, /timeline-ruler-tick/);
assert.match(view, /packTimelineSectionLanes/);
assert.match(view, /timelinePinClusterGap/);
assert.match(view, /COARSE_TIMELINE_PIN_HIT_SIZE\s*=\s*56/);
assert.match(view, /TIMELINE_PIN_HIT_SIZE\s*=\s*52/);
assert.match(view, /TIMELINE_SECTION_HIT_WIDTH\s*=\s*28/);
// The relationship band is bounded, as the canonical documents say. Overlap
// creates lanes without limit, so an unbounded band moved the whole workspace
// down by a lane per overlap. The band stops at MAX_LANES and deeper structure
// scrolls inside it -- lanes are never reused by modulo, which would overlap two
// Sections into one control.
assert.match(view, /TIMELINE_SECTION_MAX_LANES\s*=\s*5/);
assert.match(view, /Math\.min\(laneCount, TIMELINE_SECTION_MAX_LANES\)/);
assert.match(view, /classList\.toggle\("is-overflowing"/);
assert.match(styles, /\.section-lane\.is-overflowing[\s\S]*overflow-y:\s*auto/);
assert.doesNotMatch(view, /lane % TIMELINE_SECTION_MAX_LANES/);
assert.match(view, /bandLanes \* sectionLaneHeight/);
assert.match(view, /laneCount \* sectionLaneHeight/,
  "and the true depth is still measured, so the band can scroll to it.");
assert.match(view, /--pin-hit-size/);
assert.match(styles, /\.timeline-pin:active:not\(:disabled\)[\s\S]*transform:\s*translate\(-50%, -50%\)/);
assert.doesNotMatch(view, /dataset\.(references|pinKind)/);
assert.doesNotMatch(view, /--section-lane|--section-band-height/);
assert.doesNotMatch(app, /else if \(plain && event\.key === " "\)/);

assert.match(stepGesture, /createStepGestureController/);
assert.match(stepGesture, /bindStepPress/);
assert.doesNotMatch(field, /bindSideStepSurface/);
assert.match(fieldGeometry, /DEFAULT_FIELD_RESPONSE/);
assert.doesNotMatch(fieldGeometry, /stepSeconds|sideActivationMode/);
assert.doesNotMatch(field, /globalThis\.YT/);
assert.doesNotMatch(app, /globalThis\.YT/);
assert.match(fieldCss, /\.lead-pane \.step-pane-bar,[\s\S]*flex-direction:\s*row-reverse/);
assert.match(fieldCss, /\.step-field\.is-preview \.step-pane-side \.player-wrap/);
assert.match(styles, /--range-rgb:[\s\S]*--resolution-rgb:[\s\S]*--interval-rgb:[\s\S]*--field-rgb:[\s\S]*--preview-rgb:/);
for (const token of ["text", "muted", "faint"]) {
  assert.ok(
    contrastRatio(cssHex(token), cssHex("surface")) >= 4.5,
    `--${token} must retain text contrast against --surface.`
  );
}
assert.doesNotMatch(`${app}\n${field}`, /\.raw\?\.\(|\.raw\(\)/,
  "Composition and Field code must not reach through the YouTube adapter.");
assert.match(youtube, /export function isYouTubeApiReady/);
assert.match(youtube, /releaseKeyboardFocus\(activeElement\)/);
assert.equal((youtube.match(/new\s+globalThis\.YT\.Player/g) || []).length, 1);
assert.doesNotMatch(rangeGeometry, /\bskim\b|logSpeed|chooseSupportedRate/i);

for (const required of [
  "v5.8-regression-tests.mjs",
  "timeline-projection-tests.mjs",
  "v7-deformation-tests.mjs",
  "v7-coherence-tests.mjs",
  "transport-tests.mjs",
  "endpoint-transposition-tests.mjs",
  "semantic-composition-tests.mjs",
  "semantic-audit-probes.mjs",
  "step-gesture-tests.mjs",
  "field-coherence-tests.mjs"
]) assert.ok(pkg.scripts.test.includes(required), `Missing test gate: ${required}`);
assert.match(pkg.scripts["test:semantic"], /semantic-state-space-tests\.mjs/);
assert.match(pkg.scripts.check, /npm run test:semantic/);
assert.match(pkg.scripts.audit, /integration-check\.mjs/);
assert.match(pkg.scripts.audit, /project-audit\.mjs/);

assert.match(docs["SPEC.md"], /Timeline Space/);
assert.match(docs["SPEC.md"], /source-contiguous/);
assert.match(docs["SPEC.md"], /one Undo transaction/);
assert.match(docs["IMPLEMENTATION.md"], /step-gesture\.js/);
assert.match(docs["IMPLEMENTATION.md"], /timeline-projection\.js/);
assert.match(docs["IMPLEMENTATION.md"], /positive spatial/);
assert.match(docs["VALIDATION.md"], /each wrap rebases each available side at most once/);
assert.match(docs["VALIDATION.md"], /1\/32[\s\S]*1\/16[\s\S]*1\/8/);
assert.match(docs["INTERFACE.md"], /bounded five-lane visual band/);
assert.match(docs["INTERFACE.md"], /complete extent the Working Interval/);
assert.match(docs["INTERFACE.md"], /free and shared Pins[\s\S]*main Range \/ Resolution track[\s\S]*source ruler[\s\S]*Section relationship tree/);
assert.match(docs["INTERFACE.md"], /A Pin drag centers that Pin[\s\S]*Tail at Start,\s*\n?Center at midpoint, and Lead at End/);
assert.match(docs["INTERFACE.md"], /Field Frame/);
assert.match(docs["INTERFACE.md"], /Field Breath/);
assert.match(docs["INTERFACE.md"], /Inner offset\s+x/);
assert.match(docs["INTERFACE.md"], /Outer offset\s+y/);
assert.match(docs["INTERFACE.md"], /Stretch \/ Hold/);
assert.match(docs["README.md"], /stable directional slideshow\s*\n?around Current/);
assert.match(docs["README.md"], /breathes continuously between inner\s*\n?and outer offsets until Hold preserves the attained relation/);
assert.match(docs["PROJECT.md"], /Field Frame/);
assert.match(docs["PROJECT.md"], /^# Video Cartography\r?\n/);
assert.match(docs["GLOSSARY.md"], /^# Video Cartography — Canonical Glossary\r?\n/);
for (const term of [
  "Panoramic Phase Field", "Field Frame", "Field Breath", "Inner Offset",
  "Outer Offset", "Temporal Topography", "Nudge"
]) {
  assert.match(
    docs["GLOSSARY.md"],
    new RegExp(`\\*\\*[^*]*${term}[^*]*\\*\\* —`),
    `Glossary must define ${term}`
  );
}
assert.match(docs["PROJECT.md"], /minimum offset is a law rather than a preference/);
assert.match(docs["PROJECT.md"], /Field Breath/);
assert.match(docs["SPEC.md"], /### Field Frame/);
assert.match(docs["SPEC.md"], /#### Slideshow transitions/);
assert.match(docs["SPEC.md"], /#### Persistent Context framing/);
assert.match(docs["SPEC.md"], /### Current drag and Nudge as Step/);
assert.doesNotMatch(docs["SPEC.md"], /Current drag as Go/);
assert.match(docs["SPEC.md"], /### Nudge/);
assert.match(docs["SPEC.md"], /### Exact Guide editing/);
assert.doesNotMatch(docs["SPEC.md"], /maximum Stretch[\s\S]{0,80}becomes Hold/i,
  "Reaching the outer offset begins contraction; it is not an automatic Hold.");
assert.match(docs["IMPLEMENTATION.md"], /field-frame\.js/);
assert.match(docs["IMPLEMENTATION.md"], /Transition revision ownership/);
assert.match(docs["IMPLEMENTATION.md"], /Breathing state machine/);
assert.match(docs["IMPLEMENTATION.md"], /Nudge transaction batching/);
assert.match(docs["IMPLEMENTATION.md"], /Exact Guide input routing/);
assert.match(docs["VALIDATION.md"], /lists choices vertically, scrolls by wheel/);

console.log("Project audit passed: v7 matrix, independent Step sizing, weighted Section graph, source-contiguous Range playback, timeline presentation, module boundaries, and canonical documents agree.");
