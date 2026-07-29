import assert from "node:assert/strict";
import {
  EPSILON,
  RESOLUTION_BASIS,
  clamp,
  contains,
  midpoint,
  createRoot,
  getTargets,
  classifyRefineRelation,
  descend,
  refineNeighborhood,
  seedNeighborhoodFromMovement,
  isRangeNeighborhood,
  reopenToRange,
  canReopen,
  stepTarget,
  stepNeighborhood,
  translateNeighborhood,
  settleContinuous,
  getActionRanges,
  logSpeed,
  chooseSupportedRate
} from "./range-geometry.js";
import {
  PIN_KIND,
  createGuide,
  ensurePin,
  renamePin,
  getPin,
  sectionsForPin,
  visiblePins,
  deletePin,
  createSection,
  createSectionFromTimes,
  resolveSection,
  renameSection,
  replaceSectionExtent,
  deleteSection,
  previousPin,
  nextPin,
  sortedSections,
  clusterPinsByPixels,
  normalizeGuide,
  migrateStructureV2,
  migrateSavedRegions,
  sanitizeGuide,
  validateGuide
} from "./guide.js";
import {
  FOCUS_KIND,
  createSession,
  copy,
  snapshotModel,
  goTo,
  refine,
  step,
  reopen,
  setRange,
  previewRange,
  checkpoint,
  focusSection,
  focusWorkingSection,
  leaveSection,
  completePlayback,
  pinCurrent,
  saveIntervalAsSection,
  overwriteGuideSection,
  renameGuidePin,
  deleteGuidePin,
  renameGuideSection,
  deleteGuideSection,
  switchEndpoint,
  returnState
} from "./session.js";
import { parseTimeValue, parseYouTubeUrl } from "./youtube.js";
import { formatTime, formatDuration } from "./view.js";

// Interval geometry.
const root = createRoot(0, 60, 180);
assert.deepEqual(root, { L: 0, C: 60, R: 180, level: 0 });
assert.deepEqual(getTargets(root), { backward: 30, forward: 120 });
assert.equal(
  classifyRefineRelation(
    { departure: 70, arrival: 50 },
    50,
    75
  ),
  "fold"
);
assert.equal(
  classifyRefineRelation(
    { departure: 50, arrival: 70 },
    70,
    80
  ),
  "cross"
);
assert.deepEqual(
  getTargets({ L: 0, C: 0.077, R: 1, level: 3 }),
  { backward: null, forward: 0.5385 },
  "When a midpoint is below the movement floor, Refine must stop rather than leave Current on an endpoint."
);
assert.deepEqual(descend(root, "backward", 30), { L: 0, C: 30, R: 60, level: 1 });
assert.deepEqual(descend(root, "forward", 120), { L: 60, C: 120, R: 180, level: 1 });
assert.deepEqual(refineNeighborhood(root, 20, { start: 0, end: 180 }), { L: 0, C: 20, R: 60, level: 1 });
assert.equal(contains({ start: 10, end: 20 }, 15), true);
assert.equal(contains({ start: 10, end: 20 }, 30), false);
assert.equal(midpoint(120, 180), 150);
assert.equal(clamp(12, 0, 10), 10);
assert.deepEqual(
  seedNeighborhoodFromMovement(60, 90, { start: 0, end: 180 }),
  { L: 60, C: 90, R: 120, level: 0 }
);
assert.deepEqual(
  seedNeighborhoodFromMovement(90, 60, { start: 0, end: 180 }),
  { L: 30, C: 60, R: 90, level: 0 }
);
assert.equal(isRangeNeighborhood(createRoot(0, 60, 180), { start: 0, end: 180 }), true);
assert.throws(() => descend(root, "forward", 30), /follow Current/);

assert.deepEqual(reopenToRange(135, { start: 0, end: 180 }), { L: 0, C: 135, R: 180, level: 0 });
assert.equal(canReopen({ L: 90, C: 135, R: 180, level: 2 }, { start: 0, end: 180 }), true);
assert.equal(canReopen({ L: 0, C: 135, R: 180, level: 0 }, { start: 0, end: 180 }), false);

