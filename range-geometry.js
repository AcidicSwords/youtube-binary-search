export const EPSILON = 0.04;
export const RESOLUTION_BASIS = Object.freeze({
  RANGE: "range",
  MOVEMENT: "movement"
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function contains(range, address, epsilon = EPSILON) {
  return Boolean(
    range
    && Number.isFinite(address)
    && address >= range.start - epsilon
    && address <= range.end + epsilon
  );
}

export function midpoint(start, end) {
  return start + (end - start) / 2;
}

function metricCoordinate(metric, address) {
  return metric?.toCoordinate ? metric.toCoordinate(address) : address;
}

function metricAddress(metric, coordinate) {
  return metric?.fromCoordinate
    ? metric.fromCoordinate(coordinate)
    : coordinate;
}

export function createRoot(start, current, end, level = 0) {
  return assertNeighborhood({ L: start, C: clamp(current, start, end), R: end, level });
}

function assertNeighborhood(neighborhood) {
  if (
    !neighborhood
    || !Number.isFinite(neighborhood.L)
    || !Number.isFinite(neighborhood.C)
    || !Number.isFinite(neighborhood.R)
  ) {
    throw new TypeError("Neighborhood positions must be finite numbers.");
  }
  if (neighborhood.L > neighborhood.C || neighborhood.C > neighborhood.R) {
    throw new RangeError(
      `Invalid Neighborhood ordering: ${neighborhood.L} <= ${neighborhood.C} <= ${neighborhood.R} is required.`
    );
  }
  const level = neighborhood.level ?? 0;
  if (!Number.isInteger(level) || level < 0) {
    throw new RangeError("Resolution Level must be a non-negative integer.");
  }
  neighborhood.level = level;
  return neighborhood;
}

/**
 * Make a Neighborhood a valid frame for a retained Extent without moving
 * Current or replacing either object. A linear operator normally needs to
 * advance only the endpoint it approaches; this postcondition also repairs
 * restored or persisted endpoint frames that predate that rule.
 */
export function containExtent(neighborhood, extent, range) {
  assertNeighborhood(neighborhood);
  if (
    !extent
    || !Number.isFinite(extent.start)
    || !Number.isFinite(extent.end)
    || extent.start > extent.end
  ) {
    throw new TypeError("Neighborhood containment requires a valid Extent.");
  }
  if (
    !range
    || !Number.isFinite(range.start)
    || !Number.isFinite(range.end)
    || range.start > range.end
  ) {
    throw new TypeError("Neighborhood containment requires a valid Range.");
  }
  if (
    extent.start < range.start - EPSILON
    || extent.end > range.end + EPSILON
  ) {
    throw new RangeError("A Neighborhood cannot contain an Extent outside Range.");
  }

  const L = Math.max(range.start, Math.min(neighborhood.L, extent.start));
  const R = Math.min(range.end, Math.max(neighborhood.R, extent.end));
  const expanded = L < neighborhood.L - EPSILON || R > neighborhood.R + EPSILON;
  return assertNeighborhood({
    L,
    C: neighborhood.C,
    R,
    level: expanded ? 0 : neighborhood.level ?? 0
  });
}

export function getTargets(neighborhood, metric = null) {
  assertNeighborhood(neighborhood);
  const L = metricCoordinate(metric, neighborhood.L);
  const C = metricCoordinate(metric, neighborhood.C);
  const R = metricCoordinate(metric, neighborhood.R);
  const backwardCoordinate = midpoint(L, C);
  const forwardCoordinate = midpoint(C, R);
  const backward = metricAddress(metric, backwardCoordinate);
  const forward = metricAddress(metric, forwardCoordinate);
  return {
    backward: backwardCoordinate < C - EPSILON
      ? backward
      : null,
    forward: forwardCoordinate > C + EPSILON
      ? forward
      : null
  };
}

/**
 * Plain Refine composes around the retained departure only while that
 * departure remains outside the newly traversed Current-to-target path.
 *
 * Once the target reaches or passes the retained departure, that Address is
 * part of the movement rather than its origin. Reusing it as the departure
 * would discard the Current-to-departure portion and make a reversal appear
 * subtractive. In that case the complete movement must start at Current.
 */
export function classifyRetainedRefineRelation(interval, current, target) {
  if (
    !interval
    || !Number.isFinite(current)
    || !Number.isFinite(target)
    || !Number.isFinite(interval.departure)
    || !Number.isFinite(interval.arrival)
    || Math.abs(interval.arrival - current) > EPSILON
    || Math.abs(interval.departure - current) <= EPSILON
  ) return "full";

  const pathStart = Math.min(current, target);
  const pathEnd = Math.max(current, target);
  const departureIsTraversed = interval.departure >= pathStart - EPSILON
    && interval.departure <= pathEnd + EPSILON;
  return departureIsTraversed ? "full" : "retain";
}

export function refineBlockReason(neighborhood, range, direction, metric = null) {
  assertNeighborhood(neighborhood);
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new TypeError("Refine availability requires a valid Range.");
  }
  const targets = getTargets(neighborhood, metric);
  if (targets[direction] !== null) return null;
  if (direction === "backward") {
    return neighborhood.C <= range.start + EPSILON
      ? "range-start"
      : "resolution-limit";
  }
  if (direction === "forward") {
    return neighborhood.C >= range.end - EPSILON
      ? "range-end"
      : "resolution-limit";
  }
  throw new TypeError(`Unknown direction: ${direction}`);
}

export function descend(neighborhood, direction, target, range = null) {
  assertNeighborhood(neighborhood);
  if (!Number.isFinite(target)) throw new TypeError("A finite destination is required.");

  const level = (neighborhood.level ?? 0) + 1;
  if (direction === "backward") {
    const minimum = range?.start ?? neighborhood.L;
    if (!(target >= minimum - EPSILON && target < neighborhood.C - EPSILON)) {
      throw new RangeError("Backward destination must precede Current and remain inside Range.");
    }
    return assertNeighborhood({
      L: target < neighborhood.L ? minimum : neighborhood.L,
      C: clamp(target, minimum, neighborhood.C),
      R: neighborhood.C,
      level
    });
  }

  if (direction === "forward") {
    const maximum = range?.end ?? neighborhood.R;
    if (!(target > neighborhood.C + EPSILON && target <= maximum + EPSILON)) {
      throw new RangeError("Forward destination must follow Current and remain inside Range.");
    }
    return assertNeighborhood({
      L: neighborhood.C,
      C: clamp(target, neighborhood.C, maximum),
      R: target > neighborhood.R ? maximum : neighborhood.R,
      level
    });
  }

  throw new TypeError(`Unknown direction: ${direction}`);
}

export function refineNeighborhood(neighborhood, destination, range) {
  assertNeighborhood(neighborhood);
  if (!Number.isFinite(destination)) throw new TypeError("A finite destination is required.");
  if (Math.abs(destination - neighborhood.C) <= EPSILON) return neighborhood;
  return descend(
    neighborhood,
    destination < neighborhood.C ? "backward" : "forward",
    destination,
    range
  );
}

/**
 * Establish a local two-sided Neighborhood from an actual movement.
 *
 * The crossed Working Interval is the central fifth of the new frame in the
 * active metric: two Interval-width margins precede it and two follow it.
 * Clipping at Range may remove unavailable margin, but never shifts the
 * Interval or invents distance on the other side. Current remains the arrival
 * endpoint, so both directional refinement midpoints exist whenever Range
 * actually has space on both sides.
 *
 * A zero-distance movement cannot communicate a lateral scale.
 */
export function seedNeighborhoodFromMovement(departure, arrival, range, metric = null) {
  if (!Number.isFinite(departure) || !Number.isFinite(arrival)) {
    throw new TypeError("Movement-seeded Resolution requires finite Addresses.");
  }
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start > range.end) {
    throw new TypeError("Movement-seeded Resolution requires a valid Range.");
  }

  const A = clamp(departure, range.start, range.end);
  const C = clamp(arrival, range.start, range.end);
  const rangeStart = metricCoordinate(metric, range.start);
  const rangeEnd = metricCoordinate(metric, range.end);
  const departureCoordinate = metricCoordinate(metric, A);
  const currentCoordinate = metricCoordinate(metric, C);
  const intervalStart = Math.min(departureCoordinate, currentCoordinate);
  const intervalEnd = Math.max(departureCoordinate, currentCoordinate);
  const scale = intervalEnd - intervalStart;
  if (scale <= EPSILON) return createRoot(range.start, C, range.end);

  const margin = scale * 2;
  const leftCoordinate = Math.max(rangeStart, intervalStart - margin);
  const rightCoordinate = Math.min(rangeEnd, intervalEnd + margin);
  return assertNeighborhood({
    L: clamp(
      metricAddress(metric, leftCoordinate),
      range.start,
      range.end
    ),
    C,
    R: clamp(
      metricAddress(metric, rightCoordinate),
      range.start,
      range.end
    ),
    level: 0
  });
}

