// Immutable semantic kernel and Undo history. This module does not touch the DOM or media players.
import { sectionDisplayName } from "./format.js";
import {
  EPSILON,
  NEIGHBORHOOD_BASIS,
  clamp,
  contains,
  containExtent,
  createRoot,
  getTargets,
  classifyRetainedRefineRelation,
  refineNeighborhood,
  seedNeighborhoodFromMovement,
  isRangeNeighborhood,
  reopenToRange,
  canReopen,
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
  isSectionWeight,
  normalizeSectionWeight,
  setSectionWeight,
  DEFAULT_GROUP_ID,
  visibleGroup,
  createGroup,
  setGroupState,
  groupIsVisible,
  groupLabelTaken,
  nextGroupLabel,
  assignSectionGroup,
  deleteGroup,
  groupDeletionPlan,
  movePin,
  translateSection,
  createSection,
  createSectionFromTimes,
  findDuplicateSection,
  renameSection,
  deleteSection,
  resolveSection,
  unlinkSectionEndpoint,
  linkPins,
  validateGuide
} from "./guide.js";
import { projectionForModel } from "./timeline-projection.js";

const HISTORY_LIMIT = 100;
export const MIN_RANGE_SECONDS = 0.25;
export const MIN_STEP_REACH_SECONDS = 0.25;
export const MAX_STEP_REACH_SECONDS = 300;
export const STEP_REACH_MODE = Object.freeze({
  FIXED: "fixed",
  ADAPTIVE: "adaptive"
});
export const DEFAULT_STEP_FRACTION = 1 / 16;
export const FOCUS_KIND = Object.freeze({
  SAVED: "saved-section",
  ACTIVE_SPAN: "active-span"
});

// Focus makes its extent the active world. Spatial Range boundary controls must
// therefore stand down until Focus is left; exact retained-object editing may
// still rebase that world through the Guide. One shared predicate keeps every
// surface from inventing its own exception.
export function focusOwnsRangeBoundaries(model) {
  return Boolean(model?.focus);
}

const DEFAULT_STEP_REACH = Object.freeze({
  backward: 10,
  forward: 10,
  linked: true,
  mode: STEP_REACH_MODE.FIXED,
  fraction: DEFAULT_STEP_FRACTION
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
    return {
      backward: reach,
      forward: reach,
      linked: true,
      mode: STEP_REACH_MODE.FIXED,
      fraction: DEFAULT_STEP_FRACTION
    };
  }

  const source = value && typeof value === "object" ? value : fallbackSource;
  const linked = source.linked !== false;
  const mode = source.mode === STEP_REACH_MODE.ADAPTIVE
    ? STEP_REACH_MODE.ADAPTIVE
    : STEP_REACH_MODE.FIXED;
  const candidateFraction = Number(source.fraction);
  const fallbackFraction = Number(fallbackSource.fraction);
  const fraction = clamp(
    Number.isFinite(candidateFraction) && candidateFraction > 0
      ? candidateFraction
      : Number.isFinite(fallbackFraction) && fallbackFraction > 0
        ? fallbackFraction
        : DEFAULT_STEP_FRACTION,
    1 / 128,
    1
  );
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

  return { backward, forward, linked, mode, fraction };
}

export function effectiveStepReach(value, range, projection = null) {
  const configured = normalizeStepReach(value);
  if (configured.mode !== STEP_REACH_MODE.ADAPTIVE) return configured;
  const width = projection?.timelineDistance
    ? projection.timelineDistance(range.start, range.end)
    : Math.abs(range.end - range.start);
  const candidate = width * configured.fraction;
  const amount = clamp(
    Number.isFinite(candidate) ? candidate : configured.forward,
    MIN_STEP_REACH_SECONDS,
    MAX_STEP_REACH_SECONDS
  );
  return {
    ...configured,
    backward: amount,
    forward: amount,
    linked: true
  };
}
export function copy(value) {
  if (value === null || value === undefined) return value;
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

const clone = copy;

function createEndpointFrame(resolution, neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE) {
  if (
    !resolution
    || !Number.isFinite(resolution.L)
    || !Number.isFinite(resolution.C)
    || !Number.isFinite(resolution.R)
  ) return null;
  return {
    resolution: clone(resolution),
    neighborhoodBasis: neighborhoodBasis || NEIGHBORHOOD_BASIS.RANGE
  };
}

function currentEndpointFrame(model) {
  return createEndpointFrame(model.resolution, model.neighborhoodBasis);
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

function resolveEndpointFrame(frame, address, opposite, range, metric = null) {
  if (usableEndpointFrame(frame, address, range)) {
    const current = clamp(address, range.start, range.end);
    const resolution = {
      L: Math.min(current, clamp(frame.resolution.L, range.start, range.end)),
      C: current,
      R: Math.max(current, clamp(frame.resolution.R, range.start, range.end)),
      level: frame.resolution.level ?? 0
    };
    return createEndpointFrame(
      resolution,
      isRangeNeighborhood(resolution, range)
        ? NEIGHBORHOOD_BASIS.RANGE
        : frame.neighborhoodBasis
    );
  }
  const resolution = seedNeighborhoodFromMovement(opposite, address, range, metric);
  return createEndpointFrame(
    resolution,
    isRangeNeighborhood(resolution, range)
      ? NEIGHBORHOOD_BASIS.RANGE
      : NEIGHBORHOOD_BASIS.MOVEMENT
  );
}

function resolveIntervalEndpointFrame(frame, address, opposite, interval, range, metric = null) {
  const resolved = resolveEndpointFrame(frame, address, opposite, range, metric);
  const resolution = containExtent(resolved.resolution, interval, range);
  return createEndpointFrame(
    resolution,
    isRangeNeighborhood(resolution, range)
      ? NEIGHBORHOOD_BASIS.RANGE
      : resolved.neighborhoodBasis
  );
}

function syncIntervalEndpointFrames(model, suppliedMetric = null) {
  if (!model.interval) return;
  const metric = suppliedMetric || projectionForModel(model).metric;
  const preserveRefinementLevel = [
    "refineBackward",
    "refineForward"
  ].includes(model.interval.operator);
  const activeLevel = model.resolution.level;
  model.resolution = containExtent(model.resolution, model.interval, model.range);
  if (preserveRefinementLevel) model.resolution.level = activeLevel;

  const interval = model.interval;
  const activeEnd = interval.activeEnd === "start" || interval.activeEnd === "end"
    ? interval.activeEnd
    : Math.abs(interval.arrival - interval.start) <= EPSILON
      ? "start"
      : "end";
  const currentFrame = currentEndpointFrame(model);
  const currentAtStart = Math.abs(model.resolution.C - interval.start) <= EPSILON;
  const currentAtEnd = Math.abs(model.resolution.C - interval.end) <= EPSILON;
  const startFrame = resolveIntervalEndpointFrame(
    currentAtStart
      ? currentFrame
      : interval.startFrame || (
        Math.abs(interval.departure - interval.start) <= EPSILON
          ? interval.departureNeighborhood
          : Math.abs(interval.arrival - interval.start) <= EPSILON
            ? interval.arrivalNeighborhood
            : null
      ),
    interval.start,
    interval.end,
    model.interval,
    model.range,
    metric
  );
  const endFrame = resolveIntervalEndpointFrame(
    currentAtEnd
      ? currentFrame
      : interval.endFrame || (
        Math.abs(interval.departure - interval.end) <= EPSILON
          ? interval.departureNeighborhood
          : Math.abs(interval.arrival - interval.end) <= EPSILON
            ? interval.arrivalNeighborhood
            : null
      ),
    interval.end,
    interval.start,
    model.interval,
    model.range,
    metric
  );

  interval.activeEnd = activeEnd;
  interval.startFrame = startFrame;
  interval.endFrame = endFrame;
  interval.departure = activeEnd === "start" ? interval.end : interval.start;
  interval.arrival = model.resolution.C;
  interval.direction = interval.arrival < interval.departure
    ? "backward"
    : "forward";
  interval.departureNeighborhood = clone(
    activeEnd === "start" ? endFrame : startFrame
  );
  interval.arrivalNeighborhood = currentEndpointFrame(model);
}

function createActiveSpan(departure, arrival, operator, medium = "direct", endpointFrames = {}) {
  if (
    !Number.isFinite(departure)
    || !Number.isFinite(arrival)
    || Math.abs(arrival - departure) <= EPSILON
  ) return null;

  const minimum = Math.min(departure, arrival);
  const maximum = Math.max(departure, arrival);
  const start = Number.isFinite(endpointFrames.extent?.start)
    ? Math.min(endpointFrames.extent.start, minimum)
    : minimum;
  const end = Number.isFinite(endpointFrames.extent?.end)
    ? Math.max(endpointFrames.extent.end, maximum)
    : maximum;
  const activeEnd = endpointFrames.activeEnd === "start"
    || endpointFrames.activeEnd === "end"
    ? endpointFrames.activeEnd
    : Math.abs(arrival - start) <= EPSILON
      ? "start"
      : "end";
  const departureNeighborhood = clone(endpointFrames.departureNeighborhood) || null;
  const arrivalNeighborhood = clone(endpointFrames.arrivalNeighborhood) || null;
  const startFrame = clone(endpointFrames.startFrame) || (
    departure <= arrival ? departureNeighborhood : arrivalNeighborhood
  );
  const endFrame = clone(endpointFrames.endFrame) || (
    departure <= arrival ? arrivalNeighborhood : departureNeighborhood
  );

  return {
    start,
    end,
    departure,
    arrival,
    activeEnd,
    operator,
    medium,
    direction: arrival < departure ? "backward" : "forward",
    departureNeighborhood,
    arrivalNeighborhood,
    startFrame,
    endFrame,
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
      neighborhoodBasis: NEIGHBORHOOD_BASIS.RANGE,
      lastOperator: null,
      focus: null,
      interval: null,
      stepReach: normalizeStepReach(stepReach),
      guide
    },
    history: [],
    future: []
  };
}

export function snapshotModel(model, options = {}) {
  return {
    duration: model.duration,
    range: clone(model.range),
    resolution: clone(model.resolution),
    neighborhoodBasis: model.neighborhoodBasis || NEIGHBORHOOD_BASIS.RANGE,
    lastOperator: model.lastOperator || null,
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
  const next = [...(history || []), entry];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function focusKind(focus) {
  if (!focus) return null;
  if (focus.kind === FOCUS_KIND.ACTIVE_SPAN) return FOCUS_KIND.ACTIVE_SPAN;
  if (focus.kind === FOCUS_KIND.SAVED || focus.sectionId) return FOCUS_KIND.SAVED;
  return null;
}

function reconcileFocusDraft(model) {
  if (
    !model.focus
    || focusKind(model.focus) === FOCUS_KIND.ACTIVE_SPAN
    || resolveSection(model.guide, model.focus.sectionId)
  ) {
    return { changed: false, moved: false, intervalCleared: false };
  }

  const returnRange = clone(model.focus.returnRange) || { start: 0, end: model.duration };
  const departure = model.resolution.C;
  const current = clamp(departure, returnRange.start, returnRange.end);
  model.range = returnRange;
  model.resolution = createRoot(returnRange.start, current, returnRange.end);
  model.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
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
  syncIntervalEndpointFrames(draft, options.projection?.metric);

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
      }),
      future: []
    }
  };
}

