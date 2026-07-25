import {
  EPSILON,
  clamp,
  createRoot,
  getTargets,
  descend,
  intervalMidpoint,
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
  direction: "earlier",
  traversal: null,
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

  if (seek && player && state.playerReady) {
    player.seekTo(C, true);
  }

  updateUI();
}

function setScope(start, end, current = null, message = "Scope updated.") {
  if (!state.videoLoaded) return false;

  const A = clamp(start, 0, state.duration);
  const B = clamp(end, 0, state.duration);

  if (!(B - A >= MIN_SCOPE_SECONDS)) {
    setStatus("The scope must have a positive duration.", true);
    return false;
  }

  stopTraversal(false);

  state.scope = { start: A, end: B };
  const C = current === null
    ? clamp(safeCurrentTime(), A, B)
    : clamp(current, A, B);

  state.stack = [createRoot(A, C, B)];
  state.split = null;
  state.splitMode = false;

  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(C, true);

  setStatus(message);
  updateUI();
  return true;
}

function activeTargets() {
  const frame = currentFrame();
  return frame ? getTargets(frame, state.split) : { earlier: null, later: null };
}

function selectedTarget() {
  const targets = activeTargets();
  return state.direction === "earlier" ? targets.earlier : targets.later;
}

function setDirection(direction) {
  state.direction = direction;
  elements["direction-earlier"].classList.toggle("selected", direction === "earlier");
  elements["direction-later"].classList.toggle("selected", direction === "later");
  updateUI();
}

function jumpSelected() {
  if (!state.videoLoaded || state.traversal) return;

  const frame = currentFrame();
  const target = selectedTarget();
  if (target === null) return;

  const child = descend(frame, state.direction, target);
  state.stack.push(child);
  state.split = null;
  state.splitMode = false;

  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(target, true);

  setStatus(`Jumped ${state.direction} to ${formatTime(target)}.`);
  updateUI();
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
      const child = descend(traversal.parent, "later", actual);
      state.stack.push(child);
      player.seekTo(actual, true);
      setStatus(`Forward scan stopped at ${formatTime(actual)}.`);
    } else {
      player.seekTo(traversal.departure, true);
      setStatus("Forward scan stopped before it advanced.");
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

  state.stack.push(descend(traversal.parent, "later", traversal.target));

  queueMicrotask(() => {
    state.internalPause = false;
  });

  setStatus(`Reached ${formatTime(traversal.target)} at normal speed.`);
  updateUI();
}

function startForwardTraversal() {
  if (!state.videoLoaded || state.traversal || state.direction !== "later") return;

  const parent = { ...currentFrame() };
  const target = selectedTarget();
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
  setStatus(`Playing forward to ${formatTime(target)}, fast to normal.`);
  updateUI();
}

function ordinaryPlayPause() {
  if (!state.videoLoaded) return;

  if (state.traversal) {
    stopTraversal(true);
    return;
  }

  if (state.playerState === 1) {
    player.pauseVideo();
  } else {
    state.split = null;
    state.splitMode = false;
    player.setPlaybackRate(1);
    player.playVideo();
  }

  updateUI();
}

function goToDepth(depth) {
  if (!Number.isInteger(depth) || depth < 0 || depth >= state.stack.length || state.traversal) return;

  state.stack = state.stack.slice(0, depth + 1);
  state.split = null;
  state.splitMode = false;

  const frame = currentFrame();
  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(frame.C, true);

  setStatus(`Restored depth ${depth}.`);
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
    if (time <= frame.L + EPSILON || time >= frame.R - EPSILON || Math.abs(time - frame.C) <= EPSILON) {
      setStatus("Place the split inside the current recursive interval and away from the playhead.", true);
      return;
    }

    state.split = time;
    state.splitMode = false;
    setDirection(time < frame.C ? "earlier" : "later");
    setStatus(`Split placed at ${formatTime(time)}.`);
    updateUI();
    return;
  }

  if (time < state.scope.start || time > state.scope.end) {
    setStatus("That position is outside the active scope.", true);
    return;
  }

  player.pauseVideo();
  player.setPlaybackRate(1);
  resetRootAt(time);
  setStatus(`Search origin moved to ${formatTime(time)}.`);
}

