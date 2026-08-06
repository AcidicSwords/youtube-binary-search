import assert from "node:assert/strict";
import { createPanoramaController, FIELD_SIDE_MODE } from "./panorama.js";
import { YOUTUBE_STATE } from "./youtube.js";
import { FIELD_FRAME_ACTIVATION } from "./panorama-frame.js";

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
  rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  deferredChapter = false,
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
    panoramaEnabled: true,
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
    panoramaCycle: { inner: 2, outer: 10, rate: 0.5 },
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
      chapter(_videoId, address) {
        commands.push(["chapter", address]);
        time = address;
        if (!deferredChapter) {
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
      finishChapter() { state = YOUTUBE_STATE.CUED; config.events.onStateChange?.(state); },
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
  // The cycle runs on the wall clock, so the suite supplies its own and moves
  // it deliberately. Nothing here depends on how long the test took to run.
  let clock = 0;
  const controller = createPanoramaController({
    now: () => clock,
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
    get clock() { return clock; },
    set clock(value) { clock = value; },
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
    assert.ok(h.tail().commands.some(command => command[0] === "chapter"));
    assert.ok(h.tail().commands.some(command => command[0] === "place"), "Pre-activation parking must decode the represented frame after chaptering.");

    const leadChaptersBeforeRecovery = h.lead().commands.filter(command => command[0] === "chapter").length;
    h.lead().fail();
    assert.equal(h.controller.snapshot().leadRuntime.error, true);
    assert.equal(h.controller.snapshot().leadRuntime.ready, true, "A media error must not discard the reusable IFrame adapter.");
    h.elements.get("lead-collapse").click();
    h.elements.get("lead-restore").click();
    h.controller.tick();
    assert.equal(h.controller.snapshot().leadRuntime.error, false, "Restoring a failed pane must retry its source.");
    assert.ok(
      h.lead().commands.filter(command => command[0] === "chapter").length > leadChaptersBeforeRecovery,
      "Lead recovery must re-chapter the current video instead of remaining permanently unavailable."
    );

    const semanticInterval = Object.freeze({ departure: 30, arrival: 50 });
    h.snapshot = { ...h.snapshot, activeSpan: semanticInterval, transportKind: "context" };
    h.controller.tick();
    assert.equal(h.controller.snapshot().phase, "suspended");
    h.snapshot = { ...h.snapshot, transportKind: "idle" };
    const started = h.controller.playFromGesture({ center: 50 });
    assert.deepEqual(started, { tail: true, lead: true }, "A Context settled in the same gesture stack must not leave stale suspension behind.");
    assert.deepEqual(h.snapshot.activeSpan, semanticInterval, "Physical Panorama activation must not mutate semantic Interval.");
    assert.ok(["chapter", "place"].includes(h.tail().commands.at(-2)?.[0]));
    assert.equal(h.tail().commands.at(-2)?.[1], 48, "A fresh cycle begins at the inner offset behind Center.");
    assert.deepEqual(h.tail().commands.at(-1), ["play"]);
    assert.ok(["chapter", "place"].includes(h.lead().commands.at(-2)?.[0]));
    assert.equal(h.lead().commands.at(-2)?.[1], 52, "A fresh cycle begins at the inner offset ahead of Center.");
    assert.deepEqual(h.lead().commands.at(-1), ["play"]);
    assert.equal(h.controller.cycle().phase, "expanding");
    assert.equal(h.controller.cycle().held, false);

    h.snapshot = {
      ...h.snapshot,
      transportKind: "playback",
      center: { ...h.snapshot.center, time: 52, state: YOUTUBE_STATE.PLAYING }
    };
    h.controller.tick();
    assert.equal(h.tail().rate, 0.5, "Expansion applies the outward Tail rate z < c.");
    assert.equal(h.lead().rate, 1.5, "Expansion applies the outward Lead rate w > c.");
    // The cycle opens against the wall clock, not against elapsed Center source
    // time, so it takes the same real seconds at every Center rate. With a 0.5
    // step, one real second grows each side by 0.5 s.
    h.clock += 2000;
    h.controller.tick();
    assert.equal(h.controller.cycle().sides.tail.offset, 3);
    assert.equal(h.controller.cycle().sides.lead.offset, 3);
    assert.ok(h.tail().time < 52, "Tail must remain behind Center while it expands.");
    assert.ok(h.lead().time > 52, "Lead must remain ahead of Center while it expands.");

    h.controller.hold("both");
    assert.equal(h.controller.snapshot().tailMode, FIELD_SIDE_MODE.HELD);
    assert.equal(h.controller.snapshot().leadMode, FIELD_SIDE_MODE.HELD);
    assert.equal(h.controller.cycle().held, true, "Hold alone changes Stretching into Held.");
    assert.equal(h.controller.cycle().phase, "expanding", "Hold preserves the cycling direction.");
    assert.deepEqual(h.snapshot.activeSpan, semanticInterval, "Hold changes runtime Panorama state only; it must not redefine Interval.");
    const heldTail = h.controller.cycle().sides.tail.offset;
    const heldLead = h.controller.cycle().sides.lead.offset;
    assert.ok(heldTail >= 2 && heldTail <= 10, "A held offset stays inside the configured [x, y] bounds.");

    h.snapshot = {
      ...h.snapshot,
      transportKind: "idle",
      center: { ...h.snapshot.center, time: 52, state: YOUTUBE_STATE.PAUSED }
    };
    h.controller.pause({ center: 52, freeze: true });
    assert.equal(h.tail().state, YOUTUBE_STATE.PAUSED);
    assert.equal(h.lead().state, YOUTUBE_STATE.PAUSED);
    assert.equal(h.tail().time, 52 - heldTail);
    assert.equal(h.lead().time, 52 + heldLead);

    h.controller.translateToCurrent(60, { preserve: true });
    assert.equal(h.tail().time, 60 - heldTail, "Whole-Panorama translation must preserve Tail's attained offset.");
    assert.equal(h.lead().time, 60 + heldLead, "Whole-Panorama translation must preserve Lead's attained offset.");
    assert.equal(h.controller.getStepSelection("tail").distance, heldTail);
  } finally {
    h.restore();
  }
}

// The Panorama relation scales around the actual Center rate. The same
// fractional spread must remain symmetric rather than being re-centered on 1×.
{
  const h = makeHarness({ rates: [0.5, 1, 1.5, 2, 3] });
  try {
    h.snapshot = {
      ...h.snapshot,
      center: { ...h.snapshot.center, rate: 2 }
    };
    h.controller.tick();
    h.controller.playFromGesture({ center: 50 });
    h.snapshot = {
      ...h.snapshot,
      transportKind: "playback",
      center: {
        ...h.snapshot.center,
        time: 52,
        rate: 1.5,
        state: YOUTUBE_STATE.PLAYING
      }
    };
    h.controller.tick();
    // The step either side of Center is an interval, not a fraction of it.
    // Scaling it with Center -- tail = C(1-z), lead = C(1+z) -- is identical at
    // 1x and wrong everywhere else: the gap would open faster the faster you
    // played, so a cycle would last a different number of seconds at every
    // rate. A fixed step keeps the difference at one rung wherever Center sits.
    assert.equal(h.tail().rate, 1,
      "At Center 1.5×, a 0.5 step puts Tail one step below at 1×.");
    assert.equal(h.lead().rate, 2,
      "and Lead one step above at 2×.");
    h.clock += 2000;
    h.controller.tick();
    assert.equal(h.controller.cycle().sides.tail.offset, 3);
    assert.equal(h.controller.cycle().sides.lead.offset, 3,
      "Equal rate distance through Center must produce equal offsets.");
    assert.match(h.elements.get("field-rate-state").textContent, /Center 1\.5×/,
      "The Panorama readout reports the observed Center rate, not a fixed 1×.");

    h.controller.hold("both");
    assert.equal(h.tail().rate, 1.5);
    assert.equal(h.lead().rate, 1.5,
      "Held sides follow Center exactly so the attained offsets remain fixed.");
  } finally {
    h.restore();
  }
}

// The Outer Offset is one Panorama-level configuration. Editing it reconciles the
// live relation without becoming a Hold and without writing Session state.
{
  const h = makeHarness();
  try {
    h.controller.tick();
    h.snapshot = {
      ...h.snapshot,
      panoramaCycle: { inner: 2, outer: 20, rate: 0.5 }
    };
    assert.equal(h.controller.reconfigureOffset(), true);
    assert.equal(
      h.tail().time,
      30,
      "A side already following its configured Outer Offset follows the new one."
    );
    assert.equal(
      h.lead().time,
      70,
      "Both sides reconcile against the one configured Panorama relation."
    );

    h.controller.playFromGesture({ center: 50 });
    h.snapshot = {
      ...h.snapshot,
      transportKind: "playback",
      center: { ...h.snapshot.center, time: 52, state: YOUTUBE_STATE.PLAYING }
    };
    h.controller.tick();
    h.clock += 4000;
    h.controller.tick();
    h.controller.hold("both");
    const partial = h.controller.cycle().sides.tail.offset;
    assert.ok(partial > 2 && partial < 20, "The Panorama was Held part-way through its cycle.");
    h.snapshot = {
      ...h.snapshot,
      panoramaCycle: { inner: 2, outer: 30, rate: 0.5 }
    };
    h.controller.reconfigureOffset();
    assert.equal(
      h.controller.cycle().sides.tail.offset,
      partial,
      "A partial held relation must remain held when only its configured Outer Offset changes."
    );
    assert.equal(h.controller.cycle().held, true, "Configuration edits are not a Hold or a Stretch.");
  } finally {
    h.restore();
  }
}

{
  const h = makeHarness({
    deferredChapter: true,
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
      "Removing either side must invalidate the published two-sided Panorama span."
    );
    const tailCommands = h.tail().commands.length;
    h.controller.tick();
    h.controller.tick();
    assert.equal(
      h.tail().commands.length,
      tailCommands,
      "A hidden pane must remain dormant across polling ticks."
    );
    h.tail().finishChapter();
    assert.equal(
      h.tail().commands.filter(command => command[0] === "play").length,
      tailPlays,
      "A delayed CUED event must not revive a pane hidden after Play was requested."
    );

    h.elements.get("panorama-toggle").click();
    assert.equal(h.controller.snapshot().phase, "off");
    assert.equal(h.controller.snapshot().span.available, false);
    assert.equal(h.controller.getStepSelection("lead"), null);
    const leadCommands = h.lead().commands.length;
    h.controller.tick();
    h.controller.tick();
    assert.equal(
      h.lead().commands.length,
      leadCommands,
      "Panorama Off must not keep issuing hidden player commands."
    );
    h.lead().finishChapter();
    assert.equal(
      h.lead().commands.filter(command => command[0] === "play").length,
      0,
      "A delayed side callback must respect a later Panorama Off transition."
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
      panoramaCycle: { inner: 1, outer: 2.5, rate: 0.5 },
      panoramaFrame: {
        kind: "step",
        activation: { kind: FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS },
        start: 35,
        center: 50,
        end: 72,
        backwardDistance: 15,
        forwardDistance: 22
      }
    };
    h.controller.tick();
    assert.equal(h.tail().time, 35, "Step preview must use the semantic Backward destination, not Panorama Offset.");
    assert.equal(h.lead().time, 72, "Step preview must use the semantic Forward destination, not Panorama Offset.");
    assert.equal(h.elements.get("field-transport-state").textContent, "Step Frame");
    assert.equal(h.controller.snapshot().span.held, false, "A temporary preview must not become a Held Panorama span.");
    assert.equal(h.controller.getStepSelection("tail").distance, 15);
    assert.equal(h.controller.getStepSelection("tail").address, 35);
    assert.equal(h.controller.getStepSelection("lead").distance, 22);
    assert.equal(h.controller.getStepSelection("lead").address, 72);
    assert.equal(h.elements.get("tail-player-surface").getAttribute("aria-disabled"), "false");
    assert.equal(h.elements.get("lead-player-surface").getAttribute("aria-disabled"), "false");
    assert.equal(h.elements.get("field-both-toggle").disabled, true,
      "A Panorama Frame makes the combined Stretch/Hold control non-actionable.");

    h.snapshot = {
      ...h.snapshot,
      panoramaFrame: {
        kind: "step",
        start: 35,
        center: 50,
        end: 72,
        backwardDistance: 15,
        forwardDistance: 22
      }
    };
    h.controller.tick();
    assert.equal(h.controller.getStepSelection("tail"), null,
      "Step-shaped geometry without an activation contract remains observation-only.");
    assert.equal(h.elements.get("tail-player-surface").getAttribute("aria-disabled"), "true");

    h.snapshot = {
      ...h.snapshot,
      panoramaFrame: {
        kind: "refine",
        start: 42,
        center: 50,
        end: 63
      }
    };
    h.controller.tick();
    assert.equal(h.tail().time, 42);
    assert.equal(h.lead().time, 63);
    assert.equal(h.elements.get("field-transport-state").textContent, "Refine Frame");
    assert.equal(h.controller.getStepSelection("tail"), null);
    assert.equal(h.controller.getStepSelection("lead"), null);

    h.snapshot = {
      ...h.snapshot,
      panoramaFrame: {
        kind: "reopen",
        start: 25,
        center: 50,
        end: 75
      }
    };
    h.controller.tick();
    assert.equal(h.tail().time, 25);
    assert.equal(h.lead().time, 75);
    assert.equal(h.elements.get("field-transport-state").textContent, "Reopen Frame");
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
      panoramaFrame: {
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
    assert.equal(h.elements.get("field-transport-state").textContent, "Context Frame");
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
      panoramaFrame: {
        kind: "step",
        activation: { kind: FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS },
        start: 40,
        center: 50,
        end: 60,
        backwardDistance: 10,
        forwardDistance: 10
      }
    };
    h.controller.tick();
    assert.equal(h.elements.get("field-transport-state").textContent, "Step Frame");

    const started = h.controller.playFromGesture({ center: 50 });
    assert.deepEqual(
      started,
      { tail: true, lead: true },
      "Playback activation must replace an idle operator preview with a fresh live Panorama."
    );
    h.snapshot = {
      ...h.snapshot,
      panoramaFrame: null,
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
    assert.equal(h.lead().rate, 1.5);
    assert.equal(h.elements.get("field-both-toggle").disabled, false,
      "Ordinary playback restores the combined Stretch/Hold control.");
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
    assert.equal(field.tailRuntime.rateAvailable, false, "A 1x-only source cannot supply cycling rates.");
    assert.equal(field.leadRuntime.rateAvailable, false);
    // The pure cycling state machine still owns the relation, so a source
    // without directional rates degrades to placement rather than getting stuck.
    h.clock += 1000;
    h.controller.tick();
    assert.equal(h.controller.cycle().sides.tail.offset, 2.5);
    assert.equal(h.controller.cycle().sides.lead.offset, 2.5);
    assert.ok(h.tail().time < 51, "Tail must remain behind Center.");
    assert.ok(h.lead().time > 51, "Lead must remain ahead of Center.");
  } finally {
    h.restore();
  }
}

{
  const h = makeHarness();
  try {
    h.snapshot = {
      ...h.snapshot,
      panoramaCycle: { inner: 1, outer: 2.5, rate: 0.5 }
    };
    h.controller.tick();
    assert.equal(h.tail().time, 47.5);
    assert.equal(h.lead().time, 52.5);
    assert.equal(
      h.controller.previewExtent({ kind: "unknown", center: 50 }),
      false,
      "Unknown preview kinds must not acquire the Panorama."
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
    assert.equal(h.elements.get("field-transport-state").textContent, "Section Frame");
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
    assert.equal(h.tail().time, 0, "Pin preview Panorama must clamp Tail at Range Start.");
    assert.equal(h.lead().time, 3.5, "Pin preview Panorama must use its supplied spatial Step target.");
    assert.equal(h.elements.get("field-transport-state").textContent, "Pin Frame");
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
    deferredChapter: true,
    delayedPlay: true,
    ratesAfterPlay: [0.5, 1, 1.5, 2]
  });
  try {
    h.controller.tick();
    assert.equal(h.controller.activationState().ready, false, "Center Play must wait until visible side sources are cued.");
    const tailChapterCount = h.tail().commands.filter(command => command[0] === "chapter").length;
    const leadChapterCount = h.lead().commands.filter(command => command[0] === "chapter").length;
    h.tail().finishChapter();
    h.lead().finishChapter();
    assert.equal(h.controller.activationState().ready, true);

    const started = h.controller.playFromGesture({ center: 50 });
    assert.deepEqual(started, { tail: true, lead: true });
    assert.equal(h.tail().commands.filter(command => command[0] === "chapter").length, tailChapterCount, "Trusted Play must not re-chapter Tail.");
    assert.equal(h.lead().commands.filter(command => command[0] === "chapter").length, leadChapterCount, "Trusted Play must not re-chapter Lead.");
    assert.deepEqual(h.tail().commands.slice(-2), [["place", 48], ["play"]]);
    assert.deepEqual(h.lead().commands.slice(-2), [["place", 52], ["play"]]);

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
    assert.equal(h.lead().rate, 1.5);
  } finally {
    h.restore();
  }
}

console.log("Panorama runtime tests passed: decoded paused frames, Panorama Frame placement, one-rung side steps that keep the cycle the same length at every Center rate, Hold isolation, Panorama-level Offset reconciliation, dormant hidden/off panes, stale-event rejection, exact pause, whole-Panorama Step geometry, direct-manipulation Frames, unsupported-rate fallback, and boundary recovery.");
