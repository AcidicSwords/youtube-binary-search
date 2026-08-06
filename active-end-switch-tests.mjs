import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NEIGHBORHOOD_BASIS, createRoot } from "./range-geometry.js";
import {
  createSession,
  snapshotModel,
  goTo,
  refine,
  localRefine,
  reopen,
  step,
  completePlayback,
  switchActiveEnd,
  undo
} from "./session.js";

function frameOf(model) {
  return {
    neighborhood: model.neighborhood,
    neighborhoodBasis: model.neighborhoodBasis
  };
}

// Movement records both endpoint search frames. Switching transposes the
// directed Interval without changing its ordered extent.
let session = createSession({ duration: 100, current: 20 });
const departureNeighborhood = frameOf(session.model);
session = refine(session, "forward").session;
const arrivalNeighborhood = frameOf(session.model);
const originalInterval = structuredClone(session.model.activeSpan);
const originalHistoryLength = session.history.length;

assert.deepEqual(session.model.activeSpan.departureNeighborhood, departureNeighborhood);
assert.deepEqual(session.model.activeSpan.arrivalNeighborhood, arrivalNeighborhood);

let switched = switchActiveEnd(session);
assert.equal(switched.changed, true);
assert.equal(switched.label, "Switch End");
assert.equal(switched.session.history.length, originalHistoryLength + 1);
assert.equal(switched.session.model.neighborhood.C, originalInterval.departure);
assert.deepEqual(frameOf(switched.session.model), departureNeighborhood);
assert.deepEqual(
  {
    start: switched.session.model.activeSpan.start,
    end: switched.session.model.activeSpan.end,
    departure: switched.session.model.activeSpan.departure,
    arrival: switched.session.model.activeSpan.arrival,
    direction: switched.session.model.activeSpan.direction
  },
  {
    start: originalInterval.start,
    end: originalInterval.end,
    departure: originalInterval.arrival,
    arrival: originalInterval.departure,
    direction: "backward"
  }
);

// Endpoint Transposition is an involution over semantic state. Each switch
// captures the frame being left and restores the frame stored at the endpoint.
switched = switchActiveEnd(switched.session);
assert.equal(switched.session.model.neighborhood.C, originalInterval.arrival);
assert.deepEqual(frameOf(switched.session.model), arrivalNeighborhood);
assert.deepEqual(switched.session.model.activeSpan, originalInterval);

// Refine after transposition may pass the preserved opposite endpoint. Because
// that target is outside the current Interval, the old Interval is discarded and the
// complete Current-to-midpoint traversal becomes the Active Span.
let overrun = createSession({ duration: 100, current: 50 });
overrun = goTo(overrun, 70, { operator: "timeline" }).session;
overrun = switchActiveEnd(overrun).session;
const overrunResult = localRefine(overrun, "forward");
assert.equal(overrunResult.refineRelation, "draw");
assert.deepEqual(
  {
    start: overrunResult.session.model.activeSpan.start,
    end: overrunResult.session.model.activeSpan.end,
    departure: overrunResult.session.model.activeSpan.departure,
    arrival: overrunResult.session.model.activeSpan.arrival
  },
  { start: 50, end: 75, departure: 50, arrival: 75 }
);
assert.deepEqual(overrunResult.session.model.neighborhood, {
  L: 50,
  C: 75,
  R: 100,
  level: 1
});

