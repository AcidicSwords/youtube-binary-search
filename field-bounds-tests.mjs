import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STEP_FIELD_PHASE,
  createStepFieldController,
  deriveFieldBounds,
  fieldShouldSuspend
} from "./step-field.js";
import { createLoopTransport } from "./transport.js";
import { YOUTUBE_STATE } from "./youtube.js";

function assertContained(bounds, range) {
  assert.ok(range.start <= bounds.tail.target);
  assert.ok(bounds.tail.target <= bounds.current);
  assert.ok(bounds.current <= bounds.lead.target);
  assert.ok(bounds.lead.target <= range.end);
}

{
  const range = { start: 0, end: 100 };
  const resolution = { L: 48, C: 50, R: 52 };
  const bounds = deriveFieldBounds({ current: 50, stepSeconds: 10, range });
  assert.deepEqual(bounds.envelope, { start: 40, end: 60 });
  assert.ok(bounds.envelope.start < resolution.L, "Field may extend behind Resolution.");
  assert.ok(bounds.envelope.end > resolution.R, "Field may extend ahead of Resolution.");
  assertContained(bounds, range);
}

for (const current of [0, 1, 4, 25, 50, 96, 99, 100]) {
  const range = { start: 0, end: 100 };
  assertContained(deriveFieldBounds({ current, stepSeconds: 10, range }), range);
}

{
  const bounds = deriveFieldBounds({ current: 4, stepSeconds: 10, range: { start: 0, end: 100 } });
  assert.equal(bounds.tail.target, 0);
  assert.equal(bounds.tail.reach, 4);
  assert.equal(bounds.tail.constrained, true);
  assert.equal(bounds.lead.constrained, false);
  assert.equal(bounds.constraint, "start");
}

{
  const bounds = deriveFieldBounds({ current: 96, stepSeconds: 10, range: { start: 0, end: 100 } });
  assert.equal(bounds.lead.target, 100);
  assert.equal(bounds.lead.reach, 4);
  assert.equal(bounds.lead.constrained, true);
  assert.equal(bounds.tail.constrained, false);
  assert.equal(bounds.constraint, "end");
}

{
  const bounds = deriveFieldBounds({ current: 4, stepSeconds: 10, range: { start: 0, end: 12 } });
  assert.equal(bounds.tail.target, 0);
  assert.equal(bounds.lead.target, 12);
  assert.equal(bounds.constraint, "both");
}

assert.equal(fieldShouldSuspend({ transportKind: "continue" }), false);
assert.equal(fieldShouldSuspend({ transportKind: "loop" }), true);
assert.equal(fieldShouldSuspend({ transport: { kind: "context" } }), true);
assert.equal(fieldShouldSuspend({ transport: { kind: "skim" } }), true);
assert.equal(fieldShouldSuspend({ pendingStep: true }), true);
assert.equal(fieldShouldSuspend({ rangeDragging: true }), true);

function fakeElement() {
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    dataset: {},
    classList: { toggle() {} },
    addEventListener() {},
    setAttribute() {}
  };
}

function makeControllerHarness() {
  const elements = new Map();
  const document = {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fakeElement());
      return elements.get(id);
    }
  };
  const adapters = new Map();
  const changes = [];
  let snapshot = {
    videoLoaded: true,
    videoId: "bounds-test",
    current: 50,
    range: { start: 0, end: 100 },
    stepSeconds: 10,
    transportKind: "idle",
    pendingStep: false,
    dragging: false,
    center: {
      time: 50,
      rate: 1,
      state: YOUTUBE_STATE.PAUSED,
      availableRates: [0.5, 1, 2]
    }
  };

  function createPlayer(id, config) {
    let time = 0;
    let rate = 1;
    let state = YOUTUBE_STATE.PAUSED;
    const adapter = {
      mute() {},
      cue(_videoId, address) { time = address; },
      place(address) { time = address; },
      play() { state = YOUTUBE_STATE.PLAYING; },
      pause() { state = YOUTUBE_STATE.PAUSED; },
      setRate(value) { rate = value; },
      read() {
        return {
          time,
          rate,
          state,
          availableRates: [0.5, 1, 2]
        };
      },
      raw() {
        return { getIframe: () => ({ setAttribute() {} }) };
      }
    };
    adapters.set(id, adapter);
    config.events.onReady(adapter);
    return adapter;
  }

  const previousYT = globalThis.YT;
  globalThis.YT = { Player: function Player() {} };
  const controller = createStepFieldController({
    document,
    getSnapshot: () => snapshot,
    onChange: field => changes.push(field),
    createPlayer,
    formatTime: String
  });

  return {
    controller,
    adapters,
    changes,
    get snapshot() { return snapshot; },
    set snapshot(value) { snapshot = value; },
    restore() { globalThis.YT = previousYT; }
  };
}

