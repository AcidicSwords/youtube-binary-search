import {
  EPSILON,
  clamp,
  createRoot,
  getTargets,
  descend,
  spanMidpoint,
  widenToRange,
  canWiden,
  stepTarget,
  stepFrame,
  getActionRanges,
  settlePlayback,
  logSpeed,
  chooseSupportedRate
} from "./traversal.js";
import {
  createGuide,
  createOrReuseMark,
  renameMark,
  getMark,
  sectionsForMark,
  visibleMarks,
  deleteMark,
  resolveSection,
  createSectionFromTimes,
  renameSection,
  deleteSection,
  previousMark,
  nextMark,
  sortedResolvedSections,
  clusterMarksByPixels,
  migrateStructureV2,
  migrateSavedRegions,
  validateGuide
} from "./structure.js";
import { parseYouTubeUrl } from "./youtube.js";

const STORAGE_V3_PREFIX = "binary-youtube-reader:v3:";
const STORAGE_V2_PREFIX = "binary-youtube-reader:v2:";
const STORAGE_V1_PREFIX = "binary-youtube-reader:v1:";
const POLL_MS = 100;
const MIN_RANGE_SECONDS = 0.25;
const STEP_DEBOUNCE_MS = 120;
const STEP_PRESETS = [0.25, 0.5, 1, 2, 3, 5, 10, 15, 30, 60, 120, 300];
const HISTORY_LIMIT = 100;

const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map(node => [node.id, node])
);

const state = {
  playerReady: false,
  videoLoaded: false,
  videoId: null,
  duration: 0,
  range: { start: 0, end: 0 },
  frame: null,
  focusedSectionId: null,
  focusReturnRange: null,
  lastTraversal: null,
  history: [],
  guide: createGuide(),
  skimSession: null,
  repeatSession: null,
  playbackSession: null,
  pendingStep: null,
  availableRates: [1],
  stepSeconds: 10,
  previewAction: null,
  previewSectionId: null,
  dragHandle: null,
  rangeDragOrigin: null,
  playerState: -1,
  internalPause: false,
  renderedMarkKey: "",
  renderedClusters: []
};

let player = null;
let pendingLoad = null;
let pollTimer = null;

function clone(value) {
  if (value === null || value === undefined) return value;
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function safeCurrentTime() {
  if (!player || !state.playerReady) return state.frame?.C || 0;
  const value = player.getCurrentTime();
  return Number.isFinite(value) ? value : state.frame?.C || 0;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const value = Math.max(0, seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  const milliseconds = Math.floor((value - Math.floor(value)) * 1000);
  const minuteText = hours ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours ? `${hours}:` : ""}${minuteText}:${String(secs).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const value = Math.max(0, seconds);
  if (value < 1) return `${value.toFixed(2)}s`;
  if (value < 10 && !Number.isInteger(value)) return `${value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}s`;
  return `${Number(value.toFixed(2))}s`;
}

function formatRange(range) {
  return range ? `${formatTime(range.start)}–${formatTime(range.end)}` : "—";
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function percent(time) {
  return state.duration > 0 ? clamp((time / state.duration) * 100, 0, 100) : 0;
}

function setMarkerPosition(element, time) {
  element.style.left = `${percent(time)}%`;
}

function setSegment(element, start, end) {
  const left = percent(start);
  const right = percent(end);
  element.style.left = `${left}%`;
  element.style.width = `${Math.max(0, right - left)}%`;
}

function makeLastTraversal(departure, arrival, operator, medium, direction = null) {
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || Math.abs(arrival - departure) <= EPSILON) return null;
  return {
    start: Math.min(departure, arrival),
    end: Math.max(departure, arrival),
    departure,
    arrival,
    operator,
    medium,
    direction: direction || (arrival < departure ? "earlier" : "later"),
    createdAt: Date.now()
  };
}

function traversalLabel(last = state.lastTraversal) {
  if (!last) return "—";
  const verbs = {
    timeline: "Clicked",
    narrowEarlier: "Narrowed Earlier",
    narrowLater: "Narrowed Later",
    stepEarlier: "Stepped Earlier",
    stepLater: "Stepped Later",
    previousMark: "Previous Mark",
    nextMark: "Next Mark",
    mark: "Mark",
    section: "Section midpoint",
    rangeMidpoint: "Range midpoint",
    focusSection: "Focused",
    skim: "Skimmed",
    play: "Played"
  };
  const medium = last.medium === "playback" ? "played" : "jumped";
  return `${verbs[last.operator] || "Traversed"} ${formatRange(last)} · ${medium}`;
}

function activeTargets() {
  return state.frame ? getTargets(state.frame) : { earlier: null, later: null };
}

function captureActionState() {
  return {
    range: clone(state.range),
    frame: clone(state.frame),
    focusedSectionId: state.focusedSectionId,
    focusReturnRange: clone(state.focusReturnRange),
    lastTraversal: clone(state.lastTraversal),
    guide: clone(state.guide)
  };
}

function restoreActionState(snapshot) {
  state.range = clone(snapshot.range);
  state.frame = clone(snapshot.frame);
  state.focusedSectionId = snapshot.focusedSectionId || null;
  state.focusReturnRange = clone(snapshot.focusReturnRange);
  state.lastTraversal = clone(snapshot.lastTraversal);
  state.guide = clone(snapshot.guide);
  state.previewSectionId = null;
  closeMarkClusterMenu();
}

function pushHistory(label, snapshot = captureActionState()) {
  state.history.push({ label, snapshot });
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
}

function storageKey(prefix = STORAGE_V3_PREFIX) {
  return `${prefix}${state.videoId}`;
}

function persistGuide() {
  if (!state.videoId) return;
  state.guide.videoId = state.videoId;
  state.guide.updatedAt = Date.now();
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.guide));
  } catch (error) {
    console.warn("Could not save Guide:", error);
    setStatus("The browser could not save this Guide locally.", true);
  }
}

function normalizeGuideV3(parsed) {
  const guide = createGuide(state.videoId);
  guide.marks = parsed.marks.map(mark => ({
    id: mark.id,
    videoId: state.videoId,
    t: Number(mark.t),
    label: String(mark.label || ""),
    provenance: mark.provenance || (mark.label ? "mark" : "section:endpoint"),
    createdAt: Number(mark.createdAt) || Date.now(),
    updatedAt: Number(mark.updatedAt) || Number(mark.createdAt) || Date.now()
  }));
  guide.sections = parsed.sections.map(section => ({
    id: section.id,
    videoId: state.videoId,
    startMarkId: section.startMarkId,
    endMarkId: section.endMarkId,
    label: String(section.label || ""),
    provenance: section.provenance || null,
    createdAt: Number(section.createdAt) || Date.now(),
    updatedAt: Number(section.updatedAt) || Number(section.createdAt) || Date.now()
  }));
  return guide;
}

