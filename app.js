// Application composition root. Semantic mutations pass through Session; player effects pass through adapters.
import {
  EPSILON,
  clamp,
  contains,
  refineBlockReason
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
  STEP_REACH_MODE,
  createSession,
  copy,
  snapshotModel,
  goTo,
  goToGuidePin as goToSessionGuidePin,
  goToGuideSection as goToSessionGuideSection,
  refine as refineSession,
  localRefine as localRefineSession,
  step as stepSession,
  stepToPin as stepToPinSession,
  setStepReach as setSessionStepReach,
  normalizeStepReach,
  effectiveStepReach,
  reopen as reopenSession,
  switchEndpoint as switchSessionEndpoint,
  releaseInterval as releaseSessionInterval,
  transposeSection as transposeSessionSection,
  setRange as setSessionRange,
  previewRange,
  checkpoint,
  focusSection as focusSessionSection,
  focusWorkingSection as focusSessionWorkingSection,
  leaveSection as leaveSessionSection,
  completePlayback,
  pinCurrent as pinSessionCurrent,
  saveIntervalAsSection,
  saveExtentAsSection,
  overwriteGuideSection,
  renameGuidePin,
  deleteGuidePin,
  renameGuideSection,
  deleteGuideSection,
  setGuideSectionCollapsed,
  moveGuidePin,
  moveGuideSection,
  undo as undoSession,
  redo as redoSession
} from "./session.js";
import { projectionForModel } from "./temporal-projection.js";
import {
  TRANSPORT_KIND,
  idleTransport,
  isTransportActive,
  transportFieldRange,
  isProperRange,
  createContextTransport,
  createPlaybackTransport,
  rebasePlaybackTransport,
  withTransportPhase
} from "./transport.js";
import {
  YOUTUBE_STATE,
  createYouTubePlayer,
  parseYouTubeUrl
} from "./youtube.js";
import {
  DEFAULT_FIELD_RESPONSE,
  createStepFieldController,
  normalizeFieldResponse
} from "./step-field.js";
import {
  DEFAULT_STEP_GESTURE_TIMING,
  bindStepPress,
  createStepGestureController
} from "./step-gesture.js";
import { createView } from "./view.js";

const STORAGE_V6_PREFIX = "binary-youtube-reader:v6:";
const STORAGE_V5_PREFIX = "binary-youtube-reader:v5:";
const STORAGE_V4_PREFIX = "binary-youtube-reader:v4:";
const STORAGE_V3_PREFIX = "binary-youtube-reader:v3:";
const STORAGE_V2_PREFIX = "binary-youtube-reader:v2:";
const STORAGE_V1_PREFIX = "binary-youtube-reader:v1:";
const PREFERENCES_KEY = "binary-youtube-reader:preferences:v1";
const POLL_MS = 100;
const STEP_TAP_SETTLE_MS = DEFAULT_STEP_GESTURE_TIMING.tapSettleMs;
const STEP_PRESETS = [0.25, 0.5, 1, 2, 3, 5, 10, 15, 30, 60, 120, 300];
const STEP_FRACTIONS = [1 / 32, 1 / 16, 1 / 8];
const NATIVE_GO_SETTLE_MS = 220;
const TRANSPORT_START_GRACE_MS = 1600;
const METADATA_GRACE_MS = 4000;
const METADATA_RETRY_MS = 150;
const PROGRAMMATIC_PLACEMENT_GRACE_MS = 2000;
const NATIVE_POSITION_TOLERANCE_SECONDS = 0.25;
const MAX_CONTEXT_SECONDS = 300;

function normalizeContextSeconds(value, fallback = 5) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, 0, MAX_CONTEXT_SECONDS);
}

function normalizeLastStepReachEdited(value) {
  return value === "backward" ? "backward" : "forward";
}

function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null");
    const legacyStep = Number.isFinite(Number(value?.stepSeconds))
      ? Number(value.stepSeconds)
      : 10;
    return {
      contextSeconds: normalizeContextSeconds(value?.contextSeconds),
      stepReach: normalizeStepReach(value?.stepReach ?? legacyStep),
      fieldOffsets: normalizeStepReach(
        value?.fieldOffsets ?? value?.stepReach ?? legacyStep
      ),
      stepReachLastEdited: normalizeLastStepReachEdited(value?.stepReachLastEdited),
      fieldResponse: normalizeFieldResponse(value?.fieldResponse),
      stepFieldEnabled: value?.stepFieldEnabled !== false,
      tailVisible: value?.tailVisible !== false,
      leadVisible: value?.leadVisible !== false
    };
  } catch {
    return {
      contextSeconds: 5,
      stepReach: normalizeStepReach(10),
      fieldOffsets: normalizeStepReach(10),
      stepReachLastEdited: "forward",
      fieldResponse: { ...DEFAULT_FIELD_RESPONSE },
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
  lastStepReachEdited: preferences.stepReachLastEdited,
  fieldOffsets: normalizeStepReach(preferences.fieldOffsets),
  fieldResponse: normalizeFieldResponse(preferences.fieldResponse),
  contextSeconds: preferences.contextSeconds,
  stepFieldEnabled: preferences.stepFieldEnabled,
  tailVisible: preferences.tailVisible,
  leadVisible: preferences.leadVisible,
  dragHandle: null,
  rangeDragOrigin: null,
  rangeDragProjection: null,
  guideTab: "sections",
  guideOpen: false,
  compactGuide: null,
  guideReturnFocus: null,
  nativeGo: null,
  programmaticPlacement: null,
  guideDialog: null,
  selectedRetained: null,
  selectedPinIds: [],
  guideDrag: null,
  guideClickSuppressed: false,
  carryModifier: false,
  shiftLayer: false,
  shiftKeyHeld: false,
  field: null
};

let player = null;
let stepField = null;
let pendingLoad = null;
let pollTimer = null;
let metadataTimer = null;
let stepGesture = null;
let centerPauseRequest = null;

function model() {
  return state.session.model;
}

function currentResolution() {
  return model().resolution;
}

function activeRange() {
  return model().range;
}

function activeFieldRange() {
  return transportFieldRange(state.transport, activeRange()) || activeRange();
}

function currentStepReach() {
  const configured = normalizeStepReach(
    model()?.stepReach ?? preferences.stepReach
  );
  if (!model()?.range) return configured;
  return effectiveStepReach(configured, activeRange(), temporalProjection());
}

function configuredStepReach() {
  return normalizeStepReach(model()?.stepReach ?? preferences.stepReach);
}

function currentFieldOffsets() {
  return normalizeStepReach(state.fieldOffsets ?? preferences.fieldOffsets);
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

function temporalProjection(options = {}) {
  return projectionForModel(model(), options);
}

function projectionTopologyKey(sourceModel) {
  const projection = projectionForModel(sourceModel);
  return [
    projection.effectiveDuration,
    ...projection.folds.map(fold =>
      `${fold.start}:${fold.end}`
    )
  ].join("|");
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

function sectionName(section) {
  return section?.label?.trim() || `Section ${formatRange(section)}`;
}

function storageKey(prefix = STORAGE_V6_PREFIX) {
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
    preferences.stepReach = normalizeStepReach(
      model()?.stepReach ?? preferences.stepReach,
      preferences.stepReach
    );
    preferences.stepReachLastEdited = normalizeLastStepReachEdited(state.lastStepReachEdited);
    preferences.fieldOffsets = normalizeStepReach(
      state.fieldOffsets,
      preferences.fieldOffsets
    );
    preferences.fieldResponse = normalizeFieldResponse(state.fieldResponse);
    preferences.contextSeconds = state.contextSeconds;
    preferences.stepFieldEnabled = state.stepFieldEnabled;
    preferences.tailVisible = state.tailVisible;
    preferences.leadVisible = state.leadVisible;

    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      contextSeconds: preferences.contextSeconds,
      stepReach: preferences.stepReach,
      stepReachLastEdited: preferences.stepReachLastEdited,
      fieldOffsets: preferences.fieldOffsets,
      fieldResponse: preferences.fieldResponse,
      stepFieldEnabled: preferences.stepFieldEnabled,
      tailVisible: preferences.tailVisible,
      leadVisible: preferences.leadVisible
    }));
  } catch (error) {
    console.warn("Could not save preferences:", error);
  }
}

