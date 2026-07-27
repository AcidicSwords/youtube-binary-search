import {
  EPSILON,
  clamp,
  contains,
  createRoot,
  getTargets,
  refineNeighborhood,
  reopenToRange,
  canReopen,
  stepTarget,
  stepNeighborhood,
  settleContinuous
} from "./range-geometry.js";
import {
  PIN_KIND,
  createGuide,
  getPin,
  findPinAt,
  ensurePin,
  renamePin,
  deletePin,
  sectionsForPin,
  createSectionFromTimes,
  renameSection,
  deleteSection,
  resolveSection
} from "./guide.js";

export const HISTORY_LIMIT = 100;
export const MIN_RANGE_SECONDS = 0.25;

export function copy(value) {
  if (value === null || value === undefined) return value;
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

const clone = copy;

export function createInterval(departure, arrival, operator, medium = "direct") {
  if (
    !Number.isFinite(departure)
    || !Number.isFinite(arrival)
    || Math.abs(arrival - departure) <= EPSILON
  ) return null;

  return {
    start: Math.min(departure, arrival),
    end: Math.max(departure, arrival),
    departure,
    arrival,
    operator,
    medium,
    direction: arrival < departure ? "backward" : "forward",
    createdAt: Date.now()
  };
}

export function createSession({ duration = 0, current = 0, guide = createGuide() } = {}) {
  const end = Math.max(0, Number(duration) || 0);
  const C = clamp(Number(current) || 0, 0, end);
  return {
    model: {
      duration: end,
      range: { start: 0, end },
      resolution: createRoot(0, C, end),
      focus: null,
      interval: null,
      guide
    },
    history: []
  };
}

export function snapshotModel(model, options = {}) {
  return {
    duration: model.duration,
    range: clone(model.range),
    resolution: clone(model.resolution),
    focus: clone(model.focus),
    interval: clone(model.interval),
    guide: options.cloneGuide ? clone(model.guide) : model.guide
  };
}

function unchanged(session, reason = null, detail = {}) {
  return { session, changed: false, reason, ...detail };
}

function appendHistory(history, entry) {
  const next = [...history, entry];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function commit(session, label, transform, options = {}) {
  const draft = snapshotModel(session.model, { cloneGuide: Boolean(options.guideEdit) });
  const detail = transform(draft) || {};
  if (detail.changed === false) return unchanged(session, detail.reason, detail);

  const returnModel = options.returnModel ? snapshotModel(options.returnModel) : session.model;
  return {
    ...detail,
    changed: true,
    label,
    session: {
      model: draft,
      history: appendHistory(session.history, { label, model: returnModel })
    }
  };
}

function amend(session, transform) {
  const draft = snapshotModel(session.model);
  const detail = transform(draft) || {};
  if (detail.changed === false) return unchanged(session, detail.reason, detail);
  return {
    ...detail,
    changed: true,
    session: { model: draft, history: session.history }
  };
}


function normalizedRange(model, start, end, current) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(current)) return null;
  const A = clamp(start, 0, model.duration);
  const B = clamp(end, 0, model.duration);
  if (!(B - A >= MIN_RANGE_SECONDS)) return null;
  return { start: A, end: B, current: clamp(current, A, B) };
}

function openAddress(model, address) {
  if (contains(model.range, address)) return false;

  const current = model.resolution.C;
  if (model.focus) {
    model.range = clone(model.focus.returnRange);
    model.focus = null;
  }
  if (!contains(model.range, address)) model.range = { start: 0, end: model.duration };
  model.resolution = createRoot(
    model.range.start,
    clamp(current, model.range.start, model.range.end),
    model.range.end
  );
  return true;
}

