// Application composition root. Semantic mutations pass through Session; player effects pass through adapters.
import {
  createTraversalTrace,
  appendAtomicTraversal,
  appendSequenceTraversal,
  appendObservedPassages,
  beginGhostRead,
  moveGhostRead,
  appendGhostReturn,
  tracePositionIsValid
} from "./traversal-trace.js";
import {
  EPSILON,
  clamp,
  contains,
  getTargets,
  refineBlockReason
} from "./range-geometry.js";
import {
  createGuide,
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
  planGuideGroupDeletion,
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
  switchActiveEnd as switchSessionEndpoint,
  releaseInterval as releaseSessionInterval,
  setRange as setSessionRange,
  previewRange,
  checkpoint,
  ghostTraverse,
  settleGhostSequence,
  settleStepSequence,
  focusSection as focusSessionSection,
  focusWorkingSection as focusSessionWorkingSection,
  leaveSection as leaveSessionSection,
  completePlayback,
  retainCurrentAsPin as pinSessionCurrent,
  retainSpanAsSection,
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
  OBSERVATION_POLICY,
  RATE_POLICY_KIND,
  idleTransport,
  isTransportActive,
  transportPanoramaRange,
  deriveContextWindow,
  isProperRange,
  createContextTransport,
  createPlaybackTransport,
  fixedRatePolicy,
  texturedRatePolicy,
  resolveOfferedRate,
  resolvePlaybackRate,
  withPlaybackRequestedRate,
  withPlaybackActualRate,
  withPlaybackRatePolicy,
  retryPlaybackTransport,
  playbackAllowsPanorama,
  rebasePlaybackTransport,
  withTransportPhase
} from "./transport.js";
import {
  YOUTUBE_STATE,
  createYouTubePlayer,
  isYouTubeApiReady,
  parseYouTubeUrl
} from "./youtube.js";
import { createPanoramaController } from "./panorama.js";
import {
  DEFAULT_PANORAMA_CYCLE,
  normalizePanoramaCycle,
  sideRateStepFromResponse
} from "./panorama-geometry.js";
import {
  FIELD_FRAME_OWNER,
  FIELD_FRAME_ACTIVATION,
  createPanoramaFrameSequencer
} from "./panorama-frame.js";
import {
  DEFAULT_STEP_GESTURE_TIMING,
  bindStepPress,
  createStepGestureController
} from "./step-gesture.js";
import { parseChapters, chapterTitle } from "./chapters.js";
import { sectionDisplayName, formatRate } from "./format.js";
import { createView } from "./view.js";

const STORAGE_V9_PREFIX = "binary-youtube-reader:v9:";
// Where a stored Guide that could not be read is kept, so a save cannot be the
// thing that destroys it. Every failure receives a unique evidence record.
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
const STEP_PRESETS = [0.25, 0.5, 1, 2, 3, 5, 10, 15, 30, 60, 120, 300];
const STEP_FRACTIONS = [1 / 32, 1 / 16, 1 / 8];
const NATIVE_GO_SETTLE_MS = 220;
const TRANSPORT_START_GRACE_MS = 1600;
const METADATA_GRACE_MS = 4000;
const METADATA_RETRY_MS = 150;
const PROGRAMMATIC_PLACEMENT_GRACE_MS = 2000;
const NATIVE_POSITION_TOLERANCE_SECONDS = 0.25;
const MAX_CONTEXT_SECONDS = 300;
// Bounds for the stored Shift rate. They bound the wish, not the offer: what is
// actually played is always a rate the player reported.
const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;
const DEFAULT_PLAYBACK_RATE = 2;
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

function legacyPanoramaCycle(value) {
  const legacy = value?.panoramaOffsets;
  const outer = Math.max(
    Number(legacy?.backward) || 0,
    Number(legacy?.forward) || 0
  ) || DEFAULT_PANORAMA_CYCLE.outer;
  return {
    inner: Math.max(MIN_NUDGE_SECONDS, outer / 4),
    outer,
    rate: value?.panoramaResponse
      ? sideRateStepFromResponse(value.panoramaResponse)
      : DEFAULT_PANORAMA_CYCLE.rate
  };
}

function normalizeContextSeconds(value, fallback = 5) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, 0, MAX_CONTEXT_SECONDS);
}

// The rate Shift+Space plays Center at. Stored as a wish, not as a command: the
// player is the authority on what it can actually play, so the stored value is
// snapped to the nearest offered rate at the moment it is used. Nothing here
// hardcodes a ladder — a player that offers finer steps simply offers them.
function normalizePlaybackRate(value, fallback = DEFAULT_PLAYBACK_RATE) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return clamp(numeric, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
}

function offeredRates() {
  const rates = (state.availableRates || []).filter(rate => Number.isFinite(rate) && rate > 0);
  return rates.length ? [...rates].sort((a, b) => a - b) : [1];
}

function effectivePlaybackRate() {
  return resolveOfferedRate(state.playbackRate, offeredRates());
}

function savedPanoramaCycle(value) {
  if (value?.panoramaCycle) return value.panoramaCycle;
  if (value?.panoramaOffsets || value?.panoramaResponse) return legacyPanoramaCycle(value);
  return DEFAULT_PANORAMA_CYCLE;
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
      // One bounded cycling relation replaces the two independent side
      // Offsets. A legacy pair migrates once: its widest side becomes the outer
      // offset and its saved rates become the nearest symmetric cycling pair.
      panoramaCycle: normalizePanoramaCycle(savedPanoramaCycle(value)),
      nudgeSeconds: normalizeNudgeSeconds(value?.nudgeSeconds),
      playbackRate: normalizePlaybackRate(value?.playbackRate),
      texturedPlaybackEnabled: value?.texturedPlaybackEnabled === true || value?.dynamicPlaybackRate === true,
      panoramaEnabled: value?.panoramaEnabled !== false,
      tailVisible: value?.tailVisible !== false,
      leadVisible: value?.leadVisible !== false
    };
  } catch {
    return {
      contextSeconds: 5,
      stepReach: normalizeStepReach(10),
      panoramaCycle: { ...DEFAULT_PANORAMA_CYCLE },
      nudgeSeconds: DEFAULT_NUDGE_SECONDS,
      playbackRate: DEFAULT_PLAYBACK_RATE,
      texturedPlaybackEnabled: false,
      panoramaEnabled: true,
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
  guideRecovery: null,
  playerState: YOUTUBE_STATE.UNSTARTED,
  availableRates: [1],
  transport: idleTransport(),
  pendingStep: null,
  panoramaCycle: normalizePanoramaCycle(preferences.panoramaCycle),
  nudgeSeconds: normalizeNudgeSeconds(preferences.nudgeSeconds),
  contextSeconds: preferences.contextSeconds,
  playbackRate: preferences.playbackRate,
  texturedPlaybackEnabled: preferences.texturedPlaybackEnabled,
  panoramaEnabled: preferences.panoramaEnabled,
  tailVisible: preferences.tailVisible,
  leadVisible: preferences.leadVisible,
  dragHandle: null,
  rangeDragOrigin: null,
  rangeDragProjection: null,
  guideTab: "sections",
  // Offered candidates. Never persisted, never projected, never traversed --
  // a Chapter is structure only once the reader retains it.
  chapters: [],
  // Whether the offered Chapters are drawn on the map. A drawing only: it changes
  // what is visible and nothing about what any operator can reach.
  chaptersShownOnTimeline: false,
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
  timelineSelection: null,
  guideSelection: null,
  selectedPinIds: [],
  guideDrag: null,
  guideClickSuppressed: false,
  carryModifier: false,
  // Each surface owns its own one-shot Shift layer. They may coexist and only
  // the owner whose latch supplied a modified action can consume its latch.
  // One transient, source-scoped deformation bypass. It changes the effective
  // projection used by every spatial consumer without editing or persisting
  // Weight. A new source always clears it.
  weightRelaxation: null,
  shiftLayers: { matrix: false, guide: false },
  shiftKeyHeld: false,
  field: null,
  // Direct manipulation of Current on the Temporal Topography. It commits a
  // Step, not a Go and not a Pin move, and it owns the Panorama Frame while it runs.
  currentDrag: null,
  // True while a Step gesture is being held. Predictive chrome stands down for
  // the duration: a destination marker is an answer to "where would this go",
  // and while the gesture runs that question is being answered by the movement
  // itself, several times a second.
  stepGestureActive: false,
  // The exact Frame supplied by whichever direct manipulation is active.
  directFrame: null,
  // One wheel series or held-key repetition settles as one Undo transaction.
  nudgeGesture: null,
  // The fraction of one Nudge a gentle scroll has accumulated so far. Separate
  // from the gesture above because reaching a quantum and batching an Undo entry
  // are different jobs with different lifetimes.
  nudgeWheel: null,
  // The order in which this reader actually encountered source Addresses. It is
  // not history: history records what the world was, this records where the
  // reader was. Source-scoped and session-local.
  traversalTrace: createTraversalTrace(0),
  // Where the last Ghost gesture left the historical read cursor, so the next
  // one can continue through the original pattern rather than restarting from
  // the occurrence that gesture itself appended.
  ghostContinuation: null,
  // Armed by holding G. Holding alone does nothing at all -- no Anchor, no
  // history, no interruption of playback -- because a tap must cost nothing.
  ghostKeyHeld: false,
  ghostGesture: null,
  ghostWheel: null
};

let player = null;
let panorama = null;
let pendingLoad = null;
let loadGeneration = 0;
let chapterdGeneration = 0;
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

function currentNeighborhood() {
  return model().neighborhood;
}

function activeRange() {
  return model().range;
}

function activePanoramaRange() {
  return transportPanoramaRange(state.transport, activeRange()) || activeRange();
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

function currentPanoramaCycle() {
  return normalizePanoramaCycle(state.panoramaCycle ?? preferences.panoramaCycle);
}

// Panorama Offsets remain physical observation settings that are independent from
// the semantic Step Reach. The outer offset is the Panorama's cycling bound.
function currentPanoramaOffsets() {
  const cycle = currentPanoramaCycle();
  return normalizeStepReach({
    backward: cycle.outer,
    forward: cycle.outer,
    linked: true,
    mode: STEP_REACH_MODE.FIXED
  });
}

function panoramaStepPreview(center, kind = "step") {
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

// The next settled Panorama Frame is resolved once per semantic movement. Context
// has priority over operator framing, but only while Context is enabled.
function sectionFrame(start, end, projection = timelineProjection()) {
  return {
    kind: "section",
    start,
    center: projection.timelineMidpoint(start, end),
    end
  };
}

function operatorFrameRequest() {
  const center = currentNeighborhood().C;
  const projection = timelineProjection();
  const operator = model().lastOperator;
  const range = activeRange();
  if ([
    "refineBackward",
    "refineForward",
    "localRefineBackward",
    "localRefineForward"
  ].includes(operator)) {
    const targets = getTargets(currentNeighborhood(), projection.metric);
    return {
      kind: "refine",
      center,
      backward: targets.backward ?? center,
      forward: targets.forward ?? center,
      range
    };
  }
  if (operator === "reopen") {
    const targets = getTargets(currentNeighborhood(), projection.metric);
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
    const interval = currentSpan();
    const midpoint = interval
      ? projection.timelineMidpoint(interval.start, interval.end)
      : NaN;
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
  const step = panoramaStepPreview(center);
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

function panoramaFrameRequest() {
  if (!state.videoLoaded || !currentNeighborhood() || !activeRange()) return null;
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
    // Ordinary Center playback hands presentation to the Panorama Cycle.
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
        currentNeighborhood().C,
        activeRange(),
        state.contextSeconds
      );
    if (window) {
      return {
        owner: FIELD_FRAME_OWNER.CONTEXT,
        start: window.start,
        end: window.end,
        current: currentNeighborhood().C,
        cursor: contextRunning ? safeCurrentTime() : undefined,
        range: activeRange()
      };
    }
  }
  return operatorFrameRequest();
}

// One sequencer owns stable Frame identity, so republishing the same state and
// Context transport inside a settled window create no new transition.
const panoramaFrames = createPanoramaFrameSequencer();

function panoramaOperatorPreview() {
  const request = panoramaFrameRequest();
  if (!request) {
    panoramaFrames.reset();
    return null;
  }
  const frame = panoramaFrames.resolve(request);
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
  const projection = timelineProjection();
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
  state.guideSelection = selection ? { ...selection } : null;
}

function selectTimelineRetained(selection) {
  state.timelineSelection = selection ? { ...selection } : null;
  if (selection) focusGuideRetained(selection);
}

function currentSpan() {
  return model().activeSpan;
}

function syncIntervalPinSelection() {
  const interval = currentSpan();
  if (!interval) {
    state.selectedPinIds = [];
    return;
  }
  const retainedSection = state.timelineSelection?.kind === "section"
    ? resolveSection(guide(), state.timelineSelection.id)
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
  return effectiveProjectionForModel(model());
}

function effectiveProjectionForModel(sourceModel) {
  return projectionForModel(sourceModel, {
    weightRelaxation: validWeightRelaxation()
  });
}

function timelineGeometryKey(sourceModel) {
  const projection = effectiveProjectionForModel(sourceModel);
  return [
    projection.timelineExtent,
    ...projection.segments.map(segment =>
      `${segment.start}:${segment.end}:${segment.weight}`
    )
  ].join("|");
}

function playerSnapshot() {
  return player?.read?.() || {
    time: currentNeighborhood()?.C || 0,
    duration: model().duration || 0,
    videoId: null,
    rate: 1,
    state: state.playerState,
    availableRates: state.availableRates
  };
}

function safeCurrentTime() {
  const value = playerSnapshot().time;
  return Number.isFinite(value) ? value : currentNeighborhood()?.C || 0;
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
  if (state.guideRecovery?.safeToRewriteCurrent === false) {
    setStatus(
      "This Guide remains available in this session, but its damaged saved record could not be preserved, so it will not be overwritten.",
      true
    );
    return false;
  }
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
    preferences.panoramaCycle = normalizePanoramaCycle(state.panoramaCycle);
    preferences.nudgeSeconds = normalizeNudgeSeconds(state.nudgeSeconds);
    preferences.contextSeconds = state.contextSeconds;
    preferences.playbackRate = normalizePlaybackRate(state.playbackRate);
    preferences.texturedPlaybackEnabled = state.texturedPlaybackEnabled === true;
    preferences.panoramaEnabled = state.panoramaEnabled;
    preferences.tailVisible = state.tailVisible;
    preferences.leadVisible = state.leadVisible;

    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      contextSeconds: preferences.contextSeconds,
      stepReach: preferences.stepReach,
      panoramaCycle: preferences.panoramaCycle,
      nudgeSeconds: preferences.nudgeSeconds,
      playbackRate: preferences.playbackRate,
      texturedPlaybackEnabled: preferences.texturedPlaybackEnabled,
      panoramaEnabled: preferences.panoramaEnabled,
      tailVisible: preferences.tailVisible,
      leadVisible: preferences.leadVisible
    }));
  } catch (error) {
    console.warn("Could not save preferences:", error);
  }
}