function loadGuide() {
  state.guide = createGuide(state.videoId);
  if (!state.videoId) return;

  try {
    const rawV3 = localStorage.getItem(storageKey());
    if (rawV3) {
      const normalized = normalizeGuideV3(JSON.parse(rawV3));
      if (validateGuide(normalized, state.duration)) {
        state.guide = normalized;
        return;
      }
    }

    const rawV2 = localStorage.getItem(storageKey(STORAGE_V2_PREFIX));
    if (rawV2) {
      const migrated = migrateStructureV2(JSON.parse(rawV2), state.videoId);
      if (validateGuide(migrated, state.duration)) {
        state.guide = migrated;
        persistGuide();
        return;
      }
    }

    const rawV1 = localStorage.getItem(storageKey(STORAGE_V1_PREFIX));
    if (rawV1) {
      state.guide = migrateSavedRegions(JSON.parse(rawV1), state.videoId);
      persistGuide();
    }
  } catch (error) {
    console.warn("Could not load Guide:", error);
    state.guide = createGuide(state.videoId);
  }
}

function mutateGuide(label, mutator, successMessage) {
  settleBeforeAction();
  const snapshot = captureActionState();
  try {
    const result = mutator();
    pushHistory(label, snapshot);
    persistGuide();
    renderGuide();
    updateUI();
    if (successMessage) setStatus(typeof successMessage === "function" ? successMessage(result) : successMessage);
    return result;
  } catch (error) {
    restoreActionState(snapshot);
    setStatus(error.message || "The Guide could not be updated.", true);
    renderGuide();
    updateUI();
    return null;
  }
}

function pauseInternally() {
  if (!player) return;
  state.internalPause = true;
  player.pauseVideo();
  window.setTimeout(() => { state.internalPause = false; }, 0);
}

function seekToCurrent() {
  if (!state.frame || !player) return;
  pauseInternally();
  player.setPlaybackRate(1);
  player.seekTo(state.frame.C, true);
}

function flushPendingStep(seek = true) {
  if (!state.pendingStep) return;
  clearTimeout(state.pendingStep.timer);
  state.pendingStep = null;
  if (seek) seekToCurrent();
}

function stopRepeat(message = null, returnToCurrent = true) {
  if (!state.repeatSession) return;
  state.repeatSession = null;
  pauseInternally();
  player.setPlaybackRate(1);
  if (returnToCurrent && state.frame) player.seekTo(state.frame.C, true);
  if (message) setStatus(message);
}

function finishPlayback(record = true) {
  const session = state.playbackSession;
  if (!session) return;
  const current = clamp(safeCurrentTime(), state.range.start, state.range.end);
  state.playbackSession = null;
  pauseInternally();
  player.setPlaybackRate(1);

  if (record && Math.abs(current - session.departure) > EPSILON) {
    pushHistory(session.label || "Play", session.undoSnapshot);
    state.frame = session.crossedResolution || session.wrapped
      ? widenToRange(current, state.range)
      : settlePlayback(session.parentFrame, session.departure, current);
    if (!session.wrapped) {
      state.lastTraversal = makeLastTraversal(session.departure, current, "play", "playback");
    }
  }
  updateUI();
}

function stopSkim(record = true) {
  const session = state.skimSession;
  if (!session) return;
  const current = clamp(safeCurrentTime(), state.range.start, state.range.end);
  state.skimSession = null;
  pauseInternally();
  player.setPlaybackRate(1);

  if (record && Math.abs(current - session.departure) > EPSILON) {
    pushHistory("Skim", session.undoSnapshot);
    state.frame = current >= session.parent.L - EPSILON && current <= session.parent.R + EPSILON
      ? settlePlayback(session.parent, session.departure, current)
      : widenToRange(current, state.range);
    state.lastTraversal = makeLastTraversal(session.departure, current, "skim", "playback", "later");
  }
  updateUI();
}

function settleBeforeAction() {
  flushPendingStep();
  if (state.skimSession) stopSkim(true);
  if (state.repeatSession) stopRepeat(null, true);
  if (state.playbackSession) finishPlayback(true);
}

function ensureAddressAvailable(address) {
  if (address >= state.range.start - EPSILON && address <= state.range.end + EPSILON) return;

  const current = state.frame?.C ?? address;
  if (state.focusedSectionId) {
    state.range = clone(state.focusReturnRange) || { start: 0, end: state.duration };
    state.focusedSectionId = null;
    state.focusReturnRange = null;
  }
  if (address < state.range.start - EPSILON || address > state.range.end + EPSILON) {
    state.range = { start: 0, end: state.duration };
  }
  state.frame = createRoot(state.range.start, clamp(current, state.range.start, state.range.end), state.range.end);
}

function commitSeekTraversal(destination, operator, historyLabel, statusLabel) {
  if (!state.videoLoaded || !Number.isFinite(destination)) return false;
  settleBeforeAction();
  const snapshot = captureActionState();
  const departure = state.frame.C;
  ensureAddressAvailable(destination);
  if (Math.abs(destination - departure) <= EPSILON) {
    seekToCurrent();
    setStatus(`Already at ${formatTime(departure)}.`);
    return false;
  }

  const direction = destination < state.frame.C ? "earlier" : "later";
  const nextFrame = descend(state.frame, direction, destination, state.range);
  pushHistory(historyLabel, snapshot);
  state.frame = nextFrame;
  state.lastTraversal = makeLastTraversal(departure, destination, operator, "seek", direction);
  seekToCurrent();
  setStatus(`${statusLabel} ${formatTime(destination)}.`);
  updateUI();
  return true;
}

function narrow(direction) {
  if (!state.videoLoaded || state.skimSession) return;
  const target = activeTargets()[direction];
  if (target === null) return;
  commitSeekTraversal(
    target,
    direction === "earlier" ? "narrowEarlier" : "narrowLater",
    direction === "earlier" ? "Narrow Earlier" : "Narrow Later",
    `Narrowed ${direction === "earlier" ? "Earlier to" : "Later to"}`
  );
}

function widenFully() {
  if (!state.videoLoaded || state.skimSession || !canWiden(state.frame, state.range)) return;
  settleBeforeAction();
  const snapshot = captureActionState();
  state.frame = widenToRange(state.frame.C, state.range);
  pushHistory("Widen", snapshot);
  seekToCurrent();
  setStatus(`Widened Resolution to Range and kept Current at ${formatTime(state.frame.C)}.`);
  updateUI();
}

function undoLastAction() {
  settleBeforeAction();
  const entry = state.history.pop();
  if (!entry) return;
  restoreActionState(entry.snapshot);
  persistGuide();
  seekToCurrent();
  renderGuide();
  setStatus(`Undid ${entry.label}.`);
  updateUI();
}

function performStep(direction) {
  if (!state.videoLoaded) return;
  if (!state.pendingStep) settleBeforeAction();
  const target = stepTarget(state.frame.C, state.stepSeconds, direction, state.range);
  if (Math.abs(target - state.frame.C) <= EPSILON) return;

  if (!state.pendingStep) {
    const snapshot = captureActionState();
    const label = direction === "earlier" ? "Step Earlier" : "Step Later";
    pushHistory(label, snapshot);
    state.pendingStep = { departure: state.frame.C, timer: null };
  }

  state.frame = stepFrame(state.frame, target, state.range);
  state.lastTraversal = makeLastTraversal(
    state.pendingStep.departure,
    target,
    direction === "earlier" ? "stepEarlier" : "stepLater",
    "seek",
    direction
  );

  clearTimeout(state.pendingStep.timer);
  state.pendingStep.timer = window.setTimeout(() => {
    flushPendingStep(true);
    setStatus(`Stepped ${direction === "earlier" ? "Earlier" : "Later"} to ${formatTime(state.frame.C)}.`);
    updateUI();
  }, STEP_DEBOUNCE_MS);
  updateUI();
}

