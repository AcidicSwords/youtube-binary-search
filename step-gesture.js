// One held Step gesture owns repeat cadence and one semantic transaction.
// DOM sources provide a current Step selection; Session/app code owns its effect.

export const DEFAULT_STEP_GESTURE_TIMING = Object.freeze({
  initialDelayMs: 250,
  repeatMs: 100,
  tapSettleMs: 240
});

function positiveDelay(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function createStepGestureController({
  perform,
  finish = () => {},
  onActiveChange = () => {},
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancelScheduled = timer => globalThis.clearTimeout(timer),
  initialDelayMs = DEFAULT_STEP_GESTURE_TIMING.initialDelayMs,
  repeatMs = DEFAULT_STEP_GESTURE_TIMING.repeatMs
} = {}) {
  if (typeof perform !== "function") {
    throw new TypeError("A Step gesture requires a perform callback.");
  }

  const timing = {
    initialDelayMs: positiveDelay(
      initialDelayMs,
      DEFAULT_STEP_GESTURE_TIMING.initialDelayMs
    ),
    repeatMs: positiveDelay(repeatMs, DEFAULT_STEP_GESTURE_TIMING.repeatMs)
  };
  let active = null;

  function clearTimer(token) {
    if (token?.timer !== null && token?.timer !== undefined) {
      cancelScheduled(token.timer);
      token.timer = null;
    }
  }

  function resolve(token) {
    const selection = token.resolveStep?.();
    if (
      !selection
      || !["backward", "forward"].includes(selection.direction)
      || !(Number.isFinite(Number(selection.distance)) && Number(selection.distance) > 0)
    ) return null;
    return {
      ...selection,
      distance: Number(selection.distance)
    };
  }

  function scheduleRepeat(token, delay) {
    clearTimer(token);
    token.timer = schedule(() => {
      if (active !== token) return;
      const selection = resolve(token);
      const moved = selection ? perform(selection, { repeated: true }) !== false : false;
      if (!moved) {
        token.timer = null;
        return;
      }
      token.repeats += 1;
      token.lastSelection = selection;
      scheduleRepeat(token, timing.repeatMs);
    }, delay);
  }

  function end(id = active?.id, options = {}) {
    const token = active;
    if (!token || token.id !== id) return false;
    clearTimer(token);
    active = null;
    onActiveChange({
      active: false,
      id: token.id,
      selection: token.lastSelection,
      repeats: token.repeats
    });
    if (options.finalize !== false) {
      finish({
        id: token.id,
        selection: token.lastSelection,
        repeats: token.repeats,
        observe: options.observe !== false,
        effect: options.effect !== false,
        defer: options.defer === true
      });
    }
    return true;
  }

  function begin(id, resolveStep) {
    if (!id || typeof resolveStep !== "function") return false;
    if (active?.id === id) return false;
    if (active) end(active.id, { observe: false, effect: false });

    const token = {
      id,
      resolveStep,
      lastSelection: null,
      repeats: 0,
      timer: null
    };
    const selection = resolve(token);
    if (!selection) return false;

    // Do not publish the token until the initial Step succeeds. The Step path
    // may settle another action, which is allowed to cancel an older gesture.
    const moved = perform(selection, { repeated: false }) !== false;
    if (!moved) return false;

    token.lastSelection = selection;
    active = token;
    onActiveChange({
      active: true,
      id: token.id,
      selection,
      repeats: 0
    });
    scheduleRepeat(token, timing.initialDelayMs);
    return true;
  }

  return {
    begin,
    end,
    cancel(options = {}) {
      return end(active?.id, options);
    },
    isActive(id = null) {
      return Boolean(active && (id === null || active.id === id));
    },
    snapshot() {
      return active
        ? {
            id: active.id,
            selection: active.lastSelection,
            repeats: active.repeats
          }
        : null;
    }
  };
}

export function bindStepPress(element, {
  id,
  controller,
  resolveStep,
  tap,
  keyboardActivation = false
} = {}) {
  if (!element?.addEventListener || !controller || typeof resolveStep !== "function") {
    return () => {};
  }

  let pointerId = null;
  let keyboardKey = null;
  let suppressPointerClickUntil = 0;
  let suppressKeyboardClickUntil = 0;
  const eventRoot = element.ownerDocument || globalThis.document;

  const unavailable = () => Boolean(
    element.disabled
    || element.getAttribute?.("aria-disabled") === "true"
  );

  const finishPointer = (event, observe) => {
    if (
      pointerId === null
      || (
        Number.isFinite(event?.pointerId)
        && Number.isFinite(pointerId)
        && event.pointerId !== pointerId
      )
    ) return false;
    const releasedPointer = pointerId;
    pointerId = null;
    suppressPointerClickUntil = Date.now() + 600;
    controller.end(id, { observe, defer: observe });
    element.classList?.remove?.("is-step-held");
    if (element.hasPointerCapture?.(releasedPointer)) {
      element.releasePointerCapture?.(releasedPointer);
    }
    return true;
  };

  const onPointerDown = event => {
    if (event.button !== undefined && event.button !== 0) return;
    if (unavailable()) return;
    const started = controller.begin(id, () => resolveStep(event));
    if (!started) {
      // A stale enabled presentation can lose its movement at the exact Range
      // boundary. Suppress the synthesized click so one press never retries the
      // same null Step through a second event path.
      suppressPointerClickUntil = Date.now() + 600;
      return;
    }
    event.preventDefault?.();
    pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 1;
    element.focus?.({ preventScroll: true });
    try {
      element.setPointerCapture?.(pointerId);
    } catch {
      // Document-level release listeners below retain a complete press lifecycle
      // when a browser cannot capture this particular pointer.
    }
    element.classList?.add?.("is-step-held");
  };
  const onPointerUp = event => finishPointer(event, true);
  const onPointerCancel = event => finishPointer(event, false);
  const onLostPointerCapture = event => {
    if (pointerId !== null) finishPointer(event, false);
  };
  const onClick = event => {
    const pointerClick = Number(event.detail) > 0;
    const suppress = pointerClick
      ? Date.now() <= suppressPointerClickUntil
      : Date.now() <= suppressKeyboardClickUntil;
    if (suppress) {
      event.preventDefault?.();
      return;
    }
    if (unavailable()) return;
    const selection = resolveStep(event);
    if (selection) tap?.(selection);
  };
  const onKeyDown = event => {
    if (!keyboardActivation || event.key !== "Enter" || unavailable()) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (keyboardKey !== null && !controller.isActive(id)) keyboardKey = null;
    if (event.repeat || keyboardKey !== null) return;
    if (!controller.begin(id, () => resolveStep(event))) return;
    keyboardKey = event.key;
    element.classList?.add?.("is-step-held");
  };
  const onKeyUp = event => {
    if (!keyboardActivation || keyboardKey === null || event.key !== keyboardKey) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    keyboardKey = null;
    suppressKeyboardClickUntil = Date.now() + 600;
    controller.end(id, { observe: true, defer: true });
    element.classList?.remove?.("is-step-held");
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerCancel);
  element.addEventListener("lostpointercapture", onLostPointerCapture);
  element.addEventListener("click", onClick);
  eventRoot?.addEventListener?.("pointerup", onPointerUp);
  eventRoot?.addEventListener?.("pointercancel", onPointerCancel);
  if (keyboardActivation) {
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("keyup", onKeyUp);
    eventRoot?.addEventListener?.("keyup", onKeyUp);
  }

  return () => {
    element.removeEventListener?.("pointerdown", onPointerDown);
    element.removeEventListener?.("pointerup", onPointerUp);
    element.removeEventListener?.("pointercancel", onPointerCancel);
    element.removeEventListener?.("lostpointercapture", onLostPointerCapture);
    element.removeEventListener?.("click", onClick);
    eventRoot?.removeEventListener?.("pointerup", onPointerUp);
    eventRoot?.removeEventListener?.("pointercancel", onPointerCancel);
    if (keyboardActivation) {
      element.removeEventListener?.("keydown", onKeyDown);
      element.removeEventListener?.("keyup", onKeyUp);
      eventRoot?.removeEventListener?.("keyup", onKeyUp);
    }
  };
}
