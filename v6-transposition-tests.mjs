import assert from "node:assert/strict";
import {
  PIN_KIND,
  createGuide,
  createSectionFromTimes,
  ensurePin,
  movePin,
  nextPin,
  previousPin,
  resolveSection,
  setSectionCollapsed,
  translateSection,
  validateGuide
} from "./guide.js";
import {
  STEP_REACH_MODE,
  refine,
  createSession,
  deleteGuidePin,
  effectiveStepReach,
  goTo,
  goToGuidePin,
  releaseInterval,
  step,
  stepToPin,
  switchEndpoint,
  transposeSection
} from "./session.js";
import {
  createTemporalProjection,
  projectionForModel
} from "./temporal-projection.js";

const close = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
};

function foldedGuide(...extents) {
  const guide = createGuide("v6-tests");
  const sections = extents.map(([start, end, label = ""]) =>
    createSectionFromTimes(guide, start, end, {
      label,
      collapsed: true,
      provenance: "test"
    }).section
  );
  return { guide, sections };
}

// Arbitrary collapsed overlap is normalized into one derived Fold while every
// Section retains its independent state.
{
  const { guide, sections } = foldedGuide(
    [20, 50, "Outer-left"],
    [35, 70, "Crossing"],
    [45, 55, "Nested"]
  );
  assert.equal(validateGuide(guide, 100), true);
  let projection = createTemporalProjection({ duration: 100, guide });
  assert.equal(projection.folds.length, 1);
  assert.deepEqual(
    { start: projection.folds[0].start, end: projection.folds[0].end },
    { start: 20, end: 70 }
  );
  assert.equal(projection.folds[0].sectionIds.length, 3);
  close(projection.effectiveDuration, 50, "Fold union removes only union measure");

  setSectionCollapsed(guide, sections[1].id, false);
  projection = createTemporalProjection({ duration: 100, guide });
  assert.equal(projection.folds.length, 1);
  assert.deepEqual(
    { start: projection.folds[0].start, end: projection.folds[0].end },
    { start: 20, end: 55 }
  );
}

// The Fold has zero lateral distance, but its contributing endpoint Pins remain
// distinct sequential Shift+Step stops.
{
  const { guide } = foldedGuide([30, 45, "Fold"]);
  const projection = createTemporalProjection({ duration: 100, guide });
  close(projection.sourceDistance(30, 45), 0, "Fold endpoint lateral distance");
  close(projection.stepTarget(29, 1, "forward", { start: 0, end: 100 }), 45, "Exact knot Step uses outward affinity");

  const start = nextPin(guide, 29, { start: 0, end: 100 }, projection);
  const top = nextPin(guide, start.t, { start: 0, end: 100 }, projection);
  assert.equal(start.t, 30);
  assert.equal(top.t, 45);
  assert.equal(previousPin(guide, 45, { start: 0, end: 100 }, projection).t, 30);
}

// Deleting a shared endpoint reports and dissolves every referencing Section
// atomically when the user confirms the cascade.
{
  const guide = createGuide("delete-shared");
  createSectionFromTimes(guide, 10, 20, { label: "First" });
  createSectionFromTimes(guide, 20, 30, { label: "Second" });
  const shared = guide.pins.find(pin => Math.abs(pin.t - 20) < 1e-6);
  const session = createSession({ duration: 100, guide });
  assert.equal(deleteGuidePin(session, shared.id).reason, "pin-in-use");
  const removed = deleteGuidePin(session, shared.id, { cascade: true });
  assert.equal(removed.changed, true);
  assert.equal(removed.value.dissolvedSectionIds.length, 2);
  assert.equal(removed.session.model.guide.sections.length, 0);
}

// Guide navigation to a hidden interior Pin unfolds its covering Fold and
// commits the exact source destination in one Undoable transaction.
{
  const { guide } = foldedGuide([30, 45, "Fold"]);
  const interior = ensurePin(guide, 37, {
    kind: PIN_KIND.EXPLICIT,
    label: "Interior"
  }).pin;
  const session = createSession({ duration: 100, current: 20, guide });
  const moved = goToGuidePin(session, interior.id);
  assert.equal(moved.changed, true);
  assert.equal(moved.session.history.length, 1);
  assert.equal(moved.session.model.resolution.C, 37);
  assert.equal(
    moved.session.model.guide.sections.every(section => !section.collapsed),
    true
  );
}

