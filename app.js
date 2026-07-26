import {
  EPSILON,
  clamp,
  createRoot,
  getTargets,
  descend,
  spanMidpoint,
  widenToRange,
  canWiden,
  pointAfterUndo,
  stepTarget,
  stepFrame,
  bindPassageStart,
  bindPassageEnd,
  getActionRanges,
  settlePlayback,
  logSpeed,
  chooseSupportedRate
} from "./traversal.js";
import {
  createStructure,
  createOrReuseMark,
  renameMark,
  deleteMarkSafely,
  getMark,
  createSpan,
  renameSpan,
  setSpanAnchor,
  deleteSpan,
  resolveSpan,
  previousMark,
  nextMark,
  spansForMark,
  sortedResolvedSpans,
  createSpanFromTimes,
  migrateSavedRegions,
  validateStructure
} from "./structure.js";
import { parseYouTubeUrl } from "./youtube.js";

const STORAGE_V2_PREFIX = "binary-youtube-reader:v2:";
const STORAGE_V1_PREFIX = "binary-youtube-reader:v1:";
const POLL_MS = 100;
const MIN_RANGE_SECONDS = 0.25;
const STEP_DEBOUNCE_MS = 120;
const STEP_PRESETS = [0.25, 0.5, 1, 2, 3, 5, 10, 15, 30, 60, 120, 300];

const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map(node => [node.id, node])
);

const state = {
  playerReady: false,
  videoLoaded: false,
  videoId: null,
  duration: 0,
  range: { start: 0, end: 0, sourceSpanId: null },
  stack: [],
  contextStack: [],
  point: null,
  skimSession: null,
  repeatSession: null,
  playbackStart: null,
  playWidened: false,
  lastTraversal: null,
  previewAction: null,
  availableRates: [1],
  structure: createStructure(),
  selectedMarkId: null,
  selectedSpanId: null,
  draftStartMarkId: null,
  draftEndMarkId: null,
  structuralHistory: [],
  stepSeconds: 10,
  pendingStep: null,
  dragHandle: null,
  rangeDragOrigin: null,
  playerState: -1,
  internalPause: false,
  renderedMarkKey: ""
};

let player = null;
let pendingLoad = null;
let pollTimer = null;

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function currentFrame() {
  return state.stack.at(-1) || null;
}

function parentFrame() {
  return state.stack.length > 1 ? state.stack.at(-2) : null;
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

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, seconds);
  if (rounded < 1) return `${rounded.toFixed(2)}s`;
  if (rounded < 10 && !Number.isInteger(rounded)) return `${rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}s`;
  return `${Number(rounded.toFixed(2))}s`;
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

function lastTraversalVerb(last = state.lastTraversal) {
  if (!last) return "Last —";
  const verbs = {
    narrowEarlier: "Narrowed Earlier",
    narrowLater: "Narrowed Later",
    previousMark: "Previous Mark",
    nextMark: "Next Mark",
    go: "Went",
    stepEarlier: "Stepped Earlier",
    stepLater: "Stepped Later",
    skim: "Skimmed",
    play: "Played"
  };
  const medium = last.medium === "playback" ? "played" : "jumped";
  return `${verbs[last.operator] || "Traversed"} ${formatRange(last)} · ${medium}`;
}

function activeTargets(frame = currentFrame()) {
  return frame ? getTargets(frame, state.point, state.range) : { earlier: null, later: null };
}

function captureContext() {
  return {
    range: clone(state.range),
    stack: clone(state.stack),
    point: state.point,
    lastTraversal: clone(state.lastTraversal),
    selectedMarkId: state.selectedMarkId,
    selectedSpanId: state.selectedSpanId
  };
}

function restoreContext(snapshot) {
  state.range = clone(snapshot.range);
  state.stack = clone(snapshot.stack);
  state.point = snapshot.point;
  state.lastTraversal = clone(snapshot.lastTraversal);
  state.selectedMarkId = snapshot.selectedMarkId || null;
  state.selectedSpanId = snapshot.selectedSpanId || null;
  state.draftStartMarkId = null;
  state.draftEndMarkId = null;
}

function rangeStorageKey(prefix = STORAGE_V2_PREFIX) {
  return `${prefix}${state.videoId}`;
}

function persistStructure() {
  if (!state.videoId) return;
  state.structure.videoId = state.videoId;
  state.structure.updatedAt = Date.now();
  try {
    localStorage.setItem(rangeStorageKey(), JSON.stringify(state.structure));
  } catch (error) {
    console.warn("Could not save Structure:", error);
    setStatus("The browser could not save this Structure locally.", true);
  }
}

function normalizeStructure(parsed) {
  const structure = createStructure(state.videoId);
  structure.marks = parsed.marks.map(mark => ({
    ...mark,
    videoId: state.videoId,
    label: String(mark.label || ""),
    note: String(mark.note || ""),
    createdAt: Number(mark.createdAt) || Date.now(),
    updatedAt: Number(mark.updatedAt) || Number(mark.createdAt) || Date.now()
  }));
  structure.spans = parsed.spans.map(span => ({
    ...span,
    videoId: state.videoId,
    label: String(span.label || ""),
    summary: String(span.summary || ""),
    anchorMarkId: span.anchorMarkId || null,
    createdAt: Number(span.createdAt) || Date.now(),
    updatedAt: Number(span.updatedAt) || Number(span.createdAt) || Date.now()
  }));
  return structure;
}

function loadStructure() {
  state.structure = createStructure(state.videoId);
  if (!state.videoId) return;

  try {
    const rawV2 = localStorage.getItem(rangeStorageKey());
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      const normalized = normalizeStructure(parsed);
      if (validateStructure(normalized, state.duration)) {
        state.structure = normalized;
        return;
      }
    }

    const rawV1 = localStorage.getItem(rangeStorageKey(STORAGE_V1_PREFIX));
    if (rawV1) {
      const records = JSON.parse(rawV1);
      state.structure = migrateSavedRegions(records, state.videoId);
      persistStructure();
    }
  } catch (error) {
    console.warn("Could not load Structure:", error);
    state.structure = createStructure(state.videoId);
  }
}

function pushStructuralSnapshot() {
  state.structuralHistory.push({
    structure: clone(state.structure),
    selectedMarkId: state.selectedMarkId,
    selectedSpanId: state.selectedSpanId,
    draftStartMarkId: state.draftStartMarkId,
    draftEndMarkId: state.draftEndMarkId
  });
  if (state.structuralHistory.length > 50) state.structuralHistory.shift();
}

function mutateStructure(mutator, successMessage) {
  pushStructuralSnapshot();
  try {
    const result = mutator();
    persistStructure();
    renderStructure();
    updateUI();
    if (successMessage) setStatus(typeof successMessage === "function" ? successMessage(result) : successMessage);
    return result;
  } catch (error) {
    const snapshot = state.structuralHistory.pop();
    if (snapshot) {
      state.structure = snapshot.structure;
      state.selectedMarkId = snapshot.selectedMarkId;
      state.selectedSpanId = snapshot.selectedSpanId;
      state.draftStartMarkId = snapshot.draftStartMarkId;
      state.draftEndMarkId = snapshot.draftEndMarkId;
    }
    setStatus(error.message || "Structure could not be updated.", true);
    return null;
  }
}

