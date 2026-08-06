// Section Weight: what it touches and what it cannot.
//
// Weight is a spatial scale. It changes Timeline Space and everything derived
// from Timeline Space, and it changes nothing in source time. This suite states
// that boundary attribute by attribute, parameter by parameter, and operator by
// operator, so a future change that leaks Weight into source time fails here.
import assert from "node:assert/strict";
import {
  createSession,
  goTo,
  step,
  refine,
  setStepDistance,
  effectiveStepDistance,
  setGuideSectionWeight,
  saveExtentAsSection,
  STEP_DISTANCE_MODE
} from "./session.js";
import { projectionForModel } from "./timeline-projection.js";
import { deriveContextWindow, createContextTransport } from "./transport.js";
import { effectiveCycleBounds, derivePanorama } from "./panorama-geometry.js";

const DURATION = 100;
const RANGE = { start: 0, end: DURATION };

// One Section over 20–60 s. Everything below compares the same model at 1x
// against the same model at a non-neutral Weight.
function sessionAtWeight(weight) {
  let session = createSession({ duration: DURATION });
  session = goTo(session, 20, { operator: "timeline" }).session;
  session = goTo(session, 60, { operator: "timeline" }).session;
  const saved = saveExtentAsSection(session, { start: 20, end: 60 }, { label: "W" });
  session = saved.session;
  const sectionId = session.model.guide.sections.at(-1).id;
  if (weight !== 1) {
    session = setGuideSectionWeight(session, sectionId, weight).session;
  }
  session = goTo(session, 50, { operator: "timeline" }).session;
  return { session, sectionId };
}

const neutral = sessionAtWeight(1);
const weighted = sessionAtWeight(2);

// Retained truth: what the viewer committed or saved. None of it is derived.
function addresses(model) {
  return {
    range: [model.range.start, model.range.end],
    current: model.neighborhood.C,
    activeSpan: model.activeSpan && [model.activeSpan.start, model.activeSpan.end],
    pins: model.guide.pins.map(pin => pin.t).sort((a, b) => a - b),
    sections: model.guide.sections
      .map(section => [section.startPin, section.endPin])
      .map(([a, b]) => [
        model.guide.pins.find(pin => pin.id === a)?.t,
        model.guide.pins.find(pin => pin.id === b)?.t
      ])
  };
}

// --- Retained truth is Weight-blind ------------------------------------------
// The same gesture sequence performed at two Weights commits the same Range,
// Current, Active Span, Pins and Section endpoints.
{
  assert.deepEqual(
    addresses(neutral.session.model),
    addresses(weighted.session.model),
    "Weight must move no Range, Current, Interval, Pin or Section Address."
  );
  assert.equal(
    neutral.session.model.duration,
    weighted.session.model.duration,
    "Weight must not change source duration."
  );
}

// --- Resolution is stored in source time but established spatially -----------
// Its bounds come from a Timeline Space law, so the same gesture at a different
// Weight legitimately yields different Resolution Addresses. What Weight may
// never do is move an already-established Resolution.
{
  assert.notDeepEqual(
    [neutral.session.model.neighborhood.L, neutral.session.model.neighborhood.R],
    [weighted.session.model.neighborhood.L, weighted.session.model.neighborhood.R],
    "A spatially seeded neighbourhood follows the metric it was seeded in."
  );

  const before = {
    ...addresses(neutral.session.model),
    neighborhood: [neutral.session.model.neighborhood.L, neutral.session.model.neighborhood.R]
  };
  const edited = setGuideSectionWeight(neutral.session, neutral.sectionId, 0.25);
  assert.equal(edited.changed, true);
  assert.deepEqual(
    {
      ...addresses(edited.session.model),
      neighborhood: [edited.session.model.neighborhood.L, edited.session.model.neighborhood.R]
    },
    before,
    "A Weight edit changes only the metric — not even a derived Resolution bound."
  );
  assert.deepEqual(
    edited.session.model.stepDistance,
    neutral.session.model.stepDistance,
    "A Weight edit never rewrites stored Step Distance."
  );
}

