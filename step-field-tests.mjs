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
assert.equal(fieldShouldSuspend({ transportKind: "loop" }), false);
assert.equal(fieldShouldSuspend({ pendingStep: true, transportKind: "idle" }), true);
assert.equal(fieldShouldSuspend({ dragging: true, transportKind: "idle" }), true);
assert.equal(fieldPreferenceRequiresEstablish({ tailVisible: false }), true);
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
    "tail-step-button", "lead-step-button",
    "tail-field-toggle", "lead-field-toggle", "field-both-toggle",
    "tail-rate-select", "lead-rate-select",
    "step-backward-seconds", "step-forward-seconds",
    "tail-collapse", "lead-collapse", "tail-restore", "lead-restore", "step-field-toggle"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing Step Field DOM id: ${id}`);
  }

  assert.match(app, /createStepFieldController/);
  assert.match(app, /onSelect:\s*selectFieldSide/);
  assert.match(app, /function selectFieldSide\(selection\)/);
  assert.match(app, /performStep\(selection\.direction, selection\.distance\)/);
  assert.match(app, /function startFieldPlaybackFromGesture\(\)/);
  assert.match(app, /stepField\?\.playFromGesture\?\.\(\);[\s\S]*player\.play\(\);/,
    "Parent-owned playback must request both side players and Center in one synchronous gesture stack.");
  assert.match(app, /center-transport-surface/);
  assert.match(fieldSource, /function playFromGesture\(\)/);
  assert.match(app, /onHoldOffsets:/);
  assert.match(fieldSource, /const FIELD_SIDE_MODE/);
  assert.match(fieldSource, /function stretch\(role\)/);
  assert.match(fieldSource, /function hold\(role\)/);
  assert.match(fieldSource, /function toggleBoth\(\)/);
  assert.match(fieldSource, /side\.adapter\?\.setRate\?\.\(1\);[\s\S]*ensureSidePlaying\(side\)/,
    "A side must prime at 1× before directional-rate discovery.");
  assert.match(fieldSource, /mode:\s*"step"/);
  assert.doesNotMatch(fieldSource, /mode:\s*"go"/);
  assert.match(fieldSource, /setAttribute\?\.\("tabindex", "-1"\)/);
  assert.match(fieldSource, /setAttribute\?\.\("aria-hidden", "true"\)/);
  assert.match(fieldSource, /function parkSide\(side, address\)/);
  assert.match(fieldSource, /side\.adapter\.cue\?\.\(side\.videoId, address\)/,
    "Paused side placement must use cueVideoById rather than seekTo.");
  assert.match(fieldSource, /render\(snapshot\);[\s\S]*ensurePlayers\(prefs\);/,
    "Side panes must be rendered and measurable before player creation.");
  assert.match(youtubeSource, /DEFAULT_IFRAME_ALLOW[\s\S]*"autoplay"/);
  assert.match(youtubeSource, /setAttribute\?\.\("allow", options\.iframeAllow \|\| DEFAULT_IFRAME_ALLOW\)/);
  assert.doesNotMatch(html, /class="step-pane-action"/,
    "YouTube side iframes must remain unobscured; Step uses the dedicated button below each player.");
  assert.match(html, /id="center-transport-surface"/,
    "Paused Center must expose a parent-owned playback surface for shared iframe activation.");
  assert.match(layoutCss, /\.center-transport-surface[\s\S]*position:\s*absolute/);
  assert.match(css, /grid-template-columns:\s*minmax\(240px, 1fr\) minmax\(264px, 1\.1fr\) minmax\(240px, 1fr\)/);
  assert.match(css, /\.step-pane \.player-wrap[\s\S]*min-height:\s*200px/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(css, /@media \(min-width: 1221px\)/);
  assert.match(layoutCss, /@media \(min-width: 1221px\)/);
  assert.match(packageJson.scripts.check, /step-field\.js/);
  assert.match(packageJson.scripts.test, /step-field-tests\.mjs/);
}

console.log("All Step Field tests passed: geometry, suspension, Hold/Stretch, side Step, visible bootstrap, shared user activation, autoplay delegation, cue-based parking, rate priming, and panoramic layout.");
