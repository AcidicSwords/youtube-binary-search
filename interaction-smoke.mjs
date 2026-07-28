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
assert.equal(byId.get("pin-count").textContent, "1");
assert.equal(byId.get("pin-label").value, "");
assert.ok(descendants(byId.get("pins-list")).some(node => node.textContent === "Middle"));

byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
byId.get("pin-label").value = "Quarter";
byId.get("pin-capture").dispatch("submit");
await flush();
assert.equal(byId.get("pin-count").textContent, "2");
assert.equal(currentText(), "Current 0:25.000");

byId.get("pin-forward").click();
await flush();
assert.equal(currentText(), "Current 0:50.000", "Next Pin must traverse through the same movement model.");
assert.match(byId.get("section-window").textContent, /0:25\.000–0:50\.000/);

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

// Guide owns Section creation and names the exact current Interval.
byId.get("section-source").value = "interval";
byId.get("section-label").value = "Quarter to middle";
byId.get("section-label").dispatch("input");
byId.get("section-capture").dispatch("submit");
await flush();
assert.equal(byId.get("section-count").textContent, "1");
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

// Native Center playback is the sole ordinary play/pause surface. Pausing
// settles continuous physical movement into the same Session Current/Interval.
center.currentTime = 50;
center.playVideo();
await flush();
center.currentTime = 60;
center.pauseVideo();
await flush();
assert.equal(currentText(), "Current 1:00.000");
assert.match(byId.get("section-window").textContent, /0:50\.000–1:00\.000/);

// Side players are created independently and prime at 1× before applying their
// directional rate. Stretch begins from the physical Center, Hold records the
// measured differential without pausing Center, and local Step uses that offset.
await poll();
await flush(4);
assert.ok(players.has("player-tail") && players.has("player-lead"));
const tail = env.tail();
const lead = env.lead();
assert.equal(tail.playerVars.controls, 0);
assert.equal(lead.playerVars.controls, 0);

byId.get("tail-field-toggle").click(); // Held -> Stretch
center.currentTime = 60;
center.playVideo();
await flush();
await poll();
assert.ok(tail.commands.some(command => command[0] === "play"), "Tail must activate from native Center playback.");
assert.ok(tail.commands.some(command => command[0] === "rate" && command[1] === 0.5), "Tail must request its supported stretch rate after priming.");

tail.currentTime = 56;
center.currentTime = 60;
await poll();
byId.get("tail-field-toggle").click(); // Stretch -> Hold at 4 s
await flush();
assert.equal(center.state, 1, "Holding a side must not interrupt native Center playback.");
assert.equal(byId.get("step-backward-seconds").value, "4");
assert.equal(byId.get("tail-field-toggle-label").textContent, "Stretch");

center.pauseVideo();
await flush();
const beforeSideStep = currentText();
byId.get("tail-step-button").click();
await env.delay(150);
await flush();
assert.notEqual(currentText(), beforeSideStep);
assert.equal(currentText(), "Current 0:56.000", "Tail Step must use the held 4 s differential.");

// Space controls the native Center player rather than a duplicate Continue UI.
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(center.state, 1);
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
assert.equal(center.state, 2);

assert.equal(byId.has("continue"), false);
assert.equal(byId.has("context-action"), false);
assert.equal(byId.has("skim"), false);
assert.equal(byId.get("loop").classList.contains("loop-action"), true);

console.log("Interaction smoke passed: Guide retention, composable Step intervals, frozen Loop, native playback settlement, Field rate priming, Hold/Stretch, side Step, and Space playback.");
