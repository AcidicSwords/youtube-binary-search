import assert from "node:assert/strict";
import {
  EPSILON,
  createRoot,
  getTargets,
  descend,
  spanMidpoint,
  widenToRange,
  canWiden,
  stepTarget,
  stepFrame,
  getActionRanges,
  settlePlayback,
  logSpeed,
  chooseSupportedRate
} from "./traversal.js";
import {
  createGuide,
  createOrReuseMark,
  renameMark,
  getMark,
  sectionsForMark,
  visibleMarks,
  deleteMark,
  createSection,
  createSectionFromTimes,
  resolveSection,
  renameSection,
  deleteSection,
  previousMark,
  nextMark,
  sortedResolvedSections,
  clusterMarksByPixels,
  migrateStructureV2,
  migrateSavedRegions,
  validateGuide
} from "./structure.js";
import { parseTimeValue, parseYouTubeUrl } from "./youtube.js";

const root = createRoot(0, 60, 180);
assert.deepEqual(root, { L: 0, C: 60, R: 180, level: 0 });
assert.deepEqual(getTargets(root), { earlier: 30, later: 120 });
assert.deepEqual(descend(root, "earlier", 30), { L: 0, C: 30, R: 60, level: 1 });
assert.deepEqual(descend(root, "later", 120), { L: 60, C: 120, R: 180, level: 1 });

assert.deepEqual(
  descend({ L: 90, C: 120, R: 150, level: 2 }, "earlier", 40, { start: 0, end: 180 }),
  { L: 0, C: 40, R: 120, level: 3 }
);
assert.deepEqual(
  descend({ L: 30, C: 60, R: 90, level: 2 }, "later", 150, { start: 0, end: 180 }),
  { L: 60, C: 150, R: 180, level: 3 }
);
assert.throws(() => descend(root, "later", 30), /after Current/);

assert.deepEqual(widenToRange(135, { start: 0, end: 180 }), { L: 0, C: 135, R: 180, level: 0 });
assert.equal(canWiden({ L: 90, C: 135, R: 180, level: 2 }, { start: 0, end: 180 }), true);
assert.equal(canWiden({ L: 0, C: 135, R: 180, level: 0 }, { start: 0, end: 180 }), false);
assert.throws(() => widenToRange(90, null), /Range/);

assert.equal(stepTarget(60, 10, "earlier", { start: 0, end: 180 }), 50);
assert.equal(stepTarget(175, 10, "later", { start: 0, end: 180 }), 180);
assert.deepEqual(
  stepFrame({ L: 30, C: 60, R: 90, level: 2 }, 70, { start: 0, end: 180 }),
  { L: 30, C: 70, R: 90, level: 2 }
);
assert.deepEqual(
  stepFrame({ L: 30, C: 60, R: 90, level: 2 }, 100, { start: 0, end: 180 }),
  { L: 0, C: 100, R: 180, level: 0 }
);

const actionRanges = getActionRanges(
  { L: 60, C: 120, R: 180, level: 1 },
  { start: 0, end: 240 },
  { start: 60, end: 120, operator: "narrowLater", medium: "seek" },
  120,
  10
);
assert.deepEqual(actionRanges.earlier, { start: 60, end: 120 });
assert.deepEqual(actionRanges.later, { start: 120, end: 180 });
assert.deepEqual(actionRanges.stepEarlier, { start: 110, end: 120, destination: 110 });
assert.deepEqual(actionRanges.stepLater, { start: 120, end: 130, destination: 130 });
assert.deepEqual(actionRanges.repeat, { start: 60, end: 120 });
assert.deepEqual(actionRanges.widen, { start: 0, end: 240, current: 120 });

assert.deepEqual(
  settlePlayback({ L: 0, C: 300, R: 600, level: 2 }, 300, 350),
  { L: 300, C: 350, R: 600, level: 2 }
);
assert.equal(spanMidpoint(120, 180), 150);
assert.equal(logSpeed(8, 0), 8);
assert.equal(logSpeed(8, 1), 1);
assert.equal(chooseSupportedRate([0.25, 0.5, 1, 1.5, 2], 1.8), 1.5);

const guide = createGuide("video-1");
const markA = createOrReuseMark(guide, 10, { label: "Start", explicit: true }).mark;
const markB = createOrReuseMark(guide, 20, { label: "End", explicit: true }).mark;
const reused = createOrReuseMark(guide, 10 + EPSILON / 2, { label: "Start renamed", explicit: true });
assert.equal(reused.created, false);
assert.equal(reused.mark.id, markA.id);
assert.equal(guide.marks.length, 2);
assert.equal(renameMark(guide, markB.id, "Finish").label, "Finish");

const section = createSection(guide, markA.id, markB.id, { label: "Procedure" });
const resolved = resolveSection(guide, section.id);
assert.equal(resolved.start, 10);
assert.equal(resolved.end, 20);
assert.equal(resolved.midpoint, 15);
assert.equal(sectionsForMark(guide, markA.id).length, 1);
assert.equal(renameSection(guide, section.id, "Renamed Procedure").label, "Renamed Procedure");
assert.equal(previousMark(guide, 19, { start: 0, end: 30 }).id, markA.id);
assert.equal(nextMark(guide, 11, { start: 0, end: 30 }).id, markB.id);
assert.equal(deleteMark(guide, markA.id).deleted, false);
assert.equal(deleteMark(guide, markA.id).references, 1);

const generated = createSectionFromTimes(guide, 30, 40, { label: "Generated", provenance: "test" });
const generatedResolved = resolveSection(guide, generated.id);
assert.equal(generatedResolved.start, 30);
assert.equal(generatedResolved.end, 40);
assert.equal(visibleMarks(guide).some(mark => mark.id === generated.startMarkId), false);
assert.equal(deleteSection(guide, generated.id), true);
assert.equal(getMark(guide, generated.startMarkId), null);
assert.equal(getMark(guide, generated.endMarkId), null);
assert.equal(deleteSection(guide, generated.id), false);
assert.equal(validateGuide(guide, 100), true);

const nestedStart = createOrReuseMark(guide, 10, { explicit: true }).mark;
const nestedEnd = createOrReuseMark(guide, 25, { explicit: true }).mark;
createSection(guide, nestedStart.id, nestedEnd.id, { label: "Longer" });
const sorted = sortedResolvedSections(guide);
assert.equal(sorted[0].label, "Longer");
assert.equal(sorted[1].label, "Renamed Procedure");

const clustered = clusterMarksByPixels([
  { id: "a", t: 10, createdAt: 1 },
  { id: "b", t: 10.5, createdAt: 2 },
  { id: "c", t: 80, createdAt: 3 }
], 100, 1000, 18);
assert.equal(clustered.length, 2);
assert.equal(clustered[0].marks.length, 2);
assert.equal(clustered[1].marks.length, 1);

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

const migratedV1 = migrateSavedRegions([
  { id: "one", label: "First", start: 0, end: 10, createdAt: 1 },
  { id: "two", label: "Second", start: 10, end: 20, createdAt: 2 }
], "video-1");
assert.equal(migratedV1.sections.length, 2);
assert.equal(migratedV1.marks.length, 3);
assert.equal(validateGuide(migratedV1, 20), true);

assert.equal(parseTimeValue("1h2m3s"), 3723);
assert.equal(parseTimeValue("90"), 90);
assert.equal(parseTimeValue("nonsense"), 0);
assert.deepEqual(
  parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"),
  { videoId: "dQw4w9WgXcQ", startSeconds: 90 }
);
assert.equal(parseYouTubeUrl("javascript:alert(1)"), null);

console.log("All logic tests passed.");
