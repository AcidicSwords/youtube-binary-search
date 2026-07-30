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
byId.get("context-seconds").value = "0";
byId.get("context-seconds").dispatch("change");

// Step size is a first-class semantic setting. Adaptive presets are immediate,
// Range-relative, and reversible back to the independent manual value.
byId.get("step-mode-adaptive").click();
await flush();
assert.equal(byId.get("step-size-summary").textContent, "1/16 Range · 6.25s");
byId.get("step-fraction-8").click();
await flush();
assert.equal(byId.get("step-size-summary").textContent, "1/8 Range · 12.5s");
byId.get("step-mode-fixed").click();
await flush();
assert.equal(byId.get("step-size-summary").textContent, "10s manual");

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

// Release the direct-Go extent, then use the Shift layer to traverse Pins.
byId.get("release").click();
dispatchDocument("keydown", { key: "D", code: "KeyD", shiftKey: true });
await flush();
assert.equal(currentText(), "Current 0:50.000", "Next Pin must traverse through the same movement model.");
assert.match(
  byId.get("section-window").textContent,
  /0:25\.000–0:50\.000/,
  "Pin traversal must establish the same retained anchor as Step."
);
assert.match(byId.get("backward-meta").textContent, /^retain anchor · to /,
  "Plain Refine meta must disclose retained-anchor behavior before invocation.");
byId.get("shift-layer-toggle").click();
await flush();
assert.equal(byId.get("refine-backward-label").textContent, "Local Refine Backward");
assert.match(byId.get("backward-meta").textContent, /^shorten Interval · to /,
  "Shift+Refine meta must disclose local membership behavior before invocation.");
byId.get("shift-layer-toggle").click();
await flush();
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:25.000");
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
byId.get("step-backward").click();
await env.delay(150);
await flush();
assert.equal(currentText(), "Current 0:50.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:50\.000/);

// Switch Endpoint preserves the ordered Interval while transposing its active
// endpoint and retained search frame. S owns the same operator; Undo remains a
// separate plain-Z history action outside the matrix.
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:25.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:50\.000/);
assert.match(byId.get("switch-endpoint-meta").textContent, /0:50\.000/);
dispatchDocument("keydown", { key: "s", code: "KeyS" });
await flush();
assert.equal(currentText(), "Current 0:50.000");
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(currentText(), "Current 0:25.000");
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(currentText(), "Current 0:50.000");

// The current Working Interval can own Range without being saved. Leaving restores
// the preceding Range without adding anything to Guide.
byId.get("focus-working-section").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:25.000–0:50.000");
assert.equal(byId.get("focused-section-title").textContent, "Working Section");
assert.equal(byId.get("sections-list-count").textContent, "0");
byId.get("leave-section").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:00.000–1:40.000");
assert.equal(byId.get("sections-list-count").textContent, "0");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:50\.000/);

// Guide owns explicit Section persistence and names the exact Working Section.
byId.get("section-source").value = "interval";
byId.get("section-label").value = "Quarter to middle";
byId.get("section-label").dispatch("input");
byId.get("section-capture").dispatch("submit");
await flush();
assert.equal(byId.get("sections-list-count").textContent, "1");
const sectionNodes = descendants(byId.get("sections-list"));
assert.ok(sectionNodes.some(node => node.textContent === "Quarter to middle"));
assert.ok(sectionNodes.some(node => node.dataset.collapseSection), "Saved Sections must expose Transpose.");
assert.ok(sectionNodes.some(node => node.dataset.focusSection), "Saved Sections must expose Focus.");
assert.ok(sectionNodes.some(node => node.dataset.overwriteSection), "Saved Sections must expose explicit Working Section overwrite.");

// Overwrite is explicit and preserves the retained identity. Undo restores the
// retained Extent, then the preceding Working Section deformation.
byId.get("step-forward").click();
await env.delay(150);
await flush();
assert.match(byId.get("section-window").textContent, /0:25\.000–1:00\.000/);
const overwriteButton = sectionNodes.find(node => node.dataset.overwriteSection);
byId.get("sections-list").dispatch("click", { target: overwriteButton });
assert.equal(byId.get("guide-dialog-title").textContent, "Overwrite Section");
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.ok(
  descendants(byId.get("sections-list")).some(node => /0:25\.000–1:00\.000/.test(node.textContent)),
  "Overwrite must update the retained Section Extent."
);
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.ok(
  descendants(byId.get("sections-list")).some(node => /0:25\.000–0:50\.000/.test(node.textContent)),
  "Undo must restore the retained Section Extent."
);
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.match(byId.get("section-window").textContent, /0:25\.000–0:50\.000/);
byId.get("guide-tab-sections").blur();

const center = env.center();

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
assert.equal(byId.get("step-backward-seconds").value, "10", "Explicit Hold must not overwrite configured Tail Offset.");
assert.equal(byId.get("step-size-seconds").value, "10", "Hold must not overwrite semantic Step size.");
assert.equal(byId.get("section-window").textContent, intervalBeforeStretch,
  "Hold must update neither semantic Step Reach nor Interval.");

byId.get("field-both-toggle").click(); // Hold remaining Lead at 8 s
await flush();
assert.equal(lead.rate, 1);
assert.equal(byId.get("step-forward-seconds").value, "10");
assert.equal(byId.get("field-both-toggle-label").textContent, "Stretch both");
assert.equal(byId.get("section-window").textContent, intervalBeforeStretch);

// Native pause freezes and parks exact side frames. Playback accumulates watched
// coverage without shortening it; the Field remains a separate physical object.
center.currentTime = 58;
tail.currentTime = 54;
lead.currentTime = 66;
center.pauseVideo();
await flush();
await poll();
assert.equal(byId.get("center-transport-surface").hidden, false, "Paused Center must restore the shared activation surface.");
assert.equal(currentText(), "Current 0:58.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:58\.000/);
assert.equal(tail.currentTime, 54, "Paused Tail must display its represented backward frame.");
assert.equal(lead.currentTime, 66, "Paused Lead must display its represented forward frame.");
assert.equal(tail.state, 2);
assert.equal(lead.state, 2);

// Playback settlement must not strand Switch Endpoint on the short physical
// playback segment. It still transposes the preserved Interval endpoints exactly.
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:25.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:58\.000/);
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:58.000");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:58\.000/);

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
assert.match(byId.get("section-window").textContent, /0:25\.000–0:54\.000/);

byId.get("lead-step-button").click();
await env.delay(150);
await flush();
await poll();
assert.equal(currentText(), "Current 1:02.000");
assert.equal(center.currentTime, 62);
assert.equal(tail.currentTime, 58);
assert.equal(lead.currentTime, 70);
assert.match(byId.get("section-window").textContent, /0:25\.000–1:02\.000/);

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
assert.equal(byId.has("loop"), false);
assert.equal(byId.get("release").classList.contains("lifecycle-action"), true);
assert.equal(byId.get("transpose").classList.contains("lifecycle-action"), true);
assert.equal(byId.get("focus-toggle").classList.contains("lifecycle-action"), true);

console.log("Interaction smoke passed: Shift Pin traversal, local Refine preview, unsaved Working Focus, explicit Section overwrite, Switch involution, Undo/Redo ownership, Guide retention, composable Step intervals, shared activation, deterministic refold/stretch, immutable configured offsets, whole-Field side Step, and Space playback.");
