import { EPSILON, clamp, stepTarget } from "./range-geometry.js";
import { YOUTUBE_STATE, createYouTubePlayer } from "./youtube.js";

export const STEP_FIELD_PHASE = Object.freeze({
  OFF: "off",
  COINCIDENT: "coincident",
  UNFOLDING: "unfolding",
  PARTIAL: "partially-held",
  HELD: "held",
  SUSPENDED: "suspended"
});

const REACH_TOLERANCE = 0.16;
const DRIFT_TOLERANCE = 0.42;
const DISCONTINUITY_TOLERANCE = 2.5;
const TAIL_RATE = 0.5;
const LEAD_RATE = 2;

export function deriveStepField(current, stepSeconds, range) {
  if (!Number.isFinite(current) || !Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new TypeError("Step Field requires a finite Current and positive Step size.");
  }
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new TypeError("Step Field requires a valid Range.");
  }
  const center = clamp(current, range.start, range.end);
  const tailTarget = stepTarget(center, stepSeconds, "backward", range);
  const leadTarget = stepTarget(center, stepSeconds, "forward", range);
  return {
    center,
    tail: {
      target: tailTarget,
      distance: center - tailTarget,
      available: tailTarget < center - EPSILON
    },
    lead: {
      target: leadTarget,
      distance: leadTarget - center,
      available: leadTarget > center + EPSILON
    }
  };
}

export function chooseNearestRate(availableRates, requestedRate) {
  const rates = [...new Set(availableRates || [])]
    .filter(rate => Number.isFinite(rate) && rate > 0)
    .sort((a, b) => a - b);
  if (!rates.length) return 1;
  return rates.reduce((best, rate) => (
    Math.abs(rate - requestedRate) < Math.abs(best - requestedRate) ? rate : best
  ), rates[0]);
}

export function hasCenterDiscontinuity(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return false;
  return current < previous - 0.75 || Math.abs(current - previous) > DISCONTINUITY_TOLERANCE;
}

export function resolveFieldPhase({ enabled, suspended, sides }) {
  if (!enabled) return STEP_FIELD_PHASE.OFF;
  if (suspended) return STEP_FIELD_PHASE.SUSPENDED;
  const active = (sides || []).filter(side => side.visible && side.available);
  if (!active.length) return STEP_FIELD_PHASE.COINCIDENT;
  const held = active.filter(side => side.held).length;
  if (held === active.length) return STEP_FIELD_PHASE.HELD;
  if (held > 0) return STEP_FIELD_PHASE.PARTIAL;
  if (active.some(side => side.offset > REACH_TOLERANCE)) return STEP_FIELD_PHASE.UNFOLDING;
  return STEP_FIELD_PHASE.COINCIDENT;
}

function defaultPreferences() {
  return {
    stepFieldEnabled: true,
    tailVisible: true,
    leadVisible: true
  };
}

function semanticKey(snapshot) {
  const range = snapshot.range || { start: 0, end: 0 };
  return [
    snapshot.videoId || "",
    Number(snapshot.current || 0).toFixed(3),
    Number(range.start || 0).toFixed(3),
    Number(range.end || 0).toFixed(3),
    Number(snapshot.stepSeconds || 0).toFixed(3)
  ].join("|");
}

