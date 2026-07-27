import {
  EPSILON,
  clamp,
  contains,
  midpoint,
  getTargets,
  getActionRanges
} from "./range-geometry.js";
import {
  PIN_KIND,
  findPinAt,
  visiblePins,
  resolveSection,
  previousPin,
  nextPin,
  sortedSections,
  clusterPinsByPixels
} from "./guide.js";
import {
  TRANSPORT_KIND,
  isTransportActive,
  deriveContextWindow
} from "./transport.js";
import { YOUTUBE_STATE } from "./youtube.js";

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const minuteText = hours ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours ? `${hours}:` : ""}${minuteText}:${String(secs).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const value = Math.max(0, seconds);
  const formatSeconds = amount => {
    if (amount < 1) return amount.toFixed(2);
    if (amount < 10 && !Number.isInteger(amount)) {
      return amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }
    return String(Number(amount.toFixed(2)));
  };

  if (value < 60) return `${formatSeconds(value)}s`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainingSeconds = value - hours * 3600 - minutes * 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (remainingSeconds > 0.005) parts.push(`${formatSeconds(remainingSeconds)}s`);
  return parts.join(" ") || "0s";
}

export function formatRange(extent) {
  return extent ? `${formatTime(extent.start)}–${formatTime(extent.end)}` : "—";
}

