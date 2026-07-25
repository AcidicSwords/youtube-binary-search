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

export function getTargets(frame, split = null, scope = null) {
  assertFrame(frame);

  let earlier = frame.L < frame.C - EPSILON ? (frame.L + frame.C) / 2 : null;
  let later = frame.C < frame.R - EPSILON ? (frame.C + frame.R) / 2 : null;

  const splitStart = scope?.start ?? frame.L;
  const splitEnd = scope?.end ?? frame.R;
  if (Number.isFinite(split) && split > splitStart + EPSILON && split < splitEnd - EPSILON) {
    if (split < frame.C - EPSILON) earlier = split;
    if (split > frame.C + EPSILON) later = split;
  }

  return { earlier, later };
}

export function descend(frame, direction, target, scope = null) {
  assertFrame(frame);

  if (!Number.isFinite(target)) {
    throw new TypeError("A finite target is required.");
  }

  if (direction === "earlier") {
    const minimum = scope?.start ?? frame.L;
    if (!(target >= minimum && target < frame.C)) {
      throw new RangeError("Earlier target must be before C and inside the active scope.");
    }
    return assertFrame({
      L: target < frame.L ? minimum : frame.L,
      C: target,
      R: frame.C
    });
  }

  if (direction === "later") {
    const maximum = scope?.end ?? frame.R;
    if (!(target > frame.C && target <= maximum)) {
      throw new RangeError("Later target must be after C and inside the active scope.");
    }
    return assertFrame({
      L: frame.C,
      C: target,
      R: target > frame.R ? maximum : frame.R
    });
  }

  throw new TypeError(`Unknown direction: ${direction}`);
}

export function intervalMidpoint(start, end) {
  return start + (end - start) / 2;
}

export function settlePlayback(frame, departure, current) {
  assertFrame(frame);
  if (!Number.isFinite(departure) || !Number.isFinite(current)) {
    throw new TypeError("Playback positions must be finite numbers.");
  }

  const start = clamp(departure, frame.L, frame.R);
  const C = clamp(current, frame.L, frame.R);
  const next = { ...frame, C };

  if (C > start + EPSILON) next.L = Math.max(frame.L, start);
  if (C < start - EPSILON) next.R = Math.min(frame.R, start);

  return assertFrame(next);
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