// Playback accumulates watched coverage without replacing or shortening the
// Interval that Switch End is transposing. Boundary search frames survive
// an interior Current and a subsequent switch.
let played = createSession({ duration: 120, current: 10 });
played = goTo(played, 50, { operator: "timeline" }).session;
const frameAtFifty = frameOf(played.model);
played = switchActiveEnd(played).session;
const playbackOrigin = snapshotModel(played.model);
played = completePlayback(played, {
  current: 20,
  departure: 10,
  parentNeighborhood: playbackOrigin.neighborhood,
  parentResolutionBasis: playbackOrigin.neighborhoodBasis,
  returnModel: playbackOrigin
}).session;
assert.deepEqual(
  {
    start: played.model.activeSpan.start,
    end: played.model.activeSpan.end,
    departure: played.model.activeSpan.departure,
    arrival: played.model.activeSpan.arrival
  },
  { start: 10, end: 50, departure: 50, arrival: 20 },
  "Playback from a switched endpoint must preserve the prior extent while Current moves inside it."
);
assert.equal(played.model.neighborhood.L, playbackOrigin.neighborhood.L);
assert.equal(played.model.neighborhood.C, 20);
played = switchActiveEnd(played).session;
assert.equal(played.model.neighborhood.C, 50);
assert.deepEqual(frameOf(played.model), frameAtFifty);
assert.deepEqual(
  { start: played.model.activeSpan.start, end: played.model.activeSpan.end },
  { start: 10, end: 50 },
  "Switch End must not change accumulated playback coverage."
);

// Reopen changes the active endpoint frame without changing Interval extent.
// Switching away captures that updated frame; switching back restores it.
let reopened = reopen(session).session;
const reopenedArrivalFrame = frameOf(reopened.model);
assert.equal(reopened.model.neighborhoodBasis, NEIGHBORHOOD_BASIS.RANGE);
assert.deepEqual(
  { start: reopened.model.activeSpan.start, end: reopened.model.activeSpan.end },
  { start: originalInterval.start, end: originalInterval.end }
);
reopened = switchActiveEnd(reopened).session;
reopened = switchActiveEnd(reopened).session;
assert.deepEqual(frameOf(reopened.model), reopenedArrivalFrame);

// Step composes around whichever endpoint is currently the departure anchor.
// Its endpoint frame survives a coalesced/amended Step sequence.
let stepped = createSession({ duration: 100, current: 20 });
stepped = goTo(stepped, 40, { operator: "timeline" }).session;
const origin = snapshotModel(stepped.model);
const originHistoryLength = stepped.history.length;
stepped = step(stepped, "forward", 10, {
  departure: 40,
  intervalDeparture: 20,
  originInterval: origin.activeSpan,
  originResolution: origin.neighborhood,
  originResolutionBasis: origin.neighborhoodBasis
}).session;
stepped = step(stepped, "forward", 10, {
  departure: 40,
  intervalDeparture: 20,
  originInterval: origin.activeSpan,
  originResolution: origin.neighborhood,
  originResolutionBasis: origin.neighborhoodBasis,
  amend: true
}).session;
assert.equal(stepped.history.length, originHistoryLength + 1);
const activeEndpointFrame = frameOf(stepped.model);
const anchorFrame = stepped.model.activeSpan.departureNeighborhood;
stepped = switchActiveEnd(stepped).session;
assert.equal(stepped.model.neighborhood.C, 20);
assert.deepEqual(frameOf(stepped.model), anchorFrame);
stepped = switchActiveEnd(stepped).session;
assert.equal(stepped.model.neighborhood.C, 60);
assert.deepEqual(frameOf(stepped.model), activeEndpointFrame);

// A coalesced Step that begins without an Interval still freezes the gesture's
// original endpoint frame rather than replacing it with an intermediate frame.
let blankStep = createSession({ duration: 100, current: 50 });
const blankOrigin = snapshotModel(blankStep.model);
blankStep = step(blankStep, "forward", 10, {
  departure: 50,
  intervalDeparture: 50,
  originInterval: null,
  originResolution: blankOrigin.neighborhood,
  originResolutionBasis: blankOrigin.neighborhoodBasis
}).session;
blankStep = step(blankStep, "forward", 10, {
  departure: 50,
  intervalDeparture: 50,
  originInterval: null,
  originResolution: blankOrigin.neighborhood,
  originResolutionBasis: blankOrigin.neighborhoodBasis,
  amend: true
}).session;
blankStep = switchActiveEnd(blankStep).session;
assert.equal(blankStep.model.neighborhood.C, 50);
assert.deepEqual(frameOf(blankStep.model), frameOf(blankOrigin));

