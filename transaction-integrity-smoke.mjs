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
const weightValue = () => inSections("sectionWeighting")[0]?.value;
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
byId.get("context-duration").value = "0";
byId.get("context-duration").dispatch("change");
await flush();

// ==============================================================================
// 1. A retained Chapter is saved, not merely reported
// ==============================================================================
// Retention assigned the Session directly and rendered the result. The Guide
// showed the Section, the status said it was retained, and storage never heard
// about it -- so it was gone on the next load. Nothing in the interface
// distinguished that from a real save.
byId.get("chapter-source").value = "0:00 Opening\n0:30 Middle\n1:10 End";
byId.get("chapter-capture").dispatch("submit");
await flush();

const retainButtons = descendants(byId.get("chapters-list"))
  .filter(node => node.dataset.chapterRetain);
assert.equal(retainButtons.length, 3);
byId.get("chapters-list").dispatch("click", { target: retainButtons[1] });
await flush();

assert.match(byId.get("status").textContent, /Retained/);
assert.equal(byId.get("sections-list-count").textContent, "1",
  "Retaining a spanning Chapter saves one Section.");
assert.equal(storedGuide()?.sections.length, 1,
  "and the save reaches storage in the same transaction that reported it.");
assert.equal(storedGuide()?.pins.length, 2,
  "with its endpoint Pins.");

// The real test of a save is the reload.
await loadVideo("https://youtu.be/dQw4w9WgXcQ");
assert.equal(byId.get("sections-list-count").textContent, "1",
  "A retained Chapter survives reopening the video.");
assert.equal(byId.get("pins-list-count").textContent, "2");

// A point Chapter retains a Pin by the same path.
byId.get("chapter-source").value = "0:45 A point";
byId.get("chapter-capture").dispatch("submit");
await flush();
const pointRetain = descendants(byId.get("chapters-list"))
  .find(node => node.dataset.chapterRetain);
byId.get("chapters-list").dispatch("click", { target: pointRetain });
await flush();
const pinsAfterPoint = byId.get("pins-list-count").textContent;
await loadVideo("https://youtu.be/dQw4w9WgXcQ");
assert.equal(byId.get("pins-list-count").textContent, pinsAfterPoint,
  "A Chapter retained as a Pin survives reopening too.");

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
// 3. Weight is assigned in one place
// ==============================================================================
// A held ladder in the operator matrix repeated several times a second, and each
// repeat committed a full transaction -- a gesture experienced as one decision,
// recorded as five. It was batched into one checkpoint, then the controls that
// needed the batching were removed: Weight is assigned in the Guide, where the
// value lives, and one selection is one decision with nothing to coalesce.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 100 });
await flush();
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 300 });
await flush();
byId.get("section-retain-form").dispatch("submit");
await flush();
byId.get("release").click();
await flush();
byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
await flush();
assert.equal(weightValue(), "1", "The Section starts at neutral Weight.");

{
  const selector = inSections("sectionWeighting")[0];
  selector.value = "4";
  byId.get("sections-list").dispatch("change", { target: selector });
  await delay(350);
  await flush(3);
  assert.equal(weightValue(), "4", "The Guide selector assigns it.");
  byId.get("return-action").click();
  await flush();
  assert.equal(weightValue(), "1",
    "and one Undo returns it, because one selection is one decision.");
}

// ==============================================================================
// 4. The relationship band is bounded, and observation survives a rename
// ==============================================================================
// Overlap creates lanes without limit. An unbounded band moved the whole
// workspace down by a lane per overlap, so building structure gradually
// destabilised the instrument. And settling transport for a rename stopped
// playback for an edit that moves nothing.
for (let index = 0; index < 12; index += 1) {
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 100 + index * 3 });
  await flush();
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 700 - index * 3 });
  await flush();
  byId.get("section-retain-form").dispatch("submit");
  await flush();
  byId.get("release").click();
  await flush();
}
const drawnControls = descendants(byId.get("section-lane"))
  .filter(node => node.dataset.sectionGo).length;
assert.ok(drawnControls >= 12,
  "Every overlapping Section keeps its own control.");
assert.equal(byId.get("section-lane").classList.contains("is-overflowing"), true,
  "Past the bound the band scrolls,");
const boundedHeight = Number.parseInt(byId.get("timeline").style["--timeline-height"], 10);
assert.ok(boundedHeight < 320,
  `and the Timeline stops growing (${boundedHeight}px) instead of moving the page.`);

// Names are identities, so no two Groups may read alike.
const groupAdd = () => descendants(byId.get("sections-list"))
  .filter(node => node.dataset.groupAdd !== undefined)[0];