function startSkim() {
  if (!state.videoLoaded) return;
  if (state.skimSession) {
    stopSkim(true);
    return;
  }
  settleBeforeAction();
  const target = activeTargets().later;
  if (target === null) return;
  const maxRate = Number(elements["speed-select"].value || 1);
  state.skimSession = {
    parent: clone(state.frame),
    departure: state.frame.C,
    target,
    maxRate,
    undoSnapshot: captureActionState()
  };
  player.seekTo(state.frame.C, true);
  player.playVideo();
  setStatus(`Skimming to ${formatTime(target)}, fast to normal.`);
  updateUI();
}

function finishSkimDestination() {
  const session = state.skimSession;
  if (!session) return;
  state.skimSession = null;
  player.setPlaybackRate(1);
  state.frame = descend(session.parent, "later", session.target, state.range);
  state.lastTraversal = makeLastTraversal(session.departure, session.target, "skim", "playback", "later");
  state.playbackSession = {
    departure: session.departure,
    parentFrame: clone(state.frame),
    undoSnapshot: session.undoSnapshot,
    crossedResolution: false,
    wrapped: false,
    label: "Skim and Play"
  };
  setStatus(`Skim reached ${formatTime(session.target)} and continued at 1×.`);
  updateUI();
}

function startPlaybackSession(playNow = true) {
  if (!state.videoLoaded) return;
  settleBeforeAction();
  const current = clamp(safeCurrentTime(), state.range.start, state.range.end);
  state.frame = { ...state.frame, C: current };
  state.playbackSession = {
    departure: current,
    parentFrame: clone(state.frame),
    undoSnapshot: captureActionState(),
    crossedResolution: false,
    wrapped: false,
    label: "Play Range"
  };
  player.setPlaybackRate(1);
  if (playNow) player.playVideo();
  setStatus(`Playing and looping Range ${formatRange(state.range)}.`);
  updateUI();
}

function ordinaryPlayPause() {
  if (!state.videoLoaded) return;
  flushPendingStep();
  if (state.skimSession) return stopSkim(true);
  if (state.repeatSession) {
    stopRepeat("Repeat stopped.", true);
    updateUI();
    return;
  }
  if (state.playbackSession) {
    finishPlayback(true);
    setStatus("Play paused.");
    return;
  }
  startPlaybackSession(true);
}

function startRepeatLast() {
  if (!state.lastTraversal) return;
  if (state.repeatSession) {
    stopRepeat("Repeat stopped.", true);
    updateUI();
    return;
  }
  settleBeforeAction();
  state.repeatSession = {
    start: state.lastTraversal.start,
    end: state.lastTraversal.end,
    returnCurrent: state.frame.C
  };
  player.seekTo(state.repeatSession.start, true);
  player.setPlaybackRate(1);
  player.playVideo();
  setStatus(`Repeating ${formatRange(state.repeatSession)}.`);
  updateUI();
}

function setRange(start, end, current, historyLabel, statusMessage) {
  if (!(end - start >= MIN_RANGE_SECONDS)) {
    setStatus("Range must have positive duration.", true);
    return false;
  }
  settleBeforeAction();
  const snapshot = captureActionState();
  state.range = { start, end };
  state.focusedSectionId = null;
  state.focusReturnRange = null;
  state.frame = createRoot(start, clamp(current, start, end), end);
  pushHistory(historyLabel, snapshot);
  seekToCurrent();
  renderGuide();
  setStatus(statusMessage);
  updateUI();
  return true;
}

function focusSection(sectionId) {
  const section = resolveSection(state.guide, sectionId);
  if (!section) return;
  settleBeforeAction();
  const snapshot = captureActionState();
  const departure = state.frame.C;
  if (!state.focusedSectionId) state.focusReturnRange = clone(state.range);
  state.focusedSectionId = section.id;
  state.range = { start: section.start, end: section.end };
  const current = departure >= section.start - EPSILON && departure <= section.end + EPSILON
    ? departure
    : section.midpoint;
  state.frame = createRoot(section.start, current, section.end);
  if (Math.abs(current - departure) > EPSILON) {
    state.lastTraversal = makeLastTraversal(departure, current, "focusSection", "seek");
  }
  pushHistory(`Focus “${section.label}”`, snapshot);
  seekToCurrent();
  renderGuide();
  setStatus(`Focused “${section.label}” as Range.`);
  updateUI();
}

function unfocusSection() {
  if (!state.focusedSectionId) return;
  settleBeforeAction();
  const snapshot = captureActionState();
  const returnRange = clone(state.focusReturnRange) || { start: 0, end: state.duration };
  const current = clamp(state.frame.C, returnRange.start, returnRange.end);
  state.range = returnRange;
  state.frame = createRoot(returnRange.start, current, returnRange.end);
  state.focusedSectionId = null;
  state.focusReturnRange = null;
  pushHistory("Unfocus Section", snapshot);
  seekToCurrent();
  renderGuide();
  setStatus(`Restored Range ${formatRange(returnRange)}.`);
  updateUI();
}

function addMarkAtCurrent() {
  const label = elements["mark-label"].value.trim();
  const current = state.frame?.C;
  if (!Number.isFinite(current)) return;
  const result = mutateGuide(
    "Add Mark",
    () => createOrReuseMark(state.guide, current, { label, explicit: true, provenance: "mark" }),
    ({ mark, created }) => `${created ? "Added" : "Updated"} Mark “${mark.label || formatTime(mark.t)}” at ${formatTime(mark.t)}.`
  );
  if (result) elements["mark-label"].value = "";
}

function saveRepeatWindowAsSection() {
  const label = elements["section-label"].value.trim();
  if (!state.lastTraversal) return setStatus("Traverse between two Addresses before saving a Section.", true);
  if (!label) return setStatus("A Section requires a title.", true);

  const section = mutateGuide(
    "Save Section",
    () => createSectionFromTimes(state.guide, state.lastTraversal.start, state.lastTraversal.end, {
      label,
      provenance: `traversal:${state.lastTraversal.operator}`
    }),
    `Saved Section “${label}”.`
  );
  if (section) elements["section-label"].value = "";
}

function renameMarkById(markId) {
  const mark = getMark(state.guide, markId);
  if (!mark) return;
  const label = window.prompt("Mark title", mark.label || "");
  if (label === null) return;
  mutateGuide("Rename Mark", () => renameMark(state.guide, markId, label), "Renamed Mark.");
}

