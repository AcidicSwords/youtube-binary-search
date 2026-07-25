export const EPSILON = 0.04;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createRoot(start, current, end) {
  const C = clamp(current, start, end);
  return { L: start, C, R: end };
}

export function assertFrame(frame) {
  if (!frame || !Number.isFinite(frame.L) || !Number.isFinite(frame.C) || !Number.isFinite(frame.R)) {
    throw new TypeError("Frame positions must be finite numbers.");
  }
  if (frame.L > frame.C || frame.C > frame.R) {
    throw new RangeError(`Invalid frame ordering: ${frame.L} <= ${frame.C} <= ${frame.R} is required.`);
  }
  return frame;
}

export function getTargets(frame, split = null) {
  assertFrame(frame);

  let earlier = frame.L < frame.C - EPSILON ? (frame.L + frame.C) / 2 : null;
  let later = frame.C < frame.R - EPSILON ? (frame.C + frame.R) / 2 : null;

  if (Number.isFinite(split) && split > frame.L + EPSILON && split < frame.R - EPSILON) {
    if (split < frame.C - EPSILON) earlier = split;
    if (split > frame.C + EPSILON) later = split;
  }

  return { earlier, later };
}

export function descend(frame, direction, target) {
  assertFrame(frame);

  if (!Number.isFinite(target)) {
    throw new TypeError("A finite target is required.");
  }

  if (direction === "earlier") {
    if (!(target >= frame.L && target < frame.C)) {
      throw new RangeError("Earlier target must be inside [L, C).");
    }
    return assertFrame({ L: frame.L, C: target, R: frame.C });
  }

  if (direction === "later") {
    if (!(target > frame.C && target <= frame.R)) {
      throw new RangeError("Later target must be inside (C, R].");
    }
    return assertFrame({ L: frame.C, C: target, R: frame.R });
  }

  throw new TypeError(`Unknown direction: ${direction}`);
}

export function intervalMidpoint(start, end) {
  return start + (end - start) / 2;
}

export function logSpeed(maxRate, progress) {
  const p = clamp(progress, 0, 1);
  return Math.pow(Math.max(1, maxRate), 1 - p);
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
