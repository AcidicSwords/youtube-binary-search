// Application composition root. Semantic mutations pass through Session; player effects pass through adapters.
import {
  EPSILON,
  clamp,
  contains,
  getTargets,
  refineBlockReason
} from "./range-geometry.js";
import {
  DEFAULT_DEFORM_WEIGHT,
  DEFAULT_SECTION_WEIGHT,
  SECTION_WEIGHT_VALUES,
  DEFAULT_GROUP_ID,
  sortedSections,
  createGuide,
  findPinAt,
  getPin,
  sectionsForPin,
  sectionIsVisible,
  pinIsVisible,
  canLinkPins,
  resolveSection,
  orderedPins,
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
  focusOwnsRangeBoundaries,
  createSession,
  copy,
  snapshotModel,
  goTo,
  goToGuidePin as goToSessionGuidePin,
  goToGuideSection as goToSessionGuideSection,
  workFromExtent,
  setGuideGroupState,
  createGuideGroup,
  renameGuideGroup,
  deleteGuideGroup,
  assignGuideSectionGroup,
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
  deformSection as deformSessionSection,
  setRange as setSessionRange,
  previewRange,
  checkpoint,
  relabelLastAction,
  focusSection as focusSessionSection,
  focusWorkingSection as focusSessionWorkingSection,
  leaveSection as leaveSessionSection,
  completePlayback,
  pinCurrent as pinSessionCurrent,
  saveIntervalAsSection,
  saveExtentAsSection,
  renameGuidePin,
  deleteGuidePin,
  renameGuideSection,
  deleteGuideSection,
  setGuideSectionWeight,
  moveGuidePin,
  moveGuideSection,
  unlinkGuideSectionEndpoint,
  linkGuidePins,
  undo as undoSession,
  redo as redoSession
} from "./session.js";
import { projectionForModel } from "./timeline-projection.js";
import {
  TRANSPORT_KIND,
  idleTransport,
  isTransportActive,
  transportFieldRange,
  deriveContextWindow,
  isProperRange,
  createContextTransport,
  createPlaybackTransport,
  rebasePlaybackTransport,
  withTransportPhase
} from "./transport.js";
import {
  YOUTUBE_STATE,
  createYouTubePlayer,
  isYouTubeApiReady,
  parseYouTubeUrl
} from "./youtube.js";
import { createStepFieldController } from "./step-field.js";
import {
  DEFAULT_FIELD_BREATH,
  normalizeFieldBreath,
  breathRateFromResponse
} from "./step-field-geometry.js";
import {
  FIELD_FRAME_OWNER,
  FIELD_FRAME_ACTIVATION,
  createFieldFrameSequencer
} from "./field-frame.js";
import {
  DEFAULT_STEP_GESTURE_TIMING,
  bindStepPress,
  createStepGestureController
} from "./step-gesture.js";
import { parseCueList, cueName } from "./cues.js";
import { sectionDisplayName } from "./format.js";
import { createView } from "./view.js";

const STORAGE_V9_PREFIX = "binary-youtube-reader:v9:";
// Where a stored Guide that could not be read is kept, so a save cannot be the
// thing that destroys it. One key per video, overwritten by the next failure.
const STORAGE_UNREADABLE_PREFIX = "binary-youtube-reader:unreadable:";
const STORAGE_V8_PREFIX = "binary-youtube-reader:v8:";
const STORAGE_V7_PREFIX = "binary-youtube-reader:v7:";
const STORAGE_V6_PREFIX = "binary-youtube-reader:v6:";
const STORAGE_V5_PREFIX = "binary-youtube-reader:v5:";
const STORAGE_V4_PREFIX = "binary-youtube-reader:v4:";
const STORAGE_V3_PREFIX = "binary-youtube-reader:v3:";
const STORAGE_V2_PREFIX = "binary-youtube-reader:v2:";
const STORAGE_V1_PREFIX = "binary-youtube-reader:v1:";
const PREFERENCES_KEY = "binary-youtube-reader:preferences:v1";
const POLL_MS = 100;
const STEP_TAP_SETTLE_MS = DEFAULT_STEP_GESTURE_TIMING.tapSettleMs;
// What one settled Step sequence is called in history, by its net displacement.
const STEP_SEQUENCE_LABEL = {
  forward: "Step Forward",
  backward: "Step Backward",
  none: "Step Reversal"
};
const STEP_PRESETS = [0.25, 0.5, 1, 2, 3, 5, 10, 15, 30, 60, 120, 300];
const STEP_FRACTIONS = [1 / 32, 1 / 16, 1 / 8];
const NATIVE_GO_SETTLE_MS = 220;
const TRANSPORT_START_GRACE_MS = 1600;
const METADATA_GRACE_MS = 4000;
const METADATA_RETRY_MS = 150;
const PROGRAMMATIC_PLACEMENT_GRACE_MS = 2000;
const NATIVE_POSITION_TOLERANCE_SECONDS = 0.25;
const MAX_CONTEXT_SECONDS = 300;
const PIN_SNAP_DISTANCE_PX = 16;
const PIN_SNAP_ARM_MS = 450;
// Nudge is a configured source-time quantum. It is only ever called a frame
// step when the active media adapter supplies a verified frame duration.
//
// The quantum must stay strictly greater than the semantic equality tolerance
// the Session kernel uses, or a single Nudge would resolve to the Address it
// started from and move nothing. 1/24 s is the smallest frame-like increment
// that clears EPSILON.
const DEFAULT_NUDGE_SECONDS = 1 / 24;
const MIN_NUDGE_SECONDS = EPSILON * 1.02;
const MAX_NUDGE_SECONDS = 10;
const NUDGE_WHEEL_THRESHOLD = 24;
const NUDGE_GESTURE_SETTLE_MS = 420;
const PRECISION_DRAG_GAIN = 0.2;

function normalizeNudgeSeconds(value, fallback = DEFAULT_NUDGE_SECONDS) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  // A configured quantum at or below EPSILON would silently disable Nudge.
  return clamp(numeric, MIN_NUDGE_SECONDS, MAX_NUDGE_SECONDS);
}

function legacyFieldBreath(value) {
  const legacy = value?.fieldOffsets;
  const outer = Math.max(
    Number(legacy?.backward) || 0,
    Number(legacy?.forward) || 0
  ) || DEFAULT_FIELD_BREATH.outer;
  return {
    inner: Math.max(MIN_NUDGE_SECONDS, outer / 4),
    outer,
    rate: value?.fieldResponse
      ? breathRateFromResponse(value.fieldResponse)
      : DEFAULT_FIELD_BREATH.rate
  };
}

