import {
  EPSILON,
  clamp,
  createRoot,
  getTargets,
  descend,
  intervalMidpoint,
  widenAtCurrent,
  widenStackAtCurrent,
  pointAfterUndo,
  getActionRanges,
  settlePlayback,
  logSpeed,
  chooseSupportedRate
} from "./traversal.js";
import { parseYouTubeUrl } from "./youtube.js";

const STORAGE_PREFIX = "binary-youtube-reader:v1:";
const POLL_MS = 100;
const MIN_SCOPE_SECONDS = 0.25;

const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map(node => [node.id, node])
);

const state = {
  playerReady: false,
  videoLoaded: false,
  videoId: null,
  duration: 0,
  scope: { start: 0, end: 0 },
  stack: [],
  point: null,
  traversal: null,
  repeat: null,
  playStart: null,
  playWidened: false,
  lastPassage: null,
  previewAction: null,
  availableRates: [1],
  savedRegions: [],
  dragHandle: null,
  playerState: -1,
  internalPause: false
};

let player = null;
let pendingLoad = null;
let pollTimer = null;

function currentFrame() {
  return state.stack[state.stack.length - 1] || null;
}

function safeCurrentTime() {
  if (!player || !state.playerReady) return currentFrame()?.C || 0;
  const value = player.getCurrentTime();
  return Number.isFinite(value) ? value : currentFrame()?.C || 0;
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

function resetRootAt(current, seek = true) {
  const C = clamp(current, state.scope.start, state.scope.end);
  state.stack = [createRoot(state.scope.start, C, state.scope.end)];
  state.point = null;
  state.lastPassage = null;

  if (seek && player && state.playerReady) {
    player.seekTo(C, true);
  }

  updateUI();
}

function setScope(start, end, current = null, message = "Range updated.") {
  if (!state.videoLoaded) return false;

  const A = clamp(start, 0, state.duration);
  const B = clamp(end, 0, state.duration);

  if (!(B - A >= MIN_SCOPE_SECONDS)) {
    setStatus("The range must have a positive duration.", true);
    return false;
  }

  stopTraversal(false);
  stopRepeat();
  finishOrdinaryPlayback(false);

  state.scope = { start: A, end: B };
  const C = current === null
    ? clamp(safeCurrentTime(), A, B)
    : clamp(current, A, B);

  state.stack = [createRoot(A, C, B)];
  state.point = null;
  state.lastPassage = null;

  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(C, true);

  setStatus(message);
  updateUI();
  return true;
}

function activeTargets() {
  const frame = currentFrame();
  return frame ? getTargets(frame, state.point, state.scope) : { earlier: null, later: null };
}

function parentFrame() {
  return state.stack.length > 1 ? state.stack[state.stack.length - 2] : null;
}

function actionPresentation(current = null) {
  const frame = currentFrame();
  const position = current ?? (
    state.traversal || state.repeat || state.playStart !== null
      ? safeCurrentTime()
      : frame?.C
  );
  return frame
    ? getActionRanges(
      frame,
      state.scope,
      state.point,
      parentFrame(),
      state.lastPassage,
      position
    )
    : null;
}

function formatRange(range) {
  return range ? `${formatTime(range.start)}–${formatTime(range.end)}` : "—";
}

function formatResolution(action, placeVerb) {
  return action
    ? `${formatRange(action)} · ${placeVerb} ${formatTime(action.current)}`
      + (Number.isFinite(action.point) ? ` · Point ${formatTime(action.point)}` : "")
      + ` · Earlier ${formatTime(action.earlier)} · Later ${formatTime(action.later)}`
    : "Root passage";
}

function renderActionPreview(model = actionPresentation()) {
  const range = state.previewAction && model ? model[state.previewAction] : null;
  elements["action-preview-fill"].hidden = !range;

  if (!range) {
    elements["action-preview-fill"].removeAttribute("data-kind");
    return;
  }

  elements["action-preview-fill"].dataset.kind = state.previewAction;
  setSegment(elements["action-preview-fill"], range.start, range.end);
}

function setPreviewAction(action) {
  state.previewAction = action;
  renderActionPreview();
}

function narrow(direction, source = "control") {
  if (!state.videoLoaded || state.traversal) return;

  prepareForNavigation();
  const frame = currentFrame();
  const target = activeTargets()[direction];
  if (target === null) return;

  const departure = frame.C;
  const directionLabel = direction === "earlier" ? "Earlier" : "Later";
  const child = descend(frame, direction, target, state.scope);
  const usesPoint = Number.isFinite(state.point)
    && Math.abs(target - state.point) <= EPSILON;
  if (usesPoint) child.returnPoint = state.point;

  state.stack.push(child);
  state.lastPassage = {
    start: Math.min(departure, target),
    end: Math.max(departure, target)
  };
  if (usesPoint) state.point = null;

  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(target, true);

  setStatus(
    source === "timeline"
      ? `Point selected at ${formatTime(target)}. Narrowed ${directionLabel} to it.`
      : `Narrowed ${directionLabel} to ${formatTime(target)}.`
  );
  updateUI();
}

function stopRepeat(message = null, returnToCurrent = false, pause = true) {
  if (!state.repeat) return;
  state.repeat = null;
  if (pause) player.pauseVideo();
  if (returnToCurrent) player.seekTo(currentFrame().C, true);
  player.setPlaybackRate(1);
  if (message) setStatus(message);
}

function startRepeat() {
  if (!state.videoLoaded || state.traversal || !state.lastPassage) return;

  if (state.repeat) {
    stopRepeat("Repeat stopped.", true);
    updateUI();
    return;
  }

  finishOrdinaryPlayback(false);
  const { start, end } = state.lastPassage;
  if (end <= start + EPSILON) return;

  state.repeat = { start, end };
  player.setPlaybackRate(1);
  player.seekTo(start, true);
  player.playVideo();
  setStatus(`Repeating ${formatTime(start)}–${formatTime(end)} at 1×.`);
  updateUI();
}

function refactorPassageForCurrent(current) {
  const result = widenStackAtCurrent(state.stack, current, state.scope);
  if (!result.levels) return false;

  state.stack = result.stack;
  state.playWidened = true;
  return true;
}

function finishOrdinaryPlayback(pause = true) {
  if (state.playStart === null) return false;

  const start = state.playStart;
  const current = clamp(safeCurrentTime(), state.scope.start, state.scope.end);
  refactorPassageForCurrent(current);
  const widened = state.playWidened;
  state.playStart = null;
  state.playWidened = false;
  const frame = currentFrame();
  if (!frame) return false;

  const settled = widened
    ? { ...frame, C: clamp(current, frame.L, frame.R) }
    : settlePlayback(frame, start, current);
  Object.assign(frame, settled);
  const place = frame.C;
  if (Math.abs(place - start) > EPSILON) {
    state.lastPassage = {
      start: Math.min(start, place),
      end: Math.max(start, place)
    };
  }

  if (pause) player.pauseVideo();
  player.setPlaybackRate(1);
  return true;
}

function prepareForNavigation() {
  stopRepeat(null, true);
  finishOrdinaryPlayback();
}

function stopTraversal(commitActual) {
  const traversal = state.traversal;
  if (!traversal) return;

  state.traversal = null;
  state.playWidened = false;
  state.internalPause = true;
  player.pauseVideo();
  player.setPlaybackRate(1);

  if (commitActual) {
    const actual = clamp(
      safeCurrentTime(),
      traversal.departure,
      traversal.target
    );

    if (actual > traversal.departure + EPSILON) {
      const child = descend(traversal.parent, "later", actual, state.scope);
      state.stack.push(child);
      state.lastPassage = { start: traversal.departure, end: actual };
      player.seekTo(actual, true);
      setStatus(`Skim stopped at ${formatTime(actual)}.`);
    } else {
      player.seekTo(traversal.departure, true);
      setStatus("Skim stopped before it advanced.");
    }
  }

  queueMicrotask(() => {
    state.internalPause = false;
  });

  updateUI();
}

function finishTraversal() {
  const traversal = state.traversal;
  if (!traversal) return;

  state.traversal = null;
  player.setPlaybackRate(1);

  const child = descend(traversal.parent, "later", traversal.target, state.scope);
  if (Number.isFinite(traversal.point)) {
    child.returnPoint = traversal.point;
    state.point = null;
  }
  state.stack.push(child);
  state.playStart = traversal.departure;
  state.playWidened = false;
  state.lastPassage = {
    start: traversal.departure,
    end: traversal.target
  };

  setStatus(`Skim reached ${formatTime(traversal.target)}. Continuing at 1×.`);
  updateUI();
}

function startForwardTraversal() {
  if (!state.videoLoaded || state.traversal) return;

  stopRepeat(null, true, false);
  finishOrdinaryPlayback(false);
  const parent = { ...currentFrame() };
  const target = activeTargets().later;
  if (target === null || target <= parent.C + EPSILON) return;

  state.traversal = {
    parent,
    departure: parent.C,
    target,
    point: Number.isFinite(state.point) && Math.abs(target - state.point) <= EPSILON
      ? state.point
      : null,
    maxRate: Number(elements["speed-select"].value || 1),
    lastDesiredRate: Number(elements["speed-select"].value || 1)
  };

  player.seekTo(parent.C, true);
  player.playVideo();
  setStatus(`Skimming to ${formatTime(target)}, fast to normal.`);
  updateUI();
}

function ordinaryPlayPause() {
  if (!state.videoLoaded) return;

  if (state.traversal) {
    stopTraversal(true);
    return;
  }

  if (state.repeat) {
    stopRepeat("Repeat stopped.", true);
    updateUI();
    return;
  }

  if (state.playStart !== null) {
    finishOrdinaryPlayback();
    setStatus("Paused. Repeat is ready for the passage just played.");
  } else if (state.playerState === 1) {
    player.pauseVideo();
    player.setPlaybackRate(1);
    setStatus("Paused.");
  } else {
    const current = clamp(safeCurrentTime(), state.scope.start, state.scope.end);
    refactorPassageForCurrent(current);
    state.playStart = current;
    state.playWidened = false;
    player.setPlaybackRate(1);
    player.playVideo();
    setStatus("Playing at 1×. Crossing a passage edge will Widen.");
  }

  updateUI();
}

function restoreDepth(depth) {
  if (!Number.isInteger(depth) || depth < 0 || depth >= state.stack.length) return;

  const restored = state.stack[depth];
  state.point = pointAfterUndo(state.stack, depth, state.point);
  state.stack = state.stack.slice(0, depth + 1);

  const frame = currentFrame();
  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(frame.C, true);

  setStatus(
    `Undid to ${formatTime(restored.C)} in ${formatTime(restored.L)}–${formatTime(restored.R)}.`
  );
  updateUI();
}

function undoOneLevel() {
  if (state.traversal || state.stack.length < 2) return;
  prepareForNavigation();
  const depth = state.stack.length - 1;
  if (depth > 0) restoreDepth(depth - 1);
}

function undoToRoot() {
  if (state.traversal || state.stack.length < 2) return;
  prepareForNavigation();
  if (state.stack.length > 1) restoreDepth(0);
}

function widenOneLevel() {
  if (state.traversal) return;

  const initialFrame = currentFrame();
  const initialParent = parentFrame();
  const rootCanWiden = !initialParent
    && (
      initialFrame.L > state.scope.start + EPSILON
      || initialFrame.R < state.scope.end - EPSILON
    );
  if (!initialParent && !rootCanWiden) return;

  prepareForNavigation();
  const frame = currentFrame();
  const current = frame.C;
  const parent = parentFrame();

  const base = parent || createRoot(state.scope.start, current, state.scope.end);
  const widened = { ...base, ...widenAtCurrent(base, current) };
  if (Number.isFinite(frame.returnPoint)) {
    widened.returnPoint = frame.returnPoint;
  }

  state.stack = parent
    ? [...state.stack.slice(0, -2), widened]
    : [widened];
  state.playWidened = false;

  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(widened.C, true);

  setStatus(
    `Widened to ${formatTime(widened.L)}–${formatTime(widened.R)}; stayed at ${formatTime(widened.C)}.`
  );
  updateUI();
}

function timeFromPointer(event) {
  const rect = elements.timeline.getBoundingClientRect();
  const fraction = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  return fraction * state.duration;
}

function handleTimelineClick(event) {
  if (!state.videoLoaded || state.traversal || state.dragHandle) return;
  if (event.target.classList.contains("scope-handle")) return;

  const time = timeFromPointer(event);

  if (time < state.scope.start || time > state.scope.end) {
    setStatus("That Point is outside the range.", true);
    return;
  }

  prepareForNavigation();
  const active = currentFrame();
  if (Math.abs(time - active.C) <= EPSILON) {
    player.seekTo(active.C, true);
    setStatus(`Already at ${formatTime(active.C)}.`);
    return;
  }

  const direction = time < active.C ? "earlier" : "later";
  state.point = time;
  narrow(direction, "timeline");
}

function beginScopeDrag(kind, event) {
  if (!state.videoLoaded || state.traversal) return;
  prepareForNavigation();
  event.preventDefault();
  event.stopPropagation();
  state.dragHandle = kind;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function updateScopeDrag(event) {
  if (!state.dragHandle || !state.videoLoaded) return;

  const time = timeFromPointer(event);
  const current = safeCurrentTime();

  if (state.dragHandle === "start") {
    state.scope.start = clamp(
      time,
      0,
      state.scope.end - MIN_SCOPE_SECONDS
    );
  } else {
    state.scope.end = clamp(
      time,
      state.scope.start + MIN_SCOPE_SECONDS,
      state.duration
    );
  }

  const C = clamp(current, state.scope.start, state.scope.end);
  state.stack = [createRoot(state.scope.start, C, state.scope.end)];
  state.point = null;
  state.lastPassage = null;
  updateUI();
}

function finishScopeDrag() {
  if (!state.dragHandle) return;
  state.dragHandle = null;

  const C = clamp(safeCurrentTime(), state.scope.start, state.scope.end);
  player.pauseVideo();
  player.seekTo(C, true);
  state.stack = [createRoot(state.scope.start, C, state.scope.end)];
  state.lastPassage = null;
  setStatus(`Range set to ${formatTime(state.scope.start)}–${formatTime(state.scope.end)}.`);
  updateUI();
}

function nudgeScopeHandle(kind, delta) {
  if (!state.videoLoaded || state.traversal) return;

  if (kind === "start") {
    const start = clamp(
      state.scope.start + delta,
      0,
      state.scope.end - MIN_SCOPE_SECONDS
    );
    setScope(start, state.scope.end, clamp(safeCurrentTime(), start, state.scope.end));
  } else {
    const end = clamp(
      state.scope.end + delta,
      state.scope.start + MIN_SCOPE_SECONDS,
      state.duration
    );
    setScope(state.scope.start, end, clamp(safeCurrentTime(), state.scope.start, end));
  }
}

function storageKey() {
  return `${STORAGE_PREFIX}${state.videoId}`;
}

function loadSavedRegions() {
  state.savedRegions = [];
  if (!state.videoId) return;

  try {
    const raw = localStorage.getItem(storageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      state.savedRegions = parsed.filter(region =>
        region &&
        (!region.videoId || region.videoId === state.videoId) &&
        Number.isFinite(region.start) &&
        Number.isFinite(region.end) &&
        region.start >= 0 &&
        region.end > region.start
      );
    }
  } catch (error) {
    console.warn("Could not load saved regions:", error);
  }
}

function persistSavedRegions() {
  if (!state.videoId) return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.savedRegions));
  } catch (error) {
    setStatus("The browser could not save this passage locally.", true);
  }
}

