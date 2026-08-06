import assert from "node:assert/strict";
import {
  createSession,
  refine,
  reopen,
  step,
  goTo,
  switchActiveEnd,
  setRange,
  undo,
  retainCurrentAsPin,
  retainActiveSpanAsSection,
  focusSection,
  focusActiveSpan,
  unfocus
} from "./session.js";
import { validateGuide, resolveSection } from "./guide.js";
import { EPSILON } from "./range-geometry.js";

let seed = 0x05eeda11;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
}

function assertSessionInvariant(session) {
  const { model, history } = session;
  const { duration, range, neighborhood, neighborhoodBasis, activeSpan, guide, focus } = model;
  assert.ok(Number.isFinite(duration) && duration >= 0);
  assert.ok(range.start >= -EPSILON);
  assert.ok(range.end <= duration + EPSILON);
  assert.ok(range.start <= range.end);
  assert.ok(neighborhood.L >= range.start - EPSILON);
  assert.ok(neighborhood.R <= range.end + EPSILON);
  assert.ok(neighborhood.L <= neighborhood.C && neighborhood.C <= neighborhood.R);
  assert.ok(Number.isInteger(neighborhood.level) && neighborhood.level >= 0);
  assert.ok(["range", "movement"].includes(neighborhoodBasis));
  assert.ok(history.length <= 100);
  assert.equal(validateGuide(guide, duration), true);

  if (activeSpan) {
    assert.ok(activeSpan.start >= -EPSILON);
    assert.ok(activeSpan.end <= duration + EPSILON);
    assert.ok(activeSpan.start < activeSpan.end);
    assert.ok(activeSpan.start >= range.start - EPSILON);
    assert.ok(activeSpan.end <= range.end + EPSILON);
    assert.ok(activeSpan.start >= neighborhood.L - EPSILON);
    assert.ok(activeSpan.end <= neighborhood.R + EPSILON);
    assert.ok(Math.abs(activeSpan.arrival - neighborhood.C) <= EPSILON, "Interval arrival must remain the active endpoint at Current.");
    assert.ok(Math.abs(activeSpan.start - Math.min(activeSpan.departure, activeSpan.arrival)) <= EPSILON);
    assert.ok(Math.abs(activeSpan.end - Math.max(activeSpan.departure, activeSpan.arrival)) <= EPSILON);
    for (const [role, address] of [
      ["departureNeighborhood", activeSpan.departure],
      ["arrivalNeighborhood", activeSpan.arrival]
    ]) {
      const frame = activeSpan[role];
      assert.ok(frame?.neighborhood, `Interval ${role} must exist.`);
      assert.ok(["range", "movement"].includes(frame.neighborhoodBasis));
      assert.ok(frame.neighborhood.L >= range.start - EPSILON, `${role} begins outside Range.`);
      assert.ok(frame.neighborhood.R <= range.end + EPSILON, `${role} ends outside Range.`);
      assert.ok(frame.neighborhood.L <= activeSpan.start + EPSILON, `${role} does not contain the Interval start.`);
      assert.ok(frame.neighborhood.R >= activeSpan.end - EPSILON, `${role} does not contain the Interval end.`);
      assert.ok(Math.abs(frame.neighborhood.C - address) <= EPSILON);
    }
    assert.deepEqual(activeSpan.arrivalNeighborhood.neighborhood, neighborhood, "The active endpoint frame must match current Current Neighborhood.");
    assert.equal(activeSpan.arrivalNeighborhood.neighborhoodBasis, neighborhoodBasis);
  }

  if (focus) {
    if (focus.kind === "active-span") {
      assert.ok(focus.extent, "A Active Span focus must retain its projected Extent.");
      assert.ok(Math.abs(focus.extent.start - range.start) <= EPSILON);
      assert.ok(Math.abs(focus.extent.end - range.end) <= EPSILON);
    } else {
      const section = resolveSection(guide, focus.sectionId);
      assert.ok(section, "A focused retained Section must still exist in Guide.");
      assert.ok(Math.abs(section.start - range.start) <= EPSILON);
      assert.ok(Math.abs(section.end - range.end) <= EPSILON);
    }
  }
}

const RUNS = 25;
const OPERATIONS_PER_RUN = 1000;
for (let run = 0; run < RUNS; run += 1) {
  let session = createSession({ duration: 480, current: random() * 480 });
  for (let index = 0; index < OPERATIONS_PER_RUN; index += 1) {
    const operation = Math.floor(random() * 14);
    let result;

    if (operation === 0) result = refine(session, "backward");
    else if (operation === 1) result = refine(session, "forward");
    else if (operation === 2) result = reopen(session);
    else if (operation === 3) result = step(session, "backward", 0.25 + random() * 90);
    else if (operation === 4) result = step(session, "forward", 0.25 + random() * 90);
    else if (operation === 5) {
      result = goTo(session, (random() * 1.5 - 0.25) * 480, {
        operator: "timeline",
        label: "Timeline Click"
      });
    } else if (operation === 6) {
      let start = random() * 480;
      let end = random() * 480;
      if (start > end) [start, end] = [end, start];
      result = setRange(session, start, end, session.model.neighborhood.C);
    } else if (operation === 7) result = undo(session);
    else if (operation === 8) result = retainCurrentAsPin(session, random() < 0.2 ? "Pinned" : "");
    else if (operation === 9) result = retainActiveSpanAsSection(session, `Section ${Math.floor(random() * 20)}`);
    else if (operation === 10) {
      const sections = session.model.guide.sections;
      result = sections.length
        ? focusSection(session, sections[Math.floor(random() * sections.length)].id)
        : { session, changed: false };
    } else if (operation === 11) result = unfocus(session);
    else if (operation === 12) result = switchActiveEnd(session);
    else result = focusActiveSpan(session);

    if (result?.session) session = result.session;
    assertSessionInvariant(session);
  }
}

console.log(`Invariant fuzz passed: ${RUNS * OPERATIONS_PER_RUN} deterministic semantic operations.`);