function deleteMarkById(markId) {
  const mark = getMark(state.guide, markId);
  if (!mark) return;
  const references = sectionsForMark(state.guide, markId).length;
  if (references) {
    setStatus(`This Mark is used by ${references} Section${references === 1 ? "" : "s"}. Delete those Sections first.`, true);
    return;
  }
  if (!window.confirm(`Delete Mark “${mark.label || formatTime(mark.t)}”?`)) return;
  mutateGuide("Delete Mark", () => deleteMark(state.guide, markId), "Deleted Mark.");
}

function renameSectionById(sectionId) {
  const section = resolveSection(state.guide, sectionId);
  if (!section) return;
  const label = window.prompt("Section title", section.label);
  if (label === null) return;
  mutateGuide("Rename Section", () => renameSection(state.guide, sectionId, label), "Renamed Section.");
}

function deleteSectionById(sectionId) {
  const section = resolveSection(state.guide, sectionId);
  if (!section) return;
  if (!window.confirm(`Delete Section “${section.label}”?`)) return;
  mutateGuide("Delete Section", () => {
    if (state.focusedSectionId === sectionId) {
      const returnRange = clone(state.focusReturnRange) || { start: 0, end: state.duration };
      const current = clamp(state.frame.C, returnRange.start, returnRange.end);
      state.range = returnRange;
      state.frame = createRoot(returnRange.start, current, returnRange.end);
      state.focusedSectionId = null;
      state.focusReturnRange = null;
      seekToCurrent();
    }
    return deleteSection(state.guide, sectionId);
  }, "Deleted Section.");
}

function goToMark(mark, operator = "mark") {
  if (!mark) return;
  commitSeekTraversal(mark.t, operator, "Go to Mark", `Moved to Mark at`);
}

function goToAdjacentMark(direction) {
  const mark = direction === "earlier"
    ? previousMark(state.guide, state.frame.C, state.range)
    : nextMark(state.guide, state.frame.C, state.range);
  if (!mark) return;
  commitSeekTraversal(
    mark.t,
    direction === "earlier" ? "previousMark" : "nextMark",
    direction === "earlier" ? "Previous Mark" : "Next Mark",
    `Moved to ${direction === "earlier" ? "Previous" : "Next"} Mark at`
  );
}

function goToSectionMidpoint(sectionId) {
  const section = resolveSection(state.guide, sectionId);
  if (!section) return;
  commitSeekTraversal(section.midpoint, "section", `Go to Section “${section.label}”`, `Moved to midpoint of “${section.label}” at`);
}

function renderGuide() {
  const marks = visibleMarks(state.guide);
  const sections = sortedResolvedSections(state.guide);
  elements["mark-count"].textContent = String(marks.length);
  elements["section-count"].textContent = String(sections.length);
  elements["marks-list-count"].textContent = String(marks.length);
  elements["sections-list-count"].textContent = String(sections.length);

  elements["sections-list"].replaceChildren();
  if (!sections.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.videoLoaded ? "No Sections for this video." : "Load a video to see its Sections.";
    elements["sections-list"].appendChild(empty);
  } else {
    for (const section of sections) {
      const item = document.createElement("article");
      item.className = "guide-item section-item";
      item.dataset.sectionPreviewId = section.id;
      if (section.id === state.focusedSectionId) item.classList.add("focused");

      const main = document.createElement("button");
      main.type = "button";
      main.className = "guide-item-main";
      main.dataset.sectionGo = section.id;
      const title = document.createElement("span");
      title.className = "guide-item-title";
      title.textContent = section.label;
      const time = document.createElement("span");
      time.className = "guide-item-time";
      time.textContent = `${formatRange(section)} · ${formatDuration(section.end - section.start)}`;
      main.append(title, time);

      const actions = document.createElement("div");
      actions.className = "guide-item-actions";
      const focus = document.createElement("button");
      focus.type = "button";
      if (section.id === state.focusedSectionId) {
        focus.dataset.unfocusSection = "true";
        focus.textContent = "Unfocus";
      } else {
        focus.dataset.focusSection = section.id;
        focus.textContent = "Focus";
      }
      const rename = document.createElement("button");
      rename.type = "button";
      rename.dataset.renameSection = section.id;
      rename.textContent = "Rename";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.deleteSection = section.id;
      remove.textContent = "Delete";
      remove.className = "danger-text";
      actions.append(focus, rename, remove);

      const endpoints = document.createElement("div");
      endpoints.className = "section-endpoints";
      endpoints.append(
        endpointButton("Start", section.startMark),
        Object.assign(document.createElement("span"), { textContent: "→" }),
        endpointButton("End", section.endMark)
      );

      item.append(main, actions, endpoints);
      elements["sections-list"].appendChild(item);
    }
  }

  elements["marks-list"].replaceChildren();
  if (!marks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.videoLoaded ? "No explicit or named Marks for this video." : "Load a video to see its Marks.";
    elements["marks-list"].appendChild(empty);
  } else {
    for (const mark of marks) {
      const item = document.createElement("article");
      item.className = "guide-item mark-item";
      const main = document.createElement("button");
      main.type = "button";
      main.className = "guide-item-main";
      main.dataset.markGo = mark.id;
      const title = document.createElement("span");
      title.className = "guide-item-title";
      title.textContent = mark.label || "Unnamed Mark";
      const time = document.createElement("span");
      time.className = "guide-item-time";
      time.textContent = formatTime(mark.t);
      main.append(title, time);

      const actions = document.createElement("div");
      actions.className = "guide-item-actions";
      const rename = document.createElement("button");
      rename.type = "button";
      rename.dataset.renameMark = mark.id;
      rename.textContent = "Rename";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.deleteMark = mark.id;
      remove.textContent = "Delete";
      remove.className = "danger-text";
      actions.append(rename, remove);
      item.append(main, actions);
      elements["marks-list"].appendChild(item);
    }
  }

  state.renderedMarkKey = "";
  renderTimelineMarks();
}

function endpointButton(role, mark) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "endpoint-button";
  button.dataset.markGo = mark.id;
  const roleLabel = document.createElement("small");
  roleLabel.textContent = role;
  const text = document.createElement("span");
  text.textContent = `${formatTime(mark.t)} ${mark.label || ""}`.trim();
  button.append(roleLabel, text);
  return button;
}

function closeMarkClusterMenu() {
  elements["mark-cluster-menu"].hidden = true;
  elements["mark-cluster-menu"].replaceChildren();
}

function openMarkClusterMenu(cluster) {
  const menu = elements["mark-cluster-menu"];
  menu.replaceChildren();
  for (const mark of cluster.marks) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.markGo = mark.id;
    const label = document.createElement("span");
    label.textContent = mark.label || "Unnamed Mark";
    const time = document.createElement("time");
    time.textContent = formatTime(mark.t);
    button.append(label, time);
    menu.appendChild(button);
  }
  const width = elements.timeline.clientWidth || 1;
  menu.style.left = `${clamp(cluster.x - 135, 6, Math.max(6, width - 276))}px`;
  menu.hidden = false;
}

