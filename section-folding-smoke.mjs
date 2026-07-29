import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment({ duration: 100 });
const {
  byId,
  flush,
  poll,
  delay,
  dispatchDocument,
  currentText
} = env;

const aggregateText = node => [node, ...descendants(node)]
  .map(item => item.textContent)
  .join(" ");
const pinRowMatches = (label, time) => byId.get("pins-list").children
  .some(row =>
    new RegExp(label).test(aggregateText(row))
    && new RegExp(time).test(aggregateText(row))
  );

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await flush(5);
byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");

// Fold-face clamping must not alter the existing rule that ordinary timeline
// clicks outside Range are rejected rather than snapped to its boundary.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 200
});
byId.get("range-start-here").click();
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 0
});
assert.equal(currentText(), "Current 0:20.000");
assert.equal(byId.get("status").textContent, "That Address is outside Range.");
byId.get("full-video-range").click();
await flush();

// Establish and retain 30–45 as an expanded Section.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 300
});
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 450
});
byId.get("section-label").value = "Section A";
byId.get("section-label").dispatch("input");
byId.get("section-capture").dispatch("submit");
await flush();

let sectionNodes = descendants(byId.get("sections-list"));
const foldAction = sectionNodes.find(node => node.dataset.collapseSection);
assert.ok(foldAction, "An expanded Section must expose Fold.");
const sectionId = foldAction.dataset.collapseSection;
byId.get("sections-list").dispatch("click", { target: foldAction });
await flush();

assert.equal(
  byId.get("duration-time").textContent,
  "1:25.000 traversal · 1:40.000 source",
  "Fold must contract only traversal duration."
);
let sectionPin = descendants(byId.get("section-lane"))
  .find(node => node.dataset.sectionExpand === sectionId);
assert.ok(sectionPin, "A folded Section must render as one Section Pin.");
assert.equal(
  descendants(byId.get("pin-lane")).filter(node => node.dataset.pinGo).length,
  0,
  "The folded Section Pin must replace both endpoint Pins."
);

// Reach the Section Point from its left. The far face includes its complete
// source extent; Switch Endpoint toggles the same visible point to exclusion.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 0
});
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: (29 / 85) * 1000
});
byId.get("step-forward-seconds").value = "1";
byId.get("step-forward-seconds").dispatch("change");
byId.get("step-forward").click();
await delay(300);
await flush();
assert.equal(currentText(), "Current 0:45.000");
assert.match(byId.get("section-window").textContent, /0:00\.000–0:45\.000/);

byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:30.000");
assert.match(byId.get("section-window").textContent, /0:00\.000–0:30\.000/);
assert.match(byId.get("switch-endpoint-meta").textContent, /include Section A/);
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:45.000");

// Playback materializes the crossed Section for presentation and plays its
// source continuously. The Cursor must not seek from 30 to 45.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: (29 / 85) * 1000
});
byId.get("center-transport-surface").click();
await flush();
assert.equal(
  byId.get("duration-time").textContent,
  "1:40.000",
  "Playback must temporarily materialize every folded Section in its source path."
);
assert.ok(
  descendants(byId.get("pin-lane"))
    .filter(node => node.dataset.pinGo)
    .every(node => node.classList.contains("transport-materialized")),
  "Pins revealed only for physical playback must be visibly transient."
);
const center = env.center();
center.currentTime = 40;
await poll();
assert.equal(center.currentTime, 40, "Playback must never seek across folded source material.");
assert.equal(byId.get("cursor-marker").style.left, "40%");
center.pauseVideo();
await flush();
assert.equal(
  byId.get("duration-time").textContent,
  "1:40.000",
  "A playback settlement inside the retained Fold must keep its exact semantic cut visibly materialized."
);
assert.ok(
  descendants(byId.get("sections-list"))
    .some(node => /Materialized/.test(node.textContent))
);
assert.ok(
  descendants(byId.get("pin-lane"))
    .filter(node => node.dataset.pinGo)
    .every(node => !node.classList.contains("transport-materialized")),
  "A committed semantic cut must replace transient Pin styling with structural materialization."
);
// Two exterior direct traversals replace the partial interior relation; with no
// remaining semantic boundary in the source interior, the retained Fold returns.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 200
});
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 100
});
await flush();
assert.equal(
  byId.get("duration-time").textContent,
  "1:25.000 traversal · 1:40.000 source"
);

