import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STEP_FIELD_PHASE,
  FIELD_SIDE_MODE,
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
  const bounds = deriveFieldBounds({ current: 50, stepReach: { backward: 10, forward: 10, linked: true }, range });
  assert.deepEqual(bounds.envelope, { start: 40, end: 60 });
  assert.ok(bounds.envelope.start < resolution.L, "Field may extend behind Resolution.");
  assert.ok(bounds.envelope.end > resolution.R, "Field may extend ahead of Resolution.");
  assertContained(bounds, range);
}

for (const current of [0, 1, 4, 25, 50, 96, 99, 100]) {
  const range = { start: 0, end: 100 };
  assertContained(deriveFieldBounds({ current, stepReach: { backward: 10, forward: 10, linked: true }, range }), range);
}

{
  const bounds = deriveFieldBounds({ current: 4, stepReach: { backward: 10, forward: 10, linked: true }, range: { start: 0, end: 100 } });
  assert.deepEqual(bounds.tail, { target: 0, reach: 4, constrained: true });
  assert.equal(bounds.constraint, "start");
}
{
  const bounds = deriveFieldBounds({ current: 96, stepReach: { backward: 10, forward: 10, linked: true }, range: { start: 0, end: 100 } });
  assert.deepEqual(bounds.lead, { target: 100, reach: 4, constrained: true });
  assert.equal(bounds.constraint, "end");
}
{
  const bounds = deriveFieldBounds({ current: 4, stepReach: { backward: 10, forward: 10, linked: true }, range: { start: 0, end: 12 } });
  assert.deepEqual(bounds.envelope, { start: 0, end: 12 });
  assert.equal(bounds.constraint, "both");
}

assert.equal(fieldShouldSuspend({ transportKind: "playback" }), false);
assert.equal(fieldShouldSuspend({ transportKind: "loop" }), false, "Loop is genuine playback and may drive the Field.");
assert.equal(fieldShouldSuspend({ transport: { kind: "context" } }), true, "Context is Center-only.");
assert.equal(fieldShouldSuspend({ pendingStep: true }), true);
assert.equal(fieldShouldSuspend({ rangeDragging: true }), true);

function fakeElement() {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    dataset: {},
    classList: { toggle() {} },
    children: [],
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    click() { for (const listener of listeners.get("click") || []) listener({ target: this, stopPropagation() {} }); },
    setAttribute(name, value) { this[name] = String(value); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    appendChild(node) { this.children.push(node); return node; }
  };
}

function makeControllerHarness() {
  const elements = new Map();
  const document = {
    hidden: false,
    createElement() { return fakeElement(); },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fakeElement());
      return elements.get(id);
    }
  };
  const adapters = new Map();
  const changes = [];
  const holds = [];
  const selections = [];
  let snapshot = {
    videoLoaded: true,
    videoId: "bounds-test",
    current: 50,
    range: { start: 0, end: 100 },
    stepReach: { backward: 10, forward: 10, linked: true },
    transportKind: "idle",
    pendingStep: false,
    dragging: false,
    center: { time: 50, rate: 1, state: YOUTUBE_STATE.PAUSED, availableRates: [0.5, 1, 2] }
  };

  function createPlayer(id, config) {
    let time = 0;
    let rate = 1;
    let state = YOUTUBE_STATE.PAUSED;
    const commands = [];
    const adapter = {
      commands,
      mute() { commands.push(["mute"]); },
      cue(_videoId, address) { commands.push(["cue", address]); time = address; },
      place(address) { commands.push(["place", address]); time = address; },
      play() { commands.push(["play"]); state = YOUTUBE_STATE.PLAYING; config.events.onStateChange?.(state); },
      pause() { commands.push(["pause"]); state = YOUTUBE_STATE.PAUSED; },
      setRate(value) { commands.push(["rate", value]); rate = value; config.events.onPlaybackRateChange?.(value); },
      read() { return { time, rate, state, availableRates: [0.5, 1, 2] }; },
      raw() { return { getIframe: () => ({ setAttribute() {} }) }; }
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
    onHoldOffsets: offsets => holds.push(offsets),
    onSelect: selection => selections.push(selection),
    createPlayer,
    formatTime: String
  });

  return {
    controller, adapters, elements, changes, holds, selections,
    get snapshot() { return snapshot; },
    set snapshot(value) { snapshot = value; },
    restore() { globalThis.YT = previousYT; }
  };
}

