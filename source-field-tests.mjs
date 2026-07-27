import assert from "node:assert/strict";
import {
  SOURCE_KIND,
  createSourceField,
  normalizeSourceField,
  parseTimestamp,
  parseDescriptionChapters,
  parseTimestampedText,
  recordsWithin,
  searchSourceRecords,
  potentialExtent
} from "./source-field.js";

assert.equal(parseTimestamp("1:02"), 62);
assert.equal(parseTimestamp("1:02:03.5"), 3723.5);
assert.equal(parseTimestamp("bad"), null);
assert.equal(parseTimestamp("1:99"), null);
assert.equal(parseTimestamp("1:60:00"), null);

const chapters = parseDescriptionChapters(`
0:00 Introduction
1:30 Demonstration
3:00 Conclusion
`, 240);
assert.deepEqual(chapters.map(({ start, end, text }) => ({ start, end, text })), [
  { start: 0, end: 90, text: "Introduction" },
  { start: 90, end: 180, text: "Demonstration" },
  { start: 180, end: 240, text: "Conclusion" }
]);
assert.ok(chapters.every(record => record.kind === SOURCE_KIND.CHAPTER));
assert.deepEqual(parseDescriptionChapters("0:00 One\n0:05 Two\n0:20 Three", 40), []);
assert.deepEqual(parseDescriptionChapters("0:10 One\n0:30 Two\n0:50 Three", 70), []);
assert.deepEqual(parseDescriptionChapters("0:00 One\n0:30 Two\n0:20 Three", 70), []);

const transcript = parseTimestampedText(`
0:05 First statement
0:08 Second statement
0:12 Final statement
`, { duration: 20, language: "en" });
assert.equal(transcript.length, 3);
assert.deepEqual(transcript.map(record => [record.start, record.end]), [[5, 8], [8, 12], [12, 20]]);

const field = normalizeSourceField([...chapters, ...transcript], { videoId: "abcdefghijk", duration: 240 });
assert.equal(recordsWithin(field, { start: 85, end: 95 }).length, 2);
assert.equal(searchSourceRecords(field, "second").length, 1);
assert.deepEqual(potentialExtent(transcript[0]), {
  start: 5,
  end: 8,
  label: "First statement",
  sourceRef: transcript[0].id
});
const malformedField = normalizeSourceField([
  { start: "bad", end: 2, text: "Bad" },
  { start: -5, end: 2, text: "Clamped" },
  { start: 7, end: 3, text: "Collapsed", kind: "unknown", id: "duplicate-id" },
  { start: 8, end: 9, text: "Distinct", id: "duplicate-id" },
  { start: 12, end: 13, text: "Beyond duration" },
  { start: 7, end: 3, text: "Collapsed", kind: "unknown", id: "second-exact-id" },
  { start: 9, end: 10, text: "" }
], { duration: 10 });
assert.deepEqual(malformedField.records.map(record => [record.start, record.end, record.text]), [
  [0, 2, "Clamped"],
  [7, 7, "Collapsed"],
  [8, 9, "Distinct"]
]);
assert.equal(malformedField.records[1].kind, SOURCE_KIND.TRANSCRIPT);
assert.equal(malformedField.records[2].id, "duplicate-id:2");
assert.deepEqual(createSourceField("abcdefghijk"), { version: 1, videoId: "abcdefghijk", records: [] });

console.log("Source-field tests passed: chapters and transcripts remain normalized potential temporal records.");
