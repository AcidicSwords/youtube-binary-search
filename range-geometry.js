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

export function createRoot(start, current, end, level = 0) {
  return assertNeighborhood({ L: start, C: clamp(current, start, end), R: end, level });
}

export function assertNeighborhood(neighborhood) {
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

export function getTargets(neighborhood) {
  assertNeighborhood(neighborhood);
  const backward = midpoint(neighborhood.L, neighborhood.C);
  const forward = midpoint(neighborhood.C, neighborhood.R);
  return {
    backward: backward < neighborhood.C - EPSILON
      ? backward
      : null,
    forward: forward > neighborhood.C + EPSILON
      ? forward
      : null
  };
}

export function refineBlockReason(neighborhood, range, direction) {
  assertNeighborhood(neighborhood);
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new TypeError("Refine availability requires a valid Range.");
  }
  const targets = getTargets(neighborhood);
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
 * Establish a local two-sided Neighborhood from an actual movement. The crossed
 * Interval occupies one side of Current; the opposite side is generated at the
 * same scale and clipped to Range. This preserves the scale communicated by Go
 * without changing Range or conflating Neighborhood with Interval.
 */
export function seedNeighborhoodFromMovement(departure, arrival, range) {
  if (!Number.isFinite(departure) || !Number.isFinite(arrival)) {
    throw new TypeError("Movement-seeded Resolution requires finite Addresses.");
  }
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start > range.end) {
    throw new TypeError("Movement-seeded Resolution requires a valid Range.");
  }

  const A = clamp(departure, range.start, range.end);
  const C = clamp(arrival, range.start, range.end);
  const scale = Math.abs(C - A);
  if (scale <= EPSILON) return createRoot(range.start, C, range.end);

  if (C > A) {
    return assertNeighborhood({
      L: A,
      C,
      R: Math.min(range.end, C + scale),
      level: 0
    });
  }

  return assertNeighborhood({
    L: Math.max(range.start, C - scale),
    C,
    R: A,
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

export function stepTarget(current, seconds, direction, range) {
  if (!Number.isFinite(current) || !Number.isFinite(seconds) || seconds <= 0) {
    throw new TypeError("Step requires a finite Current and a positive duration.");
  }
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new TypeError("Step requires a valid Range.");
  }
  if (direction === "backward") return clamp(current - seconds, range.start, range.end);
  if (direction === "forward") return clamp(current + seconds, range.start, range.end);
  throw new TypeError(`Unknown direction: ${direction}`);
}

export function stepNeighborhood(
  neighborhood,
  destination,
  range,
  stepSeconds = Math.abs(destination - neighborhood.C)
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

  // Step is linear: it preserves the endpoint being left and pushes only the
  // approached refinement endpoint. If the Step reaches or crosses that bound,
  // retain a full Step beyond Current so the next directional Refine remains
  // available at half-Step scale (unless Range is the hard stop).
  const delta = C - neighborhood.C;
  if (delta > EPSILON) {
    const translated = neighborhood.R + delta;
    const crossed = C >= neighborhood.R - EPSILON ? C + reach : translated;
    next.R = Math.min(range.end, Math.max(translated, crossed));
    next.level = 0;
  } else if (delta < -EPSILON) {
    const translated = neighborhood.L + delta;
    const crossed = C <= neighborhood.L + EPSILON ? C - reach : translated;
    next.L = Math.max(range.start, Math.min(translated, crossed));
    next.level = 0;
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
export function translateNeighborhood(neighborhood, destination, range) {
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
  const delta = C - neighborhood.C;
  const next = {
    L: neighborhood.L,
    C,
    R: neighborhood.R,
    level: neighborhood.level ?? 0
  };

  if (delta > EPSILON) {
    next.R = Math.min(range.end, neighborhood.R + delta);
    if (next.R > neighborhood.R + EPSILON) next.level = 0;
  } else if (delta < -EPSILON) {
    next.L = Math.max(range.start, neighborhood.L + delta);
    if (next.L < neighborhood.L - EPSILON) next.level = 0;
  }

  return assertNeighborhood(next);
}

export function settleContinuous(neighborhood, departure, current, range = null) {
  if (!Number.isFinite(departure) || !Number.isFinite(current)) {
    throw new TypeError("Continuous positions must be finite numbers.");
  }
  if (Math.abs(departure - neighborhood.C) > EPSILON) {
    throw new RangeError("Continuous departure must equal the parent Neighborhood Current.");
  }
  return translateNeighborhood(
    neighborhood,
    current,
    range || { start: neighborhood.L, end: neighborhood.R }
  );
}

export function getActionRanges(
  neighborhood,
  range,
  interval = null,
  current = neighborhood.C,
  stepReach = 10
) {
  assertNeighborhood(neighborhood);
  const targets = getTargets(neighborhood);
  const backwardNeighborhood = targets.backward === null
    ? null
    : descend(neighborhood, "backward", targets.backward, range);
  const forwardNeighborhood = targets.forward === null
    ? null
    : descend(neighborhood, "forward", targets.forward, range);
  const reopened = canReopen(neighborhood, range) ? reopenToRange(current, range) : null;
  const reach = normalizeDirectionalReach(stepReach);
  const stepBackward = stepTarget(neighborhood.C, reach.backward, "backward", range);
  const stepForward = stepTarget(neighborhood.C, reach.forward, "forward", range);

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
    stepBackward: stepBackward < neighborhood.C - EPSILON
      ? { start: stepBackward, end: neighborhood.C, destination: stepBackward }
      : null,
    stepForward: stepForward > neighborhood.C + EPSILON
      ? { start: neighborhood.C, end: stepForward, destination: stepForward }
      : null,
    skim: targets.forward === null ? null : { start: neighborhood.C, end: targets.forward },
    loop: interval?.end > interval?.start
      ? { start: interval.start, end: interval.end }
      : null
  };
}

// Retained for compatibility with external imports; Skim no longer uses a
// progress-dependent curve because YouTube exposes only a small boosted range.
export function logSpeed(maxRate, progress) {
  return Math.pow(Math.max(1, maxRate), 1 - clamp(progress, 0, 1));
}

export function chooseSupportedRate(availableRates, desiredRate) {
  const rates = [...new Set(availableRates)]
    .filter(rate => Number.isFinite(rate) && rate >= 1)
    .sort((a, b) => a - b);

  if (!rates.length) return 1;
  let chosen = rates[0];
  for (const rate of rates) {
    if (rate <= desiredRate + 1e-9) chosen = rate;
    else break;
  }
  return chosen;
}
