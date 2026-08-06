// The real browser, with a deterministic media adapter.
//
// Every other suite runs against a DOM-free stand-in that returns fixed
// geometry: `clientWidth` is 1000 and `getBoundingClientRect()` returns exactly
// that. It proves text, attributes, arithmetic and event routing, and it is
// structurally blind to everything a stylesheet decides — whether a control is
// actually where it is drawn, whether one element covers another, whether focus
// survives a rebuild, whether a key reaches the handler that owns it.
//
// This runs the page Chromium renders. The only substitution is the media
// adapter: `window.YT` is installed before the module loads, so the app takes
// its own "API already present" branch and never reaches the network. Nothing
// about layout, focus, hit-testing or event dispatch is faked.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
// Where Chromium is depends on who installed it. A preinstalled browser is used
// when present; otherwise playwright-core resolves its own, which is what a
// `playwright install chromium` in CI provides.
const CHROME = process.env.VIDEO_CARTOGRAPHY_CHROMIUM
  || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]
    .find(path => existsSync(path))
  || undefined;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml"
};

export const SOURCE_DURATION = 100;

function serve() {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(request.url.split("?")[0]));
    const file = join(ROOT, path === "/" ? "index.html" : path);
    if (!file.startsWith(ROOT)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => resolve({
      server,
      origin: `http://127.0.0.1:${server.address().port}`
    }));
  });
}

// Installed before any page script runs. The app checks for `window.YT` and,
// finding it, initialises directly instead of appending the remote API script.
function installFakeMediaApi(duration) {
  const players = {};
  class FakePlayer {
    constructor(id, config) {
      this.id = id;
      this.events = config.events || {};
      this.playerVars = config.playerVars || {};
      this.duration = duration;
      this.videoId = null;
      this.currentTime = 0;
      this.rate = 1;
      this.state = -1;
      this.commands = [];
      // The real API replaces the target element with an iframe. Tests need a
      // real node of real size in the real layout, so one is created here --
      // an iframe with no src, which loads nothing.
      const host = document.getElementById(id);
      this.iframe = document.createElement("iframe");
      this.iframe.setAttribute("title", `${id} media surface`);
      this.iframe.style.width = "100%";
      this.iframe.style.height = "100%";
      this.iframe.style.border = "0";
      host?.replaceChildren(this.iframe);
      players[id] = this;
      window.__players = players;
      queueMicrotask(() => this.events.onReady?.({ target: this }));
    }
    emitState(data) { queueMicrotask(() => this.events.onStateChange?.({ data })); }
    emitRate(rate) { queueMicrotask(() => this.events.onPlaybackRateChange?.({ data: rate })); }
    cueVideoById({ videoId = null, startSeconds = 0 } = {}) {
      this.videoId = videoId;
      this.commands.push(["chapter", startSeconds]);
      this.currentTime = startSeconds;
      this.state = 5;
      this.emitState(5);
    }
    loadVideoById({ videoId = null, startSeconds = 0 } = {}) {
      this.cueVideoById({ videoId, startSeconds });
    }
    getDuration() { return this.duration; }
    getCurrentTime() { return this.currentTime; }
    getAvailablePlaybackRates() { return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; }
    getPlayerState() { return this.state; }
    getPlaybackRate() { return this.rate; }
    getVideoData() { return { video_id: this.videoId }; }
    getIframe() { return this.iframe; }
    setPlaybackRate(rate) { this.commands.push(["rate", rate]); this.rate = rate; this.emitRate(rate); }
    seekTo(time) { this.commands.push(["place", time]); this.currentTime = time; }
    playVideo() { this.commands.push(["play"]); this.state = 1; this.emitState(1); }
    pauseVideo() { this.commands.push(["pause"]); this.state = 2; this.emitState(2); }
    mute() { this.commands.push(["mute"]); }
    unMute() { this.commands.push(["unmute"]); }
    destroy() { this.commands.push(["destroy"]); }
  }
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
}

export async function openApp({ width = 1440, height = 1000, reducedMotion } = {}) {
  const { server, origin } = await serve();
  const browser = await chromium.launch({
    ...(CHROME ? { executablePath: CHROME } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion,
    hasTouch: false
  });
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", error => failures.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") failures.push(message.text());
  });

  await page.addInitScript(installFakeMediaApi, SOURCE_DURATION);
  await page.goto(`${origin}/index.html`);
  await page.waitForFunction(() => document.getElementById("status")?.textContent?.includes("ready"));

  const close = async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  };
  return { page, close, failures, origin };
}

export async function loadVideo(page, url = "https://youtu.be/dQw4w9WgXcQ") {
  await page.fill("#youtube-url", url);
  await page.click("#load-video");
  await page.waitForFunction(
    () => document.getElementById("duration-time")?.textContent?.trim() === "1:40"
  );
  // Context observation would otherwise start after every traversal and make
  // timing the subject of tests that are about something else. It is set
  // directly rather than through the control, which lives in the State & Settings
  // panel and is genuinely not visible while the rail is showing Guide -- a
  // fact the DOM-free harness cannot represent and these tests should not
  // work around by opening panels they are not testing.
  await page.evaluate(() => {
    const field = document.getElementById("context-duration");
    field.value = "0";
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Everything below asks the browser a question the DOM-free harness cannot.

// Is the element the one that actually receives a press at its own centre?
export async function hitTestSelf(page, selector) {
  return page.$eval(selector, element => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return "zero-size";
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    if (!hit) return "nothing";
    return element === hit || element.contains(hit) || hit.contains(element)
      ? "self"
      : `covered-by:${hit.id || hit.className || hit.tagName}`;
  });
}

export async function boxOf(page, selector) {
  return page.$eval(selector, element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

// The substituted adapter's own controls. Its clock does not run on its own --
// nothing here decodes video -- so a test that needs to watch a window play
// through advances the clock itself, which is exactly the reading the poll takes
// from a real player. The command log is the other half: it says what the app
// asked the adapter to do, which is the only way to tell a retargeted window
// from a torn-down and rebuilt one.
export async function mediaClockTo(page, time) {
  await page.evaluate(value => {
    Object.values(window.__players)[0].currentTime = value;
  }, time);
}

export async function mediaCommands(page, from = 0) {
  return page.evaluate(index =>
    Object.values(window.__players)[0].commands.slice(index), from);
}

export async function mediaCommandCount(page) {
  return page.evaluate(() => Object.values(window.__players)[0].commands.length);
}

export async function mediaIsPlaying(page) {
  return page.evaluate(() => Object.values(window.__players)[0].state === 1);
}

export async function activeElementId(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return null;
    return active.id || active.getAttribute("data-nudge-target") || active.tagName;
  });
}