// Step after a switch edits from the newly transposed anchor.
stepped = switchActiveEnd(stepped).session; // Current 20, anchor 60.
const frameAtSixty = stepped.model.activeSpan.departureNeighborhood;
stepped = step(stepped, "backward", 5).session;
assert.deepEqual(
  {
    start: stepped.model.activeSpan.start,
    end: stepped.model.activeSpan.end,
    departure: stepped.model.activeSpan.departure,
    arrival: stepped.model.activeSpan.arrival
  },
  { start: 15, end: 60, departure: 60, arrival: 15 }
);
stepped = switchActiveEnd(stepped).session;
assert.equal(stepped.model.neighborhood.C, 60);
assert.deepEqual(frameOf(stepped.model), {
  ...frameAtSixty,
  neighborhood: {
    ...frameAtSixty.neighborhood,
    level: 0
  }
});
assert.ok(stepped.model.neighborhood.L <= stepped.model.activeSpan.start);
assert.ok(stepped.model.neighborhood.R >= stepped.model.activeSpan.end);

// A collapsed Interval has no endpoints to transpose and creates no history.
let collapsed = createSession({ duration: 100, current: 20 });
collapsed = goTo(collapsed, 40, { operator: "timeline" }).session;
collapsed = step(collapsed, "backward", 20).session;
assert.equal(collapsed.model.activeSpan, null);
const collapsedHistoryLength = collapsed.history.length;
const noSwitch = switchActiveEnd(collapsed);
assert.equal(noSwitch.changed, false);
assert.equal(noSwitch.reason, "no-active-span");
assert.equal(noSwitch.session.history.length, collapsedHistoryLength);

// Undo remains a separate history operation and restores the pre-switch state.
const beforeSwitch = snapshotModel(session.model);
const afterSwitch = switchActiveEnd(session).session;
const undone = undo(afterSwitch);
assert.equal(undone.changed, true);
assert.deepEqual(undone.session.model, beforeSwitch);

// A bounded legacy Interval without frames is repaired defensively.
let legacy = createSession({ duration: 100, current: 20 });
legacy = goTo(legacy, 40, { operator: "timeline" }).session;
delete legacy.model.activeSpan.departureNeighborhood;
delete legacy.model.activeSpan.arrivalNeighborhood;
delete legacy.model.activeSpan.startFrame;
delete legacy.model.activeSpan.endFrame;
legacy = switchActiveEnd(legacy).session;
assert.equal(legacy.model.neighborhood.C, 20);
assert.ok(legacy.model.activeSpan.departureNeighborhood);
assert.ok(legacy.model.activeSpan.arrivalNeighborhood);
assert.deepEqual(legacy.model.activeSpan.arrivalNeighborhood.neighborhood, createRoot(0, 20, 80));

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
assert.match(
  html,
  /id="refine-backward"[\s\S]*id="reopen"[\s\S]*id="refine-forward"[\s\S]*id="step-backward"[\s\S]*id="switch-end"[\s\S]*id="step-forward"[\s\S]*id="release"[\s\S]*id="retain"[\s\S]*id="focus-toggle"/
);
assert.match(html, /id="return-action"[^>]*aria-keyshortcuts="Z"/);
assert.match(html, /id="redo-action"[^>]*aria-keyshortcuts="C"/);
assert.match(
  app,
  /spatialKey\("s"\)[\s\S]*switchActiveEnd\(\{ carryRetained: carryChord \}\)/
);
assert.doesNotMatch(
  app,
  /forceInterval|foldedEndpoint/,
  "Switch End must remain one exact involution without projection-specific modes."
);
assert.match(styles, /"refine-backward reopen refine-forward"/);
assert.match(styles, /"step-backward switch-end step-forward"/);
assert.match(styles, /"release retain focus"/);

console.log("Endpoint Transposition tests passed: endpoint frames, involution, Local Refine drawing, Step composition, collapse, Undo separation, and matrix wiring.");
