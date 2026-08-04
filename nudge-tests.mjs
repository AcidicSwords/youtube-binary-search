// Nudge and direct Current manipulation.
//
// Nudge is a source-time operation with one implementation: Timeline
// Shift-wheel, Shift-drag, the keyboard, and every Guide increment control all
// call it, and one continuous gesture settles as one Undo transaction.
import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, dispatchDocument, currentText } = env;

await import(`./app.js?nudge=${Date.now()}`);
window.onYouTubeIframeAPIReady();
await flush();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await flush(5);
byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");
await flush();

// A verified frame duration is unavailable from the YouTube adapter, so the
// quantum is displayed and applied as seconds and never called a frame step.
assert.equal(byId.get("nudge-seconds").value, "0.042");

// The default quantum must actually move Current. A quantum at or below the
// kernel's semantic equality tolerance would resolve to the same Address and
// silently do nothing, so exercise the shipped default before changing it.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 400 });
await flush(4);
await poll();
assert.equal(currentText(), "Current 0:40");
dispatchDocument("keydown", { key: ".", code: "Period" });
await flush();
assert.notEqual(currentText(), "Current 0:40",
  "One default-quantum Nudge must produce a real semantic movement.");
assert.match(byId.get("status").textContent, /Nudge Current forward/);
await env.delay(600);
await flush();

// Rejecting a quantum that would be swallowed by semantic equality.
byId.get("nudge-seconds").value = "0.001";
byId.get("nudge-seconds").dispatch("change");
await flush();
assert.ok(Number(byId.get("nudge-seconds").value) > 0.04,
  "A configured quantum may never fall to or below the semantic tolerance.");

byId.get("nudge-seconds").value = "0.5";
byId.get("nudge-seconds").dispatch("change");
await flush();
assert.match(byId.get("status").textContent, /Nudge set to 0\.5s/);

// Nudge Current is Step law at a source-time quantum. Returning to departure
// within one gesture therefore retains the same sparse positive reversal
// residue as a matrix Step sequence, in one Undo transaction.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 450
});
await flush(3);
dispatchDocument("keydown", { key: ".", code: "Period" });
await flush();
dispatchDocument("keydown", { key: ",", code: "Comma" });
await flush();
assert.equal(currentText(), "Current 0:45");
await env.delay(600);
await flush();
assert.match(byId.get("section-window").textContent, /0:45.+0:45\.5/,
  "A Current Nudge reversal retains its visited contiguous extent.");
assert.equal(byId.get("return-meta").textContent, "Step Reversal",
  "and settles through the same one-transaction Step reversal consequence.");

// Current drag is an exact Go gesture, not a Pin move. A stationary press
// performs no movement at all.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
await flush();
await poll();
assert.equal(currentText(), "Current 0:50");
const historyBeforePress = byId.get("return-action").disabled;
byId.get("current-marker").dispatch("pointerdown", {
  target: byId.get("current-marker"),
  clientX: 500,
  pointerId: 71,
  button: 0,
  buttons: 1
});
dispatchDocument("pointerup", {
  target: byId.get("current-marker"),
  clientX: 500,
  pointerId: 71,
  buttons: 0
});
await flush();
assert.equal(currentText(), "Current 0:50", "A stationary press performs no movement.");
assert.equal(byId.get("return-action").disabled, historyBeforePress);

// Crossing the drag threshold previews a candidate Address. Session Current
// remains unchanged and the original Current stays as a departure marker.
const intervalStartBeforeDrag = byId.get("section-window").textContent.split("–")[0];
byId.get("current-marker").dispatch("pointerdown", {
  target: byId.get("current-marker"),
  clientX: 500,
  pointerId: 72,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: byId.get("current-marker"),
  clientX: 650,
  pointerId: 72,
  buttons: 1
});
await flush();
assert.equal(currentText(), "Current 0:50", "Session Current is unchanged during the drag.");
assert.equal(byId.get("current-departure-marker").hidden, false,
  "The original Current remains as a faint departure marker.");
assert.equal(byId.get("current-marker").style.left, "65%",
  "The Current marker follows the candidate Timeline position.");
