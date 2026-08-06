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
  switchActiveEnd,
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
import {
  createTimelineProjection,
  projectionForModel
} from "./timeline-projection.js";
import { derivePanorama } from "./panorama-geometry.js";
import {
  createPlaybackTransport,
  rebasePlaybackTransport
} from "./transport.js";
import { packTimelineSectionLanes } from "./view.js";

// Selecting retained topology makes its full extent the Active Span and
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
  assert.deepEqual(selectedResult.session.model.neighborhood, {
    L: 40,
    C: 60,
    R: 80,
    level: 0
  });
  assert.equal(selectedResult.session.model.activeSpan.start, 40);
  assert.equal(selectedResult.session.model.activeSpan.end, 80);
  assert.equal(selectedResult.session.model.activeSpan.arrival, 60);
  assert.equal(selectedResult.session.model.activeSpan.departure, 40);
  assert.equal(selectedResult.session.model.activeSpan.operator, "section");
  assert.equal(
    goToGuideSection(selectedResult.session, selected.id).changed,
    false,
    "Selecting the already active Section must not add redundant history."
  );
}

// Direct placement gives the new Active Span two equal margins on each
// side in Timeline Space: the unclipped Current Neighborhood is exactly five Interval
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
    weighting: 0.5
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

// Plain Refine is retained-anchor refinement. Shift+Refine draws only the
// Current-to-midpoint traversal; alternating the two remains deterministic.
let retained = createSession({ duration: 100, current: 50 });
retained = refine(retained, "backward").session;
retained = refine(retained, "backward").session;
assert.deepEqual(retained.model.neighborhood, { L: 0, C: 12.5, R: 50, level: 2 });
assert.deepEqual(
  { start: retained.model.activeSpan.start, end: retained.model.activeSpan.end },
  { start: 12.5, end: 50 }
);

let local = createSession({ duration: 100, current: 50 });
local = localRefine(local, "backward").session;
local = localRefine(local, "backward").session;
assert.deepEqual(local.model.neighborhood, { L: 0, C: 12.5, R: 25, level: 2 });
assert.deepEqual(
  { start: local.model.activeSpan.start, end: local.model.activeSpan.end },
  { start: 12.5, end: 25 }
);

const mixed = localRefine(retained, "forward").session;
assert.deepEqual(mixed.model.neighborhood, { L: 12.5, C: 31.25, R: 50, level: 3 });
assert.deepEqual(
  { start: mixed.model.activeSpan.start, end: mixed.model.activeSpan.end },
  { start: 12.5, end: 31.25 }
);

// Reopen abandons the local frame without changing the Active Span.
// Crossing the old departure makes it part of the new path: plain Refine must
// then record the complete Current-to-target movement rather than discard the
// Current-to-departure portion. Continuing away from the departure still
// retains it. Local Refine independently draws its new traversal.
let reopenedReverse = createSession({ duration: 100, current: 50 });
reopenedReverse = refine(reopenedReverse, "backward").session;
reopenedReverse = reopen(reopenedReverse).session;
const oppositePlain = refine(reopenedReverse, "forward");
assert.equal(oppositePlain.refineRelation, "full");
assert.deepEqual(
  {
    start: oppositePlain.session.model.activeSpan.start,
    end: oppositePlain.session.model.activeSpan.end,
    departure: oppositePlain.session.model.activeSpan.departure,
    arrival: oppositePlain.session.model.activeSpan.arrival
  },
  { start: 25, end: 62.5, departure: 25, arrival: 62.5 }
);
const continuingPlain = refine(reopenedReverse, "backward");
assert.equal(continuingPlain.refineRelation, "retain");
assert.deepEqual(
  {
    start: continuingPlain.session.model.activeSpan.start,
    end: continuingPlain.session.model.activeSpan.end,
    departure: continuingPlain.session.model.activeSpan.departure,
    arrival: continuingPlain.session.model.activeSpan.arrival
  },
  { start: 12.5, end: 50, departure: 50, arrival: 12.5 }
);
const oppositeLocal = localRefine(reopenedReverse, "forward");
assert.equal(oppositeLocal.refineRelation, "draw");
assert.deepEqual(
  {
    start: oppositeLocal.session.model.activeSpan.start,
    end: oppositeLocal.session.model.activeSpan.end,
    departure: oppositeLocal.session.model.activeSpan.departure,
    arrival: oppositeLocal.session.model.activeSpan.arrival
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
    start: mirroredOppositePlain.session.model.activeSpan.start,
    end: mirroredOppositePlain.session.model.activeSpan.end,
    departure: mirroredOppositePlain.session.model.activeSpan.departure,
    arrival: mirroredOppositePlain.session.model.activeSpan.arrival
  },
  { start: 37.5, end: 75, departure: 75, arrival: 37.5 }
);

function transitionGeometry(result) {
  const interval = result.session.model.activeSpan;
  const { createdAt: _createdAt, ...stableInterval } = interval || {};
  return {
    range: result.session.model.range,
    neighborhood: result.session.model.neighborhood,
    neighborhoodBasis: result.session.model.neighborhoodBasis,
    activeSpan: interval ? stableInterval : null
  };
}

