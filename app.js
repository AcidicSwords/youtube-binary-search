import {
  EPSILON,
  clamp,
  contains,
  midpoint,
  getTargets
} from "./range-geometry.js";
import {
  createGuide,
  getPin,
  sectionsForPin,
  resolveSection,
  previousPin,
  nextPin,
  normalizeGuide,
  migrateStructureV2,
  migrateSavedRegions,
  sanitizeGuide,
  validateGuide
} from "./guide.js";
import {
  MIN_RANGE_SECONDS,
  createSession,
  copy,
  snapshotModel,
  goTo,
  refine as refineSession,
  step as stepSession,
  setStepReach as setSessionStepReach,
  normalizeStepReach,
  reopen as reopenSession,
  setRange as setSessionRange,
  previewRange,
  previewReopen,
  checkpoint,
  focusSection as focusSessionSection,
  leaveSection as leaveSessionSection,
  completeContinue,
  completeSkim,
  reachSkimDestination,
  pinCurrent as pinSessionCurrent,
  saveIntervalAsSection,
  saveExtentAsSection,
  renameGuidePin,
  deleteGuidePin,
  renameGuideSection,
  deleteGuideSection,
  returnState as returnSession
} from "./session.js";
import {
  TRANSPORT_KIND,
  idleTransport,
  isTransportActive,
  isObservationalTransport,
  createContextTransport,
  createLoopTransport,
  createContinueTransport,
  createSkimTransport,
  withTransportPhase,
  desiredSkimRate
} from "./transport.js";
import {
  YOUTUBE_STATE,
  createYouTubePlayer,
  parseYouTubeUrl
} from "./youtube.js";
import { createStepFieldController } from "./step-field.js";
import { createView } from "./view.js";

const STORAGE_V5_PREFIX = "binary-youtube-reader:v5:";
const STORAGE_V4_PREFIX = "binary-youtube-reader:v4:";
const STORAGE_V3_PREFIX = "binary-youtube-reader:v3:";
const STORAGE_V2_PREFIX = "binary-youtube-reader:v2:";
const STORAGE_V1_PREFIX = "binary-youtube-reader:v1:";
const PREFERENCES_KEY = "binary-youtube-reader:preferences:v1";
const POLL_MS = 100;
const STEP_DEBOUNCE_MS = 120;
const STEP_PRESETS = [0.25, 0.5, 1, 2, 3, 5, 10, 15, 30, 60, 120, 300];
const CONTEXT_PRE_ROLL_SECONDS = 1;
const NATIVE_GO_SETTLE_MS = 220;
const TRANSPORT_START_GRACE_MS = 1600;
const METADATA_GRACE_MS = 4000;
const METADATA_RETRY_MS = 150;
const PROGRAMMATIC_PLACEMENT_GRACE_MS = 2000;
const NATIVE_POSITION_TOLERANCE_SECONDS = 0.25;

function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null");
    const legacyStep = Number.isFinite(Number(value?.stepSeconds))
      ? clamp(Number(value.stepSeconds), 0.25, 300)
      : 10;
    return {
      contextSeconds: [0, 3, 5, 10].includes(Number(value?.contextSeconds))
        ? Number(value.contextSeconds)
        : 5,
      stepReach: normalizeStepReach(value?.stepReach ?? legacyStep),
      fieldResponse: {
        tailRate: Number.isFinite(Number(value?.fieldResponse?.tailRate))
          ? Number(value.fieldResponse.tailRate)
          : 0.5,
        leadRate: Number.isFinite(Number(value?.fieldResponse?.leadRate))
          ? Number(value.fieldResponse.leadRate)
          : 2
      },
      stepFieldEnabled: value?.stepFieldEnabled !== false,
      tailVisible: value?.tailVisible !== false,
      leadVisible: value?.leadVisible !== false
    };
  } catch {
    return {
      contextSeconds: 5,
      stepReach: normalizeStepReach(10),
      fieldResponse: { tailRate: 0.5, leadRate: 2 },
      stepFieldEnabled: true,
      tailVisible: true,
      leadVisible: true
    };
  }
}

const preferences = readPreferences();
const state = {
  session: createSession({ stepReach: preferences.stepReach }),
  playerReady: false,
  videoLoaded: false,
  videoId: null,
  playerState: YOUTUBE_STATE.UNSTARTED,
  availableRates: [1],
  transport: idleTransport(),
  pendingStep: null,
  lastStepReachEdited: "forward",
  fieldResponse: { ...preferences.fieldResponse },
  contextSeconds: preferences.contextSeconds,
  stepFieldEnabled: preferences.stepFieldEnabled,
  tailVisible: preferences.tailVisible,
  leadVisible: preferences.leadVisible,
  dragHandle: null,
  rangeDragOrigin: null,
  guideTab: "sections",
  guideOpen: false,
  compactGuide: null,
  guideReturnFocus: null,
  nativeGo: null,
  programmaticPlacement: null,
  guideDialog: null,
  field: null,
  captureExtent: null,
  captureExtentKind: null
};

let player = null;
let stepField = null;
let pendingLoad = null;
let pollTimer = null;
let metadataTimer = null;

function model() {
  return state.session.model;
}

function currentResolution() {
  return model().resolution;
}

function activeRange() {
  return model().range;
}

function currentStepReach() {
  return normalizeStepReach(model()?.stepReach ?? preferences.stepReach);
}

function reachFor(direction) {
  return currentStepReach()[direction];
}

function guide() {
  return model().guide;
}

function currentInterval() {
  return model().interval;
}

function playerSnapshot() {
  return player?.read?.() || {
    time: currentResolution()?.C || 0,
    duration: model().duration || 0,
    rate: 1,
    state: state.playerState,
    availableRates: state.availableRates
  };
}

function safeCurrentTime() {
  const value = playerSnapshot().time;
  return Number.isFinite(value) ? value : currentResolution()?.C || 0;
}

const view = createView({
  document,
  getState: () => state,
  getPlayerTime: safeCurrentTime,
  minRangeSeconds: MIN_RANGE_SECONDS
});
const { elements, formatTime, formatRange, setStatus } = view;

function storageKey(prefix = STORAGE_V5_PREFIX) {
  return `${prefix}${state.videoId}`;
}

function persistGuide() {
  if (!state.videoId) return false;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(guide()));
    return true;
  } catch (error) {
    console.warn("Could not save Guide:", error);
    setStatus("The browser could not save this Guide locally. The change remains available until this page is closed.", true);
    return false;
  }
}

function persistPreferences() {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      contextSeconds: state.contextSeconds,
      stepReach: normalizeStepReach(model()?.stepReach ?? preferences.stepReach),
      fieldResponse: { ...state.fieldResponse },
      stepFieldEnabled: state.stepFieldEnabled,
      tailVisible: state.tailVisible,
      leadVisible: state.leadVisible
    }));
  } catch (error) {
    console.warn("Could not save preferences:", error);
  }
}

function readStoredGuide(duration) {
  if (!state.videoId) return createGuide();
  const candidates = [
    [STORAGE_V5_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V4_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V3_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V2_PREFIX, raw => migrateStructureV2(raw, state.videoId)],
    [STORAGE_V1_PREFIX, raw => migrateSavedRegions(raw, state.videoId)]
  ];

  for (const [prefix, convert] of candidates) {
    try {
      const stored = localStorage.getItem(storageKey(prefix));
      if (!stored) continue;
      const converted = convert(JSON.parse(stored));
      const recovered = sanitizeGuide(converted, state.videoId, duration);
      if (validateGuide(recovered, duration)) return recovered;
    } catch (error) {
      console.warn(`Could not read Guide from ${prefix}`, error);
    }
  }
  return createGuide(state.videoId);
}

function transportIs(kind) {
  return state.transport.kind === kind;
}

function clearNativeGo() {
  if (state.nativeGo?.timer) clearTimeout(state.nativeGo.timer);
  state.nativeGo = null;
}

function clearProgrammaticPlacement() {
  state.programmaticPlacement = null;
}

function placePlayer(address) {
  if (!player || !Number.isFinite(address)) return false;
  const bounded = clamp(address, 0, model().duration);
  state.programmaticPlacement = {
    address: bounded,
    expiresAt: Date.now() + PROGRAMMATIC_PLACEMENT_GRACE_MS
  };
  player.place(bounded);
  // Some adapters update their reported position synchronously. Acknowledging
  // that placement here prevents a subsequent genuine native scrub from being
  // hidden behind an already-completed programmatic-placement grace period.
  const observed = playerSnapshot().time;
  if (
    Number.isFinite(observed)
    && Math.abs(observed - bounded) <= NATIVE_POSITION_TOLERANCE_SECONDS
  ) {
    clearProgrammaticPlacement();
  }
  return true;
}

function programmaticPlacementOwns(position) {
  const pending = state.programmaticPlacement;
  if (!pending) return false;
  if (Math.abs(position - pending.address) <= NATIVE_POSITION_TOLERANCE_SECONDS) {
    clearProgrammaticPlacement();
    return true;
  }
  if (Date.now() <= pending.expiresAt) return true;
  clearProgrammaticPlacement();
  return false;
}

