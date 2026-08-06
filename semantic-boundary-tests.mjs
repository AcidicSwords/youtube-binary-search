import assert from "node:assert/strict";
import {
  createSession,
  completePlayback,
  goTo,
  refine,
  reopen,
  setStepDistance,
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
  orderedPins
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
  session.model.neighborhood,
  session.model.range,
  session.model.activeSpan,
  session.model.neighborhood.C,
  session.model.stepDistance
).reopen;
finding(
  "reopen-kernel-view-disagreement",
  reopen(session).changed && reopenPresentation === null,
  {
    neighborhood: session.model.neighborhood,
    basis: session.model.neighborhoodBasis
  }
);

// Step deformation must reset the old refinement lineage; otherwise
// "N refinements" ceases to describe the displayed grain.
let refined = createSession({ duration: 100, current: 50 });
for (let index = 0; index < 10; index += 1) {
  const result = refine(refined, index % 2 ? "forward" : "backward");
  assert.equal(result.changed, true);
  refined = result.session;
}
const fineFrame = structuredClone(refined.model.neighborhood);
refined = step(refined, "forward", 10).session;
finding(
  "refinement-level-survives-coarse-step-deformation",
  refined.model.neighborhood.level === fineFrame.level
    && refined.model.neighborhood.R - refined.model.neighborhood.L
      > (fineFrame.R - fineFrame.L) * 100,
  {
    before: fineFrame,
    after: refined.model.neighborhood,
    targets: getTargets(refined.model.neighborhood)
  }
);

// Section endpoints are stored as Pins, but the matrix Pin operators consume
// visible Pins only. A Section with implicit endpoints therefore contributes
// no targets to Previous Pin / Next Pin.
const guide = createGuide("audit-video");
createSectionFromTimes(guide, 10, 20, { label: "Implicit endpoints" });
finding(
  "section-endpoints-absent-from-pin-traversal",
  guide.pins.length === 2
    && orderedPins(guide).length === 0
    && previousPin(guide, 15, { start: 0, end: 100 }) === null
    && nextPin(guide, 15, { start: 0, end: 100 }) === null,
  { storedPins: guide.pins.length, traversablePins: orderedPins(guide).length }
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

// An explicit Step Distance edit can commit while a playback transaction is open.
// Playback settlement must not make Undo skip that intervening semantic edit.
let playback = createSession({ duration: 100, current: 20 });
const playbackReturn = structuredClone(playback.model);
playback = setStepDistance(
  playback,
  { backward: 7, forward: 9, linked: false },
  "Set Step Distance During Playback"
).session;
const reachBeforeSettlement = structuredClone(playback.model.stepDistance);
playback = completePlayback(playback, {
  current: 30,
  departure: 20,
  parentNeighborhood: playbackReturn.neighborhood,
  parentResolutionBasis: playbackReturn.neighborhoodBasis,
  returnModel: playbackReturn
}).session;
const playbackUndone = undo(playback).session;
finding(
  "playback-undo-skips-intervening-step-distance",
  reachBeforeSettlement.backward === 7
    && playbackUndone.model.stepDistance.backward === 10
    && playbackUndone.history.at(-1)?.label === "Set Step Distance During Playback",
  {
    reachBeforeSettlement,
    reachAfterOneUndo: playbackUndone.model.stepDistance,
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
      environment.byId.get("field-both-toggle").disabled === false
      || environment.byId.get("tail-player-surface")["aria-disabled"] !== "true"
      || environment.byId.get("tail-player-surface").tabIndex !== -1
    ),
  {
    matrixStepBackwardDisabled: environment.byId.get("step-backward").disabled,
    combinedPanoramaToggleDisabled: environment.byId.get("field-both-toggle").disabled,
    tailSurfaceDisabled: environment.byId.get("tail-player-surface")["aria-disabled"],
    tailSurfaceTabIndex: environment.byId.get("tail-player-surface").tabIndex,
    tailMeta: environment.byId.get("tail-meta").textContent
  }
);

// Establish and activate the configured Panorama at Current 50.
environment.byId.get("context-seconds").value = "0";
environment.byId.get("context-seconds").dispatch("change");
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
const configuredInnerOffset = environment.byId.get("field-inner-offset").value;
const configuredOuterOffset = environment.byId.get("field-outer-offset").value;

// Start Context at 60 and advance only the Center Cursor. The visible side
// geometry must remain the exact 2.5-second Context preview while its source
// window is active, without rewriting the independently configured live Panorama
// offsets underneath it.
environment.byId.get("context-seconds").value = "5";
environment.byId.get("context-seconds").dispatch("change");
environment.byId.get("timeline").dispatch("click", { clientX: 600 });
await environment.flush(8);
environment.center().currentTime = 59;
await environment.poll();
const firstSuspendedTail = environment.byId.get("tail-meta").textContent;
const firstSuspendedLead = environment.byId.get("lead-meta").textContent;
environment.center().currentTime = 59.5;
await environment.poll();
const secondSuspendedTail = environment.byId.get("tail-meta").textContent;
const secondSuspendedLead = environment.byId.get("lead-meta").textContent;
finding(
  "context-mutates-configured-field-offset",
  firstSuspendedTail !== secondSuspendedTail
    || firstSuspendedLead !== secondSuspendedLead
    || environment.byId.get("field-outer-offset").value !== configuredOuterOffset
    || environment.byId.get("field-inner-offset").value !== configuredInnerOffset,
  {
    afterFirstContextTick: firstSuspendedTail,
    afterSecondContextTick: secondSuspendedTail,
    firstLead: firstSuspendedLead,
    secondLead: secondSuspendedLead,
    configuredInnerOffset: environment.byId.get("field-inner-offset").value,
    configuredOuterOffset: environment.byId.get("field-outer-offset").value
  }
);

assert.deepEqual(findings, [], "Every audited semantic discrepancy must remain repaired.");
console.log("Semantic boundary tests passed: adversarial operator consequences remain canonical.");