assert.equal(byId.get("field-transport-state").textContent, "Current Frame",
  "Direct manipulation temporarily supplies an exact Field Frame.");
assert.equal(env.center().currentTime, 65, "Center displays the candidate frame.");
// The drag commits a Step, so it must show the Step it will commit. Without a
// live preview the Working Interval and neighbourhood stand still under a
// moving marker and jump on release, which reads as a different gesture.
assert.equal(byId.get("action-preview-fill").hidden, false,
  "Dragging Current must preview the Working Interval the Step will land.");
assert.equal(byId.get("action-preview-fill").dataset.kind, "stepForward",
  "The previewed extent is a Step, never a Go.");
// A preview answers where the movement lands and across what. The
// neighbourhood it would establish is not drawn at all -- the elements that
// drew it no longer exist: the operators that push a midpoint already show it
// in the destination, and five extra elements read as noise rather than
// information.
assert.equal(byId.get("preview-resolution-fill"), undefined,
  "A preview has no neighbourhood chrome left to draw.");
assert.equal(byId.get("preview-current-marker").hidden, false,
  "It draws the destination the movement lands on.");
const previewedInterval = {
  left: byId.get("action-preview-fill").style.left,
  width: byId.get("action-preview-fill").style.width
};
// Cursor reports observation that has left Current. A drag seeks the player to
// the candidate, so Cursor has not left Current and must draw no second marker
// stacked under the one the finger is holding.
assert.equal(byId.get("cursor-marker").hidden, true,
  "A Current drag must not draw a Cursor under the Current marker.");

// Release commits one exact Go and exactly one Undo checkpoint.
dispatchDocument("pointerup", {
  target: byId.get("current-marker"),
  clientX: 650,
  pointerId: 72,
  buttons: 0
});
await flush();
await poll();
assert.equal(currentText(), "Current 1:05");
assert.equal(byId.get("current-departure-marker").hidden, true);
// Dragging Current is Step, not Go: it extends the retained traversal from the
// same departure instead of drawing a new Working Interval around the landing.
assert.match(byId.get("status").textContent, /Stepped Forward to 1:05/);
assert.equal(byId.get("action-preview-fill").hidden, true,
  "The preview is released with the gesture.");
assert.deepEqual(
  {
    left: byId.get("interval-fill").style.left,
    width: byId.get("interval-fill").style.width
  },
  previewedInterval,
  "What the drag previewed is exactly what the release commits."
);
assert.ok(
  byId.get("section-window").textContent.startsWith(intervalStartBeforeDrag),
  "Dragging Current extends the retained traversal from its existing anchor."
);
assert.match(byId.get("section-window").textContent, /–1:05$/,
  "It extends to the new Current rather than drawing a new interval around it.");
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(currentText(), "Current 0:50", "One drag creates at most one Undo checkpoint.");
dispatchDocument("keydown", { key: "c", code: "KeyC" });
await flush();
assert.equal(currentText(), "Current 1:05");

// Cancellation restores the original Current presentation and creates no
// semantic change and no history.
byId.get("current-marker").dispatch("pointerdown", {
  target: byId.get("current-marker"),
  clientX: 650,
  pointerId: 73,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: byId.get("current-marker"),
  clientX: 800,
  pointerId: 73,
  buttons: 1
});
await flush();
assert.equal(byId.get("current-marker").style.left, "80%");
dispatchDocument("pointercancel", {
  target: byId.get("current-marker"),
  pointerId: 73
});
await flush();
await poll();
assert.equal(currentText(), "Current 1:05", "Cancellation creates no semantic change.");
assert.equal(byId.get("current-departure-marker").hidden, true);
assert.equal(byId.get("current-marker").style.left, "65%");