function commitNativeGo(candidate) {
  if (!candidate || state.nativeGo !== candidate) return;
  if (
    !state.videoLoaded
    || isTransportActive(state.transport)
    || state.dragHandle
    || ![YOUTUBE_STATE.PAUSED, YOUTUBE_STATE.CUED].includes(state.playerState)
  ) {
    clearNativeGo();
    return;
  }

  state.nativeGo = null;
  const physical = safeCurrentTime();
  if (Math.abs(physical - candidate.address) > 0.25) {
    scheduleNativeGo(physical);
    return;
  }

  const destination = clamp(physical, activeRange().start, activeRange().end);
  if (Math.abs(destination - currentResolution().C) <= EPSILON) {
    if (Math.abs(physical - destination) > EPSILON) placePlayer(destination);
    view.renderTransport();
    return;
  }

  const result = goTo(state.session, destination, {
    operator: "nativeGo",
    label: "Native Go"
  });
  if (!result.changed) return;
  accept(result, {
    effect: false,
    renderGuide: result.rangeChanged,
    status: Math.abs(destination - physical) > EPSILON
      ? `YouTube’s position was constrained to Range at ${formatTime(destination)}.`
      : `Current followed YouTube’s position to ${formatTime(destination)}.`
  });
  if (Math.abs(destination - physical) > EPSILON) placePlayer(destination);
}

function scheduleNativeGo(address) {
  if (!Number.isFinite(address)) return;
  const bounded = clamp(address, 0, model().duration);
  if (state.nativeGo && Math.abs(state.nativeGo.address - bounded) <= NATIVE_POSITION_TOLERANCE_SECONDS) return;
  clearNativeGo();
  const candidate = { address: bounded, timer: null };
  candidate.timer = window.setTimeout(() => commitNativeGo(candidate), NATIVE_GO_SETTLE_MS);
  state.nativeGo = candidate;
}

function locateAddress(address) {
  if (!player || !Number.isFinite(address)) return;
  clearNativeGo();
  state.transport = idleTransport();
  stepField?.pause();
  player.pause();
  player.setRate(1);
  placePlayer(address);
}

function startContext(anchor) {
  const transport = createContextTransport({
    anchor,
    range: activeRange(),
    seconds: state.contextSeconds,
    preRollSeconds: CONTEXT_PRE_ROLL_SECONDS
  });

  if (transport.kind === TRANSPORT_KIND.IDLE) {
    locateAddress(anchor);
    return;
  }

  state.transport = transport;
  player.setRate(1);
  placePlayer(transport.start);
  if (Math.abs(safeCurrentTime() - transport.start) <= 0.25) transport.enteredWindow = true;
  player.play();
}

function applyPlayerEffect(result, options = {}) {
  if (!state.videoLoaded || !player) return;
  const observe = options.observe !== false;
  const destination = Number.isFinite(result?.place)
    ? result.place
    : result?.interval?.arrival;

  if (
    observe
    && state.contextSeconds > 0
    && !(state.stepFieldEnabled && (state.tailVisible || state.leadVisible))
    && result?.interval?.medium === "direct"
    && Number.isFinite(destination)
  ) {
    startContext(destination);
    return;
  }

  if (Number.isFinite(destination)) locateAddress(destination);
}

function accept(result, options = {}) {
  if (!result?.changed) return false;
  state.session = result.session;
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  if (options.effect !== false) applyPlayerEffect(result, { observe: options.observe });
  if (options.renderGuide || result.guideChanged || result.rangeChanged) view.renderGuide();
  if (options.status && guidePersisted) setStatus(options.status);
  view.render();
  return true;
}

function settleTransport(options = {}) {
  const active = state.transport;
  if (!isTransportActive(active)) return false;

  const restoreObservation = options.restoreObservation !== false;
  const issuePause = options.issuePause !== false;
  const current = clamp(safeCurrentTime(), activeRange().start, activeRange().end);
  state.transport = idleTransport();

  if (issuePause) player.pause();
  stepField?.pause();
  player.setRate(1);

  if (isObservationalTransport(active)) {
    if (restoreObservation && currentResolution()) placePlayer(currentResolution().C);
    view.render();
    return true;
  }

  if (active.kind === TRANSPORT_KIND.CONTINUE) {
    const result = completeContinue(state.session, {
      current,
      departure: active.departure,
      parentNeighborhood: active.parentNeighborhood,
      parentResolutionBasis: active.parentResolutionBasis,
      crossedResolution: active.crossedResolution,
      wrapped: active.wrapped,
      returnModel: active.returnModel,
      label: active.label,
      operator: active.operator || "continue"
    });
    if (result.changed) accept(result, { effect: false, renderGuide: false });
    else view.render();
    return true;
  }

  if (active.kind === TRANSPORT_KIND.SKIM) {
    const result = completeSkim(state.session, {
      current,
      departure: active.departure,
      parentNeighborhood: active.parentNeighborhood,
      parentResolutionBasis: active.parentResolutionBasis,
      returnModel: active.returnModel
    });
    if (result.changed) accept(result, { effect: false, renderGuide: false });
    else view.render();
    return true;
  }

  view.render();
  return true;
}

function sameSpatialModel(first, second) {
  if (!first || !second) return false;
  const sameRange = Math.abs(first.range.start - second.range.start) <= EPSILON
    && Math.abs(first.range.end - second.range.end) <= EPSILON;
  const sameResolution = Math.abs(first.resolution.L - second.resolution.L) <= EPSILON
    && Math.abs(first.resolution.C - second.resolution.C) <= EPSILON
    && Math.abs(first.resolution.R - second.resolution.R) <= EPSILON
    && (first.resolution.level ?? 0) === (second.resolution.level ?? 0)
    && (first.resolutionBasis || "range") === (second.resolutionBasis || "range");
  const firstFocus = first.focus;
  const secondFocus = second.focus;
  const sameFocus = (!firstFocus && !secondFocus) || Boolean(
    firstFocus
    && secondFocus
    && firstFocus.sectionId === secondFocus.sectionId
    && Math.abs(firstFocus.returnRange.start - secondFocus.returnRange.start) <= EPSILON
    && Math.abs(firstFocus.returnRange.end - secondFocus.returnRange.end) <= EPSILON
  );
  return sameRange && sameResolution && sameFocus;
}

function flushPendingStep(options = {}) {
  const pending = state.pendingStep;
  if (!pending) return { flushed: false, cancelled: false };
  clearTimeout(pending.timer);
  state.pendingStep = null;

  if (pending.started && sameSpatialModel(model(), pending.originModel)) {
    state.session = {
      model: pending.originModel,
      history: pending.originHistory
    };
    view.render();
    return { flushed: true, cancelled: true };
  }

  if (options.effect !== false) {
    applyPlayerEffect({
      place: currentResolution().C,
      interval: currentInterval()
    }, { observe: options.observe });
  }
  return { flushed: true, cancelled: false };
}

function settleBeforeAction(options = {}) {
  clearNativeGo();
  view.closePinClusterMenu();
  view.setPreviewAction(null);
  const replacingContext = options.replacingContext === true;
  // A following command supersedes the pending Step's automatic Context. The
  // coalesced semantic Step is retained, but no transient observation is started
  // only to be cancelled by the next command.
  flushPendingStep({ effect: false });
  if (transportIs(TRANSPORT_KIND.CONTEXT) && replacingContext) {
    settleTransport({ restoreObservation: false });
  } else {
    settleTransport();
  }
}

function moveToAddress(destination, options = {}) {
  if (!state.videoLoaded || !Number.isFinite(destination)) return false;
  settleBeforeAction({ replacingContext: true });
  const departure = currentResolution().C;
  const result = goTo(state.session, destination, options);
  if (!result.changed) {
    locateAddress(departure);
    setStatus(`Already at ${formatTime(departure)}.`);
    view.render();
    return false;
  }
  const resolvedDestination = result.destination;
  const baseStatus = options.status
    ? options.status(resolvedDestination, result)
    : `Moved to ${formatTime(resolvedDestination)}.`;
  const scopePrefix = result.leftFocus && result.openedFullVideo
    ? "Left the focused Section and opened Full Video. "
    : result.leftFocus
      ? "Left the focused Section. "
      : result.openedFullVideo
        ? "Opened Full Video. "
        : "";
  return accept(result, {
    renderGuide: result.rangeChanged,
    status: `${scopePrefix}${baseStatus}`
  });
}

function refine(direction) {
  if (!state.videoLoaded) return;
  settleBeforeAction({ replacingContext: true });
  const result = refineSession(state.session, direction);
  if (!result.changed) {
    setStatus(`Cannot Refine ${direction === "backward" ? "Backward" : "Forward"} beyond the current Neighborhood.`);
    return;
  }
  accept(result, {
    status: `Refined ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(result.destination)}.`
  });
}

function reopenFully() {
  if (!state.videoLoaded) return;
  settleBeforeAction();
  const result = reopenSession(state.session);
  if (!result.changed) {
    setStatus("Neighborhood is already open to the full Range.");
    return;
  }
  accept(result, {
    status: `Reopened the Neighborhood to Range while keeping Current at ${formatTime(result.session.model.resolution.C)}.`
  });
}

function returnLastAction() {
  settleBeforeAction();
  const result = returnSession(state.session);
  if (!result.changed) {
    setStatus("There is no preceding state to Return to.");
    return;
  }
  state.session = result.session;
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  persistPreferences();
  stepField?.invalidate();
  locateAddress(currentResolution().C);
  view.renderGuide();
  if (guidePersisted) setStatus(`Returned from ${result.label}.`);
  view.render();
}

