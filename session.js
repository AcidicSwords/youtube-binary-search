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
  DEFAULT_DEFORM_WEIGHT,
  isSectionWeight,
  normalizeSectionWeight,
  setSectionWeight,
  movePin,
  translateSection,
  createSectionFromTimes,
  findDuplicateSection,
  renameSection,
  replaceSectionExtent,
  deleteSection,
  resolveSection,
  validateGuide
} from "./guide.js";
import { projectionForModel } from "./timeline-projection.js";

export const HISTORY_LIMIT = 100;
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
  WORKING: "working-section"
});

export const DEFAULT_STEP_REACH = Object.freeze({
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
        ? RESOLUTION_BASIS.RANGE
        : frame.resolutionBasis
    );
  }
  const resolution = seedNeighborhoodFromMovement(opposite, address, range, metric);
  return createEndpointFrame(
    resolution,
    isRangeNeighborhood(resolution, range)
      ? RESOLUTION_BASIS.RANGE
      : RESOLUTION_BASIS.MOVEMENT
  );
}

function resolveIntervalEndpointFrame(frame, address, opposite, interval, range, metric = null) {
  const resolved = resolveEndpointFrame(frame, address, opposite, range, metric);
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
  const metric = projectionForModel(model).metric;
  const preserveRefinementLevel = [
    "refineBackward",
    "refineForward"
  ].includes(model.interval.operator);
  const activeLevel = model.resolution.level;
  model.resolution = containExtent(model.resolution, model.interval, model.range);
  if (preserveRefinementLevel) model.resolution.level = activeLevel;

  const interval = model.interval;
  const activeSide = interval.activeSide === "start" || interval.activeSide === "end"
    ? interval.activeSide
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
          ? interval.departureFrame
          : Math.abs(interval.arrival - interval.start) <= EPSILON
            ? interval.arrivalFrame
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
          ? interval.departureFrame
          : Math.abs(interval.arrival - interval.end) <= EPSILON
            ? interval.arrivalFrame
            : null
      ),
    interval.end,
    interval.start,
    model.interval,
    model.range,
    metric
  );

  interval.activeSide = activeSide;
  interval.startFrame = startFrame;
  interval.endFrame = endFrame;
  interval.departure = activeSide === "start" ? interval.end : interval.start;
  interval.arrival = model.resolution.C;
  interval.direction = interval.arrival < interval.departure
    ? "backward"
    : "forward";
  interval.departureFrame = clone(
    activeSide === "start" ? endFrame : startFrame
  );
  interval.arrivalFrame = currentEndpointFrame(model);
}