function undoStructuralEdit() {
  const snapshot = state.structuralHistory.pop();
  if (!snapshot) return;
  state.structure = snapshot.structure;
  state.selectedMarkId = snapshot.selectedMarkId;
  state.selectedSpanId = snapshot.selectedSpanId;
  state.draftStartMarkId = snapshot.draftStartMarkId;
  state.draftEndMarkId = snapshot.draftEndMarkId;
  persistStructure();
  renderStructure();
  updateUI();
  setStatus("Undid the last structural edit.");
}

function flushPendingStep(seek = true) {
  if (!state.pendingStep) return;
  clearTimeout(state.pendingStep.timer);
  const destination = currentFrame()?.C;
  state.pendingStep = null;
  if (seek && Number.isFinite(destination) && player && state.playerReady) {
    player.pauseVideo();
    player.setPlaybackRate(1);
    player.seekTo(destination, true);
  }
}

function stopRepeat(message = null, returnToCurrent = true) {
  if (!state.repeatSession) return;
  state.repeatSession = null;
  player.pauseVideo();
  player.setPlaybackRate(1);
  if (returnToCurrent && currentFrame()) player.seekTo(currentFrame().C, true);
  if (message) setStatus(message);
}

function stopSkim(record = true) {
  const skim = state.skimSession;
  if (!skim) return;
  state.skimSession = null;
  player.pauseVideo();
  player.setPlaybackRate(1);
  const current = clamp(safeCurrentTime(), state.range.start, state.range.end);
  if (record && current > skim.departure + EPSILON) {
    const frame = current <= skim.parent.R + EPSILON
      ? settlePlayback(skim.parent, skim.departure, current)
      : widenToRange(current, state.range);
    state.stack.push(frame);
    state.lastTraversal = makeLastTraversal(skim.departure, current, "skim", "playback", "later");
    setStatus(`Stopped Skim at ${formatTime(current)}.`);
  }
  updateUI();
}

function finishPlayback(record = true) {
  const session = state.playbackStart;
  if (!session) return;
  const current = clamp(safeCurrentTime(), state.range.start, state.range.end);
  state.playbackStart = null;
  player.pauseVideo();
  player.setPlaybackRate(1);

  if (record && Math.abs(current - session.departure) > EPSILON) {
    const frame = state.playWidened
      ? widenToRange(current, state.range)
      : settlePlayback(session.parentFrame, session.departure, current);
    state.stack.push(frame);
    state.lastTraversal = makeLastTraversal(session.departure, current, "play", "playback");
  }
  state.playWidened = false;
  updateUI();
}

function settleBeforeNavigation() {
  flushPendingStep();
  if (state.skimSession) stopSkim(true);
  if (state.repeatSession) stopRepeat(null, true);
  if (state.playbackStart) finishPlayback(true);
}

function seekToFrame(frame = currentFrame()) {
  if (!frame || !player) return;
  player.pauseVideo();
  player.setPlaybackRate(1);
  player.seekTo(frame.C, true);
}

function narrow(direction, source = "narrow") {
  if (!state.videoLoaded || state.skimSession) return;
  settleBeforeNavigation();
  const parent = currentFrame();
  const target = activeTargets(parent)[direction];
  if (!parent || target === null) return;

  const child = descend(parent, direction, target, state.range);
  const consumedPoint = Number.isFinite(state.point) && Math.abs(target - state.point) <= EPSILON;
  if (consumedPoint) child.returnPoint = state.point;
  state.stack.push(child);
  state.lastTraversal = makeLastTraversal(
    parent.C,
    target,
    source === "previousMark" ? "previousMark" : source === "nextMark" ? "nextMark" : source === "go" ? "go" : `narrow${direction[0].toUpperCase()}${direction.slice(1)}`,
    "seek",
    direction
  );
  if (consumedPoint) state.point = null;
  seekToFrame(child);
  setStatus(`${source === "previousMark" ? "Moved to Previous Mark" : source === "nextMark" ? "Moved to Next Mark" : source === "go" ? "Went" : `Narrowed ${direction === "earlier" ? "Earlier" : "Later"}`} to ${formatTime(target)}.`);
  updateUI();
}

function widenFully() {
  if (!state.videoLoaded || state.skimSession) return;
  settleBeforeNavigation();
  const frame = currentFrame();
  if (!frame || !canWiden(frame, state.range)) return;
  const widened = widenToRange(frame.C, state.range);
  state.stack.push(widened);
  seekToFrame(widened);
  setStatus(`Widened to ${formatRange(state.range)} and kept Current at ${formatTime(widened.C)}.`);
  updateUI();
}

function undoOne() {
  if (!state.videoLoaded) return;
  settleBeforeNavigation();
  if (state.stack.length < 2) return;
  const depth = state.stack.length - 2;
  state.point = pointAfterUndo(state.stack, depth, state.point);
  state.stack = state.stack.slice(0, depth + 1);
  seekToFrame();
  setStatus(`Undid to ${formatTime(currentFrame().C)} in Passage ${formatTime(currentFrame().L)}–${formatTime(currentFrame().R)}.`);
  updateUI();
}

function restoreContextRoot() {
  if (state.stack.length < 2) return;
  settleBeforeNavigation();
  state.point = pointAfterUndo(state.stack, 0, state.point);
  state.stack = [state.stack[0]];
  seekToFrame();
  setStatus("Restored the root state of the active Context.");
  updateUI();
}