function guideEntityCount(value) {
  return ["groups", "pins", "sections"].reduce(
    (total, key) => total + (Array.isArray(value?.[key]) ? value[key].length : 0),
    0
  );
}

function quarantineUnreadableGuides(records) {
  const evidence = records.filter(record => typeof record.stored === "string");
  if (!evidence.length) return false;
  try {
    const suffix = `${Date.now()}:${loadGeneration}`;
    localStorage.setItem(
      `${storageKey(STORAGE_UNREADABLE_PREFIX)}:${suffix}`,
      JSON.stringify(evidence.map(record => ({
        sourcePrefix: record.prefix,
        stored: record.stored
      })))
    );
    return true;
  } catch (error) {
    console.warn("Could not set aside the unreadable Guide", error);
    return false;
  }
}

function readStoredGuide(duration) {
  const empty = () => createGuide(state.videoId || null);
  const baseResult = {
    guide: empty(),
    sourcePrefix: null,
    exact: false,
    sanitized: false,
    discardedCount: 0,
    unreadableHigherPriorityRecords: [],
    quarantineSucceeded: true,
    safeToRewriteCurrent: true
  };
  if (!state.videoId) return baseResult;
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

  const unreadable = [];
  for (const [prefix, convert] of candidates) {
    let stored = null;
    try {
      stored = localStorage.getItem(storageKey(prefix));
    } catch (error) {
      // Web Storage read failures are store-wide in practice. Continuing down
      // version keys only repeats the same failed operation and can never prove
      // that an older record is absent or valid.
      console.warn(`Could not read Guide storage at ${prefix}`, error);
      unreadable.push({ prefix, stored: null });
      break;
    }
    // `null` alone means no record. An empty string is still present evidence:
    // it is unreadable JSON and must pass through the same quarantine boundary
    // as every other damaged current-version value.
    if (stored === null) continue;
    try {
      const converted = convert(JSON.parse(stored));
      const recovered = sanitizeGuide(converted, state.videoId, duration);
      if (validateGuide(recovered, duration)) {
        const sanitized = JSON.stringify(converted) !== JSON.stringify(recovered);
        const quarantineSucceeded = unreadable.length
          ? quarantineUnreadableGuides(unreadable)
          : true;
        return {
          guide: recovered,
          sourcePrefix: prefix,
          exact: prefix === STORAGE_V9_PREFIX,
          sanitized,
          discardedCount: Math.max(
            0,
            guideEntityCount(converted) - guideEntityCount(recovered)
          ),
          unreadableHigherPriorityRecords: unreadable.map(record => ({
            sourcePrefix: record.prefix,
            readableEvidence: typeof record.stored === "string"
          })),
          quarantineSucceeded,
          safeToRewriteCurrent: unreadable.length === 0 || quarantineSucceeded
        };
      }
      unreadable.push({ prefix, stored });
    } catch (error) {
      console.warn(`Could not read Guide from ${prefix}`, error);
      unreadable.push({ prefix, stored });
    }
  }
  const quarantineSucceeded = unreadable.length
    ? quarantineUnreadableGuides(unreadable)
    : true;
  return {
    ...baseResult,
    guide: empty(),
    unreadableHigherPriorityRecords: unreadable.map(record => ({
      sourcePrefix: record.prefix,
      readableEvidence: typeof record.stored === "string"
    })),
    quarantineSucceeded,
    safeToRewriteCurrent: unreadable.length === 0 || quarantineSucceeded
  };
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

// A direct manipulation in progress owns where the player sits.
//
// Dragging Current, a Pin, a Section, or a Range handle places the player to
// preview the candidate frame. That placement is the application's own, never
// the reader reaching for YouTube's scrubber, so it must not be read back as a
// native seek. The only thing that said so was `programmaticPlacement`, a grace
// period measured in milliseconds from the last placement — so a drag that
// paused for longer than the grace stopped being recognised as a drag. Holding
// still for a moment let the poll schedule a Native Go and commit it underneath
// the gesture: Session Current moved, a traversal was retained, and the drag
// carried on measuring from an anchor that no longer meant anything. Releasing
// then drew a Active Span nobody had asked for.
//
// A gesture is a state, not a duration. It lasts exactly as long as the pointer
// is down, however long the reader pauses to think.
function directManipulationActive() {
  return Boolean(state.dragHandle || state.guideDrag || state.currentDrag);
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
    || directManipulationActive()
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
  if (Math.abs(destination - currentNeighborhood().C) <= EPSILON) {
    if (Math.abs(physical - destination) > EPSILON) placePlayer(destination);
    view.renderTransport();
    return;
  }

  const result = goTo(state.session, destination, {
    operator: "nativeGo",
    label: "Native Go",
    projection: timelineProjection()
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
  preservePanorama = false,
  resetPanorama = false,
  panoramaAligned = false,
  centerAligned = false
} = {}) {
  if (!player || !Number.isFinite(address)) return;
  clearNativeGo();
  if (!centerPauseRequest?.cancelOnPlaying) centerPauseRequest = null;
  state.transport = idleTransport();
  player.pause();
  player.setRate(1);
  if (!centerAligned) placePlayer(address);
  if (resetPanorama) {
    panorama?.resetAtCurrent?.();
  } else if (!panoramaAligned) {
    panorama?.translateToCurrent(address, { preserve: preservePanorama });
  }
}

function startContext(anchor, options = {}) {
  const transport = createContextTransport({
    anchor,
    range: activeRange(),
    seconds: state.contextSeconds
  });

  if (transport.kind === TRANSPORT_KIND.IDLE) {
    locateAddress(anchor, { preservePanorama: true });
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
  // Retargeting an active Context reuses that already-suspended Panorama.
  if (!options.retarget) panorama?.pause({ center: anchor, freeze: false });
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
    : result?.activeSpan?.arrival;
  if (!Number.isFinite(destination)) return;

  if (observe && state.contextSeconds > 0 && result?.activeSpan) {
    if (!options.panoramaAligned) {
      panorama?.translateToCurrent(destination, { preserve: true });
    }
    startContext(destination);
    return;
  }
  locateAddress(destination, {
    preservePanorama: true,
    panoramaAligned: options.panoramaAligned === true,
    centerAligned: options.centerAligned === true
  });
}

// Every route that actually moves the reader writes one occurrence.
//
// The test is whether the reader now occupies a different Address, not whether
// the model changed: renaming a Section, changing a Weight or toggling a Group
// alters the world without moving anyone, and recording those would fill user
// time with positions nobody ever visited. Programmatic placement is excluded
// for the same reason -- the player being told where to sit is a consequence of
// a movement, never a movement of its own.
function recordTraversal(previousModel, options = {}) {
  if (options.recordTraversal === false) return false;
  const from = Number(previousModel?.neighborhood?.C);
  const to = Number(model()?.neighborhood?.C);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  const appended = appendAtomicTraversal(state.traversalTrace, {
    from,
    to,
    cause: options.cause || model()?.lastOperator || "move",
    createdAt: Date.now()
  });
  if (!appended.changed) return false;
  state.traversalTrace = appended.traversalTrace;
  // An ordinary traversal ends whatever historical pattern a previous Ghost
  // gesture was following: the reader has gone somewhere of their own accord,
  // so the next recall starts from where they actually are.
  if (options.preserveGhostContinuation !== true) state.ghostContinuation = null;
  return true;
}

// One gesture, many encounters. A held Step or a wheel of Nudges is one
// semantic decision and one Undo entry, but the reader met every intermediate
// Address in order -- including the ones they came back through. Collapsing
// that to its endpoints would erase the shape they remember.
function recordTraversalSequence(points, cause) {
  const appended = appendSequenceTraversal(state.traversalTrace, {
    points,
    cause,
    createdAt: Date.now()
  });
  if (!appended.changed) return false;
  state.traversalTrace = appended.traversalTrace;
  state.ghostContinuation = null;
  return true;
}

// Continuously observed source time. Any Address inside a watched span was
// genuinely seen, so Ghost may recall it; a jump's interior never was.
function recordTraversalSpans(spans, cause) {
  const appended = appendObservedPassages(state.traversalTrace, {
    spans,
    cause,
    createdAt: Date.now()
  });
  if (!appended.changed) return false;
  state.traversalTrace = appended.traversalTrace;
  state.ghostContinuation = null;
  return true;
}

function accept(result, options = {}) {
  if (!result?.changed) return false;
  const previousModel = model();
  state.session = result.session;
  recordTraversal(previousModel, options);
  if (!retainedExists(state.guideSelection)) state.guideSelection = null;
  // A hidden retained object still exists in the Guide, but it cannot remain a
  // Timeline operand after its Group leaves the spatial surface.
  if (!retainedIsOnTimeline(state.timelineSelection)) {
    state.timelineSelection = null;
  }
  syncIntervalPinSelection();
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  const timelineGeometryChanged = timelineGeometryKey(previousModel)
    !== timelineGeometryKey(model());
  const rangeAligned = result.rangeChanged === true
    && options.effect !== false;
  if (rangeAligned) {
    panorama?.resetAtCurrent?.();
  }
  if (options.effect !== false) {
    applyPlayerEffect(result, {
      observe: options.observe,
      panoramaAligned: rangeAligned
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

function carryRetainedThrough(result, originModel, enabled, selection = state.timelineSelection) {
  if (
    !enabled
    || !selection
    || !result?.changed
    || !originModel
    || !Number.isFinite(result.session?.model?.neighborhood?.C)
  ) return result;

  const projection = effectiveProjectionForModel(originModel);
  const originCurrent = originModel.neighborhood.C;
  const destination = result.session.model.neighborhood.C;
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

// What the reader actually watched, as directed spans.
//
// The span is built from the transport's own departure and cycles, not from the
// Active Span it happened to leave behind: an Interval describes an extent
// and a wrapped playback crosses its material repeatedly, so inferring one span
// from the final geometry would lose both the repetition and the direction.
//
// The programmatic return from Context back to semantic Current is deliberately
// not recorded. The adapter being told where to sit afterwards is a consequence
// of the observation, not a second observation.
function recordObservedSpans(transport, current) {
  if (!isTransportActive(transport)) return false;
  // A Context window superseded by the next Ghost candidate is part of the scan,
  // not a watched span. The reader is sweeping through moments to find one; only
  // what they were still watching when the gesture ended is an observation they
  // actually made.
  if (state.ghostGesture) return false;
  const departure = Number(transport.entry ?? transport.departure);
  const end = Number(current);
  if (!Number.isFinite(departure) || !Number.isFinite(end)) return false;
  const range = activeRange();
  const cycles = Math.max(0, Number(transport.cycles) || 0);
  const spans = [];
  if (cycles > 0) {
    // Each completed lap crossed the whole Range; the first and last are
    // partial. Range wrap is a genuine source discontinuity, so the laps are
    // separate spans rather than one long one.
    spans.push({ from: departure, to: range.end });
    for (let lap = 1; lap < cycles; lap += 1) {
      spans.push({ from: range.start, to: range.end });
    }
    spans.push({ from: range.start, to: end });
  } else {
    spans.push({ from: departure, to: end });
  }
  return recordTraversalSpans(
    spans,
    transport.kind === TRANSPORT_KIND.CONTEXT ? "context" : "playback"
  );
}

function settleTransport(options = {}) {
  const active = state.transport;
  if (!isTransportActive(active)) return false;

  const restoreObservation = options.restoreObservation !== false;
  const issuePause = options.issuePause !== false;
  const handoffPanorama = options.handoffPanorama === true;
  const shouldRender = options.render !== false;
  const current = clamp(safeCurrentTime(), activeRange().start, activeRange().end);
  // Watched source time, recorded as what was actually observed rather than as
  // one span inferred from where it finished. A wrapped Range crosses its
  // material more than once, and each crossing is its own directed span.
  recordObservedSpans(active, current);
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

  if (active.kind === TRANSPORT_KIND.CONTEXT) {
    if (restoreObservation && !handoffPanorama && currentNeighborhood()) {
      placePlayer(currentNeighborhood().C);
      panorama?.translateToCurrent(currentNeighborhood().C, { preserve: true });
    }
    if (shouldRender) view.render();
    return true;
  }

  if (active.kind === TRANSPORT_KIND.PLAYBACK) {
    // Ordinary pause freezes the visible Panorama once. A direct handoff skips
    // that intermediate formation because the next transport will establish
    // its own Panorama around the newly settled Current in the same action.
    if (!handoffPanorama) panorama?.pause({ center: current, freeze: true });
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
      if (!handoffPanorama) panorama?.translateToCurrent(current, { preserve: true });
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
// Active Span behind it, so it is a state worth returning from.
function flushPendingStep(options = {}) {
  const pending = state.pendingStep;
  if (!pending) return { flushed: false, direction: null };
  clearTimeout(pending.timer);
  state.pendingStep = null;

  const settled = settleStepSequence(state.session, pending);
  if (pending.started) state.session = settled.session;
  if (pending.started) {
    recordTraversalSequence(pending.traversalPoints, "step-sequence");
  }
  const direction = settled.direction ?? null;

  let guidePersisted = true;
  if (pending.guideChanged) {
    guidePersisted = persistGuide();
    view.invalidateTimelinePins();
    view.renderGuide();
  }

  if (options.effect !== false) {
    applyPlayerEffect({
      place: currentNeighborhood().C,
      activeSpan: currentSpan()
    }, {
      observe: options.observe,
      panoramaAligned: true,
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
  const interval = currentSpan();
  const intervalStatus = interval
    ? formatRange(interval)
    : `cleared at ${formatTime(currentNeighborhood().C)}`;
  if (outcome.guidePersisted !== false) {
    const arrival = formatTime(currentNeighborhood().C);
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
        selection.carryRetained === true,
        selection.consumeShiftOwner || null
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
  // A held Ghost gesture is an uncommitted movement. Another operator acting on
  // top of it would act against an amended origin, so it settles first -- except
  // when the caller is Ghost itself, capturing its own Anchor.
  if (options.ghost !== false) settleGhostGesture();
  stepGesture?.cancel({ finalize: false });
  settleNudgeGesture();
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
      handoffPanorama: handoffTransport
    });
  } else if (options.transport !== false) {
    settleTransport({
      issuePause: !handoffTransport,
      handoffPanorama: handoffTransport
    });
  }
}

function moveToAddress(destination, options = {}) {
  if (!state.videoLoaded || !Number.isFinite(destination)) return false;
  settleBeforeAction({ replacingContext: true });
  const carry = options.carryRetained === true || state.carryModifier;
  const carrySelection = state.timelineSelection
    ? { ...state.timelineSelection }
    : null;
  const originModel = snapshotModel(model(), { cloneGuide: carry });
  const departure = currentNeighborhood().C;
  const operationProjection = options.projection || timelineProjection();
  let result = typeof options.transaction === "function"
    ? options.transaction(state.session, destination, operationProjection)
    : goTo(state.session, destination, {
      ...options,
      projection: operationProjection
    });
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
  const projection = timelineProjection();
  let result = local
    ? localRefineSession(state.session, direction, { projection })
    : refineSession(state.session, direction, { projection });
  if (!result.changed) {
    const reason = refineBlockReason(
      currentNeighborhood(),
      activeRange(),
      direction,
      timelineProjection().metric
    );
    const label = direction === "backward" ? "Backward" : "Forward";
    setStatus(
      reason === "refinement-limit"
        ? `Cannot Refine ${label}: this side has reached the Resolution limit. Reopen or Step to restore scale.`
        : `Cannot Refine ${label}: Current is at the Range ${direction === "backward" ? "start" : "end"}.`
    );
    return;
  }
  result = carryRetainedThrough(result, originModel, carry);
  const workingSection = result.activeSpan
    ? formatRange(result.activeSpan)
    : `cleared at ${formatTime(result.destination)}`;
  accept(result, {
    status: local
      ? `Local Refine ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(result.destination)}; drew a new Current-to-midpoint Active Span ${workingSection}.${retainedCarryStatus(result)}`
      : result.refineRelation === "full"
        ? `Refined ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(result.destination)}; recorded the full movement as ${workingSection}.${retainedCarryStatus(result)}`
        : `Refined ${direction === "backward" ? "Backward" : "Forward"} to ${formatTime(result.destination)}; retained Active Span ${workingSection}.${retainedCarryStatus(result)}`
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
    status: `Reopened the Neighborhood to Range while keeping Current at ${formatTime(result.session.model.neighborhood.C)}.`
  });
}

function switchActiveEnd(options = {}) {
  if (!state.videoLoaded) return;
  settleBeforeAction({ replacingContext: true });
  const carry = options.carryRetained === true || state.carryModifier;
  const originModel = snapshotModel(model(), { cloneGuide: carry });
  const interval = currentSpan();
  let result = switchSessionEndpoint(state.session, {
    projection: timelineProjection()
  });
  if (!result.changed) {
    setStatus("There is no Active End to switch.");
    return;
  }
  result = carryRetainedThrough(result, originModel, carry);
  accept(result, {
    status: `Switched to ${formatTime(result.session.model.neighborhood.C)}; Active Span remains ${formatRange(interval)} in its restored refinement frame.${retainedCarryStatus(result)}`
  });
}

function releaseActiveSpan() {
  if (!state.videoLoaded) return false;
  settleBeforeAction();
  const hadTimelineOperand = Boolean(state.timelineSelection);
  const result = releaseSessionInterval(state.session);
  if (!result.changed) {
    if (hadTimelineOperand) {
      state.timelineSelection = null;
      state.selectedPinIds = [];
      view.renderGuide();
      view.render();
      setStatus("Released the acquired Timeline operand; Current and Guide focus are unchanged.");
      return true;
    }
    setStatus("There is no Active Span to release.");
    return false;
  }
  // Releasing the Active Span releases the retained operand with it.
  // Nothing else cleared it, so "nothing is selected" was reachable only on a
  // fresh load -- which made every scoped operator permanently scoped to
  // whatever you last touched.
  state.timelineSelection = null;
  state.selectedPinIds = [];
  return accept(result, {
    effect: false,
    status: `Released the Active Span; Current remains ${formatTime(currentNeighborhood().C)}.`
  });
}

function resolvedWeightRelaxationScope() {
  const selected = state.timelineSelection;
  return selected?.kind === "section" && resolveSection(guide(), selected.id)
    ? { kind: "section", sectionId: selected.id }
    : { kind: "all" };
}

function sameWeightRelaxation(first, second) {
  return first?.kind === second?.kind
    && (
      first?.kind !== "section"
      || first.sectionId === second.sectionId
    );
}

function validWeightRelaxation() {
  const bypass = state.weightRelaxation;
  if (
    bypass?.kind === "section"
    && !resolveSection(guide(), bypass.sectionId)
  ) {
    state.weightRelaxation = null;
    return null;
  }
  return bypass?.kind === "all" || bypass?.kind === "section"
    ? bypass
    : null;
}

function toggleWeightRelaxation() {
  if (!state.videoLoaded) return false;
  if (directManipulationActive()) {
    setStatus("Finish or cancel the active Timeline manipulation before toggling deformation.");
    return false;
  }
  // Pending spatial gestures must become exact before their projection changes.
  // Playback deliberately continues: X issues no player command, though a
  // dynamic playback may read the new effective map on its next tick.
  settleBeforeAction({ transport: false });
  const scope = resolvedWeightRelaxationScope();
  const restoring = sameWeightRelaxation(validWeightRelaxation(), scope);
  state.weightRelaxation = restoring ? null : scope;
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
  const section = scope.kind === "section"
    ? resolveSection(guide(), scope.sectionId)
    : null;
  setStatus(restoring
    ? (section
      ? `Restored deformation for ${sectionName(section)}.`
      : "Restored deformation for the complete Timeline.")
    : (section
      ? `Straightened ${sectionName(section)} without changing its Weight.`
      : "Straightened the complete Timeline without changing stored Weights."));
  return true;
}



function focusOrUnfocus() {
  if (!state.videoLoaded) return false;
  if (model().focus) return leaveSection();
  const working = currentSpan();
  const selected = state.timelineSelection?.kind === "section"
    ? resolveSection(guide(), state.timelineSelection.id)
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
  setStatus("Establish a Active Span or select a Section before Focus.");
  return false;
}

function traverseHistory(transform, emptyMessage, completedVerb, cause) {
  settleBeforeAction({ replacingContext: true });
  const previousModel = model();
  const departure = currentNeighborhood().C;
  const result = transform(state.session);
  if (!result.changed) {
    setStatus(emptyMessage);
    return false;
  }
  state.session = result.session;
  // Semantic history and user time are different orders, and traversing one
  // moves through the other. An Undo that puts the reader somewhere else is a
  // route they took: they now occupy that Address, and the moment they came
  // from is the one they were just in. Leaving it unwritten made Ghost answer
  // "what led here" with whatever led here the first time, which is the past
  // rather than what just happened. Undoing a rename or a Weight moves nobody
  // and still writes nothing -- the test is the Address, as it is everywhere
  // else.
  recordTraversal(previousModel, { cause });
  syncIntervalPinSelection();
  persistPreferences();
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  const destination = currentNeighborhood().C;
  const currentMoved = Math.abs(destination - departure) > EPSILON;
  const rangeChanged = Math.abs(previousModel.range.start - activeRange().start) > EPSILON
    || Math.abs(previousModel.range.end - activeRange().end) > EPSILON;
  if (currentMoved && state.contextSeconds > 0) {
    if (rangeChanged) panorama?.resetAtCurrent?.();
    else panorama?.translateToCurrent(destination, { preserve: true });
    startContext(destination);
  } else if (currentMoved || rangeChanged) {
    locateAddress(destination, {
      preservePanorama: !rangeChanged,
      resetPanorama: rangeChanged
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
    "Undid",
    "undo"
  );
}

function redoLastAction() {
  return traverseHistory(
    redoSession,
    "There is no subsequent state to Redo.",
    "Redid",
    "redo"
  );
}

function performStep(direction, distance = reachFor(direction), options = {}) {
  if (!state.videoLoaded) return false;
  const resolvedDistance = Number(distance);
  if (!(Number.isFinite(resolvedDistance) && resolvedDistance > 0)) return false;
  if (!state.pendingStep) {
    settleBeforeAction({ replacingContext: true });
    const departure = currentNeighborhood().C;
    const carry = options.carryRetained === true || state.carryModifier;
    const originModel = snapshotModel(model(), { cloneGuide: carry });
    const intervalDeparture = originModel.activeSpan
      && Math.abs(originModel.activeSpan.arrival - departure) <= EPSILON
      ? originModel.activeSpan.departure
      : departure;
    state.pendingStep = {
      traversalPoints: [currentNeighborhood().C],
      departure,
      intervalDeparture,
      originModel,
      timer: null,
      started: false,
      lastDirection: direction,
      waitForGestureEnd: options.waitForGestureEnd === true,
      carryRetained: carry,
      carrySelection: state.timelineSelection
        ? { ...state.timelineSelection }
        : null,
      visitedMinimum: departure,
      visitedMaximum: departure,
      projection: timelineProjection(),
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
    originInterval: state.pendingStep.originModel.activeSpan,
    originResolution: state.pendingStep.originModel.neighborhood,
    originResolutionBasis: state.pendingStep.originModel.neighborhoodBasis,
    amend: state.pendingStep.started,
    projection: state.pendingStep.projection
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
  // Every repeat is an encounter, in order, including the ones that came back.
  state.pendingStep.traversalPoints.push(currentNeighborhood().C);
  state.pendingStep.visitedMinimum = Math.min(
    state.pendingStep.visitedMinimum,
    currentNeighborhood().C
  );
  state.pendingStep.visitedMaximum = Math.max(
    state.pendingStep.visitedMaximum,
    currentNeighborhood().C
  );
  syncIntervalPinSelection();
  if (
    timelineGeometryKey(previousModel) !== timelineGeometryKey(model())
  ) {
    view.renderGuide();
  }
  if (carried.rangeChanged) panorama?.resetAtCurrent?.();
  else panorama?.translateToCurrent(currentNeighborhood().C, { preserve: true });
  // A pending Step delays only automatic Context and history settlement. Its
  // semantic Current and all three physical panes move immediately, so a held
  // or rapidly tapped sequence remains a visible traversal rather than a marker
  // moving over a stale Center frame.
  placePlayer(currentNeighborhood().C);

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

  if (Math.abs(current - currentNeighborhood().C) > NATIVE_POSITION_TOLERANCE_SECONDS) {
    const direct = goTo(state.session, current, {
      operator: "nativeGo",
      label: "Native Go",
      projection: timelineProjection()
    });
    if (direct.changed) {
      state.session = direct.session;
      syncIntervalPinSelection();
    }
  }

  const snapshot = playerSnapshot();
  state.transport = createPlaybackTransport({
    departure: current,
    parentNeighborhood: copy(currentNeighborhood()),
    parentResolutionBasis: model().neighborhoodBasis,
    returnModel: snapshotModel(model()),
    label: "Playback",
    operator: "playback",
    observationPolicy: OBSERVATION_POLICY.PANORAMA,
    ratePolicy: fixedRatePolicy(snapshot.rate),
    offeredRates: offeredRates(),
    actualRate: snapshot.rate
  });
  state.transport.enteredPath = true;
  state.transport = withTransportPhase(state.transport, "playing");
  if (playbackAllowsPanorama(state.transport, { offeredRates: offeredRates() })) {
    panorama?.resumeAt?.({ center: current, reason: "native-playback" });
  } else {
    panorama?.pause({ center: current, freeze: false });
  }
  setStatus(`Playing through Range ${formatRange(activeRange())}.`);
  view.render();
}

function startPanoramaPlaybackFromGesture(options = {}) {
  if (!state.videoLoaded) return false;
  settleBeforeAction({ handoffTransport: true });
  clearNativeGo();
  clearProgrammaticPlacement();
  centerPauseRequest = null;
  const destination = currentNeighborhood().C;
  if (Math.abs(safeCurrentTime() - destination) > NATIVE_POSITION_TOLERANCE_SECONDS) {
    placePlayer(destination);
  }
  const shifted = options.shifted === true;
  const dynamic = shifted && state.texturedPlaybackEnabled === true;
  const ratePolicy = dynamic
    ? texturedRatePolicy()
    : fixedRatePolicy(shifted ? state.playbackRate : 1);
  const snapshot = playerSnapshot();
  state.transport = createPlaybackTransport({
    departure: destination,
    parentNeighborhood: copy(currentNeighborhood()),
    parentResolutionBasis: model().neighborhoodBasis,
    returnModel: snapshotModel(model()),
    label: dynamic
      ? "Playback by weight"
      : shifted
        ? `Playback ${formatRate(resolveOfferedRate(state.playbackRate, offeredRates()))}`
        : "Playback",
    operator: "playback",
    // Following Weight is a Panorama observation. The sides sit one rate rung
    // either side of Center, so they hold their relation at any Center the
    // ladder can surround -- which is the whole point of reading Weight as one
    // step per octave rather than as an inverse. Declaring Center-only here
    // suspended the Panorama before the triplet was ever consulted, so choosing to
    // follow Weight still meant choosing to lose the Panorama.
    //
    // A fixed Shift rate stays Center-only: it is a deliberate request for one
    // speed, not a reading of the map, and it can name a rate at either end of
    // the ladder where no triplet exists.
    observationPolicy: shifted && !dynamic
      ? OBSERVATION_POLICY.CENTER_ONLY
      : OBSERVATION_POLICY.PANORAMA,
    ratePolicy,
    offeredRates: offeredRates(),
    weight: timelineProjection().effectiveWeightAtSource(destination),
    actualRate: snapshot.rate
  });
  // Tail and Lead hold their offset from Center by sitting one rate rung either
  // side of it, so the Panorama accompanies any Center rate the adapter can
  // surround. Where it cannot -- the ends of the ladder, or a ladder missing a
  // neighbour -- Center plays alone rather than drifting: ordinary playback is a
  // capability this system keeps, not one the Panorama is allowed to cost it.
  if (playbackAllowsPanorama(state.transport, { offeredRates: offeredRates() })) {
    // This function is called directly from a trusted parent-page click or Space
    // key event. Ask every muted side and Center to play in the same synchronous
    // activation stack; delayed Center state events are too late to transfer that
    // activation to sibling YouTube iframes reliably.
    panorama?.playFromGesture?.({ center: destination, reason: "playback" });
  } else {
    panorama?.pause({ center: destination, freeze: false });
  }
  player.setRate(state.transport.requestedRate);
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

// Play is one command carrying one rate. Plain issues it at 1x with the
// Panorama; Shift issues it at the configured rate with Center alone. Either way
// a running playback pauses, so each engagement stays a toggle.
function toggleNativePlayback(options = {}) {
  if (!state.videoLoaded) return;
  if (transportIs(TRANSPORT_KIND.CONTEXT)) {
    // Context is transient observation around Current. The play command means
    // ordinary playback wherever it is issued, so Context yields to it rather
    // than reinterpreting the key as "commit what I was peeking at". Current is
    // placed exactly by dragging it, nudging it, or editing its Address.
    startPanoramaPlaybackFromGesture({ shifted: options.fast === true });
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
    startPanoramaPlaybackFromGesture({ shifted: options.fast === true });
  }
}

function rangeLoops() {
  return isProperRange(activeRange(), model().duration);
}

function wrapPlaybackRange() {
  const transport = state.transport;
  if (
    transport?.kind !== TRANSPORT_KIND.PLAYBACK
    || !rangeLoops()
  ) return false;
  const range = activeRange();
  state.transport = rebasePlaybackTransport(transport, range.start);
  state.transport = withPlaybackRequestedRate(
    state.transport,
    resolvePlaybackRate(state.transport, {
      offeredRates: offeredRates(),
      weight: timelineProjection().effectiveWeightAtSource(range.start)
    })
  );
  placePlayer(range.start);
  player.setRate(state.transport.requestedRate);
  if (playbackAllowsPanorama(state.transport, { offeredRates: offeredRates() })) {
    panorama?.resumeAt?.({ center: range.start, reason: "range-wrap" });
  }
  else panorama?.pause({ center: range.start, freeze: false });
  player.play();
  view.renderTransport();
  return true;
}

function heldPanoramaWindow() {
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
  locateAddress(currentNeighborhood().C, { resetPanorama: true });
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
  const result = focusSessionSection(state.session, sectionId, {
    projection: timelineProjection()
  });
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
  const interval = currentSpan();
  if (!interval) {
    setStatus("Establish a Active Span before focusing it.", true);
    return;
  }
  const result = focusSessionWorkingSection(state.session);
  if (!result.changed) {
    setStatus("The Active Span already owns the active Range.");
    return;
  }
  acceptRangeTransition(result, {
    status: `Focused Active Span ${formatRange(interval)} without saving it.`
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

function changeSectionWeighting(sectionId, weight) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return false;
  const name = sectionName(section);
  const result = setGuideSectionWeight(
    state.session,
    sectionId,
    Number(weight)
  );
  if (!result.changed) {
    if (result.reason === "unchanged-section-weighting") {
      setStatus(`“${name}” already has ${section.weighting}× timeline weight.`);
    } else {
      setStatus("Choose a valid Section weight.", true);
    }
    return false;
  }
  focusGuideRetained({ kind: "section", id: sectionId });
  view.invalidateTimelinePins();
  const next = result.value;
  accept(result, {
    effect: false,
    renderGuide: true,
    status: next.weighting === 1
      ? `Restored “${name}” to ordinary timeline density.`
      : `Set “${name}” to ${next.weighting}× timeline weight.`
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

function retainCurrentAsPin(event = null, options = {}) {
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
      ? heldPanoramaWindow()
      : kind === "selected-pins"
        ? selectedPinExtent()
        : currentSpan()
  };
}

function retainActiveSpanAsSection(event = null, options = {}) {
  event?.preventDefault?.();
  const label = options.useFormLabel === false
    ? ""
    : elements["section-label"].value.trim();
  const { kind, extent } = selectedSectionExtent(options.source);
  if (!extent) return setStatus("Establish the selected Extent before saving a Section.", true);
  settleBeforeAction();
  const result = kind === "interval"
    ? retainSpanAsSection(state.session, label)
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
  if (!group) return;
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
  if (!group) return;
  const plan = planGuideGroupDeletion(state.session, groupId);
  if (!plan.allowed) {
    setStatus(
      plan.reason === "last-group"
        ? "The last Group cannot be removed."
        : plan.reason === "duplicate-section"
          ? "Move or rename the colliding Section before removing this Group."
          : "This Group cannot be removed.",
      true
    );
    return;
  }
  const counted = plan.movedSectionIds.length;
  const heir = groupById(plan.heirGroupId);
  const heirName = heir?.label?.trim() || "the remaining Group";
  openGuideDialog({
    action: "delete-group",
    id: groupId,
    deletionPlan: plan,
    title: "Remove Group",
    message: counted
      ? `Remove “${group.label?.trim() || "Group"}”? Its ${counted} Section${counted === 1 ? " moves" : "s move"} to “${heirName}”; nothing is deleted.`
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
      && model().focus?.kind !== "active-span";
    result = deleteGuideSection(state.session, action.id);
    if (
      result.changed
      && state.weightRelaxation?.kind === "section"
      && state.weightRelaxation.sectionId === action.id
    ) state.weightRelaxation = null;
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
    const moved = result.value?.movedSectionIds?.length || 0;
    const heir = groupById(result.value?.heirGroupId);
    const heirName = heir?.label?.trim() || "the remaining Group";
    status = result.changed
      ? moved
        ? `Removed the Group. ${moved} Section${moved === 1 ? " moved" : "s moved"} to “${heirName}”.`
        : "Removed the empty Group."
      : result.reason === "duplicate-section"
        ? "Move or rename the colliding Section before removing this Group."
        : result.reason === "last-group"
          ? "The last Group cannot be removed."
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
  const hasCarrySelection = carry && Boolean(state.timelineSelection);
  const spatial = options.surface !== "guide";
  const destinationSelection = options.selectionAfter
    || { kind: "pin", id: pin.id };
  focusGuideRetained(destinationSelection);
  if (!carry && spatial) selectTimelineRetained(destinationSelection);
  moveToAddress(pin.t, {
    operator,
    label: operator === "pin" ? "Go to Pin" : operator,
    transaction: (sourceSession, _destination, projection) => goToSessionGuidePin(sourceSession, pin.id, {
      operator,
      label: operator === "pin" ? "Go to Pin" : operator,
      projection
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
    ? previousPin(guide(), currentNeighborhood().C, activeRange(), projection)
    : nextPin(guide(), currentNeighborhood().C, activeRange(), projection);
  if (!pin) {
    setStatus(`There is no ${direction === "backward" ? "previous" : "next"} Pin within the active Range.`);
    return false;
  }
  const destinationSelection = pin.stopKind === "range-boundary"
    ? null
    : pin.stopKind === "section"
      ? { kind: "section", id: pin.sectionId }
      : { kind: "pin", id: pin.id };
  const carry = options.carryRetained === true || state.carryModifier;
  const hasCarrySelection = carry && Boolean(state.timelineSelection);
  if (!carry && destinationSelection) selectTimelineRetained(destinationSelection);
  settleBeforeAction({ replacingContext: true });
  const originModel = snapshotModel(model(), { cloneGuide: carry });
  let result = stepToPinSession(state.session, pin.t, direction, {
    stepSeconds: reachFor(direction),
    projection
  });
  if (!result.changed) {
    setStatus(`Current is already at that Pin.`);
    return false;
  }
  result = carryRetainedThrough(
    result,
    originModel,
    carry,
    hasCarrySelection ? state.timelineSelection : null
  );
  const accepted = accept(result, {
    renderGuide: true,
    status: pin.stopKind === "range-boundary"
      ? `${direction === "backward" ? "Previous" : "Next"} Pin: ${pin.label} at ${formatTime(pin.t)}.${retainedCarryStatus(result)}`
      : `${direction === "backward" ? "Previous" : "Next"} Pin at ${formatTime(pin.t)}.${retainedCarryStatus(result)}`
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
function traverseToAdjacentPin(direction, carryRetained = false, consumeOwner = null) {
  const changed = goToAdjacentPin(direction, { carryRetained });
  if (consumeOwner) consumeShiftLayer(consumeOwner);
  return changed;
}

// Composition in the Guide.
//
// A plain click replaces: the clicked object becomes the Active Span.
// Shift extends: the Active Span grows to include the clicked object,
// whatever kind it is. One rule covers Pins and Sections because the extent —
// not a set of objects — is what every operator already consumes, so a
// composition is immediately Focusable and retainable as one
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
  return event?.shiftKey === true || state.shiftLayers.guide;
}

function guideShiftLayerSupplied(event) {
  return event?.shiftKey !== true && state.shiftLayers.guide;
}

function consumeShiftLayer(owner) {
  if (!owner || state.shiftLayers?.[owner] !== true) return false;
  state.shiftLayers[owner] = false;
  view.renderGuide();
  view.render();
  return true;
}

function extendIntervalToRetained(kind, id, name, options = {}) {
  return extendIntervalToExtent(
    retainedExtentOf(kind, id),
    name,
    { kind, id },
    options
  );
}

// The same extension law, expressed over a bare extent so that a Chapter -- which
// is not in the Guide and owns no identity -- composes exactly as a Section
// does. Composition is a fact about extents, not about retained objects.
function extendIntervalToExtent(extent, name, selection = null, options = {}) {
  const interval = currentSpan();
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
    transaction: (sourceSession, _destination, projection) => workFromExtent(sourceSession, span, {
      operator: "section",
      label,
      projection
    }),
    renderGuide: true,
    unchangedStatus: `The Active Span already spans ${name}.`,
    status: destination =>
      `Active Span extends ${formatRange(span)}; Current is centered at ${formatTime(destination)}.`
  });
  if (options.consumeShiftOwner) {
    consumeShiftLayer(options.consumeShiftOwner);
  }
  closeCompactGuideAfterSelection();
  return true;
}

function selectSectionAsActiveSpan(sectionId, options = {}) {
  const section = resolveSection(guide(), sectionId);
  if (!section) return;
  const carry = options.carryRetained === true || state.carryModifier;
  const hasCarrySelection = carry && Boolean(state.timelineSelection);
  const spatial = options.surface !== "guide";
  const destinationSelection = { kind: "section", id: sectionId };
  focusGuideRetained(destinationSelection);
  if (!carry && spatial) selectTimelineRetained(destinationSelection);
  moveToAddress(section.midpoint, {
    operator: "section",
    label: `Select Section “${sectionName(section)}”`,
    transaction: (sourceSession, _destination, projection) => goToSessionGuideSection(
      sourceSession,
      sectionId,
      {
        operator: "section",
        label: `Select Section “${sectionName(section)}”`,
        projection
      }
    ),
    renderGuide: true,
    carryRetained: carry,
    unchangedStatus: `“${sectionName(section)}” is already the Active Span.`,
    status: destination => `“${sectionName(section)}” is the Active Span; Current is centered at ${formatTime(destination)}.`
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

// Chapters, selections, previews, and gesture accumulators have meaning only inside
// the source that produced them. Reset them as one boundary operation before a
// different video is cued so no route can carry an Address or retained identity
// across source identity.
function resetSourceScopedState() {
  state.chapters = [];
  state.chaptersShownOnTimeline = false;
  if (elements["chapter-source"]) elements["chapter-source"].value = "";
  state.timelineSelection = null;
  state.guideSelection = null;
  state.selectedPinIds = [];
  state.shiftLayers = { matrix: false, guide: false };
  state.shiftKeyHeld = false;
  state.guideDrag = null;
  state.guideClickSuppressed = false;
  state.currentDrag = null;
  state.directFrame = null;
  state.weightRelaxation = null;
  state.guideRecovery = null;
  if (state.nudgeGesture?.timer) window.clearTimeout(state.nudgeGesture.timer);
  state.nudgeGesture = null;
  state.nudgeWheel = null;
  // User time is the reader's path through one video. No Address, read cursor,
  // Anchor, provenance or watched span may cross source identity, so the old
  // gesture is cancelled against the world it belonged to before that world is
  // discarded, and the ledger starts empty.
  cancelGhostGesture({ restore: false });
  state.traversalTrace = createTraversalTrace(0);
  state.ghostKeyHeld = false;
  state.ghostGesture = null;
  state.ghostContinuation = null;
  state.ghostWheel = null;
  state.field = null;
  view.setPreviewAction(null);
  view.setPreviewSection(null);
}

function createLoadRequest(parsed) {
  loadGeneration += 1;
  return Object.freeze({
    generation: loadGeneration,
    videoId: parsed.videoId,
    startSeconds: Number(parsed.startSeconds) || 0,
    metadataStartedAt: 0
  });
}

function currentLoadRequest(request) {
  return Boolean(
    request
    && pendingLoad
    && request.generation === pendingLoad.generation
    && request.videoId === pendingLoad.videoId
  );
}

// Every source replacement resolves the owners of old-source state before the
// adapter receives the next identity. No timer, preview or transaction may be
// allowed to checkpoint against the next Session.
function transitionSourceBoundary() {
  clearMetadataRetry();
  stepGesture?.cancel({ finalize: false });
  if (state.currentDrag) {
    finishCurrentDrag({ pointerId: state.currentDrag.pointerId }, { cancel: true });
  }
  if (state.guideDrag) {
    finishGuideDrag({ pointerId: state.guideDrag.pointerId }, { cancel: true });
  }
  if (state.dragHandle) cancelRangeDrag();
  settleNudgeGesture();
  flushPendingStep({ effect: false });
  if (isTransportActive(state.transport)) {
    settleTransport({
      restoreObservation: false,
      issuePause: false,
      render: false
    });
  }
  if (state.videoLoaded && state.videoId) persistGuide();
  clearNativeGo();
  clearProgrammaticPlacement();
  if (guideDialogOpen()) closeGuideDialog({ restoreFocus: false });
  view.closePinClusterMenu();
  centerPauseRequest = null;
  resetSourceScopedState();
  state.pendingStep = null;
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  state.rangeDragProjection = null;
  state.transport = idleTransport();
  state.availableRates = [1];
  state.videoLoaded = false;
  state.videoId = null;
  panorama?.resetSources?.();
  state.session = createSession({ stepReach: preferences.stepReach });
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
}

function initializeVideo(request = pendingLoad) {
  if (!currentLoadRequest(request)) return;
  const snapshot = playerSnapshot();
  // CUED and duration events are not generation-tagged by YouTube. The loaded
  // adapter identity closes that gap: stale A can never initialize request B.
  if (!snapshot.videoId || snapshot.videoId !== request.videoId) return;
  const duration = snapshot.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    const startedAt = request.metadataStartedAt || Date.now();
    if (!request.metadataStartedAt) {
      request = Object.freeze({ ...request, metadataStartedAt: startedAt });
      if (currentLoadRequest(pendingLoad)) pendingLoad = request;
    }
    if (Date.now() - startedAt < METADATA_GRACE_MS) {
      setStatus("Reading YouTube video metadata…");
      if (metadataTimer === null) {
        metadataTimer = window.setTimeout(() => {
          metadataTimer = null;
          initializeVideo(request);
        }, METADATA_RETRY_MS);
      }
      return;
    }
    clearMetadataRetry();
    if (currentLoadRequest(request)) pendingLoad = null;
    setStatus("YouTube did not provide a valid duration.", true);
    return;
  }
  clearMetadataRetry();

  const requestedStart = clamp(request.startSeconds || 0, 0, duration);
  state.videoId = request.videoId;
  const recovery = readStoredGuide(duration);
  state.guideRecovery = recovery;
  state.session = createSession({
    duration,
    current: requestedStart,
    guide: recovery.guide,
    stepReach: preferences.stepReach
  });
  state.videoLoaded = true;
  centerPauseRequest = null;
  state.transport = idleTransport();
  state.pendingStep = null;
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  state.rangeDragProjection = null;
  state.timelineSelection = null;
  state.guideSelection = null;
  state.selectedPinIds = [];
  state.guideDrag = null;
  state.field = null;
  state.availableRates = snapshot.availableRates;
  renderPlaybackRateChoices();
  state.playerState = snapshot.state;
  view.invalidateTimelinePins();
  if (currentLoadRequest(request)) pendingLoad = null;

  locateAddress(requestedStart);
  // Build and chapter Tail/Lead before the Center transport surface becomes active.
  // This keeps the first parent-owned playback gesture synchronous across all
  // ready players instead of racing the polling interval.
  panorama?.tick();
  const shouldRewrite = Boolean(recovery.sourcePrefix)
    && (!recovery.exact || recovery.sanitized);
  const guidePersisted = !shouldRewrite || persistGuide();
  view.renderGuide();
  const unreadableCount = recovery.unreadableHigherPriorityRecords.length;
  if (unreadableCount && recovery.sourcePrefix) {
    setStatus(
      recovery.quarantineSucceeded
        ? `Loaded ${formatTime(duration)} video and recovered its Guide from ${recovery.sourcePrefix} after preserving an unreadable newer record.`
        : `Loaded ${formatTime(duration)} video from an older Guide, but the unreadable newer record could not be preserved; this session will not overwrite it.`,
      !recovery.quarantineSucceeded
    );
  } else if (unreadableCount) {
    setStatus(
      recovery.quarantineSucceeded
        ? `Loaded ${formatTime(duration)} video with an empty Guide because saved data could not be read; the damaged evidence was preserved.`
        : `Loaded ${formatTime(duration)} video with an empty Guide because saved data could not be read or preserved; saving is disabled for this source.`,
      true
    );
  } else if (!recovery.sourcePrefix) {
    setStatus(`Loaded ${formatTime(duration)} video. No saved Guide existed for this source.`);
  } else if (recovery.sanitized && guidePersisted) {
    setStatus(
      `Loaded ${formatTime(duration)} video and repaired its Guide${
        recovery.discardedCount
          ? `; discarded ${recovery.discardedCount} invalid entr${recovery.discardedCount === 1 ? "y" : "ies"}`
          : ""
      }.`
    );
  } else if (guidePersisted) setStatus(`Loaded ${formatTime(duration)} video.`);
  view.render();
}

function chapterPendingVideo() {
  if (!state.playerReady || !pendingLoad) return;
  if (pendingLoad.generation === chapterdGeneration) return;
  const request = Object.freeze({
    ...pendingLoad,
    metadataStartedAt: Date.now()
  });
  pendingLoad = request;
  chapterdGeneration = request.generation;
  transitionSourceBoundary();
  player.chapter(request.videoId, request.startSeconds || 0);
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

function handlePlaybackRateChange(rate) {
  if (!transportIs(TRANSPORT_KIND.PLAYBACK)) {
    view.render();
    return;
  }
  const panoramaWasAvailable = playbackAllowsPanorama(state.transport, { offeredRates: offeredRates() });
  state.transport = withPlaybackActualRate(state.transport, rate);
  const panoramaIsAvailable = playbackAllowsPanorama(state.transport, { offeredRates: offeredRates() });
  const center = clamp(safeCurrentTime(), activeRange().start, activeRange().end);
  // Actual-rate events own the compatibility transition, but repeated
  // confirmations of the same compatibility state own no second Panorama command.
  if (panoramaIsAvailable && !panoramaWasAvailable) {
    panorama?.resumeAt?.({ center, reason: "confirmed-playback-rate" });
  } else if (!panoramaIsAvailable && panoramaWasAvailable) {
    panorama?.pause({ center, freeze: false });
  }
  view.render();
}

function handleAutoplayBlocked() {
  if (isTransportActive(state.transport)) settleTransport({ issuePause: false });
  setStatus("The browser blocked scripted observation. Start the video once with YouTube’s native control, then retry.", true);
}

function handlePlayerError(code) {
  const actualVideoId = playerSnapshot().videoId;
  if (
    pendingLoad
    && actualVideoId
    && actualVideoId !== pendingLoad.videoId
  ) return;
  transitionSourceBoundary();
  pendingLoad = null;
  state.playerState = YOUTUBE_STATE.UNKNOWN;
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
    panorama?.tick();
    return;
  }
  // YouTube commonly reports only 1x until the iframe has actually entered
  // playback, so the offer is re-read rather than trusted once at load. Unknown
  // is not the same as unsupported -- the same rule the Panorama already follows.
  const offered = playerSnapshot().availableRates;
  if (offered.join(",") !== (state.availableRates || []).join(",")) {
    state.availableRates = offered;
    renderPlaybackRateChoices();
    if (
      transportIs(TRANSPORT_KIND.PLAYBACK)
      && state.transport.observationPolicy === OBSERVATION_POLICY.CENTER_ONLY
      && state.transport.ratePolicy?.kind === RATE_POLICY_KIND.FIXED
    ) {
      const desired = resolvePlaybackRate(state.transport, {
        offeredRates: offeredRates(),
        weight: timelineProjection().effectiveWeightAtSource(safeCurrentTime())
      });
      if (desired !== state.transport.requestedRate) {
        state.transport = withPlaybackRequestedRate(state.transport, desired);
        player.setRate(desired);
      }
    }
  }
  const now = safeCurrentTime();
  let transport = state.transport;
  const programmaticPlacementActive = programmaticPlacementOwns(now);

  // A dynamic playback reads its rate off the map it is crossing, so the rate
  // is re-derived from the Address actually being watched. Only a bucket change
  // reaches the player: the ladder is coarse on purpose, and asking for a rate
  // it already has would be a command per poll.
  if (
    transport.kind === TRANSPORT_KIND.PLAYBACK
    && transport.ratePolicy?.kind === RATE_POLICY_KIND.TEXTURED
  ) {
    const desired = resolvePlaybackRate(transport, {
      offeredRates: offeredRates(),
      weight: timelineProjection().effectiveWeightAtSource(now)
    });
    if (desired !== transport.requestedRate) {
      state.transport = withPlaybackRequestedRate(transport, desired);
      transport = state.transport;
      player.setRate(desired);
    }
  }

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
        state.transport = retryPlaybackTransport(state.transport);
        state.transport = withPlaybackRequestedRate(
          state.transport,
          resolvePlaybackRate(state.transport, {
            offeredRates: offeredRates(),
            weight: timelineProjection().effectiveWeightAtSource(entry)
          })
        );
        transport = state.transport;
        placePlayer(entry);
        player.setRate(transport.requestedRate);
        player.play();
      }
      panorama?.tick();
      view.renderTransport();
      return;
    }
    if (now < activeRange().start - EPSILON) {
      placePlayer(activeRange().start);
    } else if (now >= activeRange().end - EPSILON) {
      if (wrapPlaybackRange()) return;
      settleTransport();
      setStatus("Playback reached Range End.");
      return;
    }
  } else if (
    !isTransportActive(transport)
    && [YOUTUBE_STATE.PAUSED, YOUTUBE_STATE.CUED].includes(state.playerState)
    && !programmaticPlacementActive
    && !directManipulationActive()
    && Math.abs(now - currentNeighborhood().C) > NATIVE_POSITION_TOLERANCE_SECONDS
  ) {
    scheduleNativeGo(now);
  } else if (Math.abs(now - currentNeighborhood().C) <= NATIVE_POSITION_TOLERANCE_SECONDS) {
    clearNativeGo();
  }

  // Transport owns discontinuities such as Range wrap. Resolve those first so
  // the Panorama observes the rebased Center once instead of reacting to the
  // out-of-window frame and then being placed again by the wrap.
  panorama?.tick();
  view.renderTransport();
}

function timeFromPointer(
  event,
  projection = timelineProjection(),
  constrainToRange = false
) {
  const rect = elements.timeline.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) return currentNeighborhood().C;
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
    projection: timelineProjection(),
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
  const sectionPreview = section
    ? sectionFrame(section.start, section.end)
    : null;
  const center = sectionPreview?.center ?? pin?.t;
  if (!Number.isFinite(center)) return;
  if (
    !Number.isFinite(drag.previewCenter)
    || Math.abs(drag.previewCenter - center) > 0.04
  ) {
    drag.previewCenter = center;
    placePlayer(center);
  }
  const frame = section
    ? sectionPreview
    : (() => {
      const step = panoramaStepPreview(center, "pin");
      return { kind: "pin", start: step.start, center, end: step.end };
    })();
  state.directFrame = frame;
  panorama?.previewExtent?.(frame);
}

function clearGuideDragPreview({ restore = true } = {}) {
  state.directFrame = null;
  panorama?.clearPreview?.({ restore: false });
  if (!restore || !state.videoLoaded || !currentNeighborhood()) return;
  const current = currentNeighborhood().C;
  placePlayer(current);
  panorama?.translateToCurrent?.(current, { preserve: true });
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
    drag.projection = effectiveProjectionForModel(drag.originModel);
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
    locateAddress(currentNeighborhood().C, { resetPanorama: true });
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
    || !currentNeighborhood()
  ) return;
  event.stopPropagation?.();
  state.currentDrag = {
    pointerId: event.pointerId,
    originClientX: event.clientX,
    originSource: currentNeighborhood().C,
    // The projection captured at pointer-down stays authoritative so the
    // geometry cannot jump if Weight or another derived condition changes.
    projection: timelineProjection(),
    candidate: currentNeighborhood().C,
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
    drag.originSource = currentNeighborhood().C;
    drag.projection = timelineProjection();
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

// The candidate Panorama Frame during a Current drag: the Context Frame when
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
        const step = panoramaStepPreview(candidate, "current");
        return { kind: "current", start: step.start, center: candidate, end: step.end };
      })();
  state.directFrame = frame;
  panorama?.previewExtent?.(frame);
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
    panorama?.clearPreview?.({ restore: false });
    locateAddress(currentNeighborhood().C);
    panorama?.translateToCurrent?.(currentNeighborhood().C, { preserve: true });
    view.render();
    return false;
  }
  panorama?.clearPreview?.({ restore: false });
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
    locateAddress(currentNeighborhood().C);
    panorama?.translateToCurrent?.(currentNeighborhood().C, { preserve: true });
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
  // Bare map ground acquires no retained object. Clear the spatial operand
  // before Go so X naturally resolves to the complete Timeline while Guide
  // focus remains an independent inspection state.
  state.timelineSelection = null;
  state.selectedPinIds = [];
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
  state.rangeDragProjection = timelineProjection();
  // Range owns the semantic projection visible at pointer-down.
  settleBeforeAction();
  state.rangeDragOrigin = snapshotModel(model());
  state.rangeDragProjection = effectiveProjectionForModel(state.rangeDragOrigin);
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function updateRangeDrag(event) {
  if (!state.dragHandle || !state.videoLoaded || !state.rangeDragOrigin) return;
  const origin = state.rangeDragOrigin;
  const time = timeFromPointer(
    event,
    state.rangeDragProjection || effectiveProjectionForModel(origin)
  );
  const start = state.dragHandle === "start"
    ? clamp(time, 0, origin.range.end - MIN_RANGE_SECONDS)
    : origin.range.start;
  const end = state.dragHandle === "end"
    ? clamp(time, origin.range.start + MIN_RANGE_SECONDS, origin.duration)
    : origin.range.end;
  const current = clamp(origin.neighborhood.C, start, end);
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
    locateAddress(currentNeighborhood().C, { resetPanorama: true });
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
    locateAddress(currentNeighborhood().C);
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
    setRange(value, range.end, currentNeighborhood().C, "Adjust Range Start", `Range Start is ${formatTime(value)}.`);
  } else {
    value = clamp(value, range.start + MIN_RANGE_SECONDS, model().duration);
    setRange(range.start, value, currentNeighborhood().C, "Adjust Range End", `Range End is ${formatTime(value)}.`);
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

// Inner and Outer Offset are the bounds of one Panorama relation, not two
// independent side settings. 0 < x < y is enforced against the sibling bound.
function changePanoramaBoundary(boundary, value) {
  const parsed = Number(value);
  if (!String(value).trim() || !Number.isFinite(parsed) || parsed <= 0) {
    setStatus("Panorama offset must be a positive number.", true);
    view.render();
    return false;
  }
  const cycle = currentPanoramaCycle();
  const amount = clamp(parsed, 0.25, 300);
  const next = boundary === "inner"
    ? { ...cycle, inner: Math.min(amount, cycle.outer) }
    : { ...cycle, outer: Math.max(amount, cycle.inner) };
  state.panoramaCycle = normalizePanoramaCycle(next);
  persistPreferences();
  panorama?.reconfigureOffset?.();
  setStatus(
    `${boundary === "inner" ? "Inner" : "Outer"} Panorama offset set to ${
      boundary === "inner" ? state.panoramaCycle.inner : state.panoramaCycle.outer
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
    const departure = origin.neighborhood.C;
    state.nudgeGesture = {
      key,
      traversalPoints: [departure],
      target: { kind: target.kind, id: target.id || null },
      origin,
      // Nudging Current is Step, not Go: it extends or shortens the retained
      // traversal from the same anchor instead of drawing a new one.
      departure,
      visitedMinimum: departure,
      visitedMaximum: departure,
      lastDirection: null,
      projection: timelineProjection(),
      intervalDeparture: origin.activeSpan
        && Math.abs(origin.activeSpan.arrival - departure) <= EPSILON
        ? origin.activeSpan.departure
        : departure,
      history: state.session.history,
      future: state.session.future || [],

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

// One continuous wheel series or held-key repetition settles as at most one
// Undo transaction; an exact retained-object round trip has no consequence to
// record.
function settleNudgeGesture() {
  const gesture = state.nudgeGesture;
  if (!gesture) return false;
  window.clearTimeout(gesture.timer);
  state.nudgeGesture = null;
  if (!gesture.changed) return false;
  // Only Current moving is the reader moving. Nudging a Pin or a Section edits
  // the world without taking anyone anywhere.
  if (gesture.target?.kind === "current") {
    recordTraversalSequence(gesture.traversalPoints, "nudge-sequence");
  }

  // A retained object that returns to its exact acquired geometry has no
  // residue. Restore the origin snapshot so timestamps and rebased frames do
  // not manufacture a no-op Undo entry. Current is deliberately excluded: a
  // Current round trip is a Step Reversal and retains its visited extent.
  const originTarget = gesture.target?.kind === "pin"
    ? getPin(gesture.origin.guide, gesture.target.id)
    : gesture.target?.kind === "section"
      ? resolveSection(gesture.origin.guide, gesture.target.id)
      : null;
  const currentTarget = gesture.target?.kind === "pin"
    ? getPin(guide(), gesture.target.id)
    : gesture.target?.kind === "section"
      ? resolveSection(guide(), gesture.target.id)
      : null;
  const returnedToOrigin = gesture.target?.kind === "pin"
    ? Boolean(
        originTarget
        && currentTarget
        && Math.abs(originTarget.t - currentTarget.t) <= EPSILON
      )
    : gesture.target?.kind === "section"
      ? Boolean(
          originTarget
          && currentTarget
          && originTarget.startPinId === currentTarget.startPinId
          && originTarget.endPinId === currentTarget.endPinId
          && Math.abs(originTarget.start - currentTarget.start) <= EPSILON
          && Math.abs(originTarget.end - currentTarget.end) <= EPSILON
        )
      : false;
  if (returnedToOrigin) {
    state.session = {
      model: gesture.origin,
      history: gesture.history,
      future: gesture.future
    };
    syncIntervalPinSelection();
    view.invalidateTimelinePins();
    view.renderGuide();
    view.render();
    return false;
  }

  const committed = checkpoint(
    state.session,
    gesture.label || "Nudge",
    gesture.origin
  );
  state.session = committed.session;
  const currentReversal = gesture.target?.kind === "current"
    && Math.abs(currentNeighborhood().C - gesture.departure) <= EPSILON
    && gesture.visitedMaximum - gesture.visitedMinimum > EPSILON;
  if (currentReversal) {
    const settled = settleStepSequence(state.session, {
      started: true,
      departure: gesture.departure,
      visitedMinimum: gesture.visitedMinimum,
      visitedMaximum: gesture.visitedMaximum,
      lastDirection: gesture.lastDirection,
      projection: gesture.projection
    });
    if (settled.changed) state.session = settled.session;
  }
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
  const projection = options.projection || timelineProjection();
  const range = activeRange();
  const current = session.model.neighborhood.C;
  const destination = clamp(current + sourceDelta, range.start, range.end);
  const distance = Math.abs(
    projection.sourceToTimeline(destination) - projection.sourceToTimeline(current)
  );
  if (!(distance > 0)) return { changed: false, reason: "range-edge", session };
  return stepSession(
    session,
    sourceDelta < 0 ? "backward" : "forward",
    distance,
    { ...options, projection }
  );
}

function nudgeTargetKey(target) {
  return `${target.kind}:${target.id || "current"}`;
}

// The one Nudge operation. Timeline Shift-wheel, keyboard, and every Guide
// increment control route through here, so they always agree.
function nudgeTarget(target, direction, options = {}) {
  if (!state.videoLoaded || !currentNeighborhood()) return false;
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
      originInterval: gesture.origin.activeSpan,
      originResolution: gesture.origin.neighborhood,
      originResolutionBasis: gesture.origin.neighborhoodBasis,
      amend: true,
      projection: gesture.projection
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
  if (target.kind === "current") {
    const current = currentNeighborhood().C;
    gesture.traversalPoints.push(current);
    gesture.lastDirection = direction > 0 ? "forward" : "backward";
    gesture.visitedMinimum = Math.min(gesture.visitedMinimum, current);
    gesture.visitedMaximum = Math.max(gesture.visitedMaximum, current);
  }
  gesture.changed = true;
  locateAddress(currentNeighborhood().C);
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
  return null;
}

function selectedNudgeTarget() {
  const selected = state.timelineSelection;
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
function withinTimeline(node) {
  // Pin/Section lanes are children of Timeline in the browser and independent
  // semantic surfaces in the DOM harness. Naming them here keeps the ownership
  // rule structural rather than inferring it from a retained object's dataset,
  // which would also match an off-map Guide row.
  return [
    elements.timeline,
    elements["pin-lane"],
    elements["section-lane"],
    elements["pin-cluster-menu"]
  ].some(surface => surface?.contains?.(node));
}

// Wheel deltas arrive in three units and only the first is pixels. Reading them
// all as pixels made a line-reporting device advance by a hundredth of what it
// asked for, which is indistinguishable from a Nudge that does not work.
const WHEEL_LINE_PIXELS = 16;
const WHEEL_PAGE_PIXELS = 400;

function wheelPixels(event) {
  const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
  const raw = horizontal ? event.deltaX : -event.deltaY;
  if (!Number.isFinite(raw) || raw === 0) return 0;
  if (event.deltaMode === 1) return raw * WHEEL_LINE_PIXELS;
  if (event.deltaMode === 2) return raw * WHEEL_PAGE_PIXELS;
  return raw;
}

function handleNudgeWheel(event) {
  if (!event.shiftKey || !state.videoLoaded || !currentNeighborhood()) return;
  const overTimeline = withinTimeline(event.target);
  if (
    !overTimeline
    && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target?.tagName)
  ) return;
  // Only the Timeline is a spatial acquisition surface for wheel Nudge. Guide
  // rows under an off-map pointer do not silently replace the acquired Timeline
  // operand; without one, off-map space adjusts Current.
  const target = (overTimeline ? nudgeTargetFromElement(event.target) : null)
    || (overTimeline ? { kind: "current" } : selectedNudgeTarget());
  if (!target) return;
  const raw = wheelPixels(event);
  if (raw === 0) return;
  event.preventDefault?.();
  // A partial turn is progress, not noise.
  //
  // This accumulator used to live on the Nudge gesture, whose job is to batch
  // one continuous series into a single Undo entry and which is therefore
  // discarded 420 ms after the last event. So every scroll gentler than one
  // threshold per event — which is an ordinary trackpad — threw away everything
  // it had accumulated on each pause, and the map never moved however long the
  // reader kept scrolling. Nudge worked when hurried and was dead when not.
  //
  // Reaching a quantum and batching an Undo entry are different jobs, so they
  // no longer share a lifetime. What is carried is a fraction of one Nudge, and
  // it is dropped when the reader changes what they are nudging — not by a
  // clock.
  const key = nudgeTargetKey(target);
  if (state.nudgeWheel?.key !== key) state.nudgeWheel = { key, accumulator: 0 };
  state.nudgeWheel.accumulator += raw;
  const steps = Math.trunc(state.nudgeWheel.accumulator / NUDGE_WHEEL_THRESHOLD);
  if (!steps) return;
  state.nudgeWheel.accumulator -= steps * NUDGE_WHEEL_THRESHOLD;
  // Wheel-up and wheel-right are forward on either axis.
  nudgeTarget(target, steps > 0 ? 1 : -1, { steps: Math.abs(steps) });
}

function syncContextControl() {
  elements["context-seconds"].value = String(state.contextSeconds);
  renderPlaybackRateChoices();
}

// Chapters: a creator's chapters offered as candidates.
//
// They are parsed from a pasted description, held only in interface state, and
// never enter the Guide, the projection, or traversal. Navigating one is an
// ordinary Go; composing two is the ordinary extension law; and retaining one
// is the ordinary save, carrying the creator's own title across.
function chapterAt(index) {
  return state.chapters[Number(index)] || null;
}

function chapterLabelFor(chapter) {
  return chapterTitle(chapter) || `Chapter at ${formatTime(chapter.time)}`;
}

function chapterSpans(chapter) {
  return chapter.end - chapter.start > EPSILON;
}

function offerChapters(event = null) {
  event?.preventDefault?.();
  if (!state.videoLoaded) return;
  const chapters = parseChapters(elements["chapter-source"].value, {
    duration: model().duration
  });
  state.chapters = chapters;
  view.renderGuide();
  view.render();
  setStatus(chapters.length
    ? `Offered ${chapters.length} Chapter${chapters.length === 1 ? "" : "s"}. Nothing is retained until you say so.`
    : "No Addresses found in that text.", !chapters.length);
}

function clearChapters() {
  state.chapters = [];
  state.chaptersShownOnTimeline = false;
  elements["chapter-source"].value = "";
  view.renderGuide();
  view.render();
  setStatus("Cleared the offered Chapters.");
}

// Drawing every Chapter at once answers the question the list cannot: where the
// creator's divisions fall relative to the structure already built. It is a
// drawing and stays one -- the marks are inert, so the only way a Chapter becomes
// something to act on is still to retain it.
function toggleChapterLane() {
  if (!(state.chapters || []).length) return;
  state.chaptersShownOnTimeline = !state.chaptersShownOnTimeline;
  view.renderGuide();
  view.render();
  setStatus(state.chaptersShownOnTimeline
    ? `Drawing ${state.chapters.length} Chapter${state.chapters.length === 1 ? "" : "s"} on the map. They mark, they do not act.`
    : "Chapters are no longer drawn on the map.");
}

function goToChapter(index, { composing = false, consumeShiftOwner = null } = {}) {
  const chapter = chapterAt(index);
  if (!chapter) return;
  if (composing && extendIntervalToExtent(
    chapter,
    chapterLabelFor(chapter),
    null,
    { consumeShiftOwner }
  )) return;
  settleBeforeAction();
  if (!chapterSpans(chapter)) {
    return moveToAddress(chapter.time, {
      operator: "chapter",
      label: `Go to ${chapterLabelFor(chapter)}`,
      status: destination => `Current is at ${chapterLabelFor(chapter)}, ${formatTime(destination)}.`
    });
  }
  moveToAddress((chapter.start + chapter.end) / 2, {
    operator: "section",
    label: `Go to ${chapterLabelFor(chapter)}`,
    transaction: (sourceSession, _destination, projection) => workFromExtent(sourceSession, chapter, {
      operator: "section",
      label: `Go to ${chapterLabelFor(chapter)}`,
      projection
    }),
    status: destination =>
      `${chapterLabelFor(chapter)} is the Active Span; Current is centered at ${formatTime(destination)}.`
  });
}

// Retention is the moment a candidate becomes structure, and it is the ordinary
// save -- so a retained Chapter is indistinguishable afterwards from one the reader
// drew. The creator's title comes across because it is the thing worth keeping.
function retainChapter(index) {
  const chapter = chapterAt(index);
  if (!chapter) return;
  settleBeforeAction();
  const label = chapterTitle(chapter) || "";
  if (!chapterSpans(chapter)) {
    goToChapter(index);
    const pinned = pinSessionCurrent(state.session, label);
    if (!pinned.changed) return setStatus("That Address already holds a Pin.");
    // Retention is an ordinary Guide transaction, so it goes through the one
    // path that saves. Assigning the Session directly reported a retained Chapter
    // that no reload could find.
    const pinId = pinned.value.pin.id;
    if (!accept(pinned, {
      effect: false,
      renderGuide: true,
      status: `Retained ${chapterLabelFor(chapter)} as a Pin.`
    })) return;
    selectTimelineRetained({ kind: "pin", id: pinId });
    selectGuideTab("pins");
    view.renderGuide();
    view.render();
    return;
  }
  const saved = saveExtentAsSection(state.session, chapter, label, "chapter");
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
    status: `Retained ${chapterLabelFor(chapter)} as a Section.`
  })) return;
  selectTimelineRetained({ kind: "section", id: sectionId });
  selectGuideTab("sections");
  view.renderGuide();
  view.render();
}

const GUIDE_TABS = ["sections", "pins", "chapters"];

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
  // Ghost first: it is the only manipulation that can be in flight while no
  // pointer is down, so nothing else would recognise it as cancellable.
  if (state.ghostGesture) {
    cancelGhostGesture({ restore: true });
    return true;
  }
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

// Which keystrokes are the map's, decided by what a control does with a key
// rather than by which tag it happens to be.
//
// This was a tagName test — INPUT, SELECT or TEXTAREA owned the keyboard —
// which is not the same question. A checkbox swallowed every operator despite
// being unable to receive a character, and a <select> kept them for as long as
// it held focus, which is forever: it survives the rebuild its own edit causes.
// So setting a Section's Weight, or ticking the Panorama's dynamic-rate box,
// silently disarmed the whole map until the reader clicked the Timeline again,
// with nothing on screen to say why. The tag was enforcing a rule that belongs
// to the keystroke.
//
// Only text can be typed into. A <select> is not text: it is chosen from, and
// while its list is open the page receives no keys at all — the browser's popup
// takes them. So any key that reaches this document while a <select> is focused
// is a key that <select> already declined, and it belongs to the map. Keyboard
// reach is unharmed: Space still opens the list (below), the arrows inside it
// are the popup's, and Enter still commits. What is gone is only the closed
// select's silent arrow-and-type-ahead editing, which cost every hotkey on the
// map to keep. Operators preventDefault the keys they claim, so no press both
// acts on the map and moves a selection.
const TEXTLESS_INPUT_TYPES = new Set([
  "button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"
]);

// Textless is not the same as inert: these answer Space, so Space stays theirs.
const SPACE_ACTIVATED_INPUT_TYPES = new Set([
  "button", "checkbox", "file", "image", "radio", "reset", "submit"
]);

function inputType(element) {
  return String(element?.type || "text").toLowerCase();
}

function ownsKeyboard(element) {
  if (!element) return false;
  if (element.isContentEditable === true) return true;
  const tag = element.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  return !TEXTLESS_INPUT_TYPES.has(inputType(element));
}

function initializePlayerApi() {
  if (player || !isYouTubeApiReady()) return;
  player = createYouTubePlayer("player", {
    events: {
      onReady: () => {
        state.playerReady = true;
        setStatus("YouTube ready. Paste a link.");
        chapterPendingVideo();
      },
      onStateChange: handlePlayerStateChange,
      onPlaybackRateChange: handlePlaybackRateChange,
      onAutoplayBlocked: handleAutoplayBlocked,
      onError: handlePlayerError
    }
  });
  panorama = createPanoramaController({
    document,
    getSnapshot: () => ({
      videoLoaded: state.videoLoaded,
      videoId: state.videoId,
      current: currentNeighborhood()?.C || 0,
      range: activePanoramaRange(),
      // Step Panorama offsets are physical observation settings. They are
      // intentionally independent from the semantic Step Reach.
      stepReach: currentPanoramaOffsets(),
      panoramaCycle: currentPanoramaCycle(),
      // The application resolves the ambient Frame owner and supplies exact
      // source Addresses. The Panorama controller never imports timeline
      // projection, operator arithmetic, or Context math.
      panoramaFrame: panoramaOperatorPreview(),
      transport: state.transport,
      // The Panorama decides whether a complete Panorama triplet exists, so it
      // needs the ladder the adapter actually offers. Without it every Center
      // rate but 1x reads as uncertain and the Panorama suspends -- which is
      // exactly what following Weight was supposed to stop doing.
      availableRates: offeredRates(),
      pendingStep: Boolean(state.pendingStep),
      dragging: Boolean(
        state.dragHandle || state.guideDrag?.moved || state.currentDrag?.moved
      ),
      center: playerSnapshot(),
      playerState: state.playerState
    }),
    getPreferences: () => ({
      panoramaEnabled: state.panoramaEnabled,
      tailVisible: state.tailVisible,
      leadVisible: state.leadVisible,
      sideRateStep: currentPanoramaCycle().rate,
      reducedMotion: prefersReducedMotion()
    }),
    setPreferences: patch => {
      if (Object.hasOwn(patch, "panoramaEnabled")) state.panoramaEnabled = Boolean(patch.panoramaEnabled);
      if (Object.hasOwn(patch, "tailVisible")) state.tailVisible = Boolean(patch.tailVisible);
      if (Object.hasOwn(patch, "leadVisible")) state.leadVisible = Boolean(patch.leadVisible);
      if (Object.hasOwn(patch, "sideRateStep")) {
        state.panoramaCycle = normalizePanoramaCycle({
          ...currentPanoramaCycle(),
          rate: patch.sideRateStep
        });
      }
      persistPreferences();
    },
    onChange: panoramaState => {
      state.field = panoramaState;
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
  pendingLoad = createLoadRequest(parsed);
  if (!state.playerReady) {
    setStatus("Waiting for the YouTube API…");
    return;
  }
  chapterPendingVideo();
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
// One wheel route owns Shift-wheel everywhere. Only target resolution differs:
// the object under the Timeline pointer, or the acquired operand/Current away
// from it. Accumulation, direction, quantum and Undo settlement are identical.
// Ghost Traversal: hold G and scroll back through where you have been.
//
// The gesture is armed by the key and begun by the wheel. Holding G alone must
// cost nothing -- a reader who taps it, or holds it and changes their mind, has
// not asked for anything and must not have their playback settled or their
// history touched. Only a wheel quantum proves the intent.
function beginGhostGesture({ initialDirection } = {}) {
  if (!state.videoLoaded || !currentNeighborhood()) return false;
  // Anything still in flight becomes exact first, and is recorded, so the
  // gesture reads a stream that already contains the movement that led here.
  // This is why activation waits for a whole earned quantum: settling live
  // Playback because a trackpad twitched would be a real cost paid for an
  // intention the reader never expressed.
  settleBeforeAction({ ghost: false });
  const anchor = currentNeighborhood().C;
  const originModel = snapshotModel(model());
  const projection = timelineProjection();
  const stepReach = effectiveStepReach(model().stepReach, activeRange(), projection);
  // Which stream this gesture reads is decided once, by the direction it opens
  // with. Forward from a re-entered moment asks what originally followed it, so
  // it resumes the historical occurrence. Backward asks what led to the present
  // re-entry, which is the live stream. Reversing the wheel later retraces the
  // cursor already chosen rather than switching streams underneath the reader.
  const resumable = initialDirection === "forward"
    && tracePositionIsValid(state.traversalTrace, state.ghostContinuation, {
      current: anchor,
      range: activeRange()
    });
  const read = beginGhostRead(state.traversalTrace, {
    current: anchor,
    continuationPosition: resumable ? state.ghostContinuation : null,
    // The boundary is where the stream stands now, so the gesture can never
    // read the replay it is itself about to append.
    frozenStreamEnd: state.traversalTrace.records.length,
    range: activeRange(),
    projection,
    stepReach
  });
  state.ghostGesture = {
    anchor,
    originModel,
    originHistory: state.session.history,
    originFuture: state.session.future,
    anchorPosition: read.index >= 0 ? read.positions[read.index] : null,
    read,
    projection,
    stepReach,
    initialDirection,
    readOrigin: resumable ? "historical-successor" : "live-occurrence",
    visited: [],
    directionChanges: 0,
    visitedMinimum: anchor,
    visitedMaximum: anchor,
    lastSourceDirection: null,
    changed: false
  };
  return true;
}

function handleGhostWheel(event) {
  if (!state.ghostKeyHeld || !state.videoLoaded) return false;
  const raw = wheelPixels(event);
  if (!raw) return false;
  state.ghostWheel ??= { accumulator: 0 };
  state.ghostWheel.accumulator += raw;
  const earned = Math.trunc(state.ghostWheel.accumulator / NUDGE_WHEEL_THRESHOLD);
  event.preventDefault?.();
  // Below the threshold nothing at all has happened yet -- no Anchor, no settled
  // Playback, no frozen stream. Arming is free and staying armed is free; only a
  // whole quantum is a request.
  if (!earned) return true;
  const openingDirection = earned > 0 ? "forward" : "backward";
  if (!state.ghostGesture
    && !beginGhostGesture({ initialDirection: openingDirection })) return false;
  const gesture = state.ghostGesture;
  // One turn of the wheel is one occurrence, and the surplus is dropped.
  //
  // Nudge carries its remainder because a Nudge is a quantum of source time and
  // four of them is simply four frames. An occurrence is not a quantum: it is a
  // place the reader has been, and the stop condition is recognising one. A
  // mouse detent reports about 100px against a 24px threshold, so sharing
  // Nudge's arithmetic would recall four moments per detent and make it
  // impossible to stop at the one that clicks.
  const count = earned > 0 ? 1 : -1;
  state.ghostWheel.accumulator = 0;
  // Wheel up and right are forward, the same convention Nudge already uses --
  // but forward here means forward through the reader's own path, which may run
  // either way through source time.
  const userDirection = count > 0 ? "forward" : "backward";
  let moved = false;
  let blocked = null;
  for (let index = 0; index < Math.abs(count); index += 1) {
    const candidate = moveGhostRead(state.traversalTrace, gesture.read, userDirection);
    if (!candidate.changed) {
      blocked = candidate.reason;
      break;
    }
    const previous = currentNeighborhood().C;
    const result = ghostTraverse(state.session, candidate.address, {
      anchor: gesture.anchor,
      direction: userDirection,
      originResolution: gesture.originModel.neighborhood,
      originResolutionBasis: gesture.originModel.neighborhoodBasis,
      projection: gesture.projection,
      amend: true
    });
    if (!result.changed) {
      blocked = result.reason;
      break;
    }
    state.session = result.session;
    gesture.read = candidate.read;
    gesture.visited.push({
      address: candidate.address,
      sourcePosition: candidate.cursor,
      userDirection
    });
    gesture.visitedMinimum = Math.min(gesture.visitedMinimum, candidate.address);
    gesture.visitedMaximum = Math.max(gesture.visitedMaximum, candidate.address);
    if (Math.abs(candidate.address - previous) > EPSILON) {
      gesture.lastSourceDirection = candidate.address > previous ? "forward" : "backward";
    }
    if (gesture.lastUserDirection && gesture.lastUserDirection !== userDirection) {
      gesture.directionChanges += 1;
    }
    gesture.lastUserDirection = userDirection;
    gesture.changed = true;
    moved = true;
  }
  if (moved) {
    // Center follows the recalled Address, and if Context is enabled it plays
    // there.
    //
    // The stop condition for a recall is recognition, and a still frame is a
    // poor thing to recognise a moment from -- a second or two of motion and
    // sound is what actually places it. So each candidate retargets the same
    // Context window rather than starting a new observation: the reader scrolls
    // through their own path hearing each moment, and the window follows the
    // wheel instead of being torn down and rebuilt at every notch.
    //
    // With Context off, the recall stays a silent frame-by-frame scan.
    const landing = currentNeighborhood().C;
    if (state.contextSeconds > 0) {
      startContext(landing, { retarget: transportIs(TRANSPORT_KIND.CONTEXT) });
    } else {
      locateAddress(landing, { preservePanorama: true });
    }
    syncIntervalPinSelection();
    // A recall is otherwise almost silent -- Current moves and an Interval
    // appears, both of which many other operators also do -- so it says how far
    // back through its own path the reader now is. Without it there is no way to
    // tell a Ghost from an ordinary Go.
    // Where the reader is in their own path, not just how many notches they
    // have turned. Depth alone cannot say how much further there is to go, and
    // a reader who cannot see that has no way to tell a working recall from one
    // that has quietly run out -- which is most of what made this feel broken.
    const place = gesture.read.index + 1;
    const total = gesture.read.positions.length;
    setStatus(
      `Ghost ${userDirection === "backward" ? "back" : "on"} · ${
        formatTime(currentNeighborhood().C)
      } · ${place} of ${total} · anchored at ${formatTime(gesture.anchor)}.`
    );
    view.render();
  } else if (blocked === "range-blocked") {
    setStatus("Ghost history continues outside the active Range. Unfocus or widen Range to continue.");
  } else if (blocked) {
    // Running out is the common case at the live end, and it is not a failure:
    // say which end was reached and how to leave it.
    setStatus(userDirection === "backward"
      ? "Ghost is at the beginning of your path; there is nothing earlier to recall."
      : "Ghost is at the most recent moment of your path; scroll the other way to look back.");
  }
  return true;
}

// Releasing writes the recalled path into the live end of user time and commits
// the whole gesture as one semantic transaction.
function settleGhostGesture() {
  const gesture = state.ghostGesture;
  state.ghostGesture = null;
  state.ghostWheel = null;
  if (!gesture?.changed) return false;
  const settled = settleGhostSequence(state.session, gesture);
  if (settled.changed) state.session = settled.session;
  state.session = checkpoint(state.session, "Ghost Traverse", gesture.originModel).session;
  // One landing, not the search that found it. The scan is kept as provenance
  // so what the reader crossed is still on the record, but it is not a path
  // anybody walked and must not be offered back as one.
  const finalVisit = gesture.visited.at(-1) || null;
  const ghostReturn = appendGhostReturn(state.traversalTrace, {
    anchor: gesture.anchor,
    anchorPosition: gesture.anchorPosition,
    landing: currentNeighborhood().C,
    recalledPosition: finalVisit?.sourcePosition || null,
    scan: {
      candidateCount: gesture.visited.length,
      visitedMinimum: gesture.visitedMinimum,
      visitedMaximum: gesture.visitedMaximum,
      directionChanges: gesture.directionChanges
    },
    createdAt: Date.now()
  });
  if (ghostReturn.changed) {
    state.traversalTrace = ghostReturn.traversalTrace;
    // The historical occurrence just re-entered, so an immediately forward
    // gesture can resume its original successors. Release may sever the Working
    // Interval afterwards without disturbing it.
    state.ghostContinuation = ghostReturn.continuationPosition;
  }
  syncIntervalPinSelection();
  view.renderGuide();
  view.render();
  return true;
}

// Escape during a gesture restores the world exactly as it was, including the
// history and future the gesture was amending against, and appends nothing.
function cancelGhostGesture({ restore = true } = {}) {
  const gesture = state.ghostGesture;
  state.ghostGesture = null;
  state.ghostWheel = null;
  state.ghostKeyHeld = false;
  if (!gesture) return false;
  if (restore && gesture.changed) {
    state.session = {
      model: snapshotModel(gesture.originModel),
      history: gesture.originHistory,
      future: gesture.originFuture
    };
    locateAddress(gesture.anchor);
    syncIntervalPinSelection();
    view.renderGuide();
    view.render();
  }
  return true;
}

// One wheel, two readers. Ghost takes precedence whenever G is held; otherwise
// the wheel belongs to Nudge exactly as before.
function handleReaderWheel(event) {
  if (state.ghostKeyHeld && handleGhostWheel(event)) return;
  handleNudgeWheel(event);
}

document.addEventListener("wheel", handleReaderWheel, { passive: false });
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
    selectSectionAsActiveSpan(
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
    currentNeighborhood().C,
    activeRange().end,
    currentNeighborhood().C,
    "Set Range Start",
    `Set Range Start to ${formatTime(currentNeighborhood().C)}.`
  );
});
elements["range-end-here"].addEventListener("click", () => {
  if (rejectFocusedRangeBoundaryEdit()) return;
  setRange(
    activeRange().start,
    currentNeighborhood().C,
    currentNeighborhood().C,
    "Set Range End",
    `Set Range End to ${formatTime(currentNeighborhood().C)}.`
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
  setRange(0, model().duration, currentNeighborhood().C, "Full Video Range", "Restored Full Video Range.");
});

// Navigation and observation

elements["refine-backward"].addEventListener("click", event => {
  const latchedMatrix = event.shiftKey !== true && state.shiftLayers.matrix;
  const local = event.shiftKey === true || latchedMatrix;
  refine("backward", {
    local,
    carryRetained: event.altKey === true
  });
  if (latchedMatrix) consumeShiftLayer("matrix");
});
elements["refine-forward"].addEventListener("click", event => {
  const latchedMatrix = event.shiftKey !== true && state.shiftLayers.matrix;
  const local = event.shiftKey === true || latchedMatrix;
  refine("forward", {
    local,
    carryRetained: event.altKey === true
  });
  if (latchedMatrix) consumeShiftLayer("matrix");
});
elements.reopen.addEventListener("click", reopenFully);
elements["switch-endpoint"].addEventListener("click", event => {
  switchActiveEnd({
    carryRetained: event.altKey === true
  });
});
elements.release.addEventListener("click", releaseActiveSpan);
// Tag resolves Current into a Pin or, when Shift actually supplies the matrix
// layer, resolves the positive Active Span into a Section.
elements.retain.addEventListener("click", event => {
  const latchedMatrix = event.shiftKey !== true && state.shiftLayers.matrix;
  if (event.shiftKey || latchedMatrix) {
    retainActiveSpanAsSection(event, { source: "interval", useFormLabel: false });
    if (latchedMatrix) consumeShiftLayer("matrix");
    return;
  }
  retainCurrentAsPin(event, { useFormLabel: false });
});
elements["weight-relaxation-toggle"].addEventListener("click", toggleWeightRelaxation);
elements["focus-toggle"].addEventListener("click", focusOrUnfocus);
elements["shift-layer-toggle"].addEventListener("click", () => {
  state.shiftLayers.matrix = !state.shiftLayers.matrix;
  view.renderGuide();
  view.render();
});
elements["return-action"].addEventListener("click", undoLastAction);
elements["redo-action"].addEventListener("click", redoLastAction);
elements["center-transport-surface"].addEventListener("click", event => {
  // Only the physical modifier reaches the play command. An armed Guide or
  // matrix layer is a claim about that surface's next click, not about transport.
  toggleNativePlayback({ fast: event.shiftKey === true });
});

const tapStep = selection => {
  if (!selection) return false;
  if (selection.pinTraversal) {
    return traverseToAdjacentPin(
      selection.direction,
      selection.carryRetained === true,
      selection.consumeShiftOwner || null
    );
  }
  return performStep(selection.direction, selection.distance, {
    carryRetained: selection.carryRetained === true
  });
};
const directionalStep = direction => event => {
  const physicalShift = event?.shiftKey === true;
  const latchedMatrix = !physicalShift && state.shiftLayers.matrix;
  const pinTraversal = physicalShift || latchedMatrix;
  return {
    direction,
    pinTraversal,
    consumeShiftOwner: latchedMatrix ? "matrix" : null,
    distance: reachFor(direction),
    carryRetained: event?.altKey === true || state.carryModifier
  };
};
const sideStep = role => event => {
  const selection = panorama?.getStepSelection?.(role) || null;
  if (!selection || !Number.isFinite(selection.address) || !currentNeighborhood()) {
    return null;
  }
  // The Panorama presents an exact source Address; Step consumes Timeline Space.
  // Convert at the application boundary so activating a visible phase lands on
  // that phase under neutral, compressed, expanded, and overlapping terrain.
  const distance = timelineProjection().timelineDistance(
    currentNeighborhood().C,
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
      startContext(currentNeighborhood().C, { retarget: true });
      setStatus(`Automatic Context updated to ${state.contextSeconds}s.`);
    }
  }
  view.render();
});

// The offer is the player's to make. Rebuild the list whenever the player tells
// us what it can play, and keep the operator's wish pointed at the nearest one.
function renderPlaybackRateChoices() {
  const select = elements["playback-rate"];
  if (!select) return;
  const rates = offeredRates();
  const choices = [...new Set([...rates, state.playbackRate])]
    .sort((first, second) => first - second);
  const signature = `${rates.join(",")}|${state.playbackRate}`;
  if (select.dataset.rates !== signature) {
    select.dataset.rates = signature;
    select.replaceChildren(...choices.map(rate => {
      const option = document.createElement("option");
      option.value = String(rate);
      option.textContent = rates.includes(rate)
        ? formatRate(rate)
        : `${formatRate(rate)} wish`;
      return option;
    }));
  }
  select.value = String(state.playbackRate);
  const dynamic = state.texturedPlaybackEnabled === true;
  const check = elements["playback-dynamic"];
  if (check) check.checked = dynamic;
  elements["playback-rate-value"].textContent = dynamic
    ? "by Section weight"
    : effectivePlaybackRate() === state.playbackRate
      ? `${formatRate(state.playbackRate)} on Shift`
      : `${formatRate(state.playbackRate)} wish · ${formatRate(effectivePlaybackRate())} offered`;
}

function retuneActiveShiftPlayback() {
  if (
    !transportIs(TRANSPORT_KIND.PLAYBACK)
    || state.transport.observationPolicy !== OBSERVATION_POLICY.CENTER_ONLY
  ) return false;
  const previousRate = state.transport.requestedRate;
  state.transport = withPlaybackRatePolicy(
    state.transport,
    state.texturedPlaybackEnabled
      ? texturedRatePolicy()
      : fixedRatePolicy(state.playbackRate),
    {
      offeredRates: offeredRates(),
      weight: timelineProjection().effectiveWeightAtSource(safeCurrentTime())
    }
  );
  if (state.transport.requestedRate !== previousRate) {
    player.setRate(state.transport.requestedRate);
  }
  return true;
}

elements["playback-dynamic"].addEventListener("change", event => {
  state.texturedPlaybackEnabled = event.target.checked === true;
  persistPreferences();
  renderPlaybackRateChoices();
  retuneActiveShiftPlayback();
  setStatus(state.texturedPlaybackEnabled
    ? "Shift plays Center at a rate that follows Section weight."
    : `Shift plays Center at ${formatRate(effectivePlaybackRate())}.`);
  view.render();
});

elements["playback-rate"].addEventListener("change", event => {
  state.playbackRate = normalizePlaybackRate(event.target.value, state.playbackRate);
  persistPreferences();
  renderPlaybackRateChoices();
  retuneActiveShiftPlayback();
  setStatus(`Shift plays Center at ${formatRate(effectivePlaybackRate())}.`);
  view.render();
});

for (const control of document.querySelectorAll("[data-preview-action]")) {
  const action = control.dataset.previewAction;
  control.addEventListener("pointerenter", () => { view.setPreviewAction(action); view.render(); });
  control.addEventListener("pointerleave", () => { view.setPreviewAction(null); view.render(); });
  control.addEventListener("focus", () => { view.setPreviewAction(action); view.render(); });
  control.addEventListener("blur", () => { view.setPreviewAction(null); view.render(); });
}

// Step Panorama geometry
elements["field-inner-offset"].addEventListener("change", event => {
  changePanoramaBoundary("inner", event.target.value);
});
elements["field-outer-offset"].addEventListener("change", event => {
  changePanoramaBoundary("outer", event.target.value);
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
elements["section-retain-form"].addEventListener("submit", retainActiveSpanAsSection);
elements["section-label"].addEventListener("input", view.render);
elements["section-source"].addEventListener("change", view.render);
elements["focus-active-span"].addEventListener("click", focusWorkingSection);
elements["pin-retain-form"].addEventListener("submit", retainCurrentAsPin);
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
elements["guide-tab-chapters"].addEventListener("click", () => selectGuideTab("chapters"));
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
  if (key !== "visible" && key !== "weightsEnabled") return;
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
  state.shiftLayers.guide = !state.shiftLayers.guide;
  view.renderGuide();
  view.render();
});

elements["chapter-capture"].addEventListener("submit", offerChapters);
elements["chapter-clear"].addEventListener("click", clearChapters);
elements["chapter-lane-toggle"].addEventListener("click", toggleChapterLane);
elements["chapters-list"].addEventListener("click", event => {
  const retain = event.target.closest("[data-chapter-retain]");
  if (retain) return retainChapter(retain.dataset.chapterRetain);
  const go = event.target.closest("[data-chapter-go]");
  if (go) return goToChapter(go.dataset.chapterGo, {
    composing: composingGuideClick(event),
    consumeShiftOwner: guideShiftLayerSupplied(event) ? "guide" : null
  });
});
for (const id of ["guide-tab-sections", "guide-tab-pins", "guide-tab-chapters"]) {
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
  locateAddress(currentNeighborhood().C);
  view.invalidateTimelinePins();
  view.renderGuide();
  view.render();
  setStatus(`Set Address to ${formatTime(address)}.`);
  return true;
}

// An Address input previews the candidate Panorama Frame before commit. Typing is
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
  if (section) {
    // Preview through the same Session mutation and effective projection the
    // eventual edit will use. This keeps typed endpoint edits, pointer drags,
    // and the settled Section Frame identical even under overlapping Weight.
    const previewSession = {
      model: snapshotModel(model(), { cloneGuide: true }),
      history: [],
      future: []
    };
    const candidate = target.kind === "pin"
      ? moveGuidePin(previewSession, target.id, address, { amend: true })
      : moveGuideSection(
        previewSession,
        target.id,
        address - section.start,
        { amend: true }
      );
    if (!candidate.changed) return false;
    const candidateSection = resolveSection(
      candidate.session.model.guide,
      section.id
    );
    if (!candidateSection) return false;
    frame = sectionFrame(
      candidateSection.start,
      candidateSection.end,
      effectiveProjectionForModel(candidate.session.model)
    );
  } else {
    const step = panoramaStepPreview(address, "pin");
    frame = { kind: "pin", start: step.start, center: address, end: step.end };
  }
  // Center shows what the drag path shows for the same edit: the Section's
  // effective midpoint or the Pin's own Address. Tail and Lead carry the edges.
  state.directFrame = frame;
  placePlayer(frame.center);
  panorama?.previewExtent?.(frame);
  return true;
}

function clearGuideAddressPreview() {
  if (!state.directFrame) return false;
  state.directFrame = null;
  panorama?.clearPreview?.({ restore: false });
  if (state.videoLoaded && currentNeighborhood()) {
    locateAddress(currentNeighborhood().C);
    panorama?.translateToCurrent?.(currentNeighborhood().C, { preserve: true });
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
  const consumeShiftOwner = guideShiftLayerSupplied(event) ? "guide" : null;
  const pinGo = event.target.closest("[data-pin-go]");
  if (pinGo) {
    const pinId = pinGo.dataset.pinGo;
    if (composing && extendIntervalToRetained(
      "pin",
      pinId,
      pinNameFor(pinId),
      { consumeShiftOwner }
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
      `“${sectionName(resolveSection(guide(), id))}”`,
      { consumeShiftOwner }
    )) return;
    return selectSectionAsActiveSpan(
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
  const control = event.target.closest("[data-section-weighting]");
  if (control) {
    changeSectionWeighting(control.dataset.sectionWeighting, control.value);
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
for (const [type, on] of [["pointerover", true], ["pointerout", false], ["focusin", true], ["focusout", false]]) {
  elements["pins-list"].addEventListener(type, event => {
    const item = event.target.closest?.("[data-pin-preview-id]");
    if (!item || item.contains?.(event.relatedTarget)) return;
    view.setPreviewPin(on ? item.dataset.pinPreviewId : null);
    view.render();
  });
}

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
  const editing = ownsKeyboard(activeElement);
  // Anything that natively activates on Space, or that has been given keyboard
  // activation of its own, keeps it. A checkbox or radio is here rather than in
  // `editing` because Space is the one key it answers to and letters are not.
  const focusedControl = Boolean(activeElement)
    && activeElement !== document.body
    && (
      ["BUTTON", "SUMMARY", "A", "OPTION", "SELECT"].includes(activeElement.tagName)
      || (activeElement.tagName === "INPUT"
        && SPACE_ACTIVATED_INPUT_TYPES.has(inputType(activeElement)))
      || activeElement.getAttribute?.("role") === "button"
      || activeElement.getAttribute?.("role") === "slider"
      || activeElement.getAttribute?.("role") === "menuitem"
    );
  // Shift is the rate modifier on the play command, not a different command.
  const playSpace = (event.key === " " || event.code === "Space")
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey;
  if (
    !playSpace
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
  toggleNativePlayback({ fast: event.shiftKey === true });
}, true);

// Keyboard: spatial cluster W/A/S/D, directional arrows, and observation keys.
document.addEventListener("keydown", event => {
  const activeElement = document.activeElement;
  const editing = ownsKeyboard(activeElement);
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

  // The Guide is I, beside Operators on O, because G became the held Ghost
  // modifier. Tab was tried and rejected: it belongs to the browser, and a page
  // that captures it stops being navigable by keyboard at all.
  if (spatialKey("i")) {
    event.preventDefault();
    toggleGuide();
    return;
  }
  // G is the held Ghost modifier. Arming costs nothing: no Anchor, no history,
  // no interrupted playback. Only a wheel quantum proves the reader meant it.
  if (plain && key === "g") {
    event.preventDefault();
    if (!event.repeat) state.ghostKeyHeld = true;
    return;
  }
  // The rail holds two surfaces: I opens Guide; O opens Operators together with
  // Parameters. Both match the physical key as well as the character, so a
  // layout that does not produce "i" or "o" there still reaches them.
  if (spatialKey("o")) {
    event.preventDefault();
    toggleControls();
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
    switchActiveEnd({ carryRetained: carryChord });
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
    releaseActiveSpan();
  }
  // Tag is T. Plain retains Current as a Pin; Shift retains the positive
  // Active Span as a Section. Both routes converge on the same Guide
  // transactions used by their pointer controls.
  else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key === "t") {
    event.preventDefault();
    retainActiveSpanAsSection(event, {
      source: "interval",
      useFormLabel: false
    });
  }
  else if (plain && key === "t") {
    event.preventDefault();
    retainCurrentAsPin(event, { useFormLabel: false });
  }
  // X transiently bypasses deformation for the acquired Section, or for the
  // complete map when no Section is acquired. Weight itself remains Guide state.
  else if (plain && key === "x") {
    event.preventDefault();
    toggleWeightRelaxation();
  }
  else if (plain && key === "f") {
    event.preventDefault();
    focusOrUnfocus();
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
  if (String(event.key).toLowerCase() === "g") {
    state.ghostKeyHeld = false;
    settleGhostGesture();
    return;
  }
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
  // A keyup may never arrive once the window loses focus. A gesture that moved
  // settles at the last candidate the reader actually saw rather than being
  // silently abandoned mid-recall; one that was only armed disarms.
  state.ghostKeyHeld = false;
  settleGhostGesture();
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
