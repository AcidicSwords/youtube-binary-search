import assert from "node:assert/strict";
import { createSmokeEnvironment } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, dispatchDocument, currentText } = env;

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await flush(5);
await poll();
await flush(3);

byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");
for (const clientX of [250, 500]) {
  byId.get("timeline").dispatch("click", {
    target: byId.get("timeline"),
    clientX
  });
  await flush();
}
assert.equal(currentText(), "Current 0:50");
assert.match(byId.get("section-window").textContent, /0:25–0:50/);

const center = env.center();
const tail = env.tail();
const lead = env.lead();
byId.get("center-transport-surface").click();
await flush();

center.currentTime = 58;
tail.currentTime = 54;
lead.currentTime = 66;
await poll();

assert.equal(byId.get("interval-fill").dataset.live, "true");
assert.equal(byId.get("resolution-start-marker").dataset.live, "true");
assert.equal(byId.get("resolution-end-marker").dataset.live, "true");
assert.equal(
  currentText(),
  "Current 0:50",
  "Live playback projection must not commit semantic Current before pause."
);

const pausesBeforeSpace = {
  center: center.commands.filter(command => command[0] === "pause").length,
  tail: tail.commands.filter(command => command[0] === "pause").length,
  lead: lead.commands.filter(command => command[0] === "pause").length
};
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
await poll();

assert.equal(currentText(), "Current 0:58");
assert.match(byId.get("section-window").textContent, /0:25–0:58/);
assert.equal(byId.get("interval-fill").dataset.live, "false");
assert.equal(
  center.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.center + 1
);
assert.equal(
  tail.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.tail + 1
);
assert.equal(
  lead.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.lead + 1
);

// Focus turns the Working Interval into the sole playback loop operand.
byId.get("focus-toggle").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:25–0:58");
assert.equal(byId.get("focus-toggle-label").textContent, "Unfocus");

byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:25");

byId.get("center-transport-surface").click();
await flush();
assert.equal(center.state, 1);
center.currentTime = 25;
await poll();

const historyBeforeWrap = byId.get("return-meta").textContent;
const placesBeforeWrap = {
  tail: tail.commands.filter(command => command[0] === "place").length,
  lead: lead.commands.filter(command => command[0] === "place").length
};
center.currentTime = 58;
await poll();

assert.equal(center.currentTime, 25, "Proper Range playback must wrap to Range start.");
assert.equal(currentText(), "Current 0:25", "A Range wrap must not commit Current.");
assert.match(byId.get("section-window").textContent, /0:25–0:58/);
assert.equal(byId.get("return-meta").textContent, historyBeforeWrap, "A wrap must create no Undo entry.");
assert.equal(
  tail.commands.filter(command => command[0] === "place").length,
  placesBeforeWrap.tail,
  "Tail has no backward extent at Range start and must not be placed outside Range."
);
assert.equal(
  lead.commands.filter(command => command[0] === "place").length,
  placesBeforeWrap.lead + 1,
  "A Range wrap must rebase Lead exactly once."
);

const placesBeforeEnded = {
  tail: tail.commands.filter(command => command[0] === "place").length,
  lead: lead.commands.filter(command => command[0] === "place").length
};
center.currentTime = 58;
center.emitState(0);
await flush();
assert.equal(center.currentTime, 25, "YouTube ENDED must use the same Range-wrap owner.");
assert.equal(
  tail.commands.filter(command => command[0] === "place").length,
  placesBeforeEnded.tail
);
assert.equal(
  lead.commands.filter(command => command[0] === "place").length,
  placesBeforeEnded.lead + 1
);

// Stop inside the focused Range, then Unfocus. The Range stack restores the
// full video without changing the source-contiguous playback settlement.
center.currentTime = 30;
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(currentText(), "Current 0:30");
byId.get("focus-toggle").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:00–1:40");

// Full-video playback has no internal Range wrap and settles at source end.
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
center.currentTime = 100;
center.emitState(0);
await flush();
assert.equal(center.currentTime, 100);
assert.equal(currentText(), "Current 1:40");

console.log("Transport coherence smoke passed: live projection, exact settlement, Focus-owned proper-Range looping, one-pass Field rebasing, wrap history isolation, Unfocus restoration, and full-video completion.");