{
  const harness = makeControllerHarness();
  try {
    harness.controller.tick();
    assert.equal(harness.adapters.get("player-tail").read().time, 50);
    assert.equal(harness.adapters.get("player-lead").read().time, 50);
    assert.equal(harness.controller.snapshot().phase, STEP_FIELD_PHASE.COINCIDENT);

    harness.adapters.get("player-tail").place(40);
    harness.adapters.get("player-lead").place(60);
    harness.snapshot = {
      ...harness.snapshot,
      current: 75,
      center: { ...harness.snapshot.center, time: 75 }
    };
    harness.controller.tick();
    assert.equal(harness.adapters.get("player-tail").read().time, 75, "Refine-like Current change must reset Tail.");
    assert.equal(harness.adapters.get("player-lead").read().time, 75, "Refine-like Current change must reset Lead.");
    assert.equal(harness.controller.snapshot().phase, STEP_FIELD_PHASE.COINCIDENT);

    harness.snapshot = { ...harness.snapshot, transportKind: "loop" };
    harness.controller.tick();
    assert.equal(harness.controller.snapshot().phase, STEP_FIELD_PHASE.SUSPENDED);
    assert.equal(harness.adapters.get("player-tail").read().state, YOUTUBE_STATE.PAUSED);
    assert.equal(harness.adapters.get("player-lead").read().state, YOUTUBE_STATE.PAUSED);

    harness.snapshot = {
      ...harness.snapshot,
      transportKind: "idle",
      current: 75,
      range: { start: 70, end: 80 },
      center: { ...harness.snapshot.center, time: 75 }
    };
    harness.controller.invalidate();
    assert.equal(harness.changes.at(-1), null);
    harness.controller.tick();
    const field = harness.controller.snapshot();
    assert.equal(field.phase, STEP_FIELD_PHASE.COINCIDENT);
    assert.equal(field.constraint, "both");
    assert.deepEqual(field.envelope, { start: 70, end: 80 });
    assert.equal(harness.adapters.get("player-tail").read().time, 75);
    assert.equal(harness.adapters.get("player-lead").read().time, 75);
  } finally {
    harness.restore();
  }
}

{
  const captured = Object.freeze({ start: 40, end: 60 });
  const loop = createLoopTransport({ anchor: 50, ...captured, source: "field-span" });
  const laterField = { start: 45, end: 65 };
  assert.deepEqual({ start: loop.start, end: loop.end }, { start: 40, end: 60 });
  assert.notDeepEqual({ start: loop.start, end: loop.end }, laterField);
}

{
  const app = readFileSync("app.js", "utf8");
  const fieldSource = readFileSync("step-field.js", "utf8");
  assert.match(app, /function heldFieldSpan\(\)[\s\S]*\{ start: span\.start, end: span\.end \}/);
  assert.match(app, /function startFieldSpanLoop\(\)[\s\S]*startLoopExtent\(heldFieldSpan\(\), "field-span", "Field Span"\)/);
  assert.match(app, /function setRange\([\s\S]*?settleBeforeAction\(\);[\s\S]*?setSessionRange/);
  assert.match(app, /function focusSection\([\s\S]*?settleBeforeAction\(\);[\s\S]*?focusSessionSection/);
  assert.match(app, /function leaveSection\([\s\S]*?settleBeforeAction\(\);[\s\S]*?leaveSessionSection/);
  assert.match(fieldSource, /export function fieldShouldSuspend\(snapshot\)/);
  assert.match(fieldSource, /\["context", "skim", "loop"\]\.includes\(transportKind\)/);
  assert.match(fieldSource, /invalidate,/);
  assert.doesNotMatch(fieldSource, /resolution/i, "Field bounds must not depend on Resolution.");
}

console.log("Field bounds v5.4.1 tests passed.");
