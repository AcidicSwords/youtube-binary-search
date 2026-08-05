// Focus makes a relation become the world, so the map is drawn across it.
//
// The viewport is presentation only. These tests hold both halves of that:
// the focused extent occupies the whole drawn timeline whatever its Weight,
// and no operator arithmetic can observe the viewport at all.
import assert from "node:assert/strict";
import {
  createSession,
  goTo,
  step,
  saveExtentAsSection,
  setGuideSectionWeight,
  focusSection,
  leaveSection
} from "./session.js";
import { resolveSection } from "./guide.js";
import { createTimelineProjection, projectionForModel } from "./timeline-projection.js";

const DURATION = 100;

// A source with two disjoint 15 s Sections, one compressed and one expanded.
// Their factors cancel, so the whole map is 1x while its interior warps —
// the case that separates "overall stretch" from "local stretch".
function buildSession() {
  let session = createSession({ duration: DURATION });
  const sectionIds = [];
  for (const [start, end, weight] of [[20, 35, 0.5], [60, 75, 1.5]]) {
    session = goTo(session, start, { operator: "timeline" }).session;
    session = goTo(session, end, { operator: "timeline" }).session;
    session = saveExtentAsSection(session, { start, end }, { label: `S${start}` }).session;
    const id = session.model.guide.sections.at(-1).id;
    session = setGuideSectionWeight(session, id, weight).session;
    sectionIds.push(id);
  }
  return { session, sectionIds };
}

const { session, sectionIds } = buildSession();
const [compressedId, expandedId] = sectionIds;

// --- Disjoint opposing Weights cancel over the whole map ---------------------
{
  const projection = projectionForModel(session.model);
  assert.equal(
    Number(projection.timelineExtent.toFixed(6)),
    DURATION,
    "15 s at 0.5x and 15 s at 1.5x compose to no overall stretch."
  );
}

// --- Unfocused: the viewport is the whole source -----------------------------
{
  const projection = projectionForModel(session.model);
  assert.deepEqual(
    { start: projection.viewExtent.start, end: projection.viewExtent.end },
    { start: 0, end: DURATION },
    "Without Focus the drawn extent is the whole source."
  );
  assert.equal(projection.viewStart, 0);
  assert.equal(projection.viewSpan, projection.timelineExtent);
  // The unfocused fraction is exactly the historical coordinate/extent ratio.
  for (const source of [0, 25, 50, 99, DURATION]) {
    assert.equal(
      projection.coordinateToFraction(projection.sourceToTimeline(source)),
      projection.sourceToTimeline(source) / projection.timelineExtent,
      "An unfocused map must be drawn exactly as it always was."
    );
  }
}

// --- Focused: the focused Section fills the timeline at any Weight ------------
for (const [label, sectionId, weight] of [
  ["compressed 0.5x", compressedId, 0.5],
  ["expanded 1.5x", expandedId, 1.5]
]) {
  const focused = focusSection(session, sectionId).session;
  const section = resolveSection(focused.model.guide, sectionId);
  const projection = projectionForModel(focused.model);

  assert.deepEqual(
    focused.model.range,
    { start: section.start, end: section.end },
    `${label}: Focus installs the Section as Range.`
  );
  assert.deepEqual(
    { start: projection.viewExtent.start, end: projection.viewExtent.end },
    { start: section.start, end: section.end },
    `${label}: the drawn extent becomes the focused Section.`
  );
  assert.equal(
    projection.coordinateToFraction(projection.sourceToTimeline(section.start)),
    0,
    `${label}: its Start is drawn at the left edge.`
  );
  assert.equal(
    Number(
      projection.coordinateToFraction(projection.sourceToTimeline(section.end)).toFixed(9)
    ),
    1,
    `${label}: its End is drawn at the right edge.`
  );
  // The whole point: Weight cannot change how much timeline a focused Section
  // gets, because it now *is* the timeline.
  assert.equal(
    Number(projection.viewSpan.toFixed(6)),
    Number(((section.end - section.start) * weight).toFixed(6)),
    `${label}: the drawn span is still the weighted span in map units.`
  );

  // Drawing across the focused extent stays invertible edge to edge.
  for (let fraction = 0; fraction <= 1; fraction += 0.05) {
    const coordinate = projection.fractionToCoordinate(fraction);
    const source = projection.timelineToSource(coordinate);
    assert.ok(
      source >= section.start - 1e-6 && source <= section.end + 1e-6,
      `${label}: every drawn position addresses the focused extent.`
    );
    assert.ok(
      Math.abs(projection.coordinateToFraction(coordinate) - fraction) < 1e-9,
      `${label}: the drawn map inverts exactly.`
    );
  }
}

// --- Both focused Sections fill the same timeline ----------------------------
{
  const compressed = projectionForModel(focusSection(session, compressedId).session.model);
  const expanded = projectionForModel(focusSection(session, expandedId).session.model);
  for (const projection of [compressed, expanded]) {
    assert.equal(
      projection.coordinateToFraction(projection.viewStart),
      0,
      "Every focused Section starts at the left edge."
    );
    assert.equal(
      Number(projection.coordinateToFraction(projection.viewEnd).toFixed(9)),
      1,
      "Every focused Section ends at the right edge."
    );
  }
  assert.notEqual(
    compressed.viewSpan,
    expanded.viewSpan,
    "They still differ in map units — only the drawing is normalized."
  );
}

// --- Unfocus restores the whole map ------------------------------------------
{
  const focused = focusSection(session, expandedId).session;
  const restored = leaveSection(focused).session;
  const projection = projectionForModel(restored.model);
  assert.deepEqual(
    { start: projection.viewExtent.start, end: projection.viewExtent.end },
    { start: 0, end: DURATION },
    "Unfocus returns the drawn extent to the whole source."
  );
}

// --- The viewport is invisible to every semantic operation -------------------
{
  const focused = focusSection(session, expandedId).session;
  const section = resolveSection(focused.model.guide, expandedId);
  const withView = projectionForModel(focused.model);
  const withoutView = createTimelineProjection({
    duration: focused.model.duration,
    guide: focused.model.guide
  });

  assert.equal(withView.timelineExtent, withoutView.timelineExtent,
    "A viewport cannot change the size of the map.");
  for (let source = 0; source <= DURATION; source += 0.5) {
    assert.equal(
      withView.sourceToTimeline(source),
      withoutView.sourceToTimeline(source),
      "A viewport cannot move a source Address on the map."
    );
  }
  assert.equal(
    withView.stepTarget(section.start, 10, "forward", focused.model.range),
    withoutView.stepTarget(section.start, 10, "forward", focused.model.range),
    "Step covers the same map distance whether or not the map is focused."
  );

  // And the operator itself agrees: one Step of 10 map units inside a 1.5x
  // Section covers 10/1.5 source seconds, focused or not.
  const atStart = goTo(focused, section.start, { operator: "timeline" }).session;
  const stepped = step(atStart, "forward", 10).session.model.neighborhood.C;
  assert.equal(
    Number((stepped - atStart.model.neighborhood.C).toFixed(6)),
    Number((10 / 1.5).toFixed(6)),
    "Focus does not rescale Step: it rescales only what is drawn."
  );
}

console.log("Focus viewport tests passed: the focused extent fills the drawn timeline at every Weight, the drawing stays invertible edge to edge, Unfocus restores the whole map, and no operator can observe the viewport.");