function amend(session, transform, options = {}) {
  const draft = snapshotModel(session.model, {
    cloneGuide: Boolean(options.guideEdit)
  });
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
  syncIntervalEndpointFrames(draft, options.projection?.metric);
  return {
    ...detail,
    changed: true,
    session: {
      model: draft,
      history: session.history || [],
      future: session.future || []
    }
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
  const interval = model.interval;
  if (!interval) return false;
  if (!intervalInsideRange(interval, model.range)) {
    model.interval = null;
    return true;
  }

  const previousStart = interval.start;
  const previousEnd = interval.end;
  interval.start = clamp(previousStart, model.range.start, model.range.end);
  interval.end = clamp(previousEnd, model.range.start, model.range.end);
  for (const key of ["departure", "arrival"]) {
    if (Math.abs(interval[key] - previousStart) <= EPSILON) interval[key] = interval.start;
    else if (Math.abs(interval[key] - previousEnd) <= EPSILON) interval[key] = interval.end;
  }
  if (interval.end - interval.start <= EPSILON) {
    model.interval = null;
    return true;
  }
  return false;
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
  model.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
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
  // Leaving Focus or opening Full Video can change the active Range. Derive the
  // movement frame only after that composite scope transition is complete.
  const metric = options.projection?.metric || projectionForModel(model).metric;
  const rangeChanged = opening.changed;
  const resolvedDestination = clamp(boundedDestination, model.range.start, model.range.end);
  let finalDestination = resolvedDestination;

  // Direct Go at Current is a true no-op. Reopen is the one explicit operation
  // that discards local scale while retaining Current and Interval.
  if (Math.abs(resolvedDestination - model.resolution.C) <= EPSILON) {
    if (rangeChanged) model.lastOperator = options.operator || "go";
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
      || model.neighborhoodBasis
      || NEIGHBORHOOD_BASIS.RANGE;

    model.resolution = stepNeighborhood(
      baseNeighborhood,
      resolvedDestination,
      model.range,
      options.stepSeconds,
      metric
    );
    finalDestination = model.resolution.C;
    model.neighborhoodBasis = isRangeNeighborhood(model.resolution, model.range)
      ? NEIGHBORHOOD_BASIS.RANGE
      : baseBasis;
  } else if (options.mode === "linear") {
    const baseNeighborhood = clone(options.originResolution || model.resolution);
    const baseBasis = options.originResolutionBasis
      || model.neighborhoodBasis
      || NEIGHBORHOOD_BASIS.RANGE;
    model.resolution = translateNeighborhood(
      baseNeighborhood,
      resolvedDestination,
      model.range,
      metric
    );
    finalDestination = model.resolution.C;
    model.neighborhoodBasis = isRangeNeighborhood(model.resolution, model.range)
      ? NEIGHBORHOOD_BASIS.RANGE
      : baseBasis;
  } else {
    // Direct Go abandons the preceding recursive path while retaining the scale
    // communicated by the actual movement. The crossed Interval forms one side
    // of the next Neighborhood; Reopen restores Range-level availability.
    model.resolution = seedNeighborhoodFromMovement(
      departure,
      resolvedDestination,
      model.range,
      metric
    );
    model.neighborhoodBasis = isRangeNeighborhood(model.resolution, model.range)
      ? NEIGHBORHOOD_BASIS.RANGE
      : NEIGHBORHOOD_BASIS.MOVEMENT;
  }

  const intervalDeparture = Number.isFinite(options.intervalDeparture)
    ? options.intervalDeparture
    : departure;
  const inheritedDepartureFrame = sourceInterval
    && Math.abs(sourceInterval.departure - intervalDeparture) <= EPSILON
    ? sourceInterval.departureNeighborhood
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
        : resolveEndpointFrame(
          null,
          intervalDeparture,
          finalDestination,
          model.range,
          metric
        )
    );
  const intervalArrivalFrame = currentEndpointFrame(model);
  model.interval = createActiveSpan(
    intervalDeparture,
    finalDestination,
    options.operator || "go",
    options.medium || "direct",
    {
      departureNeighborhood: intervalDepartureFrame,
      arrivalNeighborhood: intervalArrivalFrame
    }
  );
  model.lastOperator = options.operator || "go";

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

export function goToGuidePin(session, pinId, options = {}) {
  const pin = getPin(session.model.guide, pinId);
  if (!pin) return unchanged(session, "missing-pin");
  return goTo(session, pin.t, {
    ...options,
    operator: options.operator || "pin",
    label: options.label || "Go to Pin"
  });
}

export function workFromExtent(session, extent, options = {}) {
  const start = Number(extent?.start);
  const end = Number(extent?.end);
  if (
    !Number.isFinite(start)
    || !Number.isFinite(end)
    || end <= start + EPSILON
  ) return unchanged(session, "invalid-extent");
  const midpoint = options.projection
    ? options.projection.timelineMidpoint(start, end)
    : (start + end) / 2;
  const label = options.label || "Select Section";
  return commit(session, label, model => {
    const current = model.resolution.C;
    const operator = options.operator || "section";
    const alreadySelected = (
      Math.abs(model.resolution.L - start) <= EPSILON
      && Math.abs(model.resolution.C - midpoint) <= EPSILON
      && Math.abs(model.resolution.R - end) <= EPSILON
      && Math.abs((model.interval?.start ?? NaN) - start) <= EPSILON
      && Math.abs((model.interval?.end ?? NaN) - end) <= EPSILON
      && model.interval?.operator === operator
    );
    if (alreadySelected) return { changed: false, reason: "selected-section" };

    const startOpening = openAddress(model, start);
    const endOpening = openAddress(model, end);
    model.resolution = createRoot(start, midpoint, end);
    model.neighborhoodBasis = isRangeNeighborhood(model.resolution, model.range)
      ? NEIGHBORHOOD_BASIS.RANGE
      : NEIGHBORHOOD_BASIS.MOVEMENT;
    model.interval = createActiveSpan(
      start,
      midpoint,
      operator,
      options.medium || "retained",
      {
        extent: { start, end },
        activeEnd: "end"
      }
    );
    model.lastOperator = operator;

    return {
      changed: true,
      departure: current,
      destination: midpoint,
      current: midpoint,
      place: midpoint,
      interval: model.interval,
      rangeChanged: startOpening.changed || endOpening.changed,
      leftFocus: startOpening.leftFocus || endOpening.leftFocus,
      openedFullVideo: startOpening.openedFullVideo || endOpening.openedFullVideo
    };
  }, options);
}

export function goToGuideSection(session, sectionId, options = {}) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  return workFromExtent(session, section, {
    ...options,
    label: options.label || "Select Section",
    operator: options.operator || "section"
  });
}

