import assert from "node:assert/strict";
import {
  createGuide,
  createSectionFromTimes,
  deleteSection,
  ensurePin,
  nextPin,
  normalizeGuide,
  previousPin,
  resolveSection,
  setSectionCollapsed,
  translateSection,
  validateGuide
} from "./guide.js";
import {
  createTemporalProjection,
  projectionForModel
} from "./temporal-projection.js";
import {
  createRoot,
  getTargets,
  stepNeighborhood,
  stepTarget
} from "./range-geometry.js";
import {
  createSession,
  focusSection,
  leaveSection,
  saveExtentAsSection,
  setRange,
  setGuideSectionCollapsed,
  setGuideSectionsCollapsed,
  step,
  switchEndpoint,
  undo
} from "./session.js";
import { deriveStepField } from "./step-field-geometry.js";
import { deriveContextWindow } from "./transport.js";

const guide = createGuide("fold-video");
const sectionA = createSectionFromTimes(guide, 30, 45, {
  label: "Section A"
}).section;
assert.equal(setSectionCollapsed(guide, sectionA.id, true).changed, true);

const projection = createTemporalProjection({ duration: 180, guide });
assert.equal(projection.effectiveDuration, 165);
assert.equal(projection.sourceToTraversal(29), 29);
assert.equal(projection.sourceToTraversal(30), 30);
assert.equal(projection.sourceToTraversal(37.5), 30);
assert.equal(projection.sourceToTraversal(45), 30);
assert.equal(projection.sourceToTraversal(46), 31);
assert.equal(projection.traversalToSource(30, "backward"), 30);
assert.equal(projection.traversalToSource(30, "forward"), 45);
assert.equal(
  projection.sourceStep(46, 1, "backward", { start: 45, end: 180 }),
  45,
  "A contracted inverse may not cross the active Range's excluded Fold face."
);
assert.equal(
  projection.sourceStep(29, 1, "forward", { start: 0, end: 30 }),
  30,
  "A forward inverse at an excluded Fold face must clamp to Range."
);
assert.equal(
  stepTarget(46, 1, "backward", { start: 45, end: 180 }, projection.metric),
  45
);
assert.equal(
  previousPin(guide, 46, { start: 45, end: 180 }, projection),
  null,
  "A Range containing only one source face does not contain the folded Section."
);
assert.deepEqual(
  projection.projectExtent({ start: 27, end: 50 }),
  { start: 27, end: 35 }
);
assert.deepEqual(
  deriveContextWindow(
    29,
    { start: 0, end: 180 },
    4,
    projection
  ),
  { start: 27, end: 46 },
  "Context halves are measured in traversal time but materialize every crossed source Section."
);
assert.deepEqual(
  {
    tail: deriveStepField(
      46,
      { backward: 2, forward: 2, linked: true },
      { start: 0, end: 180 },
      projection
    ).tail.target,
    lead: deriveStepField(
      29,
      { backward: 2, forward: 2, linked: true },
      { start: 0, end: 180 },
      projection
    ).lead.target
  },
  { tail: 29, lead: 46 },
  "Tail and Lead must represent the same fold-aware Step destinations as the matrix."
);

assert.equal(
  stepTarget(29, 2, "forward", { start: 0, end: 180 }, projection.metric),
  46,
  "A two-second traversal Step must cross the collapsed source extent as one point."
);
assert.equal(
  stepTarget(46, 2, "backward", { start: 0, end: 180 }, projection.metric),
  29
);
assert.deepEqual(
  getTargets(createRoot(0, 30, 180), projection.metric),
  { backward: 15, forward: 112.5 },
  "Refine midpoints must bisect contracted traversal distance."
);
assert.deepEqual(
  stepNeighborhood(
    { L: 20, C: 29, R: 47, level: 1 },
    46,
    { start: 0, end: 180 },
    2,
    projection.metric
  ),
  { L: 20, C: 46, R: 49, level: 0 }
);

const before = ensurePin(guide, 20, { label: "Before" }).pin;
const after = ensurePin(guide, 60, { label: "After" }).pin;
const internal = ensurePin(guide, 37, { label: "Internal" }).pin;
const forwardFold = nextPin(guide, before.t, { start: 0, end: 180 }, projection);
assert.equal(forwardFold.stopKind, "section");
assert.equal(forwardFold.t, 45, "Forward Pin traversal lands on the inclusive far face.");
const backwardFold = previousPin(guide, after.t, { start: 0, end: 180 }, projection);
assert.equal(backwardFold.stopKind, "section");
assert.equal(backwardFold.t, 30, "Backward Pin traversal lands on the inclusive far face.");
assert.notEqual(
  forwardFold.id,
  internal.id,
  "Pins retained inside a collapsed Section must disappear from traversal until that Section expands."
);

