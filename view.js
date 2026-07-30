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

export function packTimelineSectionLanes(entries) {
  const laneEnds = [];
  for (const entry of entries) {
    let lane = laneEnds.findIndex(end =>
      entry.projected.start > end + EPSILON
    );
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = Math.max(
      laneEnds[lane] ?? Number.NEGATIVE_INFINITY,
      entry.projected.end
    );
    entry.lane = lane;
  }
  return { entries, laneCount: laneEnds.length };
}

export function computeTimelineFoldLayout(
  folds,
  width,
  effectiveDuration,
  minimumGap = 6
) {
  const surfaceWidth = Math.max(1, Number(width) || 1);
  const duration = Math.max(EPSILON, Number(effectiveDuration) || 0);
  const maximumSourceDuration = Math.max(
    EPSILON,
    ...(folds || []).map(fold => fold.sourceDuration)
  );
  const layout = (folds || [])
    .map((fold, index) => {
      const contributorCount = Math.max(1, fold.sections?.length || 1);
      const rootWidth = clamp(38 + Math.min(contributorCount, 8) * 7, 48, 94);
      const anchorX = clamp(fold.traversal / duration, 0, 1) * surfaceWidth;
      const height = 70 + 82 * Math.sqrt(
        fold.sourceDuration / maximumSourceDuration
      );
      return {
        fold,
        index,
        anchorX,
        x: clamp(anchorX, rootWidth / 2, surfaceWidth - rootWidth / 2),
        width: rootWidth,
        height
      };
    })
    .sort((first, second) =>
      first.anchorX - second.anchorX || first.index - second.index
    );
  let gap = minimumGap;
  const requiredWidth = layout.reduce((sum, entry) => sum + entry.width, 0)
    + Math.max(0, layout.length - 1) * gap;
  if (requiredWidth > surfaceWidth && layout.length) {
    gap = 2;
    const availablePerFold = Math.max(
      28,
      (surfaceWidth - Math.max(0, layout.length - 1) * gap) / layout.length
    );
    for (const entry of layout) entry.width = Math.min(entry.width, availablePerFold);
  }

  for (let index = 1; index < layout.length; index += 1) {
    const previous = layout[index - 1];
    const current = layout[index];
    const minimum = previous.x + previous.width / 2
      + gap + current.width / 2;
    current.x = Math.max(current.x, minimum);
  }
  for (let index = layout.length - 1; index >= 0; index -= 1) {
    const current = layout[index];
    const maximum = index === layout.length - 1
      ? surfaceWidth - current.width / 2
      : layout[index + 1].x - layout[index + 1].width / 2
        - gap - current.width / 2;
    current.x = Math.min(current.x, maximum);
  }
  for (let index = 0; index < layout.length; index += 1) {
    const current = layout[index];
    const minimum = index === 0
      ? current.width / 2
      : layout[index - 1].x + layout[index - 1].width / 2
        + gap + current.width / 2;
    current.x = Math.max(current.x, minimum);
  }

  return layout.sort((first, second) => first.index - second.index);
}

