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
const lead = env.lead();
assert.ok(center && tail && lead, "Center and side players must exist for Context preview coverage.");
assert.equal(byId.get("context-setting-value").textContent, "5 s centered on Current");

// Arm the Field while Center is paused. A traversal must run Context only in
// Center; the sides remain suspended even though the Field is armed to breathe.
byId.get("field-both-toggle").click();
const tailPlaysBeforeContext = tail.commands.filter(command => command[0] === "play").length;
center.deferNextPlacement = true;
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
await flush();

assert.equal(currentText(), "Current 0:50", "Traversal must commit semantic Current before observation begins.");
assert.equal(center.pendingPlacement, 47.5, "Five-second Context must begin half its duration before Current.");
assert.equal(center.currentTime, 0, "A delayed iframe may temporarily leave physical Cursor behind semantic Current.");
assert.equal(center.state, 1, "Automatic Context must play Center.");
assert.equal(byId.get("current-marker").style.left, "50%", "Context must not displace semantic Current.");

await poll();
assert.equal(byId.get("field-transport-state").textContent, "Context Frame");
assert.equal(tail.currentTime, 47.5, "Tail must preview the first Context frame.");
assert.equal(lead.currentTime, 52.5, "Lead must preview the last Context frame.");
assert.equal(byId.get("field-span-label").textContent, "0:47.5–0:52.5");
assert.equal(byId.get("tail-player-surface")["aria-disabled"], "true");
assert.equal(byId.get("lead-player-surface")["aria-disabled"], "true");
assert.equal(
  tail.commands.filter(command => command[0] === "play").length,
  tailPlaysBeforeContext,
  "Context must not activate an armed Field breath."
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
assert.equal(currentText(), "Current 0:50");
assert.equal(byId.get("cursor-marker").hidden, true);
// Context ending is not a reframing. While Context is enabled its bounded edges
// own Tail and Lead before, during, and after transport; only Center returns
// from Cursor to Current.
assert.equal(byId.get("field-transport-state").textContent, "Context Frame");
assert.equal(tail.currentTime, 47.5, "Context Start must survive Context stopping.");
assert.equal(lead.currentTime, 52.5, "Context End must survive Context stopping.");

// A further traversal moves the whole window; the edges still do not follow the
// Cursor and are not reassigned when the observation completes.
byId.get("refine-forward").click();
await flush();
assert.equal(currentText(), "Current 1:15");
assert.equal(center.currentTime, 72.5);
await poll();
assert.equal(byId.get("field-transport-state").textContent, "Context Frame");
assert.equal(tail.currentTime, 72.5);
assert.equal(lead.currentTime, 77.5);
center.currentTime = 78;
await poll();
await flush();
assert.equal(center.currentTime, 75);
assert.equal(byId.get("field-transport-state").textContent, "Context Frame");
assert.equal(tail.currentTime, 72.5, "Context settlement changes no side-frame ownership.");
assert.equal(lead.currentTime, 77.5);

// Operator framing is the fallback for a disabled Context, not for a finished
// one. Turning Context off reveals Refine's next weighted midpoints.
byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");
await flush();
await poll();
assert.equal(byId.get("field-transport-state").textContent, "Refine Frame");
assert.equal(tail.currentTime, 37.5);
assert.equal(lead.currentTime, 87.5);
byId.get("context-seconds").value = "5";
byId.get("context-seconds").dispatch("change");
await flush();
await poll();
assert.equal(byId.get("field-transport-state").textContent, "Context Frame");

// Undo restores both the semantic frame and its prior preview owner; its own
// observation remains temporary as well.
byId.get("return-action").click();
await flush();
assert.equal(currentText(), "Current 0:50");
assert.equal(center.currentTime, 47.5);
center.currentTime = 54;
await poll();
await flush();
assert.equal(center.currentTime, 50);
assert.equal(byId.get("field-transport-state").textContent, "Context Frame");

// Held Step owns its repeat cadence instead of trusting browser key-repeat.
// Native repeat events are ignored, the app advances after its initial delay,
// and automatic Context remains deferred until keyup.
const playsBeforeHeldStep = center.commands.filter(command => command[0] === "play").length;
dispatchDocument("keydown", { key: "ArrowRight", code: "ArrowRight" });
for (let index = 0; index < 5; index += 1) {
  dispatchDocument("keydown", { key: "ArrowRight", code: "ArrowRight", repeat: true });
}
assert.equal(currentText(), "Current 1:00");
assert.match(byId.get("section-window").textContent, /0:00–1:00/);
await env.delay(375);
await flush();
assert.equal(currentText(), "Current 1:20");
assert.match(byId.get("section-window").textContent, /0:00–1:20/);
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
assert.equal(center.currentTime, 77.5);
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
  "Current 0:50",
  "Undo must batch the complete held-arrow gesture."
);
assert.equal(center.currentTime, 47.5);
assert.equal(center.state, 1);

