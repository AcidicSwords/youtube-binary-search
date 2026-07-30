import assert from "node:assert/strict";
import {
  getTargets,
  seedNeighborhoodFromMovement,
  stepNeighborhood
} from "./range-geometry.js";
import {
  createSession,
  snapshotModel,
  goTo,
  goToGuideSection,
  refine,
  localRefine,
  reopen,
  step,
  stepToPin,
  switchEndpoint,
  completePlayback,
  projectPlayback,
  previewTransition,
  releaseInterval,
  undo,
  redo
} from "./session.js";
import {
  createGuide,
  createSectionFromTimes,
  ensurePin,
  previousPin,
  nextPin
} from "./guide.js";
import { projectionForModel } from "./timeline-projection.js";
import { deriveStepField } from "./step-field-geometry.js";
import {
  createPlaybackTransport,
  rebasePlaybackTransport
} from "./transport.js";
import { packTimelineSectionLanes } from "./view.js";

// Selecting retained topology makes its full extent the Working Interval and
// returns Current to the center. This is one semantic transaction regardless
// of whether the gesture originates in Timeline or Guide.
{
  const selectionGuide = createGuide("section-selection");
  const selected = createSectionFromTimes(selectionGuide, 40, 80, {
    label: "Selected extent"
  }).section;
  const selectionSession = createSession({
    duration: 180,
    current: 10,
    guide: selectionGuide
  });
  const selectedResult = goToGuideSection(selectionSession, selected.id);
  assert.equal(selectedResult.changed, true);
  assert.deepEqual(selectedResult.session.model.resolution, {
    L: 40,
    C: 60,
    R: 80,
    level: 0
  });
  assert.equal(selectedResult.session.model.interval.start, 40);
  assert.equal(selectedResult.session.model.interval.end, 80);
  assert.equal(selectedResult.session.model.interval.arrival, 60);
  assert.equal(selectedResult.session.model.interval.departure, 40);
  assert.equal(selectedResult.session.model.interval.operator, "section");
  assert.equal(
    goToGuideSection(selectedResult.session, selected.id).changed,
    false,
    "Selecting the already active Section must not add redundant history."
  );
}

// Direct placement gives the new Working Interval two equal margins on each
// side in Timeline Space: the unclipped Resolution is exactly five Interval
// widths. Range clipping removes only unavailable margin.
assert.deepEqual(
  seedNeighborhoodFromMovement(40, 50, { start: 0, end: 100 }),
  { L: 20, C: 50, R: 70, level: 0 }
);
assert.deepEqual(
  seedNeighborhoodFromMovement(50, 40, { start: 0, end: 100 }),
  { L: 20, C: 40, R: 70, level: 0 }
);
assert.deepEqual(
  seedNeighborhoodFromMovement(5, 15, { start: 0, end: 100 }),
  { L: 0, C: 15, R: 35, level: 0 }
);
{
  const metricGuide = createGuide("movement-frame-weight");
  createSectionFromTimes(metricGuide, 430, 445, {
    label: "Weighted Section",
    weight: 0.5
  });
  const metricSession = createSession({
    duration: 1000,
    current: 400,
    guide: metricGuide
  });
  const metric = projectionForModel(metricSession.model).metric;
  const frame = seedNeighborhoodFromMovement(
    400,
    500,
    { start: 0, end: 1000 },
    metric
  );
  assert.deepEqual(frame, { L: 215, C: 500, R: 685, level: 0 });
  assert.equal(
    metric.toCoordinate(frame.R) - metric.toCoordinate(frame.L),
    5 * (
      metric.toCoordinate(500) - metric.toCoordinate(400)
    ),
    "The five-times law is measured in weighted timeline space."
  );
}

// Step keeps the approached endpoint fixed through the one-Step midpoint guard.
// It moves the endpoint only when the next Step would consume that headroom.
const guarded = { L: 0, C: 50, R: 100, level: 3 };
assert.deepEqual(
  stepNeighborhood(guarded, 70, { start: 0, end: 200 }, 10),
  { L: 0, C: 70, R: 100, level: 3 }
);
assert.deepEqual(
  stepNeighborhood(guarded, 80, { start: 0, end: 200 }, 10),
  { L: 0, C: 80, R: 100, level: 3 },
  "Landing at the guard must not push the approached endpoint."
);
assert.deepEqual(
  stepNeighborhood(guarded, 90, { start: 0, end: 200 }, 10),
  { L: 0, C: 90, R: 110, level: 0 },
  "Moving beyond the guard must restore exactly one Step of midpoint headroom."
);

