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

export function getTargets(frame, point = null, scope = null) {
  assertFrame(frame);

  let earlier = frame.L < frame.C - EPSILON ? (frame.L + frame.C) / 2 : null;
  let later = frame.C < frame.R - EPSILON ? (frame.C + frame.R) / 2 : null;

  const pointStart = scope?.start ?? frame.L;
  const pointEnd = scope?.end ?? frame.R;
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

export function widenAtCurrent(parent, current) {
  assertFrame(parent);
  if (!Number.isFinite(current)) {
    throw new TypeError("A finite current position is required.");
  }
  if (current < parent.L - EPSILON || current > parent.R + EPSILON) {
    throw new RangeError("The current position must be inside the widened passage.");
  }

  return assertFrame({
    L: parent.L,
    C: clamp(current, parent.L, parent.R),
    R: parent.R
  });
}

export function widenStackAtCurrent(stack, current, scope) {
  if (!Array.isArray(stack) || !stack.length) {
    throw new TypeError("A non-empty frame stack is required.");
  }
  stack.forEach(assertFrame);
  if (!Number.isFinite(current)) {
    throw new TypeError("A finite current position is required.");
  }

  const C = clamp(current, scope.start, scope.end);
  const active = stack.at(-1);
  if (C >= active.L - EPSILON && C <= active.R + EPSILON) {
    return { stack: stack.map(frame => ({ ...frame })), levels: 0 };
  }

  let baseIndex = stack.length - 2;
  while (
    baseIndex >= 0
    && (C < stack[baseIndex].L - EPSILON || C > stack[baseIndex].R + EPSILON)
  ) {
    baseIndex -= 1;
  }

  let widened;
  if (baseIndex >= 0) {
    const base = stack[baseIndex];
    widened = { ...base, ...widenAtCurrent(base, C) };
    const returnPoint = Number.isFinite(active.returnPoint)
      ? active.returnPoint
      : base.returnPoint;
    if (Number.isFinite(returnPoint)) widened.returnPoint = returnPoint;
  } else {
    widened = createRoot(scope.start, C, scope.end);
  }

  const next = baseIndex >= 0
    ? [...stack.slice(0, baseIndex), widened]
    : [widened];

  return {
    stack: next,
    levels: Math.max(1, stack.length - next.length)
  };
}

export function pointAfterUndo(stack, depth, currentPoint = null) {
  if (!Array.isArray(stack) || !Number.isInteger(depth) || depth < 0 || depth >= stack.length) {
    throw new TypeError("Undo requires a frame stack and a valid destination depth.");
  }

  let point = Number.isFinite(currentPoint) ? currentPoint : null;
  for (let index = stack.length - 1; index > depth; index -= 1) {
    if (Number.isFinite(stack[index].returnPoint)) {
      point = stack[index].returnPoint;
    }
  }
  return point;
}

export function getActionRanges(
  frame,
  scope,
  point = null,
  parent = null,
  lastPassage = null,
  current = frame.C
) {
  assertFrame(frame);
  const targets = getTargets(frame, point, scope);
  const earlierChild = targets.earlier === null
    ? null
    : descend(frame, "earlier", targets.earlier, scope);
  const laterChild = targets.later === null
    ? null
    : descend(frame, "later", targets.later, scope);

  if (parent) assertFrame(parent);
  const rootCanWiden = !parent
    && (frame.L > scope.start + EPSILON || frame.R < scope.end - EPSILON);
  const widenBase = parent || (
    rootCanWiden
      ? { L: scope.start, C: frame.C, R: scope.end }
      : null
  );
  const widened = widenBase
    ? widenAtCurrent(widenBase, clamp(current, widenBase.L, widenBase.R))
    : null;
  const undoPoint = parent
    ? pointAfterUndo([parent, frame], 0, point)
    : null;
  const undoTargets = parent ? getTargets(parent, undoPoint, scope) : null;
  const widenTargets = widened ? getTargets(widened, point, scope) : null;

  const repeat = lastPassage
    && Number.isFinite(lastPassage.start)
    && Number.isFinite(lastPassage.end)
    && lastPassage.end > lastPassage.start
    ? { start: lastPassage.start, end: lastPassage.end }
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

  return {
    targets,
    earlier: earlierChild ? { start: earlierChild.L, end: earlierChild.R } : null,
    later: laterChild ? { start: laterChild.L, end: laterChild.R } : null,
    undo,
    widen,
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
