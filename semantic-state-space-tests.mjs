import assert from "node:assert/strict";
import {
  EPSILON,
  getTargets
} from "./range-geometry.js";
import {
  createSession,
  focusSection,
  focusWorkingSection,
  goTo,
  leaveSection,
  retainCurrentAsPin,
  localRefine,
  reopen,
  retainSpanAsSection,
  setRange,
  setStepDistance,
  step,
  switchActiveEnd,
  undo
} from "./session.js";
import {
  resolveSection,
  validateGuide
} from "./guide.js";

let seed = 0x5865e11;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
}

function assertInvariant(session) {
  const { model, history } = session;
  const { duration, range, neighborhood, activeSpan, focus, guide, stepDistance } = model;
  assert.ok(range.start >= -EPSILON && range.end <= duration + EPSILON);
  assert.ok(range.start <= neighborhood.L + EPSILON);
  assert.ok(neighborhood.L <= neighborhood.C && neighborhood.C <= neighborhood.R);
  assert.ok(neighborhood.R <= range.end + EPSILON);
  assert.ok(Number.isInteger(neighborhood.level) && neighborhood.level >= 0);
  assert.ok(["range", "movement"].includes(model.neighborhoodBasis));
  assert.ok(stepDistance.backward >= 0.25 && stepDistance.backward <= 300);
  assert.ok(stepDistance.forward >= 0.25 && stepDistance.forward <= 300);
  assert.ok(history.length <= 100);
  assert.equal(validateGuide(guide, duration), true);

  const targets = getTargets(neighborhood);
  assert.equal(targets.backward === null, neighborhood.C - neighborhood.L <= EPSILON * 2);
  assert.equal(targets.forward === null, neighborhood.R - neighborhood.C <= EPSILON * 2);

  if (activeSpan) {
    assert.ok(activeSpan.end - activeSpan.start > EPSILON);
    assert.ok(activeSpan.start >= range.start - EPSILON);
    assert.ok(activeSpan.end <= range.end + EPSILON);
    assert.ok(
      activeSpan.start >= neighborhood.L - EPSILON
      && activeSpan.end <= neighborhood.R + EPSILON,
      `Active Interval must remain inside Resolution: ${JSON.stringify({ activeSpan, neighborhood })}`
    );
    assert.ok(Math.abs(activeSpan.arrival - neighborhood.C) <= EPSILON);
    assert.ok(activeSpan.arrival >= activeSpan.start - EPSILON);
    assert.ok(activeSpan.arrival <= activeSpan.end + EPSILON);
    assert.ok(
      Math.abs(activeSpan.departure - activeSpan.start) <= EPSILON
      || Math.abs(activeSpan.departure - activeSpan.end) <= EPSILON
    );
    for (const [key, address] of [
      ["departureNeighborhood", activeSpan.departure],
      ["arrivalNeighborhood", activeSpan.arrival]
    ]) {
      const frame = activeSpan[key];
      assert.ok(frame?.neighborhood);
      assert.ok(frame.neighborhood.L >= range.start - EPSILON);
      assert.ok(frame.neighborhood.R <= range.end + EPSILON);
      assert.ok(Math.abs(frame.neighborhood.C - address) <= EPSILON);
      assert.ok(frame.neighborhood.L <= activeSpan.start + EPSILON);
      assert.ok(frame.neighborhood.R >= activeSpan.end - EPSILON);
    }
    assert.deepEqual(activeSpan.arrivalNeighborhood.neighborhood, neighborhood);
    assert.equal(activeSpan.arrivalNeighborhood.neighborhoodBasis, model.neighborhoodBasis);
  }

  if (focus) {
    if (focus.kind === "active-span") {
      assert.ok(focus.extent);
      assert.ok(Math.abs(focus.extent.start - range.start) <= EPSILON);
      assert.ok(Math.abs(focus.extent.end - range.end) <= EPSILON);
    } else {
      const section = resolveSection(guide, focus.sectionId);
      assert.ok(section);
      assert.ok(Math.abs(section.start - range.start) <= EPSILON);
      assert.ok(Math.abs(section.end - range.end) <= EPSILON);
    }
  }
}

function refineExpectation(session, direction) {
  const current = session.model.neighborhood.C;
  const target = getTargets(session.model.neighborhood)[direction];
  if (target === null) return null;
  return {
    relation: "draw",
    departure: current,
    target
  };
}