export function createStepFieldController({
  document,
  getSnapshot,
  getPreferences = defaultPreferences,
  setPreferences = () => {},
  onStep = () => {},
  formatTime = value => String(value),
  createPlayer = createYouTubePlayer
}) {
  const elements = Object.fromEntries(
    [
      "step-field", "step-field-toggle", "step-field-meta",
      "tail-pane", "tail-meta", "tail-step", "tail-collapse", "tail-restore",
      "lead-pane", "lead-meta", "lead-step", "lead-collapse", "lead-restore",
      "center-meta"
    ].map(id => [id, document?.getElementById?.(id) || null])
  );

  const sides = {
    tail: {
      role: "tail",
      elementId: "player-tail",
      requestedRate: TAIL_RATE,
      adapter: null,
      ready: false,
      videoId: null,
      held: false,
      heldDistance: 0,
      error: false
    },
    lead: {
      role: "lead",
      elementId: "player-lead",
      requestedRate: LEAD_RATE,
      adapter: null,
      ready: false,
      videoId: null,
      held: false,
      heldDistance: 0,
      error: false
    }
  };

  const runtime = {
    phase: STEP_FIELD_PHASE.OFF,
    semanticKey: null,
    lastCenterTime: null,
    suspended: false,
    forceEstablish: true
  };

  function preferences() {
    return { ...defaultPreferences(), ...(getPreferences?.() || {}) };
  }

  function changePreferences(patch) {
    setPreferences?.(patch);
    runtime.forceEstablish = true;
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
    elements["tail-step"]?.addEventListener?.("click", () => onStep("backward"));
    elements["lead-step"]?.addEventListener?.("click", () => onStep("forward"));
  }

  function createSide(role) {
    const side = sides[role];
    if (side.adapter || !globalThis.YT?.Player || !document?.getElementById?.(side.elementId)) return;
    side.adapter = createPlayer(side.elementId, {
      playerVars: {
        controls: 0,
        disablekb: 1,
        fs: 0,
        playsinline: 1
      },
      events: {
        onReady: adapter => {
          side.ready = true;
          side.error = false;
          adapter.mute?.();
          runtime.forceEstablish = true;
        },
        onStateChange: () => {},
        onPlaybackRateChange: () => {},
        onAutoplayBlocked: () => side.adapter?.pause?.(),
        onError: () => {
          side.error = true;
          side.ready = false;
        }
      }
    });
  }

  function ensurePlayers() {
    createSide("tail");
    createSide("lead");
  }

  function pauseSide(side) {
    side.adapter?.pause?.();
    side.adapter?.setRate?.(1);
  }

  function pauseSides() {
    pauseSide(sides.tail);
    pauseSide(sides.lead);
  }

  function readSide(side) {
    return side.adapter?.read?.() || {
      time: 0,
      rate: 1,
      state: YOUTUBE_STATE.UNSTARTED,
      availableRates: [1]
    };
  }

  function setSideRate(side, requestedRate) {
    const snapshot = readSide(side);
    const rate = chooseNearestRate(snapshot.availableRates, requestedRate);
    if (Math.abs(snapshot.rate - rate) > 0.001) side.adapter?.setRate?.(rate);
  }

  function ensureSidePlaying(side) {
    const state = readSide(side).state;
    if (![YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(state)) side.adapter?.play?.();
  }

  function syncVideo(snapshot) {
    if (!snapshot.videoLoaded || !snapshot.videoId) return;
    for (const side of Object.values(sides)) {
      if (!side.ready || side.videoId === snapshot.videoId) continue;
      side.videoId = snapshot.videoId;
      side.error = false;
      side.held = false;
      side.heldDistance = 0;
      side.adapter.mute?.();
      side.adapter.cue?.(snapshot.videoId, snapshot.current || 0);
      runtime.forceEstablish = true;
    }
  }

  function placeSide(side, address) {
    if (!side.ready || !side.adapter) return;
    side.adapter.mute?.();
    side.adapter.setRate?.(1);
    side.adapter.place?.(address);
  }

  function establish(snapshot, address = snapshot.current) {
    const bounded = clamp(address, snapshot.range.start, snapshot.range.end);
    for (const side of Object.values(sides)) {
      side.held = false;
      side.heldDistance = 0;
      pauseSide(side);
      placeSide(side, bounded);
    }
    runtime.semanticKey = semanticKey(snapshot);
    runtime.lastCenterTime = bounded;
    runtime.forceEstablish = false;
    runtime.phase = STEP_FIELD_PHASE.COINCIDENT;
  }

  function exactSideAddress(role, centerTime, distance, range) {
    return role === "tail"
      ? clamp(centerTime - distance, range.start, range.end)
      : clamp(centerTime + distance, range.start, range.end);
  }

  function updateSide(side, centerTime, targetDistance, range) {
    if (!side.ready || side.error) return { available: false, held: false, offset: 0 };
    const snapshot = readSide(side);
    const rawOffset = side.role === "tail" ? centerTime - snapshot.time : snapshot.time - centerTime;
    const offset = Math.max(0, rawOffset);
    const available = targetDistance > EPSILON;

    if (!available) {
      side.held = false;
      side.heldDistance = 0;
      pauseSide(side);
      placeSide(side, centerTime);
      return { available: false, held: false, offset: 0 };
    }

    if (side.held && targetDistance > side.heldDistance + DRIFT_TOLERANCE) side.held = false;

    const exact = exactSideAddress(side.role, centerTime, targetDistance, range);
    if (side.held) {
      setSideRate(side, 1);
      ensureSidePlaying(side);
      if (Math.abs(offset - targetDistance) > DRIFT_TOLERANCE) {
        placeSide(side, exact);
        ensureSidePlaying(side);
      }
      side.heldDistance = targetDistance;
      return { available: true, held: true, offset: targetDistance };
    }

    if (offset >= targetDistance - REACH_TOLERANCE) {
      placeSide(side, exact);
      setSideRate(side, 1);
      ensureSidePlaying(side);
      side.held = true;
      side.heldDistance = targetDistance;
      return { available: true, held: true, offset: targetDistance };
    }

    setSideRate(side, side.requestedRate);
    ensureSidePlaying(side);
    return { available: true, held: false, offset };
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function formatOffset(value) {
    if (!Number.isFinite(value)) return "—";
    const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
    return `${rounded}s`;
  }

  function render(snapshot = getSnapshot?.(), live = null, sideStates = null) {
    if (!snapshot || !elements["step-field"]) return;
    const prefs = preferences();
    const loaded = Boolean(snapshot.videoLoaded);
    const field = live || deriveStepField(
      Number(snapshot.center?.time ?? snapshot.current ?? 0),
      Number(snapshot.stepSeconds || 10),
      snapshot.range || { start: 0, end: 0 }
    );
    const states = sideStates || {
      tail: { available: field.tail.available, held: false, offset: 0 },
      lead: { available: field.lead.available, held: false, offset: 0 }
    };

    const root = elements["step-field"];
    root.classList.toggle("field-off", !prefs.stepFieldEnabled);
    root.classList.toggle("tail-collapsed", !prefs.tailVisible);
    root.classList.toggle("lead-collapsed", !prefs.leadVisible);
    root.classList.toggle("is-suspended", runtime.phase === STEP_FIELD_PHASE.SUSPENDED);
    root.dataset.phase = runtime.phase;

    elements["tail-pane"]?.classList?.toggle("is-collapsed", !prefs.tailVisible);
    elements["lead-pane"]?.classList?.toggle("is-collapsed", !prefs.leadVisible);
    if (elements["tail-restore"]) elements["tail-restore"].hidden = prefs.tailVisible;
    if (elements["lead-restore"]) elements["lead-restore"].hidden = prefs.leadVisible;
    if (elements["tail-collapse"]) elements["tail-collapse"].hidden = !prefs.tailVisible;
    if (elements["lead-collapse"]) elements["lead-collapse"].hidden = !prefs.leadVisible;

    elements["step-field-toggle"]?.setAttribute?.("aria-pressed", String(prefs.stepFieldEnabled));
    elements["step-field-toggle"]?.setAttribute?.("aria-label", `${prefs.stepFieldEnabled ? "Hide" : "Show"} Step Field`);
    setText(elements["step-field-meta"], prefs.stepFieldEnabled
      ? runtime.phase === STEP_FIELD_PHASE.PARTIAL ? "Partial"
        : runtime.phase === STEP_FIELD_PHASE.HELD ? "Held"
          : runtime.phase === STEP_FIELD_PHASE.UNFOLDING ? "Unfolding"
            : runtime.phase === STEP_FIELD_PHASE.SUSPENDED ? "Suspended"
              : "Ready"
      : "Off");

    const centerTime = Number(snapshot.center?.time ?? snapshot.current ?? 0);
    setText(elements["center-meta"], loaded ? formatTime(centerTime) : "—");

    for (const role of ["tail", "lead"]) {
      const prefix = role === "tail" ? "−" : "+";
      const target = field[role];
      const sideState = states[role];
      const meta = runtime.phase === STEP_FIELD_PHASE.SUSPENDED
        ? "Suspended"
        : !target.available
          ? role === "tail" ? "Range start" : "Range end"
          : sideState.held
            ? `${prefix}${formatOffset(target.distance)} · Held`
            : sideState.offset > REACH_TOLERANCE
              ? `${prefix}${formatOffset(sideState.offset)} / ${formatOffset(target.distance)}`
              : `${prefix}${formatOffset(target.distance)} · Ready`;
      setText(elements[`${role}-meta`], meta);
      const button = elements[`${role}-step`];
      if (button) {
        button.disabled = !loaded || !prefs.stepFieldEnabled || !prefs[`${role}Visible`] || !target.available;
        button.setAttribute("aria-label", `${role === "tail" ? "Step Backward" : "Step Forward"} to ${formatTime(target.target)}. ${meta}.`);
      }
    }
  }

  function tick() {
    ensurePlayers();
    const snapshot = getSnapshot?.();
    if (!snapshot || !snapshot.range) return;
    syncVideo(snapshot);

    const prefs = preferences();
    if (!snapshot.videoLoaded || !snapshot.videoId) {
      pauseSides();
      runtime.semanticKey = null;
      runtime.lastCenterTime = null;
      runtime.phase = prefs.stepFieldEnabled ? STEP_FIELD_PHASE.COINCIDENT : STEP_FIELD_PHASE.OFF;
      render(snapshot);
      return;
    }

    const suspended = Boolean(
      snapshot.pendingStep
      || snapshot.dragging
      || ["context", "loop", "skim"].includes(snapshot.transportKind)
      || document?.hidden
    );

    if (!prefs.stepFieldEnabled || (!prefs.tailVisible && !prefs.leadVisible)) {
      pauseSides();
      runtime.phase = STEP_FIELD_PHASE.OFF;
      runtime.suspended = false;
      render(snapshot);
      return;
    }

    if (suspended) {
      pauseSides();
      runtime.phase = STEP_FIELD_PHASE.SUSPENDED;
      runtime.suspended = true;
      render(snapshot);
      return;
    }

    const key = semanticKey(snapshot);
    const centerTime = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);

    if (runtime.suspended) {
      runtime.suspended = false;
      establish(snapshot, snapshot.current);
    } else if (snapshot.transportKind !== "continue" && (runtime.forceEstablish || key !== runtime.semanticKey)) {
      establish(snapshot, snapshot.current);
    } else if (snapshot.transportKind === "continue" && runtime.semanticKey === null) {
      establish(snapshot, centerTime);
    }

    if (hasCenterDiscontinuity(runtime.lastCenterTime, centerTime)) establish(snapshot, centerTime);
    runtime.lastCenterTime = centerTime;

    const live = deriveStepField(centerTime, snapshot.stepSeconds, snapshot.range);
    const centerPlaying = snapshot.center?.state === YOUTUBE_STATE.PLAYING && snapshot.transportKind === "continue";

    const sideStates = {
      tail: {
        available: live.tail.available,
        held: sides.tail.held,
        offset: Math.max(0, centerTime - readSide(sides.tail).time)
      },
      lead: {
        available: live.lead.available,
        held: sides.lead.held,
        offset: Math.max(0, readSide(sides.lead).time - centerTime)
      }
    };

    if (!centerPlaying) {
      pauseSides();
    } else {
      if (prefs.tailVisible) sideStates.tail = updateSide(sides.tail, centerTime, live.tail.distance, snapshot.range);
      else pauseSide(sides.tail);
      if (prefs.leadVisible) sideStates.lead = updateSide(sides.lead, centerTime, live.lead.distance, snapshot.range);
      else pauseSide(sides.lead);
    }

    runtime.phase = resolveFieldPhase({
      enabled: prefs.stepFieldEnabled,
      suspended: false,
      sides: [
        { ...sideStates.tail, visible: prefs.tailVisible },
        { ...sideStates.lead, visible: prefs.leadVisible }
      ]
    });
    render(snapshot, live, sideStates);
  }

  bind();
  render(getSnapshot?.());

  return {
    tick,
    render,
    pause: pauseSides,
    establish() {
      const snapshot = getSnapshot?.();
      if (snapshot?.videoLoaded) establish(snapshot, snapshot.current);
    },
    snapshot() {
      return {
        phase: runtime.phase,
        tailHeld: sides.tail.held,
        leadHeld: sides.lead.held,
        preferences: preferences()
      };
    }
  };
}
