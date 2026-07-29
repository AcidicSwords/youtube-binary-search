import assert from "node:assert/strict";
import { createStepFieldController, FIELD_SIDE_MODE } from "./step-field.js";
import { YOUTUBE_STATE } from "./youtube.js";

function element(tagName = "DIV") {
  const listeners = new Map();
  return {
    tagName,
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    dataset: {},
    children: [],
    classList: { toggle() {} },
    addEventListener(type, listener) { listeners.set(type, listener); },
    click() { listeners.get("click")?.({ stopPropagation() {} }); },
    dispatch(type) { listeners.get(type)?.({ target: this }); },
    setAttribute() {},
    replaceChildren(...children) { this.children = children; },
    appendChild(child) { this.children.push(child); return child; }
  };
}

function makeHarness({
  rates = [0.5, 1, 2],
  deferredCue = false,
  delayedPlay = false,
  ratesAfterPlay = null
} = {}) {
  const elements = new Map();
  const document = {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement(tag) { return element(tag.toUpperCase()); }
  };
  let preferences = {
    stepFieldEnabled: true,
    tailVisible: true,
    leadVisible: true,
    tailRate: 0.5,
    leadRate: 2
  };
  let snapshot = {
    videoLoaded: true,
    videoId: "field-state-test",
    current: 50,
    range: { start: 0, end: 100 },
    stepReach: { backward: 10, forward: 10, linked: true },
    pendingStep: false,
    dragging: false,
    rangeDragging: false,
    transportKind: "idle",
    center: { time: 50, rate: 1, state: YOUTUBE_STATE.PAUSED, availableRates: rates }
  };
  const adapters = new Map();
  const holds = [];

  function createPlayer(id, config) {
    let time = 0;
    let rate = 1;
    let state = YOUTUBE_STATE.PAUSED;
    let availableRates = [...rates];
    const commands = [];
    const adapter = {
      commands,
      mute() { commands.push(["mute"]); },
      cue(_videoId, address) {
        commands.push(["cue", address]);
        time = address;
        if (!deferredCue) {
          state = YOUTUBE_STATE.CUED;
          config.events.onStateChange?.(state);
        }
      },
      place(address) { commands.push(["place", address]); time = address; },
      play() {
        commands.push(["play"]);
        if (!delayedPlay) {
          if (Array.isArray(ratesAfterPlay)) availableRates = [...ratesAfterPlay];
          state = YOUTUBE_STATE.PLAYING;
          config.events.onStateChange?.(state);
        }
      },
      pause() { commands.push(["pause"]); state = YOUTUBE_STATE.PAUSED; },
      setRate(value) {
        commands.push(["rate", value]);
        if (availableRates.includes(value)) {
          rate = value;
          config.events.onPlaybackRateChange?.(value);
        }
      },
      read() { return { time, rate, state, availableRates: [...availableRates] }; },
      raw() { return { getIframe: () => ({ setAttribute() {} }) }; },
      setTime(value) { time = value; },
      setState(value) { state = value; config.events.onStateChange?.(value); },
      setRates(value) { availableRates = [...value]; },
      finishCue() { state = YOUTUBE_STATE.CUED; config.events.onStateChange?.(state); },
      finishPlay() {
        if (Array.isArray(ratesAfterPlay)) availableRates = [...ratesAfterPlay];
        state = YOUTUBE_STATE.PLAYING;
        config.events.onStateChange?.(state);
      },
      block() { config.events.onAutoplayBlocked?.(); },
      fail() { state = YOUTUBE_STATE.UNKNOWN; config.events.onError?.(2); },
      get time() { return time; },
      get rate() { return rate; },
      get state() { return state; }
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
    getPreferences: () => preferences,
    setPreferences: patch => { preferences = { ...preferences, ...patch }; },
    onHoldOffsets: patch => holds.push(patch),
    createPlayer,
    formatTime: value => String(value)
  });

  return {
    controller,
    elements,
    adapters,
    holds,
    get snapshot() { return snapshot; },
    set snapshot(value) { snapshot = value; },
    get preferences() { return preferences; },
    tail() { return adapters.get("player-tail"); },
    lead() { return adapters.get("player-lead"); },
    restore() { globalThis.YT = previousYT; }
  };
}