const nested = createSectionFromTimes(guide, 32, 36, {
  label: "Nested"
}).section;
setSectionCollapsed(guide, nested.id, true);
assert.equal(
  createTemporalProjection({ duration: 180, guide }).folds.length,
  1,
  "A collapsed parent must own the visible frontier while retaining child state."
);
setSectionCollapsed(guide, sectionA.id, false);
assert.equal(
  createTemporalProjection({ duration: 180, guide }).folds[0].sectionIds[0],
  nested.id,
  "Expanding a parent must reveal its child's retained collapsed state."
);

const crossing = createSectionFromTimes(guide, 34, 50, {
  label: "Crossing"
}).section;
assert.equal(setSectionCollapsed(guide, crossing.id, true).changed, false);
assert.equal(
  setSectionCollapsed(guide, crossing.id, true).reason,
  "fold-topology-conflict"
);
assert.equal(validateGuide(guide, 180), true);

const adjacentGuide = createGuide("adjacent-fold-video");
const adjacentA = createSectionFromTimes(adjacentGuide, 30, 45, {
  label: "Adjacent A"
}).section;
const adjacentB = createSectionFromTimes(adjacentGuide, 45, 60, {
  label: "Adjacent B"
}).section;
assert.equal(setSectionCollapsed(adjacentGuide, adjacentA.id, true).changed, true);
assert.equal(
  setSectionCollapsed(adjacentGuide, adjacentB.id, true).reason,
  "fold-topology-conflict",
  "Adjacent sibling Folds need one expanded boundary between their inverse faces."
);

const coincidentGuide = createGuide("coincident-fold-video");
const coincidentA = createSectionFromTimes(coincidentGuide, 70, 80, {
  label: "Coincident A"
}).section;
const coincidentB = createSectionFromTimes(coincidentGuide, 70, 80, {
  label: "Coincident B"
}).section;
setSectionCollapsed(coincidentGuide, coincidentA.id, true);
setSectionCollapsed(coincidentGuide, coincidentB.id, true);
assert.equal(
  createTemporalProjection({ duration: 180, guide: coincidentGuide })
    .folds[0].sectionIds.length,
  2,
  "Coincident retained relations share one unambiguous Fold Point."
);
const expandedCoincident = setGuideSectionsCollapsed(
  createSession({ duration: 180, guide: coincidentGuide }),
  [coincidentA.id, coincidentB.id],
  false
);
assert.equal(expandedCoincident.changed, true);
assert.equal(
  expandedCoincident.session.model.guide.sections.every(section => !section.collapsed),
  true
);
assert.equal(
  undo(expandedCoincident.session).session.model.guide.sections.every(section => section.collapsed),
  true,
  "Expanding a coincident Fold proxy is one Undoable Guide transaction."
);

setSectionCollapsed(guide, nested.id, false);
setSectionCollapsed(guide, sectionA.id, true);
const moved = translateSection(guide, sectionA.id, 10, 180);
assert.equal(moved.changed, true);
assert.equal(moved.section.start, 40);
assert.equal(moved.section.end, 55);
assert.equal(
  guide.pins.find(pin => pin.id === nested.startPinId).t,
  42,
  "Dragging a collapsed Section must translate its contained retained Pins."
);
assert.equal(
  guide.pins.find(pin => pin.id === internal.id).t,
  47,
  "Dragging a collapsed Section must translate ordinary contained Pins with the retained subtree."
);

const hierarchy = createGuide("hierarchy");
const outer = createSectionFromTimes(hierarchy, 30, 60, {
  label: "Outer"
}).section;
const child = createSectionFromTimes(hierarchy, 35, 45, {
  label: "Child"
}).section;
setSectionCollapsed(hierarchy, outer.id, true);
setSectionCollapsed(hierarchy, child.id, true);
assert.equal(
  createTemporalProjection({ duration: 180, guide: hierarchy }).folds[0].sectionIds[0],
  outer.id
);
const hierarchyProjection = createTemporalProjection({
  duration: 180,
  guide: hierarchy
});
const resolvedOuter = resolveSection(hierarchy, outer.id);
const hierarchyCarryInverse = createTemporalProjection({
  duration: 180,
  guide: hierarchy,
  expandedSectionIds: [outer.id, child.id]
});
assert.equal(
  hierarchyCarryInverse.traversalToSource(
    hierarchyProjection.sourceToTraversal(resolvedOuter.start) + 10,
    "forward"
  ),
  40,
  "Carrying a visible parent must ignore its moving descendant Folds when resolving the shared traversal delta."
);
deleteSection(hierarchy, outer.id);
assert.equal(
  createTemporalProjection({ duration: 180, guide: hierarchy }).folds[0].sectionIds[0],
  child.id,
  "Deleting a folded parent must reveal the child's retained fold state."
);

