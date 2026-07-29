// Step Field execution controller. Tail and Lead are muted physical projections of Session state.
// Session owns semantic Current/Interval. This controller owns only physical pane addresses,
// offsets, rates, and Hold/Stretch state.
import { EPSILON, clamp } from "./range-geometry.js";
import { YOUTUBE_STATE, createYouTubePlayer, isYouTubeApiReady } from "./youtube.js";
import {
  STEP_FIELD_PHASE,
  FIELD_REACH_TOLERANCE,
  DEFAULT_FIELD_RESPONSE,
  normalizeFieldResponse,
  deriveFieldBounds,
  deriveStepField,
  normalizeFieldReach,
  chooseNearestRate,
  chooseDirectionalRate,
  hasCenterDiscontinuity,
  resolveFieldPhase,
  deriveObservedField
} from "./step-field-geometry.js";

export {
  STEP_FIELD_PHASE,
  DEFAULT_FIELD_RESPONSE,
  normalizeFieldResponse,
  deriveFieldBounds,
  deriveStepField,
  normalizeFieldReach,
  chooseNearestRate,
  chooseDirectionalRate,
  resolveFieldPhase,
  deriveObservedField
} from "./step-field-geometry.js";

export const FIELD_SIDE_MODE = Object.freeze({
  HELD: "held",
  STRETCHING: "stretching"
});

const REACH_TOLERANCE = FIELD_REACH_TOLERANCE;
const PARK_TOLERANCE = 0.28;
const DRIFT_TOLERANCE = 0.48;
const DIRECT_PLACE_TOLERANCE = 1.35;
const RATE_RETRY_MS = 550;
const PLACE_RETRY_MS = 260;
const MAX_CENTER_DELTA = 2.5;

function defaultPreferences() {
  return {
    stepFieldEnabled: true,
    tailVisible: true,
    leadVisible: true,
    ...DEFAULT_FIELD_RESPONSE
  };
}

function snapshotReach(snapshot) {
  return normalizeFieldReach(snapshot?.stepReach);
}

function structuralKey(snapshot) {
  const range = snapshot.range || { start: 0, end: 0 };
  return [
    snapshot.videoId || "",
    Number(range.start || 0).toFixed(3),
    Number(range.end || 0).toFixed(3)
  ].join("|");
}

export function fieldShouldSuspend(snapshot) {
  const transportKind = snapshot?.transport?.kind ?? snapshot?.transportKind;
  return Boolean(
    snapshot?.rangeDragging
    || snapshot?.dragging
    || snapshot?.pendingStep
    || transportKind === "context"
  );
}

export function fieldPreferenceRequiresEstablish(patch) {
  return patch?.stepFieldEnabled === true
    || patch?.tailVisible === true
    || patch?.leadVisible === true;
}