function renderTimelineMarks() {
  const width = Math.max(1, elements.timeline.clientWidth || 1);
  const marks = visibleMarks(state.guide).filter(mark =>
    mark.t >= state.range.start - EPSILON && mark.t <= state.range.end + EPSILON
  );
  const key = `${state.range.start}|${state.range.end}|${width}|${marks.map(mark => `${mark.id}:${mark.t}:${mark.label}`).join(",")}`;
  if (key === state.renderedMarkKey) return;
  state.renderedMarkKey = key;
  closeMarkClusterMenu();
  elements["mark-lane"].replaceChildren();
  state.renderedClusters = clusterMarksByPixels(marks, state.duration, width, 18);

  state.renderedClusters.forEach((cluster, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "timeline-mark";
    button.style.left = `${(cluster.x / width) * 100}%`;
    if (cluster.marks.length === 1) {
      const mark = cluster.marks[0];
      button.dataset.markGo = mark.id;
      const description = `${mark.label || "Unnamed Mark"} at ${formatTime(mark.t)}`;
      button.setAttribute("aria-label", description);
      button.title = description;
    } else {
      button.classList.add("cluster");
      button.dataset.clusterIndex = String(index);
      const count = document.createElement("span");
      count.className = "timeline-mark-count";
      count.textContent = String(cluster.marks.length);
      button.appendChild(count);
      const description = `${cluster.marks.length} nearby Marks`;
      button.setAttribute("aria-label", description);
      button.title = cluster.marks.map(mark => `${mark.label || "Unnamed Mark"} — ${formatTime(mark.t)}`).join("\n");
    }
    elements["mark-lane"].appendChild(button);
  });
}

function renderActionPreview(model, structural) {
  let range = state.previewAction && model ? model[state.previewAction] : null;
  if (!range && structural && ["previousMark", "nextMark"].includes(state.previewAction)) range = structural[state.previewAction];
  elements["action-preview-fill"].hidden = !range;
  if (!range) {
    elements["action-preview-fill"].removeAttribute("data-kind");
    return;
  }
  elements["action-preview-fill"].dataset.kind = state.previewAction;
  setSegment(elements["action-preview-fill"], range.start, range.end);
}

function renderSectionPreview() {
  const section = resolveSection(state.guide, state.previewSectionId);
  elements["section-preview-fill"].hidden = !section;
  if (section) setSegment(elements["section-preview-fill"], section.start, section.end);
}

function setActionMeta(buttonId, metaId, label, meta) {
  elements[metaId].textContent = meta;
  elements[buttonId].setAttribute("aria-label", `${label}: ${meta}`);
}

function updateUI() {
  const loaded = state.videoLoaded;
  const traversalActive = Boolean(state.skimSession);
  const repeatActive = Boolean(state.repeatSession);
  const playing = Boolean(state.playbackSession);
  const current = loaded && (traversalActive || repeatActive || playing || state.playerState === 1)
    ? clamp(safeCurrentTime(), state.range.start, state.range.end)
    : (state.frame?.C ?? 0);
  const targets = state.frame ? activeTargets() : { earlier: null, later: null };
  const model = state.frame ? getActionRanges(state.frame, state.range, state.lastTraversal, current, state.stepSeconds) : null;
  const previous = state.frame ? previousMark(state.guide, state.frame.C, state.range) : null;
  const next = state.frame ? nextMark(state.guide, state.frame.C, state.range) : null;
  const structuralPresentation = state.frame ? {
    previousMark: previous ? { start: previous.t, end: state.frame.C } : null,
    nextMark: next ? { start: state.frame.C, end: next.t } : null
  } : null;
  const focused = resolveSection(state.guide, state.focusedSectionId);

  elements["current-time"].textContent = formatTime(current);
  elements["duration-time"].textContent = formatTime(state.duration);
  elements["range-label"].textContent = loaded ? formatRange(state.range) : "—";
  elements["resolution-label"].textContent = state.frame
    ? `${formatTime(state.frame.L)}–${formatTime(state.frame.R)} · Level ${state.frame.level ?? 0}`
    : "—";
  elements["current-label"].textContent = state.frame ? formatTime(current) : "—";
  elements["repeat-label"].textContent = state.lastTraversal ? traversalLabel() : "—";
  elements["focused-label"].textContent = focused ? focused.label : "—";
  elements["range-tools-value"].textContent = loaded ? formatRange(state.range) : "—";
  elements["mark-address"].textContent = state.frame ? formatTime(state.frame.C) : "—";
  elements["section-window"].textContent = state.lastTraversal ? formatRange(state.lastTraversal) : "—";

  elements["focused-section"].hidden = !focused;
  if (focused) {
    elements["focused-section-title"].textContent = focused.label;
    elements["focused-section-range"].textContent = formatRange(focused);
  }

  const interactionLocked = !loaded || traversalActive || playing || repeatActive;
  for (const id of [
    "range-start-here", "range-midpoint", "range-end-here", "full-video-range",
    "step-slider", "step-seconds", "mark-current", "mark-label", "add-mark",
    "section-label", "save-section", "speed-select"
  ]) elements[id].disabled = interactionLocked;

  elements["add-mark"].disabled = interactionLocked;
  elements["save-section"].disabled = interactionLocked || !state.lastTraversal || !elements["section-label"].value.trim();
  elements["unfocus-section"].disabled = interactionLocked || !focused;
  elements["narrow-earlier"].disabled = interactionLocked || targets.earlier === null;
  elements["narrow-later"].disabled = interactionLocked || targets.later === null;
  elements.widen.disabled = interactionLocked || !model?.widen;
  elements.undo.disabled = !loaded || traversalActive || !state.history.length;
  elements["step-earlier"].disabled = interactionLocked || !model?.stepEarlier;
  elements["step-later"].disabled = interactionLocked || !model?.stepLater;
  elements["previous-mark"].disabled = interactionLocked || !previous;
  elements["next-mark"].disabled = interactionLocked || !next;
  elements.play.disabled = !loaded || traversalActive;
  elements["repeat-last"].disabled = !loaded || traversalActive || !state.lastTraversal;
  elements.skim.disabled = !loaded || repeatActive || playing || (traversalActive ? false : targets.later === null);

  const atFullVideo = loaded && Math.abs(state.range.start) <= EPSILON && Math.abs(state.range.end - state.duration) <= EPSILON && !focused;
  elements["full-video-range"].disabled = interactionLocked || atFullVideo;
  elements["range-start-here"].disabled = interactionLocked || !state.frame || state.frame.C <= state.range.start + EPSILON || state.frame.C >= state.range.end - MIN_RANGE_SECONDS;
  elements["range-end-here"].disabled = interactionLocked || !state.frame || state.frame.C >= state.range.end - EPSILON || state.frame.C <= state.range.start + MIN_RANGE_SECONDS;
  elements["range-midpoint"].disabled = interactionLocked || !state.frame || Math.abs(state.frame.C - spanMidpoint(state.range.start, state.range.end)) <= EPSILON;

  elements["skim-name"].textContent = traversalActive ? "Stop Skim" : "Skim";
  elements["play-name"].textContent = playing ? "Pause" : "Play Range";
  elements["repeat-name"].textContent = repeatActive ? "Stop Repeat" : "Repeat";
  elements["undo-meta"].textContent = state.history.length ? state.history.at(-1).label : "Nothing to undo";

  const maxRate = Number(elements["speed-select"].value || 1);
  setActionMeta("narrow-earlier", "earlier-meta", "Narrow Earlier", targets.earlier === null ? "No Earlier destination" : `to ${formatTime(targets.earlier)}`);
  setActionMeta("narrow-later", "later-meta", "Narrow Later", targets.later === null ? "No Later destination" : `to ${formatTime(targets.later)}`);
  elements["widen-meta"].textContent = model?.widen ? `${formatRange(state.range)} · keep ${formatTime(state.frame.C)}` : "Range-level Resolution";
  elements["skim-meta"].textContent = targets.later === null ? "No Later destination" : `to ${formatTime(targets.later)} · ${maxRate}×→1×`;
  elements["play-meta"].textContent = loaded ? `loops ${formatRange(state.range)}` : "—";
  elements["repeat-meta"].textContent = state.lastTraversal ? traversalLabel() : "No Repeat Window";
  elements["step-earlier-meta"].textContent = model?.stepEarlier ? `to ${formatTime(model.stepEarlier.destination)} · −${formatDuration(state.stepSeconds)}` : "Range Start";
  elements["step-later-meta"].textContent = model?.stepLater ? `to ${formatTime(model.stepLater.destination)} · +${formatDuration(state.stepSeconds)}` : "Range End";
  elements["previous-mark-meta"].textContent = previous ? `to ${formatTime(previous.t)}${previous.label ? ` · ${previous.label}` : ""}` : "No Earlier Mark";
  elements["next-mark-meta"].textContent = next ? `to ${formatTime(next.t)}${next.label ? ` · ${next.label}` : ""}` : "No Later Mark";
  elements["mark-current-meta"].textContent = state.frame ? `at ${formatTime(state.frame.C)}` : "—";

  if (!loaded || !state.frame) {
    for (const id of ["range-start-handle", "range-end-handle", "resolution-left-marker", "resolution-right-marker", "earlier-target-marker", "later-target-marker", "current-marker"]) {
      elements[id].hidden = true;
    }
    elements["repeat-fill"].hidden = true;
    elements["section-preview-fill"].hidden = true;
    elements["action-preview-fill"].hidden = true;
    renderTimelineMarks();
    return;
  }

  for (const id of ["range-start-handle", "range-end-handle", "resolution-left-marker", "resolution-right-marker", "current-marker"]) {
    elements[id].hidden = false;
  }
  setSegment(elements["range-fill"], state.range.start, state.range.end);
  setSegment(elements["resolution-fill"], state.frame.L, state.frame.R);
  setMarkerPosition(elements["range-start-handle"], state.range.start);
  setMarkerPosition(elements["range-end-handle"], state.range.end);
  setMarkerPosition(elements["resolution-left-marker"], state.frame.L);
  setMarkerPosition(elements["resolution-right-marker"], state.frame.R);
  setMarkerPosition(elements["current-marker"], current);

  elements["earlier-target-marker"].hidden = targets.earlier === null;
  elements["later-target-marker"].hidden = targets.later === null;
  if (targets.earlier !== null) setMarkerPosition(elements["earlier-target-marker"], targets.earlier);
  if (targets.later !== null) setMarkerPosition(elements["later-target-marker"], targets.later);

  elements["range-start-handle"].setAttribute("aria-valuenow", String(state.range.start));
  elements["range-end-handle"].setAttribute("aria-valuenow", String(state.range.end));
  elements["range-start-handle"].setAttribute("aria-valuemax", String(state.duration));
  elements["range-end-handle"].setAttribute("aria-valuemax", String(state.duration));
  elements["range-start-handle"].setAttribute("aria-valuetext", formatTime(state.range.start));
  elements["range-end-handle"].setAttribute("aria-valuetext", formatTime(state.range.end));

  elements["repeat-fill"].hidden = !state.lastTraversal;
  if (state.lastTraversal) setSegment(elements["repeat-fill"], state.lastTraversal.start, state.lastTraversal.end);
  renderSectionPreview();
  renderActionPreview(model, structuralPresentation);
  renderTimelineMarks();
}