{
  const h = makeHarness();
  try {
    h.controller.tick();
    assert.equal(h.tail().time, 40, "Initial Tail must show the frame represented by backward Step.");
    assert.equal(h.lead().time, 60, "Initial Lead must show the frame represented by forward Step.");
    assert.ok(h.tail().commands.some(command => command[0] === "cue"));
    assert.ok(h.tail().commands.some(command => command[0] === "place"), "Pre-activation parking must decode the represented frame after cueing.");

    const leadCuesBeforeRecovery = h.lead().commands.filter(command => command[0] === "cue").length;
    h.lead().fail();
    assert.equal(h.controller.snapshot().leadRuntime.error, true);
    assert.equal(h.controller.snapshot().leadRuntime.ready, true, "A media error must not discard the reusable IFrame adapter.");
    h.elements.get("lead-collapse").click();
    h.elements.get("lead-restore").click();
    h.controller.tick();
    assert.equal(h.controller.snapshot().leadRuntime.error, false, "Restoring a failed pane must retry its source.");
    assert.ok(
      h.lead().commands.filter(command => command[0] === "cue").length > leadCuesBeforeRecovery,
      "Lead recovery must re-cue the current video instead of remaining permanently unavailable."
    );

    const semanticInterval = Object.freeze({ departure: 30, arrival: 50 });
    h.snapshot = { ...h.snapshot, interval: semanticInterval, transportKind: "context" };
    h.controller.tick();
    assert.equal(h.controller.snapshot().phase, "suspended");
    h.snapshot = { ...h.snapshot, transportKind: "idle" };
    const started = h.controller.playFromGesture({ center: 50 });
    assert.deepEqual(started, { tail: true, lead: true }, "A Context settled in the same gesture stack must not leave stale suspension behind.");
    assert.deepEqual(h.snapshot.interval, semanticInterval, "Physical Field activation must not mutate semantic Interval.");
    assert.ok(["cue", "place"].includes(h.tail().commands.at(-2)?.[0]));
    assert.equal(h.tail().commands.at(-2)?.[1], 50);
    assert.deepEqual(h.tail().commands.at(-1), ["play"]);
    assert.ok(["cue", "place"].includes(h.lead().commands.at(-2)?.[0]));
    assert.equal(h.lead().commands.at(-2)?.[1], 50);
    assert.deepEqual(h.lead().commands.at(-1), ["play"]);

    h.snapshot = {
      ...h.snapshot,
      transportKind: "playback",
      center: { ...h.snapshot.center, time: 52, state: YOUTUBE_STATE.PLAYING }
    };
    h.tail().setTime(51);
    h.lead().setTime(54);
    h.controller.tick();
    assert.equal(h.tail().rate, 0.5);
    assert.equal(h.lead().rate, 2);

    h.controller.hold("tail");
    assert.equal(h.controller.snapshot().tailMode, FIELD_SIDE_MODE.HELD);
    assert.equal(h.holds.at(-1).backward, 1);
    assert.deepEqual(h.snapshot.interval, semanticInterval, "Hold records Step geometry only; it must not redefine Interval.");

    h.snapshot = {
      ...h.snapshot,
      transportKind: "idle",
      center: { ...h.snapshot.center, time: 52, state: YOUTUBE_STATE.PAUSED }
    };
    h.controller.pause({ center: 52, freeze: true });
    assert.equal(h.tail().time, 51);
    assert.equal(h.lead().time, 54);
    assert.equal(h.tail().state, YOUTUBE_STATE.PAUSED);
    assert.equal(h.lead().state, YOUTUBE_STATE.PAUSED);

    h.controller.translateToCurrent(60, { preserve: true });
    assert.equal(h.tail().time, 59, "Whole-Field translation must preserve Tail's held 1 s offset.");
    assert.equal(h.lead().time, 62, "Whole-Field translation must preserve Lead's held 2 s offset.");
    assert.equal(h.controller.getStepSelection("tail").distance, 1);
  } finally {
    h.restore();
  }
}

