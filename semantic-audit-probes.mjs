import assert from "node:assert/strict";
import {
  createSession,
  completePlayback,
  goTo,
  refine,
  reopen,
  setStepReach,
  step,
  undo
} from "./session.js";
import {
  getActionRanges,
  getTargets
} from "./range-geometry.js";
import {
  createGuide,
  createSectionFromTimes,
  nextPin,
  previousPin,
  sanitizeGuide,
  visiblePins
} from "./guide.js";
import { createSmokeEnvironment } from "./smoke-harness.mjs";

const findings = [];

function finding(id, condition, evidence) {
  if (condition) findings.push({ id, evidence });
}

// A Step path can make the Neighborhood geometrically identical to Range while
// retaining movement provenance. The kernel still accepts Reopen, but the view
// derives no Reopen action from geometry alone.
let session = createSession({ duration: 100, current: 25 });
session = goTo(session, 50, { operator: "timeline" }).session;
session = step(session, "backward", 25).session;
session = step(session, "forward", 25).session;
session = step(session, "forward", 25).session;
const reopenPresentation = getActionRanges(
  session.model.resolution,
  session.model.range,
  session.model.interval,
  session.model.resolution.C,
  session.model.stepReach
).reopen;
finding(
  "reopen-kernel-view-disagreement",
  reopen(session).changed && reopenPresentation === null,
  {
    resolution: session.model.resolution,
    basis: session.model.resolutionBasis
  }
);

// Step preserves the old refinement count while expanding a sub-frame by many
// seconds, so "N refinements" ceases to describe the displayed grain.
let refined = createSession({ duration: 100, current: 50 });
for (let index = 0; index < 10; index += 1) {
  const result = refine(refined, index % 2 ? "forward" : "backward");
  assert.equal(result.changed, true);
  refined = result.session;
}
const fineFrame = structuredClone(refined.model.resolution);
refined = step(refined, "forward", 10).session;
finding(
  "refinement-level-survives-coarse-step-deformation",
  refined.model.resolution.level === fineFrame.level
    && refined.model.resolution.R - refined.model.resolution.L
      > (fineFrame.R - fineFrame.L) * 100,
  {
    before: fineFrame,
    after: refined.model.resolution,
    targets: getTargets(refined.model.resolution)
  }
);

// Section endpoints are stored as Pins, but the matrix Pin operators consume
// visible Pins only. A Section with implicit endpoints therefore contributes
// no targets to Pin Backward / Pin Forward.
const guide = createGuide("audit-video");
createSectionFromTimes(guide, 10, 20, { label: "Implicit endpoints" });
finding(
  "section-endpoints-absent-from-pin-traversal",
  guide.pins.length === 2
    && visiblePins(guide).length === 0
    && previousPin(guide, 15, { start: 0, end: 100 }) === null
    && nextPin(guide, 15, { start: 0, end: 100 }) === null,
  { storedPins: guide.pins.length, traversablePins: visiblePins(guide).length }
);

// Runtime creation permits labels that differ only in case, but persistence
// sanitization treats them as duplicates and silently removes one on reload.
createSectionFromTimes(guide, 30, 40, { label: "Case" });
createSectionFromTimes(guide, 30, 40, { label: "case" });
const sanitized = sanitizeGuide(guide, "audit-video", 100);
const beforeCaseCount = guide.sections.filter(
  section => section.label.toLocaleLowerCase() === "case"
).length;
const afterCaseCount = sanitized.sections.filter(
  section => section.label.toLocaleLowerCase() === "case"
).length;
finding(
  "section-case-collision-is-not-reload-stable",
  beforeCaseCount === 2 && afterCaseCount === 1,
  { before: beforeCaseCount, after: afterCaseCount }
);

