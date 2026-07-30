// DOM projection layer. It derives presentation from state and does not own semantic transactions.
import {
  EPSILON,
  clamp,
  contains,
  getTargets,
  classifyRefineRelation,
  classifyRetainedRefineRelation,
  getActionRanges,
  refineBlockReason,
  RESOLUTION_BASIS
} from "./range-geometry.js";
import {
  PIN_KIND,
  SECTION_WEIGHT_VALUES,
  findPinAt,
  getPin,
  visiblePins,
  sectionsForPin,
  resolveSection,
  previousPin,
  nextPin,
  sortedSections,
  clusterPinsByPixels
} from "./guide.js";
import { projectionForModel } from "./timeline-projection.js";
import {
  TRANSPORT_KIND,
  isTransportActive
} from "./transport.js";
import {
  STEP_REACH_MODE,
  effectiveStepReach,
  projectPlayback,
  previewTransition
} from "./session.js";
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

export function packTimelineSectionLanes(entries, options = {}) {
  const timelineExtent = Number(options.timelineExtent);
  const requestedControlExtent = Math.max(
    0,
    Number(options.controlExtent) || 0
  );
  const controlExtent = Number.isFinite(timelineExtent)
    ? Math.min(requestedControlExtent, Math.max(0, timelineExtent))
    : requestedControlExtent;
  const controlHalf = controlExtent / 2;
  const laneEnds = [];
  for (const entry of entries) {
    const midpoint = (entry.projected.start + entry.projected.end) / 2;
    const controlCoordinate = Number.isFinite(timelineExtent)
      ? clamp(
          midpoint,
          controlHalf,
          Math.max(controlHalf, timelineExtent - controlHalf)
        )
      : midpoint;
    const visualStart = Math.min(
      entry.projected.start,
      controlCoordinate - controlHalf
    );
    const visualEnd = Math.max(
      entry.projected.end,
      controlCoordinate + controlHalf
    );
    let lane = laneEnds.findIndex(end =>
      visualStart > end + EPSILON
    );
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = Math.max(
      laneEnds[lane] ?? Number.NEGATIVE_INFINITY,
      visualEnd
    );
    entry.lane = lane;
    entry.controlCoordinate = controlCoordinate;
  }
  return { entries, laneCount: laneEnds.length };
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
  const focusedSectionId = () => (
    model().focus?.kind === "working-section"
      ? null
      : model().focus?.sectionId || null
  );
  const focusedProjection = () => {
    const focus = model().focus;
    if (!focus) return null;
    if (focus.kind === "working-section") {
      return {
        label: "Working Section",
        start: focus.extent?.start ?? model().range.start,
        end: focus.extent?.end ?? model().range.end
      };
    }
    return resolveSection(guide(), focus.sectionId);
  };
  const transportIs = kind => state().transport.kind === kind;

  function sectionLabel(section) {
    return section?.label?.trim() || `Section ${formatRange(section)}`;
  }

  function pinLabel(pin) {
    if (pin?.stopKind === "range-boundary") return pin.label;
    if (pin.label?.trim()) return pin.label.trim();
    const references = sectionsForPin(guide(), pin.id)
      .map(section => resolveSection(guide(), section))
      .filter(Boolean);
    if (references.length === 1) {
      const section = references[0];
      const role = section.startPinId === pin.id ? "Start" : "End";
      return `${role} of ${sectionLabel(section)}`;
    }
    if (references.length > 1) return `${references.length}-Section endpoint`;
    return pin.kind === PIN_KIND.ENDPOINT ? "Section endpoint" : "Unnamed Pin";
  }

  function timelineProjection() {
    if (state().rangeDragProjection) return state().rangeDragProjection;
    if (state().guideDrag?.moved && state().guideDrag.projection) {
      return state().guideDrag.projection;
    }
    return projectionForModel(model());
  }

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", isError);
  }

  function percent(time) {
    const projection = timelineProjection();
    if (!(projection.timelineExtent > 0)) return 0;
    const raw = clamp(
      (projection.sourceToTimeline(time) / projection.timelineExtent) * 100,
      0,
      100
    );
    return Math.round(raw * 1_000_000) / 1_000_000;
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

  function setStyleProperty(element, name, value) {
    if (typeof element.style?.setProperty === "function") {
      element.style.setProperty(name, value);
    } else if (element.style) {
      element.style[name] = value;
    }
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
      label.textContent = pinLabel(pin);
      const time = document.createElement("time");
      time.textContent = formatTime(pin.sourceT ?? pin.t);
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

  function sectionColor(sectionId) {
    let hash = 0;
    for (const character of String(sectionId || "")) {
      hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    }
    const palette = [
      "#52c7b8",
      "#8ea8ff",
      "#dc8cff",
      "#f19a63",
      "#d5bd55",
      "#70bcf4"
    ];
    return palette[Math.abs(hash) % palette.length];
  }

  function formatRulerTime(seconds) {
    return formatTime(seconds).replace(/\.000$/, "");
  }

  function renderTimelineRuler(projection) {
    const ruler = elements["timeline-ruler"];
    if (!ruler) return;
    ruler.replaceChildren();
    const width = Math.max(320, elements.timeline.clientWidth || 1);
    const divisions = clamp(Math.floor(width / 112), 4, 10);
    for (let index = 0; index <= divisions; index += 1) {
      const coordinate = projection.timelineExtent * index / divisions;
      const source = projection.timelineToSource(coordinate);
      const tick = document.createElement("span");
      tick.className = "timeline-ruler-tick";
      if (index === 0 || index === divisions) tick.classList.add("edge");
      tick.style.left = `${index / divisions * 100}%`;
      const label = document.createElement("time");
      label.textContent = formatRulerTime(source);
      tick.appendChild(label);
      ruler.appendChild(tick);
      if (index < divisions) {
        const minor = document.createElement("span");
        minor.className = "timeline-ruler-tick minor";
        minor.style.left = `${(index + 0.5) / divisions * 100}%`;
        ruler.appendChild(minor);
      }
    }

    for (const [role, source] of [
      ["start", range().start],
      ["end", range().end]
    ]) {
      const boundary = document.createElement("span");
      boundary.className = `timeline-range-guide ${role}`;
      boundary.style.left = `${percent(source)}%`;
      const label = document.createElement("time");
      label.textContent = `${role === "start" ? "Start" : "End"} ${formatRulerTime(source)}`;
      boundary.appendChild(label);
      ruler.appendChild(boundary);
    }
  }

  function renderTimelineSections(projection) {
    const sectionLane = elements["section-lane"];
    if (!sectionLane) return;
    sectionLane.replaceChildren();
    renderTimelineRuler(projection);
    const timelineWidth = Math.max(1, elements.timeline.clientWidth || 1);

    const entries = sortedSections(guide())
      .map(section => ({
        section,
        projected: projection.projectExtent(section)
      }))
      .filter(entry =>
        entry.projected
        && entry.projected.end - entry.projected.start > EPSILON
      )
      .sort((first, second) =>
        first.projected.start - second.projected.start
        || first.projected.end - second.projected.end
      );

    const packedSections = packTimelineSectionLanes(entries, {
      timelineExtent: projection.timelineExtent,
      controlExtent: projection.timelineExtent * 64 / timelineWidth
    });
    const sectionBandHeight = Math.max(
      32,
      16 + packedSections.laneCount * 24
    );
    const trackTop = sectionBandHeight + 12;
    const rulerTop = trackTop + 24;
    const pinTop = rulerTop + 40;
    const timelineHeight = pinTop + 40;
    setStyleProperty(elements.timeline, "--section-band-height", `${sectionBandHeight}px`);
    setStyleProperty(elements.timeline, "--track-top", `${trackTop}px`);
    setStyleProperty(elements.timeline, "--ruler-top", `${rulerTop}px`);
    setStyleProperty(elements.timeline, "--pin-top", `${pinTop}px`);
    setStyleProperty(elements.timeline, "--timeline-height", `${timelineHeight}px`);
    elements.timeline.style.height = `${timelineHeight}px`;

    for (const entry of packedSections.entries) {
      const { section, projected, lane, controlCoordinate } = entry;
      const color = sectionColor(section.id);
      const selected = state().selectedRetained?.kind === "section"
        && state().selectedRetained.id === section.id;
      const left = projected.start / Math.max(projection.timelineExtent, EPSILON) * 100;
      const width = (
        (projected.end - projected.start)
        / Math.max(projection.timelineExtent, EPSILON)
      ) * 100;
      const controlPosition = controlCoordinate
        / Math.max(projection.timelineExtent, EPSILON) * 100;
      const weight = section.weight;
      const strength = weight < 1
        ? Math.abs(Math.log2(weight)) / 2
        : Math.log2(weight);
      const span = document.createElement("span");
      span.className = "timeline-section-span";
      span.classList.add(
        weight < 1 - EPSILON
          ? "compressed"
          : weight > 1 + EPSILON
            ? "expanded"
            : "neutral"
      );
      if (selected) span.classList.add("retained-selected");
      span.style.left = `${left}%`;
      span.style.width = `${width}%`;
      setStyleProperty(span, "--section-color", color);
      setStyleProperty(span, "--section-lane", String(lane));
      setStyleProperty(span, "--weight-opacity", String(0.42 + strength * 0.45));
      span.setAttribute("aria-hidden", "true");

      const body = document.createElement("button");
      body.type = "button";
      body.className = "timeline-section-body";
      body.dataset.sectionDrag = section.id;
      body.style.left = `${left}%`;
      body.style.width = `${width}%`;
      setStyleProperty(body, "--section-color", color);
      setStyleProperty(body, "--section-lane", String(lane));
      if (selected) body.classList.add("retained-selected");
      body.setAttribute(
        "aria-label",
        `Select and move ${sectionLabel(section)}, ${formatRange(section)}`
      );
      body.title = `${sectionLabel(section)} · drag to translate its shared endpoint Pins`;

      const weightSelect = document.createElement("select");
      weightSelect.className = "timeline-section-weight";
      weightSelect.dataset.sectionWeight = section.id;
      weightSelect.style.left = `${controlPosition}%`;
      setStyleProperty(weightSelect, "--section-color", color);
      setStyleProperty(weightSelect, "--section-lane", String(lane));
      if (selected) weightSelect.classList.add("retained-selected");
      weightSelect.setAttribute(
        "aria-label",
        `${sectionLabel(section)} timeline weight`
      );
      weightSelect.title = `${sectionLabel(section)} · timeline weight`;
      for (const optionWeight of SECTION_WEIGHT_VALUES) {
        const option = document.createElement("option");
        option.value = String(optionWeight);
        option.textContent = `${optionWeight}×`;
        weightSelect.appendChild(option);
      }
      weightSelect.value = String(weight);
      sectionLane.append(span, body, weightSelect);
    }
  }

  function renderTimelinePins() {
    const width = Math.max(1, elements.timeline.clientWidth || 1);
    const activeRange = range();
    const projection = timelineProjection();
    const pins = visiblePins(guide())
      .filter(pin => contains(activeRange, pin.t))
      .map(pin => ({
        ...pin,
        sourceT: pin.t,
        t: projection.sourceToTimeline(pin.t)
      }));
    const sectionKey = sortedSections(guide())
      .map(section =>
        `${section.id}:${section.start}:${section.end}:${section.weight}:${section.label}`
      )
      .join(",");
    const selectedKey = [
      state().selectedRetained?.kind,
      state().selectedRetained?.id,
      ...(state().selectedPinIds || [])
    ].join(":");
    const pinKey = pins
      .map(pin => `${pin.id}:${pin.t}:${pin.label}`)
      .join(",");
    const intervalKey = interval()
      ? `${interval().start}:${interval().end}`
      : "none";
    const key = `${activeRange.start}|${activeRange.end}|${width}|${projection.timelineExtent}|${sectionKey}|${selectedKey}|${intervalKey}|${pinKey}`;
    if (key === renderedPinKey) return;
    renderedPinKey = key;
    closePinClusterMenu();
    elements["pin-lane"].replaceChildren();
    renderTimelineSections(projection);
    renderedClusters = clusterPinsByPixels(
      pins,
      projection.timelineExtent,
      width,
      18
    );

    renderedClusters.forEach((cluster, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timeline-pin";
      button.style.left = `${(cluster.x / width) * 100}%`;
      if (cluster.pins.length === 1) {
        const pin = cluster.pins[0];
        button.dataset.pinGo = pin.id;
        const endpointSections = sectionsForPin(guide(), pin.id)
          .map(section => resolveSection(guide(), section))
          .filter(Boolean);
        if (endpointSections.length) {
          button.classList.add("section-endpoint-pin");
          setStyleProperty(
            button,
            "--endpoint-color",
            sectionColor(endpointSections[0].id)
          );
        }
        if (state().selectedPinIds?.includes(pin.id)) {
          button.classList.add("pair-selected");
        }
        if (
          state().selectedRetained?.kind === "pin"
          && state().selectedRetained.id === pin.id
        ) button.classList.add("retained-selected");
        const description = `${pinLabel(pin)} at ${formatTime(pin.sourceT)}`;
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
          .map(pin => `${pinLabel(pin)} — ${formatTime(pin.sourceT ?? pin.t)}`)
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

    for (const id of ["pins-list-count", "header-pin-count"]) {
      elements[id].textContent = counts.pins;
    }
    for (const id of ["sections-list-count", "header-section-count"]) {
      elements[id].textContent = counts.sections;
    }
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
        if (section.weight < 1 - EPSILON) item.classList.add("compressed");
        else if (section.weight > 1 + EPSILON) item.classList.add("expanded");
        if (
          state().selectedRetained?.kind === "section"
          && state().selectedRetained.id === section.id
        ) item.classList.add("retained-selected");
        setStyleProperty(item, "--section-color", sectionColor(section.id));

        const main = document.createElement("button");
        main.type = "button";
        main.className = "guide-item-main";
        main.dataset.sectionGo = section.id;
        const title = document.createElement("span");
        title.className = "guide-item-title";
        title.textContent = `${sectionLabel(section)} · ${section.weight}× timeline`;
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
        const weightControl = document.createElement("label");
        weightControl.className = "guide-section-weight";
        const weightLabel = document.createElement("span");
        weightLabel.textContent = "Weight";
        const weightSelect = document.createElement("select");
        weightSelect.dataset.sectionWeight = section.id;
        weightSelect.setAttribute(
          "aria-label",
          `${sectionLabel(section)} timeline weight`
        );
        for (const optionWeight of SECTION_WEIGHT_VALUES) {
          const option = document.createElement("option");
          option.value = String(optionWeight);
          option.textContent = `${optionWeight}×`;
          weightSelect.appendChild(option);
        }
        weightSelect.value = String(section.weight);
        weightControl.append(weightLabel, weightSelect);
        const overwrite = document.createElement("button");
        overwrite.type = "button";
        overwrite.dataset.overwriteSection = section.id;
        overwrite.textContent = "Overwrite";
        overwrite.disabled = !interval();
        const rename = document.createElement("button");
        rename.type = "button";
        rename.dataset.renameSection = section.id;
        rename.textContent = "Rename";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.dataset.deleteSection = section.id;
        remove.textContent = "Delete";
        remove.className = "danger-text";
        actions.append(focus, weightControl, overwrite, rename, remove);

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
        if (state().selectedPinIds?.includes(pin.id)) {
          item.classList.add("pair-selected");
        }
        if (
          state().selectedRetained?.kind === "pin"
          && state().selectedRetained.id === pin.id
        ) item.classList.add("retained-selected");
        const main = document.createElement("button");
        main.type = "button";
        main.className = "guide-item-main";
        main.dataset.pinGo = pin.id;
        const title = document.createElement("span");
        title.className = "guide-item-title";
        title.textContent = pinLabel(pin);
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
        const select = document.createElement("button");
        select.type = "button";
        select.dataset.selectPin = pin.id;
        select.textContent = state().selectedPinIds?.includes(pin.id)
          ? "Unselect"
          : "Select";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.dataset.deletePin = pin.id;
        remove.textContent = "Delete";
        remove.className = "danger-text";
        const references = sectionsForPin(guide(), pin.id).length;
        if (references) {
          remove.textContent = "Delete…";
          remove.title = `Also dissolves ${references} referencing Section${references === 1 ? "" : "s"} after confirmation`;
        }
        actions.append(select, rename, remove);
        item.append(main, actions);
        elements["pins-list"].appendChild(item);
      }
    }

    invalidateTimelinePins();
    renderTimelinePins();
  }

  function renderActionPreview(previewResult, structural) {
    const predicted = previewResult?.changed
      ? previewResult.session.model
      : null;
    const previewResolution = predicted?.resolution || null;
    const removedInterval = previewAction === "release" ? interval() : null;
    const structuralExtent = structural?.[previewAction] || null;
    const previewInterval = predicted?.interval || removedInterval || structuralExtent;

    elements["preview-resolution-fill"].hidden = !previewResolution;
    elements["action-preview-fill"].hidden = !previewInterval;
    if (previewResolution) {
      setSegment(
        elements["preview-resolution-fill"],
        previewResolution.L,
        previewResolution.R
      );
    }
    if (previewInterval) {
      elements["action-preview-fill"].dataset.kind = previewAction;
      if (removedInterval) elements["action-preview-fill"].dataset.effect = "remove";
      else elements["action-preview-fill"].removeAttribute("data-effect");
      setSegment(
        elements["action-preview-fill"],
        previewInterval.start,
        previewInterval.end
      );
    } else {
      elements["action-preview-fill"].removeAttribute("data-kind");
      elements["action-preview-fill"].removeAttribute("data-effect");
    }

    const markerIds = [
      "preview-resolution-start-marker",
      "preview-resolution-end-marker",
      "preview-backward-target-marker",
      "preview-forward-target-marker",
      "preview-current-marker"
    ];
    for (const id of markerIds) elements[id].hidden = !previewResolution;
    if (!previewResolution) return;

    setMarkerPosition(
      elements["preview-resolution-start-marker"],
      previewResolution.L
    );
    setMarkerPosition(
      elements["preview-resolution-end-marker"],
      previewResolution.R
    );
    setMarkerPosition(elements["preview-current-marker"], previewResolution.C);
    const targets = getTargets(previewResolution, timelineProjection().metric);
    elements["preview-backward-target-marker"].hidden = targets.backward === null;
    elements["preview-forward-target-marker"].hidden = targets.forward === null;
    if (targets.backward !== null) {
      setMarkerPosition(elements["preview-backward-target-marker"], targets.backward);
    }
    if (targets.forward !== null) {
      setMarkerPosition(elements["preview-forward-target-marker"], targets.forward);
    }
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
    const transport = state().transport;
    const playbackProjection = transport.kind === TRANSPORT_KIND.PLAYBACK
      ? projectPlayback(model(), {
          current: cursor,
          departure: transport.departure,
          parentNeighborhood: transport.parentNeighborhood,
          parentResolutionBasis: transport.parentResolutionBasis,
          returnModel: transport.returnModel,
          cycles: transport.cycles || 0,
          operator: transport.operator
        })
      : null;
    const livePlayback = Boolean(playbackProjection?.changed);
    const projectedModel = livePlayback ? playbackProjection.model : model();
    for (const id of [
      "resolution-fill",
      "interval-fill",
      "resolution-start-marker",
      "resolution-end-marker"
    ]) {
      elements[id].dataset.live = String(livePlayback);
    }
    if (state().videoLoaded && projectedModel?.resolution) {
      setSegment(
        elements["resolution-fill"],
        projectedModel.resolution.L,
        projectedModel.resolution.R
      );
      setMarkerPosition(elements["resolution-start-marker"], projectedModel.resolution.L);
      setMarkerPosition(elements["resolution-end-marker"], projectedModel.resolution.R);
      elements["interval-fill"].hidden = !projectedModel.interval;
      if (projectedModel.interval) {
        setSegment(
          elements["interval-fill"],
          projectedModel.interval.start,
          projectedModel.interval.end
        );
      }
      if (livePlayback) {
        elements["backward-target-marker"].hidden = true;
        elements["forward-target-marker"].hidden = true;
      } else {
        const projectedTargets = getTargets(
          projectedModel.resolution,
          timelineProjection().metric
        );
        elements["backward-target-marker"].hidden = projectedTargets.backward === null;
        elements["forward-target-marker"].hidden = projectedTargets.forward === null;
        if (projectedTargets.backward !== null) {
          setMarkerPosition(elements["backward-target-marker"], projectedTargets.backward);
        }
        if (projectedTargets.forward !== null) {
          setMarkerPosition(elements["forward-target-marker"], projectedTargets.forward);
        }
      }
    }
    const surface = elements["center-transport-surface"];
    if (surface) {
      const currentState = state();
      const transportKind = currentState.transport.kind;
      const contextObservation = transportKind === TRANSPORT_KIND.CONTEXT;
      const ordinaryPlayback = transportKind === TRANSPORT_KIND.PLAYBACK;
      const centerRunning = [YOUTUBE_STATE.PLAYING, YOUTUBE_STATE.BUFFERING].includes(currentState.playerState);
      // Ordinary playback exposes YouTube's native controls after the trusted
      // parent-page start gesture. Paused/idle Center and composite transports
      // keep the parent surface so the next action remains synchronously shared.
      const surfaceOwnsPointer = currentState.videoLoaded && (!ordinaryPlayback || !centerRunning);
      surface.hidden = !surfaceOwnsPointer;
      const activation = currentState.field?.activation || null;
      const preparing = Boolean(activation && !activation.ready);
      surface.disabled = !currentState.videoLoaded || preparing;
      const label = contextObservation
        ? "Set Current Here"
        : ordinaryPlayback
          ? "Pause Field"
          : "Play Field";
      surface.setAttribute("aria-label", preparing ? "Preparing Field players" : label);
      surface.setAttribute("aria-pressed", String(ordinaryPlayback));
      if (elements["center-transport-label"]) {
        elements["center-transport-label"].textContent = preparing ? "Preparing Field players" : label;
      }
      if (elements["center-transport-icon"]) {
        elements["center-transport-icon"].textContent = (
          contextObservation || ordinaryPlayback
        ) ? "■" : "▶";
      }
    }

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
    const shiftLayer = currentState.shiftLayer || currentState.shiftKeyHeld;
    const activeRange = range();
    const currentResolution = resolution();
    const currentInterval = interval();
    const projection = timelineProjection();
    const field = currentState.field;
    const fieldSpan = field?.span?.held && field.span.available
      ? { start: field.span.start, end: field.span.end }
      : null;
    const semanticCurrent = currentResolution?.C ?? 0;
    const configuredReach = model().stepReach;
    const effectiveReach = effectiveStepReach(
      configuredReach,
      activeRange,
      projection
    );
    const targets = currentResolution
      ? getTargets(currentResolution, projection.metric)
      : { backward: null, forward: null };
    const actionModel = currentResolution
      ? getActionRanges(
          currentResolution,
          activeRange,
          currentInterval,
          semanticCurrent,
          effectiveReach,
          projection.metric
        )
      : null;
    const previous = currentResolution
      ? previousPin(guide(), semanticCurrent, activeRange, projection)
      : null;
    const next = currentResolution
      ? nextPin(guide(), semanticCurrent, activeRange, projection)
      : null;
    const switchFrame = currentInterval?.departureFrame?.resolution;
    const selectedForPreview = currentState.selectedRetained?.kind === "section"
      ? resolveSection(guide(), currentState.selectedRetained.id)
      : null;
    const structuralPresentation = currentResolution ? {
      previousPin: previous ? { start: previous.t, end: semanticCurrent } : null,
      nextPin: next ? { start: semanticCurrent, end: next.t } : null,
      stepBackward: shiftLayer && previous
        ? { start: previous.t, end: semanticCurrent }
        : null,
      stepForward: shiftLayer && next
        ? { start: semanticCurrent, end: next.t }
        : null,
      switchEndpoint: switchFrame
        ? { start: switchFrame.L, end: switchFrame.R }
        : currentInterval,
      release: currentInterval,
      deform: currentInterval || selectedForPreview,
      focus: currentInterval || selectedForPreview
    } : null;
    let resolvedPreviewAction = previewAction;
    if (shiftLayer && previewAction === "refineBackward") {
      resolvedPreviewAction = "localRefineBackward";
    } else if (shiftLayer && previewAction === "refineForward") {
      resolvedPreviewAction = "localRefineForward";
    } else if (shiftLayer && previewAction === "stepBackward") {
      resolvedPreviewAction = "pinBackward";
    } else if (shiftLayer && previewAction === "stepForward") {
      resolvedPreviewAction = "pinForward";
    }
    const previewDirection = resolvedPreviewAction?.endsWith("Backward")
      ? "backward"
      : "forward";
    const previewPin = previewDirection === "backward" ? previous : next;
    const previewResult = resolvedPreviewAction
      ? previewTransition(currentState.session, resolvedPreviewAction, {
          seconds: effectiveReach[previewDirection],
          destination: previewPin?.t
        })
      : null;
    const focused = focusedProjection();

    elements["duration-time"].textContent = Math.abs(
      projection.timelineExtent - model().duration
    ) > EPSILON
      ? `${formatTime(projection.timelineExtent)} spatial · ${formatTime(model().duration)} source`
      : formatTime(model().duration);
    elements["range-label"].textContent = loaded ? formatRange(activeRange) : "—";
    const resolutionTimelineExtent = currentResolution
      ? projection.timelineDistance(currentResolution.L, currentResolution.R)
      : null;
    const resolutionSourceDuration = currentResolution
      ? currentResolution.R - currentResolution.L
      : null;
    elements["resolution-label"].textContent = currentResolution
      ? `${
          formatDuration(resolutionTimelineExtent)
        }${
          Math.abs(resolutionSourceDuration - resolutionTimelineExtent) > EPSILON
            ? ` spatial · ${formatDuration(resolutionSourceDuration)} source`
            : ""
        } · ${
          currentState.session.model.resolutionBasis === RESOLUTION_BASIS.MOVEMENT
            ? "Movement scale"
            : "Range scale"
        }`
      : "—";
    elements["pin-current-position"].textContent = currentResolution ? `Current ${formatTime(semanticCurrent)}` : "Current —";
    elements["context-setting-value"].textContent = currentState.contextSeconds > 0
      ? `${currentState.contextSeconds} s centered on Current`
      : "Off";

    const fieldOffsets = currentState.fieldOffsets
      || { backward: 10, forward: 10 };
    elements["step-backward-seconds"].value = String(fieldOffsets.backward);
    elements["step-forward-seconds"].value = String(fieldOffsets.forward);
    elements["step-size-seconds"].value = String(configuredReach.forward);
    const adaptiveStep = configuredReach.mode === STEP_REACH_MODE.ADAPTIVE;
    elements["step-size-summary"].textContent = adaptiveStep
      ? `1/${Math.round(1 / configuredReach.fraction)} Range${
          loaded ? ` · ${formatDuration(effectiveReach.forward)}` : ""
        }`
      : `${formatDuration(configuredReach.forward)} manual`;
    elements["step-mode-fixed"].setAttribute("aria-pressed", String(!adaptiveStep));
    elements["step-mode-adaptive"].setAttribute("aria-pressed", String(adaptiveStep));
    elements["step-size-seconds"].disabled = adaptiveStep;
    for (const control of document.querySelectorAll("[data-step-fraction]")) {
      const selected = Math.abs(
        Number(control.dataset.stepFraction) - configuredReach.fraction
      ) <= Number.EPSILON;
      control.setAttribute("aria-pressed", String(selected));
      control.disabled = false;
    }

    elements["shift-layer-toggle"].setAttribute("aria-pressed", String(shiftLayer));
    elements["shift-layer-state"].textContent = shiftLayer ? "On" : "Off";
    elements["refine-backward-label"].textContent = shiftLayer
      ? "Local Refine Backward"
      : "Refine Backward";
    elements["refine-forward-label"].textContent = shiftLayer
      ? "Local Refine Forward"
      : "Refine Forward";
    elements["step-backward-label"].textContent = shiftLayer
      ? "Pin Backward"
      : "Step Backward";
    elements["step-forward-label"].textContent = shiftLayer
      ? "Pin Forward"
      : "Step Forward";
    elements["refine-backward"].classList.toggle("shifted-action", shiftLayer);
    elements["refine-forward"].classList.toggle("shifted-action", shiftLayer);
    elements["step-backward"].classList.toggle("shifted-action", shiftLayer);
    elements["step-forward"].classList.toggle("shifted-action", shiftLayer);

    let sectionKind = elements["section-source"].value || "interval";
    const selectedPins = (currentState.selectedPinIds || [])
      .map(id => getPin(guide(), id))
      .filter(Boolean)
      .sort((first, second) => first.t - second.t);
    const selectedPinExtent = selectedPins.length === 2
      ? { start: selectedPins[0].t, end: selectedPins[1].t }
      : null;
    let sectionExtent = sectionKind === "field-span"
      ? fieldSpan
      : sectionKind === "selected-pins"
        ? selectedPinExtent
        : currentInterval;
    const sourceOptions = [...elements["section-source"].options];
    const fieldOption = sourceOptions.find(option => option.value === "field-span");
    if (fieldOption) fieldOption.disabled = !fieldSpan;
    const selectedPinsOption = sourceOptions.find(option => option.value === "selected-pins");
    if (selectedPinsOption) selectedPinsOption.disabled = !selectedPinExtent;
    if (sectionKind === "field-span" && !fieldSpan && currentInterval) {
      elements["section-source"].value = "interval";
      sectionKind = "interval";
      sectionExtent = currentInterval;
    }
    if (sectionKind === "selected-pins" && !selectedPinExtent && currentInterval) {
      elements["section-source"].value = "interval";
      sectionKind = "interval";
      sectionExtent = currentInterval;
    }
    elements["section-window"].textContent = sectionExtent
      ? `${
          sectionKind === "field-span"
            ? "Field"
            : sectionKind === "selected-pins"
              ? "Selected Pins"
              : "Working Section"
        } ${formatRange(sectionExtent)}`
      : `No ${
          sectionKind === "field-span"
            ? "Held Field span"
            : sectionKind === "selected-pins"
              ? "two selected Pins"
              : "Working Section"
        }`;

    elements["focused-section"].hidden = !focused;
    if (focused) {
      elements["focused-section-title"].textContent = focused.label?.trim()
        || (focusedSectionId() ? sectionLabel(focused) : "Working Section");
      elements["focused-section-range"].textContent = formatRange(focused);
    } else {
      elements["focused-section-title"].textContent = "—";
      elements["focused-section-range"].textContent = "—";
    }

    const interactionLocked = !loaded;
    for (const id of [
      "go-range-start", "range-start-here", "range-midpoint",
      "go-range-end", "range-end-here", "full-video-range",
      "step-backward-seconds", "step-forward-seconds",
      "context-seconds",
      "section-source", "section-label", "pin-label"
    ]) {
      if (elements[id]) elements[id].disabled = interactionLocked;
    }

    elements["save-section"].disabled = interactionLocked || !sectionExtent;
    const workingFocus = model().focus?.kind === "working-section";
    const workingAlreadyOwnsRange = workingFocus
      && currentInterval
      && Math.abs(activeRange.start - currentInterval.start) <= EPSILON
      && Math.abs(activeRange.end - currentInterval.end) <= EPSILON;
    elements["focus-working-section"].textContent = workingFocus
      ? "Refocus Working"
      : "Focus Working";
    elements["focus-working-section"].disabled = interactionLocked
      || sectionKind !== "interval"
      || !currentInterval
      || workingAlreadyOwnsRange;
    elements["leave-section"].disabled = interactionLocked || !focused;
    for (const control of elements["sections-list"].querySelectorAll?.("[data-overwrite-section]") || []) {
      control.disabled = interactionLocked || !currentInterval;
    }
    elements["refine-backward"].disabled = interactionLocked || targets.backward === null;
    elements["refine-forward"].disabled = interactionLocked || targets.forward === null;
    elements.reopen.disabled = interactionLocked || !actionModel?.reopen;
    elements["return-action"].disabled = !loaded || !currentState.session.history.length;
    elements["redo-action"].disabled = !loaded || !(currentState.session.future || []).length;
    elements["switch-endpoint"].disabled = interactionLocked || !currentInterval;
    elements["step-backward"].disabled = interactionLocked
      || (shiftLayer ? !previous : !actionModel?.stepBackward);
    elements["step-forward"].disabled = interactionLocked
      || (shiftLayer ? !next : !actionModel?.stepForward);
    elements.release.disabled = interactionLocked || !currentInterval;
    const selectedSection = currentState.selectedRetained?.kind === "section"
      ? resolveSection(guide(), currentState.selectedRetained.id)
      : null;
    elements.deform.disabled = interactionLocked || !(
      currentInterval
      || selectedSection
    );
    elements["deform-weight-select"].disabled = interactionLocked;
    elements["focus-toggle"].disabled = interactionLocked || !(
      focused
      || currentInterval
      || selectedSection
    );
    elements["shift-layer-toggle"].disabled = interactionLocked;

    const currentPin = currentResolution ? findPinAt(guide(), semanticCurrent) : null;
    const alreadyPinned = currentPin?.kind === PIN_KIND.EXPLICIT;
    elements["pin-current"].disabled = interactionLocked || (alreadyPinned && !elements["pin-label"].value.trim());
    elements["focus-toggle-label"].textContent = focused ? "Unfocus" : "Focus";

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
      || projection.timelineDistance(
        semanticCurrent,
        projection.timelineMidpoint(activeRange.start, activeRange.end)
      ) <= EPSILON;
    elements["go-range-start"].disabled = interactionLocked
      || Math.abs(semanticCurrent - activeRange.start) <= EPSILON;
    elements["go-range-end"].disabled = interactionLocked
      || Math.abs(semanticCurrent - activeRange.end) <= EPSILON;

    elements["return-meta"].textContent = currentState.session.history.length
      ? currentState.session.history.at(-1).label
      : "Nothing to undo";
    elements["redo-meta"].textContent = (currentState.session.future || []).length
      ? currentState.session.future.at(-1).label
      : "Nothing to redo";
    const destinationFrame = currentInterval?.departureFrame;
    const destinationScale = destinationFrame?.resolution
      ? formatDuration(destinationFrame.resolution.R - destinationFrame.resolution.L)
      : null;
    setActionMeta(
      "switch-endpoint",
      "switch-endpoint-meta",
      "Switch Endpoint",
      currentInterval
        ? `to ${formatTime(currentInterval.departure)}${destinationScale ? ` · ${destinationScale} ${destinationFrame.resolutionBasis === RESOLUTION_BASIS.RANGE ? "Range" : "movement"} scale` : ""}`
        : "No Interval"
    );
    const backwardBlock = currentResolution
      ? refineBlockReason(currentResolution, activeRange, "backward", projection.metric)
      : null;
    const forwardBlock = currentResolution
      ? refineBlockReason(currentResolution, activeRange, "forward", projection.metric)
      : null;
    setActionMeta(
      "refine-backward",
      "backward-meta",
      "Refine Backward",
      targets.backward === null
        ? backwardBlock === "resolution-limit" ? "Resolution limit" : "Range start"
        : shiftLayer
          ? `${classifyRefineRelation(currentInterval, semanticCurrent, targets.backward)} Interval · to ${formatTime(targets.backward)}`
          : `${classifyRetainedRefineRelation(currentInterval, semanticCurrent, targets.backward) === "full" ? "full movement" : "retain anchor"} · to ${formatTime(targets.backward)}`
    );
    setActionMeta(
      "refine-forward",
      "forward-meta",
      "Refine Forward",
      targets.forward === null
        ? forwardBlock === "resolution-limit" ? "Resolution limit" : "Range end"
        : shiftLayer
          ? `${classifyRefineRelation(currentInterval, semanticCurrent, targets.forward)} Interval · to ${formatTime(targets.forward)}`
          : `${classifyRetainedRefineRelation(currentInterval, semanticCurrent, targets.forward) === "full" ? "full movement" : "retain anchor"} · to ${formatTime(targets.forward)}`
    );
    elements["reopen-meta"].textContent = actionModel?.reopen
      ? `${formatDuration(
          projection.timelineDistance(activeRange.start, activeRange.end)
        )} spatial extent available`
      : "Range-level resolution";
    elements["step-backward-meta"].textContent = actionModel?.stepBackward
      ? shiftLayer
        ? previous
          ? `${formatTime(previous.t)} · ${pinLabel(previous)}`
          : "No Pin backward"
        : `${formatDuration(effectiveReach.backward)} · to ${formatTime(actionModel.stepBackward.destination)}`
      : shiftLayer && previous
        ? `${formatTime(previous.t)} · ${pinLabel(previous)}`
        : "Range start";
    elements["step-forward-meta"].textContent = actionModel?.stepForward
      ? shiftLayer
        ? next
          ? `${formatTime(next.t)} · ${pinLabel(next)}`
          : "No Pin forward"
        : `${formatDuration(effectiveReach.forward)} · to ${formatTime(actionModel.stepForward.destination)}`
      : shiftLayer && next
        ? `${formatTime(next.t)} · ${pinLabel(next)}`
        : "Range end";
    elements["release-meta"].textContent = currentInterval
      ? formatRange(currentInterval)
      : "No Interval";
    const deformTarget = currentInterval || selectedSection;
    elements["deform-meta"].textContent = deformTarget
      ? `${elements["deform-weight-select"].value}× · ${formatRange(deformTarget)}`
      : "No target";
    elements["focus-toggle-meta"].textContent = focused
      ? `restore ${formatRange(model().focus.returnRange)}`
      : currentInterval
        ? formatRange(currentInterval)
        : selectedSection
          ? formatRange(selectedSection)
          : "No target";

    if (!loaded || !currentResolution) {
      for (const id of [
        "range-start-handle", "range-end-handle", "resolution-start-marker",
        "resolution-end-marker", "backward-target-marker", "forward-target-marker", "current-marker", "cursor-marker"
      ]) elements[id].hidden = true;
      elements["interval-fill"].hidden = true;
      elements["field-span-fill"].hidden = true;
      elements["section-preview-fill"].hidden = true;
      elements["preview-resolution-fill"].hidden = true;
      elements["action-preview-fill"].hidden = true;
      for (const id of [
        "preview-resolution-start-marker",
        "preview-resolution-end-marker",
        "preview-backward-target-marker",
        "preview-forward-target-marker",
        "preview-current-marker"
      ]) elements[id].hidden = true;
      renderTimelinePins();
      renderTransport();
      return;
    }

    for (const id of [
      "range-start-handle", "range-end-handle", "resolution-start-marker",
      "resolution-end-marker", "current-marker"
    ]) elements[id].hidden = false;
    setSegment(elements["range-fill"], activeRange.start, activeRange.end);
    setMarkerPosition(elements["range-start-handle"], activeRange.start);
    setMarkerPosition(elements["range-end-handle"], activeRange.end);
    setMarkerPosition(elements["current-marker"], semanticCurrent);

    elements["range-start-handle"].setAttribute("aria-valuemin", "0");
    elements["range-start-handle"].setAttribute("aria-valuemax", String(Math.max(0, activeRange.end - minRangeSeconds)));
    elements["range-start-handle"].setAttribute("aria-valuenow", String(activeRange.start));
    elements["range-start-handle"].setAttribute("aria-valuetext", `${formatTime(activeRange.start)}; Range begins`);
    elements["range-end-handle"].setAttribute("aria-valuemin", String(Math.min(model().duration, activeRange.start + minRangeSeconds)));
    elements["range-end-handle"].setAttribute("aria-valuemax", String(model().duration));
    elements["range-end-handle"].setAttribute("aria-valuenow", String(activeRange.end));
    elements["range-end-handle"].setAttribute("aria-valuetext", `${formatTime(activeRange.end)}; Range ends`);

    elements["field-span-fill"].hidden = !fieldSpan;
    if (fieldSpan) setSegment(elements["field-span-fill"], fieldSpan.start, fieldSpan.end);
    renderSectionPreview();
    renderActionPreview(previewResult, structuralPresentation);
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