// Plain Refine is retained-anchor refinement. Shift+Refine is the local
// membership form; alternating the two remains deterministic.
let retained = createSession({ duration: 100, current: 50 });
retained = refine(retained, "backward").session;
retained = refine(retained, "backward").session;
assert.deepEqual(retained.model.resolution, { L: 0, C: 12.5, R: 50, level: 2 });
assert.deepEqual(
  { start: retained.model.interval.start, end: retained.model.interval.end },
  { start: 12.5, end: 50 }
);

let local = createSession({ duration: 100, current: 50 });
local = localRefine(local, "backward").session;
local = localRefine(local, "backward").session;
assert.deepEqual(local.model.resolution, { L: 0, C: 12.5, R: 25, level: 2 });
assert.deepEqual(
  { start: local.model.interval.start, end: local.model.interval.end },
  { start: 12.5, end: 25 }
);

const mixed = localRefine(retained, "forward").session;
assert.deepEqual(mixed.model.resolution, { L: 12.5, C: 31.25, R: 50, level: 3 });
assert.deepEqual(
  { start: mixed.model.interval.start, end: mixed.model.interval.end },
  { start: 31.25, end: 50 }
);

// Reopen abandons the local frame without changing the Working Interval.
// Crossing the old departure makes it part of the new path: plain Refine must
// then record the complete Current-to-target movement rather than discard the
// Current-to-departure portion. Continuing away from the departure still
// retains it. Local Refine independently applies its membership law.
let reopenedReverse = createSession({ duration: 100, current: 50 });
reopenedReverse = refine(reopenedReverse, "backward").session;
reopenedReverse = reopen(reopenedReverse).session;
const oppositePlain = refine(reopenedReverse, "forward");
assert.equal(oppositePlain.refineRelation, "full");
assert.deepEqual(
  {
    start: oppositePlain.session.model.interval.start,
    end: oppositePlain.session.model.interval.end,
    departure: oppositePlain.session.model.interval.departure,
    arrival: oppositePlain.session.model.interval.arrival
  },
  { start: 25, end: 62.5, departure: 25, arrival: 62.5 }
);
const continuingPlain = refine(reopenedReverse, "backward");
assert.equal(continuingPlain.refineRelation, "retain");
assert.deepEqual(
  {
    start: continuingPlain.session.model.interval.start,
    end: continuingPlain.session.model.interval.end,
    departure: continuingPlain.session.model.interval.departure,
    arrival: continuingPlain.session.model.interval.arrival
  },
  { start: 12.5, end: 50, departure: 50, arrival: 12.5 }
);
const oppositeLocal = localRefine(reopenedReverse, "forward");
assert.equal(oppositeLocal.refineRelation, "replace");
assert.deepEqual(
  {
    start: oppositeLocal.session.model.interval.start,
    end: oppositeLocal.session.model.interval.end,
    departure: oppositeLocal.session.model.interval.departure,
    arrival: oppositeLocal.session.model.interval.arrival
  },
  { start: 25, end: 62.5, departure: 25, arrival: 62.5 }
);

let mirroredReopenedReverse = createSession({ duration: 100, current: 50 });
mirroredReopenedReverse = refine(mirroredReopenedReverse, "forward").session;
mirroredReopenedReverse = reopen(mirroredReopenedReverse).session;
const mirroredOppositePlain = refine(mirroredReopenedReverse, "backward");
assert.equal(mirroredOppositePlain.refineRelation, "full");
assert.deepEqual(
  {
    start: mirroredOppositePlain.session.model.interval.start,
    end: mirroredOppositePlain.session.model.interval.end,
    departure: mirroredOppositePlain.session.model.interval.departure,
    arrival: mirroredOppositePlain.session.model.interval.arrival
  },
  { start: 37.5, end: 75, departure: 75, arrival: 37.5 }
);

