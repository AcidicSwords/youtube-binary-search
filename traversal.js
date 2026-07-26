export const EPSILON = 0.04;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createRoot(start, current, end, level = 0) {
  const C = clamp(current, start, end);
  return assertFrame({ L: start, C, R: end, level });
}

export function assertFrame(frame) {
  if (!frame || !Number.isFinite(frame.L) || !Number.isFinite(frame.C) || !Number.isFinite(frame.R)) {
    throw new TypeError("Frame positions must be finite numbers.");
  }
  if (frame.L > frame.C || frame.C > frame.R) {
    throw new RangeError(`Invalid frame ordering: ${frame.L} <= ${frame.C} <= ${frame.R} is required.`);
  }
  const level = frame.level ?? 0;
  if (!Number.isInteger(level) || level < 0) {
    throw new RangeError("Frame level must be a non-negative integer.");
  }
  frame.level = level;
  return frame;
}

export function getTargets(frame, point = null, range = null) {
  assertFrame(frame);

  let earlier = frame.L < frame.C - EPSILON ? (frame.L + frame.C) / 2 : null;
  let later = frame.C < frame.R - EPSILON ? (frame.C + frame.R) / 2 : null;

  const pointStart = range?.start ?? frame.L;
  const pointEnd = range?.end ?? frame.R;
  if (
    Number.isFinite(point)
    && point >= pointStart - EPSILON
    && point <= pointEnd + EPSILON
  ) {
    if (point < frame.C - EPSILON) earlier = point;
    if (point > frame.C + EPSILON) later = point;
  }

  return { earlier, later };
}

export function descend(frame, direction, target, range = null) {
  assertFrame(frame);
  if (!Number.isFinite(target)) throw new TypeError("A finite target is required.");

  const level = (frame.level ?? 0) + 1;
  if (direction === "earlier") {
    const minimum = range?.start ?? frame.L;
    if (!(target >= minimum - EPSILON && target < frame.C - EPSILON)) {
      throw new RangeError("Earlier target must be before Current and inside the active Range.");
    }
    return assertFrame({
      L: target < frame.L ? minimum : frame.L,
      C: clamp(target, minimum, frame.C),
      R: frame.C,
      level
    });
  }

  if (direction === "later") {
    const maximum = range?.end ?? frame.R;
    if (!(target > frame.C + EPSILON && target <= maximum + EPSILON)) {
      throw new RangeError("Later target must be after Current and inside the active Range.");
    }
    return assertFrame({
      L: frame.C,
      C: clamp(target, frame.C, maximum),
      R: target > frame.R ? maximum : frame.R,
      level
    });
  }

  throw new TypeError(`Unknown direction: ${direction}`);
}

export function spanMidpoint(start, end) {
  return start + (end - start) / 2;
}

// Compatibility during the v1 -> v2 transition.
export const intervalMidpoint = spanMidpoint;

export function widenToRange(current, range) {
  if (!Number.isFinite(current)) throw new TypeError("A finite Current is required.");
  if (
    !range
    || !Number.isFinite(range.start)
    || !Number.isFinite(range.end)
    || range.start > range.end
  ) {
    throw new TypeError("A valid outer Range is required.");
  }
  return createRoot(range.start, current, range.end, 0);
}

export function canWiden(frame, range) {
  assertFrame(frame);
  return frame.L > range.start + EPSILON || frame.R < range.end - EPSILON;
}

export function pointAfterUndo(stack, depth, currentPoint = null) {
  if (!Array.isArray(stack) || !Number.isInteger(depth) || depth < 0 || depth >= stack.length) {
    throw new TypeError("Undo requires a frame history and a valid destination depth.");
  }

  let point = Number.isFinite(currentPoint) ? currentPoint : null;
  for (let index = stack.length - 1; index > depth; index -= 1) {
    if (Number.isFinite(stack[index].returnPoint)) point = stack[index].returnPoint;
  }
  return point;
}

export function stepTarget(current, seconds, direction, range) {
  if (!Number.isFinite(current) || !Number.isFinite(seconds) || seconds <= 0) {
    throw new TypeError("Step requires a finite Current and a positive duration.");
  }
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new TypeError("Step requires a valid Range.");
  }
  if (direction === "earlier") return clamp(current - seconds, range.start, range.end);
  if (direction === "later") return clamp(current + seconds, range.start, range.end);
  throw new TypeError(`Unknown direction: ${direction}`);
}

