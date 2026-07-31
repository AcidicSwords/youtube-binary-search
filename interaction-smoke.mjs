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
assert.equal(currentText(), "Current 0:00");
assert.equal(byId.get("duration-time").textContent, "1:40");

// Tune rejects an empty/invalid Offset without silently converting it to the
// minimum or leaving the field showing a value the model did not accept.
byId.get("step-backward-seconds").value = "";
byId.get("step-backward-seconds").dispatch("change");
await flush();
assert.equal(byId.get("step-backward-seconds").value, "10");
assert.match(byId.get("status").textContent, /positive number/);

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

// Idle Viewer ownership follows the last semantic operator. Step is the
// default; Refine and Reopen expose the exact next weighted midpoint choices.
await poll();
await flush(3);
const previewTail = env.tail();
const previewLead = env.lead();
assert.equal(byId.get("field-transport-state").textContent, "Step frame");
assert.equal(previewTail.currentTime, 0);
assert.equal(previewLead.currentTime, 10);
byId.get("refine-forward").click();
await flush();
await poll();
assert.equal(currentText(), "Current 0:50");
assert.equal(byId.get("field-transport-state").textContent, "Refine frame");
assert.equal(previewTail.currentTime, 25);
assert.equal(previewLead.currentTime, 75);
byId.get("refine-forward").click();
await flush();
await poll();
assert.equal(currentText(), "Current 1:15");
assert.equal(byId.get("field-transport-state").textContent, "Refine frame");
assert.equal(previewTail.currentTime, 37.5);
assert.equal(previewLead.currentTime, 87.5);
byId.get("return-action").click();
byId.get("return-action").click();
await flush();
await poll();
assert.equal(currentText(), "Current 0:00");

byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 100
});
await flush();
assert.equal(currentText(), "Current 0:10");
byId.get("reopen").click();
await flush();
await poll();
assert.equal(byId.get("field-transport-state").textContent, "Reopen frame");
assert.equal(previewTail.currentTime, 5);
assert.equal(previewLead.currentTime, 55);
byId.get("return-action").click();
byId.get("return-action").click();
await flush();
await poll();
assert.equal(currentText(), "Current 0:00");
assert.equal(byId.get("field-transport-state").textContent, "Step frame");
assert.equal(previewTail.currentTime, 0);
assert.equal(previewLead.currentTime, 10);

byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
await flush();
assert.equal(currentText(), "Current 0:50", "Timeline traversal must commit Current.");
assert.equal(byId.get("current-marker").style.left, "50%");

// Current is a first-class Timeline object. Drag previews the candidate as the
// visible Current and Center, then release commits one exact Go transaction.
const currentMarker = byId.get("current-marker");
currentMarker.dispatch("pointerdown", {
  target: currentMarker,
  currentTarget: currentMarker,
  clientX: 500,
  pointerId: 91,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: currentMarker,
  clientX: 600,
  pointerId: 91,
  button: 0,
  buttons: 1
});
await flush();
assert.equal(currentText(), "Current 1:00", "Current drag preview must visibly follow the candidate before release.");
assert.equal(env.center().currentTime, 60, "Center must preview the candidate Current frame.");
dispatchDocument("pointerup", {
  target: currentMarker,
  clientX: 600,
  pointerId: 91,
  button: 0,
  buttons: 0
});
await flush();
assert.equal(currentText(), "Current 1:00");
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(currentText(), "Current 0:50");

// Fine Nudge acts in source time and settles one repeated gesture as one Undo.
currentMarker.dispatch("keydown", { key: ",", code: "Comma" });
await env.delay(220);
await flush();
assert.match(byId.get("status").textContent, /Nudged Current/);
assert.notEqual(byId.get("current-marker").style.left, "50%");
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
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
assert.equal(currentText(), "Current 0:25");

// Release the direct-Go extent, then use the Shift layer to traverse Pins.
byId.get("release").click();
dispatchDocument("keydown", { key: "D", code: "KeyD", shiftKey: true });
await flush();
assert.equal(currentText(), "Current 0:50", "Next Pin must traverse through the same movement model.");
assert.match(
  byId.get("section-window").textContent,
  /0:25–0:50/,
  "Pin traversal must establish the same retained anchor as Step."
);
assert.match(byId.get("backward-meta").textContent, /^full movement · to /,
  "Plain Refine meta must disclose that reaching the retained anchor records the complete movement.");