function performStep(direction) {
  if (!state.videoLoaded) return;
  if (!state.pendingStep) {
    settleBeforeAction({ replacingContext: true });
    state.pendingStep = {
      departure: currentResolution().C,
      originModel: snapshotModel(model()),
      originHistory: state.session.history,
      timer: null,
      started: false
    };
  }

  const result = stepSession(state.session, direction, reachFor(direction), {
    departure: state.pendingStep.departure,
    originResolution: state.pendingStep.originModel.resolution,
    originResolutionBasis: state.pendingStep.originModel.resolutionBasis,
    amend: state.pendingStep.started
  });
  if (!result.changed) {
    if (!state.pendingStep.started) state.pendingStep = null;
    setStatus(`Step ${direction === "backward" ? "Backward" : "Forward"} is at the Range boundary.`);
    return;
  }
  state.pendingStep.started = true;
  state.session = result.session;

  clearTimeout(state.pendingStep.timer);
  state.pendingStep.timer = window.setTimeout(() => {
    const outcome = flushPendingStep({ observe: true });
    setStatus(
      outcome.cancelled
        ? `Step sequence returned to ${formatTime(currentResolution().C)}; no state was recorded.`
        : `Stepped ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(currentResolution().C)}.`
    );
    view.render();
  }, STEP_DEBOUNCE_MS);
  view.render();
}


function selectFieldSide(selection) {
  if (!state.videoLoaded || !selection || !Number.isFinite(selection.address)) return;
  if (selection.mode === "step") {
    performStep(selection.direction);
    return;
  }
  moveToAddress(selection.address, {
    operator: selection.role === "tail" ? "fieldTail" : "fieldLead",
    label: selection.role === "tail" ? "Go to Tail" : "Go to Lead",
    status: destination => `Current moved to visible ${selection.role === "tail" ? "Tail" : "Lead"} at ${formatTime(destination)}.`
  });
}

function startSkim() {
  if (!state.videoLoaded) return;
  if (transportIs(TRANSPORT_KIND.SKIM)) {
    settleTransport();
    setStatus("Skim stopped.");
    return;
  }

  settleBeforeAction();
  const target = getTargets(currentResolution()).forward;
  if (target === null) {
    setStatus("There is no forward Neighborhood to Skim.");
    return;
  }

  const requestedRate = Number(elements["speed-select"].value || 1);
  const rate = desiredSkimRate(
    { kind: TRANSPORT_KIND.SKIM, maxRate: requestedRate, rate: requestedRate },
    currentResolution().C,
    state.availableRates
  );
  if (!(rate > 1)) {
    setStatus("Skim requires a supported playback rate above 1×.", true);
    view.render();
    return;
  }

  state.transport = createSkimTransport({
    parentNeighborhood: copy(currentResolution()),
    parentResolutionBasis: model().resolutionBasis,
    departure: currentResolution().C,
    target,
    maxRate: rate,
    rate,
    returnModel: snapshotModel(model())
  });
  player.setRate(rate);
  placePlayer(currentResolution().C);
  if (Math.abs(safeCurrentTime() - state.transport.departure) <= 0.25) state.transport.enteredPath = true;
  player.play();
  setStatus(`Skimming at ${rate}× to ${formatTime(target)}.`);
  view.render();
}

function finishSkimDestination() {
  const skim = state.transport;
  if (skim.kind !== TRANSPORT_KIND.SKIM) return;

  const result = reachSkimDestination(state.session, {
    parentNeighborhood: skim.parentNeighborhood,
    parentResolutionBasis: skim.parentResolutionBasis,
    departure: skim.departure,
    destination: skim.target
  });
  if (result.changed) state.session = result.session;

  state.transport = createContinueTransport({
    departure: skim.departure,
    parentNeighborhood: copy(currentResolution()),
    parentResolutionBasis: model().resolutionBasis,
    returnModel: skim.returnModel,
    crossedResolution: false,
    wrapped: false,
    label: "Skim and Continue",
    operator: "skim"
  });
  state.transport.enteredPath = true;
  state.transport = withTransportPhase(state.transport, "playing");
  player.setRate(1);
  setStatus(`Skim reached ${formatTime(skim.target)} and continued at 1×.`);
  view.render();
}

function startContinueSession(playNow = true) {
  if (!state.videoLoaded) return;
  if (playNow) settleBeforeAction();
  else {
    clearNativeGo();
    clearProgrammaticPlacement();
  }

  const current = playNow
    ? currentResolution().C
    : clamp(safeCurrentTime(), activeRange().start, activeRange().end);

  if (!playNow && Math.abs(current - currentResolution().C) > NATIVE_POSITION_TOLERANCE_SECONDS) {
    const direct = goTo(state.session, current, {
      operator: "nativeGo",
      label: "Native Go"
    });
    if (direct.changed) state.session = direct.session;
  }

  state.transport = createContinueTransport({
    departure: current,
    parentNeighborhood: copy(currentResolution()),
    parentResolutionBasis: model().resolutionBasis,
    returnModel: snapshotModel(model()),
    label: "Continue",
    operator: "continue"
  });

  player.setRate(1);
  if (playNow) {
    placePlayer(current);
    if (Math.abs(safeCurrentTime() - current) <= NATIVE_POSITION_TOLERANCE_SECONDS) {
      state.transport.enteredPath = true;
    }
    stepField?.play();
    player.play();
  } else {
    state.transport.enteredPath = true;
    state.transport = withTransportPhase(state.transport, "playing");
    stepField?.play();
  }

  setStatus(`Continuing through Range ${formatRange(activeRange())}.`);
  view.render();
}

function continuePause() {
  if (!state.videoLoaded) return;

  if (transportIs(TRANSPORT_KIND.CONTEXT)) {
    settleTransport();
    setStatus("Context stopped.");
    return;
  }
  if (transportIs(TRANSPORT_KIND.SKIM)) {
    settleTransport();
    setStatus("Skim paused.");
    return;
  }
  if (transportIs(TRANSPORT_KIND.LOOP)) {
    settleTransport();
    setStatus("Loop paused.");
    return;
  }
  if (transportIs(TRANSPORT_KIND.CONTINUE)) {
    settleTransport();
    setStatus("Continue paused.");
    return;
  }

  startContinueSession(true);
}

function startLoopExtent(extent, source = "interval", label = "Interval") {
  if (!extent || !(extent.end - extent.start > EPSILON)) {
    setStatus(`Establish a ${label} before starting Loop.`);
    return;
  }
  if (transportIs(TRANSPORT_KIND.LOOP)) {
    const sameSource = state.transport.source === source;
    settleTransport();
    if (sameSource) {
      setStatus("Loop stopped.");
      return;
    }
  }

  settleBeforeAction();
  state.transport = createLoopTransport({
    anchor: currentResolution().C,
    start: extent.start,
    end: extent.end,
    source
  });
  player.setRate(1);
  placePlayer(extent.start);
  if (Math.abs(safeCurrentTime() - extent.start) <= 0.25) state.transport.enteredWindow = true;
  player.play();
  setStatus(`Looping ${label} ${formatRange(extent)}.`);
  view.render();
}

function startLoop() {
  startLoopExtent(currentInterval(), "interval", "Interval");
}

function heldFieldSpan() {
  const span = state.field?.span;
  return span?.held && span.available ? { start: span.start, end: span.end } : null;
}

function startFieldSpanLoop() {
  startLoopExtent(heldFieldSpan(), "field-span", "Field Span");
}

function setRange(start, end, current, label, status) {
  settleBeforeAction();
  const result = setSessionRange(state.session, start, end, current, label);
  if (!result.changed) {
    if (result.reason === "unchanged-range") setStatus("Range is already set to those boundaries.");
    else setStatus("Range must remain within the video and have positive duration.", true);
    return false;
  }
  return accept(result, { renderGuide: true, status, observe: false });
}

function focusSection(sectionId) {
  settleBeforeAction();
  const section = resolveSection(guide(), sectionId);
  if (!section) return;
  const result = focusSessionSection(state.session, sectionId);
  if (!result.changed) {
    setStatus(`“${section.label}” is already the active Range.`);
    return;
  }
  accept(result, { renderGuide: true, status: `Focused “${section.label}” as Range.` });
  closeCompactGuideAfterSelection();
}

function leaveSection() {
  settleBeforeAction();
  const result = leaveSessionSection(state.session);
  if (!result.changed) return;
  accept(result, {
    renderGuide: true,
    observe: false,
    status: `Restored Range ${formatRange(result.session.model.range)}.`
  });
}

function pinCurrent() {
  settleBeforeAction();
  const result = pinSessionCurrent(state.session);
  if (!result.changed) {
    const pin = result.value?.pin;
    setStatus(pin ? `Current is already pinned at ${formatTime(pin.t)}.` : "Current is already pinned.");
    return;
  }
  const { pin } = result.value;
  accept(result, {
    renderGuide: true,
    status: `Pinned Current at ${formatTime(pin.t)}.`
  });
}