function retainedRefineIntervalRelation(model, target) {
  const current = model.resolution.C;
  const relation = classifyRetainedRefineRelation(model.interval, current, target);
  return relation === "retain"
    ? { departure: model.interval.departure, relation }
    : { departure: current, relation };
}

export function localRefine(session, direction, options = {}) {
  const projection = options.projection || projectionForModel(session.model);
  const metric = projection.metric;
  const target = getTargets(session.model.resolution, metric)[direction];
  if (target === null) return unchanged(session, "no-destination");
  const backward = direction === "backward";
  const current = session.model.resolution.C;
  return goTo(session, target, {
    mode: "refine",
    operator: backward ? "localRefineBackward" : "localRefineForward",
    label: backward ? "Local Refine Backward" : "Local Refine Forward",
    intervalDeparture: current,
    refineRelation: "draw",
    projection
  });
}

export function refine(session, direction, options = {}) {
  const projection = options.projection || projectionForModel(session.model);
  const target = getTargets(session.model.resolution, projection.metric)[direction];
  if (target === null) return unchanged(session, "no-destination");
  const backward = direction === "backward";
  const intervalRelation = retainedRefineIntervalRelation(session.model, target);
  return goTo(session, target, {
    mode: "refine",
    operator: backward ? "refineBackward" : "refineForward",
    label: backward ? "Refine Backward" : "Refine Forward",
    intervalDeparture: intervalRelation.departure,
    refineRelation: intervalRelation.relation,
    projection
  });
}

export function step(session, direction, seconds = null, options = {}) {
  const projection = options.projection || projectionForModel(session.model);
  const configured = effectiveStepReach(
    session.model.stepReach,
    session.model.range,
    projection
  );
  const reach = Number.isFinite(Number(seconds)) && Number(seconds) > 0
    ? Number(seconds)
    : configured[direction];
  const target = projection.stepTarget(
    session.model.resolution.C,
    reach,
    direction,
    session.model.range
  );
  // "Did this land somewhere else?" is a question about Addresses, so it is
  // asked in source time. EPSILON is the semantic tolerance between two
  // Addresses; measuring a Timeline distance against it compares a length in one
  // space to a tolerance from the other, and the two only agree where the map is
  // undeformed. Under compression a real movement is a short Timeline distance —
  // that is what compression means — so this refused every Nudge inside a
  // compressed Section while the identical Nudge worked on a normalized map.
  // The threshold was ρ > EPSILON / reach, which no reader could have guessed.
  if (
    Math.abs(target - session.model.resolution.C) <= EPSILON
  ) return unchanged(session, "range-edge");
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
    amend: options.amend,
    projection
  });
}

export function stepToPin(session, destination, direction, options = {}) {
  if (!Number.isFinite(destination)) return unchanged(session, "no-destination");
  const backward = direction === "backward";
  const projection = options.projection || projectionForModel(session.model);
  const configured = effectiveStepReach(
    session.model.stepReach,
    session.model.range,
    projection
  );
  const reach = Number.isFinite(Number(options.stepSeconds))
    && Number(options.stepSeconds) > 0
    ? Number(options.stepSeconds)
    : configured[direction];
  const intervalDeparture = Number.isFinite(options.intervalDeparture)
    ? options.intervalDeparture
    : stepIntervalAnchor(session.model, options.originInterval ?? session.model.interval);
  return goTo(session, destination, {
    mode: "step",
    operator: backward ? "pinBackward" : "pinForward",
    label: backward ? "Previous Pin" : "Next Pin",
    intervalDeparture,
    originInterval: options.originInterval,
    originResolution: options.originResolution,
    originResolutionBasis: options.originResolutionBasis,
    stepSeconds: reach,
    amend: options.amend,
    projection
  });
}

export function setStepReach(session, nextReach, label = "Set Step Reach") {
  const current = normalizeStepReach(session.model.stepReach);
  const next = normalizeStepReach(nextReach, current);
  const unchangedReach = Math.abs(current.backward - next.backward) <= EPSILON
    && Math.abs(current.forward - next.forward) <= EPSILON
    && current.linked === next.linked
    && current.mode === next.mode
    && Math.abs(current.fraction - next.fraction) <= Number.EPSILON;
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
    draft.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
    draft.lastOperator = "reopen";
    return { changed: true };
  });
}

