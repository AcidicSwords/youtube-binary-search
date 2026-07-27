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
      preventDefault() {},
      stopPropagation() {},
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
  getBoundingClientRect() { return { left: 0, width: 1000 }; }
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
  for (const attribute of source.matchAll(/data-([a-z0-9-]+)="([^"]*)"/gi)) {
    element.dataset[dataKey(`data-${attribute[1]}`)] = attribute[2];
  }
  elements.push(element);
}
const byId = new Map(elements.map(element => [element.id, element]));

const documentStub = {
  activeElement: null,
  head: new FakeElement("head", "HEAD"),
  querySelectorAll(selector) {
    if (selector === "[id]") return elements;
    if (selector === "[data-preview-action]") return elements.filter(element => element.dataset.previewAction);
    return [];
  },
  createElement(tag) { return new FakeElement("", tag.toUpperCase()); },
  addEventListener() {}
};

globalThis.document = documentStub;
globalThis.window = globalThis;
globalThis.window.addEventListener = () => {};
globalThis.window.matchMedia = () => ({ matches: false });
globalThis.window.setTimeout = setTimeout;
const intervalCallbacks = [];
globalThis.window.setInterval = callback => { intervalCallbacks.push(callback); return intervalCallbacks.length; };
globalThis.localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, value); }
};
globalThis.confirm = () => true;
globalThis.prompt = (_message, value) => value;

const delay = () => new Promise(resolve => setTimeout(resolve, 5));
let fakePlayer = null;
class DelayedPlayer {
  constructor(_id, config) {
    this.events = config.events;
    this.duration = 100;
    this.currentTime = 0;
    this.rate = 1;
    this.state = -1;
    this.commands = [];
    this.deferNextPlacement = false;
    this.pendingPlacement = null;
    fakePlayer = this;
    setTimeout(() => this.events.onReady?.(), 0);
  }
  emit(data) { setTimeout(() => this.events.onStateChange?.({ data }), 0); }
  cueVideoById({ startSeconds = 0 }) {
    this.commands.push(["cue", startSeconds]);
    this.currentTime = startSeconds;
    this.state = 5;
    this.emit(5);
  }
  getDuration() { return this.duration; }
  getCurrentTime() { return this.currentTime; }
  getAvailablePlaybackRates() { return [1, 1.5, 2]; }
  getPlayerState() { return this.state; }
  getPlaybackRate() { return this.rate; }
  setPlaybackRate(rate) { this.commands.push(["rate", rate]); this.rate = rate; }
  seekTo(time) {
    this.commands.push(["place", time]);
    if (this.deferNextPlacement) {
      this.deferNextPlacement = false;
      this.pendingPlacement = time;
    } else {
      this.currentTime = time;
    }
  }
  applyPendingPlacement() {
    if (this.pendingPlacement === null) return;
    this.currentTime = this.pendingPlacement;
    this.pendingPlacement = null;
  }
  playVideo() { this.commands.push(["play"]); this.state = 1; this.emit(1); }
  pauseVideo() { this.commands.push(["pause"]); this.state = 2; this.emit(2); }
}
globalThis.YT = { Player: DelayedPlayer };

await import("./app.js");
window.onYouTubeIframeAPIReady();
await delay();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await delay();
await delay();

fakePlayer.deferNextPlacement = true;
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
assert.equal(byId.get("current-label").textContent, "0:50.000", "Direct placement must commit semantic Current immediately.");
assert.equal(fakePlayer.currentTime, 0, "A delayed player placement may temporarily leave the physical Cursor behind.");
assert.equal(fakePlayer.pendingPlacement, 49, "Five-second Context should request one second of pre-roll.");
await delay();
assert.equal(byId.get("context-state").textContent, "0:49.000–0:54.000");
assert.equal(byId.get("context-label").textContent, "Stop Context");
assert.equal(byId.get("current-marker").style.left, "50%", "Semantic Current must remain fixed during Context.");
assert.equal(byId.get("cursor-marker").hidden, false);

intervalCallbacks[0]();
await delay();
assert.notEqual(byId.get("context-state").textContent, "5 s", "Context must not terminate against a stale pre-placement Cursor.");
fakePlayer.applyPendingPlacement();
intervalCallbacks[0]();
fakePlayer.currentTime = 54;
intervalCallbacks[0]();
await delay();
assert.equal(fakePlayer.currentTime, 50, "Context must return the physical playhead to semantic Current.");
assert.equal(byId.get("current-label").textContent, "0:50.000");
assert.equal(byId.get("cursor-marker").hidden, true, "Observation Cursor collapses back into Current when Context ends.");
assert.match(byId.get("interval-label").textContent, /0:00\.000–0:50\.000/, "Context must preserve the movement Interval.");

byId.get("return-action").click();
await delay();
assert.equal(byId.get("current-label").textContent, "0:00.000", "Context must not add its own Return entry.");

byId.get("context-select").value = "5";
byId.get("context-select").dispatch("change");
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 750 });
assert.equal(byId.get("current-label").textContent, "1:15.000");
assert.equal(fakePlayer.currentTime, 74, "A new move must replace the previous Context without returning to the old anchor.");
await delay();
await delay();
assert.equal(byId.get("context-state").textContent, "1:14.000–1:19.000", "Delayed internal PAUSED events must not stop the replacement Context.");

const playsBeforeOff = fakePlayer.commands.filter(command => command[0] === "play").length;
byId.get("context-select").value = "0";
byId.get("context-select").dispatch("change");
await delay();
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
await delay();
const playsAfterOff = fakePlayer.commands.filter(command => command[0] === "play").length;
assert.equal(playsAfterOff, playsBeforeOff, "Context Off must leave direct moves paused at their destination.");
assert.equal(fakePlayer.currentTime, 50);

// Loop startup must tolerate a player that reports the old Cursor until its
// initial placement is actually applied. It may retry after the grace period,
// but it must not flood the adapter or mistake stale position for a completed loop.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 750 });
assert.match(byId.get("interval-label").textContent, /0:25\.000–1:15\.000/);
fakePlayer.deferNextPlacement = true;
const placementsBeforeDelayedLoop = fakePlayer.commands.filter(command => command[0] === "place").length;
byId.get("loop").click();
await delay();
assert.equal(fakePlayer.pendingPlacement, 25);
intervalCallbacks[0]();
assert.equal(
  fakePlayer.commands.filter(command => command[0] === "place").length,
  placementsBeforeDelayedLoop + 1,
  "A stale pre-placement Cursor must not cause immediate repeated Loop placements."
);
fakePlayer.applyPendingPlacement();
intervalCallbacks[0]();
fakePlayer.currentTime = 75;
intervalCallbacks[0]();
assert.equal(fakePlayer.currentTime, 25, "A Loop that entered its Interval must restart at its beginning.");
byId.get("loop").click();
await delay();

// A user pause during transport startup owns the resulting state even if the
// adapter's PLAYING and PAUSED events arrive asynchronously.
byId.get("continue").click();
fakePlayer.pauseVideo();
await delay();
await delay();
assert.equal(byId.get("continue-label").textContent, "Continue");
assert.match(byId.get("status").textContent, /Continue paused/i);

console.log("Context smoke passed: automatic observation, restoration, interruption, Return isolation, Off preference, delayed Loop startup, and startup Pause.");
