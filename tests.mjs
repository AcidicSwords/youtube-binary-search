import assert from "node:assert/strict";
import {
  EPSILON,
  NEIGHBORHOOD_BASIS,
  clamp,
  contains,
  midpoint,
  createRoot,
  getTargets,
  classifyRetainedRefineRelation,
  descend,
  refineNeighborhood,
  seedNeighborhoodFromMovement,
  isRangeNeighborhood,
  reopenToRange,
  canReopen,
  stepTarget,
  stepNeighborhood,
  translateNeighborhood,
  getActionRanges
} from "./range-geometry.js";
import {
  PIN_KIND,
  createGuide,
  ensurePin,
  renamePin,
  getPin,
  sectionsForPin,
  canLinkPins,
  orderedPins,
  deletePin,
  movePin,
  createSection,
  createSectionFromTimes,
  resolveSection,
  unlinkSectionEndpoint,
  linkPins,
  renameSection,
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
  workFromExtent,
  refine,
  localRefine,
  step,
  reopen,
  setRange,
  previewRange,
  checkpoint,
  focusSection,
  focusWorkingSection,
  leaveSection,
  completePlayback,
  retainCurrentAsPin,
  retainSpanAsSection,
  renameGuidePin,
  deleteGuidePin,
  renameGuideSection,
  deleteGuideSection,
  moveGuidePin,
  unlinkGuideSectionEndpoint,
  linkGuidePins,
  switchActiveEnd,
  undo
} from "./session.js";
import { parseTimeValue, parseYouTubeUrl } from "./youtube.js";
import { formatTime, formatDuration } from "./view.js";