// --- The map: Weight changes Timeline Space and stays invertible -------------
{
  const plain = projectionForModel(neutral.session.model);
  const scaled = projectionForModel(weighted.session.model);
  assert.ok(
    scaled.timelineExtent > plain.timelineExtent,
    "A 2x Section must widen the total timeline extent."
  );
  assert.equal(
    Number((scaled.timelineExtent - plain.timelineExtent).toFixed(6)),
    40,
    "It widens by exactly one extra copy of its 40 s span."
  );
  for (const projection of [plain, scaled]) {
    for (let source = 0; source <= DURATION; source += 0.5) {
      const roundTrip = projection.timelineToSource(projection.sourceToTimeline(source));
      assert.ok(
        Math.abs(roundTrip - source) < 1e-6,
        "Every Weight must keep the map strictly invertible."
      );
    }
  }
}

// --- Operators that are spatial by definition move with Weight ---------------
{
  // Step is a distance in Timeline Space, so the same Reach covers less source
  // time inside an expanded Section.
  const plainStep = step(neutral.session, "forward", 10).session.model.neighborhood.C;
  const scaledStep = step(weighted.session, "forward", 10).session.model.neighborhood.C;
  assert.equal(plainStep, 60, "At 1x, ten timeline units are ten source seconds.");
  assert.equal(scaledStep, 55, "At 2x, the same ten units are five source seconds.");

  // Refine chooses a spatial midpoint, so its destination follows the metric.
  const plainRefine = refine(neutral.session, "forward").session.model.neighborhood.C;
  const scaledRefine = refine(weighted.session, "forward").session.model.neighborhood.C;
  assert.notEqual(plainRefine, scaledRefine,
    "A spatial midpoint must move when the metric changes.");

  // Adaptive Reach is a fraction of weighted Range width, so it follows Weight.
  const adaptive = { mode: STEP_DISTANCE_MODE.ADAPTIVE, fraction: 1 / 16 };
  const plainAdaptive = effectiveStepDistance(
    setStepDistance(neutral.session, adaptive).session.model.stepDistance,
    RANGE,
    projectionForModel(neutral.session.model)
  );
  const scaledAdaptive = effectiveStepDistance(
    setStepDistance(weighted.session, adaptive).session.model.stepDistance,
    RANGE,
    projectionForModel(weighted.session.model)
  );
  assert.ok(scaledAdaptive.forward > plainAdaptive.forward,
    "Adaptive Reach follows the weighted Range width.");

  // Fixed Reach is stored, not derived, so it does not.
  const fixed = { mode: STEP_DISTANCE_MODE.FIXED, backward: 10, forward: 10 };
  assert.deepEqual(
    effectiveStepDistance(
      setStepDistance(neutral.session, fixed).session.model.stepDistance,
      RANGE,
      projectionForModel(neutral.session.model)
    ),
    effectiveStepDistance(
      setStepDistance(weighted.session, fixed).session.model.stepDistance,
      RANGE,
      projectionForModel(weighted.session.model)
    ),
    "Fixed Reach is stored and must not move with Weight."
  );
}