assert.equal(stepTarget(60, 10, "backward", { start: 0, end: 180 }), 50);
assert.equal(stepTarget(175, 10, "forward", { start: 0, end: 180 }), 180);
assert.deepEqual(
  stepNeighborhood({ L: 30, C: 60, R: 90, level: 2 }, 70, { start: 0, end: 180 }),
  { L: 30, C: 70, R: 100, level: 0 },
  "Every forward Step must push only the approached refinement endpoint."
);
assert.deepEqual(
  stepNeighborhood({ L: 30, C: 60, R: 90, level: 2 }, 100, { start: 0, end: 180 }),
  { L: 30, C: 100, R: 140, level: 0 }
);
assert.deepEqual(
  stepNeighborhood({ L: 30, C: 60, R: 90, level: 2 }, 50, { start: 0, end: 180 }),
  { L: 20, C: 50, R: 90, level: 0 },
  "Every backward Step must push only the approached refinement endpoint."
);
assert.deepEqual(
  stepNeighborhood({ L: 0, C: 25, R: 50, level: 1 }, 50, { start: 0, end: 100 }, 25),
  { L: 0, C: 50, R: 75, level: 0 },
  "Step landing on a refinement endpoint must push that endpoint one Step beyond Current."
);
assert.equal(
  getTargets(stepNeighborhood(
    { L: 0, C: 25, R: 50, level: 1 },
    50,
    { start: 0, end: 100 },
    25
  )).forward,
  62.5,
  "The next directional Refine must remain half a Step away."
);
assert.deepEqual(
  translateNeighborhood(
    { L: 0, C: 300, R: 600, level: 2 },
    350,
    { start: 0, end: 900 }
  ),
  { L: 0, C: 350, R: 650, level: 0 },
  "Forward playback must preserve the receding endpoint and translate only the approached endpoint."
);
assert.deepEqual(
  settleContinuous(
    { L: 0, C: 300, R: 600, level: 2 },
    300,
    250,
    { start: 0, end: 900 }
  ),
  { L: 0, C: 250, R: 600, level: 2 },
  "A hard Range boundary clips only the approached side of continuous movement."
);

const actionRanges = getActionRanges(
  { L: 60, C: 120, R: 180, level: 1 },
  { start: 0, end: 240 },
  { start: 60, end: 120, operator: "refineForward", medium: "direct" },
  120,
  10
);
assert.deepEqual(actionRanges.backward, { start: 60, end: 120 });
assert.deepEqual(actionRanges.forward, { start: 120, end: 180 });
assert.deepEqual(actionRanges.stepBackward, { start: 110, end: 120, destination: 110 });
assert.deepEqual(actionRanges.stepForward, { start: 120, end: 130, destination: 130 });
assert.deepEqual(actionRanges.loop, { start: 60, end: 120 });
assert.deepEqual(actionRanges.reopen, { start: 0, end: 240, current: 120 });
assert.equal(logSpeed(8, 0), 8);
assert.equal(logSpeed(8, 1), 1);
assert.equal(chooseSupportedRate([0.25, 0.5, 1, 1.5, 2], 1.8), 1.5);

// Guide: one persistent Address object and linked Sections.
const guide = createGuide("video-1");
const pinA = ensurePin(guide, 10, { label: "Start", kind: PIN_KIND.EXPLICIT }).pin;
const pinB = ensurePin(guide, 20, { label: "End", kind: PIN_KIND.EXPLICIT }).pin;
const reused = ensurePin(guide, 10 + EPSILON / 2, { label: "Start renamed", kind: PIN_KIND.EXPLICIT });
assert.equal(reused.created, false);
assert.equal(reused.pin.id, pinA.id);
assert.equal(guide.pins.length, 2);
assert.equal(renamePin(guide, pinB.id, "Finish").label, "Finish");

const sectionResult = createSection(guide, pinA.id, pinB.id, { label: "Procedure" });
assert.equal(sectionResult.created, true);
const section = resolveSection(guide, sectionResult.section.id);
assert.equal(section.start, 10);
assert.equal(section.end, 20);
assert.equal(section.midpoint, 15);
assert.equal(sectionsForPin(guide, pinA.id).length, 1);
assert.equal(renameSection(guide, section.id, "Renamed Procedure").label, "Renamed Procedure");
assert.equal(previousPin(guide, 19, { start: 0, end: 30 }).id, pinA.id);
assert.equal(nextPin(guide, 11, { start: 0, end: 30 }).id, pinB.id);
assert.equal(deletePin(guide, pinA.id).deleted, false);
assert.equal(deletePin(guide, pinA.id).references, 1);