function saveCurrentInterval() {
  if (!state.videoLoaded) return;

  const frame = currentFrame();
  const label = elements["region-label"].value.trim() || `Passage ${state.savedRegions.length + 1}`;

  const region = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    videoId: state.videoId,
    label,
    start: frame.L,
    end: frame.R,
    createdAt: Date.now()
  };

  state.savedRegions.unshift(region);
  persistSavedRegions();
  elements["region-label"].value = "";
  setStatus(`Saved “${label}”.`);
  renderSavedRegions();
}

function loadSavedRegion(regionId) {
  const region = state.savedRegions.find(item => item.id === regionId);
  if (!region) return;

  const start = clamp(region.start, 0, state.duration);
  const end = clamp(region.end, 0, state.duration);
  const middle = intervalMidpoint(start, end);

  setScope(start, end, middle, `Loaded “${region.label}” at its midpoint.`);
}

function deleteSavedRegion(regionId) {
  const region = state.savedRegions.find(item => item.id === regionId);
  state.savedRegions = state.savedRegions.filter(item => item.id !== regionId);
  persistSavedRegions();
  renderSavedRegions();

  if (region) setStatus(`Deleted “${region.label}”.`);
}

function renderSavedRegions() {
  elements["saved-count"].textContent = String(state.savedRegions.length);
  elements["saved-regions"].replaceChildren();

  if (!state.savedRegions.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.videoLoaded
      ? "No saved passages for this video."
      : "Load a video to see its saved passages.";
    elements["saved-regions"].appendChild(empty);
    return;
  }

  for (const region of state.savedRegions) {
    const item = document.createElement("div");
    item.className = "saved-item";

    const loadButton = document.createElement("button");
    loadButton.className = "saved-load";
    loadButton.type = "button";
    loadButton.dataset.regionId = region.id;

    const label = document.createElement("span");
    label.className = "saved-label";
    label.textContent = region.label;

    const times = document.createElement("span");
    times.className = "saved-times";
    times.textContent = `${formatTime(region.start)}–${formatTime(region.end)}`;

    loadButton.append(label, times);

    const deleteButton = document.createElement("button");
    deleteButton.className = "saved-delete";
    deleteButton.type = "button";
    deleteButton.dataset.deleteRegionId = region.id;
    deleteButton.setAttribute("aria-label", `Delete ${region.label}`);
    deleteButton.textContent = "×";

    item.append(loadButton, deleteButton);
    elements["saved-regions"].appendChild(item);
  }
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

  elements["speed-select"].value = String((rates.length ? rates : [1]).at(-1));
}

