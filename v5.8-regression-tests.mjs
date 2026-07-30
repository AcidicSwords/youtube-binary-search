import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EPSILON,
  RESOLUTION_BASIS,
  createRoot,
  getTargets,
  seedNeighborhoodFromMovement,
  isRangeNeighborhood
} from "./range-geometry.js";
import {
  createGuide,
  ensurePin,
  createSectionFromTimes,
  resolveSection
} from "./guide.js";
import {
  createSession,
  copy,
  snapshotModel,
  goTo,
  refine,
  reopen,
  step,
  setRange,
  previewRange,
  focusSection,
  leaveSection,
  deleteGuideSection,
  renameGuidePin,
  returnState,
  projectPlayback,
  completePlayback
} from "./session.js";

const range = { start: 0, end: 480 };
assert.deepEqual(seedNeighborhoodFromMovement(120, 180, range), { L: 120, C: 180, R: 240, level: 0 });
assert.deepEqual(seedNeighborhoodFromMovement(180, 120, range), { L: 60, C: 120, R: 180, level: 0 });
assert.deepEqual(seedNeighborhoodFromMovement(430, 470, range), { L: 430, C: 470, R: 480, level: 0 });
assert.deepEqual(seedNeighborhoodFromMovement(40, 10, range), { L: 0, C: 10, R: 40, level: 0 });
assert.equal(isRangeNeighborhood(createRoot(0, 120, 480), range), true);
assert.equal(isRangeNeighborhood(seedNeighborhoodFromMovement(120, 180, range), range), false);