function normalizeContextSeconds(value, fallback = 5) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, 0, MAX_CONTEXT_SECONDS);
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
      // One bounded breathing relation replaces the two independent side
      // Offsets. A legacy pair migrates once: its widest side becomes the outer
      // offset and its saved rates become the nearest symmetric breathing pair.
      fieldBreath: normalizeFieldBreath(
        value?.fieldBreath ?? legacyFieldBreath(value)
      ),
      nudgeSeconds: normalizeNudgeSeconds(value?.nudgeSeconds),
      stepFieldEnabled: value?.stepFieldEnabled !== false,
      tailVisible: value?.tailVisible !== false,
      leadVisible: value?.leadVisible !== false
    };
  } catch {
    return {
      contextSeconds: 5,
      stepReach: normalizeStepReach(10),
      fieldBreath: { ...DEFAULT_FIELD_BREATH },
      nudgeSeconds: DEFAULT_NUDGE_SECONDS,
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
  unreadableGuidePrefix: null,
  playerState: YOUTUBE_STATE.UNSTARTED,
  availableRates: [1],
  transport: idleTransport(),
  pendingStep: null,
  fieldBreath: normalizeFieldBreath(preferences.fieldBreath),
  nudgeSeconds: normalizeNudgeSeconds(preferences.nudgeSeconds),
  contextSeconds: preferences.contextSeconds,
  stepFieldEnabled: preferences.stepFieldEnabled,
  tailVisible: preferences.tailVisible,
  leadVisible: preferences.leadVisible,
  dragHandle: null,
  rangeDragOrigin: null,
  rangeDragProjection: null,
  guideTab: "sections",
  // Offered candidates. Never persisted, never projected, never traversed --
  // a Cue is structure only once the reader retains it.
  cues: [],
  // Whether the offered Cues are drawn on the map. A drawing only: it changes
  // what is visible and nothing about what any operator can reach.
  cuesOnTimeline: false,
  weightGesture: null,
  guideOpen: false,
  railMode: "guide",
  compactGuide: null,
  guideReturnFocus: null,
  nativeGo: null,
  programmaticPlacement: null,
  guideDialog: null,
  // Timeline operand selection is spatial: only currently drawn retained
  // objects may occupy it. Guide focus is independent so hidden structure can
  // remain inspectable and navigable without becoming a Timeline operand.
  selectedRetained: null,
  guideRetained: null,
  selectedPinIds: [],
  deformWeightMemory: new Map(),
  guideDrag: null,
  guideClickSuppressed: false,
  carryModifier: false,
  shiftLayer: false,
  shiftKeyHeld: false,
  field: null,
  // Direct manipulation of Current on the Temporal Topography. It commits a
  // Step, not a Go and not a Pin move, and it owns the Field Frame while it runs.
  currentDrag: null,
  // True while a Step gesture is being held. Predictive chrome stands down for
  // the duration: a destination marker is an answer to "where would this go",
  // and while the gesture runs that question is being answered by the movement
  // itself, several times a second.
  stepGestureActive: false,
  // The exact Frame supplied by whichever direct manipulation is active.
  directFrame: null,
  // One wheel series or held-key repetition settles as one Undo transaction.
  nudgeGesture: null
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

function rangeBoundaryEditingLocked() {
  return focusOwnsRangeBoundaries(model());
}

function rejectFocusedRangeBoundaryEdit() {
  if (!rangeBoundaryEditingLocked()) return false;
  setStatus("Unfocus to adjust the Range boundaries.");
  return true;
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
  return effectiveStepReach(configured, activeRange(), timelineProjection());
}

function configuredStepReach() {
  return normalizeStepReach(model()?.stepReach ?? preferences.stepReach);
}

function currentFieldBreath() {
  return normalizeFieldBreath(state.fieldBreath ?? preferences.fieldBreath);
}

// Field Offsets remain physical observation settings that are independent from
// the semantic Step Reach. The outer offset is the Field's breathing bound.
function currentFieldOffsets() {
  const breath = currentFieldBreath();
  return normalizeStepReach({
    backward: breath.outer,
    forward: breath.outer,
    linked: true,
    mode: STEP_REACH_MODE.FIXED
  });
}

function fieldStepPreview(center, kind = "step") {
  const reach = currentStepReach();
  const projection = timelineProjection();
  return {
    kind,
    start: projection.stepTarget(
      center,
      reach.backward,
      "backward",
      activeRange()
    ),
    center,
    end: projection.stepTarget(
      center,
      reach.forward,
      "forward",
      activeRange()
    ),
    backwardDistance: reach.backward,
    forwardDistance: reach.forward
  };
}

// The next settled Field Frame is resolved once per semantic movement. Context
// has priority over operator framing, but only while Context is enabled.
function operatorFrameRequest() {
  const center = currentResolution().C;
  const projection = timelineProjection();
  const operator = model().lastOperator;
  const range = activeRange();
  if ([
    "refineBackward",
    "refineForward",
    "localRefineBackward",
    "localRefineForward"
  ].includes(operator)) {
    const targets = getTargets(currentResolution(), projection.metric);
    return {
      kind: "refine",
      center,
      backward: targets.backward ?? center,
      forward: targets.forward ?? center,
      range
    };
  }
  if (operator === "reopen") {
    const targets = getTargets(currentResolution(), projection.metric);
    return {
      kind: "reopen",
      center,
      backward: targets.backward ?? center,
      forward: targets.forward ?? center,
      range
    };
  }
  if (operator === "section") {
    // A retained Section supplies its Start and End only while Current owns its
    // midpoint. Otherwise the Frame returns to the exact Step neighbourhood.
    const interval = currentInterval();
    const midpoint = interval ? (interval.start + interval.end) / 2 : NaN;
    if (Number.isFinite(midpoint) && Math.abs(center - midpoint) <= EPSILON) {
      return {
        kind: "section",
        center,
        backward: interval.start,
        forward: interval.end,
        range
      };
    }
  }
  const step = fieldStepPreview(center);
  return {
    kind: "step",
    center,
    backward: step.start,
    forward: step.end,
    backwardDistance: step.backwardDistance,
    forwardDistance: step.forwardDistance,
    activation: { kind: FIELD_FRAME_ACTIVATION.STEP_TO_ADDRESS },
    range
  };
}

function fieldFrameRequest() {
  if (!state.videoLoaded || !currentResolution() || !activeRange()) return null;
  // Direct manipulation temporarily supplies an exact Frame and has priority
  // over both Context and operator framing for the gesture's lifetime.
  if (state.directFrame) {
    return { ...state.directFrame, owner: FIELD_FRAME_OWNER.DIRECT, range: activeRange() };
  }
  const transport = state.transport;
  const contextRunning = transport.kind === TRANSPORT_KIND.CONTEXT;
  if (
    !contextRunning
    && (
      transport.kind !== TRANSPORT_KIND.IDLE
      || state.dragHandle
      || state.guideDrag?.moved
      || [YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(
        playerSnapshot().state
      )
    )
  ) {
    // Ordinary Center playback hands presentation to the Field Breath.
    return null;
  }
  // Context has priority over operator framing whenever Context is *enabled* —
  // not merely while its transport is running. The edges are the bounded
  // observation window before, during, and after transport, so beginning,
  // pausing, stopping, or settling Context reassigns neither side.
  if (state.contextSeconds > EPSILON) {
    const window = contextRunning
      ? { start: transport.start, end: transport.end }
      : deriveContextWindow(
        currentResolution().C,
        activeRange(),
        state.contextSeconds
      );
    if (window) {
      return {
        owner: FIELD_FRAME_OWNER.CONTEXT,
        start: window.start,
        end: window.end,
        current: currentResolution().C,
        cursor: contextRunning ? safeCurrentTime() : undefined,
        range: activeRange()
      };
    }
  }
  return operatorFrameRequest();
}

// One sequencer owns stable Frame identity, so republishing the same state and
// Context transport inside a settled window create no new transition.
const fieldFrames = createFieldFrameSequencer();

function fieldOperatorPreview() {
  const request = fieldFrameRequest();
  if (!request) {
    fieldFrames.reset();
    return null;
  }
  const frame = fieldFrames.resolve(request);
  if (!frame) return null;
  // Side Step distance is semantic Reach, not the clipped Frame geometry, so it
  // travels with the Frame rather than being re-derived from its addresses.
  return Number.isFinite(request.backwardDistance)
    ? {
      ...frame,
      backwardDistance: request.backwardDistance,
      forwardDistance: request.forwardDistance
    }
    : frame;
}

function reachFor(direction) {
  return currentStepReach()[direction];
}

function guide() {
  return model().guide;
}

function retainedExists(selection) {
  if (!selection) return false;
  if (selection.kind === "pin") return Boolean(getPin(guide(), selection.id));
  if (selection.kind === "section") return Boolean(resolveSection(guide(), selection.id));
  return false;
}

function retainedIsOnTimeline(selection) {
  if (!selection) return false;
  const projection = projectionForModel(model());
  if (selection.kind === "pin") {
    const pin = getPin(guide(), selection.id);
    return Boolean(
      pin
      && pinIsVisible(guide(), pin)
      && projection.withinView(pin.t)
    );
  }
  if (selection.kind === "section") {
    const section = resolveSection(guide(), selection.id);
    if (!section || !sectionIsVisible(guide(), section)) return false;
    const extent = projection.projectExtent(section);
    return Boolean(
      extent
      && extent.end > projection.viewStart - EPSILON
      && extent.start < projection.viewEnd + EPSILON
    );
  }
  return false;
}

function focusGuideRetained(selection) {
  state.guideRetained = selection ? { ...selection } : null;
}

function selectTimelineRetained(selection) {
  state.selectedRetained = selection ? { ...selection } : null;
  if (selection) focusGuideRetained(selection);
}

function currentInterval() {
  return model().interval;
}

function syncIntervalPinSelection() {
  const interval = currentInterval();
  if (!interval) {
    state.selectedPinIds = [];
    return;
  }
  const retainedSection = state.selectedRetained?.kind === "section"
    ? resolveSection(guide(), state.selectedRetained.id)
    : null;
  const retainedMatches = retainedSection
    && Math.abs(retainedSection.start - interval.start) <= EPSILON
    && Math.abs(retainedSection.end - interval.end) <= EPSILON;
  // Alignment is a geometric relation, and geometry may coincide without
  // identity collapsing. Every visible Pin standing at a boundary is indicated
  // as aligned; choosing one by array order named an identity the reader never
  // picked. An exact retained Section still supplies its own two endpoints,
  // because there the identities are known rather than inferred.
  const alignedAt = address => orderedPins(guide())
    .filter(pin => Math.abs(pin.t - address) <= EPSILON);
  const pins = retainedMatches
    ? [retainedSection.startPin, retainedSection.endPin]
    : [...alignedAt(interval.start), ...alignedAt(interval.end)];
  state.selectedPinIds = [...new Set(
    pins.filter(Boolean).map(pin => pin.id)
  )];
}

function timelineProjection() {
  return projectionForModel(model());
}

function timelineGeometryKey(sourceModel) {
  const projection = projectionForModel(sourceModel);
  return [
    projection.timelineExtent,
    ...projection.segments.map(segment =>
      `${segment.start}:${segment.end}:${segment.weight}`
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

// One definition, shared with the kernel's transaction labels, so the object an
// Undo names is the object the status named when it happened.
const sectionName = sectionDisplayName;

function storageKey(prefix = STORAGE_V9_PREFIX) {
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
    preferences.fieldBreath = normalizeFieldBreath(state.fieldBreath);
    preferences.nudgeSeconds = normalizeNudgeSeconds(state.nudgeSeconds);
    preferences.contextSeconds = state.contextSeconds;
    preferences.stepFieldEnabled = state.stepFieldEnabled;
    preferences.tailVisible = state.tailVisible;
    preferences.leadVisible = state.leadVisible;

    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      contextSeconds: preferences.contextSeconds,
      stepReach: preferences.stepReach,
      fieldBreath: preferences.fieldBreath,
      nudgeSeconds: preferences.nudgeSeconds,
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
    // v9 names the visible Group once on the Guide; v8 flagged it on each
    // Group. normalizeGuide reads either, so an older Guide is migrated on
    // read and rewritten under the v9 key on the next save.
    [STORAGE_V9_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V8_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V7_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V6_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V5_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V4_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V3_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V2_PREFIX, raw => migrateStructureV2(raw, state.videoId)],
    [STORAGE_V1_PREFIX, raw => migrateSavedRegions(raw, state.videoId)]
  ];

  let unreadable = null;
  for (const [prefix, convert] of candidates) {
    try {
      const stored = localStorage.getItem(storageKey(prefix));
      if (!stored) continue;
      const converted = convert(JSON.parse(stored));
      const recovered = sanitizeGuide(converted, state.videoId, duration);
      if (validateGuide(recovered, duration)) return recovered;
      unreadable = unreadable || { prefix, stored };
    } catch (error) {
      console.warn(`Could not read Guide from ${prefix}`, error);
      unreadable = unreadable || { prefix, stored: localStorage.getItem(storageKey(prefix)) };
    }
  }
  // A record that exists but cannot be read is not the same thing as no record,
  // and the operator has to be told which happened: an empty map and a lost map
  // look identical. The damaged text is moved aside before an empty Guide is
  // returned, because the next save would otherwise write over the only copy.
  if (unreadable) preserveUnreadableGuide(unreadable);
  return createGuide(state.videoId);
}

function preserveUnreadableGuide({ prefix, stored }) {
  try {
    if (stored) localStorage.setItem(storageKey(STORAGE_UNREADABLE_PREFIX), stored);
  } catch (error) {
    console.warn("Could not set aside the unreadable Guide", error);
  }
  state.unreadableGuidePrefix = prefix;
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
  // Context playback belongs only to Center. Tail and Lead pause their stored
  // playback relation and temporarily preview the exact Context bounds.
  // Retargeting an active Context reuses that already-suspended Field.
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
  if (!retainedExists(state.guideRetained)) state.guideRetained = null;
  // A hidden retained object still exists in the Guide, but it cannot remain a
  // Timeline operand after its Group leaves the spatial surface.
  if (!retainedIsOnTimeline(state.selectedRetained)) {
    state.selectedRetained = null;
  }
  syncIntervalPinSelection();
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  const timelineGeometryChanged = timelineGeometryKey(previousModel)
    !== timelineGeometryKey(model());
  const rangeAligned = result.rangeChanged === true
    && options.effect !== false;
  if (rangeAligned) {
    stepField?.resetAtCurrent?.();
  }
  if (options.effect !== false) {
    applyPlayerEffect(result, {
      observe: options.observe,
      fieldAligned: rangeAligned
    });
  }
  if (
    options.renderGuide
    || result.guideChanged
    || result.rangeChanged
    || timelineGeometryChanged
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
  const originCoordinate = projection.sourceToTimeline(originCurrent);
  const destinationCoordinate = projection.sourceToTimeline(destination);
  const delta = destinationCoordinate - originCoordinate;
  let carried = null;
  let carryClamped = false;

  if (selection.kind === "pin") {
    const originPin = getPin(originModel.guide, selection.id);
    if (!originPin) return { ...result, carryFailed: "missing-pin" };
    const requestedCoordinate =
      projection.sourceToTimeline(originPin.t) + delta;
    const boundedCoordinate = clamp(
      requestedCoordinate,
      0,
      projection.timelineExtent
    );
    const target = projection.timelineToSource(requestedCoordinate);
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
    const requestedCoordinate =
      projection.sourceToTimeline(originSection.start) + delta;
    const boundedCoordinate = clamp(
      requestedCoordinate,
      0,
      projection.timelineExtent
    );
    const targetStart = projection.timelineToSource(requestedCoordinate);
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
    ? " The selected retained object could not follow Current beyond its structural boundary."
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
      syncIntervalPinSelection();
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

// A coalesced Step sequence commits one transaction whatever its net
// displacement. Undo is not withheld because this particular inverse happens to
// be cheap: it exists for the movements whose inverse is awkward, imprecise, or
// several operations long, and the rule that earns it has to be uniform. A
// sequence that returns to its origin still traversed a path and still leaves a
// Working Interval behind it, so it is a state worth returning from.
function flushPendingStep(options = {}) {
  const pending = state.pendingStep;
  if (!pending) return { flushed: false, direction: null };
  clearTimeout(pending.timer);
  state.pendingStep = null;

  // The sequence is named by where it ended up, not by the key that opened it.
  // Stepping forward once and back twice is a Step Backward however it started.
  const displacement = currentResolution().C - pending.departure;
  const direction = Math.abs(displacement) <= EPSILON
    ? null
    : displacement > 0 ? "forward" : "backward";
  if (pending.started) {
    state.session = relabelLastAction(state.session, STEP_SEQUENCE_LABEL[direction ?? "none"]);
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
    direction,
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
    const arrival = formatTime(currentResolution().C);
    setStatus(
      `${outcome.direction
        ? `Stepped ${outcome.direction === "backward" ? "Backward" : "Forward"} to ${arrival}`
        : `Step sequence returned to ${arrival}`
      }; Interval ${intervalStatus}.${retainedCarryStatus(outcome)}`
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
  state.stepGestureActive = Boolean(active);
  for (const [id, controlDirection] of [
    ["step-backward", "backward"],
    ["tail-player-surface", "backward"],
    ["step-forward", "forward"],
    ["lead-player-surface", "forward"]
  ]) {
    elements[id]?.classList?.toggle?.(
      "is-step-held",
      Boolean(active && direction === controlDirection)
    );
  }
}

stepGesture = createStepGestureController({
  // The Shift layer turns Step into Pin traversal, and a pressed control must
  // mean exactly what the same operator means from the keyboard. Traversal is a
  // discrete jump between retained landmarks: one press, one Pin, one
  // checkpoint. Reporting no ongoing gesture publishes no repeat cadence, so a
  // held button never walks the Guide at Step speed, and the synthesized click
  // is suppressed so one press cannot traverse twice.
  perform: selection => {
    if (selection.pinTraversal) {
      traverseToAdjacentPin(
        selection.direction,
        selection.carryRetained === true
      );
      return false;
    }
    return performStep(
      selection.direction,
      selection.distance,
      {
        waitForGestureEnd: true,
        carryRetained: selection.carryRetained === true
      }
    );
  },
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

// Every deferred gesture settles here, before the next transaction begins.
//
// Step settled and Nudge did not, so a Nudge inside its 420 ms window could
// still be pending when the next operator committed -- and then checkpointed
// against an origin two transactions old. Undo stopped being monotonic: undoing
// the Nudge reverted the operator after it, and undoing that operator moved
// Current forward. A gesture that has changed the Session is a transaction that
// has not been written down yet; nothing else may commit in front of it.
function settleBeforeAction(options = {}) {
  clearNativeGo();
  stepGesture?.cancel({ finalize: false });
  settleNudgeGesture();
  settleWeightGesture();
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
  } else if (options.transport !== false) {
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
    setStatus(options.unchangedStatus || `Already at ${formatTime(departure)}.`);
    // Guide focus is not Current and is not Timeline operand selection. A
    // Guide navigation whose Address is already Current still needs its Guide
    // render so the requested retained row remains inspectable.
    if (options.renderGuide === true) view.renderGuide();
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
      timelineProjection().metric
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
      ? `Local Refine ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(result.destination)}; drew a new Current-to-midpoint Working Interval ${workingSection}.${retainedCarryStatus(result)}`
      : result.refineRelation === "full"
        ? `Refined ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(result.destination)}; recorded the full movement as ${workingSection}.${retainedCarryStatus(result)}`
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

function deformTarget() {
  const working = currentInterval();
  const retainedSection = state.selectedRetained?.kind === "section"
    ? resolveSection(guide(), state.selectedRetained.id)
    : null;
  const selected = retainedSection || sectionForSelectedPinExtent();
  const selectedMatches = selected && (
    !working
    || (
      Math.abs(selected.start - working.start) <= EPSILON
      && Math.abs(selected.end - working.end) <= EPSILON
    )
  );
  const exactMatches = working
    ? guide().sections
      .map(section => resolveSection(guide(), section))
      .filter(section =>
        section
        && sectionIsVisible(guide(), section)
        && Math.abs(section.start - working.start) <= EPSILON
        && Math.abs(section.end - working.end) <= EPSILON
      )
    : [];
  const section = selectedMatches
    ? selected
    : exactMatches.length === 1
      ? exactMatches[0]
      : null;
  return {
    extent: working || section,
    section,
    sectionId: section?.id || null
  };
}

function rememberDeformWeight(sectionId, weight) {
  if (Math.abs(weight - DEFAULT_SECTION_WEIGHT) <= EPSILON) return;
  state.deformWeightMemory.set(sectionId || "working", weight);
}

function applyDeformWeight(weight, { gesture = false } = {}) {
  if (!state.videoLoaded) return false;
  const target = deformTarget();
  if (!target.extent) {
    setStatus("Establish a Working Interval or select a Section to deform.");
    return false;
  }
  // Inside a hold, each repeat is applied against the gesture's own origin
  // history, so the ladder walks without leaving a trail of Undo entries, and
  // one checkpoint is written at release. Settling runs only when the gesture
  // begins: a repeat must not settle the gesture it is extending, which is the
  // same reason Nudge does its own boundary rather than calling this one.
  const continuing = gesture && state.weightGesture?.sectionId === target.sectionId;
  if (!continuing) settleBeforeAction();
  const held = gesture ? beginWeightGesture(target.sectionId) : null;
  const source = held
    ? { model: model(), history: held.history, future: held.future }
    : state.session;
  const result = deformSessionSection(
    source,
    target.sectionId,
    weight
  );
  if (!result.changed) {
    if (result.reason === "ambiguous-deform-target") {
      openGuide("sections");
      setStatus(`${result.sectionIds?.length || "Several"} Sections share this extent. Select the intended Section, then apply ${weight}×.`);
      return false;
    }
    if (result.reason === "unchanged-section-weight") {
      setStatus(`That Section already has ${weight}× timeline weight.`);
      return false;
    }
    setStatus("Establish a Working Interval or select a Section to deform.");
    return false;
  }
  selectTimelineRetained({
    kind: "section",
    id: result.section.id
  });
  rememberDeformWeight(result.section.id, result.weight);
  state.deformWeightMemory.delete("working");
  view.invalidateTimelinePins();
  const name = sectionName(result.section);
  const status = `Set “${name}” to ${result.weight}× timeline weight.`;
  if (held) {
    held.changed = true;
    held.label = status.replace(/\.$/, "");
    state.session = result.session;
    setStatus(status);
    view.renderGuide();
    view.render();
    return true;
  }
  return accept(result, {
    effect: false,
    renderGuide: true,
    status
  });
}

function deformWorkingOrSelected() {
  const target = deformTarget();
  if (!target.extent) {
    setStatus("Establish a Working Interval or select a Section to deform.");
    return false;
  }
  const currentWeight = target.section?.weight ?? DEFAULT_SECTION_WEIGHT;
  const memoryKey = target.sectionId || "working";
  if (Math.abs(currentWeight - DEFAULT_SECTION_WEIGHT) > EPSILON) {
    rememberDeformWeight(memoryKey, currentWeight);
    return applyDeformWeight(DEFAULT_SECTION_WEIGHT);
  }
  return applyDeformWeight(
    state.deformWeightMemory.get(memoryKey)
    ?? state.deformWeightMemory.get("working")
    ?? DEFAULT_DEFORM_WEIGHT
  );
}

function stepDeformWeight(direction, options = {}) {
  const target = deformTarget();
  if (!target.extent) {
    setStatus("Establish a Working Interval or select a Section to deform.");
    return false;
  }
  const currentWeight = target.section?.weight ?? DEFAULT_SECTION_WEIGHT;
  const currentIndex = SECTION_WEIGHT_VALUES.findIndex(
    weight => Math.abs(weight - currentWeight) <= EPSILON
  );
  const neutralIndex = SECTION_WEIGHT_VALUES.indexOf(DEFAULT_SECTION_WEIGHT);
  const nextIndex = clamp(
    (currentIndex >= 0 ? currentIndex : neutralIndex) + direction,
    0,
    SECTION_WEIGHT_VALUES.length - 1
  );
  const nextWeight = SECTION_WEIGHT_VALUES[nextIndex];
  if (Math.abs(nextWeight - currentWeight) <= EPSILON) {
    setStatus(
      direction < 0
        ? "That Section is already at the lowest deformation weight."
        : "That Section is already at the highest deformation weight."
    );
    return false;
  }
  rememberDeformWeight(target.sectionId, currentWeight);
  return applyDeformWeight(nextWeight, options);
}

function focusOrUnfocus() {
  if (!state.videoLoaded) return false;
  if (model().focus) return leaveSection();
  const working = currentInterval();
  const selected = state.selectedRetained?.kind === "section"
    ? resolveSection(guide(), state.selectedRetained.id)
    : sectionForSelectedPinExtent();
  if (selected) {
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
  syncIntervalPinSelection();
  persistPreferences();
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  const destination = currentResolution().C;
  const currentMoved = Math.abs(destination - departure) > EPSILON;
  const rangeChanged = Math.abs(previousModel.range.start - activeRange().start) > EPSILON
    || Math.abs(previousModel.range.end - activeRange().end) > EPSILON;
  if (currentMoved && state.contextSeconds > 0) {
    if (rangeChanged) stepField?.resetAtCurrent?.();
    else stepField?.translateToCurrent(destination, { preserve: true });
    startContext(destination);
  } else if (currentMoved || rangeChanged) {
    locateAddress(destination, {
      preserveField: !rangeChanged,
      resetField: rangeChanged
    });
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
  syncIntervalPinSelection();
  if (
    timelineGeometryKey(previousModel) !== timelineGeometryKey(model())
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
    if (direct.changed) {
      state.session = direct.session;
      syncIntervalPinSelection();
    }
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

function toggleNativePlayback() {
  if (!state.videoLoaded) return;
  if (transportIs(TRANSPORT_KIND.CONTEXT)) {
    // Context is transient observation around Current. The play command means
    // ordinary playback wherever it is issued, so Context yields to it rather
    // than reinterpreting the key as "commit what I was peeking at". Current is
    // placed exactly by dragging it, nudging it, or editing its Address.
    startFieldPlaybackFromGesture();
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
  // Focus is requested through the Guide. Keep its row available without
  // manufacturing a Timeline operand, especially when the Section is hidden.
  focusGuideRetained({ kind: "section", id: sectionId });
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

function changeSectionWeight(sectionId, weight) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return false;
  rememberDeformWeight(sectionId, section.weight);
  const name = sectionName(section);
  const result = setGuideSectionWeight(
    state.session,
    sectionId,
    Number(weight)
  );
  if (!result.changed) {
    if (result.reason === "unchanged-section-weight") {
      setStatus(`“${name}” already has ${section.weight}× timeline weight.`);
    } else {
      setStatus("Choose a valid Section weight.", true);
    }
    return false;
  }
  focusGuideRetained({ kind: "section", id: sectionId });
  view.invalidateTimelinePins();
  const next = result.value;
  rememberDeformWeight(sectionId, next.weight);
  accept(result, {
    effect: false,
    renderGuide: true,
    status: next.weight === 1
      ? `Restored “${name}” to ordinary timeline density.`
      : `Set “${name}” to ${next.weight}× timeline weight.`
  });
  return true;
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

function sectionForSelectedPinExtent() {
  const extent = selectedPinExtent();
  if (!extent) return null;
  const matches = guide().sections
    .map(section => resolveSection(guide(), section))
    .filter(section =>
      section
      && section.startPinId === extent.startPinId
      && section.endPinId === extent.endPinId
    );
  return matches.length === 1 ? matches[0] : null;
}

function pinCurrent(event = null, options = {}) {
  event?.preventDefault?.();
  const label = options.useFormLabel === false
    ? ""
    : elements["pin-label"]?.value?.trim?.() || "";
  settleBeforeAction();
  const result = pinSessionCurrent(state.session, label);
  if (!result.changed) {
    const pin = result.value?.pin;
    if (pin) {
      selectTimelineRetained({ kind: "pin", id: pin.id });
      selectGuideTab("pins");
      view.renderGuide();
      view.render();
    }
    setStatus(pin ? `Current is already pinned at ${formatTime(pin.t)}.` : "Current is already pinned.");
    return;
  }
  const { pin } = result.value;
  selectTimelineRetained({ kind: "pin", id: pin.id });
  accept(result, {
    renderGuide: true,
    status: `Pinned Current at ${formatTime(pin.t)}.`
  });
  if (options.useFormLabel !== false && elements["pin-label"]) {
    elements["pin-label"].value = "";
  }
  selectGuideTab("pins");
}

function selectedSectionExtent(source = null) {
  const kind = source || elements["section-source"]?.value || "interval";
  return {
    kind,
    extent: kind === "field-span"
      ? heldFieldSpan()
      : kind === "selected-pins"
        ? selectedPinExtent()
        : currentInterval()
  };
}

function saveCurrentIntervalAsSection(event = null, options = {}) {
  event?.preventDefault?.();
  const label = options.useFormLabel === false
    ? ""
    : elements["section-label"].value.trim();
  const { kind, extent } = selectedSectionExtent(options.source);
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
    const existing = result.value?.section;
    if (result.reason === "duplicate-section" && existing) {
      selectTimelineRetained({ kind: "section", id: existing.id });
      syncIntervalPinSelection();
      selectGuideTab("sections");
      view.renderGuide();
      view.render();
    }
    setStatus(
      result.reason === "duplicate-section"
        ? `${label ? `Section “${label}”` : "An untitled Section"} already exists for this Extent and is selected.`
        : "The Section could not be saved.",
      result.reason !== "duplicate-section"
    );
    return;
  }
  if (kind === "selected-pins") state.selectedPinIds = [];
  selectTimelineRetained({
    kind: "section",
    id: result.value.section.id
  });
  accept(result, {
    renderGuide: true,
    status: label
      ? `Saved Section “${label}”.`
      : `Saved untitled Section ${formatRange(extent)}.`
  });
  if (options.useFormLabel !== false) elements["section-label"].value = "";
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
    // Named the way every other sentence names a Pin: a title in quotes, or
    // "the Pin at 0:10". Quoting a bare Address reads as a title the Pin does
    // not have.
    message: references
      ? `Delete ${pinNameFor(pinId)} and dissolve the ${references} Section${references === 1 ? " that references" : "s that reference"} it? This is one Undoable action.`
      : `Delete ${pinNameFor(pinId)}? This can be restored with Undo.`,
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
    message: `Delete “${sectionName(section)}”? Unshared endpoint Pins will also be removed.`,
    showInput: false,
    confirmLabel: "Delete",
    danger: true
  });
}

// A Group is a retained object carrying a name, so it is renamed and removed by
// the same dialog every other retained object uses. Removing one is
// non-destructive by construction: a Group organizes Sections, it does not own
// them, so its Sections return to the map.
function groupById(groupId) {
  return (guide().groups || []).find(group => group.id === groupId) || null;
}

function renameGroupById(groupId) {
  const group = groupById(groupId);
  if (!group || groupId === DEFAULT_GROUP_ID) return;
  openGuideDialog({
    action: "rename-group",
    id: groupId,
    title: "Rename Group",
    showInput: true,
    value: group.label,
    confirmLabel: "Save"
  });
}

function deleteGroupById(groupId) {
  const group = groupById(groupId);
  if (!group || groupId === DEFAULT_GROUP_ID) return;
  const counted = sortedSections(guide())
    .filter(section => section.groupId === groupId).length;
  openGuideDialog({
    action: "delete-group",
    id: groupId,
    title: "Remove Group",
    message: counted
      // "Map" is the default Group's own name, so the sentence names the place
      // the Sections land rather than describing it.
      ? `Remove “${group.label?.trim() || "Group"}”? Its ${counted} Section${counted === 1 ? " returns" : "s return"} to Map; nothing is deleted.`
      : `Remove “${group.label?.trim() || "Group"}”?`,
    showInput: false,
    confirmLabel: "Remove",
    danger: true
  });
}

// A Section's endpoints are Pins. Revealing one selects it where Pins live and
// are edited, rather than duplicating a second Pin editor inside the Section
// row: one object, one place it is operated on. Selection is the whole
// mechanism -- a selected Guide row is an expanded Guide row already -- so this
// moves nothing and records no transaction.
function revealPin(pinId) {
  const pin = getPin(guide(), pinId);
  if (!pin) return;
  selectGuideTab("pins");
  focusGuideRetained({ kind: "pin", id: pin.id });
  view.renderGuide();
  view.render();
  elements["pins-list"]
    ?.querySelector?.(`[data-pin-go="${pin.id}"]`)
    ?.scrollIntoView?.({ block: "nearest" });
  setStatus(`Showing ${pinNameFor(pin.id)} in Pins.`);
}

function confirmSectionEndpointUnlink(sectionId, role) {
  const section = resolveSection(guide(), sectionId);
  if (!section || !["start", "end"].includes(role)) return;
  openGuideDialog({
    action: "unlink-section-endpoint",
    id: sectionId,
    role,
    title: `Unlink ${role === "start" ? "Start" : "End"} Pin`,
    message: `Give “${sectionName(section)}” an independent ${role} Pin at the same Address? Its Extent and weight stay unchanged. Drag the new Pin onto another Pin and pause to link it later.`,
    showInput: false,
    confirmLabel: "Unlink"
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

// Dialog actions that change only a name. Everything else in the dialog can
// dissolve topology or move Focus, and those do settle observation.
const METADATA_ONLY_DIALOGS = new Set([
  "rename-pin",
  "rename-section",
  "rename-group"
]);

function submitGuideDialog(event) {
  event.preventDefault();
  const action = state.guideDialog;
  if (!action) return;
  const value = elements["guide-dialog-input"].value.trim();
  let result = null;
  let status = "";

  // A rename, a Group's name, a Group's layer or activity: none of these move
  // Current, change Range, or touch the source position. Settling transport for
  // them stopped playback for an edit that had nothing to do with it. Pending
  // gestures still settle -- those are unwritten transactions either way.
  settleBeforeAction({ transport: !METADATA_ONLY_DIALOGS.has(action.action) });
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
  } else if (action.action === "delete-section") {
    // Deleting the Section the map is focused on restores the containing Range,
    // which changes the scope of everything drawn. Every other exit from a Focus
    // says so; this one has to as well, or the map silently zooms out.
    const wasFocused = model().focus?.sectionId === action.id
      && model().focus?.kind !== "working-section";
    result = deleteGuideSection(state.session, action.id);
    status = result.changed
      ? wasFocused
        ? "Deleted the focused Section and restored its containing Range."
        : "Deleted Section."
      : "Section could not be deleted.";
  } else if (action.action === "rename-group") {
    result = renameGuideGroup(state.session, action.id, value);
    status = result.changed
      ? "Renamed Group."
      : result.reason === "empty-group-label"
        ? "A Group needs a name: unlike a Section, it has no Address to be known by."
        : result.reason === "duplicate-group-label"
          ? `Another Group is already called “${value}”. A Group has no Address, so its name has to tell it apart.`
          : "Group title is unchanged.";
  } else if (action.action === "delete-group") {
    result = deleteGuideGroup(state.session, action.id);
    status = result.changed
      ? "Removed the Group. Its Sections returned to Map."
      : result.reason === "duplicate-section"
        ? "Move, rename, or remove the matching Section in Map before removing this Group."
        : "Group could not be removed.";
  } else if (action.action === "unlink-section-endpoint") {
    result = unlinkGuideSectionEndpoint(
      state.session,
      action.id,
      action.role
    );
    if (result.changed) {
      focusGuideRetained({ kind: "section", id: action.id });
      view.invalidateTimelinePins();
    }
    status = result.changed
      ? `Unlinked the ${action.role} endpoint. Drag its Pin onto another Pin and pause to link them.`
      : result.reason === "unshared-pin"
        ? `This ${action.role} endpoint is already independent.`
        : `The ${action.role} endpoint could not be unlinked.`;
  }

  // A name change has no player consequence, so it issues none. Everything else
  // in this dialog can dissolve topology or move Focus and keeps the effect.
  if (result?.changed) accept(result, {
    renderGuide: true,
    status,
    effect: !METADATA_ONLY_DIALOGS.has(action.action)
  });
  else setStatus(status, !result);
  closeGuideDialog({ restoreFocus: false });
  restoreGuideMutationFocus(action);
}

function goToPin(pin, operator = "pin", options = {}) {
  if (!pin) return;
  const carry = options.carryRetained === true || state.carryModifier;
  const hasCarrySelection = carry && Boolean(state.selectedRetained);
  const spatial = options.surface !== "guide";
  const destinationSelection = options.selectionAfter
    || { kind: "pin", id: pin.id };
  focusGuideRetained(destinationSelection);
  if (!carry && spatial) selectTimelineRetained(destinationSelection);
  moveToAddress(pin.t, {
    operator,
    label: operator === "pin" ? "Go to Pin" : operator,
    transaction: sourceSession => goToSessionGuidePin(sourceSession, pin.id, {
      operator,
      label: operator === "pin" ? "Go to Pin" : operator
    }),
    status: destination => `Current is at Pin ${formatTime(destination)}.`,
    renderGuide: true,
    carryRetained: carry
  });
  if (!hasCarrySelection && carry && spatial) {
    selectTimelineRetained(destinationSelection);
    view.renderGuide();
    view.render();
  }
  closeCompactGuideAfterSelection();
}

function goToAdjacentPin(direction, options = {}) {
  const projection = timelineProjection();
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
  if (!carry && destinationSelection) selectTimelineRetained(destinationSelection);
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
      : `Pin ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(pin.t)}.${retainedCarryStatus(result)}`
  });
  if (!hasCarrySelection && carry && destinationSelection) {
    selectTimelineRetained(destinationSelection);
    view.renderGuide();
    view.render();
  }
  return accepted;
}

// Pin traversal is reachable from a keyboard chord, a pressed matrix control,
// and a click. The Shift layer is a one-shot modifier that every operator
// honouring it consumes, so all three arrive here rather than each remembering
// to consume it themselves.
function traverseToAdjacentPin(direction, carryRetained = false) {
  const changed = goToAdjacentPin(direction, { carryRetained });
  if (state.shiftLayer) {
    state.shiftLayer = false;
    view.render();
  }
  return changed;
}

// Composition in the Guide.
//
// A plain click replaces: the clicked object becomes the Working Interval.
// Shift extends: the Working Interval grows to include the clicked object,
// whatever kind it is. One rule covers Pins and Sections because the extent —
// not a set of objects — is what every operator already consumes, so a
// composition is immediately Deformable, Focusable, and retainable as one
// parent Section. Repeated extension grows the extent monotonically; a plain
// click starts over. The Shift layer is one-shot, so it is consumed here as
// every other operator honouring it consumes it.
function pinNameFor(pinId) {
  const pin = getPin(guide(), pinId);
  if (!pin) return "that Pin";
  return pin.label?.trim() ? `“${pin.label.trim()}”` : `the Pin at ${formatTime(pin.t)}`;
}

function retainedExtentOf(kind, id) {
  if (kind === "pin") {
    const pin = getPin(guide(), id);
    return pin ? { start: pin.t, end: pin.t } : null;
  }
  const section = resolveSection(guide(), id);
  return section ? { start: section.start, end: section.end } : null;
}

function composingGuideClick(event) {
  return event?.shiftKey === true || state.shiftLayer;
}

function consumeShiftLayer() {
  if (!state.shiftLayer) return;
  state.shiftLayer = false;
  // Both controls that surface this one-shot state have to release together,
  // or the Guide keeps claiming a layer the operator matrix has already spent.
  view.renderGuide();
  view.render();
}

function extendIntervalToRetained(kind, id, name) {
  return extendIntervalToExtent(retainedExtentOf(kind, id), name, { kind, id });
}

// The same extension law, expressed over a bare extent so that a Cue -- which
// is not in the Guide and owns no identity -- composes exactly as a Section
// does. Composition is a fact about extents, not about retained objects.
function extendIntervalToExtent(extent, name, selection = null) {
  const interval = currentInterval();
  if (!interval || !extent) return false;
  const span = {
    start: Math.min(interval.start, extent.start),
    end: Math.max(interval.end, extent.end)
  };
  if (span.end - span.start <= EPSILON) return false;
  const label = `Extend to ${name}`;
  if (selection) focusGuideRetained(selection);
  moveToAddress((span.start + span.end) / 2, {
    operator: "section",
    label,
    transaction: sourceSession => workFromExtent(sourceSession, span, {
      operator: "section",
      label
    }),
    renderGuide: true,
    unchangedStatus: `The Working Interval already spans ${name}.`,
    status: destination =>
      `Working Interval extends ${formatRange(span)}; Current is centered at ${formatTime(destination)}.`
  });
  consumeShiftLayer();
  closeCompactGuideAfterSelection();
  return true;
}

function selectSectionAsWorkingInterval(sectionId, options = {}) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return;
  const carry = options.carryRetained === true || state.carryModifier;
  const hasCarrySelection = carry && Boolean(state.selectedRetained);
  const spatial = options.surface !== "guide";
  const destinationSelection = { kind: "section", id: sectionId };
  focusGuideRetained(destinationSelection);
  if (!carry && spatial) selectTimelineRetained(destinationSelection);
  moveToAddress(section.midpoint, {
    operator: "section",
    label: `Select Section “${sectionName(section)}”`,
    transaction: sourceSession => goToSessionGuideSection(
      sourceSession,
      sectionId,
      {
        operator: "section",
        label: `Select Section “${sectionName(section)}”`
      }
    ),
    renderGuide: true,
    carryRetained: carry,
    unchangedStatus: `“${sectionName(section)}” is already the Working Interval.`,
    status: destination => `“${sectionName(section)}” is the Working Interval; Current is centered at ${formatTime(destination)}.`
  });
  if (!hasCarrySelection && carry && spatial) {
    selectTimelineRetained(destinationSelection);
    view.renderGuide();
    view.render();
  }
  closeCompactGuideAfterSelection();
}

function clearMetadataRetry() {
  if (metadataTimer !== null) clearTimeout(metadataTimer);
  metadataTimer = null;
}

// Cues, selections, previews, and gesture accumulators have meaning only inside
// the source that produced them. Reset them as one boundary operation before a
// different video is cued so no route can carry an Address or retained identity
// across source identity.
function resetSourceScopedState() {
  state.cues = [];
  state.cuesOnTimeline = false;
  if (elements["cue-source"]) elements["cue-source"].value = "";
  state.selectedRetained = null;
  state.guideRetained = null;
  state.selectedPinIds = [];
  state.deformWeightMemory.clear();
  state.shiftLayer = false;
  state.shiftKeyHeld = false;
  state.guideDrag = null;
  state.guideClickSuppressed = false;
  state.currentDrag = null;
  state.directFrame = null;
  if (state.nudgeGesture?.timer) window.clearTimeout(state.nudgeGesture.timer);
  state.nudgeGesture = null;
  state.field = null;
  view.setPreviewAction(null);
  view.setPreviewSection(null);
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
  state.unreadableGuidePrefix = null;
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
  state.guideRetained = null;
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
  if (state.unreadableGuidePrefix) {
    setStatus(
      `Loaded ${formatTime(duration)} video, but a saved map for it could not be read. `
      + "This session starts empty; the damaged record was kept rather than replaced.",
      true
    );
  } else if (guidePersisted) setStatus(`Loaded ${formatTime(duration)} video.`);
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
  resetSourceScopedState();
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  state.rangeDragProjection = null;
  state.selectedRetained = null;
  state.guideRetained = null;
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
  if ([
    YOUTUBE_STATE.PLAYING,
    YOUTUBE_STATE.BUFFERING,
    YOUTUBE_STATE.PAUSED,
    YOUTUBE_STATE.ENDED
  ].includes(name)) {
    reclaimCenterKeyboardFocus();
  }
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
  projection = timelineProjection(),
  constrainToRange = false
) {
  const rect = elements.timeline.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) return currentResolution().C;
  const coordinate = projection.fractionToCoordinate(
    (event.clientX - rect.left) / rect.width
  );
  const source = projection.timelineToSource(coordinate);
  if (!constrainToRange) return source;
  const range = activeRange();
  const projectedStart = projection.sourceToTimeline(range.start);
  const projectedEnd = projection.sourceToTimeline(range.end);
  if (
    coordinate < Math.min(projectedStart, projectedEnd) - EPSILON
    || coordinate > Math.max(projectedStart, projectedEnd) + EPSILON
  ) {
    return source;
  }
  return clamp(source, range.start, range.end);
}

function sourceFromPointerInProjection(
  event,
  projection,
  originSource
) {
  const rect = elements.timeline.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) return originSource;
  const coordinate = projection.fractionToCoordinate(
    (event.clientX - rect.left) / rect.width
  );
  return projection.timelineToSource(coordinate);
}

function sourceFromRelativeDragDelta(event, drag) {
  const width = drag.surfaceWidth;
  if (!Number.isFinite(width) || width <= 0) return drag.originSource;
  const originCoordinate = drag.projection.sourceToTimeline(drag.originSource);
  const coordinate = clamp(
    originCoordinate
      + drag.projection.fractionToDistance(
          (event.clientX - drag.originClientX) / width
        ),
    drag.projection.viewStart,
    drag.projection.viewEnd
  );
  return drag.projection.timelineToSource(coordinate);
}

// Fine movement is performed in source time and then reprojected, so Section
// Weight cannot change the temporal size of one nudge.
function precisionDragSource(event, drag) {
  const range = activeRange();
  const rect = elements.timeline.getBoundingClientRect();
  const width = Number(drag.surfaceWidth) || Number(rect.width) || 1;
  const span = Math.max(EPSILON, range.end - range.start);
  const quantum = nudgeQuantum();
  const raw = drag.originSource
    + (event.clientX - drag.originClientX) / width * span * PRECISION_DRAG_GAIN;
  return clamp(Math.round(raw / quantum) * quantum, range.start, range.end);
}

function pinSnapCandidate(drag, address) {
  if (drag.kind !== "pin" || !Number.isFinite(address)) return null;
  const sourceGuide = drag.originModel?.guide || model().guide;
  if (!sectionsForPin(sourceGuide, drag.id).length) return null;
  const width = Number(drag.surfaceWidth);
  if (!Number.isFinite(width) || width <= 0) return null;
  const coordinate = drag.projection.sourceToTimeline(address);
  const maximumDistance = drag.projection.fractionToDistance(
    PIN_SNAP_DISTANCE_PX / width
  );
  return orderedPins(sourceGuide)
    .filter(pin =>
      pin.id !== drag.id
      && Math.abs(
        drag.projection.sourceToTimeline(pin.t) - coordinate
      ) <= maximumDistance
      && canLinkPins(sourceGuide, drag.id, pin.id).allowed
    )
    .sort((first, second) =>
      Math.abs(drag.projection.sourceToTimeline(first.t) - coordinate)
      - Math.abs(drag.projection.sourceToTimeline(second.t) - coordinate)
      || sectionsForPin(sourceGuide, second.id).length
        - sectionsForPin(sourceGuide, first.id).length
      || first.createdAt - second.createdAt
    )[0] || null;
}

function clearPinSnapArm(drag) {
  if (drag?.snapArmTimer !== null && drag?.snapArmTimer !== undefined) {
    window.clearTimeout(drag.snapArmTimer);
  }
  if (drag) drag.snapArmTimer = null;
}

function updatePinSnapTarget(drag, target) {
  const targetId = target?.id || null;
  if (targetId === drag.snapTargetPinId) return;
  clearPinSnapArm(drag);
  drag.snapTargetPinId = targetId;
  drag.snapArmed = false;
  if (!targetId) return;
  drag.snapArmTimer = window.setTimeout(() => {
    if (
      state.guideDrag !== drag
      || drag.snapTargetPinId !== targetId
    ) return;
    drag.snapArmTimer = null;
    drag.snapArmed = true;
    const targetPin = getPin(guide(), targetId);
    view.invalidateTimelinePins();
    view.renderGuide();
    view.render();
    setStatus(
      `Release to link with ${
        targetPin?.label?.trim() || `Pin ${formatTime(targetPin?.t)}`
      }.`
    );
  }, PIN_SNAP_ARM_MS);
}

// A focused extent is the world, and its own boundary cannot be moved from
// inside it. Dragging such a Pin could only ever pull the boundary inward,
// because the Range it defines is simultaneously the limit the drag clamps to,
// and every move re-normalizes the drawn map underneath the finger. Refusing
// the gesture is the honest answer: Unfocus first, or edit the Address in the
// Guide, where the same change is an exact edit rather than a spatial one.
function composesFocusedRange(pin, section) {
  if (!model().focus) return false;
  const range = activeRange();
  const onBoundary = address => Number.isFinite(address)
    && (
      Math.abs(address - range.start) <= EPSILON
      || Math.abs(address - range.end) <= EPSILON
    );
  if (pin) return onBoundary(pin.t);
  if (section) return onBoundary(section.start) || onBoundary(section.end);
  return false;
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
  if (composesFocusedRange(pin, section)) {
    setStatus(
      "Focus made this the world; Unfocus to move the boundary that defines it."
    );
    return;
  }
  const timelineSurface = elements.timeline.contains?.(event.target);
  const surface = options.surface || (timelineSurface ? "timeline" : "relative");
  const timelineWidth = elements.timeline.getBoundingClientRect().width;
  state.guideDrag = {
    kind,
    id,
    pointerId: event.pointerId,
    originClientX: event.clientX,
    surface,
    surfaceWidth: Number(options.surfaceWidth) || timelineWidth,
    origin: options.origin || (timelineSurface ? "timeline" : "guide"),
    sectionId: options.sectionId || null,
    originSource: pin?.t ?? section.start,
    originSection: section
      ? { start: section.start, end: section.end }
      : null,
    originModel: null,
    originHistory: null,
    originFuture: null,
    projection: projectionForModel(model()),
    threshold: Number(options.threshold) || 6,
    precision: event.shiftKey === true,
    moved: false,
    changed: false,
    blockedReason: null,
    rangeChanged: false,
    snapTargetPinId: null,
    snapArmed: false,
    snapArmTimer: null
  };
}

function previewGuideDrag(drag) {
  const sectionId = drag.kind === "section" ? drag.id : drag.sectionId;
  const section = sectionId ? resolveSection(guide(), sectionId) : null;
  const pin = drag.kind === "pin" ? getPin(guide(), drag.id) : null;
  const center = section?.midpoint ?? pin?.t;
  if (!Number.isFinite(center)) return;
  if (
    !Number.isFinite(drag.previewCenter)
    || Math.abs(drag.previewCenter - center) > 0.04
  ) {
    drag.previewCenter = center;
    placePlayer(center);
  }
  const frame = section
    ? {
        kind: "section",
        start: section.start,
        center: section.midpoint,
        end: section.end
      }
    : (() => {
      const step = fieldStepPreview(center, "pin");
      return { kind: "pin", start: step.start, center, end: step.end };
    })();
  state.directFrame = frame;
  stepField?.previewExtent?.(frame);
}

function clearGuideDragPreview({ restore = true } = {}) {
  state.directFrame = null;
  stepField?.clearPreview?.({ restore: false });
  if (!restore || !state.videoLoaded || !currentResolution()) return;
  const current = currentResolution().C;
  placePlayer(current);
  stepField?.translateToCurrent?.(current, { preserve: true });
}

function updateGuideDrag(event) {
  const drag = state.guideDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const distance = Math.abs(event.clientX - drag.originClientX);
  if (!drag.moved && distance < drag.threshold) return;
  if (!drag.moved) {
    try {
      elements.timeline.setPointerCapture?.(event.pointerId);
    } catch {
      // Document-level listeners retain the drag if pointer capture is absent.
    }
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
  }
  event.preventDefault?.();
  event.stopPropagation?.();

  // Shift-drag is precision mode: it reduces movement gain and quantizes the
  // resulting source Address, keeping the same semantic gesture owner.
  drag.precision = drag.precision || event.shiftKey === true;
  const source = drag.precision
    ? precisionDragSource(event, drag)
    : drag.surface === "relative"
      ? sourceFromRelativeDragDelta(event, drag)
      : sourceFromPointerInProjection(
          event,
          drag.projection,
          drag.originSource
        );
  const baseSession = {
    model: drag.originModel,
    history: drag.originHistory,
    future: drag.originFuture
  };
  const snapTarget = pinSnapCandidate(drag, source);
  updatePinSnapTarget(drag, snapTarget);
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
  const dragSelection = drag.sectionId
    ? { kind: "section", id: drag.sectionId }
    : { kind: drag.kind, id: drag.id };
  focusGuideRetained(dragSelection);
  if (drag.origin === "timeline") selectTimelineRetained(dragSelection);
  syncIntervalPinSelection();
  previewGuideDrag(drag);
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
}

function finishGuideDrag(event, options = {}) {
  const drag = state.guideDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) {
    return false;
  }
  const willLink = drag.kind === "pin"
    && drag.snapArmed
    && Boolean(drag.snapTargetPinId);
  clearPinSnapArm(drag);
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
      syncIntervalPinSelection();
      view.invalidateTimelinePins();
      view.renderGuide();
      view.render();
      clearGuideDragPreview();
    }
    return false;
  }

  state.guideClickSuppressed = true;
  window.setTimeout(() => {
    state.guideClickSuppressed = false;
  }, 0);
  if (!drag.changed && !willLink) {
    clearGuideDragPreview();
    setStatus(
      drag.blockedReason === "invalid-guide-geometry"
        ? "That move would collapse or reverse one of the linked Sections."
        : "The retained object stayed at its original Address."
    );
    view.render();
    return false;
  }

  let linkedTargetPinId = null;
  if (willLink) {
    const targetPin = getPin(drag.originModel.guide, drag.snapTargetPinId);
    const baseSession = {
      model: drag.originModel,
      history: drag.originHistory,
      future: drag.originFuture
    };
    const snapped = targetPin
      ? moveGuidePin(
          baseSession,
          drag.id,
          targetPin.t,
          { amend: true }
        )
      : { changed: false, reason: "missing-target-pin" };
    if (!snapped.changed && snapped.reason !== "unchanged-pin") {
      state.session = baseSession;
      clearGuideDragPreview();
      syncIntervalPinSelection();
      view.invalidateTimelinePins();
      view.renderGuide();
      view.render();
      setStatus("That Pin can no longer be linked at this Address.", true);
      return false;
    }
    state.session = snapped.changed ? snapped.session : baseSession;
    drag.rangeChanged = Boolean(snapped.rangeChanged);
    const linked = linkGuidePins(
      state.session,
      drag.id,
      drag.snapTargetPinId,
      { amend: true }
    );
    if (!linked.changed) {
      state.session = {
        model: drag.originModel,
        history: drag.originHistory,
        future: drag.originFuture
      };
      clearGuideDragPreview();
      syncIntervalPinSelection();
      view.invalidateTimelinePins();
      view.renderGuide();
      view.render();
      setStatus("Those Pins cannot be linked without invalidating a Section.", true);
      return false;
    }
    state.session = linked.session;
    linkedTargetPinId = drag.snapTargetPinId;
    if (!drag.sectionId) {
      const linkedSelection = { kind: "pin", id: linkedTargetPinId };
      focusGuideRetained(linkedSelection);
      if (drag.origin === "timeline") selectTimelineRetained(linkedSelection);
    }
  }

  const label = linkedTargetPinId
    ? "Link Pins"
    : drag.kind === "pin"
      ? "Move Pin"
      : "Move Section";
  const committed = checkpoint(state.session, label, drag.originModel);
  state.session = committed.session;
  syncIntervalPinSelection();
  const guidePersisted = persistGuide();
  if (drag.rangeChanged) {
    clearGuideDragPreview({ restore: false });
    locateAddress(currentResolution().C, { resetField: true });
  } else {
    clearGuideDragPreview();
  }
  if (drag.origin === "cluster-menu") view.closePinClusterMenu();
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
  const value = drag.kind === "pin"
    ? getPin(guide(), linkedTargetPinId || drag.id)
    : resolveSection(guide(), drag.id);
  if (guidePersisted) {
    setStatus(
      linkedTargetPinId
        ? `Linked with ${value?.label?.trim() || `Pin ${formatTime(value?.t)}`}; shared Sections now move together.`
        : drag.kind === "pin"
        ? `Moved Pin to ${formatTime(value?.t)}.`
        : `Moved “${sectionName(value)}” to ${formatRange(value)}.`
    );
  }
  return true;
}

// Dragging Current is an exact Go gesture. Pressing Current acquires the marker
// before the Timeline can interpret the gesture as generic Go; only crossing the
// movement threshold begins the candidate preview.
function beginCurrentDrag(event) {
  if (
    !state.videoLoaded
    || state.dragHandle
    || state.guideDrag
    || state.currentDrag
    || !currentResolution()
  ) return;
  event.stopPropagation?.();
  state.currentDrag = {
    pointerId: event.pointerId,
    originClientX: event.clientX,
    originSource: currentResolution().C,
    // The projection captured at pointer-down stays authoritative so the
    // geometry cannot jump if Weight or another derived condition changes.
    projection: projectionForModel(model()),
    candidate: currentResolution().C,
    threshold: 6,
    moved: false,
    precision: event.shiftKey === true
  };
}

function currentDragCandidate(event, drag) {
  const range = activeRange();
  if (drag.precision || event.shiftKey === true) {
    // Shift-drag is precision mode: reduced gain, quantized in source time and
    // then reprojected. Section Weight cannot change the size of one quantum.
    const rect = elements.timeline.getBoundingClientRect();
    const width = Number(rect.width) || 1;
    const span = range.end - range.start;
    const quantum = nudgeQuantum();
    const raw = drag.originSource
      + (event.clientX - drag.originClientX) / width * span * PRECISION_DRAG_GAIN;
    return clamp(Math.round(raw / quantum) * quantum, range.start, range.end);
  }
  return clamp(
    sourceFromPointerInProjection(event, drag.projection, drag.originSource),
    range.start,
    range.end
  );
}

function updateCurrentDrag(event) {
  const drag = state.currentDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.abs(event.clientX - drag.originClientX) < drag.threshold) {
    return;
  }
  if (!drag.moved) {
    drag.moved = true;
    settleBeforeAction();
    drag.originSource = currentResolution().C;
    drag.projection = projectionForModel(model());
    try {
      elements.timeline.setPointerCapture?.(event.pointerId);
    } catch {
      // Document-level listeners retain the gesture if capture is unavailable.
    }
  }
  event.preventDefault?.();
  event.stopPropagation?.();
  drag.precision = drag.precision || event.shiftKey === true;
  drag.candidate = currentDragCandidate(event, drag);
  // Center displays the candidate frame; Session Current remains unchanged.
  placePlayer(drag.candidate);
  showCurrentDragFrame(drag.candidate);
  view.render();
}

// The candidate Field Frame during a Current drag: the Context Frame when
// Context is enabled, otherwise the exact Go/operator Frame around the
// candidate Address.
function showCurrentDragFrame(candidate) {
  const contextHalf = state.contextSeconds / 2;
  const range = activeRange();
  const frame = state.contextSeconds > 0
    ? {
        kind: "current",
        start: Math.max(range.start, candidate - contextHalf),
        center: candidate,
        end: Math.min(range.end, candidate + contextHalf)
      }
    : (() => {
        const step = fieldStepPreview(candidate, "current");
        return { kind: "current", start: step.start, center: candidate, end: step.end };
      })();
  state.directFrame = frame;
  stepField?.previewExtent?.(frame);
}

function finishCurrentDrag(event, options = {}) {
  const drag = state.currentDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) {
    return false;
  }
  state.currentDrag = null;
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
  state.directFrame = null;
  // A stationary press performs no movement.
  if (!drag.moved) return false;
  state.guideClickSuppressed = true;
  window.setTimeout(() => {
    state.guideClickSuppressed = false;
  }, 0);
  if (options.cancel === true) {
    // Cancellation restores the original Current presentation and creates no
    // semantic change and no history.
    stepField?.clearPreview?.({ restore: false });
    locateAddress(currentResolution().C);
    stepField?.translateToCurrent?.(currentResolution().C, { preserve: true });
    view.render();
    return false;
  }
  stepField?.clearPreview?.({ restore: false });
  // Releasing commits one Step, not one Go: dragging Current extends or shortens
  // the retained traversal exactly as a Step of that distance would.
  const projection = drag.projection;
  const origin = drag.originSource;
  const distance = Math.abs(
    projection.sourceToTimeline(drag.candidate) - projection.sourceToTimeline(origin)
  );
  const committed = distance > 0
    && performStep(
      drag.candidate < origin ? "backward" : "forward",
      distance,
      { waitForGestureEnd: false }
    );
  if (committed) completePendingStep();
  else {
    locateAddress(currentResolution().C);
    stepField?.translateToCurrent?.(currentResolution().C, { preserve: true });
    view.render();
  }
  return Boolean(committed);
}

function handleTimelineClick(event) {
  if (!state.videoLoaded || state.dragHandle) return;
  if (
    event.target.closest(".range-handle")
    || event.target.closest(".timeline-pin")
    || event.target.closest(".pin-cluster-menu")
    || event.target.closest("[data-section-go]")
  ) return;
  view.closePinClusterMenu();
  const time = timeFromPointer(event, timelineProjection(), true);
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
  if (rejectFocusedRangeBoundaryEdit()) return;
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
  syncIntervalPinSelection();
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
    syncIntervalPinSelection();
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
    syncIntervalPinSelection();
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
  if (!state.videoLoaded || rejectFocusedRangeBoundaryEdit()) return;

  const range = activeRange();
  const amount = reachFor(forward ? "forward" : "backward") * (event.shiftKey ? 5 : 1);
  let value = kind === "start" ? range.start : range.end;
  if (event.key === "Home") value = kind === "start" ? 0 : range.start + MIN_RANGE_SECONDS;
  else if (event.key === "End") value = kind === "start" ? range.end - MIN_RANGE_SECONDS : model().duration;
  else {
    value = timelineProjection().stepSourceByTimeline(
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
      ? `${label}: 1/${Math.round(1 / result.stepReach.fraction)} of active Range (${effective.forward.toFixed(2)} Timeline units).`
      : `${label}: ${result.stepReach.forward} Timeline units.`
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

function prefersReducedMotion() {
  return Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );
}

// Inner and Outer Offset are the bounds of one Field relation, not two
// independent side settings. 0 < x < y is enforced against the sibling bound.
function changeFieldBoundary(boundary, value) {
  const parsed = Number(value);
  if (!String(value).trim() || !Number.isFinite(parsed) || parsed <= 0) {
    setStatus("Panorama offset must be a positive number.", true);
    view.render();
    return false;
  }
  const breath = currentFieldBreath();
  const amount = clamp(parsed, 0.25, 300);
  const next = boundary === "inner"
    ? { ...breath, inner: Math.min(amount, breath.outer) }
    : { ...breath, outer: Math.max(amount, breath.inner) };
  state.fieldBreath = normalizeFieldBreath(next);
  persistPreferences();
  stepField?.reconfigureOffset?.();
  setStatus(
    `${boundary === "inner" ? "Inner" : "Outer"} Panorama offset set to ${
      boundary === "inner" ? state.fieldBreath.inner : state.fieldBreath.outer
    }s.`
  );
  view.render();
  return true;
}

// Nudge is a source-time operation. There is one implementation regardless of
// whether it is invoked from the Timeline, Guide, keyboard, or pointer.
function frameDuration() {
  const reported = Number(player?.frameDuration?.());
  return Number.isFinite(reported) && reported > 0 ? reported : null;
}

function nudgeQuantum() {
  return frameDuration() ?? normalizeNudgeSeconds(state.nudgeSeconds);
}

function formatQuantum(value) {
  return `${Number(Number(value).toFixed(3))}s`;
}

function nudgeUnitLabel() {
  return frameDuration() ? "frame" : formatQuantum(nudgeQuantum());
}

function beginNudgeGesture(target) {
  const key = nudgeTargetKey(target);
  if (state.nudgeGesture?.key === key) {
    window.clearTimeout(state.nudgeGesture.timer);
  } else {
    settleNudgeGesture();
    const origin = snapshotModel(model(), { cloneGuide: true });
    const departure = origin.resolution.C;
    state.nudgeGesture = {
      key,
      origin,
      // Nudging Current is Step, not Go: it extends or shortens the retained
      // traversal from the same anchor instead of drawing a new one.
      departure,
      intervalDeparture: origin.interval
        && Math.abs(origin.interval.arrival - departure) <= EPSILON
        ? origin.interval.departure
        : departure,
      history: state.session.history,
      future: state.session.future || [],
      accumulator: 0,
      changed: false,
      timer: null
    };
  }
  state.nudgeGesture.timer = window.setTimeout(
    settleNudgeGesture,
    NUDGE_GESTURE_SETTLE_MS
  );
  return state.nudgeGesture;
}

// A held Weight control repeats the ladder step several times a second, and one
// hold is one decision. It uses the same shape as Nudge: an origin snapshot
// taken at press, every repeat amended against that origin's history so no
// intermediate entry accumulates, and one checkpoint at release.
function beginWeightGesture(sectionId) {
  if (state.weightGesture?.sectionId !== sectionId) {
    settleWeightGesture();
    state.weightGesture = {
      sectionId,
      origin: snapshotModel(model(), { cloneGuide: true }),
      history: state.session.history,
      future: state.session.future || [],
      label: null,
      changed: false
    };
  }
  return state.weightGesture;
}

function settleWeightGesture() {
  const gesture = state.weightGesture;
  if (!gesture) return false;
  state.weightGesture = null;
  if (!gesture.changed) return false;
  const committed = checkpoint(state.session, gesture.label || "Deform", gesture.origin);
  state.session = committed.session;
  persistGuide();
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
  return true;
}

// One continuous wheel series or held-key repetition settles as exactly one
// Undo transaction.
function settleNudgeGesture() {
  const gesture = state.nudgeGesture;
  if (!gesture) return false;
  window.clearTimeout(gesture.timer);
  state.nudgeGesture = null;
  if (!gesture.changed) return false;
  const committed = checkpoint(state.session, gesture.label || "Nudge", gesture.origin);
  state.session = committed.session;
  syncIntervalPinSelection();
  persistGuide();
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
  return true;
}

// Current is displaced by Step rather than by Go, so a drag or a Nudge extends
// or shortens the retained traversal instead of replacing it with a new Working
// Interval and a new Resolution. If a fresh neighbourhood is wanted, that is
// what clicking the Timeline is for.
function stepCurrentBySourceDelta(session, sourceDelta, options = {}) {
  const projection = timelineProjection();
  const range = activeRange();
  const current = session.model.resolution.C;
  const destination = clamp(current + sourceDelta, range.start, range.end);
  const distance = Math.abs(
    projection.sourceToTimeline(destination) - projection.sourceToTimeline(current)
  );
  if (!(distance > 0)) return { changed: false, reason: "range-edge", session };
  return stepSession(
    session,
    sourceDelta < 0 ? "backward" : "forward",
    distance,
    options
  );
}

function nudgeTargetKey(target) {
  return `${target.kind}:${target.id || "current"}`;
}

// The one Nudge operation. Timeline Shift-wheel, keyboard, and every Guide
// increment control route through here, so they always agree.
function nudgeTarget(target, direction, options = {}) {
  if (!state.videoLoaded || !currentResolution()) return false;
  const steps = Number.isFinite(options.steps) ? Math.trunc(options.steps) : 1;
  if (!steps) return false;
  const delta = direction * steps * nudgeQuantum();
  const gesture = beginNudgeGesture(target);
  const base = {
    model: gesture.origin,
    history: gesture.history,
    future: gesture.future
  };
  // Each nudge amends the same origin snapshot; only settlement appends history.
  const amendable = { model: model(), history: base.history, future: base.future };
  let result = null;
  if (target.kind === "current") {
    gesture.label = "Nudge Current";
    // Current moves by Step law. The quantum is source time, so it is converted
    // to the equivalent Timeline distance at Current before it is stepped —
    // Section Weight therefore cannot change the temporal size of one Nudge.
    result = stepCurrentBySourceDelta(amendable, delta, {
      departure: gesture.departure,
      intervalDeparture: gesture.intervalDeparture,
      originInterval: gesture.origin.interval,
      originResolution: gesture.origin.resolution,
      originResolutionBasis: gesture.origin.resolutionBasis,
      amend: true
    });
    if (result.changed) state.session = result.session;
  } else if (target.kind === "pin") {
    gesture.label = "Nudge Pin";
    const pin = getPin(guide(), target.id);
    if (!pin) return false;
    result = moveGuidePin(amendable, target.id, pin.t + delta, { amend: true });
    if (result.changed) state.session = result.session;
  } else if (target.kind === "section") {
    gesture.label = "Nudge Section";
    const section = resolveSection(guide(), target.id);
    if (!section) return false;
    result = moveGuideSection(amendable, target.id, delta, { amend: true });
    if (result.changed) state.session = result.session;
  } else {
    return false;
  }
  if (!result?.changed) {
    view.render();
    return false;
  }
  gesture.changed = true;
  locateAddress(currentResolution().C);
  syncIntervalPinSelection();
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
  setStatus(
    `${gesture.label} ${direction > 0 ? "forward" : "backward"} by ${
      steps === 1 ? "one" : steps
    } ${nudgeUnitLabel()}.`
  );
  return true;
}

// Increment controls repeat while held. The action itself already batches into
// one Undo checkpoint per gesture, so a held press is one transaction however
// many repetitions it produces.
const HOLD_REPEAT_DELAY_MS = 380;
const HOLD_REPEAT_INTERVAL_MS = 80;

// Bound once to a container. With a selector it delegates, so it survives Guide
// re-rendering; without one the container is itself the control.
function bindHoldRepeat(container, selector, act, { onSettle = null } = {}) {
  if (!container?.addEventListener) return;
  let delayTimer = null;
  let repeatTimer = null;
  let active = null;

  const stop = () => {
    const wasActive = active;
    active = null;
    window.clearTimeout(delayTimer);
    window.clearInterval(repeatTimer);
    delayTimer = null;
    repeatTimer = null;
    if (wasActive) onSettle?.();
  };
  const start = control => {
    if (active || !control || control.disabled) return;
    active = control;
    act(control);
    delayTimer = window.setTimeout(() => {
      repeatTimer = window.setInterval(() => {
        if (!active || active.disabled) stop();
        else act(active);
      }, HOLD_REPEAT_INTERVAL_MS);
    }, HOLD_REPEAT_DELAY_MS);
  };

  const resolve = target => (
    selector ? target?.closest?.(selector) : container
  );

  container.addEventListener("pointerdown", event => {
    if (Number.isFinite(event.button) && event.button !== 0) return;
    const control = resolve(event.target);
    if (!control) return;
    event.preventDefault();
    start(control);
  });
  container.addEventListener("keydown", event => {
    const control = resolve(event.target);
    if (!control || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (!event.repeat) start(control);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave", "keyup", "focusout"]) {
    container.addEventListener(type, stop);
  }
  document.addEventListener("pointerup", stop);
  document.addEventListener("pointercancel", stop);
}

// The exact manipulable object under the pointer owns the Nudge. An empty
// Timeline nudges Current.
function nudgeTargetFromElement(node) {
  const pin = node?.closest?.("[data-pin-go]") || node?.closest?.("[data-pin-drag]");
  if (pin) {
    return { kind: "pin", id: pin.dataset.pinGo || pin.dataset.pinDrag };
  }
  const section = node?.closest?.("[data-section-go]");
  if (section) return { kind: "section", id: section.dataset.sectionGo };
  return { kind: "current" };
}

function selectedNudgeTarget() {
  const selected = state.selectedRetained;
  if (selected?.kind === "pin" && getPin(guide(), selected.id)) {
    return { kind: "pin", id: selected.id };
  }
  if (selected?.kind === "section" && resolveSection(guide(), selected.id)) {
    return { kind: "section", id: selected.id };
  }
  return { kind: "current" };
}

// High-resolution trackpad deltas accumulate until one discrete quantum is
// crossed. The browser default is prevented only for an acquired target.
function handleTimelineWheel(event) {
  if (!event.shiftKey || !state.videoLoaded || !currentResolution()) return;
  const target = nudgeTargetFromElement(event.target);
  if (!target) return;
  event.preventDefault();
  const gesture = beginNudgeGesture(target);
  const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY;
  gesture.accumulator += raw;
  const steps = Math.trunc(gesture.accumulator / NUDGE_WHEEL_THRESHOLD);
  if (!steps) return;
  gesture.accumulator -= steps * NUDGE_WHEEL_THRESHOLD;
  // Wheel-up and wheel-right are forward.
  nudgeTarget(target, steps < 0 ? 1 : -1, { steps: Math.abs(steps) });
}

function syncContextControl() {
  elements["context-seconds"].value = String(state.contextSeconds);
}

// Cues: a creator's chapters offered as candidates.
//
// They are parsed from a pasted description, held only in interface state, and
// never enter the Guide, the projection, or traversal. Navigating one is an
// ordinary Go; composing two is the ordinary extension law; and retaining one
// is the ordinary save, carrying the creator's own title across.
function cueAt(index) {
  return state.cues[Number(index)] || null;
}

function cueLabelFor(cue) {
  return cueName(cue) || `Cue at ${formatTime(cue.time)}`;
}

function cueSpans(cue) {
  return cue.end - cue.start > EPSILON;
}

function offerCues(event = null) {
  event?.preventDefault?.();
  if (!state.videoLoaded) return;
  const cues = parseCueList(elements["cue-source"].value, {
    duration: model().duration
  });
  state.cues = cues;
  view.renderGuide();
  view.render();
  setStatus(cues.length
    ? `Offered ${cues.length} Cue${cues.length === 1 ? "" : "s"}. Nothing is retained until you say so.`
    : "No Addresses found in that text.", !cues.length);
}

function clearCues() {
  state.cues = [];
  state.cuesOnTimeline = false;
  elements["cue-source"].value = "";
  view.renderGuide();
  view.render();
  setStatus("Cleared the offered Cues.");
}

// Drawing every Cue at once answers the question the list cannot: where the
// creator's divisions fall relative to the structure already built. It is a
// drawing and stays one -- the marks are inert, so the only way a Cue becomes
// something to act on is still to retain it.
function toggleCueLane() {
  if (!(state.cues || []).length) return;
  state.cuesOnTimeline = !state.cuesOnTimeline;
  view.renderGuide();
  view.render();
  setStatus(state.cuesOnTimeline
    ? `Drawing ${state.cues.length} Cue${state.cues.length === 1 ? "" : "s"} on the map. They mark, they do not act.`
    : "Cues are no longer drawn on the map.");
}

function goToCue(index, { composing = false } = {}) {
  const cue = cueAt(index);
  if (!cue) return;
  if (composing && extendIntervalToExtent(cue, cueLabelFor(cue))) return;
  settleBeforeAction();
  if (!cueSpans(cue)) {
    return moveToAddress(cue.time, {
      operator: "cue",
      label: `Go to ${cueLabelFor(cue)}`,
      status: destination => `Current is at ${cueLabelFor(cue)}, ${formatTime(destination)}.`
    });
  }
  moveToAddress((cue.start + cue.end) / 2, {
    operator: "section",
    label: `Go to ${cueLabelFor(cue)}`,
    transaction: sourceSession => workFromExtent(sourceSession, cue, {
      operator: "section",
      label: `Go to ${cueLabelFor(cue)}`
    }),
    status: destination =>
      `${cueLabelFor(cue)} is the Working Interval; Current is centered at ${formatTime(destination)}.`
  });
}

// Retention is the moment a candidate becomes structure, and it is the ordinary
// save -- so a retained Cue is indistinguishable afterwards from one the reader
// drew. The creator's title comes across because it is the thing worth keeping.
function retainCue(index) {
  const cue = cueAt(index);
  if (!cue) return;
  settleBeforeAction();
  const label = cueName(cue) || "";
  if (!cueSpans(cue)) {
    goToCue(index);
    const pinned = pinSessionCurrent(state.session, label);
    if (!pinned.changed) return setStatus("That Address already holds a Pin.");
    // Retention is an ordinary Guide transaction, so it goes through the one
    // path that saves. Assigning the Session directly reported a retained Cue
    // that no reload could find.
    const pinId = pinned.value.pin.id;
    if (!accept(pinned, {
      effect: false,
      renderGuide: true,
      status: `Retained ${cueLabelFor(cue)} as a Pin.`
    })) return;
    selectTimelineRetained({ kind: "pin", id: pinId });
    selectGuideTab("pins");
    view.renderGuide();
    view.render();
    return;
  }
  const saved = saveExtentAsSection(state.session, cue, label, "cue");
  if (!saved.changed) {
    const existing = saved.value?.section;
    if (existing) {
      selectTimelineRetained({ kind: "section", id: existing.id });
      selectGuideTab("sections");
      view.renderGuide();
      view.render();
    }
    return setStatus("That extent is already a retained Section.");
  }
  const sectionId = saved.value.section.id;
  if (!accept(saved, {
    effect: false,
    renderGuide: true,
    status: `Retained ${cueLabelFor(cue)} as a Section.`
  })) return;
  selectTimelineRetained({ kind: "section", id: sectionId });
  selectGuideTab("sections");
  view.renderGuide();
  view.render();
}

const GUIDE_TABS = ["sections", "pins", "cues"];

function selectGuideTab(tab, { focus = false } = {}) {
  const names = GUIDE_TABS;
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
  const open = state.guideOpen;
  const panel = elements["guide-panel"];
  const rail = elements["command-workspace"];
  const guideVisible = compact ? open : open && state.railMode === "guide";
  const controlsVisible = compact || (open && state.railMode === "controls");
  panel.classList.toggle("is-open", compact && guideVisible);
  panel.hidden = !compact && !guideVisible;
  panel.inert = !guideVisible;
  panel.setAttribute("aria-hidden", String(!guideVisible));
  for (const id of ["parameter-panel", "navigation-panel"]) {
    elements[id].hidden = !controlsVisible;
  }
  rail.classList.toggle("mode-guide", !compact && state.railMode === "guide");
  rail.classList.toggle("mode-controls", !compact && state.railMode === "controls");
  rail.classList.toggle("is-collapsed", !compact && !open);
  rail.inert = !compact && !open;
  elements["reader-column"].classList.toggle("rail-collapsed", !compact && !open);
  elements["guide-toggle"].setAttribute("aria-expanded", String(guideVisible));
  elements["operator-toggle"].setAttribute(
    "aria-expanded",
    String(!compact && controlsVisible)
  );
  elements["guide-scrim"].hidden = !(compact && guideVisible);
  panel.setAttribute("role", compact ? "dialog" : "complementary");
  if (compact && guideVisible) panel.setAttribute("aria-modal", "true");
  else panel.removeAttribute("aria-modal");
  document.body?.classList?.toggle("guide-open", compact && guideVisible);
  // The compact Guide is a true modal surface: pointer, keyboard, and assistive
  // technology must not continue into the obscured reader or loading controls.
  for (const id of [
    "player-panel",
    "timeline-panel",
    "parameter-panel",
    "navigation-panel"
  ]) {
    elements[id].inert = compact && guideVisible;
  }
  elements["load-bar"].inert = compact && guideVisible;
  if (focus && guideVisible) {
    (compact ? elements["guide-close"] : elements[`guide-tab-${state.guideTab}`])
      ?.focus?.({ preventScroll: true });
  } else if (focus && controlsVisible) {
    elements["navigation-panel"]
      ?.querySelector?.("button:not(:disabled)")
      ?.focus?.({ preventScroll: true });
  }
}

// A breakpoint changes the physical form of the rail. It does not decide what
// the reader wanted open: rotating a device or resizing a window used to open
// or close the Guide on their behalf, so a deliberate close could be undone by
// a width change alone. The first layout still chooses a sensible default,
// because there is no intent to preserve yet.
function syncGuideLayout() {
  const compact = compactGuideLayout();
  if (state.compactGuide === null) state.guideOpen = !compact;
  state.compactGuide = compact;
  applyGuideState();
}

function openGuide(tab = state.guideTab) {
  if (state.compactGuide !== compactGuideLayout()) syncGuideLayout();
  state.guideReturnFocus = document.activeElement;
  selectGuideTab(tab);
  state.railMode = "guide";
  state.guideOpen = true;
  applyGuideState({ focus: true });
}

function closeGuide({ restoreFocus = true } = {}) {
  const returnFocus = state.guideReturnFocus;
  state.guideOpen = false;
  applyGuideState();
  if (restoreFocus) {
    (returnFocus || elements["guide-toggle"])?.focus?.({ preventScroll: true });
  }
  state.guideReturnFocus = null;
}

function openControls() {
  if (state.compactGuide !== compactGuideLayout()) syncGuideLayout();
  if (compactGuideLayout()) return;
  state.guideReturnFocus = document.activeElement;
  state.railMode = "controls";
  state.guideOpen = true;
  applyGuideState({ focus: true });
}

function closeCompactGuideAfterSelection() {
  if (compactGuideLayout()) closeGuide();
}

function toggleGuide(tab = state.guideTab) {
  if (state.compactGuide !== compactGuideLayout()) syncGuideLayout();
  if (!compactGuideLayout()) {
    if (state.guideOpen && state.railMode === "guide") closeGuide();
    else openGuide(tab);
    return;
  }
  if (state.guideOpen && tab === state.guideTab) closeGuide();
  else openGuide(tab);
}

function toggleControls() {
  if (state.compactGuide !== compactGuideLayout()) syncGuideLayout();
  if (compactGuideLayout()) return;
  if (state.guideOpen && state.railMode === "controls") closeGuide();
  else openControls();
}

function toggleRangeTools() {
  elements["range-tools"].open = !elements["range-tools"].open;
  elements["range-state"].setAttribute("aria-expanded", String(elements["range-tools"].open));
}

// Escape is the universal cancel. A live direct manipulation owns it first, so
// the same key that abandons a drag never also closes the surface behind it.
function cancelActiveManipulation() {
  if (state.currentDrag) {
    finishCurrentDrag({ pointerId: state.currentDrag.pointerId }, { cancel: true });
    return true;
  }
  if (state.guideDrag) {
    finishGuideDrag({ pointerId: state.guideDrag.pointerId }, { cancel: true });
    return true;
  }
  if (state.dragHandle) {
    cancelRangeDrag();
    return true;
  }
  return false;
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

function reclaimCenterKeyboardFocus() {
  if (!player?.releaseKeyboardFocus?.(document.activeElement)) return false;
  window.focus?.();
  return true;
}

function releasePointerControlFocus(event) {
  for (let control = event.target; control && control !== document.body; control = control.parentElement) {
    if (!["BUTTON", "SUMMARY"].includes(control.tagName)) continue;
    if (document.activeElement === control) control.blur?.();
    return;
  }
}

function initializePlayerApi() {
  if (player || !isYouTubeApiReady()) return;
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
      range: activeFieldRange(),
      // Step Field offsets are physical observation settings. They are
      // intentionally independent from the semantic Step Reach.
      stepReach: currentFieldOffsets(),
      fieldBreath: currentFieldBreath(),
      // The application resolves the ambient Frame owner and supplies exact
      // source Addresses. The Field controller never imports timeline
      // projection, operator arithmetic, or Context math.
      fieldFrame: fieldOperatorPreview(),
      transportKind: state.transport.kind,
      pendingStep: Boolean(state.pendingStep),
      dragging: Boolean(
        state.dragHandle || state.guideDrag?.moved || state.currentDrag?.moved
      ),
      center: playerSnapshot(),
      playerState: state.playerState
    }),
    getPreferences: () => ({
      stepFieldEnabled: state.stepFieldEnabled,
      tailVisible: state.tailVisible,
      leadVisible: state.leadVisible,
      breathRate: currentFieldBreath().rate,
      reducedMotion: prefersReducedMotion()
    }),
    setPreferences: patch => {
      if (Object.hasOwn(patch, "stepFieldEnabled")) state.stepFieldEnabled = Boolean(patch.stepFieldEnabled);
      if (Object.hasOwn(patch, "tailVisible")) state.tailVisible = Boolean(patch.tailVisible);
      if (Object.hasOwn(patch, "leadVisible")) state.leadVisible = Boolean(patch.leadVisible);
      if (Object.hasOwn(patch, "breathRate")) {
        state.fieldBreath = normalizeFieldBreath({
          ...currentFieldBreath(),
          rate: patch.breathRate
        });
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

if (isYouTubeApiReady()) {
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
elements.timeline.addEventListener("pointermove", updateCurrentDrag);
elements.timeline.addEventListener("pointerup", finishRangeDrag);
elements.timeline.addEventListener("pointerup", finishGuideDrag);
elements.timeline.addEventListener("pointerup", finishCurrentDrag);
elements.timeline.addEventListener("pointercancel", cancelRangeDrag);
elements.timeline.addEventListener("pointercancel", event => {
  finishGuideDrag(event, { cancel: true });
  finishCurrentDrag(event, { cancel: true });
});
// Current is its own gesture owner. Acquiring it on pointer-down keeps the
// Timeline from interpreting the same press as a generic Go.
elements["current-marker"].addEventListener("pointerdown", beginCurrentDrag);
// Shift + wheel nudges the exact manipulable object under the pointer.
elements.timeline.addEventListener("wheel", handleTimelineWheel, { passive: false });
document.addEventListener("pointerup", finishGuideDrag);
document.addEventListener("pointerup", finishCurrentDrag);
document.addEventListener("pointercancel", event => {
  finishGuideDrag(event, { cancel: true });
  finishCurrentDrag(event, { cancel: true });
});
document.addEventListener("pointermove", event => {
  if (elements.timeline.contains?.(event.target)) return;
  updateGuideDrag(event);
  updateCurrentDrag(event);
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
  const clusterButton = event.target.closest("[data-cluster-index]");
  if (clusterButton && !clusterButton.dataset.pinGo) {
    event.preventDefault();
    event.stopPropagation();
    const cluster = view.clusterAt(Number(clusterButton.dataset.clusterIndex));
    if (cluster) view.openPinClusterMenu(cluster, clusterButton);
    return;
  }
  const pinButton = event.target.closest("[data-pin-go]");
  if (!pinButton) return;
  event.stopPropagation();
  beginGuideDrag("pin", pinButton.dataset.pinGo, event, {
    origin: "timeline",
    threshold: 8
  });
});
elements["section-lane"].addEventListener("click", event => {
  if (state.guideClickSuppressed) {
    event.stopPropagation();
    return;
  }
  const body = event.target.closest("[data-section-go]");
  if (body) {
    event.stopPropagation();
    selectSectionAsWorkingInterval(
      body.dataset.sectionGo,
      { carryRetained: event.altKey === true }
    );
  }
});
// The Temporal Topography owns spatial direct manipulation, but the Section wire
// is already its own control: pressing within a quarter-width of either end
// acquires that endpoint Pin, and pressing the middle translates the complete
// Section. The roles come from where the wire was pressed rather than from extra
// nodes drawn over the map.
const SECTION_END_GRIP = 0.25;

function sectionWireRole(body, event) {
  const rect = body.getBoundingClientRect?.();
  const width = Number(rect?.width);
  if (!Number.isFinite(width) || width <= 0) return "midpoint";
  const position = (event.clientX - rect.left) / width;
  if (position <= SECTION_END_GRIP) return "start";
  if (position >= 1 - SECTION_END_GRIP) return "end";
  return "midpoint";
}

elements["section-lane"].addEventListener("pointerdown", event => {
  const body = event.target.closest("[data-section-go]");
  if (!body) return;
  const section = resolveSection(guide(), body.dataset.sectionGo);
  if (!section) return;
  event.stopPropagation();
  const role = sectionWireRole(body, event);
  if (role === "midpoint") {
    beginGuideDrag("section", section.id, event, {
      origin: "timeline",
      threshold: 6
    });
    return;
  }
  beginGuideDrag(
    "pin",
    role === "start" ? section.startPin.id : section.endPin.id,
    event,
    { origin: "timeline", sectionId: section.id, threshold: 6 }
  );
});
function activatePinClusterChoice(button, event) {
  if (state.guideClickSuppressed) {
    event.stopPropagation();
    return false;
  }
  if (!button) return false;
  event.stopPropagation();
  const pinId = button.dataset.pinGo;
  const clusterIndex = Number(button.dataset.clusterIndex);
  view.closePinClusterMenu();
  goToPin(
    getPin(guide(), pinId),
    "pin",
    { carryRetained: event.altKey === true }
  );
  if (Number.isInteger(clusterIndex)) {
    const cluster = view.clusterAt(clusterIndex);
    const trigger = elements["pin-lane"].querySelector?.(
      `[data-cluster-index="${clusterIndex}"]`
    );
    if (cluster && trigger) view.openPinClusterMenu(cluster, trigger, {
      focusPinId: pinId
    });
  }
  return true;
}

elements["pin-cluster-menu"].addEventListener("pointerdown", event => {
  const button = event.target.closest("[data-pin-drag]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  beginGuideDrag("pin", button.dataset.pinDrag, event, {
    surface: "relative",
    surfaceWidth: elements.timeline.getBoundingClientRect().width,
    origin: "cluster-menu",
    threshold: 8
  });
});

elements["pin-cluster-menu"].addEventListener("click", event => {
  const button = event.target.closest("[data-pin-go]");
  if (!button) return;
  activatePinClusterChoice(button, event);
});
elements["pin-cluster-menu"].addEventListener("keydown", event => {
  const buttons = [...elements["pin-cluster-menu"].querySelectorAll("[role=menuitem]")];
  if (!buttons.length) return;
  const index = Math.max(0, buttons.indexOf(document.activeElement));
  let next = null;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    next = (index + 1) % buttons.length;
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    next = (index + buttons.length - 1) % buttons.length;
  }
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

document.addEventListener("pointerdown", event => {
  if (elements["pin-cluster-menu"].hidden) return;
  if (
    event.target.closest?.(".pin-cluster-menu")
    || event.target.closest?.("[data-cluster-index]")
  ) return;
  view.closePinClusterMenu();
});

elements["range-start-here"].addEventListener("click", () => {
  if (rejectFocusedRangeBoundaryEdit()) return;
  setRange(
    currentResolution().C,
    activeRange().end,
    currentResolution().C,
    "Set Range Start",
    `Set Range Start to ${formatTime(currentResolution().C)}.`
  );
});
elements["range-end-here"].addEventListener("click", () => {
  if (rejectFocusedRangeBoundaryEdit()) return;
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
  const middle = timelineProjection().timelineMidpoint(
    activeRange().start,
    activeRange().end
  );
  moveToAddress(middle, {
    operator: "rangeMidpoint",
    label: "Go to Timeline Midpoint",
    carryRetained: event.altKey === true,
    status: destination => `Moved to Timeline midpoint at ${formatTime(destination)}.`
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
  if (rejectFocusedRangeBoundaryEdit()) return;
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
elements.deform.addEventListener("click", deformWorkingOrSelected);
// Weight steppers repeat while held, like every other increment control.
bindHoldRepeat(
  elements["deform-down"],
  null,
  () => stepDeformWeight(-1, { gesture: true }),
  { onSettle: settleWeightGesture }
);
bindHoldRepeat(
  elements["deform-up"],
  null,
  () => stepDeformWeight(1, { gesture: true }),
  { onSettle: settleWeightGesture }
);
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
    return traverseToAdjacentPin(
      selection.direction,
      selection.carryRetained === true
    );
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
  if (!selection || !Number.isFinite(selection.address) || !currentResolution()) {
    return null;
  }
  // The Field presents an exact source Address; Step consumes Timeline Space.
  // Convert at the application boundary so activating a visible phase lands on
  // that phase under neutral, compressed, expanded, and overlapping terrain.
  const distance = timelineProjection().timelineDistance(
    currentResolution().C,
    selection.address
  );
  if (!(distance > EPSILON)) return null;
  return {
    ...selection,
    distance,
    carryRetained: event?.altKey === true || state.carryModifier
  };
};

for (const binding of [
  [elements["step-backward"], "matrix:backward", directionalStep("backward"), true],
  [elements["step-forward"], "matrix:forward", directionalStep("forward"), true],
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

// Pointer focus is no longer needed at release, and blurring does not cancel
// the ensuing click. Keyboard focus remains intact for Tab and Enter.
document.addEventListener("pointerup", releasePointerControlFocus);

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
elements["field-inner-offset"].addEventListener("change", event => {
  changeFieldBoundary("inner", event.target.value);
});
elements["field-outer-offset"].addEventListener("change", event => {
  changeFieldBoundary("outer", event.target.value);
});
elements["nudge-seconds"].addEventListener("change", event => {
  const parsed = Number(event.target.value);
  if (!String(event.target.value).trim() || !Number.isFinite(parsed) || parsed <= 0) {
    setStatus("Nudge must be a positive number of seconds.", true);
    view.render();
    return;
  }
  state.nudgeSeconds = normalizeNudgeSeconds(parsed);
  persistPreferences();
  setStatus(`Nudge set to ${formatQuantum(state.nudgeSeconds)}.`);
  view.render();
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
elements["operator-toggle"].addEventListener("click", toggleControls);
elements["guide-close"].addEventListener("click", closeGuide);
elements["guide-scrim"].addEventListener("click", closeGuide);
elements["guide-tab-sections"].addEventListener("click", () => selectGuideTab("sections"));
elements["guide-tab-pins"].addEventListener("click", () => selectGuideTab("pins"));
elements["guide-tab-cues"].addEventListener("click", () => selectGuideTab("cues"));
elements["sections-list"].addEventListener("change", event => {
  const move = event.target.closest?.("[data-section-group]");
  if (move) {
    settleBeforeAction({ transport: false });
    const moved = assignGuideSectionGroup(
      state.session,
      move.dataset.sectionGroup,
      move.value
    );
    if (!moved.changed) {
      view.renderGuide();
      if (moved.reason === "duplicate-section") {
        setStatus("That Group already contains the same Section.");
      }
      return;
    }
    return accept(moved, {
      effect: false,
      renderGuide: true,
      status: `${moved.session.history.at(-1)?.label || "Section moved"}.`
    });
  }
  const toggle = event.target.closest?.("[data-group-toggle]");
  if (!toggle) return;
  const key = toggle.dataset.groupState;
  if (key !== "visible" && key !== "active") return;
  settleBeforeAction({ transport: false });
  const result = setGuideGroupState(state.session, toggle.dataset.groupToggle, {
    [key]: toggle.checked === true
  });
  if (!result.changed) return view.renderGuide();
  accept(result, {
    effect: false,
    renderGuide: true,
    status: `${result.session.history.at(-1)?.label || "Group updated"}.`
  });
});

// The Shift layer lives in the operator matrix, which the compact layout makes
// inert while the Guide is open -- so on a phone the Guide had no route to
// composition at all. This is the same one-shot state reached from where the
// objects being composed actually are.
elements["sections-list"].addEventListener("click", event => {
  const renameGroup = event.target.closest?.("[data-rename-group]");
  if (renameGroup) {
    event.stopPropagation();
    return renameGroupById(renameGroup.dataset.renameGroup);
  }
  const removeGroup = event.target.closest?.("[data-delete-group]");
  if (removeGroup) {
    event.stopPropagation();
    return deleteGroupById(removeGroup.dataset.deleteGroup);
  }
  if (!event.target.closest?.("[data-group-add]")) return;
  event.stopPropagation();
  settleBeforeAction({ transport: false });
  // The Guide chooses the first free ordinal; passing a count could collide
  // after a removal.
  const created = createGuideGroup(state.session);
  if (!created.changed) return;
  accept(created, {
    effect: false,
    renderGuide: true,
    // A new Group is the layer being worked on, so it takes the Timeline the
    // moment it exists -- and it is empty, so the map goes blank. That reads as
    // a fault unless it is said, because the Sections it replaced are still
    // there and one radio brings them back.
    status: "Added a Group and put it on the Timeline. It is empty, so the map is blank until you move Sections into it."
  });
});

elements["guide-compose-toggle"].addEventListener("click", () => {
  state.shiftLayer = !state.shiftLayer;
  view.renderGuide();
  view.render();
});

elements["cue-capture"].addEventListener("submit", offerCues);
elements["cue-clear"].addEventListener("click", clearCues);
elements["cue-lane-toggle"].addEventListener("click", toggleCueLane);
elements["cues-list"].addEventListener("click", event => {
  const retain = event.target.closest("[data-cue-retain]");
  if (retain) return retainCue(retain.dataset.cueRetain);
  const go = event.target.closest("[data-cue-go]");
  if (go) return goToCue(go.dataset.cueGo, { composing: composingGuideClick(event) });
});
for (const id of ["guide-tab-sections", "guide-tab-pins", "guide-tab-cues"]) {
  elements[id].addEventListener("keydown", handleGuideTabKeydown);
}
elements["guide-dialog-form"].addEventListener("submit", submitGuideDialog);
elements["guide-dialog-cancel"].addEventListener("click", () => closeGuideDialog());
elements["guide-dialog"].addEventListener("cancel", event => {
  event.preventDefault?.();
  closeGuideDialog();
});

function handleGuideTabKeydown(event) {
  const names = GUIDE_TABS;
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

// Guide is the exact editor. Address inputs accept canonical timecode or plain
// seconds, clamp against Range and structural partners, and commit as one
// transaction. There is no second drag geometry here.
// Guide is the exact editor, so a typed Address is honoured exactly or refused.
// Clamping belongs to dragging, where the boundary is physically encountered and
// felt; silently turning 2:00 into 1:30 makes the one surface that promises
// exactness the one that quietly disagrees with what was typed. Timecode parts
// are bounded too -- 1:75 is not a way of writing 2:15, it is a typing error.
function parseAddress(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":").map(part => part.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some(part => !/^\d+(\.\d+)?$/.test(part))) return null;
  if (parts.slice(1).some(part => Number(part) >= 60)) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

function guideAddressTarget(input) {
  const kind = input?.dataset?.addressInput;
  const id = input?.dataset?.addressId;
  if (kind === "pin") return { kind: "pin", id };
  if (kind === "section-start" || kind === "section-end") {
    const section = resolveSection(guide(), id);
    if (!section) return null;
    return {
      kind: "pin",
      id: kind === "section-start" ? section.startPin.id : section.endPin.id,
      sectionId: section.id
    };
  }
  if (kind === "section") return { kind: "section", id };
  return null;
}

function applyGuideAddressInput(input) {
  if (!input) return false;
  clearGuideAddressPreview();
  const target = guideAddressTarget(input);
  if (!target) return false;
  const parsed = parseAddress(input.value);
  if (parsed === null || !Number.isFinite(parsed)) {
    setStatus("Enter an Address as seconds or timecode.", true);
    view.renderGuide();
    return false;
  }
  // Outside the active Range is refused, not folded to the boundary: the value
  // that comes back is the one still committed, so the field never disagrees
  // with the object it edits.
  const range = activeRange();
  if (parsed < range.start - EPSILON || parsed > range.end + EPSILON) {
    setStatus(
      `${formatTime(parsed)} is outside the active Range ${formatRange(range)}.`,
      true
    );
    view.renderGuide();
    return false;
  }
  const address = parsed;
  const origin = snapshotModel(model(), { cloneGuide: true });
  const result = target.kind === "pin"
    ? moveGuidePin(state.session, target.id, address, { amend: true })
    : moveGuideSection(
      state.session,
      target.id,
      address - (resolveSection(guide(), target.id)?.start ?? address),
      { amend: true }
    );
  if (!result.changed) {
    setStatus(
      result.reason === "invalid-guide-geometry"
        ? "That Address would collapse or reverse a Section."
        : "That Address leaves the object unchanged.",
      result.reason === "invalid-guide-geometry"
    );
    view.renderGuide();
    return false;
  }
  const committed = checkpoint(
    result.session,
    target.kind === "pin" ? "Edit Pin Address" : "Edit Section Address",
    origin
  );
  state.session = committed.session;
  syncIntervalPinSelection();
  persistGuide();
  locateAddress(currentResolution().C);
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
  setStatus(`Set Address to ${formatTime(address)}.`);
  return true;
}

// An Address input previews the candidate Field Frame before commit. Typing is
// presentation only: it seeks the players but writes no Session state.
function previewGuideAddressInput(input) {
  const target = guideAddressTarget(input);
  const parsed = parseAddress(input?.value);
  if (!target || parsed === null || !Number.isFinite(parsed) || !state.videoLoaded) {
    return false;
  }
  const previewRange = activeRange();
  if (parsed < previewRange.start - EPSILON || parsed > previewRange.end + EPSILON) {
    return false;
  }
  const address = parsed;
  const section = target.sectionId
    ? resolveSection(guide(), target.sectionId)
    : input.dataset.addressInput === "section"
      ? resolveSection(guide(), target.id)
      : null;
  let frame;
  if (section && input.dataset.addressInput === "section") {
    const shift = address - section.start;
    frame = {
      kind: "section",
      start: section.start + shift,
      center: section.midpoint + shift,
      end: section.end + shift
    };
  } else if (section) {
    const start = input.dataset.addressInput === "section-start" ? address : section.start;
    const end = input.dataset.addressInput === "section-end" ? address : section.end;
    frame = { kind: "section", start, center: (start + end) / 2, end };
  } else {
    const step = fieldStepPreview(address, "pin");
    frame = { kind: "pin", start: step.start, center: address, end: step.end };
  }
  // Center shows what the drag path shows for the same edit: a Section's
  // midpoint, a Pin's own Address. Tail and Lead carry the edited edges.
  state.directFrame = frame;
  placePlayer(frame.center);
  stepField?.previewExtent?.(frame);
  return true;
}

function clearGuideAddressPreview() {
  if (!state.directFrame) return false;
  state.directFrame = null;
  stepField?.clearPreview?.({ restore: false });
  if (state.videoLoaded && currentResolution()) {
    locateAddress(currentResolution().C);
    stepField?.translateToCurrent?.(currentResolution().C, { preserve: true });
  }
  view.render();
  return true;
}

function guideNudgeTarget(control) {
  const kind = control?.dataset?.nudgeTarget;
  const id = control?.dataset?.nudgeId;
  if (!kind || !id) return null;
  if (kind === "pin") return { kind: "pin", id };
  const section = resolveSection(guide(), id);
  if (!section) return null;
  if (kind === "section-start") return { kind: "pin", id: section.startPin.id };
  if (kind === "section-end") return { kind: "pin", id: section.endPin.id };
  return { kind: "section", id };
}

function bindGuideNudgeControls(container) {
  bindHoldRepeat(container, "[data-nudge-target]", control => {
    const target = guideNudgeTarget(control);
    if (!target) return;
    nudgeTarget(target, Number(control.dataset.nudgeDirection) < 0 ? -1 : 1);
  });
}

function handleGuideAddressKeydown(event) {
  const input = event.target.closest?.("[data-address-input]");
  if (!input) return;
  if (event.key === "Enter") {
    event.preventDefault();
    applyGuideAddressInput(input);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    clearGuideAddressPreview();
    view.renderGuide();
  }
}

function handleGuideClick(event) {
  if (state.guideClickSuppressed) {
    event.preventDefault?.();
    event.stopPropagation?.();
    return;
  }
  const composing = composingGuideClick(event);
  const pinGo = event.target.closest("[data-pin-go]");
  if (pinGo) {
    const pinId = pinGo.dataset.pinGo;
    if (composing && extendIntervalToRetained(
      "pin",
      pinId,
      pinNameFor(pinId)
    )) return;
    const sectionId = pinGo.dataset.dragSection || null;
    return goToPin(
      getPin(guide(), pinId),
      "pin",
      {
        carryRetained: event.altKey === true,
        surface: "guide",
        selectionAfter: sectionId
          ? { kind: "section", id: sectionId }
          : undefined
      }
    );
  }
  const sectionGo = event.target.closest("[data-section-go]");
  if (sectionGo) {
    const id = sectionGo.dataset.sectionGo;
    if (composing && extendIntervalToRetained(
      "section",
      id,
      `“${sectionName(resolveSection(guide(), id))}”`
    )) return;
    return selectSectionAsWorkingInterval(
      id,
      { carryRetained: event.altKey === true, surface: "guide" }
    );
  }
  // Increment controls run through the shared hold-repeat binding, so a click
  // here would double-fire the first repetition.
  if (event.target.closest("[data-nudge-target]")) return;
  const addressGo = event.target.closest("[data-address-go]");
  if (addressGo) {
    return goToPin(
      getPin(guide(), addressGo.dataset.addressGo),
      "pin",
      { carryRetained: event.altKey === true, surface: "guide" }
    );
  }
  const reveal = event.target.closest("[data-reveal-pin]");
  if (reveal) return revealPin(reveal.dataset.revealPin);
  const focus = event.target.closest("[data-focus-section]");
  if (focus) return focusSection(focus.dataset.focusSection);
  const leave = event.target.closest("[data-leave-section]");
  if (leave) return leaveSection();
  const renamePinButton = event.target.closest("[data-rename-pin]");
  if (renamePinButton) return renamePinById(renamePinButton.dataset.renamePin);
  const deletePinButton = event.target.closest("[data-delete-pin]");
  if (deletePinButton) return deletePinById(deletePinButton.dataset.deletePin);
  const unlinkEndpoint = event.target.closest("[data-unlink-section-endpoint]");
  if (unlinkEndpoint) {
    return confirmSectionEndpointUnlink(
      unlinkEndpoint.dataset.unlinkSectionEndpoint,
      unlinkEndpoint.dataset.sectionEndpoint
    );
  }
  const renameSectionButton = event.target.closest("[data-rename-section]");
  if (renameSectionButton) return renameSectionById(renameSectionButton.dataset.renameSection);
  const deleteSectionButton = event.target.closest("[data-delete-section]");
  if (deleteSectionButton) return deleteSectionById(deleteSectionButton.dataset.deleteSection);
}

elements["sections-list"].addEventListener("click", handleGuideClick);
elements["sections-list"].addEventListener("change", event => {
  const control = event.target.closest("[data-section-weight]");
  if (control) {
    changeSectionWeight(control.dataset.sectionWeight, control.value);
    return;
  }
  applyGuideAddressInput(event.target.closest("[data-address-input]"));
});
elements["sections-list"].addEventListener("keydown", handleGuideAddressKeydown);
bindGuideNudgeControls(elements["sections-list"]);
elements["sections-list"].addEventListener("input", event => {
  previewGuideAddressInput(event.target.closest("[data-address-input]"));
});
elements["sections-list"].addEventListener("focusout", event => {
  if (event.target.closest?.("[data-address-input]")) clearGuideAddressPreview();
});
elements["pins-list"].addEventListener("click", handleGuideClick);
elements["pins-list"].addEventListener("change", event => {
  applyGuideAddressInput(event.target.closest("[data-address-input]"));
});
elements["pins-list"].addEventListener("keydown", handleGuideAddressKeydown);
bindGuideNudgeControls(elements["pins-list"]);
elements["pins-list"].addEventListener("input", event => {
  previewGuideAddressInput(event.target.closest("[data-address-input]"));
});
elements["pins-list"].addEventListener("focusout", event => {
  if (event.target.closest?.("[data-address-input]")) clearGuideAddressPreview();
});
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

// Space is the reader's universal observation command, and it belongs to the
// reader only while nothing else owns it. A focused interactive element owns
// its own Space: pressing it on Release must Release, not start playback, or
// the keyboard says one thing and does another. Capturing Space unconditionally
// was aimed at a stale focus stealing it, but it took the key from the control
// the user had deliberately focused as well. Focus on the reader background --
// which is where it sits after any traversal -- still observes.
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
  // Anything that natively activates on Space, or that has been given keyboard
  // activation of its own, keeps it.
  const focusedControl = Boolean(activeElement)
    && activeElement !== document.body
    && (
      ["BUTTON", "SUMMARY", "A", "OPTION"].includes(activeElement.tagName)
      || activeElement.getAttribute?.("role") === "button"
      || activeElement.getAttribute?.("role") === "slider"
      || activeElement.getAttribute?.("role") === "menuitem"
    );
  const plainSpace = (event.key === " " || event.code === "Space")
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.shiftKey;
  if (
    !plainSpace
    || event.repeat
    || editing
    || focusedControl
    || guideDialogOpen()
    || (compactGuideLayout() && state.guideOpen)
    || !state.videoLoaded
  ) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  toggleNativePlayback();
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
    if (!cancelActiveManipulation()) stopOrClose();
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

  // Conventional keyboard nudging. Repeated keydown events belong to one held
  // gesture and settle as one Undo checkpoint.
  if (plain && (event.key === "," || event.key === ".")) {
    event.preventDefault();
    nudgeTarget(selectedNudgeTarget(), event.key === "." ? 1 : -1);
    return;
  }

  const repeatableStep = (plain || carryChord)
    && (
      event.key === "ArrowLeft"
      || event.key === "ArrowRight"
      || code === "KeyA"
      || code === "KeyD"
      || event.key === ","
      || event.key === "."
    );
  if (event.repeat && !repeatableStep) return;

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
  else if (
    key === "t"
    && (
      plain
      || (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey)
      // Alt+T lowers Weight. Ctrl+T belongs to the browser, and a control path
      // the declared grammar does not contain is a path nobody can reason about.
      || (!event.shiftKey && !event.metaKey && !event.ctrlKey && event.altKey)
    )
  ) {
    event.preventDefault();
    if (event.shiftKey) stepDeformWeight(1);
    else if (event.altKey) stepDeformWeight(-1);
    else deformWorkingOrSelected();
  }
  else if (plain && key === "f") {
    event.preventDefault();
    focusOrUnfocus();
  }
  else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key === "p") {
    event.preventDefault();
    saveCurrentIntervalAsSection(event, {
      source: "interval",
      useFormLabel: false
    });
  }
  else if (plain && key === "p") {
    event.preventDefault();
    pinCurrent(event, { useFormLabel: false });
  }
  else if (shiftedSpatialKey("a") || (
    event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && event.key === "ArrowLeft"
  )) {
    event.preventDefault();
    traverseToAdjacentPin("backward", event.altKey === true);
  }
  else if (shiftedSpatialKey("d") || (
    event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && event.key === "ArrowRight"
  )) {
    event.preventDefault();
    traverseToAdjacentPin("forward", event.altKey === true);
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
  // Deferred like every other Step release. Without this a keyboard tap settled
  // on the spot, so three quick presses of `d` became three transactions while
  // the same three clicks — and a single held `d` — were one.
  stepGesture.end(gestureId, { observe: true, defer: true });
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
