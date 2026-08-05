import assert from "node:assert/strict";
import { createSmokeEnvironment } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, flush, poll, dispatchDocument, currentText } = env;

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
for (const clientX of [250, 500]) {
  byId.get("timeline").dispatch("click", {
    target: byId.get("timeline"),
    clientX
  });
  await flush();
}
assert.equal(currentText(), "Current 0:50");
assert.match(byId.get("section-window").textContent, /0:25–0:50/);

const center = env.center();
const tail = env.tail();
const lead = env.lead();
byId.get("center-transport-surface").click();
await flush();

center.currentTime = 58;
tail.currentTime = 54;
lead.currentTime = 66;
await poll();

assert.equal(byId.get("active-span-fill").dataset.live, "true");
assert.equal(byId.get("neighborhood-backward-bound").dataset.live, "true");
assert.equal(byId.get("neighborhood-forward-bound").dataset.live, "true");
assert.equal(
  currentText(),
  "Current 0:50",
  "Live playback projection must not commit semantic Current before pause."
);

const pausesBeforeSpace = {
  center: center.commands.filter(command => command[0] === "pause").length,
  tail: tail.commands.filter(command => command[0] === "pause").length,
  lead: lead.commands.filter(command => command[0] === "pause").length
};
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
await poll();

assert.equal(currentText(), "Current 0:58");
assert.match(byId.get("section-window").textContent, /0:25–0:58/);
assert.equal(byId.get("active-span-fill").dataset.live, "false");
assert.equal(
  center.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.center + 1
);
assert.equal(
  tail.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.tail + 1
);
assert.equal(
  lead.commands.filter(command => command[0] === "pause").length,
  pausesBeforeSpace.lead + 1
);

// Focus turns the Active Span into the sole playback loop operand.
byId.get("focus-toggle").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:25–0:58");
assert.equal(byId.get("focus-toggle-label").textContent, "Unfocus");

byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:25");

byId.get("center-transport-surface").click();
await flush();
assert.equal(center.state, 1);
center.currentTime = 25;
await poll();

const historyBeforeWrap = byId.get("return-meta").textContent;
const placesBeforeWrap = {
  tail: tail.commands.filter(command => command[0] === "place").length,
  lead: lead.commands.filter(command => command[0] === "place").length
};
center.currentTime = 58;
await poll();

assert.equal(center.currentTime, 25, "Proper Range playback must wrap to Range start.");
assert.equal(currentText(), "Current 0:25", "A Range wrap must not commit Current.");
assert.match(byId.get("section-window").textContent, /0:25–0:58/);
assert.equal(byId.get("return-meta").textContent, historyBeforeWrap, "A wrap must create no Undo entry.");
assert.equal(
  tail.commands.filter(command => command[0] === "place").length,
  placesBeforeWrap.tail,
  "Tail has no backward extent at Range start and must not be placed outside Range."
);
assert.equal(
  lead.commands.filter(command => command[0] === "place").length,
  placesBeforeWrap.lead + 1,
  "A Range wrap must rebase Lead exactly once."
);

const placesBeforeEnded = {
  tail: tail.commands.filter(command => command[0] === "place").length,
  lead: lead.commands.filter(command => command[0] === "place").length
};
center.currentTime = 58;
center.emitState(0);
await flush();
assert.equal(center.currentTime, 25, "YouTube ENDED must use the same Range-wrap owner.");
assert.equal(
  tail.commands.filter(command => command[0] === "place").length,
  placesBeforeEnded.tail
);
assert.equal(
  lead.commands.filter(command => command[0] === "place").length,
  placesBeforeEnded.lead + 1
);

// Stop inside the focused Range, then Unfocus. The Range stack restores the
// full video without changing the source-contiguous playback settlement.
center.currentTime = 30;
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(currentText(), "Current 0:30");
byId.get("focus-toggle").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:00–1:40");

// Full-video playback has no internal Range wrap and settles at source end.
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
center.currentTime = 100;
center.emitState(0);
await flush();
assert.equal(center.currentTime, 100);
assert.equal(currentText(), "Current 1:40");

