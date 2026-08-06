import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const environment = createSmokeEnvironment();
const {
  byId,
  center,
  tail,
  lead,
  flush,
  poll,
  delay,
  dispatchDocument,
  currentText
} = environment;

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush(3);

const request = (videoId, start = 0) => {
  byId.get("youtube-url").value = `https://youtu.be/${videoId}?t=${start}`;
  byId.get("load-video").click();
};
const finishLoad = async (videoId, start) => {
  request(videoId, start);
  await flush(8);
  await poll();
  await flush(2);
  assert.equal(center().videoId, videoId);
  assert.equal(center().currentTime, start);
};
const bodyTarget = { tagName: "BODY" };

// A and B are requested before either CUED callback runs. A stale CUED carrying
// A's actual adapter identity cannot initialize B, even with valid A metadata.
request("AAAAAAAAAAA", 11);
request("BBBBBBBBBBB", 22);
center().videoId = "AAAAAAAAAAA";
center().duration = 100;
center().events.onStateChange({ data: 5 });
assert.notEqual(byId.get("duration-time").textContent, "1:40",
  "A stale source identity cannot initialize the current generation.");
await flush(3);
center().videoId = "BBBBBBBBBBB";
center().events.onStateChange({ data: 5 });
await flush(5);
await poll();
assert.equal(currentText(), "Current 0:22");
assert.equal(center().videoId, "BBBBBBBBBBB");

byId.get("context-duration").value = "0";
byId.get("context-duration").dispatch("change");
await flush();

// A pending Nudge is settled against B, then its timer is disarmed before C is
// installed. It cannot checkpoint or move the new Session later.
dispatchDocument("keydown", { key: ".", code: "Period", target: bodyTarget });
request("CCCCCCCCCCC", 33);
await flush(8);
await delay(520);
await flush(2);
await poll();
assert.equal(currentText(), "Current 0:33");
assert.equal(byId.get("return-action").disabled, true);

// A live Step gesture is likewise settled in its source and discarded at the
// boundary; a later keyup belongs to no new-source gesture.
dispatchDocument("keydown", { key: "d", code: "KeyD", target: bodyTarget });
request("DDDDDDDDDDD", 44);
await flush(8);
dispatchDocument("keyup", { key: "d", code: "KeyD", target: bodyTarget });
await delay(300);
await poll();
assert.equal(currentText(), "Current 0:44");
assert.equal(byId.get("return-action").disabled, true);

// Automatic Context may be running when the source changes. Its delayed pause
// and observation bounds cannot reach E.
byId.get("context-duration").value = "5";
byId.get("context-duration").dispatch("change");
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 600
});
request("EEEEEEEEEEE", 55);
await flush(8);
await delay(220);
await poll();
assert.equal(currentText(), "Current 0:55");

// Playback has the same single boundary. Player events queued by the old
// transport cannot create history or observation state in F.
byId.get("center-transport-surface").click();
request("FFFFFFFFFFF", 66);
await flush(8);
await poll();
assert.equal(currentText(), "Current 1:06");
assert.equal(byId.get("return-action").disabled, true);

// Build and acquire a Section, bypass its topography, and start translating
// its wire. Replacing the source cancels the drag to its origin, clears the
// bypass and removes every old Guide identity.
byId.get("context-duration").value = "0";
byId.get("context-duration").dispatch("change");
for (const clientX of [200, 400]) {
  byId.get("timeline").dispatch("click", {
    target: byId.get("timeline"),
    clientX
  });
  await flush(2);
}
byId.get("retain").dispatch("click", { shiftKey: true });
await flush(3);
const sectionBody = descendants(byId.get("section-lane"))
  .find(node => node.dataset.sectionGo);
assert.ok(sectionBody);
byId.get("section-lane").dispatch("click", { target: sectionBody });
byId.get("weight-relaxation-toggle").click();
await flush(2);
assert.equal(byId.get("weight-relaxation-toggle")["aria-pressed"], "true");
byId.get("section-lane").dispatch("pointerdown", {
  target: sectionBody,
  clientX: 500,
  pointerId: 71,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: byId.get("status"),
  clientX: 620,
  pointerId: 71,
  buttons: 1
});
request("GGGGGGGGGGG", 77);
await flush(8);
await poll();
assert.equal(currentText(), "Current 1:17");
assert.equal(byId.get("sections-list-count").textContent, "0");
assert.equal(byId.get("weight-relaxation-toggle")["aria-pressed"], "false");

// Current, Pin and Range direct-manipulation owners are each cancelled before
// their provisional frames or coordinates can be observed by the next source.
byId.get("current-marker").dispatch("pointerdown", {
  target: byId.get("current-marker"),
  clientX: 770,
  pointerId: 72,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: byId.get("status"),
  clientX: 820,
  pointerId: 72,
  buttons: 1
});
await finishLoad("HHHHHHHHHHH", 12);
assert.equal(currentText(), "Current 0:12");

byId.get("retain").click();
await flush(3);
const pin = descendants(byId.get("pin-lane")).find(node => node.dataset.pinGo);
assert.ok(pin);
byId.get("pin-lane").dispatch("pointerdown", {
  target: pin,
  clientX: 120,
  pointerId: 73,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: byId.get("status"),
  clientX: 220,
  pointerId: 73,
  buttons: 1
});
await finishLoad("IIIIIIIIIII", 23);
assert.equal(byId.get("pins-list-count").textContent, "0");

byId.get("range-start-handle").dispatch("pointerdown", {
  target: byId.get("range-start-handle"),
  clientX: 0,
  pointerId: 74,
  button: 0,
  buttons: 1
});
byId.get("timeline").dispatch("pointermove", {
  target: byId.get("timeline"),
  clientX: 100,
  pointerId: 74,
  buttons: 1
});
await finishLoad("JJJJJJJJJJJ", 34);
assert.equal(currentText(), "Current 0:34");
assert.equal(byId.get("return-action").disabled, true);
assert.equal(tail().videoId, "JJJJJJJJJJJ");
assert.equal(lead().videoId, "JJJJJJJJJJJ");

// Ripple identity and its uncompleted prospects are source-owned too. The
// boundary cancels its shared Context before installing the next source.
byId.get("context-duration").value = "5";
byId.get("context-duration").dispatch("change");
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 800,
  shiftKey: true
});
await flush(3);
assert.equal(byId.get("ripple-address-marker").hidden, false);
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 2);
await finishLoad("KKKKKKKKKKK", 45);
assert.equal(currentText(), "Current 0:45");
assert.equal(byId.get("ripple-address-marker").hidden, true);
assert.equal(byId.get("ripple-context-window-fill").hidden, true);
assert.equal(descendants(byId.get("traversal-prospect-layer")).length, 0);

console.log("Source boundary smoke passed: load generations reject stale identity, and Nudge, Step, Context, Playback, Ripple/prospects, Section/Current/Pin/Range drags, Guide identity and weight relaxation cannot cross sources.");