function beginScopeDrag(kind, event) {
  if (!state.videoLoaded || state.traversal) return;
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
  updateUI();
}

function finishScopeDrag() {
  if (!state.dragHandle) return;
  state.dragHandle = null;

  const C = clamp(safeCurrentTime(), state.scope.start, state.scope.end);
  player.pauseVideo();
  player.seekTo(C, true);
  state.stack = [createRoot(state.scope.start, C, state.scope.end)];
  setStatus(`Scope set to ${formatTime(state.scope.start)}–${formatTime(state.scope.end)}.`);
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
    setStatus("The browser could not save this region locally.", true);
  }
}

function saveCurrentInterval() {
  if (!state.videoLoaded) return;

  const frame = currentFrame();
  const label = elements["region-label"].value.trim() || `Region ${state.savedRegions.length + 1}`;

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
      ? "No saved regions for this video."
      : "Load a video to see its saved regions.";
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
  const current = state.traversal ? safeCurrentTime() : (loaded ? safeCurrentTime() : 0);
  const depth = Math.max(0, state.stack.length - 1);
  const target = loaded ? selectedTarget() : null;
  const traversalActive = Boolean(state.traversal);

  elements["current-time"].textContent = formatTime(current);
  elements["duration-time"].textContent = formatTime(state.duration);
  elements["current-stat"].textContent = formatTime(current);
  elements["earlier-stat"].textContent = formatTime(targets.earlier);
  elements["later-stat"].textContent = formatTime(targets.later);
  elements["depth-stat"].textContent = String(depth);

  const basicControls = [
    "set-start", "set-end", "centre-scope", "full-video", "place-split",
    "direction-earlier", "direction-later", "ordinary-play", "save-region",
    "speed-select"
  ];

  for (const id of basicControls) {
    elements[id].disabled = !loaded || traversalActive;
  }

  elements["clear-split"].disabled = !loaded || state.split === null || traversalActive;
  elements.jump.disabled = !loaded || traversalActive || target === null;
  elements["search-play"].disabled =
    !loaded || (traversalActive ? false : (state.direction !== "later" || target === null));
  elements["up-level"].disabled = !loaded || traversalActive || depth === 0;
  elements["depth-select"].disabled = !loaded || traversalActive || depth === 0;

  elements["place-split"].classList.toggle("selected", state.splitMode);
  elements["ordinary-play"].textContent = traversalActive
    ? "Stop scan"
    : (state.playerState === 1 ? "Pause" : "Play");

  elements.jump.textContent = state.direction === "earlier" ? "Jump earlier" : "Jump later";
  elements["search-play"].textContent = traversalActive ? "Stop scan" : "Play forward";

  elements["direction-note"].textContent = state.direction === "earlier"
    ? "Earlier traversal is jump-only within the YouTube IFrame API."
    : "Forward playback slows through the rates available for this video until it reaches 1×.";

  populateDepthOptions();

  if (!loaded || !frame) {
    [
      "scope-start-handle", "scope-end-handle", "frame-left-marker",
      "frame-right-marker", "earlier-target-marker", "later-target-marker",
      "current-marker", "split-marker"
    ].forEach(id => elements[id].hidden = true);

    elements["scope-label"].textContent = "Scope —";
    elements["frame-label"].textContent = "Interval —";
    elements["target-label"].textContent = "Target —";
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

  elements["earlier-target-marker"].hidden = targets.earlier === null;
  elements["later-target-marker"].hidden = targets.later === null;
  if (targets.earlier !== null) setMarkerPosition(elements["earlier-target-marker"], targets.earlier);
  if (targets.later !== null) setMarkerPosition(elements["later-target-marker"], targets.later);

  elements["split-marker"].hidden = state.split === null;
  if (state.split !== null) setMarkerPosition(elements["split-marker"], state.split);

  elements["scope-label"].textContent =
    `Scope ${formatTime(state.scope.start)}–${formatTime(state.scope.end)}`;
  elements["frame-label"].textContent =
    `Interval ${formatTime(frame.L)}–${formatTime(frame.R)}`;
  elements["target-label"].textContent =
    `${state.direction === "earlier" ? "Earlier" : "Later"} target ${formatTime(target)}`;

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
  state.direction = "earlier";
    state.availableRates = player.getAvailablePlaybackRates?.() || [1];

  player.pauseVideo();
  player.seekTo(requestedStart, true);

  loadSavedRegions();
  populateSpeedOptions();
  renderSavedRegions();
  setDirection("earlier");
  setStatus(`Loaded ${formatTime(duration)} video.`);
  updateUI();
}

function cuePendingVideo() {
  if (!state.playerReady || !pendingLoad) return;

  state.videoLoaded = false;
  state.stack = [];
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

  if (event.data === 2 && state.videoLoaded && !state.traversal && !state.internalPause) {
    const now = clamp(safeCurrentTime(), state.scope.start, state.scope.end);
    if (Math.abs(now - currentFrame().C) > EPSILON) {
      resetRootAt(now, false);
    }
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
  } else if (state.playerState === 1) {
    if (now < state.scope.start - EPSILON) {
      player.seekTo(state.scope.start, true);
    } else if (now >= state.scope.end - EPSILON) {
      player.seekTo(state.scope.start, true);
      resetRootAt(state.scope.start, false);
    }
  } else if (now < state.scope.start - EPSILON || now > state.scope.end + EPSILON) {
    const clamped = clamp(now, state.scope.start, state.scope.end);
    player.seekTo(clamped, true);
    resetRootAt(clamped, false);
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
    setStatus("Move the playhead earlier than the scope end.", true);
    return;
  }
  setScope(current, state.scope.end, current, `Scope start set to ${formatTime(current)}.`);
});