{
  const harness = makeControllerHarness();
  try {
    harness.controller.tick();
    assert.equal(harness.adapters.get("player-tail").read().time, 40, "Paused Tail must display its represented backward Step frame.");
    assert.equal(harness.adapters.get("player-lead").read().time, 60, "Paused Lead must display its represented forward Step frame.");
    assert.equal(harness.controller.snapshot().phase, STEP_FIELD_PHASE.HELD);

    harness.controller.stretch("tail");
    assert.equal(harness.controller.snapshot().tailMode, FIELD_SIDE_MODE.STRETCHING);
    assert.equal(harness.adapters.get("player-tail").read().time, 50, "Stretch snaps Tail to Current.");

    harness.snapshot = {
      ...harness.snapshot,
      transportKind: "playback",
      center: { ...harness.snapshot.center, time: 50, state: YOUTUBE_STATE.PLAYING }
    };
    harness.controller.tick();
    const tailCommands = harness.adapters.get("player-tail").commands;
    assert.ok(tailCommands.some(command => command[0] === "play"), "Native Center playback starts the muted Tail.");
    assert.ok(tailCommands.some(command => command[0] === "rate" && command[1] === 0.5), "Tail requests a supported slow rate after priming.");

    harness.adapters.get("player-tail").place(47);
    harness.controller.hold("tail");
    assert.equal(harness.controller.snapshot().tailMode, FIELD_SIDE_MODE.HELD);
    assert.equal(harness.holds.at(-1).backward, 3, "Hold freezes measured offset as the new Step distance.");

    harness.elements.get("tail-step-button").click();
    assert.equal(harness.selections.at(-1).direction, "backward");
    assert.equal(harness.selections.at(-1).distance, 3, "Side button Step uses the visible differential.");

    harness.snapshot = { ...harness.snapshot, transportKind: "context" };
    harness.controller.tick();
    assert.equal(harness.controller.snapshot().phase, STEP_FIELD_PHASE.SUSPENDED);
    assert.equal(harness.adapters.get("player-tail").read().state, YOUTUBE_STATE.PAUSED);
    assert.equal(harness.adapters.get("player-lead").read().state, YOUTUBE_STATE.PAUSED);

    harness.snapshot = {
      ...harness.snapshot,
      transportKind: "idle",
      current: 75,
      range: { start: 70, end: 80 },
      center: { ...harness.snapshot.center, time: 75, state: YOUTUBE_STATE.PAUSED }
    };
    harness.controller.invalidate();
    assert.equal(harness.changes.at(-1), null);
    harness.controller.tick();
    const field = harness.controller.snapshot();
    assert.equal(field.constraint, "both");
    assert.deepEqual(field.envelope, { start: 70, end: 80 });
    assert.equal(harness.adapters.get("player-tail").read().time, 70, "Range-constrained Tail parks at the available boundary frame.");
    assert.equal(harness.adapters.get("player-lead").read().time, 80, "Range-constrained Lead parks at the available boundary frame.");
  } finally {
    harness.restore();
  }
}

{
  const captured = Object.freeze({ start: 40, end: 60 });
  const loop = createLoopTransport({ anchor: 50, ...captured, source: "interval" });
  assert.deepEqual({ start: loop.start, end: loop.end }, captured);
  assert.equal(loop.cycles, 0);
}

{
  const app = readFileSync("app.js", "utf8");
  const fieldSource = readFileSync("step-field.js", "utf8");
  assert.match(app, /function setRange\([\s\S]*?settleBeforeAction\(\);[\s\S]*?setSessionRange/);
  assert.match(app, /function focusSection\([\s\S]*?settleBeforeAction\(\);[\s\S]*?focusSessionSection/);
  assert.match(app, /function leaveSection\([\s\S]*?settleBeforeAction\(\);[\s\S]*?leaveSessionSection/);
  assert.match(fieldSource, /export function fieldShouldSuspend\(snapshot\)/);
  assert.match(fieldSource, /transportKind === "context"/);
  assert.doesNotMatch(fieldSource, /transportKind === "loop"/);
  assert.match(fieldSource, /invalidate,/);
  assert.doesNotMatch(fieldSource, /snapshot\.resolution/, "Field bounds must not depend on Resolution.");
}

console.log("Field bounds v5.8 tests passed: Range containment, Context suspension, native playback, Hold, and side Step.");