function transitionGeometry(result) {
  const interval = result.session.model.interval;
  const { createdAt: _createdAt, ...stableInterval } = interval || {};
  return {
    range: result.session.model.range,
    resolution: result.session.model.resolution,
    resolutionBasis: result.session.model.resolutionBasis,
    interval: interval ? stableInterval : null
  };
}

// Every hover preview dry-runs the exact Session operation used by commit.
for (const [action, direct] of [
  ["refineBackward", source => refine(source, "backward")],
  ["localRefineBackward", source => localRefine(source, "backward")],
  ["switchEndpoint", source => switchEndpoint(source)],
  ["release", source => releaseInterval(source)]
]) {
  const before = structuredClone(retained.model);
  const preview = previewTransition(retained, action);
  const committed = direct(retained);
  assert.equal(preview.changed, committed.changed);
  assert.deepEqual(transitionGeometry(preview), transitionGeometry(committed));
  assert.deepEqual(retained.model, before, `${action} preview must not mutate its source Session.`);
}

// Timeline weight does not rewrite the source addresses stored by other models.
const weightedGuide = createGuide("coherence-weight");
createSectionFromTimes(weightedGuide, 30, 45, {
  label: "Compressed",
  weight: 0.5
});
const weightedSession = createSession({
  duration: 100,
  current: 35,
  guide: weightedGuide
});
const weightedProjection = projectionForModel(weightedSession.model);
const field = deriveStepField(
  35,
  { backward: 10, forward: 10, linked: true },
  { start: 0, end: 100 },
  weightedProjection
);
assert.deepEqual(
  { tail: field.tail.target, lead: field.lead.target },
  { tail: 25, lead: 45 }
);

// Plain Step follows the positive density while Shift+Step visits the ordinary
// ordered endpoint Pins and then the synthetic Range boundary.
let weightedWalk = createSession({
  duration: 100,
  current: 29,
  guide: weightedGuide,
  stepReach: 1
});
weightedWalk = step(weightedWalk, "forward", 1).session;
assert.equal(weightedWalk.model.resolution.C, 30);
assert.ok(weightedWalk.model.interval.start <= 29);
assert.ok(weightedWalk.model.interval.end >= 30);
assert.ok(weightedWalk.model.resolution.L <= weightedWalk.model.interval.start);
assert.ok(weightedWalk.model.resolution.R >= weightedWalk.model.interval.end);
assert.notEqual(getTargets(weightedWalk.model.resolution, projectionForModel(weightedWalk.model).metric).forward, null);

const weightedPinProjection = projectionForModel(createSession({
  duration: 100,
  current: 29,
  guide: weightedGuide
}).model);
const sectionStart = nextPin(weightedGuide, 29, { start: 0, end: 100 }, weightedPinProjection);
const sectionEnd = nextPin(weightedGuide, sectionStart.t, { start: 0, end: 100 }, weightedPinProjection);
const rangeEnd = nextPin(weightedGuide, sectionEnd.t, { start: 0, end: 100 }, weightedPinProjection);
assert.deepEqual(
  [sectionStart.t, sectionEnd.t, rangeEnd.t],
  [30, 45, 100]
);
assert.equal(rangeEnd.stopKind, "range-boundary");

let pinWalk = createSession({
  duration: 100,
  current: 29,
  guide: weightedGuide,
  stepReach: 1
});
pinWalk = stepToPin(pinWalk, sectionStart.t, "forward", { stepSeconds: 1 }).session;
pinWalk = stepToPin(pinWalk, sectionEnd.t, "forward", { stepSeconds: 1 }).session;
assert.deepEqual(
  { start: pinWalk.model.interval.start, end: pinWalk.model.interval.end },
  { start: 29, end: 45 }
);

// Range boundaries are synthetic Pin stops, but a real Pin at the same address
// deduplicates the synthetic stop.
const emptyGuide = createGuide("range-stops");
assert.equal(
  previousPin(emptyGuide, 50, { start: 10, end: 90 }).stopKind,
  "range-boundary"
);
assert.equal(
  nextPin(emptyGuide, 50, { start: 10, end: 90 }).stopKind,
  "range-boundary"
);
const realEnd = ensurePin(emptyGuide, 90, { label: "Actual End" }).pin;
assert.equal(nextPin(emptyGuide, 50, { start: 10, end: 90 }).id, realEnd.id);

