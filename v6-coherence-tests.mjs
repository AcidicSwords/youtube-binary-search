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
import { projectionForModel } from "./temporal-projection.js";
import { deriveStepField } from "./step-field-geometry.js";
import {
  createPlaybackTransport,
  rebasePlaybackTransport
} from "./transport.js";
import {
  packTimelineSectionLanes,
  computeTimelineFoldLayout
} from "./view.js";

// Direct placement gives the new Working Interval two equal margins on each
// side in Traversal Time: the unclipped Resolution is exactly five Interval
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
  const metricGuide = createGuide("movement-frame-fold");
  createSectionFromTimes(metricGuide, 430, 445, {
    label: "Metric Fold",
    collapsed: true
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
  assert.deepEqual(frame, { L: 230, C: 500, R: 670, level: 0 });
  assert.equal(
    metric.toCoordinate(frame.R) - metric.toCoordinate(frame.L),
    5 * (
      metric.toCoordinate(500) - metric.toCoordinate(400)
    ),
    "The five-times law is measured in Traversal Time across a Fold."
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

// Reopen abandons the local frame without changing the Working Interval. A
// shifted/local Refine back across Current is subtractive only when its new
// midpoint belongs to that Interval; an outside midpoint records the complete
// new traversal exactly like a fresh Refine movement.
let reopenedReverse = createSession({ duration: 100, current: 50 });
reopenedReverse = refine(reopenedReverse, "backward").session;
reopenedReverse = reopen(reopenedReverse).session;
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

// Field geometry is source-time geometry even while its Center is inside a Fold.
const foldedGuide = createGuide("coherence-fold");
createSectionFromTimes(foldedGuide, 30, 45, {
  label: "Fold",
  collapsed: true
});
const foldedSession = createSession({
  duration: 100,
  current: 35,
  guide: foldedGuide
});
const foldedProjection = projectionForModel(foldedSession.model);
const field = deriveStepField(
  35,
  { backward: 10, forward: 10, linked: true },
  { start: 0, end: 100 },
  foldedProjection
);
assert.deepEqual(
  { tail: field.tail.target, lead: field.lead.target },
  { tail: 25, lead: 45 }
);

// Plain Step crosses the zero-width Fold atomically; Shift+Step exposes the
// ordered faces and then the synthetic Range boundary.
let foldWalk = createSession({
  duration: 100,
  current: 29,
  guide: foldedGuide,
  stepReach: 1
});
foldWalk = step(foldWalk, "forward", 1).session;
assert.equal(foldWalk.model.resolution.C, 45);
assert.ok(foldWalk.model.interval.start <= 30);
assert.ok(foldWalk.model.interval.end >= 45);
assert.ok(foldWalk.model.resolution.L <= foldWalk.model.interval.start);
assert.ok(foldWalk.model.resolution.R >= foldWalk.model.interval.end);
assert.notEqual(getTargets(foldWalk.model.resolution, projectionForModel(foldWalk.model).metric).forward, null);

const foldProjection = projectionForModel(createSession({
  duration: 100,
  current: 29,
  guide: foldedGuide
}).model);
const lowerFace = nextPin(foldedGuide, 29, { start: 0, end: 100 }, foldProjection);
const upperFace = nextPin(foldedGuide, lowerFace.t, { start: 0, end: 100 }, foldProjection);
const rangeEnd = nextPin(foldedGuide, upperFace.t, { start: 0, end: 100 }, foldProjection);
assert.deepEqual(
  [lowerFace.t, upperFace.t, rangeEnd.t],
  [30, 45, 100]
);
assert.equal(rangeEnd.stopKind, "range-boundary");

let pinWalk = createSession({
  duration: 100,
  current: 29,
  guide: foldedGuide,
  stepReach: 1
});
pinWalk = stepToPin(pinWalk, lowerFace.t, "forward", { stepSeconds: 1 }).session;
pinWalk = stepToPin(pinWalk, upperFace.t, "forward", { stepSeconds: 1 }).session;
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

// Timeline packing has no arbitrary lane cap and disjoint Fold hit regions are
// guaranteed whenever the surface has enough physical room.
const packed = packTimelineSectionLanes(Array.from({ length: 7 }, (_, index) => ({
  id: `section-${index}`,
  projected: { start: 10, end: 20 }
})));
assert.equal(packed.laneCount, 7);
assert.deepEqual(packed.entries.map(entry => entry.lane), [0, 1, 2, 3, 4, 5, 6]);

const foldLayout = computeTimelineFoldLayout([
  { traversal: 48, sourceDuration: 4, sections: [{}] },
  { traversal: 49, sourceDuration: 16, sections: [{}, {}] },
  { traversal: 50, sourceDuration: 9, sections: [{}] }
], 600, 100);
for (let index = 1; index < foldLayout.length; index += 1) {
  const previous = foldLayout[index - 1];
  const current = foldLayout[index];
  assert.ok(
    previous.x + previous.width / 2 + 6
      <= current.x - current.width / 2 + Number.EPSILON
  );
}
assert.ok(foldLayout[1].height > foldLayout[0].height);

console.log("v6 coherence tests passed: guarded Step, swapped Refine, exact previews, source Fields, Fold stops, monotonic playback, history, and collision-aware timeline layout.");
