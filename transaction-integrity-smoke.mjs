// One physical gesture, at most one checkpoint — and a reported save is saved.
//
// Three defects shared one shape: a relation the model states, implemented in
// more than one place, or in no place. Step batched its repeats and Nudge
// batched its repeats, each with its own mechanism, and a held Weight control
// had neither. Nudge deferred its checkpoint and nothing made the next operator
// wait for it. Retention went through `accept()` everywhere except one function,
// and that one function was the only way to lose work.
//
// These are the regressions for all three. Each asserts the consequence a person
// would notice, not the mechanism that produces it.
import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, currentText, dispatchDocument, delay, intervalCallbacks } = env;

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

const sectionRows = () => descendants(byId.get("sections-list"))
  .filter(node => node.dataset.sectionGo);
const inSections = key => descendants(byId.get("sections-list"))
  .filter(node => node.dataset[key] !== undefined);
const weightValue = () => inSections("sectionWeight")[0]?.value;
const undoTop = () => byId.get("return-meta").textContent;
const press = async (key, options = {}) => {
  dispatchDocument("keydown", {
    key,
    ...options,
    preventDefault() {},
    target: { tagName: "BODY" }
  });
  await flush();
};
const loadVideo = async url => {
  byId.get("youtube-url").value = url;
  byId.get("load-video").click();
  await flush(6);
  await poll();
  await flush(2);
};
const storedGuide = () => {
  const key = [...env.localStorage.values.keys()].find(name => name.includes(":v9:"));
  return key ? JSON.parse(env.localStorage.values.get(key)) : null;
};

await loadVideo("https://youtu.be/dQw4w9WgXcQ");
byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");
await flush();

// ==============================================================================
// 1. A retained Cue is saved, not merely reported
// ==============================================================================
// Retention assigned the Session directly and rendered the result. The Guide
// showed the Section, the status said it was retained, and storage never heard
// about it -- so it was gone on the next load. Nothing in the interface
// distinguished that from a real save.
byId.get("cue-source").value = "0:00 Opening\n0:30 Middle\n1:10 End";
byId.get("cue-capture").dispatch("submit");
await flush();

const retainButtons = descendants(byId.get("cues-list"))
  .filter(node => node.dataset.cueRetain);
assert.equal(retainButtons.length, 3);
byId.get("cues-list").dispatch("click", { target: retainButtons[1] });
await flush();

assert.match(byId.get("status").textContent, /Retained/);
assert.equal(byId.get("sections-list-count").textContent, "1",
  "Retaining a spanning Cue saves one Section.");
assert.equal(storedGuide()?.sections.length, 1,
  "and the save reaches storage in the same transaction that reported it.");
assert.equal(storedGuide()?.pins.length, 2,
  "with its endpoint Pins.");

// The real test of a save is the reload.
await loadVideo("https://youtu.be/dQw4w9WgXcQ");
assert.equal(byId.get("sections-list-count").textContent, "1",
  "A retained Cue survives reopening the video.");
assert.equal(byId.get("pins-list-count").textContent, "2");

// A point Cue retains a Pin by the same path.
byId.get("cue-source").value = "0:45 A point";
byId.get("cue-capture").dispatch("submit");
await flush();
const pointRetain = descendants(byId.get("cues-list"))
  .find(node => node.dataset.cueRetain);
byId.get("cues-list").dispatch("click", { target: pointRetain });
await flush();
const pinsAfterPoint = byId.get("pins-list-count").textContent;
await loadVideo("https://youtu.be/dQw4w9WgXcQ");
assert.equal(byId.get("pins-list-count").textContent, pinsAfterPoint,
  "A Cue retained as a Pin survives reopening too.");

// ==============================================================================
// 2. A pending Nudge settles before the next transaction commits
// ==============================================================================
// Nudge changes the Session immediately and writes its checkpoint 420 ms later.
// Nothing made the next operator wait, so the checkpoint could be appended
// after a later transaction and against an origin two steps old. Undo stopped
// being monotonic: undoing the Nudge reverted the operator that followed it,
// and undoing that operator moved Current forward.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 400 });
await flush();
const anchor = currentText();