function setActionMeta(buttonId, metaId, label, meta) {
  elements[metaId].textContent = meta;
  elements[buttonId].setAttribute("aria-label", `${label}: ${meta}`);
}

function updateUI() {
  const loaded = state.videoLoaded;
  const frame = currentFrame();
  const targets = frame ? activeTargets() : { earlier: null, later: null };
  const depth = Math.max(0, state.stack.length - 1);
  const traversalActive = Boolean(state.traversal);
  const repeatActive = Boolean(state.repeat);
  const actualCurrent = loaded ? safeCurrentTime() : 0;
  const current = loaded && (
    traversalActive
    || repeatActive
    || state.playStart !== null
    || state.playerState === 1
  )
    ? actualCurrent
    : (frame?.C ?? actualCurrent);
  const presentationCurrent = state.playStart !== null
    ? actualCurrent
    : (frame?.C ?? actualCurrent);
  const model = frame ? actionPresentation(presentationCurrent) : null;

  elements["current-time"].textContent = formatTime(current);
  elements["duration-time"].textContent = formatTime(state.duration);

  const basicControls = [
    "set-start", "set-end", "centre-scope", "full-video",
    "ordinary-play", "save-region", "speed-select"
  ];

  for (const id of basicControls) {
    elements[id].disabled = !loaded || traversalActive;
  }

  elements["go-earlier"].disabled = !loaded || traversalActive || targets.earlier === null;
  elements["go-later"].disabled = !loaded || traversalActive || targets.later === null;
  elements["ordinary-play"].disabled = !loaded || traversalActive || repeatActive;
  elements["repeat-passage"].disabled = !loaded || traversalActive || !state.lastPassage;
  elements["search-play"].disabled = !loaded || (traversalActive ? false : targets.later === null);
  elements["undo-move"].disabled = !loaded || traversalActive || depth === 0;
  elements["widen-passage"].disabled = !loaded || traversalActive || !model?.widen;

  elements["skim-action-name"].textContent = traversalActive ? "Stop skim" : "Skim";
  elements["play-action-name"].textContent =
    state.playStart !== null && !traversalActive && !repeatActive ? "Pause" : "Play";
  elements["repeat-action-name"].textContent = repeatActive ? "Stop repeat" : "Repeat";

  const maxRate = Number(elements["speed-select"].value || 1);
  const earlierMeta = targets.earlier === null
    ? "No Earlier destination"
    : `to ${formatTime(targets.earlier)}`;
  const laterMeta = targets.later === null
    ? "No Later destination"
    : `to ${formatTime(targets.later)}`;
  const undoMeta = formatResolution(model?.undo, "to");
  const widenMeta = formatResolution(model?.widen, "stay");
  const skimMeta = targets.later === null
    ? "No Later destination"
    : `to ${formatTime(targets.later)} · ${maxRate}×→1× onward`;
  const playFrom = state.playStart ?? frame?.C;
  const playMeta = playFrom === undefined ? "1× onward" : `1× onward from ${formatTime(playFrom)}`;
  const repeatMeta = model?.repeat ? formatRange(model.repeat) : "No passage yet";

  setActionMeta("go-earlier", "earlier-action-meta", "Narrow Earlier", earlierMeta);
  setActionMeta("go-later", "later-action-meta", "Narrow Later", laterMeta);
  elements["undo-move"].setAttribute("aria-label", `Undo: ${undoMeta}`);
  elements["undo-action-meta"].textContent = undoMeta;
  elements["widen-passage"].setAttribute("aria-label", `Widen: ${widenMeta}`);
  elements["widen-action-meta"].textContent = widenMeta;
  setActionMeta(
    "search-play",
    "skim-action-meta",
    traversalActive ? "Stop skim" : "Skim",
    skimMeta
  );
  setActionMeta(
    "ordinary-play",
    "play-action-meta",
    state.playStart !== null ? "Pause" : "Play",
    playMeta
  );
  setActionMeta(
    "repeat-passage",
    "repeat-action-meta",
    repeatActive ? "Stop repeat" : "Repeat",
    repeatMeta
  );

  if (!loaded || !frame) {
    [
      "scope-start-handle", "scope-end-handle", "frame-left-marker",
      "frame-right-marker", "earlier-target-marker", "later-target-marker",
      "current-marker", "point-marker"
    ].forEach(id => elements[id].hidden = true);

    elements["scope-label"].textContent = "Range —";
    elements["frame-label"].textContent = "Passage —";
    elements["target-label"].textContent = "Earlier — · Later —";
    elements["point-label"].textContent = "Point —";
    renderActionPreview(null);
    return;
  }

  [
    "scope-start-handle", "scope-end-handle", "frame-left-marker",
    "frame-right-marker", "current-marker"
  ].forEach(id => elements[id].hidden = false);

  setSegment(elements["scope-fill"], state.scope.start, state.scope.end);
  setSegment(elements["frame-fill"], frame.L, frame.R);
  setMarkerPosition(elements["scope-start-handle"], state.scope.start);
  setMarkerPosition(elements["scope-end-handle"], state.scope.end);
  setMarkerPosition(elements["frame-left-marker"], frame.L);
  setMarkerPosition(elements["frame-right-marker"], frame.R);
  setMarkerPosition(elements["current-marker"], current);

  const customEarlier = state.point !== null && state.point < frame.C;
  const customLater = state.point !== null && state.point > frame.C;
  elements["earlier-target-marker"].hidden = targets.earlier === null || customEarlier;
  elements["later-target-marker"].hidden = targets.later === null || customLater;
  if (targets.earlier !== null) setMarkerPosition(elements["earlier-target-marker"], targets.earlier);
  if (targets.later !== null) setMarkerPosition(elements["later-target-marker"], targets.later);

  elements["point-marker"].hidden = state.point === null;
  if (state.point !== null) setMarkerPosition(elements["point-marker"], state.point);

  elements["scope-label"].textContent =
    `Range ${formatTime(state.scope.start)}–${formatTime(state.scope.end)}`;
  elements["frame-label"].textContent =
    `Passage ${formatTime(frame.L)}–${formatTime(frame.R)}`;
  elements["target-label"].textContent =
    `Earlier ${formatTime(targets.earlier)} · Later ${formatTime(targets.later)}`;
  elements["point-label"].textContent =
    state.point === null ? "Point —" : `Point ${formatTime(state.point)}`;

  elements["scope-start-handle"].setAttribute("aria-valuenow", String(state.scope.start));
  elements["scope-end-handle"].setAttribute("aria-valuenow", String(state.scope.end));
  elements["scope-start-handle"].setAttribute("aria-valuemax", String(state.duration));
  elements["scope-end-handle"].setAttribute("aria-valuemax", String(state.duration));
  elements["scope-start-handle"].setAttribute("aria-valuetext", formatTime(state.scope.start));
  elements["scope-end-handle"].setAttribute("aria-valuetext", formatTime(state.scope.end));
  renderActionPreview(model);
}

