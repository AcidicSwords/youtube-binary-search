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
    resolution: model.resolution,
    neighborhoodBasis: model.neighborhoodBasis
  };
}

// Movement records both endpoint search frames. Switching transposes the
// directed Interval without changing its ordered extent.
let session = createSession({ duration: 100, current: 20 });
const departureNeighborhood = frameOf(session.model);
session = refine(session, "forward").session;
const arrivalNeighborhood = frameOf(session.model);
const originalInterval = structuredClone(session.model.interval);
const originalHistoryLength = session.history.length;

assert.deepEqual(session.model.interval.departureNeighborhood, departureNeighborhood);
assert.deepEqual(session.model.interval.arrivalNeighborhood, arrivalNeighborhood);

let switched = switchActiveEnd(session);
assert.equal(switched.changed, true);
assert.equal(switched.label, "Switch End");
assert.equal(switched.session.history.length, originalHistoryLength + 1);
assert.equal(switched.session.model.resolution.C, originalInterval.departure);
assert.deepEqual(frameOf(switched.session.model), departureNeighborhood);
assert.deepEqual(
  {
    start: switched.session.model.interval.start,
    end: switched.session.model.interval.end,
    departure: switched.session.model.interval.departure,
    arrival: switched.session.model.interval.arrival,
    direction: switched.session.model.interval.direction
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
assert.equal(switched.session.model.resolution.C, originalInterval.arrival);
assert.deepEqual(frameOf(switched.session.model), arrivalNeighborhood);
assert.deepEqual(switched.session.model.interval, originalInterval);

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
    start: overrunResult.session.model.interval.start,
    end: overrunResult.session.model.interval.end,
    departure: overrunResult.session.model.interval.departure,
    arrival: overrunResult.session.model.interval.arrival
  },
  { start: 50, end: 75, departure: 50, arrival: 75 }
);
assert.deepEqual(overrunResult.session.model.resolution, {
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
  parentNeighborhood: playbackOrigin.resolution,
  parentResolutionBasis: playbackOrigin.neighborhoodBasis,
  returnModel: playbackOrigin
}).session;
assert.deepEqual(
  {
    start: played.model.interval.start,
    end: played.model.interval.end,
    departure: played.model.interval.departure,
    arrival: played.model.interval.arrival
  },
  { start: 10, end: 50, departure: 50, arrival: 20 },
  "Playback from a switched endpoint must preserve the prior extent while Current moves inside it."
);
assert.equal(played.model.resolution.L, playbackOrigin.resolution.L);
assert.equal(played.model.resolution.C, 20);
played = switchActiveEnd(played).session;
assert.equal(played.model.resolution.C, 50);
assert.deepEqual(frameOf(played.model), frameAtFifty);
assert.deepEqual(
  { start: played.model.interval.start, end: played.model.interval.end },
  { start: 10, end: 50 },
  "Switch End must not change accumulated playback coverage."
);

// Reopen changes the active endpoint frame without changing Interval extent.
// Switching away captures that updated frame; switching back restores it.
let reopened = reopen(session).session;
const reopenedArrivalFrame = frameOf(reopened.model);
assert.equal(reopened.model.neighborhoodBasis, NEIGHBORHOOD_BASIS.RANGE);
assert.deepEqual(
  { start: reopened.model.interval.start, end: reopened.model.interval.end },
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
  originInterval: origin.interval,
  originResolution: origin.resolution,
  originResolutionBasis: origin.neighborhoodBasis
}).session;
stepped = step(stepped, "forward", 10, {
  departure: 40,
  intervalDeparture: 20,
  originInterval: origin.interval,
  originResolution: origin.resolution,
  originResolutionBasis: origin.neighborhoodBasis,
  amend: true
}).session;
assert.equal(stepped.history.length, originHistoryLength + 1);
const activeEndpointFrame = frameOf(stepped.model);
const anchorFrame = stepped.model.interval.departureNeighborhood;
stepped = switchActiveEnd(stepped).session;
assert.equal(stepped.model.resolution.C, 20);
assert.deepEqual(frameOf(stepped.model), anchorFrame);
stepped = switchActiveEnd(stepped).session;
assert.equal(stepped.model.resolution.C, 60);
assert.deepEqual(frameOf(stepped.model), activeEndpointFrame);