// Pin traversal uses Step's retained anchor. The zero-distance endpoint hop
// composes with the following plain Step into one source-contiguous Interval.
{
  const { guide } = foldedGuide([30, 45, "Fold"]);
  let session = createSession({ duration: 100, current: 29, guide });
  session = stepToPin(session, 30, "forward").session;
  session = stepToPin(session, 45, "forward").session;
  session = step(session, "forward", 1).session;
  assert.deepEqual(
    {
      departure: session.model.interval.departure,
      arrival: session.model.interval.arrival,
      start: session.model.interval.start,
      end: session.model.interval.end
    },
    { departure: 29, arrival: 46, start: 29, end: 46 }
  );

  session = switchEndpoint(session).session;
  assert.equal(session.model.resolution.C, 29);
  session = switchEndpoint(session).session;
  assert.equal(session.model.resolution.C, 46);
}

// Plain Refine retains the departure anchor in the active asymmetric frame.
{
  let session = createSession({ duration: 100, current: 50 });
  session = refine(session, "backward").session;
  session = refine(session, "backward").session;
  close(session.model.resolution.L, 0, "Refine backward bound");
  close(session.model.resolution.C, 12.5, "Refine Current");
  close(session.model.resolution.R, 50, "Refine retained forward bound");
  close(session.model.interval.departure, 50, "Refine anchor");
  close(session.model.interval.arrival, 12.5, "Refine arrival");

  session = refine(session, "forward").session;
  close(session.model.resolution.C, 31.25, "Asymmetric forward midpoint");
  close(session.model.interval.departure, 50, "Reverse retains original anchor");

  const released = releaseInterval(session);
  assert.equal(released.session.model.interval, null);
  assert.equal(releaseInterval(released.session).changed, false);
}

// Adaptive Reach follows lateral Range width; fixed Reach remains independent.
{
  const { guide } = foldedGuide([30, 45, "Fold"]);
  const model = createSession({ duration: 100, guide }).model;
  const projection = projectionForModel(model);
  const adaptive = effectiveStepReach({
    backward: 10,
    forward: 10,
    linked: true,
    mode: STEP_REACH_MODE.ADAPTIVE,
    fraction: 1 / 16
  }, model.range, projection);
  close(adaptive.forward, 85 / 16, "Adaptive Reach uses lateral Range width");
  close(
    effectiveStepReach({
      ...adaptive,
      mode: STEP_REACH_MODE.ADAPTIVE
    }, { start: 30, end: 45 }, projection).forward,
    0.25,
    "Adaptive Reach uses the minimum control grain at a zero-width Range"
  );
}

// Transpose creates an untitled retained Section in one transaction and keeps
// the Working Interval intact.
{
  let session = createSession({ duration: 100, current: 20 });
  session = goTo(session, 40, { label: "Test Go" }).session;
  const before = { ...session.model.interval };
  const transposed = transposeSection(session);
  assert.equal(transposed.changed, true);
  assert.equal(transposed.created, true);
  assert.equal(transposed.section.label, "");
  assert.equal(transposed.section.collapsed, true);
  assert.deepEqual(
    {
      start: transposed.session.model.interval.start,
      end: transposed.session.model.interval.end
    },
    { start: before.start, end: before.end }
  );
}

// Coextensive Sections remain distinct identities. Transpose refuses to pick
// one silently unless the caller supplies the selected Section.
{
  const guide = createGuide("coextensive");
  const first = createSectionFromTimes(guide, 20, 40, { label: "First" }).section;
  const second = createSectionFromTimes(guide, 20, 40, { label: "Second" }).section;
  let session = createSession({ duration: 100, current: 20, guide });
  session = goTo(session, 40, { label: "Test Go" }).session;
  const ambiguous = transposeSection(session);
  assert.equal(ambiguous.changed, false);
  assert.equal(ambiguous.reason, "ambiguous-transpose-target");
  assert.deepEqual(new Set(ambiguous.sectionIds), new Set([first.id, second.id]));
  const selected = transposeSection(session, second.id);
  assert.equal(selected.changed, true);
  assert.equal(selected.section.id, second.id);
  assert.equal(selected.section.collapsed, true);
  assert.equal(
    resolveSection(selected.session.model.guide, first.id).collapsed,
    false
  );
}

// Section translation owns only its endpoint Pins, never unrelated interior
// annotations.
{
  const guide = createGuide("translate");
  const section = createSectionFromTimes(guide, 20, 40, {
    label: "",
    collapsed: false
  }).section;
  const interior = ensurePin(guide, 30, {
    kind: PIN_KIND.EXPLICIT,
    label: "Independent"
  }).pin;
  translateSection(guide, section.id, 5, 100);
  assert.deepEqual(
    {
      start: resolveSection(guide, section.id).start,
      end: resolveSection(guide, section.id).end,
      interior: interior.t
    },
    { start: 25, end: 45, interior: 30 }
  );
  assert.equal(movePin(guide, interior.id, 31, 100).changed, true);
}

console.log("v6 final transposition tests passed.");
