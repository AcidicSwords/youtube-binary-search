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
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] ?? null; },
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
  const changes = [];
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
    onChange: field => changes.push(field),
    createPlayer,
    formatTime: value => String(value)
  });

  return {
    controller,
    elements,
    adapters,
    changes,
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
    assert.equal(h.controller.getStepSelection("tail").distance, 1);
    assert.deepEqual(h.snapshot.interval, semanticInterval, "Hold changes runtime Field state only; it must not redefine Interval.");

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
  const h = makeHarness();
  try {
    h.controller.tick();
    const leadPlaces = h.lead().commands.filter(command =>
      command[0] === "place"
    ).length;
    h.snapshot = {
      ...h.snapshot,
      stepReach: {
        ...h.snapshot.stepReach,
        backward: 20,
        linked: false
      }
    };
    assert.equal(h.controller.reconfigureOffset("tail"), true);
    assert.equal(
      h.tail().time,
      30,
      "A Tail Offset change must move a Tail that was following its configured target."
    );
    assert.equal(
      h.lead().time,
      60,
      "Changing Tail Offset must not disturb Lead."
    );
    assert.equal(
      h.lead().commands.filter(command => command[0] === "place").length,
      leadPlaces,
      "One side's Tune interaction must issue no placement command to its sibling."
    );

    h.controller.playFromGesture({ center: 50 });
    h.snapshot = {
      ...h.snapshot,
      transportKind: "playback",
      center: { ...h.snapshot.center, time: 52, state: YOUTUBE_STATE.PLAYING }
    };
    h.tail().setTime(51);
    h.controller.tick();
    h.controller.hold("tail");
    assert.equal(h.controller.getStepSelection("tail").distance, 1);
    h.snapshot = {
      ...h.snapshot,
      stepReach: {
        ...h.snapshot.stepReach,
        backward: 30
      }
    };
    h.controller.reconfigureOffset("tail");
    assert.equal(
      h.controller.getStepSelection("tail").distance,
      1,
      "A partial held relation must remain held when only its configured maximum changes."
    );
  } finally {
    h.restore();
  }
}

{
  const h = makeHarness({
    deferredCue: true,
    delayedPlay: true
  });
  try {
    h.controller.tick();
    h.controller.playFromGesture({ center: 50 });
    const tailPlays = h.tail().commands.filter(command =>
      command[0] === "play"
    ).length;
    h.elements.get("tail-collapse").click();
    assert.equal(
      h.controller.getStepSelection("tail"),
      null,
      "A hidden pane must immediately stop being a Step source."
    );
    assert.equal(h.controller.snapshot().tail.visible, false);
    assert.equal(
      h.controller.snapshot().span.available,
      false,
      "Removing either side must invalidate the published two-sided Field span."
    );
    const tailCommands = h.tail().commands.length;
    h.controller.tick();
    h.controller.tick();
    assert.equal(
      h.tail().commands.length,
      tailCommands,
      "A hidden pane must remain dormant across polling ticks."
    );
    h.tail().finishCue();
    assert.equal(
      h.tail().commands.filter(command => command[0] === "play").length,
      tailPlays,
      "A delayed CUED event must not revive a pane hidden after Play was requested."
    );

    h.elements.get("step-field-toggle").click();
    assert.equal(h.controller.snapshot().phase, "off");
    assert.equal(h.controller.snapshot().span.available, false);
    assert.equal(h.controller.getStepSelection("lead"), null);
    const leadCommands = h.lead().commands.length;
    h.controller.tick();
    h.controller.tick();
    assert.equal(
      h.lead().commands.length,
      leadCommands,
      "Field Off must not keep issuing hidden player commands."
    );
    h.lead().finishCue();
    assert.equal(
      h.lead().commands.filter(command => command[0] === "play").length,
      0,
      "A delayed side callback must respect a later Field Off transition."
    );
  } finally {
    h.restore();
  }
}

