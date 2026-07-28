// Step Field execution controller. Tail and Lead are muted physical projections of Session state.
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
const DRIFT_TOLERANCE = 0.42;

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
  return ["stepFieldEnabled", "tailVisible", "leadVisible"]
    .some(key => Object.hasOwn(patch || {}, key));
}

export function createStepFieldController({
  document,
  getSnapshot,
  getPreferences = defaultPreferences,
  setPreferences = () => {},
  onSelect = () => {},
  onHoldOffsets = () => {},
  onChange = () => {},
  formatTime = value => String(value),
  createPlayer = createYouTubePlayer
}) {
  const ids = [
    "step-field", "step-field-toggle", "step-field-meta",
    "tail-pane", "tail-meta", "tail-step-button", "tail-collapse", "tail-restore",
    "lead-pane", "lead-meta", "lead-step-button", "lead-collapse", "lead-restore",
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
    forceEstablish: true,
    suspended: false,
    field: null,
    fieldKey: ""
  };

  function createSideState(role, elementId, requestedRate) {
    return {
      role,
      elementId,
      requestedRate,
      actualRate: 1,
      playback: "idle",
      adapter: null,
      ready: false,
      videoId: null,
      mode: FIELD_SIDE_MODE.HELD,
      offset: 0,
      rateAvailable: true,
      error: false
    };
  }

  function preferences() {
    return { ...defaultPreferences(), ...(getPreferences?.() || {}) };
  }

  function changePreferences(patch) {
    setPreferences?.(patch);
    if (fieldPreferenceRequiresEstablish(patch)) runtime.forceEstablish = true;
  }

  function directionFor(role) {
    return role === "tail" ? "backward" : "forward";
  }

  function maxOffset(role, snapshot = getSnapshot?.()) {
    return snapshotReach(snapshot)[directionFor(role)];
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
    elements["tail-step-button"]?.addEventListener?.("click", () => selectSide("tail"));
    elements["lead-step-button"]?.addEventListener?.("click", () => selectSide("lead"));
    elements["tail-rate-select"]?.addEventListener?.("change", event => {
      changePreferences({ tailRate: Number(event.target.value) });
    });
    elements["lead-rate-select"]?.addEventListener?.("change", event => {
      changePreferences({ leadRate: Number(event.target.value) });
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
          adapter.mute?.();
          const iframe = adapter.raw?.()?.getIframe?.();
          iframe?.setAttribute?.("tabindex", "-1");
          iframe?.setAttribute?.("aria-hidden", "true");
          runtime.forceEstablish = true;
        },
        onStateChange: name => {
          side.playback = name;
          if (name === YOUTUBE_STATE.PLAYING || name === YOUTUBE_STATE.BUFFERING) {
            populateRateControl(role, preferences());
          }
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
      time: runtime.semanticCurrent || 0,
      rate: 1,
      state: YOUTUBE_STATE.UNSTARTED,
      availableRates: [1]
    };
  }

  function pauseSide(side) {
    side.adapter?.pause?.();
    side.adapter?.setRate?.(1);
    side.actualRate = 1;
    if (!["blocked", "error"].includes(side.playback)) side.playback = "idle";
  }

  function pauseSides() {
    pauseSide(sides.tail);
    pauseSide(sides.lead);
  }

  function parkSide(side, address) {
    if (!side.ready || !side.adapter || !side.videoId) return;
    side.adapter.mute?.();
    side.adapter.setRate?.(1);
    side.actualRate = 1;
    // cueVideoById is the paused placement primitive. YouTube documents that
    // seekTo() from a cued player may start playback, which can immediately
    // trigger autoplay blocking in the independent Tail and Lead iframes.
    side.adapter.cue?.(side.videoId, address);
    side.playback = YOUTUBE_STATE.CUED;
  }

  function seekPlayingSide(side, address) {
    if (!side.ready || !side.adapter) return;
    side.adapter.mute?.();
    side.adapter.place?.(address);
  }

  function exactAddress(role, center, offset, range) {
    return role === "tail"
      ? clamp(center - offset, range.start, range.end)
      : clamp(center + offset, range.start, range.end);
  }

  function measuredOffset(role, center = runtime.lastCenterTime ?? runtime.semanticCurrent, snapshot = getSnapshot?.()) {
    const side = sides[role];
    const time = readSide(side).time;
    const value = role === "tail" ? center - time : time - center;
    const maximum = maxOffset(role, snapshot);
    return clamp(Math.max(0, value), 0, maximum);
  }

  function ensureSidePlaying(side) {
    side.adapter?.mute?.();
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

  function requestStretchRate(side) {
    side.adapter?.mute?.();
    side.requestedRate = Number(preferences()[`${side.role}Rate`]);
    const snapshot = readSide(side);
    const rate = chooseDirectionalRate(snapshot.availableRates, side.requestedRate, side.role);
    side.rateAvailable = rate !== null;
    if (rate === null) {
      side.adapter?.setRate?.(1);
      side.actualRate = 1;
      return false;
    }
    if (Math.abs(snapshot.rate - rate) > 0.001) side.adapter?.setRate?.(rate);
    side.actualRate = readSide(side).rate;
    return true;
  }

  function establish(snapshot, address = snapshot.current) {
    const center = clamp(address, snapshot.range.start, snapshot.range.end);
    for (const side of Object.values(sides)) {
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = 0;
      pauseSide(side);
      parkSide(side, center);
    }
    runtime.structuralKey = structuralKey(snapshot);
    runtime.semanticCurrent = center;
    runtime.lastCenterTime = center;
    runtime.forceEstablish = false;
    runtime.phase = STEP_FIELD_PHASE.COINCIDENT;
  }

  function translateToCurrent(current, { preserve = true } = {}) {
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded || !snapshot.range || !Number.isFinite(current)) return;
    const previous = Number.isFinite(runtime.lastCenterTime)
      ? runtime.lastCenterTime
      : Number.isFinite(runtime.semanticCurrent)
        ? runtime.semanticCurrent
        : snapshot.current;
    const offsets = {
      tail: preserve ? measuredOffset("tail", previous, snapshot) : 0,
      lead: preserve ? measuredOffset("lead", previous, snapshot) : 0
    };
    runtime.semanticCurrent = clamp(current, snapshot.range.start, snapshot.range.end);
    runtime.lastCenterTime = runtime.semanticCurrent;
    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      const offset = clamp(offsets[role], 0, maxOffset(role, snapshot));
      side.offset = offset;
      pauseSide(side);
      parkSide(side, exactAddress(role, runtime.semanticCurrent, offset, snapshot.range));
    }
    runtime.structuralKey = structuralKey(snapshot);
    runtime.forceEstablish = false;
    publish(snapshot);
  }

  function translatePhysicalCenter(address, { preserve = true } = {}) {
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded || !snapshot.range || !Number.isFinite(address)) return;
    const previous = Number.isFinite(runtime.lastCenterTime)
      ? runtime.lastCenterTime
      : Number(snapshot.center?.time ?? snapshot.current);
    const nextCenter = clamp(address, snapshot.range.start, snapshot.range.end);
    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      const offset = preserve ? measuredOffset(role, previous, snapshot) : 0;
      side.offset = clamp(offset, 0, maxOffset(role, snapshot));
      pauseSide(side);
      parkSide(side, exactAddress(role, nextCenter, side.offset, snapshot.range));
    }
    runtime.lastCenterTime = nextCenter;
  }

  function stretch(role) {
    const snapshot = getSnapshot?.();
    const side = sides[role];
    if (!snapshot?.videoLoaded || !side) return;
    const center = clamp(
      Number(snapshot.center?.time ?? snapshot.current),
      snapshot.range.start,
      snapshot.range.end
    );
    side.mode = FIELD_SIDE_MODE.STRETCHING;
    side.offset = 0;
    pauseSide(side);
    // Stretch is one complete operation: refold to the physical Center, then
    // diverge from that same point on the next genuine Center playback.
    parkSide(side, center);
    runtime.semanticCurrent = snapshot.current;
    runtime.lastCenterTime = center;
    publish(snapshot);
  }

  function hold(role) {
    const snapshot = getSnapshot?.();
    const side = sides[role];
    if (!snapshot?.videoLoaded || !side) return;
    const offset = measuredOffset(role, Number(snapshot.center?.time ?? snapshot.current), snapshot);
    side.mode = FIELD_SIDE_MODE.HELD;
    side.offset = offset;
    side.adapter?.setRate?.(1);
    side.actualRate = 1;
    onHoldOffsets?.({ [directionFor(role)]: Math.max(0.25, offset || maxOffset(role, snapshot)) });
    publish(snapshot);
  }

  function toggleSide(role) {
    const side = sides[role];
    if (side.mode === FIELD_SIDE_MODE.HELD) stretch(role);
    else hold(role);
  }

  function toggleBoth() {
    const allHeld = ["tail", "lead"].every(role => sides[role].mode === FIELD_SIDE_MODE.HELD);
    if (allHeld) {
      stretch("tail");
      stretch("lead");
      return;
    }
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded) return;
    const center = Number(snapshot.center?.time ?? snapshot.current);
    const offsets = {
      backward: Math.max(0.25, measuredOffset("tail", center, snapshot) || maxOffset("tail", snapshot)),
      forward: Math.max(0.25, measuredOffset("lead", center, snapshot) || maxOffset("lead", snapshot))
    };
    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = offsets[directionFor(role)];
      side.adapter?.setRate?.(1);
      side.actualRate = 1;
    }
    onHoldOffsets?.(offsets);
    publish(snapshot);
  }

  function driveSide(role, center, snapshot, centerPlaying) {
    const side = sides[role];
    const prefs = preferences();
    const visible = prefs[`${role}Visible`];
    const maximum = maxOffset(role, snapshot);
    if (!visible || !side.ready || side.error || maximum <= EPSILON) {
      pauseSide(side);
      return { available: false, held: false, offset: 0 };
    }

    const offset = measuredOffset(role, center, snapshot);
    side.offset = offset;
    if (!centerPlaying) {
      pauseSide(side);
      return { available: true, held: side.mode === FIELD_SIDE_MODE.HELD, offset };
    }

    if (side.mode === FIELD_SIDE_MODE.HELD) {
      side.adapter?.setRate?.(1);
      side.actualRate = 1;
      ensureSidePlaying(side);
      const exact = exactAddress(role, center, offset, snapshot.range);
      const actual = readSide(side).time;
      if (Math.abs(actual - exact) > DRIFT_TOLERANCE) {
        seekPlayingSide(side, exact);
        ensureSidePlaying(side);
      }
      return { available: true, held: true, offset };
    }

    // Prime at 1× first. Directional capability is only trusted after the side
    // player has actually entered playback and exposed its own rate list.
    ensureSidePlaying(side);
    const sideState = readSide(side).state;
    if ([YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(sideState)) {
      populateRateControl(role, prefs);
      requestStretchRate(side);
    }
    const nextOffset = measuredOffset(role, center, snapshot);
    side.offset = nextOffset;
    if (nextOffset >= maximum - REACH_TOLERANCE) {
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = maximum;
      seekPlayingSide(side, exactAddress(role, center, maximum, snapshot.range));
      side.adapter?.setRate?.(1);
      side.actualRate = 1;
      ensureSidePlaying(side);
      return { available: true, held: true, offset: maximum };
    }
    return { available: true, held: false, offset: nextOffset };
  }

  function selectSide(role) {
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded) return;
    const side = sides[role];
    const measured = measuredOffset(role, Number(snapshot.center?.time ?? snapshot.current), snapshot);
    const distance = measured > REACH_TOLERANCE ? measured : maxOffset(role, snapshot);
    if (!(distance > EPSILON)) return;
    onSelect?.({
      role,
      direction: directionFor(role),
      mode: "step",
      distance,
      offset: measured,
      target: maxOffset(role, snapshot),
      address: exactAddress(role, snapshot.current, distance, snapshot.range)
    });
  }

  function formatOffset(value) {
    if (!Number.isFinite(value)) return "—";
    const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
    return `${rounded}s`;
  }

  function sideMeta(role, sideState, target) {
    const side = sides[role];
    if (runtime.suspended) return "Context suspended";
    if (side.playback === "blocked") return "Playback blocked";
    if (side.error) return "Player unavailable";
    if (!side.rateAvailable && side.mode === FIELD_SIDE_MODE.STRETCHING) return "Directional rate unavailable";
    const prefix = role === "tail" ? "−" : "+";
    const state = side.mode === FIELD_SIDE_MODE.HELD ? "Held" : "Stretching";
    return `${prefix}${formatOffset(sideState.offset)} / ${formatOffset(target.distance)} · ${state} · ${side.actualRate}×`;
  }

  function publish(snapshot = getSnapshot?.(), live = null, sideStates = null) {
    if (!snapshot?.range) return null;
    const prefs = preferences();
    const center = clamp(Number(snapshot.center?.time ?? snapshot.current ?? 0), snapshot.range.start, snapshot.range.end);
    const targets = live || deriveStepField(center, snapshotReach(snapshot), snapshot.range);
    const states = sideStates || {
      tail: { available: targets.tail.available, held: sides.tail.mode === FIELD_SIDE_MODE.HELD, offset: measuredOffset("tail", center, snapshot) },
      lead: { available: targets.lead.available, held: sides.lead.mode === FIELD_SIDE_MODE.HELD, offset: measuredOffset("lead", center, snapshot) }
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
      observed[role].mode = sides[role].mode;
      observed[role].requestedRate = Number(prefs[`${role}Rate`]);
      observed[role].actualRate = sides[role].actualRate;
      observed[role].playback = sides[role].playback;
      observed[role].rateAvailable = sides[role].rateAvailable;
      observed[role].offset = states[role].offset;
      observed[role].targetDistance = targets[role].distance;
    }
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

  function render(snapshot = getSnapshot?.(), field = runtime.field, sideStates = null) {
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
      const nextAction = side.mode === FIELD_SIDE_MODE.HELD ? "Stretch" : "Hold";
      setText(elements[`${role}-field-toggle-label`], nextAction);
      setText(elements[`${role}-offset-state`], `${formatOffset(actual)} / ${formatOffset(target)}`);
      elements[`${role}-field-toggle`]?.setAttribute?.("aria-pressed", String(side.mode === FIELD_SIDE_MODE.HELD));
      if (elements[`${role}-field-toggle`]) elements[`${role}-field-toggle`].disabled = !shown || !prefs[`${role}Visible`];
      if (elements[`${role}-step-button`]) {
        elements[`${role}-step-button`].disabled = !shown || !prefs[`${role}Visible`] || !(target > EPSILON);
      }
      setText(elements[`${role}-meta`], !loaded ? "—" : sideMeta(role, { offset: actual }, { distance: target }));
    }

    const bothHeld = sides.tail.mode === FIELD_SIDE_MODE.HELD && sides.lead.mode === FIELD_SIDE_MODE.HELD;
    setText(elements["field-both-toggle-label"], bothHeld ? "Stretch both" : "Hold both");
    elements["field-both-toggle"]?.setAttribute?.("aria-pressed", String(bothHeld));
    if (elements["field-both-toggle"]) elements["field-both-toggle"].disabled = !shown;
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
    // Make the side panes measurable before YT.Player replaces their host divs.
    // Creating them under `.field-off { display:none }` gives YouTube a zero-size
    // embed and violates the API's minimum player viewport contract.
    render(snapshot);
    if (snapshot.videoLoaded) ensurePlayers(prefs);
    syncVideo(snapshot);
    populateRateControl("tail", prefs);
    populateRateControl("lead", prefs);

    if (!snapshot.videoLoaded || !snapshot.videoId) {
      pauseSides();
      runtime.phase = prefs.stepFieldEnabled ? STEP_FIELD_PHASE.COINCIDENT : STEP_FIELD_PHASE.OFF;
      runtime.semanticCurrent = snapshot.current || 0;
      publish(snapshot);
      return;
    }

    if (runtime.forceEstablish || runtime.structuralKey !== structuralKey(snapshot)) {
      establish(snapshot, snapshot.current);
    } else if (Math.abs((runtime.semanticCurrent ?? snapshot.current) - snapshot.current) > EPSILON) {
      translateToCurrent(snapshot.current, { preserve: true });
    }

    if (!prefs.stepFieldEnabled || (!prefs.tailVisible && !prefs.leadVisible)) {
      pauseSides();
      runtime.phase = STEP_FIELD_PHASE.OFF;
      runtime.suspended = false;
      publish(snapshot);
      return;
    }

    runtime.suspended = fieldShouldSuspend(snapshot) || Boolean(document?.hidden);
    const center = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
    const centerPlaying = !runtime.suspended
      && snapshot.center?.state === YOUTUBE_STATE.PLAYING;
    const live = deriveStepField(center, snapshotReach(snapshot), snapshot.range);

    if (runtime.suspended) pauseSides();
    const sideStates = {
      tail: driveSide("tail", center, snapshot, centerPlaying),
      lead: driveSide("lead", center, snapshot, centerPlaying)
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
    publish(snapshot, live, sideStates);
  }

  function syncVideo(snapshot) {
    if (!snapshot.videoLoaded || !snapshot.videoId) return;
    for (const side of Object.values(sides)) {
      if (!side.ready || side.videoId === snapshot.videoId) continue;
      side.videoId = snapshot.videoId;
      side.error = false;
      side.playback = "idle";
      side.actualRate = 1;
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = 0;
      side.adapter.mute?.();
      runtime.forceEstablish = true;
    }
  }

  function invalidate() {
    pauseSides();
    runtime.structuralKey = null;
    runtime.semanticCurrent = null;
    runtime.lastCenterTime = null;
    runtime.forceEstablish = true;
    runtime.suspended = false;
    runtime.field = null;
    runtime.fieldKey = "";
    onChange?.(null);
  }

  bind();
  render(getSnapshot?.());

  return {
    tick,
    render,
    pause: pauseSides,
    invalidate,
    translateToCurrent,
    translatePhysicalCenter,
    hold(role = "both") {
      if (role === "both") {
        hold("tail");
        hold("lead");
      } else hold(role);
    },
    stretch(role = "both") {
      if (role === "both") {
        stretch("tail");
        stretch("lead");
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
