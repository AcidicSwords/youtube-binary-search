import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PANORAMA_STATE,
  FIELD_SIDE_MODE,
  createPanoramaController,
  derivePanoramaBounds,
  panoramaShouldSuspend
} from "./panorama.js";
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
  const bounds = derivePanoramaBounds({ current: 50, stepDistance: { backward: 10, forward: 10, linked: true }, range });
  assert.deepEqual(bounds.envelope, { start: 40, end: 60 });
  assert.ok(bounds.envelope.start < resolution.L, "Panorama may extend behind Current Neighborhood.");
  assert.ok(bounds.envelope.end > resolution.R, "Panorama may extend ahead of Current Neighborhood.");
  assertContained(bounds, range);
}

for (const current of [0, 1, 4, 25, 50, 96, 99, 100]) {
  const range = { start: 0, end: 100 };
  assertContained(derivePanoramaBounds({ current, stepDistance: { backward: 10, forward: 10, linked: true }, range }), range);
}

{
  const bounds = derivePanoramaBounds({ current: 4, stepDistance: { backward: 10, forward: 10, linked: true }, range: { start: 0, end: 100 } });
  assert.deepEqual(bounds.tail, { target: 0, reach: 4, constrained: true });
  assert.equal(bounds.constraint, "start");
}
{
  const bounds = derivePanoramaBounds({ current: 96, stepDistance: { backward: 10, forward: 10, linked: true }, range: { start: 0, end: 100 } });
  assert.deepEqual(bounds.lead, { target: 100, reach: 4, constrained: true });
  assert.equal(bounds.constraint, "end");
}
{
  const bounds = derivePanoramaBounds({ current: 4, stepDistance: { backward: 10, forward: 10, linked: true }, range: { start: 0, end: 12 } });
  assert.deepEqual(bounds.envelope, { start: 0, end: 12 });
  assert.equal(bounds.constraint, "both");
}

