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
assert.equal(center.currentTime, 47.5);
assert.equal(byId.get("field-transport-state").textContent, "Context suspended");
assert.equal(byId.get("center-transport-label").textContent, "Set Current Here");

// Context crosses the traversal point. Accepting its backward half extends the
// existing Working Section through the shared continuous deformation.
center.currentTime = 48;
await poll();
assert.equal(
  currentText(),
  "Current 0:50.000",
  "Context Cursor must remain transient until explicitly accepted."
);

const contextExtensionPlaces = {
  tail: tail.commands.filter(command => command[0] === "place").length,
  lead: lead.commands.filter(command => command[0] === "place").length
};
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(currentText(), "Current 0:48.000");
assert.match(byId.get("section-window").textContent, /0:48\.000–1:04\.000/);
assert.equal(byId.get("resolution-start-marker").style.left, "34%");
assert.equal(byId.get("resolution-end-marker").style.left, "64%");
assert.equal(
  tail.commands.filter(command => command[0] === "place").length,
  contextExtensionPlaces.tail + 1,
  "Accepting backward Context must translate Tail once."
);
assert.equal(
  lead.commands.filter(command => command[0] === "place").length,
  contextExtensionPlaces.lead + 1,
  "Accepting backward Context must translate Lead once."
);

// Undo restores the complete pre-accept relation and starts a fresh centered
// Context. Accepting its forward half then finely shortens that same Section.
byId.get("return-action").click();
await flush();
assert.equal(currentText(), "Current 0:50.000");
assert.equal(center.currentTime, 47.5);
const contextCommitPlaces = {
  tail: tail.commands.filter(command => command[0] === "place").length,
  lead: lead.commands.filter(command => command[0] === "place").length
};
center.currentTime = 52;
await poll();
const focusedTraversal = byId.get("refine-forward");
focusedTraversal.focus();
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(currentText(), "Current 0:52.000");
assert.match(
  byId.get("section-window").textContent,
  /0:52\.000–1:04\.000/,
  "Accepting Context must move the active Working Section endpoint, not replace it with the tiny observed crossing."
);
assert.equal(
  byId.get("resolution-start-marker").style.left,
  "36%",
  "Accepting Context must preserve the receding Resolution endpoint."
);
assert.equal(
  byId.get("resolution-end-marker").style.left,
  "66%",
  "Accepting Context must deform the approached Resolution endpoint instead of rebuilding scale around Cursor."
);
assert.equal(center.currentTime, 52);
assert.equal(center.state, 2);
assert.equal(byId.get("center-transport-label").textContent, "Play Field");
assert.equal(
  tail.commands.filter(command => command[0] === "place").length,
  contextCommitPlaces.tail + 1,
  "Accepting Context Cursor must translate Tail to the new Current once."
);
assert.equal(
  lead.commands.filter(command => command[0] === "place").length,
  contextCommitPlaces.lead + 1,
  "Accepting Context Cursor must translate Lead to the new Current once."
);

focusedTraversal.blur();
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(center.state, 1);
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(center.state, 2);

// Replacing a not-yet-confirmed Context must let the replacement observation
// adopt the next PLAYING confirmation. The old cancellation claim cannot pause
// the new Context.
center.deferNextPlayState = true;
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 400
});
await flush();
assert.equal(center.pendingPlayState, true);
const forward = byId.get("step-forward");
forward.dispatch("pointerdown", { button: 0, pointerId: 41 });
forward.dispatch("pointerup", { button: 0, pointerId: 41 });
await env.delay(300);
await flush();
assert.equal(currentText(), "Current 0:50.000");
assert.equal(center.currentTime, 47.5);
assert.equal(
  center.state,
  1,
  "A replacement Context must not be paused by the superseded start claim."
);
center.applyPendingPlayState();
await flush();
dispatchDocument("keydown", { key: "Escape", code: "Escape" });
await flush();
assert.equal(center.state, 2);
assert.equal(center.currentTime, 50);

forward.blur();
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

console.log("Transport coherence smoke passed: live projection, exact Context acceptance, replacement-start ownership, rapid pause settlement, playback-to-Loop handoff, and one-pass Field wrap.");