// Interval geometry.
const root = createRoot(0, 60, 180);
assert.deepEqual(root, { L: 0, C: 60, R: 180, level: 0 });
assert.deepEqual(getTargets(root), { backward: 30, forward: 120 });
const retainedRefineInterval = {
  start: 25,
  end: 50,
  departure: 50,
  arrival: 25
};
assert.equal(
  classifyRetainedRefineRelation(retainedRefineInterval, 25, 37.5),
  "retain",
  "Plain Refine retains its anchor while a reversal remains on the Current side of it."
);
assert.equal(
  classifyRetainedRefineRelation(retainedRefineInterval, 25, 12.5),
  "retain",
  "Plain Refine retains its anchor while continuing away from it."
);
assert.equal(
  classifyRetainedRefineRelation(retainedRefineInterval, 25, 50),
  "full",
  "Reaching the retained anchor must record the non-zero Current-to-anchor movement."
);
assert.equal(
  classifyRetainedRefineRelation(retainedRefineInterval, 25, 62.5),
  "full",
  "Passing the retained anchor must record the complete traversal instead of subtracting it."
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
  { L: 0, C: 90, R: 150, level: 0 }
);
assert.deepEqual(
  seedNeighborhoodFromMovement(90, 60, { start: 0, end: 180 }),
  { L: 0, C: 60, R: 150, level: 0 }
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
  { L: 30, C: 70, R: 90, level: 2 },
  "Step must leave the approached endpoint fixed when its midpoint still has one full Step of headroom."
);
assert.deepEqual(
  stepNeighborhood({ L: 30, C: 60, R: 90, level: 2 }, 100, { start: 0, end: 180 }, 10),
  { L: 30, C: 100, R: 120, level: 0 }
);
assert.deepEqual(
  stepNeighborhood({ L: 30, C: 60, R: 90, level: 2 }, 50, { start: 0, end: 180 }),
  { L: 30, C: 50, R: 90, level: 2 },
  "Backward Step obeys the same midpoint guard."
);
assert.deepEqual(
  stepNeighborhood({ L: 0, C: 25, R: 50, level: 1 }, 50, { start: 0, end: 100 }, 25),
  { L: 0, C: 50, R: 100, level: 0 },
  "Once the guard is reached, the approached endpoint preserves one-Step midpoint headroom."
);
assert.equal(
  getTargets(stepNeighborhood(
    { L: 0, C: 25, R: 50, level: 1 },
    50,
    { start: 0, end: 100 },
    25
  )).forward,
  75,
  "The next directional Refine must remain one full Step away."
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
assert.deepEqual(actionRanges.activeSpan, { start: 60, end: 120 });
assert.deepEqual(actionRanges.reopen, { start: 0, end: 240, current: 120 });

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
const generatedSection = resolveSection(guide, generated.section.id);
assert.equal(generatedSection.start, 30);
assert.equal(generatedSection.end, 40);
assert.equal(
  orderedPins(guide).some(pin => pin.id === generatedSection.startPinId),
  true,
  "Section endpoint Pins must remain visible and traversable."
);
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

// Shared endpoint identity is explicit graph ownership. Unlink clones one
// Section's endpoint at the same Address without storing a hidden return path.
// Spatial Link merges that Pin into the coincident target chosen by the drag.
const ownershipGuide = createGuide("ownership");
const ownershipA = ensurePin(ownershipGuide, 10, { kind: PIN_KIND.ENDPOINT }).pin;
const ownershipB = ensurePin(ownershipGuide, 20, { kind: PIN_KIND.ENDPOINT }).pin;
const ownershipC = ensurePin(ownershipGuide, 30, { kind: PIN_KIND.ENDPOINT }).pin;
const ownershipFirst = createSection(
  ownershipGuide,
  ownershipA.id,
  ownershipB.id,
  { label: "First" }
).section;
const ownershipSecond = createSection(
  ownershipGuide,
  ownershipB.id,
  ownershipC.id,
  { label: "Second" }
).section;
assert.equal(sectionsForPin(ownershipGuide, ownershipB.id).length, 2);
assert.equal(
  canLinkPins(ownershipGuide, ownershipB.id, ownershipA.id).reason,
  "shared-source-pin",
  "A shared junction must be Unlinked before one edge can be spatially linked elsewhere."
);
const unlinkedOwnership = unlinkSectionEndpoint(
  ownershipGuide,
  ownershipSecond.id,
  "start"
);
assert.equal(unlinkedOwnership.changed, true);
assert.equal(unlinkedOwnership.section.start, 20);
assert.notEqual(unlinkedOwnership.section.startPinId, ownershipB.id);
assert.equal(unlinkedOwnership.pin.provenance, "unlink");
assert.equal(
  canLinkPins(
    ownershipGuide,
    unlinkedOwnership.section.startPinId,
    ownershipB.id
  ).allowed,
  true
);
const persistedOwnership = sanitizeGuide(
  JSON.parse(JSON.stringify(ownershipGuide)),
  "ownership",
  40
);
assert.equal(persistedOwnership.pins.length, 4);
assert.notEqual(
  resolveSection(persistedOwnership, ownershipFirst.id).endPinId,
  resolveSection(persistedOwnership, ownershipSecond.id).startPinId
);
const linkedOwnership = linkPins(
  ownershipGuide,
  unlinkedOwnership.section.startPinId,
  ownershipB.id
);
assert.equal(linkedOwnership.changed, true);
assert.equal(resolveSection(ownershipGuide, ownershipSecond.id).startPinId, ownershipB.id);
assert.equal(ownershipGuide.pins.length, 3);
const independentlyUnlinked = unlinkSectionEndpoint(
  ownershipGuide,
  ownershipSecond.id,
  "start"
);
movePin(ownershipGuide, independentlyUnlinked.section.startPinId, 22, 40);
assert.equal(resolveSection(ownershipGuide, ownershipFirst.id).end, 20);
assert.equal(resolveSection(ownershipGuide, ownershipSecond.id).start, 22);
assert.equal(
  canLinkPins(
    ownershipGuide,
    independentlyUnlinked.section.startPinId,
    ownershipB.id
  ).allowed,
  true
);
assert.equal(
  linkPins(
    ownershipGuide,
    independentlyUnlinked.section.startPinId,
    ownershipB.id
  ).reason,
  "pins-not-coincident"
);
movePin(ownershipGuide, independentlyUnlinked.section.startPinId, 20, 40);
const linkedAfterSnap = linkPins(
  ownershipGuide,
  independentlyUnlinked.section.startPinId,
  ownershipB.id
);
assert.equal(linkedAfterSnap.changed, true);
assert.equal(resolveSection(ownershipGuide, ownershipSecond.id).start, 20);
assert.equal(resolveSection(ownershipGuide, ownershipSecond.id).startPinId, ownershipB.id);
assert.equal(ownershipGuide.pins.length, 3);

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

// Session kernel: every operator transforms one canonical, recoverable model.
let session = createSession({ duration: 100, current: 50, guide: createGuide("video") });
const pinExtentResult = workFromExtent(
  session,
  { start: 20, end: 60 },
  { operator: "pin-extent", label: "Select Pin Extent" }
);
assert.equal(pinExtentResult.changed, true);
assert.deepEqual(pinExtentResult.session.model.neighborhood, {
  L: 20,
  C: 40,
  R: 60,
  level: 0
});
assert.deepEqual(
  {
    start: pinExtentResult.session.model.activeSpan.start,
    end: pinExtentResult.session.model.activeSpan.end
  },
  { start: 20, end: 60 }
);

const intervalGuide = createGuide("interval-pin-drag");
const intervalStartPin = ensurePin(
  intervalGuide,
  20,
  { kind: PIN_KIND.EXPLICIT }
).pin;
const intervalEndPin = ensurePin(
  intervalGuide,
  60,
  { kind: PIN_KIND.EXPLICIT }
).pin;
let intervalPinSession = workFromExtent(
  createSession({ duration: 100, current: 40, guide: intervalGuide }),
  { start: 20, end: 60 },
  { label: "Active Span" }
).session;
let intervalPinMove = moveGuidePin(intervalPinSession, intervalStartPin.id, 10);
assert.equal(intervalPinMove.changed, true);
assert.deepEqual(
  {
    start: intervalPinMove.session.model.activeSpan.start,
    end: intervalPinMove.session.model.activeSpan.end
  },
  { start: 10, end: 60 }
);
intervalPinSession = intervalPinMove.session;
intervalPinMove = moveGuidePin(intervalPinSession, intervalEndPin.id, 75);
assert.equal(intervalPinMove.changed, true);
assert.deepEqual(
  {
    start: intervalPinMove.session.model.activeSpan.start,
    end: intervalPinMove.session.model.activeSpan.end
  },
  { start: 10, end: 75 }
);

let ownershipSession = createSession({
  duration: 40,
  current: 20,
  guide: persistedOwnership
});
const persistedSecondStart = resolveSection(
  persistedOwnership,
  ownershipSecond.id
).startPinId;
let ownershipResult = linkGuidePins(
  ownershipSession,
  persistedSecondStart,
  ownershipB.id
);
assert.equal(ownershipResult.changed, true);
ownershipSession = ownershipResult.session;
ownershipResult = unlinkGuideSectionEndpoint(
  ownershipSession,
  ownershipSecond.id,
  "start"
);
assert.equal(ownershipResult.changed, true);
assert.equal(ownershipResult.session.history.length, 2);

let result = refine(session, "forward");
assert.equal(result.changed, true);
session = result.session;
assert.equal(session.model.neighborhood.C, 75);
assert.equal(session.model.neighborhood.level, 1);
assert.deepEqual(
  { start: session.model.activeSpan.start, end: session.model.activeSpan.end },
  { start: 50, end: 75 }
);
assert.equal(session.history.length, 1);

result = reopen(session);
session = result.session;
assert.deepEqual(session.model.neighborhood, { L: 0, C: 75, R: 100, level: 0 });
assert.deepEqual(
  { start: session.model.activeSpan.start, end: session.model.activeSpan.end },
  { start: 50, end: 75 }
);
assert.equal(session.history.length, 2);

result = undo(session);
session = result.session;
assert.equal(session.model.neighborhood.level, 1);
assert.equal(session.model.neighborhood.C, 75);
result = undo(session);
session = result.session;
assert.equal(session.model.neighborhood.C, 50);
assert.equal(session.model.activeSpan, null);

// Shift+Refine always draws the newly traversed Current-to-midpoint region.
// This deliberately selects the opposite half when its target lies inside the
// existing Active Span; plain Refine retains the established anchor.
let membershipBase = createSession({ duration: 100, current: 50 });
membershipBase = goTo(membershipBase, 70, { operator: "timeline" }).session;
const outsideRefine = localRefine(membershipBase, "forward");
assert.equal(outsideRefine.refineRelation, "draw");
assert.deepEqual(
  {
    start: outsideRefine.session.model.activeSpan.start,
    end: outsideRefine.session.model.activeSpan.end,
    departure: outsideRefine.session.model.activeSpan.departure,
    arrival: outsideRefine.session.model.activeSpan.arrival
  },
  { start: 70, end: 85, departure: 70, arrival: 85 }
);
const backwardReplacement = localRefine(membershipBase, "backward");
assert.equal(backwardReplacement.refineRelation, "draw");
assert.deepEqual(
  {
    start: backwardReplacement.session.model.activeSpan.start,
    end: backwardReplacement.session.model.activeSpan.end,
    departure: backwardReplacement.session.model.activeSpan.departure,
    arrival: backwardReplacement.session.model.activeSpan.arrival
  },
  { start: 40, end: 70, departure: 70, arrival: 40 },
  "An adjacent midpoint outside the central mapped Interval must record the complete new traversal."
);
const transposedReplacement = localRefine(switchActiveEnd(membershipBase).session, "forward");
assert.equal(transposedReplacement.refineRelation, "draw");
assert.deepEqual(
  {
    start: transposedReplacement.session.model.activeSpan.start,
    end: transposedReplacement.session.model.activeSpan.end,
    departure: transposedReplacement.session.model.activeSpan.departure,
    arrival: transposedReplacement.session.model.activeSpan.arrival
  },
  { start: 50, end: 75, departure: 50, arrival: 75 },
  "A midpoint outside the Interval must replace it with the complete new traversal."
);

// When the midpoint is inside the existing movement, Shift+Refine draws the
// other half from Current instead of retaining the previous departure.
let membershipRefine = createSession({ duration: 100, current: 50 });
membershipRefine = localRefine(membershipRefine, "backward").session;
assert.deepEqual(
  {
    current: membershipRefine.model.neighborhood.C,
    L: membershipRefine.model.neighborhood.L,
    R: membershipRefine.model.neighborhood.R,
    start: membershipRefine.model.activeSpan.start,
    end: membershipRefine.model.activeSpan.end,
    departure: membershipRefine.model.activeSpan.departure,
    arrival: membershipRefine.model.activeSpan.arrival
  },
  { current: 25, L: 0, R: 50, start: 25, end: 50, departure: 50, arrival: 25 }
);
const replacedBackward = localRefine(membershipRefine, "backward");
assert.equal(replacedBackward.refineRelation, "draw");
assert.deepEqual(
  {
    current: replacedBackward.session.model.neighborhood.C,
    L: replacedBackward.session.model.neighborhood.L,
    R: replacedBackward.session.model.neighborhood.R,
    start: replacedBackward.session.model.activeSpan.start,
    end: replacedBackward.session.model.activeSpan.end,
    departure: replacedBackward.session.model.activeSpan.departure,
    arrival: replacedBackward.session.model.activeSpan.arrival
  },
  { current: 12.5, L: 0, R: 25, start: 12.5, end: 25, departure: 25, arrival: 12.5 }
);
const shortenedForward = localRefine(membershipRefine, "forward");
assert.equal(shortenedForward.refineRelation, "draw");
assert.deepEqual(
  {
    current: shortenedForward.session.model.neighborhood.C,
    L: shortenedForward.session.model.neighborhood.L,
    R: shortenedForward.session.model.neighborhood.R,
    start: shortenedForward.session.model.activeSpan.start,
    end: shortenedForward.session.model.activeSpan.end,
    departure: shortenedForward.session.model.activeSpan.departure,
    arrival: shortenedForward.session.model.activeSpan.arrival
  },
  { current: 37.5, L: 25, R: 50, start: 25, end: 37.5, departure: 25, arrival: 37.5 }
);
const replacedAgain = localRefine(shortenedForward.session, "backward");
assert.equal(replacedAgain.refineRelation, "draw");
assert.deepEqual(
  {
    current: replacedAgain.session.model.neighborhood.C,
    L: replacedAgain.session.model.neighborhood.L,
    R: replacedAgain.session.model.neighborhood.R,
    start: replacedAgain.session.model.activeSpan.start,
    end: replacedAgain.session.model.activeSpan.end,
    departure: replacedAgain.session.model.activeSpan.departure,
    arrival: replacedAgain.session.model.activeSpan.arrival
  },
  { current: 31.25, L: 25, R: 37.5, start: 31.25, end: 37.5, departure: 37.5, arrival: 31.25 }
);

let mirroredMembership = createSession({ duration: 100, current: 50 });
mirroredMembership = localRefine(mirroredMembership, "forward").session;
assert.deepEqual(
  {
    current: mirroredMembership.model.neighborhood.C,
    L: mirroredMembership.model.neighborhood.L,
    R: mirroredMembership.model.neighborhood.R,
    start: mirroredMembership.model.activeSpan.start,
    end: mirroredMembership.model.activeSpan.end,
    departure: mirroredMembership.model.activeSpan.departure,
    arrival: mirroredMembership.model.activeSpan.arrival
  },
  { current: 75, L: 50, R: 100, start: 50, end: 75, departure: 50, arrival: 75 }
);
const replacedForward = localRefine(mirroredMembership, "forward");
assert.equal(replacedForward.refineRelation, "draw");
assert.deepEqual(
  {
    current: replacedForward.session.model.neighborhood.C,
    L: replacedForward.session.model.neighborhood.L,
    R: replacedForward.session.model.neighborhood.R,
    start: replacedForward.session.model.activeSpan.start,
    end: replacedForward.session.model.activeSpan.end,
    departure: replacedForward.session.model.activeSpan.departure,
    arrival: replacedForward.session.model.activeSpan.arrival
  },
  { current: 87.5, L: 75, R: 100, start: 75, end: 87.5, departure: 75, arrival: 87.5 }
);
const shortenedBackward = localRefine(mirroredMembership, "backward");
assert.equal(shortenedBackward.refineRelation, "draw");
assert.deepEqual(
  {
    current: shortenedBackward.session.model.neighborhood.C,
    L: shortenedBackward.session.model.neighborhood.L,
    R: shortenedBackward.session.model.neighborhood.R,
    start: shortenedBackward.session.model.activeSpan.start,
    end: shortenedBackward.session.model.activeSpan.end,
    departure: shortenedBackward.session.model.activeSpan.departure,
    arrival: shortenedBackward.session.model.activeSpan.arrival
  },
  { current: 62.5, L: 50, R: 75, start: 62.5, end: 75, departure: 75, arrival: 62.5 }
);
const mirroredReplace = localRefine(shortenedBackward.session, "forward");
assert.equal(mirroredReplace.refineRelation, "draw");
assert.deepEqual(
  {
    current: mirroredReplace.session.model.neighborhood.C,
    L: mirroredReplace.session.model.neighborhood.L,
    R: mirroredReplace.session.model.neighborhood.R,
    start: mirroredReplace.session.model.activeSpan.start,
    end: mirroredReplace.session.model.activeSpan.end,
    departure: mirroredReplace.session.model.activeSpan.departure,
    arrival: mirroredReplace.session.model.activeSpan.arrival
  },
  { current: 68.75, L: 62.5, R: 75, start: 62.5, end: 68.75, departure: 62.5, arrival: 68.75 }
);

// Direct placement is total over finite input and cannot create out-of-video state.
let boundedMove = createSession({ duration: 100, current: 50 });
boundedMove = goTo(boundedMove, 150, { operator: "timeline", label: "Timeline Click" }).session;
assert.equal(boundedMove.model.neighborhood.C, 100);
assert.equal(boundedMove.model.activeSpan.end, 100);
boundedMove = goTo(boundedMove, -20, { operator: "timeline", label: "Timeline Click" }).session;
assert.equal(boundedMove.model.neighborhood.C, 0);
assert.equal(boundedMove.model.activeSpan.start, 0);

const guideBeforeNavigation = session.model.guide;
result = goTo(session, 20, { operator: "timeline", label: "Timeline Click" });
session = result.session;
assert.equal(session.model.guide, guideBeforeNavigation, "Navigation must not clone the immutable Guide.");
assert.equal(session.model.neighborhood.C, 20);
assert.deepEqual(
  session.model.neighborhood,
  { L: 0, C: 20, R: 100, level: 0 },
  "Direct Go must establish Current independently and clip its five-times movement frame to Range."
);
assert.equal(session.model.neighborhoodBasis, NEIGHBORHOOD_BASIS.RANGE);
assert.deepEqual(getTargets(session.model.neighborhood), { backward: 10, forward: 60 });
assert.deepEqual(
  { start: session.model.activeSpan.start, end: session.model.activeSpan.end },
  { start: 20, end: 50 }
);

let directFromRefined = createSession({ duration: 100, current: 50 });
directFromRefined = refine(directFromRefined, "forward").session;
directFromRefined = refine(directFromRefined, "forward").session;
assert.equal(directFromRefined.model.neighborhood.level, 2);
directFromRefined = goTo(directFromRefined, 10, { operator: "timeline", label: "Timeline Click" }).session;
assert.deepEqual(
  directFromRefined.model.neighborhood,
  { L: 0, C: 10, R: 100, level: 0 },
  "Direct Go must discard the preceding recursive path and clip the new movement frame to Range."
);
assert.equal(directFromRefined.model.neighborhoodBasis, NEIGHBORHOOD_BASIS.RANGE);
const reopenedDirect = reopen(directFromRefined).session;
assert.deepEqual(reopenedDirect.model.neighborhood, { L: 0, C: 10, R: 100, level: 0 });
assert.equal(reopenedDirect.model.neighborhoodBasis, NEIGHBORHOOD_BASIS.RANGE);

let directAtSameAddress = createSession({ duration: 100, current: 50 });
directAtSameAddress = refine(directAtSameAddress, "forward").session;
const sameAddressGo = goTo(directAtSameAddress, directAtSameAddress.model.neighborhood.C, {
  operator: "timeline",
  label: "Timeline Click"
});
assert.equal(sameAddressGo.changed, false, "Direct Go at Current is a true no-op; Reopen owns scale reset.");
assert.equal(sameAddressGo.reason, "same-address");
assert.equal(sameAddressGo.session, directAtSameAddress);
assert.deepEqual(
  sameAddressGo.session.model.neighborhood,
  directAtSameAddress.model.neighborhood
);
assert.deepEqual(
  sameAddressGo.session.model.activeSpan,
  directAtSameAddress.model.activeSpan,
  "Same-address Go must preserve the existing Interval without inventing movement."
);

// Rapid Step is one history entry and one interval from the initial departure.
let stepped = createSession({ duration: 100, current: 50 });
result = step(stepped, "forward", 10, { departure: 50 });
stepped = result.session;
result = step(stepped, "forward", 10, { departure: 50, amend: true });
stepped = result.session;
assert.equal(stepped.model.neighborhood.C, 70);
assert.equal(stepped.history.length, 1);
assert.deepEqual(
  { start: stepped.model.activeSpan.start, end: stepped.model.activeSpan.end },
  { start: 50, end: 70 }
);
stepped = undo(stepped).session;
assert.equal(stepped.model.neighborhood.C, 50);

// Step pushes an approached binary endpoint only once its midpoint has reached
// the one-Step guard, preserving one complete Step of useful Refine headroom.
let pushedNeighborhood = createSession({ duration: 100, current: 50 });
pushedNeighborhood = refine(pushedNeighborhood, "backward").session;
assert.deepEqual(pushedNeighborhood.model.neighborhood, { L: 0, C: 25, R: 50, level: 1 });
pushedNeighborhood = step(pushedNeighborhood, "forward", 25).session;
assert.deepEqual(pushedNeighborhood.model.neighborhood, { L: 0, C: 50, R: 100, level: 0 });
assert.deepEqual(getTargets(pushedNeighborhood.model.neighborhood), { backward: 25, forward: 75 });

let pushedBackward = createSession({ duration: 100, current: 50 });
pushedBackward = refine(pushedBackward, "forward").session;
pushedBackward = step(pushedBackward, "backward", 25).session;
assert.deepEqual(pushedBackward.model.neighborhood, { L: 0, C: 50, R: 100, level: 0 });
assert.deepEqual(getTargets(pushedBackward.model.neighborhood), { backward: 25, forward: 75 });

// Range deformation preserves the Active Span while rebasing endpoint frames
// to the new hard bound.
let ranged = createSession({ duration: 100, current: 50 });
ranged = goTo(ranged, 70, { operator: "timeline", label: "Timeline Click" }).session;
const loopBeforeRange = copy(ranged.model.activeSpan);
ranged = setRange(ranged, 20, 80, 70, "Set Range").session;
assert.deepEqual(
  {
    start: ranged.model.activeSpan.start,
    end: ranged.model.activeSpan.end,
    departure: ranged.model.activeSpan.departure,
    arrival: ranged.model.activeSpan.arrival
  },
  {
    start: loopBeforeRange.start,
    end: loopBeforeRange.end,
    departure: loopBeforeRange.departure,
    arrival: loopBeforeRange.arrival
  }
);
assert.deepEqual(ranged.model.activeSpan.arrivalNeighborhood.neighborhood, ranged.model.neighborhood);
assert.deepEqual(ranged.model.range, { start: 20, end: 80 });
ranged = setRange(ranged, 60, 80, 70, "Narrow Range").session;
assert.equal(ranged.model.activeSpan, null, "Range changes clear Intervals they no longer contain.");

// Focus maps a linked Section onto Range, and global movement unsnaps it.
const focusGuide = createGuide("video");
const focusSectionRecord = createSectionFromTimes(focusGuide, 10, 30, { label: "Focused" }).section;
ensurePin(focusGuide, 80, { label: "Outside", kind: PIN_KIND.EXPLICIT });
let focused = createSession({ duration: 100, current: 50, guide: focusGuide });
focused = focusSection(focused, focusSectionRecord.id).session;
assert.deepEqual(focused.model.range, { start: 10, end: 30 });
assert.equal(focused.model.neighborhood.C, 20);
assert.equal(focused.model.focus.sectionId, focusSectionRecord.id);
assert.equal(focused.model.activeSpan, null, "Focus relocation is administrative and must not create an Interval.");

const focusWithoutMovementSource = createSession({ duration: 100, current: 20, guide: focusGuide });
const focusWithoutMovement = focusSection(focusWithoutMovementSource, focusSectionRecord.id);
assert.equal(focusWithoutMovement.changed, true);
assert.equal("place" in focusWithoutMovement, false, "Focus inside a Section must not emit a redundant player placement.");
assert.equal("interval" in focusWithoutMovement, false, "Focus inside a Section must not claim a Interval.");

focused = goTo(focused, 80, { operator: "pin", label: "Go to Pin" }).session;
assert.equal(focused.model.focus, null);
assert.deepEqual(focused.model.range, { start: 0, end: 100 });
assert.equal(focused.model.neighborhood.C, 80);

// Unfocus restores only Range and preserves the current Active Span while
// recording the restored active-endpoint frame.
let focusedAgain = createSession({ duration: 100, current: 20, guide: focusGuide });
focusedAgain = goTo(focusedAgain, 25, { operator: "timeline", label: "Timeline Click" }).session;
focusedAgain = focusSection(focusedAgain, focusSectionRecord.id).session;
const beforeUnfocusLoop = copy(focusedAgain.model.activeSpan);
focusedAgain = leaveSection(focusedAgain).session;
assert.deepEqual(focusedAgain.model.range, { start: 0, end: 100 });
assert.deepEqual(
  {
    start: focusedAgain.model.activeSpan.start,
    end: focusedAgain.model.activeSpan.end,
    departure: focusedAgain.model.activeSpan.departure,
    arrival: focusedAgain.model.activeSpan.arrival
  },
  {
    start: beforeUnfocusLoop.start,
    end: beforeUnfocusLoop.end,
    departure: beforeUnfocusLoop.departure,
    arrival: beforeUnfocusLoop.arrival
  }
);
assert.deepEqual(focusedAgain.model.activeSpan.arrivalNeighborhood.neighborhood, focusedAgain.model.neighborhood);

// The active Interval is a semi-persistent Active Span. Focus projects it into
// Range without retaining it in Guide; Leave preserves the deformed working
// value, while Save is the explicit persistence boundary.
let working = createSession({ duration: 100, current: 50, guide: createGuide("video") });
working = goTo(working, 70, { operator: "timeline" }).session;
const workingBeforeFocus = copy(working.model.activeSpan);
working = focusWorkingSection(working).session;
assert.equal(working.model.focus.kind, FOCUS_KIND.ACTIVE_SPAN);
assert.deepEqual(working.model.focus.extent, { start: 50, end: 70 });
assert.deepEqual(working.model.range, { start: 50, end: 70 });
assert.deepEqual(
  {
    start: working.model.activeSpan.start,
    end: working.model.activeSpan.end,
    departure: working.model.activeSpan.departure,
    arrival: working.model.activeSpan.arrival
  },
  {
    start: workingBeforeFocus.start,
    end: workingBeforeFocus.end,
    departure: workingBeforeFocus.departure,
    arrival: workingBeforeFocus.arrival
  }
);
assert.equal(working.model.guide.sections.length, 0, "Focus must not save the Active Span.");

working = refine(working, "backward").session;
assert.deepEqual(
  { start: working.model.activeSpan.start, end: working.model.activeSpan.end },
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
  { start: working.model.activeSpan.start, end: working.model.activeSpan.end },
  { start: 50, end: 60 },
  "Leave must preserve the unsaved Active Span."
);
assert.equal(working.model.guide.sections.length, 0);

working = retainSpanAsSection(working, "Working").session;
const retainedWorkingId = working.model.guide.sections[0].id;
assert.equal(resolveSection(working.model.guide, retainedWorkingId).label, "Working");
assert.deepEqual(
  {
    start: resolveSection(working.model.guide, retainedWorkingId).start,
    end: resolveSection(working.model.guide, retainedWorkingId).end
  },
  { start: 50, end: 60 }
);

// Guide operations participate in the same Undo chain.
let edited = createSession({ duration: 100, current: 40, guide: createGuide("video") });
const guideBeforeEdit = edited.model.guide;
edited = retainCurrentAsPin(edited, "Forty").session;
assert.notEqual(edited.model.guide, guideBeforeEdit, "Guide edits must replace the immutable Guide value.");
assert.equal(guideBeforeEdit.pins.length, 0);
assert.equal(edited.model.guide.pins.length, 1);
edited = goTo(edited, 60, { operator: "timeline", label: "Timeline Click" }).session;
edited = retainSpanAsSection(edited, "Forty to sixty").session;
assert.equal(edited.model.guide.sections.length, 1);
edited = undo(edited).session;
assert.equal(edited.model.guide.sections.length, 0);
assert.equal(edited.model.neighborhood.C, 60);


// No-op Guide commands do not create history or replace the Guide.
let noops = createSession({ duration: 100, current: 40, guide: createGuide("video") });
let noOpResult = retainCurrentAsPin(noops, "Forty");
noops = noOpResult.session;
const noOpGuide = noops.model.guide;
const noOpHistoryLength = noops.history.length;
const noOpPin = noops.model.guide.pins[0];
noOpResult = retainCurrentAsPin(noops, "Forty");
assert.equal(noOpResult.changed, false);
assert.equal(noOpResult.session.model.guide, noOpGuide);
assert.equal(noOpResult.session.history.length, noOpHistoryLength);
noOpResult = renameGuidePin(noops, noOpPin.id, "Forty");
assert.equal(noOpResult.changed, false);
noOpResult = deleteGuidePin(noops, "missing-pin");
assert.equal(noOpResult.changed, false);
noops = goTo(noops, 60, { operator: "timeline", label: "Timeline Click" }).session;
noops = retainSpanAsSection(noops, "Forty to sixty").session;
const noOpSection = noops.model.guide.sections[0];
const sectionHistoryLength = noops.history.length;
noOpResult = retainSpanAsSection(noops, "Forty to sixty");
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
  parentNeighborhood: copy(playback.model.neighborhood),
  parentResolutionBasis: playback.model.neighborhoodBasis,
  returnModel: playbackUndo,
  label: "Playback"
}).session;
assert.deepEqual(
  { start: playback.model.activeSpan.start, end: playback.model.activeSpan.end },
  { start: 20, end: 70 }
);
assert.equal(playback.model.activeSpan.operator, "playback");
assert.equal(playback.model.neighborhood.level, 0);

