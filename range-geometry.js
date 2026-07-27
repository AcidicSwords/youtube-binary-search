export const EPSILON = 0.04;

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

export function getTargets(neighborhood) {
  assertNeighborhood(neighborhood);
  return {
    backward: neighborhood.L < neighborhood.C - EPSILON
      ? midpoint(neighborhood.L, neighborhood.C)
      : null,
    forward: neighborhood.C < neighborhood.R - EPSILON
      ? midpoint(neighborhood.C, neighborhood.R)
      : null
  };
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

export function stepNeighborhood(neighborhood, destination, range) {
  assertNeighborhood(neighborhood);
  if (!Number.isFinite(destination)) throw new TypeError("Step destination must be finite.");
  const C = clamp(destination, range.start, range.end);
  if (C >= neighborhood.L - EPSILON && C <= neighborhood.R + EPSILON) {
    return assertNeighborhood({
      L: neighborhood.L,
      C,
      R: neighborhood.R,
      level: neighborhood.level ?? 0
    });
  }
  return reopenToRange(C, range);
}

export function settleContinuous(neighborhood, departure, current) {
  assertNeighborhood(neighborhood);
  if (!Number.isFinite(departure) || !Number.isFinite(current)) {
    throw new TypeError("Continuous positions must be finite numbers.");
  }

  const start = clamp(departure, neighborhood.L, neighborhood.R);
  const C = clamp(current, neighborhood.L, neighborhood.R);
  const next = { L: neighborhood.L, C, R: neighborhood.R, level: neighborhood.level ?? 0 };
  if (C > start + EPSILON) next.L = Math.max(neighborhood.L, start);
  if (C < start - EPSILON) next.R = Math.min(neighborhood.R, start);
  return assertNeighborhood(next);
}

export function getActionRanges(
  neighborhood,
  range,
  interval = null,
  current = neighborhood.C,
  stepSeconds = 10
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
  const stepBackward = stepTarget(neighborhood.C, stepSeconds, "backward", range);
  const stepForward = stepTarget(neighborhood.C, stepSeconds, "forward", range);

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
