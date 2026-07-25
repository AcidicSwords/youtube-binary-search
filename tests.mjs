import assert from "node:assert/strict";
import {
  createRoot,
  getTargets,
  descend,
  intervalMidpoint,
  widenToRange,
  pointAfterUndo,
  getActionRanges,
  settlePlayback,
  logSpeed,
  chooseSupportedRate
} from "./traversal.js";
import { parseTimeValue, parseYouTubeUrl } from "./youtube.js";

const root = createRoot(0, 60, 180);
assert.deepEqual(root, { L: 0, C: 60, R: 180 });

assert.deepEqual(getTargets(root), { earlier: 30, later: 120 });
assert.deepEqual(descend(root, "earlier", 30), { L: 0, C: 30, R: 60 });
assert.deepEqual(descend(root, "later", 120), { L: 60, C: 120, R: 180 });

const custom = { L: 90, C: 150, R: 180 };
assert.deepEqual(getTargets(custom, 120), { earlier: 120, later: 165 });
assert.deepEqual(descend(custom, "earlier", 120), { L: 90, C: 120, R: 150 });
assert.deepEqual(getTargets({ L: 90, C: 120, R: 150 }), { earlier: 105, later: 135 });
assert.deepEqual(
  getTargets({ L: 90, C: 120, R: 150 }, 40, { start: 0, end: 180 }),
  { earlier: 40, later: 135 }
);
assert.deepEqual(
  getTargets({ L: 90, C: 120, R: 150 }, 0, { start: 0, end: 180 }),
  { earlier: 0, later: 135 }
);
assert.deepEqual(
  getTargets({ L: 90, C: 120, R: 150 }, 180, { start: 0, end: 180 }),
  { earlier: 105, later: 180 }
);
assert.deepEqual(
  descend({ L: 90, C: 120, R: 150 }, "earlier", 40, { start: 0, end: 180 }),
  { L: 0, C: 40, R: 120 }
);
assert.deepEqual(
  descend({ L: 30, C: 60, R: 90 }, "later", 150, { start: 0, end: 180 }),
  { L: 60, C: 150, R: 180 }
);
assert.deepEqual(
  settlePlayback({ L: 0, C: 300, R: 600 }, 300, 350),
  { L: 300, C: 350, R: 600 }
);
assert.deepEqual(
  getTargets(settlePlayback({ L: 0, C: 300, R: 600 }, 300, 350)),
  { earlier: 325, later: 475 }
);
assert.deepEqual(
  widenToRange(135, { start: 0, end: 180 }),
  { L: 0, C: 135, R: 180 }
);
assert.deepEqual(getTargets(widenToRange(135, { start: 0, end: 180 })), {
  earlier: 67.5,
  later: 157.5
});
assert.deepEqual(
  widenToRange(240, { start: 60, end: 180 }),
  { L: 60, C: 180, R: 180 }
);
assert.throws(() => widenToRange(90, null), /outer Range/);

const actionRanges = getActionRanges(
  { L: 60, C: 120, R: 180 },
  { start: 0, end: 240 },
  null,
  { L: 0, C: 60, R: 180 },
  { start: 60, end: 120 }
);
assert.deepEqual(actionRanges.earlier, { start: 60, end: 120 });
assert.deepEqual(actionRanges.later, { start: 120, end: 180 });
assert.deepEqual(actionRanges.undo, {
  start: 0,
  end: 180,
  current: 60,
  earlier: 30,
  later: 120
});
assert.deepEqual(actionRanges.widen, {
  start: 0,
  end: 240,
  current: 120,
  earlier: 60,
  later: 180
});
assert.deepEqual(actionRanges.skim, { start: 120, end: 150 });
assert.deepEqual(actionRanges.repeat, { start: 60, end: 120 });
const threeMinuteResolution = getActionRanges(
  { L: 90, C: 135, R: 180 },
  { start: 0, end: 180 },
  null,
  { L: 0, C: 90, R: 180 }
);
assert.deepEqual(threeMinuteResolution.undo, {
  start: 0,
  end: 180,
  current: 90,
  earlier: 45,
  later: 135
});
assert.deepEqual(threeMinuteResolution.widen, {
  start: 0,
  end: 180,
  current: 135,
  earlier: 67.5,
  later: 157.5
});
assert.deepEqual(
  getActionRanges(
    { L: 90, C: 150, R: 180, returnPoint: 150 },
    { start: 0, end: 180 },
    null,
    { L: 0, C: 90, R: 180 }
  ).undo,
  {
    start: 0,
    end: 180,
    current: 90,
    earlier: 45,
    later: 150,
    point: 150
  }
);
assert.deepEqual(
  getActionRanges(
    { L: 90, C: 135, R: 180 },
    { start: 0, end: 180 },
    30,
    { L: 0, C: 90, R: 180 }
  ).widen,
  {
    start: 0,
    end: 180,
    current: 135,
    earlier: 30,
    later: 157.5,
    point: 30
  }
);
assert.deepEqual(
  getActionRanges(
    { L: 90, C: 135, R: 180 },
    { start: 0, end: 180 }
  ).widen,
  {
    start: 0,
    end: 180,
    current: 135,
    earlier: 67.5,
    later: 157.5
  }
);
assert.deepEqual(
  getActionRanges(
    { L: 60, C: 120, R: 180 },
    { start: 0, end: 240 },
    30
  ).earlier,
  { start: 0, end: 120 }
);
assert.equal(
  getActionRanges(
    { L: 0, C: 90, R: 180 },
    { start: 0, end: 180 }
  ).widen,
  null
);
assert.deepEqual(
  getActionRanges(
    { L: 135, C: 157.5, R: 180 },
    { start: 0, end: 180 },
    null,
    { L: 90, C: 135, R: 180 }
  ).widen,
  {
    start: 0,
    end: 180,
    current: 157.5,
    earlier: 78.75,
    later: 168.75
  }
);

const pointHistory = [
  { L: 0, C: 90, R: 180 },
  { L: 90, C: 150, R: 180, returnPoint: 150 },
  { L: 90, C: 120, R: 150, returnPoint: 120 }
];
assert.equal(pointAfterUndo(pointHistory, 1), 120);
assert.equal(pointAfterUndo(pointHistory, 0), 150);
assert.equal(pointAfterUndo(pointHistory.slice(0, 2), 0, 30), 150);
assert.equal(
  pointAfterUndo(
    [
      { L: 0, C: 90, R: 180 },
      { L: 90, C: 135, R: 180 }
    ],
    0,
    30
  ),
  30
);

assert.equal(intervalMidpoint(120, 180), 150);
assert.equal(logSpeed(8, 0), 8);
assert.equal(logSpeed(8, 1), 1);
assert.equal(chooseSupportedRate([0.25, 0.5, 1, 1.5, 2], 1.8), 1.5);
assert.equal(chooseSupportedRate([1], 8), 1);

assert.equal(parseTimeValue("1h2m3s"), 3723);
assert.equal(parseTimeValue("90"), 90);
assert.equal(parseTimeValue("nonsense"), 0);

assert.deepEqual(
  parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"),
  { videoId: "dQw4w9WgXcQ", startSeconds: 90 }
);
assert.deepEqual(
  parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?start=42"),
  { videoId: "dQw4w9WgXcQ", startSeconds: 42 }
);
assert.deepEqual(
  parseYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
  { videoId: "dQw4w9WgXcQ", startSeconds: 0 }
);
assert.equal(parseYouTubeUrl("https://notyoutube.com/watch?v=dQw4w9WgXcQ"), null);
assert.equal(parseYouTubeUrl("javascript:alert(1)"), null);

console.log("All logic tests passed.");