{
  const h = makeHarness();
  try {
    h.snapshot = {
      ...h.snapshot,
      stepReach: {
        backward: 2.5,
        forward: 2.5,
        linked: true
      },
      fieldPreview: {
        kind: "step",
        start: 35,
        center: 50,
        end: 72,
        backwardDistance: 15,
        forwardDistance: 22
      }
    };
    h.controller.tick();
    assert.equal(h.tail().time, 35, "Step preview must use the semantic Backward destination, not Field Offset.");
    assert.equal(h.lead().time, 72, "Step preview must use the semantic Forward destination, not Field Offset.");
    assert.equal(h.elements.get("field-transport-state").textContent, "Step preview");
    assert.equal(h.controller.snapshot().span.held, false, "A temporary preview must not become a Held Field span.");
    assert.equal(h.controller.getStepSelection("tail").distance, 15);
    assert.equal(h.controller.getStepSelection("tail").address, 35);
    assert.equal(h.controller.getStepSelection("lead").distance, 22);
    assert.equal(h.controller.getStepSelection("lead").address, 72);
    assert.equal(h.elements.get("tail-player-surface").getAttribute("aria-disabled"), "false");
    assert.equal(h.elements.get("lead-player-surface").getAttribute("aria-disabled"), "false");
    assert.equal(h.elements.get("tail-field-toggle").disabled, true);
    assert.equal(h.elements.get("lead-field-toggle").disabled, true);

    h.snapshot = {
      ...h.snapshot,
      fieldPreview: {
        kind: "refine",
        start: 42,
        center: 50,
        end: 63
      }
    };
    h.controller.tick();
    assert.equal(h.tail().time, 42);
    assert.equal(h.lead().time, 63);
    assert.equal(h.elements.get("field-transport-state").textContent, "Refine preview");
    assert.equal(h.controller.getStepSelection("tail"), null);
    assert.equal(h.controller.getStepSelection("lead"), null);

    h.snapshot = {
      ...h.snapshot,
      fieldPreview: {
        kind: "reopen",
        start: 25,
        center: 50,
        end: 75
      }
    };
    h.controller.tick();
    assert.equal(h.tail().time, 25);
    assert.equal(h.lead().time, 75);
    assert.equal(h.elements.get("field-transport-state").textContent, "Reopen preview");
    assert.equal(h.controller.getStepSelection("tail"), null);
    assert.equal(h.controller.getStepSelection("lead"), null);

    h.snapshot = {
      ...h.snapshot,
      transportKind: "context",
      center: {
        ...h.snapshot.center,
        time: 48.25,
        state: YOUTUBE_STATE.PLAYING
      },
      fieldPreview: {
        kind: "context",
        start: 47.5,
        center: 50,
        end: 52.5
      }
    };
    h.controller.tick();
    assert.equal(h.tail().time, 47.5, "Context preview must park Tail on the first observed frame.");
    assert.equal(h.lead().time, 52.5, "Context preview must park Lead on the last observed frame.");
    assert.equal(h.elements.get("center-meta").textContent, "48.25", "Context Center meta must follow the playing Cursor.");
    assert.equal(h.elements.get("field-transport-state").textContent, "Context preview");
    assert.equal(h.controller.getStepSelection("tail"), null);
    assert.equal(h.controller.getStepSelection("lead"), null);
    assert.equal(h.elements.get("tail-player-surface").getAttribute("aria-disabled"), "true");
    assert.equal(h.elements.get("lead-player-surface").getAttribute("aria-disabled"), "true");

    h.controller.previewExtent({
      kind: "section",
      start: 20,
      center: 40,
      end: 80
    });
    assert.equal(h.tail().time, 20, "Direct Section preview must override the ambient Context preview.");
    assert.equal(h.lead().time, 80);
    h.controller.clearPreview();
    assert.equal(h.tail().time, 47.5, "Clearing direct preview must restore the active Context bounds.");
    assert.equal(h.lead().time, 52.5);
  } finally {
    h.restore();
  }
}

{
  const h = makeHarness();
  try {
    h.snapshot = {
      ...h.snapshot,
      fieldPreview: {
        kind: "step",
        start: 40,
        center: 50,
        end: 60,
        backwardDistance: 10,
        forwardDistance: 10
      }
    };
    h.controller.tick();
    assert.equal(h.elements.get("field-transport-state").textContent, "Step preview");

    const started = h.controller.playFromGesture({ center: 50 });
    assert.deepEqual(
      started,
      { tail: true, lead: true },
      "Playback activation must replace an idle operator preview with a fresh live Field."
    );
    h.snapshot = {
      ...h.snapshot,
      fieldPreview: null,
      transportKind: "playback",
      center: {
        ...h.snapshot.center,
        time: 52,
        state: YOUTUBE_STATE.PLAYING
      }
    };
    h.tail().setTime(51);
    h.lead().setTime(54);
    h.controller.tick();
    assert.doesNotMatch(
      h.elements.get("field-transport-state").textContent,
      /preview/,
      "Stretch/Hold playback must not retain the preceding operator-preview presentation."
    );
    assert.equal(h.tail().rate, 0.5);
    assert.equal(h.lead().rate, 2);
    assert.equal(h.elements.get("tail-field-toggle").disabled, false);
    assert.equal(h.elements.get("lead-field-toggle").disabled, false);
  } finally {
    h.restore();
  }
}