export function createView({ document, getState, getPlayerTime, minRangeSeconds }) {
  const elements = Object.fromEntries(
    [...document.querySelectorAll("[id]")].map(node => [node.id, node])
  );

  let previewAction = null;
  let previewSectionId = null;
  let activePreviewModel = null;
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
      const traversal = projection.effectiveDuration * index / divisions;
      const source = projection.traversalToSource(
        traversal,
        index === 0 ? "backward" : "forward"
      );
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

  function intervalContainsSection(section) {
    const working = interval();
    return Boolean(
      working
      && working.start <= section.start + EPSILON
      && working.end >= section.end - EPSILON
    );
  }

  function intervalContainsPin(pin) {
    const working = interval();
    return Boolean(
      working
      && pin.t >= working.start - EPSILON
      && pin.t <= working.end + EPSILON
    );
  }

  function renderTimelineSections(projection) {
    const sectionLane = elements["section-lane"];
    const foldLane = elements["fold-lane"];
    if (!sectionLane || !foldLane) return;
    sectionLane.replaceChildren();
    foldLane.replaceChildren();
    renderTimelineRuler(projection);

    const sections = sortedSections(guide());
    const activeIds = new Set(
      projection.folds.flatMap(fold => fold.sectionIds)
    );
    const openEntries = sections
      .filter(section => !activeIds.has(section.id))
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

    const packedSections = packTimelineSectionLanes(openEntries);
    const timelineWidth = Math.max(1, elements.timeline.clientWidth || 1);
    const foldLayout = computeTimelineFoldLayout(
      projection.folds,
      timelineWidth,
      projection.effectiveDuration
    );
    const maximumFoldHeight = foldLayout.length
      ? Math.max(...foldLayout.map(entry => entry.height))
      : 0;
    const sectionBandHeight = Math.max(
      32,
      18 + packedSections.laneCount * 18
    );
    const foldBandHeight = maximumFoldHeight > 0
      ? maximumFoldHeight + 36
      : 30;
    const trackTop = sectionBandHeight + foldBandHeight / 2;
    const rulerTop = sectionBandHeight + foldBandHeight + 10;
    const pinTop = rulerTop + 42;
    const timelineHeight = pinTop + 44;
    setStyleProperty(elements.timeline, "--section-band-height", `${sectionBandHeight}px`);
    setStyleProperty(elements.timeline, "--fold-band-height", `${foldBandHeight}px`);
    setStyleProperty(elements.timeline, "--track-top", `${trackTop}px`);
    setStyleProperty(elements.timeline, "--ruler-top", `${rulerTop}px`);
    setStyleProperty(elements.timeline, "--pin-top", `${pinTop}px`);
    setStyleProperty(elements.timeline, "--timeline-height", `${timelineHeight}px`);
    elements.timeline.style.height = `${timelineHeight}px`;

    for (const entry of packedSections.entries) {
      const { section, projected, lane } = entry;
      const color = sectionColor(section.id);
      const selected = state().selectedRetained?.kind === "section"
        && state().selectedRetained.id === section.id;
      const left = projected.start / Math.max(projection.effectiveDuration, EPSILON) * 100;
      const width = (
        (projected.end - projected.start)
        / Math.max(projection.effectiveDuration, EPSILON)
      ) * 100;
      const span = document.createElement("span");
      span.className = "timeline-section-span";
      if (section.collapsed) span.classList.add("materialized");
      if (selected) span.classList.add("retained-selected");
      span.style.left = `${left}%`;
      span.style.width = `${width}%`;
      setStyleProperty(span, "--section-color", color);
      setStyleProperty(span, "--section-lane", String(lane));
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

      const hinge = document.createElement("button");
      hinge.type = "button";
      hinge.className = "timeline-section-fold";
      if (selected) hinge.classList.add("retained-selected");
      if (section.collapsed) {
        hinge.classList.add("materialized");
        hinge.dataset.sectionExpand = section.id;
      } else {
        hinge.dataset.sectionCollapse = section.id;
      }
      const midpoint = projection.sourceMidpoint(section.start, section.end);
      hinge.style.left = `${
        projection.sourceToTraversal(midpoint)
        / Math.max(projection.effectiveDuration, EPSILON)
        * 100
      }%`;
      setStyleProperty(hinge, "--section-color", color);
      setStyleProperty(hinge, "--section-lane", String(lane));
      hinge.setAttribute(
        "aria-label",
        `${section.collapsed ? "Unfold" : "Transpose"} ${sectionLabel(section)}, ${formatRange(section)}`
      );
      hinge.title = `${section.collapsed ? "Unfold" : "Transpose"} ${sectionLabel(section)}`;
      sectionLane.append(span, body, hinge);
    }

    for (const layout of foldLayout) {
      const { fold } = layout;
      const root = document.createElement("div");
      root.className = "timeline-fold";
      root.style.left = `${layout.x}px`;
      const height = layout.height;
      setStyleProperty(root, "--fold-height", `${height}px`);
      setStyleProperty(root, "--fold-width", `${layout.width}px`);
      setStyleProperty(
        root,
        "--fold-anchor-offset",
        `${layout.anchorX - layout.x}px`
      );
      setStyleProperty(
        root,
        "--fold-anchor-width",
        `${Math.abs(layout.anchorX - layout.x)}px`
      );
      root.dataset.foldStart = String(fold.start);
      root.dataset.foldEnd = String(fold.end);

      const anchor = document.createElement("span");
      anchor.className = "timeline-fold-anchor";
      if (layout.anchorX < layout.x) anchor.classList.add("left");
      anchor.setAttribute("aria-hidden", "true");
      root.appendChild(anchor);

      const axis = document.createElement("span");
      axis.className = "timeline-fold-axis";
      axis.dataset.foldAxis = "true";
      axis.setAttribute("aria-hidden", "true");
      root.appendChild(axis);

      const duration = document.createElement("span");
      duration.className = "timeline-fold-duration";
      duration.textContent = formatDuration(fold.sourceDuration);
      duration.setAttribute("aria-hidden", "true");
      root.appendChild(duration);

      for (const [role, value] of [
        ["top", fold.end],
        ["bottom", fold.start]
      ]) {
        const face = document.createElement("time");
        face.className = `timeline-fold-face ${role}`;
        face.textContent = formatRulerTime(value);
        face.setAttribute("aria-hidden", "true");
        root.appendChild(face);
      }

      for (const kind of [
        "range",
        "resolution",
        "interval",
        "preview-resolution",
        "preview-interval"
      ]) {
        const coverage = document.createElement("span");
        coverage.className = `timeline-fold-coverage ${kind}`;
        coverage.dataset.coverageKind = kind;
        coverage.hidden = true;
        coverage.setAttribute("aria-hidden", "true");
        root.appendChild(coverage);
      }
      for (const kind of [
        "backward",
        "forward",
        "preview-backward",
        "preview-forward"
      ]) {
        const target = document.createElement("span");
        target.className = `timeline-fold-refine-target ${kind}`;
        target.dataset.foldTarget = kind;
        target.hidden = true;
        target.setAttribute("aria-hidden", "true");
        root.appendChild(target);
      }

      const cursor = document.createElement("span");
      cursor.className = "timeline-fold-cursor";
      cursor.hidden = true;
      cursor.setAttribute("aria-hidden", "true");
      root.appendChild(cursor);

      const current = document.createElement("span");
      current.className = "timeline-fold-current";
      current.hidden = true;
      current.setAttribute("aria-hidden", "true");
      root.appendChild(current);

      const railSpacing = Math.min(
        10,
        (layout.width - 24) / Math.max(1, fold.sections.length - 1)
      );
      const railCenter = (fold.sections.length - 1) / 2;
      for (const [railIndex, section] of fold.sections.entries()) {
        const rail = document.createElement("button");
        rail.type = "button";
        rail.className = "timeline-fold-rail";
        rail.dataset.sectionExpand = section.id;
        rail.dataset.sectionStart = String(section.start);
        rail.dataset.sectionEnd = String(section.end);
        const startRatio = (section.start - fold.start) / Math.max(fold.sourceDuration, EPSILON);
        const endRatio = (section.end - fold.start) / Math.max(fold.sourceDuration, EPSILON);
        setStyleProperty(rail, "--rail-top", `${(1 - endRatio) * 100}%`);
        setStyleProperty(rail, "--rail-height", `${(endRatio - startRatio) * 100}%`);
        setStyleProperty(
          rail,
          "--rail-offset",
          `${(railIndex - railCenter) * railSpacing}px`
        );
        setStyleProperty(rail, "--section-color", sectionColor(section.id));
        if (intervalContainsSection(section)) rail.classList.add("interval-included");
        if (
          state().selectedRetained?.kind === "section"
          && state().selectedRetained.id === section.id
        ) rail.classList.add("retained-selected");
        rail.setAttribute(
          "aria-label",
          `Unfold ${sectionLabel(section)}, ${formatRange(section)}`
        );
        rail.title = `${sectionLabel(section)} · ${formatRange(section)}\nClick to unfold only this Section.`;
        root.appendChild(rail);
      }

      const endpointLayout = fold.boundaryPins
        .map(pin => {
          const ratio = (
            pin.t - fold.start
          ) / Math.max(fold.sourceDuration, EPSILON);
          return {
            pin,
            ratio,
            y: (1 - ratio) * height,
            offset: 0
          };
        })
        .sort((first, second) => first.y - second.y);
      for (let start = 0; start < endpointLayout.length;) {
        let end = start + 1;
        while (
          end < endpointLayout.length
          && endpointLayout[end].y - endpointLayout[end - 1].y < 18
        ) end += 1;
        const group = endpointLayout.slice(start, end);
        const spacing = group.length > 1
          ? Math.min(16, (layout.width - 20) / (group.length - 1))
          : 0;
        group.forEach((entry, index) => {
          entry.offset = (index - (group.length - 1) / 2) * spacing;
        });
        start = end;
      }
      // The hinge owns the axis intersection. If a nested/asymmetric Section
      // contributes a Pin at that same source height, move only its visual
      // button sideways and retain a connector to the exact rail position.
      // This keeps both controls selectable without changing source geometry.
      const hingePins = endpointLayout.filter(entry =>
        Math.abs(entry.y - height / 2) < 16
      );
      hingePins.forEach((entry, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        entry.offset = side * Math.max(18, Math.abs(entry.offset));
      });

      for (const { pin, ratio, offset } of endpointLayout) {
        const endpoint = document.createElement("button");
        endpoint.type = "button";
        endpoint.className = "timeline-fold-pin";
        endpoint.dataset.pinGo = pin.id;
        setStyleProperty(endpoint, "--pin-position", `${(1 - ratio) * 100}%`);
        setStyleProperty(endpoint, "--pin-offset", `${offset}px`);
        setStyleProperty(endpoint, "--pin-link-width", `${Math.abs(offset)}px`);
        if (offset > 0.5) endpoint.classList.add("offset-right");
        if (offset < -0.5) endpoint.classList.add("offset-left");
        if (intervalContainsPin(pin)) endpoint.classList.add("interval-contained");
        if (state().selectedPinIds?.includes(pin.id)) endpoint.classList.add("pair-selected");
        if (
          state().selectedRetained?.kind === "pin"
          && state().selectedRetained.id === pin.id
        ) endpoint.classList.add("retained-selected");
        endpoint.setAttribute(
          "aria-label",
          `${pinLabel(pin)} at ${formatTime(pin.t)}; stacked Fold endpoint`
        );
        endpoint.title = `${pinLabel(pin)} · ${formatTime(pin.t)}`;
        root.appendChild(endpoint);
      }

      const hinge = document.createElement("button");
      hinge.type = "button";
      hinge.className = "timeline-fold-hinge";
      if (fold.sectionIds.length === 1) {
        hinge.dataset.sectionExpand = fold.sectionIds[0];
        hinge.setAttribute(
          "aria-label",
          `Unfold ${sectionLabel(fold.sections[0])}`
        );
      } else {
        hinge.dataset.foldContributors = fold.sectionIds.join(",");
        hinge.setAttribute(
          "aria-label",
          `Choose one of ${fold.sectionIds.length} transposed Sections`
        );
      }
      hinge.title = fold.sectionIds.length === 1
        ? `Unfold ${sectionLabel(fold.sections[0])}`
        : `${fold.sectionIds.length} Sections share this Fold; select a colored rail.`;
      root.appendChild(hinge);
      foldLane.appendChild(root);
    }
  }

  function renderTimelinePins() {
    const width = Math.max(1, elements.timeline.clientWidth || 1);
    const activeRange = range();
    const projection = timelineProjection();
    const pins = visiblePins(guide())
      .filter(pin => contains(activeRange, pin.t))
      .filter(pin => !projection.foldAtSource(pin.t))
      .map(pin => ({
        ...pin,
        sourceT: pin.t,
        t: projection.sourceToTraversal(pin.t)
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
      .map(pin => `${pin.id}:${pin.t}:${pin.label}`)
      .join(",");
    const intervalKey = interval()
      ? `${interval().start}:${interval().end}`
      : "none";
    const key = `${activeRange.start}|${activeRange.end}|${width}|${projection.effectiveDuration}|${foldKey}|${sectionKey}|${selectedKey}|${intervalKey}|${pinKey}`;
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
        const withoutSection = section.collapsed
          ? projectionForModel(model(), {
              expandedSectionIds: [section.id]
            })
          : null;
        const stillCovered = withoutSection?.folds?.filter(fold =>
          fold.start < section.end - EPSILON
          && fold.end > section.start + EPSILON
        ) || [];
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
        setStyleProperty(item, "--section-color", sectionColor(section.id));

        const main = document.createElement("button");
        main.type = "button";
        main.className = "guide-item-main";
        main.dataset.sectionGo = section.id;
        const title = document.createElement("span");
        title.className = "guide-item-title";
        const projectionNote = activeFold
          ? stillCovered.length > 0
            ? `Transposed · overlaps ${stillCovered.length} other Fold${stillCovered.length === 1 ? "" : "s"}`
            : "Transposed"
          : coveringFold
            ? `Inside ${sectionLabel(coveringFold.sections[0])}`
            : materialized
              ? "Materialized"
              : "";
        title.textContent = `${sectionLabel(section)}${projectionNote ? ` · ${projectionNote}` : ""}`;
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
        const fold = document.createElement("button");
        fold.type = "button";
        if (section.collapsed) {
          fold.dataset.expandSection = section.id;
          fold.textContent = "Unfold";
        } else {
          fold.dataset.collapseSection = section.id;
          fold.textContent = "Transpose";
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
        actions.append(focus, fold, overwrite, rename, remove);

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
            ? ` · inside ${sectionLabel(containingFold.sections[0])}`
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
    activePreviewModel = predicted;
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

  function setFoldCoverage(element, fold, extent) {
    if (!element) return;
    const start = Math.max(fold.start, extent?.start ?? Number.POSITIVE_INFINITY);
    const end = Math.min(fold.end, extent?.end ?? Number.NEGATIVE_INFINITY);
    const visible = end - start > EPSILON;
    element.hidden = !visible;
    if (!visible) return;
    const duration = Math.max(EPSILON, fold.end - fold.start);
    setStyleProperty(
      element,
      "--coverage-top",
      `${(1 - (end - fold.start) / duration) * 100}%`
    );
    setStyleProperty(
      element,
      "--coverage-height",
      `${(end - start) / duration * 100}%`
    );
  }

  function setFoldTarget(element, fold, address) {
    if (!element) return;
    const visible = Number.isFinite(address)
      && address >= fold.start - EPSILON
      && address <= fold.end + EPSILON;
    element.hidden = !visible;
    if (!visible) return;
    const duration = Math.max(EPSILON, fold.end - fold.start);
    setStyleProperty(
      element,
      "--fold-target-position",
      `${(1 - (address - fold.start) / duration) * 100}%`
    );
  }

  function renderFoldSemantics(baseModel, previewModel = null) {
    const projection = timelineProjection();
    const baseTargets = baseModel?.resolution
      ? getTargets(baseModel.resolution, projection.metric)
      : { backward: null, forward: null };
    const previewTargets = previewModel?.resolution
      ? getTargets(previewModel.resolution, projection.metric)
      : { backward: null, forward: null };
    for (const foldElement of elements["fold-lane"]?.querySelectorAll?.(".timeline-fold") || []) {
      const start = Number(foldElement.dataset.foldStart);
      const end = Number(foldElement.dataset.foldEnd);
      const fold = { start, end };
      setFoldCoverage(
        foldElement.querySelector?.('[data-coverage-kind="range"]'),
        fold,
        baseModel?.range
      );
      setFoldCoverage(
        foldElement.querySelector?.('[data-coverage-kind="resolution"]'),
        fold,
        baseModel?.resolution
          ? { start: baseModel.resolution.L, end: baseModel.resolution.R }
          : null
      );
      setFoldCoverage(
        foldElement.querySelector?.('[data-coverage-kind="interval"]'),
        fold,
        baseModel?.interval
      );
      setFoldCoverage(
        foldElement.querySelector?.('[data-coverage-kind="preview-resolution"]'),
        fold,
        previewModel?.resolution
          ? { start: previewModel.resolution.L, end: previewModel.resolution.R }
          : null
      );
      setFoldCoverage(
        foldElement.querySelector?.('[data-coverage-kind="preview-interval"]'),
        fold,
        previewModel?.interval
      );
      for (const [kind, address] of [
        ["backward", baseTargets.backward],
        ["forward", baseTargets.forward],
        ["preview-backward", previewTargets.backward],
        ["preview-forward", previewTargets.forward]
      ]) {
        setFoldTarget(
          foldElement.querySelector?.(`[data-fold-target="${kind}"]`),
          fold,
          address
        );
      }
      for (const rail of foldElement.querySelectorAll?.(".timeline-fold-rail") || []) {
        const section = {
          start: Number(rail.dataset.sectionStart),
          end: Number(rail.dataset.sectionEnd)
        };
        const contained = Boolean(
          baseModel?.interval
          && baseModel.interval.start <= section.start + EPSILON
          && baseModel.interval.end >= section.end - EPSILON
        );
        const previewContained = Boolean(
          previewModel?.interval
          && previewModel.interval.start <= section.start + EPSILON
          && previewModel.interval.end >= section.end - EPSILON
        );
        rail.classList.toggle("interval-included", contained);
        rail.classList.toggle("preview-included", previewContained);
      }
    }
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
    for (const foldElement of elements["fold-lane"]?.querySelectorAll?.(".timeline-fold") || []) {
      const start = Number(foldElement.dataset.foldStart);
      const end = Number(foldElement.dataset.foldEnd);
      const duration = Math.max(EPSILON, end - start);
      const cursorMarker = foldElement.querySelector?.(".timeline-fold-cursor");
      const currentMarker = foldElement.querySelector?.(".timeline-fold-current");
      const cursorInside = moving
        && cursor > start + EPSILON
        && cursor < end - EPSILON;
      const currentInside = semanticCurrent >= start - EPSILON
        && semanticCurrent <= end + EPSILON;
      if (cursorMarker) {
        cursorMarker.hidden = !cursorInside;
        if (cursorInside) {
          setStyleProperty(
            cursorMarker,
            "--fold-marker-position",
            `${(1 - (cursor - start) / duration) * 100}%`
          );
        }
      }
      if (currentMarker) {
        currentMarker.hidden = !currentInside;
        if (currentInside) {
          setStyleProperty(
            currentMarker,
            "--fold-marker-position",
            `${(1 - (semanticCurrent - start) / duration) * 100}%`
          );
        }
      }
    }

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
    renderFoldSemantics(
      projectedModel,
      livePlayback ? null : activePreviewModel
    );

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
      transpose: currentInterval || selectedForPreview,
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
    const foldAtCurrent = projection.foldAtSource(semanticCurrent);
    elements.transpose.disabled = interactionLocked || !(
      currentInterval
      || selectedSection
      || foldAtCurrent?.sectionIds?.length === 1
    );
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
      || projection.sourceDistance(
        semanticCurrent,
        projection.sourceMidpoint(activeRange.start, activeRange.end)
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
    const activeFold = projection.foldAtSource(semanticCurrent);
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
          : `retain anchor · to ${formatTime(targets.backward)}`
    );
    setActionMeta(
      "refine-forward",
      "forward-meta",
      "Refine Forward",
      targets.forward === null
        ? forwardBlock === "resolution-limit" ? "Resolution limit" : "Range end"
        : shiftLayer
          ? `${classifyRefineRelation(currentInterval, semanticCurrent, targets.forward)} Interval · to ${formatTime(targets.forward)}`
          : `retain anchor · to ${formatTime(targets.forward)}`
    );
    elements["reopen-meta"].textContent = actionModel?.reopen
      ? `${formatDuration(
          projection.sourceDistance(activeRange.start, activeRange.end)
        )} traversal available`
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
    const transposeTarget = currentInterval || selectedSection
      || (
        activeFold?.sectionIds?.length === 1
          ? resolveSection(guide(), activeFold.sectionIds[0])
          : null
      );
    elements["transpose-meta"].textContent = transposeTarget
      ? `${transposeTarget.collapsed ? "unfold" : "transpose"} ${formatRange(transposeTarget)}`
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
      activePreviewModel = null;
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