export function switchActiveEnd(session, options = {}) {
  const interval = session.model.interval;
  if (!interval) return unchanged(session, "no-interval");

  return commit(session, "Switch End", draft => {
    const active = clone(draft.interval);
    if (!active) return { changed: false, reason: "no-interval" };
    const metric = options.projection?.metric || projectionForModel(draft).metric;
    const activeEnd = active.activeEnd === "start" || active.activeEnd === "end"
      ? active.activeEnd
      : Math.abs(active.arrival - active.start) <= EPSILON
        ? "start"
        : "end";
    const nextSide = activeEnd === "start" ? "end" : "start";
    const departure = nextSide === "start" ? active.start : active.end;
    const retainedDeparture = activeEnd === "start" ? active.start : active.end;
    const frameBeingLeft = resolveIntervalEndpointFrame(
      activeEnd === "start" ? active.startFrame : active.endFrame,
      retainedDeparture,
      departure,
      active,
      draft.range,
      metric
    );
    const frameBeingEntered = resolveIntervalEndpointFrame(
      nextSide === "start" ? active.startFrame : active.endFrame,
      departure,
      retainedDeparture,
      active,
      draft.range,
      metric
    );

    draft.resolution = clone(frameBeingEntered.resolution);
    draft.neighborhoodBasis = frameBeingEntered.neighborhoodBasis;
    draft.interval = {
      ...active,
      departure: retainedDeparture,
      arrival: departure,
      activeEnd: nextSide,
      direction: departure < retainedDeparture ? "backward" : "forward",
      departureNeighborhood: frameBeingLeft,
      arrivalNeighborhood: frameBeingEntered
    };

    return {
      changed: true,
      place: draft.resolution.C,
      interval: draft.interval
    };
  }, options);
}

export function releaseInterval(session) {
  if (!session.model.interval) return unchanged(session, "no-interval");
  return commit(session, "Release Active Span", draft => {
    draft.interval = null;
    draft.lastOperator = "release";
    return { changed: true, interval: null };
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
    draft.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
    draft.lastOperator = "range";
    const intervalCleared = clearIntervalOutsideRange(draft);
    return {
      changed: true,
      rangeChanged: true,
      intervalCleared,
      ...(sameCurrent ? {} : { place: draft.resolution.C })
    };
  });
}

export function focusSection(session, sectionId, options = {}) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  if (
    focusKind(session.model.focus) === FOCUS_KIND.SAVED
    && session.model.focus?.sectionId === sectionId
    && Math.abs(session.model.range.start - section.start) <= EPSILON
    && Math.abs(session.model.range.end - section.end) <= EPSILON
  ) return unchanged(session, "already-focused");

  return commit(session, `Focus “${sectionDisplayName(section)}”`, draft => {
    const resolved = resolveSection(draft.guide, sectionId);
    const departure = draft.resolution.C;
    const returnRange = draft.focus?.returnRange || clone(draft.range);
    draft.focus = { kind: FOCUS_KIND.SAVED, sectionId, returnRange };
    draft.range = { start: resolved.start, end: resolved.end };
    const current = contains(draft.range, departure)
      ? departure
      : options.projection
        ? options.projection.timelineMidpoint(resolved.start, resolved.end)
        : resolved.midpoint;
    draft.resolution = createRoot(resolved.start, current, resolved.end);
    draft.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
    draft.lastOperator = "focus";
    const moved = Math.abs(current - departure) > EPSILON;
    const intervalCleared = clearIntervalOutsideRange(draft);
    return {
      changed: true,
      section: resolved,
      rangeChanged: true,
      intervalCleared,
      ...(moved ? { place: current } : {})
    };
  }, options);
}

