import { readFileSync } from "node:fs";

class FakeClassList {
  add() {}
  remove() {}
  toggle() {}
  contains() { return false; }
}

class FakeElement {
  constructor(id = "", tagName = "DIV") {
    this.id = id;
    this.tagName = tagName;
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
    this.children = [];
    this.options = [];
    this.selectedOptions = [];
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.clientWidth = 900;
  }
  addEventListener() {}
  appendChild(child) { this.children.push(child); if (this.tagName === "SELECT") this.options.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; if (this.tagName === "SELECT") this.options = [...children]; }
  setAttribute() {}
  removeAttribute() {}
  focus() { document.activeElement = this; }
  blur() { document.activeElement = null; }
  click() {}
  closest() { return null; }
  contains() { return false; }
  getBoundingClientRect() { return { left: 0, width: 900 }; }
}

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const elements = [];
for (const match of html.matchAll(/<([a-z0-9-]+)[^>]*\sid="([^"]+)"[^>]*>/gi)) {
  const element = new FakeElement(match[2], match[1].toUpperCase());
  const preview = match[0].match(/data-preview-action="([^"]+)"/);
  if (preview) element.dataset.previewAction = preview[1];
  const value = match[0].match(/value="([^"]*)"/);
  if (value) element.value = value[1];
  elements.push(element);
}

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
globalThis.window.setTimeout = setTimeout;
globalThis.window.setInterval = () => 1;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.confirm = () => true;
globalThis.prompt = () => null;

await import("./app.js");
console.log("Startup smoke passed.");