// Shift-drag is precision mode: reduced gain, quantized in source time.
byId.get("current-marker").dispatch("pointerdown", {
  target: byId.get("current-marker"),
  clientX: 650,
  pointerId: 74,
  button: 0,
  buttons: 1,
  shiftKey: true
});
dispatchDocument("pointermove", {
  target: byId.get("current-marker"),
  clientX: 750,
  pointerId: 74,
  buttons: 1,
  shiftKey: true
});
await flush();
// 100px of a 1000px Timeline over a 100 s Range is 10 s at full gain; precision
// mode reduces that to 2 s and snaps it to the 0.5 s quantum.
assert.equal(byId.get("current-marker").style.left, "67%");
dispatchDocument("pointerup", {
  target: byId.get("current-marker"),
  clientX: 750,
  pointerId: 74,
  buttons: 0
});
await flush();
await poll();
assert.equal(currentText(), "Current 1:07");

// Shift + wheel over empty Timeline nudges Current, and one continuous wheel
// series settles as one Undo transaction.
const wheel = (deltaY, target = byId.get("timeline")) => dispatchDocument(
  "wheel",
  { target, deltaY, deltaX: 0, shiftKey: true }
);
const plainWheel = dispatchDocument(
  "wheel",
  { target: byId.get("timeline"), deltaY: -120, deltaX: 0 }
);
await flush();
assert.equal(plainWheel.defaultPrevented, false,
  "The browser default is prevented only for an acquired Timeline nudge target.");
assert.equal(currentText(), "Current 1:07");

const shiftWheel = wheel(-120);
await flush();
assert.equal(shiftWheel.defaultPrevented, true);
assert.equal(currentText(), "Current 1:09.5", "Wheel-up nudges forward by five quanta.");
wheel(-12);
await flush();
assert.equal(currentText(), "Current 1:09.5",
  "High-resolution deltas accumulate until one discrete quantum is crossed.");
wheel(-12);
await flush();
assert.equal(currentText(), "Current 1:10", "Accumulated deltas then produce one nudge.");
wheel(60);
await flush();
assert.equal(currentText(), "Current 1:09", "Wheel-down nudges backward.");
await env.delay(600);
await flush();
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(currentText(), "Current 1:07",
  "One continuous wheel gesture settles as one Undo transaction.");

// Keyboard nudging uses the same operation and the same batching.
dispatchDocument("keydown", { key: ".", code: "Period" });
dispatchDocument("keydown", { key: ".", code: "Period", repeat: true });
dispatchDocument("keydown", { key: ".", code: "Period", repeat: true });
await flush();
assert.equal(currentText(), "Current 1:08.5");
await env.delay(600);
await flush();
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(currentText(), "Current 1:07",
  "Repeated keydown events belong to one held nudge gesture.");
dispatchDocument("keydown", { key: ",", code: "Comma" });
await flush();
assert.equal(currentText(), "Current 1:06.5", "`,` nudges to the previous quantum.");
await env.delay(600);
await flush();

// A Pin under the pointer owns the nudge instead of Current.
byId.get("pin-label").value = "Nudge target";
byId.get("pin-capture").dispatch("submit");
await flush();
// Move Current away so the Pin is an independent manipulable object.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 300 });
await flush();
await poll();
const pinMarker = descendants(byId.get("pin-lane"))
  .find(node => node.dataset.pinGo && /1:06\.5/.test(node["aria-label"] || ""));
assert.ok(pinMarker, "The retained Pin must be an exact manipulable object.");
const currentBeforePinNudge = currentText();
assert.equal(currentBeforePinNudge, "Current 0:30");
wheel(-24, pinMarker);
await flush();
assert.equal(currentText(), currentBeforePinNudge,
  "Nudging a Pin must not move Current.");
const pinAddress = () => descendants(byId.get("pins-list"))
  .find(node => node.dataset.addressInput === "pin")?.value;
assert.equal(pinAddress(), "1:07", "Shift-wheel over a Pin nudges that Pin.");
await env.delay(600);
await flush();

// Opposite movement of one retained target inside the same gesture has no
// canonical residue. It returns exactly to origin and manufactures no Undo.
const pinId = pinMarker.dataset.pinGo;
const livePinMarker = () => descendants(byId.get("pin-lane"))
  .find(node => node.dataset.pinGo === pinId);