export function focusWorkingSection(session) {
  const interval = session.model.interval;
  if (!interval) return unchanged(session, "no-interval");
  if (
    focusKind(session.model.focus) === FOCUS_KIND.ACTIVE_SPAN
    && Math.abs(session.model.range.start - interval.start) <= EPSILON
    && Math.abs(session.model.range.end - interval.end) <= EPSILON
  ) return unchanged(session, "already-focused");

  return commit(session, "Focus Active Span", draft => {
    const working = clone(draft.interval);
    if (!working) return { changed: false, reason: "no-interval" };
    const departure = draft.resolution.C;
    const returnRange = draft.focus?.returnRange || clone(draft.range);
    draft.focus = {
      kind: FOCUS_KIND.ACTIVE_SPAN,
      extent: { start: working.start, end: working.end },
      returnRange
    };
    draft.range = { start: working.start, end: working.end };
    const current = clamp(departure, working.start, working.end);
    draft.resolution = createRoot(working.start, current, working.end);
    draft.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
    draft.lastOperator = "focus";
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
    draft.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
    draft.lastOperator = "unfocus";
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
  if (originModel.interval) syncIntervalEndpointFrames(originModel);
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
  const completedCycle = Number(options.cycles) > 0;
  if (Math.abs(current - departure) <= EPSILON && !completedCycle) {
    return {
      changed: false,
      current,
      model: projected
    };
  }

  const sourceInterval = clone(originModel.interval);
  const parentNeighborhood = clone(
    options.parentNeighborhood
    || originModel.resolution
    || projected.resolution
  );
  const parentBasis = options.parentResolutionBasis
    || originModel.neighborhoodBasis
    || projected.neighborhoodBasis
    || NEIGHBORHOOD_BASIS.RANGE;
  projected.resolution = translateNeighborhood(parentNeighborhood, current, projected.range);
  projected.neighborhoodBasis = isRangeNeighborhood(projected.resolution, projected.range)
    ? NEIGHBORHOOD_BASIS.RANGE
    : parentBasis;

  const parentFrame = createEndpointFrame(parentNeighborhood, parentBasis);
  const currentFrame = currentEndpointFrame(projected);
  const pathStart = Math.min(departure, current);
  const pathEnd = Math.max(departure, current);
  const extent = completedCycle
    ? { start: projected.range.start, end: projected.range.end }
    : {
        start: Math.min(sourceInterval?.start ?? pathStart, pathStart),
        end: Math.max(sourceInterval?.end ?? pathEnd, pathEnd)
      };
  const inheritedSide = sourceInterval?.activeEnd === "start"
    || sourceInterval?.activeEnd === "end"
    ? sourceInterval.activeEnd
    : null;
  const activeEnd = current <= extent.start + EPSILON
    ? "start"
    : current >= extent.end - EPSILON
      ? "end"
      : completedCycle
        ? "start"
        : inheritedSide || (current < departure ? "start" : "end");
  const intervalDeparture = activeEnd === "start" ? extent.end : extent.start;

  let startFrame = clone(sourceInterval?.startFrame);
  let endFrame = clone(sourceInterval?.endFrame);
  if (!startFrame && sourceInterval) {
    startFrame = clone(
      Math.abs(sourceInterval.departure - sourceInterval.start) <= EPSILON
        ? sourceInterval.departureNeighborhood
        : sourceInterval.arrivalNeighborhood
    );
  }
  if (!endFrame && sourceInterval) {
    endFrame = clone(
      Math.abs(sourceInterval.departure - sourceInterval.end) <= EPSILON
        ? sourceInterval.departureNeighborhood
        : sourceInterval.arrivalNeighborhood
    );
  }
  if (Math.abs(extent.start - current) <= EPSILON) startFrame = currentFrame;
  else if (Math.abs(extent.start - departure) <= EPSILON) startFrame ||= parentFrame;
  if (Math.abs(extent.end - current) <= EPSILON) endFrame = currentFrame;
  else if (Math.abs(extent.end - departure) <= EPSILON) endFrame ||= parentFrame;

  projected.interval = createActiveSpan(
    intervalDeparture,
    current,
    options.operator || "playback",
    "continuous",
    {
      extent,
      activeEnd,
      startFrame,
      endFrame,
      departureNeighborhood: activeEnd === "start" ? endFrame : startFrame,
      arrivalNeighborhood: currentFrame
    }
  );
  projected.lastOperator = options.operator || "playback";
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
  // that may legitimately change while it runs (Step Reach and retained Guide
  // edits) must remain in the checkpoint immediately before
  // settlement so Undo does not skip those intervening transactions.
  playbackCheckpoint.stepReach = normalizeStepReach(session.model.stepReach);
  playbackCheckpoint.guide = session.model.guide;
  return commit(session, options.label || "Playback", draft => {
    draft.resolution = clone(projection.model.resolution);
    draft.neighborhoodBasis = projection.model.neighborhoodBasis;
    draft.interval = clone(projection.model.interval);
    draft.lastOperator = projection.model.lastOperator;
    return {
      changed: true,
      place: projection.current,
      interval: draft.interval
    };
  }, { returnModel: playbackCheckpoint });
}

export function retainCurrentAsPin(session, label = "") {
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
  if (
    extent.start < -EPSILON
    || extent.end > session.model.duration + EPSILON
  ) return unchanged(session, "extent-out-of-bounds");
  const text = String(label || "").trim();

  const selectedStartPin = getPin(session.model.guide, extent.startPinId);
  const selectedEndPin = getPin(session.model.guide, extent.endPinId);
  const startPin = selectedStartPin || findPinAt(session.model.guide, extent.start);
  const endPin = selectedEndPin || findPinAt(session.model.guide, extent.end);
  const targetGroupId = visibleGroup(session.model.guide)?.id || DEFAULT_GROUP_ID;
  const duplicate = startPin && endPin
    ? findDuplicateSection(
      session.model.guide,
      startPin.id,
      endPin.id,
      text,
      null,
      targetGroupId
    )
    : null;
  if (duplicate) {
    return unchanged(session, "duplicate-section", {
      value: { section: duplicate, created: false }
    });
  }

  return commit(session, "Save Section", draft => {
    const value = selectedStartPin && selectedEndPin
      ? createSection(
          draft.guide,
          selectedStartPin.id,
          selectedEndPin.id,
          { label: text, provenance, groupId: targetGroupId }
        )
      : createSectionFromTimes(
          draft.guide,
          extent.start,
          extent.end,
          { label: text, provenance, groupId: targetGroupId }
        );
    if (!value.created) {
      return { changed: false, reason: "duplicate-section", value };
    }
    return { changed: true, guideChanged: true, value };
  }, { guideEdit: true });
}

export function retainSpanAsSection(session, label) {
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

export function deleteGuidePin(session, pinId, options = {}) {
  if (!getPin(session.model.guide, pinId)) return unchanged(session, "missing-pin");
  const references = sectionsForPin(session.model.guide, pinId).length;
  if (references && options.cascade !== true) {
    return unchanged(session, "pin-in-use", { references });
  }
  return commit(session, "Delete Pin", draft => {
    const sectionIds = sectionsForPin(draft.guide, pinId)
      .map(section => section.id);
    for (const sectionId of sectionIds) deleteSection(draft.guide, sectionId);
    const pin = getPin(draft.guide, pinId);
    const value = pin
      ? deletePin(draft.guide, pinId)
      : { deleted: true, references: 0 };
    return {
      changed: value.deleted === true || sectionIds.length > 0,
      guideChanged: true,
      value: {
        ...value,
        dissolvedSectionIds: sectionIds
      }
    };
  }, { guideEdit: true });
}

export function renameGuideSection(session, sectionId, label) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  const text = String(label || "").trim();
  if (text === section.label) return unchanged(session, "unchanged-label", { value: section });
  if (findDuplicateSection(
    session.model.guide,
    section.startPinId,
    section.endPinId,
    text,
    section.id,
    section.groupId
  )) return unchanged(session, "duplicate-section", { value: section });
  return commit(session, "Rename Section", draft => ({
    changed: true,
    guideChanged: true,
    value: renameSection(draft.guide, sectionId, text)
  }), { guideEdit: true });
}

function rebaseFocusedGuideSection(model) {
  if (focusKind(model.focus) !== FOCUS_KIND.SAVED) {
    return { rangeChanged: false, moved: false, intervalCleared: false };
  }
  const section = resolveSection(model.guide, model.focus.sectionId);
  if (!section) {
    return { rangeChanged: false, moved: false, intervalCleared: false };
  }
  const previous = model.resolution.C;
  const current = clamp(previous, section.start, section.end);
  const rangeChanged = Math.abs(model.range.start - section.start) > EPSILON
    || Math.abs(model.range.end - section.end) > EPSILON;
  if (!rangeChanged) {
    return { rangeChanged: false, moved: false, intervalCleared: false };
  }
  model.range = { start: section.start, end: section.end };
  model.resolution = createRoot(section.start, current, section.end);
  model.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
  return {
    rangeChanged: true,
    moved: Math.abs(current - previous) > EPSILON,
    intervalCleared: clearIntervalOutsideRange(model)
  };
}

function rebaseActiveSpanBounds(model, movements) {
  const interval = model.interval;
  if (!interval) return { changed: false, cleared: false };
  const destinationFor = bound => movements.find(
    movement => Math.abs(bound - movement.source) <= EPSILON
  )?.destination;
  const movedStart = destinationFor(interval.start);
  const movedEnd = destinationFor(interval.end);
  if (!Number.isFinite(movedStart) && !Number.isFinite(movedEnd)) {
    return { changed: false, cleared: false };
  }

  let start = Number.isFinite(movedStart) ? movedStart : interval.start;
  let end = Number.isFinite(movedEnd) ? movedEnd : interval.end;
  if (Math.abs(end - start) <= EPSILON) {
    model.interval = null;
    return { changed: true, cleared: true };
  }
  if (start > end) {
    [start, end] = [end, start];
    [interval.startFrame, interval.endFrame] = [
      interval.endFrame,
      interval.startFrame
    ];
    interval.activeEnd = interval.activeEnd === "start" ? "end" : "start";
  }
  interval.start = start;
  interval.end = end;
  return { changed: true, cleared: false };
}

// Group edits are ordinary Guide transactions, so every toggle is one Undoable
// step and nothing about a Group needs its own history model.
export function setGuideGroupState(session, groupId, changes) {
  const group = session.model.guide.groups?.find(entry => entry.id === groupId);
  if (!group) return unchanged(session, "missing-group");
  // Visibility is read from the Guide's nullable visible-Group identity rather than
  // from a field on this Group, so there is nothing here that can disagree with
  // the model about which layer the Timeline is drawing.
  const wasVisible = groupIsVisible(session.model.guide, group);
  const next = {
    visible: typeof changes?.visible === "boolean" ? changes.visible : wasVisible,
    active: typeof changes?.active === "boolean" ? changes.active : group.active
  };
  if (next.visible === wasVisible && next.active === group.active) {
    return unchanged(session, "unchanged-group");
  }
  const name = group.label?.trim() || "Group";
  const changed = next.visible !== wasVisible ? "visible" : "active";
  const label = changed === "visible"
    ? `${next.visible ? "Show" : "Hide"} “${name}”`
    : `${next.active ? "Activate" : "Deactivate"} “${name}”`;
  return commit(session, label, draft => {
    const applied = setGroupState(draft.guide, groupId, next);
    if (!applied) return { changed: false, reason: "missing-group" };
    return { changed: true, guideChanged: true, value: applied };
  }, { guideEdit: true });
}

export function createGuideGroup(session, label = "") {
  // The caller may propose a name; the Guide decides the one that is free, so
  // creating a Group can never produce a second row reading the same.
  const wanted = String(label || "").trim();
  const resolved = wanted && !groupLabelTaken(session.model.guide, wanted)
    ? wanted
    : nextGroupLabel(session.model.guide);
  return commit(session, `Add Group “${resolved}”`, draft => {
    const group = createGroup(draft.guide, resolved);
    return { changed: true, guideChanged: true, value: group };
  }, { guideEdit: true });
}

export function renameGuideGroup(session, groupId, label) {
  const group = session.model.guide.groups?.find(entry => entry.id === groupId);
  if (!group) return unchanged(session, "missing-group");
  const next = typeof label === "string" ? label.trim() : "";
  // A Section's title is optional because its Address identifies it. A Group has
  // no Address, so its name is the only thing that does -- an unnamed one would
  // fall back to a shared word and become indistinguishable from every other
  // unnamed Group in the header and in the Section's Group control alike.
  if (!next) return unchanged(session, "empty-group-label");
  if (next === (group.label?.trim() || "")) return unchanged(session, "unchanged-group");
  if (groupLabelTaken(session.model.guide, next, groupId)) {
    return unchanged(session, "duplicate-group-label");
  }
  return commit(session, `Rename Group “${next}”`, draft => {
    const target = setGroupState(draft.guide, groupId, { label: next });
    if (!target) return { changed: false, reason: "missing-group" };
    return { changed: true, guideChanged: true, value: target };
  }, { guideEdit: true });
}

export function assignGuideSectionGroup(session, sectionId, groupId) {
  const section = resolveSection(session.model.guide, sectionId);
  const group = session.model.guide.groups?.find(entry => entry.id === groupId);
  if (!section || !group) return unchanged(session, "missing-group");
  if (section.groupId === groupId) return unchanged(session, "unchanged-group");
  const name = group.label?.trim() || "Group";
  return commit(session, `Move “${sectionDisplayName(section)}” to “${name}”`, draft => {
    const moved = assignSectionGroup(draft.guide, sectionId, groupId);
    if (!moved.changed) return moved;
    return { changed: true, guideChanged: true, value: moved.section };
  }, { guideEdit: true });
}

// Confirmation and mutation ask the same kernel question, so the destination
// named before deletion is guaranteed to be the destination reported after it.
export function planGuideGroupDeletion(session, groupId) {
  return groupDeletionPlan(session?.model?.guide, groupId);
}

// A Group is an organizing choice, not an owner: deleting one rehomes its
// Sections in the actual heir named by the shared plan.
export function deleteGuideGroup(session, groupId) {
  const group = session.model.guide.groups?.find(entry => entry.id === groupId);
  const plan = planGuideGroupDeletion(session, groupId);
  if (!plan.allowed) {
    return unchanged(session, plan.reason, {
      ...plan,
      value: plan
    });
  }
  const name = group.label?.trim() || "Group";
  return commit(session, `Remove Group “${name}”`, draft => {
    const result = deleteGroup(draft.guide, groupId);
    if (!result.allowed) {
      return {
        changed: false,
        reason: result.reason,
        ...result,
        value: result
      };
    }
    return {
      changed: true,
      guideChanged: true,
      ...result,
      value: result
    };
  }, { guideEdit: true });
}

export function setGuideSectionWeight(session, sectionId, weight) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  if (!isSectionWeight(weight)) {
    return unchanged(session, "invalid-section-weight");
  }
  const nextWeight = normalizeSectionWeight(weight);
  const label = `Set “${sectionDisplayName(section)}” to ${nextWeight}×`;
  return commit(session, label, draft => {
    const value = setSectionWeight(draft.guide, sectionId, nextWeight);
    if (!value.changed) return value;
    return {
      changed: true,
      guideChanged: true,
      value: value.section
    };
  }, { guideEdit: true });
}

export function moveGuidePin(session, pinId, address, options = {}) {
  const sourcePin = getPin(session.model.guide, pinId);
  if (!sourcePin) return unchanged(session, "missing-pin");
  const perform = draft => {
    const source = getPin(draft.guide, pinId)?.t;
    const value = movePin(draft.guide, pinId, address, draft.duration);
    if (!value.changed) return value;
    if (!validateGuide(draft.guide, draft.duration)) {
      return { changed: false, reason: "invalid-guide-geometry" };
    }
    const interval = rebaseActiveSpanBounds(
      draft,
      [{ source, destination: value.destination }]
    );
    const focus = rebaseFocusedGuideSection(draft);
    if (draft.interval && interval.changed && !focus.intervalCleared) {
      syncIntervalEndpointFrames(draft);
    }
    return {
      changed: true,
      guideChanged: true,
      value,
      rangeChanged: focus.rangeChanged,
      intervalChanged: interval.changed,
      intervalCleared: interval.cleared || focus.intervalCleared,
      ...(focus.moved ? { place: draft.resolution.C } : {})
    };
  };
  return options.amend
    ? amend(session, perform, { guideEdit: true })
    : commit(session, options.label || "Move Pin", perform, { guideEdit: true });
}

export function moveGuideSection(session, sectionId, requestedDelta, options = {}) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  const perform = draft => {
    const source = resolveSection(draft.guide, sectionId);
    const value = translateSection(
      draft.guide,
      sectionId,
      requestedDelta,
      draft.duration
    );
    if (!value.changed) return value;
    if (!validateGuide(draft.guide, draft.duration)) {
      return { changed: false, reason: "invalid-guide-geometry" };
    }
    const interval = rebaseActiveSpanBounds(draft, [
      { source: source.start, destination: value.section.start },
      { source: source.end, destination: value.section.end }
    ]);
    const focus = rebaseFocusedGuideSection(draft);
    if (draft.interval && interval.changed && !focus.intervalCleared) {
      syncIntervalEndpointFrames(draft);
    }
    return {
      changed: true,
      guideChanged: true,
      value,
      rangeChanged: focus.rangeChanged,
      intervalChanged: interval.changed,
      intervalCleared: interval.cleared || focus.intervalCleared,
      ...(focus.moved ? { place: draft.resolution.C } : {})
    };
  };
  return options.amend
    ? amend(session, perform, { guideEdit: true })
    : commit(
      session,
      options.label || `Move “${sectionDisplayName(section)}”`,
      perform,
      { guideEdit: true }
    );
}

