import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EPSILON,
  RESOLUTION_BASIS,
  createRoot,
  getTargets,
  seedNeighborhoodFromMovement,
  isRangeNeighborhood,
  logSpeed,
  chooseSupportedRate
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
  completeContinue,
  completeSkim,
  reachSkimDestination
} from "./session.js";
import {
  TRANSPORT_KIND,
  createSkimTransport,
  desiredSkimRate
} from "./transport.js";

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

// Refine subdivides the movement-seeded Neighborhood and Return restores it.
const beforeRefine = snapshotModel(session.model);
session = refine(session, "backward").session;
assert.equal(session.model.resolution.C, 150);
assert.equal(session.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
session = returnState(session).session;
assert.deepEqual(session.model.resolution, beforeRefine.resolution);
assert.equal(session.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);

// Reopen alone restores Range scale and preserves Interval.
const intervalBeforeReopen = copy(session.model.interval);
session = reopen(session).session;
assert.deepEqual(session.model.resolution, { L: 0, C: 180, R: 480, level: 0 });
assert.equal(session.model.resolutionBasis, RESOLUTION_BASIS.RANGE);
assert.deepEqual(session.model.interval, intervalBeforeReopen);
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

// Step preserves the origin Neighborhood inside it and seeds movement scale outside it.
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
assert.deepEqual(stepped.model.resolution, { L: 180, C: 300, R: 420, level: 0 });
assert.equal(stepped.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
assert.deepEqual({ start: stepped.model.interval.start, end: stepped.model.interval.end }, { start: 180, end: 300 });

// A coalesced Step result depends on origin plus final destination, not the path.
let pathA = createSession({ duration: 100, current: 20 });
pathA = goTo(pathA, 40, { operator: "timeline" }).session; // 20—40—60
const pathOrigin = snapshotModel(pathA.model);
pathA = step(pathA, "forward", 15, {
  departure: 40,
  originResolution: pathOrigin.resolution,
  originResolutionBasis: pathOrigin.resolutionBasis
}).session;
pathA = step(pathA, "forward", 20, {
  departure: 40,
  originResolution: pathOrigin.resolution,
  originResolutionBasis: pathOrigin.resolutionBasis,
  amend: true
}).session;
pathA = step(pathA, "backward", 20, {
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

// Continue preserves local basis inside, reopens beyond it, and clears Interval on wrap.
let continued = createSession({ duration: 480, current: 120 });
continued = goTo(continued, 180, { operator: "timeline" }).session;
const continuedReturn = snapshotModel(continued.model);
continued = completeContinue(continued, {
  current: 200,
  departure: 180,
  parentNeighborhood: copy(continued.model.resolution),
  parentResolutionBasis: continued.model.resolutionBasis,
  crossedResolution: false,
  wrapped: false,
  returnModel: continuedReturn
}).session;
assert.deepEqual(continued.model.resolution, { L: 180, C: 200, R: 240, level: 0 });
assert.equal(continued.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
continued = completeContinue(continued, {
  current: 300,
  departure: 200,
  parentNeighborhood: copy(continued.model.resolution),
  parentResolutionBasis: continued.model.resolutionBasis,
  crossedResolution: true,
  wrapped: false,
  returnModel: snapshotModel(continued.model)
}).session;
assert.equal(continued.model.resolutionBasis, RESOLUTION_BASIS.RANGE);
assert.deepEqual(continued.model.resolution, { L: 0, C: 300, R: 480, level: 0 });
const wrapped = completeContinue(continued, {
  current: 40,
  departure: 300,
  parentNeighborhood: copy(continued.model.resolution),
  parentResolutionBasis: continued.model.resolutionBasis,
  crossedResolution: true,
  wrapped: true,
  returnModel: snapshotModel(continued.model)
});
assert.equal(wrapped.changed, true);
assert.equal(wrapped.session.model.interval, null);
assert.equal(wrapped.intervalCleared, true);
assert.equal(wrapped.session.model.resolutionBasis, RESOLUTION_BASIS.RANGE);

// Range operations preserve only wholly contained Intervals.
let ranged = createSession({ duration: 100, current: 20 });
ranged = goTo(ranged, 40, { operator: "timeline" }).session;
const containedInterval = copy(ranged.model.interval);
ranged = setRange(ranged, 10, 50, 40).session;
assert.deepEqual(ranged.model.interval, containedInterval);
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

// Focused Section deletion clears Focus and presentation state; Return restores all.
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

// Skim holds one boosted supported rate, resolves Forward, then hands off to Continue.
const skim = createSkimTransport({
  departure: 180,
  target: 210,
  parentNeighborhood: { L: 120, C: 180, R: 240, level: 0 },
  parentResolutionBasis: RESOLUTION_BASIS.MOVEMENT,
  returnModel: {},
  maxRate: 2,
  rate: 2
});
assert.equal(skim.kind, TRANSPORT_KIND.SKIM);
assert.equal(desiredSkimRate(skim, 180, [1, 1.5, 2]), 2);
assert.equal(desiredSkimRate(skim, 195, [1, 1.5, 2]), 2);
assert.equal(desiredSkimRate(skim, 210, [1, 1.5, 2]), 2);
assert.equal(desiredSkimRate({ ...skim, rate: 1.5 }, 210, [1, 1.5, 2]), 1.5);
assert.equal(desiredSkimRate(skim, 195, [1]), 1);

let skimSession = createSession({ duration: 480, current: 120 });
skimSession = goTo(skimSession, 180, { operator: "timeline" }).session;
skimSession = reachSkimDestination(skimSession, {
  parentNeighborhood: copy(skimSession.model.resolution),
  parentResolutionBasis: skimSession.model.resolutionBasis,
  departure: 180,
  destination: 210
}).session;
assert.deepEqual(skimSession.model.resolution, { L: 180, C: 210, R: 240, level: 1 });
assert.equal(skimSession.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
assert.deepEqual({ start: skimSession.model.interval.start, end: skimSession.model.interval.end }, { start: 180, end: 210 });

let partialSkim = createSession({ duration: 480, current: 120 });
partialSkim = goTo(partialSkim, 180, { operator: "timeline" }).session;
partialSkim = completeSkim(partialSkim, {
  current: 195,
  departure: 180,
  parentNeighborhood: copy(partialSkim.model.resolution),
  parentResolutionBasis: partialSkim.model.resolutionBasis,
  returnModel: snapshotModel(partialSkim.model)
}).session;
assert.equal(partialSkim.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
assert.deepEqual(partialSkim.model.resolution, { L: 180, C: 195, R: 240, level: 0 });
assert.deepEqual({ start: partialSkim.model.interval.start, end: partialSkim.model.interval.end }, { start: 180, end: 195 });

// Compatibility utilities remain callable; only Skim's use of the curve is removed.
assert.equal(logSpeed(2, 0), 2);
assert.equal(logSpeed(2, 1), 1);
assert.equal(chooseSupportedRate([1, 1.5, 2], 1.8), 1.5);
assert.ok(EPSILON > 0);

// Repository-level contracts for the narrow UI/application patches.
const appSource = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const viewSource = readFileSync(new URL("./view.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
assert.match(appSource, /originResolution: state\.pendingStep\.originModel\.resolution/, "Rapid Step must derive spatial state from its origin.");
assert.match(appSource, /Left the focused Section and opened Full Video/, "Composite direct Go must disclose its Range escape.");
assert.match(appSource, /parentResolutionBasis:/, "Continue and Skim must preserve Resolution basis during transport.");
assert.match(appSource, /Skimming at \${rate}× to/, "Skim must report one fixed boosted rate.");
assert.match(viewSource, /resolutionBasis === RESOLUTION_BASIS\.MOVEMENT/, "Resolution presentation must distinguish movement scale.");
assert.doesNotMatch(viewSource, /×→1×/, "Skim metadata must not advertise progressive slowdown.");
assert.match(viewSource, /focused-section-title"\]\.textContent = "—"/, "View must clear stale focused Section text.");
assert.match(cssSource, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/, "Hidden state must override component display rules.");

console.log("v5.2 comprehensive regression tests passed: direct scale, Refine, Step, Continue, Skim, Range, Focus, Guide, and Return.");
