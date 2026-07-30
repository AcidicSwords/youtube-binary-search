import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STEP_FIELD_PHASE,
  deriveFieldBounds,
  deriveStepField,
  chooseNearestRate,
  resolveFieldPhase
} from "./step-field-geometry.js";
import {
  FIELD_SIDE_MODE,
  fieldShouldSuspend,
  fieldPreferenceRequiresEstablish
} from "./step-field.js";

{
  const bounds = deriveFieldBounds({
    current: 50,
    stepReach: { backward: 10, forward: 10, linked: true },
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

  const field = deriveStepField(50, { backward: 10, forward: 10, linked: true }, { start: 0, end: 100 });
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
  const field = deriveStepField(4, { backward: 10, forward: 10, linked: true }, { start: 0, end: 12 });
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

assert.equal(FIELD_SIDE_MODE.HELD, "held");
assert.equal(FIELD_SIDE_MODE.STRETCHING, "stretching");
assert.equal(fieldShouldSuspend({ transportKind: "context" }), true);
assert.equal(fieldShouldSuspend({ transportKind: "playback" }), false);
assert.equal(fieldShouldSuspend({ pendingStep: true, transportKind: "idle" }), true);
assert.equal(fieldShouldSuspend({ dragging: true, transportKind: "idle" }), true);
assert.equal(fieldPreferenceRequiresEstablish({ tailVisible: false }), false);
assert.equal(fieldPreferenceRequiresEstablish({ tailVisible: true }), true);
assert.equal(fieldPreferenceRequiresEstablish({ tailRate: 0.75 }), false);

assert.equal(resolveFieldPhase({ enabled: false, suspended: false, sides: [] }), STEP_FIELD_PHASE.OFF);
assert.equal(resolveFieldPhase({ enabled: true, suspended: true, sides: [] }), STEP_FIELD_PHASE.SUSPENDED);
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: false, offset: 2 },
    { visible: true, available: true, held: false, offset: 3 }
  ]
}), STEP_FIELD_PHASE.UNFOLDING);
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 10 },
    { visible: true, available: true, held: false, offset: 6 }
  ]
}), STEP_FIELD_PHASE.PARTIAL);
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 10 },
    { visible: true, available: true, held: true, offset: 10 }
  ]
}), STEP_FIELD_PHASE.HELD);

