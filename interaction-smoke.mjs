import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function dataKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return new Set(String(this.element.className || "").split(/\s+/).filter(Boolean)); }
  write(values) { this.element.className = [...values].join(" "); }
  add(...names) { const values = this.values(); names.forEach(name => values.add(name)); this.write(values); }
  remove(...names) { const values = this.values(); names.forEach(name => values.delete(name)); this.write(values); }
  toggle(name, force) {
    const values = this.values();
    const add = force === undefined ? !values.has(name) : Boolean(force);
    if (add) values.add(name); else values.delete(name);
    this.write(values);
    return add;
  }
  contains(name) { return this.values().has(name); }
}

class FakeElement {
  constructor(id = "", tagName = "DIV") {
    this.id = id;
    this.tagName = tagName;
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.classList = new FakeClassList(this);
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.options = [];
    this.selectedOptions = [];
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.clientWidth = 1000;
    this.title = "";
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, init = {}) {
    const event = {
      type,
      target: init.target || this,
      currentTarget: this,
      clientX: init.clientX ?? 0,
      pointerId: init.pointerId ?? 1,
      key: init.key || "",
      ctrlKey: Boolean(init.ctrlKey),
      metaKey: Boolean(init.metaKey),
      altKey: Boolean(init.altKey),
      shiftKey: Boolean(init.shiftKey),
      repeat: Boolean(init.repeat),
      relatedTarget: init.relatedTarget || null,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      ...init
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
  click() { return this.dispatch("click"); }
  appendChild(child) { this.attach(child); return child; }
  append(...children) { children.forEach(child => this.attach(child)); }
  attach(child) {
    if (!child || typeof child !== "object") return;
    child.parentElement = this;
    this.children.push(child);
    if (this.tagName === "SELECT") this.options.push(child);
  }
  replaceChildren(...children) {
    this.children = [];
    this.options = [];
    children.forEach(child => this.attach(child));
  }
  setAttribute(name, value) {
    if (name.startsWith("data-")) this.dataset[dataKey(name)] = String(value);
    else this[name] = String(value);
  }
  removeAttribute(name) { delete this[name]; }
  focus() { document.activeElement = this; }
  blur() { document.activeElement = null; }
  setPointerCapture() {}
  contains(node) {
    for (let current = node; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (selector.startsWith(".")) {
        if (current.classList.contains(selector.slice(1))) return current;
      } else {
        const match = selector.match(/^\[data-([a-z0-9-]+)\]$/i);
        if (match && current.dataset[dataKey(`data-${match[1]}`)] !== undefined) return current;
      }
    }
    return null;
  }
  querySelectorAll(selector) {
    const nodes = descendants(this);
    if (selector === "[role=menuitem]") return nodes.filter(node => node.role === "menuitem");
    return [];
  }
  getBoundingClientRect() { return { left: 0, width: 1000 }; }
}

function descendants(root) {
  const result = [];
  const visit = node => {
    for (const child of node.children || []) {
      result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
}

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const elements = [];
for (const match of html.matchAll(/<([a-z0-9-]+)([^>]*)\sid="([^"]+)"([^>]*)>/gi)) {
  const source = `${match[2]} ${match[4]}`;
  const element = new FakeElement(match[3], match[1].toUpperCase());
  const className = source.match(/class="([^"]*)"/);
  if (className) element.className = className[1];
  const value = source.match(/value="([^"]*)"/);
  if (value) element.value = value[1];
  if (/\shidden(?:\s|>|$)/i.test(source)) element.hidden = true;
  if (/\sdisabled(?:\s|>|$)/i.test(source)) element.disabled = true;
  for (const attribute of source.matchAll(/data-([a-z0-9-]+)="([^"]*)"/gi)) {
    element.dataset[dataKey(`data-${attribute[1]}`)] = attribute[2];
  }
  elements.push(element);
}
const byId = new Map(elements.map(element => [element.id, element]));