byId.get("shift-layer-toggle").click();
await flush();
assert.equal(byId.get("refine-backward-label").textContent, "Local Refine Backward");
assert.match(byId.get("backward-meta").textContent, /^draw Current-to-midpoint Interval · to /,
  "Shift+Refine meta must disclose the new Current-to-midpoint extent before invocation.");
byId.get("shift-layer-toggle").click();
await flush();
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:25");
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:50");

// Step edits the active Interval instead of replacing it. Outward Step extends
// the Pin-defined region; inward Step shrinks the same region back to its anchor.
byId.get("step-forward").click();
await env.delay(150);
await flush();
assert.equal(currentText(), "Current 1:00");
assert.match(byId.get("section-window").textContent, /0:25–1:00/);
byId.get("step-backward").click();
await env.delay(150);
await flush();
assert.equal(currentText(), "Current 0:50");
assert.match(byId.get("section-window").textContent, /0:25–0:50/);

// Switch Endpoint preserves the ordered Interval while transposing its active
// endpoint and retained search frame. S owns the same operator; Undo remains a
// separate plain-Z history action outside the matrix.
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:25");
assert.match(byId.get("section-window").textContent, /0:25–0:50/);
assert.match(byId.get("switch-endpoint-meta").textContent, /0:50/);
dispatchDocument("keydown", { key: "s", code: "KeyS" });
await flush();
assert.equal(currentText(), "Current 0:50");
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(currentText(), "Current 0:25");
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.equal(currentText(), "Current 0:50");

// The current Working Interval can own Range without being saved. Leaving restores
// the preceding Range without adding anything to Guide.
byId.get("focus-working-section").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:25–0:50");
assert.equal(byId.get("focused-section-title").textContent, "Working Section");
assert.equal(byId.get("sections-list-count").textContent, "0");
byId.get("leave-section").click();
await flush();
assert.equal(byId.get("range-label").textContent, "0:00–1:40");
assert.equal(byId.get("sections-list-count").textContent, "0");
assert.match(byId.get("section-window").textContent, /0:25–0:50/);

// Guide owns explicit Section persistence and names the exact Working Section.
byId.get("section-source").value = "interval";
byId.get("section-label").value = "Quarter to middle";
byId.get("section-label").dispatch("input");
byId.get("section-capture").dispatch("submit");
await flush();
assert.equal(byId.get("sections-list-count").textContent, "1");
const sectionNodes = descendants(byId.get("sections-list"));
assert.ok(sectionNodes.some(node => node.textContent.startsWith("Quarter to middle")));
assert.ok(sectionNodes.some(node => node.dataset.sectionWeight), "Saved Sections must expose timeline weight.");
assert.ok(sectionNodes.some(node => node.dataset.focusSection), "Saved Sections must expose Focus.");
assert.ok(sectionNodes.some(node => node.dataset.renameSection), "Rename must sit beside the Section title.");
assert.ok(sectionNodes.some(node => node.dataset.deleteSection), "Delete must sit beside the Section title.");
assert.ok(
  sectionNodes.every(node => !node.dataset.overwriteSection),
  "Direct endpoint/profile editing replaces the redundant Overwrite action."
);
assert.equal(
  sectionNodes.some(node => node.classList.contains("guide-item-more")),
  false,
  "Guide actions must not be buried behind a redundant More disclosure."
);

// Editing a selected Section must preserve its operational selection so another
// weight, endpoint, Focus, Rename, or Delete action remains immediately available.
const weightControl = sectionNodes.find(node => node.dataset.sectionWeight);
weightControl.value = "0.75";
byId.get("sections-list").dispatch("change", { target: weightControl });
await flush();
const controlsAfterWeight = descendants(byId.get("sections-list"));
assert.ok(controlsAfterWeight.some(node => node.dataset.sectionWeight));
assert.ok(controlsAfterWeight.some(node => node.dataset.guideAddressKind === "section-endpoint"));
assert.match(
  controlsAfterWeight.find(node => node.dataset.sectionWeight).value,
  /0\.75/
);
const secondWeightControl = controlsAfterWeight.find(node => node.dataset.sectionWeight);
secondWeightControl.value = "1";
byId.get("sections-list").dispatch("change", { target: secondWeightControl });
await flush();
assert.equal(
  descendants(byId.get("sections-list"))
    .find(node => node.dataset.sectionWeight)
    .value,
  "1",
  "A selected Section must accept consecutive edits without reselection."
);