await press(".");
const nudged = currentText();
assert.notEqual(nudged, anchor, "Nudge moves Current.");

// Immediately, inside the settle window.
await press("e");
const refined = currentText();
assert.notEqual(refined, nudged, "Refine moves it again.");
assert.match(undoTop(), /Refine/,
  "The operator that just ran is the one Undo offers, so the Nudge already settled beneath it.");

// Letting the old timer elapse must not append anything after the Refine.
await delay(500);
await flush();
assert.match(undoTop(), /Refine/,
  "An elapsed Nudge timer appends nothing: the gesture was already settled.");

// Undo now unwinds in the order the actions happened.
byId.get("return-action").click();
await flush();
assert.equal(currentText(), nudged,
  "The first Undo reverses the Refine, returning to the nudged Address.");
byId.get("return-action").click();
await flush();
assert.equal(currentText(), anchor,
  "and the second reverses the Nudge, returning to where it began.");

// ==============================================================================
// 3. One held Weight gesture is one Undo checkpoint
// ==============================================================================
// A hold repeats the ladder step several times a second. Each repeat committed
// a full transaction, so walking 1x to 4x left an Undo entry per rung -- a
// physical gesture the user experiences as one decision, recorded as five.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 100 });
await flush();
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 300 });
await flush();
byId.get("section-capture").dispatch("submit");
await flush();
byId.get("release").click();
await flush();
byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
await flush();
assert.equal(weightValue(), "1", "The Section starts at neutral Weight.");

const registeredBefore = intervalCallbacks.length;
byId.get("deform-up").dispatch("pointerdown", { button: 0, pointerId: 21, buttons: 1 });
await flush();
assert.equal(weightValue(), "1.25", "Pressing steps one rung immediately.");
await delay(420);
await flush();
assert.ok(intervalCallbacks.length > registeredBefore,
  "and holding past the delay starts the repeat.");

const repeat = intervalCallbacks[intervalCallbacks.length - 1];
for (let index = 0; index < 4; index += 1) {
  repeat();
  await flush();
}
assert.equal(weightValue(), "4",
  "The hold walks the ladder to its top.");

dispatchDocument("pointerup", { button: 0, pointerId: 21, buttons: 0 });
await flush();

// Five rungs were crossed. One decision was made.
byId.get("return-action").click();
await flush();
assert.equal(weightValue(), "1",
  "One Undo returns the whole hold to where it started.");
byId.get("return-action").click();
await flush();
assert.doesNotMatch(byId.get("status").textContent, /timeline weight/,
  "and there is no second Weight entry behind it.");

// A single press is still its own decision, not swallowed into a neighbour.
// Reset to neutral explicitly so this block does not depend on where the
// previous one left the ladder.
byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
await flush();
const reset = inSections("sectionWeight")[0];
reset.value = "1";
byId.get("sections-list").dispatch("change", { target: reset });
await flush();
assert.equal(weightValue(), "1");
byId.get("deform-up").dispatch("pointerdown", { button: 0, pointerId: 22, buttons: 1 });
await flush();
dispatchDocument("pointerup", { button: 0, pointerId: 22, buttons: 0 });
await flush();
const single = weightValue();
byId.get("deform-up").dispatch("pointerdown", { button: 0, pointerId: 23, buttons: 1 });
await flush();
dispatchDocument("pointerup", { button: 0, pointerId: 23, buttons: 0 });
await flush();
assert.notEqual(weightValue(), single, "A second press steps again,");
byId.get("return-action").click();
await flush();
assert.equal(weightValue(), single,
  "and Undo reverses exactly that press, not both.");

console.log("Transaction integrity smoke passed: a retained Cue is written to storage in the transaction that reports it and survives reopening; a pending Nudge settles before the next operator commits, so Undo unwinds in the order actions happened; and one held Weight gesture walks the ladder as one checkpoint while a single press stays its own.");