{
  const h = makeHarness({ delayedPlay: true });
  try {
    h.controller.tick();
    h.controller.playFromGesture({ center: 50 });
    h.controller.resetSources();
    h.tail().finishPlay();
    assert.equal(
      h.tail().state,
      YOUTUBE_STATE.PAUSED,
      "A late PLAYING event from a reset source must not inherit current Center playback intent."
    );
    assert.equal(
      h.controller.snapshot().tailRuntime.pendingPlay,
      false,
      "Reset source callbacks must clear stale play intent."
    );
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
    h.snapshot = {
      ...h.snapshot,
      stepReach: {
        backward: 2.5,
        forward: 2.5,
        linked: true
      }
    };
    h.controller.tick();
    assert.equal(h.tail().time, 47.5);
    assert.equal(h.lead().time, 52.5);
    assert.equal(
      h.controller.previewExtent({ kind: "unknown", center: 50 }),
      false,
      "Unknown preview kinds must not acquire the Field."
    );
    assert.equal(
      h.controller.previewExtent({ kind: "section", center: 50 }),
      false,
      "A Section preview must supply both exact endpoints."
    );
    assert.equal(
      h.controller.previewExtent({
        kind: "section",
        start: 20,
        center: 50,
        end: 90
      }),
      true
    );
    assert.equal(h.tail().time, 20, "Section preview must put Tail on the Start Pin.");
    assert.equal(h.lead().time, 90, "Section preview must put Lead on the End Pin.");
    assert.equal(h.elements.get("center-meta").textContent, "50");
    assert.equal(h.elements.get("tail-meta").textContent, "20");
    assert.equal(h.elements.get("lead-meta").textContent, "90");
    assert.equal(h.elements.get("field-transport-state").textContent, "Section preview");
    h.controller.tick();
    assert.equal(h.tail().time, 20, "Polling must not dislodge an active Section preview.");
    assert.equal(h.lead().time, 90, "Polling must preserve the exact preview End.");
    assert.equal(h.elements.get("field-span-label").textContent, "20–90");

    assert.doesNotThrow(() => {
      h.controller.previewExtent({
        kind: "section",
        start: 50,
        center: 50,
        end: 90
      });
    }, "A Section preview may collapse onto one endpoint during direct manipulation.");
    assert.equal(h.tail().time, 50, "A collapsed Start preview must keep Tail at Center.");
    assert.equal(h.lead().time, 90, "A collapsed Start preview must preserve Lead.");

    assert.doesNotThrow(() => {
      h.controller.previewExtent({
        kind: "section",
        start: 50,
        center: 50,
        end: 50
      });
    }, "A momentarily zero-width Section preview must remain renderable.");
    assert.equal(h.tail().time, 50);
    assert.equal(h.lead().time, 50);

    h.controller.clearPreview();
    assert.equal(h.tail().time, 47.5, "Ending preview must restore the configured Tail relation.");
    assert.equal(h.lead().time, 52.5, "Ending preview must restore the configured Lead relation.");

    h.controller.previewExtent({
      kind: "pin",
      start: 0,
      center: 1,
      end: 3.5
    });
    assert.equal(h.tail().time, 0, "Pin preview Field must clamp Tail at Range Start.");
    assert.equal(h.lead().time, 3.5, "Pin preview Field must use its supplied spatial Step target.");
    assert.equal(h.elements.get("field-transport-state").textContent, "Pin preview");
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

console.log("Field runtime tests passed: decoded paused frames, fresh refold/stretch, rate confirmation, Hold isolation, side-owned tuning, dormant hidden/off panes, stale-event rejection, exact pause, whole-Field Step geometry, retained-object drag previews, unsupported-rate fallback, and boundary recovery.");