// A coalesced Step that begins without an Interval still freezes the gesture's
// original endpoint frame rather than replacing it with an intermediate frame.
let blankStep = createSession({ duration: 100, current: 50 });
const blankOrigin = snapshotModel(blankStep.model);
blankStep = step(blankStep, "forward", 10, {
  departure: 50,
  intervalDeparture: 50,
  originInterval: null,
  originResolution: blankOrigin.resolution,
  originResolutionBasis: blankOrigin.neighborhoodBasis
}).session;
blankStep = step(blankStep, "forward", 10, {
  departure: 50,
  intervalDeparture: 50,
  originInterval: null,
  originResolution: blankOrigin.resolution,
  originResolutionBasis: blankOrigin.neighborhoodBasis,
  amend: true
}).session;
blankStep = switchActiveEnd(blankStep).session;
assert.equal(blankStep.model.resolution.C, 50);
assert.deepEqual(frameOf(blankStep.model), frameOf(blankOrigin));

// Step after a switch edits from the newly transposed anchor.
stepped = switchActiveEnd(stepped).session; // Current 20, anchor 60.
const frameAtSixty = stepped.model.interval.departureNeighborhood;
stepped = step(stepped, "backward", 5).session;
assert.deepEqual(
  {
    start: stepped.model.interval.start,
    end: stepped.model.interval.end,
    departure: stepped.model.interval.departure,
    arrival: stepped.model.interval.arrival
  },
  { start: 15, end: 60, departure: 60, arrival: 15 }
);
stepped = switchActiveEnd(stepped).session;
assert.equal(stepped.model.resolution.C, 60);
assert.deepEqual(frameOf(stepped.model), {
  ...frameAtSixty,
  resolution: {
    ...frameAtSixty.resolution,
    level: 0
  }
});
assert.ok(stepped.model.resolution.L <= stepped.model.interval.start);
assert.ok(stepped.model.resolution.R >= stepped.model.interval.end);

// A collapsed Interval has no endpoints to transpose and creates no history.
let collapsed = createSession({ duration: 100, current: 20 });
collapsed = goTo(collapsed, 40, { operator: "timeline" }).session;
collapsed = step(collapsed, "backward", 20).session;
assert.equal(collapsed.model.interval, null);
const collapsedHistoryLength = collapsed.history.length;
const noSwitch = switchActiveEnd(collapsed);
assert.equal(noSwitch.changed, false);
assert.equal(noSwitch.reason, "no-interval");
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
delete legacy.model.interval.departureNeighborhood;
delete legacy.model.interval.arrivalNeighborhood;
delete legacy.model.interval.startFrame;
delete legacy.model.interval.endFrame;
legacy = switchActiveEnd(legacy).session;
assert.equal(legacy.model.resolution.C, 20);
assert.ok(legacy.model.interval.departureNeighborhood);
assert.ok(legacy.model.interval.arrivalNeighborhood);
assert.deepEqual(legacy.model.interval.arrivalNeighborhood.resolution, createRoot(0, 20, 80));

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
assert.match(
  html,
  /id="refine-backward"[\s\S]*id="reopen"[\s\S]*id="refine-forward"[\s\S]*id="step-backward"[\s\S]*id="switch-endpoint"[\s\S]*id="step-forward"[\s\S]*id="release"[\s\S]*id="retain"[\s\S]*id="focus-toggle"/
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
assert.match(styles, /"step-backward switch-endpoint step-forward"/);
assert.match(styles, /"release retain focus"/);

console.log("Endpoint Transposition tests passed: endpoint frames, involution, Local Refine drawing, Step composition, collapse, Undo separation, and matrix wiring.");