function populateSpeedOptions() {
  const rates = [...new Set(state.availableRates)].filter(rate => Number.isFinite(rate) && rate >= 1).sort((a, b) => a - b);
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
  const duration = player.getDuration();
  if (!Number.isFinite(duration) || duration <= 0 || !pendingLoad) return;
  state.videoLoaded = true;
  state.videoId = pendingLoad.videoId;
  state.duration = duration;
  state.range = { start: 0, end: duration };
  const requestedStart = clamp(pendingLoad.startSeconds || 0, 0, duration);
  state.frame = createRoot(0, requestedStart, duration);
  state.focusedSectionId = null;
  state.focusReturnRange = null;
  state.lastTraversal = null;
  state.history = [];
  state.skimSession = null;
  state.repeatSession = null;
  state.playbackSession = null;
  state.pendingStep = null;
  state.availableRates = player.getAvailablePlaybackRates?.() || [1];
  pendingLoad = null;
  pauseInternally();
  player.seekTo(requestedStart, true);
  loadGuide();
  populateSpeedOptions();
  renderGuide();
  setStatus(`Loaded ${formatTime(duration)} video.`);
  updateUI();
}

function cuePendingVideo() {
  if (!state.playerReady || !pendingLoad) return;
  flushPendingStep(false);
  state.videoLoaded = false;
  state.frame = null;
  state.focusedSectionId = null;
  state.focusReturnRange = null;
  state.skimSession = null;
  state.repeatSession = null;
  state.playbackSession = null;
  state.lastTraversal = null;
  state.history = [];
  state.guide = createGuide();
  renderGuide();
  updateUI();
  player.cueVideoById({ videoId: pendingLoad.videoId, startSeconds: pendingLoad.startSeconds || 0 });
  setStatus("Loading YouTube video metadata…");
}

function handlePlayerStateChange(event) {
  state.playerState = event.data;
  if (event.data === 5 && pendingLoad && !state.videoLoaded) initializeVideo();
  if (state.internalPause) return;

  if (event.data === 1 && state.videoLoaded && !state.skimSession && !state.repeatSession && !state.playbackSession) {
    startPlaybackSession(false);
    return;
  }
  if (event.data === 2 && state.videoLoaded && state.skimSession) {
    stopSkim(true);
    return;
  }
  if (event.data === 2 && state.videoLoaded && state.repeatSession) {
    stopRepeat("Repeat stopped.", true);
    updateUI();
    return;
  }
  if (event.data === 2 && state.videoLoaded && state.playbackSession) {
    finishPlayback(true);
    setStatus("Play paused.");
    return;
  }
  if (event.data === 0 && state.videoLoaded && state.repeatSession) {
    player.seekTo(state.repeatSession.start, true);
    player.playVideo();
    return;
  }
  if (event.data === 0 && state.videoLoaded && state.playbackSession) {
    state.playbackSession.wrapped = true;
    state.playbackSession.crossedResolution = true;
    state.frame = widenToRange(state.range.start, state.range);
    player.seekTo(state.range.start, true);
    player.playVideo();
    setStatus(`Looped Range ${formatRange(state.range)}.`);
  }
  updateUI();
}

