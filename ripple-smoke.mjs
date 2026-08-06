import assert from "node:assert/strict";
import { createSmokeEnvironment } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, currentText } = env;

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

console.log("Ripple smoke passed: bare Shift-click acquisition, shared Context derivation and transport, independent Range clipping, Current/history/Active Span non-effects, live retargeting, Panorama Context Frame reuse, exact endpoint publication status, Current-centred completion, and Context-Off refusal.");
