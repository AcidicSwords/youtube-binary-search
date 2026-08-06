import assert from "node:assert/strict";
import {
  TRAVERSAL_PROSPECT_KIND,
  appendRippleProspects,
  availableTraversalProspects,
  clearTraversalProspects,
  consumeTraversalProspect,
  createTraversalProspects,
  removeRippleProspects
} from "./traversal-prospects.js";

let state = createTraversalProspects();
assert.deepEqual(state.entries, []);

const first = appendRippleProspects(state, {
  rippleId: "ripple-1",
  generation: 4,
  start: 10,
  end: 15
});
assert.equal(first.changed, true);
state = first.state;
assert.deepEqual(
  state.entries.map(({ rippleId, generation, kind, address }) => ({
    rippleId,
    generation,
    kind,
    address
  })),
  [
    {
      rippleId: "ripple-1",
      generation: 4,
      kind: TRAVERSAL_PROSPECT_KIND.RIPPLE_START,
      address: 10
    },
    {
      rippleId: "ripple-1",
      generation: 4,
      kind: TRAVERSAL_PROSPECT_KIND.RIPPLE_END,
      address: 15
    }
  ],
  "Start is appended before End."
);
assert.deepEqual(
  availableTraversalProspects(state, {
    generation: 4,
    range: { start: 0, end: 100 }
  }).map(entry => entry.kind),
  [TRAVERSAL_PROSPECT_KIND.RIPPLE_START, TRAVERSAL_PROSPECT_KIND.RIPPLE_END],
  "Ripple endpoints remain in the order appended to the Trace's forward side."
);

const second = appendRippleProspects(state, {
  rippleId: "ripple-2",
  generation: 4,
  start: 40,
  end: 45
});
state = second.state;
assert.deepEqual(
  availableTraversalProspects(state, {
    generation: 4,
    range: { start: 0, end: 100 }
  }).map(entry => `${entry.rippleId}:${entry.kind}`),
  [
    "ripple-1:ripple-start",
    "ripple-1:ripple-end",
    "ripple-2:ripple-start",
    "ripple-2:ripple-end"
  ],
  "Completed batches coexist in append order."
);
const later = appendRippleProspects(state, {
  rippleId: "ripple-later",
  generation: 4,
  start: 70,
  end: 75
});
assert.equal(later.state.entries.length, state.entries.length + 2);

const firstStart = availableTraversalProspects(state, {
  generation: 4,
  range: { start: 0, end: 100 }
})[0];
const consumed = consumeTraversalProspect(state, firstStart.id);
assert.equal(consumed.changed, true);
assert.equal(consumed.prospect.id, firstStart.id);
state = consumed.state;
assert.deepEqual(
  state.entries
    .filter(entry => entry.rippleId === "ripple-1")
    .map(entry => entry.kind),
  [TRAVERSAL_PROSPECT_KIND.RIPPLE_END],
  "Consuming one endpoint leaves the other."
);
assert.equal(consumeTraversalProspect(state, firstStart.id).changed, false,
  "Consumption is exact and cannot select a coincident entry.");

const duplicates = appendRippleProspects(state, {
  rippleId: "ripple-3",
  generation: 4,
  start: 22,
  end: 22
});
state = duplicates.state;
const duplicateEntries = state.entries.filter(entry => entry.rippleId === "ripple-3");
assert.equal(duplicateEntries.length, 2);
assert.notEqual(duplicateEntries[0].id, duplicateEntries[1].id,
  "Coincident Addresses remain distinct occurrences.");

assert.deepEqual(
  availableTraversalProspects(state, {
    generation: 4,
    range: { start: 20, end: 30 }
  }).map(entry => entry.id),
  duplicateEntries.map(entry => entry.id),
  "Focus filters availability without deleting entries."
);
assert.equal(state.entries.filter(entry => entry.rippleId === "ripple-3").length, 2);
assert.equal(
  availableTraversalProspects(state, {
    generation: 5,
    range: { start: 0, end: 100 }
  }).length,
  0,
  "A different source generation invalidates every old prospect."
);

const removed = removeRippleProspects(state, "ripple-1");
assert.equal(removed.changed, true);
assert.equal(removed.prospects.length, 1);
assert.equal(removed.state.entries.some(entry => entry.rippleId === "ripple-1"), false);
assert.equal(removeRippleProspects(removed.state, "missing").changed, false);

const cleared = clearTraversalProspects();
assert.deepEqual(cleared.entries, []);
assert.deepEqual(Object.keys(cleared).sort(), ["entries", "nextId"],
  "The model contains only transient in-memory identity and entries.");
assert.equal(Object.isFrozen(cleared), true);
assert.equal(Object.isFrozen(cleared.entries), true);

assert.equal(
  appendRippleProspects(cleared, {
    rippleId: "",
    generation: 1,
    start: 0,
    end: 1
  }).changed,
  false,
  "Invalid batches cannot manufacture partial prospects."
);

console.log("Traversal Prospect tests passed: append-order future entries, coexisting batches, exact settlement consumption, duplicate occurrence identity, generation invalidation, Focus filtering without deletion, batch removal, and transient clearing.");