{
  const h = makeHarness({ rates: [1] });
  try {
    h.controller.tick();
    h.controller.playFromGesture({ center: 50 });
    h.snapshot = {
      ...h.snapshot,
      transportKind: "playback",
      center: { ...h.snapshot.center, time: 51, state: YOUTUBE_STATE.PLAYING }
    };
    h.controller.tick();
    const field = h.controller.snapshot();
    assert.equal(field.tailMode, FIELD_SIDE_MODE.HELD);
    assert.equal(field.leadMode, FIELD_SIDE_MODE.HELD);
    assert.equal(h.tail().time, 41, "A source without a slow rate must park Tail at its current target instead of getting stuck.");
    assert.equal(h.lead().time, 61, "A source without a fast rate must park Lead at its current target instead of getting stuck.");
  } finally {
    h.restore();
  }
}

{
  const h = makeHarness();
  try {
    h.controller.tick();
    h.snapshot = {
      ...h.snapshot,
      current: 0,
      range: { start: 0, end: 100 },
      center: { ...h.snapshot.center, time: 0, state: YOUTUBE_STATE.PAUSED }
    };
    h.controller.translateToCurrent(0, { preserve: true });
    assert.equal(h.tail().time, 0);
    h.snapshot = {
      ...h.snapshot,
      current: 20,
      center: { ...h.snapshot.center, time: 20, state: YOUTUBE_STATE.PAUSED }
    };
    h.controller.translateToCurrent(20, { preserve: true });
    assert.equal(h.tail().time, 10, "Leaving a Range boundary must restore the remembered configured Tail extent.");
  } finally {
    h.restore();
  }
}


{
  const h = makeHarness({
    rates: [1],
    deferredCue: true,
    delayedPlay: true,
    ratesAfterPlay: [0.5, 1, 2]
  });
  try {
    h.controller.tick();
    assert.equal(h.controller.activationState().ready, false, "Center Play must wait until visible side sources are cued.");
    const tailCueCount = h.tail().commands.filter(command => command[0] === "cue").length;
    const leadCueCount = h.lead().commands.filter(command => command[0] === "cue").length;
    h.tail().finishCue();
    h.lead().finishCue();
    assert.equal(h.controller.activationState().ready, true);

    const started = h.controller.playFromGesture({ center: 50 });
    assert.deepEqual(started, { tail: true, lead: true });
    assert.equal(h.tail().commands.filter(command => command[0] === "cue").length, tailCueCount, "Trusted Play must not re-cue Tail.");
    assert.equal(h.lead().commands.filter(command => command[0] === "cue").length, leadCueCount, "Trusted Play must not re-cue Lead.");
    assert.deepEqual(h.tail().commands.slice(-2), [["place", 50], ["play"]]);
    assert.deepEqual(h.lead().commands.slice(-2), [["place", 50], ["play"]]);

    h.snapshot = {
      ...h.snapshot,
      transportKind: "playback",
      center: { ...h.snapshot.center, time: 50.5, state: YOUTUBE_STATE.PLAYING }
    };
    h.controller.tick();
    assert.equal(h.controller.snapshot().tailMode, FIELD_SIDE_MODE.STRETCHING, "Temporary 1× availability must not collapse Tail before playback confirms rates.");
    assert.equal(h.controller.snapshot().leadMode, FIELD_SIDE_MODE.STRETCHING, "Temporary 1× availability must not collapse Lead before playback confirms rates.");

    h.tail().finishPlay();
    h.lead().finishPlay();
    h.snapshot = {
      ...h.snapshot,
      center: { ...h.snapshot.center, time: 51, state: YOUTUBE_STATE.PLAYING }
    };
    h.controller.tick();
    assert.equal(h.tail().rate, 0.5);
    assert.equal(h.lead().rate, 2);
  } finally {
    h.restore();
  }
}

console.log("Field runtime tests passed: decoded paused frames, fresh refold/stretch, rate confirmation, Hold isolation, exact pause, whole-Field Step geometry, unsupported-rate fallback, and boundary recovery.");