const persisted = normalizeGuide(
  JSON.parse(JSON.stringify(hierarchy)),
  "hierarchy"
);
assert.equal(persisted.version, 6);
assert.equal(persisted.sections[0].collapsed, true);
const migratedV5 = normalizeGuide({
  version: 5,
  pins: persisted.pins,
  sections: persisted.sections
}, "hierarchy");
assert.equal(
  migratedV5.sections[0].collapsed,
  false,
  "Legacy Guides must migrate expanded instead of inventing hidden topology."
);

let session = createSession({ duration: 180, current: 29 });
let result = saveExtentAsSection(
  session,
  { start: 30, end: 45 },
  "Folded"
);
session = result.session;
const savedId = result.value.section.id;
result = setGuideSectionCollapsed(session, savedId, true);
session = result.session;
assert.equal(session.model.guide.sections[0].collapsed, true);

result = step(session, "forward", 1);
session = result.session;
assert.equal(session.model.resolution.C, 45);
assert.deepEqual(
  { start: session.model.interval.start, end: session.model.interval.end },
  { start: 29, end: 45 },
  "Landing on a collapsed Section Point must include its complete source extent."
);

result = switchEndpoint(session);
session = result.session;
assert.equal(result.foldedEndpoint.included, false);
assert.equal(session.model.resolution.C, 30);
assert.deepEqual(
  { start: session.model.interval.start, end: session.model.interval.end },
  { start: 29, end: 30 },
  "Switch Endpoint at a Section Point must toggle that Section out of the Working Section."
);
result = switchEndpoint(session);
assert.equal(result.foldedEndpoint.included, true);
assert.equal(result.session.model.resolution.C, 45);
assert.equal(undo(result.session).session.model.resolution.C, 30);

const facedGuide = createGuide("range-face-video");
const facedSection = createSectionFromTimes(facedGuide, 30, 45, {
  label: "Range Face"
}).section;
setSectionCollapsed(facedGuide, facedSection.id, true);
let facedRange = createSession({ duration: 180, current: 46, guide: facedGuide });
facedRange = setRange(facedRange, 45, 180, 46, "Exclude Fold").session;
const facedStep = step(facedRange, "backward", 1);
assert.equal(facedStep.changed, true);
assert.equal(facedStep.session.model.resolution.C, 45);
assert.equal(
  step(facedStep.session, "backward", 1).reason,
  "range-edge",
  "Repeated Step may not escape Range through the Fold's other source face."
);
assert.equal(
  switchEndpoint(facedStep.session).session.model.resolution.C,
  46,
  "Switch uses ordinary endpoint transposition when Range excludes the Fold interior."
);

const focused = focusSection(result.session, savedId);
assert.equal(focused.changed, true);
assert.equal(
  projectionForModel(focused.session.model).effectiveDuration,
  180,
  "Focusing a collapsed Section must materialize it without changing its stored fold state."
);
const leftFocus = leaveSection(focused.session);
assert.equal(leftFocus.changed, true);
assert.equal(
  projectionForModel(leftFocus.session.model).effectiveDuration,
  165,
  "Leaving Focus must restore the containing Range and the retained collapsed presentation."
);

const latentCurrentModel = {
  ...result.session.model,
  resolution: createRoot(0, 37, 180),
  interval: null
};
assert.equal(
  projectionForModel(latentCurrentModel).effectiveDuration,
  165,
  "Current alone may retain an exact latent source Address at the folded point."
);

const partialRange = setRange(
  result.session,
  35,
  80,
  45,
  "Partial Fold Range"
);
assert.equal(partialRange.changed, true);
assert.equal(
  projectionForModel(partialRange.session.model).effectiveDuration,
  180,
  "A Range boundary may not invisibly cut a collapsed Section; that Section materializes while the cut exists."
);

const semanticCutModel = {
  ...result.session.model,
  resolution: createRoot(20, 37, 70),
  interval: {
    ...result.session.model.interval,
    start: 20,
    end: 37,
    departure: 20,
    arrival: 37
  }
};
assert.equal(
  projectionForModel(semanticCutModel).effectiveDuration,
  180,
  "Playback, Context acceptance, or native scrub may settle inside a Fold only if that semantic cut materializes the source interior."
);

console.log("Temporal projection v6 tests passed: source-contiguous playback geometry, folded traversal, nested Sections, Focus/Range materialization, face toggling, migration, and retained subtree movement.");