const documentListeners = new Map();
const documentStub = {
  activeElement: null,
  head: new FakeElement("head", "HEAD"),
  querySelectorAll(selector) {
    if (selector === "[id]") return elements;
    if (selector === "[data-preview-action]") return elements.filter(element => element.dataset.previewAction);
    return [];
  },
  createElement(tag) { return new FakeElement("", tag.toUpperCase()); },
  addEventListener(type, listener) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(listener);
  }
};

function keydown(key, init = {}) {
  const event = {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    preventDefault() { this.defaultPrevented = true; },
    ...init
  };
  for (const listener of documentListeners.get("keydown") || []) listener(event);
  return event;
}

const resizeListeners = [];
globalThis.document = documentStub;
globalThis.window = globalThis;
globalThis.window.addEventListener = (type, listener) => { if (type === "resize") resizeListeners.push(listener); };
globalThis.window.matchMedia = () => ({ matches: false });
globalThis.window.setTimeout = setTimeout;
const intervalCallbacks = [];
globalThis.window.setInterval = callback => { intervalCallbacks.push(callback); return intervalCallbacks.length; };
globalThis.localStorage = {
  values: new Map(),
  throwOnSet: false,
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) {
    if (this.throwOnSet) throw new Error("storage unavailable");
    this.values.set(key, value);
  }
};
globalThis.confirm = () => true;
globalThis.prompt = (_message, value) => value;

let fakePlayer = null;
class FakePlayer {
  constructor(_id, config) {
    this.events = config.events;
    this.duration = 100;
    this.currentTime = 0;
    this.rate = 1;
    this.state = -1;
    fakePlayer = this;
    queueMicrotask(() => this.events.onReady?.());
  }
  cueVideoById({ startSeconds = 0 }) {
    this.currentTime = startSeconds;
    this.state = 5;
    queueMicrotask(() => this.events.onStateChange?.({ data: 5 }));
  }
  getDuration() { return this.duration; }
  getCurrentTime() { return this.currentTime; }
  getAvailablePlaybackRates() { return [1, 1.5, 2]; }
  getPlayerState() { return this.state; }
  getPlaybackRate() { return this.rate; }
  setPlaybackRate(rate) { this.rate = rate; }
  seekTo(time) { this.currentTime = time; }
  playVideo() { this.state = 1; this.events.onStateChange?.({ data: 1 }); }
  pauseVideo() { this.state = 2; this.events.onStateChange?.({ data: 2 }); }
}
globalThis.YT = { Player: FakePlayer };

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const waitForStep = () => new Promise(resolve => setTimeout(resolve, 210));

await import("./app.js");
window.onYouTubeIframeAPIReady();
await tick();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await tick();

// Disable automatic Context here; Context has its own delayed-player smoke test.
byId.get("context-select").value = "0";
byId.get("context-select").dispatch("change");

assert.equal(byId.get("range-label").textContent, "0:00.000–1:40.000");
assert.equal(byId.get("current-label").textContent, "0:00.000");
assert.equal(byId.get("guide-panel").hidden, false, "Desktop Guide must remain present.");

// Direct placement, refinement, branch return, and recursive escape.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
assert.equal(byId.get("current-label").textContent, "0:50.000");
assert.match(byId.get("interval-label").textContent, /0:00\.000–0:50\.000/);

byId.get("refine-forward").click();
assert.equal(byId.get("current-label").textContent, "1:15.000");
assert.match(byId.get("resolution-label").textContent, /50s · 1 refinement/);

byId.get("return-action").click();
assert.equal(byId.get("current-label").textContent, "0:50.000");
assert.match(byId.get("resolution-label").textContent, /1m 40s · Range/);

byId.get("refine-backward").click();
assert.equal(byId.get("current-label").textContent, "0:25.000");
byId.get("reopen").click();
assert.equal(byId.get("current-label").textContent, "0:25.000");
assert.match(byId.get("resolution-label").textContent, /1m 40s · Range/);

// One-click Pin creation and directional Pin retrieval.
byId.get("pin-current").click();
assert.equal(byId.get("pins-list-count").textContent, "1");
assert.match(byId.get("status").textContent, /Pinned Current/);