function performStep(direction) {
  if (!state.videoLoaded) return;
  if (!state.pendingStep) settleBeforeNavigation();
  const frame = currentFrame();
  if (!frame) return;
  const target = stepTarget(frame.C, state.stepSeconds, direction, state.range);
  if (Math.abs(target - frame.C) <= EPSILON) return;

  if (!state.pendingStep) {
    state.pendingStep = { departure: frame.C, timer: null };
    state.stack.push(stepFrame(frame, target, state.range));
  } else {
    state.stack[state.stack.length - 1] = stepFrame(frame, target, state.range);
  }

  if (Number.isFinite(state.point) && Math.abs(target - state.point) <= EPSILON) state.point = null;
  state.lastTraversal = makeLastTraversal(
    state.pendingStep.departure,
    target,
    direction === "earlier" ? "stepEarlier" : "stepLater",
    "seek",
    direction
  );
  clearTimeout(state.pendingStep.timer);
  state.pendingStep.timer = setTimeout(() => {
    flushPendingStep(true);
    setStatus(`Stepped ${direction === "earlier" ? "Earlier" : "Later"} to ${formatTime(currentFrame().C)}.`);
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
  settleBeforeNavigation();
  const parent = { ...currentFrame() };
  const target = activeTargets(parent).later;
  if (target === null || target <= parent.C + EPSILON) return;
  const maxRate = Number(elements["speed-select"].value || 1);
  state.skimSession = {
    parent,
    departure: parent.C,
    target,
    point: Number.isFinite(state.point) && Math.abs(target - state.point) <= EPSILON ? state.point : null,
    maxRate,
    lastDesiredRate: maxRate
  };
  player.seekTo(parent.C, true);
  player.playVideo();
  setStatus(`Skimming to ${formatTime(target)}, fast to normal.`);
  updateUI();
}

function finishSkimDestination() {
  const skim = state.skimSession;
  if (!skim) return;
  state.skimSession = null;
  player.setPlaybackRate(1);
  const child = descend(skim.parent, "later", skim.target, state.range);
  if (Number.isFinite(skim.point)) {
    child.returnPoint = skim.point;
    state.point = null;
  }
  state.stack.push(child);
  state.lastTraversal = makeLastTraversal(skim.departure, skim.target, "skim", "playback", "later");
  state.playbackStart = { departure: skim.departure, parentFrame: child };
  state.playWidened = false;
  setStatus(`Skim reached ${formatTime(skim.target)}. Continuing at 1×.`);
  updateUI();
}

function ordinaryPlayPause() {
  if (!state.videoLoaded) return;
  flushPendingStep();
  if (state.skimSession) {
    stopSkim(true);
    return;
  }
  if (state.repeatSession) {
    stopRepeat("Repeat stopped.", true);
    updateUI();
    return;
  }
  if (state.playbackStart) {
    finishPlayback(true);
    setStatus("Paused. Repeat is ready for Last Traversal.");
    return;
  }

  const frame = currentFrame();
  const current = clamp(safeCurrentTime(), state.range.start, state.range.end);
  state.playbackStart = { departure: current, parentFrame: { ...frame, C: current } };
  state.playWidened = false;
  player.setPlaybackRate(1);
  player.playVideo();
  setStatus("Playing at 1×. Crossing a Passage edge will Widen.");
  updateUI();
}

function startRepeatLast() {
  if (!state.lastTraversal) return;
  startLoop({
    start: state.lastTraversal.start,
    end: state.lastTraversal.end,
    label: lastTraversalVerb().replace(/^Last\s*/, "")
  });
}

function startLoop(span) {
  if (!state.videoLoaded || !(span.end > span.start + EPSILON)) return;
  settleBeforeNavigation();
  state.repeatSession = {
    start: span.start,
    end: span.end,
    returnCurrent: currentFrame().C,
    label: span.label || "Span"
  };
  player.seekTo(span.start, true);
  player.setPlaybackRate(1);
  player.playVideo();
  setStatus(`Looping ${span.label || formatRange(span)}.`);
  updateUI();
}

function setPreviewAction(action) {
  state.previewAction = action;
  updateUI();
}

function pushContextAndSetRange(start, end, current, sourceSpanId = null, message = "Entered Range.") {
  if (!(end - start >= MIN_RANGE_SECONDS)) {
    setStatus("The Range must have positive duration.", true);
    return false;
  }
  settleBeforeNavigation();
  state.contextStack.push(captureContext());
  state.range = { start, end, sourceSpanId };
  state.stack = [createRoot(start, clamp(current, start, end), end)];
  state.point = null;
  state.lastTraversal = null;
  seekToFrame();
  setStatus(message);
  updateUI();
  return true;
}

function exitContext() {
  if (!state.contextStack.length) return;
  settleBeforeNavigation();
  const snapshot = state.contextStack.pop();
  restoreContext(snapshot);
  seekToFrame();
  setStatus(`Exited to ${currentContextName()}.`);
  renderStructure();
  updateUI();
}

function currentContextName() {
  if (!state.range.sourceSpanId) return state.contextStack.length ? "parent Range" : "Full video";
  return resolveSpan(state.structure, state.range.sourceSpanId)?.label || "Saved Span";
}

function findContainingRangeForAddress(address) {
  if (address >= state.range.start - EPSILON && address <= state.range.end + EPSILON) return state.range;
  for (let index = state.contextStack.length - 1; index >= 0; index -= 1) {
    const range = state.contextStack[index].range;
    if (address >= range.start - EPSILON && address <= range.end + EPSILON) return range;
  }
  return { start: 0, end: state.duration, sourceSpanId: null };
}

function targetMark(mark) {
  if (!mark) return;
  if (mark.t < state.range.start - EPSILON || mark.t > state.range.end + EPSILON) {
    setStatus("That Mark is outside the active Range. Use Go to make a reversible Context excursion.", true);
    return;
  }
  if (Math.abs(mark.t - currentFrame().C) <= EPSILON) {
    setStatus(`Already at “${mark.label || formatTime(mark.t)}”.`);
    return;
  }
  state.point = mark.t;
  setStatus(`Targeted “${mark.label || formatTime(mark.t)}” as Point.`);
  updateUI();
}

function goToMark(mark) {
  if (!mark) return;
  settleBeforeNavigation();
  if (mark.t < state.range.start - EPSILON || mark.t > state.range.end + EPSILON) {
    const containing = findContainingRangeForAddress(mark.t);
    state.contextStack.push(captureContext());
    const current = clamp(currentFrame().C, containing.start, containing.end);
    state.range = { ...containing };
    state.stack = [createRoot(containing.start, current, containing.end)];
    state.point = null;
    state.lastTraversal = null;
  }
  state.point = mark.t;
  const direction = mark.t < currentFrame().C ? "earlier" : "later";
  narrow(direction, "go");
}

function goToAdjacentMark(direction) {
  const frame = currentFrame();
  const mark = direction === "earlier"
    ? previousMark(state.structure, frame.C, state.range)
    : nextMark(state.structure, frame.C, state.range);
  if (!mark) return;
  state.selectedMarkId = mark.id;
  state.selectedSpanId = null;
  state.point = mark.t;
  narrow(direction, direction === "earlier" ? "previousMark" : "nextMark");
  renderStructure();
}

function addressFromSource(source = elements["address-source"].value) {
  const frame = currentFrame();
  const targets = activeTargets(frame);
  const values = {
    current: frame?.C,
    point: state.point,
    earlier: targets.earlier,
    later: targets.later,
    passageStart: frame?.L,
    passageEnd: frame?.R,
    rangeStart: state.range.start,
    rangeEnd: state.range.end,
    lastStart: state.lastTraversal?.start,
    lastEnd: state.lastTraversal?.end
  };
  return Number.isFinite(values[source]) ? values[source] : null;
}

function createMarkFromSource(source = elements["address-source"].value, label = elements["mark-label"].value) {
  const address = addressFromSource(source);
  if (!Number.isFinite(address)) {
    setStatus("That Address is not currently available.", true);
    return;
  }
  const result = mutateStructure(
    () => createOrReuseMark(state.structure, address, { label, provenance: source }),
    ({ mark, created }) => `${created ? "Created" : "Selected"} Mark “${mark.label || formatTime(mark.t)}” at ${formatTime(mark.t)}.`
  );
  if (result) {
    state.selectedMarkId = result.mark.id;
    elements["mark-label"].value = "";
    renderStructure();
  }
}

function createSavedSpanFromTimes(start, end, provenance) {
  const label = elements["span-label"].value.trim() || `Span ${state.structure.spans.length + 1}`;
  const span = mutateStructure(
    () => createSpanFromTimes(state.structure, start, end, { label, provenance }),
    `Saved Span “${label}”.`
  );
  if (span) {
    state.selectedSpanId = span.id;
    state.selectedMarkId = null;
    elements["span-label"].value = "";
    renderStructure();
  }
}

function savePassage() {
  const frame = currentFrame();
  if (frame) createSavedSpanFromTimes(frame.L, frame.R, "passage");
}

function saveLastTraversal() {
  if (state.lastTraversal) createSavedSpanFromTimes(state.lastTraversal.start, state.lastTraversal.end, `last:${state.lastTraversal.operator}`);
}

function saveRange() {
  createSavedSpanFromTimes(state.range.start, state.range.end, "range");
}

function saveDraftSpan() {
  if (!state.draftStartMarkId || !state.draftEndMarkId) return;
  const label = elements["span-label"].value.trim() || `Span ${state.structure.spans.length + 1}`;
  const span = mutateStructure(
    () => createSpan(state.structure, state.draftStartMarkId, state.draftEndMarkId, { label, provenance: "paired-marks" }),
    `Saved Span “${label}”.`
  );
  if (span) {
    state.selectedSpanId = span.id;
    state.selectedMarkId = null;
    state.draftStartMarkId = null;
    state.draftEndMarkId = null;
    elements["span-label"].value = "";
    renderStructure();
  }
}

function enterSpan(spanId, here = false) {
  const span = resolveSpan(state.structure, spanId);
  if (!span) return;
  const current = here && currentFrame().C >= span.start - EPSILON && currentFrame().C <= span.end + EPSILON
    ? currentFrame().C
    : span.anchor ?? span.midpoint;
  pushContextAndSetRange(span.start, span.end, current, span.id, `Entered “${span.label || "Span"}” as Range.`);
}

function focusSpan(spanId) {
  const span = resolveSpan(state.structure, spanId);
  if (!span || span.start < state.range.start - EPSILON || span.end > state.range.end + EPSILON) return;
  settleBeforeNavigation();
  const current = currentFrame().C >= span.start - EPSILON && currentFrame().C <= span.end + EPSILON
    ? currentFrame().C
    : span.anchor ?? span.midpoint;
  state.stack.push(createRoot(span.start, current, span.end, currentFrame().level));
  seekToFrame();
  setStatus(`Focused “${span.label || "Span"}” as Passage.`);
  updateUI();
}

function assignSelectedMarkRole(role) {
  const mark = getMark(state.structure, state.selectedMarkId);
  if (!mark) return;
  const frame = currentFrame();

  if (role === "go") return goToMark(mark);
  if (role === "target") return targetMark(mark);
  if (role === "passageStart") {
    settleBeforeNavigation();
    try {
      state.stack.push(bindPassageStart(frame, mark.t));
      seekToFrame();
      setStatus(`Set Passage Start to “${mark.label || formatTime(mark.t)}”.`);
    } catch (error) { setStatus(error.message, true); }
  } else if (role === "passageEnd") {
    settleBeforeNavigation();
    try {
      state.stack.push(bindPassageEnd(frame, mark.t));
      seekToFrame();
      setStatus(`Set Passage End to “${mark.label || formatTime(mark.t)}”.`);
    } catch (error) { setStatus(error.message, true); }
  } else if (role === "rangeStart") {
    if (mark.t < state.range.end - MIN_RANGE_SECONDS) {
      pushContextAndSetRange(mark.t, state.range.end, clamp(frame.C, mark.t, state.range.end), null, `Set Range Start to “${mark.label || formatTime(mark.t)}”.`);
    }
  } else if (role === "rangeEnd") {
    if (mark.t > state.range.start + MIN_RANGE_SECONDS) {
      pushContextAndSetRange(state.range.start, mark.t, clamp(frame.C, state.range.start, mark.t), null, `Set Range End to “${mark.label || formatTime(mark.t)}”.`);
    }
  } else if (role === "draftStart") {
    state.draftStartMarkId = mark.id;
    setStatus(`Assigned “${mark.label || formatTime(mark.t)}” as Span Start.`);
  } else if (role === "draftEnd") {
    state.draftEndMarkId = mark.id;
    setStatus(`Assigned “${mark.label || formatTime(mark.t)}” as Span End.`);
  } else if (role === "anchor") {
    if (!state.selectedSpanId) return;
    mutateStructure(() => setSpanAnchor(state.structure, state.selectedSpanId, mark.id), "Assigned Span Anchor.");
  }
  renderStructure();
  updateUI();
}

function assignSelectedSpanRole(role) {
  const span = resolveSpan(state.structure, state.selectedSpanId);
  if (!span) return;
  if (role === "enter") enterSpan(span.id, false);
  else if (role === "enterHere") enterSpan(span.id, true);
  else if (role === "focus") focusSpan(span.id);
  else if (role === "loop") startLoop(span);
  else if (role === "targetStart") { state.point = span.start; updateUI(); setStatus(`Targeted Start of “${span.label || "Span"}”.`); }
  else if (role === "targetEnd") { state.point = span.end; updateUI(); setStatus(`Targeted End of “${span.label || "Span"}”.`); }
  else if (role === "targetAnchor") { state.point = span.anchor ?? span.midpoint; updateUI(); setStatus(`Targeted ${span.anchor ? "Anchor" : "Midpoint"} of “${span.label || "Span"}”.`); }
}

function renderTimelineMarks() {
  const key = `${state.range.start}|${state.range.end}|${state.selectedMarkId || ""}|${state.structure.marks.map(mark => `${mark.id}:${mark.t}`).join(",")}`;
  if (key === state.renderedMarkKey) return;
  state.renderedMarkKey = key;
  elements["mark-lane"].replaceChildren();
  for (const mark of state.structure.marks) {
    if (mark.t < state.range.start - EPSILON || mark.t > state.range.end + EPSILON) continue;
    const button = document.createElement("button");
    button.className = "timeline-mark";
    if (mark.id === state.selectedMarkId) button.classList.add("selected");
    button.type = "button";
    button.dataset.markId = mark.id;
    button.style.left = `${percent(mark.t)}%`;
    const description = `${mark.label || "Unnamed Mark"} at ${formatTime(mark.t)}`;
    button.setAttribute("aria-label", description);
    button.title = description;
    elements["mark-lane"].appendChild(button);
  }
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

function roleButton(label, role, enabled = true) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.role = role;
  button.disabled = !enabled;
  return button;
}

function renderSelectionInspector() {
  const mark = getMark(state.structure, state.selectedMarkId);
  const span = resolveSpan(state.structure, state.selectedSpanId);
  const inspector = elements["selection-inspector"];
  inspector.hidden = !mark && !span;
  if (!mark && !span) return;

  elements["selection-roles"].replaceChildren();
  elements["selection-relations"].replaceChildren();
  if (mark) {
    elements["selection-summary"].innerHTML = `<div class="selection-title">${escapeHtml(mark.label || "Unnamed Mark")}</div><div class="selection-time">${formatTime(mark.t)}</div>`;
    elements["selection-label"].value = mark.label || "";
    const frame = currentFrame();
    const insideRange = mark.t >= state.range.start - EPSILON && mark.t <= state.range.end + EPSILON;
    elements["selection-roles"].append(
      roleButton("Go", "go", Math.abs(mark.t - frame.C) > EPSILON),
      roleButton("Target", "target", insideRange && Math.abs(mark.t - frame.C) > EPSILON),
      roleButton("Passage Start", "passageStart", mark.t < frame.C - EPSILON),
      roleButton("Passage End", "passageEnd", mark.t > frame.C + EPSILON),
      roleButton("Range Start", "rangeStart", mark.t < state.range.end - MIN_RANGE_SECONDS),
      roleButton("Range End", "rangeEnd", mark.t > state.range.start + MIN_RANGE_SECONDS),
      roleButton("Span Start", "draftStart", true),
      roleButton("Span End", "draftEnd", true),
      roleButton("Anchor", "anchor", Boolean(span && mark.t >= span.start - EPSILON && mark.t <= span.end + EPSILON))
    );
    const related = spansForMark(state.structure, mark.id).map(item => resolveSpan(state.structure, item)).filter(Boolean);
    elements["selection-relations"].textContent = related.length
      ? `Used by: ${related.map(item => item.label || formatRange(item)).join(" · ")}`
      : "Not used by a saved Span.";
  } else {
    elements["selection-summary"].innerHTML = `<div class="selection-title">${escapeHtml(span.label || "Unnamed Span")}</div><div class="selection-time">${formatRange(span)} · ${formatDuration(span.end - span.start)}</div>`;
    elements["selection-label"].value = span.label || "";
    const currentInside = currentFrame().C >= span.start - EPSILON && currentFrame().C <= span.end + EPSILON;
    const spanInsideRange = span.start >= state.range.start - EPSILON && span.end <= state.range.end + EPSILON;
    elements["selection-roles"].append(
      roleButton("Enter", "enter", true),
      roleButton("Enter Here", "enterHere", currentInside),
      roleButton("Focus", "focus", spanInsideRange),
      roleButton("Loop", "loop", true),
      roleButton("Target Start", "targetStart", span.start >= state.range.start - EPSILON && span.start <= state.range.end + EPSILON),
      roleButton("Target End", "targetEnd", span.end >= state.range.start - EPSILON && span.end <= state.range.end + EPSILON),
      roleButton(span.anchor ? "Target Anchor" : "Target Midpoint", "targetAnchor", (span.anchor ?? span.midpoint) >= state.range.start - EPSILON && (span.anchor ?? span.midpoint) <= state.range.end + EPSILON)
    );
    elements["selection-relations"].textContent = `Start: ${span.startMark.label || formatTime(span.start)} · End: ${span.endMark.label || formatTime(span.end)}${span.anchorMark ? ` · Anchor: ${span.anchorMark.label || formatTime(span.anchor)}` : ""}`;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function renderStructure() {
  const marks = [...state.structure.marks].sort((a, b) => a.t - b.t);
  const spans = sortedResolvedSpans(state.structure);
  elements["mark-count"].textContent = String(marks.length);
  elements["span-count"].textContent = String(spans.length);
  elements["marks-list-count"].textContent = String(marks.length);
  elements["spans-list-count"].textContent = String(spans.length);
  elements["undo-edit"].disabled = !state.structuralHistory.length;

  elements["marks-list"].replaceChildren();
  if (!marks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.videoLoaded ? "No Marks for this video." : "Load a video to see its Marks.";
    elements["marks-list"].appendChild(empty);
  } else {
    for (const mark of marks) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "structure-item";
      if (mark.id === state.selectedMarkId) button.classList.add("selected");
      button.dataset.markId = mark.id;
      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = mark.label || "Unnamed Mark";
      const time = document.createElement("span");
      time.className = "item-time";
      time.textContent = formatTime(mark.t);
      button.append(label, time);
      elements["marks-list"].appendChild(button);
    }
  }

  elements["spans-list"].replaceChildren();
  if (!spans.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.videoLoaded ? "No Spans for this video." : "Load a video to see its Spans.";
    elements["spans-list"].appendChild(empty);
  } else {
    for (const span of spans) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "structure-item";
      if (span.id === state.selectedSpanId) button.classList.add("selected");
      button.dataset.spanId = span.id;
      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = span.label || "Unnamed Span";
      const time = document.createElement("span");
      time.className = "item-time";
      time.textContent = `${formatRange(span)} · ${formatDuration(span.end - span.start)}`;
      button.append(label, time);
      elements["spans-list"].appendChild(button);
    }
  }

  const start = getMark(state.structure, state.draftStartMarkId);
  const end = getMark(state.structure, state.draftEndMarkId);
  elements["span-draft"].hidden = !start && !end;
  if (start || end) {
    elements["draft-summary"].innerHTML = `Start: <strong>${escapeHtml(start?.label || (start ? formatTime(start.t) : "—"))}</strong><br>End: <strong>${escapeHtml(end?.label || (end ? formatTime(end.t) : "—"))}</strong>`;
    elements["save-draft"].disabled = !start || !end || Math.abs(start.t - end.t) <= EPSILON;
  }

  renderSelectionInspector();
  renderTimelineMarks();
}

function formatResolution(action, placeVerb) {
  return action
    ? `${formatRange(action)} · ${placeVerb} ${formatTime(action.current)} · Earlier ${formatTime(action.earlier)} · Later ${formatTime(action.later)}`
    : "Root Passage";
}

function setActionMeta(buttonId, metaId, label, meta) {
  elements[metaId].textContent = meta;
  elements[buttonId].setAttribute("aria-label", `${label}: ${meta}`);
}

function updateAddressSourceOptions() {
  for (const option of elements["address-source"].options) {
    option.disabled = !Number.isFinite(addressFromSource(option.value));
  }
  if (elements["address-source"].selectedOptions[0]?.disabled) elements["address-source"].value = "current";
}

function updateUI() {
  const loaded = state.videoLoaded;
  const frame = currentFrame();
  const traversalActive = Boolean(state.skimSession);
  const repeatActive = Boolean(state.repeatSession);
  const actualCurrent = loaded ? safeCurrentTime() : 0;
  const current = loaded && (traversalActive || repeatActive || state.playbackStart || state.playerState === 1)
    ? actualCurrent
    : (frame?.C ?? actualCurrent);
  const targets = frame ? activeTargets(frame) : { earlier: null, later: null };
  const model = frame ? getActionRanges(frame, state.range, state.point, parentFrame(), state.lastTraversal, current, state.stepSeconds) : null;
  const previous = frame ? previousMark(state.structure, frame.C, state.range) : null;
  const next = frame ? nextMark(state.structure, frame.C, state.range) : null;
  const structuralPresentation = frame ? {
    previousMark: previous ? { start: previous.t, end: frame.C } : null,
    nextMark: next ? { start: frame.C, end: next.t } : null
  } : null;

  elements["current-time"].textContent = formatTime(current);
  elements["duration-time"].textContent = formatTime(state.duration);
  elements["range-label"].textContent = loaded ? formatRange(state.range) : "—";
  elements["passage-label"].textContent = frame
    ? `${formatTime(frame.L)}–${formatTime(frame.R)} · Level ${frame.level ?? 0}`
    : "—";
  elements["current-label"].textContent = frame ? formatTime(current) : "—";
  elements["point-label"].textContent = Number.isFinite(state.point) ? formatTime(state.point) : "—";
  elements["last-label"].textContent = state.lastTraversal ? lastTraversalVerb() : "—";
  elements["context-label"].textContent = currentContextName();
  elements["range-tools-value"].textContent = loaded ? formatRange(state.range) : "—";
  elements["exit-meta"].textContent = state.contextStack.length ? "Parent Context" : "Root Context";

  const simpleControls = [
    "range-start-here", "range-midpoint", "range-end-here", "full-video-range",
    "step-slider", "step-seconds", "mark-current", "address-source", "mark-label",
    "create-mark", "span-label", "save-passage", "save-range", "speed-select"
  ];
  for (const id of simpleControls) elements[id].disabled = !loaded || traversalActive;
  const atFullVideo = loaded && Math.abs(state.range.start) <= EPSILON && Math.abs(state.range.end - state.duration) <= EPSILON && !state.range.sourceSpanId;
  elements["full-video-range"].disabled = !loaded || traversalActive || atFullVideo;
  elements["range-start-here"].disabled = !loaded || traversalActive || !frame || frame.C <= state.range.start + EPSILON || frame.C >= state.range.end - MIN_RANGE_SECONDS;
  elements["range-end-here"].disabled = !loaded || traversalActive || !frame || frame.C >= state.range.end - EPSILON || frame.C <= state.range.start + MIN_RANGE_SECONDS;
  elements["range-midpoint"].disabled = !loaded || traversalActive || !frame || Math.abs(frame.C - spanMidpoint(state.range.start, state.range.end)) <= EPSILON;
  elements["save-last"].disabled = !loaded || traversalActive || !state.lastTraversal;
  elements["exit-context"].disabled = !loaded || traversalActive || !state.contextStack.length;
  elements["narrow-earlier"].disabled = !loaded || traversalActive || targets.earlier === null;
  elements["narrow-later"].disabled = !loaded || traversalActive || targets.later === null;
  elements.widen.disabled = !loaded || traversalActive || !model?.widen;
  elements.undo.disabled = !loaded || traversalActive || state.stack.length < 2;
  elements["step-earlier"].disabled = !loaded || traversalActive || !model?.stepEarlier;
  elements["step-later"].disabled = !loaded || traversalActive || !model?.stepLater;
  elements["previous-mark"].disabled = !loaded || traversalActive || !previous;
  elements["next-mark"].disabled = !loaded || traversalActive || !next;
  elements.play.disabled = !loaded || traversalActive || repeatActive;
  elements["repeat-last"].disabled = !loaded || traversalActive || !state.lastTraversal;
  elements.skim.disabled = !loaded || (traversalActive ? false : targets.later === null);

  elements["skim-name"].textContent = traversalActive ? "Stop Skim" : "Skim";
  elements["play-name"].textContent = state.playbackStart ? "Pause" : "Play";
  elements["repeat-name"].textContent = repeatActive ? "Stop Repeat" : "Repeat";

  const maxRate = Number(elements["speed-select"].value || 1);
  setActionMeta("narrow-earlier", "earlier-meta", "Narrow Earlier", targets.earlier === null ? "No Earlier Destination" : `to ${formatTime(targets.earlier)}`);
  setActionMeta("narrow-later", "later-meta", "Narrow Later", targets.later === null ? "No Later Destination" : `to ${formatTime(targets.later)}`);
  elements["widen-meta"].textContent = formatResolution(model?.widen, "keep");
  elements["undo-meta"].textContent = formatResolution(model?.undo, "restore");
  elements["skim-meta"].textContent = targets.later === null ? "No Later Destination" : `to ${formatTime(targets.later)} · ${maxRate}×→1×`;
  elements["play-meta"].textContent = `1× from ${formatTime(state.playbackStart?.departure ?? frame?.C)}`;
  elements["repeat-meta"].textContent = state.lastTraversal ? lastTraversalVerb() : "No Last Traversal";
  elements["step-earlier-meta"].textContent = model?.stepEarlier ? `to ${formatTime(model.stepEarlier.destination)} · −${formatDuration(state.stepSeconds)}` : "Range Start";
  elements["step-later-meta"].textContent = model?.stepLater ? `to ${formatTime(model.stepLater.destination)} · +${formatDuration(state.stepSeconds)}` : "Range End";
  elements["previous-mark-meta"].textContent = previous ? `to ${formatTime(previous.t)}${previous.label ? ` · ${previous.label}` : ""}` : "No Earlier Mark";
  elements["next-mark-meta"].textContent = next ? `to ${formatTime(next.t)}${next.label ? ` · ${next.label}` : ""}` : "No Later Mark";
  elements["mark-current-meta"].textContent = frame ? `at ${formatTime(frame.C)}` : "—";

  if (!loaded || !frame) {
    ["range-start-handle", "range-end-handle", "passage-left-marker", "passage-right-marker", "earlier-target-marker", "later-target-marker", "current-marker", "point-marker"].forEach(id => elements[id].hidden = true);
    elements["selection-fill"].hidden = true;
    elements["action-preview-fill"].hidden = true;
    renderTimelineMarks();
    updateAddressSourceOptions();
    return;
  }

  ["range-start-handle", "range-end-handle", "passage-left-marker", "passage-right-marker", "current-marker"].forEach(id => elements[id].hidden = false);
  setSegment(elements["range-fill"], state.range.start, state.range.end);
  setSegment(elements["passage-fill"], frame.L, frame.R);
  setMarkerPosition(elements["range-start-handle"], state.range.start);
  setMarkerPosition(elements["range-end-handle"], state.range.end);
  setMarkerPosition(elements["passage-left-marker"], frame.L);
  setMarkerPosition(elements["passage-right-marker"], frame.R);
  setMarkerPosition(elements["current-marker"], current);

  const customEarlier = Number.isFinite(state.point) && state.point < frame.C;
  const customLater = Number.isFinite(state.point) && state.point > frame.C;
  elements["earlier-target-marker"].hidden = targets.earlier === null || customEarlier;
  elements["later-target-marker"].hidden = targets.later === null || customLater;
  if (targets.earlier !== null) setMarkerPosition(elements["earlier-target-marker"], targets.earlier);
  if (targets.later !== null) setMarkerPosition(elements["later-target-marker"], targets.later);
  elements["point-marker"].hidden = !Number.isFinite(state.point);
  if (Number.isFinite(state.point)) setMarkerPosition(elements["point-marker"], state.point);

  elements["range-start-handle"].setAttribute("aria-valuenow", String(state.range.start));
  elements["range-end-handle"].setAttribute("aria-valuenow", String(state.range.end));
  elements["range-start-handle"].setAttribute("aria-valuemax", String(state.duration));
  elements["range-end-handle"].setAttribute("aria-valuemax", String(state.duration));
  elements["range-start-handle"].setAttribute("aria-valuetext", formatTime(state.range.start));
  elements["range-end-handle"].setAttribute("aria-valuetext", formatTime(state.range.end));

  const selectedSpan = resolveSpan(state.structure, state.selectedSpanId);
  elements["selection-fill"].hidden = !selectedSpan;
  if (selectedSpan) setSegment(elements["selection-fill"], selectedSpan.start, selectedSpan.end);

  renderActionPreview(model, structuralPresentation);
  renderTimelineMarks();
  updateAddressSourceOptions();
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
  elements["speed-select"].value = String((rates.length ? rates : [1]).at(-1));
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
  state.range = { start: 0, end: duration, sourceSpanId: null };
  state.stack = [createRoot(0, requestedStart, duration)];
  state.contextStack = [];
  state.point = null;
  state.skimSession = null;
  state.repeatSession = null;
  state.playbackStart = null;
  state.playWidened = false;
  state.lastTraversal = null;
  state.selectedMarkId = null;
  state.selectedSpanId = null;
  state.draftStartMarkId = null;
  state.draftEndMarkId = null;
  state.structuralHistory = [];
  state.pendingStep = null;
  state.availableRates = player.getAvailablePlaybackRates?.() || [1];
  player.pauseVideo();
  player.seekTo(requestedStart, true);
  loadStructure();
  populateSpeedOptions();
  renderStructure();
  setStatus(`Loaded ${formatTime(duration)} video.`);
  updateUI();
}

function cuePendingVideo() {
  if (!state.playerReady || !pendingLoad) return;
  flushPendingStep(false);
  state.videoLoaded = false;
  state.stack = [];
  state.contextStack = [];
  state.skimSession = null;
  state.repeatSession = null;
  state.playbackStart = null;
  state.lastTraversal = null;
  state.point = null;
  state.structure = createStructure();
  renderStructure();
  updateUI();
  player.cueVideoById({ videoId: pendingLoad.videoId, startSeconds: pendingLoad.startSeconds || 0 });
  setStatus("Loading YouTube video metadata…");
}

function handlePlayerStateChange(event) {
  state.playerState = event.data;
  if (event.data === 5 && pendingLoad && !state.videoLoaded) initializeVideo();
  if (event.data === 2 && state.videoLoaded && state.skimSession && !state.internalPause) {
    stopSkim(true);
    return;
  }
  if (event.data === 1 && state.videoLoaded && !state.skimSession && !state.repeatSession && !state.playbackStart) {
    const current = clamp(safeCurrentTime(), state.range.start, state.range.end);
    state.playbackStart = { departure: current, parentFrame: { ...currentFrame(), C: current } };
    state.playWidened = false;
  }
  if (event.data === 2 && state.videoLoaded && state.repeatSession) {
    stopRepeat("Repeat stopped.", true);
  } else if (event.data === 2 && state.videoLoaded && state.playbackStart && !state.internalPause) {
    finishPlayback(true);
    setStatus("Paused. Repeat is ready for Last Traversal.");
  } else if (event.data === 0 && state.videoLoaded && state.playbackStart) {
    finishPlayback(true);
  }
  updateUI();
}

function pollPlayer() {
  if (!state.videoLoaded || !player || !state.playerReady) return;
  const now = safeCurrentTime();
  if (state.skimSession) {
    const skim = state.skimSession;
    const total = skim.target - skim.departure;
    const progress = total > 0 ? clamp((now - skim.departure) / total, 0, 1) : 1;
    const desired = logSpeed(skim.maxRate, progress);
    skim.lastDesiredRate = desired;
    const rate = chooseSupportedRate(state.availableRates, desired);
    if (Math.abs(player.getPlaybackRate() - rate) > 0.001) player.setPlaybackRate(rate);
    if (now >= skim.target - EPSILON) {
      finishSkimDestination();
      return;
    }
  } else if (state.repeatSession) {
    if (now < state.repeatSession.start - EPSILON || now >= state.repeatSession.end - EPSILON) {
      player.seekTo(state.repeatSession.start, true);
      player.setPlaybackRate(1);
      player.playVideo();
    }
  } else if (state.playbackStart && state.playerState === 1) {
    const parent = state.playbackStart.parentFrame;
    if (!state.playWidened && (now < parent.L - EPSILON || now > parent.R + EPSILON)) {
      state.playWidened = true;
      setStatus(`Play crossed the Passage and Widened to ${formatRange(state.range)}.`);
    }
    if (now < state.range.start - EPSILON) {
      player.seekTo(state.range.start, true);
    } else if (now >= state.range.end - EPSILON) {
      finishPlayback(true);
      setStatus("Reached the end of the Range.");
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
  if (event.target.closest(".range-handle") || event.target.closest(".timeline-mark")) return;
  const time = timeFromPointer(event);
  if (time < state.range.start || time > state.range.end) {
    setStatus("That Point is outside the Range.", true);
    return;
  }
  settleBeforeNavigation();
  const frame = currentFrame();
  if (Math.abs(time - frame.C) <= EPSILON) {
    seekToFrame(frame);
    setStatus(`Already at ${formatTime(frame.C)}.`);
    return;
  }
  state.point = time;
  narrow(time < frame.C ? "earlier" : "later", "narrow");
}

function beginRangeDrag(kind, event) {
  if (!state.videoLoaded || state.skimSession) return;
  settleBeforeNavigation();
  event.preventDefault();
  event.stopPropagation();
  state.dragHandle = kind;
  state.rangeDragOrigin = captureContext();
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function updateRangeDrag(event) {
  if (!state.dragHandle || !state.videoLoaded) return;
  const time = timeFromPointer(event);
  if (state.dragHandle === "start") {
    state.range.start = clamp(time, 0, state.range.end - MIN_RANGE_SECONDS);
    state.range.sourceSpanId = null;
  } else {
    state.range.end = clamp(time, state.range.start + MIN_RANGE_SECONDS, state.duration);
    state.range.sourceSpanId = null;
  }
  const C = clamp(safeCurrentTime(), state.range.start, state.range.end);
  state.stack = [createRoot(state.range.start, C, state.range.end)];
  state.point = null;
  state.lastTraversal = null;
  updateUI();
}

function finishRangeDrag() {
  if (!state.dragHandle) return;
  const origin = state.rangeDragOrigin;
  state.dragHandle = null;
  state.rangeDragOrigin = null;
  if (origin && (Math.abs(origin.range.start - state.range.start) > EPSILON || Math.abs(origin.range.end - state.range.end) > EPSILON)) {
    state.contextStack.push(origin);
  }
  seekToFrame();
  setStatus(`Range set to ${formatRange(state.range)}.`);
  updateUI();
}

function adjustStepPreset(direction) {
  const current = state.stepSeconds;
  const index = direction < 0
    ? Math.max(0, STEP_PRESETS.findIndex(value => value >= current - EPSILON) - 1)
    : Math.min(STEP_PRESETS.length - 1, STEP_PRESETS.findIndex(value => value > current + EPSILON));
  state.stepSeconds = STEP_PRESETS[index < 0 ? STEP_PRESETS.length - 1 : index];
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
  const button = event.target.closest("[data-mark-id]");
  if (!button) return;
  event.stopPropagation();
  state.selectedMarkId = button.dataset.markId;
  renderStructure();
  updateUI();
});

elements["range-start-here"].addEventListener("click", () => {
  const current = currentFrame().C;
  if (current >= state.range.end - MIN_RANGE_SECONDS) return setStatus("Current must be earlier than Range End.", true);
  pushContextAndSetRange(current, state.range.end, current, null, `Set Range Start to ${formatTime(current)}.`);
});
elements["range-end-here"].addEventListener("click", () => {
  const current = currentFrame().C;
  if (current <= state.range.start + MIN_RANGE_SECONDS) return setStatus("Current must be later than Range Start.", true);
  pushContextAndSetRange(state.range.start, current, current, null, `Set Range End to ${formatTime(current)}.`);
});
elements["range-midpoint"].addEventListener("click", () => {
  settleBeforeNavigation();
  const middle = spanMidpoint(state.range.start, state.range.end);
  state.stack.push(createRoot(state.range.start, middle, state.range.end));
  seekToFrame();
  setStatus(`Moved Current to Range Midpoint ${formatTime(middle)}.`);
  updateUI();
});
elements["full-video-range"].addEventListener("click", () => {
  const current = clamp(currentFrame().C, 0, state.duration);
  pushContextAndSetRange(0, state.duration, current, null, "Entered the Full Video Range.");
});
elements["exit-context"].addEventListener("click", exitContext);

// Traversal
elements["narrow-earlier"].addEventListener("click", () => narrow("earlier"));
elements["narrow-later"].addEventListener("click", () => narrow("later"));
elements.widen.addEventListener("click", widenFully);
elements.undo.addEventListener("click", undoOne);
elements["step-earlier"].addEventListener("click", () => performStep("earlier"));
elements["step-later"].addEventListener("click", () => performStep("later"));
elements["previous-mark"].addEventListener("click", () => goToAdjacentMark("earlier"));
elements["next-mark"].addEventListener("click", () => goToAdjacentMark("later"));
elements["mark-current"].addEventListener("click", () => createMarkFromSource("current", ""));
elements.skim.addEventListener("click", startSkim);
elements.play.addEventListener("click", ordinaryPlayPause);
elements["repeat-last"].addEventListener("click", () => state.repeatSession ? stopRepeat("Repeat stopped.", true) : startRepeatLast());
elements["speed-select"].addEventListener("change", updateUI);

for (const control of document.querySelectorAll("[data-preview-action]")) {
  const action = control.dataset.previewAction;
  control.addEventListener("pointerenter", () => setPreviewAction(action));
  control.addEventListener("pointerleave", () => setPreviewAction(null));
  control.addEventListener("focus", () => setPreviewAction(action));
  control.addEventListener("blur", () => setPreviewAction(null));
}

// Step size
elements["step-slider"].addEventListener("input", event => { syncStepControls(event.target); updateUI(); });
elements["step-seconds"].addEventListener("change", event => { syncStepControls(event.target); updateUI(); });

// Structure creation
elements["create-mark"].addEventListener("click", () => createMarkFromSource());
elements["mark-label"].addEventListener("keydown", event => { if (event.key === "Enter") createMarkFromSource(); });
elements["save-passage"].addEventListener("click", savePassage);
elements["save-last"].addEventListener("click", saveLastTraversal);
elements["save-range"].addEventListener("click", saveRange);
elements["save-draft"].addEventListener("click", saveDraftSpan);
elements["clear-draft"].addEventListener("click", () => {
  state.draftStartMarkId = null;
  state.draftEndMarkId = null;
  renderStructure();
  updateUI();
});
elements["undo-edit"].addEventListener("click", undoStructuralEdit);

// Structure lists and selected roles
elements["marks-list"].addEventListener("click", event => {
  const button = event.target.closest("[data-mark-id]");
  if (!button) return;
  state.selectedMarkId = button.dataset.markId;
  renderStructure();
  updateUI();
});
elements["spans-list"].addEventListener("click", event => {
  const button = event.target.closest("[data-span-id]");
  if (!button) return;
  state.selectedSpanId = button.dataset.spanId;
  state.selectedMarkId = null;
  renderStructure();
  updateUI();
});
elements["selection-roles"].addEventListener("click", event => {
  const button = event.target.closest("[data-role]");
  if (!button || button.disabled) return;
  if (state.selectedMarkId) assignSelectedMarkRole(button.dataset.role);
  else if (state.selectedSpanId) assignSelectedSpanRole(button.dataset.role);
});
elements["apply-selection-label"].addEventListener("click", () => {
  const label = elements["selection-label"].value;
  if (state.selectedMarkId) mutateStructure(() => renameMark(state.structure, state.selectedMarkId, label), "Renamed Mark.");
  else if (state.selectedSpanId) mutateStructure(() => renameSpan(state.structure, state.selectedSpanId, label), "Renamed Span.");
});
elements["delete-selection"].addEventListener("click", () => {
  if (state.selectedMarkId) {
    const id = state.selectedMarkId;
    const result = mutateStructure(() => deleteMarkSafely(state.structure, id), value => value.anonymized ? "Removed the Mark label; the structural Address remains in use." : "Deleted Mark.");
    if (result?.deleted) state.selectedMarkId = null;
  } else if (state.selectedSpanId) {
    const id = state.selectedSpanId;
    const result = mutateStructure(() => deleteSpan(state.structure, id), "Deleted Span.");
    if (result) state.selectedSpanId = null;
  }
  renderStructure();
  updateUI();
});

// Keyboard
document.addEventListener("keydown", event => {
  const tag = document.activeElement?.tagName;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
  if (!state.videoLoaded) return;
  const key = event.key.toLowerCase();
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey;

  if (plain && key === "q") { event.preventDefault(); narrow("earlier"); }
  else if (plain && key === "w") { event.preventDefault(); widenFully(); }
  else if (plain && key === "e") { event.preventDefault(); narrow("later"); }
  else if (plain && key === "r") { event.preventDefault(); undoOne(); }
  else if (plain && key === "s") { event.preventDefault(); startSkim(); }
  else if (plain && key === "t") { event.preventDefault(); state.repeatSession ? stopRepeat("Repeat stopped.", true) : startRepeatLast(); }
  else if (plain && key === "m") { event.preventDefault(); createMarkFromSource("current", ""); }
  else if (event.key === "ArrowLeft") { event.preventDefault(); performStep("earlier"); }
  else if (event.key === "ArrowRight") { event.preventDefault(); performStep("later"); }
  else if (plain && event.key === ",") { event.preventDefault(); goToAdjacentMark("earlier"); }
  else if (plain && event.key === ".") { event.preventDefault(); goToAdjacentMark("later"); }
  else if (plain && event.key === "[") { event.preventDefault(); adjustStepPreset(-1); }
  else if (plain && event.key === "]") { event.preventDefault(); adjustStepPreset(1); }
  else if (event.key === "Backspace") {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) restoreContextRoot();
    else if (event.shiftKey) widenFully();
    else undoOne();
  } else if (event.altKey && event.key === "ArrowUp") {
    event.preventDefault();
    exitContext();
  } else if (event.key === "Escape") {
    if (Number.isFinite(state.point)) {
      state.point = null;
      setStatus("Point cleared; automatic Destinations restored.");
    } else if (state.draftStartMarkId || state.draftEndMarkId) {
      state.draftStartMarkId = null;
      state.draftEndMarkId = null;
      setStatus("Span draft cleared.");
    } else {
      state.selectedMarkId = null;
      state.selectedSpanId = null;
      setStatus("Structure selection cleared.");
    }
    renderStructure();
    updateUI();
  } else if (event.key === " ") {
    event.preventDefault();
    ordinaryPlayPause();
  }
});

syncStepControls();
renderStructure();
updateUI();