export function createInterval(departure, arrival, operator, medium = "direct", endpointFrames = {}) {
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
  const activeSide = endpointFrames.activeSide === "start"
    || endpointFrames.activeSide === "end"
    ? endpointFrames.activeSide
    : Math.abs(arrival - start) <= EPSILON
      ? "start"
      : "end";
  const departureFrame = clone(endpointFrames.departureFrame) || null;
  const arrivalFrame = clone(endpointFrames.arrivalFrame) || null;
  const startFrame = clone(endpointFrames.startFrame) || (
    departure <= arrival ? departureFrame : arrivalFrame
  );
  const endFrame = clone(endpointFrames.endFrame) || (
    departure <= arrival ? arrivalFrame : departureFrame
  );

  return {
    start,
    end,
    departure,
    arrival,
    activeSide,
    operator,
    medium,
    direction: arrival < departure ? "backward" : "forward",
    departureFrame,
    arrivalFrame,
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
      resolutionBasis: RESOLUTION_BASIS.RANGE,
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
  const next = [...(history || []), entry];
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
  syncIntervalEndpointFrames(draft);
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
  // Leaving Focus or opening Full Video can change the active Range. Derive the
  // movement frame only after that composite scope transition is complete.
  const metric = projectionForModel(model).metric;
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
      options.stepSeconds,
      metric
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
      model.range,
      metric
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
      model.range,
      metric
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
        : resolveEndpointFrame(
          null,
          intervalDeparture,
          finalDestination,
          model.range,
          metric
        )
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

export function goToGuidePin(session, pinId, options = {}) {
  const pin = getPin(session.model.guide, pinId);
  if (!pin) return unchanged(session, "missing-pin");
  return goTo(session, pin.t, {
    ...options,
    operator: options.operator || "pin",
    label: options.label || "Go to Pin"
  });
}

export function goToGuideSection(session, sectionId, options = {}) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  const label = options.label || "Select Section";
  return commit(session, label, model => {
    const current = model.resolution.C;
    const operator = options.operator || "section";
    const alreadySelected = (
      Math.abs(model.resolution.L - section.start) <= EPSILON
      && Math.abs(model.resolution.C - section.midpoint) <= EPSILON
      && Math.abs(model.resolution.R - section.end) <= EPSILON
      && Math.abs((model.interval?.start ?? NaN) - section.start) <= EPSILON
      && Math.abs((model.interval?.end ?? NaN) - section.end) <= EPSILON
      && model.interval?.operator === operator
    );
    if (alreadySelected) return { changed: false, reason: "selected-section" };

    const startOpening = openAddress(model, section.start);
    const endOpening = openAddress(model, section.end);
    model.resolution = createRoot(section.start, section.midpoint, section.end);
    model.resolutionBasis = isRangeNeighborhood(model.resolution, model.range)
      ? RESOLUTION_BASIS.RANGE
      : RESOLUTION_BASIS.MOVEMENT;
    model.interval = createInterval(
      section.start,
      section.midpoint,
      operator,
      options.medium || "retained",
      {
        extent: section,
        activeSide: "end"
      }
    );

    return {
      changed: true,
      departure: current,
      destination: section.midpoint,
      current: section.midpoint,
      place: section.midpoint,
      interval: model.interval,
      rangeChanged: startOpening.changed || endOpening.changed,
      leftFocus: startOpening.leftFocus || endOpening.leftFocus,
      openedFullVideo: startOpening.openedFullVideo || endOpening.openedFullVideo
    };
  }, options);
}

function refineIntervalRelation(model, target) {
  const current = model.resolution.C;
  const interval = model.interval;
  const relation = classifyRefineRelation(interval, current, target);
  return relation === "shorten"
    ? { departure: interval.departure, relation: "shorten" }
    : { departure: current, relation: "replace" };
}

function retainedRefineIntervalRelation(model, target) {
  const current = model.resolution.C;
  const relation = classifyRetainedRefineRelation(model.interval, current, target);
  return relation === "retain"
    ? { departure: model.interval.departure, relation }
    : { departure: current, relation };
}

export function localRefine(session, direction) {
  const metric = projectionForModel(session.model).metric;
  const target = getTargets(session.model.resolution, metric)[direction];
  if (target === null) return unchanged(session, "no-destination");
  const backward = direction === "backward";
  const intervalRelation = refineIntervalRelation(session.model, target);
  return goTo(session, target, {
    mode: "refine",
    operator: backward ? "localRefineBackward" : "localRefineForward",
    label: backward ? "Local Refine Backward" : "Local Refine Forward",
    intervalDeparture: intervalRelation.departure,
    refineRelation: intervalRelation.relation
  });
}

export function refine(session, direction) {
  const projection = projectionForModel(session.model);
  const target = getTargets(session.model.resolution, projection.metric)[direction];
  if (target === null) return unchanged(session, "no-destination");
  const backward = direction === "backward";
  const intervalRelation = retainedRefineIntervalRelation(session.model, target);
  return goTo(session, target, {
    mode: "refine",
    operator: backward ? "refineBackward" : "refineForward",
    label: backward ? "Refine Backward" : "Refine Forward",
    intervalDeparture: intervalRelation.departure,
    refineRelation: intervalRelation.relation
  });
}

export function step(session, direction, seconds = null, options = {}) {
  const projection = projectionForModel(session.model);
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
  if (
    projection.timelineDistance(target, session.model.resolution.C) <= EPSILON
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
    amend: options.amend
  });
}