keydown("ArrowRight");
await waitForStep();
assert.equal(byId.get("current-label").textContent, "0:35.000");
keydown("p");
assert.equal(byId.get("pins-list-count").textContent, "2");

keydown("ArrowLeft", { shiftKey: true });
assert.equal(byId.get("current-label").textContent, "0:25.000");
keydown("ArrowRight", { shiftKey: true });
assert.equal(byId.get("current-label").textContent, "0:35.000");

// Establish an Interval, retain it as a Section, and retrieve each endpoint.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
assert.match(byId.get("interval-label").textContent, /0:25\.000–0:50\.000/);
byId.get("interval-state").click();
assert.equal(byId.get("section-capture").hidden, false);
byId.get("section-label").value = "Middle quarter";
byId.get("section-label").dispatch("input");
byId.get("section-capture").dispatch("submit");
assert.equal(byId.get("sections-list-count").textContent, "1");
assert.equal(byId.get("guide-tab-sections")["aria-selected"], "true");

const sectionNodes = descendants(byId.get("sections-list"));
const sectionMain = sectionNodes.find(node => node.dataset.sectionGo);
const focusButton = sectionNodes.find(node => node.dataset.focusSection);
const endpoints = sectionNodes.filter(node => node.dataset.pinGo);
assert.ok(sectionMain && focusButton && endpoints.length === 2);

document.activeElement?.blur?.();
byId.get("sections-list").dispatch("click", { target: sectionMain });
assert.equal(byId.get("current-label").textContent, "0:37.500");
byId.get("sections-list").dispatch("click", { target: endpoints[0] });
assert.equal(byId.get("current-label").textContent, "0:25.000");
assert.match(byId.get("interval-label").textContent, /0:25\.000–0:37\.500/);

byId.get("sections-list").dispatch("click", { target: focusButton });
assert.equal(byId.get("range-label").textContent, "0:25.000–0:50.000");
assert.equal(byId.get("focused-label").textContent, "Middle quarter");

// Continue traverses Range once; Loop is the sole repetition operator.
byId.get("continue").click();
assert.equal(byId.get("continue-label").textContent, "Pause");
assert.equal(byId.get("continue")["aria-pressed"], "true");
fakePlayer.currentTime = 50;
intervalCallbacks[0]();
assert.equal(fakePlayer.currentTime, 50, "Continue must settle at Range End without wrapping.");
assert.equal(byId.get("continue-label").textContent, "Continue");
assert.equal(byId.get("continue")["aria-pressed"], "false");
assert.match(
  byId.get("interval-label").textContent,
  /0:25\.000–0:50\.000/,
  "One-pass Continue must retain its contiguous movement Interval."
);
assert.equal(
  byId.get("loop").disabled,
  false,
  "Loop must be available for the settled Continue Interval."
);

// Establish a reverse contiguous Interval before testing Loop independently.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 375 });
assert.equal(byId.get("current-label").textContent, "0:37.500");
assert.match(byId.get("interval-label").textContent, /0:37\.500–0:50\.000/);
assert.equal(byId.get("loop").disabled, false);

byId.get("loop").click();
assert.equal(byId.get("loop-label").textContent, "Stop Loop");
assert.equal(byId.get("continue-label").textContent, "Pause", "Continue is the universal observation Pause control.");
fakePlayer.currentTime = 37.5;
intervalCallbacks[0]();
assert.equal(fakePlayer.currentTime, 37.5, "Loop must restore the active Interval start.");
byId.get("loop").click();
assert.equal(byId.get("loop-label").textContent, "Loop");

assert.equal(Number(byId.get("range-start-handle")["aria-valuemax"]), 49.75);
assert.equal(Number(byId.get("range-end-handle")["aria-valuemin"]), 25.25);

byId.get("leave-section").click();
assert.equal(byId.get("range-label").textContent, "0:00.000–1:40.000");
keydown("s");
assert.equal(byId.get("range-label").textContent, "0:25.000–0:50.000", "S must Return to the preceding complete state.");