byId.get("sections-list").dispatch("click", { target: groupAdd() });
await flush();
byId.get("sections-list").dispatch("click", { target: groupAdd() });
await flush();
const names = descendants(byId.get("sections-list"))
  .filter(node => String(node.className).includes("guide-group-name"))
  .map(node => node.textContent);
assert.equal(new Set(names).size, names.length,
  "Automatic Group names never collide.");

const renameButtons = descendants(byId.get("sections-list"))
  .filter(node => node.dataset.renameGroup !== undefined);
byId.get("sections-list").dispatch("click", { target: renameButtons[1] });
await flush();
byId.get("guide-dialog-input").value = names[0].toLowerCase();
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.match(byId.get("status").textContent, /already called/,
  "and taking another Group's name is refused, in any letter case.");

// ==============================================================================
// 5. Address equality is not identity equality
// ==============================================================================
// Unlink deliberately produces independently owned Pins at one Address. Every
// creation path resolved "the Pin at 0:30" with .find(), so new structure
// silently attached to whichever identity happened to be created earliest --
// an attachment no inspection could tell apart from the one the user meant.
{
  const { createGuide, createSectionFromTimes, unlinkSectionEndpoint, pinsAt } =
    await import("./guide.js");
  const guide = createGuide("identity");
  const first = createSectionFromTimes(guide, 30, 60, {}).section;
  const second = createSectionFromTimes(guide, 30, 80, {}).section;
  assert.equal(first.startPinId, second.startPinId,
    "One Pin at an Address is still shared: exactly one match reuses it.");

  unlinkSectionEndpoint(guide, second.id, "start");
  const coincident = pinsAt(guide, 30);
  assert.equal(coincident.length, 2,
    "Unlink leaves two independent identities at the same Address.");

  const third = createSectionFromTimes(guide, 30, 90, {}).section;
  assert.equal(
    coincident.some(pin => pin.id === third.startPinId),
    false,
    "A new Section at that Address takes neither of them: ambiguity is never guessed."
  );
  assert.equal(pinsAt(guide, 30).length, 3,
    "It creates its own endpoint instead.");
}

// ==============================================================================
// 7. A saved map that cannot be read is reported, and is not overwritten
// ==============================================================================
//
// An empty map and a lost map look identical on screen. A record damaged by a
// partial write used to warn to a console nobody reads, start the session empty,
// and then be destroyed by the first save — the one failure in the project that
// could not be undone.
{
  const key = "binary-youtube-reader:v9:dQw4w9WgXcQ";
  const intact = env.localStorage.values.get(key);
  assert.ok(intact && intact.length > 40, "There is a saved map to damage.");
  const damaged = intact.slice(0, Math.floor(intact.length * 0.6));

  // Leave the source before damaging its stored record. A same-source reload
  // must first persist the authoritative in-memory Guide and would correctly
  // repair storage before there was anything unreadable to recover.
  await loadVideo("https://youtu.be/M7lc1UVf-VE");
  env.localStorage.values.set(key, damaged);

  await loadVideo("https://youtu.be/dQw4w9WgXcQ");

  assert.match(byId.get("status").textContent, /could not be read/i,
    "A record that exists but cannot be read is reported, not silently treated as absent.");
  assert.equal(byId.get("pins-list-count").textContent, "0",
    "The session starts empty because nothing could be recovered.");

  const quarantineKey = [...env.localStorage.values.keys()]
    .find(name => name.startsWith(
      "binary-youtube-reader:unreadable:dQw4w9WgXcQ:"
    ));
  assert.ok(quarantineKey, "Unreadable evidence receives a unique quarantine identity.");
  const preserved = JSON.parse(env.localStorage.values.get(quarantineKey));
  assert.equal(preserved[0].stored, damaged,
    "The damaged record is set aside before the current key can be rewritten.");
  assert.equal(preserved[0].sourcePrefix, "binary-youtube-reader:v9:");
  assert.equal(env.localStorage.values.get(key), damaged,
    "Loading alone does not manufacture an empty save over the damaged record.");
}

console.log("Transaction integrity smoke passed: a retained Chapter is written to storage in the transaction that reports it and survives reopening; a pending Nudge settles before the next operator commits, so Undo unwinds in the order actions happened; Weight is assigned in one place and one selection is one decision; the relationship band stays bounded under heavy overlap while every Section keeps its control; Group names cannot collide; and Address equality never silently chooses among coincident Pin identities; and an unreadable saved map is reported and set aside rather than overwritten.");
