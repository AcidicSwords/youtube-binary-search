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
  setSectionWeight,
  translateSection,
  validateGuide
} from "./guide.js";
import {
  STEP_REACH_MODE,
  createSession,
  deformSection,
  deleteGuidePin,
  effectiveStepReach,
  goTo,
  goToGuidePin,
  step,
  stepToPin,
  switchEndpoint
} from "./session.js";
import {
  createTimelineProjection,
  projectionForModel
} from "./timeline-projection.js";

const close = (actual, expected, message) => {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${message}: ${actual} !== ${expected}`
  );
};

function weightedGuide(...definitions) {
  const guide = createGuide("v7-tests");
  const sections = definitions.map(([start, end, weight, label = ""]) =>
    createSectionFromTimes(guide, start, end, {
      label,
      weight,
      provenance: "test"
    }).section
  );
  return { guide, sections };
}

// Overlap is scale composition, not a topology or precedence system.
{
  const { guide, sections } = weightedGuide(
    [20, 50, 0.5, "Outer-left"],
    [35, 70, 2, "Crossing"],
    [45, 55, 0.5, "Nested"]
  );
  assert.equal(validateGuide(guide, 100), true);
  let projection = createTimelineProjection({ duration: 100, guide });
  assert.equal(projection.weightAtSource(30), 0.5);
  assert.equal(projection.weightAtSource(40), 1);
  assert.equal(projection.weightAtSource(47), 0.5);
  assert.equal(projection.weightAtSource(60), 2);

  setSectionWeight(guide, sections[1].id, 1);
  projection = createTimelineProjection({ duration: 100, guide });
  assert.equal(projection.weightAtSource(40), 0.5);
  assert.equal(projection.weightAtSource(47), 0.25);
}

// Pins stay distinct and ordered at ordinary positive distances.
{
  const { guide } = weightedGuide([30, 50, 0.5, "Compressed"]);
  const projection = createTimelineProjection({ duration: 100, guide });
  close(
    projection.timelineDistance(30, 50),
    10,
    "Section spatial extent"
  );
  close(
    projection.stepTarget(29, 2, "forward", { start: 0, end: 100 }),
    32,
    "Step follows weighted space"
  );
  const start = nextPin(guide, 29, { start: 0, end: 100 }, projection);
  const end = nextPin(guide, start.t, { start: 0, end: 100 }, projection);
  assert.equal(start.t, 30);
  assert.equal(end.t, 50);
  assert.equal(previousPin(guide, 50, { start: 0, end: 100 }, projection).t, 30);
  assert.ok(end.timeline > start.timeline);
}

// Deleting a shared endpoint reports and dissolves every referencing Section
// atomically when the user confirms the cascade.
{
  const guide = createGuide("delete-shared");
  createSectionFromTimes(guide, 10, 20, { label: "First", weight: 0.5 });
  createSectionFromTimes(guide, 20, 30, { label: "Second", weight: 2 });
  const shared = guide.pins.find(pin => Math.abs(pin.t - 20) < 1e-6);
  const session = createSession({ duration: 100, guide });
  assert.equal(deleteGuidePin(session, shared.id).reason, "pin-in-use");
  const removed = deleteGuidePin(session, shared.id, { cascade: true });
  assert.equal(removed.changed, true);
  assert.equal(removed.value.dissolvedSectionIds.length, 2);
  assert.equal(removed.session.model.guide.sections.length, 0);
}

// Direct Guide Go reaches every interior object without changing deformation.
{
  const { guide, sections } = weightedGuide([30, 50, 0.25, "Compressed"]);
  const interior = ensurePin(guide, 37, {
    kind: PIN_KIND.EXPLICIT,
    label: "Interior"
  }).pin;
  const session = createSession({ duration: 100, current: 20, guide });
  const moved = goToGuidePin(session, interior.id);
  assert.equal(moved.changed, true);
  assert.equal(moved.session.model.resolution.C, 37);
  assert.equal(
    resolveSection(moved.session.model.guide, sections[0].id).weight,
    0.25
  );
}

// Pin traversal and ordinary Step share the same retained-anchor law.
{
  const { guide } = weightedGuide([30, 50, 0.5, "Compressed"]);
  let session = createSession({ duration: 100, current: 29, guide });
  session = stepToPin(session, 30, "forward").session;
  session = stepToPin(session, 50, "forward").session;
  session = step(session, "forward", 1).session;
  assert.deepEqual(
    {
      departure: session.model.interval.departure,
      arrival: session.model.interval.arrival,
      start: session.model.interval.start,
      end: session.model.interval.end
    },
    { departure: 29, arrival: 51, start: 29, end: 51 }
  );
  session = switchEndpoint(session).session;
  assert.equal(session.model.resolution.C, 29);
  session = switchEndpoint(session).session;
  assert.equal(session.model.resolution.C, 51);
}

// Adaptive Reach follows weighted Range width; fixed Reach is already expressed
// directly in that same spatial unit.
{
  const { guide } = weightedGuide([30, 50, 0.5, "Compressed"]);
  const model = createSession({ duration: 100, guide }).model;
  const projection = projectionForModel(model);
  const adaptive = effectiveStepReach({
    backward: 10,
    forward: 10,
    linked: true,
    mode: STEP_REACH_MODE.ADAPTIVE,
    fraction: 1 / 16
  }, model.range, projection);
  close(adaptive.forward, 90 / 16, "Adaptive Reach");
}

// Deform creates or reuses a retained Section, stores the chosen familiar
// multiplier, and preserves the Working Interval.
{
  let session = createSession({ duration: 100, current: 20 });
  session = goTo(session, 40, { label: "Test Go" }).session;
  const before = { ...session.model.interval };
  const deformed = deformSection(session, null, 0.75);
  assert.equal(deformed.changed, true);
  assert.equal(deformed.created, true);
  assert.equal(deformed.section.label, "");
  assert.equal(deformed.section.weight, 0.75);
  assert.deepEqual(
    {
      start: deformed.session.model.interval.start,
      end: deformed.session.model.interval.end
    },
    { start: before.start, end: before.end }
  );
}

// Coextensive Sections remain distinct identities. Deform refuses to choose
// one silently unless the caller supplies the selected Section.
{
  const guide = createGuide("coextensive");
  const first = createSectionFromTimes(guide, 20, 40, {
    label: "First"
  }).section;
  const second = createSectionFromTimes(guide, 20, 40, {
    label: "Second"
  }).section;
  let session = createSession({ duration: 100, current: 20, guide });
  session = goTo(session, 40, { label: "Test Go" }).session;
  const ambiguous = deformSection(session, null, 0.5);
  assert.equal(ambiguous.changed, false);
  assert.equal(ambiguous.reason, "ambiguous-deform-target");
  assert.deepEqual(new Set(ambiguous.sectionIds), new Set([first.id, second.id]));
  const selected = deformSection(session, second.id, 2);
  assert.equal(selected.changed, true);
  assert.equal(selected.section.id, second.id);
  assert.equal(selected.section.weight, 2);
  assert.equal(
    resolveSection(selected.session.model.guide, first.id).weight,
    1
  );
}

// Section translation owns only its endpoint Pins, never unrelated interior
// annotations or the Section's weight.
{
  const guide = createGuide("translate");
  const section = createSectionFromTimes(guide, 20, 40, {
    label: "",
    weight: 1.5
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
      weight: resolveSection(guide, section.id).weight,
      interior: interior.t
    },
    { start: 25, end: 45, weight: 1.5, interior: 30 }
  );
  assert.equal(movePin(guide, interior.id, 31, 100).changed, true);
}

console.log("v7 Section deformation tests passed.");