export function isRangeNeighborhood(neighborhood, range) {
  assertNeighborhood(neighborhood);
  return Boolean(
    range
    && Number.isFinite(range.start)
    && Number.isFinite(range.end)
    && Math.abs(neighborhood.L - range.start) <= EPSILON
    && Math.abs(neighborhood.R - range.end) <= EPSILON
  );
}

export function reopenToRange(current, range) {
  if (!Number.isFinite(current)) throw new TypeError("A finite Current is required.");
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start > range.end) {
    throw new TypeError("A valid Range is required.");
  }
  return createRoot(range.start, current, range.end, 0);
}

export function canReopen(neighborhood, range) {
  assertNeighborhood(neighborhood);
  return neighborhood.L > range.start + EPSILON || neighborhood.R < range.end - EPSILON;
}

export function normalizeDirectionalReach(value, fallback = 10) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) {
    const reach = Number(value);
    return { backward: reach, forward: reach, linked: true };
  }
  const backward = Number(value?.backward);
  const forward = Number(value?.forward);
  const safeFallback = Number.isFinite(Number(fallback)) && Number(fallback) > 0 ? Number(fallback) : 10;
  return {
    backward: Number.isFinite(backward) && backward > 0 ? backward : safeFallback,
    forward: Number.isFinite(forward) && forward > 0 ? forward : safeFallback,
    linked: value?.linked !== false
  };
}

