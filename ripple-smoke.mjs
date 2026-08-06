import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

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
const acceptedCurrent = currentText();
const historyBefore = byId.get("return-meta").textContent;
const activeSpanBefore = byId.get("section-window").textContent;

byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 980,
  shiftKey: true
});
await flush(4);

assert.equal(currentText(), acceptedCurrent,
  "Shift-click Ripple leaves committed Current unchanged.");
assert.equal(byId.get("return-meta").textContent, historyBefore,
  "Ripple acquisition creates no semantic history.");
assert.equal(byId.get("section-window").textContent, activeSpanBefore,
  "Ripple acquisition creates no Active Span.");
assert.equal(center.currentTime, 95.5,
  "Ripple reuses Context Duration and independently clips its start at Range.");
assert.equal(center.state, 1, "The shared Context transport observes Ripple.");
assert.match(byId.get("status").textContent, /Ripple observing 1:38.*Current remains 0:00/,
  "Status distinguishes the observation Address from Current.");
assert.equal(byId.get("ripple-address-marker").hidden, false);
assert.equal(byId.get("ripple-address-marker").style.left, "98%");
assert.match(
  byId.get("ripple-address-marker")["aria-label"],
  /Ripple Observation Address 1:38; Current did not move and remains 0:00/,
  "Ripple exposes an accessible observation channel that explicitly preserves Current."
);
assert.equal(byId.get("ripple-context-window-fill").style.left, "95.5%");
assert.equal(byId.get("ripple-context-window-fill").style.width, "4.5%");
let prospectMarkers = descendants(byId.get("traversal-prospect-layer"));
assert.deepEqual(
  prospectMarkers.map(marker => [marker.dataset.kind, marker.style.left]),
  [["ripple-end", "100%"], ["ripple-start", "95.5%"]],
  "The exact clipped Start and End prospects have distinct, projected channels."
);
assert.ok(
  prospectMarkers.every(marker => /Current did not move/.test(marker["aria-label"])),
  "Every prospect's accessible name distinguishes it from Current."
);

await poll();
await flush(2);
assert.equal(byId.get("panorama-transport-state").textContent, "Context Frame");
assert.equal(tail.currentTime, 95.5,
  "Panorama reuses the actual clipped Ripple Context Start.");
assert.equal(lead.currentTime, 100,
  "Panorama reuses the independently clipped Ripple Context End.");

const playsBeforeRetarget = center.commands.filter(command => command[0] === "play").length;
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 750,
  shiftKey: true
});
await flush(3);
assert.equal(center.currentTime, 72.5);
assert.equal(
  center.commands.filter(command => command[0] === "play").length,
  playsBeforeRetarget,
  "A later Ripple retargets the one running Context owner."
);
prospectMarkers = descendants(byId.get("traversal-prospect-layer"));
assert.deepEqual(
  prospectMarkers.map(marker => [marker.dataset.kind, marker.style.left]),
  [["ripple-end", "77.5%"], ["ripple-start", "72.5%"]],
  "Retargeting removes the incomplete Ripple batch before projecting its replacement."
);
await poll();
assert.equal(tail.currentTime, 72.5);
assert.equal(lead.currentTime, 77.5);
assert.equal(currentText(), acceptedCurrent);
assert.equal(byId.get("return-meta").textContent, historyBefore);

center.currentTime = 78;
await poll();
await flush(3);
assert.equal(center.state, 2, "A completed Ripple settles the Context transport.");
assert.equal(center.currentTime, 0,
  "Completion restores Current-centred media instead of adopting the Ripple Address.");
assert.equal(currentText(), acceptedCurrent);
assert.equal(byId.get("return-meta").textContent, historyBefore);
assert.match(byId.get("status").textContent, /Ripple added futures at 1:12\.5 and 1:17\.5/,
  "Successful completion reports the exact clipped prospect boundaries.");
assert.equal(byId.get("ripple-address-marker").hidden, true,
  "The Observation Address disappears when observation completes.");
assert.equal(byId.get("ripple-context-window-fill").hidden, true,
  "The live Ripple Context Window disappears when observation completes.");
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 2,
  "Completed prospects remain visibly available after their observation settles.");

byId.get("context-duration").value = "0";
byId.get("context-duration").dispatch("change");
await flush(2);
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 500,
  shiftKey: true
});
await flush(2);
assert.equal(currentText(), acceptedCurrent);
assert.equal(center.state, 2);
assert.match(byId.get("status").textContent, /positive Context Duration/,
  "Ripple owns Shift-click even when Context is Off, but refuses to manufacture a window.");

const beginGhostScan = async direction => {
  dispatchDocument("keydown", { key: "g", code: "KeyG" });
  dispatchDocument("wheel", {
    target: byId.get("timeline"),
    deltaX: 0,
    deltaY: direction === "forward" ? -30 : 30
  });
  await flush(3);
};
const releaseGhostScan = async () => {
  dispatchDocument("keyup", { key: "g", code: "KeyG" });
  await flush(3);
};