const pinBeforeRoundTrip = pinAddress();
wheel(-24, livePinMarker());
await flush();
wheel(24, livePinMarker());
await flush();
assert.equal(pinAddress(), pinBeforeRoundTrip);
await env.delay(600);
await flush();
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(pinAddress(), "1:06.5",
  "Undo crosses a Pin round trip and reaches the prior real Nudge immediately.");
dispatchDocument("keydown", { key: "c", code: "KeyC" });
await flush();
assert.equal(pinAddress(), "1:07");

// A Guide row is off-map inspection, not a spatial wheel acquisition surface.
// With no acquired Timeline operand it must leave that row's Pin untouched and
// fall back to Current.
const guidePinRow = descendants(byId.get("pins-list"))
  .find(node => node.dataset.pinGo === pinId);
const guideWheel = wheel(-24, guidePinRow);
await flush();
assert.equal(guideWheel.defaultPrevented, true);
assert.equal(currentText(), "Current 0:30.5",
  "Off-map Shift-wheel without an acquired operand nudges Current.");
assert.equal(pinAddress(), "1:07",
  "A Guide row under the pointer does not replace the off-map target.");
await env.delay(600);
await flush();
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(currentText(), "Current 0:30");

// The Guide increment controls call the same Nudge operation.
const guideNudgeForward = descendants(byId.get("pins-list"))
  .find(node => node.dataset.nudgeTarget === "pin" && node.dataset.nudgeDirection === "1");
assert.ok(guideNudgeForward, "Guide must expose the shared Nudge increments.");
// Increment controls fire on press and repeat while held, so they are driven by
// pointer events rather than by click.
byId.get("pins-list").dispatch("pointerdown", {
  target: guideNudgeForward, button: 0, pointerId: 81
});
byId.get("pins-list").dispatch("pointerup", {
  target: guideNudgeForward, pointerId: 81
});
await flush();
assert.equal(pinAddress(), "1:07.5",
  "Guide increments and Timeline Shift-wheel are one operation.");
// Let that gesture settle so the hold below is a separate transaction.
await env.delay(600);
await flush();

// Holding one repeats it, and the whole hold is still one Undo transaction.
byId.get("pins-list").dispatch("pointerdown", {
  target: guideNudgeForward, button: 0, pointerId: 82
});
await env.delay(700);
await flush();
byId.get("pins-list").dispatch("pointerup", {
  target: guideNudgeForward, pointerId: 82
});
await flush();
const heldAddress = pinAddress();
assert.notEqual(heldAddress, "1:07.5", "Holding an increment must repeat it.");
await env.delay(600);
await flush();
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(pinAddress(), "1:07.5",
  "A held increment settles as one Undo checkpoint.");
await env.delay(600);
await flush();
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(pinAddress(), "1:07", "One Guide nudge gesture is one Undo checkpoint.");

// An Address input previews the candidate Field Frame before commit, and
// Escape cancels without writing Session state.
const committedPinAddress = () => descendants(byId.get("pin-lane"))
  .find(node => node.dataset.pinGo)?.["aria-label"];
const previewInput = descendants(byId.get("pins-list"))
  .find(node => node.dataset.addressInput === "pin");
const addressBeforePreview = committedPinAddress();
previewInput.value = "0:20";
byId.get("pins-list").dispatch("input", { target: previewInput });
await flush();
assert.equal(byId.get("field-transport-state").textContent, "Pin Frame",
  "Typing an Address previews the candidate Field Frame.");
assert.equal(env.center().currentTime, 20);
assert.equal(committedPinAddress(), addressBeforePreview,
  "Previewing an Address writes no Session state.");
byId.get("pins-list").dispatch("keydown", { target: previewInput, key: "Escape" });
await flush();
await poll();
assert.notEqual(byId.get("field-transport-state").textContent, "Pin Frame",
  "Escape cancels the candidate Frame.");
assert.equal(committedPinAddress(), addressBeforePreview);