// Playback takes the union of prior Working coverage and watched source. Current
// may be interior; switching still reaches a stable stored boundary.
let watched = createSession({ duration: 100, current: 25 });
watched = goTo(watched, 50, { operator: "timeline" }).session;
watched = switchEndpoint(watched).session;
const playbackOrigin = snapshotModel(watched.model);
const projectedPlayback = projectPlayback(watched.model, {
  departure: 25,
  current: 30,
  parentNeighborhood: playbackOrigin.resolution,
  parentResolutionBasis: playbackOrigin.resolutionBasis,
  returnModel: playbackOrigin
});
assert.deepEqual(
  {
    start: projectedPlayback.model.interval.start,
    end: projectedPlayback.model.interval.end,
    departure: projectedPlayback.model.interval.departure,
    arrival: projectedPlayback.model.interval.arrival
  },
  { start: 25, end: 50, departure: 50, arrival: 30 }
);

watched = completePlayback(watched, {
  departure: 25,
  current: 30,
  parentNeighborhood: playbackOrigin.resolution,
  parentResolutionBasis: playbackOrigin.resolutionBasis,
  returnModel: playbackOrigin
}).session;
assert.deepEqual(
  { start: watched.model.interval.start, end: watched.model.interval.end },
  { start: 25, end: 50 }
);
const watchedBoundary = switchEndpoint(watched).session;
assert.equal(watchedBoundary.model.resolution.C, 50);
assert.deepEqual(
  { start: watchedBoundary.model.interval.start, end: watchedBoundary.model.interval.end },
  { start: 25, end: 50 }
);

const completedCycle = projectPlayback(watched.model, {
  departure: 30,
  current: 40,
  cycles: 1,
  returnModel: watched.model
});
assert.deepEqual(
  { start: completedCycle.model.interval.start, end: completedCycle.model.interval.end },
  watched.model.range
);

const transport = createPlaybackTransport({
  departure: 37,
  parentNeighborhood: { L: 10, C: 37, R: 90 },
  parentResolutionBasis: "range",
  returnModel: watched.model
});
const rebased = rebasePlaybackTransport(transport, 10, 1234);
assert.equal(rebased.entry, 10);
assert.equal(rebased.startedAt, 1234);
assert.equal(rebased.cycles, 1);

// Undo and Redo are exact inverses over the same semantic checkpoint.
const edited = refine(createSession({ duration: 100, current: 50 }), "forward").session;
const undone = undo(edited).session;
const redone = redo(undone).session;
assert.deepEqual(redone.model, edited.model);
assert.equal(redone.history.length, edited.history.length);
assert.equal(redone.future.length, 0);

// Timeline packing has no arbitrary lane cap.
const packed = packTimelineSectionLanes(Array.from({ length: 7 }, (_, index) => ({
  id: `section-${index}`,
  projected: { start: 10, end: 20 }
})));
assert.equal(packed.laneCount, 7);
assert.deepEqual(packed.entries.map(entry => entry.lane), [0, 1, 2, 3, 4, 5, 6]);

// Short, adjacent Sections must also reserve the visible width of their weight
// selectors. Edge controls stay inside the map instead of overlapping or
// clipping beyond it.
const packedControls = packTimelineSectionLanes([
  { id: "edge-a", projected: { start: 0, end: 1 } },
  { id: "edge-b", projected: { start: 2, end: 3 } },
  { id: "far", projected: { start: 20, end: 21 } }
], {
  timelineExtent: 100,
  controlExtent: 10
});
assert.deepEqual(
  packedControls.entries.map(entry => entry.lane),
  [0, 1, 0]
);
assert.equal(packedControls.entries[0].controlCoordinate, 5);
assert.equal(packedControls.entries[1].controlCoordinate, 5);

console.log("Coherence tests passed: guarded Step, swapped Refine, exact previews, weighted navigation, monotonic playback, history, and uncapped timeline lanes.");
