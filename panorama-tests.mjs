import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PANORAMA_STATE,
  derivePanoramaBounds,
  derivePanorama,
  chooseNearestRate,
  resolvePanoramaPhase
} from "./panorama-geometry.js";
import {
  PANORAMA_SIDE_MODE,
  panoramaShouldSuspend,
  panoramaPreferenceRequiresEstablish
} from "./panorama.js";
import {
  OBSERVATION_POLICY,
  createPlaybackTransport,
  fixedRatePolicy
} from "./transport.js";

{
  const bounds = derivePanoramaBounds({
    current: 50,
    stepDistance: { backward: 10, forward: 10, linked: true },
    range: { start: 0, end: 100 }
  });
  assert.deepEqual(bounds, {
    current: 50,
    requestedReach: { backward: 10, forward: 10, linked: true },
    tail: { target: 40, reach: 10, constrained: false },
    lead: { target: 60, reach: 10, constrained: false },
    envelope: { start: 40, end: 60 },
    constraint: "none"
  });

  const field = derivePanorama(50, { backward: 10, forward: 10, linked: true }, { start: 0, end: 100 });
  assert.equal(field.center, 50);
  assert.equal(field.tail.target, 40);
  assert.equal(field.tail.distance, 10);
  assert.equal(field.tail.available, true);
  assert.equal(field.lead.target, 60);
  assert.equal(field.lead.distance, 10);
  assert.equal(field.lead.available, true);
  assert.equal(field.constraint, "none");
}

{
  const field = derivePanorama(4, { backward: 10, forward: 10, linked: true }, { start: 0, end: 12 });
  assert.equal(field.tail.target, 0);
  assert.equal(field.tail.distance, 4);
  assert.equal(field.tail.constrained, true);
  assert.equal(field.lead.target, 12);
  assert.equal(field.lead.distance, 8);
  assert.equal(field.lead.constrained, true);
  assert.equal(field.constraint, "both");
}

assert.equal(chooseNearestRate([0.25, 0.5, 1, 1.5, 2], 0.5), 0.5);
assert.equal(chooseNearestRate([1, 1.25, 1.5], 2), 1.5);
assert.equal(chooseNearestRate([], 2), 1);

assert.equal(PANORAMA_SIDE_MODE.FROZEN, "frozen");
assert.equal(PANORAMA_SIDE_MODE.STRETCHING, "stretching");
assert.equal(panoramaShouldSuspend({ transportKind: "context" }), true);
assert.equal(panoramaShouldSuspend({ transportKind: "playback" }), false);
const panoramaPlayback = createPlaybackTransport({
  departure: 10,
  observationPolicy: OBSERVATION_POLICY.PANORAMA,
  ratePolicy: fixedRatePolicy(1),
  offeredRates: [0.75, 1, 1.25],
  actualRate: 1
});
const centerOnlyPlayback = createPlaybackTransport({
  departure: 10,
  observationPolicy: OBSERVATION_POLICY.CENTER_ONLY,
  ratePolicy: fixedRatePolicy(1),
  offeredRates: [0.75, 1, 1.25],
  actualRate: 1
});
assert.equal(panoramaShouldSuspend({ transport: panoramaPlayback }), false);
assert.equal(panoramaShouldSuspend({ transport: centerOnlyPlayback }), true);
assert.equal(panoramaShouldSuspend({ pendingStep: true, transportKind: "idle" }), true);
assert.equal(panoramaShouldSuspend({ dragging: true, transportKind: "idle" }), true);
assert.equal(panoramaPreferenceRequiresEstablish({ tailVisible: false }), false);
assert.equal(panoramaPreferenceRequiresEstablish({ tailVisible: true }), true);
assert.equal(panoramaPreferenceRequiresEstablish({ tailRate: 0.75 }), false);