export function stepFrame(frame, target, range) {
  assertFrame(frame);
  if (!Number.isFinite(target)) throw new TypeError("Step target must be finite.");
  const C = clamp(target, range.start, range.end);
  if (C >= frame.L - EPSILON && C <= frame.R + EPSILON) {
    const next = { L: frame.L, C, R: frame.R, level: frame.level ?? 0 };
    return assertFrame(next);
  }
  return widenToRange(C, range);
}

export function bindPassageStart(frame, address) {
  assertFrame(frame);
  if (!Number.isFinite(address) || !(address < frame.C - EPSILON)) {
    throw new RangeError("Passage Start must be earlier than Current.");
  }
  return assertFrame({ L: address, C: frame.C, R: frame.R, level: frame.level ?? 0 });
}

export function bindPassageEnd(frame, address) {
  assertFrame(frame);
  if (!Number.isFinite(address) || !(address > frame.C + EPSILON)) {
    throw new RangeError("Passage End must be later than Current.");
  }
  return assertFrame({ L: frame.L, C: frame.C, R: address, level: frame.level ?? 0 });
}

export function getActionRanges(
  frame,
  range,
  point = null,
  parent = null,
  lastTraversal = null,
  current = frame.C,
  stepSeconds = 10
) {
  assertFrame(frame);
  const targets = getTargets(frame, point, range);
  const earlierChild = targets.earlier === null ? null : descend(frame, "earlier", targets.earlier, range);
  const laterChild = targets.later === null ? null : descend(frame, "later", targets.later, range);

  if (parent) assertFrame(parent);
  const widened = canWiden(frame, range) ? widenToRange(current, range) : null;
  const undoPoint = parent ? pointAfterUndo([parent, frame], 0, point) : null;
  const undoTargets = parent ? getTargets(parent, undoPoint, range) : null;
  const widenTargets = widened ? getTargets(widened, point, range) : null;

  const repeat = lastTraversal
    && Number.isFinite(lastTraversal.start)
    && Number.isFinite(lastTraversal.end)
    && lastTraversal.end > lastTraversal.start
    ? { start: lastTraversal.start, end: lastTraversal.end }
    : null;

  const undo = parent ? {
    start: parent.L,
    end: parent.R,
    current: parent.C,
    earlier: undoTargets.earlier,
    later: undoTargets.later
  } : null;
  if (undo && Number.isFinite(undoPoint)) undo.point = undoPoint;

  const widen = widened ? {
    start: widened.L,
    end: widened.R,
    current: widened.C,
    earlier: widenTargets.earlier,
    later: widenTargets.later
  } : null;
  if (widen && Number.isFinite(point)) widen.point = point;

  const stepEarlierTarget = stepTarget(frame.C, stepSeconds, "earlier", range);
  const stepLaterTarget = stepTarget(frame.C, stepSeconds, "later", range);

  return {
    targets,
    earlier: earlierChild ? { start: earlierChild.L, end: earlierChild.R } : null,
    later: laterChild ? { start: laterChild.L, end: laterChild.R } : null,
    undo,
    widen,
    stepEarlier: stepEarlierTarget < frame.C - EPSILON
      ? { start: stepEarlierTarget, end: frame.C, destination: stepEarlierTarget }
      : null,
    stepLater: stepLaterTarget > frame.C + EPSILON
      ? { start: frame.C, end: stepLaterTarget, destination: stepLaterTarget }
      : null,
    skim: targets.later === null ? null : { start: frame.C, end: targets.later },
    repeat
  };
}

export function settlePlayback(frame, departure, current) {
  assertFrame(frame);
  if (!Number.isFinite(departure) || !Number.isFinite(current)) {
    throw new TypeError("Playback positions must be finite numbers.");
  }

  const start = clamp(departure, frame.L, frame.R);
  const C = clamp(current, frame.L, frame.R);
  const next = { L: frame.L, C, R: frame.R, level: frame.level ?? 0 };
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
