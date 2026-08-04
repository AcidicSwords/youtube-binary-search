// Cues are candidates, not structure.
//
// These tests hold the two halves of that: a creator's description parses into
// a navigable contiguous partition, and nothing in this module ever produces a
// Pin, a Section, or anything the projection can see.
import assert from "node:assert/strict";
import {
  parseTimestamp,
  parseCueList,
  cueName
} from "./cues.js";

// --- Addresses ----------------------------------------------------------------
{
  assert.equal(parseTimestamp("0:00"), 0);
  assert.equal(parseTimestamp("1:23"), 83);
  assert.equal(parseTimestamp("1:02:03"), 3723);
  assert.equal(parseTimestamp("12:34:56"), 45296);
  // A timestamp is minutes and seconds, so 60 seconds is not one.
  assert.equal(parseTimestamp("1:60"), null);
  assert.equal(parseTimestamp("1:60:00"), null);
  assert.equal(parseTimestamp("90"), null);
  assert.equal(parseTimestamp("1:2:3:4"), null);
  assert.equal(parseTimestamp(""), null);
  assert.equal(parseTimestamp(null), null);
}

// --- A description is not a file format ---------------------------------------
// Real descriptions carry links, sponsor blocks and handles between chapter
// lines. A line earns its place by containing a timestamp; everything else is
// ignored rather than rejected.
{
  const description = [
    "Thanks to my sponsor, visit https://example.com/deal for 20% off",
    "0:00 Intro",
    "",
    "1:23 - The setup",
    "no timestamp here at all",
    "2:30 — Middle bit",
    "10:00 | Long section",
    "Follow me @somebody"
  ].join("\n");
  const cues = parseCueList(description, { duration: 900 });
  assert.deepEqual(
    cues.map(cue => [cue.time, cue.label]),
    [[0, "Intro"], [83, "The setup"], [150, "Middle bit"], [600, "Long section"]],
    "Every separator convention resolves to the same Address and title."
  );
}

// --- A chapter list is a contiguous partition ---------------------------------
// Each Cue runs to the next one's Address, and the last runs to the end of the
// source. That extent is what lets a Cue behave exactly like a Section row
// under the Guide's composition rule rather than needing a grammar of its own.
{
  const cues = parseCueList("0:00 A\n0:30 B\n1:00 C", { duration: 120 });
  assert.deepEqual(
    cues.map(cue => [cue.start, cue.end]),
    [[0, 30], [30, 60], [60, 120]],
    "Cues tile the source without gaps or overlap."
  );
  for (let index = 1; index < cues.length; index += 1) {
    assert.equal(cues[index - 1].end, cues[index].start,
      "No Cue may leave a gap before the next.");
  }
}

// --- Order, duplicates, and bounds --------------------------------------------
{
  // A description may list chapters out of order; Addresses decide the order.
  const cues = parseCueList("2:00 Second\n0:00 First\n1:00 Middle", { duration: 180 });
  assert.deepEqual(cues.map(cue => cue.label), ["First", "Middle", "Second"]);

  // A repeated Address is one place, so it is one Cue.
  const repeated = parseCueList("0:00 Intro\n0:00 Intro again\n1:00 Later", { duration: 120 });
  assert.deepEqual(repeated.map(cue => cue.label), ["Intro", "Later"]);

  // A timestamp past the end of the source addresses nothing.
  const clipped = parseCueList("0:00 A\n5:00 Beyond", { duration: 60 });
  assert.deepEqual(clipped.map(cue => cue.time), [0]);

  // Without a known duration the final Cue is a point rather than a guess.
  const unbounded = parseCueList("0:00 A\n1:00 B");
  assert.deepEqual(unbounded.at(-1), { index: 1, time: 60, label: "B", start: 60, end: 60 });
}

// --- Nothing to offer is not an error ------------------------------------------
{
  for (const input of ["", "   ", "no timestamps here", null, undefined, 42]) {
    assert.deepEqual(parseCueList(input, { duration: 100 }), [],
      "Text carrying no Address produces no Cues and no failure.");
  }
}

// --- A candidate never wears a name it was not given ---------------------------
// An unnamed Cue is a bare Address. Inventing a title would make a candidate
// look like something already retained.
{
  const [named, bare] = parseCueList("0:00 Opening\n1:00", { duration: 120 });
  assert.equal(cueName(named), "Opening");
  assert.equal(cueName(bare), null);
  assert.equal(cueName({ label: "   " }), null);
}

// --- Cues are ephemeral by construction ----------------------------------------
// The module offers Addresses and extents and nothing else: no identity that
// could persist, no Pin, no Section, no Weight.
{
  const cues = parseCueList("0:00 A\n1:00 B\n2:00 C", { duration: 180 });
  const keys = new Set(cues.flatMap(cue => Object.keys(cue)));
  assert.deepEqual(
    [...keys].sort(),
    ["end", "index", "label", "start", "time"],
    "A Cue carries only what is needed to navigate and retain it."
  );
  for (const cue of cues) {
    assert.ok(Object.isFrozen(cue), "A candidate cannot be edited in place.");
  }
}

console.log("Cue tests passed: timestamps in every conventional form, descriptions parsed leniently around their noise, a contiguous partition derived from consecutive Addresses, ordering and duplicates resolved, and Cues that carry nothing persistable.");