function moveDraft(model, destination, options = {}) {
  if (!Number.isFinite(destination)) return { changed: false, reason: "invalid-destination" };
  const departure = Number.isFinite(options.departure) ? options.departure : model.resolution.C;
  const boundedDestination = clamp(destination, 0, model.duration);
  const rangeChanged = openAddress(model, boundedDestination);
  const resolvedDestination = clamp(boundedDestination, model.range.start, model.range.end);
  const directPlacement = options.mode !== "refine" && options.mode !== "step";
  if (Math.abs(resolvedDestination - model.resolution.C) <= EPSILON) {
    const resolutionChanged = directPlacement && canReopen(model.resolution, model.range);
    if (resolutionChanged) model.resolution = reopenToRange(resolvedDestination, model.range);
    return {
      changed: rangeChanged || resolutionChanged,
      departure,
      destination: resolvedDestination,
      current: model.resolution.C,
      rangeChanged,
      resolutionChanged
    };
  }

  if (options.mode === "refine") {
    model.resolution = refineNeighborhood(model.resolution, resolvedDestination, model.range);
  } else if (options.mode === "step") {
    model.resolution = stepNeighborhood(model.resolution, resolvedDestination, model.range);
  } else {
    // Direct placement is scale-independent. It establishes Current at a known
    // Address and reopens the active Range rather than pretending that the
    // destination was discovered through another recursive Refine.
    model.resolution = reopenToRange(resolvedDestination, model.range);
  }
  model.interval = createInterval(
    departure,
    resolvedDestination,
    options.operator || "go",
    options.medium || "direct"
  );
  return {
    changed: true,
    departure,
    destination: resolvedDestination,
    current: model.resolution.C,
    rangeChanged,
    interval: model.interval,
    place: model.resolution.C
  };
}

export function goTo(session, destination, options = {}) {
  const label = options.label || "Go";
  const perform = draft => moveDraft(draft, destination, options);
  return options.amend ? amend(session, perform) : commit(session, label, perform, options);
}

export function refine(session, direction) {
  const target = getTargets(session.model.resolution)[direction];
  if (target === null) return unchanged(session, "no-destination");
  const backward = direction === "backward";
  return goTo(session, target, {
    mode: "refine",
    operator: backward ? "refineBackward" : "refineForward",
    label: backward ? "Refine Backward" : "Refine Forward"
  });
}

export function step(session, direction, seconds, options = {}) {
  const target = stepTarget(session.model.resolution.C, seconds, direction, session.model.range);
  if (Math.abs(target - session.model.resolution.C) <= EPSILON) return unchanged(session, "range-edge");
  const backward = direction === "backward";
  return goTo(session, target, {
    mode: "step",
    operator: backward ? "stepBackward" : "stepForward",
    label: backward ? "Step Backward" : "Step Forward",
    departure: options.departure,
    amend: options.amend
  });
}

export function reopen(session) {
  if (!canReopen(session.model.resolution, session.model.range)) return unchanged(session, "already-open");
  return commit(session, "Reopen", draft => {
    draft.resolution = reopenToRange(draft.resolution.C, draft.range);
    return { changed: true };
  });
}

export function setRange(session, start, end, current, label = "Set Range") {
  const next = normalizedRange(session.model, start, end, current);
  if (!next) return unchanged(session, "invalid-range");
  const sameRange = Math.abs(next.start - session.model.range.start) <= EPSILON
    && Math.abs(next.end - session.model.range.end) <= EPSILON;
  const sameCurrent = Math.abs(next.current - session.model.resolution.C) <= EPSILON;
  if (sameRange && sameCurrent && !session.model.focus) return unchanged(session, "unchanged-range");

  return commit(session, label, draft => {
    draft.range = { start: next.start, end: next.end };
    draft.focus = null;
    draft.resolution = createRoot(next.start, next.current, next.end);
    return {
      changed: true,
      rangeChanged: true,
      ...(sameCurrent ? {} : { place: draft.resolution.C })
    };
  });
}

export function focusSection(session, sectionId) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  if (
    session.model.focus?.sectionId === sectionId
    && Math.abs(session.model.range.start - section.start) <= EPSILON
    && Math.abs(session.model.range.end - section.end) <= EPSILON
  ) return unchanged(session, "already-focused");

  return commit(session, `Focus “${section.label}”`, draft => {
    const resolved = resolveSection(draft.guide, sectionId);
    const departure = draft.resolution.C;
    const returnRange = draft.focus?.returnRange || clone(draft.range);
    draft.focus = { sectionId, returnRange };
    draft.range = { start: resolved.start, end: resolved.end };
    const current = contains(draft.range, departure) ? departure : resolved.midpoint;
    draft.resolution = createRoot(resolved.start, current, resolved.end);
    const moved = Math.abs(current - departure) > EPSILON;
    const interval = moved ? createInterval(departure, current, "focusSection", "direct") : null;
    if (interval) draft.interval = interval;
    return {
      changed: true,
      section: resolved,
      rangeChanged: true,
      ...(interval ? { place: current, interval } : {})
    };
  });
}

