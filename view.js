// DOM projection layer. It derives presentation from state and does not own semantic transactions.
import {
  EPSILON,
  clamp,
  contains,
  getTargets,
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

const TIMELINE_SECTION_HIT_WIDTH = 28;
const TIMELINE_SECTION_LANE_HEIGHT = 20;
const COARSE_TIMELINE_SECTION_LANE_HEIGHT = 48;
const TIMELINE_SECTION_MAX_LANES = 5;
const TIMELINE_PIN_HIT_SIZE = 52;
const COARSE_TIMELINE_PIN_HIT_SIZE = 56;

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(totalCentiseconds / 360_000);
  const minutes = Math.floor((totalCentiseconds % 360_000) / 6_000);
  const secs = Math.floor((totalCentiseconds % 6_000) / 100);
  const centiseconds = totalCentiseconds % 100;
  const minuteText = hours ? String(minutes).padStart(2, "0") : String(minutes);
  const fraction = centiseconds
    ? `.${String(centiseconds).padStart(2, "0").replace(/0$/, "")}`
    : "";
  return `${hours ? `${hours}:` : ""}${minuteText}:${String(secs).padStart(2, "0")}${fraction}`;
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

  function sectionWeightState(weight) {
    if (weight < 1 - EPSILON) return "Compresses";
    if (weight > 1 + EPSILON) return "Expands";
    return "Neutral";
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

  function guideTitleActions(kind, id, label, options = {}) {
    const actions = document.createElement("span");
    actions.className = "guide-title-actions";
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "guide-title-action guide-title-rename";
    rename.dataset[kind === "section" ? "renameSection" : "renamePin"] = id;
    rename.textContent = "✎";
    rename.setAttribute("aria-label", `Rename ${label}`);
    rename.title = `Rename ${label}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "guide-title-action guide-title-delete danger-text";
    remove.dataset[kind === "section" ? "deleteSection" : "deletePin"] = id;
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${label}`);
    remove.title = options.deleteTitle || `Delete ${label}`;
    actions.append(rename, remove);
    return actions;
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

  function timelineSectionLaneHeight() {
    return document.defaultView?.matchMedia?.("(pointer: coarse)")?.matches
      ? COARSE_TIMELINE_SECTION_LANE_HEIGHT
      : TIMELINE_SECTION_LANE_HEIGHT;
  }

  function timelinePinClusterGap() {
    return document.defaultView?.matchMedia?.("(pointer: coarse)")?.matches
      ? COARSE_TIMELINE_PIN_HIT_SIZE
      : TIMELINE_PIN_HIT_SIZE;
  }

  function endpointButton(role, pin, references, sectionId = null) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "endpoint-button";
    button.dataset.pinGo = pin.id;
    if (sectionId) button.dataset.sectionEndpointOwner = sectionId;
    setStyleProperty(button, "--endpoint-position", `${percent(pin.t)}%`);
    setStyleProperty(
      button,
      "--endpoint-weight",
      String(Math.min(3, Math.max(1, references)))
    );
    const roleLabel = document.createElement("small");
    roleLabel.textContent = role === "Start" ? "S" : "E";
    const text = document.createElement("span");
    text.textContent = `${formatTime(pin.t)} ${pin.label || ""}`.trim();
    text.className = "sr-only";
    button.append(roleLabel, text);
    const description = `${role} Pin at ${formatTime(pin.t)}; click to Go. Edit its exact Address below; ${references} Section${references === 1 ? "" : "s"}`;
    button.setAttribute("aria-label", description);
    button.title = description;
    return button;
  }

  function pinPositionButton(pin, references) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "endpoint-button pin-position-node";
    button.dataset.pinGo = pin.id;

    setStyleProperty(button, "--endpoint-position", `${percent(pin.t)}%`);
    setStyleProperty(
      button,
      "--endpoint-weight",
      String(Math.min(3, Math.max(1, references)))
    );
    const roleLabel = document.createElement("small");
    roleLabel.textContent = "P";
    const text = document.createElement("span");
    text.className = "sr-only";
    text.textContent = `${formatTime(pin.t)} ${pin.label || ""}`.trim();
    button.append(roleLabel, text);
    const description = `${pinLabel(pin)} at ${formatTime(pin.t)}; click to Go. Drag the Pin on the Temporal Topography or edit its Address below`;
    button.setAttribute("aria-label", description);
    button.title = description;
    return button;
  }

  function addressEditor({ kind, id, role = "", value, label }) {
    const editor = document.createElement("div");
    editor.className = "guide-address-editor";
    const text = document.createElement("span");
    text.className = "guide-address-label";
    text.textContent = label;
    const backward = document.createElement("button");
    backward.type = "button";
    backward.className = "guide-address-nudge";
    backward.dataset.guideNudgeKind = kind;
    backward.dataset.guideNudgeId = id;
    backward.dataset.guideNudgeRole = role;
    backward.dataset.guideNudgeDirection = "-1";
    backward.setAttribute("aria-label", `Nudge ${label} backward`);
    backward.textContent = "−";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = String(model().duration);
    input.step = "0.001";
    input.value = Number(value).toFixed(3);
    input.inputMode = "decimal";
    input.dataset.guideAddressKind = kind;
    input.dataset.guideAddressId = id;
    input.dataset.guideAddressRole = role;
    input.setAttribute("aria-label", `${label} source Address in seconds`);
    const forward = document.createElement("button");
    forward.type = "button";
    forward.className = "guide-address-nudge";
    forward.dataset.guideNudgeKind = kind;
    forward.dataset.guideNudgeId = id;
    forward.dataset.guideNudgeRole = role;
    forward.dataset.guideNudgeDirection = "1";
    forward.setAttribute("aria-label", `Nudge ${label} forward`);
    forward.textContent = "+";
    editor.append(text, backward, input, forward);
    return editor;
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

  function openPinClusterMenu(
    cluster,
    trigger = document.activeElement,
    options = {}
  ) {
    const menu = elements["pin-cluster-menu"];
    pinClusterTrigger = trigger || null;
    pinClusterTrigger?.setAttribute?.("aria-expanded", "true");
    menu.replaceChildren();
    for (const pin of cluster.pins) {
      const row = document.createElement("div");
      row.className = "pin-cluster-row";
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.dataset.pinGo = pin.id;
      if (pinClusterTrigger?.dataset?.clusterIndex !== undefined) {
        button.dataset.clusterIndex = pinClusterTrigger.dataset.clusterIndex;
      }
      const label = document.createElement("span");
      label.textContent = pinLabel(pin);
      const time = document.createElement("time");
      time.textContent = formatTime(pin.sourceT ?? pin.t);
      const selected = state().selectedRetained?.kind === "pin"
        && state().selectedRetained.id === pin.id;
      if (selected) {
        button.classList.add("retained-selected");
        button.setAttribute("aria-current", "true");
      }
      if (pin.id === state().guideDrag?.snapTargetPinId) {
        button.classList.add("snap-target");
        if (state().guideDrag?.snapArmed) button.classList.add("snap-armed");
      }
      button.title = `${pinLabel(pin)} at ${formatTime(pin.sourceT ?? pin.t)}; click to select`;
      button.append(label, time);
      const drag = document.createElement("button");
      drag.type = "button";
      drag.className = "pin-cluster-drag";
      drag.dataset.pinDrag = pin.id;
      if (pinClusterTrigger?.dataset?.clusterIndex !== undefined) {
        drag.dataset.clusterIndex = pinClusterTrigger.dataset.clusterIndex;
      }
      drag.setAttribute(
        "aria-label",
        `Move ${pinLabel(pin)} from ${formatTime(pin.sourceT ?? pin.t)}${sectionsForPin(guide(), pin.id).length === 1 ? "; pause over another Pin, then release to link" : ""}`
      );
      drag.title = sectionsForPin(guide(), pin.id).length === 1
        ? "Drag horizontally; pause over another Pin, then release to link"
        : "Drag horizontally to move this exact Pin";
      drag.textContent = "â†”";
      row.append(button, drag);
      menu.appendChild(row);
    }
    const width = elements.timeline.clientWidth || 1;
    const estimatedWidth = 276;
    menu.style.left = `${clamp(
      cluster.x - estimatedWidth / 2,
      6,
      Math.max(6, width - estimatedWidth - 6)
    )}px`;
    menu.hidden = false;
    const focusTarget = options.focusPinId
      ? menu.querySelector?.(`[data-pin-go="${options.focusPinId}"]`)
      : null;
    (focusTarget || menu.querySelector?.("button"))
      ?.focus?.({ preventScroll: true });
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
      "#ff8a70",
      "#f7b267",
      "#e76f51",
      "#c9d77e",
      "#ff6f91",
      "#c7d0dd"
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

  function deformationInfluence(section, coordinate, projection) {
    const projected = projection.projectExtent(section);
    if (!projected) return 0;
    const midpoint = projection.sourceToTimeline(section.midpoint);
    const halfSpan = Math.max(
      (projected.end - projected.start) / 2,
      projection.timelineExtent * 0.002
    );
    const bleed = Math.max(
      projection.timelineExtent * 0.018,
      halfSpan * 0.55
    );
    const spanRatio = clamp(
      (projected.end - projected.start)
      / Math.max(projection.timelineExtent, EPSILON),
      0,
      1
    );
    // Weight is distributed across the Section's projected footprint. A broad
    // Section therefore reads as a diffuse field; a narrow one concentrates the
    // same signed deformation around its midpoint.
    const dilution = clamp(1 / Math.sqrt(1 + spanRatio * 5), 0.38, 1);
    const distance = Math.abs(coordinate - midpoint);
    if (distance <= halfSpan) {
      const centerRelation = 1 - distance / halfSpan;
      return dilution * (0.42 + 0.58 * centerRelation * centerRelation);
    }
    if (distance >= halfSpan + bleed) return 0;
    const fade = 1 - (distance - halfSpan) / bleed;
    return dilution * 0.42 * fade * fade * (3 - 2 * fade);
  }

  function renderTimelineDeformation(projection) {
    const field = elements["deformation-field"];
    if (!field) return;
    field.replaceChildren();
    const sections = sortedSections(guide())
      .filter(section => Math.abs(section.weight - 1) > EPSILON);
    const atmosphere = document.createElement("span");
    atmosphere.className = "deformation-atmosphere";
    const samples = 80;
    const stops = [];
    let compression = false;
    let expansion = false;
    for (let index = 0; index <= samples; index += 1) {
      const ratio = index / samples;
      const coordinate = projection.timelineExtent * ratio;
      const signedDensity = sections.reduce(
        (sum, section) =>
          sum
          + Math.log2(section.weight)
          * deformationInfluence(section, coordinate, projection),
        0
      );
      const compressed = signedDensity < -EPSILON;
      const expanded = signedDensity > EPSILON;
      compression ||= compressed;
      expansion ||= expanded;
      const strength = compressed
        ? clamp(Math.abs(signedDensity) / 2, 0, 1)
        : expanded
          ? clamp(signedDensity, 0, 1)
          : 0;
      const color = compressed
        ? `rgba(172, 112, 225, ${0.02 + strength * 0.28})`
        : expanded
          ? `rgba(65, 189, 174, ${0.018 + strength * 0.26})`
          : "rgba(92, 111, 137, 0)";
      stops.push(`${color} ${ratio * 100}%`);
    }
    if (compression) atmosphere.classList.add("has-compression");
    if (expansion) atmosphere.classList.add("has-expansion");
    atmosphere.style.background = `linear-gradient(90deg, ${stops.join(", ")})`;

    const contours = document.createElement("span");
    contours.className = "deformation-contours";
    const contourCount = clamp(
      Math.round(Math.max(1, elements.timeline.clientWidth || 1) / 13),
      48,
      112
    );
    for (let index = 1; index < contourCount; index += 1) {
      const contour = document.createElement("i");
      const source = projection.duration * index / contourCount;
      contour.style.left = `${
        projection.sourceToTimeline(source)
        / Math.max(projection.timelineExtent, EPSILON)
        * 100
      }%`;
      contours.appendChild(contour);
    }
    field.append(atmosphere, contours);
  }

  function renderTimelineSections(projection, sectionLaneHeight) {
    const sectionLane = elements["section-lane"];
    if (!sectionLane) return;
    sectionLane.replaceChildren();
    renderTimelineRuler(projection);
    renderTimelineDeformation(projection);
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
      controlExtent: projection.timelineExtent
        * TIMELINE_SECTION_HIT_WIDTH
        / timelineWidth
    });
    const visibleLaneCount = Math.min(
      packedSections.laneCount,
      TIMELINE_SECTION_MAX_LANES
    );
    const sectionBandHeight = Math.max(
      30,
      8 + visibleLaneCount * sectionLaneHeight
    );
    const pinTop = 17;
    const trackTop = 44;
    const rulerTop = trackTop + 36;
    const sectionTop = rulerTop + 38;
    const timelineHeight = sectionTop + sectionBandHeight + 4;
    setStyleProperty(elements.timeline, "--track-top", `${trackTop}px`);
    setStyleProperty(elements.timeline, "--ruler-top", `${rulerTop}px`);
    setStyleProperty(elements.timeline, "--pin-top", `${pinTop}px`);
    setStyleProperty(elements.timeline, "--section-top", `${sectionTop}px`);
    setStyleProperty(elements.timeline, "--timeline-height", `${timelineHeight}px`);

    for (const entry of packedSections.entries) {
      const { section, projected, lane } = entry;
      const visibleLane = lane % TIMELINE_SECTION_MAX_LANES;
      const color = sectionColor(section.id);
      const selected = state().selectedRetained?.kind === "section"
        && state().selectedRetained.id === section.id;
      const left = projected.start / Math.max(projection.timelineExtent, EPSILON) * 100;
      const width = (
        (projected.end - projected.start)
        / Math.max(projection.timelineExtent, EPSILON)
      ) * 100;
      const span = document.createElement("span");
      span.className = "timeline-section-span";
      if (selected) span.classList.add("retained-selected");
      setStyleProperty(span, "--section-color", color);
      span.setAttribute("aria-hidden", "true");
      const midpointNode = document.createElement("i");
      midpointNode.className = "timeline-section-midpoint";
      span.appendChild(midpointNode);

      const body = document.createElement("button");
      body.type = "button";
      body.className = "timeline-section-body";
      body.dataset.sectionGo = section.id;
      body.style.left = `${left}%`;
      body.style.width = `${width}%`;
      setStyleProperty(body, "--section-color", color);
      setStyleProperty(body, "--section-offset", `${visibleLane * sectionLaneHeight}px`);
      if (selected) body.classList.add("retained-selected");
      body.setAttribute(
        "aria-label",
        `Select ${sectionLabel(section)} as the Working Interval, ${formatRange(section)}`
      );
      body.title = `${sectionLabel(section)} · click to work from this extent`;
      // The visible wire belongs to its selection control. Separate nodes own
      // endpoint and whole-extent movement so Timeline geometry remains the one
      // spatial editing surface without nesting interactive controls.
      body.appendChild(span);

      const dragNodes = [
        {
          role: "start",
          coordinate: projected.start,
          pinId: section.startPinId,
          label: `Move Start of ${sectionLabel(section)}`
        },
        {
          role: "midpoint",
          coordinate: projection.sourceToTimeline(section.midpoint),
          sectionId: section.id,
          label: `Move complete ${sectionLabel(section)}`
        },
        {
          role: "end",
          coordinate: projected.end,
          pinId: section.endPinId,
          label: `Move End of ${sectionLabel(section)}`
        }
      ];
      for (const node of dragNodes) {
        const control = document.createElement("button");
        control.type = "button";
        control.className = `timeline-section-drag-node ${node.role}`;
        control.style.left = `${
          node.coordinate / Math.max(projection.timelineExtent, EPSILON) * 100
        }%`;
        setStyleProperty(control, "--section-color", color);
        setStyleProperty(control, "--section-offset", `${visibleLane * sectionLaneHeight}px`);
        if (node.pinId) {
          control.dataset.pinDrag = node.pinId;
          control.dataset.dragSection = section.id;
        } else {
          control.dataset.sectionDrag = node.sectionId;
        }
        control.setAttribute("aria-label", `${node.label}; Shift-drag for fine adjustment`);
        control.title = `${node.label} · Shift-drag for fine adjustment`;
        sectionLane.appendChild(control);
      }

      const sectionY = sectionTop + visibleLane * sectionLaneHeight + 10;
      const relationPoints = [
        ["start", projected.start, pinTop + 7],
        ["midpoint", projection.sourceToTimeline(section.midpoint), trackTop + 30],
        ["end", projected.end, pinTop + 7]
      ];
      for (const [role, coordinate, relationTop] of relationPoints) {
        const relation = document.createElement("span");
        relation.className = `timeline-section-relation ${role}`;
        if (selected) relation.classList.add("retained-selected");
        relation.style.left = `${
          coordinate / Math.max(projection.timelineExtent, EPSILON) * 100
        }%`;
        relation.style.top = `${relationTop}px`;
        relation.style.height = `${Math.max(0, sectionY - relationTop)}px`;
        setStyleProperty(relation, "--section-color", color);
        relation.setAttribute("aria-hidden", "true");
        sectionLane.appendChild(relation);
      }
      sectionLane.appendChild(body);
    }
  }

  function renderTimelinePins() {
    const width = Math.max(1, elements.timeline.clientWidth || 1);
    const sectionLaneHeight = timelineSectionLaneHeight();
    const pinClusterGap = timelinePinClusterGap();
    setStyleProperty(elements.timeline, "--pin-hit-size", `${pinClusterGap}px`);
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
      .map(pin =>
        `${pin.id}:${pin.t}:${pin.label}:${pin.kind}:${sectionsForPin(guide(), pin.id).length}`
      )
      .join(",");
    const intervalKey = interval()
      ? `${interval().start}:${interval().end}`
      : "none";
    const snapKey = `${state().guideDrag?.snapTargetPinId || "none"}:${
      state().guideDrag?.snapArmed === true ? "armed" : "candidate"
    }`;
    const key = `${activeRange.start}|${activeRange.end}|${width}|${sectionLaneHeight}|${pinClusterGap}|${projection.timelineExtent}|${sectionKey}|${selectedKey}|${intervalKey}|${snapKey}|${pinKey}`;
    if (key === renderedPinKey) return;
    renderedPinKey = key;
    const clusterDrag = state().guideDrag?.origin === "cluster-menu";
    if (!clusterDrag) closePinClusterMenu();
    elements["pin-lane"].replaceChildren();
    renderTimelineSections(projection, sectionLaneHeight);
    renderedClusters = clusterPinsByPixels(
      pins,
      projection.timelineExtent,
      width,
      pinClusterGap
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
        const references = endpointSections.length;
        setStyleProperty(button, "--pin-weight", String(Math.min(3, references)));
        if (endpointSections.length) {
          button.classList.add("section-endpoint-pin");
          setStyleProperty(
            button,
            "--endpoint-color",
            sectionColor(endpointSections[0].id)
          );
        }
        if (state().selectedPinIds?.includes(pin.id)) {
          button.classList.add("extent-selected");
        }
        if (
          state().selectedRetained?.kind === "pin"
          && state().selectedRetained.id === pin.id
        ) button.classList.add("retained-selected");
        if (pin.id === state().guideDrag?.snapTargetPinId) {
          button.classList.add("snap-target");
          if (state().guideDrag?.snapArmed) button.classList.add("snap-armed");
        }
        const description = `${pinLabel(pin)} at ${formatTime(pin.sourceT)}; click to move Current here, drag to move the Pin${references === 1 ? ", pause over another Pin and release to link" : ""}`;
        button.setAttribute("aria-label", description);
        button.title = description;
      } else {
        button.classList.add("cluster");
        if (
          state().selectedRetained?.kind === "pin"
          && cluster.pins.some(pin => pin.id === state().selectedRetained.id)
        ) button.classList.add("retained-selected");
        if (
          cluster.pins.some(pin => state().selectedPinIds?.includes(pin.id))
        ) button.classList.add("extent-selected");
        if (
          cluster.pins.some(pin => pin.id === state().guideDrag?.snapTargetPinId)
        ) {
          button.classList.add("snap-target");
          if (state().guideDrag?.snapArmed) button.classList.add("snap-armed");
        }
        const references = cluster.pins.reduce(
          (total, pin) => total + sectionsForPin(guide(), pin.id).length,
          0
        );
        setStyleProperty(button, "--pin-weight", String(Math.min(3, references)));
        button.dataset.clusterIndex = String(index);
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        const count = document.createElement("span");
        count.className = "timeline-pin-count";
        count.textContent = String(cluster.pins.length);
        button.appendChild(count);
        const description = `Choose among ${cluster.pins.length} nearby Pins`;
        button.setAttribute("aria-label", description);
        button.title = cluster.pins
          .map(pin => `${pinLabel(pin)} — ${formatTime(pin.sourceT ?? pin.t)}`)
          .join("\n");
      }
      elements["pin-lane"].appendChild(button);
    });
    if (clusterDrag) {
      const moved = getPin(guide(), state().guideDrag.id);
      const menuButton = elements["pin-cluster-menu"].querySelector?.(
        `[data-pin-go="${state().guideDrag.id}"]`
      );
      const time = menuButton
        ? [...menuButton.children].find(node => node.tagName === "TIME")
        : null;
      if (moved && time) time.textContent = formatTime(moved.t);
    }
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
        const startReferences = sectionsForPin(guide(), section.startPin.id).length;
        const endReferences = sectionsForPin(guide(), section.endPin.id).length;
        const selected = state().selectedRetained?.kind === "section"
          && state().selectedRetained.id === section.id;
        const endpointSelected = state().selectedPinIds?.some(id =>
          id === section.startPin.id || id === section.endPin.id
        );
        const item = document.createElement("article");
        item.className = "guide-item section-item";
        item.dataset.sectionPreviewId = section.id;
        if (section.id === focusedId) item.classList.add("focused");
        if (section.weight < 1 - EPSILON) item.classList.add("compressed");
        else if (section.weight > 1 + EPSILON) item.classList.add("expanded");
        if (selected) item.classList.add("retained-selected");
        if (endpointSelected && !selected) item.classList.add("extent-selected");
        setStyleProperty(item, "--section-color", sectionColor(section.id));

        const main = document.createElement("button");
        main.type = "button";
        main.className = "guide-item-main";
        main.dataset.sectionGo = section.id;
        const title = document.createElement("span");
        title.className = "guide-item-title";
        title.textContent = sectionLabel(section);
        const time = document.createElement("span");
        time.className = "guide-item-time";
        time.textContent = [
          ...(section.label?.trim() ? [formatRange(section)] : []),
          formatDuration(section.end - section.start),
          `${section.weight}×`,
          sectionWeightState(section.weight).toLowerCase()
        ].join(" · ");
        const profile = document.createElement("span");
        profile.className = "guide-section-profile";
        profile.title = `${sectionLabel(section)} across the complete Temporal Topography`;
        profile.setAttribute("aria-hidden", "true");
        setStyleProperty(profile, "--profile-start", `${percent(section.start)}%`);
        setStyleProperty(
          profile,
          "--profile-width",
          `${Math.max(0, percent(section.end) - percent(section.start))}%`
        );
        setStyleProperty(profile, "--start-weight", String(Math.min(3, startReferences)));
        setStyleProperty(profile, "--end-weight", String(Math.min(3, endReferences)));
        profile.appendChild(Object.assign(document.createElement("span"), {
          className: "guide-section-profile-fill"
        }));
        main.append(title, time, profile);
        const header = document.createElement("div");
        header.className = "guide-item-header";
        header.append(
          main,
          guideTitleActions("section", section.id, sectionLabel(section))
        );

        const actions = document.createElement("div");
        actions.className = "guide-item-actions";
        const focus = document.createElement("button");
        focus.type = "button";
        focus.className = "guide-action guide-action-focus";
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
        const endpointLinks = [];
        for (const [role, pin, references] of [
          ["start", section.startPin, startReferences],
          ["end", section.endPin, endReferences]
        ]) {
          if (references <= 1) continue;
          const link = document.createElement("button");
          link.type = "button";
          link.className = "guide-action guide-action-link";
          link.dataset.sectionEndpoint = role;
          link.dataset.unlinkSectionEndpoint = section.id;
          link.textContent = `Unlink ${role === "start" ? "Start" : "End"}`;
          link.title = `Give this Section an independent ${role} Pin at the same Address; drag it onto another Pin to link`;
          endpointLinks.push(link);
        }
        actions.append(focus, weightControl, ...endpointLinks);

        const endpoints = document.createElement("div");
        endpoints.className = "section-endpoints";
        setStyleProperty(endpoints, "--section-start", `${percent(section.start)}%`);
        setStyleProperty(endpoints, "--section-end", `${percent(section.end)}%`);
        const spanLink = document.createElement("span");
        spanLink.className = "section-span-link";
        spanLink.setAttribute("aria-hidden", "true");
        endpoints.append(
          endpointButton("Start", section.startPin, startReferences, section.id),
          spanLink,
          endpointButton("End", section.endPin, endReferences, section.id)
        );

        item.append(header);
        if (selected || section.id === focusedId) {
          const exact = document.createElement("div");
          exact.className = "guide-exact-geometry";
          exact.append(
            addressEditor({
              kind: "section-endpoint", id: section.id, role: "start",
              value: section.start, label: "Start"
            }),
            addressEditor({
              kind: "section-endpoint", id: section.id, role: "end",
              value: section.end, label: "End"
            }),
            addressEditor({
              kind: "section", id: section.id, role: "translate",
              value: section.midpoint, label: "Move extent"
            })
          );
          item.append(actions, endpoints, exact);
        }
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
        const references = sectionsForPin(guide(), pin.id).length;
        const selected = state().selectedRetained?.kind === "pin"
          && state().selectedRetained.id === pin.id;
        const extentSelected = state().selectedPinIds?.includes(pin.id);
        const item = document.createElement("article");
        item.className = "guide-item pin-item";
        setStyleProperty(item, "--reference-weight", String(Math.min(3, references)));
        if (extentSelected) item.classList.add("extent-selected");
        if (selected) item.classList.add("retained-selected");
        if (pin.id === state().guideDrag?.snapTargetPinId) {
          item.classList.add("snap-target");
          if (state().guideDrag?.snapArmed) item.classList.add("snap-armed");
        }
        if (pin.id === state().guideDrag?.id && state().guideDrag?.snapTargetPinId) {
          item.classList.add("snap-source");
        }
        const main = document.createElement("button");
        main.type = "button";
        main.className = "guide-item-main";
        main.dataset.pinGo = pin.id;
        const title = document.createElement("span");
        title.className = "guide-item-title";
        title.textContent = pinLabel(pin);
        const time = document.createElement("span");
        time.className = "guide-item-time";
        time.textContent = `${formatTime(pin.t)} · ${
          pin.kind === PIN_KIND.ENDPOINT ? "Section endpoint" : "Pin"
        } · ${
          references
            ? `anchors ${references} Section${references === 1 ? "" : "s"}`
            : "unshared"
        }`;
        main.append(title, time);
        const header = document.createElement("div");
        header.className = "guide-item-header";
        header.append(
          main,
          guideTitleActions(
            "pin",
            pin.id,
            pinLabel(pin),
            references
              ? {
                  deleteTitle: `Delete ${pinLabel(pin)} and dissolve ${references} referencing Section${references === 1 ? "" : "s"} after confirmation`
                }
              : {}
          )
        );

        const positionTrack = document.createElement("div");
        positionTrack.className = "pin-position-track";
        const positionLine = document.createElement("span");
        positionLine.className = "pin-position-line";
        positionLine.setAttribute("aria-hidden", "true");
        positionTrack.append(positionLine, pinPositionButton(pin, references));
        item.append(header);
        if (selected || extentSelected) {
          item.append(
            positionTrack,
            addressEditor({
              kind: "pin", id: pin.id, value: pin.t, label: "Address"
            })
          );
        }
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
    elements["timeline-key-interval"].dataset.active = String(
      Boolean(projectedModel?.interval)
    );
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
        elements["interval-fill"].dataset.direction = projectedModel.interval.direction;
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
    const semanticCurrent = currentState.currentDrag?.moved
      && Number.isFinite(currentState.currentDrag.candidate)
      ? currentState.currentDrag.candidate
      : currentResolution?.C ?? 0;
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

    elements["timeline-current-time"].textContent = formatTime(semanticCurrent);
    elements["timeline-key-sections"].dataset.active = String(
      Boolean(sortedSections(guide()).length)
    );
    elements["timeline-key-range"].dataset.active = String(loaded);
    elements["timeline-key-resolution"].dataset.active = String(Boolean(currentResolution));
    elements["timeline-key-interval"].dataset.active = String(Boolean(currentInterval));
    elements["timeline-key-field"].dataset.active = String(Boolean(fieldSpan));
    elements["timeline-key-pins"].dataset.active = String(
      Boolean(visiblePins(guide()).length)
    );
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
    if (elements["field-inner-seconds"]) {
      elements["field-inner-seconds"].value = String(currentState.fieldResponse?.innerOffset ?? 2.5);
      elements["field-inner-seconds"].max = String(Math.max(0.05, Math.min(fieldOffsets.backward, fieldOffsets.forward) - 0.05));
    }
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
      "field-inner-seconds", "context-seconds",
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
    elements["deform-down"].disabled = interactionLocked || !(
      currentInterval
      || selectedSection
    );
    elements["deform-up"].disabled = interactionLocked || !(
      currentInterval
      || selectedSection
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
          ? `draw Current-to-midpoint Interval · to ${formatTime(targets.backward)}`
          : `${classifyRetainedRefineRelation(currentInterval, semanticCurrent, targets.backward) === "full" ? "full movement" : "retain anchor"} · to ${formatTime(targets.backward)}`
    );
    setActionMeta(
      "refine-forward",
      "forward-meta",
      "Refine Forward",
      targets.forward === null
        ? forwardBlock === "resolution-limit" ? "Resolution limit" : "Range end"
        : shiftLayer
          ? `draw Current-to-midpoint Interval · to ${formatTime(targets.forward)}`
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
    const selectedMatchesInterval = selectedSection && (
      !currentInterval
      || (
        Math.abs(selectedSection.start - currentInterval.start) <= EPSILON
        && Math.abs(selectedSection.end - currentInterval.end) <= EPSILON
      )
    );
    const deformSection = selectedMatchesInterval ? selectedSection : null;
    const deformTarget = currentInterval || deformSection;
    const deformIsWeighted = deformSection
      && Math.abs(deformSection.weight - 1) > EPSILON;
    elements["deform-label"].textContent = deformIsWeighted
      ? "Normalize"
      : "Deform";
    elements["deform-meta"].textContent = deformTarget
      ? `${deformIsWeighted ? "restore 1×" : "restore last"} · ${formatRange(deformTarget)}`
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
    elements["current-marker"].setAttribute("aria-valuemin", String(activeRange.start));
    elements["current-marker"].setAttribute("aria-valuemax", String(activeRange.end));
    elements["current-marker"].setAttribute("aria-valuenow", String(semanticCurrent));
    elements["current-marker"].setAttribute("aria-valuetext", `${formatTime(semanticCurrent)}; committed Current`);
    elements["current-marker"].title = "Drag Current to Go; Shift-drag for fine Nudge";

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