const generated = createSectionFromTimes(guide, 30, 40, { label: "Generated", provenance: "test" });
let generatedSection = resolveSection(guide, generated.section.id);
assert.equal(generatedSection.start, 30);
assert.equal(generatedSection.end, 40);
assert.equal(
  visiblePins(guide).some(pin => pin.id === generatedSection.startPinId),
  true,
  "Section endpoint Pins must remain visible and traversable."
);
const replacedEndPinId = generatedSection.endPinId;
generatedSection = replaceSectionExtent(guide, generatedSection.id, 30, 45, {
  provenance: "working:test"
});
assert.equal(generatedSection.start, 30);
assert.equal(generatedSection.end, 45);
assert.equal(generatedSection.id, generated.section.id);
assert.equal(generatedSection.label, "Generated");
assert.equal(getPin(guide, replacedEndPinId), null, "Overwrite must remove an unshared retired endpoint.");
assert.equal(deleteSection(guide, generatedSection.id), true);
assert.equal(getPin(guide, generatedSection.startPinId), null);
assert.equal(getPin(guide, generatedSection.endPinId), null);
assert.equal(deleteSection(guide, generatedSection.id), false);
assert.equal(validateGuide(guide, 100), true);

const nestedEnd = ensurePin(guide, 25, { kind: PIN_KIND.EXPLICIT }).pin;
createSection(guide, pinA.id, nestedEnd.id, { label: "Longer" });
const sorted = sortedSections(guide);
assert.equal(sorted[0].label, "Longer");
assert.equal(sorted[1].label, "Renamed Procedure");

const clustered = clusterPinsByPixels([
  { id: "a", t: 10, createdAt: 1 },
  { id: "b", t: 10.5, createdAt: 2 },
  { id: "c", t: 80, createdAt: 3 }
], 100, 1000, 18);
assert.equal(clustered.length, 2);
assert.equal(clustered[0].pins.length, 2);

const normalizedV3 = normalizeGuide({
  pins: [
    { id: "m1", t: 0, label: "Start", provenance: "pin", createdAt: 1 },
    { id: "m2", t: 10, label: "", provenance: "section:endpoint", createdAt: 2 }
  ],
  sections: [
    { id: "section-1", startPinId: "m1", endPinId: "m2", label: "First", createdAt: 3 }
  ]
}, "video-1");
assert.equal(normalizedV3.pins[0].kind, PIN_KIND.EXPLICIT);
assert.equal(normalizedV3.pins[1].kind, PIN_KIND.ENDPOINT);
assert.equal(validateGuide(normalizedV3, 10), true);

const migratedV2 = migrateStructureV2({
  marks: [
    { id: "m1", t: 0, label: "Start", provenance: "current", createdAt: 1 },
    { id: "m2", t: 10, label: "", provenance: "passage:end", createdAt: 2 }
  ],
  spans: [
    { id: "span-1", startMarkId: "m1", endMarkId: "m2", label: "First", createdAt: 3 }
  ]
}, "video-1");
assert.equal(migratedV2.sections.length, 1);
assert.equal(migratedV2.sections[0].label, "First");
assert.equal(validateGuide(migratedV2, 10), true);

const migratedV1 = migrateSavedRegions({ regions: [
  { id: "one", label: "First", start: 0, end: 10, createdAt: 1 },
  { id: "two", label: "Second", start: 10, end: 20, createdAt: 2 }
]}, "video-1");
assert.equal(migratedV1.sections.length, 2);
assert.equal(migratedV1.pins.length, 3);
assert.equal(validateGuide(migratedV1, 20), true);

// Session kernel: operators deform one returnStateable model.
let session = createSession({ duration: 100, current: 50, guide: createGuide("video") });
let result = refine(session, "forward");
assert.equal(result.changed, true);
session = result.session;
assert.equal(session.model.resolution.C, 75);
assert.equal(session.model.resolution.level, 1);
assert.deepEqual(
  { start: session.model.interval.start, end: session.model.interval.end },
  { start: 50, end: 75 }
);
assert.equal(session.history.length, 1);

result = reopen(session);
session = result.session;
assert.deepEqual(session.model.resolution, { L: 0, C: 75, R: 100, level: 0 });
assert.deepEqual(
  { start: session.model.interval.start, end: session.model.interval.end },
  { start: 50, end: 75 }
);
assert.equal(session.history.length, 2);

result = returnState(session);
session = result.session;
assert.equal(session.model.resolution.level, 1);
assert.equal(session.model.resolution.C, 75);
result = returnState(session);
session = result.session;
assert.equal(session.model.resolution.C, 50);
assert.equal(session.model.interval, null);