// A crossed playback can restore Range-level Resolution even when physical movement is small.
let fullCycle = createSession({ duration: 100, current: 0 });
fullCycle = refine(fullCycle, "forward").session;
const fullCycleReturn = snapshotModel(fullCycle.model);
fullCycle = previewRange(fullCycle, 0, 100, 0).session;
const fullCycleResult = completePlayback(fullCycle, {
  current: 1,
  departure: 0,
  parentNeighborhood: copy(fullCycleReturn.neighborhood),
  parentResolutionBasis: fullCycleReturn.neighborhoodBasis,
  returnModel: fullCycleReturn,
  label: "Playback"
});
assert.equal(fullCycleResult.changed, true);
assert.equal(fullCycleResult.session.history.length, 2);
assert.equal(undo(fullCycleResult.session).session.model.neighborhood.level, fullCycleReturn.neighborhood.level);

// Drag preview is committed as one undoable Range action.
let dragged = createSession({ duration: 100, current: 50 });
const dragOrigin = snapshotModel(dragged.model);
dragged = previewRange(dragged, 20, 80, 50).session;
dragged = checkpoint(dragged, "Adjust Range", dragOrigin).session;
assert.equal(dragged.history.length, 1);
dragged = undo(dragged).session;
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

assert.equal(formatTime(59.9996), "1:00");
assert.equal(formatTime(3599.9996), "1:00:00");
assert.equal(formatTime(168.334), "2:48.33");
assert.equal(formatTime(168.3), "2:48.3");
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