export function createStepFieldController({
  document,
  getSnapshot,
  getPreferences = defaultPreferences,
  setPreferences = () => {},
  onHoldOffsets = () => {},
  onChange = () => {},
  formatTime = value => String(value),
  createPlayer = createYouTubePlayer
}) {
  const ids = [
    "step-field", "step-field-toggle", "step-field-meta",
    "tail-pane", "tail-meta", "tail-player-surface", "tail-step-button", "tail-collapse", "tail-restore",
    "lead-pane", "lead-meta", "lead-player-surface", "lead-step-button", "lead-collapse", "lead-restore",
    "center-meta", "tail-rate-select", "lead-rate-select",
    "tail-field-toggle", "tail-field-toggle-label", "tail-offset-state",
    "lead-field-toggle", "lead-field-toggle-label", "lead-offset-state",
    "field-both-toggle", "field-both-toggle-label", "field-transport-state", "field-rate-state",
    "field-span-label"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, document?.getElementById?.(id) || null]));

  const sides = {
    tail: createSideState("tail", "player-tail", DEFAULT_FIELD_RESPONSE.tailRate),
    lead: createSideState("lead", "player-lead", DEFAULT_FIELD_RESPONSE.leadRate)
  };

  const runtime = {
    phase: STEP_FIELD_PHASE.OFF,
    structuralKey: null,
    semanticCurrent: null,
    lastCenterTime: null,
    centerWasRunning: false,
    forceEstablish: true,
    restoreRoles: new Set(),
    suspended: false,
    field: null,
    fieldKey: ""
  };

  function createSideState(role, elementId, requestedRate) {
    return {
      role,
      elementId,
      requestedRate,
      desiredRate: 1,
      actualRate: 1,
      availableRates: [1],
      rateAskedAt: 0,
      playback: "idle",
      adapter: null,
      ready: false,
      activated: false,
      sourceReady: false,
      ratesKnown: false,
      pendingPlay: false,
      videoId: null,
      mode: FIELD_SIDE_MODE.HELD,
      offset: 0,
      progressOffset: 0,
      targetOffset: 0,
      beforeStretchOffset: 0,
      desiredAddress: null,
      lastPlacedAddress: null,
      lastPlaceAt: 0,
      rateAvailable: true,
      blocked: false,
      error: false,
      retrySource: false
    };
  }

  function preferences() {
    return { ...defaultPreferences(), ...(getPreferences?.() || {}) };
  }

  function changePreferences(patch) {
    const before = preferences();
    setPreferences?.(patch);
    const after = preferences();
    for (const role of ["tail", "lead"]) {
      const visibilityKey = `${role}Visible`;
      if (before[visibilityKey] && !after[visibilityKey]) pauseSide(sides[role]);
      if (!before[visibilityKey] && after[visibilityKey]) {
        runtime.restoreRoles.add(role);
        if (sides[role].error) sides[role].retrySource = true;
      }
    }
    if (before.stepFieldEnabled && !after.stepFieldEnabled) {
      pauseSides({ freeze: false });
      runtime.phase = STEP_FIELD_PHASE.OFF;
      runtime.centerWasRunning = false;
    } else if (!before.stepFieldEnabled && after.stepFieldEnabled) {
      for (const role of ["tail", "lead"]) {
        if (after[`${role}Visible`]) {
          runtime.restoreRoles.add(role);
          if (sides[role].error) sides[role].retrySource = true;
        }
      }
    }
    if (fieldPreferenceRequiresEstablish(patch) && patch?.stepFieldEnabled === true) {
      runtime.forceEstablish = true;
    }
    publish(getSnapshot?.());
  }

  function directionFor(role) {
    return role === "tail" ? "backward" : "forward";
  }

  function configuredOffset(role, snapshot = getSnapshot?.()) {
    return snapshotReach(snapshot)[directionFor(role)];
  }

  function effectiveOffset(role, center, snapshot = getSnapshot?.()) {
    const configured = configuredOffset(role, snapshot);
    if (!snapshot?.range) return configured;
    return role === "tail"
      ? Math.min(configured, Math.max(0, center - snapshot.range.start))
      : Math.min(configured, Math.max(0, snapshot.range.end - center));
  }

  function exactAddress(role, center, offset, range) {
    return role === "tail"
      ? clamp(center - offset, range.start, range.end)
      : clamp(center + offset, range.start, range.end);
  }

  function semanticAddress(snapshot, fallback) {
    const current = Number(snapshot?.current);
    return clamp(
      Number.isFinite(current) ? current : fallback,
      snapshot.range.start,
      snapshot.range.end
    );
  }

  function suspensionRequired(snapshot = getSnapshot?.()) {
    return fieldShouldSuspend(snapshot) || Boolean(document?.hidden);
  }

  function offsetFromAddress(role, center, address, maximum) {
    const raw = role === "tail" ? center - address : address - center;
    return clamp(Math.max(0, raw), 0, Math.max(0, maximum));
  }

  function bind() {
    elements["step-field-toggle"]?.addEventListener?.("click", () => {
      const prefs = preferences();
      changePreferences({ stepFieldEnabled: !prefs.stepFieldEnabled });
    });
    elements["tail-collapse"]?.addEventListener?.("click", event => {
      event.stopPropagation?.();
      changePreferences({ tailVisible: false });
    });
    elements["lead-collapse"]?.addEventListener?.("click", event => {
      event.stopPropagation?.();
      changePreferences({ leadVisible: false });
    });
    elements["tail-restore"]?.addEventListener?.("click", () => {
      changePreferences({ tailVisible: true, stepFieldEnabled: true });
    });
    elements["lead-restore"]?.addEventListener?.("click", () => {
      changePreferences({ leadVisible: true, stepFieldEnabled: true });
    });
    elements["tail-rate-select"]?.addEventListener?.("change", event => {
      changePreferences({ tailRate: Number(event.target.value) });
      if (!suspensionRequired() && sides.tail.mode === FIELD_SIDE_MODE.STRETCHING) {
        requestStretchRate(sides.tail, true);
      }
    });
    elements["lead-rate-select"]?.addEventListener?.("change", event => {
      changePreferences({ leadRate: Number(event.target.value) });
      if (!suspensionRequired() && sides.lead.mode === FIELD_SIDE_MODE.STRETCHING) {
        requestStretchRate(sides.lead, true);
      }
    });
    elements["tail-field-toggle"]?.addEventListener?.("click", () => toggleSide("tail"));
    elements["lead-field-toggle"]?.addEventListener?.("click", () => toggleSide("lead"));
    elements["field-both-toggle"]?.addEventListener?.("click", toggleBoth);
  }

  function createSide(role) {
    const side = sides[role];
    if (side.adapter || !isYouTubeApiReady() || !document?.getElementById?.(side.elementId)) return;
    side.adapter = createPlayer(side.elementId, {
      playerVars: { controls: 0, disablekb: 1, fs: 0, playsinline: 1 },
      events: {
        onReady: adapter => {
          side.ready = true;
          side.error = false;
          side.blocked = false;
          adapter.mute?.();
          const iframe = adapter.raw?.()?.getIframe?.();
          iframe?.setAttribute?.("tabindex", "-1");
          iframe?.setAttribute?.("aria-hidden", "true");
          refreshSideSnapshot(side);
          runtime.forceEstablish = true;
        },
        onStateChange: name => {
          side.playback = name;
          if (name === YOUTUBE_STATE.CUED) {
            side.sourceReady = true;
            if (Number.isFinite(side.desiredAddress)) side.adapter?.place?.(side.desiredAddress);
            if (side.pendingPlay && !runtime.suspended) {
              side.adapter?.play?.();
              side.playback = "starting";
            } else if (!runtime.centerWasRunning) {
              side.adapter?.pause?.();
            }
          }
          if ([YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(name)) {
            side.sourceReady = true;
            side.ratesKnown = true;
            side.pendingPlay = false;
            side.activated = true;
            side.blocked = false;
            refreshSideSnapshot(side);
            populateRateControl(role, preferences());
            // A pre-play parking seek may briefly start a muted iframe. Stop it as
            // soon as YouTube confirms playback so the represented frame remains
            // visible without turning parking into Field playback.
            if (!runtime.centerWasRunning && side.mode === FIELD_SIDE_MODE.HELD) {
              side.adapter?.pause?.();
            }
          }
        },
        onPlaybackRateChange: rate => {
          if (Number.isFinite(Number(rate))) side.actualRate = Number(rate);
        },
        onAutoplayBlocked: () => {
          side.pendingPlay = false;
          side.blocked = true;
          side.playback = "blocked";
          side.adapter?.pause?.();
        },
        onError: () => {
          side.pendingPlay = false;
          side.sourceReady = false;
          side.ratesKnown = false;
          side.error = true;
          // The IFrame adapter remains usable after a media error. Keeping the
          // player ready allows an explicit pane restore or video reload to cue
          // the source again instead of leaving this projection permanently dead.
          side.ready = Boolean(side.adapter);
          side.playback = "error";
        }
      }
    });
  }

  function ensurePlayers(prefs) {
    if (!prefs.stepFieldEnabled) return;
    if (prefs.tailVisible) createSide("tail");
    if (prefs.leadVisible) createSide("lead");
  }

  function readSide(side) {
    return side.adapter?.read?.() || {
      time: Number.isFinite(side.desiredAddress) ? side.desiredAddress : runtime.semanticCurrent || 0,
      rate: 1,
      state: YOUTUBE_STATE.UNSTARTED,
      availableRates: [1]
    };
  }

  function refreshSideSnapshot(side) {
    const snapshot = readSide(side);
    side.playback = snapshot.state;
    if (Number.isFinite(snapshot.rate)) side.actualRate = snapshot.rate;
    if (Array.isArray(snapshot.availableRates) && snapshot.availableRates.length) {
      side.availableRates = [...new Set(snapshot.availableRates)]
        .filter(rate => Number.isFinite(rate) && rate > 0)
        .sort((a, b) => a - b);
    }
    return snapshot;
  }

  function sideCanRun(side) {
    return side.ready && !side.error && Boolean(side.adapter);
  }

  function requestRate(side, rate, force = false) {
    if (!sideCanRun(side)) return false;
    const now = Date.now();
    const changed = Math.abs(side.desiredRate - rate) > 0.001;
    side.desiredRate = rate;
    if (!force && Math.abs(side.actualRate - rate) <= 0.001) return true;
    if (!force && !changed && now - side.rateAskedAt < RATE_RETRY_MS) return false;
    side.rateAskedAt = now;
    side.adapter?.setRate?.(rate);
    return true;
  }

  function pauseSide(side) {
    if (!sideCanRun(side)) return;
    side.adapter?.pause?.();
    requestRate(side, 1, true);
    side.desiredRate = 1;
    if (!["blocked", "error"].includes(side.playback)) side.playback = YOUTUBE_STATE.PAUSED;
  }

  function parkSide(side, address, { force = false } = {}) {
    if (!sideCanRun(side) || !side.videoId || !Number.isFinite(address)) return false;
    const target = Math.max(0, address);
    const now = Date.now();
    side.desiredAddress = target;
    side.adapter?.mute?.();
    requestRate(side, 1, true);

    const snapshot = readSide(side);
    const alreadyThere = Math.abs(snapshot.time - target) <= PARK_TOLERANCE;
    const recentlyPlaced = side.lastPlacedAddress !== null
      && Math.abs(side.lastPlacedAddress - target) <= PARK_TOLERANCE
      && now - side.lastPlaceAt < PLACE_RETRY_MS;
    if (!force && (alreadyThere || recentlyPlaced)) {
      pauseSide(side);
      return false;
    }

    // Source loading and playback are separate phases. Never issue a fresh cue in
    // the same stack as playVideo(): YouTube may process that cue after play and
    // leave the iframe paused. Parking records the target while the one preload cue
    // settles, then CUED places the decoded frame.
    if (!side.sourceReady) {
      if (side.playback !== "loading") {
        side.playback = "loading";
        side.adapter?.cue?.(side.videoId, target);
      }
      side.lastPlacedAddress = target;
      side.lastPlaceAt = now;
      return true;
    }
    side.adapter?.place?.(target);
    side.adapter?.pause?.();
    side.playback = YOUTUBE_STATE.PAUSED;
    side.lastPlacedAddress = target;
    side.lastPlaceAt = now;
    return true;
  }

  function parkAtRelation(side, center, snapshot, { force = false } = {}) {
    const maximum = effectiveOffset(side.role, center, snapshot);
    side.offset = clamp(side.offset, 0, maximum);
    side.progressOffset = clamp(side.progressOffset, 0, maximum);
    return parkSide(side, exactAddress(side.role, center, side.offset, snapshot.range), { force });
  }

  function stabilizeParkedSide(side, center, snapshot) {
    if (!sideCanRun(side) || !side.activated || !Number.isFinite(side.desiredAddress)) return;
    const observed = refreshSideSnapshot(side);
    if ([YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(observed.state)) {
      side.adapter?.pause?.();
      return;
    }
    if (Math.abs(observed.time - side.desiredAddress) > PARK_TOLERANCE) {
      parkSide(side, side.desiredAddress, { force: true });
    }
    side.offset = offsetFromAddress(
      side.role,
      center,
      Number.isFinite(side.desiredAddress) ? side.desiredAddress : observed.time,
      effectiveOffset(side.role, center, snapshot)
    );
  }

  function pauseSides({ center = null, freeze = true } = {}) {
    const snapshot = getSnapshot?.();
    if (!snapshot?.range) {
      for (const side of Object.values(sides)) pauseSide(side);
      return;
    }
    const resolvedCenter = clamp(
      Number.isFinite(center) ? center : Number(snapshot.center?.time ?? snapshot.current),
      snapshot.range.start,
      snapshot.range.end
    );
    for (const side of Object.values(sides)) {
      if (freeze) freezeSideForPause(side, resolvedCenter, snapshot);
      else {
        pauseSide(side);
        parkAtRelation(side, resolvedCenter, snapshot);
      }
    }
  }

  function directionalRates(side) {
    return [...new Set(side.availableRates || readSide(side).availableRates || [])]
      .filter(rate => Number.isFinite(rate) && (side.role === "tail" ? rate < 1 : rate > 1))
      .sort((a, b) => a - b);
  }

  function populateRateControl(role, prefs) {
    const side = sides[role];
    const select = elements[`${role}-rate-select`];
    if (!select || !side.ready) return;
    refreshSideSnapshot(side);
    const rates = directionalRates(side);
    const key = rates.join("|");
    if (select.dataset.rates !== key) {
      select.replaceChildren();
      if (!rates.length) {
        const option = document.createElement("option");
        option.value = "1";
        option.textContent = side.role === "tail" ? "No slow rate" : "No fast rate";
        select.appendChild(option);
      } else {
        for (const rate of rates) {
          const option = document.createElement("option");
          option.value = String(rate);
          option.textContent = `${rate}×`;
          select.appendChild(option);
        }
      }
      select.dataset.rates = key;
    }
    select.disabled = !rates.length;
    const requested = Number(prefs[`${role}Rate`]);
    const resolved = rates.length ? chooseNearestRate(rates, requested) : 1;
    select.value = String(resolved);
    select.dataset.requested = String(requested);
  }

  function requestStretchRate(side, force = false) {
    side.requestedRate = Number(preferences()[`${side.role}Rate`]);
    refreshSideSnapshot(side);
    const rate = chooseDirectionalRate(side.availableRates, side.requestedRate, side.role);
    if (rate === null && !side.ratesKnown) {
      // getAvailablePlaybackRates commonly reports only 1× until the iframe has
      // actually entered playback. Unknown is not the same as unsupported.
      side.rateAvailable = true;
      requestRate(side, 1, force);
      return undefined;
    }
    side.rateAvailable = rate !== null;
    if (rate === null) {
      requestRate(side, 1, force);
      return null;
    }
    requestRate(side, rate, force);
    return rate;
  }

  function establishSide(side, center, snapshot) {
    const offset = effectiveOffset(side.role, center, snapshot);
    side.mode = FIELD_SIDE_MODE.HELD;
    side.offset = offset;
    side.progressOffset = offset;
    side.targetOffset = configuredOffset(side.role, snapshot);
    side.beforeStretchOffset = offset;
    pauseSide(side);
    parkAtRelation(side, center, snapshot, { force: true });
  }

  function establish(snapshot, address = snapshot.current) {
    const center = clamp(address, snapshot.range.start, snapshot.range.end);
    for (const side of Object.values(sides)) establishSide(side, center, snapshot);
    runtime.structuralKey = structuralKey(snapshot);
    runtime.semanticCurrent = center;
    runtime.lastCenterTime = center;
    runtime.centerWasRunning = false;
    runtime.forceEstablish = false;
    runtime.restoreRoles.clear();
    runtime.phase = STEP_FIELD_PHASE.HELD;
  }

  function translateToCurrent(current, { preserve = true } = {}) {
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded || !snapshot.range || !Number.isFinite(current)) return;
    const nextCenter = clamp(current, snapshot.range.start, snapshot.range.end);
    runtime.semanticCurrent = nextCenter;
    runtime.lastCenterTime = nextCenter;
    runtime.centerWasRunning = false;
    for (const side of Object.values(sides)) {
      const maximum = effectiveOffset(side.role, nextCenter, snapshot);
      const retained = side.offset > REACH_TOLERANCE ? side.offset : side.targetOffset;
      const offset = preserve ? clamp(retained, 0, maximum) : maximum;
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = offset;
      side.progressOffset = offset;
      side.targetOffset = configuredOffset(side.role, snapshot);
      pauseSide(side);
      parkAtRelation(side, nextCenter, snapshot, { force: true });
    }
    runtime.structuralKey = structuralKey(snapshot);
    runtime.forceEstablish = false;
    runtime.restoreRoles.clear();
    runtime.suspended = suspensionRequired(snapshot);
    runtime.phase = runtime.suspended
      ? STEP_FIELD_PHASE.SUSPENDED
      : STEP_FIELD_PHASE.HELD;
    publish(snapshot);
  }

  function beginStretch(side, center, snapshot, { play = false } = {}) {
    if (!sideCanRun(side)) return false;
    side.beforeStretchOffset = side.offset;
    side.mode = FIELD_SIDE_MODE.STRETCHING;
    side.offset = 0;
    side.progressOffset = 0;
    side.targetOffset = configuredOffset(side.role, snapshot);
    side.blocked = false;
    side.adapter?.mute?.();
    requestRate(side, 1, true);

    // Stretch is one operation: refold to physical Center, then diverge toward
    // the configured maximum. The source must already be cued before the trusted
    // play gesture; a cue and play issued together race in the YouTube iframe.
    side.desiredAddress = center;
    side.lastPlacedAddress = center;
    side.lastPlaceAt = Date.now();
    side.pendingPlay = Boolean(play);
    if (side.sourceReady) {
      side.adapter?.place?.(center);
    } else if (side.playback !== "loading") {
      side.playback = "loading";
      side.adapter?.cue?.(side.videoId, center);
    }
    if (play && side.sourceReady) {
      side.adapter?.play?.();
      side.playback = "starting";
    } else if (!play) {
      side.pendingPlay = false;
      side.adapter?.pause?.();
      side.playback = side.sourceReady ? YOUTUBE_STATE.PAUSED : "loading";
    }
    return true;
  }

  function playFromGesture(options = {}) {
    const snapshot = getSnapshot?.();
    const prefs = preferences();
    const suspendedNow = suspensionRequired(snapshot);
    if (!snapshot?.videoLoaded || !prefs.stepFieldEnabled || suspendedNow) {
      return { tail: false, lead: false };
    }
    // Context may have just been settled in the same click/Space stack. Do not
    // let a stale controller flag suppress the new trusted playback gesture.
    runtime.suspended = false;
    const center = clamp(
      Number.isFinite(options.center) ? options.center : Number(snapshot.center?.time ?? snapshot.current),
      snapshot.range.start,
      snapshot.range.end
    );
    const started = { tail: false, lead: false };
    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      if (!prefs[`${role}Visible`] || !sideCanRun(side) || configuredOffset(role, snapshot) <= EPSILON) continue;
      started[role] = beginStretch(side, center, snapshot, { play: true });
    }
    runtime.semanticCurrent = semanticAddress(snapshot, center);
    runtime.lastCenterTime = center;
    runtime.centerWasRunning = true;
    publish(snapshot);
    return started;
  }

  // An internal Loop wrap continues an existing Field relation. Rebase each
  // side around the wrapped Center, retain its mode/offset, and resume without
  // performing the fresh refold owned by ordinary Play.
  function resumeAt(options = {}) {
    const snapshot = getSnapshot?.();
    const prefs = preferences();
    const suspendedNow = suspensionRequired(snapshot);
    if (!snapshot?.videoLoaded || !prefs.stepFieldEnabled || suspendedNow) {
      return { tail: false, lead: false };
    }

    runtime.suspended = false;
    const center = clamp(
      Number.isFinite(options.center)
        ? options.center
        : Number(snapshot.center?.time ?? snapshot.current),
      snapshot.range.start,
      snapshot.range.end
    );
    const started = { tail: false, lead: false };

    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      if (!prefs[`${role}Visible`] || !sideCanRun(side)) continue;
      const maximum = effectiveOffset(role, center, snapshot);
      if (!(maximum > EPSILON)) {
        pauseSide(side);
        continue;
      }

      side.offset = clamp(side.offset, 0, maximum);
      side.progressOffset = clamp(side.progressOffset, side.offset, maximum);
      side.targetOffset = configuredOffset(role, snapshot);
      side.desiredAddress = exactAddress(role, center, side.offset, snapshot.range);
      side.adapter?.mute?.();
      side.adapter?.place?.(side.desiredAddress);
      if (side.mode === FIELD_SIDE_MODE.STRETCHING) {
        requestStretchRate(side, true);
      } else {
        requestRate(side, 1, true);
      }
      side.pendingPlay = true;
      side.adapter?.play?.();
      side.playback = "starting";
      started[role] = true;
    }

    runtime.semanticCurrent = semanticAddress(snapshot, center);
    runtime.lastCenterTime = center;
    runtime.centerWasRunning = true;
    publish(snapshot);
    return started;
  }

  function activationState() {
    const prefs = preferences();
    if (!prefs.stepFieldEnabled) return { ready: true, pending: [], available: {} };
    const visible = ["tail", "lead"].filter(role => prefs[`${role}Visible`]);
    const sourceId = getSnapshot?.()?.videoId || null;
    const pending = visible.filter(role => {
      const side = sides[role];
      return !side.error && (!side.ready || side.videoId !== sourceId || !side.sourceReady);
    });
    return {
      ready: pending.length === 0,
      pending,
      available: Object.fromEntries(visible.map(role => {
        const side = sides[role];
        return [role, side.ready && side.videoId === sourceId && side.sourceReady && !side.error];
      }))
    };
  }

  function stretch(role) {
    const snapshot = getSnapshot?.();
    const side = sides[role];
    const suspendedNow = suspensionRequired(snapshot);
    if (suspendedNow || !snapshot?.videoLoaded || !snapshot.range || !sideCanRun(side)) return;
    const center = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
    const centerRunning = [YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(snapshot.center?.state);
    beginStretch(side, center, snapshot, { play: centerRunning && !suspendedNow });
    publish(snapshot);
  }

  function measuredOffset(side, center, snapshot) {
    const maximum = effectiveOffset(side.role, center, snapshot);
    const observed = refreshSideSnapshot(side);
    if (!Number.isFinite(observed.time)) return clamp(side.progressOffset, 0, maximum);
    const measured = offsetFromAddress(side.role, center, observed.time, maximum);
    const plausible = Math.abs(measured - side.progressOffset) <= DIRECT_PLACE_TOLERANCE
      || [YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(observed.state);
    return plausible ? measured : clamp(side.progressOffset, 0, maximum);
  }

  function hold(role, { record = true } = {}) {
    const snapshot = getSnapshot?.();
    const side = sides[role];
    if (suspensionRequired(snapshot) || !snapshot?.videoLoaded || !snapshot.range || !sideCanRun(side)) return null;
    const center = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
    let offset;
    if (side.mode === FIELD_SIDE_MODE.STRETCHING) {
      offset = measuredOffset(side, center, snapshot);
      // Holding an armed-but-paused zero-width Stretch restores the visible field
      // instead of accidentally redefining Step Reach to its minimum.
      if (offset <= REACH_TOLERANCE && !runtime.centerWasRunning && side.beforeStretchOffset > REACH_TOLERANCE) {
        offset = clamp(side.beforeStretchOffset, 0, effectiveOffset(role, center, snapshot));
      }
    } else {
      offset = clamp(side.offset, 0, effectiveOffset(role, center, snapshot));
    }
    side.mode = FIELD_SIDE_MODE.HELD;
    side.offset = offset;
    side.progressOffset = offset;
    side.targetOffset = record && offset > REACH_TOLERANCE ? offset : configuredOffset(role, snapshot);
    requestRate(side, 1, true);
    side.desiredAddress = exactAddress(role, center, offset, snapshot.range);
    if (runtime.centerWasRunning) {
      if (Math.abs(readSide(side).time - side.desiredAddress) > DRIFT_TOLERANCE) side.adapter?.place?.(side.desiredAddress);
      side.adapter?.play?.();
    } else {
      parkSide(side, side.desiredAddress, { force: true });
    }
    if (record && offset > REACH_TOLERANCE) {
      onHoldOffsets?.({ [directionFor(role)]: Math.max(0.25, offset) });
    }
    publish(snapshot);
    return offset;
  }

  function freezeSideForPause(side, center, snapshot) {
    if (!sideCanRun(side)) return;
    const maximum = effectiveOffset(side.role, center, snapshot);
    const observed = refreshSideSnapshot(side);
    let offset = side.offset;
    if ([YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING, YOUTUBE_STATE.PAUSED].includes(observed.state)) {
      const measured = offsetFromAddress(side.role, center, observed.time, maximum);
      if (measured > REACH_TOLERANCE || side.offset <= REACH_TOLERANCE) offset = measured;
    }
    offset = clamp(offset, 0, maximum);
    side.mode = FIELD_SIDE_MODE.HELD;
    side.offset = offset;
    side.progressOffset = offset;
    requestRate(side, 1, true);
    parkAtRelation(side, center, snapshot, { force: true });
  }

  function toggleSide(role) {
    const side = sides[role];
    if (side.mode === FIELD_SIDE_MODE.HELD) stretch(role);
    else hold(role, { record: true });
  }

  function toggleBoth() {
    if (suspensionRequired()) return;
    const prefs = preferences();
    const visibleRoles = ["tail", "lead"].filter(role => prefs[`${role}Visible`]);
    if (!visibleRoles.length) return;
    const allHeld = visibleRoles.every(role => sides[role].mode === FIELD_SIDE_MODE.HELD);
    if (allHeld) {
      for (const role of visibleRoles) stretch(role);
      return;
    }
    const patch = {};
    for (const role of visibleRoles) {
      if (sides[role].mode !== FIELD_SIDE_MODE.STRETCHING) continue;
      const offset = hold(role, { record: false });
      if (Number.isFinite(offset) && offset > REACH_TOLERANCE) patch[directionFor(role)] = Math.max(0.25, offset);
    }
    if (Object.keys(patch).length) onHoldOffsets?.(patch);
    publish(getSnapshot?.());
  }

  function ensureSidePlaying(side) {
    if (!sideCanRun(side)) return false;
    side.adapter?.mute?.();
    if (!side.sourceReady) {
      side.pendingPlay = true;
      if (side.playback !== "loading" && side.videoId) {
        side.playback = "loading";
        side.adapter?.cue?.(side.videoId, side.desiredAddress ?? runtime.semanticCurrent ?? 0);
      }
      return false;
    }
    const state = refreshSideSnapshot(side).state;
    if (![YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(state)) {
      side.pendingPlay = true;
      side.playback = "starting";
      side.adapter?.play?.();
      return false;
    }
    side.pendingPlay = false;
    return true;
  }

  function correctRunningSide(side, desiredAddress) {
    const observed = refreshSideSnapshot(side);
    const error = observed.time - desiredAddress;
    if (Math.abs(error) > DIRECT_PLACE_TOLERANCE) {
      side.adapter?.place?.(desiredAddress);
      ensureSidePlaying(side);
      return true;
    }
    return false;
  }

  function driveSide(role, center, centerDelta, snapshot, centerRunning) {
    const side = sides[role];
    const prefs = preferences();
    const visible = prefs[`${role}Visible`];
    const maximum = effectiveOffset(role, center, snapshot);
    if (!visible || !sideCanRun(side)) {
      pauseSide(side);
      return { available: false, held: false, offset: 0 };
    }
    if (maximum <= EPSILON) {
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = 0;
      side.progressOffset = 0;
      side.targetOffset = configuredOffset(role, snapshot);
      pauseSide(side);
      parkSide(side, center);
      return { available: false, held: true, offset: 0 };
    }

    side.targetOffset = configuredOffset(role, snapshot);
    if (!centerRunning) {
      stabilizeParkedSide(side, center, snapshot);
      return { available: true, held: side.mode === FIELD_SIDE_MODE.HELD, offset: side.offset };
    }

    if (side.mode === FIELD_SIDE_MODE.HELD) {
      side.offset = clamp(side.offset, 0, maximum);
      side.progressOffset = side.offset;
      requestRate(side, 1);
      ensureSidePlaying(side);
      const desired = exactAddress(role, center, side.offset, snapshot.range);
      side.desiredAddress = desired;
      correctRunningSide(side, desired);
      return { available: true, held: true, offset: side.offset };
    }

    ensureSidePlaying(side);
    const rate = requestStretchRate(side);
    if (rate === undefined) {
      const actual = measuredOffset(side, center, snapshot);
      side.offset = clamp(actual, 0, maximum);
      return { available: true, held: false, offset: side.offset };
    }
    const confirmed = Number.isFinite(side.actualRate) ? side.actualRate : 1;
    const differential = role === "tail" ? Math.max(0, 1 - confirmed) : Math.max(0, confirmed - 1);
    if (centerDelta > 0 && rate !== null) {
      side.progressOffset = Math.min(maximum, side.progressOffset + differential * centerDelta);
    }

    const actual = measuredOffset(side, center, snapshot);
    side.offset = clamp(actual, 0, maximum);
    const desiredOffset = Math.min(maximum, Math.max(side.progressOffset, side.offset));
    side.progressOffset = desiredOffset;
    const desired = exactAddress(role, center, desiredOffset, snapshot.range);
    side.desiredAddress = desired;
    correctRunningSide(side, desired);

    const reached = desiredOffset >= maximum - REACH_TOLERANCE
      || side.offset >= maximum - REACH_TOLERANCE;
    if (reached || rate === null) {
      // A source without a directional rate still remains usable: place the side
      // at the requested frame and hold it instead of leaving the control stuck.
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = maximum;
      side.progressOffset = maximum;
      side.desiredAddress = exactAddress(role, center, maximum, snapshot.range);
      if (Math.abs(readSide(side).time - side.desiredAddress) > DRIFT_TOLERANCE) side.adapter?.place?.(side.desiredAddress);
      requestRate(side, 1, true);
      ensureSidePlaying(side);
      return { available: true, held: true, offset: maximum };
    }
    return { available: true, held: false, offset: side.offset };
  }

  function stepSelection(role) {
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded) return null;
    const side = sides[role];
    const center = Number(snapshot.current);
    const availableDistance = effectiveOffset(role, center, snapshot);
    if (!(availableDistance > EPSILON)) return null;
    const visibleOffset = clamp(side.offset, 0, effectiveOffset(role, center, snapshot));
    const distance = visibleOffset > REACH_TOLERANCE
      ? visibleOffset
      : availableDistance;
    if (!(distance > EPSILON)) return null;
    return {
      role,
      direction: directionFor(role),
      mode: "step",
      distance,
      offset: visibleOffset,
      target: configuredOffset(role, snapshot),
      address: exactAddress(role, snapshot.current, distance, snapshot.range)
    };
  }

  function formatOffset(value) {
    if (!Number.isFinite(value)) return "—";
    const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
    return `${rounded}s`;
  }

  function sideMeta(role) {
    const side = sides[role];
    if (runtime.suspended) return "Context suspended";
    if (!side.sourceReady && !side.error) return "Preparing video";
    if (side.blocked) return "Playback blocked — retry Play";
    if (side.error) return "Player unavailable";
    if (!side.rateAvailable && side.mode === FIELD_SIDE_MODE.STRETCHING) return "Rate unavailable — held at target";
    return Number.isFinite(side.desiredAddress)
      ? formatTime(side.desiredAddress)
      : "Preparing frame";
  }

  function publish(snapshot = getSnapshot?.(), live = null, sideStates = null) {
    if (!snapshot?.range) return null;
    const prefs = preferences();
    const center = clamp(
      Number(runtime.suspended ? snapshot.current : snapshot.center?.time ?? snapshot.current ?? 0),
      snapshot.range.start,
      snapshot.range.end
    );
    const targets = live || deriveStepField(center, snapshotReach(snapshot), snapshot.range);
    const states = sideStates || {
      tail: { available: targets.tail.available, held: sides.tail.mode === FIELD_SIDE_MODE.HELD, offset: sides.tail.offset },
      lead: { available: targets.lead.available, held: sides.lead.mode === FIELD_SIDE_MODE.HELD, offset: sides.lead.offset }
    };
    const observed = deriveObservedField({
      targets,
      phase: runtime.phase,
      centerAddress: center,
      tailAddress: exactAddress("tail", center, states.tail.offset, snapshot.range),
      leadAddress: exactAddress("lead", center, states.lead.offset, snapshot.range),
      tailVisible: prefs.tailVisible,
      leadVisible: prefs.leadVisible,
      tailHeld: states.tail.held,
      leadHeld: states.lead.held
    });
    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      observed[role].mode = side.mode;
      observed[role].requestedRate = Number(prefs[`${role}Rate`]);
      observed[role].actualRate = side.actualRate;
      observed[role].playback = side.playback;
      observed[role].ready = side.ready;
      observed[role].activated = side.activated;
      observed[role].error = side.error;
      observed[role].rateAvailable = side.rateAvailable;
      observed[role].offset = states[role].offset;
      observed[role].targetDistance = targets[role].distance;
      observed[role].desiredAddress = side.desiredAddress;
    }
    observed.activation = activationState();
    observed.span = {
      start: observed.tail.address,
      end: observed.lead.address,
      duration: Math.max(0, observed.lead.address - observed.tail.address),
      available: observed.tail.visible && observed.lead.visible && observed.lead.address - observed.tail.address > EPSILON,
      held: observed.tail.held && observed.lead.held
    };
    const key = JSON.stringify({
      phase: observed.phase,
      center: Number(center.toFixed(2)),
      tail: Number(observed.tail.offset.toFixed(2)),
      lead: Number(observed.lead.offset.toFixed(2)),
      modes: [observed.tail.mode, observed.lead.mode],
      rates: [observed.tail.actualRate, observed.lead.actualRate],
      playback: [observed.tail.playback, observed.lead.playback],
      ready: [observed.tail.ready, observed.lead.ready],
      activated: [observed.tail.activated, observed.lead.activated],
      errors: [observed.tail.error, observed.lead.error],
      suspended: runtime.suspended
    });
    runtime.field = observed;
    if (key !== runtime.fieldKey) {
      runtime.fieldKey = key;
      onChange?.(observed);
    }
    render(snapshot, observed, states);
    return observed;
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function render(snapshot = getSnapshot?.(), field = runtime.field) {
    if (!snapshot || !elements["step-field"]) return;
    const prefs = preferences();
    const loaded = Boolean(snapshot.videoLoaded);
    const root = elements["step-field"];
    const shown = loaded && prefs.stepFieldEnabled;
    root.classList.toggle("field-off", !shown);
    root.classList.toggle("tail-collapsed", !prefs.tailVisible);
    root.classList.toggle("lead-collapsed", !prefs.leadVisible);
    root.classList.toggle("is-suspended", runtime.suspended);
    root.dataset.phase = runtime.phase;

    elements["tail-pane"]?.classList?.toggle("is-collapsed", !prefs.tailVisible);
    elements["lead-pane"]?.classList?.toggle("is-collapsed", !prefs.leadVisible);
    if (elements["tail-restore"]) elements["tail-restore"].hidden = prefs.tailVisible;
    if (elements["lead-restore"]) elements["lead-restore"].hidden = prefs.leadVisible;
    if (elements["tail-collapse"]) elements["tail-collapse"].hidden = !prefs.tailVisible;
    if (elements["lead-collapse"]) elements["lead-collapse"].hidden = !prefs.leadVisible;

    if (elements["step-field-toggle"]) elements["step-field-toggle"].disabled = !loaded;
    elements["step-field-toggle"]?.setAttribute?.("aria-pressed", String(shown));
    elements["step-field-toggle"]?.setAttribute?.("aria-label", `${shown ? "Hide" : "Show"} Step Field`);
    setText(elements["step-field-meta"], !loaded ? "Load video" : shown ? "On" : "Off");
    setText(elements["center-meta"], loaded ? formatTime(Number(snapshot.center?.time ?? snapshot.current)) : "—");

    const reach = snapshotReach(snapshot);
    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      const direction = directionFor(role);
      const actual = field?.[role]?.offset ?? side.offset;
      const target = reach[direction];
      const availableDistance = effectiveOffset(role, snapshot.current, snapshot);
      const canStep = shown
        && prefs[`${role}Visible`]
        && availableDistance > EPSILON;
      const nextAction = side.mode === FIELD_SIDE_MODE.HELD ? "Stretch" : "Hold";
      setText(elements[`${role}-field-toggle-label`], nextAction);
      setText(elements[`${role}-offset-state`], `${formatOffset(actual)} / ${formatOffset(target)}`);
      elements[`${role}-field-toggle`]?.setAttribute?.("aria-pressed", String(side.mode === FIELD_SIDE_MODE.HELD));
      if (elements[`${role}-field-toggle`]) {
        elements[`${role}-field-toggle`].disabled = runtime.suspended || !canStep || side.error;
        elements[`${role}-field-toggle`].setAttribute(
          "aria-label",
          `${role === "tail" ? "Tail" : "Lead"} is ${
            side.mode === FIELD_SIDE_MODE.HELD ? "Held" : "Stretching"
          }; ${nextAction}`
        );
      }
      if (elements[`${role}-step-button`]) {
        elements[`${role}-step-button`].disabled = !canStep;
      }
      const surface = elements[`${role}-player-surface`];
      surface?.setAttribute?.("aria-disabled", String(!canStep));
      if (surface) surface.tabIndex = canStep ? 0 : -1;
      setText(
        elements[`${role}-meta`],
        !loaded
          ? "—"
          : availableDistance <= EPSILON
            ? role === "tail" ? "Range start" : "Range end"
            : sideMeta(role)
      );
    }

    const visibleRoles = ["tail", "lead"].filter(role => prefs[`${role}Visible`]);
    const bothHeld = visibleRoles.length > 0
      && visibleRoles.every(role => sides[role].mode === FIELD_SIDE_MODE.HELD);
    const bothLabel = visibleRoles.length === 1 ? "visible side" : "both";
    setText(elements["field-both-toggle-label"], bothHeld ? `Stretch ${bothLabel}` : `Hold ${bothLabel}`);
    elements["field-both-toggle"]?.setAttribute?.("aria-pressed", String(bothHeld));
    if (elements["field-both-toggle"]) {
      elements["field-both-toggle"].disabled = runtime.suspended || !shown || !visibleRoles.length;
      elements["field-both-toggle"].setAttribute(
        "aria-label",
        `${bothHeld ? "Field is Held; Stretch" : "Field is Stretching; Hold"} ${bothLabel}`
      );
    }
    setText(elements["field-transport-state"], runtime.suspended
      ? "Context suspended"
      : runtime.phase === STEP_FIELD_PHASE.PARTIAL
        ? "Partially Held"
        : runtime.phase.charAt(0).toUpperCase() + runtime.phase.slice(1));
    setText(elements["field-rate-state"], `Tail ${sides.tail.actualRate}× · Center 1× · Lead ${sides.lead.actualRate}×`);
    setText(elements["field-span-label"], field?.span?.held && field.span.available
      ? `${formatTime(field.span.start)}–${formatTime(field.span.end)}`
      : `Current ${loaded ? formatTime(snapshot.current) : "—"}`);
  }

  function tick() {
    const prefs = preferences();
    const snapshot = getSnapshot?.();
    if (!snapshot?.range) return;
    // Side hosts must be measurable before YT.Player replaces them.
    render(snapshot);
    if (snapshot.videoLoaded) ensurePlayers(prefs);
    syncVideo(snapshot);
    populateRateControl("tail", prefs);
    populateRateControl("lead", prefs);

    if (!snapshot.videoLoaded || !snapshot.videoId) {
      pauseSides({ freeze: false });
      runtime.phase = prefs.stepFieldEnabled ? STEP_FIELD_PHASE.COINCIDENT : STEP_FIELD_PHASE.OFF;
      runtime.semanticCurrent = snapshot.current || 0;
      publish(snapshot);
      return;
    }

    if (runtime.forceEstablish || runtime.structuralKey !== structuralKey(snapshot)) {
      establish(snapshot, snapshot.current);
    } else if (runtime.restoreRoles.size) {
      const center = clamp(snapshot.current, snapshot.range.start, snapshot.range.end);
      for (const role of runtime.restoreRoles) establishSide(sides[role], center, snapshot);
      runtime.restoreRoles.clear();
      runtime.semanticCurrent = center;
      runtime.lastCenterTime = center;
    } else if (Math.abs((runtime.semanticCurrent ?? snapshot.current) - snapshot.current) > EPSILON) {
      translateToCurrent(snapshot.current, { preserve: true });
    }

    if (!prefs.stepFieldEnabled || (!prefs.tailVisible && !prefs.leadVisible)) {
      pauseSides({ freeze: false });
      runtime.phase = STEP_FIELD_PHASE.OFF;
      runtime.suspended = false;
      runtime.centerWasRunning = false;
      publish(snapshot);
      return;
    }

    runtime.suspended = suspensionRequired(snapshot);
    const center = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
    const centerRunning = !runtime.suspended
      && [YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(snapshot.center?.state);
    const centerPlaying = !runtime.suspended && snapshot.center?.state === YOUTUBE_STATE.PLAYING;
    const rawDelta = Number.isFinite(runtime.lastCenterTime) ? center - runtime.lastCenterTime : 0;
    const centerDelta = centerPlaying && rawDelta > 0 && rawDelta <= MAX_CENTER_DELTA ? rawDelta : 0;
    const discontinuity = centerPlaying
      && hasCenterDiscontinuity(runtime.lastCenterTime, center, MAX_CENTER_DELTA);

    if (runtime.suspended) {
      // Context and semantic gestures are Center-only. Preserve the stored Field
      // relation around semantic Current; never remeasure offsets against the
      // transient Context cursor or an in-flight placement.
      pauseSides({ center: snapshot.current, freeze: false });
    } else if (discontinuity) {
      // A native scrub or clock jump starts a fresh physical formation at the new
      // Center without creating a semantic Interval here.
      for (const role of ["tail", "lead"]) {
        const side = sides[role];
        if (prefs[`${role}Visible`] && sideCanRun(side)) beginStretch(side, center, snapshot, { play: true });
      }
    } else if (!centerRunning && runtime.centerWasRunning) {
      // Native pause freezes the visible Field once. It does not write Session
      // Interval or Step Reach; the next Play refolds and stretches anew.
      pauseSides({ center, freeze: true });
    }

    const relationalCenter = runtime.suspended ? snapshot.current : center;
    const live = deriveStepField(relationalCenter, snapshotReach(snapshot), snapshot.range);
    const sideStates = {
      tail: driveSide("tail", relationalCenter, centerDelta, snapshot, centerRunning && !runtime.suspended),
      lead: driveSide("lead", relationalCenter, centerDelta, snapshot, centerRunning && !runtime.suspended)
    };
    runtime.phase = runtime.suspended
      ? STEP_FIELD_PHASE.SUSPENDED
      : resolveFieldPhase({
        enabled: prefs.stepFieldEnabled,
        suspended: false,
        sides: [
          { ...sideStates.tail, visible: prefs.tailVisible },
          { ...sideStates.lead, visible: prefs.leadVisible }
        ]
      });
    if (!runtime.suspended) runtime.lastCenterTime = center;
    runtime.centerWasRunning = centerRunning && !runtime.suspended;
    publish(snapshot, live, sideStates);
  }

  function syncVideo(snapshot) {
    if (!snapshot.videoLoaded || !snapshot.videoId) return;
    for (const side of Object.values(sides)) {
      if (!side.ready || (side.videoId === snapshot.videoId && !side.retrySource)) continue;
      side.retrySource = false;
      side.videoId = snapshot.videoId;
      side.error = false;
      side.blocked = false;
      side.activated = false;
      side.sourceReady = false;
      side.ratesKnown = false;
      side.pendingPlay = false;
      side.playback = "loading";
      side.actualRate = 1;
      side.desiredRate = 1;
      side.availableRates = [1];
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = 0;
      side.progressOffset = 0;
      side.targetOffset = configuredOffset(side.role, snapshot);
      side.desiredAddress = snapshot.current;
      side.lastPlacedAddress = null;
      side.adapter.mute?.();
      side.adapter.cue?.(snapshot.videoId, snapshot.current);
      runtime.forceEstablish = true;
    }
  }

  function resetSources() {
    for (const side of Object.values(sides)) {
      pauseSide(side);
      side.videoId = null;
      side.sourceReady = false;
      side.ratesKnown = false;
      side.pendingPlay = false;
      side.blocked = false;
      side.error = false;
      side.retrySource = true;
      side.ready = Boolean(side.adapter);
      side.playback = side.adapter ? "idle" : YOUTUBE_STATE.UNSTARTED;
    }
    runtime.forceEstablish = true;
  }

  function invalidate(options = {}) {
    if (options.pause !== false) pauseSides({ freeze: false });
    runtime.structuralKey = null;
    runtime.semanticCurrent = null;
    runtime.lastCenterTime = null;
    runtime.centerWasRunning = false;
    runtime.forceEstablish = true;
    runtime.restoreRoles.clear();
    runtime.suspended = false;
    runtime.field = null;
    runtime.fieldKey = "";
    onChange?.(null);
  }

  function resetAtCurrent() {
    // Immediate re-establishment owns the one necessary pause/place operation.
    // Clearing runtime first without a separate pause avoids a duplicate Field
    // disposition during Range, Focus, and Leave transitions.
    invalidate({ pause: false });
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded || !snapshot.range) {
      tick();
      return;
    }
    const prefs = preferences();
    render(snapshot);
    ensurePlayers(prefs);
    syncVideo(snapshot);
    populateRateControl("tail", prefs);
    populateRateControl("lead", prefs);
    establish(snapshot, snapshot.current);
    runtime.suspended = suspensionRequired(snapshot);
    runtime.phase = !prefs.stepFieldEnabled || (!prefs.tailVisible && !prefs.leadVisible)
      ? STEP_FIELD_PHASE.OFF
      : runtime.suspended
        ? STEP_FIELD_PHASE.SUSPENDED
        : STEP_FIELD_PHASE.HELD;
    publish(snapshot);
  }

  bind();
  render(getSnapshot?.());

  return {
    tick,
    render,
    pause(options = {}) {
      pauseSides({ center: options.center, freeze: options.freeze !== false });
      runtime.suspended = suspensionRequired();
      if (runtime.suspended) runtime.phase = STEP_FIELD_PHASE.SUSPENDED;
      runtime.centerWasRunning = false;
      publish(getSnapshot?.());
    },
    playFromGesture,
    resumeAt,
    activationState,
    resetAtCurrent,
    resetSources,
    translateToCurrent,
    getStepSelection: stepSelection,
    hold(role = "both") {
      if (role === "both") {
        const patch = {};
        const prefs = preferences();
        for (const name of ["tail", "lead"].filter(name => prefs[`${name}Visible`])) {
          const offset = hold(name, { record: false });
          if (Number.isFinite(offset) && offset > REACH_TOLERANCE) {
            patch[directionFor(name)] = Math.max(0.25, offset);
          }
        }
        if (Object.keys(patch).length) onHoldOffsets?.(patch);
      } else hold(role, { record: true });
    },
    stretch(role = "both") {
      if (role === "both") {
        const prefs = preferences();
        for (const name of ["tail", "lead"].filter(name => prefs[`${name}Visible`])) stretch(name);
      } else stretch(role);
    },
    snapshot() {
      return {
        ...(runtime.field || {}),
        phase: runtime.phase,
        tailMode: sides.tail.mode,
        leadMode: sides.lead.mode,
        tailRuntime: { ...sides.tail, adapter: undefined },
        leadRuntime: { ...sides.lead, adapter: undefined },
        preferences: preferences()
      };
    }
  };
}