function initializeVideo() {
  const duration = player.getDuration();

  if (!(duration > 0)) {
    setTimeout(initializeVideo, 180);
    return;
  }

  const requestedStart = clamp(pendingLoad?.startSeconds || 0, 0, duration);

  state.videoLoaded = true;
  state.videoId = pendingLoad.videoId;
  state.duration = duration;
  state.scope = { start: 0, end: duration };
  state.stack = [createRoot(0, requestedStart, duration)];
  state.point = null;
  state.traversal = null;
  state.repeat = null;
  state.playStart = null;
  state.playWidened = false;
  state.lastPassage = null;
  state.availableRates = player.getAvailablePlaybackRates?.() || [1];

  player.pauseVideo();
  player.seekTo(requestedStart, true);

  loadSavedRegions();
  populateSpeedOptions();
  renderSavedRegions();
  setStatus(`Loaded ${formatTime(duration)} video.`);
  updateUI();
}

function cuePendingVideo() {
  if (!state.playerReady || !pendingLoad) return;

  stopTraversal(false);
  stopRepeat();
  finishOrdinaryPlayback(false);
  state.videoLoaded = false;
  state.stack = [];
  state.traversal = null;
  state.repeat = null;
  state.playStart = null;
  state.playWidened = false;
  state.lastPassage = null;
  state.point = null;
  state.savedRegions = [];
  renderSavedRegions();
  updateUI();

  player.cueVideoById({
    videoId: pendingLoad.videoId,
    startSeconds: pendingLoad.startSeconds || 0
  });

  setStatus("Loading YouTube video metadata…");
}