const RUNS = 100;
const OPERATIONS_PER_RUN = 2000;
for (let run = 0; run < RUNS; run += 1) {
  let session = createSession({ duration: 600, current: random() * 600 });
  for (let index = 0; index < OPERATIONS_PER_RUN; index += 1) {
    const before = session;
    const operation = Math.floor(random() * 16);
    const expectedRefine = operation === 0
      ? refineExpectation(session, "backward")
      : operation === 1
        ? refineExpectation(session, "forward")
        : null;
    let result;
    if (operation === 0) result = localRefine(session, "backward");
    else if (operation === 1) result = localRefine(session, "forward");
    else if (operation === 2) result = reopen(session);
    else if (operation === 3) result = step(session, "backward", 0.25 + random() * 120);
    else if (operation === 4) result = step(session, "forward", 0.25 + random() * 120);
    else if (operation === 5) {
      result = goTo(session, (random() * 1.6 - 0.3) * 600, {
        operator: "timeline",
        label: "Timeline Click"
      });
    } else if (operation === 6) result = switchActiveEnd(session);
    else if (operation === 7) result = undo(session);
    else if (operation === 8) {
      let start = random() * 600;
      let end = random() * 600;
      if (start > end) [start, end] = [end, start];
      result = setRange(session, start, end, session.model.neighborhood.C);
    } else if (operation === 9) {
      result = setStepDistance(session, {
        backward: 0.25 + random() * 299.75,
        forward: 0.25 + random() * 299.75,
        linked: false
      });
    } else if (operation === 10) {
      result = retainCurrentAsPin(session, random() < 0.4 ? `Pin ${Math.floor(random() * 20)}` : "");
    } else if (operation === 11) {
      result = retainSpanAsSection(session, `Section ${Math.floor(random() * 30)}`);
    } else if (operation === 12) {
      const sections = session.model.guide.sections;
      result = sections.length
        ? focusSection(session, sections[Math.floor(random() * sections.length)].id)
        : { session, changed: false };
    } else if (operation === 13) result = leaveSection(session);
    else if (operation === 14) result = focusWorkingSection(session);
    else {
      // Metamorphic check: Endpoint Transposition must remain an involution for
      // every randomly reached valid Interval, not only hand-authored examples.
      const once = switchActiveEnd(session);
      if (!once.changed) result = once;
      else {
        const twice = switchActiveEnd(once.session);
        assert.equal(twice.changed, true);
        assert.deepEqual(twice.session.model, session.model);
        result = once;
      }
    }

    if (operation === 7 && result.changed) {
      assert.deepEqual(result.session.model, before.history.at(-1).model);
    }
    if (expectedRefine && result.changed) {
      assert.equal(result.refineRelation, expectedRefine.relation);
      const resultingInterval = result.session.model.activeSpan;
      if (Math.abs(expectedRefine.departure - expectedRefine.target) <= EPSILON) {
        assert.equal(resultingInterval, null, "Endpoint coincidence must collapse the Active Span.");
      } else {
        assert.ok(resultingInterval);
        assert.ok(Math.abs(resultingInterval.departure - expectedRefine.departure) <= EPSILON);
        assert.ok(Math.abs(resultingInterval.arrival - expectedRefine.target) <= EPSILON);
      }
    }
    if (result.changed) {
      assert.notDeepEqual(result.session.model, before.model);
      if (operation !== 7) {
        assert.equal(result.session.history.length, Math.min(100, before.history.length + 1));
      }
      session = result.session;
    } else {
      assert.equal(result.session, before);
    }
    assertInvariant(session);
  }
}

// Local (Shift+) Refine is a complete approximate locator inside a fixed Range.
// Direction is chosen by the target's relation to Current; the target remains
// bracketed.
const TARGET_TRIALS = 10_000;
let maximumRefinements = 0;
for (let trial = 0; trial < TARGET_TRIALS; trial += 1) {
  const target = random() * 600;
  let locator = createSession({ duration: 600, current: random() * 600 });
  let count = 0;
  while (Math.abs(locator.model.neighborhood.C - target) > EPSILON) {
    const direction = target < locator.model.neighborhood.C ? "backward" : "forward";
    const result = localRefine(locator, direction);
    assert.equal(result.changed, true);
    locator = result.session;
    assert.ok(target >= locator.model.neighborhood.L - EPSILON);
    assert.ok(target <= locator.model.neighborhood.R + EPSILON);
    count += 1;
    assert.ok(count < 32);
  }
  maximumRefinements = Math.max(maximumRefinements, count);
}

// Conditional matrix composition for a desired Interval: reach A through any
// movement P→A, Switch to make A the anchor, then one variable-distance Step
// moves the active endpoint P→B while preserving A.
const INTERVAL_TRIALS = 10_000;
for (let trial = 0; trial < INTERVAL_TRIALS; trial += 1) {
  const P = random() * 600;
  let A = random() * 600;
  let B = random() * 600;
  if (Math.abs(A - P) <= EPSILON || Math.abs(B - P) <= EPSILON || Math.abs(A - B) <= EPSILON) {
    trial -= 1;
    continue;
  }
  let intervalSession = createSession({ duration: 600, current: P });
  intervalSession = goTo(intervalSession, A, { operator: "targetA" }).session;
  intervalSession = switchActiveEnd(intervalSession).session;
  const direction = B < P ? "backward" : "forward";
  intervalSession = step(intervalSession, direction, Math.abs(B - P)).session;
  assert.ok(Math.abs(intervalSession.model.activeSpan.departure - A) <= EPSILON);
  assert.ok(Math.abs(intervalSession.model.activeSpan.arrival - B) <= EPSILON);
  assert.ok(Math.abs(intervalSession.model.activeSpan.start - Math.min(A, B)) <= EPSILON);
  assert.ok(Math.abs(intervalSession.model.activeSpan.end - Math.max(A, B)) <= EPSILON);
}

console.log(JSON.stringify({
  randomizedOperations: RUNS * OPERATIONS_PER_RUN,
  targetTrials: TARGET_TRIALS,
  maximumRefinements,
  variableStepIntervalTrials: INTERVAL_TRIALS
}));