function readStoredGuide(duration) {
  if (!state.videoId) return createGuide();
  const candidates = [
    [STORAGE_V6_PREFIX, raw => normalizeGuide(raw, state.videoId)],
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

function pauseRequestOwns(transport) {
  const request = centerPauseRequest;
  if (!request || !transport) return false;
  if (request.transport === transport) return true;
  return Boolean(
    request.kind !== TRANSPORT_KIND.IDLE
    && request.kind === transport.kind
    && Number.isFinite(request.startedAt)
    && request.startedAt === transport.startedAt
  );
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

function locateAddress(address, {
  preserveField = false,
  resetField = false,
  fieldAligned = false,
  centerAligned = false
} = {}) {
  if (!player || !Number.isFinite(address)) return;
  clearNativeGo();
  if (!centerPauseRequest?.cancelOnPlaying) centerPauseRequest = null;
  state.transport = idleTransport();
  player.pause();
  player.setRate(1);
  if (!centerAligned) placePlayer(address);
  if (resetField) {
    stepField?.resetAtCurrent?.();
  } else if (!fieldAligned) {
    stepField?.translateToCurrent(address, { preserve: preserveField });
  }
}

function startContext(anchor, options = {}) {
  const transport = createContextTransport({
    anchor,
    range: activeRange(),
    seconds: state.contextSeconds
  });

  if (transport.kind === TRANSPORT_KIND.IDLE) {
    locateAddress(anchor, { preserveField: true });
    return;
  }

  // A new Context owns the next PLAYING confirmation at its newly placed
  // address. Any cancellation claim from the transport it superseded is now
  // obsolete; retaining it would let rapid Step pause this replacement window.
  centerPauseRequest = null;
  state.transport = options.retarget && state.playerState === YOUTUBE_STATE.PLAYING
    ? withTransportPhase(transport, "playing")
    : transport;
  // Context observes only Center. Preserve the already-translated Field relation
  // around the semantic anchor instead of remeasuring against the old Cursor.
  // Retargeting an active Context reuses its already-suspended Field.
  if (!options.retarget) stepField?.pause({ center: anchor, freeze: false });
  player.setRate(1);
  placePlayer(transport.start);
  if (Math.abs(safeCurrentTime() - transport.start) <= 0.25) {
    state.transport.enteredWindow = true;
  }
  if (!options.retarget || state.playerState !== YOUTUBE_STATE.PLAYING) player.play();
}

function applyPlayerEffect(result, options = {}) {
  if (!state.videoLoaded || !player) return;
  const observe = options.observe !== false;
  const destination = Number.isFinite(result?.place)
    ? result.place
    : result?.interval?.arrival;
  if (!Number.isFinite(destination)) return;

  if (observe && state.contextSeconds > 0 && result?.interval) {
    if (!options.fieldAligned) {
      stepField?.translateToCurrent(destination, { preserve: true });
    }
    startContext(destination);
    return;
  }
  locateAddress(destination, {
    preserveField: true,
    fieldAligned: options.fieldAligned === true,
    centerAligned: options.centerAligned === true
  });
}

function accept(result, options = {}) {
  if (!result?.changed) return false;
  const previousModel = model();
  state.session = result.session;
  state.selectedPinIds = state.selectedPinIds.filter(id =>
    Boolean(getPin(guide(), id))
  );
  if (
    state.selectedRetained?.kind === "pin"
      ? !getPin(guide(), state.selectedRetained.id)
      : state.selectedRetained?.kind === "section"
        ? !resolveSection(guide(), state.selectedRetained.id)
        : false
  ) {
    state.selectedRetained = null;
  }
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  const topologyChanged = projectionTopologyKey(previousModel)
    !== projectionTopologyKey(model());
  const projectionAligned = result.projectionChanged === true
    && topologyChanged;
  const rangeAligned = result.rangeChanged === true
    && options.effect !== false;
  if (rangeAligned) {
    stepField?.resetAtCurrent?.();
  } else if (projectionAligned) {
    stepField?.translateToCurrent(currentResolution().C, { preserve: true });
  }
  if (options.effect !== false) {
    applyPlayerEffect(result, {
      observe: options.observe,
      fieldAligned: rangeAligned || projectionAligned
    });
  }
  if (
    options.renderGuide
    || result.guideChanged
    || result.rangeChanged
    || topologyChanged
  ) view.renderGuide();
  if (options.status && guidePersisted) setStatus(options.status);
  view.render();
  return true;
}

function carryRetainedThrough(result, originModel, enabled, selection = state.selectedRetained) {
  if (
    !enabled
    || !selection
    || !result?.changed
    || !originModel
    || !Number.isFinite(result.session?.model?.resolution?.C)
  ) return result;

  const projection = projectionForModel(originModel);
  const originCurrent = originModel.resolution.C;
  const destination = result.session.model.resolution.C;
  const originCoordinate = projection.sourceToTraversal(originCurrent);
  const destinationCoordinate = projection.sourceToTraversal(destination);
  const delta = destinationCoordinate - originCoordinate;
  const direction = delta < 0 ? "backward" : "forward";
  let carried = null;
  let carryClamped = false;

  if (selection.kind === "pin") {
    const originPin = getPin(originModel.guide, selection.id);
    if (!originPin) return { ...result, carryFailed: "missing-pin" };
    if (projection.foldAtSource(originPin.t)) {
      return { ...result, carryFailed: "hidden-in-fold" };
    }
    const requestedCoordinate =
      projection.sourceToTraversal(originPin.t) + delta;
    const boundedCoordinate = clamp(
      requestedCoordinate,
      0,
      projection.effectiveDuration
    );
    const target = projection.traversalToSource(
      requestedCoordinate,
      direction
    );
    carried = moveGuidePin(result.session, selection.id, target, {
      amend: true
    });
    carryClamped =
      Math.abs(requestedCoordinate - boundedCoordinate) > EPSILON
      || (
        carried.changed
        && Math.abs((carried.value?.destination ?? target) - target) > EPSILON
      );
  } else if (selection.kind === "section") {
    const originSection = resolveSection(originModel.guide, selection.id);
    const currentSection = resolveSection(result.session.model.guide, selection.id);
    if (!originSection || !currentSection) {
      return { ...result, carryFailed: "missing-section" };
    }
    const coveringFold = projection.folds.find(fold =>
      originSection.start >= fold.start - EPSILON
      && originSection.end <= fold.end + EPSILON
      && !fold.sectionIds.includes(selection.id)
    );
    if (coveringFold) {
      return { ...result, carryFailed: "hidden-in-fold" };
    }
    const inverseProjection = projectionForModel(originModel, {
      expandedSectionIds: [originSection.id]
    });
    const requestedCoordinate =
      projection.sourceToTraversal(originSection.start) + delta;
    const boundedCoordinate = clamp(
      requestedCoordinate,
      0,
      inverseProjection.effectiveDuration
    );
    const targetStart = inverseProjection.traversalToSource(
      requestedCoordinate,
      direction
    );
    const requestedDelta = targetStart - currentSection.start;
    carried = moveGuideSection(
      result.session,
      selection.id,
      requestedDelta,
      { amend: true }
    );
    carryClamped =
      Math.abs(requestedCoordinate - boundedCoordinate) > EPSILON
      || (
        carried.changed
        && Math.abs((carried.value?.delta ?? requestedDelta) - requestedDelta) > EPSILON
      );
  }

  if (!carried?.changed) {
    if (
      ["unchanged-pin", "unchanged-section"].includes(carried?.reason)
      && Math.abs(delta) <= EPSILON
    ) {
      return result;
    }
    return {
      ...result,
      carryFailed: carried?.reason || "unavailable"
    };
  }
  return {
    ...result,
    session: carried.session,
    guideChanged: true,
    projectionChanged: true,
    rangeChanged: Boolean(result.rangeChanged || carried.rangeChanged),
    ...(Number.isFinite(carried.place) ? { place: carried.place } : {}),
    carriedRetained: { ...selection },
    carryClamped
  };
}

function retainedCarryStatus(result) {
  if (result?.carriedRetained) {
    return result.carryClamped
      ? " Carried the selected retained object to its structural boundary."
      : " Carried the selected retained object with Current.";
  }
  return result?.carryFailed
    ? result.carryFailed === "hidden-in-fold"
      ? " Unfold or Focus its containing Section before carrying that hidden retained object."
      : " The selected retained object could not follow Current beyond its structural boundary."
    : "";
}

function settleTransport(options = {}) {
  const active = state.transport;
  if (!isTransportActive(active)) return false;

  const restoreObservation = options.restoreObservation !== false;
  const issuePause = options.issuePause !== false;
  const handoffField = options.handoffField === true;
  const shouldRender = options.render !== false;
  const current = clamp(safeCurrentTime(), activeRange().start, activeRange().end);
  const cancelPendingStart = issuePause && active.phase === "starting";
  if (cancelPendingStart) {
    centerPauseRequest = {
      transport: active,
      kind: active.kind,
      startedAt: active.startedAt,
      cancelOnPlaying: true
    };
  } else if (pauseRequestOwns(active)) {
    centerPauseRequest = null;
  }
  state.transport = idleTransport();

  if (issuePause) player.pause();
  player.setRate(1);

  if (active.kind === TRANSPORT_KIND.CONTEXT) {
    if (restoreObservation && !handoffField && currentResolution()) {
      placePlayer(currentResolution().C);
      stepField?.translateToCurrent(currentResolution().C, { preserve: true });
    }
    if (shouldRender) view.render();
    return true;
  }

  if (active.kind === TRANSPORT_KIND.PLAYBACK) {
    // Ordinary pause freezes the visible Field once. A direct handoff skips
    // that intermediate formation because the next transport will establish
    // its own Field around the newly settled Current in the same action.
    if (!handoffField) stepField?.pause({ center: current, freeze: true });
    const result = completePlayback(state.session, {
      current,
      departure: active.departure,
      parentNeighborhood: active.parentNeighborhood,
      parentResolutionBasis: active.parentResolutionBasis,
      returnModel: active.returnModel,
      cycles: active.cycles || 0,
      label: active.label,
      operator: active.operator || "playback"
    });
    if (result.changed) {
      state.session = result.session;
      if (!handoffField) stepField?.translateToCurrent(current, { preserve: true });
      persistPreferences();
      view.renderGuide();
    }
    if (shouldRender) view.render();
    return true;
  }

  if (shouldRender) view.render();
  return true;
}

function settlePausedTransport() {
  const kind = state.transport.kind;
  if (!settleTransport({ issuePause: false })) return false;
  if (kind === TRANSPORT_KIND.PLAYBACK) setStatus("Playback paused.");
  else setStatus("Context stopped.");
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
    && (firstFocus.kind || "saved-section") === (secondFocus.kind || "saved-section")
    && firstFocus.sectionId === secondFocus.sectionId
    && Math.abs((firstFocus.extent?.start ?? 0) - (secondFocus.extent?.start ?? 0)) <= EPSILON
    && Math.abs((firstFocus.extent?.end ?? 0) - (secondFocus.extent?.end ?? 0)) <= EPSILON
    && Math.abs(firstFocus.returnRange.start - secondFocus.returnRange.start) <= EPSILON
    && Math.abs(firstFocus.returnRange.end - secondFocus.returnRange.end) <= EPSILON
  );
  return sameRange && sameResolution && sameFocus;
}

function flushPendingStep(options = {}) {
  const pending = state.pendingStep;
  if (!pending) return { flushed: false, cancelled: false, direction: null };
  clearTimeout(pending.timer);
  state.pendingStep = null;

  if (pending.started && sameSpatialModel(model(), pending.originModel)) {
    state.session = {
      model: pending.originModel,
      history: pending.originHistory,
      future: pending.originFuture
    };
    view.render();
    return { flushed: true, cancelled: true, direction: pending.lastDirection };
  }

  let guidePersisted = true;
  if (pending.guideChanged) {
    guidePersisted = persistGuide();
    view.invalidateTimelinePins();
    view.renderGuide();
  }

  if (options.effect !== false) {
    applyPlayerEffect({
      place: currentResolution().C,
      interval: currentInterval()
    }, {
      observe: options.observe,
      fieldAligned: true,
      centerAligned: true
    });
  }
  return {
    flushed: true,
    cancelled: false,
    direction: pending.lastDirection,
    guidePersisted,
    carriedRetained: pending.carriedRetained,
    carryClamped: pending.carryClamped,
    carryFailed: pending.carryFailed
  };
}

function completePendingStep(options = {}) {
  const outcome = flushPendingStep({
    observe: options.observe !== false,
    effect: options.effect !== false
  });
  if (!outcome.flushed) return outcome;
  const interval = currentInterval();
  const intervalStatus = interval
    ? formatRange(interval)
    : `cleared at ${formatTime(currentResolution().C)}`;
  if (outcome.guidePersisted !== false) {
    setStatus(
      outcome.cancelled
        ? `Step sequence returned to ${formatTime(currentResolution().C)}; no state was recorded.`
        : `Stepped ${outcome.direction === "backward" ? "Backward" : "Forward"} to ${formatTime(currentResolution().C)}; Interval ${intervalStatus}.${retainedCarryStatus(outcome)}`
    );
  }
  view.render();
  return outcome;
}

function deferPendingStepCompletion(options = {}) {
  if (!state.pendingStep) return false;
  clearTimeout(state.pendingStep.timer);
  state.pendingStep.waitForGestureEnd = false;
  state.pendingStep.timer = window.setTimeout(() => {
    completePendingStep({ observe: options.observe !== false });
  }, STEP_TAP_SETTLE_MS);
  return true;
}

function setStepGesturePresentation({ active, selection }) {
  const direction = active ? selection?.direction : null;
  for (const [id, controlDirection] of [
    ["step-backward", "backward"],
    ["tail-step-button", "backward"],
    ["tail-player-surface", "backward"],
    ["step-forward", "forward"],
    ["lead-step-button", "forward"],
    ["lead-player-surface", "forward"]
  ]) {
    elements[id]?.classList?.toggle?.(
      "is-step-held",
      Boolean(active && direction === controlDirection)
    );
  }
}

stepGesture = createStepGestureController({
  perform: selection => performStep(
    selection.direction,
    selection.distance,
    {
      waitForGestureEnd: true,
      carryRetained: selection.carryRetained === true
    }
  ),
  finish: detail => {
    if (detail.defer && detail.effect && detail.repeats === 0) {
      deferPendingStepCompletion({ observe: detail.observe });
      return;
    }
    completePendingStep({
      observe: detail.observe,
      effect: detail.effect
    });
  },
  onActiveChange: setStepGesturePresentation
});

function settleBeforeAction(options = {}) {
  clearNativeGo();
  stepGesture?.cancel({ finalize: false });
  view.closePinClusterMenu();
  view.setPreviewAction(null);
  const replacingContext = options.replacingContext === true;
  const handoffTransport = options.handoffTransport === true;
  // A following command supersedes the pending Step's automatic Context. The
  // coalesced semantic Step is retained, but no transient observation is started
  // only to be cancelled by the next command.
  flushPendingStep({ effect: false });
  if (
    transportIs(TRANSPORT_KIND.CONTEXT)
    && (replacingContext || handoffTransport)
  ) {
    settleTransport({
      restoreObservation: false,
      issuePause: !handoffTransport,
      handoffField: handoffTransport
    });
  } else {
    settleTransport({
      issuePause: !handoffTransport,
      handoffField: handoffTransport
    });
  }
}

function moveToAddress(destination, options = {}) {
  if (!state.videoLoaded || !Number.isFinite(destination)) return false;
  settleBeforeAction({ replacingContext: true });
  const carry = options.carryRetained === true || state.carryModifier;
  const carrySelection = state.selectedRetained
    ? { ...state.selectedRetained }
    : null;
  const originModel = snapshotModel(model(), { cloneGuide: carry });
  const departure = currentResolution().C;
  let result = typeof options.transaction === "function"
    ? options.transaction(state.session, destination)
    : goTo(state.session, destination, options);
  if (!result.changed) {
    locateAddress(departure);
    setStatus(`Already at ${formatTime(departure)}.`);
    view.render();
    return false;
  }
  result = carryRetainedThrough(
    result,
    originModel,
    carry,
    carrySelection
  );
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
    renderGuide: result.rangeChanged || options.renderGuide === true,
    status: `${scopePrefix}${baseStatus}${retainedCarryStatus(result)}`
  });
}