// Loop materializes and plays the complete source Section on every cycle. It
// may wrap only at the source endpoint, never at the folded traversal point.
const loopReturnAddress = center.currentTime;
sectionNodes = descendants(byId.get("sections-list"));
let loopAction = sectionNodes.find(node => node.dataset.loopSection === sectionId);
byId.get("sections-list").dispatch("click", { target: loopAction });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40.000");
center.currentTime = 40;
await poll();
assert.equal(center.currentTime, 40);
center.currentTime = 45;
await poll();
assert.equal(center.currentTime, 30, "Folded Section Loop must wrap only after its complete source extent.");
byId.get("sections-list").dispatch("click", { target: loopAction });
await flush();
assert.equal(
  center.currentTime,
  loopReturnAddress,
  "A retained Section Loop must return to the semantic address from which it began."
);
assert.equal(
  byId.get("duration-time").textContent,
  "1:25.000 traversal · 1:40.000 source"
);

// Focus is a temporary semantic expansion. It installs the complete source
// Section as Range, then Leave restores both the parent Range and the fold.
sectionNodes = descendants(byId.get("sections-list"));
const focusAction = sectionNodes.find(node => node.dataset.focusSection === sectionId);
byId.get("sections-list").dispatch("click", { target: focusAction });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40.000");
assert.equal(
  descendants(byId.get("pin-lane")).filter(node => node.dataset.pinGo).length,
  2
);
byId.get("leave-section").click();
await flush();
assert.equal(
  byId.get("duration-time").textContent,
  "1:25.000 traversal · 1:40.000 source"
);
assert.ok(
  descendants(byId.get("section-lane"))
    .some(node => node.dataset.sectionExpand === sectionId)
);

// Clicking the Section Pin expands it and restores both endpoint Pins.
sectionPin = descendants(byId.get("section-lane"))
  .find(node => node.dataset.sectionExpand === sectionId);
byId.get("section-lane").dispatch("click", { target: sectionPin });
await flush();
assert.equal(byId.get("duration-time").textContent, "1:40.000");
assert.equal(
  descendants(byId.get("pin-lane")).filter(node => node.dataset.pinGo).length,
  2
);

// Any two Pins can be explicitly selected and linked into another Section.
let selectActions = descendants(byId.get("pins-list"))
  .filter(node => node.dataset.selectPin);
byId.get("pins-list").dispatch("click", { target: selectActions[0] });
selectActions = descendants(byId.get("pins-list"))
  .filter(node => node.dataset.selectPin);
const secondSelection = selectActions.find(node =>
  node.dataset.selectPin !== selectActions[0].dataset.selectPin
);
byId.get("pins-list").dispatch("click", { target: secondSelection });
await flush();
assert.equal(byId.get("section-source").value, "selected-pins");
byId.get("section-label").value = "Linked Pins";
byId.get("section-label").dispatch("input");
byId.get("section-capture").dispatch("submit");
await flush();
assert.equal(byId.get("sections-list-count").textContent, "2");

// Fold again and drag the Section Pin ten traversal seconds. Shared endpoint
// Pins move once, so every Section that references them deforms coherently.
sectionNodes = descendants(byId.get("sections-list"));
const foldAgain = sectionNodes.find(node =>
  node.dataset.collapseSection === sectionId
);
byId.get("sections-list").dispatch("click", { target: foldAgain });
await flush();
sectionPin = descendants(byId.get("section-lane"))
  .find(node => node.dataset.sectionExpand === sectionId);
byId.get("section-lane").dispatch("pointerdown", {
  target: sectionPin,
  clientX: (30 / 85) * 1000,
  pointerId: 7,
  button: 0
});
byId.get("timeline").dispatch("pointermove", {
  target: byId.get("timeline"),
  clientX: (40 / 85) * 1000,
  pointerId: 7,
  buttons: 1
});
byId.get("timeline").dispatch("pointerup", {
  target: byId.get("timeline"),
  clientX: (40 / 85) * 1000,
  pointerId: 7
});
await flush();
assert.ok(
  descendants(byId.get("sections-list"))
    .some(node => /0:40\.000–0:55\.000/.test(node.textContent)),
  "Dragging a Section Pin must translate its complete retained subtree."
);
dispatchDocument("keydown", { key: "z", code: "KeyZ", ctrlKey: true });
await flush();
assert.ok(
  descendants(byId.get("sections-list"))
    .some(node => /0:30\.000–0:45\.000/.test(node.textContent)),
  "One Undo must restore the complete Section drag."
);

// Expanded endpoint Pins are draggable/carryable shared levers. Select the
// start Pin, then Alt+Step one second: Current and that endpoint move together.
sectionPin = descendants(byId.get("section-lane"))
  .find(node => node.dataset.sectionExpand === sectionId);
