// Step Field execution controller. Tail and Lead are muted physical projections of Session state.
// Session owns semantic Current/Interval. This controller owns only physical Tail/Lead players,
// Field Frame placement, the slideshow transition lifecycle, the cycling runtime, boundary
// synchronization, Hold, and stale-event rejection. It imports neither operator arithmetic nor
// Guide topology.
import { EPSILON, clamp } from "./range-geometry.js";
import { playbackAllowsPanorama } from "./transport.js";
import { YOUTUBE_STATE, createYouTubePlayer, isYouTubeApiReady } from "./youtube.js";
import {
  FIELD_FRAME_OWNER,
  FIELD_FRAME_DIRECTION,
  FIELD_FRAME_ACTIVATION,
  classifyDirection,
  directFrame
} from "./panorama-frame.js";
import {
  PANORAMA_STATE,
  FIELD_REACH_TOLERANCE,
  PANORAMA_DIRECTION,
  PANORAMA_SIDE_RATE_STEPS,
  DEFAULT_PANORAMA_CYCLE,
  normalizePanoramaCycle,
  panoramaSideRates,
  panoramaSideRate,
  effectiveCycleBounds,
  createPanoramaCycle,
  advanceCycle,
  holdCycle,
  resumeCycle,
  rebasePanoramaCycle,
  restartPanoramaCycle,
  deriveFieldBounds,
  derivePanorama,
  normalizeFieldReach,
  chooseNearestRate,
  hasCenterDiscontinuity,
  resolveFieldPhase,
  deriveObservedField
} from "./panorama-geometry.js";

export {
  PANORAMA_STATE,
  DEFAULT_PANORAMA_CYCLE,
  PANORAMA_DIRECTION,
  PANORAMA_SIDE_RATE_STEPS,
  normalizePanoramaCycle,
  panoramaSideRates,
  deriveFieldBounds,
  derivePanorama,
  normalizeFieldReach,
  chooseNearestRate,
  resolveFieldPhase,
  deriveObservedField
} from "./panorama-geometry.js";

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
// One directional slideshow transition. The semantic commit never waits for it.
export const FIELD_TRANSITION_MS = 260;

function defaultPreferences() {
  return {
    panoramaEnabled: true,
    tailVisible: true,
    leadVisible: true,
    reducedMotion: false,
    sideRateStep: DEFAULT_PANORAMA_CYCLE.rate
  };
}

function snapshotReach(snapshot) {
  return normalizeFieldReach(snapshot?.stepReach);
}

// The configured cycling relation. A snapshot without an explicit Field
// Cycle still describes one: its outer offset is the legacy configured Offset
// and its inner offset is a proportional fraction of it.
function snapshotCycle(snapshot) {
  if (snapshot?.panoramaCycle) return normalizePanoramaCycle(snapshot.panoramaCycle);
  const reach = snapshotReach(snapshot);
  const outer = Math.max(reach.backward, reach.forward);
  return normalizePanoramaCycle({
    inner: Math.max(EPSILON, outer / 4),
    outer,
    rate: DEFAULT_PANORAMA_CYCLE.rate
  });
}

function snapshotCenterRate(snapshot) {
  const rate = Number(snapshot?.center?.rate);
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
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
    // Tail and Lead hold their relation to Center by sitting one playback-rate
    // rung either side of it, so the Panorama runs at any Center rate that has
    // both neighbours on the adapter's ladder -- not only at 1x. Where a
    // neighbour is missing, or Center is at an end of the ladder, there is no
    // symmetric triplet and Center plays alone. Stated here so it stays
    // suspended for as long as that holds rather than being paused once and
    // resuming on the next tick.
    || (transportKind === "playback"
      && (snapshot?.transport
        ? !playbackAllowsPanorama(snapshot.transport, {
          offeredRates: snapshot?.availableRates
        })
        : (snapshot?.transportRate ?? 1) !== 1 || snapshot?.transportDynamic === true))
  );
}

export function fieldPreferenceRequiresEstablish(patch) {
  return patch?.panoramaEnabled === true
    || patch?.tailVisible === true
    || patch?.leadVisible === true;
}