// Linking is the spatial inverse of Unlink. Unlink gives one Section its own
// coincident endpoint; dragging that Pin into the target's snap radius merges
// ownership again as the same single Undoable gesture.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 750
});
await flush();
byId.get("section-label").value = "Link test";
byId.get("section-capture").dispatch("submit");
await flush();
assert.equal(byId.get("sections-list-count").textContent, "2");
const guideItemNamed = name => descendants(byId.get("sections-list"))
  .find(node =>
    node.classList.contains("guide-item")
    && descendants(node).some(child =>
      child.classList.contains("guide-item-title")
      && child.textContent === name
    )
  );
const originalSectionMain = descendants(guideItemNamed("Quarter to middle"))
  .find(node => node.dataset.sectionGo);
byId.get("sections-list").dispatch("click", { target: originalSectionMain });
await flush();
const unlinkEnd = descendants(byId.get("sections-list"))
  .find(node =>
    node.dataset.unlinkSectionEndpoint
    && node.dataset.sectionEndpoint === "end"
  );
assert.ok(unlinkEnd, "A shared Section endpoint must expose Unlink.");
byId.get("sections-list").dispatch("click", { target: unlinkEnd });
await flush();
assert.equal(
  byId.get("pins-list-count").textContent,
  "3",
  "Opening Unlink must not change graph ownership before confirmation."
);
assert.equal(byId.get("guide-dialog-title").textContent, "Unlink End Pin");
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.equal(byId.get("pins-list-count").textContent, "4");
const independentEnd = descendants(byId.get("section-lane"))
  .find(node =>
    node.dataset.pinDrag
    && node.dataset.dragSection
    && /^Move End/.test(node["aria-label"] || "")
  );
assert.ok(independentEnd, "Unlink must leave the independent endpoint directly draggable on the Timeline.");
byId.get("section-lane").dispatch("pointerdown", {
  target: independentEnd,
  clientX: 500,
  pointerId: 62,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: independentEnd,
  clientX: 507,
  pointerId: 62,
  button: 0,
  buttons: 1
});
await flush();
assert.ok(
  descendants(byId.get("pin-lane"))
    .some(node => node.classList.contains("snap-target")),
  "Entering the snap radius must visibly identify a possible ownership target."
);
assert.ok(
  !descendants(byId.get("pin-lane"))
    .some(node => node.classList.contains("snap-armed")),
  "Merely crossing the snap radius must not arm a structural link."
);
dispatchDocument("pointermove", {
  target: independentEnd,
  clientX: 530,
  pointerId: 62,
  button: 0,
  buttons: 1
});
await flush();
assert.ok(
  !descendants(byId.get("pin-lane"))
    .some(node => node.classList.contains("snap-target")),
  "Leaving the radius must clear the candidate without linking."
);
dispatchDocument("pointermove", {
  target: independentEnd,
  clientX: 507,
  pointerId: 62,
  button: 0,
  buttons: 1
});
await env.delay(500);
await flush();
assert.ok(
  descendants(byId.get("pin-lane"))
    .some(node => node.classList.contains("snap-armed")),
  "Holding over one candidate must arm the deliberate release-to-link gesture."
);
dispatchDocument("pointerup", {
  target: independentEnd,
  clientX: 507,
  pointerId: 62,
  button: 0,
  buttons: 0
});
await flush();
assert.equal(byId.get("pins-list-count").textContent, "3");
assert.match(byId.get("status").textContent, /Linked with/);
assert.ok(
  descendants(byId.get("sections-list"))
    .some(node =>
      node.dataset.unlinkSectionEndpoint
      && node.dataset.sectionEndpoint === "end"
    ),
  "A snapped endpoint must immediately expose Unlink as the inverse action."
);
const linkTestDelete = descendants(guideItemNamed("Link test"))
  .find(node => node.dataset.deleteSection);
