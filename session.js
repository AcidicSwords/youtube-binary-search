// Immutable semantic kernel and Undo history. This module does not touch the DOM or media players.
import {
  EPSILON,
  RESOLUTION_BASIS,
  clamp,
  contains,
  containExtent,
  createRoot,
  getTargets,
  classifyRefineRelation,
  refineNeighborhood,
  seedNeighborhoodFromMovement,
  isRangeNeighborhood,
  reopenToRange,
  canReopen,
  stepTarget,
  stepNeighborhood,
  translateNeighborhood
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
  findDuplicateSection,
  renameSection,
  replaceSectionExtent,
  deleteSection,
  resolveSection
} from "./guide.js";

export const HISTORY_LIMIT = 100;
export const MIN_RANGE_SECONDS = 0.25;
export const MIN_STEP_REACH_SECONDS = 0.25;
export const MAX_STEP_REACH_SECONDS = 300;
export const FOCUS_KIND = Object.freeze({
  SAVED: "saved-section",
  WORKING: "working-section"
});

export const DEFAULT_STEP_REACH = Object.freeze({
  backward: 10,
  forward: 10,
  linked: true
});

function normalizeReachSeconds(value, fallback) {
  const fallbackValue = Number.isFinite(Number(fallback)) ? Number(fallback) : 10;
  const candidate = Number(value);
  return clamp(
    Number.isFinite(candidate) && candidate > 0 ? candidate : fallbackValue,
    MIN_STEP_REACH_SECONDS,
    MAX_STEP_REACH_SECONDS
  );
}

export function normalizeStepReach(value, fallback = DEFAULT_STEP_REACH) {
  const fallbackSource = Number.isFinite(Number(fallback))
    ? { backward: Number(fallback), forward: Number(fallback), linked: true }
    : fallback && typeof fallback === "object"
      ? fallback
      : DEFAULT_STEP_REACH;
  const fallbackBackward = normalizeReachSeconds(fallbackSource.backward, 10);
  const fallbackForward = normalizeReachSeconds(fallbackSource.forward, fallbackBackward);

  if (Number.isFinite(Number(value))) {
    const reach = normalizeReachSeconds(value, fallbackForward);
    return { backward: reach, forward: reach, linked: true };
  }

  const source = value && typeof value === "object" ? value : fallbackSource;
  const linked = source.linked !== false;
  let backward = normalizeReachSeconds(source.backward, fallbackBackward);
  let forward = normalizeReachSeconds(source.forward, fallbackForward);

  // Linked Reach has one value. Forward is used only to salvage malformed
  // persisted objects; normal UI linking supplies equal directional values.
  if (linked) {
    const reach = Number.isFinite(Number(source.forward))
      ? normalizeReachSeconds(source.forward, fallbackForward)
      : normalizeReachSeconds(source.backward, fallbackBackward);
    backward = reach;
    forward = reach;
  }

  return { backward, forward, linked };
}
export function copy(value) {
  if (value === null || value === undefined) return value;
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

const clone = copy;

export function createEndpointFrame(resolution, resolutionBasis = RESOLUTION_BASIS.RANGE) {
  if (
    !resolution
    || !Number.isFinite(resolution.L)
    || !Number.isFinite(resolution.C)
    || !Number.isFinite(resolution.R)
  ) return null;
  return {
    resolution: clone(resolution),
    resolutionBasis: resolutionBasis || RESOLUTION_BASIS.RANGE
  };
}

function currentEndpointFrame(model) {
  return createEndpointFrame(model.resolution, model.resolutionBasis);
}

function usableEndpointFrame(frame, address, range) {
  const resolution = frame?.resolution;
  return Boolean(
    resolution
    && Number.isFinite(address)
    && Number.isFinite(resolution.L)
    && Number.isFinite(resolution.C)
    && Number.isFinite(resolution.R)
    && resolution.L >= range.start - EPSILON
    && resolution.R <= range.end + EPSILON
    && resolution.L <= resolution.C
    && resolution.C <= resolution.R
    && Math.abs(resolution.C - address) <= EPSILON
  );
}

function resolveEndpointFrame(frame, address, opposite, range) {
  if (usableEndpointFrame(frame, address, range)) {
    return createEndpointFrame(
      frame.resolution,
      isRangeNeighborhood(frame.resolution, range)
        ? RESOLUTION_BASIS.RANGE
        : frame.resolutionBasis
    );
  }
  const resolution = seedNeighborhoodFromMovement(opposite, address, range);
  return createEndpointFrame(
    resolution,
    isRangeNeighborhood(resolution, range)
      ? RESOLUTION_BASIS.RANGE
      : RESOLUTION_BASIS.MOVEMENT
  );
}

function resolveIntervalEndpointFrame(frame, address, opposite, interval, range) {
  const resolved = resolveEndpointFrame(frame, address, opposite, range);
  const resolution = containExtent(resolved.resolution, interval, range);
  return createEndpointFrame(
    resolution,
    isRangeNeighborhood(resolution, range)
      ? RESOLUTION_BASIS.RANGE
      : resolved.resolutionBasis
  );
}

function syncIntervalEndpointFrames(model) {
  if (!model.interval) return;
  model.resolution = containExtent(model.resolution, model.interval, model.range);
  model.interval.departureFrame = resolveIntervalEndpointFrame(
    model.interval.departureFrame,
    model.interval.departure,
    model.interval.arrival,
    model.interval,
    model.range
  );
  model.interval.arrivalFrame = currentEndpointFrame(model);
}

export function createInterval(departure, arrival, operator, medium = "direct", endpointFrames = {}) {
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
    departureFrame: clone(endpointFrames.departureFrame) || null,
    arrivalFrame: clone(endpointFrames.arrivalFrame) || null,
    createdAt: Date.now()
  };
}