export function stepTarget(current, seconds, direction, range, metric = null) {
  if (!Number.isFinite(current) || !Number.isFinite(seconds) || seconds <= 0) {
    throw new TypeError("Step requires a finite Current and a positive duration.");
  }
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new TypeError("Step requires a valid Range.");
  }
  const minimum = metricCoordinate(metric, range.start);
  const maximum = metricCoordinate(metric, range.end);
  const origin = metricCoordinate(metric, current);
  if (direction === "backward") {
    return clamp(
      metricAddress(
        metric,
        clamp(origin - seconds, minimum, maximum)
      ),
      range.start,
      range.end
    );
  }
  if (direction === "forward") {
    return clamp(
      metricAddress(
        metric,
        clamp(origin + seconds, minimum, maximum)
      ),
      range.start,
      range.end
    );
  }
  throw new TypeError(`Unknown direction: ${direction}`);
}

export function stepNeighborhood(
  neighborhood,
  destination,
  range,
  stepSeconds = Math.abs(destination - neighborhood.C),
  metric = null
) {
  assertNeighborhood(neighborhood);
  if (!Number.isFinite(destination)) throw new TypeError("Step destination must be finite.");
  const C = clamp(destination, range.start, range.end);
  const reach = Number.isFinite(stepSeconds) && stepSeconds > EPSILON
    ? stepSeconds
    : Math.abs(C - neighborhood.C);
  const next = {
    L: neighborhood.L,
    C,
    R: neighborhood.R,
    level: neighborhood.level ?? 0
  };

  // Step is linear, but Resolution does not translate with every movement.
  // The endpoint being left is fixed. The approached endpoint is fixed until
  // the *prospective* directional midpoint is no farther than one Step from
  // Current. From that threshold onward, advance only that endpoint far enough
  // to keep the next directional midpoint one Step ahead (unless Range clips
  // it). Evaluating the prospective frame makes coalesced/reversed Step
  // gestures depend only on their net destination rather than tap cadence.
  const currentCoordinate = metricCoordinate(metric, neighborhood.C);
  const destinationCoordinate = metricCoordinate(metric, C);
  const leftCoordinate = metricCoordinate(metric, neighborhood.L);
  const rightCoordinate = metricCoordinate(metric, neighborhood.R);
  const rangeStart = metricCoordinate(metric, range.start);
  const rangeEnd = metricCoordinate(metric, range.end);
  const delta = destinationCoordinate - currentCoordinate;
  const sourceDelta = C - neighborhood.C;
  const movingForward = delta > EPSILON
    || (Math.abs(delta) <= EPSILON && sourceDelta > EPSILON);
  const movingBackward = delta < -EPSILON
    || (Math.abs(delta) <= EPSILON && sourceDelta < -EPSILON);

  if (movingForward) {
    const prospectiveHalfSpan = Math.max(
      0,
      rightCoordinate - destinationCoordinate
    ) / 2;
    const crossedSourceBound = C > neighborhood.R + EPSILON;
    const guardReached = prospectiveHalfSpan <= reach + EPSILON
      || destinationCoordinate >= rightCoordinate - EPSILON
      || crossedSourceBound;
    if (!guardReached) return assertNeighborhood(next);
    const guardedCoordinate = Math.max(
      rightCoordinate,
      destinationCoordinate + reach * 2
    );
    next.R = clamp(
      metricAddress(
        metric,
        Math.min(rangeEnd, guardedCoordinate)
      ),
      range.start,
      range.end
    );
    if (next.R < C) next.R = C;
    if (next.R > neighborhood.R + EPSILON) next.level = 0;
  } else if (movingBackward) {
    const prospectiveHalfSpan = Math.max(
      0,
      destinationCoordinate - leftCoordinate
    ) / 2;
    const crossedSourceBound = C < neighborhood.L - EPSILON;
    const guardReached = prospectiveHalfSpan <= reach + EPSILON
      || destinationCoordinate <= leftCoordinate + EPSILON
      || crossedSourceBound;
    if (!guardReached) return assertNeighborhood(next);
    const guardedCoordinate = Math.min(
      leftCoordinate,
      destinationCoordinate - reach * 2
    );
    next.L = clamp(
      metricAddress(
        metric,
        Math.max(rangeStart, guardedCoordinate)
      ),
      range.start,
      range.end
    );
    if (next.L > C) next.L = C;
    if (next.L < neighborhood.L - EPSILON) next.level = 0;
  }

  return assertNeighborhood(next);
}