function saveCurrentIntervalAsSection(event = null) {
  event?.preventDefault?.();
  const label = elements["section-label"].value.trim();
  const extent = state.captureExtent || currentInterval();
  const kind = state.captureExtentKind || "interval";
  if (!extent) return setStatus("Establish an Extent before saving a Section.", true);
  if (!label) return setStatus("A Section requires a title.", true);
  settleBeforeAction();
  const result = kind === "interval"
    ? saveIntervalAsSection(state.session, label)
    : saveExtentAsSection(state.session, extent, label, "field-span");
  if (!result.changed) {
    setStatus(
      result.reason === "duplicate-section"
        ? `Section “${label}” already exists for this Extent.`
        : "The Section could not be saved.",
      result.reason !== "duplicate-section"
    );
    return;
  }
  accept(result, { renderGuide: true, status: `Saved Section “${label}”.` });
  elements["section-label"].value = "";
  closeSectionCapture();
  selectGuideTab("sections");
  if (!compactGuideLayout()) openGuide("sections");
}

function guideDialogOpen() {
  const dialog = elements["guide-dialog"];
  return dialog.open === true || dialog.hidden === false && dialog.dataset.fallbackOpen === "true";
}

function closeGuideDialog({ restoreFocus = true } = {}) {
  const dialog = elements["guide-dialog"];
  const trigger = state.guideDialog?.trigger || null;
  state.guideDialog = null;
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  dialog.open = false;
  dialog.dataset.fallbackOpen = "false";
  dialog.hidden = true;
  if (restoreFocus && trigger?.isConnected !== false) trigger?.focus?.({ preventScroll: true });
}

function openGuideDialog(config) {
  const dialog = elements["guide-dialog"];
  const input = elements["guide-dialog-input"];
  state.guideDialog = { ...config, trigger: document.activeElement };
  elements["guide-dialog-title"].textContent = config.title;
  elements["guide-dialog-message"].textContent = config.message || "";
  elements["guide-dialog-message"].hidden = !config.message;
  elements["guide-dialog-label"].hidden = !config.showInput;
  input.hidden = !config.showInput;
  input.required = Boolean(config.showInput);
  input.value = config.value || "";
  elements["guide-dialog-confirm"].textContent = config.confirmLabel || "Save";
  elements["guide-dialog-confirm"].classList.toggle("danger-action", config.danger === true);
  elements["guide-dialog-confirm"].classList.toggle("primary", config.danger !== true);
  dialog.hidden = false;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else {
    dialog.open = true;
    dialog.dataset.fallbackOpen = "true";
  }
  (config.showInput ? input : elements["guide-dialog-confirm"]).focus?.();
}

function renamePinById(pinId) {
  const pin = getPin(guide(), pinId);
  if (!pin) return;
  openGuideDialog({
    action: "rename-pin",
    id: pinId,
    title: "Rename Pin",
    showInput: true,
    value: pin.label || "",
    confirmLabel: "Save"
  });
}

function deletePinById(pinId) {
  const pin = getPin(guide(), pinId);
  if (!pin) return;
  const references = sectionsForPin(guide(), pinId).length;
  if (references) {
    setStatus(`This Pin is used by ${references} Section${references === 1 ? "" : "s"}. Delete those Sections first.`, true);
    return;
  }
  openGuideDialog({
    action: "delete-pin",
    id: pinId,
    title: "Delete Pin",
    message: `Delete “${pin.label || formatTime(pin.t)}”? This can be restored only with Return.`,
    showInput: false,
    confirmLabel: "Delete",
    danger: true
  });
}

function renameSectionById(sectionId) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return;
  openGuideDialog({
    action: "rename-section",
    id: sectionId,
    title: "Rename Section",
    showInput: true,
    value: section.label,
    confirmLabel: "Save"
  });
}

function deleteSectionById(sectionId) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return;
  openGuideDialog({
    action: "delete-section",
    id: sectionId,
    title: "Delete Section",
    message: `Delete “${section.label}”? Unshared endpoint Pins will also be removed.`,
    showInput: false,
    confirmLabel: "Delete",
    danger: true
  });
}

function findGuideAction(container, datasetKey, id) {
  const stack = [...(container?.children || [])];
  while (stack.length) {
    const node = stack.shift();
    if (node?.dataset?.[datasetKey] === id) return node;
    stack.push(...(node?.children || []));
  }
  return null;
}

function restoreGuideMutationFocus(action) {
  if (!action) return;
  const pinAction = action.action.endsWith("-pin");
  const container = elements[pinAction ? "pins-list" : "sections-list"];
  const renameKey = pinAction ? "renamePin" : "renameSection";
  if (action.action.startsWith("rename-")) {
    const target = findGuideAction(container, renameKey, action.id);
    if (target) {
      target.focus?.({ preventScroll: true });
      return;
    }
  }
  elements[pinAction ? "guide-tab-pins" : "guide-tab-sections"]
    ?.focus?.({ preventScroll: true });
}

function submitGuideDialog(event) {
  event.preventDefault();
  const action = state.guideDialog;
  if (!action) return;
  const value = elements["guide-dialog-input"].value.trim();
  let result = null;
  let status = "";

  settleBeforeAction();
  if (action.action === "rename-pin") {
    result = renameGuidePin(state.session, action.id, value);
    status = result.changed ? "Renamed Pin." : "Pin title is unchanged.";
  } else if (action.action === "delete-pin") {
    result = deleteGuidePin(state.session, action.id);
    status = result.changed ? "Deleted Pin." : "Pin could not be deleted.";
  } else if (action.action === "rename-section") {
    if (!value) {
      setStatus("A Section requires a title.", true);
      elements["guide-dialog-input"].focus?.();
      return;
    }
    result = renameGuideSection(state.session, action.id, value);
    status = result.changed ? "Renamed Section." : "Section title is unchanged.";
  } else if (action.action === "delete-section") {
    result = deleteGuideSection(state.session, action.id);
    status = result.changed ? "Deleted Section." : "Section could not be deleted.";
  }

  if (result?.changed) accept(result, { renderGuide: true, status });
  else setStatus(status, !result);
  closeGuideDialog({ restoreFocus: false });
  restoreGuideMutationFocus(action);
}

function goToPin(pin, operator = "pin") {
  if (!pin) return;
  moveToAddress(pin.t, {
    operator,
    label: operator === "pin" ? "Go to Pin" : operator,
    status: destination => `Current is at Pin ${formatTime(destination)}.`
  });
  closeCompactGuideAfterSelection();
}

function goToAdjacentPin(direction) {
  const pin = direction === "backward"
    ? previousPin(guide(), currentResolution().C, activeRange())
    : nextPin(guide(), currentResolution().C, activeRange());
  if (!pin) {
    setStatus(`There is no Pin ${direction} within the active Range.`);
    return;
  }
  moveToAddress(pin.t, {
    operator: direction === "backward" ? "previousPin" : "nextPin",
    label: direction === "backward" ? "Pin Backward" : "Pin Forward",
    status: destination => `Moved ${direction} to Pin at ${formatTime(destination)}.`
  });
}

function goToSectionMidpoint(sectionId) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return;
  moveToAddress(section.midpoint, {
    operator: "section",
    label: `Go to Section “${section.label}”`,
    status: destination => `Current is at the midpoint of “${section.label}” (${formatTime(destination)}).`
  });
  closeCompactGuideAfterSelection();
}

function clearMetadataRetry() {
  if (metadataTimer !== null) clearTimeout(metadataTimer);
  metadataTimer = null;
}

function populateSpeedOptions() {
  const rates = [...new Set(state.availableRates)]
    .filter(rate => Number.isFinite(rate) && rate >= 1)
    .sort((a, b) => a - b);
  elements["speed-select"].replaceChildren();
  for (const rate of rates.length ? rates : [1]) {
    const option = document.createElement("option");
    option.value = String(rate);
    option.textContent = `${rate}×`;
    elements["speed-select"].appendChild(option);
  }
  elements["speed-select"].value = String(rates.at(-1) || 1);
}

function initializeVideo() {
  if (!pendingLoad) return;
  const snapshot = playerSnapshot();
  const duration = snapshot.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    const startedAt = pendingLoad.metadataStartedAt || Date.now();
    pendingLoad.metadataStartedAt = startedAt;
    if (Date.now() - startedAt < METADATA_GRACE_MS) {
      setStatus("Reading YouTube video metadata…");
      if (metadataTimer === null) {
        metadataTimer = window.setTimeout(() => {
          metadataTimer = null;
          initializeVideo();
        }, METADATA_RETRY_MS);
      }
      return;
    }
    clearMetadataRetry();
    pendingLoad = null;
    setStatus("YouTube did not provide a valid duration.", true);
    return;
  }
  clearMetadataRetry();

  const requestedStart = clamp(pendingLoad?.startSeconds || 0, 0, duration);
  state.videoId = pendingLoad.videoId;
  state.session = createSession({
    duration,
    current: requestedStart,
    guide: readStoredGuide(duration),
    stepReach: preferences.stepReach
  });
  state.videoLoaded = true;
  state.transport = idleTransport();
  state.pendingStep = null;
  state.field = null;
  state.captureExtent = null;
  state.captureExtentKind = null;
  state.availableRates = snapshot.availableRates;
  state.playerState = snapshot.state;
  view.invalidateTimelinePins();
  pendingLoad = null;

  locateAddress(requestedStart);
  populateSpeedOptions();
  const guidePersisted = persistGuide();
  view.renderGuide();
  if (guidePersisted) setStatus(`Loaded ${formatTime(duration)} video.`);
  view.render();
}