function stepIntervalAnchor(model, sourceInterval = model.interval) {
  const current = model.resolution.C;
  if (
    !sourceInterval
    || !Number.isFinite(sourceInterval.departure)
    || !Number.isFinite(sourceInterval.arrival)
    || Math.abs(sourceInterval.arrival - current) > EPSILON
  ) return current;
  return sourceInterval.departure;
}

export function createSession({ duration = 0, current = 0, guide = createGuide(), stepReach = DEFAULT_STEP_REACH } = {}) {
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
      stepReach: normalizeStepReach(stepReach),
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
    stepReach: normalizeStepReach(model.stepReach),
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

function focusKind(focus) {
  if (!focus) return null;
  if (focus.kind === FOCUS_KIND.WORKING) return FOCUS_KIND.WORKING;
  if (focus.kind === FOCUS_KIND.SAVED || focus.sectionId) return FOCUS_KIND.SAVED;
  return null;
}

function reconcileFocusDraft(model) {
  if (
    !model.focus
    || focusKind(model.focus) === FOCUS_KIND.WORKING
    || resolveSection(model.guide, model.focus.sectionId)
  ) {
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
  syncIntervalEndpointFrames(draft);

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
  syncIntervalEndpointFrames(draft);
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

  const sourceInterval = clone(
    options.originInterval === undefined ? model.interval : options.originInterval
  );
  const movementDepartureFrame = currentEndpointFrame(model);
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

    model.resolution = stepNeighborhood(
      baseNeighborhood,
      resolvedDestination,
      model.range,
      options.stepSeconds
    );
    finalDestination = model.resolution.C;
    model.resolutionBasis = isRangeNeighborhood(model.resolution, model.range)
      ? RESOLUTION_BASIS.RANGE
      : baseBasis;
  } else if (options.mode === "linear") {
    const baseNeighborhood = clone(options.originResolution || model.resolution);
    const baseBasis = options.originResolutionBasis
      || model.resolutionBasis
      || RESOLUTION_BASIS.RANGE;
    model.resolution = translateNeighborhood(
      baseNeighborhood,
      resolvedDestination,
      model.range
    );
    finalDestination = model.resolution.C;
    model.resolutionBasis = isRangeNeighborhood(model.resolution, model.range)
      ? RESOLUTION_BASIS.RANGE
      : baseBasis;
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

  const intervalDeparture = Number.isFinite(options.intervalDeparture)
    ? options.intervalDeparture
    : departure;
  const inheritedDepartureFrame = sourceInterval
    && Math.abs(sourceInterval.departure - intervalDeparture) <= EPSILON
    ? sourceInterval.departureFrame
    : null;
  const originDepartureFrame = createEndpointFrame(
    options.originResolution,
    options.originResolutionBasis
  );
  const intervalDepartureFrame = clone(options.intervalDepartureFrame)
    || clone(inheritedDepartureFrame)
    || (
      Math.abs((originDepartureFrame?.resolution.C ?? NaN) - intervalDeparture) <= EPSILON
        ? originDepartureFrame
        : null
    )
    || (
      Math.abs(intervalDeparture - departure) <= EPSILON
        ? movementDepartureFrame
        : resolveEndpointFrame(null, intervalDeparture, finalDestination, model.range)
    );
  const intervalArrivalFrame = currentEndpointFrame(model);
  model.interval = createInterval(
    intervalDeparture,
    finalDestination,
    options.operator || "go",
    options.medium || "direct",
    {
      departureFrame: intervalDepartureFrame,
      arrivalFrame: intervalArrivalFrame
    }
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
    ...(options.refineRelation ? { refineRelation: options.refineRelation } : {}),
    interval: model.interval,
    place: model.resolution.C
  };
}

export function goTo(session, destination, options = {}) {
  const label = options.label || "Go";
  const perform = draft => moveDraft(draft, destination, options);
  return options.amend ? amend(session, perform) : commit(session, label, perform, options);
}

function refineIntervalRelation(model, target) {
  const current = model.resolution.C;
  const interval = model.interval;
  const relation = classifyRefineRelation(interval, current, target);
  return relation === "shorten"
    ? { departure: interval.departure, relation: "shorten" }
    : { departure: current, relation: "replace" };
}

export function refine(session, direction) {
  const target = getTargets(session.model.resolution)[direction];
  if (target === null) return unchanged(session, "no-destination");
  const backward = direction === "backward";
  const intervalRelation = refineIntervalRelation(session.model, target);
  return goTo(session, target, {
    mode: "refine",
    operator: backward ? "refineBackward" : "refineForward",
    label: backward ? "Refine Backward" : "Refine Forward",
    intervalDeparture: intervalRelation.departure,
    refineRelation: intervalRelation.relation
  });
}

export function step(session, direction, seconds = null, options = {}) {
  const configured = normalizeStepReach(session.model.stepReach);
  const reach = Number.isFinite(Number(seconds)) && Number(seconds) > 0
    ? Number(seconds)
    : configured[direction];
  const target = stepTarget(session.model.resolution.C, reach, direction, session.model.range);
  if (Math.abs(target - session.model.resolution.C) <= EPSILON) return unchanged(session, "range-edge");
  const backward = direction === "backward";
  const intervalDeparture = Number.isFinite(options.intervalDeparture)
    ? options.intervalDeparture
    : stepIntervalAnchor(session.model, options.originInterval ?? session.model.interval);
  return goTo(session, target, {
    mode: "step",
    operator: backward ? "stepBackward" : "stepForward",
    label: backward ? "Step Backward" : "Step Forward",
    departure: options.departure,
    intervalDeparture,
    originInterval: options.originInterval,
    originResolution: options.originResolution,
    originResolutionBasis: options.originResolutionBasis,
    stepSeconds: reach,
    amend: options.amend
  });
}

export function setStepReach(session, nextReach, label = "Set Step Reach") {
  const current = normalizeStepReach(session.model.stepReach);
  const next = normalizeStepReach(nextReach, current);
  const unchangedReach = Math.abs(current.backward - next.backward) <= EPSILON
    && Math.abs(current.forward - next.forward) <= EPSILON
    && current.linked === next.linked;
  if (unchangedReach) return unchanged(session, "unchanged-step-reach", { stepReach: current });

  return commit(session, label, draft => {
    draft.stepReach = next;
    return { changed: true, stepReach: next };
  });
}

export function reopen(session) {
  if (!canReopen(session.model.resolution, session.model.range)) {
    return unchanged(session, "already-open");
  }
  return commit(session, "Reopen", draft => {
    draft.resolution = reopenToRange(draft.resolution.C, draft.range);
    draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
    return { changed: true };
  });
}

export function switchEndpoint(session) {
  const interval = session.model.interval;
  if (!interval) return unchanged(session, "no-interval");

  return commit(session, "Switch Endpoint", draft => {
    const active = clone(draft.interval);
    if (!active) return { changed: false, reason: "no-interval" };
    const departure = active.departure;
    const arrival = active.arrival;
    const frameBeingLeft = currentEndpointFrame(draft);
    const frameBeingEntered = resolveIntervalEndpointFrame(
      active.departureFrame,
      departure,
      arrival,
      active,
      draft.range
    );

    draft.resolution = clone(frameBeingEntered.resolution);
    draft.resolutionBasis = frameBeingEntered.resolutionBasis;
    draft.interval = {
      ...active,
      departure: arrival,
      arrival: departure,
      direction: departure < arrival ? "backward" : "forward",
      departureFrame: frameBeingLeft,
      arrivalFrame: frameBeingEntered
    };

    return {
      changed: true,
      place: draft.resolution.C,
      interval: draft.interval
    };
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
    focusKind(session.model.focus) === FOCUS_KIND.SAVED
    && session.model.focus?.sectionId === sectionId
    && Math.abs(session.model.range.start - section.start) <= EPSILON
    && Math.abs(session.model.range.end - section.end) <= EPSILON
  ) return unchanged(session, "already-focused");

  return commit(session, `Focus “${section.label}”`, draft => {
    const resolved = resolveSection(draft.guide, sectionId);
    const departure = draft.resolution.C;
    const returnRange = draft.focus?.returnRange || clone(draft.range);
    draft.focus = { kind: FOCUS_KIND.SAVED, sectionId, returnRange };
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

export function focusWorkingSection(session) {
  const interval = session.model.interval;
  if (!interval) return unchanged(session, "no-interval");
  if (
    focusKind(session.model.focus) === FOCUS_KIND.WORKING
    && Math.abs(session.model.range.start - interval.start) <= EPSILON
    && Math.abs(session.model.range.end - interval.end) <= EPSILON
  ) return unchanged(session, "already-focused");

  return commit(session, "Focus Working Section", draft => {
    const working = clone(draft.interval);
    if (!working) return { changed: false, reason: "no-interval" };
    const departure = draft.resolution.C;
    const returnRange = draft.focus?.returnRange || clone(draft.range);
    draft.focus = {
      kind: FOCUS_KIND.WORKING,
      extent: { start: working.start, end: working.end },
      returnRange
    };
    draft.range = { start: working.start, end: working.end };
    const current = clamp(departure, working.start, working.end);
    draft.resolution = createRoot(working.start, current, working.end);
    draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
    return {
      changed: true,
      rangeChanged: true,
      workingSection: clone(draft.focus.extent),
      ...(Math.abs(current - departure) > EPSILON ? { place: current } : {})
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

export function projectPlayback(model, options = {}) {
  const originModel = snapshotModel(options.returnModel || model);
  const departure = Number.isFinite(options.departure)
    ? options.departure
    : originModel.resolution.C;
  const requestedCurrent = Number(options.current);
  const current = clamp(
    Number.isFinite(requestedCurrent) ? requestedCurrent : departure,
    model.range.start,
    model.range.end
  );
  const projected = snapshotModel(model);
  if (Math.abs(current - departure) <= EPSILON) {
    return {
      changed: false,
      current,
      model: projected
    };
  }

  const sourceInterval = clone(originModel.interval);
  const intervalDeparture = stepIntervalAnchor(originModel, sourceInterval);
  const parentNeighborhood = clone(
    options.parentNeighborhood
    || originModel.resolution
    || projected.resolution
  );
  const parentBasis = options.parentResolutionBasis
    || originModel.resolutionBasis
    || projected.resolutionBasis
    || RESOLUTION_BASIS.RANGE;
  projected.resolution = translateNeighborhood(parentNeighborhood, current, projected.range);
  projected.resolutionBasis = isRangeNeighborhood(projected.resolution, projected.range)
    ? RESOLUTION_BASIS.RANGE
    : parentBasis;
  const inheritedDepartureFrame = sourceInterval
    && Math.abs(sourceInterval.departure - intervalDeparture) <= EPSILON
    ? sourceInterval.departureFrame
    : null;
  const departureFrame = clone(inheritedDepartureFrame)
    || createEndpointFrame(parentNeighborhood, parentBasis);
  projected.interval = createInterval(
    intervalDeparture,
    current,
    options.operator || "playback",
    "continuous",
    {
      departureFrame,
      arrivalFrame: currentEndpointFrame(projected)
    }
  );
  syncIntervalEndpointFrames(projected);

  return {
    changed: true,
    current,
    intervalDeparture,
    model: projected
  };
}

export function completePlayback(session, options) {
  const projection = projectPlayback(session.model, options);
  if (!projection.changed) return unchanged(session, "no-movement");

  const playbackCheckpoint = snapshotModel(options.returnModel || session.model);
  // Playback owns the spatial path captured when it started. Semantic values
  // that may legitimately change while it runs (currently Held Field Reach and
  // retained Guide edits) must remain in the checkpoint immediately before
  // settlement so Undo does not skip those intervening transactions.
  playbackCheckpoint.stepReach = normalizeStepReach(session.model.stepReach);
  playbackCheckpoint.guide = session.model.guide;
  return commit(session, options.label || "Playback", draft => {
    draft.resolution = clone(projection.model.resolution);
    draft.resolutionBasis = projection.model.resolutionBasis;
    draft.interval = clone(projection.model.interval);
    return {
      changed: true,
      place: projection.current,
      interval: draft.interval
    };
  }, { returnModel: playbackCheckpoint });
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
    ? findDuplicateSection(
      session.model.guide,
      startPin.id,
      endPin.id,
      text
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

export function overwriteGuideSection(session, sectionId) {
  const section = resolveSection(session.model.guide, sectionId);
  const interval = session.model.interval;
  if (!section) return unchanged(session, "missing-section");
  if (!interval) return unchanged(session, "no-interval");

  const sameExtent = Math.abs(section.start - interval.start) <= EPSILON
    && Math.abs(section.end - interval.end) <= EPSILON;
  if (sameExtent) return unchanged(session, "unchanged-section", { value: section });

  const startPin = findPinAt(session.model.guide, interval.start);
  const endPin = findPinAt(session.model.guide, interval.end);
  if (
    startPin
    && endPin
    && findDuplicateSection(
      session.model.guide,
      startPin.id,
      endPin.id,
      section.label,
      section.id
    )
  ) {
    return unchanged(session, "duplicate-section", { value: section });
  }

  return commit(session, `Overwrite “${section.label}”`, draft => {
    const value = replaceSectionExtent(
      draft.guide,
      sectionId,
      draft.interval.start,
      draft.interval.end,
      { provenance: `working:${draft.interval.operator}` }
    );
    const focusedTarget = focusKind(draft.focus) === FOCUS_KIND.SAVED
      && draft.focus.sectionId === sectionId;
    let moved = false;
    let intervalCleared = false;

    if (focusedTarget) {
      const departure = draft.resolution.C;
      draft.range = { start: value.start, end: value.end };
      const current = clamp(departure, value.start, value.end);
      draft.resolution = createRoot(value.start, current, value.end);
      draft.resolutionBasis = RESOLUTION_BASIS.RANGE;
      moved = Math.abs(current - departure) > EPSILON;
      intervalCleared = clearIntervalOutsideRange(draft);
    }

    return {
      changed: true,
      guideChanged: true,
      value,
      ...(focusedTarget ? { rangeChanged: true, intervalCleared } : {}),
      ...(moved ? { place: draft.resolution.C } : {})
    };
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
  if (findDuplicateSection(
    session.model.guide,
    section.startPinId,
    section.endPinId,
    text,
    section.id
  )) return unchanged(session, "duplicate-section", { value: section });
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

export function undo(session) {
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

// Compatibility name for existing imports. Canonical interface vocabulary is Undo.
export const returnState = undo;

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
