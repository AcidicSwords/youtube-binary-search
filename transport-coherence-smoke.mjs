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
assert.equal(currentText(), "Current 0:50.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:50\.000/);

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
assert.equal(byId.get("interval-fill").style.left, "25%");
assert.equal(byId.get("interval-fill").style.width, "33%");
assert.equal(
  currentText(),
  "Current 0:50.000",
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

assert.equal(currentText(), "Current 0:58.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:58\.000/);
assert.equal(byId.get("interval-fill").dataset.live, "false");
assert.equal(byId.get("resolution-start-marker").dataset.live, "false");
assert.equal(
  center.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.center + 1,
  "Application pause must issue one Center pause."
);
assert.equal(
  tail.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.tail + 1,
  "Playback settlement must freeze Tail once."
);
assert.equal(
  lead.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.lead + 1,
  "Playback settlement must freeze Lead once."
);

await poll();
assert.equal(
  tail.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.tail + 1,
  "Polling after settlement must not freeze the Field again."
);

dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
center.currentTime = 64;
tail.currentTime = 61;
lead.currentTime = 70;
await poll();

const centerPausesBeforeLoop = center.commands.filter(command => command[0] === "pause").length;
byId.get("loop").click();
await flush();

assert.equal(
  center.commands.filter(command => command[0] === "pause").length,
  centerPausesBeforeLoop,
  "Playback-to-Loop must hand off without a pause/play race."
);
assert.equal(currentText(), "Current 1:04.000");
assert.match(byId.get("loop-meta").textContent, /0:25\.000–1:04\.000/);
assert.equal(center.currentTime, 25);
assert.equal(center.state, 1);

const wrapPlacesBefore = {
  tail: tail.commands.filter(command => command[0] === "place").length,
  lead: lead.commands.filter(command => command[0] === "place").length
};
const wrapCommandsBefore = {
  tail: tail.commands.length,
  lead: lead.commands.length
};
center.currentTime = 64;
await poll();
assert.equal(center.currentTime, 25);
assert.equal(
  tail.commands.filter(command => command[0] === "place").length,
  wrapPlacesBefore.tail + 1,
  `Loop wrap must rebase Tail once: ${JSON.stringify(tail.commands.slice(wrapCommandsBefore.tail))}`
);
assert.equal(
  lead.commands.filter(command => command[0] === "place").length,
  wrapPlacesBefore.lead + 1,
  `Loop wrap must rebase Lead once: ${JSON.stringify(lead.commands.slice(wrapCommandsBefore.lead))}`
);

const endedWrapPlaces = {
  tail: tail.commands.filter(command => command[0] === "place").length,
  lead: lead.commands.filter(command => command[0] === "place").length
};
center.currentTime = 64;
center.emitState(0);
await flush();
assert.equal(center.currentTime, 25);
assert.equal(
  tail.commands.filter(command => command[0] === "place").length,
  endedWrapPlaces.tail + 1,
  "YouTube ENDED must use the same one-pass Tail wrap."
);
assert.equal(
  lead.commands.filter(command => command[0] === "place").length,
  endedWrapPlaces.lead + 1,
  "YouTube ENDED must use the same one-pass Lead wrap."
);

byId.get("loop").click();
await flush();
assert.equal(center.currentTime, 64);
assert.equal(center.state, 2);

byId.get("context-seconds").value = "5";
byId.get("context-seconds").dispatch("change");
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 500
});
await flush();
await poll();
assert.equal(center.currentTime, 49);
assert.equal(byId.get("field-transport-state").textContent, "Context suspended");

const contextHandoffPlaces = {
  tail: tail.commands.filter(command => command[0] === "place").length,
  lead: lead.commands.filter(command => command[0] === "place").length
};
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(center.currentTime, 50);
assert.equal(center.state, 1);
assert.equal(
  tail.commands.filter(command => command[0] === "place").length,
  contextHandoffPlaces.tail + 1,
  "Context-to-playback must establish Tail only once."
);
assert.equal(
  lead.commands.filter(command => command[0] === "place").length,
  contextHandoffPlaces.lead + 1,
  "Context-to-playback must establish Lead only once."
);

dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(center.state, 2);

center.deferNextPlayState = true;
dispatchDocument("keydown", { key: " ", code: "Space" });
assert.equal(
  byId.get("center-transport-label").textContent,
  "Pause Field",
  "Requested playback must become visibly cancellable before PLAYING confirmation."
);
dispatchDocument("keydown", { key: " ", code: "Space" });
assert.equal(
  center.state,
  2,
  "Pause may initially be a no-op while YouTube still reports its preceding paused state."
);
center.applyPendingPlayState();
await flush();
assert.equal(center.state, 2);
assert.equal(tail.state, 2);
assert.equal(lead.state, 2);
assert.equal(
  byId.get("center-transport-surface").hidden,
  false,
  "A pause requested before PLAYING confirmation must settle that exact playback."
);

center.deferNextPlayState = true;
dispatchDocument("keydown", { key: " ", code: "Space" });
dispatchDocument("keydown", { key: "Escape", code: "Escape" });
center.applyPendingPlayState();
await flush();
assert.equal(center.state, 2);
assert.equal(tail.state, 2);
assert.equal(lead.state, 2);
assert.equal(
  byId.get("center-transport-surface").hidden,
  false,
  "Cancelling a pending start must consume its late PLAYING confirmation."
);

byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");
center.deferNextPlayState = true;
dispatchDocument("keydown", { key: " ", code: "Space" });
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 300
});
center.applyPendingPlayState();
await flush();
assert.equal(currentText(), "Current 0:30.000");
assert.equal(center.currentTime, 30);
assert.equal(center.state, 2);
assert.equal(
  byId.get("center-transport-surface").hidden,
  false,
  "A replacement traversal must keep ownership when a cancelled Play confirms late."
);

console.log("Transport coherence smoke passed: live bound projection, rapid single pause settlement, direct Context/Loop handoffs, and one-pass Field wrap.");