byId.get("sections-list").dispatch("click", { target: linkTestDelete });
byId.get("guide-dialog-form").dispatch("submit");
await flush();
assert.equal(byId.get("sections-list-count").textContent, "1");
byId.get("sections-list").dispatch("click", {
  target: descendants(guideItemNamed("Quarter to middle"))
    .find(node => node.dataset.sectionGo)
});
await flush();
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
assert.equal(byId.get("field-transport-state").textContent, "Section frame");
assert.equal(tail.currentTime, 25, "Tail must preview the selected Section start.");
assert.equal(lead.currentTime, 50, "Lead must preview the selected Section end.");
assert.equal(byId.get("center-transport-surface").disabled, false);
assert.equal(tail.playerVars.controls, 0);
assert.equal(lead.playerVars.controls, 0);
assert.equal(tail.createdWhileFieldOff, false, "Tail must be created only after its pane is measurable.");
assert.equal(lead.createdWhileFieldOff, false, "Lead must be created only after its pane is measurable.");
assert.match(String(tail.iframe.allow || ""), /autoplay/, "Tail iframe must explicitly receive autoplay permission.");
assert.match(String(lead.iframe.allow || ""), /autoplay/, "Lead iframe must explicitly receive autoplay permission.");
assert.ok(tail.commands.some(command => command[0] === "cue"), "Tail must use cue only for pre-activation placement.");
assert.ok(lead.commands.some(command => command[0] === "cue"), "Lead must use cue only for pre-activation placement.");

// A retained Section is one object in Guide, Timeline, and Field. Selecting its
// Guide row establishes its exact Extent and returns Current to the midpoint.
// Dragging either endpoint on the Timeline uses the captured projection and
// previews the Section as Tail=start, Center=midpoint, Lead=end.
let selectedSectionMain = descendants(byId.get("sections-list"))
  .find(node => node.dataset.sectionGo);
byId.get("sections-list").dispatch("click", { target: selectedSectionMain });
await flush();
assert.equal(currentText(), "Current 0:37.5");
assert.equal(
  descendants(byId.get("pin-lane"))
    .filter(node => node.dataset.pinGo && node.classList.contains("extent-selected"))
    .length,
  2,
  "Working Interval bounds aligned with Pins must select both endpoint Pins."
);
let selectedSectionNodes = descendants(byId.get("sections-list"));
const startEndpoint = descendants(byId.get("section-lane")).find(node =>
  node.dataset.pinDrag
    && node.dataset.dragSection
    && /^Move Start/.test(node["aria-label"] || "")
);
assert.ok(startEndpoint, "A selected Section must expose draggable endpoint nodes on the Timeline.");
byId.get("section-lane").dispatch("pointerdown", {
  target: startEndpoint,
  clientX: 250,
  pointerId: 41,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: startEndpoint,
  clientX: 150,
  pointerId: 41,
  button: 0,
  buttons: 1
});
await flush();
assert.equal(byId.get("field-transport-state").textContent, "Section frame");
assert.equal(byId.get("field-span-label").textContent, "0:15–0:50");
assert.match(
  byId.get("section-window").textContent,
  /0:15–0:50/,
  "Dragging an aligned endpoint Pin must reshape the Working Interval."
);
assert.equal(tail.currentTime, 15);
assert.equal(center.currentTime, 32.5);
assert.equal(lead.currentTime, 50);
assert.ok(
  descendants(byId.get("sections-list")).some(node => /0:15–0:50/.test(node.textContent)),
  "Timeline endpoint drag distance must follow the captured projection."
);
dispatchDocument("pointerup", { target: startEndpoint, pointerId: 41 });
await flush();
assert.equal(
  byId.get("field-transport-state").textContent,
  "Section frame",
  "After an endpoint edit, the stable Field must retain one coherent settled frame instead of switching owners."
);
assert.ok(
  descendants(byId.get("sections-list")).some(node => node.dataset.sectionWeight),
  "Endpoint drag must preserve the parent Section's operational controls."
);
dispatchDocument("keydown", { key: "z", code: "KeyZ" });
await flush();
assert.ok(
  descendants(byId.get("sections-list")).some(node => /0:25–0:50/.test(node.textContent)),
  "Undo must restore a committed Timeline endpoint drag as one transaction."
);
const restoredEndpoint = descendants(byId.get("sections-list")).find(node =>
  node.dataset.pinGo && /^Start Pin/.test(node["aria-label"] || "")
);
byId.get("sections-list").dispatch("click", { target: restoredEndpoint });
await flush();
assert.ok(
  descendants(byId.get("sections-list")).some(node => node.dataset.sectionWeight),
  "Going to a Section endpoint must retain the Section as the operational object."
);

