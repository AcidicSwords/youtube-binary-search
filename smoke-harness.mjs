import { readFileSync } from "node:fs";

function dataKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

export class FakeClassList {
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

export class FakeElement {
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
    this.checked = false;
    this.required = false;
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.clientWidth = 1000;
    this.title = "";
    this.tabIndex = 0;
    this.inert = false;
    this.offsetParent = {};
    this.isConnected = true;
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
      buttons: init.buttons ?? 0,
      key: init.key || "",
      code: init.code || "",
      ctrlKey: Boolean(init.ctrlKey),
      metaKey: Boolean(init.metaKey),
      altKey: Boolean(init.altKey),
      shiftKey: Boolean(init.shiftKey),
      repeat: Boolean(init.repeat),
      relatedTarget: init.relatedTarget || null,
      defaultPrevented: false,
      propagationStopped: false,
      immediatePropagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() {
        this.immediatePropagationStopped = true;
        this.propagationStopped = true;
      },
      ...init
    };
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
      if (event.immediatePropagationStopped) break;
    }
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
  // Focus and blur must actually notify. A pressed control focuses itself, and
  // interface state is legitimately armed from focus, so a harness that moved
  // activeElement silently could not observe anything a real press causes
  // through that path.
  focus() {
    const previous = globalThis.document.activeElement;
    if (previous === this) return;
    globalThis.document.activeElement = this;
    previous?.dispatch?.("blur", { target: previous });
    this.dispatch("focus", { target: this });
  }
  blur() {
    if (globalThis.document.activeElement !== this) return;
    globalThis.document.activeElement = null;
    this.dispatch("blur", { target: this });
  }
  scrollIntoView() {}
  setPointerCapture() {}
  showModal() { this.open = true; this.hidden = false; }
  close() { this.open = false; this.hidden = true; }
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
    const dataValue = selector.match(/^\[data-([a-z0-9-]+)="([^"]*)"\]$/i);
    if (dataValue) {
      const key = dataKey(`data-${dataValue[1]}`);
      return nodes.filter(node => node.dataset[key] === dataValue[2]);
    }
    const dataPresence = selector.match(/^\[data-([a-z0-9-]+)\]$/i);
    if (dataPresence) {
      const key = dataKey(`data-${dataPresence[1]}`);
      return nodes.filter(node => node.dataset[key] !== undefined);
    }
    if (selector.startsWith(".")) {
      return nodes.filter(node => node.classList.contains(selector.slice(1)));
    }
    if (/^[a-z]+$/i.test(selector)) {
      return nodes.filter(node => node.tagName === selector.toUpperCase());
    }
    if (selector.includes("button:not([disabled])")) {
      return nodes.filter(node => ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(node.tagName) && !node.disabled);
    }
    return [];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  // Tests that depend on where an element sits, not merely how wide it is, may
  // set `rect` directly.
  getBoundingClientRect() {
    return this.rect || { left: 0, width: this.clientWidth || 1000 };
  }
}