function cuePendingVideo() {
  if (!state.playerReady || !pendingLoad) return;
  clearMetadataRetry();
  pendingLoad.metadataStartedAt = Date.now();
  clearNativeGo();
  clearProgrammaticPlacement();
  flushPendingStep({ effect: false });
  if (guideDialogOpen()) closeGuideDialog({ restoreFocus: false });
  closeSectionCapture();
  view.closePinClusterMenu();
  state.transport = idleTransport();
  state.videoLoaded = false;
  state.videoId = null;
  state.session = createSession({ stepReach: preferences.stepReach });
  view.setPreviewAction(null);
  view.setPreviewSection(null);
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
  player.cue(pendingLoad.videoId, pendingLoad.startSeconds || 0);
  setStatus("Loading YouTube video metadata…");
}

function handlePlayerStateChange(name, _rawState, metadata = {}) {
  state.playerState = name;
  if (name === YOUTUBE_STATE.CUED && pendingLoad && !state.videoLoaded) {
    initializeVideo();
    return;
  }

  if (!state.videoLoaded) {
    view.render();
    return;
  }

  if (name === YOUTUBE_STATE.PLAYING && isTransportActive(state.transport)) {
    state.transport = withTransportPhase(state.transport, "playing");
    view.render();
    return;
  }

  if (name === YOUTUBE_STATE.PLAYING && !isTransportActive(state.transport)) {
    startContinueSession(false);
    return;
  }

  if (name === YOUTUBE_STATE.PAUSED && metadata.internal) {
    view.renderTransport();
    return;
  }

  if (name === YOUTUBE_STATE.PAUSED && isTransportActive(state.transport)) {
    const kind = state.transport.kind;
    settleTransport({ issuePause: false });
    if (kind === TRANSPORT_KIND.CONTINUE) setStatus("Continue paused.");
    else if (kind === TRANSPORT_KIND.LOOP) setStatus("Loop stopped.");
    else if (kind === TRANSPORT_KIND.SKIM) setStatus("Skim stopped.");
    else setStatus("Context stopped.");
    return;
  }

  if (name === YOUTUBE_STATE.ENDED && transportIs(TRANSPORT_KIND.LOOP)) {
    placePlayer(state.transport.start);
    player.play();
    return;
  }

  if (name === YOUTUBE_STATE.ENDED && transportIs(TRANSPORT_KIND.CONTINUE)) {
    settleTransport({ issuePause: false });
    setStatus("Continue reached Range End.");
  }

  view.render();
}

function handleAutoplayBlocked() {
  if (isTransportActive(state.transport)) settleTransport({ issuePause: false });
  setStatus("The browser blocked scripted observation. Start the video once with YouTube’s native control, then retry.", true);
}

function handlePlayerError(code) {
  clearMetadataRetry();
  clearNativeGo();
  clearProgrammaticPlacement();
  flushPendingStep({ effect: false });
  if (isTransportActive(state.transport)) settleTransport({ issuePause: false });
  clearProgrammaticPlacement();
  pendingLoad = null;
  state.videoLoaded = false;
  state.playerState = YOUTUBE_STATE.UNKNOWN;
  state.transport = idleTransport();
  view.render();
  const messages = {
    2: "Invalid YouTube video identifier.",
    5: "This video could not be opened in YouTube’s HTML5 embed.",
    100: "This video was removed or is private.",
    101: "This video does not allow embedding.",
    150: "This video does not allow embedding.",
    153: "YouTube did not receive the required client identity/referrer. Serve this project over HTTP or HTTPS."
  };
  setStatus(messages[code] || `YouTube embed error ${code}.`, true);
}

function pollPlayer() {
  stepField?.tick();
  if (!state.videoLoaded || !player || !state.playerReady) return;
  const now = safeCurrentTime();
  const transport = state.transport;
  const programmaticPlacementActive = programmaticPlacementOwns(now);

  if (
    isTransportActive(transport)
    && transport.phase === "playing"
    && state.playerState === YOUTUBE_STATE.PAUSED
  ) {
    const kind = transport.kind;
    settleTransport({ issuePause: false });
    setStatus(`${kind === TRANSPORT_KIND.CONTINUE ? "Continue" : kind === TRANSPORT_KIND.SKIM ? "Skim" : kind === TRANSPORT_KIND.LOOP ? "Loop" : "Context"} paused.`);
    return;
  }

  if (transport.kind === TRANSPORT_KIND.CONTEXT) {
    const inside = now >= transport.start - EPSILON && now < transport.end - EPSILON;
    if (!transport.enteredWindow) {
      if (inside) transport.enteredWindow = true;
      else if (Date.now() - transport.startedAt > TRANSPORT_START_GRACE_MS) {
        transport.startedAt = Date.now();
        placePlayer(transport.start);
        player.setRate(1);
        player.play();
      }
    } else if (!inside) {
      settleTransport();
      return;
    }
  } else if (transport.kind === TRANSPORT_KIND.LOOP) {
    const inside = now >= transport.start - EPSILON && now < transport.end - EPSILON;
    if (inside) {
      transport.enteredWindow = true;
    } else if (transport.enteredWindow || Date.now() - transport.startedAt > TRANSPORT_START_GRACE_MS) {
      // A completed Loop restarts immediately. A delayed initial placement is retried
      // only after a grace period so the player is not flooded with placement commands.
      transport.enteredWindow = false;
      transport.startedAt = Date.now();
      placePlayer(transport.start);
      player.setRate(1);
      player.play();
    }
  } else if (transport.kind === TRANSPORT_KIND.SKIM) {
    const insidePath = now >= transport.departure - EPSILON && now <= transport.target + EPSILON;
    if (!transport.enteredPath) {
      if (insidePath) transport.enteredPath = true;
      else if (Date.now() - transport.startedAt > TRANSPORT_START_GRACE_MS) {
        transport.startedAt = Date.now();
        placePlayer(transport.departure);
        player.setRate(desiredSkimRate(transport, transport.departure, state.availableRates));
        player.play();
      }
    } else {
      const rate = desiredSkimRate(transport, now, state.availableRates);
      if (Math.abs(playerSnapshot().rate - rate) > 0.001) player.setRate(rate);
      if (now >= transport.target - EPSILON) {
        finishSkimDestination();
        return;
      }
    }
  } else if (transport.kind === TRANSPORT_KIND.CONTINUE && state.playerState === YOUTUBE_STATE.PLAYING) {
    if (!transport.enteredPath) {
      const entered = now >= transport.departure - NATIVE_POSITION_TOLERANCE_SECONDS
        && now <= transport.departure + 1.5;
      if (entered) transport.enteredPath = true;
      else if (Date.now() - transport.startedAt > TRANSPORT_START_GRACE_MS) {
        transport.startedAt = Date.now();
        placePlayer(transport.departure);
        player.setRate(1);
        player.play();
      }
      view.renderTransport();
      return;
    }
    let semanticChanged = false;
    if (
      !transport.crossedResolution
      && (now < transport.parentNeighborhood.L - EPSILON || now > transport.parentNeighborhood.R + EPSILON)
    ) {
      transport.crossedResolution = true;
      const preview = previewReopen(state.session, clamp(now, activeRange().start, activeRange().end));
      if (preview.changed) {
        state.session = preview.session;
        semanticChanged = true;
      }
      setStatus(`Continue crossed the current Resolution and reopened Range ${formatRange(activeRange())}.`);
    }
    if (now < activeRange().start - EPSILON) {
      placePlayer(activeRange().start);
    } else if (now >= activeRange().end - EPSILON) {
      settleTransport();
      setStatus("Continue reached Range End.");
      return;
    }
    if (semanticChanged) view.render();
  } else if (
    !isTransportActive(transport)
    && [YOUTUBE_STATE.PAUSED, YOUTUBE_STATE.CUED].includes(state.playerState)
    && !programmaticPlacementActive
    && Math.abs(now - currentResolution().C) > NATIVE_POSITION_TOLERANCE_SECONDS
  ) {
    scheduleNativeGo(now);
  } else if (Math.abs(now - currentResolution().C) <= NATIVE_POSITION_TOLERANCE_SECONDS) {
    clearNativeGo();
  }

  view.renderTransport();
}

function timeFromPointer(event) {
  const rect = elements.timeline.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) return currentResolution().C;
  return clamp((event.clientX - rect.left) / rect.width, 0, 1) * model().duration;
}

function handleTimelineClick(event) {
  if (!state.videoLoaded || state.dragHandle) return;
  if (
    event.target.closest(".range-handle")
    || event.target.closest(".timeline-pin")
    || event.target.closest(".pin-cluster-menu")
  ) return;
  view.closePinClusterMenu();
  const time = timeFromPointer(event);
  if (!contains(activeRange(), time)) {
    setStatus("That Address is outside Range.", true);
    return;
  }
  moveToAddress(time, {
    operator: "timeline",
    label: "Timeline Click",
    status: destination => `Clicked to ${formatTime(destination)}.`
  });
}