function pollPlayer() {
  if (!state.videoLoaded || !player || !state.playerReady) return;
  const now = safeCurrentTime();

  if (state.skimSession) {
    const session = state.skimSession;
    const total = session.target - session.departure;
    const progress = total > 0 ? clamp((now - session.departure) / total, 0, 1) : 1;
    const desired = logSpeed(session.maxRate, progress);
    const rate = chooseSupportedRate(state.availableRates, desired);
    if (Math.abs(player.getPlaybackRate() - rate) > 0.001) player.setPlaybackRate(rate);
    if (now >= session.target - EPSILON) {
      finishSkimDestination();
      return;
    }
  } else if (state.repeatSession) {
    if (now < state.repeatSession.start - EPSILON || now >= state.repeatSession.end - EPSILON) {
      player.seekTo(state.repeatSession.start, true);
      player.setPlaybackRate(1);
      player.playVideo();
    }
  } else if (state.playbackSession && state.playerState === 1) {
    const session = state.playbackSession;
    if (!session.crossedResolution && (now < session.parentFrame.L - EPSILON || now > session.parentFrame.R + EPSILON)) {
      session.crossedResolution = true;
      state.frame = widenToRange(clamp(now, state.range.start, state.range.end), state.range);
      setStatus(`Play crossed Resolution and Widened to Range ${formatRange(state.range)}.`);
    }
    if (now < state.range.start - EPSILON) {
      player.seekTo(state.range.start, true);
    } else if (now >= state.range.end - EPSILON) {
      session.wrapped = true;
      session.crossedResolution = true;
      state.frame = widenToRange(state.range.start, state.range);
      player.seekTo(state.range.start, true);
      player.setPlaybackRate(1);
      player.playVideo();
      setStatus(`Looped Range ${formatRange(state.range)}.`);
    }
  } else if (now < state.range.start - EPSILON || now > state.range.end + EPSILON) {
    player.seekTo(clamp(now, state.range.start, state.range.end), true);
  }
  updateUI();
}

function timeFromPointer(event) {
  const rect = elements.timeline.getBoundingClientRect();
  return clamp((event.clientX - rect.left) / rect.width, 0, 1) * state.duration;
}

function handleTimelineClick(event) {
  if (!state.videoLoaded || state.skimSession || state.dragHandle) return;
  if (event.target.closest(".range-handle") || event.target.closest(".timeline-mark") || event.target.closest(".mark-cluster-menu")) return;
  closeMarkClusterMenu();
  const time = timeFromPointer(event);
  if (time < state.range.start || time > state.range.end) {
    setStatus("That Address is outside Range.", true);
    return;
  }
  commitSeekTraversal(time, "timeline", "Timeline Click", "Clicked to");
}

function beginRangeDrag(kind, event) {
  if (!state.videoLoaded || state.skimSession || state.playbackSession || state.repeatSession) return;
  settleBeforeAction();
  event.preventDefault();
  event.stopPropagation();
  state.dragHandle = kind;
  state.rangeDragOrigin = captureActionState();
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function updateRangeDrag(event) {
  if (!state.dragHandle || !state.videoLoaded) return;
  const time = timeFromPointer(event);
  if (state.dragHandle === "start") {
    state.range.start = clamp(time, 0, state.range.end - MIN_RANGE_SECONDS);
  } else {
    state.range.end = clamp(time, state.range.start + MIN_RANGE_SECONDS, state.duration);
  }
  state.focusedSectionId = null;
  state.focusReturnRange = null;
  const current = clamp(state.frame.C, state.range.start, state.range.end);
  state.frame = createRoot(state.range.start, current, state.range.end);
  updateUI();
}

function finishRangeDrag() {
  if (!state.dragHandle) return;
  const origin = state.rangeDragOrigin;
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  if (origin && (Math.abs(origin.range.start - state.range.start) > EPSILON || Math.abs(origin.range.end - state.range.end) > EPSILON)) {
    pushHistory("Adjust Range", origin);
  }
  seekToCurrent();
  renderGuide();
  setStatus(`Range set to ${formatRange(state.range)}.`);
  updateUI();
}

function adjustStepPreset(direction) {
  const current = state.stepSeconds;
  const nextIndex = direction < 0
    ? Math.max(0, STEP_PRESETS.findIndex(value => value >= current - EPSILON) - 1)
    : Math.min(STEP_PRESETS.length - 1, STEP_PRESETS.findIndex(value => value > current + EPSILON));
  state.stepSeconds = STEP_PRESETS[nextIndex < 0 ? STEP_PRESETS.length - 1 : nextIndex];
  syncStepControls();
  updateUI();
}

function syncStepControls(source = null) {
  const value = clamp(Number(source?.value ?? state.stepSeconds), 0.25, 300);
  state.stepSeconds = value;
  elements["step-seconds"].value = String(value);
  elements["step-slider"].value = String(Math.min(value, 60));
}

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("player", {
    width: "100%",
    height: "100%",
    playerVars: { playsinline: 1, controls: 1, rel: 0 },
    events: {
      onReady: () => {
        state.playerReady = true;
        setStatus("YouTube player ready. Paste a link.");
        cuePendingVideo();
      },
      onStateChange: handlePlayerStateChange,
      onPlaybackRateChange: updateUI,
      onAutoplayBlocked: () => setStatus("The browser blocked scripted playback. Press the native YouTube Play button once, then retry.", true),
      onError: event => {
        const messages = {
          2: "Invalid YouTube video identifier.",
          5: "This video could not be played in the HTML5 player.",
          100: "This video was removed or is private.",
          101: "This video does not allow embedding.",
          150: "This video does not allow embedding.",
          153: "YouTube did not receive the required client identity/referrer. Serve this project over HTTP or HTTPS."
        };
        setStatus(messages[event.data] || `YouTube player error ${event.data}.`, true);
      }
    }
  });
  pollTimer = window.setInterval(pollPlayer, POLL_MS);
};

const apiScript = document.createElement("script");
apiScript.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(apiScript);