/**
 * Translate Current through a Neighborhood without replacing its two-sided
 * relation. The endpoint in the direction of travel advances by the same
 * signed distance while the endpoint being left remains fixed. Range is the
 * sole hard boundary, so clipping may compress only the approached side.
 *
 * This is the continuous counterpart to a spatial traversal: playback moves
 * one active endpoint through the existing Resolution rather than opening a
 * new Resolution around its departure and arrival.
 */
export function translateNeighborhood(neighborhood, destination, range, metric = null) {
  assertNeighborhood(neighborhood);
  if (!Number.isFinite(destination)) {
    throw new TypeError("Linear destination must be a finite number.");
  }
  if (
    !range
    || !Number.isFinite(range.start)
    || !Number.isFinite(range.end)
    || range.start > range.end
  ) {
    throw new TypeError("Linear translation requires a valid Range.");
  }

  const C = clamp(destination, range.start, range.end);
  const currentCoordinate = metricCoordinate(metric, neighborhood.C);
  const destinationCoordinate = metricCoordinate(metric, C);
  const leftCoordinate = metricCoordinate(metric, neighborhood.L);
  const rightCoordinate = metricCoordinate(metric, neighborhood.R);
  const rangeStart = metricCoordinate(metric, range.start);
  const rangeEnd = metricCoordinate(metric, range.end);
  const delta = destinationCoordinate - currentCoordinate;
  const next = {
    L: neighborhood.L,
    C,
    R: neighborhood.R,
    level: neighborhood.level ?? 0
  };

  if (delta > EPSILON) {
    const translated = Math.min(rangeEnd, rightCoordinate + delta);
    next.R = clamp(
      metricAddress(metric, translated),
      range.start,
      range.end
    );
    if (translated > rightCoordinate + EPSILON) next.level = 0;
  } else if (delta < -EPSILON) {
    const translated = Math.max(rangeStart, leftCoordinate + delta);
    next.L = clamp(
      metricAddress(metric, translated),
      range.start,
      range.end
    );
    if (translated < leftCoordinate - EPSILON) next.level = 0;
  }

  return assertNeighborhood(next);
}

export function getActionRanges(
  neighborhood,
  range,
  interval = null,
  current = neighborhood.C,
  stepReach = 10,
  metric = null
) {
  assertNeighborhood(neighborhood);
  const targets = getTargets(neighborhood, metric);
  const backwardNeighborhood = targets.backward === null
    ? null
    : descend(neighborhood, "backward", targets.backward, range);
  const forwardNeighborhood = targets.forward === null
    ? null
    : descend(neighborhood, "forward", targets.forward, range);
  const reopened = canReopen(neighborhood, range) ? reopenToRange(current, range) : null;
  const reach = normalizeDirectionalReach(stepReach);
  const stepBackward = stepTarget(neighborhood.C, reach.backward, "backward", range, metric);
  const stepForward = stepTarget(neighborhood.C, reach.forward, "forward", range, metric);
  const currentCoordinate = metricCoordinate(metric, neighborhood.C);
  const backwardCoordinate = metricCoordinate(metric, stepBackward);
  const forwardCoordinate = metricCoordinate(metric, stepForward);

  return {
    targets,
    backward: backwardNeighborhood
      ? { start: backwardNeighborhood.L, end: backwardNeighborhood.R }
      : null,
    forward: forwardNeighborhood
      ? { start: forwardNeighborhood.L, end: forwardNeighborhood.R }
      : null,
    reopen: reopened
      ? { start: reopened.L, end: reopened.R, current: reopened.C }
      : null,
    stepBackward: backwardCoordinate < currentCoordinate - EPSILON
      ? { start: stepBackward, end: neighborhood.C, destination: stepBackward }
      : null,
    stepForward: forwardCoordinate > currentCoordinate + EPSILON
      ? { start: neighborhood.C, end: stepForward, destination: stepForward }
      : null,
    interval: interval?.end > interval?.start
      ? { start: interval.start, end: interval.end }
      : null
  };
}