function handlePlayerStateChange(event) {
  state.playerState = event.data;

  if (event.data === 5 && pendingLoad && !state.videoLoaded) {
    initializeVideo();
  }

  if (event.data === 2 && state.videoLoaded && state.traversal && !state.internalPause) {
    stopTraversal(true);
    return;
  }

  if (event.data === 1 && state.videoLoaded && !state.traversal && !state.repeat && state.playStart === null) {
    const current = clamp(safeCurrentTime(), state.scope.start, state.scope.end);
    refactorPassageForCurrent(current);
    state.playStart = current;
    state.playWidened = false;
  }

  if (event.data === 2 && state.videoLoaded && state.repeat) {
    state.repeat = null;
    player.seekTo(currentFrame().C, true);
    setStatus("Repeat stopped.");
  } else if (event.data === 2 && state.videoLoaded && state.playStart !== null) {
    finishOrdinaryPlayback(false);
    setStatus("Paused. Repeat is ready for the passage just played.");
  } else if (event.data === 0 && state.videoLoaded && state.playStart !== null) {
    finishOrdinaryPlayback(false);
  }

  updateUI();
}

function handlePlayerError(event) {
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

function pollPlayer() {
  if (!state.videoLoaded || !player || !state.playerReady) return;

  const now = safeCurrentTime();

  if (state.traversal) {
    const traversal = state.traversal;
    const total = traversal.target - traversal.departure;
    const progress = total > 0
      ? clamp((now - traversal.departure) / total, 0, 1)
      : 1;

    const desired = logSpeed(traversal.maxRate, progress);
    traversal.lastDesiredRate = desired;

    const rate = chooseSupportedRate(state.availableRates, desired);
    if (Math.abs(player.getPlaybackRate() - rate) > 0.001) {
      player.setPlaybackRate(rate);
    }

    if (now >= traversal.target - EPSILON) {
      finishTraversal();
      return;
    }
  } else if (state.repeat) {
    if (now < state.repeat.start - EPSILON || now >= state.repeat.end - EPSILON) {
      player.seekTo(state.repeat.start, true);
      player.setPlaybackRate(1);
      player.playVideo();
    }
  } else if (state.playStart !== null && state.playerState === 1) {
    if (refactorPassageForCurrent(now)) {
      const widened = currentFrame();
      setStatus(
        `Play Widened to ${formatTime(widened.L)}–${formatTime(widened.R)}`
        + ` and kept ${formatTime(widened.C)}.`
      );
    }

    if (now < state.scope.start - EPSILON) {
      player.seekTo(state.scope.start, true);
    } else if (now >= state.scope.end - EPSILON) {
      finishOrdinaryPlayback();
      setStatus("Reached the end of the range.");
    }
  } else if (now < state.scope.start - EPSILON || now > state.scope.end + EPSILON) {
    const clamped = clamp(now, state.scope.start, state.scope.end);
    player.seekTo(clamped, true);
  }

  updateUI();
}

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("player", {
    width: "100%",
    height: "100%",
    playerVars: {
      playsinline: 1,
      controls: 1,
      rel: 0
    },
    events: {
      onReady: () => {
        state.playerReady = true;
        setStatus("YouTube player ready. Paste a link.");
        cuePendingVideo();
      },
      onStateChange: handlePlayerStateChange,
      onPlaybackRateChange: updateUI,
      onAutoplayBlocked: () => {
        setStatus("The browser blocked scripted playback. Press the native YouTube Play button once, then retry.", true);
      },
      onError: handlePlayerError
    }
  });

  pollTimer = window.setInterval(pollPlayer, POLL_MS);
};

