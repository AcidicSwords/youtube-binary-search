import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, delay, dispatchDocument, currentText } = env;

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

// Establish and retain 30–45 as an open Section.
for (const clientX of [300, 450]) {
  byId.get("timeline").dispatch("click", {
    target: byId.get("timeline"),
    clientX
  });
  await flush();
}
byId.get("section-label").value = "Section A";
byId.get("section-label").dispatch("input");
byId.get("section-capture").dispatch("submit");
await flush();

let sectionNodes = descendants(byId.get("sections-list"));
const transposeAction = sectionNodes.find(node => node.dataset.collapseSection);
assert.ok(transposeAction, "An open Section must expose Transpose.");
const sectionId = transposeAction.dataset.collapseSection;
assert.ok(
  descendants(byId.get("section-lane"))
    .some(node => node.dataset.sectionCollapse === sectionId),
  "An open Section must expose a centered timeline hinge."
);

byId.get("sections-list").dispatch("click", { target: transposeAction });
await flush();

assert.equal(
  byId.get("duration-time").textContent,
  "1:25.000 traversal · 1:40.000 source",
  "Transposition must contract only lateral Traversal Time."
);
let foldNodes = descendants(byId.get("fold-lane"));
assert.ok(foldNodes.some(node => node.classList.contains("timeline-fold-axis")));
assert.equal(
  foldNodes.filter(node => node.classList.contains("timeline-fold-pin")).length,
  2,
  "Both sequential endpoint Pins must remain visible on the Fold."
);
assert.equal(
  foldNodes.filter(node => node.classList.contains("timeline-fold-rail")).length,
  1
);
assert.equal(
  descendants(byId.get("pin-lane")).filter(node => node.dataset.pinGo).length,
  0,
  "Fold endpoint Pins belong to the perpendicular rail, not the lateral Pin lane."
);

// Plain Step uses the quotient metric: one lateral second from 29 reaches the
// forward face at 45 because [30,45] contributes zero lateral distance.
byId.get("release").click();
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: (29 / 85) * 1000
});
await flush();
byId.get("release").click();
byId.get("step-size-seconds").value = "1";
byId.get("step-size-seconds").dispatch("change");
byId.get("step-forward").click();
await delay(180);
await flush();
assert.equal(currentText(), "Current 0:45.000");
assert.match(byId.get("section-window").textContent, /0:29\.000–0:45\.000/);

// Shift+Step exposes the same knot as an ordered discrete Pin sequence.
byId.get("release").click();
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: (29 / 85) * 1000
});
await flush();
byId.get("release").click();
dispatchDocument("keydown", { key: "D", code: "KeyD", shiftKey: true });
await flush();
assert.equal(currentText(), "Current 0:30.000");
assert.match(byId.get("section-window").textContent, /0:29\.000–0:30\.000/);
dispatchDocument("keydown", { key: "D", code: "KeyD", shiftKey: true });
await flush();
assert.equal(currentText(), "Current 0:45.000");
assert.match(byId.get("section-window").textContent, /0:29\.000–0:45\.000/);
byId.get("step-forward").click();
await delay(180);
await flush();
assert.equal(currentText(), "Current 0:46.000");
assert.match(byId.get("section-window").textContent, /0:29\.000–0:46\.000/);

// Switch and sequential Pin traversal derive inclusion from endpoint
// containment. No Fold-specific include/exclude state exists.
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:29.000");
dispatchDocument("keydown", { key: "D", code: "KeyD", shiftKey: true });
await flush();
assert.equal(currentText(), "Current 0:30.000");
assert.match(byId.get("section-window").textContent, /0:30\.000–0:46\.000/);
foldNodes = descendants(byId.get("fold-lane"));
assert.ok(
  foldNodes.some(node => node.classList.contains("interval-included")),
  "Containing both stacked endpoints must highlight the complete Section rail."
);
dispatchDocument("keydown", { key: "D", code: "KeyD", shiftKey: true });
await flush();
assert.equal(currentText(), "Current 0:45.000");
assert.match(byId.get("section-window").textContent, /0:45\.000–0:46\.000/);
foldNodes = descendants(byId.get("fold-lane"));
assert.equal(
  foldNodes.some(node => node.classList.contains("interval-included")),
  false,
  "Retaining only the upper endpoint must exclude the Section."
);

// Focus materializes the selected transposed Section without changing its
// persisted collapsed flag. Unfocus restores both Range and Fold.
sectionNodes = descendants(byId.get("sections-list"));
const focusAction = sectionNodes.find(node => node.dataset.focusSection === sectionId);
byId.get("sections-list").dispatch("click", { target: focusAction });
await flush();
assert.equal(byId.get("range-label").textContent, "0:30.000–0:45.000");
assert.equal(
  descendants(byId.get("fold-lane")).some(node => node.classList.contains("timeline-fold")),
  false
);
assert.ok(
  descendants(byId.get("section-lane"))
    .some(node => node.classList.contains("materialized")),
  "Focused transposed Section must be visibly materialized laterally."
);

byId.get("focus-toggle").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:00.000–1:40.000");
assert.ok(
  descendants(byId.get("fold-lane"))
    .some(node => node.classList.contains("timeline-fold")),
  "Unfocus must restore the prior transposition."
);

// Native playback observes full source order while the Fold stays contracted.
byId.get("release").click();
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: (29 / 85) * 1000
});
await flush();
byId.get("center-transport-surface").click();
await flush();
const center = env.center();
center.currentTime = 29;
await poll();
center.currentTime = 40;
await poll();
assert.equal(center.currentTime, 40, "Playback must never seek across transposed source material.");
assert.equal(
  byId.get("duration-time").textContent,
  "1:25.000 traversal · 1:40.000 source",
  "Playback must not mutate semantic Fold geometry."
);
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();

// The unique center hinge unfolds exactly one contributor.
foldNodes = descendants(byId.get("fold-lane"));
const hinge = foldNodes.find(node =>
  node.classList.contains("timeline-fold-hinge")
  && node.dataset.sectionExpand === sectionId
);
assert.ok(hinge);
byId.get("fold-lane").dispatch("click", { target: hinge });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40.000");
assert.ok(
  descendants(byId.get("section-lane"))
    .some(node => node.dataset.sectionCollapse === sectionId)
);

console.log("Section folding smoke passed: open hinge, perpendicular rail, zero lateral Step distance, sequential Shift+Step Pins, endpoint-derived inclusion, Focus materialization, source-contiguous playback, and exact per-Section unfold.");