// A stationary Timeline Pin gesture is exact Go; it does not become a manual
// selection mode. Its centered drag acquisition remains dormant below threshold.
const timelineEndpoint = descendants(byId.get("pin-lane"))
  .find(node => node.dataset.pinGo && /0:50/.test(node["aria-label"]));
assert.ok(timelineEndpoint, "The visible Timeline endpoint Pin must be directly actionable.");
byId.get("pin-lane").dispatch("pointerdown", {
  target: timelineEndpoint,
  clientX: 320,
  pointerId: 43,
  button: 0,
  buttons: 1
});
dispatchDocument("pointerup", {
  target: timelineEndpoint,
  clientX: 320,
  pointerId: 43,
  button: 0,
  buttons: 0
});
byId.get("pin-lane").dispatch("click", { target: timelineEndpoint });
await flush();
assert.equal(currentText(), "Current 0:50");
assert.equal(
  descendants(byId.get("pin-lane"))
    .filter(node => node.dataset.pinGo && node.classList.contains("extent-selected"))
    .length,
  2,
  "Pin Go must preserve endpoint selection derived from the Working Interval."
);

// The Timeline midpoint/profile is the whole-Section handle. Its preview
// translates all three viewer addresses together; cancelling restores both the Guide and Field.
selectedSectionMain = descendants(byId.get("sections-list"))
  .find(node => node.dataset.sectionGo);
byId.get("sections-list").dispatch("click", { target: selectedSectionMain });
await flush();
selectedSectionNodes = descendants(byId.get("sections-list"));
const sectionProfile = descendants(byId.get("section-lane"))
  .find(node => node.dataset.sectionDrag);
assert.ok(sectionProfile, "The Timeline must expose a whole-Section drag surface.");
byId.get("section-lane").dispatch("pointerdown", {
  target: sectionProfile,
  clientX: 375,
  pointerId: 42,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: sectionProfile,
  clientX: 475,
  pointerId: 42,
  button: 0,
  buttons: 1
});
await flush();
assert.equal(byId.get("field-transport-state").textContent, "Section frame");
assert.equal(byId.get("field-span-label").textContent, "0:35–1:00");
assert.match(
  byId.get("section-window").textContent,
  /0:35–1:00/,
  "Translating both aligned endpoint Pins must translate the Working Interval."
);
assert.equal(tail.currentTime, 35);
assert.equal(center.currentTime, 47.5);
assert.equal(lead.currentTime, 60);
dispatchDocument("pointercancel", { target: sectionProfile, pointerId: 42 });
await flush();
assert.equal(byId.get("field-transport-state").textContent, "Section frame");
assert.equal(tail.currentTime, 25);
assert.equal(lead.currentTime, 50);
assert.ok(
  descendants(byId.get("sections-list")).some(node => /0:25–0:50/.test(node.textContent)),
  "Cancelling a whole-Section Timeline drag must restore its original Extent."
);

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

// One parent-page click establishes the configured inner panorama and requests
// Tail, Center, and Lead synchronously. It begins a fresh bounded Breath while
// leaving the semantic Interval untouched.
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
assert.equal(tail.commands.at(-1)?.[0], "play", "Activated Tail must play from the inner breathing boundary.");
assert.equal(lead.commands.at(-1)?.[0], "play", "Activated Lead must play from the inner breathing boundary.");
await flush();
assert.equal(byId.get("center-transport-surface").hidden, true, "Native Center controls must be exposed while ordinary playback is running.");

