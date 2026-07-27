import { EPSILON, clamp } from "./range-geometry.js";
import { YOUTUBE_STATE, createYouTubePlayer } from "./youtube.js";
import {
  STEP_FIELD_PHASE,
  FIELD_REACH_TOLERANCE,
  deriveFieldBounds,
  deriveStepField,
  normalizeFieldReach,
  chooseNearestRate,
  chooseDirectionalRate,
  hasCenterDiscontinuity,
  resolveFieldPhase,
  sideActivationMode,
  deriveObservedField
} from "./step-field-geometry.js";

export {
  STEP_FIELD_PHASE,
  deriveFieldBounds,
  deriveStepField,
  normalizeFieldReach,
  chooseNearestRate,
  chooseDirectionalRate,
  hasCenterDiscontinuity,
  resolveFieldPhase,
  sideActivationMode,
  deriveObservedField
} from "./step-field-geometry.js";

const REACH_TOLERANCE = FIELD_REACH_TOLERANCE;
const DRIFT_TOLERANCE = 0.42;

function defaultPreferences() {
  return {
    stepFieldEnabled: true,
    tailVisible: true,
    leadVisible: true,
    tailRate: 0.5,
    leadRate: 2
  };
}

function snapshotReach(snapshot) {
  return snapshot.stepReach ?? snapshot.stepSeconds ?? 10;
}

function semanticKey(snapshot) {
  const range = snapshot.range || { start: 0, end: 0 };
  const reach = normalizeFieldReach(snapshotReach(snapshot));
  return [
    snapshot.videoId || "",
    Number(snapshot.current || 0).toFixed(3),
    Number(range.start || 0).toFixed(3),
    Number(range.end || 0).toFixed(3),
    Number(reach.backward).toFixed(3),
    Number(reach.forward).toFixed(3),
    String(reach.linked)
  ].join("|");
}

export function fieldShouldSuspend(snapshot) {
  const transportKind = snapshot?.transport?.kind ?? snapshot?.transportKind;
  return Boolean(
    snapshot?.rangeDragging
    || snapshot?.dragging
    || snapshot?.pendingStep
    || ["context", "skim", "loop"].includes(transportKind)
  );
}

