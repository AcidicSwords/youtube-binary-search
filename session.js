import {
  EPSILON,
  RESOLUTION_BASIS,
  clamp,
  contains,
  createRoot,
  getTargets,
  refineNeighborhood,
  seedNeighborhoodFromMovement,
  isRangeNeighborhood,
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
      resolutionBasis: RESOLUTION_BASIS.RANGE,
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
    resolutionBasis: model.resolutionBasis || RESOLUTION_BASIS.RANGE,
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

function reconcileFocusDraft(model) {
  if (!model.focus || resolveSection(model.guide, model.focus.sectionId)) {
    return { changed: false, moved: false, intervalCleared: false };
  }

  const returnRange = clone(model.focus.returnRange) || { start: 0, end: model.duration };
  const departure = model.resolution.C;
  const current = clamp(departure, returnRange.start, returnRange.end);
  model.range = returnRange;
  model.resolution = createRoot(returnRange.start, current, returnRange.end);
  model.resolutionBasis = RESOLUTION_BASIS.RANGE;
  model.focus = null;
  return {
    changed: true,
    moved: Math.abs(current - departure) > EPSILON,
    intervalCleared: clearIntervalOutsideRange(model)
  };
}

function commit(session, label, transform, options = {}) {
  const draft = snapshotModel(session.model, { cloneGuide: Boolean(options.guideEdit) });
  const detail = transform(draft) || {};
  const reconciliation = options.guideEdit
    ? reconcileFocusDraft(draft)
    : { changed: false, moved: false };

  if (reconciliation.changed) {
    detail.changed = true;
    detail.rangeChanged = true;
    detail.focusReconciled = true;
    if (reconciliation.intervalCleared) detail.intervalCleared = true;
    if (reconciliation.moved) detail.place = draft.resolution.C;
  }
  if (detail.changed === false) return unchanged(session, detail.reason, detail);

  const returnModel = options.returnModel ? snapshotModel(options.returnModel) : session.model;
  const committedLabel = detail.historyLabel || label;
  return {
    ...detail,
    changed: true,
    label: committedLabel,
    session: {
      model: draft,
      history: appendHistory(session.history, {
        label: committedLabel,
        model: returnModel
      })
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

function intervalInsideRange(interval, range) {
  return !interval || (
    interval.start >= range.start - EPSILON
    && interval.end <= range.end + EPSILON
  );
}

function clearIntervalOutsideRange(model) {
  if (intervalInsideRange(model.interval, model.range)) return false;
  model.interval = null;
  return true;
}

function openAddress(model, address) {
  if (contains(model.range, address)) {
    return { changed: false, leftFocus: false, openedFullVideo: false };
  }

  const current = model.resolution.C;
  const leftFocus = Boolean(model.focus);
  if (model.focus) {
    model.range = clone(model.focus.returnRange);
    model.focus = null;
  }

  let openedFullVideo = false;
  if (!contains(model.range, address) || !contains(model.range, current)) {
    model.range = { start: 0, end: model.duration };
    openedFullVideo = true;
  }

  model.resolution = createRoot(
    model.range.start,
    clamp(current, model.range.start, model.range.end),
    model.range.end
  );
  model.resolutionBasis = RESOLUTION_BASIS.RANGE;
  clearIntervalOutsideRange(model);
  return { changed: true, leftFocus, openedFullVideo };
}

function moveDraft(model, destination, options = {}) {
  if (!Number.isFinite(destination)) return { changed: false, reason: "invalid-destination" };

  const departure = Number.isFinite(options.departure)
    ? options.departure
    : model.resolution.C;
  const boundedDestination = clamp(destination, 0, model.duration);
  const opening = openAddress(model, boundedDestination);
  const rangeChanged = opening.changed;
  const resolvedDestination = clamp(boundedDestination, model.range.start, model.range.end);
  let finalDestination = resolvedDestination;

  // Direct Go at Current is a true no-op. Reopen is the one explicit operation
  // that discards local scale while retaining Current and Interval.
  if (Math.abs(resolvedDestination - model.resolution.C) <= EPSILON) {
    return {
      changed: rangeChanged,
      reason: rangeChanged ? null : "same-address",
      departure,
      destination: resolvedDestination,
      current: model.resolution.C,
      rangeChanged,
      leftFocus: opening.leftFocus,
      openedFullVideo: opening.openedFullVideo
    };
  }

  if (options.mode === "refine") {
    model.resolution = refineNeighborhood(model.resolution, resolvedDestination, model.range);
  } else if (options.mode === "step") {
    const baseNeighborhood = clone(options.originResolution || model.resolution);
    const baseBasis = options.originResolutionBasis
      || model.resolutionBasis
      || RESOLUTION_BASIS.RANGE;
    const remainedInside = resolvedDestination >= baseNeighborhood.L - EPSILON
      && resolvedDestination <= baseNeighborhood.R + EPSILON;

    model.resolution = stepNeighborhood(
      baseNeighborhood,
      resolvedDestination,
      model.range,
      departure
    );
    finalDestination = model.resolution.C;
    model.resolutionBasis = remainedInside
      ? baseBasis
      : isRangeNeighborhood(model.resolution, model.range)
        ? RESOLUTION_BASIS.RANGE
        : RESOLUTION_BASIS.MOVEMENT;
  } else {
    // Direct Go abandons the preceding recursive path while retaining the scale
    // communicated by the actual movement. The crossed Interval forms one side
    // of the next Neighborhood; Reopen restores Range-level availability.
    model.resolution = seedNeighborhoodFromMovement(
      departure,
      resolvedDestination,
      model.range
    );
    model.resolutionBasis = isRangeNeighborhood(model.resolution, model.range)
      ? RESOLUTION_BASIS.RANGE
      : RESOLUTION_BASIS.MOVEMENT;
  }

  model.interval = createInterval(
    departure,
    finalDestination,
    options.operator || "go",
    options.medium || "direct"
  );

  const baseLabel = options.label || "Go";
  const historyLabel = opening.leftFocus && opening.openedFullVideo
    ? `Leave Section + Full Video + ${baseLabel}`
    : opening.leftFocus
      ? `Leave Section + ${baseLabel}`
      : opening.openedFullVideo
        ? `Full Video + ${baseLabel}`
        : null;

  return {
    changed: true,
    departure,
    destination: finalDestination,
    current: model.resolution.C,
    rangeChanged,
    leftFocus: opening.leftFocus,
    openedFullVideo: opening.openedFullVideo,
    ...(historyLabel ? { historyLabel } : {}),
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
    originResolution: options.originResolution,
    originResolutionBasis: options.originResolutionBasis,
    amend: options.amend
  });
}

export function reopen(session) {
  if (
    !canReopen(session.model.resolution, session.model.range)
    && session.model.resolutionBasis === RESOLUTION_BASIS.RANGE
  ) return unchanged(session, "already-open");
  return commit(session, "Reopen", draft => {
    draft.resolution = reopenToRange(draft.resolution.C, draft.range);
    draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
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
    draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
    const intervalCleared = clearIntervalOutsideRange(draft);
    return {
      changed: true,
      rangeChanged: true,
      intervalCleared,
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
    draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
    const moved = Math.abs(current - departure) > EPSILON;
    const intervalCleared = clearIntervalOutsideRange(draft);
    return {
      changed: true,
      section: resolved,
      rangeChanged: true,
      intervalCleared,
      ...(moved ? { place: current } : {})
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
    draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
    draft.focus = null;
    const intervalCleared = clearIntervalOutsideRange(draft);
    return {
      changed: true,
      rangeChanged: true,
      intervalCleared,
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
    draft.resolutionBasis = options.crossedResolution || options.wrapped
      ? RESOLUTION_BASIS.RANGE
      : options.parentResolutionBasis
        || options.returnModel?.resolutionBasis
        || draft.resolutionBasis
        || RESOLUTION_BASIS.RANGE;
    if (options.wrapped) {
      // A wrapped traversal is not one contiguous bounded extent, so retaining
      // the preceding Interval would misdescribe the latest movement.
      draft.interval = null;
    } else {
      draft.interval = createInterval(
        options.departure,
        current,
        options.operator || "continue",
        "continuous"
      );
    }
    return {
      changed: true,
      place: current,
      interval: draft.interval,
      intervalCleared: options.wrapped
    };
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
    draft.resolutionBasis = insideParent
      ? options.parentResolutionBasis
        || options.returnModel?.resolutionBasis
        || draft.resolutionBasis
        || RESOLUTION_BASIS.RANGE
      : RESOLUTION_BASIS.RANGE;
    draft.interval = createInterval(options.departure, current, "skim", "continuous");
    return { changed: true, place: current, interval: draft.interval };
  }, { returnModel: options.returnModel });
}

export function reachSkimDestination(session, options) {
  return amend(session, draft => {
    draft.resolution = refineNeighborhood(options.parentNeighborhood, options.destination, draft.range);
    draft.resolutionBasis = options.parentResolutionBasis
      || draft.resolutionBasis
      || RESOLUTION_BASIS.RANGE;
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

export function saveExtentAsSection(session, extent, label, provenance = "extent") {
  if (
    !extent
    || !Number.isFinite(extent.start)
    || !Number.isFinite(extent.end)
    || extent.end - extent.start <= EPSILON
  ) return unchanged(session, "no-extent");
  const text = String(label || "").trim();
  if (!text) return unchanged(session, "missing-title");

  const startPin = findPinAt(session.model.guide, extent.start);
  const endPin = findPinAt(session.model.guide, extent.end);
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
      extent.start,
      extent.end,
      { label: text, provenance }
    );
    return { changed: true, guideChanged: true, value };
  }, { guideEdit: true });
}

export function saveIntervalAsSection(session, label) {
  if (!session.model.interval) return unchanged(session, "no-interval");
  return saveExtentAsSection(
    session,
    session.model.interval,
    label,
    `interval:${session.model.interval.operator}`
  );
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
      draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
      draft.focus = null;
      clearIntervalOutsideRange(draft);
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
    draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
    const intervalCleared = clearIntervalOutsideRange(draft);
    return {
      changed: true,
      place: draft.resolution.C,
      rangeChanged: true,
      intervalCleared
    };
  });
}

export function previewReopen(session, current) {
  return amend(session, draft => {
    draft.resolution = reopenToRange(current, draft.range);
    draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
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