function refine(direction, options = {}) {
  if (!state.videoLoaded) return;
  settleBeforeAction({ replacingContext: true });
  const carry = options.carryRetained === true || state.carryModifier;
  const originModel = snapshotModel(model(), { cloneGuide: carry });
  const local = options.local === true;
  let result = local
    ? localRefineSession(state.session, direction)
    : refineSession(state.session, direction);
  if (!result.changed) {
    const reason = refineBlockReason(
      currentResolution(),
      activeRange(),
      direction,
      temporalProjection().metric
    );
    const label = direction === "backward" ? "Backward" : "Forward";
    setStatus(
      reason === "resolution-limit"
        ? `Cannot Refine ${label}: this side has reached the Resolution limit. Reopen or Step to restore scale.`
        : `Cannot Refine ${label}: Current is at the Range ${direction === "backward" ? "start" : "end"}.`
    );
    return;
  }
  result = carryRetainedThrough(result, originModel, carry);
  const workingSection = result.interval
    ? formatRange(result.interval)
    : `cleared at ${formatTime(result.destination)}`;
  accept(result, {
    status: local
      ? result.refineRelation === "shorten"
        ? `Local Refine ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(result.destination)}; the Working Section shortened to ${workingSection}.${retainedCarryStatus(result)}`
        : `Local Refine ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(result.destination)}; the previous Working Section was replaced by ${workingSection}.${retainedCarryStatus(result)}`
      : `Refined ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(result.destination)}; retained Working Interval ${workingSection}.${retainedCarryStatus(result)}`
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

function switchCurrentEndpoint(options = {}) {
  if (!state.videoLoaded) return;
  settleBeforeAction({ replacingContext: true });
  const carry = options.carryRetained === true || state.carryModifier;
  const originModel = snapshotModel(model(), { cloneGuide: carry });
  const interval = currentInterval();
  let result = switchSessionEndpoint(state.session);
  if (!result.changed) {
    setStatus("There is no active Interval endpoint to switch.");
    return;
  }
  result = carryRetainedThrough(result, originModel, carry);
  accept(result, {
    status: `Switched to ${formatTime(result.session.model.resolution.C)}; Working Interval remains ${formatRange(interval)} in its restored refinement frame.${retainedCarryStatus(result)}`
  });
}

function releaseWorkingInterval() {
  if (!state.videoLoaded) return false;
  settleBeforeAction();
  const result = releaseSessionInterval(state.session);
  if (!result.changed) {
    setStatus("There is no Working Interval to release.");
    return false;
  }
  return accept(result, {
    effect: false,
    status: `Released the Working Interval; Current remains ${formatTime(currentResolution().C)}.`
  });
}

function transposeWorkingOrSelected() {
  if (!state.videoLoaded) return false;
  settleBeforeAction();
  const working = currentInterval();
  const selected = state.selectedRetained?.kind === "section"
    ? resolveSection(guide(), state.selectedRetained.id)
    : null;
  const selectedSectionId = selected
    && (
      !working
      || (
        Math.abs(selected.start - working.start) <= EPSILON
        && Math.abs(selected.end - working.end) <= EPSILON
      )
    )
      ? selected.id
      : null;
  const result = transposeSessionSection(state.session, selectedSectionId);
  if (!result.changed) {
    if (result.reason === "ambiguous-transpose-target") {
      openGuide("sections");
      setStatus(`${result.sectionIds?.length || "Several"} Sections share this extent. Select the intended Section, then Transpose.`);
      return false;
    }
    setStatus("Establish a Working Interval or select a Section to transpose.");
    return false;
  }
  state.selectedRetained = {
    kind: "section",
    id: result.section.id
  };
  view.invalidateTimelinePins();
  const name = sectionName(result.section);
  return accept(result, {
    effect: false,
    renderGuide: true,
    status: result.collapsed
      ? `Transposed “${name}”; its source endpoints remain sequential at one lateral Address.`
      : `Unfolded “${name}” back into lateral source time.`
  });
}

function focusOrUnfocus() {
  if (!state.videoLoaded) return false;
  if (model().focus) return leaveSection();
  const working = currentInterval();
  if (state.selectedRetained?.kind === "section") {
    const selected = resolveSection(
      guide(),
      state.selectedRetained.id
    );
    if (
      selected
      && (
        !working
        || (
          Math.abs(selected.start - working.start) <= EPSILON
          && Math.abs(selected.end - working.end) <= EPSILON
        )
      )
    ) {
      return focusSection(selected.id);
    }
  }
  if (working) return focusWorkingSection();
  setStatus("Establish a Working Interval or select a Section before Focus.");
  return false;
}

function traverseHistory(transform, emptyMessage, completedVerb) {
  settleBeforeAction({ replacingContext: true });
  const previousModel = model();
  const departure = currentResolution().C;
  const result = transform(state.session);
  if (!result.changed) {
    setStatus(emptyMessage);
    return false;
  }
  state.session = result.session;
  persistPreferences();
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  const destination = currentResolution().C;
  const currentMoved = Math.abs(destination - departure) > EPSILON;
  const rangeChanged = Math.abs(previousModel.range.start - activeRange().start) > EPSILON
    || Math.abs(previousModel.range.end - activeRange().end) > EPSILON;
  const topologyChanged = projectionTopologyKey(previousModel)
    !== projectionTopologyKey(model());
  if (currentMoved && state.contextSeconds > 0) {
    if (rangeChanged) stepField?.resetAtCurrent?.();
    else stepField?.translateToCurrent(destination, { preserve: true });
    startContext(destination);
  } else if (currentMoved || rangeChanged) {
    locateAddress(destination, {
      preserveField: !rangeChanged,
      resetField: rangeChanged
    });
  } else if (topologyChanged) {
    stepField?.translateToCurrent(destination, { preserve: true });
  }
  view.renderGuide();
  if (guidePersisted) setStatus(`${completedVerb} ${result.label}.`);
  view.render();
  return true;
}

function undoLastAction() {
  return traverseHistory(
    undoSession,
    "There is no preceding state to Undo.",
    "Undid"
  );
}

function redoLastAction() {
  return traverseHistory(
    redoSession,
    "There is no subsequent state to Redo.",
    "Redid"
  );
}

function performStep(direction, distance = reachFor(direction), options = {}) {
  if (!state.videoLoaded) return false;
  const resolvedDistance = Number(distance);
  if (!(Number.isFinite(resolvedDistance) && resolvedDistance > 0)) return false;
  if (!state.pendingStep) {
    settleBeforeAction({ replacingContext: true });
    const departure = currentResolution().C;
    const carry = options.carryRetained === true || state.carryModifier;
    const originModel = snapshotModel(model(), { cloneGuide: carry });
    const intervalDeparture = originModel.interval
      && Math.abs(originModel.interval.arrival - departure) <= EPSILON
      ? originModel.interval.departure
      : departure;
    state.pendingStep = {
      departure,
      intervalDeparture,
      originModel,
      originHistory: state.session.history,
      originFuture: state.session.future || [],
      timer: null,
      started: false,
      lastDirection: direction,
      waitForGestureEnd: options.waitForGestureEnd === true,
      carryRetained: carry,
      carrySelection: state.selectedRetained
        ? { ...state.selectedRetained }
        : null,
      guideChanged: false,
      carriedRetained: false,
      carryClamped: false,
      carryFailed: null
    };
  } else {
    state.pendingStep.lastDirection = direction;
    state.pendingStep.waitForGestureEnd ||= options.waitForGestureEnd === true;
  }

  const previousModel = model();
  const result = stepSession(state.session, direction, resolvedDistance, {
    departure: state.pendingStep.departure,
    intervalDeparture: state.pendingStep.intervalDeparture,
    originInterval: state.pendingStep.originModel.interval,
    originResolution: state.pendingStep.originModel.resolution,
    originResolutionBasis: state.pendingStep.originModel.resolutionBasis,
    amend: state.pendingStep.started
  });
  if (!result.changed) {
    if (!state.pendingStep.started) state.pendingStep = null;
    setStatus(`Step ${direction === "backward" ? "Backward" : "Forward"} is at the Range boundary.`);
    return false;
  }
  const carried = carryRetainedThrough(
    result,
    state.pendingStep.originModel,
    state.pendingStep.carryRetained,
    state.pendingStep.carrySelection
  );
  state.pendingStep.guideChanged ||= carried.guideChanged === true;
  state.pendingStep.carriedRetained = Boolean(carried.carriedRetained);
  state.pendingStep.carryClamped = carried.carryClamped === true;
  state.pendingStep.carryFailed = carried.carryFailed || null;
  state.pendingStep.started = true;
  state.session = carried.session;
  if (
    projectionTopologyKey(previousModel) !== projectionTopologyKey(model())
  ) {
    view.renderGuide();
  }
  if (carried.rangeChanged) stepField?.resetAtCurrent?.();
  else stepField?.translateToCurrent(currentResolution().C, { preserve: true });
  // A pending Step delays only automatic Context and history settlement. Its
  // semantic Current and all three physical panes move immediately, so a held
  // or rapidly tapped sequence remains a visible traversal rather than a marker
  // moving over a stale Center frame.
  placePlayer(currentResolution().C);

  clearTimeout(state.pendingStep.timer);
  state.pendingStep.timer = null;
  if (!state.pendingStep.waitForGestureEnd) {
    state.pendingStep.timer = window.setTimeout(() => {
      completePendingStep({ observe: true });
    }, STEP_TAP_SETTLE_MS);
  }
  view.render();
  return true;
}

function startNativePlaybackSession() {
  if (!state.videoLoaded || transportIs(TRANSPORT_KIND.PLAYBACK)) return;
  clearNativeGo();
  clearProgrammaticPlacement();
  const current = clamp(safeCurrentTime(), activeRange().start, activeRange().end);

  if (Math.abs(current - currentResolution().C) > NATIVE_POSITION_TOLERANCE_SECONDS) {
    const direct = goTo(state.session, current, { operator: "nativeGo", label: "Native Go" });
    if (direct.changed) state.session = direct.session;
  }

  state.transport = createPlaybackTransport({
    departure: current,
    parentNeighborhood: copy(currentResolution()),
    parentResolutionBasis: model().resolutionBasis,
    returnModel: snapshotModel(model()),
    label: "Playback",
    operator: "playback"
  });
  state.transport.enteredPath = true;
  state.transport = withTransportPhase(state.transport, "playing");
  setStatus(`Playing through Range ${formatRange(activeRange())}.`);
  view.render();
}

function startFieldPlaybackFromGesture() {
  if (!state.videoLoaded) return false;
  settleBeforeAction({ handoffTransport: true });
  clearNativeGo();
  clearProgrammaticPlacement();
  centerPauseRequest = null;
  const destination = currentResolution().C;
  if (Math.abs(safeCurrentTime() - destination) > NATIVE_POSITION_TOLERANCE_SECONDS) {
    placePlayer(destination);
  }
  state.transport = createPlaybackTransport({
    departure: destination,
    parentNeighborhood: copy(currentResolution()),
    parentResolutionBasis: model().resolutionBasis,
    returnModel: snapshotModel(model()),
    label: "Playback",
    operator: "playback"
  });
  // This function is called directly from a trusted parent-page click or Space
  // key event. Ask every muted side and Center to play in the same synchronous
  // activation stack; delayed Center state events are too late to transfer that
  // activation to sibling YouTube iframes reliably.
  stepField?.playFromGesture?.({ center: destination, reason: "playback" });
  player.play();
  return true;
}

function requestCenterPause() {
  const transport = state.transport;
  if (!isTransportActive(transport)) return false;
  centerPauseRequest = {
    transport,
    kind: transport.kind,
    startedAt: transport.startedAt
  };
  player.pause();
  return true;
}

function acceptContextCursor() {
  if (!transportIs(TRANSPORT_KIND.CONTEXT)) return false;
  const destination = clamp(
    safeCurrentTime(),
    activeRange().start,
    activeRange().end
  );
  const departure = currentResolution().C;
  const parentNeighborhood = copy(currentResolution());
  const parentResolutionBasis = model().resolutionBasis;
  const returnModel = snapshotModel(model());
  const returnProjectionKey = projectionTopologyKey(returnModel);

  // Context remains transient unless the user explicitly accepts its Cursor.
  // Stop the physical observation without restoring its anchor, then settle
  // the heard movement through the continuous projection. Context acceptance
  // moves the active endpoint through the existing spatial relation; it must
  // not replace that relation with a tiny direct-Go frame around the Cursor.
  settleTransport({ restoreObservation: false, render: false });
  clearProgrammaticPlacement();
  const result = completePlayback(state.session, {
    current: destination,
    departure,
    parentNeighborhood,
    parentResolutionBasis,
    returnModel,
    operator: "contextAccept",
    label: "Set Current from Context"
  });

  if (result.changed) {
    state.session = result.session;
    stepField?.translateToCurrent(currentResolution().C, { preserve: true });
    if (returnProjectionKey !== projectionTopologyKey(model())) {
      view.renderGuide();
    }
    setStatus(
      `Set Current from Context to ${formatTime(currentResolution().C)}.`
    );
  } else {
    stepField?.translateToCurrent(departure, { preserve: true });
    setStatus(`Context stopped at Current ${formatTime(departure)}.`);
  }
  view.render();
  return true;
}

function toggleNativePlayback() {
  if (!state.videoLoaded) return;
  if (transportIs(TRANSPORT_KIND.CONTEXT)) {
    acceptContextCursor();
    return;
  }
  if (transportIs(TRANSPORT_KIND.PLAYBACK)) {
    requestCenterPause();
    return;
  }
  const snapshot = playerSnapshot();
  if ([YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(snapshot.state)) {
    // Native controls can start Center before the corresponding PLAYING event
    // reaches the parent. Materialize that playback transaction first so this
    // Pause has one explicit owner.
    startNativePlaybackSession();
    requestCenterPause();
  } else {
    startFieldPlaybackFromGesture();
  }
}

function rangeLoops() {
  return isProperRange(activeRange(), model().duration);
}

function wrapPlaybackRange(transport = state.transport) {
  if (
    transport?.kind !== TRANSPORT_KIND.PLAYBACK
    || !rangeLoops()
  ) return false;
  const range = activeRange();
  state.transport = rebasePlaybackTransport(transport, range.start);
  placePlayer(range.start);
  player.setRate(1);
  stepField?.resumeAt?.({ center: range.start, reason: "range-wrap" });
  player.play();
  view.renderTransport();
  return true;
}

function heldFieldSpan() {
  const span = state.field?.span;
  return span?.held && span.available ? { start: span.start, end: span.end } : null;
}

function acceptRangeTransition(result, { status, closeGuide = false } = {}) {
  const accepted = accept(result, {
    effect: false,
    renderGuide: true,
    status
  });
  if (!accepted) return false;
  locateAddress(currentResolution().C, { resetField: true });
  if (closeGuide) closeCompactGuideAfterSelection();
  return true;
}

function setRange(start, end, current, label, status) {
  settleBeforeAction();
  const result = setSessionRange(state.session, start, end, current, label);
  if (!result.changed) {
    if (result.reason === "unchanged-range") setStatus("Range is already set to those boundaries.");
    else setStatus("Range must remain within the video and have positive duration.", true);
    return false;
  }
  return acceptRangeTransition(result, { status });
}

function focusSection(sectionId) {
  settleBeforeAction();
  const section = resolveSection(guide(), sectionId);
  if (!section) return;
  const result = focusSessionSection(state.session, sectionId);
  if (!result.changed) {
    setStatus(`“${sectionName(section)}” is already the active Range.`);
    return;
  }
  acceptRangeTransition(result, {
    status: `Focused “${sectionName(section)}” as Range.`,
    closeGuide: true
  });
}

function focusWorkingSection() {
  settleBeforeAction();
  const interval = currentInterval();
  if (!interval) {
    setStatus("Establish a Working Section before focusing it.", true);
    return;
  }
  const result = focusSessionWorkingSection(state.session);
  if (!result.changed) {
    setStatus("The Working Section already owns the active Range.");
    return;
  }
  acceptRangeTransition(result, {
    status: `Focused Working Section ${formatRange(interval)} without saving it.`
  });
}

function leaveSection() {
  settleBeforeAction();
  const result = leaveSessionSection(state.session);
  if (!result.changed) return;
  acceptRangeTransition(result, {
    status: `Restored Range ${formatRange(result.session.model.range)}.`
  });
}

function setSectionFolded(sectionId, collapsed) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return false;
  const name = sectionName(section);
  settleBeforeAction();
  const result = setGuideSectionCollapsed(
    state.session,
    sectionId,
    collapsed
  );
  if (!result.changed) {
    setStatus(
      `“${name}” is already ${collapsed ? "transposed" : "unfolded"}.`
    );
    return false;
  }
  state.selectedRetained = { kind: "section", id: sectionId };
  view.invalidateTimelinePins();
  const nextProjection = projectionForModel(result.session.model);
  const activeFold = nextProjection.folds.find(fold =>
    fold.sectionIds.includes(sectionId)
  );
  const remainingCoverage = nextProjection.folds.filter(fold =>
    fold.start < section.end - EPSILON
    && fold.end > section.start + EPSILON
    && !fold.sectionIds.includes(sectionId)
  );
  accept(result, {
    effect: false,
    renderGuide: true,
    status: collapsed
      ? activeFold
        ? `Transposed “${name}” into a zero-width Fold with ordered endpoint Pins. Playback remains source-contiguous.`
        : `Stored “${name}” as transposed; the active Focus or a hard Range cut currently materializes it.`
      : remainingCoverage.length
        ? `Unfolded “${name}”; ${remainingCoverage.length} overlapping transposed Section${remainingCoverage.length === 1 ? "" : "s"} still cover part of its span.`
        : `Unfolded “${name}” back into lateral source time.`
  });
  return true;
}

function toggleSectionFold(sectionId) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return false;
  return setSectionFolded(sectionId, !section.collapsed);
}

function selectedPinExtent() {
  const pins = state.selectedPinIds
    .map(id => getPin(guide(), id))
    .filter(Boolean)
    .sort((first, second) => first.t - second.t);
  if (pins.length !== 2 || Math.abs(pins[1].t - pins[0].t) <= EPSILON) {
    return null;
  }
  return {
    start: pins[0].t,
    end: pins[1].t,
    startPinId: pins[0].id,
    endPinId: pins[1].id
  };
}

function togglePinPairSelection(pinId) {
  if (!getPin(guide(), pinId)) return false;
  const selected = new Set(state.selectedPinIds);
  const removing = selected.has(pinId);
  if (removing) selected.delete(pinId);
  else {
    if (selected.size >= 2) selected.clear();
    selected.add(pinId);
  }
  state.selectedPinIds = [...selected];
  if (removing) {
    const remaining = state.selectedPinIds.at(-1);
    if (remaining) {
      state.selectedRetained = { kind: "pin", id: remaining };
    } else if (
      state.selectedRetained?.kind === "pin"
      && state.selectedRetained.id === pinId
    ) {
      state.selectedRetained = null;
    }
  } else {
    state.selectedRetained = { kind: "pin", id: pinId };
  }
  if (state.selectedPinIds.length === 2 && elements["section-source"]) {
    elements["section-source"].value = "selected-pins";
  }
  view.renderGuide();
  view.render();
  const extent = selectedPinExtent();
  setStatus(
    extent
      ? `Selected two Pins ${formatRange(extent)}. Name and save them as a Section.`
      : state.selectedPinIds.length
        ? "Selected one Pin. Shift-click another Pin to form a Section."
        : "Cleared Pin selection."
  );
  return true;
}

function pinCurrent(event = null) {
  event?.preventDefault?.();
  const label = elements["pin-label"]?.value?.trim?.() || "";
  settleBeforeAction();
  const result = pinSessionCurrent(state.session, label);
  if (!result.changed) {
    const pin = result.value?.pin;
    setStatus(pin ? `Current is already pinned at ${formatTime(pin.t)}.` : "Current is already pinned.");
    return;
  }
  const { pin } = result.value;
  state.selectedRetained = { kind: "pin", id: pin.id };
  accept(result, {
    renderGuide: true,
    status: `Pinned Current at ${formatTime(pin.t)}.`
  });
  if (elements["pin-label"]) elements["pin-label"].value = "";
  selectGuideTab("pins");
}

function selectedSectionExtent() {
  const kind = elements["section-source"]?.value || "interval";
  return {
    kind,
    extent: kind === "field-span"
      ? heldFieldSpan()
      : kind === "selected-pins"
        ? selectedPinExtent()
        : currentInterval()
  };
}

function saveCurrentIntervalAsSection(event = null) {
  event?.preventDefault?.();
  const label = elements["section-label"].value.trim();
  const { kind, extent } = selectedSectionExtent();
  if (!extent) return setStatus("Establish the selected Extent before saving a Section.", true);
  settleBeforeAction();
  const result = kind === "interval"
    ? saveIntervalAsSection(state.session, label)
    : saveExtentAsSection(
      state.session,
      extent,
      label,
      kind === "selected-pins" ? "selected-pins" : "field-span"
    );
  if (!result.changed) {
    setStatus(
      result.reason === "duplicate-section"
        ? `${label ? `Section “${label}”` : "An untitled Section"} already exists for this Extent.`
        : "The Section could not be saved.",
      result.reason !== "duplicate-section"
    );
    return;
  }
  if (kind === "selected-pins") state.selectedPinIds = [];
  state.selectedRetained = {
    kind: "section",
    id: result.value.section.id
  };
  accept(result, {
    renderGuide: true,
    status: label
      ? `Saved Section “${label}”.`
      : `Saved untitled Section ${formatRange(extent)}.`
  });
  elements["section-label"].value = "";
  selectGuideTab("sections");
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
  openGuideDialog({
    action: "delete-pin",
    id: pinId,
    cascade: references > 0,
    title: "Delete Pin",
    message: references
      ? `Delete “${pin.label || formatTime(pin.t)}” and dissolve the ${references} Section${references === 1 ? "" : "s"} that reference it? This is one Undoable action.`
      : `Delete “${pin.label || formatTime(pin.t)}”? This can be restored with Undo.`,
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

function overwriteSectionById(sectionId) {
  const section = resolveSection(guide(), sectionId);
  const working = currentInterval();
  if (!section) return;
  if (!working) {
    setStatus("Establish a Working Section before overwriting a retained Section.", true);
    return;
  }
  openGuideDialog({
    action: "overwrite-section",
    id: sectionId,
    title: "Overwrite Section",
    message: `Replace “${sectionName(section)}” ${formatRange(section)} with Working Section ${formatRange(working)}?`,
    showInput: false,
    confirmLabel: "Overwrite"
  });
}

function deleteSectionById(sectionId) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return;
  openGuideDialog({
    action: "delete-section",
    id: sectionId,
    title: "Delete Section",
    message: `Delete “${sectionName(section)}”? Unshared endpoint Pins will also be removed.`,
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
    result = deleteGuidePin(state.session, action.id, {
      cascade: action.cascade === true
    });
    const dissolved = result.value?.dissolvedSectionIds?.length || 0;
    status = result.changed
      ? dissolved
        ? `Deleted Pin and dissolved ${dissolved} Section${dissolved === 1 ? "" : "s"}.`
        : "Deleted Pin."
      : "Pin could not be deleted.";
  } else if (action.action === "rename-section") {
    result = renameGuideSection(state.session, action.id, value);
    status = result.changed
      ? value ? "Renamed Section." : "Removed the Section title."
      : result.reason === "duplicate-section"
        ? "A Section with this title and Extent already exists."
        : "Section title is unchanged.";
  } else if (action.action === "overwrite-section") {
    result = overwriteGuideSection(state.session, action.id);
    status = result.changed
      ? `Overwrote “${sectionName(result.value)}” with Working Section ${formatRange(result.value)}.`
      : result.reason === "duplicate-section"
        ? "That overwrite would duplicate an existing Section."
        : result.reason === "unchanged-section"
          ? "The retained Section already matches the Working Section."
          : "Section could not be overwritten.";
  } else if (action.action === "delete-section") {
    result = deleteGuideSection(state.session, action.id);
    status = result.changed ? "Deleted Section." : "Section could not be deleted.";
  }

  if (result?.changed) accept(result, { renderGuide: true, status });
  else setStatus(status, !result);
  closeGuideDialog({ restoreFocus: false });
  restoreGuideMutationFocus(action);
}

function goToPin(pin, operator = "pin", options = {}) {
  if (!pin) return;
  const activeFold = temporalProjection().foldAtSource(pin.t);
  const endpointVisible = activeFold?.boundaryPinIds?.includes(pin.id);
  const carry = options.carryRetained === true || state.carryModifier;
  const hasCarrySelection = carry && Boolean(state.selectedRetained);
  if (!carry) state.selectedRetained = { kind: "pin", id: pin.id };
  moveToAddress(pin.t, {
    operator,
    label: operator === "pin" ? "Go to Pin" : operator,
    transaction: sourceSession => goToSessionGuidePin(sourceSession, pin.id, {
      operator,
      label: operator === "pin" ? "Go to Pin" : operator
    }),
    status: (destination, result) => activeFold
      ? endpointVisible
        ? `Current is at stacked endpoint Pin ${formatTime(destination)}.`
        : `Unfolded ${result.unfoldedSectionIds?.length || activeFold.sectionIds.length} covering Section${(result.unfoldedSectionIds?.length || activeFold.sectionIds.length) === 1 ? "" : "s"} and moved to Pin ${formatTime(destination)}.`
      : `Current is at Pin ${formatTime(destination)}.`,
    renderGuide: true,
    carryRetained: carry
  });
  if (!hasCarrySelection && carry) {
    state.selectedRetained = { kind: "pin", id: pin.id };
    view.renderGuide();
    view.render();
  }
  closeCompactGuideAfterSelection();
}

function goToAdjacentPin(direction, options = {}) {
  const projection = temporalProjection();
  const pin = direction === "backward"
    ? previousPin(guide(), currentResolution().C, activeRange(), projection)
    : nextPin(guide(), currentResolution().C, activeRange(), projection);
  if (!pin) {
    setStatus(`There is no Pin ${direction} within the active Range.`);
    return false;
  }
  const destinationSelection = pin.stopKind === "range-boundary"
    ? null
    : pin.stopKind === "section"
      ? { kind: "section", id: pin.sectionId }
      : { kind: "pin", id: pin.id };
  const carry = options.carryRetained === true || state.carryModifier;
  const hasCarrySelection = carry && Boolean(state.selectedRetained);
  if (!carry && destinationSelection) state.selectedRetained = destinationSelection;
  settleBeforeAction({ replacingContext: true });
  const originModel = snapshotModel(model(), { cloneGuide: carry });
  let result = stepToPinSession(state.session, pin.t, direction, {
    stepSeconds: reachFor(direction)
  });
  if (!result.changed) {
    setStatus(`Current is already at that Pin.`);
    return false;
  }
  result = carryRetainedThrough(
    result,
    originModel,
    carry,
    hasCarrySelection ? state.selectedRetained : null
  );
  const accepted = accept(result, {
    renderGuide: true,
    status: pin.stopKind === "range-boundary"
      ? `Pin ${direction === "backward" ? "Backward" : "Forward"} to ${pin.label} at ${formatTime(pin.t)}.${retainedCarryStatus(result)}`
      : pin.fold
      ? `Pin ${direction === "backward" ? "Backward" : "Forward"} to stacked endpoint ${formatTime(pin.t)}; the Fold remains zero-width laterally.${retainedCarryStatus(result)}`
      : `Pin ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(pin.t)}.${retainedCarryStatus(result)}`
  });
  if (!hasCarrySelection && carry && destinationSelection) {
    state.selectedRetained = destinationSelection;
    view.renderGuide();
    view.render();
  }
  return accepted;
}

function goToSectionMidpoint(sectionId, options = {}) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return;
  const activeFold = temporalProjection().foldAtSource(section.midpoint);
  const carry = options.carryRetained === true || state.carryModifier;
  const hasCarrySelection = carry && Boolean(state.selectedRetained);
  if (!carry) state.selectedRetained = { kind: "section", id: sectionId };
  moveToAddress(section.midpoint, {
    operator: "section",
    label: `Go to Section “${sectionName(section)}”`,
    transaction: sourceSession => goToSessionGuideSection(
      sourceSession,
      sectionId,
      {
        operator: "section",
        label: `Go to Section “${sectionName(section)}”`
      }
    ),
    renderGuide: true,
    carryRetained: carry,
    status: (destination, result) => activeFold
      ? `Unfolded ${result.unfoldedSectionIds?.length || activeFold.sectionIds.length} covering Section${(result.unfoldedSectionIds?.length || activeFold.sectionIds.length) === 1 ? "" : "s"} and moved to the midpoint of “${sectionName(section)}” (${formatTime(destination)}).`
      : `Current is at the midpoint of “${sectionName(section)}” (${formatTime(destination)}).`
  });
  if (!hasCarrySelection && carry) {
    state.selectedRetained = { kind: "section", id: sectionId };
    view.renderGuide();
    view.render();
  }
  closeCompactGuideAfterSelection();
}

function clearMetadataRetry() {
  if (metadataTimer !== null) clearTimeout(metadataTimer);
  metadataTimer = null;
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
  centerPauseRequest = null;
  state.transport = idleTransport();
  state.pendingStep = null;
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  state.rangeDragProjection = null;
  state.selectedRetained = null;
  state.selectedPinIds = [];
  state.guideDrag = null;
  state.field = null;
  state.availableRates = snapshot.availableRates;
  state.playerState = snapshot.state;
  view.invalidateTimelinePins();
  pendingLoad = null;

  locateAddress(requestedStart);
  // Build and cue Tail/Lead before the Center transport surface becomes active.
  // This keeps the first parent-owned playback gesture synchronous across all
  // ready players instead of racing the polling interval.
  stepField?.tick();
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
  view.closePinClusterMenu();
  centerPauseRequest = null;
  state.transport = idleTransport();
  state.videoLoaded = false;
  state.videoId = null;
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  state.rangeDragProjection = null;
  state.selectedRetained = null;
  state.selectedPinIds = [];
  state.guideDrag = null;
  stepField?.resetSources?.();
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

  if (name === YOUTUBE_STATE.PLAYING) {
    if (centerPauseRequest?.cancelOnPlaying) {
      centerPauseRequest = null;
      player.pause();
      view.renderTransport();
      return;
    }
    if (isTransportActive(state.transport)) {
      state.transport = withTransportPhase(state.transport, "playing");
      // Pause can be requested while YouTube still reports its preceding
      // paused/cued state. Reissue the owned command once the iframe confirms
      // that it can consume Pause.
      if (centerPauseRequest && pauseRequestOwns(state.transport)) {
        player.pause();
      }
      view.render();
      return;
    }
    startNativePlaybackSession();
    return;
  }

  if (
    name === YOUTUBE_STATE.PAUSED
    && centerPauseRequest
    && pauseRequestOwns(state.transport)
    && isTransportActive(state.transport)
  ) {
    settlePausedTransport();
    return;
  }

  // Programmatic pauses normally arrive after their owner has already become
  // idle or handed Center to another transport. They must not settle that newer
  // transport. Only the explicit pause intent above may consume one.
  if (name === YOUTUBE_STATE.PAUSED && metadata.internal) {
    centerPauseRequest = null;
    view.renderTransport();
    return;
  }

  if (name === YOUTUBE_STATE.PAUSED && isTransportActive(state.transport)) {
    settlePausedTransport();
    return;
  }

  if (name === YOUTUBE_STATE.ENDED && transportIs(TRANSPORT_KIND.PLAYBACK)) {
    if (wrapPlaybackRange()) return;
    settleTransport({ issuePause: false });
    setStatus("Playback reached Range End.");
    return;
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
  centerPauseRequest = null;
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
  if (!state.videoLoaded || !player || !state.playerReady) {
    stepField?.tick();
    return;
  }
  const now = safeCurrentTime();
  const transport = state.transport;
  const programmaticPlacementActive = programmaticPlacementOwns(now);

  if (
    isTransportActive(transport)
    && transport.phase === "playing"
    && state.playerState === YOUTUBE_STATE.PAUSED
  ) {
    settlePausedTransport();
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
  } else if (transport.kind === TRANSPORT_KIND.PLAYBACK && state.playerState === YOUTUBE_STATE.PLAYING) {
    if (!transport.enteredPath) {
      const entry = Number.isFinite(transport.entry)
        ? transport.entry
        : transport.departure;
      const entered = now >= entry - NATIVE_POSITION_TOLERANCE_SECONDS
        && now <= entry + 1.5;
      if (entered) transport.enteredPath = true;
      else if (Date.now() - transport.startedAt > TRANSPORT_START_GRACE_MS) {
        transport.startedAt = Date.now();
        placePlayer(entry);
        player.setRate(1);
        player.play();
      }
      stepField?.tick();
      view.renderTransport();
      return;
    }
    if (now < activeRange().start - EPSILON) {
      placePlayer(activeRange().start);
    } else if (now >= activeRange().end - EPSILON) {
      if (wrapPlaybackRange(transport)) return;
      settleTransport();
      setStatus("Playback reached Range End.");
      return;
    }
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

  // Transport owns discontinuities such as Range wrap. Resolve those first so
  // the Field observes the rebased Center once instead of reacting to the
  // out-of-window frame and then being placed again by the wrap.
  stepField?.tick();
  view.renderTransport();
}

function timeFromPointer(
  event,
  projection = temporalProjection(),
  constrainToRange = false
) {
  const rect = elements.timeline.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) return currentResolution().C;
  const traversal = clamp(
    (event.clientX - rect.left) / rect.width,
    0,
    1
  ) * projection.effectiveDuration;
  const direction = traversal < projection.sourceToTraversal(currentResolution().C)
    ? "backward"
    : "forward";
  const source = projection.traversalToSource(traversal, direction);
  if (!constrainToRange) return source;
  const range = activeRange();
  const projectedStart = projection.sourceToTraversal(range.start);
  const projectedEnd = projection.sourceToTraversal(range.end);
  if (
    traversal < Math.min(projectedStart, projectedEnd) - EPSILON
    || traversal > Math.max(projectedStart, projectedEnd) + EPSILON
  ) {
    return source;
  }
  // A collapsed point has two source faces. Once the visible coordinate is
  // inside Range, clamp only that inverse ambiguity so direct traversal cannot
  // escape through the Fold's excluded face.
  return clamp(source, range.start, range.end);
}

function sourceFromPointerInProjection(
  event,
  coordinateProjection,
  originSource,
  inverseProjection = coordinateProjection
) {
  const rect = elements.timeline.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) return originSource;
  const traversal = clamp(
    (event.clientX - rect.left) / rect.width,
    0,
    1
  ) * coordinateProjection.effectiveDuration;
  const direction = traversal < coordinateProjection.sourceToTraversal(originSource)
    ? "backward"
    : "forward";
  return inverseProjection.traversalToSource(traversal, direction);
}

function beginGuideDrag(kind, id, event, options = {}) {
  if (
    !state.videoLoaded
    || state.dragHandle
    || state.guideDrag
    || (Number.isFinite(event.button) && event.button !== 0)
  ) return;
  const pin = kind === "pin" ? getPin(guide(), id) : null;
  const section = kind === "section" ? resolveSection(guide(), id) : null;
  if (!pin && !section) return;
  if (
    pin
    && projectionForModel(model()).foldAtSource(pin.t)
    && options.axis !== "vertical"
  ) {
    // Pins inside a Fold are not lateral drag operands. Visible Fold endpoints
    // opt into the perpendicular drag axis; hidden interior Pins require an
    // explicit Guide Go, Focus, or Unfold first.
    return;
  }
  state.guideDrag = {
    kind,
    id,
    pointerId: event.pointerId,
    originClientX: event.clientX,
    originClientY: event.clientY,
    axis: options.axis || "horizontal",
    foldStart: options.foldStart,
    foldEnd: options.foldEnd,
    foldRect: options.foldElement?.getBoundingClientRect?.() || null,
    originSource: pin?.t ?? section.start,
    originSection: section
      ? { start: section.start, end: section.end }
      : null,
    originModel: null,
    originHistory: null,
    originFuture: null,
    projection: projectionForModel(model()),
    inverseProjection: null,
    moved: false,
    changed: false,
    blockedReason: null,
    rangeChanged: false
  };
  try {
    elements.timeline.setPointerCapture?.(event.pointerId);
  } catch {
    // Document-level release listeners retain the drag lifecycle when pointer
    // capture is unavailable for this pointer.
  }
}

function updateGuideDrag(event) {
  const drag = state.guideDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const distance = drag.axis === "vertical"
    ? Math.abs(event.clientY - drag.originClientY)
    : Math.abs(event.clientX - drag.originClientX);
  if (!drag.moved && distance < 4) return;
  if (!drag.moved) {
    // Keep the pointer-down semantic projection authoritative while transport
    // settles so drag geometry cannot shift beneath the pointer.
    drag.moved = true;
    settleBeforeAction();
    const pin = drag.kind === "pin" ? getPin(guide(), drag.id) : null;
    const section = drag.kind === "section"
      ? resolveSection(guide(), drag.id)
      : null;
    if (!pin && !section) {
      drag.blockedReason = "missing-retained-object";
      return;
    }
    drag.originSource = pin?.t ?? section.start;
    drag.originSection = section
      ? { start: section.start, end: section.end }
      : null;
    drag.originModel = snapshotModel(model(), { cloneGuide: true });
    drag.originHistory = state.session.history;
    drag.originFuture = state.session.future || [];
    drag.projection = projectionForModel(drag.originModel);
    drag.inverseProjection = section
      ? projectionForModel(drag.originModel, {
          expandedSectionIds: [section.id]
        })
      : drag.projection;
  }
  event.preventDefault?.();
  event.stopPropagation?.();

  let source;
  if (
    drag.axis === "vertical"
    && drag.foldRect
    && Number.isFinite(drag.foldStart)
    && Number.isFinite(drag.foldEnd)
  ) {
    const rect = drag.foldRect;
    const secondsPerPixel = rect.height > 0
      ? (drag.foldEnd - drag.foldStart) / rect.height
      : 0;
    source = drag.originSource
      - (event.clientY - drag.originClientY) * secondsPerPixel;
  } else {
    source = sourceFromPointerInProjection(
      event,
      drag.projection,
      drag.originSource,
      drag.inverseProjection
    );
  }
  const baseSession = {
    model: drag.originModel,
    history: drag.originHistory,
    future: drag.originFuture
  };
  const result = drag.kind === "pin"
    ? moveGuidePin(baseSession, drag.id, source, { amend: true })
    : moveGuideSection(
        baseSession,
        drag.id,
        source - drag.originSection.start,
        { amend: true }
      );
  if (result.changed) {
    state.session = result.session;
    drag.changed = true;
    drag.blockedReason = null;
    drag.rangeChanged = Boolean(result.rangeChanged);
  } else if (["unchanged-pin", "unchanged-section"].includes(result.reason)) {
    state.session = baseSession;
    drag.changed = false;
    drag.blockedReason = null;
    drag.rangeChanged = false;
  } else {
    drag.blockedReason = result.reason || "unavailable";
  }
  state.selectedRetained = { kind: drag.kind, id: drag.id };
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
}

function finishGuideDrag(event, options = {}) {
  const drag = state.guideDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) {
    return false;
  }
  state.guideDrag = null;
  try {
    if (
      !elements.timeline.hasPointerCapture
      || elements.timeline.hasPointerCapture(drag.pointerId)
    ) {
      elements.timeline.releasePointerCapture?.(drag.pointerId);
    }
  } catch {
    // The document-level release remains authoritative if capture was lost.
  }
  if (!drag.moved || options.cancel === true) {
    if (options.cancel === true && drag.moved) {
      state.session = {
        model: drag.originModel,
        history: drag.originHistory,
        future: drag.originFuture
      };
      view.invalidateTimelinePins();
      view.renderGuide();
      view.render();
    }
    return false;
  }

  state.guideClickSuppressed = true;
  window.setTimeout(() => {
    state.guideClickSuppressed = false;
  }, 0);
  if (!drag.changed) {
    setStatus(
      drag.blockedReason === "invalid-guide-topology"
        ? "That move would collapse or reverse one of the linked Sections."
        : "The retained object stayed at its original Address."
    );
    view.render();
    return false;
  }

  const label = drag.kind === "pin" ? "Move Pin" : "Move Section";
  const committed = checkpoint(state.session, label, drag.originModel);
  state.session = committed.session;
  const guidePersisted = persistGuide();
  if (drag.rangeChanged) {
    locateAddress(currentResolution().C, { resetField: true });
  } else if (
    projectionTopologyKey(drag.originModel) !== projectionTopologyKey(model())
  ) {
    stepField?.translateToCurrent(currentResolution().C, { preserve: true });
  }
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
  const value = drag.kind === "pin"
    ? getPin(guide(), drag.id)
    : resolveSection(guide(), drag.id);
  if (guidePersisted) {
    setStatus(
      drag.kind === "pin"
        ? `Moved Pin to ${formatTime(value?.t)}.`
        : `Moved “${sectionName(value)}” to ${formatRange(value)}.`
    );
  }
  return true;
}

function handleTimelineClick(event) {
  if (!state.videoLoaded || state.dragHandle) return;
  if (
    event.target.closest(".range-handle")
    || event.target.closest(".timeline-pin")
    || event.target.closest(".pin-cluster-menu")
  ) return;
  view.closePinClusterMenu();
  const time = timeFromPointer(event, temporalProjection(), true);
  if (!contains(activeRange(), time)) {
    setStatus("That Address is outside Range.", true);
    return;
  }
  moveToAddress(time, {
    operator: "timeline",
    label: "Timeline Click",
    carryRetained: event.altKey === true,
    status: destination => `Clicked to ${formatTime(destination)}.`
  });
}

function beginRangeDrag(kind, event) {
  if (!state.videoLoaded) return;
  event.preventDefault();
  event.stopPropagation();
  state.dragHandle = kind;
  state.rangeDragProjection = projectionForModel(model());
  // Range owns the semantic projection visible at pointer-down.
  settleBeforeAction();
  state.rangeDragOrigin = snapshotModel(model());
  state.rangeDragProjection = projectionForModel(state.rangeDragOrigin);
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function updateRangeDrag(event) {
  if (!state.dragHandle || !state.videoLoaded || !state.rangeDragOrigin) return;
  const origin = state.rangeDragOrigin;
  const time = timeFromPointer(
    event,
    state.rangeDragProjection || projectionForModel(origin)
  );
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
    state.session = {
      model: origin,
      history: state.session.history,
      future: state.session.future || []
    };
  } else {
    const baseSession = {
      model: origin,
      history: state.session.history,
      future: state.session.future || []
    };
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
  state.rangeDragProjection = null;
  if (changed) {
    state.session = checkpoint(state.session, "Adjust Range", origin).session;
    locateAddress(currentResolution().C, { resetField: true });
    view.renderGuide();
    setStatus(`Range set to ${formatRange(activeRange())}.`);
  } else if (origin) {
    state.session = {
      model: origin,
      history: state.session.history,
      future: state.session.future || []
    };
  }
  view.render();
}

function cancelRangeDrag() {
  if (!state.dragHandle) return false;
  const origin = state.rangeDragOrigin;
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  state.rangeDragProjection = null;
  if (origin) {
    state.session = {
      model: origin,
      history: state.session.history,
      future: state.session.future || []
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
  else {
    value = temporalProjection().sourceStep(
      value,
      amount,
      forward ? "forward" : "backward",
      { start: 0, end: model().duration }
    );
  }

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

function commitStepReach(nextReach, label, options = {}) {
  if (!state.videoLoaded) {
    preferences.stepReach = normalizeStepReach(nextReach);
    state.session = createSession({ stepReach: preferences.stepReach });
    persistPreferences();
    view.render();
    return false;
  }
  if (options.settle !== false) settleBeforeAction({ replacingContext: true });
  const result = setSessionStepReach(state.session, nextReach, label);
  if (!result.changed) {
    view.render();
    return false;
  }
  state.session = result.session;
  persistPreferences();
  const effective = currentStepReach();
  setStatus(
    result.stepReach.mode === STEP_REACH_MODE.ADAPTIVE
      ? `${label}: 1/${Math.round(1 / result.stepReach.fraction)} of active Range (${effective.forward.toFixed(2)}s lateral).`
      : `${label}: ${result.stepReach.forward}s.`
  );
  view.render();
  return true;
}

function adjustStepPreset(direction) {
  const current = configuredStepReach();
  if (current.mode === STEP_REACH_MODE.ADAPTIVE) {
    const index = STEP_FRACTIONS.findIndex(value =>
      Math.abs(value - current.fraction) <= Number.EPSILON
    );
    const start = index >= 0 ? index : 1;
    const nextIndex = clamp(start + direction, 0, STEP_FRACTIONS.length - 1);
    commitStepReach({
      ...current,
      fraction: STEP_FRACTIONS[nextIndex]
    }, direction < 0 ? "Decrease Adaptive Step" : "Increase Adaptive Step");
    return;
  }
  const amount = presetStep(current.forward, direction);
  commitStepReach({
    ...current,
    backward: amount,
    forward: amount,
    linked: true
  }, direction < 0 ? "Decrease Step Reach" : "Increase Step Reach");
}

function changeStepSeconds(value) {
  const amount = clamp(Number(value), 0.25, 300);
  if (!Number.isFinite(amount)) return;
  const current = configuredStepReach();
  commitStepReach({
    ...current,
    backward: amount,
    forward: amount,
    linked: true,
    mode: STEP_REACH_MODE.FIXED
  }, "Set Step Reach");
}

function setStepMode(mode) {
  const current = configuredStepReach();
  const nextMode = mode === STEP_REACH_MODE.ADAPTIVE
    ? STEP_REACH_MODE.ADAPTIVE
    : STEP_REACH_MODE.FIXED;
  commitStepReach(
    { ...current, mode: nextMode },
    nextMode === STEP_REACH_MODE.ADAPTIVE
      ? "Use Range-relative Step"
      : "Use Manual Step"
  );
}

function setStepFraction(value) {
  const fraction = Number(value);
  if (!STEP_FRACTIONS.some(item => Math.abs(item - fraction) <= Number.EPSILON)) return;
  commitStepReach({
    ...configuredStepReach(),
    mode: STEP_REACH_MODE.ADAPTIVE,
    fraction
  }, `Set Adaptive Step to 1/${Math.round(1 / fraction)}`);
}

function changeFieldOffset(direction, value) {
  const amount = clamp(Number(value), 0.25, 300);
  if (!Number.isFinite(amount)) return;
  state.lastStepReachEdited = direction;
  state.fieldOffsets = normalizeStepReach({
    ...currentFieldOffsets(),
    [direction]: amount,
    linked: false,
    mode: STEP_REACH_MODE.FIXED
  });
  persistPreferences();
  stepField?.translateToCurrent(currentResolution()?.C || 0, {
    preserve: true
  });
  setStatus(`${direction === "backward" ? "Tail" : "Lead"} Field offset set to ${amount}s.`);
  view.render();
}

function syncContextControl() {
  elements["context-seconds"].value = String(state.contextSeconds);
}

function selectGuideTab(tab, { focus = false } = {}) {
  const names = ["sections", "pins"];
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
  if (state.guideDrag) return finishGuideDrag(null, { cancel: true });
  if (guideDialogOpen()) return closeGuideDialog();
  if (!elements["pin-cluster-menu"].hidden) {
    view.closePinClusterMenu({ restoreFocus: true });
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
      onReady: adapter => {
        state.playerReady = true;
        const iframe = adapter.raw?.()?.getIframe?.();
        iframe?.setAttribute?.("tabindex", "-1");
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
      range: activeFieldRange(),
      // Step Field offsets are physical observation settings. They are
      // intentionally independent from the semantic Step Reach.
      stepReach: currentFieldOffsets(),
      transportKind: state.transport.kind,
      pendingStep: Boolean(state.pendingStep),
      dragging: Boolean(state.dragHandle || state.guideDrag?.moved),
      center: playerSnapshot(),
      playerState: state.playerState
    }),
    getPreferences: () => ({
      stepFieldEnabled: state.stepFieldEnabled,
      tailVisible: state.tailVisible,
      leadVisible: state.leadVisible,
      tailRate: state.fieldResponse.tailRate,
      leadRate: state.fieldResponse.leadRate
    }),
    setPreferences: patch => {
      if (Object.hasOwn(patch, "stepFieldEnabled")) state.stepFieldEnabled = Boolean(patch.stepFieldEnabled);
      if (Object.hasOwn(patch, "tailVisible")) state.tailVisible = Boolean(patch.tailVisible);
      if (Object.hasOwn(patch, "leadVisible")) state.leadVisible = Boolean(patch.leadVisible);
      if (Object.hasOwn(patch, "tailRate") || Object.hasOwn(patch, "leadRate")) {
        state.fieldResponse = normalizeFieldResponse({ ...state.fieldResponse, ...patch });
      }
      persistPreferences();
    },
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
elements.timeline.addEventListener("pointermove", updateGuideDrag);
elements.timeline.addEventListener("pointerup", finishRangeDrag);
elements.timeline.addEventListener("pointerup", finishGuideDrag);
elements.timeline.addEventListener("pointercancel", cancelRangeDrag);
elements.timeline.addEventListener("pointercancel", event => {
  finishGuideDrag(event, { cancel: true });
});
document.addEventListener("pointerup", finishGuideDrag);
document.addEventListener("pointercancel", event => {
  finishGuideDrag(event, { cancel: true });
});
document.addEventListener("pointermove", event => {
  if (elements.timeline.contains?.(event.target)) return;
  updateGuideDrag(event);
});
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
  if (state.guideClickSuppressed) {
    event.stopPropagation();
    return;
  }
  const pinButton = event.target.closest("[data-pin-go]");
  if (pinButton) {
    event.stopPropagation();
    if (event.shiftKey) {
      togglePinPairSelection(pinButton.dataset.pinGo);
      return;
    }
    goToPin(
      getPin(guide(), pinButton.dataset.pinGo),
      "pin",
      { carryRetained: event.altKey === true }
    );
    return;
  }
  const clusterButton = event.target.closest("[data-cluster-index]");
  if (clusterButton) {
    event.stopPropagation();
    const cluster = view.clusterAt(Number(clusterButton.dataset.clusterIndex));
    if (cluster) view.openPinClusterMenu(cluster, clusterButton);
  }
});
elements["pin-lane"].addEventListener("pointerdown", event => {
  const pinButton = event.target.closest("[data-pin-go]");
  if (pinButton) beginGuideDrag("pin", pinButton.dataset.pinGo, event);
});
elements["section-lane"].addEventListener("click", event => {
  if (state.guideClickSuppressed) {
    event.stopPropagation();
    return;
  }
  const expand = event.target.closest("[data-section-expand]");
  if (expand) {
    event.stopPropagation();
    setSectionFolded(expand.dataset.sectionExpand, false);
    return;
  }
  const collapse = event.target.closest("[data-section-collapse]");
  if (collapse) {
    event.stopPropagation();
    setSectionFolded(collapse.dataset.sectionCollapse, true);
    return;
  }
  const body = event.target.closest("[data-section-drag]");
  if (body) {
    event.stopPropagation();
    state.selectedRetained = {
      kind: "section",
      id: body.dataset.sectionDrag
    };
    view.renderGuide();
    view.render();
    const section = resolveSection(guide(), body.dataset.sectionDrag);
    setStatus(`Selected ${section?.label || formatRange(section)}.`);
  }
});
elements["section-lane"].addEventListener("pointerdown", event => {
  const body = event.target.closest("[data-section-drag]");
  if (body) {
    beginGuideDrag("section", body.dataset.sectionDrag, event);
    return;
  }
  const sectionPin = event.target.closest("[data-section-expand]");
  if (sectionPin) {
    beginGuideDrag("section", sectionPin.dataset.sectionExpand, event);
  }
});
elements["fold-lane"].addEventListener("click", event => {
  if (state.guideClickSuppressed) {
    event.stopPropagation();
    return;
  }
  const axis = event.target.closest("[data-fold-axis]");
  if (axis) {
    event.stopPropagation();
    setStatus("A Fold interior is source time, not a navigation axis. Use an endpoint Pin or the center hinge.");
    return;
  }
  const pin = event.target.closest("[data-pin-go]");
  if (pin) {
    event.stopPropagation();
    if (event.shiftKey) {
      togglePinPairSelection(pin.dataset.pinGo);
      return;
    }
    goToPin(
      getPin(guide(), pin.dataset.pinGo),
      "Fold Endpoint",
      { carryRetained: event.altKey === true }
    );
    return;
  }
  const expand = event.target.closest("[data-section-expand]");
  if (expand) {
    event.stopPropagation();
    setSectionFolded(expand.dataset.sectionExpand, false);
    return;
  }
  const contributors = event.target.closest("[data-fold-contributors]");
  if (contributors) {
    event.stopPropagation();
    const ids = contributors.dataset.foldContributors.split(",").filter(Boolean);
    if (
      state.selectedRetained?.kind !== "section"
      || !ids.includes(state.selectedRetained.id)
    ) state.selectedRetained = null;
    openGuide("sections");
    view.renderGuide();
    view.render();
    setStatus(`${ids.length} Sections share this Fold. Select the colored rail or Guide row to unfold one.`);
  }
});
elements["fold-lane"].addEventListener("pointerdown", event => {
  const pin = event.target.closest(".timeline-fold-pin[data-pin-go]");
  if (pin) {
    const foldElement = pin.closest(".timeline-fold");
    beginGuideDrag("pin", pin.dataset.pinGo, event, {
      axis: "vertical",
      foldStart: Number(foldElement?.dataset.foldStart),
      foldEnd: Number(foldElement?.dataset.foldEnd),
      foldElement
    });
    return;
  }
  const section = event.target.closest(".timeline-fold-rail[data-section-expand]");
  if (section) beginGuideDrag("section", section.dataset.sectionExpand, event);
});
elements["pin-cluster-menu"].addEventListener("click", event => {
  if (state.guideClickSuppressed) {
    event.stopPropagation();
    return;
  }
  const button = event.target.closest("[data-pin-go]");
  if (!button) return;
  event.stopPropagation();
  if (event.shiftKey) {
    togglePinPairSelection(button.dataset.pinGo);
    return;
  }
  view.closePinClusterMenu();
  goToPin(
    getPin(guide(), button.dataset.pinGo),
    "pin",
    { carryRetained: event.altKey === true }
  );
});
elements["pin-cluster-menu"].addEventListener("pointerdown", event => {
  const button = event.target.closest("[data-pin-go]");
  if (button) beginGuideDrag("pin", button.dataset.pinGo, event);
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
elements["go-range-start"].addEventListener("click", event => {
  moveToAddress(activeRange().start, {
    operator: "rangeStart",
    label: "Go to Range Start",
    carryRetained: event.altKey === true,
    status: destination => `Moved to Range Start at ${formatTime(destination)}.`
  });
});
elements["range-midpoint"].addEventListener("click", event => {
  const middle = temporalProjection().sourceMidpoint(
    activeRange().start,
    activeRange().end
  );
  moveToAddress(middle, {
    operator: "rangeMidpoint",
    label: "Go to Range Midpoint",
    carryRetained: event.altKey === true,
    status: destination => `Moved to Range midpoint at ${formatTime(destination)}.`
  });
});
elements["go-range-end"].addEventListener("click", event => {
  moveToAddress(activeRange().end, {
    operator: "rangeEnd",
    label: "Go to Range End",
    carryRetained: event.altKey === true,
    status: destination => `Moved to Range End at ${formatTime(destination)}.`
  });
});
elements["full-video-range"].addEventListener("click", () => {
  setRange(0, model().duration, currentResolution().C, "Full Video Range", "Restored Full Video Range.");
});

// Navigation and observation

elements["refine-backward"].addEventListener("click", event => {
  const local = event.shiftKey === true || state.shiftLayer;
  refine("backward", {
    local,
    carryRetained: event.altKey === true
  });
  if (state.shiftLayer) {
    state.shiftLayer = false;
    view.render();
  }
});
elements["refine-forward"].addEventListener("click", event => {
  const local = event.shiftKey === true || state.shiftLayer;
  refine("forward", {
    local,
    carryRetained: event.altKey === true
  });
  if (state.shiftLayer) {
    state.shiftLayer = false;
    view.render();
  }
});
elements.reopen.addEventListener("click", reopenFully);
elements["switch-endpoint"].addEventListener("click", event => {
  switchCurrentEndpoint({
    carryRetained: event.altKey === true
  });
});
elements.release.addEventListener("click", releaseWorkingInterval);
elements.transpose.addEventListener("click", transposeWorkingOrSelected);
elements["focus-toggle"].addEventListener("click", focusOrUnfocus);
elements["shift-layer-toggle"].addEventListener("click", () => {
  state.shiftLayer = !state.shiftLayer;
  view.render();
});
elements["return-action"].addEventListener("click", undoLastAction);
elements["redo-action"].addEventListener("click", redoLastAction);
elements["center-transport-surface"].addEventListener("click", toggleNativePlayback);

const tapStep = selection => {
  if (!selection) return false;
  if (selection.pinTraversal) {
    const changed = goToAdjacentPin(selection.direction, {
      carryRetained: selection.carryRetained === true
    });
    if (state.shiftLayer) {
      state.shiftLayer = false;
      view.render();
    }
    return changed;
  }
  return performStep(selection.direction, selection.distance, {
    carryRetained: selection.carryRetained === true
  });
};
const directionalStep = direction => event => {
  const pinTraversal = event?.shiftKey === true || state.shiftLayer;
  return {
    direction,
    pinTraversal,
    distance: reachFor(direction),
    carryRetained: event?.altKey === true || state.carryModifier
  };
};
const sideStep = role => event => {
  const selection = stepField?.getStepSelection?.(role) || null;
  return selection
    ? {
        ...selection,
        carryRetained: event?.altKey === true || state.carryModifier
      }
    : null;
};

for (const binding of [
  [elements["step-backward"], "matrix:backward", directionalStep("backward"), true],
  [elements["step-forward"], "matrix:forward", directionalStep("forward"), true],
  [elements["tail-step-button"], "field-button:tail", sideStep("tail"), true],
  [elements["lead-step-button"], "field-button:lead", sideStep("lead"), true],
  [elements["tail-player-surface"], "field-surface:tail", sideStep("tail"), true],
  [elements["lead-player-surface"], "field-surface:lead", sideStep("lead"), true]
]) {
  const [control, id, resolveStep, keyboardActivation] = binding;
  bindStepPress(control, {
    id,
    controller: stepGesture,
    resolveStep,
    tap: tapStep,
    keyboardActivation
  });
}

elements["context-seconds"].addEventListener("change", event => {
  const previous = state.contextSeconds;
  state.contextSeconds = normalizeContextSeconds(event.target.value, previous);
  event.target.value = String(state.contextSeconds);
  persistPreferences();
  if (transportIs(TRANSPORT_KIND.CONTEXT)) {
    if (state.contextSeconds === 0) {
      settleTransport();
      setStatus("Automatic Context turned off.");
    } else {
      startContext(currentResolution().C, { retarget: true });
      setStatus(`Automatic Context updated to ${state.contextSeconds}s.`);
    }
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

// Step Field geometry
elements["step-backward-seconds"].addEventListener("change", event => {
  changeFieldOffset("backward", event.target.value);
});
elements["step-forward-seconds"].addEventListener("change", event => {
  changeFieldOffset("forward", event.target.value);
});
elements["step-size-seconds"].addEventListener("change", event => {
  changeStepSeconds(event.target.value);
});
elements["step-mode-fixed"].addEventListener("click", () => {
  setStepMode(STEP_REACH_MODE.FIXED);
});
elements["step-mode-adaptive"].addEventListener("click", () => {
  setStepMode(STEP_REACH_MODE.ADAPTIVE);
});
for (const control of document.querySelectorAll("[data-step-fraction]")) {
  control.addEventListener("click", () => {
    setStepFraction(control.dataset.stepFraction);
  });
}

// Guide creation and Range affordances
elements["section-capture"].addEventListener("submit", saveCurrentIntervalAsSection);
elements["section-label"].addEventListener("input", view.render);
elements["section-source"].addEventListener("change", view.render);
elements["focus-working-section"].addEventListener("click", focusWorkingSection);
elements["pin-capture"].addEventListener("submit", pinCurrent);
elements["pin-label"].addEventListener("input", view.render);
elements["range-state"].addEventListener("click", toggleRangeTools);
elements["range-tools"].addEventListener("toggle", () => {
  elements["range-state"].setAttribute("aria-expanded", String(elements["range-tools"].open));
});
elements["leave-section"].addEventListener("click", leaveSection);

// Guide
elements["guide-toggle"].addEventListener("click", () => toggleGuide());
elements["guide-close"].addEventListener("click", closeGuide);
elements["guide-scrim"].addEventListener("click", closeGuide);
elements["guide-tab-sections"].addEventListener("click", () => selectGuideTab("sections"));
elements["guide-tab-pins"].addEventListener("click", () => selectGuideTab("pins"));
for (const id of ["guide-tab-sections", "guide-tab-pins"]) {
  elements[id].addEventListener("keydown", handleGuideTabKeydown);
}
elements["guide-dialog-form"].addEventListener("submit", submitGuideDialog);
elements["guide-dialog-cancel"].addEventListener("click", () => closeGuideDialog());
elements["guide-dialog"].addEventListener("cancel", event => {
  event.preventDefault?.();
  closeGuideDialog();
});

function handleGuideTabKeydown(event) {
  const names = ["sections", "pins"];
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
  if (pinGo) {
    return goToPin(
      getPin(guide(), pinGo.dataset.pinGo),
      "pin",
      { carryRetained: event.altKey === true }
    );
  }
  const selectPin = event.target.closest("[data-select-pin]");
  if (selectPin) return togglePinPairSelection(selectPin.dataset.selectPin);
  const sectionGo = event.target.closest("[data-section-go]");
  if (sectionGo) {
    return goToSectionMidpoint(
      sectionGo.dataset.sectionGo,
      { carryRetained: event.altKey === true }
    );
  }
  const focus = event.target.closest("[data-focus-section]");
  if (focus) return focusSection(focus.dataset.focusSection);
  const collapse = event.target.closest("[data-collapse-section]");
  if (collapse) return setSectionFolded(collapse.dataset.collapseSection, true);
  const expand = event.target.closest("[data-expand-section]");
  if (expand) return setSectionFolded(expand.dataset.expandSection, false);
  const leave = event.target.closest("[data-leave-section]");
  if (leave) return leaveSection();
  const renamePinButton = event.target.closest("[data-rename-pin]");
  if (renamePinButton) return renamePinById(renamePinButton.dataset.renamePin);
  const deletePinButton = event.target.closest("[data-delete-pin]");
  if (deletePinButton) return deletePinById(deletePinButton.dataset.deletePin);
  const renameSectionButton = event.target.closest("[data-rename-section]");
  if (renameSectionButton) return renameSectionById(renameSectionButton.dataset.renameSection);
  const overwriteSectionButton = event.target.closest("[data-overwrite-section]");
  if (overwriteSectionButton) {
    return overwriteSectionById(overwriteSectionButton.dataset.overwriteSection);
  }
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

// Context is an active listening surface, so its Space command owns the key
// before a previously focused traversal button can consume it as native button
// activation. Text editing and modal Guide work retain ordinary keyboard rules.
document.addEventListener("keydown", event => {
  if (event.key === "Alt") {
    state.carryModifier = true;
  }
  if (event.key === "Shift" && !state.shiftKeyHeld) {
    state.shiftKeyHeld = true;
    view.render();
  }
  const activeElement = document.activeElement;
  const editing = ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement?.tagName)
    || activeElement?.isContentEditable === true;
  const plainSpace = (event.key === " " || event.code === "Space")
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.shiftKey;
  if (
    !plainSpace
    || event.repeat
    || editing
    || guideDialogOpen()
    || !transportIs(TRANSPORT_KIND.CONTEXT)
  ) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  acceptContextCursor();
}, true);

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
  const carryChord = event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
  const spatialKey = expected => plain && (code === `Key${expected.toUpperCase()}` || key === expected);
  const carrySpatialKey = expected => carryChord
    && (code === `Key${expected.toUpperCase()}` || key === expected);
  const commandUndo = plain && key === "z";
  const commandRedo = plain && key === "c";

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

  const repeatableStep = (plain || carryChord)
    && (
      event.key === "ArrowLeft"
      || event.key === "ArrowRight"
      || code === "KeyA"
      || code === "KeyD"
    );
  if (event.repeat && !repeatableStep) return;

  // Space already activates a focused button or summary natively. Avoid toggling playback twice.
  if (event.key === " " && ["BUTTON", "SUMMARY"].includes(tag)) return;

  const shiftedSpatialKey = expected =>
    event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && (code === `Key${expected.toUpperCase()}` || key === expected);

  if (spatialKey("w") || carrySpatialKey("w")) { event.preventDefault(); reopenFully(); }
  else if (spatialKey("q") || carrySpatialKey("q")) {
    event.preventDefault();
    refine("backward", { carryRetained: carryChord });
  }
  else if (spatialKey("s") || carrySpatialKey("s")) {
    event.preventDefault();
    switchCurrentEndpoint({ carryRetained: carryChord });
  }
  else if (spatialKey("e") || carrySpatialKey("e")) {
    event.preventDefault();
    refine("forward", { carryRetained: carryChord });
  }
  else if (shiftedSpatialKey("q")) {
    event.preventDefault();
    refine("backward", {
      local: true,
      carryRetained: event.altKey === true
    });
  }
  else if (shiftedSpatialKey("e")) {
    event.preventDefault();
    refine("forward", {
      local: true,
      carryRetained: event.altKey === true
    });
  }
  else if (plain && key === "r") {
    event.preventDefault();
    releaseWorkingInterval();
  }
  else if (plain && key === "t") {
    event.preventDefault();
    transposeWorkingOrSelected();
  }
  else if (plain && key === "f") {
    event.preventDefault();
    focusOrUnfocus();
  }
  else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key === "p") {
    event.preventDefault();
    openGuide("sections");
    elements["section-label"]?.focus?.({ preventScroll: true });
  }
  else if (plain && key === "p") {
    event.preventDefault();
    openGuide("pins");
    elements["pin-label"]?.focus?.({ preventScroll: true });
  }
  else if (shiftedSpatialKey("a") || (
    event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && event.key === "ArrowLeft"
  )) {
    event.preventDefault();
    goToAdjacentPin("backward", { carryRetained: event.altKey === true });
  }
  else if (shiftedSpatialKey("d") || (
    event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && event.key === "ArrowRight"
  )) {
    event.preventDefault();
    goToAdjacentPin("forward", { carryRetained: event.altKey === true });
  }
  else if (
    (plain || carryChord)
    && (event.key === "ArrowLeft" || code === "KeyA")
  ) {
    event.preventDefault();
    stepGesture.begin(`keyboard:${event.key}`, directionalStep("backward"));
  }
  else if (
    (plain || carryChord)
    && (event.key === "ArrowRight" || code === "KeyD")
  ) {
    event.preventDefault();
    stepGesture.begin(`keyboard:${event.key}`, directionalStep("forward"));
  }
  else if (plain && event.key === "[") { event.preventDefault(); adjustStepPreset(-1); }
  else if (plain && event.key === "]") { event.preventDefault(); adjustStepPreset(1); }
  else if (commandUndo) { event.preventDefault(); undoLastAction(); }
  else if (commandRedo) { event.preventDefault(); redoLastAction(); }
  else if (plain && event.key === " ") { event.preventDefault(); toggleNativePlayback(); }
});

document.addEventListener("keyup", event => {
  if (event.key === "Alt") {
    state.carryModifier = false;
    return;
  }
  if (event.key === "Shift") {
    state.shiftKeyHeld = false;
    view.render();
    return;
  }
  if (
    event.key !== "ArrowLeft"
    && event.key !== "ArrowRight"
    && event.code !== "KeyA"
    && event.code !== "KeyD"
  ) return;
  const gestureId = `keyboard:${event.key}`;
  if (!stepGesture.isActive(gestureId)) return;
  event.preventDefault();
  stepGesture.end(gestureId, { observe: true });
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  stepGesture.cancel({ observe: false });
  if (isTransportActive(state.transport)) {
    settleTransport();
    setStatus("Playback paused because the document became hidden.");
  }
});

window.addEventListener("blur", () => {
  state.carryModifier = false;
  stepGesture.cancel({ observe: false });
  if (state.dragHandle) cancelRangeDrag();
  if (state.guideDrag) finishGuideDrag(null, { cancel: true });
});

window.addEventListener("resize", () => {
  syncGuideLayout();
  view.invalidateTimelinePins();
  view.renderTimelinePins();
});

syncGuideLayout();
syncContextControl();
view.renderGuide();
view.render();