// Loading
elements["load-video"].addEventListener("click", () => {
  const parsed = parseYouTubeUrl(elements["youtube-url"].value);
  if (!parsed) {
    setStatus("Enter a valid YouTube watch, Shorts, live, embed, youtu.be link, or video ID.", true);
    return;
  }
  pendingLoad = parsed;
  if (!state.playerReady) {
    setStatus("Waiting for the YouTube player API…");
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
elements.timeline.addEventListener("pointercancel", finishRangeDrag);
elements["range-start-handle"].addEventListener("pointerdown", event => beginRangeDrag("start", event));
elements["range-end-handle"].addEventListener("pointerdown", event => beginRangeDrag("end", event));
elements["mark-lane"].addEventListener("click", event => {
  const markButton = event.target.closest("[data-mark-go]");
  if (markButton) {
    event.stopPropagation();
    goToMark(getMark(state.guide, markButton.dataset.markGo));
    return;
  }
  const clusterButton = event.target.closest("[data-cluster-index]");
  if (clusterButton) {
    event.stopPropagation();
    const cluster = state.renderedClusters[Number(clusterButton.dataset.clusterIndex)];
    if (cluster) openMarkClusterMenu(cluster);
  }
});
elements["mark-cluster-menu"].addEventListener("click", event => {
  const button = event.target.closest("[data-mark-go]");
  if (!button) return;
  event.stopPropagation();
  closeMarkClusterMenu();
  goToMark(getMark(state.guide, button.dataset.markGo));
});

elements["range-start-here"].addEventListener("click", () => {
  setRange(state.frame.C, state.range.end, state.frame.C, "Set Range Start", `Set Range Start to ${formatTime(state.frame.C)}.`);
});
elements["range-end-here"].addEventListener("click", () => {
  setRange(state.range.start, state.frame.C, state.frame.C, "Set Range End", `Set Range End to ${formatTime(state.frame.C)}.`);
});
elements["range-midpoint"].addEventListener("click", () => {
  const middle = spanMidpoint(state.range.start, state.range.end);
  commitSeekTraversal(middle, "rangeMidpoint", "Go to Range Midpoint", "Moved to Range midpoint at");
});
elements["full-video-range"].addEventListener("click", () => {
  setRange(0, state.duration, state.frame.C, "Full Video Range", "Restored Full Video Range.");
});

// Traversal
elements["narrow-earlier"].addEventListener("click", () => narrow("earlier"));
elements["narrow-later"].addEventListener("click", () => narrow("later"));
elements.widen.addEventListener("click", widenFully);
elements.undo.addEventListener("click", undoLastAction);
elements["step-earlier"].addEventListener("click", () => performStep("earlier"));
elements["step-later"].addEventListener("click", () => performStep("later"));
elements["previous-mark"].addEventListener("click", () => goToAdjacentMark("earlier"));
elements["next-mark"].addEventListener("click", () => goToAdjacentMark("later"));
elements["mark-current"].addEventListener("click", () => elements["mark-label"].focus());
elements.skim.addEventListener("click", startSkim);
elements.play.addEventListener("click", ordinaryPlayPause);
elements["repeat-last"].addEventListener("click", startRepeatLast);
elements["speed-select"].addEventListener("change", updateUI);

for (const control of document.querySelectorAll("[data-preview-action]")) {
  const action = control.dataset.previewAction;
  control.addEventListener("pointerenter", () => { state.previewAction = action; updateUI(); });
  control.addEventListener("pointerleave", () => { state.previewAction = null; updateUI(); });
  control.addEventListener("focus", () => { state.previewAction = action; updateUI(); });
  control.addEventListener("blur", () => { state.previewAction = null; updateUI(); });
}

// Step size
elements["step-slider"].addEventListener("input", event => { syncStepControls(event.target); updateUI(); });
elements["step-seconds"].addEventListener("change", event => { syncStepControls(event.target); updateUI(); });

// Guide composers
elements["add-mark"].addEventListener("click", addMarkAtCurrent);
elements["mark-label"].addEventListener("keydown", event => { if (event.key === "Enter") addMarkAtCurrent(); });
elements["save-section"].addEventListener("click", saveRepeatWindowAsSection);
elements["section-label"].addEventListener("input", updateUI);
elements["section-label"].addEventListener("keydown", event => { if (event.key === "Enter") saveRepeatWindowAsSection(); });
elements["unfocus-section"].addEventListener("click", unfocusSection);

function handleGuideClick(event) {
  const markGo = event.target.closest("[data-mark-go]");
  if (markGo) return goToMark(getMark(state.guide, markGo.dataset.markGo));
  const sectionGo = event.target.closest("[data-section-go]");
  if (sectionGo) return goToSectionMidpoint(sectionGo.dataset.sectionGo);
  const focus = event.target.closest("[data-focus-section]");
  if (focus) return focusSection(focus.dataset.focusSection);
  const unfocus = event.target.closest("[data-unfocus-section]");
  if (unfocus) return unfocusSection();
  const renameMarkButton = event.target.closest("[data-rename-mark]");
  if (renameMarkButton) return renameMarkById(renameMarkButton.dataset.renameMark);
  const deleteMarkButton = event.target.closest("[data-delete-mark]");
  if (deleteMarkButton) return deleteMarkById(deleteMarkButton.dataset.deleteMark);
  const renameSectionButton = event.target.closest("[data-rename-section]");
  if (renameSectionButton) return renameSectionById(renameSectionButton.dataset.renameSection);
  const deleteSectionButton = event.target.closest("[data-delete-section]");
  if (deleteSectionButton) return deleteSectionById(deleteSectionButton.dataset.deleteSection);
}

elements["sections-list"].addEventListener("click", handleGuideClick);
elements["marks-list"].addEventListener("click", handleGuideClick);
elements["sections-list"].addEventListener("pointerover", event => {
  const item = event.target.closest("[data-section-preview-id]");
  if (!item || item.contains(event.relatedTarget)) return;
  state.previewSectionId = item.dataset.sectionPreviewId;
  updateUI();
});
elements["sections-list"].addEventListener("pointerout", event => {
  const item = event.target.closest("[data-section-preview-id]");
  if (!item || item.contains(event.relatedTarget)) return;
  state.previewSectionId = null;
  updateUI();
});

// Keyboard
document.addEventListener("keydown", event => {
  const tag = document.activeElement?.tagName;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) {
    if (event.key === "Escape") document.activeElement.blur();
    return;
  }
  if (!state.videoLoaded) return;
  const key = event.key.toLowerCase();
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey;

  if (plain && key === "q") { event.preventDefault(); narrow("earlier"); }
  else if (plain && key === "w") { event.preventDefault(); widenFully(); }
  else if (plain && key === "e") { event.preventDefault(); narrow("later"); }
  else if (plain && key === "r") { event.preventDefault(); undoLastAction(); }
  else if (plain && key === "s") { event.preventDefault(); startSkim(); }
  else if (plain && key === "t") { event.preventDefault(); startRepeatLast(); }
  else if (plain && key === "m") { event.preventDefault(); elements["mark-label"].focus(); }
  else if (event.key === "ArrowLeft") { event.preventDefault(); performStep("earlier"); }
  else if (event.key === "ArrowRight") { event.preventDefault(); performStep("later"); }
  else if (plain && event.key === ",") { event.preventDefault(); goToAdjacentMark("earlier"); }
  else if (plain && event.key === ".") { event.preventDefault(); goToAdjacentMark("later"); }
  else if (plain && event.key === "[") { event.preventDefault(); adjustStepPreset(-1); }
  else if (plain && event.key === "]") { event.preventDefault(); adjustStepPreset(1); }
  else if (event.key === "Backspace") { event.preventDefault(); undoLastAction(); }
  else if (event.key === "Escape") {
    closeMarkClusterMenu();
    state.previewAction = null;
    state.previewSectionId = null;
    updateUI();
  } else if (event.key === " ") {
    event.preventDefault();
    ordinaryPlayPause();
  }
});

window.addEventListener("resize", () => {
  state.renderedMarkKey = "";
  renderTimelineMarks();
});

syncStepControls();
renderGuide();
updateUI();