// Refine has two Loop relations. Moving away crosses unlooped space and stores
// that local crossing; moving toward the opposite endpoint folds the Working
// Section and retains the complementary side.
let foldedRefine = createSession({ duration: 100, current: 50 });
foldedRefine = goTo(foldedRefine, 70, { operator: "timeline" }).session;
const crossedRefine = refine(foldedRefine, "forward");
assert.equal(crossedRefine.refineRelation, "cross");
assert.deepEqual(
  {
    start: crossedRefine.session.model.interval.start,
    end: crossedRefine.session.model.interval.end,
    departure: crossedRefine.session.model.interval.departure,
    arrival: crossedRefine.session.model.interval.arrival
  },
  { start: 70, end: 80, departure: 70, arrival: 80 }
);
const shortenedRefine = refine(foldedRefine, "backward");
assert.equal(shortenedRefine.refineRelation, "fold");
assert.deepEqual(
  {
    start: shortenedRefine.session.model.interval.start,
    end: shortenedRefine.session.model.interval.end,
    departure: shortenedRefine.session.model.interval.departure,
    arrival: shortenedRefine.session.model.interval.arrival
  },
  { start: 50, end: 60, departure: 50, arrival: 60 },
  "A shortening Refine must retain the side opposite the traversed fold."
);
const transposedFold = refine(switchEndpoint(foldedRefine).session, "forward");
assert.equal(transposedFold.refineRelation, "fold");
assert.deepEqual(
  {
    start: transposedFold.session.model.interval.start,
    end: transposedFold.session.model.interval.end,
    departure: transposedFold.session.model.interval.departure,
    arrival: transposedFold.session.model.interval.arrival
  },
  { start: 70, end: 75, departure: 70, arrival: 75 },
  "A Refine that folds past the opposite endpoint must keep only the overrun side."
);

// Direct placement is total over finite input and cannot create out-of-video state.
let boundedMove = createSession({ duration: 100, current: 50 });
boundedMove = goTo(boundedMove, 150, { operator: "timeline", label: "Timeline Click" }).session;
assert.equal(boundedMove.model.resolution.C, 100);
assert.equal(boundedMove.model.interval.end, 100);
boundedMove = goTo(boundedMove, -20, { operator: "timeline", label: "Timeline Click" }).session;
assert.equal(boundedMove.model.resolution.C, 0);
assert.equal(boundedMove.model.interval.start, 0);