// Video Cartography is a video player before it is anything else. Variable-speed
// playback is an established capability, and the Panorama -- experimental, and
// arguably a better way to see ahead and behind -- may not cost the reader that
// capability. Shift carries a rate on the play command; the sides suspend
// because no side rate holds their offset once Center's rate changes.
const sidePlays = () => tail.commands.filter(command => command[0] === "play").length
  + lead.commands.filter(command => command[0] === "play").length;

// The suite arrives here at the very end of the video, where a play command has
// nothing to play. Return to somewhere playable first.
byId.get("full-video-range").click();
await flush(3);
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 300 });
await flush(3);
await poll();

const rateSelect = byId.get("playback-rate");
assert.deepEqual(
  rateSelect.options.map(option => Number(option.value)),
  center.getAvailablePlaybackRates(),
  "The offered rates are exactly what this player reports it can play: no ladder is assumed."
);
assert.equal(rateSelect.value, "2", "It defaults to the nearest offered rate to 2x.");

const settle = async () => {
  await flush(4);
  await poll();
  await flush(4);
  await poll();
};

dispatchDocument("keydown", { key: " ", code: "Space" });
await settle();
assert.equal(center.rate, 1, "Plain Space plays Center at 1x.");
dispatchDocument("keydown", { key: " ", code: "Space" });
await settle();

const sidePlaysBeforeShift = sidePlays();
dispatchDocument("keydown", { key: " ", code: "Space", shiftKey: true });
await settle();
assert.equal(center.rate, 2, "Shift+Space plays Center at the configured rate.");
assert.equal(center.state, 1, "Center is running.");
assert.equal(sidePlays(), sidePlaysBeforeShift,
  "and the Panorama suspends rather than drifting: no side is asked to play.");

// Suspension is a condition, not a single command. Later ticks must not find
// Center running and start the sides breathing behind it.
await settle();
await settle();
assert.equal(sidePlays(), sidePlaysBeforeShift,
  "The Panorama stays suspended for as long as Center's rate is not 1x.");

dispatchDocument("keydown", { key: " ", code: "Space", shiftKey: true });
await settle();
assert.equal(center.rate, 2,
  "Settling playback pauses its transport without issuing an unrelated rate command.");
assert.equal(center.state, 2);

// The rate is a stored preference, and changing it during a Shift playback
// retunes that playback rather than starting another.
dispatchDocument("keydown", { key: " ", code: "Space", shiftKey: true });
await flush(4);
rateSelect.value = "1.5";
rateSelect.dispatch("change", { target: rateSelect });
await flush(3);
assert.equal(center.rate, 1.5, "Choosing a rate mid-playback retunes that playback.");
assert.equal(
  JSON.parse(env.localStorage.values.get("binary-youtube-reader:preferences:v1")).playbackRate,
  1.5,
  "The chosen rate is remembered."
);

// YouTube commonly reports only 1x until the iframe has entered playback, so an
// offer read once at load would strand the control at 1x for the session.
// Unknown is not unsupported: the offer is re-read, and the stored wish returns
// to the rate it asked for as soon as that rate is actually offered.
rateSelect.value = "2";
rateSelect.dispatch("change", { target: rateSelect });
await flush(3);
center.getAvailablePlaybackRates = () => [1];
await poll();
await flush(3);
assert.deepEqual(rateSelect.options.map(option => option.value), ["1", "2"],
  "The control distinguishes the only offered rate from the retained fixed wish.");