export function unlinkGuideSectionEndpoint(session, sectionId, role) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  return commit(session, `Unlink ${role === "start" ? "Start" : "End"} Pin`, draft => {
    const value = unlinkSectionEndpoint(draft.guide, sectionId, role);
    if (!value.changed) return value;
    const focus = rebaseFocusedGuideSection(draft);
    return {
      changed: true,
      guideChanged: true,
      value,
      rangeChanged: focus.rangeChanged,
      intervalCleared: focus.intervalCleared,
      ...(focus.moved ? { place: draft.resolution.C } : {})
    };
  }, { guideEdit: true });
}

export function linkGuidePins(session, sourcePinId, targetPinId, options = {}) {
  const perform = draft => {
    const value = linkPins(draft.guide, sourcePinId, targetPinId);
    if (!value.changed) return value;
    if (!validateGuide(draft.guide, draft.duration)) {
      return { changed: false, reason: "invalid-guide-geometry" };
    }
    const focus = rebaseFocusedGuideSection(draft);
    return {
      changed: true,
      guideChanged: true,
      value,
      rangeChanged: focus.rangeChanged,
      intervalCleared: focus.intervalCleared,
      ...(focus.moved ? { place: draft.resolution.C } : {})
    };
  };
  return options.amend
    ? amend(session, perform, { guideEdit: true })
    : commit(session, options.label || "Link Pins", perform, { guideEdit: true });
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
      draft.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
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
  const history = session.history || [];
  const entry = history.at(-1);
  if (!entry) return unchanged(session, "empty-history");
  return {
    changed: true,
    label: entry.label,
    place: entry.model.resolution.C,
    guideChanged: entry.model.guide !== session.model.guide,
    session: {
      model: snapshotModel(entry.model),
      history: history.slice(0, -1),
      future: appendHistory(session.future, {
        label: entry.label,
        model: snapshotModel(session.model)
      })
    }
  };
}

