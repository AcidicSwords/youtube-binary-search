import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_GROUP_ID,
  createGuide,
  createSectionFromTimes,
  resolveSection
} from "./guide.js";
import { createTimelineProjection } from "./timeline-projection.js";
import {
  packTimelineSectionLanes,
  projectedSectionMidpointFraction,
  projectChapterExtent,
  partitionGuideSections
} from "./view.js";
import {
  FIELD_FRAME_ACTIVATION,
  operatorFrame,
  framesEqual,
  frameIdentity,
  createPanoramaFrameSequencer
} from "./panorama-frame.js";
import {
  createSession,
  focusSection,
  focusOwnsRangeBoundaries
} from "./session.js";

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`);
};

// Dense retained structure stays reachable: no lane number is folded onto an
// earlier lane, so overlap cannot make two controls occupy the same vertical
// acquisition surface.
{
  const entries = Array.from({ length: 20 }, (_, index) => ({
    id: `section-${index}`,
    projected: { start: 0, end: 100 }
  }));
  const packed = packTimelineSectionLanes(entries, {
    timelineExtent: 100,
    viewStart: 0,
    controlExtent: 4
  });
  assert.equal(packed.laneCount, 20);
  assert.deepEqual(packed.entries.map(entry => entry.lane),
    Array.from({ length: 20 }, (_, index) => index));
}

// A Section midpoint is a source Address projected into the Timeline, not the
// visual half of a wire whose interior may be deformed by another Section.
{
  const guide = createGuide("midpoint-video");
  const whole = createSectionFromTimes(guide, 0, 20, {
    label: "Whole",
    weighting: 1
  }).section;
  createSectionFromTimes(guide, 0, 10, {
    label: "Compressed first half",
    weighting: 0.5
  });
  const projection = createTimelineProjection({ duration: 20, guide });
  const resolved = resolveSection(guide, whole.id);
  close(projectedSectionMidpointFraction(resolved, projection), 1 / 3);
  assert.notEqual(projectedSectionMidpointFraction(resolved, projection), 0.5);
}

// A Chapter is offered as its complete extent and clips to Focus without becoming
// a control. Intersecting offers remain visible even when their start lies
// before the drawn window.
{
  const projection = createTimelineProjection({
    duration: 20,
    guide: createGuide("chapter-video"),
    view: { start: 5, end: 15 }
  });
  const clipped = projectChapterExtent({ time: 0, start: 0, end: 10 }, projection);
  assert.ok(clipped);
  close(clipped.left, 0);
  close(clipped.width, 0.5);
  assert.equal(projectChapterExtent({ time: 16, start: 16, end: 20 }, projection), null);
}

// Groups are a complete flat partition. Empty Groups remain represented, and
// every Section appears in exactly one block.
{
  const groups = [
    { id: DEFAULT_GROUP_ID, label: "Map", visible: true, weightsEnabled: true },
    { id: "group-empty", label: "Empty", visible: true, weightsEnabled: true },
    { id: "group-b", label: "B", visible: false, weightsEnabled: true }
  ];
  const sections = [
    { id: "a", groupId: DEFAULT_GROUP_ID },
    { id: "b", groupId: "group-b" },
    { id: "orphan", groupId: "missing" }
  ];
  const blocks = partitionGuideSections(groups, sections);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.find(block => block.group.id === "group-empty").sections, []);
  assert.deepEqual(blocks.find(block => block.group.id === "group-b").sections.map(s => s.id), ["b"]);
  assert.deepEqual(blocks.find(block => block.group.id === DEFAULT_GROUP_ID).sections.map(s => s.id),
    ["a", "orphan"]);
  assert.equal(blocks.flatMap(block => block.sections).length, sections.length);
}

// Focus is the sole owner of spatial Range boundaries. Every surface consumes
// this one predicate, so hidden controls and event guards cannot disagree.
{
  const guide = createGuide("focus-video");
  const section = createSectionFromTimes(guide, 10, 30, { label: "Focus" }).section;
  const session = createSession({ duration: 60, current: 20, guide });
  assert.equal(focusOwnsRangeBoundaries(session.model), false);
  const focused = focusSection(session, section.id);
  assert.equal(focused.changed, true);
  assert.equal(focusOwnsRangeBoundaries(focused.session.model), true);
}

// Geometry alone never grants a Panorama action. Activation is explicit and is
// part of Frame identity, making stale actionability impossible even when the
// visible Tail/Center/Lead addresses are unchanged.
{
  const range = { start: 0, end: 100 };
  const observed = operatorFrame({
    kind: "step",
    center: 50,
    backward: 40,
    forward: 60,
    range
  });
  const actionable = operatorFrame({
    kind: "step",
    center: 50,
    backward: 40,
    forward: 60,
    activation: { kind: FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS },
    range
  });
  assert.equal(observed.activation, null);
  assert.equal(actionable.activation.kind, FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS);
  assert.equal(framesEqual(observed, actionable), false);
  assert.notEqual(frameIdentity(observed), frameIdentity(actionable));

  const sequencer = createPanoramaFrameSequencer();
  const first = sequencer.resolve({
    kind: "step", center: 50, backward: 40, forward: 60, range
  });
  const second = sequencer.resolve({
    kind: "step", center: 50, backward: 40, forward: 60,
    activation: { kind: FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS },
    range
  });
  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  assert.equal(second.activation.kind, FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS);
}

// The interface names the usable surfaces. The deeper constraints remain in
// behavior and tests rather than being repeated as theory in the UI.
{
  const source = file => readFileSync(
    new URL(file, import.meta.url),
    "utf8"
  ).replace(/\r\n/g, "\n");
  const index = source("./index.html");
  const view = source("./view.js");
  const app = source("./app.js");
  const styles = source("./styles.css");
  assert.match(index, /aria-label="Panorama"/);
  assert.match(index, /<h2>Timeline<\/h2>/);
  assert.match(index, /Go to Timeline Midpoint/);
  assert.doesNotMatch(index, /Step Panorama|Temporal map/);
  assert.match(styles, /left: var\(--section-midpoint, 50%\)/);
  // The bounded, scrollable lane band must never reuse a lane by modulo; every
  // Section keeps its own reachable control even under dense overlap.
  assert.doesNotMatch(view, /lane % TIMELINE_SECTION_MAX_LANES/);
  assert.match(app, /elements\["full-video-range"\]\.addEventListener\("click", \(\) => \{\n  if \(rejectFocusedRangeBoundaryEdit\(\)\) return;/);
  assert.match(view, /elements\["full-video-range"\]\.disabled = interactionLocked\n      \|\| focusOwnsBoundaries/);
  assert.match(styles, /\.guide-group-block/);
}

console.log("System coherence tests passed: unlimited Section reachability, projected source midpoints, Chapter extents, flat Group blocks, Focus boundary ownership, explicit Panorama activation, and restrained user-facing names.");