// Every hover preview dry-runs the exact Session operation used by commit.
for (const [action, direct] of [
  ["refineBackward", source => refine(source, "backward")],
  ["localRefineBackward", source => localRefine(source, "backward")],
  ["switchActiveEnd", source => switchActiveEnd(source)],
  ["release", source => releaseInterval(source)]
]) {
  const before = structuredClone(retained.model);
  const preview = previewTransition(retained, action);
  const committed = direct(retained);
  assert.equal(preview.changed, committed.changed);
  assert.deepEqual(transitionGeometry(preview), transitionGeometry(committed));
  assert.deepEqual(retained.model, before, `${action} preview must not mutate its source Session.`);
}

// Preview and commit receive the same effective projection. In particular, a
// transient weight relaxation may not leave hover geometry on the stored
// weighted map while the operator commits on the straightened one.
{
  const guide = createGuide("bypassed-preview");
  createSectionFromTimes(guide, 30, 50, {
    label: "Compressed",
    weighting: 0.5
  });
  const source = createSession({ duration: 100, current: 29, guide });
  const projection = createTimelineProjection({
    duration: 100,
    guide,
    weightRelaxation: { kind: "all" }
  });
  const rawPreview = previewTransition(source, "refineForward");
  const effectivePreview = previewTransition(source, "refineForward", {
    projection
  });
  const effectiveCommit = refine(source, "forward", { projection });

  assert.notEqual(
    rawPreview.session.model.neighborhood.C,
    effectiveCommit.session.model.neighborhood.C,
    "The fixture must distinguish the stored and bypassed projections."
  );
  assert.deepEqual(
    transitionGeometry(effectivePreview),
    transitionGeometry(effectiveCommit),
    "A bypassed Refine preview is the exact transition that commits."
  );

  const rawGo = goTo(source, 40, { operator: "nativeGo" });
  const effectiveGo = goTo(source, 40, {
    operator: "nativeGo",
    projection
  });
  assert.notDeepEqual(
    rawGo.session.model.neighborhood,
    effectiveGo.session.model.neighborhood,
    "Native reconciliation must observe the effective projection."
  );
  assert.deepEqual(effectiveGo.session.model.neighborhood, {
    L: 7,
    C: 40,
    R: 62,
    level: 0
  });
}

// Timeline weight does not rewrite the source addresses stored by other models.
const weightedGuide = createGuide("coherence-weight");
createSectionFromTimes(weightedGuide, 30, 45, {
  label: "Compressed",
  weighting: 0.5
});
const weightedSession = createSession({
  duration: 100,
  current: 35,
  guide: weightedGuide
});
const weightedProjection = projectionForModel(weightedSession.model);
const field = derivePanorama(
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
  stepDistance: 1
});
weightedWalk = step(weightedWalk, "forward", 1).session;
assert.equal(weightedWalk.model.neighborhood.C, 30);
assert.ok(weightedWalk.model.activeSpan.start <= 29);
assert.ok(weightedWalk.model.activeSpan.end >= 30);
assert.ok(weightedWalk.model.neighborhood.L <= weightedWalk.model.activeSpan.start);
assert.ok(weightedWalk.model.neighborhood.R >= weightedWalk.model.activeSpan.end);
assert.notEqual(getTargets(weightedWalk.model.neighborhood, projectionForModel(weightedWalk.model).metric).forward, null);

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
  stepDistance: 1
});
pinWalk = stepToPin(pinWalk, sectionStart.t, "forward", { stepSeconds: 1 }).session;
pinWalk = stepToPin(pinWalk, sectionEnd.t, "forward", { stepSeconds: 1 }).session;
assert.deepEqual(
  { start: pinWalk.model.activeSpan.start, end: pinWalk.model.activeSpan.end },
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
watched = switchActiveEnd(watched).session;
const playbackOrigin = snapshotModel(watched.model);
const projectedPlayback = projectPlayback(watched.model, {
  departure: 25,
  current: 30,
  parentNeighborhood: playbackOrigin.neighborhood,
  parentResolutionBasis: playbackOrigin.neighborhoodBasis,
  returnModel: playbackOrigin
});
assert.deepEqual(
  {
    start: projectedPlayback.model.activeSpan.start,
    end: projectedPlayback.model.activeSpan.end,
    departure: projectedPlayback.model.activeSpan.departure,
    arrival: projectedPlayback.model.activeSpan.arrival
  },
  { start: 25, end: 50, departure: 50, arrival: 30 }
);

watched = completePlayback(watched, {
  departure: 25,
  current: 30,
  parentNeighborhood: playbackOrigin.neighborhood,
  parentResolutionBasis: playbackOrigin.neighborhoodBasis,
  returnModel: playbackOrigin
}).session;
assert.deepEqual(
  { start: watched.model.activeSpan.start, end: watched.model.activeSpan.end },
  { start: 25, end: 50 }
);
const watchedBoundary = switchActiveEnd(watched).session;
assert.equal(watchedBoundary.model.neighborhood.C, 50);
assert.deepEqual(
  { start: watchedBoundary.model.activeSpan.start, end: watchedBoundary.model.activeSpan.end },
  { start: 25, end: 50 }
);

const completedCycle = projectPlayback(watched.model, {
  departure: 30,
  current: 40,
  cycles: 1,
  returnModel: watched.model
});
assert.deepEqual(
  { start: completedCycle.model.activeSpan.start, end: completedCycle.model.activeSpan.end },
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

console.log("Operator coherence tests passed: guarded Step, swapped Refine, exact previews, weighted navigation, monotonic playback, history, and uncapped timeline lanes.");
