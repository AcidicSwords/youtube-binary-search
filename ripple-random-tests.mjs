// Deterministic adversarial coverage for the transient Ripple/Ghost seam.
// Route smokes prove concrete journeys; this suite changes ordering, identity,
// range, generation, duplication, and consumption thousands of times.
import assert from "node:assert/strict";
import {
  appendRippleProspects,
  availableTraversalProspects,
  beginTraversalProspectRead,
  clearTraversalProspects,
  consumeTraversalProspect,
  createTraversalProspects,
  moveTraversalProspectRead,
  removeRippleProspects
} from "./traversal-prospects.js";
import { createSession, goTo } from "./session.js";
import {
  appendAtomicTraversal,
  createTraversalTrace
} from "./traversal-trace.js";

let randomState = 0x91c10c;
const random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x1_0000_0000;
};
const integer = maximum => Math.floor(random() * maximum);
const address = () => Math.round(random() * 1000) / 10;

let prospects = createTraversalProspects();
let generation = 1;
let rippleSequence = 0;
let frozenReads = 0;
let successfulConsumes = 0;

for (let operation = 0; operation < 20_000; operation += 1) {
  const choice = integer(7);
  if (choice <= 2) {
    const start = address();
    const end = random() < 0.12 ? start : address();
    const appended = appendRippleProspects(prospects, {
      rippleId: `random-ripple-${generation}-${++rippleSequence}`,
      generation,
      start,
      end
    });
    assert.equal(appended.changed, true);
    assert.equal(appended.prospects[0].address, start);
    assert.equal(appended.prospects[1].address, end);
    prospects = appended.state;
  } else if (choice === 3) {
    const available = availableTraversalProspects(prospects, {
      generation,
      range: { start: 0, end: 100 }
    });
    const id = available.length && random() < 0.82
      ? available[integer(available.length)].id
      : `missing-${operation}`;
    const consumed = consumeTraversalProspect(prospects, id);
    if (consumed.changed) {
      successfulConsumes += 1;
      assert.equal(consumed.prospect.id, id);
      prospects = consumed.state;
    } else {
      assert.equal(prospects.entries.some(entry => entry.id === id), false);
    }
  } else if (choice === 4) {
    const entry = prospects.entries[integer(Math.max(1, prospects.entries.length))];
    const rippleId = entry && random() < 0.8 ? entry.rippleId : `missing-${operation}`;
    const removed = removeRippleProspects(prospects, rippleId);
    if (removed.changed) prospects = removed.state;
  } else if (choice === 5) {
    const first = address();
    const second = address();
    const range = { start: Math.min(first, second), end: Math.max(first, second) };
    const read = beginTraversalProspectRead(prospects, {
      generation,
      range
    });
    const frozenIds = read.entries.map(entry => entry.id);
    const appended = appendRippleProspects(prospects, {
      rippleId: `random-ripple-${generation}-${++rippleSequence}`,
      generation,
      start: address(),
      end: address()
    });
    prospects = appended.state;
    let cursor = read;
    const walked = [];
    while (true) {
      const moved = moveTraversalProspectRead(cursor, "forward");
      if (!moved.changed) break;
      walked.push(moved.prospect.id);
      cursor = moved.read;
    }
    assert.deepEqual(walked, frozenIds,
      "A frozen read is unaffected by a later randomized batch.");
    frozenReads += 1;
  } else {
    generation += 1;
    prospects = clearTraversalProspects();
  }

  assert.equal(Object.isFrozen(prospects), true);
  assert.equal(Object.isFrozen(prospects.entries), true);
  assert.deepEqual(Object.keys(prospects).sort(), ["entries", "nextId"]);
  const ids = prospects.entries.map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length, "Prospect identities stay unique.");
  assert.ok(prospects.entries.every(Object.isFrozen));

  const low = address();
  const high = address();
  const range = { start: Math.min(low, high), end: Math.max(low, high) };
  const expected = [...prospects.entries].reverse().filter(entry =>
    entry.generation === generation
    && entry.address >= range.start
    && entry.address <= range.end
  );
  assert.deepEqual(
    availableTraversalProspects(prospects, { generation, range }),
    expected,
    "Availability is exactly newest-first generation and Range filtering."
  );
}

// Repeatedly prove the settlement boundary independently of the application:
// preview changes no accepted object; canonical Go contributes one ordinary
// Active Span/history/Trace movement; exact consumption removes only its ID.
for (let trial = 0; trial < 2_000; trial += 1) {
  const current = Math.round(random() * 80_000) / 1000;
  const destination = Math.min(100, current + 1 + random() * 19);
  const session = createSession({ duration: 100, current });
  const appended = appendRippleProspects(createTraversalProspects(), {
    rippleId: `settlement-${trial}`,
    generation: 1,
    start: Math.max(0, destination - 0.5),
    end: destination
  });
  const read = beginTraversalProspectRead(appended.state, {
    generation: 1,
    range: session.model.range,
    excludeAddress: current,
    excludeTolerance: 0.04
  });
  const selected = moveTraversalProspectRead(read, "forward");
  assert.equal(selected.changed, true);

  const preview = goTo(session, selected.address, {
    operator: "go",
    label: "Go to Traversal Prospect"
  });
  assert.equal(preview.changed, true);
  assert.equal(session.model.neighborhood.C, current);
  assert.equal(session.history.length, 0);

  const committed = goTo(session, selected.address, {
    operator: "go",
    label: "Go to Traversal Prospect"
  });
  assert.equal(committed.session.history.length, 1);
  assert.equal(committed.session.history[0].label, "Go to Traversal Prospect");
  assert.equal(committed.session.model.activeSpan.operator, "go");
  assert.equal(committed.session.model.activeSpan.medium, "direct");

  const traced = appendAtomicTraversal(createTraversalTrace(current), {
    from: current,
    to: selected.address,
    cause: "go",
    createdAt: trial
  });
  assert.equal(traced.changed, true);
  assert.equal(traced.traversalTrace.records.length, 1);

  const consumed = consumeTraversalProspect(appended.state, selected.prospect.id);
  assert.equal(consumed.changed, true);
  assert.equal(consumed.state.entries.length, 1);
  assert.equal(
    consumed.state.entries[0].id === selected.prospect.id,
    false,
    "Only the exact accepted prospect is consumed."
  );
}

console.log(`Ripple random tests passed: 20,000 prospect lifecycle operations, ${frozenReads} frozen-read races, ${successfulConsumes} exact random consumptions, and 2,000 canonical Go/history/Trace settlement trials.`);
