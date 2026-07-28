import assert from "node:assert/strict";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

const env = createSmokeEnvironment();
const { byId, players, flush, poll, dispatchDocument, currentText } = env;

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await flush(5);
assert.equal(currentText(), "Current 0:00.000");
assert.equal(byId.get("duration-time").textContent, "1:40.000");

// Keep this smoke focused on direct interaction; automatic Context has its own
// dedicated smoke test.
byId.get("context-select").value = "0";
byId.get("context-select").dispatch("change");

byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
await flush();
assert.equal(currentText(), "Current 0:50.000", "Timeline traversal must commit Current.");
assert.equal(byId.get("current-marker").style.left, "50%");

// Guide owns Pin creation, naming, and storage.
byId.get("pin-label").value = "Middle";
byId.get("pin-capture").dispatch("submit");
await flush();
assert.equal(byId.get("pins-list-count").textContent, "1");
assert.equal(byId.get("pin-label").value, "");
assert.ok(descendants(byId.get("pins-list")).some(node => node.textContent === "Middle"));

byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
byId.get("pin-label").value = "Quarter";
byId.get("pin-capture").dispatch("submit");
await flush();
assert.equal(byId.get("pins-list-count").textContent, "2");
assert.equal(currentText(), "Current 0:25.000");

byId.get("pin-forward").click();
await flush();
assert.equal(currentText(), "Current 0:50.000", "Next Pin must traverse through the same movement model.");
assert.equal(
  byId.get("section-window").textContent,
  "No active Interval",
  "Returning to the retained anchor must collapse the Active Interval."
);
byId.get("pin-backward").click();
await flush();
assert.equal(currentText(), "Current 0:25.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:50\.000/);
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:50.000");

// Step edits the active Interval instead of replacing it. Outward Step extends
// the Pin-defined region; inward Step shrinks the same region back to its anchor.
byId.get("step-forward").click();
await env.delay(150);
await flush();
assert.equal(currentText(), "Current 1:00.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–1:00\.000/);
assert.match(byId.get("loop-meta").textContent, /0:25\.000–1:00\.000/);
byId.get("step-backward").click();
await env.delay(150);
await flush();
assert.equal(currentText(), "Current 0:50.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:50\.000/);

// Switch Endpoint preserves the ordered Interval while transposing its active
// endpoint and retained search frame. S owns the same operator; Undo remains a
// separate Ctrl/Cmd+Z history action outside the matrix.
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:25.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:50\.000/);
assert.match(byId.get("switch-endpoint-meta").textContent, /0:50\.000/);
dispatchDocument("keydown", { key: "s", code: "KeyS" });
await flush();
assert.equal(currentText(), "Current 0:50.000");
dispatchDocument("keydown", { key: "z", code: "KeyZ", ctrlKey: true });
await flush();
assert.equal(currentText(), "Current 0:25.000");
dispatchDocument("keydown", { key: "z", code: "KeyZ", ctrlKey: true });
await flush();
assert.equal(currentText(), "Current 0:50.000");

// Guide owns Section creation and names the exact current Interval.
byId.get("section-source").value = "interval";
byId.get("section-label").value = "Quarter to middle";
byId.get("section-label").dispatch("input");
byId.get("section-capture").dispatch("submit");
await flush();
assert.equal(byId.get("sections-list-count").textContent, "1");
const sectionNodes = descendants(byId.get("sections-list"));
assert.ok(sectionNodes.some(node => node.textContent === "Quarter to middle"));
assert.ok(sectionNodes.some(node => node.dataset.loopSection), "Saved Sections must expose their own Loop action.");

// Matrix Loop freezes the current Interval. Its internal wrap is physical only:
// semantic Current and the consumed Interval remain unchanged.
const center = env.center();
byId.get("loop").click();
await flush();
assert.equal(byId.get("loop-label").textContent, "Stop Loop");
assert.equal(center.currentTime, 25);
assert.equal(center.state, 1);
center.currentTime = 50;
await poll();
assert.equal(center.currentTime, 25, "Loop must wrap to its frozen start.");
assert.equal(currentText(), "Current 0:50.000", "Loop wraps must not commit a new Current.");
assert.match(byId.get("loop-meta").textContent, /0:25\.000–0:50\.000/);
center.pauseVideo();
await flush();
assert.equal(byId.get("loop-label").textContent, "Loop");
assert.equal(center.currentTime, 50, "Stopping Loop restores its semantic anchor.");

// Tail and Lead are ready before the paused Center surface accepts ordinary
// playback. Once activated, every paused side is parked on the exact frame it
// represents rather than being re-cued to YouTube's source thumbnail.
await poll();
await flush(4);
assert.ok(players.has("player-tail") && players.has("player-lead"));
const tail = env.tail();
const lead = env.lead();
assert.equal(byId.get("center-transport-surface").disabled, false);
assert.equal(tail.playerVars.controls, 0);
assert.equal(lead.playerVars.controls, 0);
assert.equal(tail.createdWhileFieldOff, false, "Tail must be created only after its pane is measurable.");
assert.equal(lead.createdWhileFieldOff, false, "Lead must be created only after its pane is measurable.");
assert.match(String(tail.iframe.allow || ""), /autoplay/, "Tail iframe must explicitly receive autoplay permission.");
assert.match(String(lead.iframe.allow || ""), /autoplay/, "Lead iframe must explicitly receive autoplay permission.");
assert.ok(tail.commands.some(command => command[0] === "cue"), "Tail must use cue only for pre-activation placement.");
assert.ok(lead.commands.some(command => command[0] === "cue"), "Lead must use cue only for pre-activation placement.");

// Collapse is projection-local: hiding Tail pauses only Tail, exposes its
// restore rail, and leaves Lead's established frame untouched.
const leadBeforeCollapse = lead.currentTime;
const leadPlacesBeforeCollapse = lead.commands.filter(command => command[0] === "place").length;
byId.get("tail-collapse").click();
await flush();
await poll();
assert.equal(byId.get("tail-pane").classList.contains("is-collapsed"), true);
assert.equal(byId.get("tail-restore").hidden, false);
assert.equal(byId.get("field-both-toggle-label").textContent, "Stretch visible side");
assert.equal(lead.currentTime, leadBeforeCollapse);
assert.equal(lead.commands.filter(command => command[0] === "place").length, leadPlacesBeforeCollapse);
byId.get("tail-restore").click();
await flush();
await poll();
assert.equal(byId.get("tail-pane").classList.contains("is-collapsed"), false);
assert.equal(byId.get("tail-restore").hidden, true);

// One parent-page click refolds both sides to Center and requests Tail, Center,
// and Lead synchronously. It is a fresh Stretch regardless of the prior held
// geometry; the semantic Interval remains untouched while the Field forms.
center.currentTime = 50;
const intervalBeforeStretch = byId.get("section-window").textContent;
const playCounts = {
  center: center.commands.filter(command => command[0] === "play").length,
  tail: tail.commands.filter(command => command[0] === "play").length,
  lead: lead.commands.filter(command => command[0] === "play").length
};
byId.get("center-transport-surface").click();
assert.equal(center.commands.filter(command => command[0] === "play").length, playCounts.center + 1);
assert.equal(tail.commands.filter(command => command[0] === "play").length, playCounts.tail + 1);
assert.equal(lead.commands.filter(command => command[0] === "play").length, playCounts.lead + 1);
assert.deepEqual(tail.commands.slice(-2).map(command => command[0]), ["place", "play"], "Activated Tail must refold to Center before it plays.");
assert.deepEqual(lead.commands.slice(-2).map(command => command[0]), ["place", "play"], "Activated Lead must refold to Center before it plays.");
await flush();
assert.equal(byId.get("center-transport-surface").hidden, true, "Native Center controls must be exposed while ordinary playback is running.");

// The Field forms from authoritative Center progression. Tail and Lead use
// confirmed directional rates, while Hold freezes the measured visible frame.
for (let elapsed = 1; elapsed <= 8; elapsed += 1) {
  center.currentTime = 50 + elapsed;
  tail.currentTime = 50 + elapsed * 0.5;
  lead.currentTime = 50 + elapsed * 2;
  await poll();
}
assert.equal(tail.rate, 0.5, "Tail must use its confirmed sub-1x rate while stretching.");
assert.equal(lead.rate, 2, "Lead must use its confirmed supra-1x rate while stretching.");
assert.equal(byId.get("tail-offset-state").textContent, "4s / 10s");
assert.equal(byId.get("lead-offset-state").textContent, "8s / 10s");
assert.equal(byId.get("section-window").textContent, intervalBeforeStretch,
  "Stretch progression must never rewrite the semantic Interval.");

byId.get("tail-field-toggle").click(); // Stretch -> Hold at 4 s
await flush();
assert.equal(center.state, 1, "Holding a side must not interrupt Center playback.");
assert.equal(tail.rate, 1, "Held Tail must match Center at 1x.");
assert.equal(byId.get("step-backward-seconds").value, "4", "Explicit Hold adopts its visible offset as backward Step size.");
assert.equal(byId.get("section-window").textContent, intervalBeforeStretch,
  "Hold may update Step Reach but must not rewrite Interval.");

byId.get("field-both-toggle").click(); // Hold remaining Lead at 8 s
await flush();
assert.equal(lead.rate, 1);
assert.equal(byId.get("step-forward-seconds").value, "8");
assert.equal(byId.get("field-both-toggle-label").textContent, "Stretch both");
assert.equal(byId.get("section-window").textContent, intervalBeforeStretch);

// Native pause freezes and parks exact side frames. Playback settlement alone
// writes the playback Interval; the Field remains a separate physical object.
center.currentTime = 58;
tail.currentTime = 54;
lead.currentTime = 66;
center.pauseVideo();
await flush();
await poll();
assert.equal(byId.get("center-transport-surface").hidden, false, "Paused Center must restore the shared activation surface.");
assert.equal(currentText(), "Current 0:58.000");
assert.match(byId.get("section-window").textContent, /0:50\.000–0:58\.000/);
assert.equal(tail.currentTime, 54, "Paused Tail must display its represented backward frame.");
assert.equal(lead.currentTime, 66, "Paused Lead must display its represented forward frame.");
assert.equal(tail.state, 2);
assert.equal(lead.state, 2);

// Side Step uses the visible pane offset and translates the complete Field.
// Repeated clicks therefore behave like a temporal slideshow while Step edits
// the same semantic Interval.
byId.get("tail-player-surface").click();
await env.delay(150);
await flush();
await poll();
assert.equal(currentText(), "Current 0:54.000");
assert.equal(center.currentTime, 54);
assert.equal(tail.currentTime, 50);
assert.equal(lead.currentTime, 62);
assert.match(byId.get("section-window").textContent, /0:50\.000–0:54\.000/);

byId.get("lead-step-button").click();
await env.delay(150);
await flush();
await poll();
assert.equal(currentText(), "Current 1:02.000");
assert.equal(center.currentTime, 62);
assert.equal(tail.currentTime, 58);
assert.equal(lead.currentTime, 70);
assert.match(byId.get("section-window").textContent, /0:50\.000–1:02\.000/);

// Space uses the same shared activation and always begins a fresh refold/stretch.
const tailPlayBeforeSpace = tail.commands.filter(command => command[0] === "play").length;
const leadPlayBeforeSpace = lead.commands.filter(command => command[0] === "play").length;
dispatchDocument("keydown", { key: " ", code: "Space" });
assert.equal(tail.commands.filter(command => command[0] === "play").length, tailPlayBeforeSpace + 1);
assert.equal(lead.commands.filter(command => command[0] === "play").length, leadPlayBeforeSpace + 1);
assert.deepEqual(tail.commands.slice(-2), [["place", 62], ["play"]]);
assert.deepEqual(lead.commands.slice(-2), [["place", 62], ["play"]]);
await flush();
assert.equal(center.state, 1);
center.currentTime = 64;
tail.currentTime = 63;
lead.currentTime = 66;
await poll();
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
await poll();
assert.equal(center.state, 2);
assert.equal(tail.state, 2);
assert.equal(lead.state, 2);

assert.equal(byId.has("continue"), false);
assert.equal(byId.has("context-action"), false);
assert.equal(byId.has("skim"), false);
assert.equal(byId.get("loop").classList.contains("loop-action"), true);

console.log("Interaction smoke passed: Endpoint Transposition, separate Undo, Guide retention, composable Step intervals, collapse isolation, frozen Loop, shared activation, deterministic refold/stretch, confirmed rates, exact paused frames, Hold isolation, whole-Field side Step, and Space playback.");