elements["set-end"].addEventListener("click", () => {
  const current = safeCurrentTime();
  if (current <= state.scope.start + MIN_SCOPE_SECONDS) {
    setStatus("Move the playhead later than the scope start.", true);
    return;
  }
  setScope(state.scope.start, current, current, `Scope end set to ${formatTime(current)}.`);
});

elements["centre-scope"].addEventListener("click", () => {
  const middle = intervalMidpoint(state.scope.start, state.scope.end);
  player.pauseVideo();
  resetRootAt(middle);
  setStatus(`Centred at ${formatTime(middle)}.`);
});

elements["full-video"].addEventListener("click", () => {
  const middle = intervalMidpoint(0, state.duration);
  setScope(0, state.duration, middle, "Restored the full video and centred the playhead.");
});

elements["place-split"].addEventListener("click", () => {
  state.splitMode = !state.splitMode;
  setStatus(
    state.splitMode
      ? "Click inside the current interval to place the next split."
      : "Split placement cancelled."
  );
  updateUI();
});

elements["clear-split"].addEventListener("click", () => {
  state.split = null;
  state.splitMode = false;
  setStatus("Split cleared; automatic midpoint restored.");
  updateUI();
});

elements["direction-earlier"].addEventListener("click", () => setDirection("earlier"));
elements["direction-later"].addEventListener("click", () => setDirection("later"));
elements.jump.addEventListener("click", jumpSelected);

elements["search-play"].addEventListener("click", () => {
  if (state.traversal) stopTraversal(true);
  else startForwardTraversal();
});

elements["ordinary-play"].addEventListener("click", ordinaryPlayPause);

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
    setDirection("earlier");
    jumpSelected();
  } else if (event.key === "ArrowRight" && !event.shiftKey) {
    event.preventDefault();
    setDirection("later");
    jumpSelected();
  } else if (event.key === "ArrowRight" && event.shiftKey) {
    event.preventDefault();
    setDirection("later");
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
    setStatus("Split cancelled.");
    updateUI();
  } else if (event.key === " ") {
    event.preventDefault();
    ordinaryPlayPause();
  }
});

renderSavedRegions();
updateUI();