// --- Source-time systems must not see Weight at all --------------------------
{
  // Nudge is applied in source time by converting the quantum to the Timeline
  // distance at Current, so the resulting displacement is Weight-independent.
  const quantum = 0.5;
  const displacement = model => {
    const projection = projectionForModel(model);
    const current = model.neighborhood.C;
    const distance = Math.abs(
      projection.sourceToTimeline(current + quantum) - projection.sourceToTimeline(current)
    );
    const landed = projection.stepTarget(current, distance, "forward", model.range);
    return Number((landed - current).toFixed(9));
  };
  assert.equal(displacement(neutral.session.model), quantum);
  assert.equal(
    displacement(weighted.session.model),
    quantum,
    "One Nudge must cover the same source time at every Weight."
  );

  // The operator, not merely the geometry it is built from.
  //
  // The displacement above is read straight off the projection, which never
  // refused anything — so this suite proved the arithmetic while the operator
  // was dead. `step` asked whether the movement had landed anywhere by
  // measuring a Timeline length against EPSILON, which is the tolerance between
  // two Addresses. Under compression a real movement is a short Timeline
  // distance; that is what compression means. So Nudge stopped working inside
  // every compressed Section, at a threshold of ρ > EPSILON / quantum that no
  // reader could have guessed, while the identical Nudge worked with the
  // Timeline straightened.
  const nestedAt = (outer, inner) => {
    let session = createSession({ duration: DURATION });
    session = saveExtentAsSection(session, { start: 20, end: 60 }, { label: "outer" }).session;
    session = setGuideSectionWeight(
      session, session.model.guide.sections.at(-1).id, outer
    ).session;
    session = saveExtentAsSection(session, { start: 40, end: 56 }, { label: "inner" }).session;
    session = setGuideSectionWeight(
      session, session.model.guide.sections.at(-1).id, inner
    ).session;
    return goTo(session, 48, { operator: "timeline" }).session;
  };

  for (const [outer, inner] of [
    [0.125, 0.125], [0.125, 0.25], [0.125, 0.5], [0.25, 0.25],
    [0.5, 0.5], [1, 1], [2, 2], [4, 4], [0.125, 4]
  ]) {
    for (const configured of [1 / 24, 0.25, 0.5, 1]) {
      const session = nestedAt(outer, inner);
      const projection = projectionForModel(session.model);
      const current = session.model.neighborhood.C;
      const distance = Math.abs(
        projection.sourceToTimeline(current + configured)
        - projection.sourceToTimeline(current)
      );
      const result = step(session, "forward", distance, { projection });
      const composed = (outer * inner).toFixed(6);
      assert.equal(result.changed, true,
        `A ${configured}s Nudge must move Current at composed Weight ${composed}.`);
      assert.ok(
        Math.abs(result.session.model.neighborhood.C - (current + configured)) < 1e-6,
        `and must land exactly one quantum later at composed Weight ${composed}.`
      );
    }
  }

  // Context is a bounded source window. It takes Current, Range and a duration
  // in seconds — no projection is reachable from its signature, so no Weight
  // can enter it.
  assert.deepEqual(
    deriveContextWindow(50, RANGE, 5),
    { start: 47.5, end: 52.5 },
    "Context is half its duration either side of Current in source seconds."
  );
  const context = createContextTransport({ anchor: 50, range: RANGE, seconds: 5 });
  assert.deepEqual(
    [context.start, context.end],
    [47.5, 52.5],
    "Context transport carries those same source edges."
  );

  // Panorama geometry is physical: offsets and cycling bounds are source seconds.
  assert.deepEqual(
    derivePanorama(50, { backward: 10, forward: 10, linked: true }, RANGE).envelope,
    { start: 40, end: 60 },
    "Panorama offsets are source-time displacements from Center."
  );
  assert.deepEqual(
    effectiveCycleBounds({ inner: 2.5, outer: 10, rate: 0.5 }, 50),
    { inner: 2.5, outer: 10, parked: 10, operational: true },
    "Cycling bounds are source seconds, bounded only by source room."
  );
}

// --- Guide topology is source topology --------------------------------------
{
  const scaled = projectionForModel(weighted.session.model);
  const pins = weighted.session.model.guide.pins.map(pin => pin.t).sort((a, b) => a - b);
  const projected = pins.map(source => scaled.sourceToTimeline(source));
  for (let index = 1; index < projected.length; index += 1) {
    assert.ok(
      projected[index] > projected[index - 1] - 1e-9,
      "Every Weight must preserve Pin order on the map."
    );
    assert.ok(
      Math.abs(scaled.timelineToSource(projected[index]) - pins[index]) < 1e-6,
      "Every Pin must remain directly reachable at every Weight."
    );
  }
}

console.log("Weight invariance tests passed: retained Addresses, duration, Nudge displacement, Context and Panorama geometry are Weight-blind; Step, Refine, seeded Resolution and adaptive Reach follow the metric; and editing Weight moves nothing at all.");