function beginRangeDrag(kind, event) {
  if (!state.videoLoaded) return;
  settleBeforeAction();
  event.preventDefault();
  event.stopPropagation();
  state.dragHandle = kind;
  state.rangeDragOrigin = snapshotModel(model());
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function updateRangeDrag(event) {
  if (!state.dragHandle || !state.videoLoaded || !state.rangeDragOrigin) return;
  const origin = state.rangeDragOrigin;
  const time = timeFromPointer(event);
  const start = state.dragHandle === "start"
    ? clamp(time, 0, origin.range.end - MIN_RANGE_SECONDS)
    : origin.range.start;
  const end = state.dragHandle === "end"
    ? clamp(time, origin.range.start + MIN_RANGE_SECONDS, origin.duration)
    : origin.range.end;
  const current = clamp(origin.resolution.C, start, end);
  const sameBoundaries = Math.abs(start - origin.range.start) <= EPSILON
    && Math.abs(end - origin.range.end) <= EPSILON;

  if (sameBoundaries) {
    state.session = { model: origin, history: state.session.history };
  } else {
    const baseSession = { model: origin, history: state.session.history };
    const result = previewRange(baseSession, start, end, current);
    if (result.changed) state.session = result.session;
  }
  view.render();
}

function finishRangeDrag() {
  if (!state.dragHandle) return;
  const origin = state.rangeDragOrigin;
  const changed = Boolean(origin) && (
    Math.abs(origin.range.start - activeRange().start) > EPSILON
    || Math.abs(origin.range.end - activeRange().end) > EPSILON
  );
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  if (changed) {
    state.session = checkpoint(state.session, "Adjust Range", origin).session;
    locateAddress(currentResolution().C);
    view.renderGuide();
    setStatus(`Range set to ${formatRange(activeRange())}.`);
  } else if (origin) {
    state.session = { model: origin, history: state.session.history };
  }
  view.render();
}

function cancelRangeDrag() {
  if (!state.dragHandle) return false;
  const origin = state.rangeDragOrigin;
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  if (origin) {
    state.session = {
      model: origin,
      history: state.session.history
    };
    locateAddress(currentResolution().C);
    view.renderGuide();
  }
  setStatus("Range adjustment cancelled.");
  view.render();
  return true;
}

function adjustRangeHandle(kind, event) {
  const backward = ["ArrowLeft", "ArrowDown"].includes(event.key);
  const forward = ["ArrowRight", "ArrowUp"].includes(event.key);
  if (!backward && !forward && !["Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (!state.videoLoaded) return;

  const range = activeRange();
  const amount = reachFor(forward ? "forward" : "backward") * (event.shiftKey ? 5 : 1);
  let value = kind === "start" ? range.start : range.end;
  if (event.key === "Home") value = kind === "start" ? 0 : range.start + MIN_RANGE_SECONDS;
  else if (event.key === "End") value = kind === "start" ? range.end - MIN_RANGE_SECONDS : model().duration;
  else value += forward ? amount : -amount;

  if (kind === "start") {
    value = clamp(value, 0, range.end - MIN_RANGE_SECONDS);
    setRange(value, range.end, currentResolution().C, "Adjust Range Start", `Range Start is ${formatTime(value)}.`);
  } else {
    value = clamp(value, range.start + MIN_RANGE_SECONDS, model().duration);
    setRange(range.start, value, currentResolution().C, "Adjust Range End", `Range End is ${formatTime(value)}.`);
  }
}

function presetStep(value, delta) {
  const current = clamp(Number(value), 0.25, 300);
  if (delta < 0) {
    const candidates = STEP_PRESETS.filter(item => item < current - EPSILON);
    return candidates.at(-1) ?? STEP_PRESETS[0];
  }
  return STEP_PRESETS.find(item => item > current + EPSILON) ?? STEP_PRESETS.at(-1);
}

function commitStepReach(nextReach, label) {
  if (!state.videoLoaded) {
    preferences.stepReach = normalizeStepReach(nextReach);
    state.session = createSession({ stepReach: preferences.stepReach });
    persistPreferences();
    view.render();
    return false;
  }
  settleBeforeAction({ replacingContext: true });
  const result = setSessionStepReach(state.session, nextReach, label);
  if (!result.changed) {
    view.render();
    return false;
  }
  state.session = result.session;
  persistPreferences();
  stepField?.invalidate();
  setStatus(`${label}: Backward ${result.stepReach.backward}s; Forward ${result.stepReach.forward}s.`);
  view.render();
  return true;
}

function adjustStepPreset(direction) {
  const current = currentStepReach();
  commitStepReach({
    backward: presetStep(current.backward, direction),
    forward: presetStep(current.forward, direction),
    linked: current.linked
  }, direction < 0 ? "Decrease Step Reach" : "Increase Step Reach");
}

function changeDirectionalReach(direction, value) {
  const amount = clamp(Number(value), 0.25, 300);
  if (!Number.isFinite(amount)) return;
  const current = currentStepReach();
  state.lastStepReachEdited = direction;
  const next = current.linked
    ? { backward: amount, forward: amount, linked: true }
    : { ...current, [direction]: amount };
  commitStepReach(next, direction === "backward" ? "Set Backward Reach" : "Set Forward Reach");
}

function changeReachLink(linked) {
  const current = currentStepReach();
  if (!linked) {
    commitStepReach({ ...current, linked: false }, "Unlink Step Reach");
    return;
  }
  const source = state.lastStepReachEdited === "backward" ? current.backward : current.forward;
  commitStepReach({ backward: source, forward: source, linked: true }, "Link Step Reach");
}

function syncContextControl() {
  elements["context-select"].value = String(state.contextSeconds);
}

function replayContext() {
  if (!state.videoLoaded) return;
  if (state.contextSeconds <= 0) {
    setStatus("Context is off. Choose a duration to enable it.");
    return;
  }
  if (transportIs(TRANSPORT_KIND.CONTEXT)) {
    settleTransport();
    setStatus("Context stopped.");
    return;
  }
  settleBeforeAction();
  startContext(currentResolution().C);
  setStatus(`Showing ${state.contextSeconds} seconds of Context around Current.`);
  view.render();
}

function openSectionCapture(kind = "interval") {
  const extent = kind === "field-span" ? heldFieldSpan() : currentInterval();
  if (!extent) {
    setStatus(`Establish a ${kind === "field-span" ? "Held Field Span" : "movement Interval"} before saving a Section.`);
    return false;
  }
  state.captureExtent = { start: extent.start, end: extent.end };
  state.captureExtentKind = kind;
  elements["section-capture"].hidden = false;
  elements["interval-state"].setAttribute("aria-expanded", String(kind === "interval"));
  elements["section-label"].disabled = false;
  elements["section-label"].focus();
  view.render();
  return true;
}

function closeSectionCapture() {
  elements["section-capture"].hidden = true;
  elements["interval-state"].setAttribute("aria-expanded", "false");
  elements["section-label"].value = "";
  state.captureExtent = null;
  state.captureExtentKind = null;
  view.render();
}

function selectGuideTab(tab, { focus = false } = {}) {
  const names = ["sections", "pins", "sources"];
  const resolved = names.includes(tab) ? tab : "sections";
  state.guideTab = resolved;
  for (const name of names) {
    const active = name === resolved;
    const tabElement = elements[`guide-tab-${name}`];
    tabElement.classList.toggle("active", active);
    tabElement.setAttribute("aria-selected", String(active));
    tabElement.tabIndex = active ? 0 : -1;
    elements[`guide-${name}-panel`].hidden = !active;
  }
  if (focus) elements[`guide-tab-${resolved}`]?.focus?.({ preventScroll: true });
}

function compactGuideLayout() {
  return window.matchMedia?.("(max-width: 900px)")?.matches === true;
}

function applyGuideState({ focus = false } = {}) {
  const compact = compactGuideLayout();
  const open = compact ? state.guideOpen : true;
  const panel = elements["guide-panel"];
  panel.classList.toggle("is-open", compact && open);
  panel.setAttribute("aria-hidden", String(!open));
  elements["guide-toggle"].setAttribute("aria-expanded", String(open));
  elements["guide-scrim"].hidden = !(compact && open);
  panel.setAttribute("role", compact ? "dialog" : "complementary");
  if (compact && open) panel.setAttribute("aria-modal", "true");
  else panel.removeAttribute("aria-modal");
  document.body?.classList?.toggle("guide-open", compact && open);
  // The compact Guide is a true modal surface: pointer, keyboard, and assistive
  // technology must not continue into the obscured reader or loading controls.
  elements["reader-column"].inert = compact && open;
  elements["load-bar"].inert = compact && open;
  if (focus && open) {
    (compact ? elements["guide-close"] : elements[`guide-tab-${state.guideTab}`])
      ?.focus?.({ preventScroll: true });
  }
}

function syncGuideLayout() {
  const compact = compactGuideLayout();
  if (state.compactGuide === null) state.guideOpen = !compact;
  else if (state.compactGuide !== compact) state.guideOpen = !compact;
  state.compactGuide = compact;
  applyGuideState();
}

function openGuide(tab = state.guideTab) {
  if (state.compactGuide !== compactGuideLayout()) syncGuideLayout();
  state.guideReturnFocus = document.activeElement;
  selectGuideTab(tab);
  state.guideOpen = true;
  applyGuideState({ focus: true });
}

function closeGuide({ restoreFocus = true } = {}) {
  if (!compactGuideLayout()) {
    state.guideOpen = true;
    applyGuideState();
    return;
  }
  const returnFocus = state.guideReturnFocus;
  state.guideOpen = false;
  applyGuideState();
  if (restoreFocus) returnFocus?.focus?.({ preventScroll: true });
  state.guideReturnFocus = null;
}

function closeCompactGuideAfterSelection() {
  if (compactGuideLayout()) closeGuide();
}

function toggleGuide(tab = state.guideTab) {
  if (state.compactGuide !== compactGuideLayout()) syncGuideLayout();
  if (!compactGuideLayout()) {
    openGuide(tab);
    return;
  }
  if (state.guideOpen && tab === state.guideTab) closeGuide();
  else openGuide(tab);
}

function toggleRangeTools() {
  elements["range-tools"].open = !elements["range-tools"].open;
  elements["range-state"].setAttribute("aria-expanded", String(elements["range-tools"].open));
}

function stopOrClose() {
  // Escape resolves only the topmost active layer. Repeated presses move outward
  // predictably instead of collapsing unrelated state in one action.
  if (state.dragHandle) return cancelRangeDrag();
  if (guideDialogOpen()) return closeGuideDialog();
  if (!elements["pin-cluster-menu"].hidden) {
    view.closePinClusterMenu({ restoreFocus: true });
    view.render();
    return true;
  }
  if (!elements["section-capture"].hidden) {
    closeSectionCapture();
    return true;
  }
  if (elements["step-settings"].open) {
    elements["step-settings"].open = false;
    view.render();
    return true;
  }
  if (compactGuideLayout() && state.guideOpen) {
    closeGuide();
    return true;
  }
  if (isTransportActive(state.transport)) {
    settleTransport();
    setStatus("Observation stopped.");
    return true;
  }
  view.setPreviewAction(null);
  view.setPreviewSection(null);
  setStatus("Ready.");
  view.render();
  return false;
}

function initializePlayerApi() {
  if (player || !globalThis.YT?.Player) return;
  player = createYouTubePlayer("player", {
    events: {
      onReady: () => {
        state.playerReady = true;
        setStatus("YouTube ready. Paste a link.");
        cuePendingVideo();
      },
      onStateChange: handlePlayerStateChange,
      onPlaybackRateChange: view.render,
      onAutoplayBlocked: handleAutoplayBlocked,
      onError: handlePlayerError
    }
  });
  stepField = createStepFieldController({
    document,
    getSnapshot: () => ({
      videoLoaded: state.videoLoaded,
      videoId: state.videoId,
      current: currentResolution()?.C || 0,
      range: activeRange(),
      stepReach: currentStepReach(),
      transportKind: state.transport.kind,
      pendingStep: Boolean(state.pendingStep),
      dragging: Boolean(state.dragHandle),
      center: playerSnapshot(),
      playerState: state.playerState
    }),
    getPreferences: () => ({
      stepFieldEnabled: state.stepFieldEnabled,
      tailVisible: state.tailVisible,
      leadVisible: state.leadVisible
    }),
    setPreferences: patch => {
      if (Object.hasOwn(patch, "stepFieldEnabled")) state.stepFieldEnabled = Boolean(patch.stepFieldEnabled);
      if (Object.hasOwn(patch, "tailVisible")) state.tailVisible = Boolean(patch.tailVisible);
      if (Object.hasOwn(patch, "leadVisible")) state.leadVisible = Boolean(patch.leadVisible);
      persistPreferences();
    },
    onSelect: selectFieldSide,
    onChange: fieldState => {
      state.field = fieldState;
      view.render();
    },
    formatTime
  });
  if (pollTimer === null) pollTimer = window.setInterval(pollPlayer, POLL_MS);
}

window.onYouTubeIframeAPIReady = initializePlayerApi;

if (globalThis.YT?.Player) {
  initializePlayerApi();
} else {
  const apiScript = document.createElement("script");
  apiScript.src = "https://www.youtube.com/iframe_api";
  apiScript.addEventListener?.("error", () => {
    setStatus("The YouTube API could not be loaded. Check the network connection and reload.", true);
  });
  document.head.appendChild(apiScript);
}

// Loading
elements["load-video"].addEventListener("click", () => {
  const parsed = parseYouTubeUrl(elements["youtube-url"].value);
  if (!parsed) {
    setStatus("Enter a valid YouTube watch, Shorts, live, embed, youtu.be link, or video ID.", true);
    return;
  }
  pendingLoad = parsed;
  if (!state.playerReady) {
    setStatus("Waiting for the YouTube API…");
    return;
  }
  cuePendingVideo();
});
elements["youtube-url"].addEventListener("keydown", event => {
  if (event.key === "Enter") elements["load-video"].click();
});

// Timeline and Range
elements.timeline.addEventListener("click", handleTimelineClick);
elements.timeline.addEventListener("pointermove", updateRangeDrag);
elements.timeline.addEventListener("pointerup", finishRangeDrag);
elements.timeline.addEventListener("pointercancel", cancelRangeDrag);
elements["range-start-handle"].addEventListener("pointerdown", event => beginRangeDrag("start", event));
elements["range-end-handle"].addEventListener("pointerdown", event => beginRangeDrag("end", event));
elements["range-start-handle"].addEventListener("keydown", event => adjustRangeHandle("start", event));
elements["range-end-handle"].addEventListener("keydown", event => adjustRangeHandle("end", event));
elements["range-start-handle"].addEventListener("lostpointercapture", event => {
  if (state.dragHandle === "start" && event.buttons === 0) finishRangeDrag();
});
elements["range-end-handle"].addEventListener("lostpointercapture", event => {
  if (state.dragHandle === "end" && event.buttons === 0) finishRangeDrag();
});
elements["pin-lane"].addEventListener("click", event => {
  const pinButton = event.target.closest("[data-pin-go]");
  if (pinButton) {
    event.stopPropagation();
    goToPin(getPin(guide(), pinButton.dataset.pinGo));
    return;
  }
  const clusterButton = event.target.closest("[data-cluster-index]");
  if (clusterButton) {
    event.stopPropagation();
    const cluster = view.clusterAt(Number(clusterButton.dataset.clusterIndex));
    if (cluster) view.openPinClusterMenu(cluster, clusterButton);
  }
});
elements["pin-cluster-menu"].addEventListener("click", event => {
  const button = event.target.closest("[data-pin-go]");
  if (!button) return;
  event.stopPropagation();
  view.closePinClusterMenu();
  goToPin(getPin(guide(), button.dataset.pinGo));
});

elements["pin-cluster-menu"].addEventListener("keydown", event => {
  const buttons = [...elements["pin-cluster-menu"].querySelectorAll("[role=menuitem]")];
  if (!buttons.length) return;
  const index = Math.max(0, buttons.indexOf(document.activeElement));
  let next = null;
  if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
  else if (event.key === "ArrowUp") next = (index + buttons.length - 1) % buttons.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = buttons.length - 1;
  else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    view.closePinClusterMenu({ restoreFocus: true });
    return;
  }
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  buttons[next].focus();
});

elements["pin-cluster-menu"].addEventListener("focusout", event => {
  if (elements["pin-cluster-menu"].contains?.(event.relatedTarget)) return;
  view.closePinClusterMenu();
});
document.addEventListener("pointerdown", event => {
  if (elements["pin-cluster-menu"].hidden) return;
  if (
    event.target.closest?.(".pin-cluster-menu")
    || event.target.closest?.("[data-cluster-index]")
  ) return;
  view.closePinClusterMenu();
});

elements["range-start-here"].addEventListener("click", () => {
  setRange(
    currentResolution().C,
    activeRange().end,
    currentResolution().C,
    "Set Range Start",
    `Set Range Start to ${formatTime(currentResolution().C)}.`
  );
});
elements["range-end-here"].addEventListener("click", () => {
  setRange(
    activeRange().start,
    currentResolution().C,
    currentResolution().C,
    "Set Range End",
    `Set Range End to ${formatTime(currentResolution().C)}.`
  );
});
elements["range-midpoint"].addEventListener("click", () => {
  const middle = midpoint(activeRange().start, activeRange().end);
  moveToAddress(middle, {
    operator: "rangeMidpoint",
    label: "Go to Range Midpoint",
    status: destination => `Moved to Range midpoint at ${formatTime(destination)}.`
  });
});
elements["full-video-range"].addEventListener("click", () => {
  setRange(0, model().duration, currentResolution().C, "Full Video Range", "Restored Full Video Range.");
});

// Navigation and observation

elements["refine-backward"].addEventListener("click", () => refine("backward"));
elements["refine-forward"].addEventListener("click", () => refine("forward"));
elements.reopen.addEventListener("click", reopenFully);
elements["return-action"].addEventListener("click", returnLastAction);
elements["step-backward"].addEventListener("click", () => performStep("backward"));
elements["step-forward"].addEventListener("click", () => performStep("forward"));
elements["pin-backward"].addEventListener("click", () => goToAdjacentPin("backward"));
elements["pin-forward"].addEventListener("click", () => goToAdjacentPin("forward"));
elements["pin-current"].addEventListener("click", pinCurrent);
elements["pins-access"].addEventListener("click", () => openGuide("pins"));
elements["context-action"].addEventListener("click", replayContext);
elements.continue.addEventListener("click", continuePause);
elements.skim.addEventListener("click", startSkim);
elements.loop.addEventListener("click", startLoop);
elements["field-span-loop"].addEventListener("click", startFieldSpanLoop);
elements["field-span-retain"].addEventListener("click", () => openSectionCapture("field-span"));
elements["speed-select"].addEventListener("change", view.render);
elements["context-select"].addEventListener("change", event => {
  state.contextSeconds = Number(event.target.value || 0);
  persistPreferences();
  if (transportIs(TRANSPORT_KIND.CONTEXT) && state.contextSeconds === 0) {
    settleTransport();
    setStatus("Automatic Context turned off.");
  }
  view.render();
});

for (const control of document.querySelectorAll("[data-preview-action]")) {
  const action = control.dataset.previewAction;
  control.addEventListener("pointerenter", () => { view.setPreviewAction(action); view.render(); });
  control.addEventListener("pointerleave", () => { view.setPreviewAction(null); view.render(); });
  control.addEventListener("focus", () => { view.setPreviewAction(action); view.render(); });
  control.addEventListener("blur", () => { view.setPreviewAction(null); view.render(); });
}

// Step size
elements["step-slider"].addEventListener("input", event => { syncStepControls(event.target); view.render(); });
elements["step-seconds"].addEventListener("change", event => { syncStepControls(event.target); view.render(); });

// Interval and Range affordances
elements["interval-state"].addEventListener("click", () => openSectionCapture("interval"));
elements["section-capture"].addEventListener("submit", saveCurrentIntervalAsSection);
elements["section-label"].addEventListener("input", view.render);
elements["cancel-section"].addEventListener("click", closeSectionCapture);
elements["range-state"].addEventListener("click", toggleRangeTools);
elements["range-tools"].addEventListener("toggle", () => {
  elements["range-state"].setAttribute("aria-expanded", String(elements["range-tools"].open));
});
elements["focused-state"].addEventListener("click", () => openGuide("sections"));
elements["leave-section"].addEventListener("click", leaveSection);

// Guide
elements["guide-toggle"].addEventListener("click", () => toggleGuide());
elements["guide-close"].addEventListener("click", closeGuide);
elements["guide-scrim"].addEventListener("click", closeGuide);
elements["guide-tab-sections"].addEventListener("click", () => selectGuideTab("sections"));
elements["guide-tab-pins"].addEventListener("click", () => selectGuideTab("pins"));
elements["guide-tab-sources"].addEventListener("click", () => selectGuideTab("sources"));
for (const id of ["guide-tab-sections", "guide-tab-pins", "guide-tab-sources"]) {
  elements[id].addEventListener("keydown", handleGuideTabKeydown);
}
elements["guide-dialog-form"].addEventListener("submit", submitGuideDialog);
elements["guide-dialog-cancel"].addEventListener("click", () => closeGuideDialog());
elements["guide-dialog"].addEventListener("cancel", event => {
  event.preventDefault?.();
  closeGuideDialog();
});

function handleGuideTabKeydown(event) {
  const names = ["sections", "pins", "sources"];
  const currentIndex = names.indexOf(state.guideTab);
  let nextIndex = null;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex + names.length - 1) % names.length;
  else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % names.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = names.length - 1;
  if (nextIndex === null) return;
  event.preventDefault();
  event.stopPropagation();
  selectGuideTab(names[nextIndex], { focus: true });
}

function trapCompactGuideFocus(event) {
  if (event.key !== "Tab" || !compactGuideLayout() || !state.guideOpen || guideDialogOpen()) return false;
  const focusables = elements["guide-panel"].querySelectorAll?.(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables?.length) return false;
  const list = [...focusables].filter(element => element.offsetParent !== null || element === document.activeElement);
  if (!list.length) return false;
  const first = list[0];
  const last = list.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function handleGuideClick(event) {
  const pinGo = event.target.closest("[data-pin-go]");
  if (pinGo) return goToPin(getPin(guide(), pinGo.dataset.pinGo));
  const sectionGo = event.target.closest("[data-section-go]");
  if (sectionGo) return goToSectionMidpoint(sectionGo.dataset.sectionGo);
  const focus = event.target.closest("[data-focus-section]");
  if (focus) return focusSection(focus.dataset.focusSection);
  const leave = event.target.closest("[data-leave-section]");
  if (leave) return leaveSection();
  const renamePinButton = event.target.closest("[data-rename-pin]");
  if (renamePinButton) return renamePinById(renamePinButton.dataset.renamePin);
  const deletePinButton = event.target.closest("[data-delete-pin]");
  if (deletePinButton) return deletePinById(deletePinButton.dataset.deletePin);
  const renameSectionButton = event.target.closest("[data-rename-section]");
  if (renameSectionButton) return renameSectionById(renameSectionButton.dataset.renameSection);
  const deleteSectionButton = event.target.closest("[data-delete-section]");
  if (deleteSectionButton) return deleteSectionById(deleteSectionButton.dataset.deleteSection);
}

elements["sections-list"].addEventListener("click", handleGuideClick);
elements["pins-list"].addEventListener("click", handleGuideClick);
elements["sections-list"].addEventListener("pointerover", event => {
  const item = event.target.closest("[data-section-preview-id]");
  if (!item || item.contains(event.relatedTarget)) return;
  view.setPreviewSection(item.dataset.sectionPreviewId);
  view.render();
});
elements["sections-list"].addEventListener("pointerout", event => {
  const item = event.target.closest("[data-section-preview-id]");
  if (!item || item.contains(event.relatedTarget)) return;
  view.setPreviewSection(null);
  view.render();
});
elements["sections-list"].addEventListener("focusin", event => {
  const item = event.target.closest?.("[data-section-preview-id]");
  if (!item) return;
  view.setPreviewSection(item.dataset.sectionPreviewId);
  view.render();
});
elements["sections-list"].addEventListener("focusout", event => {
  const item = event.target.closest?.("[data-section-preview-id]");
  if (!item || item.contains?.(event.relatedTarget)) return;
  view.setPreviewSection(null);
  view.render();
});

// Keyboard: spatial cluster W/A/S/D, directional arrows, and observation keys.
document.addEventListener("keydown", event => {
  const activeElement = document.activeElement;
  const tag = activeElement?.tagName;
  const editing = ["INPUT", "SELECT", "TEXTAREA"].includes(tag)
    || activeElement?.isContentEditable === true;
  if (editing) {
    if (event.key === "Escape") {
      if (guideDialogOpen()) closeGuideDialog();
      else {
        document.activeElement.blur();
        closeSectionCapture();
      }
    }
    return;
  }

  // A modal edit owns the keyboard. Never allow spatial commands to mutate the
  // reader behind it when focus is on one of the dialog buttons.
  if (guideDialogOpen()) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeGuideDialog();
    }
    return;
  }

  if (trapCompactGuideFocus(event)) return;

  const key = event.key.toLowerCase();
  const code = event.code || "";
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  const spatialKey = expected => plain && (code === `Key${expected.toUpperCase()}` || key === expected);
  const commandReturn = (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && key === "z";

  if (plain && key === "g") {
    event.preventDefault();
    toggleGuide();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    stopOrClose();
    return;
  }
  // On compact screens the Guide is modal. Its controls, not the hidden reader,
  // own all remaining keys until the sheet is closed.
  if (compactGuideLayout() && state.guideOpen) return;
  if (key === "?" || (event.shiftKey && event.key === "/")) {
    event.preventDefault();
    elements["shortcut-help"].open = !elements["shortcut-help"].open;
    if (elements["shortcut-help"].open) {
      elements["shortcut-help-summary"]?.focus?.({ preventScroll: true });
      elements["shortcut-help"]?.scrollIntoView?.({ block: "nearest" });
    }
    return;
  }
  if (!state.videoLoaded) return;

  const repeatableStep = plain
    && (event.key === "ArrowLeft" || event.key === "ArrowRight");
  if (event.repeat && !repeatableStep) return;

  // Space already activates a focused button or summary natively. Avoid toggling Continue twice.
  if (event.key === " " && ["BUTTON", "SUMMARY"].includes(tag)) return;

  if (spatialKey("w")) { event.preventDefault(); reopenFully(); }
  else if (spatialKey("a")) { event.preventDefault(); refine("backward"); }
  else if (spatialKey("s")) { event.preventDefault(); returnLastAction(); }
  else if (spatialKey("d")) { event.preventDefault(); refine("forward"); }
  else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key === "p") {
    event.preventDefault();
    openSectionCapture();
  }
  else if (plain && key === "p") { event.preventDefault(); pinCurrent(); }
  else if (plain && key === "c") { event.preventDefault(); replayContext(); }
  else if (plain && key === "f") { event.preventDefault(); startSkim(); }
  else if (plain && key === "l") { event.preventDefault(); startLoop(); }
  else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "ArrowLeft") { event.preventDefault(); goToAdjacentPin("backward"); }
  else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "ArrowRight") { event.preventDefault(); goToAdjacentPin("forward"); }
  else if (plain && event.key === "ArrowLeft") { event.preventDefault(); performStep("backward"); }
  else if (plain && event.key === "ArrowRight") { event.preventDefault(); performStep("forward"); }
  else if (plain && event.key === "[") { event.preventDefault(); adjustStepPreset(-1); }
  else if (plain && event.key === "]") { event.preventDefault(); adjustStepPreset(1); }
  else if (commandReturn || (plain && event.key === "Backspace")) { event.preventDefault(); returnLastAction(); }
  else if (plain && event.key === " ") { event.preventDefault(); continuePause(); }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isTransportActive(state.transport)) {
    settleTransport();
    setStatus("Observation paused because the document became hidden.");
  }
});

window.addEventListener("resize", () => {
  syncGuideLayout();
  view.invalidateTimelinePins();
  view.renderTimelinePins();
});

syncGuideLayout();
syncStepControls();
syncContextControl();
view.renderGuide();
view.render();
