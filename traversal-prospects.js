// Transient future Addresses. Traversal Prospects are neither Session state nor
// Traversal Trace evidence; they are source-scoped opportunities Ghost may read
// forward and canonical Go may later consume.

export const TRAVERSAL_PROSPECT_KIND = Object.freeze({
  RIPPLE_START: "ripple-start",
  RIPPLE_END: "ripple-end"
});

function freezeEntry(entry) {
  return Object.freeze({ ...entry });
}

function createState(entries = [], nextId = 1) {
  return Object.freeze({
    nextId,
    entries: Object.freeze(entries.map(freezeEntry))
  });
}

export function createTraversalProspects() {
  return createState();
}

export function appendRippleProspects(state, {
  rippleId,
  generation,
  start,
  end
} = {}) {
  const source = state?.entries ? state : createTraversalProspects();
  if (
    typeof rippleId !== "string"
    || !rippleId
    || !Number.isFinite(Number(generation))
    || !Number.isFinite(Number(start))
    || !Number.isFinite(Number(end))
  ) {
    return { changed: false, state: source, prospects: [] };
  }

  const firstId = source.nextId;
  const common = { rippleId, generation: Number(generation) };
  const prospects = [
    {
      ...common,
      id: `prospect-${firstId}`,
      kind: TRAVERSAL_PROSPECT_KIND.RIPPLE_START,
      address: Number(start)
    },
    {
      ...common,
      id: `prospect-${firstId + 1}`,
      kind: TRAVERSAL_PROSPECT_KIND.RIPPLE_END,
      address: Number(end)
    }
  ].map(freezeEntry);

  return {
    changed: true,
    state: createState([...source.entries, ...prospects], firstId + 2),
    prospects
  };
}

export function availableTraversalProspects(state, {
  generation,
  range
} = {}) {
  if (!state?.entries || !Number.isFinite(Number(generation))) return [];
  const low = Number(range?.start);
  const high = Number(range?.end);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return [];
  return [...state.entries]
    .reverse()
    .filter(entry =>
      entry.generation === Number(generation)
      && entry.address >= low
      && entry.address <= high
    );
}

export function consumeTraversalProspect(state, id) {
  const source = state?.entries ? state : createTraversalProspects();
  const index = source.entries.findIndex(entry => entry.id === id);
  if (index < 0) return { changed: false, state: source, prospect: null };
  const prospect = source.entries[index];
  return {
    changed: true,
    state: createState(
      source.entries.filter(entry => entry.id !== id),
      source.nextId
    ),
    prospect
  };
}

export function removeRippleProspects(state, rippleId) {
  const source = state?.entries ? state : createTraversalProspects();
  const entries = source.entries.filter(entry => entry.rippleId !== rippleId);
  if (entries.length === source.entries.length) {
    return { changed: false, state: source, prospects: [] };
  }
  return {
    changed: true,
    state: createState(entries, source.nextId),
    prospects: source.entries.filter(entry => entry.rippleId === rippleId)
  };
}

export function clearTraversalProspects() {
  return createTraversalProspects();
}