// Hold can commit Step Reach while a playback transaction is open. Playback
// settlement still points Undo at the model from playback start, skipping the
// intervening Hold and leaving a second history entry that restores no new
// visible state.
let playback = createSession({ duration: 100, current: 20 });
const playbackReturn = structuredClone(playback.model);
playback = setStepReach(
  playback,
  { backward: 7, forward: 9, linked: false },
  "Hold Field Offset"
).session;
const reachBeforeSettlement = structuredClone(playback.model.stepReach);
playback = completePlayback(playback, {
  current: 30,
  departure: 20,
  parentNeighborhood: playbackReturn.resolution,
  parentResolutionBasis: playbackReturn.resolutionBasis,
  returnModel: playbackReturn
}).session;
const playbackUndone = undo(playback).session;
finding(
  "playback-undo-skips-intervening-hold-offset",
  reachBeforeSettlement.backward === 7
    && playbackUndone.model.stepReach.backward === 10
    && playbackUndone.history.at(-1)?.label === "Hold Field Offset",
  {
    reachBeforeSettlement,
    reachAfterOneUndo: playbackUndone.model.stepReach,
    remainingHistoryLabel: playbackUndone.history.at(-1)?.label
  }
);

// Exercise the browser composition layer with the repository's deterministic
// iframe harness so controller presentation and transient Context can be
// inspected without claiming real YouTube behavior.
const environment = createSmokeEnvironment({ duration: 100 });
await import(`./app.js?semantic-audit=${Date.now()}`);
await environment.flush(8);
environment.byId.get("youtube-url").value = "dQw4w9WgXcQ";
environment.byId.get("load-video").click();
await environment.flush(10);
await environment.poll();
await environment.poll();

finding(
  "side-step-enabled-at-hard-range-boundary",
  environment.byId.get("step-backward").disabled === true
    && (
      environment.byId.get("tail-step-button").disabled === false
      || environment.byId.get("tail-field-toggle").disabled === false
      || environment.byId.get("tail-player-surface")["aria-disabled"] !== "true"
      || environment.byId.get("tail-player-surface").tabIndex !== -1
    ),
  {
    matrixStepBackwardDisabled: environment.byId.get("step-backward").disabled,
    tailStepBackwardDisabled: environment.byId.get("tail-step-button").disabled,
    tailFieldToggleDisabled: environment.byId.get("tail-field-toggle").disabled,
    tailSurfaceDisabled: environment.byId.get("tail-player-surface")["aria-disabled"],
    tailSurfaceTabIndex: environment.byId.get("tail-player-surface").tabIndex,
    tailMeta: environment.byId.get("tail-meta").textContent
  }
);

// Establish and activate a 10-second Field at Current 50.
environment.byId.get("context-select").value = "0";
environment.byId.get("context-select").dispatch("change");
environment.byId.get("timeline").dispatch("click", { clientX: 500 });
await environment.flush(5);
await environment.poll();
await environment.poll();
environment.byId.get("center-transport-surface").click();
await environment.flush(8);
environment.center().currentTime = 51;
environment.tail().currentTime = 41;
environment.lead().currentTime = 61;
await environment.poll();
environment.center().pauseVideo();
await environment.flush(8);
await environment.poll();

// Start Context at 60 and advance only the Center Cursor. Stored Field offsets
// should remain 10 seconds; the current controller remeasures Tail against the
// transient Cursor and shrinks it.
environment.byId.get("context-select").value = "5";
environment.byId.get("context-select").dispatch("change");
environment.byId.get("timeline").dispatch("click", { clientX: 600 });
await environment.flush(8);
environment.center().currentTime = 59;
await environment.poll();
const firstSuspendedTail = environment.byId.get("tail-offset-state").textContent;
environment.center().currentTime = 59.5;
await environment.poll();
const secondSuspendedTail = environment.byId.get("tail-offset-state").textContent;
finding(
  "context-erodes-activated-field-offset",
  firstSuspendedTail !== "10s / 10s" || secondSuspendedTail !== "10s / 10s",
  {
    afterFirstContextTick: firstSuspendedTail,
    afterSecondContextTick: secondSuspendedTail,
    tailMeta: environment.byId.get("tail-meta").textContent
  }
);

assert.deepEqual(findings, [], "Every audited semantic discrepancy must remain repaired.");
console.log("Semantic repair probes passed: all seven audited discrepancies remain resolved.");