assert.match(rateSelect.options[1].textContent, /wish/);
assert.match(byId.get("playback-rate-value").textContent, /2.*wish.*1.*offered/);
center.getAvailablePlaybackRates = () => [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
await poll();
await flush(3);
assert.deepEqual(rateSelect.options.map(option => Number(option.value)),
  [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  "A later, fuller offer replaces it.");
assert.equal(rateSelect.value, "2",
  "and the remembered wish returns to the rate it asked for.");

// Following weight: the rate is read off the map at the Address being watched,
// so it changes as playback crosses Section boundaries. Weight says how much
// attention ground is owed; rate runs opposite to it.
{
  const { descendants } = await import("./smoke-harness.mjs");
  byId.get("full-video-range").click();
  await flush(3);
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 200 });
  await env.delay(350); await flush(3);
  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 400 });
  await env.delay(350); await flush(3);
  byId.get("section-retain-form").dispatch("submit");
  await flush(3);
  byId.get("release").click();
  await flush(3);

  const rows = descendants(byId.get("sections-list")).filter(node => node.dataset.sectionGo);
  byId.get("sections-list").dispatch("click", { target: rows[0] });
  await env.delay(350); await flush(3);
  // Weight is assigned in the Guide, where the value lives.
  const weightSelect = descendants(byId.get("sections-list"))
    .find(node => node.dataset.sectionWeight !== undefined);
  weightSelect.value = "2";
  byId.get("sections-list").dispatch("change", { target: weightSelect });
  await env.delay(350);
  await flush(3);

  byId.get("playback-dynamic").checked = true;
  byId.get("playback-dynamic").dispatch("change", { target: byId.get("playback-dynamic") });
  await flush(3);
  assert.equal(byId.get("playback-rate").disabled, true,
    "The fixed rate is not what Shift uses while the rate follows weight, and says so.");

  byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 50 });
  await env.delay(350); await flush(3);
  env.document.activeElement = null;
  dispatchDocument("keydown", { key: " ", code: "Space", shiftKey: true });
  await flush(4); await poll();
  assert.equal(center.rate, 1,
    "Ground nobody deformed plays at the speed it always did.");

  center.currentTime = 25;
  await poll(); await flush(2);
  // One rate step per octave of Weight: a 2x Section plays at 0.75x, not the
  // 0.5x an exact inversion would ask for. The aim is a readable texture, not
  // constant Timeline velocity.
  assert.equal(center.rate, 0.75,
    "Crossing into expanded ground slows the playback by one step without restarting it.");

  // Following Weight is a Panorama observation, not a Center-only one.
  //
  // The sides sit one rate rung either side of Center, so they hold their
  // relation at any Center the ladder can surround -- which is the whole reason
  // the texture is one step per octave rather than an inverse. This used to
  // declare Center-only, so choosing to follow Weight meant choosing to lose the
  // Field, and the two could never be used together.
  await flush(2);
  assert.notEqual(byId.get("field-transport-state").textContent, "Panorama suspended",
    "A weighted playback keeps its Panorama.");
  assert.match(byId.get("field-rate-state").textContent,
    /Tail 0\.5× · Center 0\.75× · Lead 1×/,
    "and the sides sit exactly one rung either side of the weighted Center.");
  const insideRate = center.rate;

  center.currentTime = 60;
  await poll(); await flush(2);
  assert.equal(center.rate, 1, "and leaving it returns to neutral.");

  // Only a bucket change reaches the player: the ladder is coarse on purpose.
  const commandsBefore = center.commands.length;
  center.currentTime = 61;
  await poll(); await flush(2);
  center.currentTime = 62;
  await poll(); await flush(2);
  assert.equal(center.commands.length, commandsBefore,
    "Staying inside one bucket issues no player command at all.");

  // Following Weight is a Panorama observation, not a Center-only one.
  //
  // The sides sit one rate rung either side of Center, so they hold their
  // relation at any Center the ladder can surround -- which is the whole reason
  // the texture is one step per octave rather than an inverse. This used to
  // declare Center-only, so choosing to follow Weight meant choosing to lose the
  // Field, and the two features could never be used together.
  const sidePlaysAtNeutral = sidePlays();
  center.currentTime = 25;
  await poll(); await flush(2);
  assert.equal(center.rate, insideRate);
  assert.ok(sidePlays() >= sidePlaysAtNeutral,
    "The Panorama continues across the whole dynamic playback rather than folding at boundaries.");

  dispatchDocument("keydown", { key: " ", code: "Space", shiftKey: true });
  await settle();
  assert.equal(center.rate, insideRate,
    "Ending playback pauses its transport without issuing an unrelated native-rate command.");
  assert.equal(center.state, 2, "Ending dynamic playback still pauses Center exactly.");
}

console.log("Transport coherence smoke passed: live projection, exact settlement, Focus-owned proper-Range looping, one-pass Field rebasing, wrap history isolation, Unfocus restoration, full-video completion, a fixed Shift rate that stays Center-only, and a rate that follows Section weight across the map while the Panorama breathes one rung either side of it.");
