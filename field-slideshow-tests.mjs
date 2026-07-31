// The Field Frame behaves as a stable directional slideshow around Current.
// These tests drive the real controller with a deterministic iframe stub so the
// transition lifecycle, coalescing, and stale-event rejection are observable.
import assert from "node:assert/strict";
import { createStepFieldController } from "./step-field.js";
import { YOUTUBE_STATE } from "./youtube.js";

function element() {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    dataset: {},
    children: [],
    classList: {
      names: new Set(),
      toggle(name, force) {
        const add = force === undefined ? !this.names.has(name) : Boolean(force);
        if (add) this.names.add(name); else this.names.delete(name);
        return add;
      },
      contains(name) { return this.names.has(name); }
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    click() { listeners.get("click")?.({ stopPropagation() {} }); },
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] ?? null; },
    replaceChildren(...children) { this.children = children; },
    appendChild(child) { this.children.push(child); return child; }
  };
}

function makeHarness({ deferredCue = false, reducedMotion = false } = {}) {
  const elements = new Map();
  const document = {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement() { return element(); }
  };
  let snapshot = {
    videoLoaded: true,
    videoId: "slideshow",
    current: 50,
    range: { start: 0, end: 200 },
    stepReach: { backward: 10, forward: 10, linked: true },
    fieldBreath: { inner: 2, outer: 10, rate: 0.5 },
    transportKind: "idle",
    pendingStep: false,
    dragging: false,
    fieldFrame: null,
    center: {
      time: 50,
      rate: 1,
      state: YOUTUBE_STATE.PAUSED,
      availableRates: [0.5, 1, 1.5, 2]
    }
  };
  const adapters = new Map();
  function createPlayer(id, config) {
    let time = 0;
    let state = YOUTUBE_STATE.PAUSED;
    const commands = [];
    const adapter = {
      commands,
      mute() {},
      cue(_videoId, address) {
        commands.push(["cue", address]);
        time = address;
        if (!deferredCue) {
          state = YOUTUBE_STATE.CUED;
          config.events.onStateChange?.(state);
        }
      },
      place(address) { commands.push(["place", address]); time = address; },
      play() { commands.push(["play"]); state = YOUTUBE_STATE.PLAYING; },
      pause() { state = YOUTUBE_STATE.PAUSED; },
      setRate() {},
      read() { return { time, rate: 1, state, availableRates: [0.5, 1, 1.5, 2] }; },
      finishCue() { state = YOUTUBE_STATE.CUED; config.events.onStateChange?.(state); },
      get time() { return time; }
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
    getPreferences: () => ({
      stepFieldEnabled: true,
      tailVisible: true,
      leadVisible: true,
      breathRate: 0.5,
      reducedMotion
    }),
    setPreferences: () => {},
    onChange: () => {},
    createPlayer,
    formatTime: value => String(value)
  });

  // One committed movement: Session has already changed when the Frame arrives.
  function commit({ center, tail, lead, owner = "operator", kind = "step", outgoing = null }) {
    const previous = snapshot.fieldFrame;
    snapshot = {
      ...snapshot,
      current: center,
      fieldFrame: {
        owner,
        kind,
        tail,
        center,
        lead,
        outgoing: outgoing ?? previous?.center ?? null
      }
    };
    controller.tick();
    return controller.transition();
  }

  return {
    controller,
    elements,
    commit,
    root: () => elements.get("step-field"),
    tail: () => adapters.get("player-tail"),
    lead: () => adapters.get("player-lead"),
    get snapshot() { return snapshot; },
    set snapshot(value) { snapshot = value; },
    restore() { globalThis.YT = previousYT; }
  };
}

// Repeated forward movements compose as one continuing slideshow.
{
  const h = makeHarness();
  try {
    h.controller.tick();
    // Establish the currently displayed Frame; the movements follow from it.
    const first = h.commit({ center: 50, tail: 40, lead: 60 });
    assert.equal(first.direction, "none", "The first Frame has no prior position to travel from.");
    const directions = [];
    const revisions = [];
    for (const center of [60, 70, 80, 90]) {
      const transition = h.commit({ center, tail: center - 10, lead: center + 10 });
      directions.push(transition.direction);
      revisions.push(transition.generation);
    }
    assert.deepEqual(directions, ["forward", "forward", "forward", "forward"]);
    assert.deepEqual(
      revisions,
      [first.generation + 1, first.generation + 2, first.generation + 3, first.generation + 4],
      "Each committed movement is exactly one transition."
    );
    assert.equal(h.root().classList.contains("is-traversing-forward"), true);
    assert.equal(h.root().classList.contains("is-traversing-backward"), false);
    assert.equal(h.tail().time, 80, "Tail settles on the latest resulting Frame.");
    assert.equal(h.lead().time, 100);
  } finally {
    h.restore();
  }
}

