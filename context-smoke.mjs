import assert from "node:assert/strict";
import { createSmokeEnvironment } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, currentText, dispatchDocument } = env;

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await flush(5);
await poll();
await flush(4);

const center = env.center();
const tail = env.tail();
assert.ok(center && tail, "Center and side players must exist for Context suspension coverage.");
assert.equal(byId.get("context-setting-value").textContent, "5 s after traversal");

// Arm Tail Stretch while Center is paused. A traversal must run Context only in
// Center; the side remains suspended even though it is armed to stretch.
byId.get("tail-field-toggle").click();
const tailPlaysBeforeContext = tail.commands.filter(command => command[0] === "play").length;
center.deferNextPlacement = true;
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
await flush();

assert.equal(currentText(), "Current 0:50.000", "Traversal must commit semantic Current before observation begins.");
assert.equal(center.pendingPlacement, 49, "Five-second Context must request one second of pre-roll.");
assert.equal(center.currentTime, 0, "A delayed iframe may temporarily leave physical Cursor behind semantic Current.");
assert.equal(center.state, 1, "Automatic Context must play Center.");
assert.equal(byId.get("current-marker").style.left, "50%", "Context must not displace semantic Current.");

await poll();
assert.equal(byId.get("field-transport-state").textContent, "Context suspended");
assert.equal(
  tail.commands.filter(command => command[0] === "play").length,
  tailPlaysBeforeContext,
  "Context must not activate an armed side Field."
);

// A stale pre-placement Cursor cannot terminate Context. Once the player enters
// and leaves the window, Center returns to semantic Current and pauses.
center.applyPendingPlacement();
await poll();
center.currentTime = 54;
await poll();
await flush();
assert.equal(center.currentTime, 50);
assert.equal(center.state, 2);
assert.equal(currentText(), "Current 0:50.000");
assert.equal(byId.get("cursor-marker").hidden, true);

// Held Step owns its repeat cadence instead of trusting browser key-repeat.
// Native repeat events are ignored, the app advances after its initial delay,
// and automatic Context remains deferred until keyup.
const playsBeforeHeldStep = center.commands.filter(command => command[0] === "play").length;
dispatchDocument("keydown", { key: "ArrowRight", code: "ArrowRight" });
for (let index = 0; index < 5; index += 1) {
  dispatchDocument("keydown", { key: "ArrowRight", code: "ArrowRight", repeat: true });
}
assert.equal(currentText(), "Current 1:00.000");
assert.equal(byId.get("loop-meta").textContent, "0:00.000–1:00.000");
await env.delay(375);
await flush();
assert.equal(currentText(), "Current 1:20.000");
assert.equal(byId.get("loop-meta").textContent, "0:00.000–1:20.000");
assert.equal(
  center.commands.filter(command => command[0] === "play").length,
  playsBeforeHeldStep,
  "Held-key repeats must not start intermediate Context playback."
);
assert.equal(
  center.currentTime,
  80,
  "Held Step must park Center at each committed Current while Context remains deferred."
);
assert.equal(center.state, 2);
dispatchDocument("keyup", { key: "ArrowRight", code: "ArrowRight" });
await flush();
assert.equal(center.currentTime, 79);
assert.equal(center.state, 1);
assert.equal(
  center.commands.filter(command => command[0] === "play").length,
  playsBeforeHeldStep + 1,
  "Keyup must start exactly one Context observation at the final Step destination."
);
center.currentTime = 84;
await poll();
await flush();
assert.equal(center.currentTime, 80);
assert.equal(center.state, 2);

// Every repeat amended one Step transaction. A single Undo returns to the
// pre-gesture Current and starts only one observation of that restored state.
byId.get("return-action").click();
await flush();
assert.equal(
  currentText(),
  "Current 0:50.000",
  "Undo must batch the complete held-arrow gesture."
);
assert.equal(center.currentTime, 49);
assert.equal(center.state, 1);

// A new traversal supersedes active Context without restoring the old anchor.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
await flush();
assert.equal(currentText(), "Current 0:25.000");
assert.equal(center.currentTime, 24);
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 750 });
await flush();
assert.equal(currentText(), "Current 1:15.000");
assert.equal(center.currentTime, 74, "Replacement Context must begin around the new destination, not restore the old one.");
assert.equal(center.state, 1);

// Step remains available during Context. It cancels the previous observation,
// commits the Step immediately, then starts a replacement Context after Step
// coalescing completes.
byId.get("step-forward").click();
assert.equal(currentText(), "Current 1:25.000");
await env.delay(300);
await flush();
assert.equal(center.currentTime, 84);
assert.equal(center.state, 1);
assert.equal(currentText(), "Current 1:25.000");

// Context accepts custom numeric durations; presets are suggestions rather than
// the complete domain. Turning it off during observation restores Center once.
byId.get("context-seconds").value = "0.5";
byId.get("context-seconds").dispatch("change");
await flush();
assert.equal(byId.get("context-setting-value").textContent, "0.5 s after traversal");
assert.equal(center.currentTime, 84.5, "Changing active Context must immediately retarget its bounded window.");

// Subsequent
// traversal remains paused and does not issue an automatic play command.
byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");
await flush();
assert.equal(center.currentTime, 85);
assert.equal(center.state, 2);
assert.equal(byId.get("context-setting-value").textContent, "Off");
const playsBeforeOffTraversal = center.commands.filter(command => command[0] === "play").length;
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
await flush();
assert.equal(currentText(), "Current 0:50.000");
assert.equal(center.currentTime, 50);
assert.equal(center.state, 2);
assert.equal(
  center.commands.filter(command => command[0] === "play").length,
  playsBeforeOffTraversal,
  "Context Off must leave traversal paused at its destination."
);

// Context contributes no Undo entry of its own. Undo restores the preceding
// semantic state rather than any transient pre-roll or end address.
byId.get("return-action").click();
await flush();
assert.equal(currentText(), "Current 1:25.000");
assert.equal(center.currentTime, 85);

console.log("Context smoke passed: automatic post-traversal observation, held-key Step deferral, delayed placement, Field suspension, replacement traversal, Step during Context, Off, and Undo isolation.");