export function leaveSection(session) {
  if (!session.model.focus) return unchanged(session, "not-focused");
  return commit(session, "Leave Section", draft => {
    const returnRange = clone(draft.focus.returnRange) || { start: 0, end: draft.duration };
    const departure = draft.resolution.C;
    const current = clamp(departure, returnRange.start, returnRange.end);
    draft.range = returnRange;
    draft.resolution = createRoot(returnRange.start, current, returnRange.end);
    draft.focus = null;
    return {
      changed: true,
      rangeChanged: true,
      ...(Math.abs(current - departure) > EPSILON ? { place: current } : {})
    };
  });
}


export function completeContinue(session, options) {
  const current = clamp(options.current, session.model.range.start, session.model.range.end);
  if (
    Math.abs(current - options.departure) <= EPSILON
    && !options.crossedResolution
    && !options.wrapped
  ) return unchanged(session, "no-movement");
  return commit(session, options.label || "Continue", draft => {
    draft.resolution = options.crossedResolution || options.wrapped
      ? reopenToRange(current, draft.range)
      : settleContinuous(options.parentNeighborhood, options.departure, current);
    if (!options.wrapped) {
      draft.interval = createInterval(
        options.departure,
        current,
        options.operator || "continue",
        "continuous"
      );
    }
    return { changed: true, place: current, interval: draft.interval };
  }, { returnModel: options.returnModel });
}

export function completeSkim(session, options) {
  const current = clamp(options.current, session.model.range.start, session.model.range.end);
  if (Math.abs(current - options.departure) <= EPSILON) return unchanged(session, "no-movement");
  return commit(session, options.label || "Skim", draft => {
    const insideParent = current >= options.parentNeighborhood.L - EPSILON
      && current <= options.parentNeighborhood.R + EPSILON;
    draft.resolution = insideParent
      ? settleContinuous(options.parentNeighborhood, options.departure, current)
      : reopenToRange(current, draft.range);
    draft.interval = createInterval(options.departure, current, "skim", "continuous");
    return { changed: true, place: current, interval: draft.interval };
  }, { returnModel: options.returnModel });
}

export function reachSkimDestination(session, options) {
  return amend(session, draft => {
    draft.resolution = refineNeighborhood(options.parentNeighborhood, options.destination, draft.range);
    draft.interval = createInterval(options.departure, options.destination, "skim", "continuous");
    return { changed: true, place: options.destination, interval: draft.interval };
  });
}

export function pinCurrent(session, label = "") {
  const text = String(label || "").trim();
  const existing = findPinAt(session.model.guide, session.model.resolution.C);
  if (
    existing
    && existing.kind === PIN_KIND.EXPLICIT
    && (!text || text === existing.label)
  ) {
    return unchanged(session, "already-pinned", {
      value: { pin: existing, created: false }
    });
  }

  return commit(session, "Pin Current", draft => {
    const value = ensurePin(draft.guide, draft.resolution.C, {
      label: text,
      kind: PIN_KIND.EXPLICIT,
      provenance: "pin"
    });
    return { changed: true, guideChanged: true, value };
  }, { guideEdit: true });
}

export function saveIntervalAsSection(session, label) {
  if (!session.model.interval) return unchanged(session, "no-interval");
  const text = String(label || "").trim();
  if (!text) return unchanged(session, "missing-title");

  const startPin = findPinAt(session.model.guide, session.model.interval.start);
  const endPin = findPinAt(session.model.guide, session.model.interval.end);
  const duplicate = startPin && endPin
    ? session.model.guide.sections.find(section =>
      section.startPinId === startPin.id
      && section.endPinId === endPin.id
      && section.label === text
    )
    : null;
  if (duplicate) {
    return unchanged(session, "duplicate-section", {
      value: { section: duplicate, created: false }
    });
  }

  return commit(session, "Save Section", draft => {
    const value = createSectionFromTimes(
      draft.guide,
      draft.interval.start,
      draft.interval.end,
      { label: text, provenance: `interval:${draft.interval.operator}` }
    );
    return { changed: true, guideChanged: true, value };
  }, { guideEdit: true });
}