export function stepToPin(session, destination, direction, options = {}) {
  if (!Number.isFinite(destination)) return unchanged(session, "no-destination");
  const backward = direction === "backward";
  const projection = projectionForModel(session.model);
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
    label: backward ? "Pin Backward" : "Pin Forward",
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
    const metric = projectionForModel(draft).metric;
    const activeSide = active.activeSide === "start" || active.activeSide === "end"
      ? active.activeSide
      : Math.abs(active.arrival - active.start) <= EPSILON
        ? "start"
        : "end";
    const nextSide = activeSide === "start" ? "end" : "start";
    const departure = nextSide === "start" ? active.start : active.end;
    const retainedDeparture = activeSide === "start" ? active.start : active.end;
    const frameBeingLeft = resolveIntervalEndpointFrame(
      activeSide === "start" ? active.startFrame : active.endFrame,
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
    draft.resolutionBasis = frameBeingEntered.resolutionBasis;
    draft.interval = {
      ...active,
      departure: retainedDeparture,
      arrival: departure,
      activeSide: nextSide,
      direction: departure < retainedDeparture ? "backward" : "forward",
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

export function releaseInterval(session) {
  if (!session.model.interval) return unchanged(session, "no-interval");
  return commit(session, "Release Working Interval", draft => {
    draft.interval = null;
    return { changed: true, interval: null };
  });
}

function sameExtent(first, second) {
  return Boolean(
    first
    && second
    && Math.abs(first.start - second.start) <= EPSILON
    && Math.abs(first.end - second.end) <= EPSILON
  );
}

function sectionDisplayName(section) {
  return section?.label?.trim() || "Untitled Section";
}

export function deformSection(
  session,
  sectionId = null,
  weight = DEFAULT_DEFORM_WEIGHT
) {
  if (!isSectionWeight(weight)) {
    return unchanged(session, "invalid-section-weight");
  }
  const nextWeight = normalizeSectionWeight(weight);
  const interval = session.model.interval;
  if (sectionId && !resolveSection(session.model.guide, sectionId)) {
    return unchanged(session, "missing-section");
  }
  const exactMatches = interval
    ? session.model.guide.sections
      .map(section => resolveSection(session.model.guide, section))
      .filter(section => sameExtent(section, interval))
    : [];
  if (!sectionId && exactMatches.length > 1) {
    return unchanged(session, "ambiguous-deform-target", {
      sectionIds: exactMatches.map(section => section.id)
    });
  }
  let target = sectionId
    ? resolveSection(session.model.guide, sectionId)
    : exactMatches[0] || null;

  if (!target && !interval) return unchanged(session, "no-deform-target");

  const label = target
    ? `Set “${sectionDisplayName(target)}” to ${nextWeight}×`
    : `Deform Working Interval to ${nextWeight}×`;
  return commit(session, label, draft => {
    let resolved = target
      ? resolveSection(draft.guide, target.id)
      : null;
    let created = false;
    if (!resolved) {
      const working = clone(draft.interval);
      if (!working) return { changed: false, reason: "no-interval" };
      const value = createSectionFromTimes(
        draft.guide,
        working.start,
        working.end,
        {
          label: "",
          weight: nextWeight,
          provenance: `deform:${working.operator}`
        }
      );
      resolved = resolveSection(draft.guide, value.section.id);
      created = value.created;
    } else {
      const value = setSectionWeight(
        draft.guide,
        resolved.id,
        nextWeight
      );
      if (!value.changed) return value;
      resolved = value.section;
    }
    return {
      changed: true,
      guideChanged: true,
      value: resolved,
      section: resolved,
      created,
      weight: resolved.weight
    };
  }, { guideEdit: true });
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

  return commit(session, `Focus “${sectionDisplayName(section)}”`, draft => {
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
    || originModel.resolutionBasis
    || projected.resolutionBasis
    || RESOLUTION_BASIS.RANGE;
  projected.resolution = translateNeighborhood(parentNeighborhood, current, projected.range);
  projected.resolutionBasis = isRangeNeighborhood(projected.resolution, projected.range)
    ? RESOLUTION_BASIS.RANGE
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
  const inheritedSide = sourceInterval?.activeSide === "start"
    || sourceInterval?.activeSide === "end"
    ? sourceInterval.activeSide
    : null;
  const activeSide = current <= extent.start + EPSILON
    ? "start"
    : current >= extent.end - EPSILON
      ? "end"
      : completedCycle
        ? "start"
        : inheritedSide || (current < departure ? "start" : "end");
  const intervalDeparture = activeSide === "start" ? extent.end : extent.start;

  let startFrame = clone(sourceInterval?.startFrame);
  let endFrame = clone(sourceInterval?.endFrame);
  if (!startFrame && sourceInterval) {
    startFrame = clone(
      Math.abs(sourceInterval.departure - sourceInterval.start) <= EPSILON
        ? sourceInterval.departureFrame
        : sourceInterval.arrivalFrame
    );
  }
  if (!endFrame && sourceInterval) {
    endFrame = clone(
      Math.abs(sourceInterval.departure - sourceInterval.end) <= EPSILON
        ? sourceInterval.departureFrame
        : sourceInterval.arrivalFrame
    );
  }
  if (Math.abs(extent.start - current) <= EPSILON) startFrame = currentFrame;
  else if (Math.abs(extent.start - departure) <= EPSILON) startFrame ||= parentFrame;
  if (Math.abs(extent.end - current) <= EPSILON) endFrame = currentFrame;
  else if (Math.abs(extent.end - departure) <= EPSILON) endFrame ||= parentFrame;

  projected.interval = createInterval(
    intervalDeparture,
    current,
    options.operator || "playback",
    "continuous",
    {
      extent,
      activeSide,
      startFrame,
      endFrame,
      departureFrame: activeSide === "start" ? endFrame : startFrame,
      arrivalFrame: currentFrame
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
  // that may legitimately change while it runs (Step Reach and retained Guide
  // edits) must remain in the checkpoint immediately before
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

  return commit(session, `Overwrite “${sectionDisplayName(section)}”`, draft => {
    const value = replaceSectionExtent(
      draft.guide,
      sectionId,
      draft.interval.start,
      draft.interval.end,
      { provenance: `working:${draft.interval.operator}` }
    );
    if (!validateGuide(draft.guide, draft.duration)) {
      return { changed: false, reason: "invalid-guide-geometry" };
    }
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
    section.id
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
  model.resolutionBasis = RESOLUTION_BASIS.RANGE;
  return {
    rangeChanged: true,
    moved: Math.abs(current - previous) > EPSILON,
    intervalCleared: clearIntervalOutsideRange(model)
  };
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
  if (!getPin(session.model.guide, pinId)) return unchanged(session, "missing-pin");
  const perform = draft => {
    const value = movePin(draft.guide, pinId, address, draft.duration);
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
    : commit(session, options.label || "Move Pin", perform, { guideEdit: true });
}

export function moveGuideSection(session, sectionId, requestedDelta, options = {}) {
  const section = resolveSection(session.model.guide, sectionId);
  if (!section) return unchanged(session, "missing-section");
  const perform = draft => {
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
    : commit(
      session,
      options.label || `Move “${sectionDisplayName(section)}”`,
      perform,
      { guideEdit: true }
    );
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

// Compatibility name for existing imports. Canonical interface vocabulary is Undo.
export const returnState = undo;

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
 * Resolution, and Working Interval without maintaining a second rule set.
 */
export function previewTransition(session, action, options = {}) {
  switch (action) {
    case "refineBackward":
      return refine(session, "backward");
    case "refineForward":
      return refine(session, "forward");
    case "localRefineBackward":
      return localRefine(session, "backward");
    case "localRefineForward":
      return localRefine(session, "forward");
    case "stepBackward":
      return step(session, "backward", options.seconds);
    case "stepForward":
      return step(session, "forward", options.seconds);
    case "pinBackward":
      return stepToPin(session, options.destination, "backward", {
        stepSeconds: options.seconds
      });
    case "pinForward":
      return stepToPin(session, options.destination, "forward", {
        stepSeconds: options.seconds
      });
    case "switchEndpoint":
      return switchEndpoint(session);
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
      }),
      future: []
    }
  };
}