// A new traversal supersedes active Context without restoring the old anchor.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
await flush();
assert.equal(currentText(), "Current 0:25");
assert.equal(center.currentTime, 22.5);
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 750 });
await flush();
assert.equal(currentText(), "Current 1:15");
assert.equal(center.currentTime, 72.5, "Replacement Context must begin half a window before the new destination.");
assert.equal(center.state, 1);

// Step remains available during Context. It cancels the previous observation,
// commits the Step immediately, then starts a replacement Context after Step
// coalescing completes.
byId.get("step-forward").click();
assert.equal(currentText(), "Current 1:25");
await env.delay(300);
await flush();
assert.equal(center.currentTime, 82.5);
assert.equal(center.state, 1);
assert.equal(currentText(), "Current 1:25");

// Context accepts custom numeric durations; presets are suggestions rather than
// the complete domain. Turning it off during observation restores Center once.
byId.get("context-seconds").value = "0.5";
byId.get("context-seconds").dispatch("change");
await flush();
assert.equal(byId.get("context-setting-value").textContent, "0.5 s centered on Current");
assert.equal(center.currentTime, 84.75, "Changing active Context must immediately retarget its centered window.");

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
assert.equal(currentText(), "Current 0:50");
assert.equal(center.currentTime, 50);
assert.equal(center.state, 2);
assert.equal(
  center.commands.filter(command => command[0] === "play").length,
  playsBeforeOffTraversal,
  "Context Off must leave traversal paused at its destination."
);

// Context contributes no Undo entry of its own. Undo restores the preceding
// semantic state rather than any transient Context boundary.
byId.get("return-action").click();
await flush();
assert.equal(currentText(), "Current 1:25");
assert.equal(center.currentTime, 85);

// Space is the play command wherever it is issued. Context is transient
// observation around Current, so it yields to playback rather than
// reinterpreting the key as "commit the Address I was peeking at": Current is
// unchanged, and playback departs from Current, not from the Cursor.
byId.get("context-seconds").value = "5";
byId.get("context-seconds").dispatch("change");
await flush();
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 400 });
await flush();
assert.equal(currentText(), "Current 0:40");
assert.equal(center.state, 1, "A traversal must start Context observing.");
assert.equal(center.currentTime, 37.5, "Context begins half a window before Current.");
const currentBeforeSpace = currentText();
const undoBeforeSpace = byId.get("return-action").disabled;
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(currentText(), currentBeforeSpace,
  "Space during Context must not move Current to the Cursor.");
assert.equal(byId.get("return-action").disabled, undoBeforeSpace,
  "Ending Context by playing records no semantic transaction.");
assert.equal(center.currentTime, 40,
  "Playback departs from Current, not from wherever observation had reached.");
assert.equal(center.state, 1, "Ordinary playback is running.");
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(center.state, 2, "A second Space pauses that playback.");

// A coalesced Step sequence is one transaction whatever its net displacement,
// and it ends at an Address that owes the operator an observation. Stepping
// forward and then back inside the tap window used to discard the transaction
// and return early, leaving Center paused under a Context frame that never
// played.
async function pressStep(direction) {
  const control = byId.get(direction === "forward" ? "step-forward" : "step-backward");
  control.dispatch("pointerdown", { button: 0, pointerId: 1, target: control });
  await flush(2);
  control.dispatch("pointerup", { button: 0, pointerId: 1, target: control });
  await flush(2);
}

byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 400 });
await env.delay(400);
await flush(4);
const originAfterClick = currentText();
const playsBeforeReversal = center.commands.filter(command => command[0] === "play").length;

await pressStep("forward");
await pressStep("backward");
await env.delay(400);
await flush(4);

assert.equal(currentText(), originAfterClick,
  "A reversed Step sequence returns Current to its origin.");
assert.ok(
  center.commands.filter(command => command[0] === "play").length > playsBeforeReversal,
  "A reversed Step sequence must still observe the Address it arrived at."
);
assert.equal(center.state, 1,
  "A reversed sequence must not leave Center paused under a Context frame.");
assert.equal(byId.get("return-meta").textContent, "Step Reversal",
  "A sequence with no net displacement is named for what it did, not for the key that opened it.");

// Undoing it is one operation, because performing it by hand would not be: the
// counter-movement is as many presses as the sequence was.
byId.get("return-action").click();
await env.delay(300);
await flush(4);
assert.equal(byId.get("return-meta").textContent, "Timeline Click",
  "One Undo unwinds the whole Step sequence, whatever its net displacement.");

// The same rule names a mixed sequence by where it ended up. Forward once and
// backward twice is a Step Backward however it started.
await pressStep("forward");
await pressStep("backward");
await pressStep("backward");
await env.delay(400);
await flush(4);
assert.equal(byId.get("return-meta").textContent, "Step Backward",
  "A coalesced sequence is named by its net displacement, not by its first press.");
byId.get("return-action").click();
await env.delay(300);
await flush(4);
assert.equal(currentText(), originAfterClick,
  "Undo returns to the state the whole sequence departed from.");

console.log("Context smoke passed: automatic post-traversal observation, held-key Step deferral, delayed placement, Field suspension, replacement traversal, Step during Context, reversed-sequence observation and naming, Off, and Undo isolation.");
