import {
  EPSILON,
  clamp,
  createRoot,
  getTargets,
  descend,
  intervalMidpoint,
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
  split: null,
  splitMode: false,
  traversal: null,
  repeat: null,
  playStart: null,
  lastPassage: null,
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
  state.split = null;
  state.splitMode = false;
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
  state.split = null;
  state.splitMode = false;
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
  return frame ? getTargets(frame, state.split, state.scope) : { earlier: null, later: null };
}

function go(direction) {
  if (!state.videoLoaded || state.traversal) return;

  prepareForNavigation();
  const frame = currentFrame();
  const target = activeTargets()[direction];
  if (target === null) return;

  const departure = frame.C;
  const child = descend(frame, direction, target, state.scope);
  state.stack.push(child);
  state.lastPassage = {
    start: Math.min(departure, target),
    end: Math.max(departure, target)
  };
  state.split = null;
  state.splitMode = false;

  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(target, true);

  setStatus(`Moved ${direction === "earlier" ? "back" : "forward"} to ${formatTime(target)}.`);
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

function finishOrdinaryPlayback(pause = true) {
  if (state.playStart === null) return false;

  const start = state.playStart;
  state.playStart = null;
  const frame = currentFrame();
  if (!frame) return false;

  const settled = settlePlayback(frame, start, safeCurrentTime());
  Object.assign(frame, settled);
  const current = frame.C;
  if (state.split !== null && Math.abs(state.split - current) <= EPSILON) {
    state.split = null;
  }
  if (Math.abs(current - start) > EPSILON) {
    state.lastPassage = {
      start: Math.min(start, current),
      end: Math.max(start, current)
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
  state.internalPause = true;
  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(traversal.target, true);

  state.stack.push(descend(traversal.parent, "later", traversal.target, state.scope));
  state.lastPassage = {
    start: traversal.departure,
    end: traversal.target
  };

  queueMicrotask(() => {
    state.internalPause = false;
  });

  setStatus(`Skim reached ${formatTime(traversal.target)} at normal speed.`);
  updateUI();
}

function startForwardTraversal() {
  if (!state.videoLoaded || state.traversal) return;

  stopRepeat(null, true, false);
  finishOrdinaryPlayback(false);
  const parent = { ...currentFrame() };
  const target = activeTargets().later;
  if (target === null || target <= parent.C + EPSILON) return;

  state.split = null;
  state.splitMode = false;

  state.traversal = {
    parent,
    departure: parent.C,
    target,
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
    const frame = currentFrame();
    const current = clamp(safeCurrentTime(), frame.L, frame.R);
    if (Math.abs(current - safeCurrentTime()) > EPSILON) {
      player.seekTo(frame.C, true);
      state.playStart = frame.C;
    } else {
      state.playStart = current;
    }
    player.setPlaybackRate(1);
    player.playVideo();
    setStatus("Playing at 1×.");
  }

  updateUI();
}

function goToDepth(depth) {
  if (!Number.isInteger(depth) || depth < 0 || depth >= state.stack.length || state.traversal) return;

  prepareForNavigation();
  state.stack = state.stack.slice(0, depth + 1);
  state.split = null;
  state.splitMode = false;

  const frame = currentFrame();
  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(frame.C, true);

  setStatus(`Undid movement to level ${depth}.`);
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
  const frame = currentFrame();

  if (state.splitMode) {
    if (
      time <= state.scope.start + EPSILON
      || time >= state.scope.end - EPSILON
      || Math.abs(time - frame.C) <= EPSILON
    ) {
      setStatus("Place the split inside the range and away from the current point.", true);
      return;
    }

    state.split = time;
    state.splitMode = false;
    setStatus(`Split placed at ${formatTime(time)}.`);
    updateUI();
    return;
  }

  if (time < state.scope.start || time > state.scope.end) {
      setStatus("That position is outside the range.", true);
    return;
  }

  prepareForNavigation();
  const active = currentFrame();
  if (Math.abs(time - active.C) <= EPSILON) {
    player.seekTo(active.C, true);
    return;
  }

  const direction = time < active.C ? "earlier" : "later";
  state.stack.push(descend(active, direction, time, state.scope));
  state.lastPassage = {
    start: Math.min(active.C, time),
    end: Math.max(active.C, time)
  };
  state.split = null;
  state.splitMode = false;
  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(time, true);
  setStatus(`Moved directly to ${formatTime(time)}.`);
  updateUI();
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
  state.split = null;
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

function populateDepthOptions() {
  const depth = state.stack.length - 1;
  elements["depth-select"].replaceChildren();

  state.stack.forEach((_, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = String(index);
    elements["depth-select"].appendChild(option);
  });

  elements["depth-select"].value = String(Math.max(0, depth));
}

function updateUI() {
  const loaded = state.videoLoaded;
  const frame = currentFrame();
  const targets = frame ? activeTargets() : { earlier: null, later: null };
  const current = loaded ? safeCurrentTime() : 0;
  const depth = Math.max(0, state.stack.length - 1);
  const traversalActive = Boolean(state.traversal);
  const repeatActive = Boolean(state.repeat);

  elements["current-time"].textContent = formatTime(current);
  elements["duration-time"].textContent = formatTime(state.duration);
  elements["current-stat"].textContent = formatTime(current);
  elements["earlier-stat"].textContent = formatTime(targets.earlier);
  elements["later-stat"].textContent = formatTime(targets.later);
  elements["depth-stat"].textContent = String(depth);

  const basicControls = [
    "set-start", "set-end", "centre-scope", "full-video", "place-split",
    "ordinary-play", "save-region", "speed-select"
  ];

  for (const id of basicControls) {
    elements[id].disabled = !loaded || traversalActive;
  }

  elements["clear-split"].disabled = !loaded || state.split === null || traversalActive;
  elements["go-earlier"].disabled = !loaded || traversalActive || targets.earlier === null;
  elements["go-later"].disabled = !loaded || traversalActive || targets.later === null;
  elements["repeat-passage"].disabled = !loaded || traversalActive || !state.lastPassage;
  elements["search-play"].disabled = !loaded || (traversalActive ? false : targets.later === null);
  elements["up-level"].disabled = !loaded || traversalActive || depth === 0;
  elements["depth-select"].disabled = !loaded || traversalActive || depth === 0;

  elements["place-split"].classList.toggle("selected", state.splitMode);
  elements["ordinary-play"].textContent =
    state.playStart !== null && !traversalActive && !repeatActive ? "Pause" : "Play 1×";
  elements["search-play"].textContent = traversalActive ? "Stop skimming" : "Skim →";
  elements["repeat-passage"].textContent =
    repeatActive ? "Stop repeating" : "Repeat last passage";

  populateDepthOptions();

  if (!loaded || !frame) {
    [
      "scope-start-handle", "scope-end-handle", "frame-left-marker",
      "frame-right-marker", "earlier-target-marker", "later-target-marker",
      "current-marker", "split-marker"
    ].forEach(id => elements[id].hidden = true);

    elements["scope-label"].textContent = "Range —";
    elements["frame-label"].textContent = "Passage —";
    elements["target-label"].textContent = "Back — · Forward —";
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

  const customEarlier = state.split !== null && state.split < frame.C;
  const customLater = state.split !== null && state.split > frame.C;
  elements["earlier-target-marker"].hidden = targets.earlier === null || customEarlier;
  elements["later-target-marker"].hidden = targets.later === null || customLater;
  if (targets.earlier !== null) setMarkerPosition(elements["earlier-target-marker"], targets.earlier);
  if (targets.later !== null) setMarkerPosition(elements["later-target-marker"], targets.later);

  elements["split-marker"].hidden = state.split === null;
  if (state.split !== null) setMarkerPosition(elements["split-marker"], state.split);

  elements["scope-label"].textContent =
    `Range ${formatTime(state.scope.start)}–${formatTime(state.scope.end)}`;
  elements["frame-label"].textContent =
    `Passage ${formatTime(frame.L)}–${formatTime(frame.R)}`;
  elements["target-label"].textContent =
    `Back ${formatTime(targets.earlier)} · Forward ${formatTime(targets.later)}`;

  elements["scope-start-handle"].setAttribute("aria-valuenow", String(state.scope.start));
  elements["scope-end-handle"].setAttribute("aria-valuenow", String(state.scope.end));
  elements["scope-start-handle"].setAttribute("aria-valuemax", String(state.duration));
  elements["scope-end-handle"].setAttribute("aria-valuemax", String(state.duration));
  elements["scope-start-handle"].setAttribute("aria-valuetext", formatTime(state.scope.start));
  elements["scope-end-handle"].setAttribute("aria-valuetext", formatTime(state.scope.end));
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
  state.split = null;
  state.splitMode = false;
  state.traversal = null;
  state.repeat = null;
  state.playStart = null;
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
  state.lastPassage = null;
  state.split = null;
  state.splitMode = false;
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
    const frame = currentFrame();
    const current = safeCurrentTime();
    if (current < frame.L - EPSILON || current > frame.R + EPSILON) {
      player.seekTo(frame.C, true);
      state.playStart = frame.C;
    } else {
      state.playStart = current;
    }
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
    const frame = currentFrame();
    if (now < frame.L - EPSILON) {
      player.seekTo(frame.L, true);
    } else if (now >= frame.R - EPSILON) {
      finishOrdinaryPlayback();
      setStatus("Reached the end of the current passage.");
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

elements["place-split"].addEventListener("click", () => {
  prepareForNavigation();
  state.splitMode = !state.splitMode;
  setStatus(
    state.splitMode
      ? "Click anywhere inside the range to place the next split."
      : "Split placement cancelled."
  );
  updateUI();
});

elements["clear-split"].addEventListener("click", () => {
  prepareForNavigation();
  state.split = null;
  state.splitMode = false;
  setStatus("Split cleared; automatic points restored.");
  updateUI();
});

elements["go-earlier"].addEventListener("click", () => go("earlier"));
elements["go-later"].addEventListener("click", () => go("later"));

elements["search-play"].addEventListener("click", () => {
  if (state.traversal) stopTraversal(true);
  else startForwardTraversal();
});

elements["ordinary-play"].addEventListener("click", ordinaryPlayPause);
elements["repeat-passage"].addEventListener("click", startRepeat);

elements["up-level"].addEventListener("click", () => {
  const depth = state.stack.length - 1;
  if (depth > 0) goToDepth(depth - 1);
});

elements["depth-select"].addEventListener("change", () => {
  goToDepth(Number(elements["depth-select"].value));
});

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
    go("earlier");
  } else if (event.key === "ArrowRight" && !event.shiftKey) {
    event.preventDefault();
    go("later");
  } else if (event.key === "ArrowRight" && event.shiftKey) {
    event.preventDefault();
    startForwardTraversal();
  } else if (event.key === "Backspace") {
    event.preventDefault();
    const depth = state.stack.length - 1;
    if (event.shiftKey) goToDepth(0);
    else if (depth > 0) goToDepth(depth - 1);
  } else if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    elements["place-split"].click();
  } else if (event.key === "Escape") {
    state.split = null;
    state.splitMode = false;
    setStatus("Split cleared.");
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