export function redo(session) {
  const future = session.future || [];
  const entry = future.at(-1);
  if (!entry) return unchanged(session, "empty-future");
  return {
    changed: true,
    label: entry.label,
    place: entry.model.resolution.C,
    guideChanged: entry.model.guide !== session.model.guide,
    session: {
      model: snapshotModel(entry.model),
      history: appendHistory(session.history, {
        label: entry.label,
        model: snapshotModel(session.model)
      }),
      future: future.slice(0, -1)
    }
  };
}

/**
 * Dry-run one navigation transition through the exact semantic operator used
 * for commit. Presentation can therefore preview the resulting Current,
 * Resolution, and Active Span without maintaining a second rule set.
 */
export function previewTransition(session, action, options = {}) {
  switch (action) {
    case "refineBackward":
      return refine(session, "backward", {
        projection: options.projection
      });
    case "refineForward":
      return refine(session, "forward", {
        projection: options.projection
      });
    case "localRefineBackward":
      return localRefine(session, "backward", {
        projection: options.projection
      });
    case "localRefineForward":
      return localRefine(session, "forward", {
        projection: options.projection
      });
    case "stepBackward":
      return step(session, "backward", options.seconds, {
        projection: options.projection
      });
    case "stepForward":
      return step(session, "forward", options.seconds, {
        projection: options.projection
      });
    case "pinBackward":
      return stepToPin(session, options.destination, "backward", {
        stepSeconds: options.seconds,
        projection: options.projection
      });
    case "pinForward":
      return stepToPin(session, options.destination, "forward", {
        stepSeconds: options.seconds,
        projection: options.projection
      });
    case "switchActiveEnd":
      return switchActiveEnd(session, {
        projection: options.projection
      });
    case "reopen":
      return reopen(session);
    case "release":
      return releaseInterval(session);
    default:
      return unchanged(session, "unsupported-preview");
  }
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
    draft.neighborhoodBasis = NEIGHBORHOOD_BASIS.RANGE;
    draft.lastOperator = "range";
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
      }),
      future: []
    }
  };
}

// A gesture that commits its first move and amends the rest cannot know what it
// was until it ends. Step names itself "Step Forward" on the first press, then
// the operator may reverse; only the settled sequence knows its net direction.
// Renaming the open transaction keeps one entry per gesture while letting that
// entry tell the truth about what it will restore.
export function relabelLastAction(session, label) {
  const history = session?.history || [];
  if (!history.length || !label) return session;
  const last = history[history.length - 1];
  if (last.label === label) return session;
  return {
    ...session,
    history: [...history.slice(0, -1), { ...last, label }]
  };
}

// Step commits on its first repeat so Current moves without latency, then
// amends that one transaction until the gesture settles. Net displacement can
// name an ordinary sequence, but it cannot prove a reversal: departure and
// arrival are identical there. The pending gesture therefore supplies only its
// transient visited envelope. Settlement turns that sparse evidence into the
// same positive contiguous Active Span every route understands, then
// discards it with the caller's pending object. No Path enters durable state.
// Ghost Traverse: move through user time while the semantic world stands still.
//
// Every other movement operator answers a question about source time or about
// the map. This one answers "where was I before this moment?", and the whole
// point is that it must disturb nothing to do it: the Pins, Sections, Weights,
// Groups and Focus established since then are exactly what makes returning
// worth doing. So this deliberately does not route through the ordinary Go,
// which may leave Focus or reopen Full Video.
//
// What it produces is an ordinary Active Span. The Address the reader was
// at when the gesture began is the fixed Anchor; the recalled Address is the
// active endpoint. Nothing downstream needs to know it came from user time --
// Switch End, Tag, Release and Focus all act on it as they would on any
// other Interval -- which is why there is no second interval type.
export function ghostTraverse(session, destination, options = {}) {
  const perform = draft => {
    const anchor = Number(options.anchor);
    const target = Number(destination);
    if (!Number.isFinite(anchor) || !Number.isFinite(target)) {
      return { changed: false, reason: "invalid-ghost-address" };
    }
    // A recalled Address the active Range excludes belongs to a world this one
    // has narrowed away. Ghost preserves the environment, so it refuses rather
    // than clamping onto a different point.
    if (
      target < draft.range.start - EPSILON
      || target > draft.range.end + EPSILON
    ) {
      return { changed: false, reason: "ghost-outside-range" };
    }
    if (Math.abs(target - draft.resolution.C) <= EPSILON) {
      return { changed: false, reason: "same-address" };
    }
    const metric = options.projection?.metric || projectionForModel(draft).metric;
    const backward = options.direction === "backward";
    const operator = backward ? "ghostBackward" : "ghostForward";
    draft.resolution = translateNeighborhood(
      clone(options.originResolution) || draft.resolution,
      target,
      draft.range,
      metric
    );
    draft.neighborhoodBasis = options.originResolutionBasis
      || draft.neighborhoodBasis
      || NEIGHBORHOOD_BASIS.RANGE;
    // Coming back to the Anchor is a legitimate destination: the reader went
    // out and returned. There is simply no extent to draw at that instant, so
    // the Interval is cleared rather than the movement refused. Settlement then
    // decides whether the ground crossed on the way is worth retaining.
    if (Math.abs(target - anchor) <= EPSILON) {
      draft.interval = null;
      draft.lastOperator = operator;
      return {
        changed: true,
        departure: anchor,
        destination: target,
        current: target,
        interval: null,
        intervalCleared: true,
        place: target
      };
    }
    const activeEnd = target <= anchor ? "start" : "end";
    const extent = { start: Math.min(anchor, target), end: Math.max(anchor, target) };
    const currentFrame = currentEndpointFrame(draft);
    const startFrame = resolveIntervalEndpointFrame(
      activeEnd === "start" ? currentFrame : null,
      extent.start,
      extent.end,
      extent,
      draft.range,
      metric
    );
    const endFrame = resolveIntervalEndpointFrame(
      activeEnd === "end" ? currentFrame : null,
      extent.end,
      extent.start,
      extent,
      draft.range,
      metric
    );
    draft.interval = createActiveSpan(anchor, target, operator, "ghost", {
      extent,
      activeEnd,
      startFrame,
      endFrame,
      departureNeighborhood: activeEnd === "start" ? endFrame : startFrame,
      arrivalNeighborhood: currentFrame
    });
    if (!draft.interval) return { changed: false, reason: "invalid-ghost-interval" };
    draft.lastOperator = operator;
    return {
      changed: true,
      departure: anchor,
      destination: target,
      current: target,
      interval: clone(draft.interval),
      place: target
    };
  };
  return options.amend
    ? amend(session, perform, { projection: options.projection })
    : commit(session, "Ghost Traverse", perform, { projection: options.projection });
}

