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
await flush(3);

const center = env.center();
const tail = env.tail();
const lead = env.lead();
const timelineChildren = byId.get("timeline").children.length;
const acceptedCurrent = currentText();
const historyBefore = byId.get("return-meta").textContent;
const activeSpanBefore = byId.get("section-window").textContent;

const shiftClickTimeline = async clientX => {
  byId.get("timeline").dispatch("click", {
    target: byId.get("timeline"),
    clientX,
    shiftKey: true
  });
  await flush(4);
};
const beginGhost = async direction => {
  dispatchDocument("keydown", { key: "g", code: "KeyG" });
  dispatchDocument("wheel", {
    target: byId.get("timeline"),
    deltaX: 0,
    deltaY: direction === "forward" ? -30 : 30
  });
  await flush(3);
};
const moveGhost = async direction => {
  dispatchDocument("wheel", {
    target: byId.get("timeline"),
    deltaX: 0,
    deltaY: direction === "forward" ? -30 : 30
  });
  await flush(3);
};
const releaseGhost = async () => {
  dispatchDocument("keyup", { key: "g", code: "KeyG" });
  await flush(3);
};

await shiftClickTimeline(980);

assert.equal(currentText(), acceptedCurrent,
  "Shift-click Ripple leaves committed Current unchanged.");
assert.equal(byId.get("return-meta").textContent, historyBefore,
  "Ripple acquisition creates no semantic history.");
assert.equal(byId.get("section-window").textContent, activeSpanBefore,
  "Ripple acquisition creates no Active Span.");
assert.equal(center.currentTime, 95.5,
  "Ripple reuses Context Duration and independently clips its start at Range.");
assert.equal(center.state, 1, "The shared Context transport observes Ripple.");
assert.match(byId.get("status").textContent, /Ripple observing 1:38.*Current remains 0:00/);

// Ripple is intentionally absent from the Timeline. It adds future endpoints
// to the Trace and nothing to the visual map, including no generic Cursor while
// its Context observation is active.
for (const id of [
  "ripple-address-marker",
  "ripple-context-window-fill",
  "traversal-prospect-layer"
]) assert.equal(byId.has(id), false, `${id} is not a product DOM surface.`);
assert.equal(byId.get("timeline").children.length, timelineChildren,
  "Ripple creates no dynamic Timeline children.");
assert.equal(byId.get("cursor-marker").hidden, true,
  "Ripple observation does not project the generic Cursor onto the Timeline.");
assert.equal(byId.get("cursor-time").textContent, "—");

await poll();
await flush(2);
assert.equal(byId.get("panorama-transport-state").textContent, "Context Frame");
assert.equal(tail.currentTime, 95.5);
assert.equal(lead.currentTime, 100);

const playsBeforeRetarget = center.commands.filter(command => command[0] === "play").length;
await shiftClickTimeline(750);
assert.equal(center.currentTime, 72.5);
assert.equal(
  center.commands.filter(command => command[0] === "play").length,
  playsBeforeRetarget,
  "A later Ripple retargets the one running Context owner."
);
assert.equal(byId.get("timeline").children.length, timelineChildren);
await poll();
assert.equal(tail.currentTime, 72.5);
assert.equal(lead.currentTime, 77.5);

center.currentTime = 78;
await poll();
await flush(3);
assert.equal(center.state, 2);
assert.equal(center.currentTime, 0,
  "Completion restores Current-centred media instead of adopting the Ripple Address.");
assert.equal(currentText(), acceptedCurrent);
assert.equal(byId.get("return-meta").textContent, historyBefore);
assert.match(byId.get("status").textContent, /Ripple added futures at 1:12\.5 and 1:17\.5/);
assert.equal(byId.get("timeline").children.length, timelineChildren);

byId.get("context-duration").value = "0";
byId.get("context-duration").dispatch("change");
await flush(2);
await shiftClickTimeline(500);
assert.equal(currentText(), acceptedCurrent);
assert.match(byId.get("status").textContent, /positive Context Duration/);

// Forward and backward are two directions in one Ghost stream. The first
// forward position is Ripple Start because endpoints retain append order.
await beginGhost("forward");
assert.equal(currentText(), "Ghost Candidate 1:12.5");
assert.equal(byId.get("active-span-fill").dataset.medium, "ghost",
  "Future and historical positions share one Ghost presentation.");
assert.match(byId.get("status").textContent, /Ghost forward.*1:12\.5/);

await moveGhost("backward");
assert.equal(currentText(), "Ghost Candidate 0:00",
  "The same held gesture reverses from Ripple future to its Trace pivot.");
await moveGhost("forward");
assert.equal(currentText(), "Ghost Candidate 1:12.5",
  "and moves forward into that same future again without switching readers.");

dispatchDocument("keydown", { key: "Escape", code: "Escape" });
dispatchDocument("keyup", { key: "g", code: "KeyG" });
await flush(3);
assert.equal(currentText(), acceptedCurrent);
assert.equal(byId.get("return-meta").textContent, historyBefore);

await beginGhost("forward");
await releaseGhost();
assert.equal(currentText(), "Current 1:12.5");
assert.equal(byId.get("return-meta").textContent, "Ghost Traverse",
  "Settling a Ripple future uses canonical Go under the one Ghost history label.");
assert.match(byId.get("status").textContent, /Ghost moved Current to 1:12\.5/);

// The settled future is now on the backward side. From there one held gesture
// can walk back, forward over it, onward into the remaining future, then reverse
// repeatedly without changing action or presentation.
await beginGhost("backward");
assert.equal(currentText(), "Ghost Candidate 0:00");
await moveGhost("forward");
assert.equal(currentText(), "Ghost Candidate 1:12.5");
await moveGhost("forward");
assert.equal(currentText(), "Ghost Candidate 1:17.5");
await moveGhost("backward");
assert.equal(currentText(), "Ghost Candidate 1:12.5");
await moveGhost("backward");
assert.equal(currentText(), "Ghost Candidate 0:00");
await moveGhost("forward");
assert.equal(currentText(), "Ghost Candidate 1:12.5");
await moveGhost("forward");
assert.equal(currentText(), "Ghost Candidate 1:17.5");
await releaseGhost();
assert.equal(currentText(), "Current 1:17.5");
assert.equal(byId.get("return-meta").textContent, "Ghost Traverse");

// Escape owns active Ripple cancellation and removes only its uncompleted
// future entries while restoring Current-centred media.
byId.get("context-duration").value = "5";
byId.get("context-duration").dispatch("change");
await flush(2);
const currentBeforeCancel = currentText();
await shiftClickTimeline(400);
dispatchDocument("keydown", { key: "Escape", code: "Escape" });
await flush(3);
assert.equal(currentText(), currentBeforeCancel);
assert.equal(center.state, 2);
assert.match(byId.get("status").textContent, /Ripple cancelled/);
assert.equal(byId.get("timeline").children.length, timelineChildren);

console.log("Ripple smoke passed: invisible Timeline behavior, shared Context, append-order future endpoints, one bidirectional Ghost stream and presentation, canonical future settlement, repeated reversal, cancellation, and Current/history non-effects.");
