import assert from "node:assert/strict";
import {
  createRoot,
  getTargets,
  descend,
  intervalMidpoint,
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

console.log("All traversal tests passed.");