byId.get("section-lane").dispatch("click", { target: sectionPin });
await flush();
const startPin = descendants(byId.get("pin-lane"))
  .find(node => node.dataset.pinGo && /0:30\.000/.test(node.title));
byId.get("pin-lane").dispatch("click", { target: startPin });
await flush();
byId.get("step-forward-seconds").value = "1";
byId.get("step-forward-seconds").dispatch("change");
dispatchDocument("keydown", { key: "Alt", code: "AltLeft", altKey: true });
dispatchDocument("keydown", {
  key: "ArrowRight",
  code: "ArrowRight",
  altKey: true
});
dispatchDocument("keyup", {
  key: "ArrowRight",
  code: "ArrowRight",
  altKey: true
});
dispatchDocument("keyup", { key: "Alt", code: "AltLeft" });
await delay(300);
await flush();
assert.ok(
  descendants(byId.get("sections-list"))
    .some(node => /0:31\.000–0:45\.000/.test(node.textContent)),
  "Alt traversal must carry the selected endpoint Pin through the same operator transaction."
);
dispatchDocument("keydown", { key: "z", code: "KeyZ", ctrlKey: true });
await flush();
assert.ok(
  descendants(byId.get("sections-list"))
    .some(node => /0:30\.000–0:45\.000/.test(node.textContent))
);

// Pin Forward/Backward must carry the object that was already selected, not
// silently replace the selection with the traversal destination first.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 200
});
byId.get("pin-label").value = "Carrier";
byId.get("pin-label").dispatch("input");
byId.get("pin-capture").dispatch("submit");
await flush();
const carrier = descendants(byId.get("pin-lane"))
  .find(node => node.dataset.pinGo && /Carrier/.test(node.title));
byId.get("pin-lane").dispatch("click", { target: carrier });
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 0
});
dispatchDocument("keydown", { key: "Alt", code: "AltLeft", altKey: true });
dispatchDocument("keydown", {
  key: "ArrowRight",
  code: "ArrowRight",
  altKey: true,
  shiftKey: true
});
dispatchDocument("keyup", {
  key: "ArrowRight",
  code: "ArrowRight",
  altKey: true,
  shiftKey: true
});
dispatchDocument("keyup", { key: "Alt", code: "AltLeft" });
await flush();
let pinListNodes = descendants(byId.get("pins-list"));
assert.ok(
  pinRowMatches("Carrier", "0:40\\.000"),
  `Alt+Pin traversal must carry the previously selected Pin by the same traversal delta: ${
    pinListNodes.map(node => node.textContent).join(" | ")
  }`
);
dispatchDocument("keydown", { key: "z", code: "KeyZ", ctrlKey: true });
await flush();
pinListNodes = descendants(byId.get("pins-list"));
assert.ok(
  pinRowMatches("Carrier", "0:20\\.000"),
  "One Undo must restore both the Pin hop and its carried retained object."
);

// Alt also composes with direct timeline traversal, not only named buttons.
dispatchDocument("keydown", { key: "Alt", code: "AltLeft", altKey: true });
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 100,
  altKey: true
});
dispatchDocument("keyup", { key: "Alt", code: "AltLeft" });
await flush();
const afterDirectCarry = descendants(byId.get("pins-list"))
  .map(node => node.textContent);
assert.ok(
  pinRowMatches("Carrier", "0:30\\.000"),
  `Alt+timeline traversal must carry the selected retained object: ${afterDirectCarry.join(" | ")}`
);
dispatchDocument("keydown", { key: "z", code: "KeyZ", ctrlKey: true });
await flush();

// A document-level pointer release completes a Pin drag when capture is lost.
const restoredCarrier = descendants(byId.get("pin-lane"))
  .find(node => node.dataset.pinGo && /Carrier/.test(node.title));
byId.get("pin-lane").dispatch("pointerdown", {
  target: restoredCarrier,
  clientX: 200,
  pointerId: 11,
  button: 0
});
byId.get("timeline").dispatch("pointermove", {
  target: byId.get("timeline"),
  clientX: 250,
  pointerId: 11,
  buttons: 1
});
dispatchDocument("pointerup", {
  target: byId.get("timeline"),
  clientX: 250,
  pointerId: 11
});
await flush();
assert.ok(
  pinRowMatches("Carrier", "0:25\\.000"),
  "A release outside the captured marker must still commit exactly one Pin drag."
);
dispatchDocument("keydown", { key: "z", code: "KeyZ", ctrlKey: true });
await flush();

console.log("Section folding smoke passed: fold/expand, source-contiguous playback, face inclusion, two-Pin Sections, subtree drag, document-release recovery, and modifier-carried Step, Pin, and direct traversal.");