// The spatial keyboard cluster mirrors the central navigation deck.
const beforeForward = byId.get("current-label").textContent;
keydown("d");
assert.notEqual(byId.get("current-label").textContent, beforeForward);
keydown("s");
assert.equal(byId.get("current-label").textContent, beforeForward);
keydown("g");
assert.equal(byId.get("guide-toggle")["aria-expanded"], "true");

const beforeRepeatedPin = byId.get("current-label").textContent;
keydown("ArrowRight", { shiftKey: true, repeat: true });
assert.equal(byId.get("current-label").textContent, beforeRepeatedPin, "Held Shift+Arrow must not race through Pins.");
keydown("ArrowRight", { ctrlKey: true });
assert.equal(byId.get("current-label").textContent, beforeRepeatedPin, "Modified Arrow keys must remain available to the platform.");
keydown("ArrowRight", { ctrlKey: true, shiftKey: true });
assert.equal(byId.get("current-label").textContent, beforeRepeatedPin, "Modified Shift+Arrow must not navigate Pins.");

const returnMetaBeforeNetZeroStep = byId.get("return-meta").textContent;
keydown("ArrowRight");
keydown("ArrowLeft");
await waitForStep();
assert.equal(byId.get("current-label").textContent, beforeRepeatedPin, "Opposed rapid Steps must return to the original Current.");
assert.equal(
  byId.get("return-meta").textContent,
  returnMetaBeforeNetZeroStep,
  "A net-zero Step gesture must not add a phantom Return state."
);

window.matchMedia = () => ({ matches: true });
byId.get("guide-toggle").click();
assert.equal(byId.get("guide-panel").classList.contains("is-open"), true, "Compact Guide must open as a sheet.");
assert.equal(byId.get("guide-scrim").hidden, false);
assert.equal(byId.get("reader-column").inert, true);
assert.equal(byId.get("load-bar").inert, true);
const beforeCompactGuideCommand = byId.get("current-label").textContent;
keydown("d");
assert.equal(byId.get("current-label").textContent, beforeCompactGuideCommand, "A modal compact Guide must suspend background reader hotkeys.");
const helpBeforeModalKey = byId.get("shortcut-help").open;
keydown("?");
assert.equal(byId.get("shortcut-help").open, helpBeforeModalKey, "A compact Guide must own help keys instead of opening content behind its modal sheet.");
byId.get("continue").click();
keydown("Escape");
assert.equal(byId.get("guide-panel").classList.contains("is-open"), false, "Escape closes the topmost Guide sheet first.");
assert.equal(byId.get("reader-column").inert, false);
assert.equal(byId.get("load-bar").inert, false);
assert.equal(byId.get("continue-label").textContent, "Pause", "Closing the Guide must not also stop observation.");
keydown("Escape");
assert.equal(byId.get("continue-label").textContent, "Continue", "A second Escape stops the remaining observation.");
assert.equal(byId.get("guide-scrim").hidden, true);

// Selecting retained structure from the compact Guide closes the sheet and
// returns keyboard focus to the control that opened it.
byId.get("pins-access").focus();
byId.get("pins-access").click();
const mobilePinMain = descendants(byId.get("pins-list")).find(node => node.dataset.pinGo);
assert.ok(mobilePinMain);
byId.get("pins-list").dispatch("click", { target: mobilePinMain });
assert.equal(byId.get("guide-panel").classList.contains("is-open"), false);
assert.equal(document.activeElement, byId.get("pins-access"));

// Breakpoint state must re-synchronize, and Guide edits use the accessible dialog rather than prompts.
window.matchMedia = () => ({ matches: false });
for (const listener of resizeListeners) listener();
const renamePinButton = descendants(byId.get("pins-list")).find(node => node.dataset.renamePin);
assert.ok(renamePinButton);
byId.get("pins-list").dispatch("click", { target: renamePinButton });
assert.equal(byId.get("guide-dialog").hidden, false);
const beforeDialogCommand = byId.get("current-label").textContent;
byId.get("guide-dialog-cancel").focus();
keydown("d");
assert.equal(byId.get("current-label").textContent, beforeDialogCommand, "Guide dialogs must own the keyboard and block background commands.");
byId.get("guide-dialog-input").value = "Renamed Pin";
byId.get("guide-dialog-form").dispatch("submit");
assert.equal(byId.get("guide-dialog").hidden, true);
assert.ok(descendants(byId.get("pins-list")).some(node => node.textContent === "Renamed Pin"));
assert.equal(
  document.activeElement?.dataset?.renamePin,
  renamePinButton.dataset.renamePin,
  "Renaming retained structure must restore focus to its recreated action."
);