// Repeated backward movements read as the same slideshow travelling the other way.
{
  const h = makeHarness();
  try {
    h.controller.tick();
    h.commit({ center: 50, tail: 40, lead: 60 });
    h.commit({ center: 90, tail: 80, lead: 100 });
    const directions = [];
    for (const center of [80, 70, 60]) {
      directions.push(h.commit({ center, tail: center - 10, lead: center + 10 }).direction);
    }
    assert.deepEqual(directions, ["backward", "backward", "backward"]);
    assert.equal(h.root().classList.contains("is-traversing-backward"), true);
    assert.equal(h.tail().time, 50);
    assert.equal(h.lead().time, 70);
  } finally {
    h.restore();
  }
}

// Immediate direction reversal reverses cleanly instead of accumulating.
{
  const h = makeHarness();
  try {
    h.controller.tick();
    h.commit({ center: 50, tail: 40, lead: 60 });
    assert.equal(h.commit({ center: 60, tail: 50, lead: 70 }).direction, "forward");
    const reversed = h.commit({ center: 50, tail: 40, lead: 60 });
    assert.equal(reversed.direction, "backward");
    assert.equal(h.root().classList.contains("is-traversing-forward"), false);
    assert.equal(h.root().classList.contains("is-traversing-backward"), true);
  } finally {
    h.restore();
  }
}

// Rapid operations coalesce: obsolete intermediate placements are discarded and
// the Field settles on the latest committed state.
{
  const h = makeHarness({ deferredCue: true });
  try {
    h.controller.tick();
    for (const center of [60, 70, 80]) {
      h.commit({ center, tail: center - 10, lead: center + 10 });
    }
    const placementsBefore = h.tail().commands.filter(command => command[0] === "place").length;
    // A callback belonging to a superseded Frame arrives late.
    h.tail().finishCue();
    assert.equal(
      h.tail().commands.filter(command => command[0] === "place").length,
      placementsBefore + 1,
      "The late callback places the current Frame exactly once."
    );
    assert.equal(h.tail().time, 70, "It never replays an obsolete intermediate Frame.");
  } finally {
    h.restore();
  }
}

// Context begins, moves and ends inside one stable Frame.
{
  const h = makeHarness();
  try {
    h.controller.tick();
    h.commit({ center: 50, tail: 40, lead: 60 });
    const opened = h.commit({
      owner: "context",
      kind: "context",
      center: 50,
      tail: 47.5,
      lead: 52.5
    });
    const openedGeneration = opened.generation;
    const tailAtOpen = h.tail().time;
    const leadAtOpen = h.lead().time;
    assert.deepEqual([tailAtOpen, leadAtOpen], [47.5, 52.5]);

    // Cursor crosses its own window.
    for (const cursor of [48.5, 49.5, 51, 52]) {
      h.commit({
        owner: "context",
        kind: "context",
        center: cursor,
        tail: 47.5,
        lead: 52.5
      });
      assert.equal(h.tail().time, tailAtOpen, "Context Start must not move while Cursor does.");
      assert.equal(h.lead().time, leadAtOpen, "Context End must not move while Cursor does.");
    }
    assert.equal(
      h.controller.transition().generation,
      openedGeneration,
      "Context transport must not reframe the sides."
    );

    // Context stops and settles on the accepted Cursor.
    h.commit({
      owner: "context",
      kind: "context",
      center: 52,
      tail: 47.5,
      lead: 52.5
    });
    assert.equal(h.tail().time, 47.5, "Context settlement changes no side-frame ownership.");
    assert.equal(h.lead().time, 52.5);
    assert.equal(h.controller.transition().generation, openedGeneration);
  } finally {
    h.restore();
  }
}

// Direct manipulation temporarily owns the Frame, then one transition restores
// the ambient Frame. It never mutates the configured breathing relation.
{
  const h = makeHarness();
  try {
    h.controller.tick();
    h.commit({ center: 50, tail: 40, lead: 60 });
    const configured = h.controller.breath().configured;
    assert.equal(h.controller.previewExtent({
      kind: "current",
      start: 65,
      center: 70,
      end: 75
    }), true);
    assert.equal(h.tail().time, 65);
    assert.equal(h.lead().time, 75);
    assert.deepEqual(h.controller.breath().configured, configured,
      "A direct Frame must not rewrite the configured Field relation.");
    h.controller.clearPreview();
    assert.equal(h.tail().time, 40, "Ending the gesture restores the ambient Frame.");
    assert.equal(h.lead().time, 60);
  } finally {
    h.restore();
  }
}

// Reduced motion settles on the resulting Frame without the travelling classes.
{
  const h = makeHarness({ reducedMotion: true });
  try {
    h.controller.tick();
    h.commit({ center: 60, tail: 50, lead: 70 });
    assert.equal(h.root().classList.contains("is-traversing-forward"), false);
    assert.equal(h.root().classList.contains("is-traversing-backward"), false);
    assert.equal(h.root().dataset.transition, "none");
    assert.equal(h.tail().time, 50, "The resulting Frame is still exact.");
    assert.equal(h.lead().time, 70);
  } finally {
    h.restore();
  }
}

console.log("Field slideshow tests passed: repeated forward and backward transitions, immediate reversal, rapid coalescing with stale-callback rejection, persistent Context framing, direct-manipulation priority, and reduced motion.");
