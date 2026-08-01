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

byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 500
});
await flush();
assert.equal(currentText(), "Current 0:50");

const forward = byId.get("step-forward");
forward.dispatch("pointerdown", { button: 0, pointerId: 7 });
assert.equal(currentText(), "Current 1:00", "Pointer press must Step immediately.");
assert.equal(forward.classList.contains("is-step-held"), true);

await env.delay(375);
await flush();
assert.equal(
  currentText(),
  "Current 1:20",
  "A held button must repeat on the application cadence rather than browser click timing."
);
assert.equal(
  env.center().currentTime,
  80,
  "Held Step must move the visible Center on each repeat, not only its semantic marker."
);
// Predictive chrome answers "what would this do" and "where would it land".
// While the operator is being performed several times a second, the movement
// itself is answering, and every one of these elements recomputes on every
// repeat -- which is what drew streaks across the map. Pressing the control
// also focuses it, and focus arms the operator preview, so the whole
// predictive apparatus must be checked, not only the Step targets.
assert.deepEqual(
  [
    "backward-target-marker",
    "forward-target-marker",
    "action-preview-fill",
    "preview-current-marker"
  ].filter(id => byId.get(id).hidden !== true),
  [],
  "No predictive chrome may be drawn while a Step gesture is running."
);

const sidePlacesBeforeRelease = {
  center: env.center().commands.filter(command => command[0] === "place").length,
  tail: env.tail().commands.filter(command => command[0] === "place").length,
  lead: env.lead().commands.filter(command => command[0] === "place").length
};
dispatchDocument("pointerup", { button: 0, pointerId: 7 });
await flush();
assert.equal(forward.classList.contains("is-step-held"), false);
assert.equal(byId.get("forward-target-marker").hidden, false,
  "Releasing the gesture restores the Step targets.");
assert.equal(env.center().currentTime, 80);
assert.equal(
  env.center().commands.filter(command => command[0] === "place").length,
  sidePlacesBeforeRelease.center,
  "Gesture settlement must not place an already aligned Center a second time."
);
assert.equal(
  env.tail().commands.filter(command => command[0] === "place").length,
  sidePlacesBeforeRelease.tail,
  "Gesture settlement must not translate Tail a second time."
);
assert.equal(
  env.lead().commands.filter(command => command[0] === "place").length,
  sidePlacesBeforeRelease.lead,
  "Gesture settlement must not translate Lead a second time."
);

byId.get("return-action").click();
await flush();
assert.equal(
  currentText(),
  "Current 0:50",
  "Undo must revert the entire held-button Step gesture in one operation."
);
assert.equal(env.center().currentTime, 50);

forward.dispatch("keydown", { key: "Enter", code: "Enter" });
assert.equal(
  currentText(),
  "Current 1:00",
  "Enter on a focused Step control must Step immediately on keyboard press."
);
await env.delay(375);
await flush();
assert.equal(
  currentText(),
  "Current 1:20",
  "Holding Enter on a focused Step control must use the same application cadence."
);
forward.dispatch("keyup", { key: "Enter", code: "Enter" });
await flush();
byId.get("return-action").click();
await flush();
assert.equal(
  currentText(),
  "Current 0:50",
  "A held keyboard control press must remain one Undo transaction."
);

for (const pointerId of [8, 9]) {
  forward.dispatch("pointerdown", { button: 0, pointerId });
  forward.dispatch("pointerup", { button: 0, pointerId });
  if (pointerId === 8) await env.delay(180);
}
assert.equal(currentText(), "Current 1:10");
await env.delay(300);
await flush();
byId.get("return-action").click();
await flush();
assert.equal(
  currentText(),
  "Current 0:50",
  "Undo must also revert a rapid sequence of repeated Step taps."
);

console.log("Step gesture smoke passed: captured and fallback pointer release, keyboard hold, and human-cadence rapid taps each retain one-operation Undo.");
