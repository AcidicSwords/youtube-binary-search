import assert from "node:assert/strict";
import {
  EPSILON,
  createRoot,
  getTargets,
  descend,
  spanMidpoint,
  widenToRange,
  canWiden,
  pointAfterUndo,
  stepTarget,
  stepFrame,
  bindPassageStart,
  bindPassageEnd,
  getActionRanges,
  settlePlayback,
  logSpeed,
  chooseSupportedRate
} from "./traversal.js";
import {
  createStructure,
  createOrReuseMark,
  createSpan,
  resolveSpan,
  renameSpan,
  deleteSpan,
  previousMark,
  nextMark,
  deleteMarkSafely,
  setSpanAnchor,
  createSpanFromTimes,
  migrateSavedRegions,
  validateStructure
} from "./structure.js";
import { parseTimeValue, parseYouTubeUrl } from "./youtube.js";

const stripTransient = frame => {
  const { L, C, R, level, returnPoint } = frame;
  return returnPoint === undefined ? { L, C, R, level } : { L, C, R, level, returnPoint };
};

const root = createRoot(0, 60, 180);
assert.deepEqual(root, { L: 0, C: 60, R: 180, level: 0 });
assert.deepEqual(getTargets(root), { earlier: 30, later: 120 });
assert.deepEqual(stripTransient(descend(root, "earlier", 30)), { L: 0, C: 30, R: 60, level: 1 });
assert.deepEqual(stripTransient(descend(root, "later", 120)), { L: 60, C: 120, R: 180, level: 1 });

const custom = { L: 90, C: 150, R: 180, level: 3 };
assert.deepEqual(getTargets(custom, 120), { earlier: 120, later: 165 });
assert.deepEqual(descend(custom, "earlier", 120), { L: 90, C: 120, R: 150, level: 4 });
assert.deepEqual(
  descend({ L: 90, C: 120, R: 150, level: 2 }, "earlier", 40, { start: 0, end: 180 }),
  { L: 0, C: 40, R: 120, level: 3 }
);
assert.deepEqual(
  descend({ L: 30, C: 60, R: 90, level: 2 }, "later", 150, { start: 0, end: 180 }),
  { L: 60, C: 150, R: 180, level: 3 }
);

assert.deepEqual(
  settlePlayback({ L: 0, C: 300, R: 600, level: 2 }, 300, 350),
  { L: 300, C: 350, R: 600, level: 2 }
);
assert.deepEqual(widenToRange(135, { start: 0, end: 180 }), { L: 0, C: 135, R: 180, level: 0 });
assert.equal(canWiden({ L: 90, C: 135, R: 180, level: 2 }, { start: 0, end: 180 }), true);
assert.equal(canWiden({ L: 0, C: 135, R: 180, level: 0 }, { start: 0, end: 180 }), false);
assert.throws(() => widenToRange(90, null), /Range/);

const actionRanges = getActionRanges(
  { L: 60, C: 120, R: 180, level: 1 },
  { start: 0, end: 240 },
  null,
  { L: 0, C: 60, R: 180, level: 0 },
  { start: 60, end: 120, operator: "narrowLater", medium: "seek" },
  120,
  10
);
assert.deepEqual(actionRanges.earlier, { start: 60, end: 120 });
assert.deepEqual(actionRanges.later, { start: 120, end: 180 });
assert.deepEqual(actionRanges.stepEarlier, { start: 110, end: 120, destination: 110 });
assert.deepEqual(actionRanges.stepLater, { start: 120, end: 130, destination: 130 });
assert.deepEqual(actionRanges.repeat, { start: 60, end: 120 });
assert.deepEqual(actionRanges.widen, {
  start: 0,
  end: 240,
  current: 120,
  earlier: 60,
  later: 180
});