export function createView({ document, getState, getPlayerTime, minRangeSeconds }) {
  const elements = Object.fromEntries(
    [...document.querySelectorAll("[id]")].map(node => [node.id, node])
  );

  let previewAction = null;
  let previewSectionId = null;
  let renderedPinKey = "";
  let renderedClusters = [];
  let pinClusterTrigger = null;

  const state = () => getState();
  const model = () => state().session.model;
  const resolution = () => model().resolution;
  const range = () => model().range;
  const guide = () => model().guide;
  const interval = () => model().interval;
  const focusedSectionId = () => model().focus?.sectionId || null;
  const transportIs = kind => state().transport.kind === kind;


  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", isError);
  }

  function percent(time) {
    return model().duration > 0 ? clamp((time / model().duration) * 100, 0, 100) : 0;
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

  function endpointButton(role, pin) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "endpoint-button";
    button.dataset.pinGo = pin.id;
    const roleLabel = document.createElement("small");
    roleLabel.textContent = role;
    const text = document.createElement("span");
    text.textContent = `${formatTime(pin.t)} ${pin.label || ""}`.trim();
    button.append(roleLabel, text);
    return button;
  }

  function closePinClusterMenu(options = {}) {
    const trigger = pinClusterTrigger;
    pinClusterTrigger = null;
    trigger?.setAttribute?.("aria-expanded", "false");
    elements["pin-cluster-menu"].hidden = true;
    elements["pin-cluster-menu"].replaceChildren();
    if (options.restoreFocus && trigger?.isConnected !== false) {
      trigger?.focus?.({ preventScroll: true });
    }
  }

  function openPinClusterMenu(cluster, trigger = document.activeElement) {
    const menu = elements["pin-cluster-menu"];
    pinClusterTrigger = trigger || null;
    pinClusterTrigger?.setAttribute?.("aria-expanded", "true");
    menu.replaceChildren();
    for (const pin of cluster.pins) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.dataset.pinGo = pin.id;
      const label = document.createElement("span");
      label.textContent = pin.label || "Unnamed Pin";
      const time = document.createElement("time");
      time.textContent = formatTime(pin.t);
      button.append(label, time);
      menu.appendChild(button);
    }
    const width = elements.timeline.clientWidth || 1;
    menu.style.left = `${clamp(cluster.x - 135, 6, Math.max(6, width - 276))}px`;
    menu.hidden = false;
    menu.querySelector?.("button")?.focus?.({ preventScroll: true });
  }

  const clusterAt = index => renderedClusters[index] || null;

  function invalidateTimelinePins() {
    renderedPinKey = "";
  }

  function renderTimelinePins() {
    const width = Math.max(1, elements.timeline.clientWidth || 1);
    const activeRange = range();
    const pins = visiblePins(guide()).filter(pin => contains(activeRange, pin.t));
    const key = `${activeRange.start}|${activeRange.end}|${width}|${pins.map(pin => `${pin.id}:${pin.t}:${pin.label}`).join(",")}`;
    if (key === renderedPinKey) return;
    renderedPinKey = key;
    closePinClusterMenu();
    elements["pin-lane"].replaceChildren();
    renderedClusters = clusterPinsByPixels(pins, model().duration, width, 18);

    renderedClusters.forEach((cluster, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timeline-pin";
      button.style.left = `${(cluster.x / width) * 100}%`;
      if (cluster.pins.length === 1) {
        const pin = cluster.pins[0];
        button.dataset.pinGo = pin.id;
        const description = `${pin.label || "Unnamed Pin"} at ${formatTime(pin.t)}`;
        button.setAttribute("aria-label", description);
        button.title = description;
      } else {
        button.classList.add("cluster");
        button.dataset.clusterIndex = String(index);
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        const count = document.createElement("span");
        count.className = "timeline-pin-count";
        count.textContent = String(cluster.pins.length);
        button.appendChild(count);
        const description = `${cluster.pins.length} nearby Pins`;
        button.setAttribute("aria-label", description);
        button.title = cluster.pins
          .map(pin => `${pin.label || "Unnamed Pin"} — ${formatTime(pin.t)}`)
          .join("\n");
      }
      elements["pin-lane"].appendChild(button);
    });
  }

  function renderGuide() {
    const pins = visiblePins(guide());
    const sections = sortedSections(guide());
    const focusedId = focusedSectionId();
    const counts = {
      pins: String(pins.length),
      sections: String(sections.length)
    };

    for (const id of ["pin-count", "pins-list-count", "header-pin-count"]) {
      elements[id].textContent = counts.pins;
    }
    for (const id of ["section-count", "sections-list-count", "header-section-count"]) {
      elements[id].textContent = counts.sections;
    }
    elements["pins-access-meta"].textContent = `${pins.length} retained`;
    elements["guide-toggle"].setAttribute(
      "aria-label",
      `Guide: ${sections.length} Section${sections.length === 1 ? "" : "s"}, ${pins.length} Pin${pins.length === 1 ? "" : "s"}`
    );

    elements["sections-list"].replaceChildren();
    if (!sections.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = state().videoLoaded
        ? "No Sections for this video."
        : "Load a video to see its Sections.";
      elements["sections-list"].appendChild(empty);
    } else {
      for (const section of sections) {
        const item = document.createElement("article");
        item.className = "guide-item section-item";
        item.dataset.sectionPreviewId = section.id;
        if (section.id === focusedId) item.classList.add("focused");

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
        if (section.id === focusedId) {
          focus.dataset.leaveSection = "true";
          focus.textContent = "Leave";
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
          endpointButton("Start", section.startPin),
          Object.assign(document.createElement("span"), { textContent: "→" }),
          endpointButton("End", section.endPin)
        );

        item.append(main, actions, endpoints);
        elements["sections-list"].appendChild(item);
      }
    }

    elements["pins-list"].replaceChildren();
    if (!pins.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = state().videoLoaded
        ? "No Pins for this video."
        : "Load a video to see its Pins.";
      elements["pins-list"].appendChild(empty);
    } else {
      for (const pin of pins) {
        const item = document.createElement("article");
        item.className = "guide-item pin-item";
        const main = document.createElement("button");
        main.type = "button";
        main.className = "guide-item-main";
        main.dataset.pinGo = pin.id;
        const title = document.createElement("span");
        title.className = "guide-item-title";
        title.textContent = pin.label || "Unnamed Pin";
        const time = document.createElement("span");
        time.className = "guide-item-time";
        time.textContent = formatTime(pin.t);
        main.append(title, time);

        const actions = document.createElement("div");
        actions.className = "guide-item-actions";
        const rename = document.createElement("button");
        rename.type = "button";
        rename.dataset.renamePin = pin.id;
        rename.textContent = "Rename";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.dataset.deletePin = pin.id;
        remove.textContent = "Delete";
        remove.className = "danger-text";
        actions.append(rename, remove);
        item.append(main, actions);
        elements["pins-list"].appendChild(item);
      }
    }

    invalidateTimelinePins();
    renderTimelinePins();
  }

  function renderActionPreview(actionModel, structural) {
    let actionRange = previewAction && actionModel ? actionModel[previewAction] : null;
    if (!actionRange && structural) actionRange = structural[previewAction] || null;
    elements["action-preview-fill"].hidden = !actionRange;
    if (!actionRange) {
      elements["action-preview-fill"].removeAttribute("data-kind");
      return;
    }
    elements["action-preview-fill"].dataset.kind = previewAction;
    setSegment(elements["action-preview-fill"], actionRange.start, actionRange.end);
  }

  function renderSectionPreview() {
    const section = resolveSection(guide(), previewSectionId);
    elements["section-preview-fill"].hidden = !section;
    if (section) setSegment(elements["section-preview-fill"], section.start, section.end);
  }

  function setActionMeta(buttonId, metaId, label, meta) {
    elements[metaId].textContent = meta;
    elements[buttonId].setAttribute("aria-label", `${label}: ${meta}`);
  }

  function renderTransport() {
    const currentResolution = resolution();
    const activeRange = range();
    const semanticCurrent = currentResolution?.C ?? 0;
    const physical = getPlayerTime();
    const moving = isTransportActive(state().transport)
      || state().playerState === YOUTUBE_STATE.PLAYING;
    const physicallyDisplaced = state().videoLoaded
      && Number.isFinite(physical)
      && Math.abs(physical - semanticCurrent) > 0.05;
    const cursor = state().videoLoaded && (moving || physicallyDisplaced)
      ? clamp(physical, activeRange.start, activeRange.end)
      : semanticCurrent;

    elements["cursor-time"].textContent = formatTime(cursor);
    if (state().videoLoaded && currentResolution) {
      const showCursor = moving || physicallyDisplaced;
      elements["cursor-marker"].hidden = !showCursor;
      if (showCursor) setMarkerPosition(elements["cursor-marker"], cursor);
    } else {
      elements["cursor-marker"].hidden = true;
    }
  }

  function render() {
    const currentState = state();
    const loaded = currentState.videoLoaded;
    const activeRange = range();
    const currentResolution = resolution();
    const currentInterval = interval();
    const skimActive = transportIs(TRANSPORT_KIND.SKIM);
    const loopActive = transportIs(TRANSPORT_KIND.LOOP);
    const contextActive = transportIs(TRANSPORT_KIND.CONTEXT);
    const semanticCurrent = currentResolution?.C ?? 0;
    const targets = currentResolution
      ? getTargets(currentResolution)
      : { backward: null, forward: null };
    const actionModel = currentResolution
      ? getActionRanges(currentResolution, activeRange, currentInterval, semanticCurrent, currentState.stepSeconds)
      : null;
    const previous = currentResolution
      ? previousPin(guide(), semanticCurrent, activeRange)
      : null;
    const next = currentResolution
      ? nextPin(guide(), semanticCurrent, activeRange)
      : null;
    const structuralPresentation = currentResolution ? {
      previousPin: previous ? { start: previous.t, end: semanticCurrent } : null,
      nextPin: next ? { start: semanticCurrent, end: next.t } : null,
      context: deriveContextWindow(semanticCurrent, activeRange, currentState.contextSeconds),
      continue: activeRange
    } : null;
    const focused = resolveSection(guide(), focusedSectionId());

    elements["duration-time"].textContent = formatTime(model().duration);
    elements["range-label"].textContent = loaded ? formatRange(activeRange) : "—";
    elements["resolution-label"].textContent = currentResolution
      ? `${formatDuration(currentResolution.R - currentResolution.L)} · ${
          (currentResolution.level ?? 0) === 0
            ? "Range"
            : `${currentResolution.level} refinement${currentResolution.level === 1 ? "" : "s"}`
        }`
      : "—";
    elements["current-label"].textContent = currentResolution ? formatTime(semanticCurrent) : "—";
    elements["interval-label"].textContent = currentInterval ? formatRange(currentInterval) : "—";
    elements["focused-label"].textContent = focused ? focused.label : "None";
    elements["range-tools-value"].textContent = loaded ? formatRange(activeRange) : "—";
    elements["section-window"].textContent = currentInterval ? formatRange(currentInterval) : "—";
    elements["step-setting-value"].textContent = formatDuration(currentState.stepSeconds);

    elements["focused-section"].hidden = !focused;
    if (focused) {
      elements["focused-section-title"].textContent = focused.label;
      elements["focused-section-range"].textContent = formatRange(focused);
    }

    const interactionLocked = !loaded;
    for (const id of [
      "range-start-here", "range-midpoint", "range-end-here", "full-video-range",
      "step-slider", "step-seconds", "section-label", "save-section", "speed-select"
    ]) elements[id].disabled = interactionLocked;

    elements["context-select"].disabled = interactionLocked;
    elements["context-action"].disabled = interactionLocked || currentState.contextSeconds <= 0;
    elements["interval-state"].disabled = interactionLocked || !currentInterval;
    elements["focused-state"].disabled = interactionLocked || !focused;
    elements["save-section"].disabled = interactionLocked
      || !currentInterval
      || !elements["section-label"].value.trim();
    elements["leave-section"].disabled = interactionLocked || !focused;
    elements["refine-backward"].disabled = interactionLocked || targets.backward === null;
    elements["refine-forward"].disabled = interactionLocked || targets.forward === null;
    elements.reopen.disabled = interactionLocked || !actionModel?.reopen;
    elements["return-action"].disabled = !loaded || !currentState.session.history.length;
    elements["step-backward"].disabled = interactionLocked || !actionModel?.stepBackward;
    elements["step-forward"].disabled = interactionLocked || !actionModel?.stepForward;
    elements["pin-backward"].disabled = interactionLocked || !previous;
    elements["pin-forward"].disabled = interactionLocked || !next;
    const currentPin = currentResolution
      ? findPinAt(guide(), semanticCurrent)
      : null;
    const alreadyPinned = currentPin?.kind === PIN_KIND.EXPLICIT;
    elements["pin-current"].disabled = interactionLocked || alreadyPinned;
    elements.continue.disabled = interactionLocked;
    elements.loop.disabled = interactionLocked || !currentInterval;
    elements.skim.disabled = interactionLocked || (skimActive ? false : targets.forward === null);

    const atFullVideo = loaded
      && Math.abs(activeRange.start) <= EPSILON
      && Math.abs(activeRange.end - model().duration) <= EPSILON
      && !focused;
    elements["full-video-range"].disabled = interactionLocked || atFullVideo;
    elements["range-start-here"].disabled = interactionLocked
      || !currentResolution
      || semanticCurrent <= activeRange.start + EPSILON
      || semanticCurrent >= activeRange.end - minRangeSeconds;
    elements["range-end-here"].disabled = interactionLocked
      || !currentResolution
      || semanticCurrent >= activeRange.end - EPSILON
      || semanticCurrent <= activeRange.start + minRangeSeconds;
    elements["range-midpoint"].disabled = interactionLocked
      || !currentResolution
      || Math.abs(semanticCurrent - midpoint(activeRange.start, activeRange.end)) <= EPSILON;

    const transportActive = isTransportActive(currentState.transport);
    const activeKindLabel = {
      [TRANSPORT_KIND.CONTEXT]: "Context",
      [TRANSPORT_KIND.CONTINUE]: "Continue",
      [TRANSPORT_KIND.SKIM]: "Skim",
      [TRANSPORT_KIND.LOOP]: "Loop"
    }[currentState.transport.kind] || "Observation";
    elements["context-label"].textContent = contextActive ? "Stop Context" : "Context";
    elements["skim-label"].textContent = skimActive ? "Stop Skim" : "Skim";
    elements["continue-label"].textContent = transportActive ? "Pause" : "Continue";
    elements["loop-label"].textContent = loopActive ? "Stop Loop" : "Loop";
    elements["continue-meta"].textContent = transportActive
      ? `${activeKindLabel} active`
      : loaded ? formatRange(activeRange) : "—";
    for (const [id, active] of [
      ["context-action", contextActive],
      ["continue", transportActive],
      ["skim", skimActive],
      ["loop", loopActive]
    ]) {
      elements[id].classList.toggle("is-active", active);
      elements[id].setAttribute("aria-pressed", String(active));
    }
    elements["context-state"].textContent = contextActive
      ? formatRange(currentState.transport)
      : currentState.contextSeconds > 0
        ? `${currentState.contextSeconds} s`
        : "Off";
    elements["return-meta"].textContent = currentState.session.history.length
      ? currentState.session.history.at(-1).label
      : "Nothing to return to";

    const maxRate = Number(elements["speed-select"].value || 1);
    setActionMeta(
      "refine-backward",
      "backward-meta",
      "Refine Backward",
      targets.backward === null ? "Range start" : `to ${formatTime(targets.backward)}`
    );
    setActionMeta(
      "refine-forward",
      "forward-meta",
      "Refine Forward",
      targets.forward === null ? "Range end" : `to ${formatTime(targets.forward)}`
    );
    elements["reopen-meta"].textContent = actionModel?.reopen
      ? `${formatDuration(activeRange.end - activeRange.start)} available`
      : "Range-level resolution";
    elements["skim-meta"].textContent = targets.forward === null
      ? "No forward destination"
      : `to ${formatTime(targets.forward)} · ${maxRate}×→1×`;
    elements["loop-meta"].textContent = currentInterval ? formatRange(currentInterval) : "No Interval";
    elements["step-backward-meta"].textContent = actionModel?.stepBackward
      ? `to ${formatTime(actionModel.stepBackward.destination)}`
      : "Range start";
    elements["step-forward-meta"].textContent = actionModel?.stepForward
      ? `to ${formatTime(actionModel.stepForward.destination)}`
      : "Range end";
    elements["pin-backward-meta"].textContent = previous
      ? `${formatTime(previous.t)}${previous.label ? ` · ${previous.label}` : ""}`
      : "No Pin backward";
    elements["pin-forward-meta"].textContent = next
      ? `${formatTime(next.t)}${next.label ? ` · ${next.label}` : ""}`
      : "No Pin forward";
    elements["pin-current-meta"].textContent = currentResolution
      ? alreadyPinned
        ? `Pinned at ${formatTime(semanticCurrent)}`
        : `at ${formatTime(semanticCurrent)}`
      : "—";

    if (!loaded || !currentResolution) {
      for (const id of [
        "range-start-handle", "range-end-handle", "resolution-start-marker",
        "resolution-end-marker", "backward-target-marker", "forward-target-marker", "current-marker", "cursor-marker"
      ]) elements[id].hidden = true;
      elements["interval-fill"].hidden = true;
      elements["section-preview-fill"].hidden = true;
      elements["action-preview-fill"].hidden = true;
      renderTimelinePins();
      renderTransport();
      return;
    }

    for (const id of [
      "range-start-handle", "range-end-handle", "resolution-start-marker",
      "resolution-end-marker", "current-marker"
    ]) elements[id].hidden = false;
    setSegment(elements["range-fill"], activeRange.start, activeRange.end);
    setSegment(elements["resolution-fill"], currentResolution.L, currentResolution.R);
    setMarkerPosition(elements["range-start-handle"], activeRange.start);
    setMarkerPosition(elements["range-end-handle"], activeRange.end);
    setMarkerPosition(elements["resolution-start-marker"], currentResolution.L);
    setMarkerPosition(elements["resolution-end-marker"], currentResolution.R);
    setMarkerPosition(elements["current-marker"], semanticCurrent);

    elements["backward-target-marker"].hidden = targets.backward === null;
    elements["forward-target-marker"].hidden = targets.forward === null;
    if (targets.backward !== null) setMarkerPosition(elements["backward-target-marker"], targets.backward);
    if (targets.forward !== null) setMarkerPosition(elements["forward-target-marker"], targets.forward);

    elements["range-start-handle"].setAttribute("aria-valuemin", "0");
    elements["range-start-handle"].setAttribute("aria-valuemax", String(Math.max(0, activeRange.end - minRangeSeconds)));
    elements["range-start-handle"].setAttribute("aria-valuenow", String(activeRange.start));
    elements["range-start-handle"].setAttribute("aria-valuetext", `${formatTime(activeRange.start)}; Range begins`);
    elements["range-end-handle"].setAttribute("aria-valuemin", String(Math.min(model().duration, activeRange.start + minRangeSeconds)));
    elements["range-end-handle"].setAttribute("aria-valuemax", String(model().duration));
    elements["range-end-handle"].setAttribute("aria-valuenow", String(activeRange.end));
    elements["range-end-handle"].setAttribute("aria-valuetext", `${formatTime(activeRange.end)}; Range ends`);

    elements["interval-fill"].hidden = !currentInterval;
    if (currentInterval) setSegment(elements["interval-fill"], currentInterval.start, currentInterval.end);
    renderSectionPreview();
    renderActionPreview(actionModel, structuralPresentation);
    renderTimelinePins();
    renderTransport();
  }

  return {
    elements,
    formatTime,
    formatDuration,
    formatRange,
    setStatus,
    render,
    renderGuide,
    renderTransport,
    renderTimelinePins,
    invalidateTimelinePins,
    closePinClusterMenu,
    openPinClusterMenu,
    clusterAt,
    setPreviewAction(value) { previewAction = value; },
    setPreviewSection(value) { previewSectionId = value; }
  };
}