// Direct Go creates Current, Interval, and movement scale.
let session = createSession({ duration: 480, current: 120 });
let moved = goTo(session, 180, { operator: "timeline", label: "Timeline Click" });
assert.equal(moved.changed, true);
session = moved.session;
assert.deepEqual({ start: session.model.interval.start, end: session.model.interval.end }, { start: 120, end: 180 });
assert.deepEqual(session.model.resolution, { L: 120, C: 180, R: 240, level: 0 });
assert.equal(session.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
assert.deepEqual(getTargets(session.model.resolution), { backward: 150, forward: 210 });

// Refine subdivides the movement-seeded Neighborhood and Undo restores it.
const beforeRefine = snapshotModel(session.model);
session = refine(session, "backward").session;
assert.equal(session.model.resolution.C, 150);
assert.equal(session.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
session = returnState(session).session;
assert.deepEqual(session.model.resolution, beforeRefine.resolution);
assert.equal(session.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);

// Reopen restores Range scale and preserves Interval geometry while updating
// the search frame stored at its active endpoint.
const intervalBeforeReopen = copy(session.model.interval);
session = reopen(session).session;
assert.deepEqual(session.model.resolution, { L: 0, C: 180, R: 480, level: 0 });
assert.equal(session.model.resolutionBasis, RESOLUTION_BASIS.RANGE);
assert.deepEqual(
  {
    start: session.model.interval.start,
    end: session.model.interval.end,
    departure: session.model.interval.departure,
    arrival: session.model.interval.arrival
  },
  {
    start: intervalBeforeReopen.start,
    end: intervalBeforeReopen.end,
    departure: intervalBeforeReopen.departure,
    arrival: intervalBeforeReopen.arrival
  }
);
assert.deepEqual(session.model.interval.arrivalFrame.resolution, session.model.resolution);
session = returnState(session).session;
assert.deepEqual(session.model.resolution, { L: 120, C: 180, R: 240, level: 0 });

// Same-address Go is a true no-op; it never substitutes for Reopen.
const sameBefore = snapshotModel(session.model);
const sameHistory = session.history.length;
const same = goTo(session, 180, { operator: "timeline", label: "Timeline Click" });
assert.equal(same.changed, false);
assert.equal(same.reason, "same-address");
assert.equal(same.session, session);
assert.equal(same.session.history.length, sameHistory);
assert.deepEqual(same.session.model, sameBefore);

// Old Range-level Refine remains available through explicit Reopen.
let oldEquivalent = createSession({ duration: 480, current: 120 });
oldEquivalent = goTo(oldEquivalent, 180, { operator: "timeline" }).session;
oldEquivalent = reopen(oldEquivalent).session;
oldEquivalent = refine(oldEquivalent, "forward").session;
assert.equal(oldEquivalent.model.resolution.C, 330);

// Step preserves the origin Neighborhood and keeps its approached endpoint fixed
// while the prospective midpoint still has a full Step of headroom.
let stepped = createSession({ duration: 480, current: 120 });
stepped = goTo(stepped, 180, { operator: "timeline" }).session; // 120—180—240
const stepOrigin = snapshotModel(stepped.model);
stepped = step(stepped, "forward", 20, {
  departure: 180,
  originResolution: stepOrigin.resolution,
  originResolutionBasis: stepOrigin.resolutionBasis
}).session;
assert.deepEqual(stepped.model.resolution, { L: 120, C: 200, R: 240, level: 0 });
assert.equal(stepped.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
stepped = step(stepped, "forward", 100, {
  departure: 180,
  originResolution: stepOrigin.resolution,
  originResolutionBasis: stepOrigin.resolutionBasis,
  amend: true
}).session;
assert.deepEqual(stepped.model.resolution, { L: 120, C: 300, R: 480, level: 0 });
assert.equal(stepped.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
assert.deepEqual(getTargets(stepped.model.resolution), { backward: 210, forward: 390 });
assert.deepEqual(
  { start: stepped.model.interval.start, end: stepped.model.interval.end },
  { start: 120, end: 300 },
  "Step must extend the Interval established by timeline traversal rather than replace it from the first Step departure."
);

let boundaryPush = createSession({ duration: 100, current: 50 });
boundaryPush = refine(boundaryPush, "backward").session;
boundaryPush = step(boundaryPush, "forward", 25).session;
assert.deepEqual(boundaryPush.model.resolution, { L: 0, C: 50, R: 100, level: 0 });
assert.equal(getTargets(boundaryPush.model.resolution).forward, 75);

// Step edits the active Interval around its original departure anchor.
let drawnInterval = createSession({ duration: 100, current: 20 });
drawnInterval = goTo(drawnInterval, 40, { operator: "timeline" }).session;
drawnInterval = step(drawnInterval, "forward", 10).session;
assert.deepEqual(
  { start: drawnInterval.model.interval.start, end: drawnInterval.model.interval.end },
  { start: 20, end: 50 },
  "Step outward extends the active Interval."
);
drawnInterval = step(drawnInterval, "backward", 10).session;
assert.deepEqual(
  { start: drawnInterval.model.interval.start, end: drawnInterval.model.interval.end },
  { start: 20, end: 40 },
  "Step inward shrinks the active Interval."
);
drawnInterval = step(drawnInterval, "backward", 30).session;
assert.deepEqual(
  {
    start: drawnInterval.model.interval.start,
    end: drawnInterval.model.interval.end,
    departure: drawnInterval.model.interval.departure,
    arrival: drawnInterval.model.interval.arrival,
    direction: drawnInterval.model.interval.direction
  },
  { start: 10, end: 20, departure: 20, arrival: 10, direction: "backward" },
  "Crossing the anchor redraws the Interval in the opposite direction."
);

let collapsedInterval = createSession({ duration: 100, current: 20 });
collapsedInterval = goTo(collapsedInterval, 40, { operator: "timeline" }).session;
collapsedInterval = step(collapsedInterval, "backward", 20).session;
assert.equal(collapsedInterval.model.interval, null, "Landing on the anchor collapses the Interval.");
collapsedInterval = step(collapsedInterval, "forward", 10).session;
assert.deepEqual(
  { start: collapsedInterval.model.interval.start, end: collapsedInterval.model.interval.end },
  { start: 20, end: 30 },
  "The next Step redraws from the collapsed anchor."
);

let refinedDraw = createSession({ duration: 100, current: 50 });
refinedDraw = refine(refinedDraw, "forward").session;
assert.deepEqual(
  { start: refinedDraw.model.interval.start, end: refinedDraw.model.interval.end },
  { start: 50, end: 75 }
);
const refinedBeforeStep = snapshotModel(refinedDraw.model);
refinedDraw = step(refinedDraw, "backward", 5).session;
assert.deepEqual(
  { start: refinedDraw.model.interval.start, end: refinedDraw.model.interval.end },
  { start: 50, end: 70 },
  "Step must trim a Refine-established Interval without replacing its anchor."
);
refinedDraw = returnState(refinedDraw).session;
assert.deepEqual(refinedDraw.model.interval, refinedBeforeStep.interval, "Undo restores the preceding resized-Interval checkpoint exactly.");

// A coalesced Step result depends on origin plus final destination, not the path.
let pathA = createSession({ duration: 100, current: 20 });
pathA = goTo(pathA, 40, { operator: "timeline" }).session; // 20—40—60
const pathOrigin = snapshotModel(pathA.model);
pathA = step(pathA, "forward", 15, {
  departure: 40,
  originResolution: pathOrigin.resolution,
  originResolutionBasis: pathOrigin.resolutionBasis
}).session;
pathA = step(pathA, "forward", 15, {
  departure: 40,
  originResolution: pathOrigin.resolution,
  originResolutionBasis: pathOrigin.resolutionBasis,
  amend: true
}).session;
pathA = step(pathA, "backward", 15, {
  departure: 40,
  originResolution: pathOrigin.resolution,
  originResolutionBasis: pathOrigin.resolutionBasis,
  amend: true
}).session;
let pathB = createSession({ duration: 100, current: 20 });
pathB = goTo(pathB, 40, { operator: "timeline" }).session;
pathB = step(pathB, "forward", 15, {
  departure: 40,
  originResolution: pathOrigin.resolution,
  originResolutionBasis: pathOrigin.resolutionBasis
}).session;
assert.deepEqual(pathA.model.resolution, pathB.model.resolution);
assert.equal(pathA.model.resolutionBasis, pathB.model.resolutionBasis);
assert.deepEqual(
  pathA.model.interval && { start: pathA.model.interval.start, end: pathA.model.interval.end },
  pathB.model.interval && { start: pathB.model.interval.start, end: pathB.model.interval.end }
);

// Native playback preserves local basis, the opposite Interval endpoint, and
// the receding Resolution side while translating the approached side.
let continued = createSession({ duration: 480, current: 120 });
continued = goTo(continued, 180, { operator: "timeline" }).session;
const continuedReturn = snapshotModel(continued.model);
continued = completePlayback(continued, {
  current: 200,
  departure: 180,
  parentNeighborhood: copy(continued.model.resolution),
  parentResolutionBasis: continued.model.resolutionBasis,
  wrapped: false,
  returnModel: continuedReturn
}).session;
assert.deepEqual(continued.model.resolution, { L: 120, C: 200, R: 260, level: 0 });
assert.equal(continued.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
continued = completePlayback(continued, {
  current: 300,
  departure: 200,
  parentNeighborhood: copy(continued.model.resolution),
  parentResolutionBasis: continued.model.resolutionBasis,
  wrapped: false,
  returnModel: snapshotModel(continued.model)
}).session;
assert.equal(continued.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
assert.deepEqual(continued.model.resolution, { L: 120, C: 300, R: 360, level: 0 });
assert.deepEqual({ start: continued.model.interval.start, end: continued.model.interval.end }, { start: 120, end: 300 });

// Range operations preserve only wholly contained Intervals.
let ranged = createSession({ duration: 100, current: 20 });
ranged = goTo(ranged, 40, { operator: "timeline" }).session;
const containedInterval = copy(ranged.model.interval);
ranged = setRange(ranged, 10, 50, 40).session;
assert.deepEqual(
  {
    start: ranged.model.interval.start,
    end: ranged.model.interval.end,
    departure: ranged.model.interval.departure,
    arrival: ranged.model.interval.arrival
  },
  {
    start: containedInterval.start,
    end: containedInterval.end,
    departure: containedInterval.departure,
    arrival: containedInterval.arrival
  }
);
assert.deepEqual(ranged.model.interval.arrivalFrame.resolution, ranged.model.resolution);
ranged = setRange(ranged, 30, 50, 40).session;
assert.equal(ranged.model.interval, null);
let previewed = createSession({ duration: 100, current: 20 });
previewed = goTo(previewed, 40, { operator: "timeline" }).session;
previewed = previewRange(previewed, 30, 60, 40).session;
assert.equal(previewed.model.interval, null);

// Focus is a Range operation, not a traversal: relocation creates no Interval.
const focusGuide = createGuide("video");
const retained = createSectionFromTimes(focusGuide, 100, 200, { label: "Active" }).section;
let focused = createSession({ duration: 480, current: 20, guide: focusGuide });
focused = goTo(focused, 40, { operator: "timeline" }).session;
assert.ok(focused.model.interval);
const focusResult = focusSection(focused, retained.id);
assert.equal(focusResult.changed, true);
focused = focusResult.session;
assert.equal(focused.model.resolution.C, 150);
assert.equal(focused.model.interval, null);
assert.equal(focused.model.focus.sectionId, retained.id);
assert.deepEqual(focused.model.range, { start: 100, end: 200 });
assert.equal(focused.model.resolutionBasis, RESOLUTION_BASIS.RANGE);

// Direct Go outside Focus is the explicit composite Leave Section + Go.
const outside = goTo(focused, 300, { operator: "timeline", label: "Timeline Click" });
assert.equal(outside.changed, true);
assert.equal(outside.leftFocus, true);
assert.equal(outside.label, "Leave Section + Timeline Click");
assert.equal(outside.session.model.focus, null);
assert.deepEqual(outside.session.model.range, { start: 0, end: 480 });
assert.deepEqual(outside.session.model.resolution, { L: 150, C: 300, R: 450, level: 0 });
assert.deepEqual({ start: outside.session.model.interval.start, end: outside.session.model.interval.end }, { start: 150, end: 300 });

// Focused Section deletion clears Focus and presentation state; Undo restores all.
let deleteFocused = createSession({ duration: 480, current: 150, guide: focusGuide });
deleteFocused = focusSection(deleteFocused, retained.id).session;
const deleted = deleteGuideSection(deleteFocused, retained.id);
assert.equal(deleted.changed, true);
assert.equal(deleted.session.model.focus, null);
assert.deepEqual(deleted.session.model.range, { start: 0, end: 480 });
assert.equal(resolveSection(deleted.session.model.guide, retained.id), null);
const restored = returnState(deleted.session).session;
assert.equal(restored.model.focus.sectionId, retained.id);
assert.ok(resolveSection(restored.model.guide, retained.id));
assert.deepEqual(restored.model.range, { start: 100, end: 200 });

// Any Guide edit repairs an impossible stale Focus defensively.
const staleGuide = createGuide("video");
const stalePin = ensurePin(staleGuide, 50, { label: "Fifty" }).pin;
let stale = createSession({ duration: 480, current: 150, guide: staleGuide });
stale.model.focus = { sectionId: "missing", returnRange: { start: 0, end: 480 } };
stale.model.range = { start: 100, end: 200 };
stale.model.resolution = createRoot(100, 150, 200);
stale.model.resolutionBasis = RESOLUTION_BASIS.RANGE;
const reconciled = renameGuidePin(stale, stalePin.id, "Renamed");
assert.equal(reconciled.changed, true);
assert.equal(reconciled.session.model.focus, null);
assert.deepEqual(reconciled.session.model.range, { start: 0, end: 480 });
assert.equal(reconciled.focusReconciled, true);

// Native playback is the sole continuous settlement operation.
let playbackSession = createSession({ duration: 480, current: 120 });
playbackSession = goTo(playbackSession, 180, { operator: "timeline" }).session;
const playbackOrigin = snapshotModel(playbackSession.model);
const playbackOptions = {
  current: 195,
  departure: 180,
  parentNeighborhood: copy(playbackSession.model.resolution),
  parentResolutionBasis: playbackSession.model.resolutionBasis,
  returnModel: snapshotModel(playbackSession.model)
};
const playbackProjection = projectPlayback(playbackSession.model, playbackOptions);
assert.deepEqual(
  playbackSession.model,
  playbackOrigin,
  "Live playback projection must not mutate Session before settlement."
);
playbackSession = completePlayback(playbackSession, playbackOptions).session;
assert.equal(playbackSession.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
assert.deepEqual(playbackSession.model.resolution, { L: 120, C: 195, R: 255, level: 0 });
assert.deepEqual({ start: playbackSession.model.interval.start, end: playbackSession.model.interval.end }, { start: 120, end: 195 });
assert.deepEqual(playbackProjection.model.resolution, playbackSession.model.resolution);
assert.equal(playbackProjection.model.resolutionBasis, playbackSession.model.resolutionBasis);
for (const key of ["start", "end", "departure", "arrival", "operator", "mode"]) {
  assert.deepEqual(
    playbackProjection.model.interval[key],
    playbackSession.model.interval[key],
    `Live and settled playback must agree on Interval ${key}.`
  );
}
assert.deepEqual(
  playbackProjection.model.interval.departureFrame,
  playbackSession.model.interval.departureFrame
);
assert.deepEqual(
  playbackProjection.model.interval.arrivalFrame,
  playbackSession.model.interval.arrivalFrame
);

assert.ok(EPSILON > 0);

// Repository-level contracts for the narrow UI/application patches.
const appSource = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const sessionSource = readFileSync(new URL("./session.js", import.meta.url), "utf8");
const viewSource = readFileSync(new URL("./view.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
assert.match(appSource, /originResolution: state\.pendingStep\.originModel\.resolution/, "Rapid Step must derive spatial state from its origin.");
assert.match(appSource, /intervalDeparture: state\.pendingStep\.intervalDeparture/, "Pending Step must freeze the Interval anchor across repeat.");
assert.match(
  appSource,
  /createStepGestureController\([\s\S]*finish:[\s\S]*completePendingStep/,
  "Every held Step gesture must settle its repeated movement as one transaction."
);
assert.match(sessionSource, /stepIntervalAnchor[\s\S]*intervalDeparture/, "Session must separate Step movement departure from the Interval anchor.");
assert.match(sessionSource, /refineIntervalRelation[\s\S]*classifyRefineRelation[\s\S]*relation:\s*"shorten"/,
  "Refine must distinguish outside-Interval replacement from inside-Interval shortening.");
assert.match(sessionSource, /export function focusWorkingSection[\s\S]*FOCUS_KIND\.WORKING/,
  "The Working Section must be focusable without a Guide record.");
assert.match(sessionSource, /export function overwriteGuideSection[\s\S]*replaceSectionExtent/,
  "Guide overwrite must remain an explicit persistence transaction.");
assert.match(appSource, /Left the focused Section and opened Full Video/, "Composite direct Go must disclose its Range escape.");
assert.match(appSource, /createPlaybackTransport/, "Native playback must own continuous settlement.");
assert.doesNotMatch(appSource, /startSkim|createSkimTransport|desiredSkimRate/, "Skim must be removed from the runtime.");
assert.match(viewSource, /resolutionBasis === RESOLUTION_BASIS\.MOVEMENT/, "Resolution presentation must distinguish movement scale.");
assert.doesNotMatch(viewSource, /skim/i, "The projection layer must not expose retired Skim controls.");
assert.match(viewSource, /focused-section-title"\]\.textContent = "—"/, "View must clear stale focused Section text.");
assert.match(cssSource, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/, "Hidden state must override component display rules.");

console.log("v5.8.6 comprehensive regression tests passed: direct scale, Refine, endpoint frames, composable Step intervals, native playback, Range, Focus, Guide, Interval boundaries, and Undo.");