// A forward Ghost scan acquires the newest valid future without mutating the
// accepted Session, history, Trace, or prospect collection.
const acceptedBeforeFuture = byId.get("current-marker").dataset.acceptedAddress;
await beginGhostScan("forward");
assert.equal(currentText(), "Ghost Candidate 1:17.5",
  "Forward Ghost chooses the newest Ripple End Prospect first.");
assert.equal(
  byId.get("current-marker").dataset.acceptedAddress,
  acceptedBeforeFuture,
  "The prospect remains a Ghost Candidate until release."
);
assert.equal(byId.get("return-meta").textContent, historyBefore);
assert.equal(byId.get("active-span-fill").dataset.medium, "direct",
  "Prospect preview shows the ordinary Go Active Span, not historical recall.");
assert.match(
  byId.get("status").textContent,
  /Ghost future.*Ripple End Prospect 1:17\.5.*Current remains 0:00/,
  "Prospect scanning explicitly distinguishes the Candidate from Current."
);
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 2);

dispatchDocument("keydown", { key: "Escape", code: "Escape" });
dispatchDocument("keyup", { key: "g", code: "KeyG" });
await flush(3);
assert.equal(currentText(), acceptedCurrent,
  "Escape cancels a prospective Ghost scan back to Current.");
assert.equal(byId.get("return-meta").textContent, historyBefore);
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 2,
  "Cancellation consumes no prospect.");

await beginGhostScan("forward");
await releaseGhostScan();
assert.equal(currentText(), "Current 1:17.5");
assert.equal(byId.get("return-meta").textContent, "Go to Traversal Prospect",
  "Release settles the prospect through one canonical Go history entry.");
assert.match(byId.get("status").textContent, /Moved by Go to Ripple End Prospect 1:17\.5/);
prospectMarkers = descendants(byId.get("traversal-prospect-layer"));
assert.deepEqual(
  prospectMarkers.map(marker => marker.dataset.kind),
  ["ripple-start"],
  "Successful Go consumes only its exact endpoint."
);

// The committed consequence is one ordinary Traversal Trace movement, not a
// Ghost Return: reading backward from it reaches the Go departure.
await beginGhostScan("backward");
assert.equal(currentText(), "Ghost Candidate 0:00",
  "Backward Ghost reads the ordinary movement from Current to the accepted prospect.");
dispatchDocument("keydown", { key: "Escape", code: "Escape" });
dispatchDocument("keyup", { key: "g", code: "KeyG" });
await flush(3);
assert.equal(currentText(), "Current 1:17.5");
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 1);

await beginGhostScan("forward");
assert.equal(currentText(), "Ghost Candidate 1:12.5",
  "The second forward gesture reads the remaining Start Prospect.");
await releaseGhostScan();
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 0,
  "The second successful Go consumes the remaining exact endpoint.");

dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush(3);
assert.equal(currentText(), "Current 1:17.5",
  "One Undo reverses only the second prospect Go.");
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 0,
  "Semantic Undo does not resurrect consumed transient prospects.");

// Escape owns an active Ripple before the ordinary transport tier. Cancellation
// removes only the uncompleted batch and restores Current-centred presentation.
byId.get("context-duration").value = "5";
byId.get("context-duration").dispatch("change");
await flush(2);
const currentBeforeRippleCancel = currentText();
const historyBeforeRippleCancel = byId.get("return-meta").textContent;
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 400,
  shiftKey: true
});
await flush(3);
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 2);
assert.equal(byId.get("ripple-address-marker").hidden, false);
dispatchDocument("keydown", { key: "Escape", code: "Escape" });
await flush(3);
assert.equal(currentText(), currentBeforeRippleCancel);
assert.equal(byId.get("return-meta").textContent, historyBeforeRippleCancel);
assert.equal(center.state, 2);
assert.equal(center.currentTime, 77.5,
  "Ripple cancellation restores media to accepted Current.");
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 0,
  "Escape removes the uncompleted Ripple batch.");
assert.equal(byId.get("ripple-address-marker").hidden, true);
assert.equal(byId.get("ripple-context-window-fill").hidden, true);
assert.match(byId.get("status").textContent, /Ripple cancelled.*Current remains 1:17\.5/);

console.log("Ripple smoke passed: bare Shift-click acquisition, distinct accessible observation/window/prospect projection, shared Context derivation and transport, independent Range clipping, Current/history/Active Span non-effects, live retargeting, Panorama Context Frame reuse, exact endpoint publication and persistence, Current-centred completion, Context-Off refusal, newest-first frozen Ghost preview, exact cancellation, canonical Go settlement, ordinary Trace recording, endpoint-by-endpoint consumption, Undo isolation, and Escape lifecycle restoration.");