// The Field forms from authoritative Center progression. Tail and Lead use
// confirmed directional rates, while Hold freezes the measured visible frame.
for (let elapsed = 1; elapsed <= 8; elapsed += 1) {
  center.currentTime = 50 + elapsed;
  tail.currentTime = 47.5 + elapsed * 0.5;
  lead.currentTime = 52.5 + elapsed * 1.5;
  await poll();
}
assert.equal(tail.rate, 0.5, "Tail must use its confirmed sub-1x rate while stretching.");
assert.equal(lead.rate, 1.5, "Lead must use the symmetric confirmed supra-1x rate while stretching.");
assert.equal(byId.get("tail-offset-state").textContent, "6s / 10s");
assert.equal(byId.get("lead-offset-state").textContent, "6s / 10s");
assert.equal(byId.get("section-window").textContent, intervalBeforeStretch,
  "Stretch progression must never rewrite the semantic Interval.");

byId.get("tail-field-toggle").click(); // Breath -> Hold at attained offset
await flush();
assert.equal(center.state, 1, "Holding a side must not interrupt Center playback.");
assert.equal(tail.rate, 1, "Held Tail must match Center at 1x.");
assert.equal(byId.get("step-backward-seconds").value, "10", "Explicit Hold must not overwrite configured Tail Offset.");
assert.equal(byId.get("step-size-seconds").value, "10", "Hold must not overwrite semantic Step size.");
assert.equal(byId.get("section-window").textContent, intervalBeforeStretch,
  "Hold must update neither semantic Step Reach nor Interval.");

byId.get("field-both-toggle").click(); // Hold remaining Lead
await flush();
assert.equal(lead.rate, 1);
assert.equal(byId.get("step-forward-seconds").value, "10");
assert.equal(byId.get("field-both-toggle-label").textContent, "Stretch both");
assert.equal(byId.get("section-window").textContent, intervalBeforeStretch);

// Native pause settles playback, preserves its attained relation internally,
// then returns the panes to the operator frame because Context is disabled in this smoke.
center.currentTime = 58;
tail.currentTime = 54;
lead.currentTime = 66;
center.pauseVideo();
await flush();
await poll();
assert.equal(byId.get("center-transport-surface").hidden, false, "Paused Center must restore the shared activation surface.");
assert.equal(currentText(), "Current 0:58");
assert.match(byId.get("section-window").textContent, /0:25–0:58/);
assert.equal(byId.get("field-transport-state").textContent, "Step frame");
assert.equal(tail.currentTime, 48, "Paused Tail must preview the exact Step Backward destination.");
assert.equal(lead.currentTime, 68, "Paused Lead must preview the exact Step Forward destination.");
assert.equal(tail.state, 2);
assert.equal(lead.state, 2);

// Playback settlement must not strand Switch Endpoint on the short physical
// playback segment. It still transposes the preserved Interval endpoints exactly.
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:25");
assert.match(byId.get("section-window").textContent, /0:25–0:58/);
byId.get("switch-endpoint").click();
await flush();
assert.equal(currentText(), "Current 0:58");
assert.match(byId.get("section-window").textContent, /0:25–0:58/);

// Side panes display and invoke the same semantic Step destinations. The stored
// playback Hold relation remains separate and returns only when playback starts.
byId.get("tail-player-surface").click();
await env.delay(150);
await flush();
await poll();
assert.equal(currentText(), "Current 0:48");
assert.equal(center.currentTime, 48);
assert.equal(tail.currentTime, 38);
assert.equal(lead.currentTime, 58);
assert.match(byId.get("section-window").textContent, /0:25–0:48/);

byId.get("lead-player-surface").click();
await env.delay(150);
await flush();
await poll();
assert.equal(currentText(), "Current 0:58");
assert.equal(center.currentTime, 58);
assert.equal(tail.currentTime, 48);
assert.equal(lead.currentTime, 68);
assert.match(byId.get("section-window").textContent, /0:25–0:58/);