// Pointer cancellation restores the exact Range without adding an accidental edit.
const rangeBeforeCancel = byId.get("range-label").textContent;
byId.get("range-start-handle").dispatch("pointerdown", { target: byId.get("range-start-handle"), clientX: 250 });
byId.get("timeline").dispatch("pointermove", { target: byId.get("timeline"), clientX: 300 });
assert.notEqual(byId.get("range-label").textContent, rangeBeforeCancel);
byId.get("timeline").dispatch("pointercancel", { target: byId.get("timeline") });
assert.equal(byId.get("range-label").textContent, rangeBeforeCancel);

const currentBeforeRoundTripDrag = byId.get("current-label").textContent;
const focusedBeforeRoundTripDrag = byId.get("focused-label").textContent;
const returnBeforeRoundTripDrag = byId.get("return-meta").textContent;
byId.get("range-start-handle").dispatch("pointerdown", { target: byId.get("range-start-handle"), clientX: 250 });
byId.get("timeline").dispatch("pointermove", { target: byId.get("timeline"), clientX: 450 });
byId.get("timeline").dispatch("pointermove", { target: byId.get("timeline"), clientX: 250 });
byId.get("timeline").dispatch("pointerup", { target: byId.get("timeline") });
assert.equal(byId.get("range-label").textContent, rangeBeforeCancel, "Returning a Range handle to its origin must restore the exact Range.");
assert.equal(byId.get("current-label").textContent, currentBeforeRoundTripDrag, "Range preview must be path-independent for Current.");
assert.equal(byId.get("focused-label").textContent, focusedBeforeRoundTripDrag, "A net-zero Range gesture must preserve Focus.");
assert.equal(byId.get("return-meta").textContent, returnBeforeRoundTripDrag, "A net-zero Range gesture must not add history.");

// A paused native-player scrub becomes a semantic move after it settles.
fakePlayer.state = 2;
fakePlayer.currentTime = 45;
intervalCallbacks[0]();
await new Promise(resolve => setTimeout(resolve, 260));
assert.equal(byId.get("current-label").textContent, "0:45.000");
assert.match(byId.get("status").textContent, /YouTube’s position/i);

// Native scrubbing cannot escape an active Range.
fakePlayer.currentTime = 90;
intervalCallbacks[0]();
await new Promise(resolve => setTimeout(resolve, 260));
assert.equal(byId.get("current-label").textContent, "0:50.000");
assert.equal(fakePlayer.currentTime, 50);

// Scrub + native start commits the direct placement before Continue, so Return
// can recover the exact pre-scrub state rather than preserving stale Resolution.
fakePlayer.currentTime = 40;
fakePlayer.playVideo();
await tick();
assert.equal(byId.get("current-label").textContent, "0:40.000");
assert.match(byId.get("resolution-label").textContent, /20s · Movement scale/);
byId.get("continue").click();
keydown("s");
assert.equal(byId.get("current-label").textContent, "0:50.000");

// A failed persistence write must not be overwritten by a misleading success status.
localStorage.throwOnSet = true;
const originalWarn = console.warn;
console.warn = () => {};
byId.get("pin-current").click();
console.warn = originalWarn;
assert.match(byId.get("status").textContent, /remains available until this page is closed/i);
assert.equal(byId.get("status").classList.contains("error"), true);
localStorage.throwOnSet = false;

console.log("Interaction smoke passed: direct placement, Refine/Reopen/Return, Step, Pins, Sections, Continue, Loop, Guide/dialog access, Range cancellation, native Go reconciliation, and spatial hotkeys.");