const apiScript = document.createElement("script");
apiScript.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(apiScript);

elements["load-video"].addEventListener("click", () => {
  const parsed = parseYouTubeUrl(elements["youtube-url"].value);

  if (!parsed) {
    setStatus("Enter a valid YouTube watch, short, live, embed, or youtu.be link.", true);
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

elements.timeline.addEventListener("click", handleTimelineClick);
elements.timeline.addEventListener("pointermove", updateScopeDrag);
elements.timeline.addEventListener("pointerup", finishScopeDrag);
elements.timeline.addEventListener("pointercancel", finishScopeDrag);

elements["scope-start-handle"].addEventListener("pointerdown", event => beginScopeDrag("start", event));
elements["scope-end-handle"].addEventListener("pointerdown", event => beginScopeDrag("end", event));

for (const [id, kind] of [
  ["scope-start-handle", "start"],
  ["scope-end-handle", "end"]
]) {
  elements[id].addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudgeScopeHandle(kind, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeScopeHandle(kind, 1);
    }
  });
}

elements["set-start"].addEventListener("click", () => {
  const current = safeCurrentTime();
  if (current >= state.scope.end - MIN_SCOPE_SECONDS) {
    setStatus("Move the playhead earlier than the range end.", true);
    return;
  }
  setScope(current, state.scope.end, current, `Range starts at ${formatTime(current)}.`);
});

elements["set-end"].addEventListener("click", () => {
  const current = safeCurrentTime();
  if (current <= state.scope.start + MIN_SCOPE_SECONDS) {
    setStatus("Move the playhead later than the range start.", true);
    return;
  }
  setScope(state.scope.start, current, current, `Range ends at ${formatTime(current)}.`);
});

elements["centre-scope"].addEventListener("click", () => {
  prepareForNavigation();
  const middle = intervalMidpoint(state.scope.start, state.scope.end);
  player.pauseVideo();
  resetRootAt(middle);
  setStatus(`Moved to the middle at ${formatTime(middle)}.`);
});

elements["full-video"].addEventListener("click", () => {
  const middle = intervalMidpoint(0, state.duration);
  setScope(0, state.duration, middle, "Restored the full video and centred the playhead.");
});

elements["go-earlier"].addEventListener("click", () => narrow("earlier"));
elements["go-later"].addEventListener("click", () => narrow("later"));

elements["search-play"].addEventListener("click", () => {
  if (state.traversal) stopTraversal(true);
  else startForwardTraversal();
});

elements["ordinary-play"].addEventListener("click", ordinaryPlayPause);
elements["repeat-passage"].addEventListener("click", startRepeat);
elements["speed-select"].addEventListener("change", updateUI);

elements["undo-move"].addEventListener("click", undoOneLevel);

elements["widen-passage"].addEventListener("click", widenOneLevel);

for (const control of document.querySelectorAll("[data-preview-action]")) {
  const action = control.dataset.previewAction;
  control.addEventListener("pointerenter", () => setPreviewAction(action));
  control.addEventListener("pointerleave", () => setPreviewAction(null));
  control.addEventListener("focus", () => setPreviewAction(action));
  control.addEventListener("blur", () => setPreviewAction(null));
}

elements["save-region"].addEventListener("click", saveCurrentInterval);
elements["region-label"].addEventListener("keydown", event => {
  if (event.key === "Enter") saveCurrentInterval();
});

elements["saved-regions"].addEventListener("click", event => {
  const loadButton = event.target.closest("[data-region-id]");
  const deleteButton = event.target.closest("[data-delete-region-id]");

  if (deleteButton) {
    deleteSavedRegion(deleteButton.dataset.deleteRegionId);
  } else if (loadButton) {
    loadSavedRegion(loadButton.dataset.regionId);
  }
});

document.addEventListener("keydown", event => {
  const tag = document.activeElement?.tagName;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
  if (!state.videoLoaded) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    narrow("earlier");
  } else if (event.key === "ArrowRight" && !event.shiftKey) {
    event.preventDefault();
    narrow("later");
  } else if (event.key === "ArrowRight" && event.shiftKey) {
    event.preventDefault();
    startForwardTraversal();
  } else if (event.key === "Backspace") {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) undoToRoot();
    else if (event.shiftKey) widenOneLevel();
    else undoOneLevel();
  } else if (event.key === "Escape") {
    state.point = null;
    setStatus("Point cleared; automatic destinations restored.");
    updateUI();
  } else if (event.key === " ") {
    event.preventDefault();
    ordinaryPlayPause();
  } else if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    startRepeat();
  }
});

renderSavedRegions();
updateUI();