assert.equal(resolvePanoramaPhase({ enabled: false, suspended: false, sides: [] }), PANORAMA_STATE.OFF);
assert.equal(resolvePanoramaPhase({ enabled: true, suspended: true, sides: [] }), PANORAMA_STATE.SUSPENDED);
assert.equal(resolvePanoramaPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, frozen: false, offset: 2 },
    { visible: true, available: true, frozen: false, offset: 3 }
  ]
}), PANORAMA_STATE.UNFOLDING);
assert.equal(resolvePanoramaPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, frozen: true, offset: 10 },
    { visible: true, available: true, frozen: false, offset: 6 }
  ]
}), PANORAMA_STATE.PARTIAL);
assert.equal(resolvePanoramaPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, frozen: true, offset: 10 },
    { visible: true, available: true, frozen: true, offset: 10 }
  ]
}), PANORAMA_STATE.FROZEN);

{
  const html = readFileSync("index.html", "utf8");
  const css = readFileSync("panorama.css", "utf8");
  const layoutCss = readFileSync("styles.css", "utf8");
  const app = readFileSync("app.js", "utf8");
  const panoramaSource = readFileSync("panorama.js", "utf8");
  const youtubeSource = readFileSync("youtube.js", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  for (const id of [
    "panorama", "player-tail", "player", "player-lead", "center-transport-surface",
    "tail-player-surface", "lead-player-surface",
    "panorama-both-toggle", "panorama-cycle-rate",
    "panorama-inner-offset", "panorama-outer-offset", "nudge-distance",
    "current-marker", "current-departure-marker",
    "tail-collapse", "lead-collapse", "tail-restore", "lead-restore", "panorama-toggle"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing Step Panorama DOM id: ${id}`);
  }

  assert.match(app, /createPanoramaController/);
  assert.match(app, /createStepGestureController/);
  assert.match(
    app,
    /const sideStep = role => event => \{[\s\S]*panorama\?\.getStepSelection[\s\S]*carryRetained: event\?\.altKey === true \|\| state\.carryModifier/,
    "Every side Step source must preserve the originating event's carry modifier in the shared transaction."
  );
  assert.match(app, /bindStepPress\(control/);
  assert.match(app, /performStep\(selection\.direction, selection\.distance/);
  assert.match(app, /function startPanoramaPlaybackFromGesture\(options = \{\}\)/);
  assert.match(app, /panorama\?\.playFromGesture\?\.\(\{ center: destination, reason: "playback" \}\);[\s\S]*player\.play\(\);/,
    "Parent-owned playback must refold/start both side players and Center in one synchronous gesture stack.");
  // Observation ownership, not an inferred rate or modifier, decides whether
  // the Panorama participates. The confirmed actual rate is then the authority
  // on whether fixed offsets can still be maintained.
  assert.match(
    app,
    /observationPolicy: shifted[\s\S]*OBSERVATION_POLICY\.CENTER_ONLY[\s\S]*OBSERVATION_POLICY\.PANORAMA[\s\S]*if \(playbackAllowsPanorama\(state\.transport, \{ offeredRates/,
    "Playback must name its observation owner explicitly before deciding whether the Panorama participates."
  );
  assert.match(app, /player\.setRate\(state\.transport\.requestedRate\);\s*player\.play\(\);/,
    "and the rate is established before the play command that uses it.");
  assert.match(app, /center-transport-surface/);
  assert.match(panoramaSource, /function playFromGesture\(options = \{\}\)/);
  assert.doesNotMatch(app, /onHoldOffsets:/);
  assert.doesNotMatch(panoramaSource, /onHoldOffsets/);
  assert.match(panoramaSource, /const PANORAMA_SIDE_MODE/);
  assert.match(panoramaSource, /function stretch\(role = "both"\)/);
  assert.match(panoramaSource, /function freeze\(role = "both"\)/);
  assert.match(panoramaSource, /function toggleBoth\(\)/);
  assert.doesNotMatch(panoramaSource, /function toggleSide\(/,
    "Cycling is one coordinated relation; independent side Stretch/Freeze controls are removed.");
  assert.doesNotMatch(html, /id="(?:tail|lead)-panorama-visibility-toggle"/,
    "There is one combined Stretch/Freeze control.");
  assert.doesNotMatch(html, /id="(?:tail|lead)-rate-select"/,
    "The interface exposes one cycling-rate pair, not two independent side rates.");
  assert.match(panoramaSource, /function freezeSideForPause\(side, center, snapshot\)/);
  assert.match(panoramaSource, /function translateToCurrent\(current, \{ preserve = true \} = \{\}\)/);
  assert.match(panoramaSource, /const retained = side\.offset > REACH_TOLERANCE[\s\S]*side\.offset[\s\S]*side\.configuredOffset/,
    "Semantic traversal must translate a live frozen relation, falling back only to its distinct configured Offset.");
  assert.match(panoramaSource, /Context and semantic gestures are Center-only/);
  assert.match(panoramaSource, /function beginStretch\(side, center, snapshot,[\s\S]*requestRate\(side, 1, true\)[\s\S]*side\.adapter\?\.play\?\.\(\)/,
    "Every play must refold and prime a side at 1× before directional-rate discovery.");
  assert.match(panoramaSource, /mode:\s*"step"/);
  assert.doesNotMatch(panoramaSource, /mode:\s*"go"/);
  assert.match(panoramaSource, /accessible:\s*false/);
  assert.doesNotMatch(panoramaSource, /\.raw\?\.\(|\.raw\(\)/,
    "Panorama code must request an inaccessible side player without reaching through its adapter.");
  assert.match(panoramaSource, /function parkSide\(side, address, \{ force = false \} = \{\}\)/);
  assert.match(panoramaSource, /if \(!side\.sourceReady\)[\s\S]*side\.adapter\?\.chapter\?\.\(side\.videoId, target\)[\s\S]*return true;[\s\S]*side\.adapter\?\.place\?\.\(target\)[\s\S]*side\.adapter\?\.pause\?\.\(\)/,
    "A source may be cued only while preparing; source-ready paused sides must seek and pause on their represented frame.");
  assert.match(panoramaSource, /function beginStretch\(side, center, snapshot,[\s\S]*if \(play && side\.sourceReady\)[\s\S]*side\.adapter\?\.play\?\.\(\)/,
    "Trusted side playback must start only after that side source has reached CUED readiness.");
  assert.match(panoramaSource, /render\(snapshot\);[\s\S]*ensurePlayers\(prefs\);/,
    "Side panes must be rendered and measurable before player creation.");
  assert.match(youtubeSource, /DEFAULT_IFRAME_ALLOW[\s\S]*"autoplay"/);
  assert.match(youtubeSource, /setAttribute\?\.\("allow", options\.iframeAllow \|\| DEFAULT_IFRAME_ALLOW\)/);
  assert.match(youtubeSource, /setAttribute\?\.\("tabindex", "-1"\)/);
  assert.match(youtubeSource, /options\.accessible === false[\s\S]*setAttribute\?\.\("aria-hidden", "true"\)/);
  assert.doesNotMatch(html, /class="panorama-pane-action"/,
    "YouTube side iframes must not be covered by a transparent action element.");
  assert.match(html, /id="tail-player-surface"[\s\S]*role="button"[\s\S]*id="player-tail"/);
  assert.match(html, /id="lead-player-surface"[\s\S]*role="button"[\s\S]*id="player-lead"/);
  // Settings have one home: State & Settings owns what is remembered, and the surface
  // owns what is momentary. The Panorama's offsets and cycling pair persist,
  // so they are State & Settings; showing the Panorama, collapsing a side and holding
  // a span act on what you are looking at, so they stay on it.
  assert.match(
    html,
    /id="parameter-panel"[\s\S]*id="panorama-inner-offset"[\s\S]*id="panorama-outer-offset"[\s\S]*id="panorama-cycle-rate"/,
    "Persisted Panorama tuning belongs to State & Settings."
  );
  assert.match(
    html,
    /id="player-panel"[\s\S]*id="panorama-toggle"[\s\S]*id="panorama-both-toggle"[\s\S]*id="parameter-panel"/,
    "and the momentary Panorama controls stay on the Panorama."
  );
  assert.doesNotMatch(html, /class="panorama-settings-popover"/,
    "The Tune popover is gone: its contents are State & Settings now.");
  assert.doesNotMatch(html, /id="(?:tail|lead)-step-button"/,
    "The side video surfaces already own Step; duplicate footer buttons must not return.");
  assert.match(css, /\.side-player-surface iframe[\s\S]*pointer-events:\s*none/,
    "Side video surfaces must route clicks to semantic Step instead of independently toggling muted iframes.");
  assert.match(html, /id="center-transport-surface"/,
    "Paused Center must expose a parent-owned playback surface for shared iframe activation.");
  assert.match(layoutCss, /\.center-transport-surface[\s\S]*position:\s*absolute/);
  assert.match(css, /grid-template-areas:\s*"tail center lead"[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.1fr\) minmax\(0, 1fr\)/,
    "Wide panes must occupy explicit Tail | Center | Lead areas without fixed minima that clip the containing panel.");
  assert.match(css, /\.panorama-pane\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    "Every pane must force its implicit content track to shrink instead of clipping the Lead controls.");
  assert.match(layoutCss, /\.player-panel\s*\{[\s\S]*container-type:\s*inline-size/,
    "Step Panorama responsive geometry must measure its containing panel.");
  assert.match(css, /\.panorama\.panorama-off[\s\S]*grid-template-areas:\s*"center"[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    "Panorama-off projection must remain Center-only even when collapsed preferences persist.");
  assert.match(css, /\.panorama\.tail-collapsed:not\(\.lead-collapsed\):not\(\.panorama-off\)[\s\S]*grid-template-columns:\s*48px minmax\(0, 1fr\)/,
    "A collapsed Tail must release medium-layout width to Lead.");
  assert.match(css, /\.panorama\.lead-collapsed:not\(\.tail-collapsed\):not\(\.panorama-off\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 48px/,
    "A collapsed Lead must release medium-layout width to Tail.");
  assert.match(css, /@container \(max-width: 1440px\)[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    "Three-pane controls must fold before their four-column minimum can clip a side pane.");
  assert.match(
    css,
    /@container \(max-width: 680px\)[\s\S]*\.panorama\.tail-collapsed\.lead-collapsed:not\(\.panorama-off\)[\s\S]*grid-template-areas:\s*"center"\s*"tail"\s*"lead"/,
    "Phone stacking must override the more-specific collapsed medium layout."
  );
  assert.match(panoramaSource, /const availableRoles = controllableRoles\(snapshot, prefs\)[\s\S]*const frozen = runtime\.cycle\.frozen/,
    "Combined Panorama state must derive from one cycling relation over currently operational projections.");
  assert.match(panoramaSource, /function sideIsOperational\([\s\S]*sideIsVisible[\s\S]*side\.sourceReady[\s\S]*effectiveOffset/,
    "One operational predicate must govern side controls, side Step, and combined Panorama actions.");
  assert.match(panoramaSource, /function sidePlaybackAllowed\([\s\S]*runtime\.centerWasRunning[\s\S]*!runtime\.suspended/,
    "Delayed side-player events must re-check current Panorama ownership before playing.");
  assert.match(panoramaSource, /runtime\.restoreRoles/,
    "Restoring one collapsed projection must not force a sibling re-establishment.");
  assert.match(panoramaSource, /side\.ready = Boolean\(side\.adapter\)/);
  assert.match(panoramaSource, /resetSources/);
  assert.match(app, /panorama\?\.resetSources\?\.\(\)/,
    "Reloading a video must release stale side-source errors, including same-video reloads.");
  assert.match(css, /\.panorama-pane \.player-wrap[\s\S]*min-height:\s*200px/);
  assert.match(css, /@container \(max-width: 680px\)/);
  assert.match(css, /@media \(min-width: 1240px\)/);
  assert.match(layoutCss, /@media \(min-width: 1240px\)/);
  assert.match(packageJson.scripts.check, /panorama\.js/);
  assert.match(packageJson.scripts.test, /panorama-tests\.mjs/);
}

console.log("All Step Panorama tests passed: geometry, suspension, Freeze/Stretch, side Step, visible bootstrap, shared user activation, autoplay delegation, chapter-based parking, rate priming, and panoramic layout.");