export function descendants(root) {
  const result = [];
  const visit = node => {
    for (const child of node?.children || []) {
      result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
}

function addOption(select, value, text = value) {
  const option = new FakeElement("", "OPTION");
  option.value = String(value);
  option.textContent = text;
  select.appendChild(option);
  return option;
}

export function createSmokeEnvironment({ duration = 100, compact = false, deferredPlacement = false } = {}) {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const elements = [];
  for (const match of html.matchAll(/<([a-z0-9-]+)([^>]*)\sid="([^"]+)"([^>]*)>/gi)) {
    const source = `${match[2]} ${match[4]}`;
    const element = new FakeElement(match[3], match[1].toUpperCase());
    const className = source.match(/class="([^"]*)"/);
    if (className) element.className = className[1];
    const value = source.match(/value="([^"]*)"/);
    if (value) element.value = value[1];
    if (/\shidden(?:\s|$)/i.test(source)) element.hidden = true;
    if (/\sdisabled(?:\s|$)/i.test(source)) element.disabled = true;
    if (/\schecked(?:\s|$)/i.test(source)) element.checked = true;
    for (const attribute of source.matchAll(/data-([a-z0-9-]+)="([^"]*)"/gi)) {
      element.dataset[dataKey(`data-${attribute[1]}`)] = attribute[2];
    }
    elements.push(element);
  }
  const byId = new Map(elements.map(element => [element.id, element]));

  byId.get("context-seconds").value = "5";
  byId.get("section-source").value = "interval";
  addOption(byId.get("section-source"), "interval", "Active Span");
  addOption(byId.get("section-source"), "panorama-span", "Panorama Window");
  addOption(byId.get("panorama-cycle-rate"), "0.25", "0.75\u00d7 / 1.25\u00d7");

  const documentListeners = new Map();
  const body = new FakeElement("body", "BODY");
  const documentStub = {
    activeElement: null,
    hidden: false,
    head: new FakeElement("head", "HEAD"),
    body,
    getElementById(id) { return byId.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === "[id]") return elements;
      if (selector === "[data-preview-action]") return elements.filter(element => element.dataset.previewAction);
      const dataSelector = selector.match(/^\[data-([a-z0-9-]+)\]$/i);
      if (dataSelector) {
        const key = dataKey(`data-${dataSelector[1]}`);
        return elements.filter(element => element.dataset[key] !== undefined);
      }
      return [];
    },
    createElement(tag) { return new FakeElement("", tag.toUpperCase()); },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    }
  };

  const windowListeners = new Map();
  const intervalCallbacks = [];
  const localStorage = {
    values: new Map(),
    throwOnGet: false,
    throwOnSet: false,
    getItem(key) {
      if (this.throwOnGet) throw new Error("storage unavailable");
      return this.values.get(key) ?? null;
    },
    setItem(key, value) {
      if (this.throwOnSet) throw new Error("storage unavailable");
      this.values.set(key, value);
    }
  };

  globalThis.document = documentStub;
  globalThis.window = globalThis;
  globalThis.window.addEventListener = (type, listener) => {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(listener);
  };
  globalThis.window.matchMedia = () => ({ matches: compact });
  globalThis.window.setTimeout = setTimeout;
  globalThis.window.clearTimeout = clearTimeout;
  globalThis.window.setInterval = callback => { intervalCallbacks.push(callback); return intervalCallbacks.length; };
  globalThis.window.clearInterval = () => {};
  globalThis.localStorage = localStorage;
  globalThis.confirm = () => true;
  globalThis.prompt = (_message, value) => value;
  globalThis.location = { origin: "https://example.test" };

  const players = new Map();
  class FakePlayer {
    constructor(id, config) {
      this.id = id;
      this.events = config.events;
      this.playerVars = config.playerVars;
      this.duration = duration;
      this.videoId = null;
      this.currentTime = 0;
      this.rate = 1;
      this.state = -1;
      this.commands = [];
      this.pendingPlacement = null;
      this.deferNextPlacement = deferredPlacement;
      this.deferNextPlayState = false;
      this.pendingPlayState = false;
      this.iframe = new FakeElement(`${id}-iframe`, "IFRAME");
      this.createdWhilePanoramaOff = byId.get("panorama")?.classList?.contains("panorama-off") === true;
      players.set(id, this);
      queueMicrotask(() => this.events.onReady?.({ target: this }));
    }
    emitState(data) { queueMicrotask(() => this.events.onStateChange?.({ data })); }
    emitRate(rate) { queueMicrotask(() => this.events.onPlaybackRateChange?.({ data: rate })); }
    cueVideoById({ videoId = null, startSeconds = 0 }) {
      this.commands.push(["chapter", startSeconds]);
      this.videoId = videoId;
      this.currentTime = startSeconds;
      this.state = 5;
      this.emitState(5);
    }
    getDuration() { return this.duration; }
    getCurrentTime() { return this.currentTime; }
    getAvailablePlaybackRates() { return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; }
    getPlayerState() { return this.state; }
    getPlaybackRate() { return this.rate; }
    getVideoData() { return { video_id: this.videoId }; }
    getIframe() { return this.iframe; }
    setPlaybackRate(rate) {
      this.commands.push(["rate", rate]);
      this.rate = rate;
      this.emitRate(rate);
    }
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
    playVideo() {
      this.commands.push(["play"]);
      if (this.deferNextPlayState) {
        this.deferNextPlayState = false;
        this.pendingPlayState = true;
        return;
      }
      this.state = 1;
      this.emitState(1);
    }
    applyPendingPlayState() {
      if (!this.pendingPlayState) return;
      this.pendingPlayState = false;
      this.state = 1;
      this.emitState(1);
    }
    pauseVideo() {
      this.commands.push(["pause"]);
      this.state = 2;
      this.emitState(2);
    }
    mute() { this.commands.push(["mute"]); }
    unMute() { this.commands.push(["unmute"]); }
    blockAutoplay() { queueMicrotask(() => this.events.onAutoplayBlocked?.({ target: this })); }
  }
  globalThis.YT = { Player: FakePlayer };

  const delay = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
  const flush = async (turns = 3) => {
    for (let index = 0; index < turns; index += 1) await delay(0);
  };
  const poll = async () => {
    if (!intervalCallbacks[0]) throw new Error("Player poll was not installed.");
    intervalCallbacks[0]();
    await flush(2);
  };
  const dispatchDocument = (type, init = {}) => {
    const event = {
      type,
      key: init.key || "",
      code: init.code || "",
      ctrlKey: Boolean(init.ctrlKey),
      metaKey: Boolean(init.metaKey),
      altKey: Boolean(init.altKey),
      shiftKey: Boolean(init.shiftKey),
      repeat: Boolean(init.repeat),
      target: init.target || documentStub,
      defaultPrevented: false,
      propagationStopped: false,
      immediatePropagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() {
        this.immediatePropagationStopped = true;
        this.propagationStopped = true;
      },
      ...init
    };
    for (const listener of documentListeners.get(type) || []) {
      listener(event);
      if (event.immediatePropagationStopped) break;
    }
    return event;
  };

  return {
    html,
    elements,
    byId,
    document: documentStub,
    localStorage,
    players,
    intervalCallbacks,
    windowListeners,
    delay,
    flush,
    poll,
    dispatchDocument,
    currentText: () => byId.get("pin-current-position").textContent,
    center: () => players.get("player"),
    tail: () => players.get("player-tail"),
    lead: () => players.get("player-lead")
  };
}