export function createStepFieldController({
  document,
  getSnapshot,
  getPreferences = defaultPreferences,
  setPreferences = () => {},
  onStep = () => {},
  onSelect = null,
  onChange = () => {},
  formatTime = value => String(value),
  createPlayer = createYouTubePlayer
}) {
  const elements = Object.fromEntries(
    [
      "step-field", "step-field-toggle", "step-field-meta",
      "tail-pane", "tail-meta", "tail-step", "tail-collapse", "tail-restore",
      "lead-pane", "lead-meta", "lead-step", "lead-collapse", "lead-restore",
      "center-meta", "tail-rate-select", "lead-rate-select",
      "field-transport-state", "field-rate-state"
    ].map(id => [id, document?.getElementById?.(id) || null])
  );

  const sides = {
    tail: {
      role: "tail",
      elementId: "player-tail",
      requestedRate: 0.5,
      actualRate: 1,
      playback: "idle",
      adapter: null,
      ready: false,
      videoId: null,
      held: false,
      heldDistance: 0,
      rateAvailable: true,
      error: false
    },
    lead: {
      role: "lead",
      elementId: "player-lead",
      requestedRate: 2,
      actualRate: 1,
      playback: "idle",
      adapter: null,
      ready: false,
      videoId: null,
      held: false,
      heldDistance: 0,
      rateAvailable: true,
      error: false
    }
  };

  const runtime = {
    phase: STEP_FIELD_PHASE.OFF,
    semanticKey: null,
    lastCenterTime: null,
    suspended: false,
    forceEstablish: true,
    field: null,
    fieldKey: ""
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
    elements["tail-step"]?.addEventListener?.("click", () => selectSide("tail"));
    elements["lead-step"]?.addEventListener?.("click", () => selectSide("lead"));
    elements["tail-rate-select"]?.addEventListener?.("change", event => {
      changePreferences({ tailRate: Number(event.target.value) });
    });
    elements["lead-rate-select"]?.addEventListener?.("change", event => {
      changePreferences({ leadRate: Number(event.target.value) });
    });
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
          const iframe = adapter.raw?.()?.getIframe?.();
          iframe?.setAttribute?.("tabindex", "-1");
          iframe?.setAttribute?.("aria-hidden", "true");
          runtime.forceEstablish = true;
        },
        onStateChange: name => {
          side.playback = name;
        },
        onPlaybackRateChange: rate => {
          if (Number.isFinite(Number(rate))) side.actualRate = Number(rate);
        },
        onAutoplayBlocked: () => {
          side.playback = "blocked";
          side.adapter?.pause?.();
        },
        onError: () => {
          side.error = true;
          side.ready = false;
        }
      }
    });
  }

  function ensurePlayers(prefs) {
    if (!prefs.stepFieldEnabled) return;
    if (prefs.tailVisible) createSide("tail");
    if (prefs.leadVisible) createSide("lead");
  }

  function pauseSide(side) {
    side.adapter?.pause?.();
    side.adapter?.setRate?.(1);
    side.actualRate = 1;
    if (side.playback !== "blocked" && side.playback !== "error") side.playback = "idle";
  }

  function pauseSides() {
    pauseSide(sides.tail);
    pauseSide(sides.lead);
  }

  function resetSideState() {
    for (const side of Object.values(sides)) {
      side.held = false;
      side.heldDistance = 0;
    }
  }

  function invalidate() {
    pauseSides();
    resetSideState();
    runtime.semanticKey = null;
    runtime.lastCenterTime = null;
    runtime.forceEstablish = true;
    runtime.suspended = false;
    runtime.field = null;
    runtime.fieldKey = "";
    onChange?.(null);
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
    side.adapter?.mute?.();
    side.requestedRate = requestedRate;
    const snapshot = readSide(side);
    side.actualRate = snapshot.rate;
    const rate = requestedRate === 1
      ? 1
      : chooseDirectionalRate(snapshot.availableRates, requestedRate, side.role);
    side.rateAvailable = rate !== null;
    if (rate === null) {
      pauseSide(side);
      return false;
    }
    if (Math.abs(snapshot.rate - rate) > 0.001) side.adapter?.setRate?.(rate);
    side.actualRate = readSide(side).rate;
    return true;
  }

  function ensureSidePlaying(side) {
    const state = readSide(side).state;
    side.playback = state;
    if (![YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(state)) {
      side.playback = "starting";
      side.adapter?.play?.();
    }
  }

  function directionalRates(side) {
    return [...new Set(readSide(side).availableRates || [])]
      .filter(rate => Number.isFinite(rate) && (side.role === "tail" ? rate < 1 : rate > 1))
      .sort((a, b) => a - b);
  }

  function populateRateControl(role, prefs) {
    const side = sides[role];
    const select = elements[`${role}-rate-select`];
    if (!select || !side.ready) return;
    const rates = directionalRates(side);
    const key = rates.join("|");
    if (select.dataset.rates !== key) {
      select.replaceChildren();
      if (!rates.length) {
        const option = document.createElement("option");
        option.value = "1";
        option.textContent = "Unavailable";
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

  function playSides() {
    const prefs = preferences();
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded || !prefs.stepFieldEnabled) return false;
    ensurePlayers(prefs);
    syncVideo(snapshot);
    let started = false;
    for (const role of ["tail", "lead"]) {
      const visible = prefs[`${role}Visible`];
      const side = sides[role];
      if (!visible || !side.ready || side.error) continue;
      const requested = Number(prefs[`${role}Rate`]);
      if (!setSideRate(side, requested)) continue;
      ensureSidePlaying(side);
      started = true;
    }
    return started;
  }

  function syncVideo(snapshot) {
    if (!snapshot.videoLoaded || !snapshot.videoId) return;
    for (const side of Object.values(sides)) {
      if (!side.ready || side.videoId === snapshot.videoId) continue;
      side.videoId = snapshot.videoId;
      side.error = false;
      side.playback = "idle";
      side.actualRate = 1;
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
    resetSideState();
    for (const side of Object.values(sides)) {
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
    side.adapter?.mute?.();
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

    if (!setSideRate(side, side.requestedRate)) {
      return { available: false, held: false, offset, rateUnavailable: true };
    }
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

  function publishField(targets, sideStates, centerTime, prefs, phase = runtime.phase) {
    const tailRead = readSide(sides.tail);
    const leadRead = readSide(sides.lead);
    const observed = deriveObservedField({
      targets,
      phase,
      centerAddress: centerTime,
      tailAddress: prefs.tailVisible && sides.tail.ready ? tailRead.time : centerTime,
      leadAddress: prefs.leadVisible && sides.lead.ready ? leadRead.time : centerTime,
      tailVisible: prefs.tailVisible,
      leadVisible: prefs.leadVisible,
      tailHeld: sideStates?.tail?.held,
      leadHeld: sideStates?.lead?.held
    });
    observed.tail.requestedRate = Number(prefs.tailRate);
    observed.tail.actualRate = sides.tail.actualRate;
    observed.tail.playback = sides.tail.playback;
    observed.lead.requestedRate = Number(prefs.leadRate);
    observed.lead.actualRate = sides.lead.actualRate;
    observed.lead.playback = sides.lead.playback;
    const key = JSON.stringify({
      phase: observed.phase,
      constraint: observed.constraint,
      tail: Number(observed.tail.address.toFixed(2)),
      lead: Number(observed.lead.address.toFixed(2)),
      tailHeld: observed.tail.held,
      leadHeld: observed.lead.held,
      rates: [observed.tail.actualRate, observed.lead.actualRate],
      playback: [observed.tail.playback, observed.lead.playback],
      visible: [observed.tail.visible, observed.lead.visible]
    });
    runtime.field = observed;
    if (key !== runtime.fieldKey) {
      runtime.fieldKey = key;
      onChange?.(observed);
    }
    return observed;
  }

  function selectSide(role) {
    const observed = runtime.field;
    const side = observed?.[role];
    const mode = sideActivationMode(side, observed?.phase);
    if (!mode) return;
    const payload = {
      role,
      direction: role === "tail" ? "backward" : "forward",
      mode,
      phase: observed.phase,
      held: side.held,
      address: side.address,
      target: side.target,
      offset: side.offset,
      span: observed.span
    };
    if (typeof onSelect === "function") onSelect(payload);
    else onStep(payload.direction);
  }

  function sideMetadata(role, target, sideState) {
    if (runtime.phase === STEP_FIELD_PHASE.SUSPENDED) return "Suspended";
    const runtimeSide = sides[role];
    if (runtimeSide.playback === "blocked") return "Playback blocked";
    if (runtimeSide.error) return "Player unavailable";
    const prefix = role === "tail" ? "−" : "+";
    const boundary = target.constrained
      ? role === "tail" ? "Range start" : "Range end"
      : null;
    const rate = Number.isFinite(runtimeSide.actualRate) ? ` · ${runtimeSide.actualRate}×` : "";
    if (!target.available) return boundary || (role === "tail" ? "Range start" : "Range end");
    if (!runtimeSide.rateAvailable) return `${prefix}${formatOffset(target.distance)} · Rate unavailable`;
    if (sideState.held) return `${prefix}${formatOffset(target.distance)} · ${boundary || "Held"}${rate}`;
    if (sideState.offset > REACH_TOLERANCE) {
      return `${prefix}${formatOffset(sideState.offset)} / ${formatOffset(target.distance)}${boundary ? ` · ${boundary}` : ""}${rate}`;
    }
    return `${prefix}${formatOffset(target.distance)} · ${boundary || "Ready"}${rate}`;
  }

  function render(snapshot = getSnapshot?.(), live = null, sideStates = null) {
    if (!snapshot || !elements["step-field"]) return;
    const prefs = preferences();
    const loaded = Boolean(snapshot.videoLoaded);
    const field = live || deriveStepField(
      Number(snapshot.center?.time ?? snapshot.current ?? 0),
      snapshotReach(snapshot),
      snapshot.range || { start: 0, end: 0 }
    );
    const states = sideStates || {
      tail: { available: field.tail.available, held: false, offset: 0 },
      lead: { available: field.lead.available, held: false, offset: 0 }
    };

    const root = elements["step-field"];
    const fieldShown = loaded && prefs.stepFieldEnabled;
    root.classList.toggle("field-off", !fieldShown);
    root.classList.toggle("tail-collapsed", !prefs.tailVisible);
    root.classList.toggle("lead-collapsed", !prefs.leadVisible);
    root.classList.toggle("is-suspended", runtime.phase === STEP_FIELD_PHASE.SUSPENDED);
    root.dataset.phase = runtime.phase;
    root.dataset.constraint = field.constraint || "none";

    elements["tail-pane"]?.classList?.toggle("is-collapsed", !prefs.tailVisible);
    elements["lead-pane"]?.classList?.toggle("is-collapsed", !prefs.leadVisible);
    if (elements["tail-restore"]) elements["tail-restore"].hidden = prefs.tailVisible;
    if (elements["lead-restore"]) elements["lead-restore"].hidden = prefs.leadVisible;
    if (elements["tail-collapse"]) elements["tail-collapse"].hidden = !prefs.tailVisible;
    if (elements["lead-collapse"]) elements["lead-collapse"].hidden = !prefs.leadVisible;

    if (elements["step-field-toggle"]) elements["step-field-toggle"].disabled = !loaded;
    elements["step-field-toggle"]?.setAttribute?.("aria-pressed", String(fieldShown));
    elements["step-field-toggle"]?.setAttribute?.("aria-label", `${fieldShown ? "Hide" : "Show"} Step Field`);
    setText(elements["step-field-meta"], !loaded
      ? "Load video"
      : prefs.stepFieldEnabled
        ? runtime.phase === STEP_FIELD_PHASE.PARTIAL ? "Partial"
          : runtime.phase === STEP_FIELD_PHASE.HELD ? "Held"
            : runtime.phase === STEP_FIELD_PHASE.UNFOLDING ? "Unfolding"
              : runtime.phase === STEP_FIELD_PHASE.SUSPENDED ? "Suspended"
                : "Ready"
        : "Off");

    const centerTime = Number(snapshot.center?.time ?? snapshot.current ?? 0);
    setText(elements["center-meta"], loaded ? formatTime(centerTime) : "—");

    for (const role of ["tail", "lead"]) {
      const target = field[role];
      const sideState = states[role];
      const meta = sideMetadata(role, target, sideState);
      setText(elements[`${role}-meta`], meta);
      const button = elements[`${role}-step`];
      if (!button) continue;
      const observedSide = runtime.field?.[role] || {
        ...sideState,
        address: centerTime,
        visible: prefs[`${role}Visible`],
        available: target.available
      };
      const mode = sideActivationMode(observedSide, runtime.phase);
      const action = mode === "step"
        ? role === "tail" ? "Step Backward" : "Step Forward"
        : mode === "go"
          ? role === "tail" ? "Go to visible Tail" : "Go to visible Lead"
          : role === "tail" ? "Tail is coincident" : "Lead is coincident";
      const destination = mode === "step" ? target.target : observedSide.address;
      button.disabled = !loaded || !prefs.stepFieldEnabled || !mode;
      button.dataset.action = mode || "none";
      button.setAttribute("aria-label", `${action}${Number.isFinite(destination) ? ` at ${formatTime(destination)}` : ""}. ${meta}.`);
    }
  }

  function tick() {
    const prefs = preferences();
    const snapshot = getSnapshot?.();
    if (!snapshot || !snapshot.range) return;
    if (snapshot.videoLoaded) ensurePlayers(prefs);
    syncVideo(snapshot);
    populateRateControl("tail", prefs);
    populateRateControl("lead", prefs);
    sides.tail.requestedRate = Number(prefs.tailRate);
    sides.lead.requestedRate = Number(prefs.leadRate);

    if (!snapshot.videoLoaded || !snapshot.videoId) {
      pauseSides();
      runtime.semanticKey = null;
      runtime.lastCenterTime = null;
      runtime.phase = prefs.stepFieldEnabled ? STEP_FIELD_PHASE.COINCIDENT : STEP_FIELD_PHASE.OFF;
      const targets = deriveStepField(snapshot.current || 0, snapshotReach(snapshot), snapshot.range);
      publishField(targets, null, snapshot.current || 0, prefs, runtime.phase);
      render(snapshot);
      return;
    }

    const suspended = fieldShouldSuspend(snapshot) || Boolean(document?.hidden);

    if (!prefs.stepFieldEnabled || (!prefs.tailVisible && !prefs.leadVisible)) {
      pauseSides();
      runtime.phase = STEP_FIELD_PHASE.OFF;
      runtime.suspended = false;
      const centerTime = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
      const targets = deriveStepField(centerTime, snapshot.stepSeconds, snapshot.range);
      publishField(targets, null, centerTime, prefs, runtime.phase);
      render(snapshot);
      return;
    }

    if (suspended) {
      pauseSides();
      runtime.phase = STEP_FIELD_PHASE.SUSPENDED;
      runtime.suspended = true;
      const centerTime = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
      const targets = deriveStepField(centerTime, snapshot.stepSeconds, snapshot.range);
      publishField(targets, null, centerTime, prefs, runtime.phase);
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
    publishField(live, sideStates, centerTime, prefs, runtime.phase);
    render(snapshot, live, sideStates);
  }

  bind();
  render(getSnapshot?.());

  return {
    tick,
    render,
    pause: pauseSides,
    invalidate,
    establish() {
      const snapshot = getSnapshot?.();
      if (snapshot?.videoLoaded) establish(snapshot, snapshot.current);
    },
    snapshot() {
      return {
        ...(runtime.field || {}),
        phase: runtime.phase,
        tailHeld: sides.tail.held,
        leadHeld: sides.lead.held,
        preferences: preferences()
      };
    }
  };
}
