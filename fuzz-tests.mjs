import assert from "node:assert/strict";
import {
  createSession,
  refine,
  reopen,
  step,
  goTo,
  switchEndpoint,
  setRange,
  undo,
  pinCurrent,
  saveIntervalAsSection,
  focusSection,
  focusWorkingSection,
  leaveSection
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
  const { duration, range, resolution, resolutionBasis, interval, guide, focus } = model;
  assert.ok(Number.isFinite(duration) && duration >= 0);
  assert.ok(range.start >= -EPSILON);
  assert.ok(range.end <= duration + EPSILON);
  assert.ok(range.start <= range.end);
  assert.ok(resolution.L >= range.start - EPSILON);
  assert.ok(resolution.R <= range.end + EPSILON);
  assert.ok(resolution.L <= resolution.C && resolution.C <= resolution.R);
  assert.ok(Number.isInteger(resolution.level) && resolution.level >= 0);
  assert.ok(["range", "movement"].includes(resolutionBasis));
  assert.ok(history.length <= 100);
  assert.equal(validateGuide(guide, duration), true);

  if (interval) {
    assert.ok(interval.start >= -EPSILON);
    assert.ok(interval.end <= duration + EPSILON);
    assert.ok(interval.start < interval.end);
    assert.ok(interval.start >= range.start - EPSILON);
    assert.ok(interval.end <= range.end + EPSILON);
    assert.ok(interval.start >= resolution.L - EPSILON);
    assert.ok(interval.end <= resolution.R + EPSILON);
    assert.ok(Math.abs(interval.arrival - resolution.C) <= EPSILON, "Interval arrival must remain the active endpoint at Current.");
    assert.ok(Math.abs(interval.start - Math.min(interval.departure, interval.arrival)) <= EPSILON);
    assert.ok(Math.abs(interval.end - Math.max(interval.departure, interval.arrival)) <= EPSILON);
    for (const [role, address] of [
      ["departureFrame", interval.departure],
      ["arrivalFrame", interval.arrival]
    ]) {
      const frame = interval[role];
      assert.ok(frame?.resolution, `Interval ${role} must exist.`);
      assert.ok(["range", "movement"].includes(frame.resolutionBasis));
      assert.ok(frame.resolution.L >= range.start - EPSILON, `${role} begins outside Range.`);
      assert.ok(frame.resolution.R <= range.end + EPSILON, `${role} ends outside Range.`);
      assert.ok(frame.resolution.L <= interval.start + EPSILON, `${role} does not contain the Interval start.`);
      assert.ok(frame.resolution.R >= interval.end - EPSILON, `${role} does not contain the Interval end.`);
      assert.ok(Math.abs(frame.resolution.C - address) <= EPSILON);
    }
    assert.deepEqual(interval.arrivalFrame.resolution, resolution, "The active endpoint frame must match current Resolution.");
    assert.equal(interval.arrivalFrame.resolutionBasis, resolutionBasis);
  }

  if (focus) {
    if (focus.kind === "working-section") {
      assert.ok(focus.extent, "A Working Interval focus must retain its projected Extent.");
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
      result = setRange(session, start, end, session.model.resolution.C);
    } else if (operation === 7) result = undo(session);
    else if (operation === 8) result = pinCurrent(session, random() < 0.2 ? "Pinned" : "");
    else if (operation === 9) result = saveIntervalAsSection(session, `Section ${Math.floor(random() * 20)}`);
    else if (operation === 10) {
      const sections = session.model.guide.sections;
      result = sections.length
        ? focusSection(session, sections[Math.floor(random() * sections.length)].id)
        : { session, changed: false };
    } else if (operation === 11) result = leaveSection(session);
    else if (operation === 12) result = switchEndpoint(session);
    else result = focusWorkingSection(session);

    if (result?.session) session = result.session;
    assertSessionInvariant(session);
  }
}

console.log(`Invariant fuzz passed: ${RUNS * OPERATIONS_PER_RUN} deterministic semantic operations.`);