// Space uses the same shared activation and begins a fresh bounded Breath from the current Field relation.
const tailPlayBeforeSpace = tail.commands.filter(command => command[0] === "play").length;
const leadPlayBeforeSpace = lead.commands.filter(command => command[0] === "play").length;
byId.get("lead-player-surface").focus();
const focusedSpace = dispatchDocument("keydown", { key: " ", code: "Space" });
assert.equal(focusedSpace.defaultPrevented, true, "Space must remain playback while a button has focus.");
assert.equal(tail.commands.filter(command => command[0] === "play").length, tailPlayBeforeSpace + 1);
assert.equal(lead.commands.filter(command => command[0] === "play").length, leadPlayBeforeSpace + 1);
assert.equal(tail.commands.at(-1)?.[0], "play");
assert.equal(lead.commands.at(-1)?.[0], "play");
assert.equal(tail.rate, 0.5);
assert.equal(lead.rate, 1.5);
await flush();
assert.equal(center.state, 1);
center.iframe.focus();
center.emitState(1);
await flush();
assert.equal(env.document.activeElement, null, "Center play must return keyboard ownership from its iframe.");
center.currentTime = 64;
tail.currentTime = 63;
lead.currentTime = 66;
await poll();
center.iframe.focus();
dispatchDocument("keydown", { key: " ", code: "Space" });
await flush();
await poll();
assert.equal(env.document.activeElement, null, "Center pause must return keyboard ownership from its iframe.");
assert.equal(center.state, 2);
assert.equal(tail.state, 2);
assert.equal(lead.state, 2);

// A clustered Pin remains an exact, operational object. Choosing it keeps the
// vertical chooser open and marks the exact row; pressing and dragging that row
// moves the Pin instead of falling through to a random nearby marker.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 640
});
byId.get("pin-label").value = "Cluster A";
byId.get("pin-capture").dispatch("submit");
await flush();
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 650
});
byId.get("pin-label").value = "Cluster B";
byId.get("pin-capture").dispatch("submit");
await flush();
assert.equal(byId.get("timeline").style["--pin-hit-size"], "52px");
const clusterButton = descendants(byId.get("pin-lane"))
  .find(node => node.dataset.clusterIndex !== undefined);
assert.ok(clusterButton, "Nearby Pins must collapse into one unambiguous hit region.");
byId.get("pin-lane").dispatch("click", { target: clusterButton });
let clusterItems = descendants(byId.get("pin-cluster-menu"))
  .filter(node => node.dataset.pinGo);
assert.equal(clusterItems.length, 2);
const chosenPinId = clusterItems[0].dataset.pinGo;
byId.get("pin-cluster-menu").dispatch("click", {
  target: clusterItems[0]
});
await flush();
assert.equal(byId.get("pin-cluster-menu").hidden, false);
clusterItems = descendants(byId.get("pin-cluster-menu"))
  .filter(node => node.dataset.pinGo);
const selectedClusterItem = clusterItems
  .find(node => node.dataset.pinGo === chosenPinId);
assert.ok(selectedClusterItem.classList.contains("retained-selected"));
const selectedClusterDrag = descendants(byId.get("pin-cluster-menu"))
  .find(node => node.dataset.pinDrag === chosenPinId);
assert.ok(selectedClusterDrag, "Each clustered Pin must have a distinct drag handle.");
byId.get("pin-cluster-menu").dispatch("pointerdown", {
  target: selectedClusterDrag,
  clientX: 640,
  pointerId: 52,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: selectedClusterDrag,
  clientX: 690,
  pointerId: 52,
  button: 0,
  buttons: 1
});
await flush();
assert.equal(byId.get("field-transport-state").textContent, "Pin frame");
dispatchDocument("pointerup", {
  target: selectedClusterDrag,
  clientX: 690,
  pointerId: 52,
  button: 0,
  buttons: 0
});
await flush();
assert.equal(byId.get("pin-cluster-menu").hidden, true);
const movedPinMain = descendants(byId.get("pins-list"))
  .find(node => node.dataset.pinGo === chosenPinId);
assert.ok(
  movedPinMain && descendants(movedPinMain)
    .some(node => /1:09/.test(node.textContent)),
  "Dragging a chooser handle must move that exact Pin."
);