const guideBeforeNavigation = session.model.guide;
result = goTo(session, 20, { operator: "timeline", label: "Timeline Click" });
session = result.session;
assert.equal(session.model.guide, guideBeforeNavigation, "Navigation must not clone the immutable Guide.");
assert.equal(session.model.resolution.C, 20);
assert.deepEqual(
  session.model.resolution,
  { L: 0, C: 20, R: 50, level: 0 },
  "Direct Go must establish Current independently of recursive Resolution and retain movement scale."
);
assert.equal(session.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
assert.deepEqual(getTargets(session.model.resolution), { backward: 10, forward: 35 });
assert.deepEqual(
  { start: session.model.interval.start, end: session.model.interval.end },
  { start: 20, end: 50 }
);

let directFromRefined = createSession({ duration: 100, current: 50 });
directFromRefined = refine(directFromRefined, "forward").session;
directFromRefined = refine(directFromRefined, "forward").session;
assert.equal(directFromRefined.model.resolution.level, 2);
directFromRefined = goTo(directFromRefined, 10, { operator: "timeline", label: "Timeline Click" }).session;
assert.deepEqual(
  directFromRefined.model.resolution,
  { L: 0, C: 10, R: 87.5, level: 0 },
  "Direct Go must discard the preceding recursive path while retaining the scale of the new movement."
);
assert.equal(directFromRefined.model.resolutionBasis, RESOLUTION_BASIS.MOVEMENT);
const reopenedDirect = reopen(directFromRefined).session;
assert.deepEqual(reopenedDirect.model.resolution, { L: 0, C: 10, R: 100, level: 0 });
assert.equal(reopenedDirect.model.resolutionBasis, RESOLUTION_BASIS.RANGE);

let directAtSameAddress = createSession({ duration: 100, current: 50 });
directAtSameAddress = refine(directAtSameAddress, "forward").session;
const sameAddressGo = goTo(directAtSameAddress, directAtSameAddress.model.resolution.C, {
  operator: "timeline",
  label: "Timeline Click"
});
assert.equal(sameAddressGo.changed, false, "Direct Go at Current is a true no-op; Reopen owns scale reset.");
assert.equal(sameAddressGo.reason, "same-address");
assert.equal(sameAddressGo.session, directAtSameAddress);
assert.deepEqual(
  sameAddressGo.session.model.resolution,
  directAtSameAddress.model.resolution
);
assert.deepEqual(
  sameAddressGo.session.model.interval,
  directAtSameAddress.model.interval,
  "Same-address Go must preserve the existing Interval without inventing movement."
);

// Rapid Step is one history entry and one interval from the initial departure.
let stepped = createSession({ duration: 100, current: 50 });
result = step(stepped, "forward", 10, { departure: 50 });
stepped = result.session;
result = step(stepped, "forward", 10, { departure: 50, amend: true });
stepped = result.session;
assert.equal(stepped.model.resolution.C, 70);
assert.equal(stepped.history.length, 1);
assert.deepEqual(
  { start: stepped.model.interval.start, end: stepped.model.interval.end },
  { start: 50, end: 70 }
);
stepped = returnState(stepped).session;
assert.equal(stepped.model.resolution.C, 50);

// Step pushes a reached binary endpoint instead of collapsing the next Refine.
let pushedNeighborhood = createSession({ duration: 100, current: 50 });
pushedNeighborhood = refine(pushedNeighborhood, "backward").session;
assert.deepEqual(pushedNeighborhood.model.resolution, { L: 0, C: 25, R: 50, level: 1 });
pushedNeighborhood = step(pushedNeighborhood, "forward", 25).session;
assert.deepEqual(pushedNeighborhood.model.resolution, { L: 0, C: 50, R: 75, level: 0 });
assert.deepEqual(getTargets(pushedNeighborhood.model.resolution), { backward: 25, forward: 62.5 });

let pushedBackward = createSession({ duration: 100, current: 50 });
pushedBackward = refine(pushedBackward, "forward").session;
pushedBackward = step(pushedBackward, "backward", 25).session;
assert.deepEqual(pushedBackward.model.resolution, { L: 25, C: 50, R: 100, level: 0 });
assert.deepEqual(getTargets(pushedBackward.model.resolution), { backward: 37.5, forward: 75 });

// Range deformation preserves the Loop Window while rebasing endpoint frames
// to the new hard bound.
let ranged = createSession({ duration: 100, current: 50 });
ranged = goTo(ranged, 70, { operator: "timeline", label: "Timeline Click" }).session;
const loopBeforeRange = copy(ranged.model.interval);
ranged = setRange(ranged, 20, 80, 70, "Set Range").session;
assert.deepEqual(
  {
    start: ranged.model.interval.start,
    end: ranged.model.interval.end,
    departure: ranged.model.interval.departure,
    arrival: ranged.model.interval.arrival
  },
  {
    start: loopBeforeRange.start,
    end: loopBeforeRange.end,
    departure: loopBeforeRange.departure,
    arrival: loopBeforeRange.arrival
  }
);
assert.deepEqual(ranged.model.interval.arrivalFrame.resolution, ranged.model.resolution);
assert.deepEqual(ranged.model.range, { start: 20, end: 80 });
ranged = setRange(ranged, 60, 80, 70, "Narrow Range").session;
assert.equal(ranged.model.interval, null, "Range changes clear Intervals they no longer contain.");

// Focus maps a linked Section onto Range, and global movement unsnaps it.
const focusGuide = createGuide("video");
const focusSectionRecord = createSectionFromTimes(focusGuide, 10, 30, { label: "Focused" }).section;
ensurePin(focusGuide, 80, { label: "Outside", kind: PIN_KIND.EXPLICIT });
let focused = createSession({ duration: 100, current: 50, guide: focusGuide });
focused = focusSection(focused, focusSectionRecord.id).session;
assert.deepEqual(focused.model.range, { start: 10, end: 30 });
assert.equal(focused.model.resolution.C, 20);
assert.equal(focused.model.focus.sectionId, focusSectionRecord.id);
assert.equal(focused.model.interval, null, "Focus relocation is administrative and must not create an Interval.");

const focusWithoutMovementSource = createSession({ duration: 100, current: 20, guide: focusGuide });
const focusWithoutMovement = focusSection(focusWithoutMovementSource, focusSectionRecord.id);
assert.equal(focusWithoutMovement.changed, true);
assert.equal("place" in focusWithoutMovement, false, "Focus inside a Section must not emit a redundant player placement.");
assert.equal("interval" in focusWithoutMovement, false, "Focus inside a Section must not claim a Interval.");

focused = goTo(focused, 80, { operator: "pin", label: "Go to Pin" }).session;
assert.equal(focused.model.focus, null);
assert.deepEqual(focused.model.range, { start: 0, end: 100 });
assert.equal(focused.model.resolution.C, 80);

// Unfocus restores only Range and preserves the current Loop Window while
// recording the restored active-endpoint frame.
let focusedAgain = createSession({ duration: 100, current: 20, guide: focusGuide });
focusedAgain = goTo(focusedAgain, 25, { operator: "timeline", label: "Timeline Click" }).session;
focusedAgain = focusSection(focusedAgain, focusSectionRecord.id).session;
const beforeUnfocusLoop = copy(focusedAgain.model.interval);
focusedAgain = leaveSection(focusedAgain).session;
assert.deepEqual(focusedAgain.model.range, { start: 0, end: 100 });
assert.deepEqual(
  {
    start: focusedAgain.model.interval.start,
    end: focusedAgain.model.interval.end,
    departure: focusedAgain.model.interval.departure,
    arrival: focusedAgain.model.interval.arrival
  },
  {
    start: beforeUnfocusLoop.start,
    end: beforeUnfocusLoop.end,
    departure: beforeUnfocusLoop.departure,
    arrival: beforeUnfocusLoop.arrival
  }
);
assert.deepEqual(focusedAgain.model.interval.arrivalFrame.resolution, focusedAgain.model.resolution);

// The active Loop is a semi-persistent Working Section. Focus projects it into
// Range without retaining it in Guide; Leave preserves the deformed working
// value, while Save and Overwrite are explicit Guide transactions.
let working = createSession({ duration: 100, current: 50, guide: createGuide("video") });
working = goTo(working, 70, { operator: "timeline" }).session;
const workingBeforeFocus = copy(working.model.interval);
working = focusWorkingSection(working).session;
assert.equal(working.model.focus.kind, FOCUS_KIND.WORKING);
assert.deepEqual(working.model.focus.extent, { start: 50, end: 70 });
assert.deepEqual(working.model.range, { start: 50, end: 70 });
assert.deepEqual(
  {
    start: working.model.interval.start,
    end: working.model.interval.end,
    departure: working.model.interval.departure,
    arrival: working.model.interval.arrival
  },
  {
    start: workingBeforeFocus.start,
    end: workingBeforeFocus.end,
    departure: workingBeforeFocus.departure,
    arrival: workingBeforeFocus.arrival
  }
);
assert.equal(working.model.guide.sections.length, 0, "Focus must not save the Working Section.");

working = refine(working, "backward").session;
assert.deepEqual(
  { start: working.model.interval.start, end: working.model.interval.end },
  { start: 50, end: 60 }
);
working = focusWorkingSection(working).session;
assert.deepEqual(working.model.range, { start: 50, end: 60 });
assert.deepEqual(working.model.focus.extent, { start: 50, end: 60 });
assert.deepEqual(working.model.focus.returnRange, { start: 0, end: 100 });
working = leaveSection(working).session;
assert.equal(working.model.focus, null);
assert.deepEqual(working.model.range, { start: 0, end: 100 });
assert.deepEqual(
  { start: working.model.interval.start, end: working.model.interval.end },
  { start: 50, end: 60 },
  "Leave must preserve the unsaved Working Section."
);
assert.equal(working.model.guide.sections.length, 0);

working = saveIntervalAsSection(working, "Working").session;
const retainedWorkingId = working.model.guide.sections[0].id;
working = step(working, "forward", 10).session;
const overwriteResult = overwriteGuideSection(working, retainedWorkingId);
assert.equal(overwriteResult.changed, true);
working = overwriteResult.session;
const overwrittenWorking = resolveSection(working.model.guide, retainedWorkingId);
assert.equal(overwrittenWorking.id, retainedWorkingId);
assert.equal(overwrittenWorking.label, "Working");
assert.deepEqual(
  { start: overwrittenWorking.start, end: overwrittenWorking.end },
  { start: 50, end: 70 }
);
assert.equal(working.model.guide.sections.length, 1, "Overwrite must preserve retained Section identity.");
working = returnState(working).session;
assert.deepEqual(
  {
    start: resolveSection(working.model.guide, retainedWorkingId).start,
    end: resolveSection(working.model.guide, retainedWorkingId).end
  },
  { start: 50, end: 60 },
  "Undo must restore the preceding retained Extent."
);

const focusedOverwriteGuide = createGuide("video");
const focusedOverwriteTarget = createSectionFromTimes(
  focusedOverwriteGuide,
  10,
  30,
  { label: "Editable" }
).section;
let focusedOverwrite = createSession({
  duration: 100,
  current: 20,
  guide: focusedOverwriteGuide
});
focusedOverwrite = goTo(focusedOverwrite, 25, { operator: "timeline" }).session;
focusedOverwrite = focusSection(focusedOverwrite, focusedOverwriteTarget.id).session;
const focusedOverwriteResult = overwriteGuideSection(
  focusedOverwrite,
  focusedOverwriteTarget.id
);
assert.equal(focusedOverwriteResult.changed, true);
assert.equal(focusedOverwriteResult.rangeChanged, true);
focusedOverwrite = focusedOverwriteResult.session;
assert.equal(focusedOverwrite.model.focus.kind, FOCUS_KIND.SAVED);
assert.equal(focusedOverwrite.model.focus.sectionId, focusedOverwriteTarget.id);
assert.deepEqual(focusedOverwrite.model.range, { start: 20, end: 25 });
assert.deepEqual(
  {
    start: focusedOverwrite.model.interval.start,
    end: focusedOverwrite.model.interval.end
  },
  { start: 20, end: 25 },
  "Overwriting the focused retained Section must keep Range and Working Section coherent."
);
focusedOverwrite = leaveSection(focusedOverwrite).session;
assert.deepEqual(focusedOverwrite.model.range, { start: 0, end: 100 });

// Guide operations participate in the same Undo chain.
let edited = createSession({ duration: 100, current: 40, guide: createGuide("video") });
const guideBeforeEdit = edited.model.guide;
edited = pinCurrent(edited, "Forty").session;
assert.notEqual(edited.model.guide, guideBeforeEdit, "Guide edits must replace the immutable Guide value.");
assert.equal(guideBeforeEdit.pins.length, 0);
assert.equal(edited.model.guide.pins.length, 1);
edited = goTo(edited, 60, { operator: "timeline", label: "Timeline Click" }).session;
edited = saveIntervalAsSection(edited, "Forty to sixty").session;
assert.equal(edited.model.guide.sections.length, 1);
edited = returnState(edited).session;
assert.equal(edited.model.guide.sections.length, 0);
assert.equal(edited.model.resolution.C, 60);


// No-op Guide commands do not create history or replace the Guide.
let noops = createSession({ duration: 100, current: 40, guide: createGuide("video") });
let noOpResult = pinCurrent(noops, "Forty");
noops = noOpResult.session;
const noOpGuide = noops.model.guide;
const noOpHistoryLength = noops.history.length;
const noOpPin = noops.model.guide.pins[0];
noOpResult = pinCurrent(noops, "Forty");
assert.equal(noOpResult.changed, false);
assert.equal(noOpResult.session.model.guide, noOpGuide);
assert.equal(noOpResult.session.history.length, noOpHistoryLength);
noOpResult = renameGuidePin(noops, noOpPin.id, "Forty");
assert.equal(noOpResult.changed, false);
noOpResult = deleteGuidePin(noops, "missing-pin");
assert.equal(noOpResult.changed, false);
noops = goTo(noops, 60, { operator: "timeline", label: "Timeline Click" }).session;
noops = saveIntervalAsSection(noops, "Forty to sixty").session;
const noOpSection = noops.model.guide.sections[0];
const sectionHistoryLength = noops.history.length;
noOpResult = saveIntervalAsSection(noops, "Forty to sixty");
assert.equal(noOpResult.changed, false);
assert.equal(noOpResult.session.history.length, sectionHistoryLength);
noOpResult = renameGuideSection(noops, noOpSection.id, "Forty to sixty");
assert.equal(noOpResult.changed, false);

// Deleting a focused Section restores the pre-Focus Range in the same action.
let deletion = createSession({ duration: 100, current: 50, guide: focusGuide });
deletion = focusSection(deletion, focusSectionRecord.id).session;
const deletionResult = deleteGuideSection(deletion, focusSectionRecord.id);
assert.equal(deletionResult.rangeChanged, true);
assert.equal("place" in deletionResult, false, "Deleting a focused Section should not relocate Cursor when Current remains valid.");
deletion = deletionResult.session;
assert.equal(deletion.model.focus, null);
assert.deepEqual(deletion.model.range, { start: 0, end: 100 });
assert.equal(deletion.model.guide.sections.length, 0);

// Native playback moves the active Interval endpoint and translates only the
// approached Resolution side.
let playback = createSession({ duration: 100, current: 20 });
playback = goTo(playback, 30, { operator: "timeline", label: "Timeline Click" }).session;
const playbackUndo = snapshotModel(playback.model);
playback = completePlayback(playback, {
  current: 70,
  departure: 30,
  parentNeighborhood: copy(playback.model.resolution),
  parentResolutionBasis: playback.model.resolutionBasis,
  returnModel: playbackUndo,
  label: "Playback"
}).session;
assert.deepEqual(
  { start: playback.model.interval.start, end: playback.model.interval.end },
  { start: 20, end: 70 }
);
assert.equal(playback.model.interval.operator, "playback");
assert.equal(playback.model.resolution.level, 0);

// A crossed playback can restore Range-level Resolution even when physical movement is small.
let fullCycle = createSession({ duration: 100, current: 0 });
fullCycle = refine(fullCycle, "forward").session;
const fullCycleReturn = snapshotModel(fullCycle.model);
fullCycle = previewRange(fullCycle, 0, 100, 0).session;
const fullCycleResult = completePlayback(fullCycle, {
  current: 1,
  departure: 0,
  parentNeighborhood: copy(fullCycleReturn.resolution),
  parentResolutionBasis: fullCycleReturn.resolutionBasis,
  returnModel: fullCycleReturn,
  label: "Playback"
});
assert.equal(fullCycleResult.changed, true);
assert.equal(fullCycleResult.session.history.length, 2);
assert.equal(returnState(fullCycleResult.session).session.model.resolution.level, fullCycleReturn.resolution.level);

// Drag preview is committed as one returnStateable Range action.
let dragged = createSession({ duration: 100, current: 50 });
const dragOrigin = snapshotModel(dragged.model);
dragged = previewRange(dragged, 20, 80, 50).session;
dragged = checkpoint(dragged, "Adjust Range", dragOrigin).session;
assert.equal(dragged.history.length, 1);
dragged = returnState(dragged).session;
assert.deepEqual(dragged.model.range, { start: 0, end: 100 });

// Range normalization rejects invalid extents and keeps no-op history clean.
let normalizedRangeSession = createSession({ duration: 100, current: 50 });
let normalizedRangeResult = setRange(normalizedRangeSession, -10, 120, 50, "Clamp Range");
assert.equal(normalizedRangeResult.changed, false, "A clamped full-video Range is a no-op.");
assert.equal(normalizedRangeResult.reason, "unchanged-range");
normalizedRangeResult = setRange(normalizedRangeSession, 80, 20, 50, "Invalid Range");
assert.equal(normalizedRangeResult.changed, false);
assert.equal(normalizedRangeResult.reason, "invalid-range");

// Corrupted storage is salvaged record-by-record instead of discarding the whole Guide.
const salvage = sanitizeGuide({
  version: 5,
  videoId: "video",
  pins: [
    { id: "pin-a", t: 10, label: "A", kind: PIN_KIND.EXPLICIT, createdAt: 1 },
    { id: "pin-a-duplicate", t: 10.01, label: "", kind: PIN_KIND.ENDPOINT, createdAt: 2 },
    { id: "pin-b", t: 30, label: "", kind: PIN_KIND.ENDPOINT, createdAt: 3 },
    { id: "pin-bad", t: 300, label: "Bad", kind: PIN_KIND.EXPLICIT, createdAt: 4 }
  ],
  sections: [
    { id: "section-good", startPinId: "pin-b", endPinId: "pin-a-duplicate", label: "Good", createdAt: 5 },
    { id: "section-duplicate", startPinId: "pin-a", endPinId: "pin-b", label: "good", createdAt: 6 },
    { id: "section-bad", startPinId: "pin-a", endPinId: "missing", label: "Bad", createdAt: 7 }
  ]
}, "video", 100);
assert.equal(salvage.pins.length, 2);
assert.equal(salvage.sections.length, 1);
assert.equal(salvage.sections[0].startPinId, "pin-a");
assert.equal(salvage.sections[0].endPinId, "pin-b");
assert.equal(validateGuide(salvage, 100), true);

assert.equal(formatTime(59.9996), "1:00.000");
assert.equal(formatTime(3599.9996), "1:00:00.000");
assert.equal(formatDuration(0.25), "0.25s");
assert.equal(formatDuration(60), "1m");
assert.equal(formatDuration(100), "1m 40s");
assert.equal(formatDuration(3723.5), "1h 2m 3.5s");
assert.equal(parseTimeValue("1h2m3s"), 3723);
assert.equal(parseTimeValue("90"), 90);
assert.equal(parseTimeValue("1:30"), 90);
assert.equal(parseTimeValue("1:02:03.5"), 3723.5);
assert.equal(parseTimeValue("1:99"), 0);
assert.equal(parseTimeValue("nonsense"), 0);
assert.deepEqual(
  parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"),
  { videoId: "dQw4w9WgXcQ", startSeconds: 90 }
);
assert.deepEqual(
  parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ#t=1:30"),
  { videoId: "dQw4w9WgXcQ", startSeconds: 90 }
);
assert.equal(parseYouTubeUrl("javascript:alert(1)"), null);
assert.equal(parseYouTubeUrl("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"), null);
assert.equal(parseYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"), null);
assert.equal(parseYouTubeUrl("https://youtu.be/not-valid"), null);

console.log("All geometry, Guide, and Session tests passed.");