const pointHistory = [
  { L: 0, C: 90, R: 180, level: 0 },
  { L: 90, C: 150, R: 180, level: 1, returnPoint: 150 },
  { L: 90, C: 120, R: 150, level: 2, returnPoint: 120 }
];
assert.equal(pointAfterUndo(pointHistory, 1), 120);
assert.equal(pointAfterUndo(pointHistory, 0), 150);

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
assert.deepEqual(bindPassageStart({ L: 30, C: 60, R: 90, level: 2 }, 20), { L: 20, C: 60, R: 90, level: 2 });
assert.deepEqual(bindPassageEnd({ L: 30, C: 60, R: 90, level: 2 }, 100), { L: 30, C: 60, R: 100, level: 2 });

assert.equal(spanMidpoint(120, 180), 150);
assert.equal(logSpeed(8, 0), 8);
assert.equal(logSpeed(8, 1), 1);
assert.equal(chooseSupportedRate([0.25, 0.5, 1, 1.5, 2], 1.8), 1.5);
assert.equal(chooseSupportedRate([1], 8), 1);

const structure = createStructure("video-1");
const markA = createOrReuseMark(structure, 10, { label: "Start" }).mark;
const markB = createOrReuseMark(structure, 20, { label: "End" }).mark;
const reused = createOrReuseMark(structure, 10 + EPSILON / 2, { label: "Start renamed" });
assert.equal(reused.created, false);
assert.equal(reused.mark.id, markA.id);
assert.equal(structure.marks.length, 2);

const span = createSpan(structure, markA.id, markB.id, { label: "Procedure" });
const resolved = resolveSpan(structure, span.id);
assert.equal(resolved.start, 10);
assert.equal(resolved.end, 20);
assert.equal(resolved.midpoint, 15);
assert.equal(renameSpan(structure, span.id, "Renamed Procedure").label, "Renamed Procedure");
assert.equal(resolveSpan(structure, span.id).label, "Renamed Procedure");
assert.equal(previousMark(structure, 19, { start: 0, end: 30 }).id, markA.id);
assert.equal(nextMark(structure, 11, { start: 0, end: 30 }).id, markB.id);

const middle = createOrReuseMark(structure, 15, { label: "Anchor" }).mark;
setSpanAnchor(structure, span.id, middle.id);
assert.equal(resolveSpan(structure, span.id).anchor, 15);
assert.throws(() => {
  const outside = createOrReuseMark(structure, 25).mark;
  setSpanAnchor(structure, span.id, outside.id);
}, /inside/);

assert.deepEqual(deleteMarkSafely(structure, markA.id).anonymized, true);
assert.equal(structure.marks.find(mark => mark.id === markA.id).label, "");

const generated = createSpanFromTimes(structure, 30, 40, { label: "Generated", provenance: "test" });
assert.equal(resolveSpan(structure, generated.id).start, 30);
const generatedStartId = generated.startMarkId;
const generatedEndId = generated.endMarkId;
assert.equal(deleteSpan(structure, generated.id), true);
assert.equal(resolveSpan(structure, generated.id), null);
assert.equal(deleteSpan(structure, generated.id), false);
assert.ok(structure.marks.some(mark => mark.id === generatedStartId));
assert.ok(structure.marks.some(mark => mark.id === generatedEndId));
assert.equal(validateStructure(structure, 100), true);

const migrated = migrateSavedRegions([
  { id: "one", videoId: "video-1", label: "First", start: 0, end: 10, createdAt: 1 },
  { id: "two", videoId: "video-1", label: "Second", start: 10, end: 20, createdAt: 2 }
], "video-1");
assert.equal(migrated.spans.length, 2);
assert.equal(migrated.marks.length, 3);
assert.equal(validateStructure(migrated, 20), true);

assert.equal(parseTimeValue("1h2m3s"), 3723);
assert.equal(parseTimeValue("90"), 90);
assert.equal(parseTimeValue("nonsense"), 0);
assert.deepEqual(
  parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"),
  { videoId: "dQw4w9WgXcQ", startSeconds: 90 }
);
assert.equal(parseYouTubeUrl("javascript:alert(1)"), null);

console.log("All logic tests passed.");