export function renameGuidePin(session, pinId, label) {
  const pin = getPin(session.model.guide, pinId);
  if (!pin) return unchanged(session, "missing-pin");
  const text = String(label || "").trim();
  if (text === pin.label) return unchanged(session, "unchanged-label", { value: pin });
  return commit(session, "Rename Pin", draft => ({
    changed: true,
    guideChanged: true,
    value: renamePin(draft.guide, pinId, text)
  }), { guideEdit: true });
}

export function deleteGuidePin(session, pinId) {
  if (!getPin(session.model.guide, pinId)) return unchanged(session, "missing-pin");
  const references = sectionsForPin(session.model.guide, pinId).length;
  if (references) return unchanged(session, "pin-in-use", { references });
  return commit(session, "Delete Pin", draft => ({
    changed: true,
    guideChanged: true,
    value: deletePin(draft.guide, pinId)
  }), { guideEdit: true });
}

export function renameGuideSection(session, sectionId, label) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  const text = String(label || "").trim();
  if (!text) return unchanged(session, "missing-title");
  if (text === section.label) return unchanged(session, "unchanged-label", { value: section });
  return commit(session, "Rename Section", draft => ({
    changed: true,
    guideChanged: true,
    value: renameSection(draft.guide, sectionId, text)
  }), { guideEdit: true });
}

export function deleteGuideSection(session, sectionId) {
  if (!resolveSection(session.model.guide, sectionId)) return unchanged(session, "missing-section");
  return commit(session, "Delete Section", draft => {
    const wasFocused = draft.focus?.sectionId === sectionId;
    const departure = draft.resolution.C;
    if (wasFocused) {
      const returnRange = clone(draft.focus.returnRange) || { start: 0, end: draft.duration };
      const current = clamp(departure, returnRange.start, returnRange.end);
      draft.range = returnRange;
      draft.resolution = createRoot(returnRange.start, current, returnRange.end);
      draft.focus = null;
    }
    const changed = deleteSection(draft.guide, sectionId);
    const moved = Math.abs(draft.resolution.C - departure) > EPSILON;
    return {
      changed,
      guideChanged: changed,
      ...(wasFocused ? { rangeChanged: true } : {}),
      ...(moved ? { place: draft.resolution.C } : {})
    };
  }, { guideEdit: true });
}

export function returnState(session) {
  const entry = session.history.at(-1);
  if (!entry) return unchanged(session, "empty-history");
  return {
    changed: true,
    label: entry.label,
    place: entry.model.resolution.C,
    guideChanged: entry.model.guide !== session.model.guide,
    session: {
      model: snapshotModel(entry.model),
      history: session.history.slice(0, -1)
    }
  };
}

export function previewRange(session, start, end, current) {
  const next = normalizedRange(session.model, start, end, current);
  if (!next) return unchanged(session, "invalid-range");
  const sameRange = Math.abs(next.start - session.model.range.start) <= EPSILON
    && Math.abs(next.end - session.model.range.end) <= EPSILON;
  const sameCurrent = Math.abs(next.current - session.model.resolution.C) <= EPSILON;
  if (sameRange && sameCurrent && !session.model.focus) return unchanged(session, "unchanged-range");

  return amend(session, draft => {
    draft.range = { start: next.start, end: next.end };
    draft.focus = null;
    draft.resolution = createRoot(next.start, next.current, next.end);
    return { changed: true, place: draft.resolution.C, rangeChanged: true };
  });
}

export function previewReopen(session, current) {
  return amend(session, draft => {
    draft.resolution = reopenToRange(current, draft.range);
    return { changed: true, place: draft.resolution.C };
  });
}

export function checkpoint(session, label, returnModel) {
  return {
    changed: true,
    label,
    session: {
      model: session.model,
      history: appendHistory(session.history, {
        label,
        model: snapshotModel(returnModel)
      })
    }
  };
}