// Creation hotkeys commit their advertised action immediately. They do not
// merely focus an optional title field, and stale form state cannot alter them.
byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 780
});
await flush();
const pinsBeforeHotkey = Number(byId.get("pins-list-count").textContent);
byId.get("pin-label").value = "Stale Pin Title";
dispatchDocument("keydown", { key: "p", code: "KeyP" });
await flush();
assert.equal(Number(byId.get("pins-list-count").textContent), pinsBeforeHotkey + 1);
assert.match(byId.get("status").textContent, /Pinned Current/);
assert.equal(byId.get("pin-label").value, "Stale Pin Title");
assert.notEqual(
  env.document.activeElement,
  byId.get("pin-label"),
  "P must not move focus into the Pin title field."
);
dispatchDocument("keydown", { key: "p", code: "KeyP" });
await flush();
assert.equal(Number(byId.get("pins-list-count").textContent), pinsBeforeHotkey + 1);
assert.match(byId.get("status").textContent, /already pinned/);

const selectedGuidePin = descendants(byId.get("pins-list")).find(node =>
  node.classList.contains("pin-item")
    && node.classList.contains("retained-selected")
);
const selectedPinId = descendants(selectedGuidePin)
  .find(node => node.dataset.pinGo)?.dataset.pinGo;
const guidePinNode = descendants(byId.get("pin-lane"))
  .find(node => node.dataset.pinGo === selectedPinId);
assert.ok(
  guidePinNode,
  "A selected Guide Pin must expose the same draggable Pin on the Timeline."
);
byId.get("pin-lane").dispatch("pointerdown", {
  target: guidePinNode,
  clientX: 780,
  pointerId: 61,
  button: 0,
  buttons: 1
});
dispatchDocument("pointermove", {
  target: guidePinNode,
  clientX: 680,
  pointerId: 61,
  button: 0,
  buttons: 1
});
await flush();
assert.equal(byId.get("field-transport-state").textContent, "Pin frame");
assert.equal(center.currentTime, 68);
dispatchDocument("pointerup", {
  target: guidePinNode,
  clientX: 450,
  pointerId: 61,
  button: 0,
  buttons: 0
});
await flush();
assert.notEqual(byId.get("field-transport-state").textContent, "Pin frame");

byId.get("timeline").dispatch("click", {
  target: byId.get("timeline"),
  clientX: 820
});
await flush();
const sectionsBeforeHotkey = Number(byId.get("sections-list-count").textContent);
byId.get("section-source").value = "field-span";
byId.get("section-label").value = "Stale Section Title";
dispatchDocument("keydown", {
  key: "P",
  code: "KeyP",
  shiftKey: true
});
dispatchDocument("keyup", { key: "Shift", code: "ShiftLeft" });
await flush();
assert.equal(
  Number(byId.get("sections-list-count").textContent),
  sectionsBeforeHotkey + 1
);
assert.match(byId.get("status").textContent, /Saved untitled Section/);
assert.equal(byId.get("section-label").value, "Stale Section Title");
assert.notEqual(
  env.document.activeElement,
  byId.get("section-label"),
  "Shift+P must not move focus into the Section title field."
);
dispatchDocument("keydown", {
  key: "P",
  code: "KeyP",
  shiftKey: true
});
dispatchDocument("keyup", { key: "Shift", code: "ShiftLeft" });
await flush();
assert.equal(
  Number(byId.get("sections-list-count").textContent),
  sectionsBeforeHotkey + 1
);
assert.match(byId.get("status").textContent, /already exists.*selected/);

assert.equal(byId.has("continue"), false);
assert.equal(byId.has("context-action"), false);
assert.equal(byId.has("skim"), false);
assert.equal(byId.has("loop"), false);
assert.equal(byId.get("release").classList.contains("lifecycle-action"), true);
assert.equal(byId.get("deform").classList.contains("lifecycle-action"), true);
assert.equal(byId.get("focus-toggle").classList.contains("lifecycle-action"), true);

byId.get("focus-toggle").focus();
dispatchDocument("pointerup", { target: byId.get("focus-toggle"), pointerId: 8 });
assert.equal(env.document.activeElement, null, "Pointer activation must not leave a control visually selected.");

console.log("Interaction smoke passed: direct P/Shift+P creation, retained Section editing, spatial Pin unlink/link, Timeline endpoint/whole-Section drag previews, operational clustered Pins, Shift Pin traversal, local Refine preview, unsaved Working Focus, Switch involution, Undo/Redo ownership, composable Step intervals, shared activation, bounded Field Breath, immutable configured offsets, whole-Field side Step, universal Space playback, and coherent focus release.");