{
  const html = readFileSync("index.html", "utf8");
  const css = readFileSync("step-field.css", "utf8");
  const layoutCss = readFileSync("styles.css", "utf8");
  const app = readFileSync("app.js", "utf8");
  const fieldSource = readFileSync("step-field.js", "utf8");
  const youtubeSource = readFileSync("youtube.js", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  for (const id of [
    "step-field", "player-tail", "player", "player-lead", "center-transport-surface",
    "tail-player-surface", "lead-player-surface", "tail-step-button", "lead-step-button",
    "tail-field-toggle", "lead-field-toggle", "field-both-toggle",
    "tail-rate-select", "lead-rate-select",
    "step-backward-seconds", "step-forward-seconds",
    "tail-collapse", "lead-collapse", "tail-restore", "lead-restore", "step-field-toggle"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing Step Field DOM id: ${id}`);
  }

  assert.match(app, /createStepFieldController/);
  assert.match(app, /createStepGestureController/);
  assert.match(
    app,
    /const sideStep = role => event => \{[\s\S]*stepField\?\.getStepSelection[\s\S]*carryRetained: event\?\.altKey === true \|\| state\.carryModifier/,
    "Every side Step source must preserve the originating event's carry modifier in the shared transaction."
  );
  assert.match(app, /bindStepPress\(control/);
  assert.match(app, /performStep\(selection\.direction, selection\.distance/);
  assert.match(app, /function startFieldPlaybackFromGesture\(\)/);
  assert.match(app, /stepField\?\.playFromGesture\?\.\(\{ center: destination, reason: "playback" \}\);[\s\S]*player\.play\(\);/,
    "Parent-owned playback must refold/start both side players and Center in one synchronous gesture stack.");
  assert.match(app, /center-transport-surface/);
  assert.match(fieldSource, /function playFromGesture\(options = \{\}\)/);
  assert.doesNotMatch(app, /onHoldOffsets:/);
  assert.doesNotMatch(fieldSource, /onHoldOffsets/);
  assert.match(fieldSource, /const FIELD_SIDE_MODE/);
  assert.match(fieldSource, /function stretch\(role\)/);
  assert.match(fieldSource, /function hold\(role\)/);
  assert.match(fieldSource, /function toggleBoth\(\)/);
  assert.match(fieldSource, /function freezeSideForPause\(side, center, snapshot\)/);
  assert.match(fieldSource, /function translateToCurrent\(current, \{ preserve = true \} = \{\}\)/);
  assert.match(fieldSource, /const retained = side\.offset > REACH_TOLERANCE \? side\.offset : side\.targetOffset/,
    "Semantic traversal must translate the stored Field relation instead of remeasuring asynchronous iframe clocks.");
  assert.match(fieldSource, /Context and semantic gestures are Center-only/);
  assert.match(fieldSource, /function beginStretch\(side, center, snapshot,[\s\S]*requestRate\(side, 1, true\)[\s\S]*side\.adapter\?\.play\?\.\(\)/,
    "Every play must refold and prime a side at 1× before directional-rate discovery.");
  assert.match(fieldSource, /mode:\s*"step"/);
  assert.doesNotMatch(fieldSource, /mode:\s*"go"/);
  assert.match(fieldSource, /accessible:\s*false/);
  assert.doesNotMatch(fieldSource, /\.raw\?\.\(|\.raw\(\)/,
    "Field code must request an inaccessible side player without reaching through its adapter.");
  assert.match(fieldSource, /function parkSide\(side, address, \{ force = false \} = \{\}\)/);
  assert.match(fieldSource, /if \(!side\.sourceReady\)[\s\S]*side\.adapter\?\.cue\?\.\(side\.videoId, target\)[\s\S]*return true;[\s\S]*side\.adapter\?\.place\?\.\(target\)[\s\S]*side\.adapter\?\.pause\?\.\(\)/,
    "A source may be cued only while preparing; source-ready paused sides must seek and pause on their represented frame.");
  assert.match(fieldSource, /function beginStretch\(side, center, snapshot,[\s\S]*if \(play && side\.sourceReady\)[\s\S]*side\.adapter\?\.play\?\.\(\)/,
    "Trusted side playback must start only after that side source has reached CUED readiness.");
  assert.match(fieldSource, /render\(snapshot\);[\s\S]*ensurePlayers\(prefs\);/,
    "Side panes must be rendered and measurable before player creation.");
  assert.match(youtubeSource, /DEFAULT_IFRAME_ALLOW[\s\S]*"autoplay"/);
  assert.match(youtubeSource, /setAttribute\?\.\("allow", options\.iframeAllow \|\| DEFAULT_IFRAME_ALLOW\)/);
  assert.match(youtubeSource, /setAttribute\?\.\("tabindex", "-1"\)/);
  assert.match(youtubeSource, /options\.accessible === false[\s\S]*setAttribute\?\.\("aria-hidden", "true"\)/);
  assert.doesNotMatch(html, /class="step-pane-action"/,
    "YouTube side iframes must not be covered by a transparent action element.");
  assert.match(html, /id="tail-player-surface"[\s\S]*role="button"[\s\S]*id="player-tail"/);
  assert.match(html, /id="lead-player-surface"[\s\S]*role="button"[\s\S]*id="player-lead"/);
  assert.match(html, /id="player-tail"[\s\S]*id="tail-step-button"[\s\S]*id="tail-field-toggle"[\s\S]*id="step-backward-seconds"[\s\S]*id="tail-rate-select"/,
    "Tail controls must mirror Lead from the outside edge toward Center.");
  assert.match(html, /id="player-lead"[\s\S]*id="lead-rate-select"[\s\S]*id="step-forward-seconds"[\s\S]*id="lead-field-toggle"[\s\S]*id="lead-step-button"/,
    "Lead controls must mirror Tail from Center toward the outside edge.");
  assert.match(css, /\.side-player-surface iframe[\s\S]*pointer-events:\s*none/,
    "Side video surfaces must route clicks to semantic Step instead of independently toggling muted iframes.");
  assert.match(html, /id="center-transport-surface"/,
    "Paused Center must expose a parent-owned playback surface for shared iframe activation.");
  assert.match(layoutCss, /\.center-transport-surface[\s\S]*position:\s*absolute/);
  assert.match(css, /grid-template-areas:\s*"tail center lead"[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.1fr\) minmax\(0, 1fr\)/,
    "Wide panes must occupy explicit Tail | Center | Lead areas without fixed minima that clip the containing panel.");
  assert.match(css, /\.step-pane\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    "Every pane must force its implicit content track to shrink instead of clipping the Lead controls.");
  assert.match(layoutCss, /\.player-panel\s*\{[\s\S]*container-type:\s*inline-size/,
    "Step Field responsive geometry must measure its containing panel.");
  assert.match(css, /\.step-field\.field-off[\s\S]*grid-template-areas:\s*"center"[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    "Field-off projection must remain Center-only even when collapsed preferences persist.");
  assert.match(css, /\.step-field\.tail-collapsed:not\(\.lead-collapsed\):not\(\.field-off\)[\s\S]*grid-template-columns:\s*48px minmax\(0, 1fr\)/,
    "A collapsed Tail must release medium-layout width to Lead.");
  assert.match(css, /\.step-field\.lead-collapsed:not\(\.tail-collapsed\):not\(\.field-off\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 48px/,
    "A collapsed Lead must release medium-layout width to Tail.");
  assert.match(css, /@container \(max-width: 1440px\)[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    "Three-pane controls must fold before their four-column minimum can clip a side pane.");
  assert.match(
    css,
    /@container \(max-width: 680px\)[\s\S]*\.step-field\.tail-collapsed\.lead-collapsed:not\(\.field-off\)[\s\S]*grid-template-areas:\s*"center"\s*"tail"\s*"lead"/,
    "Phone stacking must override the more-specific collapsed medium layout."
  );
  assert.match(fieldSource, /const visibleRoles = \["tail", "lead"\]\.filter[\s\S]*visibleRoles\.every/,
    "Combined Field state must derive from visible projections only.");
  assert.match(fieldSource, /runtime\.restoreRoles/,
    "Restoring one collapsed projection must not force a sibling re-establishment.");
  assert.match(fieldSource, /side\.ready = Boolean\(side\.adapter\)/);
  assert.match(fieldSource, /resetSources/);
  assert.match(app, /stepField\?\.resetSources\?\.\(\)/,
    "Reloading a video must release stale side-source errors, including same-video reloads.");
  assert.match(css, /\.step-pane \.player-wrap[\s\S]*min-height:\s*200px/);
  assert.match(css, /@container \(max-width: 680px\)/);
  assert.match(css, /@media \(min-width: 1240px\)/);
  assert.match(layoutCss, /@media \(min-width: 1240px\)/);
  assert.match(packageJson.scripts.check, /step-field\.js/);
  assert.match(packageJson.scripts.test, /step-field-tests\.mjs/);
}

console.log("All Step Field tests passed: geometry, suspension, Hold/Stretch, side Step, visible bootstrap, shared user activation, autoplay delegation, cue-based parking, rate priming, and panoramic layout.");
