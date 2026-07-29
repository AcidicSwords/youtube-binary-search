// DOM projection layer. It derives presentation from state and does not own semantic transactions.
import {
  EPSILON,
  clamp,
  contains,
  getTargets,
  classifyRefineRelation,
  getActionRanges,
  refineBlockReason,
  RESOLUTION_BASIS
} from "./range-geometry.js";
import {
  PIN_KIND,
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
import { projectionForModel } from "./temporal-projection.js";
import {
  TRANSPORT_KIND,
  isTransportActive,
  transportMaterializedExtents
} from "./transport.js";
import { projectPlayback } from "./session.js";
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

  function pinLabel(pin) {
    if (pin.label?.trim()) return pin.label.trim();
    const references = sectionsForPin(guide(), pin.id)
      .map(section => resolveSection(guide(), section))
      .filter(Boolean);
    if (references.length === 1) {
      const section = references[0];
      const role = section.startPinId === pin.id ? "Start" : "End";
      return `${role} of ${section.label}`;
    }
    if (references.length > 1) return `${references.length}-Section endpoint`;
    return pin.kind === PIN_KIND.ENDPOINT ? "Section endpoint" : "Unnamed Pin";
  }

  function timelineProjection() {
    if (state().rangeDragProjection) return state().rangeDragProjection;
    if (state().guideDrag?.moved && state().guideDrag.projection) {
      return state().guideDrag.projection;
    }
    return projectionForModel(model(), {
      expandedExtents: transportMaterializedExtents(
        state().transport,
        range()
      )
    });
  }

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", isError);
  }

  function percent(time) {
    const projection = timelineProjection();
    if (!(projection.effectiveDuration > 0)) return 0;
    const raw = clamp(
      (projection.sourceToTraversal(time) / projection.effectiveDuration) * 100,
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

  function sectionDepth(section, sections) {
    return sections.filter(other =>
      other.id !== section.id
      && other.start <= section.start + EPSILON
      && other.end >= section.end - EPSILON
      && (
        other.start < section.start - EPSILON
        || other.end > section.end + EPSILON
      )
    ).length;
  }

  function renderTimelineSections(projection) {
    const lane = elements["section-lane"];
    if (!lane) return;
    lane.replaceChildren();
    const sections = sortedSections(guide());
    const activeIds = new Set(
      projection.folds.flatMap(fold => fold.sectionIds)
    );
    const renderedFolds = new Set();

    for (const section of sections) {
      const coveringFold = projection.folds.find(fold =>
        section.start >= fold.start - EPSILON
        && section.end <= fold.end + EPSILON
        && !fold.sectionIds.includes(section.id)
      );
      if (coveringFold) continue;

      const color = sectionColor(section.id);
      const depth = Math.min(4, sectionDepth(section, sections));
      if (activeIds.has(section.id)) {
        const fold = projection.folds.find(item =>
          item.sectionIds.includes(section.id)
        );
        if (renderedFolds.has(fold)) continue;
        renderedFolds.add(fold);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "timeline-section-pin";
        button.dataset.sectionExpand = section.id;
        button.dataset.sectionExpandGroup = fold.sectionIds.join(",");
        button.style.left = `${(
          fold.traversal / Math.max(projection.effectiveDuration, EPSILON)
        ) * 100}%`;
        setStyleProperty(button, "--section-color", color);
        setStyleProperty(button, "--section-depth", String(depth));
        if (
          state().selectedRetained?.kind === "section"
          && fold.sectionIds.includes(state().selectedRetained.id)
        ) {
          button.classList.add("retained-selected");
        }
        button.setAttribute(
          "aria-label",
          fold.sectionIds.length > 1
            ? `Expand ${fold.sectionIds.length} coincident Sections, ${formatRange(section)}`
            : `Expand Section ${section.label}, ${formatRange(section)}`
        );
        const foldedLabel = fold.sectionIds.length > 1
          ? `${fold.sectionIds.length} coincident Sections`
          : section.label;
        button.title = `${foldedLabel} · folded ${formatRange(section)}\nClick to expand; drag to translate the retained subtree.`;
        const label = document.createElement("span");
        label.className = "timeline-section-pin-label";
        label.textContent = foldedLabel;
        button.appendChild(label);
        lane.appendChild(button);
        continue;
      }

      const projected = projection.projectExtent(section);
      if (!projected || projected.end - projected.start <= EPSILON) continue;
      const span = document.createElement("span");
      span.className = "timeline-section-span";
      if (section.collapsed) span.classList.add("materialized");
      if (
        state().selectedRetained?.kind === "section"
        && state().selectedRetained.id === section.id
      ) {
        span.classList.add("retained-selected");
      }
      span.style.left = `${(
        projected.start / Math.max(projection.effectiveDuration, EPSILON)
      ) * 100}%`;
      span.style.width = `${(
        (projected.end - projected.start)
        / Math.max(projection.effectiveDuration, EPSILON)
      ) * 100}%`;
      setStyleProperty(span, "--section-color", color);
      setStyleProperty(span, "--section-depth", String(depth));
      span.setAttribute("aria-hidden", "true");

      const midpoint = projection.sourceMidpoint(section.start, section.end);
      const midpointPosition = `${(
        projection.sourceToTraversal(midpoint)
        / Math.max(projection.effectiveDuration, EPSILON)
      ) * 100}%`;
      if (section.collapsed) {
        const materialized = document.createElement("span");
        materialized.className = "timeline-section-materialized";
        materialized.style.left = midpointPosition;
        setStyleProperty(materialized, "--section-color", color);
        setStyleProperty(materialized, "--section-depth", String(depth));
        materialized.setAttribute("aria-hidden", "true");
        materialized.title = `“${section.label}” remains folded and will return to one Section Pin when materialization ends.`;
        lane.append(span, materialized);
      } else {
        const collapse = document.createElement("button");
        collapse.type = "button";
        collapse.className = "timeline-section-fold";
        if (
          state().selectedRetained?.kind === "section"
          && state().selectedRetained.id === section.id
        ) {
          collapse.classList.add("retained-selected");
        }
        collapse.dataset.sectionCollapse = section.id;
        collapse.style.left = midpointPosition;
        setStyleProperty(collapse, "--section-color", color);
        setStyleProperty(collapse, "--section-depth", String(depth));
        collapse.setAttribute(
          "aria-label",
          `Fold Section ${section.label} into one Section Pin`
        );
        collapse.title = `Fold “${section.label}”`;
        lane.append(span, collapse);
      }
    }
  }

  function renderTimelinePins() {
    const width = Math.max(1, elements.timeline.clientWidth || 1);
    const activeRange = range();
    const projection = timelineProjection();
    const semanticProjection = projectionForModel(model());
    const pins = visiblePins(guide())
      .filter(pin => contains(activeRange, pin.t))
      .filter(pin => !projection.foldAtSource(pin.t))
      .map(pin => ({
        ...pin,
        sourceT: pin.t,
        t: projection.sourceToTraversal(pin.t),
        retainedFold: semanticProjection.foldAtSource(pin.t)
      }));
    const sectionKey = sortedSections(guide())
      .map(section =>
        `${section.id}:${section.start}:${section.end}:${section.collapsed}:${section.label}`
      )
      .join(",");
    const selectedKey = [
      state().selectedRetained?.kind,
      state().selectedRetained?.id,
      ...(state().selectedPinIds || [])
    ].join(":");
    const foldKey = projection.folds
      .map(fold => `${fold.start}:${fold.end}:${fold.sectionIds.join("+")}`)
      .join(",");
    const pinKey = pins
      .map(pin =>
        `${pin.id}:${pin.t}:${pin.label}:${
          pin.retainedFold?.sectionIds?.join("+") || ""
        }`
      )
      .join(",");
    const key = `${activeRange.start}|${activeRange.end}|${width}|${projection.effectiveDuration}|${foldKey}|${sectionKey}|${selectedKey}|${pinKey}`;
    if (key === renderedPinKey) return;
    renderedPinKey = key;
    closePinClusterMenu();
    elements["pin-lane"].replaceChildren();
    renderTimelineSections(projection);
    renderedClusters = clusterPinsByPixels(
      pins,
      projection.effectiveDuration,
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
        if (pin.retainedFold) {
          button.classList.add("transport-materialized");
        }
        if (state().selectedPinIds?.includes(pin.id)) {
          button.classList.add("pair-selected");
        }
        if (
          state().selectedRetained?.kind === "pin"
          && state().selectedRetained.id === pin.id
        ) button.classList.add("retained-selected");
        const description = `${pinLabel(pin)} at ${formatTime(pin.sourceT)}${
          pin.retainedFold
            ? `; retained inside folded Section ${pin.retainedFold.sections[0]?.label || "Section"}`
            : ""
        }`;
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
    const structuralProjection = projectionForModel(model());
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
        const activeFold = structuralProjection.folds.find(fold =>
          fold.sectionIds.includes(section.id)
        );
        const coveringFold = structuralProjection.folds.find(fold =>
          section.start >= fold.start - EPSILON
          && section.end <= fold.end + EPSILON
          && !fold.sectionIds.includes(section.id)
        );
        const materialized = section.collapsed && !activeFold && !coveringFold;
        const item = document.createElement("article");
        item.className = "guide-item section-item";
        item.dataset.sectionPreviewId = section.id;
        if (section.id === focusedId) item.classList.add("focused");
        if (section.collapsed) item.classList.add("collapsed");
        if (materialized) item.classList.add("materialized");
        if (
          state().selectedRetained?.kind === "section"
          && state().selectedRetained.id === section.id
        ) item.classList.add("retained-selected");

        const main = document.createElement("button");
        main.type = "button";
        main.className = "guide-item-main";
        main.dataset.sectionGo = section.id;
        const title = document.createElement("span");
        title.className = "guide-item-title";
        const projectionNote = activeFold
          ? "Folded"
          : coveringFold
            ? `Inside ${coveringFold.sections[0]?.label || "folded Section"}`
            : materialized
              ? "Materialized"
              : "";
        title.textContent = `${section.label}${projectionNote ? ` · ${projectionNote}` : ""}`;
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
        const loop = document.createElement("button");
        loop.type = "button";
        loop.dataset.loopSection = section.id;
        loop.textContent = "Loop";
        const fold = document.createElement("button");
        fold.type = "button";
        if (section.collapsed) {
          fold.dataset.expandSection = section.id;
          fold.textContent = "Expand";
        } else {
          fold.dataset.collapseSection = section.id;
          fold.textContent = "Fold";
        }
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
        actions.append(focus, loop, fold, overwrite, rename, remove);

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
        const containingFold = structuralProjection.foldAtSource(pin.t);
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
        time.textContent = `${formatTime(pin.t)}${
          containingFold
            ? ` · inside ${containingFold.sections[0]?.label || "folded Section"}`
            : ""
        }`;
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
        remove.disabled = references > 0;
        if (references) {
          remove.title = `Used by ${references} Section${references === 1 ? "" : "s"}`;
        }
        actions.append(select, rename, remove);
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

    const transport = state().transport;
    const playbackProjection = transport.kind === TRANSPORT_KIND.PLAYBACK
      ? projectPlayback(model(), {
          current: cursor,
          departure: transport.departure,
          parentNeighborhood: transport.parentNeighborhood,
          parentResolutionBasis: transport.parentResolutionBasis,
          returnModel: transport.returnModel,
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
      const label = transportKind === TRANSPORT_KIND.LOOP
        ? "Stop Loop"
        : contextObservation
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
          transportKind === TRANSPORT_KIND.LOOP || contextObservation || ordinaryPlayback
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
    const activeRange = range();
    const currentResolution = resolution();
    const currentInterval = interval();
    const projection = timelineProjection();
    const field = currentState.field;
    const fieldSpan = field?.span?.held && field.span.available
      ? { start: field.span.start, end: field.span.end }
      : null;
    const loopActive = transportIs(TRANSPORT_KIND.LOOP);
    const semanticCurrent = currentResolution?.C ?? 0;
    const targets = currentResolution
      ? getTargets(currentResolution, projection.metric)
      : { backward: null, forward: null };
    const actionModel = currentResolution
      ? getActionRanges(
          currentResolution,
          activeRange,
          currentInterval,
          semanticCurrent,
          currentState.session.model.stepReach,
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
    const structuralPresentation = currentResolution ? {
      previousPin: previous ? { start: previous.t, end: semanticCurrent } : null,
      nextPin: next ? { start: semanticCurrent, end: next.t } : null,
      switchEndpoint: switchFrame
        ? { start: switchFrame.L, end: switchFrame.R }
        : currentInterval,
      loop: currentInterval
    } : null;
    const focused = focusedProjection();

    elements["duration-time"].textContent = projection.effectiveDuration < model().duration - EPSILON
      ? `${formatTime(projection.effectiveDuration)} traversal · ${formatTime(model().duration)} source`
      : formatTime(model().duration);
    elements["range-label"].textContent = loaded ? formatRange(activeRange) : "—";
    const resolutionTraversalDuration = currentResolution
      ? projection.sourceDistance(currentResolution.L, currentResolution.R)
      : null;
    const resolutionSourceDuration = currentResolution
      ? currentResolution.R - currentResolution.L
      : null;
    elements["resolution-label"].textContent = currentResolution
      ? `${
          formatDuration(resolutionTraversalDuration)
        }${
          resolutionSourceDuration - resolutionTraversalDuration > EPSILON
            ? ` traversal · ${formatDuration(resolutionSourceDuration)} source`
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

    const stepReach = currentState.session.model.stepReach || { backward: 10, forward: 10, linked: false };
    elements["step-backward-seconds"].value = String(stepReach.backward);
    elements["step-forward-seconds"].value = String(stepReach.forward);

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
      elements["focused-section-title"].textContent = focused.label;
      elements["focused-section-range"].textContent = formatRange(focused);
    } else {
      elements["focused-section-title"].textContent = "—";
      elements["focused-section-range"].textContent = "—";
    }

    const interactionLocked = !loaded;
    for (const id of [
      "range-start-here", "range-midpoint", "range-end-here", "full-video-range",
      "step-backward-seconds", "step-forward-seconds",
      "context-seconds",
      "section-source", "section-label", "pin-label"
    ]) {
      if (elements[id]) elements[id].disabled = interactionLocked;
    }

    elements["save-section"].disabled = interactionLocked
      || !sectionExtent
      || !elements["section-label"].value.trim();
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
    elements["switch-endpoint"].disabled = interactionLocked || !currentInterval;
    elements["step-backward"].disabled = interactionLocked || !actionModel?.stepBackward;
    elements["step-forward"].disabled = interactionLocked || !actionModel?.stepForward;
    elements["pin-backward"].disabled = interactionLocked || !previous;
    elements["pin-forward"].disabled = interactionLocked || !next;

    const currentPin = currentResolution ? findPinAt(guide(), semanticCurrent) : null;
    const alreadyPinned = currentPin?.kind === PIN_KIND.EXPLICIT;
    elements["pin-current"].disabled = interactionLocked || (alreadyPinned && !elements["pin-label"].value.trim());
    elements.loop.disabled = interactionLocked || (!currentInterval && !loopActive);
    elements.loop.classList.toggle("is-active", loopActive);
    elements.loop.setAttribute("aria-pressed", String(loopActive));
    elements["loop-label"].textContent = loopActive ? "Stop Loop" : "Loop";

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
      || projection.sourceDistance(
        semanticCurrent,
        projection.sourceMidpoint(activeRange.start, activeRange.end)
      ) <= EPSILON;

    elements["return-meta"].textContent = currentState.session.history.length
      ? currentState.session.history.at(-1).label
      : "Nothing to undo";
    const activeFold = projection.foldAtSource(semanticCurrent);
    const foldEndpoint = activeFold
      && currentInterval
      && activeFold.start >= activeRange.start - EPSILON
      && activeFold.end <= activeRange.end + EPSILON
      && (
        currentInterval.departure < activeFold.start - EPSILON
        || currentInterval.departure > activeFold.end + EPSILON
      );
    const destinationFrame = currentInterval?.departureFrame;
    const destinationScale = destinationFrame?.resolution
      ? formatDuration(destinationFrame.resolution.R - destinationFrame.resolution.L)
      : null;
    setActionMeta(
      "switch-endpoint",
      "switch-endpoint-meta",
      "Switch Endpoint",
      foldEndpoint
        ? `${
            currentInterval.foldEndpoint?.included === false
              ? "include"
              : "exclude"
          } ${activeFold.sections[0]?.label || "Section"} · ⇧S switches Working endpoint`
        : currentInterval
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
        : `${classifyRefineRelation(currentInterval, semanticCurrent, targets.backward)} loop to ${formatTime(targets.backward)}`
    );
    setActionMeta(
      "refine-forward",
      "forward-meta",
      "Refine Forward",
      targets.forward === null
        ? forwardBlock === "resolution-limit" ? "Resolution limit" : "Range end"
        : `${classifyRefineRelation(currentInterval, semanticCurrent, targets.forward)} loop to ${formatTime(targets.forward)}`
    );
    elements["reopen-meta"].textContent = actionModel?.reopen
      ? `${formatDuration(
          projection.sourceDistance(activeRange.start, activeRange.end)
        )} traversal available`
      : "Range-level resolution";
    elements["loop-meta"].textContent = currentInterval ? formatRange(currentInterval) : "No Interval";
    elements["step-backward-meta"].textContent = actionModel?.stepBackward
      ? `to ${formatTime(actionModel.stepBackward.destination)}`
      : "Range start";
    elements["step-forward-meta"].textContent = actionModel?.stepForward
      ? `to ${formatTime(actionModel.stepForward.destination)}`
      : "Range end";
    elements["pin-backward-meta"].textContent = previous
      ? previous.stopKind === "section"
        ? `${formatRange(previous)} · ${previous.label} (folded)`
        : `${formatTime(previous.t)} · ${pinLabel(previous)}`
      : "No Pin backward";
    elements["pin-forward-meta"].textContent = next
      ? next.stopKind === "section"
        ? `${formatRange(next)} · ${next.label} (folded)`
        : `${formatTime(next.t)} · ${pinLabel(next)}`
      : "No Pin forward";

    if (!loaded || !currentResolution) {
      for (const id of [
        "range-start-handle", "range-end-handle", "resolution-start-marker",
        "resolution-end-marker", "backward-target-marker", "forward-target-marker", "current-marker", "cursor-marker"
      ]) elements[id].hidden = true;
      elements["interval-fill"].hidden = true;
      elements["field-span-fill"].hidden = true;
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