// A Ghost gesture that wandered and came back still happened.
//
// The same principle Step Reversal already follows: the reader crossed a
// positive extent, and that extent is what they now have in view, even though
// their net displacement is nothing. The retained envelope is the source ground
// crossed -- it does not try to preserve the nonmonotonic user-time path as
// geometry, because a Active Span describes an extent and not a route.
export function settleGhostSequence(session, gesture) {
  if (!gesture?.changed) return unchanged(session, "no-ghost-sequence");
  const arrival = Number(session?.model?.resolution?.C);
  const anchor = Number(gesture.anchor);
  if (!Number.isFinite(arrival) || !Number.isFinite(anchor)) {
    return unchanged(session, "invalid-ghost-sequence");
  }
  if (Math.abs(arrival - anchor) > EPSILON) {
    return unchanged(session, "ghost-displaced");
  }
  const visitedMinimum = Math.max(
    session.model.range.start,
    Math.min(anchor, Number.isFinite(Number(gesture.visitedMinimum))
      ? Number(gesture.visitedMinimum)
      : anchor)
  );
  const visitedMaximum = Math.min(
    session.model.range.end,
    Math.max(anchor, Number.isFinite(Number(gesture.visitedMaximum))
      ? Number(gesture.visitedMaximum)
      : anchor)
  );
  if (!(visitedMaximum - visitedMinimum > EPSILON)) {
    return unchanged(session, "ghost-round-trip");
  }
  // The last source-time movement supplies the viewpoint, exactly as the final
  // committed repeat does for a Step sequence.
  const activeEnd = gesture.lastSourceDirection === "backward" ? "start" : "end";
  const operator = gesture.lastSourceDirection === "backward"
    ? "ghostBackward"
    : "ghostForward";
  const intervalDeparture = activeEnd === "start" ? visitedMaximum : visitedMinimum;
  return amend(session, draft => {
    const extent = { start: visitedMinimum, end: visitedMaximum };
    const metric = gesture.projection?.metric || projectionForModel(draft).metric;
    const currentFrame = currentEndpointFrame(draft);
    const startFrame = resolveIntervalEndpointFrame(
      Math.abs(arrival - visitedMinimum) <= EPSILON ? currentFrame : null,
      visitedMinimum,
      visitedMaximum,
      extent,
      draft.range,
      metric
    );
    const endFrame = resolveIntervalEndpointFrame(
      Math.abs(arrival - visitedMaximum) <= EPSILON ? currentFrame : null,
      visitedMaximum,
      visitedMinimum,
      extent,
      draft.range,
      metric
    );
    draft.interval = createActiveSpan(intervalDeparture, arrival, operator, "ghost", {
      extent,
      activeEnd,
      startFrame,
      endFrame,
      departureNeighborhood: activeEnd === "start" ? endFrame : startFrame,
      arrivalNeighborhood: currentFrame
    });
    if (!draft.interval) return { changed: false, reason: "invalid-ghost-envelope" };
    draft.lastOperator = operator;
    return { changed: true, interval: clone(draft.interval) };
  }, { projection: gesture.projection });
}

export function settleStepSequence(session, pending) {
  if (!pending?.started) return unchanged(session, "no-step-sequence");

  const arrival = Number(session?.model?.resolution?.C);
  const departure = Number(pending.departure);
  if (!Number.isFinite(arrival) || !Number.isFinite(departure)) {
    return unchanged(session, "invalid-step-sequence");
  }

  const displacement = arrival - departure;
  const direction = Math.abs(displacement) <= EPSILON
    ? null
    : displacement > 0 ? "forward" : "backward";
  const label = direction === "forward"
    ? "Step Forward"
    : direction === "backward"
      ? "Step Backward"
      : "Step Reversal";
  const visitedMinimum = Math.max(
    session.model.range.start,
    Math.min(
      departure,
      arrival,
      Number.isFinite(Number(pending.visitedMinimum))
        ? Number(pending.visitedMinimum)
        : departure
    )
  );
  const visitedMaximum = Math.min(
    session.model.range.end,
    Math.max(
      departure,
      arrival,
      Number.isFinite(Number(pending.visitedMaximum))
        ? Number(pending.visitedMaximum)
        : departure
    )
  );

  let settledSession = session;
  let retainedEnvelope = false;
  if (
    direction === null
    && visitedMaximum - visitedMinimum > EPSILON
  ) {
    // The final committed repeat supplies the deterministic viewpoint. A
    // backward return leaves the lower side active; a forward return leaves the
    // upper side active. The opposite visited extreme is the retained endpoint
    // from which Switch End can reconstruct the complementary viewpoint.
    const activeEnd = pending.lastDirection === "backward" ? "start" : "end";
    const intervalDeparture = activeEnd === "start"
      ? visitedMaximum
      : visitedMinimum;
    const operator = pending.lastDirection === "backward"
      ? "stepBackward"
      : "stepForward";
    const amended = amend(session, draft => {
      const extent = { start: visitedMinimum, end: visitedMaximum };
      const metric = pending.projection?.metric || projectionForModel(draft).metric;
      const currentFrame = currentEndpointFrame(draft);
      const startFrame = resolveIntervalEndpointFrame(
        Math.abs(arrival - visitedMinimum) <= EPSILON ? currentFrame : null,
        visitedMinimum,
        visitedMaximum,
        extent,
        draft.range,
        metric
      );
      const endFrame = resolveIntervalEndpointFrame(
        Math.abs(arrival - visitedMaximum) <= EPSILON ? currentFrame : null,
        visitedMaximum,
        visitedMinimum,
        extent,
        draft.range,
        metric
      );
      draft.interval = createActiveSpan(
        intervalDeparture,
        arrival,
        operator,
        "direct",
        {
          extent,
          activeEnd,
          startFrame,
          endFrame,
          departureNeighborhood: activeEnd === "start" ? endFrame : startFrame,
          arrivalNeighborhood: currentFrame
        }
      );
      if (!draft.interval) {
        return { changed: false, reason: "invalid-step-envelope" };
      }
      draft.lastOperator = operator;
      return {
        changed: true,
        interval: draft.interval,
        retainedEnvelope: true
      };
    }, { projection: pending.projection });
    if (amended.changed) {
      settledSession = amended.session;
      retainedEnvelope = true;
    }
  }

  settledSession = relabelLastAction(settledSession, label);
  return {
    changed: settledSession !== session,
    session: settledSession,
    direction,
    label,
    retainedEnvelope,
    visitedMinimum,
    visitedMaximum,
    interval: settledSession.model.interval
  };
}