export function createPanoramaController({
  document,
  getSnapshot,
  getPreferences = defaultPreferences,
  setPreferences = () => {},
  onChange = () => {},
  formatTime = value => String(value),
  createPlayer = createYouTubePlayer,
  // The cycle is measured against the wall clock, so the clock is a dependency
  // like every other. A suite that needs a deterministic cycle supplies its own.
  now = () => Date.now()
}) {
  const ids = [
    "panorama", "panorama-toggle", "panorama-meta",
    "tail-pane", "tail-meta", "tail-player-surface", "tail-collapse", "tail-restore",
    "lead-pane", "lead-meta", "lead-player-surface", "lead-collapse", "lead-restore",
    "center-meta", "tail-offset-state", "lead-offset-state",
    "field-both-toggle", "field-both-toggle-label", "field-transport-state", "field-rate-state",
    "field-span-label", "field-cycle-rate"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, document?.getElementById?.(id) || null]));

  const sides = {
    tail: createSideState("tail", "player-tail"),
    lead: createSideState("lead", "player-lead")
  };

  const runtime = {
    phase: PANORAMA_STATE.OFF,
    structuralKey: null,
    semanticCurrent: null,
    lastCenterTime: null,
    centerWasRunning: false,
    forceEstablish: true,
    restoreRoles: new Set(),
    suspended: false,
    preview: null,
    field: null,
    fieldKey: "",
    // Cycling runtime. Held until a genuine Center playback gesture begins.
    cycle: createPanoramaCycle(DEFAULT_PANORAMA_CYCLE),
    // Field Frame placement and its one directional transition. The generation
    // token discards player callbacks belonging to a superseded Frame.
    frame: null,
    frameIdentity: null,
    frameGeneration: 0,
    transition: { direction: FIELD_FRAME_DIRECTION.NONE, generation: 0, at: 0 },
    transitionTimer: null
  };

  function createSideState(role, elementId) {
    return {
      role,
      elementId,
      requestedRate: 1,
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
      configuredOffset: 0,
      beforeStretchOffset: 0,
      desiredAddress: null,
      lastPlacedAddress: null,
      lastPlaceAt: 0,
      waiting: false,
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
    if (before.panoramaEnabled && !after.panoramaEnabled) {
      pauseSides({ freeze: false });
      runtime.phase = PANORAMA_STATE.OFF;
      runtime.centerWasRunning = false;
    } else if (!before.panoramaEnabled && after.panoramaEnabled) {
      for (const role of ["tail", "lead"]) {
        if (after[`${role}Visible`]) {
          runtime.restoreRoles.add(role);
          if (sides[role].error) sides[role].retrySource = true;
        }
      }
    }
    if (fieldPreferenceRequiresEstablish(patch) && patch?.panoramaEnabled === true) {
      runtime.forceEstablish = true;
    }
    publish(getSnapshot?.());
  }

  function directionFor(role) {
    return role === "tail" ? "backward" : "forward";
  }

  // The configured Outer Offset is the Field-level cycling bound. Both sides
  // share it; there is no independent per-side configured Offset.
  function configuredOffset(role, snapshot = getSnapshot?.()) {
    return snapshotCycle(snapshot).outer;
  }

  function effectiveOffset(role, center, snapshot = getSnapshot?.()) {
    const configured = configuredOffset(role, snapshot);
    if (!snapshot?.range) return configured;
    const available = role === "tail"
      ? Math.max(0, center - snapshot.range.start)
      : Math.max(0, snapshot.range.end - center);
    return Math.min(configured, available);
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

  // The application resolves the ambient Frame owner and hands this controller
  // finished source Addresses. Nothing here recomputes an operator target.
  function snapshotFrame(snapshot = getSnapshot?.()) {
    const value = snapshot?.panoramaFrame ?? snapshot?.fieldPreview;
    if (!value || !snapshot?.range) return null;
    const center = clamp(
      Number(value.center),
      snapshot.range.start,
      snapshot.range.end
    );
    const tail = Number(value.tail ?? value.start);
    const lead = Number(value.lead ?? value.end);
    if (
      !Number.isFinite(center)
      || !Number.isFinite(tail)
      || !Number.isFinite(lead)
    ) return null;
    const owner = [
      FIELD_FRAME_OWNER.CONTEXT,
      FIELD_FRAME_OWNER.OPERATOR,
      FIELD_FRAME_OWNER.DIRECT
    ].includes(value.owner)
      ? value.owner
      : value.kind === "context"
        ? FIELD_FRAME_OWNER.CONTEXT
        : FIELD_FRAME_OWNER.OPERATOR;
    return {
      owner,
      kind: value.kind || "step",
      tail: clamp(Math.min(tail, center), snapshot.range.start, center),
      center,
      lead: clamp(Math.max(lead, center), center, snapshot.range.end),
      direction: value.direction || FIELD_FRAME_DIRECTION.NONE,
      revision: Number.isFinite(value.revision) ? value.revision : null,
      outgoing: Number.isFinite(value.outgoing) ? value.outgoing : null,
      activation: value.activation?.kind === FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS
        ? { kind: FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS }
        : null,
      backwardDistance: Number(value.backwardDistance),
      forwardDistance: Number(value.forwardDistance)
    };
  }

  function activeFrame(snapshot = getSnapshot?.()) {
    return runtime.preview || snapshotFrame(snapshot);
  }

  // Retained for the existing call sites that describe a Frame by its extent.
  function activePreview(snapshot = getSnapshot?.()) {
    const frame = activeFrame(snapshot);
    if (!frame) return null;
    return {
      ...frame,
      start: frame.tail,
      end: frame.lead
    };
  }

  function frameIdentityOf(frame) {
    if (!frame) return null;
    return [
      frame.owner,
      frame.kind,
      frame.tail.toFixed(3),
      frame.lead.toFixed(3),
      frame.activation?.kind || "observe"
    ].join("|");
  }

  function fieldIsEnabled(prefs = preferences()) {
    return Boolean(prefs.panoramaEnabled);
  }

  function sideIsVisible(role, prefs = preferences()) {
    return fieldIsEnabled(prefs) && Boolean(prefs[`${role}Visible`]);
  }

  function sideIsTransitioning(role) {
    return runtime.forceEstablish || runtime.restoreRoles.has(role);
  }

  function sideIsOperational(
    role,
    snapshot = getSnapshot?.(),
    prefs = preferences()
  ) {
    const side = sides[role];
    const center = Number(snapshot?.current);
    return Boolean(
      snapshot?.videoLoaded
      && snapshot?.range
      && Number.isFinite(center)
      && sideIsVisible(role, prefs)
      && !sideIsTransitioning(role)
      && sideCanRun(side)
      && side.sourceReady
      && effectiveOffset(role, center, snapshot) > EPSILON
    );
  }

  function controllableRoles(
    snapshot = getSnapshot?.(),
    prefs = preferences()
  ) {
    return ["tail", "lead"].filter(role =>
      sideIsOperational(role, snapshot, prefs)
    );
  }

  function sidePlaybackAllowed(
    role,
    prefs = preferences(),
    snapshot = getSnapshot?.()
  ) {
    const side = sides[role];
    return sideIsVisible(role, prefs)
      && runtime.centerWasRunning
      && !runtime.suspended
      && !suspensionRequired(snapshot)
      && !sideIsTransitioning(role)
      && sideCanRun(side)
      && side.sourceReady
      && side.videoId === snapshot?.videoId;
  }

  function bind() {
    elements["panorama-toggle"]?.addEventListener?.("click", () => {
      const prefs = preferences();
      changePreferences({ panoramaEnabled: !prefs.panoramaEnabled });
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
      changePreferences({ tailVisible: true, panoramaEnabled: true });
    });
    elements["lead-restore"]?.addEventListener?.("click", () => {
      changePreferences({ leadVisible: true, panoramaEnabled: true });
    });
    // One cycling-rate pair, not two conceptually independent side rates.
    elements["field-cycle-rate"]?.addEventListener?.("change", event => {
      changePreferences({ sideRateStep: Number(event.target.value) });
    });
    elements["field-both-toggle"]?.addEventListener?.("click", toggleBoth);
  }

  function createSide(role) {
    const side = sides[role];
    if (side.adapter || !isYouTubeApiReady() || !document?.getElementById?.(side.elementId)) return;
    side.adapter = createPlayer(side.elementId, {
      accessible: false,
      playerVars: { controls: 0, disablekb: 1, fs: 0, playsinline: 1 },
      events: {
        onReady: adapter => {
          side.ready = true;
          side.error = false;
          side.blocked = false;
          adapter.mute?.();
          refreshSideSnapshot(side);
          runtime.forceEstablish = true;
        },
        onStateChange: name => {
          side.playback = name;
          if (name === YOUTUBE_STATE.CUED) {
            side.sourceReady = true;
            // parkSide records the newest desired address before any early
            // return, so a late callback always decodes the current Frame and
            // never replays an obsolete one.
            if (Number.isFinite(side.desiredAddress)) {
              side.adapter?.place?.(side.desiredAddress);
            }
            if (side.pendingPlay && sidePlaybackAllowed(role)) {
              side.adapter?.play?.();
              side.playback = "starting";
            } else {
              side.pendingPlay = false;
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
            populateCycleRateControl(preferences());
            // Delayed iframe events cannot revive a hidden, disabled, suspended,
            // or no-longer-playing projection after its owner has changed.
            if (!sidePlaybackAllowed(role)) {
              side.pendingPlay = false;
              side.adapter?.pause?.();
              side.playback = YOUTUBE_STATE.PAUSED;
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
    if (!prefs.panoramaEnabled) return;
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

  function pauseSide(side, { force = false } = {}) {
    side.pendingPlay = false;
    if (!sideCanRun(side)) return false;
    const alreadyPaused = side.playback === YOUTUBE_STATE.PAUSED
      && Math.abs(side.desiredRate - 1) <= 0.001
      && Math.abs(side.actualRate - 1) <= 0.001;
    if (!force && alreadyPaused) return false;
    side.adapter?.pause?.();
    requestRate(side, 1, true);
    side.desiredRate = 1;
    if (!["blocked", "error"].includes(side.playback)) side.playback = YOUTUBE_STATE.PAUSED;
    return true;
  }

  function parkSide(side, address, { force = false } = {}) {
    if (!sideCanRun(side) || !side.videoId || !Number.isFinite(address)) return false;
    const target = Math.max(0, address);
    const now = Date.now();
    side.desiredAddress = target;
    side.adapter?.mute?.();
    // A parked side is an observation at one Address, not a moving relation.
    // Reset it to neutral playback before placing and pausing it.
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
    return parkSide(
      side,
      exactAddress(
        side.role,
        center,
        side.offset,
        snapshot.range
      ),
      { force }
    );
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
    const prefs = preferences();
    if (!snapshot?.range) {
      for (const side of Object.values(sides)) {
        if (prefs[`${side.role}Visible`]) pauseSide(side);
      }
      return;
    }
    const resolvedCenter = clamp(
      Number.isFinite(center) ? center : Number(snapshot.center?.time ?? snapshot.current),
      snapshot.range.start,
      snapshot.range.end
    );
    for (const side of Object.values(sides)) {
      if (!prefs[`${side.role}Visible`]) continue;
      if (freeze) freezeSideForPause(side, resolvedCenter, snapshot);
      else {
        pauseSide(side);
        parkAtRelation(side, resolvedCenter, snapshot);
      }
    }
  }

  // One combined cycling-rate pair. The configured value is the symmetric
  // fraction of Center rate; the inward phase exchanges the sides without
  // rewriting that relation.
  function populateCycleRateControl(prefs) {
    const select = elements["field-cycle-rate"];
    if (!select) return;
    const current = normalizePanoramaCycle({ rate: prefs.sideRateStep }).rate;
    // A valid saved spread remains an available choice even when it predates or
    // falls between the provided presets. Otherwise assigning `select.value`
    // would leave a real HTML select with no selected option while the Field
    // continued to use the preserved value.
    const steps = PANORAMA_SIDE_RATE_STEPS.some(rate => Math.abs(rate - current) <= EPSILON)
      ? [...PANORAMA_SIDE_RATE_STEPS]
      : [...PANORAMA_SIDE_RATE_STEPS, current].sort((first, second) => first - second);
    const key = steps.join("|");
    if (select.dataset.rates !== key) {
      select.replaceChildren();
      for (const step of steps) {
        const pair = panoramaSideRates(step);
        const option = document.createElement("option");
        option.value = String(step);
        option.textContent = `${pair.tailRate}\u00d7 / ${pair.leadRate}\u00d7`;
        select.appendChild(option);
      }
      select.dataset.rates = key;
    }
    select.value = String(current);
  }

  function establishSide(side, center, snapshot) {
    // A fresh Field is Held at its configured outer offset. Cycling begins at
    // the inner boundary only when Center playback resumes the cycle.
    const bounds = sideCycleBounds(side.role, center, snapshot);
    const offset = bounds.outer;
    side.mode = FIELD_SIDE_MODE.HELD;
    side.offset = offset;
    side.progressOffset = offset;
    side.waiting = false;
    side.configuredOffset = configuredOffset(side.role, snapshot);
    side.beforeStretchOffset = offset;
    runtime.cycle.sides[side.role].offset = offset;
    runtime.cycle.sides[side.role].waiting = false;
    if (sideIsVisible(side.role)) {
      pauseSide(side);
      parkAtRelation(side, center, snapshot, { force: true });
    } else {
      side.pendingPlay = false;
    }
  }

  function establish(snapshot, address = snapshot.current) {
    const center = clamp(address, snapshot.range.start, snapshot.range.end);
    runtime.cycle = rebasePanoramaCycle(
      holdCycle(runtime.cycle, snapshotCycle(snapshot)),
      now(),
      attainedCycleOffset()
    );
    for (const side of Object.values(sides)) establishSide(side, center, snapshot);
    runtime.structuralKey = structuralKey(snapshot);
    runtime.semanticCurrent = center;
    runtime.lastCenterTime = center;
    runtime.centerWasRunning = false;
    runtime.forceEstablish = false;
    runtime.restoreRoles.clear();
    runtime.phase = PANORAMA_STATE.HELD;
  }

  function translateToCurrent(current, { preserve = true } = {}) {
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded || !snapshot.range || !Number.isFinite(current)) return;
    const prefs = preferences();
    const preview = activePreview(snapshot);
    const nextCenter = clamp(current, snapshot.range.start, snapshot.range.end);
    runtime.semanticCurrent = nextCenter;
    runtime.lastCenterTime = nextCenter;
    runtime.centerWasRunning = false;
    for (const side of Object.values(sides)) {
      if (!sideIsVisible(side.role, prefs)) {
        side.pendingPlay = false;
        continue;
      }
      const bounds = sideCycleBounds(side.role, nextCenter, snapshot);
      const retained = side.offset > REACH_TOLERANCE
        ? side.offset
        : side.configuredOffset;
      const offset = preserve ? clamp(retained, 0, bounds.outer) : bounds.outer;
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = offset;
      side.progressOffset = offset;
      side.waiting = false;
      side.configuredOffset = configuredOffset(side.role, snapshot);
      runtime.cycle.sides[side.role].offset = offset;
      runtime.cycle.sides[side.role].waiting = false;
      pauseSide(side);
      if (!preview) {
        parkAtRelation(side, nextCenter, snapshot, { force: true });
      }
    }
    runtime.structuralKey = structuralKey(snapshot);
    runtime.forceEstablish = false;
    runtime.restoreRoles.clear();
    const fieldActive = fieldIsEnabled(prefs)
      && (prefs.tailVisible || prefs.leadVisible);
    runtime.suspended = fieldActive && suspensionRequired(snapshot);
    runtime.phase = !fieldActive
      ? PANORAMA_STATE.OFF
      : runtime.suspended
        ? PANORAMA_STATE.SUSPENDED
        : PANORAMA_STATE.HELD;
    if (preview) renderPreview(snapshot, preview);
    else publish(snapshot);
  }

  // Reconcile the live relation with a newly configured Inner/Outer Offset. A
  // side already following its configured bound follows the new one; a partial
  // relation is preserved and only clamped into the new [x, y] when necessary.
  // Editing configuration never becomes a Hold and never rewrites Session state.
  function reconfigureOffset(role = "both") {
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded || !snapshot.range) return false;
    const roles = role === "both" || !sides[role] ? ["tail", "lead"] : [role];
    const prefs = preferences();
    const preview = activePreview(snapshot);
    const center = clamp(
      Number(snapshot.current),
      snapshot.range.start,
      snapshot.range.end
    );
    if (!Number.isFinite(center)) return false;

    for (const name of roles) {
      const side = sides[name];
      const previousMaximum = Math.min(
        Math.max(0, side.configuredOffset),
        name === "tail"
          ? Math.max(0, center - snapshot.range.start)
          : Math.max(0, snapshot.range.end - center)
      );
      const followedConfiguredTarget = Math.abs(
        side.offset - previousMaximum
      ) <= REACH_TOLERANCE;
      const bounds = sideCycleBounds(name, center, snapshot);
      side.configuredOffset = configuredOffset(name, snapshot);
      const attained = followedConfiguredTarget
        ? bounds.outer
        : clamp(side.offset, Math.min(bounds.inner, bounds.outer), bounds.outer);
      side.offset = attained;
      side.progressOffset = attained;
      side.beforeStretchOffset = clamp(side.beforeStretchOffset, 0, bounds.outer);
      runtime.cycle.sides[name].offset = attained;
      if (side.mode === FIELD_SIDE_MODE.HELD && sideIsVisible(name, prefs) && !preview) {
        pauseSide(side);
        parkAtRelation(side, center, snapshot, { force: true });
      }
    }

    runtime.semanticCurrent = center;
    runtime.structuralKey = structuralKey(snapshot);
    if (preview) renderPreview(snapshot, preview);
    else publish(snapshot);
    return true;
  }

  // Direct manipulation temporarily supplies an exact Field Frame. It never
  // mutates the configured cycling relation or the ambient Frame.
  function previewExtent(config = {}) {
    const snapshot = getSnapshot?.();
    if (!snapshot?.videoLoaded || !snapshot.range) return false;
    const frame = directFrame({
      kind: config.kind,
      start: config.start,
      center: config.center,
      end: config.end,
      range: snapshot.range
    });
    if (!frame) return false;
    runtime.preview = frame;
    renderPreview(snapshot, frame);
    return true;
  }

  // One visual event attached to one semantic movement. The commit has already
  // happened; this only classifies and marks the direction it should read as.
  function beginFrameTransition(frame) {
    const identity = frameIdentityOf(frame);
    if (identity === runtime.frameIdentity) {
      // Context transport moves Center inside a frame it already owns. That is
      // not a reframing and must not trigger another Tail/Lead reassignment.
      runtime.frame = frame;
      return false;
    }
    const previous = runtime.frame;
    const direction = Number.isFinite(frame.outgoing)
      ? classifyDirection(frame.outgoing, frame.center)
      : previous
        ? classifyDirection(previous.center, frame.center)
        : frame.direction || FIELD_FRAME_DIRECTION.NONE;
    runtime.frame = frame;
    runtime.frameIdentity = identity;
    // Repeated same-direction movements coalesce: the generation advances while
    // the visible transition simply continues from where it already is.
    runtime.frameGeneration += 1;
    runtime.transition = {
      direction: direction || FIELD_FRAME_DIRECTION.NONE,
      generation: runtime.frameGeneration,
      at: Date.now()
    };
    if (runtime.transitionTimer !== null) {
      clearTimeout(runtime.transitionTimer);
      runtime.transitionTimer = null;
    }
    if (
      runtime.transition.direction !== FIELD_FRAME_DIRECTION.NONE
      && typeof setTimeout === "function"
    ) {
      const generation = runtime.frameGeneration;
      runtime.transitionTimer = setTimeout(() => {
        runtime.transitionTimer = null;
        if (runtime.frameGeneration !== generation) return;
        runtime.transition = {
          direction: FIELD_FRAME_DIRECTION.NONE,
          generation,
          at: Date.now()
        };
        render(getSnapshot?.(), runtime.field);
      }, FIELD_TRANSITION_MS);
      runtime.transitionTimer?.unref?.();
    }
    return true;
  }

  function renderPreview(
    snapshot = getSnapshot?.(),
    frame = activeFrame(snapshot)
  ) {
    if (!frame || !snapshot?.videoLoaded || !snapshot.range) return null;
    const preview = { ...frame, start: frame.tail, end: frame.lead };
    const prefs = preferences();
    // Immediate semantic transitions can request a Frame before the next
    // polling render. Make the hosts measurable before creating side players.
    if (Object.values(sides).some(side => !side.adapter)) {
      render(snapshot, runtime.field);
    }
    ensurePlayers(prefs);
    beginFrameTransition(frame);
    const addresses = {
      tail: preview.start,
      lead: preview.end
    };
    for (const role of ["tail", "lead"]) {
      if (!sideIsVisible(role, prefs)) continue;
      pauseSide(sides[role]);
      parkSide(sides[role], addresses[role]);
    }
    const hasVisibleField = ["tail", "lead"].some(role =>
      sideIsVisible(role, prefs)
    );
    runtime.suspended = hasVisibleField;
    runtime.phase = hasVisibleField
      ? PANORAMA_STATE.SUSPENDED
      : PANORAMA_STATE.OFF;
    runtime.centerWasRunning = false;
    const reach = {
      backward: Math.max(0, preview.center - preview.start),
      forward: Math.max(0, preview.end - preview.center),
      linked: false
    };
    // A direct-manipulation preview may momentarily collapse onto either
    // endpoint. Step Reach is strictly positive, so keep its geometry contract
    // intact while sideStates below preserve the collapsed side truthfully.
    const targets = derivePanorama(
      preview.center,
      {
        backward: Math.max(reach.backward, EPSILON),
        forward: Math.max(reach.forward, EPSILON),
        linked: false
      },
      snapshot.range
    );
    const sideStates = {
      tail: {
        available: reach.backward > EPSILON,
        held: false,
        offset: reach.backward
      },
      lead: {
        available: reach.forward > EPSILON,
        held: false,
        offset: reach.forward
      }
    };
    return publish(snapshot, targets, sideStates);
  }

  function clearPreview({ restore = true } = {}) {
    if (!runtime.preview) return false;
    runtime.preview = null;
    if (restore) {
      const snapshot = getSnapshot?.();
      if (snapshot?.videoLoaded) {
        translateToCurrent(snapshot.current, { preserve: true });
      }
    }
    return true;
  }

  // Effective cycling bounds for one side, clipped by the room Range leaves it.
  function sideCycleBounds(role, center, snapshot = getSnapshot?.()) {
    return effectiveCycleBounds(
      snapshotCycle(snapshot),
      effectiveOffset(role, center, snapshot)
    );
  }

  // A fresh playback gesture begins the cycle at the inner boundary: x → expand
  // → y → contract → x. The deliberate Stretch control instead resumes from the
  // attained relation and its preserved direction.
  // A fresh leg from the inner offset. This is for genuine discontinuities only
  // -- a native scrub, a Range wrap, or Panorama returning after Center played
  // alone at an extreme rate -- where the sides hold positions that no longer
  // relate to anything on screen. An ordinary Weight bucket change is not one of
  // these and must never arrive here: it keeps its phase and its deadline.
  // What the sides are actually showing, which is what a Hold or a Stretch must
  // continue from. The two are symmetric, so either answers for the pair.
  function attainedCycleOffset() {
    // The side's own offset, not the cycle's mirror of it. Establishing a Field
    // places the sides from Step geometry, which can be much wider than the
    // cycle's inner bound; resuming from the mirror would snap them inward and
    // read as the Field collapsing the moment Stretch was pressed.
    for (const role of ["tail", "lead"]) {
      const offset = sides[role]?.offset;
      if (Number.isFinite(offset) && offset > 0) return offset;
    }
    return null;
  }

  function startCycleCycle(center, snapshot = getSnapshot?.()) {
    const configured = snapshotCycle(snapshot);
    const fresh = restartPanoramaCycle(runtime.cycle, configured, now());
    runtime.cycle = {
      ...fresh,
      held: false,
      sides: Object.fromEntries(["tail", "lead"].map(role => {
        const bounds = sideCycleBounds(role, center, snapshot);
        return [role, { offset: Math.min(bounds.inner, bounds.outer), waiting: false }];
      }))
    };
    return configured;
  }

  // Cycling begins at the inner boundary and expands outward. Tail is always
  // behind Center and Lead always ahead; neither reaches Center.
  function beginStretch(side, center, snapshot, { play = false } = {}) {
    if (!sideCanRun(side)) return false;
    side.beforeStretchOffset = side.offset;
    side.mode = FIELD_SIDE_MODE.STRETCHING;
    const bounds = sideCycleBounds(side.role, center, snapshot);
    const offset = clamp(
      runtime.cycle.sides[side.role].offset > EPSILON
        ? runtime.cycle.sides[side.role].offset
        : bounds.inner,
      Math.min(bounds.inner, bounds.outer),
      bounds.outer
    );
    runtime.cycle.sides[side.role].offset = offset;
    runtime.cycle.sides[side.role].waiting = false;
    side.offset = offset;
    side.progressOffset = offset;
    side.configuredOffset = configuredOffset(side.role, snapshot);
    side.waiting = false;
    side.blocked = false;
    side.adapter?.mute?.();
    // Until the first cycling tick assigns the directional side rate, follow
    // Center exactly so acquiring the Panorama cannot alter the attained offset.
    requestSideRateStep(side, snapshotCenterRate(snapshot), true);

    // The source must already be cued before the trusted play gesture; a cue and
    // play issued together race in the YouTube iframe.
    const address = exactAddress(side.role, center, offset, snapshot.range);
    side.desiredAddress = address;
    side.lastPlacedAddress = address;
    side.lastPlaceAt = Date.now();
    side.pendingPlay = Boolean(play);
    if (side.sourceReady) {
      side.adapter?.place?.(address);
    } else if (side.playback !== "loading") {
      side.playback = "loading";
      side.adapter?.cue?.(side.videoId, address);
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
    if (!snapshot?.videoLoaded || !prefs.panoramaEnabled || suspendedNow) {
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
    runtime.centerWasRunning = true;
    // Ordinary playback hands presentation to the Field Cycle. Preview and
    // Cycle are mutually exclusive presentation owners. A fresh play gesture
    // starts the cycle at the inner boundary and expands outward.
    runtime.preview = null;
    startCycleCycle(center, snapshot);
    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      if (
        !sideIsVisible(role, prefs)
        || !sideCanRun(side)
        || effectiveOffset(role, center, snapshot) <= EPSILON
      ) continue;
      started[role] = beginStretch(side, center, snapshot, { play: true });
    }
    runtime.semanticCurrent = semanticAddress(snapshot, center);
    runtime.lastCenterTime = center;
    runtime.centerWasRunning = true;
    publish(snapshot);
    return started;
  }

  // An internal proper-Range wrap continues an existing Field relation. Rebase each
  // side around the wrapped Center, retain its mode/offset, and resume without
  // performing the fresh refold owned by ordinary Play.
  function resumeAt(options = {}) {
    const snapshot = getSnapshot?.();
    const prefs = preferences();
    const suspendedNow = suspensionRequired(snapshot);
    if (!snapshot?.videoLoaded || !prefs.panoramaEnabled || suspendedNow) {
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
    const centerRate = snapshotCenterRate(snapshot);
    runtime.centerWasRunning = true;
    // Panorama is returning after being unavailable -- Center played alone at an
    // extreme rate, or the adapter only just confirmed a rate the sides can sit
    // either side of. The sides hold offsets from before or during that stretch
    // which no longer describe anything, so the leg restarts at the inner offset
    // rather than restoring a stale relation. This is the one resumption that
    // discards phase; an ordinary Weight-bucket change never reaches here.
    startCycleCycle(center, snapshot);

    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      if (!sideIsVisible(role, prefs) || !sideCanRun(side)) continue;
      const maximum = effectiveOffset(role, center, snapshot);
      if (!(maximum > EPSILON)) {
        pauseSide(side);
        continue;
      }

      side.offset = clamp(side.offset, 0, maximum);
      side.progressOffset = clamp(side.progressOffset, side.offset, maximum);
      side.configuredOffset = configuredOffset(role, snapshot);
      side.desiredAddress = exactAddress(
        role,
        center,
        side.offset,
        snapshot.range
      );
      side.adapter?.mute?.();
      side.adapter?.place?.(side.desiredAddress);
      // Resuming after a wrap continues the preserved cycling phase. The
      // outward pair is only correct while expanding; a contracting Field needs
      // the exchanged rates immediately, not one controller tick later.
      if (side.mode === FIELD_SIDE_MODE.STRETCHING) {
        requestSideRateStep(side, panoramaSideRate({
          role,
          phase: runtime.cycle.phase,
          rate: snapshotCycle(snapshot).rate,
          waiting: runtime.cycle.sides[role].waiting,
          held: runtime.cycle.held,
          centerRate
        }), true);
      } else {
        requestSideRateStep(side, centerRate, true);
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
    if (!prefs.panoramaEnabled) return { ready: true, pending: [], available: {} };
    const snapshot = getSnapshot?.();
    const center = Number(snapshot?.current);
    const visible = ["tail", "lead"].filter(role =>
      sideIsVisible(role, prefs)
      && Number.isFinite(center)
      && effectiveOffset(role, center, snapshot) > EPSILON
    );
    const sourceId = snapshot?.videoId || null;
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

  // Cycling is one coordinated Field relation, so Stretch resumes the cycle on
  // every operational side at once. A dormant side is simply not an operand.
  function stretch(role = "both") {
    const snapshot = getSnapshot?.();
    const suspendedNow = suspensionRequired(snapshot);
    if (suspendedNow || !snapshot?.range) return;
    const roles = role === "both"
      ? controllableRoles(snapshot)
      : sideIsOperational(role, snapshot) ? [role] : [];
    if (!roles.length) return;
    const center = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
    const centerRunning = [YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(snapshot.center?.state);
    if (centerRunning) runtime.centerWasRunning = true;
    // Stretch resumes from the attained relation and the preserved direction, so
    // the leg is rebased onto the offset actually on screen rather than onto
    // where an unheld cycle would have arrived while it was held.
    runtime.cycle = rebasePanoramaCycle(
      resumeCycle(runtime.cycle, snapshotCycle(snapshot)),
      now(),
      attainedCycleOffset()
    );
    for (const name of roles) {
      beginStretch(sides[name], center, snapshot, { play: centerRunning && !suspendedNow });
    }
    publish(snapshot);
  }

  function measuredOffset(side, center, snapshot) {
    const maximum = effectiveOffset(side.role, center, snapshot);
    const observed = refreshSideSnapshot(side);
    if (!Number.isFinite(observed.time)) return clamp(side.progressOffset, 0, maximum);
    const measured = offsetFromAddress(
      side.role,
      center,
      observed.time,
      maximum
    );
    const plausible = Math.abs(measured - side.progressOffset) <= DIRECT_PLACE_TOLERANCE
      || [YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(observed.state);
    return plausible ? measured : clamp(side.progressOffset, 0, maximum);
  }

  // Hold alone stops the cycling cycle. It preserves each attained offset
  // within [x, y], sets every held side to Center rate, and preserves the
  // cycling direction for later resumption. It writes no Session state.
  function hold(role = "both") {
    const snapshot = getSnapshot?.();
    if (suspensionRequired(snapshot) || !snapshot?.range) return null;
    const roles = role === "both"
      ? controllableRoles(snapshot)
      : sideIsOperational(role, snapshot) ? [role] : [];
    if (!roles.length) return null;
    const center = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
    const centerRate = snapshotCenterRate(snapshot);
    let attained = null;
    for (const name of roles) {
      const side = sides[name];
      const bounds = sideCycleBounds(name, center, snapshot);
      let offset = side.mode === FIELD_SIDE_MODE.STRETCHING
        ? measuredOffset(side, center, snapshot)
        : clamp(side.offset, 0, bounds.outer);
      // Holding an armed-but-not-yet-playing Field keeps its visible relation
      // instead of collapsing the Field onto Center.
      if (
        offset <= REACH_TOLERANCE
        && !runtime.centerWasRunning
        && side.beforeStretchOffset > REACH_TOLERANCE
      ) {
        offset = clamp(side.beforeStretchOffset, 0, bounds.outer);
      }
      offset = clamp(offset, Math.min(bounds.inner, bounds.outer), bounds.outer);
      runtime.cycle.sides[name].offset = offset;
      side.offset = offset;
      side.progressOffset = offset;
      side.configuredOffset = configuredOffset(name, snapshot);
      side.waiting = false;
      if (runtime.centerWasRunning) {
        requestSideRateStep(side, centerRate, true);
      } else {
        requestRate(side, 1, true);
      }
      side.desiredAddress = exactAddress(name, center, offset, snapshot.range);
      if (runtime.centerWasRunning) {
        if (Math.abs(readSide(side).time - side.desiredAddress) > DRIFT_TOLERANCE) {
          side.adapter?.place?.(side.desiredAddress);
        }
        side.adapter?.play?.();
      } else {
        parkSide(side, side.desiredAddress, { force: true });
      }
      attained = attained === null ? offset : attained;
    }
    runtime.cycle = rebasePanoramaCycle(
      holdCycle(runtime.cycle, snapshotCycle(snapshot)),
      now(),
      attainedCycleOffset()
    );
    for (const name of roles) sides[name].mode = FIELD_SIDE_MODE.HELD;
    publish(snapshot);
    return attained;
  }

  function freezeSideForPause(side, center, snapshot) {
    if (!sideCanRun(side)) return;
    const maximum = effectiveOffset(side.role, center, snapshot);
    const observed = refreshSideSnapshot(side);
    let offset = side.offset;
    if ([YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING, YOUTUBE_STATE.PAUSED].includes(observed.state)) {
      const measured = offsetFromAddress(
        side.role,
        center,
        observed.time,
        maximum
      );
      if (measured > REACH_TOLERANCE || side.offset <= REACH_TOLERANCE) offset = measured;
    }
    offset = clamp(offset, 0, maximum);
    side.mode = FIELD_SIDE_MODE.HELD;
    side.offset = offset;
    side.progressOffset = offset;
    side.waiting = false;
    // Native pause freezes the attained cycling relation without changing the
    // configured pair or the direction the cycle would resume in.
    runtime.cycle.sides[side.role].offset = offset;
    runtime.cycle.sides[side.role].waiting = false;
    requestRate(side, 1, true);
    parkAtRelation(side, center, snapshot, { force: true });
  }

  // One combined Stretch/Hold control. Cycling is a coordinated Field
  // relation, so there is no independent per-side Stretch/Hold gesture.
  function toggleBoth() {
    if (suspensionRequired()) return;
    const roles = controllableRoles(getSnapshot?.(), preferences());
    if (!roles.length) return;
    if (runtime.cycle.held) stretch("both");
    else hold("both");
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

  // Cycling rates change with the phase, so the request is a nearest match to
  // the state machine's intent rather than a fixed per-side preference.
  function requestSideRateStep(side, desiredRate, force = false) {
    refreshSideSnapshot(side);
    const rates = [...new Set(side.availableRates || [1])]
      .filter(rate => Number.isFinite(rate) && rate > 0);
    const chosen = rates.length ? chooseNearestRate(rates, desiredRate) : 1;
    // getAvailablePlaybackRates commonly reports only 1× until the iframe has
    // actually entered playback. Unknown is not the same as unsupported.
    side.rateAvailable = !side.ratesKnown
      || Math.abs(chosen - desiredRate) <= 0.001;
    side.requestedRate = desiredRate;
    requestRate(side, chosen, force);
    return chosen;
  }

  // The whole Field cycles as one relation, so the state machine advances once
  // per tick and both sides are placed from its authoritative offsets.
  function driveField(center, centerDelta, snapshot, centerRunning) {
    const prefs = preferences();
    const configured = snapshotCycle(snapshot);
    const participation = Object.fromEntries(["tail", "lead"].map(role => {
      const available = effectiveOffset(role, center, snapshot);
      return [role, {
        operational: Boolean(
          prefs[`${role}Visible`]
          && sideCanRun(sides[role])
          && effectiveCycleBounds(configured, available).operational
        ),
        available
      }];
    }));
    // The cycle is measured against the wall clock, so it opens at the same
    // speed whatever rate Center is playing at, and a tick that never ran costs
    // nothing: the next one derives the offset the phase always intended.
    const advanced = advanceCycle(runtime.cycle, {
      cycle: configured,
      now: now(),
      running: centerRunning,
      centerRate: snapshotCenterRate(snapshot),
      sides: participation
    });
    runtime.cycle = {
      phase: advanced.phase,
      held: advanced.held,
      startedAt: advanced.startedAt,
      startingOffset: advanced.startingOffset,
      offset: advanced.offset,
      sides: {
        tail: {
          offset: advanced.sides.tail.offset,
          waiting: advanced.sides.tail.waiting
        },
        lead: {
          offset: advanced.sides.lead.offset,
          waiting: advanced.sides.lead.waiting
        }
      }
    };
    return Object.fromEntries(["tail", "lead"].map(role => [
      role,
      driveSide(role, center, snapshot, centerRunning, advanced.sides[role], participation[role])
    ]));
  }

  function driveSide(role, center, snapshot, centerRunning, cycleSide, participation) {
    const side = sides[role];
    const prefs = preferences();
    if (!prefs[`${role}Visible`] || !sideCanRun(side)) {
      pauseSide(side);
      return { available: false, held: false, offset: 0 };
    }
    if (!participation.operational) {
      // The side cannot preserve the configured inner offset, so it does not
      // cycle and takes no part in the barrier. It still shows the frame the
      // remaining room allows rather than collapsing onto Center.
      const parked = Math.max(0, cycleSide.bounds.parked ?? 0);
      side.mode = FIELD_SIDE_MODE.HELD;
      side.offset = parked;
      side.progressOffset = parked;
      side.waiting = false;
      side.configuredOffset = configuredOffset(role, snapshot);
      runtime.cycle.sides[role].offset = parked;
      pauseSide(side);
      parkSide(side, exactAddress(role, center, parked, snapshot.range));
      return { available: false, held: true, offset: parked };
    }

    side.configuredOffset = configuredOffset(role, snapshot);
    side.waiting = Boolean(cycleSide.waiting);
    side.mode = runtime.cycle.held
      ? FIELD_SIDE_MODE.HELD
      : FIELD_SIDE_MODE.STRETCHING;

    if (!centerRunning) {
      stabilizeParkedSide(side, center, snapshot);
      return {
        available: true,
        held: side.mode === FIELD_SIDE_MODE.HELD,
        offset: side.offset
      };
    }

    ensureSidePlaying(side);
    requestSideRateStep(side, cycleSide.rate);
    // The pure state machine owns the offset; the physical side is corrected
    // toward it, so a missing directional rate degrades to placement instead of
    // leaving the relation stuck at a boundary.
    const offset = clamp(cycleSide.offset, 0, cycleSide.bounds.outer);
    side.offset = offset;
    side.progressOffset = offset;
    const desired = exactAddress(role, center, offset, snapshot.range);
    side.desiredAddress = desired;
    correctRunningSide(side, desired);
    return {
      available: true,
      held: runtime.cycle.held || Boolean(cycleSide.waiting),
      offset
    };
  }

  function stepSelection(role) {
    const snapshot = getSnapshot?.();
    const preview = activePreview(snapshot);
    if (preview) {
      if (
        preview.activation?.kind !== FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS
        || !sideIsOperational(role, snapshot)
      ) return null;
      const address = role === "tail" ? preview.start : preview.end;
      const sourceOffset = Math.abs(preview.center - address);
      if (!(sourceOffset > EPSILON)) return null;
      const declaredDistance = role === "tail"
        ? preview.backwardDistance
        : preview.forwardDistance;
      const distance = Number.isFinite(declaredDistance) && declaredDistance > 0
        ? declaredDistance
        : sourceOffset;
      return {
        role,
        direction: directionFor(role),
        mode: "step",
        distance,
        offset: sourceOffset,
        target: distance,
        address
      };
    }
    if (suspensionRequired(snapshot) || !sideIsOperational(role, snapshot)) {
      return null;
    }
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
      address: exactAddress(
        role,
        snapshot.current,
        distance,
        snapshot.range
      )
    };
  }

  function formatOffset(value) {
    if (!Number.isFinite(value)) return "—";
    const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
    return `${rounded}s`;
  }

  function sideMeta(role, snapshot = getSnapshot?.()) {
    const side = sides[role];
    if (activePreview(snapshot) && Number.isFinite(side.desiredAddress)) {
      return formatTime(side.desiredAddress);
    }
    if (runtime.suspended) return "Panorama suspended";
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
    const preview = activePreview(snapshot);
    const center = clamp(
      Number(
        preview?.center
        ?? (runtime.suspended ? snapshot.current : snapshot.center?.time ?? snapshot.current ?? 0)
      ),
      snapshot.range.start,
      snapshot.range.end
    );
    const targets = live || derivePanorama(
      center,
      snapshotReach(snapshot),
      snapshot.range
    );
    const states = sideStates || {
      tail: { available: targets.tail.available, held: sides.tail.mode === FIELD_SIDE_MODE.HELD, offset: sides.tail.offset },
      lead: { available: targets.lead.available, held: sides.lead.mode === FIELD_SIDE_MODE.HELD, offset: sides.lead.offset }
    };
    const observed = deriveObservedField({
      targets,
      phase: runtime.phase,
      centerAddress: center,
      tailAddress: exactAddress(
        "tail",
        center,
        states.tail.offset,
        snapshot.range
      ),
      leadAddress: exactAddress(
        "lead",
        center,
        states.lead.offset,
        snapshot.range
      ),
      tailVisible: sideIsVisible("tail", prefs),
      leadVisible: sideIsVisible("lead", prefs),
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
      enabled: prefs.panoramaEnabled,
      visible: [observed.tail.visible, observed.lead.visible],
      available: [observed.tail.available, observed.lead.available],
      targets: [
        Number(observed.tail.targetDistance.toFixed(2)),
        Number(observed.lead.targetDistance.toFixed(2))
      ],
      constraint: observed.constraint,
      span: [observed.span.available, observed.span.held],
      activation: observed.activation,
      suspended: runtime.suspended,
      preview: preview?.kind || null
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
    if (!snapshot || !elements["panorama"]) return;
    const prefs = preferences();
    const preview = activePreview(snapshot);
    const loaded = Boolean(snapshot.videoLoaded);
    const root = elements["panorama"];
    const shown = loaded && prefs.panoramaEnabled;
    root.classList.toggle("field-off", !shown);
    root.classList.toggle("tail-collapsed", !prefs.tailVisible);
    root.classList.toggle("lead-collapsed", !prefs.leadVisible);
    root.classList.toggle("is-suspended", runtime.suspended);
    root.classList.toggle("is-preview", Boolean(preview));
    root.dataset.phase = runtime.phase;
    // The directional slideshow class is presentation only. Reduced motion
    // settles on the resulting Frame without the travelling transition.
    const transitionDirection = prefs.reducedMotion
      ? FIELD_FRAME_DIRECTION.NONE
      : runtime.transition.direction;
    root.dataset.transition = transitionDirection;
    root.dataset.frameOwner = preview?.owner || "operator";
    root.dataset.frameRevision = String(runtime.frameGeneration);
    root.classList.toggle(
      "is-traversing-forward",
      transitionDirection === FIELD_FRAME_DIRECTION.FORWARD
    );
    root.classList.toggle(
      "is-traversing-backward",
      transitionDirection === FIELD_FRAME_DIRECTION.BACKWARD
    );
    root.classList.toggle("is-cycling", !runtime.cycle.held && !preview);

    elements["tail-pane"]?.classList?.toggle("is-collapsed", !prefs.tailVisible);
    elements["lead-pane"]?.classList?.toggle("is-collapsed", !prefs.leadVisible);
    if (elements["tail-restore"]) elements["tail-restore"].hidden = prefs.tailVisible;
    if (elements["lead-restore"]) elements["lead-restore"].hidden = prefs.leadVisible;
    if (elements["tail-collapse"]) elements["tail-collapse"].hidden = !prefs.tailVisible;
    if (elements["lead-collapse"]) elements["lead-collapse"].hidden = !prefs.leadVisible;

    if (elements["panorama-toggle"]) elements["panorama-toggle"].disabled = !loaded;
    elements["panorama-toggle"]?.setAttribute?.("aria-pressed", String(shown));
    elements["panorama-toggle"]?.setAttribute?.("aria-label", `${shown ? "Hide" : "Show"} Panorama`);
    setText(elements["panorama-meta"], !loaded ? "Load video" : shown ? "On" : "Off");
    setText(
      elements["center-meta"],
      loaded
        ? formatTime(Number(
            preview?.kind === "context"
              ? snapshot.center?.time ?? preview.center
              : preview?.center ?? snapshot.center?.time ?? snapshot.current
          ))
        : "—"
    );

    const configuredCycle = snapshotCycle(snapshot);
    for (const role of ["tail", "lead"]) {
      const side = sides[role];
      const actual = field?.[role]?.offset ?? side.offset;
      const availableDistance = effectiveOffset(role, snapshot.current, snapshot);
      const canStep = Boolean(stepSelection(role));
      setText(
        elements[`${role}-offset-state`],
        `${formatOffset(actual)} in ${formatOffset(configuredCycle.inner)}–${formatOffset(configuredCycle.outer)}`
      );
      const surface = elements[`${role}-player-surface`];
      surface?.setAttribute?.("aria-disabled", String(!canStep));
      if (surface) surface.tabIndex = canStep ? 0 : -1;
      setText(
        elements[`${role}-meta`],
        !loaded
          ? "—"
          : availableDistance <= EPSILON
            ? role === "tail" ? "Range start" : "Range end"
            : sideMeta(role, snapshot)
      );
    }

    const visibleRoles = ["tail", "lead"].filter(role =>
      sideIsVisible(role, prefs)
    );
    const availableRoles = controllableRoles(snapshot, prefs);
    // Cycling is one Field relation, so the combined control reports one state.
    const held = runtime.cycle.held;
    const bothLabel = availableRoles.length === 1
      ? visibleRoles.length === 1 ? "visible side" : "available side"
      : "both";
    setText(elements["field-both-toggle-label"], held ? `Stretch ${bothLabel}` : `Hold ${bothLabel}`);
    elements["field-both-toggle"]?.setAttribute?.("aria-pressed", String(held));
    if (elements["field-both-toggle"]) {
      elements["field-both-toggle"].disabled = runtime.suspended
        || !shown
        || !availableRoles.length;
      elements["field-both-toggle"].setAttribute(
        "aria-label",
        `${held ? "Panorama is held; Stretch" : "Panorama is moving; Hold"} ${bothLabel}`
      );
    }
    const frameLabel = {
      step: "Step",
      refine: "Refine",
      reopen: "Reopen",
      neighborhood: "Resolution",
      go: "Go",
      context: "Context",
      current: "Current",
      pin: "Pin",
      section: "Section"
    }[preview?.kind] || "Step";
    setText(elements["field-transport-state"], preview
      ? `${frameLabel} Frame`
      : runtime.suspended
      ? "Panorama suspended"
      : runtime.cycle.held
        ? "Held"
        : runtime.cycle.phase === PANORAMA_DIRECTION.CONTRACTING
          ? "Cycling in"
          : "Cycling out");
    setText(
      elements["field-rate-state"],
      `Tail ${sides.tail.actualRate}× · Center ${snapshotCenterRate(snapshot)}× · Lead ${sides.lead.actualRate}×`
    );
    setText(elements["field-span-label"], preview
      ? `${formatTime(preview.start)}–${formatTime(preview.end)}`
      : field?.span?.held && field.span.available
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
    populateCycleRateControl(prefs);

    if (!snapshot.videoLoaded || !snapshot.videoId) {
      const idlePhase = fieldIsEnabled(prefs)
        && (prefs.tailVisible || prefs.leadVisible)
        ? PANORAMA_STATE.COINCIDENT
        : PANORAMA_STATE.OFF;
      if (runtime.phase !== idlePhase || runtime.centerWasRunning) {
        pauseSides({ freeze: false });
      }
      runtime.phase = idlePhase;
      runtime.centerWasRunning = false;
      runtime.semanticCurrent = snapshot.current || 0;
      publish(snapshot);
      return;
    }

    if (!fieldIsEnabled(prefs) || (!prefs.tailVisible && !prefs.leadVisible)) {
      if (runtime.phase !== PANORAMA_STATE.OFF || runtime.centerWasRunning) {
        pauseSides({ freeze: false });
      }
      runtime.phase = PANORAMA_STATE.OFF;
      runtime.structuralKey = structuralKey(snapshot);
      runtime.semanticCurrent = snapshot.current;
      runtime.lastCenterTime = snapshot.current;
      runtime.forceEstablish = false;
      runtime.restoreRoles.clear();
      runtime.suspended = false;
      runtime.centerWasRunning = false;
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

    const preview = activePreview(snapshot);
    if (preview) {
      renderPreview(snapshot, preview);
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
    const centerWasRunning = runtime.centerWasRunning;

    if (runtime.suspended) {
      // Context and semantic gestures are Center-only. Preserve the stored Field
      // relation around semantic Current; never remeasure offsets against the
      // transient Context cursor or an in-flight placement.
      pauseSides({ center: snapshot.current, freeze: false });
    } else if (discontinuity) {
      // A native scrub or clock jump starts a fresh cycling cycle at the new
      // Center without creating a semantic Interval here.
      startCycleCycle(center, snapshot);
      for (const role of ["tail", "lead"]) {
        const side = sides[role];
        if (sideIsOperational(role, snapshot, prefs)) {
          beginStretch(side, center, snapshot, { play: true });
        }
      }
    } else if (!centerRunning && centerWasRunning) {
      // Native pause freezes the visible Field once. It does not write Session
      // Interval or Step Reach; the next Play refolds and stretches anew.
      pauseSides({ center, freeze: true });
    }
    runtime.centerWasRunning = centerRunning && !runtime.suspended;

    const relationalCenter = runtime.suspended ? snapshot.current : center;
    const live = derivePanorama(
      relationalCenter,
      snapshotReach(snapshot),
      snapshot.range
    );
    const sideStates = driveField(
      relationalCenter,
      centerDelta,
      snapshot,
      centerRunning && !runtime.suspended
    );
    runtime.phase = runtime.suspended
      ? PANORAMA_STATE.SUSPENDED
      : resolveFieldPhase({
        enabled: prefs.panoramaEnabled,
        suspended: false,
        sides: [
          { ...sideStates.tail, visible: sideIsVisible("tail", prefs) },
          { ...sideStates.lead, visible: sideIsVisible("lead", prefs) }
        ]
      });
    if (!runtime.suspended) runtime.lastCenterTime = center;
    publish(snapshot, live, sideStates);
  }

  function syncVideo(snapshot) {
    if (!snapshot.videoLoaded || !snapshot.videoId) return;
    const prefs = preferences();
    for (const side of Object.values(sides)) {
      if (!sideIsVisible(side.role, prefs)) continue;
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
      side.configuredOffset = configuredOffset(side.role, snapshot);
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
    runtime.frame = null;
    runtime.frameIdentity = null;
    runtime.transition = {
      direction: FIELD_FRAME_DIRECTION.NONE,
      generation: runtime.frameGeneration,
      at: 0
    };
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
    populateCycleRateControl(prefs);
    establish(snapshot, snapshot.current);
    runtime.suspended = suspensionRequired(snapshot);
    runtime.phase = !prefs.panoramaEnabled || (!prefs.tailVisible && !prefs.leadVisible)
      ? PANORAMA_STATE.OFF
      : runtime.suspended
        ? PANORAMA_STATE.SUSPENDED
        : PANORAMA_STATE.HELD;
    const preview = activePreview(snapshot);
    if (preview) renderPreview(snapshot, preview);
    else publish(snapshot);
  }

  bind();
  render(getSnapshot?.());

  return {
    tick,
    render,
    pause(options = {}) {
      pauseSides({ center: options.center, freeze: options.freeze !== false });
      const snapshot = getSnapshot?.();
      runtime.suspended = suspensionRequired(snapshot);
      if (runtime.suspended) runtime.phase = PANORAMA_STATE.SUSPENDED;
      runtime.centerWasRunning = false;
      const preview = activePreview(snapshot);
      if (preview) renderPreview(snapshot, preview);
      else publish(snapshot);
    },
    playFromGesture,
    resumeAt,
    activationState,
    resetAtCurrent,
    resetSources,
    translateToCurrent,
    reconfigureOffset,
    previewExtent,
    clearPreview,
    getStepSelection: stepSelection,
    hold,
    stretch,
    toggleField: toggleBoth,
    cycle() {
      return {
        phase: runtime.cycle.phase,
        held: runtime.cycle.held,
        configured: snapshotCycle(getSnapshot?.()),
        sides: {
          tail: { ...runtime.cycle.sides.tail },
          lead: { ...runtime.cycle.sides.lead }
        }
      };
    },
    frame() {
      return runtime.frame ? { ...runtime.frame } : null;
    },
    transition() {
      return { ...runtime.transition, generation: runtime.frameGeneration };
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