assert.equal(panoramaShouldSuspend({ transportKind: "playback" }), false);
assert.equal(panoramaShouldSuspend({ transport: { kind: "context" } }), true, "Context is Center-only.");
assert.equal(panoramaShouldSuspend({ pendingStep: true }), true);
assert.equal(panoramaShouldSuspend({ rangeDragging: true }), true);

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
  let snapshot = {
    videoLoaded: true,
    videoId: "bounds-test",
    current: 50,
    range: { start: 0, end: 100 },
    stepDistance: { backward: 10, forward: 10, linked: true },
    panoramaCycle: { inner: 2, outer: 10, rate: 0.5 },
    transportKind: "idle",
    pendingStep: false,
    dragging: false,
    center: { time: 50, rate: 1, state: YOUTUBE_STATE.PAUSED, availableRates: [0.5, 1, 1.5, 2] }
  };

  function createPlayer(id, config) {
    let time = 0;
    let rate = 1;
    let state = YOUTUBE_STATE.PAUSED;
    const commands = [];
    const adapter = {
      commands,
      mute() { commands.push(["mute"]); },
      chapter(_videoId, address) {
        commands.push(["chapter", address]);
        time = address;
        state = YOUTUBE_STATE.CUED;
        config.events.onStateChange?.(state);
      },
      place(address) { commands.push(["place", address]); time = address; },
      play() { commands.push(["play"]); state = YOUTUBE_STATE.PLAYING; config.events.onStateChange?.(state); },
      pause() { commands.push(["pause"]); state = YOUTUBE_STATE.PAUSED; },
      setRate(value) { commands.push(["rate", value]); rate = value; config.events.onPlaybackRateChange?.(value); },
      read() { return { time, rate, state, availableRates: [0.5, 1, 1.5, 2] }; },
      raw() { return { getIframe: () => ({ setAttribute() {} }) }; }
    };
    adapters.set(id, adapter);
    config.events.onReady(adapter);
    return adapter;
  }

  const previousYT = globalThis.YT;
  globalThis.YT = { Player: function Player() {} };
  const controller = createPanoramaController({
    document,
    getSnapshot: () => snapshot,
    onChange: field => changes.push(field),
    createPlayer,
    formatTime: String
  });

  return {
    controller, adapters, elements, changes,
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
    assert.equal(harness.controller.snapshot().phase, PANORAMA_STATE.HELD);

    harness.controller.stretch("both");
    assert.equal(harness.controller.snapshot().tailMode, FIELD_SIDE_MODE.STRETCHING);
    assert.equal(harness.adapters.get("player-tail").read().time, 40,
      "Stretch resumes the cycle from its attained relation, never crossing Center.");

    harness.snapshot = {
      ...harness.snapshot,
      transportKind: "playback",
      center: { ...harness.snapshot.center, time: 50, state: YOUTUBE_STATE.PLAYING }
    };
    harness.controller.tick();
    const tailCommands = harness.adapters.get("player-tail").commands;
    assert.ok(tailCommands.some(command => command[0] === "play"), "Native Center playback starts the muted Tail.");
    // Stretch resumed at the attained outer bound, so both sides arrive at the
    // outer synchronization barrier at once and the Panorama contracts.
    assert.equal(harness.controller.cycle().phase, "contracting");
    assert.ok(
      tailCommands.some(command => command[0] === "rate" && command[1] > 1),
      "Contraction gives Tail the faster rate so it catches Center while remaining behind it."
    );
    assert.ok(
      harness.adapters.get("player-tail").read().time < 50,
      "Tail remains behind Center throughout the cycle."
    );

    harness.adapters.get("player-tail").place(47);
    harness.controller.hold("both");
    assert.equal(harness.controller.snapshot().tailMode, FIELD_SIDE_MODE.HELD);

    const tailStep = harness.controller.getStepSelection("tail");
    assert.equal(tailStep.direction, "backward");
    assert.equal(tailStep.distance, 3, "Side button Step uses the visible differential.");

    harness.snapshot = { ...harness.snapshot, transportKind: "context" };
    harness.controller.tick();
    assert.equal(harness.controller.snapshot().phase, PANORAMA_STATE.SUSPENDED);
    assert.equal(harness.adapters.get("player-tail").read().state, YOUTUBE_STATE.PAUSED);
    assert.equal(harness.adapters.get("player-lead").read().state, YOUTUBE_STATE.PAUSED);
    const suspendedModes = {
      tail: harness.controller.snapshot().tailMode,
      lead: harness.controller.snapshot().leadMode
    };
    harness.elements.get("panorama-both-toggle").click();
    assert.deepEqual(
      {
        tail: harness.controller.snapshot().tailMode,
        lead: harness.controller.snapshot().leadMode
      },
      suspendedModes,
      "Hold/Stretch controls must not reinterpret a transient Context cursor."
    );
    assert.equal(harness.elements.get("panorama-both-toggle").disabled, true);

    harness.snapshot = {
      ...harness.snapshot,
      transportKind: "idle",
      current: 75,
      range: { start: 70, end: 80 },
      center: { ...harness.snapshot.center, time: 75, state: YOUTUBE_STATE.PAUSED }
    };
    const changesBeforeReset = harness.changes.length;
    harness.controller.resetAtCurrent();
    assert.ok(
      harness.changes.slice(changesBeforeReset).includes(null),
      "A structural reset must invalidate the prior projected Panorama before re-establishing it."
    );
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
  const app = readFileSync("app.js", "utf8");
  const panoramaSource = readFileSync("panorama.js", "utf8");
  assert.match(app, /function setRange\([\s\S]*?settleBeforeAction\(\);[\s\S]*?setSessionRange/);
  assert.match(app, /function focusSection\([\s\S]*?settleBeforeAction\(\);[\s\S]*?focusSessionSection/);
  assert.match(app, /function leaveSection\([\s\S]*?settleBeforeAction\(\);[\s\S]*?leaveSessionSection/);
  assert.match(panoramaSource, /export function panoramaShouldSuspend\(snapshot\)/);
  assert.match(panoramaSource, /transportKind === "context"/);
  assert.doesNotMatch(panoramaSource, /transportKind === "loop"/);
  assert.match(panoramaSource, /function resetAtCurrent\(\)[\s\S]*invalidate\(\{ pause: false \}\)/);
  assert.match(app, /resetPanorama[\s\S]*panorama\?\.resetAtCurrent/);
  assert.doesNotMatch(panoramaSource, /snapshot\.neighborhood/, "Panorama bounds must not depend on Current Neighborhood.");
}

console.log("Panorama bounds tests passed: Range containment, Context suspension, native playback, Hold, and side Step.");