// Editing an Address and dragging the same object are one operation, so they
// must also present the same Frame: Tail and Lead carry the edited edges while
// Center shows what that object's own drag would show.
{
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 200 });
  await flush(3);
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 400 });
  await flush(3);
  byId.get("section-label").value = "Frame parity";
  byId.get("section-capture").dispatch("submit");
  await flush(3);
  const row = descendants(byId.get("sections-list")).find(node => node.dataset.sectionGo);
  byId.get("sections-list").dispatch("click", { target: row });
  await flush(3);
  await poll();

  const sectionId = row.dataset.sectionGo;
  const sectionWire = () => descendants(byId.get("section-lane"))
    .find(node => node.dataset.sectionGo === sectionId);
  const sectionBounds = () => ["section-start", "section-end"].map(kind =>
    descendants(byId.get("sections-list"))
      .find(node => node.dataset.addressInput === kind)?.value
  );
  const boundsBeforeRoundTrip = sectionBounds();
  const historyBeforeRoundTrip = byId.get("return-meta").textContent;
  wheel(-24, sectionWire());
  await flush();
  wheel(24, sectionWire());
  await flush();
  assert.deepEqual(sectionBounds(), boundsBeforeRoundTrip);
  await env.delay(600);
  await flush();
  assert.equal(byId.get("return-meta").textContent, historyBeforeRoundTrip,
    "A Section Nudge round trip creates no no-op history entry.");

  const wire = descendants(byId.get("section-lane"))
    .find(node => node.dataset.sectionGo);
  wire.rect = { left: 200, width: 200 };
  byId.get("section-lane").dispatch("pointerdown", {
    target: wire, clientX: 205, pointerId: 91, button: 0, buttons: 1
  });
  dispatchDocument("pointermove", {
    target: wire, clientX: 100, pointerId: 91, buttons: 1
  });
  await flush(2);
  const dragged = [env.tail().currentTime, env.center().currentTime, env.lead().currentTime];
  dispatchDocument("pointercancel", { target: wire, pointerId: 91 });
  await flush(3);
  await poll();

  const startInput = descendants(byId.get("sections-list"))
    .find(node => node.dataset.addressInput === "section-start");
  startInput.value = "0:10";
  byId.get("sections-list").dispatch("input", { target: startInput });
  await flush(2);
  const edited = [env.tail().currentTime, env.center().currentTime, env.lead().currentTime];
  assert.deepEqual(edited, [10, 25, 40],
    "An exact edit shows Start, midpoint and End.");
  assert.deepEqual(
    dragged.map(value => Math.round(value)),
    edited.map(value => Math.round(value)),
    "Dragging an endpoint and editing its Address present the same Frame."
  );
  byId.get("sections-list").dispatch("keydown", { target: startInput, key: "Escape" });
  await flush(2);
}

// Nudge is not a thing you do to the map, it is a thing you do to what you have
// acquired. Bound to the Timeline alone, Shift+wheel demanded the pointer be
// hovering the map to adjust an already-acquired object -- a demand the keyboard
// route never made.
const offMap = dispatchDocument("wheel", {
  target: byId.get("status"), deltaY: -120, deltaX: 0, shiftKey: true
});
await flush(3);
assert.equal(offMap.defaultPrevented, true,
  "Shift+wheel away from the map is Nudge, acting on whatever is acquired.");

// A form control the pointer is over keeps its own wheel, and a plain wheel is
// never claimed anywhere.
const overField = dispatchDocument("wheel", {
  target: byId.get("context-seconds"), deltaY: -120, deltaX: 0, shiftKey: true
});
await flush(2);
assert.ok(!overField.defaultPrevented,
  "and a form control under the pointer keeps its own wheel.");
const plainOffMap = dispatchDocument("wheel", {
  target: byId.get("status"), deltaY: -120, deltaX: 0
});
await flush(2);
assert.ok(!plainOffMap.defaultPrevented,
  "A wheel without Shift is not a Nudge anywhere.");

console.log("Nudge tests passed: source-time quantum, Current Step reversal settlement, Current drag commit and cancel, Shift-drag precision, Shift-wheel accumulation and Timeline/off-map targeting, keyboard nudging, at most one Undo per gesture, no-op retained-object round trips, Guide increments sharing the same operation, Guide Address preview and cancellation, and drag/edit Frame parity.");
