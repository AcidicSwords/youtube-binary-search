// DOM projection layer. It derives presentation from state and does not own semantic transactions.
import { cueName } from "./cues.js";
import { formatTime, formatRange, sectionDisplayName } from "./format.js";
// Re-exported so the presentation layer stays the single import site for text
// formatting, while the kernel takes them from the shared module directly.
export { formatTime, formatRange };
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
  DEFAULT_GROUP_ID,
  findPinAt,
  getPin,
  orderedPins,
  partitionGuidePins,
  groupIsVisible,
  sectionIsActive,
  sectionIsVisible,
  sectionsForPin,
  resolveSection,
  groupDeletionPlan,
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
  focusOwnsRangeBoundaries,
  effectiveStepReach,
  projectPlayback,
  previewTransition
} from "./session.js";
import { YOUTUBE_STATE } from "./youtube.js";
import { breathRatePair } from "./step-field-geometry.js";

const TIMELINE_SECTION_HIT_WIDTH = 28;
const TIMELINE_SECTION_LANE_HEIGHT = 20;
// The relationship band never grows past this many lanes; deeper structure
// scrolls inside it rather than displacing the rest of the workspace.
const TIMELINE_SECTION_MAX_LANES = 5;
const COARSE_TIMELINE_SECTION_LANE_HEIGHT = 48;
const TIMELINE_PIN_HIT_SIZE = 52;
const COARSE_TIMELINE_PIN_HIT_SIZE = 56;

// Spatial time is not a duration. It is how much map a source span is given,
// and it only means anything against the source span it stretches. Reporting
// it as an absolute figure invites reading it as real elapsed time, so every
// spatial span is reported as the factor it applies to its own source — and
// only when that factor is not 1, because at 1 the map and the source already
// correspond and there is nothing to say.
const STRETCH_TOLERANCE = 1e-6;

function stretchFactor(spatialSpan, sourceSpan) {
  if (!Number.isFinite(spatialSpan) || !Number.isFinite(sourceSpan)) return null;
  if (!(sourceSpan > STRETCH_TOLERANCE)) return null;
  const factor = spatialSpan / sourceSpan;
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return Math.abs(factor - 1) <= STRETCH_TOLERANCE ? null : factor;
}

function formatStretch(spatialSpan, sourceSpan) {
  const factor = stretchFactor(spatialSpan, sourceSpan);
  return factor === null ? null : `${Number(factor.toFixed(3))}×`;
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

// `viewStart` is the coordinate the map is drawn from; it defaults to 0, so an
// unfocused timeline packs exactly as before. Under Focus the drawn window
// starts partway along the map and controls must stay inside that window.
export function packTimelineSectionLanes(entries, options = {}) {
  const timelineExtent = Number(options.timelineExtent);
  const viewStart = Number(options.viewStart) || 0;
  const requestedControlExtent = Math.max(
    0,
    Number(options.controlExtent) || 0
  );
  const drawnSpan = Number.isFinite(timelineExtent)
    ? Math.max(0, timelineExtent - viewStart)
    : Number.NaN;
  const controlExtent = Number.isFinite(drawnSpan)
    ? Math.min(requestedControlExtent, drawnSpan)
    : requestedControlExtent;
  const controlHalf = controlExtent / 2;
  const laneEnds = [];
  for (const entry of entries) {
    const midpoint = (entry.projected.start + entry.projected.end) / 2;
    const controlCoordinate = Number.isFinite(timelineExtent)
      ? clamp(
          midpoint,
          viewStart + controlHalf,
          Math.max(viewStart + controlHalf, timelineExtent - controlHalf)
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

export function projectedSectionMidpointFraction(section, projection) {
  if (!section || !projection?.sourceToTimeline) return 0.5;
  const start = projection.sourceToTimeline(section.start);
  const end = projection.sourceToTimeline(section.end);
  const midpoint = projection.sourceToTimeline(section.midpoint);
  const width = end - start;
  if (!(width > EPSILON)) return 0.5;
  return clamp((midpoint - start) / width, 0, 1);
}

export function projectCueExtent(cue, projection) {
  if (!cue || !projection?.sourceToTimeline || !(projection.viewSpan > 0)) return null;
  const sourceStart = Number.isFinite(cue.start) ? cue.start : cue.time;
  const sourceEnd = Number.isFinite(cue.end) ? cue.end : sourceStart;
  if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd)) return null;
  const projectedStart = projection.sourceToTimeline(Math.min(sourceStart, sourceEnd));
  const projectedEnd = projection.sourceToTimeline(Math.max(sourceStart, sourceEnd));
  if (projectedEnd < projection.viewStart - EPSILON
    || projectedStart > projection.viewEnd + EPSILON) return null;
  const start = clamp(projectedStart, projection.viewStart, projection.viewEnd);
  const end = clamp(projectedEnd, projection.viewStart, projection.viewEnd);
  return {
    start,
    end,
    left: clamp(projection.coordinateToFraction(start), 0, 1),
    width: Math.max(0, projection.coordinateToFraction(end)
      - projection.coordinateToFraction(start))
  };
}

export function partitionGuideSections(groups, sections) {
  const sourceGroups = Array.isArray(groups) && groups.length
    ? groups
    : [{ id: DEFAULT_GROUP_ID, label: "Map", active: true }];
  const blocks = sourceGroups.map(group => ({ group, sections: [] }));
  const byId = new Map(blocks.map(block => [block.group.id, block]));
  const fallback = byId.get(DEFAULT_GROUP_ID) || blocks[0];
  for (const section of sections || []) {
    (byId.get(section.groupId) || fallback).sections.push(section);
  }
  return blocks;
}

export function createView({ document, getState, getPlayerTime, minRangeSeconds }) {
  const elements = Object.fromEntries(
    [...document.querySelectorAll("[id]")].map(node => [node.id, node])
  );

  let previewAction = null;
  let previewSectionId = null;
  let previewPinId = null;
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
        label: "Working Interval",
        start: focus.extent?.start ?? model().range.start,
        end: focus.extent?.end ?? model().range.end
      };
    }
    return resolveSection(guide(), focus.sectionId);
  };
  const transportIs = kind => state().transport.kind === kind;

  function sectionLabel(section) {
    return section?.label?.trim() || "Section";
  }

  function pinLabel(pin) {
    if (pin?.stopKind === "range-boundary") return pin.label;
    if (pin.label?.trim()) return pin.label.trim();
    const references = sectionsForPin(guide(), pin.id)
      .map(section => resolveSection(guide(), section))
      .filter(Boolean);
    // A derived name says what this Pin is, never when it is. The Address is a
    // field of its own, and a title that carries the range repeats it and then
    // truncates -- the one thing a Pin exists to save you from remembering.
    // Say which ends these are, and of what. "Shared endpoint - 2 Sections"
    // named the arity of the relation instead of the relation: every such Pin
    // read identically, so the list could not be scanned. A Pin holding the end
    // of one Section and the start of the next is the ordinary case, and saying
    // so is what makes the seam legible.
    // The Address is a field of its own, so an unnamed Section contributes its
    // role alone rather than the range `sectionDisplayName` would fall back to.
    const roleOf = section => {
      const role = section.startPinId === pin.id ? "Start" : "End";
      const named = section.label?.trim();
      return named ? `${role} of ${named}` : `Section ${role}`;
    };
    if (references.length === 1) return roleOf(references[0]);
    if (references.length > 1) {
      const named = references.map(roleOf);
      return named.length <= 2
        ? named.join(" · ")
        : `${named.slice(0, 2).join(" · ")} · +${named.length - 2} more`;
    }
    return pin.kind === PIN_KIND.ENDPOINT ? "Section endpoint" : "Pin";
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
    // The view measures with the same effective projection the operators do.
    // A bypassed map drawn straight while Step still counted stored Weight
    // would put every landing point somewhere other than where it was drawn.
    return projectionForModel(model(), {
      deformationBypass: state().deformationBypass ?? null
    });
  }

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", isError);
  }

  // One reused node: the label belongs to the marker and never accumulates.
  const currentMarkerTime = document.createElement("span");
  currentMarkerTime.className = "current-marker-time";
  currentMarkerTime.setAttribute("aria-hidden", "true");

  function percent(time) {
    const projection = timelineProjection();
    if (!(projection.viewSpan > 0)) return 0;
    const raw = clamp(
      projection.coordinateToFraction(projection.sourceToTimeline(time)) * 100,
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

  // One exact Address control: a compact field flanked by the shared Nudge
  // increments. Rows compose these; they do not each carry their own chrome.
  function nudgeButton(kind, id, direction, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "guide-nudge";
    button.dataset.nudgeTarget = kind;
    button.dataset.nudgeId = id;
    button.dataset.nudgeDirection = String(direction);
    button.textContent = direction < 0 ? "\u2212" : "+";
    const description = `Nudge ${label} ${direction < 0 ? "backward" : "forward"}; hold to repeat`;
    button.setAttribute("aria-label", description);
    button.title = description;
    return button;
  }

  // `revealPinId` names the Pin this Address actually belongs to. A Section's
  // endpoints are Pins -- editing one here edits that Pin -- so the label says
  // so and goes there, rather than leaving the reader to find it by Address in
  // a list ordered by Address.
  function addressControl(kind, id, label, address, { revealPinId = null } = {}) {
    const field = document.createElement("span");
    field.className = "guide-address";
    let name;
    if (revealPinId) {
      name = document.createElement("button");
      name.type = "button";
      name.className = "guide-address-reveal";
      name.dataset.revealPin = revealPinId;
      name.title = `Show this endpoint's Pin in Pins`;
    } else {
      name = document.createElement("small");
    }
    name.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "guide-address-input";
    input.inputMode = "decimal";
    input.size = 7;
    input.dataset.addressInput = kind;
    input.dataset.addressId = id;
    input.value = formatTime(address);
    input.setAttribute("aria-label", `${label} Address; timecode or seconds`);
    field.append(
      name,
      nudgeButton(kind, id, -1, label),
      input,
      nudgeButton(kind, id, 1, label)
    );
    return field;
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
      // A Pin in the cluster menu is the same operand as a Pin on the map, so it
      // obeys the same rule: press and move drags it, release without moving
      // Goes to it. Splitting that into a choose button plus a separate drag
      // handle was a grammar this interface uses nowhere else.
      button.dataset.pinDrag = pin.id;
      button.title = sectionsForPin(guide(), pin.id).length === 1
        ? `${pinLabel(pin)} at ${formatTime(pin.sourceT ?? pin.t)}; click to go, drag to move — pause over another Pin, then release to link`
        : `${pinLabel(pin)} at ${formatTime(pin.sourceT ?? pin.t)}; click to go, drag to move`;
      button.append(label, time);
      row.append(button);
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

  // One colour, one meaning — the rule the Guide rows already follow, applied
  // to the map.
  //
  // A Section used to be coloured by hashing its id into six hues. That put
  // identity into the channel the map spends on deformation, and identity is
  // already carried by the name; six hues collide by the seventh Section
  // anyway. Worse, the same hue also drew the compressed and expanded row
  // tints, so one colour said both "this Section" and "this Section's Weight",
  // and the atmosphere band drew compression in violet behind a wire drawn in
  // salmon. The gauge and the thing it measures disagreed.
  //
  // A Section's colour states its Weight, because Weight is the only thing
  // about a Section that colour can say. These three are the whole vocabulary,
  // and the atmosphere is built from the same table, so the two cannot drift.
  const WEIGHT_COLORS = {
    neutral: [143, 163, 189],
    compressed: [172, 112, 225],
    expanded: [65, 189, 174]
  };

  const rgba = ([red, green, blue], alpha) =>
    `rgba(${red}, ${green}, ${blue}, ${alpha})`;

  function sectionColor(weight) {
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0) return rgba(WEIGHT_COLORS.neutral, 1);
    if (Math.abs(value - 1) <= EPSILON) return rgba(WEIGHT_COLORS.neutral, 1);
    // Measured in octaves, not in ratio: halving and doubling are the same size
    // of decision on the ladder, so they read at the same strength.
    const strength = clamp(Math.abs(Math.log2(value)) / 2, 0, 1);
    const toward = value < 1 ? WEIGHT_COLORS.compressed : WEIGHT_COLORS.expanded;
    // Even one rung off neutral is a deliberate act, so it never reads as
    // neutral-with-a-tint; the rest of the range is spent on how far.
    const amount = 0.3 + strength * 0.7;
    return rgba(
      WEIGHT_COLORS.neutral.map((channel, index) =>
        Math.round(channel + (toward[index] - channel) * amount)
      ),
      1
    );
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
      const coordinate = projection.fractionToCoordinate(index / divisions);
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

    // A Range boundary is only worth labelling where the ruler does not already
    // answer it. The ruler spans the drawn extent, so whenever Range reaches
    // that edge its guide would print the same Address the edge tick prints,
    // one on top of the other.
    for (const [role, source] of [
      ["start", range().start],
      ["end", range().end]
    ]) {
      const drawnEdge = role === "start"
        ? projection.viewExtent.start
        : projection.viewExtent.end;
      if (Math.abs(source - drawnEdge) <= EPSILON) continue;
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
      projection.fractionToDistance(0.002)
    );
    const bleed = Math.max(
      projection.fractionToDistance(0.018),
      halfSpan * 0.55
    );
    const spanRatio = clamp(
      (projected.end - projected.start)
      / Math.max(projection.viewSpan, EPSILON),
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
    // Atmosphere and geometry consume the same compiled contributors. Reading
    // raw Guide weights here would leave colour behind after geometry had been
    // straightened and would make the map contradict itself.
    const sections = projection.weightedSections;
    const atmosphere = document.createElement("span");
    atmosphere.className = "deformation-atmosphere";
    const samples = 80;
    const stops = [];
    let compression = false;
    let expansion = false;
    for (let index = 0; index <= samples; index += 1) {
      const ratio = index / samples;
      const coordinate = projection.fractionToCoordinate(ratio);
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
        ? rgba(WEIGHT_COLORS.compressed, 0.02 + strength * 0.28)
        : expanded
          ? rgba(WEIGHT_COLORS.expanded, 0.018 + strength * 0.26)
          : rgba(WEIGHT_COLORS.neutral, 0);
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
    // Contours mark equal source increments, so uneven spacing reads directly
    // as compression or expansion. They span whatever source extent is drawn.
    const contourSpan = projection.viewExtent.end - projection.viewExtent.start;
    for (let index = 1; index < contourCount; index += 1) {
      const contour = document.createElement("i");
      const source = projection.viewExtent.start + contourSpan * index / contourCount;
      contour.style.left = `${
        clamp(projection.coordinateToFraction(projection.sourceToTimeline(source)), 0, 1)
        * 100
      }%`;
      contours.appendChild(contour);
    }
    field.append(atmosphere, contours);
  }

  // Cues drawn on the map, and nothing more than drawn. A Cue is a candidate
  // Address the creator wrote down; it is not in the Guide, not in the
  // projection's segments, and not traversable until it is retained. So this
  // lane holds spans, never buttons, and carries no data attribute any
  // pointer handler reads: hit-testing, drag acquisition and Pin clustering
  // all work from those, and inheriting one of them would make a Cue
  // traversable by a rendering decision rather than by the user retaining it.
  // Returns whether anything was drawn, so the lanes below can make room.
  function renderTimelineCues(projection) {
    const lane = elements["cue-lane"];
    if (!lane) return false;
    lane.replaceChildren();
    const cues = state().cuesOnTimeline ? state().cues || [] : [];
    if (!cues.length) return false;
    // A chapter title may only occupy the map up to where the next one begins.
    // Capping each at a fixed width let neighbours closer than that cap overlap
    // into one unreadable run of words, which is worse than showing fewer names.
    // The name is a child of the lane rather than of its own mark so that a
    // percentage width measures the timeline, which is what the room is in.
    const placed = cues
      .map(cue => ({ cue, projected: projectCueExtent(cue, projection) }))
      .filter(entry => entry.projected)
      .sort((first, second) => first.projected.left - second.projected.left);
    for (const [index, { cue, projected }] of placed.entries()) {
      const mark = document.createElement("span");
      mark.className = "timeline-cue";
      mark.style.left = `${projected.left * 100}%`;
      mark.style.width = `${projected.width * 100}%`;
      lane.appendChild(mark);

      const room = (placed[index + 1]?.projected.left ?? 1) - projected.left;
      const name = document.createElement("span");
      name.className = "timeline-cue-name";
      name.textContent = cueName(cue) || formatTime(cue.time);
      name.style.left = `${projected.left * 100}%`;
      name.style.maxWidth = `${Math.max(0, room * 100)}%`;
      lane.appendChild(name);
    }
    return lane.children.length > 0;
  }

  function renderTimelineSections(projection, sectionLaneHeight) {
    const sectionLane = elements["section-lane"];
    if (!sectionLane) return;
    sectionLane.replaceChildren();
    renderTimelineRuler(projection);
    renderTimelineDeformation(projection);
    const timelineWidth = Math.max(1, elements.timeline.clientWidth || 1);

    const entries = sortedSections(guide())
      .filter(section => sectionIsVisible(guide(), section))
      .map(section => ({
        section,
        projected: projection.projectExtent(section)
      }))
      .filter(entry =>
        entry.projected
        && entry.projected.end - entry.projected.start > EPSILON
        // Only what the map actually draws. Outside Focus this excludes
        // nothing; inside it, unfocused Sections would otherwise pile up
        // against the edges at coordinates the viewer cannot reach.
        && entry.projected.end > projection.viewStart - EPSILON
        && entry.projected.start < projection.viewEnd + EPSILON
      )
      .sort((first, second) =>
        first.projected.start - second.projected.start
        || first.projected.end - second.projected.end
      );

    const packedSections = packTimelineSectionLanes(entries, {
      timelineExtent: projection.viewEnd,
      viewStart: projection.viewStart,
      controlExtent: projection.fractionToDistance(
        TIMELINE_SECTION_HIT_WIDTH / timelineWidth
      )
    });
    // The relationship band is bounded. Overlap creates lanes without limit, and
    // an unbounded band moved the whole workspace down by a lane per overlap --
    // twenty overlapping Sections pushed the Timeline past a full screen, so
    // building structure gradually destroyed the instrument's stability.
    //
    // The band stops growing at MAX_LANES and the lane itself scrolls beyond
    // that. Nothing is overlapped and no Section loses its own control: the
    // depth is still there, it is reached by scrolling the band rather than by
    // moving everything else on the page.
    const laneCount = Math.max(1, packedSections.laneCount);
    const bandLanes = Math.min(laneCount, TIMELINE_SECTION_MAX_LANES);
    const sectionBandHeight = Math.max(30, 8 + bandLanes * sectionLaneHeight);
    const overflowing = laneCount > TIMELINE_SECTION_MAX_LANES;
    sectionLane.classList.toggle("is-overflowing", overflowing);
    setStyleProperty(
      elements.timeline,
      "--section-content-height",
      `${8 + laneCount * sectionLaneHeight}px`
    );
    const pinTop = 17;
    const trackTop = 44;
    const rulerTop = trackTop + 58;
    const cueBand = renderTimelineCues(projection) ? 15 : 0;
    const sectionTop = rulerTop + 38 + cueBand;
    const timelineHeight = sectionTop + sectionBandHeight + 4;
    setStyleProperty(elements.timeline, "--track-top", `${trackTop}px`);
    setStyleProperty(elements.timeline, "--ruler-top", `${rulerTop}px`);
    setStyleProperty(elements.timeline, "--pin-top", `${pinTop}px`);
    setStyleProperty(elements.timeline, "--cue-top", `${rulerTop + 34}px`);
    setStyleProperty(elements.timeline, "--section-top", `${sectionTop}px`);
    setStyleProperty(elements.timeline, "--timeline-height", `${timelineHeight}px`);

    for (const entry of packedSections.entries) {
      const { section, projected, lane } = entry;
      const color = sectionColor(section.weight);
      const selected = state().selectedRetained?.kind === "section"
        && state().selectedRetained.id === section.id;
      const leftFraction = clamp(projection.coordinateToFraction(projected.start), 0, 1);
      const rightFraction = clamp(projection.coordinateToFraction(projected.end), 0, 1);
      const left = leftFraction * 100;
      const width = (rightFraction - leftFraction) * 100;
      const span = document.createElement("span");
      span.className = "timeline-section-span";
      if (selected) span.classList.add("retained-selected");
      setStyleProperty(span, "--section-color", color);
      span.setAttribute("aria-hidden", "true");
      const midpointNode = document.createElement("i");
      midpointNode.className = "timeline-section-midpoint";
      setStyleProperty(
        midpointNode,
        "--section-midpoint",
        `${projectedSectionMidpointFraction(section, projection) * 100}%`
      );
      span.appendChild(midpointNode);

      const body = document.createElement("button");
      body.type = "button";
      body.className = "timeline-section-body";
      body.dataset.sectionGo = section.id;
      body.style.left = `${left}%`;
      body.style.width = `${width}%`;
      setStyleProperty(body, "--section-color", color);
      setStyleProperty(body, "--section-offset", `${lane * sectionLaneHeight}px`);
      if (selected) body.classList.add("retained-selected");
      // The wire itself is the acquisition surface. Pressing near its Start or
      // End drags that endpoint Pin; pressing its middle translates the whole
      // Section. No extra node chrome is drawn over the map.
      body.setAttribute(
        "aria-label",
        `${sectionLabel(section)}, ${formatRange(section)}; click to work from this extent, drag its ends to move an endpoint Pin or its middle to translate it`
      );
      body.title = `${sectionLabel(section)} · click to work from this extent · drag the ends or the middle`;
      // The visible wire belongs to its control. Keeping one geometry owner
      // prevents a click on what looks like a Section from falling through to Go.
      body.appendChild(span);

      const sectionY = sectionTop + lane * sectionLaneHeight + 10;
      const midpointCoordinate = projection.sourceToTimeline(section.midpoint);
      const relationPoints = [
        ["start", projected.start, pinTop + 7],
        ["midpoint", midpointCoordinate, trackTop + 30],
        ["end", projected.end, pinTop + 7]
      ];
      for (const [role, coordinate, relationTop] of relationPoints) {
        const relation = document.createElement("span");
        relation.className = `timeline-section-relation ${role}`;
        if (selected) relation.classList.add("retained-selected");
        relation.style.left = `${
          clamp(projection.coordinateToFraction(coordinate), 0, 1) * 100
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
    const pins = orderedPins(guide())
      .filter(pin => contains(activeRange, pin.t))
      .map(pin => ({
        ...pin,
        sourceT: pin.t,
        // Clustering happens in drawn-map units, so coordinates are expressed
        // relative to the drawn window rather than to the whole map.
        t: projection.sourceToTimeline(pin.t) - projection.viewStart
      }));
    const sectionKey = sortedSections(guide())
      .map(section =>
        `${section.id}:${section.start}:${section.end}:${section.weight}:${section.label}`
        + `:${sectionIsVisible(guide(), section) ? "v" : "h"}`
        + `:${sectionIsActive(guide(), section) ? "a" : "i"}`
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
    const cueKey = state().cuesOnTimeline
      ? (state().cues || []).map(cue =>
          `${cue.time}:${cue.end}:${cue.label || ""}`
        ).join(",")
      : "off";
    const key = `${activeRange.start}|${activeRange.end}|${width}|${sectionLaneHeight}|${pinClusterGap}|${projection.viewStart}:${projection.viewEnd}|${sectionKey}|${selectedKey}|${intervalKey}|${snapKey}|${pinKey}|${cueKey}`;
    if (key === renderedPinKey) return;
    renderedPinKey = key;
    const clusterDrag = state().guideDrag?.origin === "cluster-menu";
    if (!clusterDrag) closePinClusterMenu();
    elements["pin-lane"].replaceChildren();
    renderTimelineSections(projection, sectionLaneHeight);
    renderedClusters = clusterPinsByPixels(
      pins,
      projection.viewSpan,
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
          // A Pin can end more than one Section, and the Weights on either side
          // of it need not agree. It takes the strongest statement at that
          // Address rather than whichever Section was found first, because an
          // average of two Weights describes neither of them.
          const strongest = endpointSections.reduce((best, candidate) =>
            Math.abs(Math.log2(candidate.weight)) > Math.abs(Math.log2(best.weight))
              ? candidate
              : best
          );
          setStyleProperty(button, "--endpoint-color", sectionColor(strongest.weight));
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

  // Guide rendering replaces whole lists, which detaches whatever the reader is
  // holding. An increment control that repeats while held is gone after the
  // first rebuild its own edit causes: the hold ends, the keyboard loses its
  // place, and a screen reader loses the row it was on. Identity survives the
  // rebuild even though the node does not, so focus is restored by naming the
  // control rather than by keeping the element.
  function focusSignature(element) {
    if (!element || element === document.body) return null;
    const data = element.dataset || {};
    for (const key of [
      "nudgeTarget",
      "addressInput",
      "sectionWeight",
      "sectionGroup",
      "sectionGo",
      "pinGo",
      "cueGo",
      "groupToggle",
      "renameGroup",
      "deleteGroup"
    ]) {
      if (data[key] === undefined) continue;
      return [
        key,
        data[key],
        data.addressId || "",
        data.nudgeDirection || "",
        data.groupState || ""
      ].join("|");
    }
    return element.id ? `id|${element.id}` : null;
  }

  function findBySignature(signature) {
    if (!signature) return null;
    const [key, value, addressId, direction, groupState] = signature.split("|");
    if (key === "id") return document.getElementById(value) || null;
    const attribute = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    const candidates = document.querySelectorAll?.(`[data-${attribute}]`) || [];
    for (const candidate of candidates) {
      const data = candidate.dataset || {};
      if (data[key] !== value) continue;
      if (addressId && (data.addressId || "") !== addressId) continue;
      if (direction && (data.nudgeDirection || "") !== direction) continue;
      if (groupState && (data.groupState || "") !== groupState) continue;
      return candidate;
    }
    return null;
  }

  function renderGuide() {
    const held = focusSignature(document.activeElement);
    renderGuideLists();
    if (!held) return;
    if (focusSignature(document.activeElement) === held) return;
    const restored = findBySignature(held);
    restored?.focus?.({ preventScroll: true });
  }

  function renderGuideLists() {
    const pinPartition = partitionGuidePins(guide());
    const pins = [...pinPartition.visible, ...pinPartition.hidden];
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
    if (!state().videoLoaded) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Load a video to see its Sections.";
      elements["sections-list"].appendChild(empty);
    } else {
      const groupContainers = renderGroupBlocks(sections);
      for (const section of sections) {
        const startReferences = sectionsForPin(guide(), section.startPin.id).length;
        const endReferences = sectionsForPin(guide(), section.endPin.id).length;
        const selected = state().guideRetained?.kind === "section"
          && state().guideRetained.id === section.id;
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
        setStyleProperty(item, "--section-color", sectionColor(section.weight));

        const main = document.createElement("button");
        main.type = "button";
        main.className = "guide-item-main";
        main.dataset.sectionGo = section.id;
        const title = document.createElement("span");
        title.className = "guide-item-title";
        title.textContent = sectionLabel(section);
        const time = document.createElement("span");
        time.className = "guide-item-time";
        // Extent first: it is what a Section is. Then how much of it, then how
        // much map it takes. The weight word is dropped because the factor
        // already states both its direction and its size.
        time.textContent = [
          formatRange(section),
          formatDuration(section.end - section.start),
          `${section.weight}×`
        ].join(" · ");
        const profile = document.createElement("span");
        profile.className = "guide-section-profile";
        profile.title = `${sectionLabel(section)} across the complete timeline; drag it on the Timeline to translate it`;
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
        // A Section's Group sits with its Weight: both say how this Section
        // takes part in the map, and both are chosen from a fixed set.
        const groupControl = document.createElement("label");
        groupControl.className = "guide-weight";
        const groupLabel = document.createElement("span");
        groupLabel.textContent = "Group";
        const groupSelect = document.createElement("select");
        groupSelect.dataset.sectionGroup = section.id;
        for (const group of guide().groups || []) {
          const option = document.createElement("option");
          option.value = group.id;
          option.textContent = groupDisplayName(group);
          groupSelect.appendChild(option);
        }
        groupSelect.value = section.groupId || "group-default";
        groupControl.append(groupLabel, groupSelect);
        actions.append(focus, weightControl, groupControl);

        // Exact topology and numeric editing on one line. Guide no longer
        // duplicates the Timeline's spatial drag system, and it no longer
        // repeats the same extent as three separate stacked editors.
        const addresses = document.createElement("div");
        addresses.className = "guide-addresses";
        // Duration is already stated on the row's own line; repeating it beside
        // the End field made the same fact appear twice in one card.
        addresses.append(
          addressControl("section-start", section.id, "Start", section.start, {
            revealPinId: section.startPin?.id
          }),
          addressControl("section-end", section.id, "End", section.end, {
            revealPinId: section.endPin?.id
          })
        );

        item.append(header);
        // One rule for every Guide row: a row is expanded exactly when it is
        // the selected object. Participating in the Working Interval, being
        // focused, or being a snap target are conditions worth showing, and
        // they are shown as highlights — they do not open rows on their own,
        // because rows that open themselves make selection unreadable.
        if (selected) item.append(actions, addresses);
        const destination = groupContainers.get(section.groupId)
          || groupContainers.get(DEFAULT_GROUP_ID)
          || elements["sections-list"];
        destination.appendChild(item);
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
      const appendPin = pin => {
        const references = sectionsForPin(guide(), pin.id).length;
        const selected = state().guideRetained?.kind === "pin"
          && state().guideRetained.id === pin.id;
        const extentSelected = state().selectedPinIds?.includes(pin.id);
        const item = document.createElement("article");
        item.className = "guide-item pin-item";
        // Hovering a Pin row shows where it is, exactly as hovering a Section
        // row shows where that is. A Guide entry you cannot locate on the map
        // without clicking it is a list, not a guide.
        item.dataset.pinPreviewId = pin.id;
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
        // Address first, because that is what a Pin is for. The kind is already
        // in the title, and "unshared" is the ordinary case: only a Pin that
        // actually anchors Sections has something extra to declare.
        time.textContent = [
          formatTime(pin.t),
          references
            ? `anchors ${references} Section${references === 1 ? "" : "s"}`
            : null
        ].filter(Boolean).join(" · ");
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

        // A Pin has one Address and no extent, so a miniature track showing
        // where that single point sits is the Temporal Topography redrawn at
        // useless scale. Position is read and moved on the map; the Guide holds
        // the exact Address.
        const addresses = document.createElement("div");
        addresses.className = "guide-addresses";
        addresses.append(addressControl("pin", pin.id, "Address", pin.t));
        item.append(header);
        // Unlink is a Pin operation: it takes one Section off a shared Pin and
        // gives it its own at the same Address. It used to sit in the Section
        // row, which meant reading a Section to learn something about a Pin,
        // and made the shared Pin -- the only object the operation is about --
        // the one thing not in view. Here the Pin names every Section it holds,
        // so which one is being taken off is stated rather than inferred.
        const shared = references > 1
          ? sectionsForPin(guide(), pin.id)
            .map(section => resolveSection(guide(), section))
            .filter(Boolean)
          : [];
        if (shared.length) {
          const unlinks = document.createElement("div");
          unlinks.className = "guide-item-actions pin-unlink-actions";
          for (const section of shared) {
            const role = section.startPin?.id === pin.id ? "start" : "end";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "guide-action guide-action-link";
            button.dataset.sectionEndpoint = role;
            button.dataset.unlinkSectionEndpoint = section.id;
            // Named by Address, not by the bare title: a Pin holding two
            // unnamed Sections would otherwise offer two buttons reading
            // "Unlink Section", which identifies neither. A Guide row states
            // the Address in a field of its own and so keeps its title bare;
            // this button has no such field.
            button.textContent = `Unlink ${sectionDisplayName(section)}`;
            button.title = `Give ${sectionDisplayName(section)} its own ${role} Pin at this Address; drag it onto another Pin to link again`;
            unlinks.appendChild(button);
          }
          if (selected) item.append(unlinks);
        }
        if (selected) item.append(addresses);
        elements["pins-list"].appendChild(item);
      };
      const partitions = [
        {
          title: "On Timeline",
          pins: pinPartition.visible,
          detail: "available to Timeline actions and traversal"
        },
        {
          title: "Hidden",
          pins: pinPartition.hidden,
          detail: "retained in Guide but absent from Timeline actions"
        }
      ];
      for (const partition of partitions) {
        if (!partition.pins.length) continue;
        elements["pins-list"].appendChild(pinDivider(
          partition.title,
          `${partition.pins.length} Pin${partition.pins.length === 1 ? "" : "s"} ${partition.detail}`
        ));
        for (const pin of partition.pins) appendPin(pin);
      }
    }

    const composing = state().shiftLayers?.guide === true;
    elements["guide-compose-toggle"].setAttribute("aria-pressed", String(composing));
    elements["guide-compose-toggle"].classList.toggle("active", composing);
    renderCues();
    invalidateTimelinePins();
    renderTimelinePins();
  }

  function pinDivider(title, meta) {
    const row = document.createElement("div");
    row.className = "guide-divider";
    const name = document.createElement("span");
    name.className = "guide-divider-name";
    name.textContent = title;
    const detail = document.createElement("span");
    detail.className = "guide-divider-meta";
    detail.textContent = meta;
    row.append(name, detail);
    return row;
  }

  // "Map" is the default Group's own name, never a fallback for the rest: two
  // rows reading "Map" would name the same thing twice and make the Section's
  // Group control unusable. A Group is created with a name and cannot be left
  // without one, so this only guards a Guide written before that was true.
  function groupDisplayName(group) {
    if (group.id === DEFAULT_GROUP_ID) return group.label?.trim() || "Map";
    return group.label?.trim() || "Group";
  }

  // Groups are a flat partition, so the Guide draws flat blocks rather than a
  // detached legend. Membership is visible because each Section row is inside
  // exactly one block; empty Groups remain reachable because the block exists
  // independently of whether it currently contains a Section.
  function renderGroupBlocks(sections) {
    const blocks = partitionGuideSections(guide().groups || [], sections);
    const containers = new Map();
    for (const { group, sections: members } of blocks) {
      const block = document.createElement("section");
      block.className = "guide-group-block";
      block.dataset.groupId = group.id;
      const visible = groupIsVisible(guide(), group);
      block.classList.toggle("is-hidden", !visible);
      block.classList.toggle("is-inactive", !group.active);

      const row = document.createElement("div");
      row.className = "guide-group-row";
      const name = document.createElement("span");
      name.className = "guide-group-name";
      name.textContent = groupDisplayName(group);
      const meta = document.createElement("span");
      meta.className = "guide-group-meta";
      meta.textContent = `${members.length} Section${members.length === 1 ? "" : "s"}`;
      const toggles = document.createElement("div");
      toggles.className = "guide-group-toggles";
      for (const [key, text, title] of [
        ["visible", "On Timeline", "Make this the one Group whose Sections and endpoint Pins are on the Timeline"],
        ["active", "Active", "Let this Group's Weights change Timeline distance"]
      ]) {
        const label = document.createElement("label");
        label.className = "guide-group-toggle";
        const box = document.createElement("input");
        // Both are checkboxes: a radio cannot be cleared, so "draw nothing"
        // had no gesture. Exactly-one is kept by the transaction, not by the
        // widget refusing to let go.
        box.type = "checkbox";
        box.checked = key === "visible" ? visible : group[key] !== false;
        box.dataset.groupToggle = group.id;
        box.dataset.groupState = key;
        box.title = title;
        const caption = document.createElement("span");
        caption.textContent = text;
        label.append(box, caption);
        toggles.appendChild(label);
      }

      // Every Group offers rename and remove, the default included. Only the
      // last one refuses removal, and the Guide says so at the moment of asking
      // rather than by hiding the control.
      {
        const titleActions = document.createElement("span");
        titleActions.className = "guide-title-actions";
        const rename = document.createElement("button");
        rename.type = "button";
        rename.className = "guide-title-action guide-title-rename";
        rename.dataset.renameGroup = group.id;
        rename.textContent = "✎";
        rename.setAttribute("aria-label", `Rename ${group.label || "Group"}`);
        rename.title = `Rename ${group.label || "Group"}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "guide-title-action guide-title-delete danger-text";
        remove.dataset.deleteGroup = group.id;
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${group.label || "Group"}`);
        const deletion = groupDeletionPlan(guide(), group.id);
        const heir = (guide().groups || [])
          .find(entry => entry.id === deletion.heirGroupId);
        const moved = deletion.movedSectionIds.length;
        remove.disabled = !deletion.allowed;
        remove.title = !deletion.allowed
          ? deletion.reason === "last-group"
            ? "The last Group cannot be removed: Sections have to belong somewhere"
            : "This Group cannot be removed"
          : moved
            ? `Remove this Group; its ${moved} Section${moved === 1 ? " moves" : "s move"} to ${groupDisplayName(heir)}`
            : "Remove this Group";
        titleActions.append(rename, remove);
        row.append(name, meta, toggles, titleActions);
      }

      const container = document.createElement("div");
      container.className = "guide-group-sections";
      container.dataset.groupSections = group.id;
      if (!members.length) {
        const empty = document.createElement("p");
        empty.className = "guide-group-empty";
        empty.textContent = "No Sections";
        container.appendChild(empty);
      }
      block.append(row, container);
      elements["sections-list"].appendChild(block);
      containers.set(group.id, container);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "guide-action guide-group-add";
    add.dataset.groupAdd = "new";
    add.textContent = "New Group";
    add.title = "Create a Group for Sections that should be shown or weighted together";
    elements["sections-list"].appendChild(add);
    return containers;
  }

  // Cues are offered, never placed. They render as candidates: the creator's
  // own title and extent, one action that turns a candidate into structure, and
  // nothing that edits anything — because there is nothing yet to edit.
  function renderCues() {
    const cues = state().cues || [];
    elements["cues-list-count"].textContent = String(cues.length);
    const laneToggle = elements["cue-lane-toggle"];
    const showing = Boolean(state().cuesOnTimeline);
    laneToggle.disabled = !cues.length;
    laneToggle.setAttribute("aria-pressed", showing ? "true" : "false");
    laneToggle.textContent = showing ? "Hide on timeline" : "Show on timeline";
    laneToggle.title = showing
      ? "Stop drawing the offered Cues on the map"
      : "Draw every offered Cue on the map as a mark you can read but not act on";
    elements["cues-list"].replaceChildren();
    if (!cues.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = state().videoLoaded
        ? "No Cues offered. Paste a description to navigate its chapters."
        : "Load a video, then paste its description.";
      elements["cues-list"].appendChild(empty);
      return;
    }
    for (const cue of cues) {
      const item = document.createElement("article");
      item.className = "guide-item cue-item";
      const main = document.createElement("button");
      main.type = "button";
      main.className = "guide-item-main";
      main.dataset.cueGo = String(cue.index);
      const title = document.createElement("span");
      title.className = "guide-item-title";
      title.textContent = cueName(cue) || "Cue";
      const meta = document.createElement("span");
      meta.className = "guide-item-time";
      const spans = cue.end > cue.start + EPSILON;
      meta.textContent = spans
        ? `${formatRange(cue)} · ${formatDuration(cue.end - cue.start)}`
        : formatTime(cue.time);
      main.title = spans
        ? `${cueName(cue) || "Cue"} at ${formatTime(cue.time)}; click to go and take its extent, Shift+click to extend the Working Interval`
        : `${cueName(cue) || "Cue"} at ${formatTime(cue.time)}; click to go`;
      main.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "guide-item-actions cue-item-actions";
      const retain = document.createElement("button");
      retain.type = "button";
      retain.className = "guide-action";
      retain.dataset.cueRetain = String(cue.index);
      retain.textContent = spans ? "Retain Section" : "Retain Pin";
      retain.title = spans
        ? "Save this Cue's extent as a Section, keeping the creator's title"
        : "Save this Cue's Address as a Pin, keeping the creator's title";
      actions.append(retain);
      const header = document.createElement("div");
      header.className = "guide-item-header";
      header.append(main, actions);
      item.append(header);
      elements["cues-list"].appendChild(item);
    }
  }

  function renderActionPreview(previewResult, structural, kind = previewAction) {
    const predicted = previewResult?.changed
      ? previewResult.session.model
      : null;
    const previewResolution = predicted?.resolution || null;
    const removedInterval = kind === "release" ? interval() : null;
    const structuralExtent = structural?.[kind] || null;
    const previewInterval = predicted?.interval || removedInterval || structuralExtent;
    const structuralPoint = structuralExtent
      && Math.abs(structuralExtent.end - structuralExtent.start) <= EPSILON
      ? structuralExtent.start
      : null;
    const previewExtent = structuralPoint === null ? previewInterval : null;

    elements["action-preview-fill"].hidden = !previewExtent;
    if (previewExtent) {
      elements["action-preview-fill"].dataset.kind = kind;
      if (removedInterval) elements["action-preview-fill"].dataset.effect = "remove";
      else elements["action-preview-fill"].removeAttribute("data-effect");
      setSegment(
        elements["action-preview-fill"],
        previewExtent.start,
        previewExtent.end
      );
    } else {
      elements["action-preview-fill"].removeAttribute("data-kind");
      elements["action-preview-fill"].removeAttribute("data-effect");
    }

    // A preview answers one question: where would this land, and across what.
    // It answered five at once -- a neighbourhood fill and four bound markers
    // besides -- which is more chrome than any committed state draws, and the
    // operators that push a midpoint show it in the destination anyway. The
    // extent and the destination are all that remain; the rest was noise the
    // moment the movement was invoked, so it is gone rather than hidden.
    const previewCurrent = previewResolution?.C ?? structuralPoint;
    elements["preview-current-marker"].hidden = previewCurrent === null;
    if (previewCurrent === null) return;
    setMarkerPosition(elements["preview-current-marker"], previewCurrent);
  }

  function renderSectionPreview() {
    const section = resolveSection(guide(), previewSectionId);
    elements["section-preview-fill"].hidden = !section;
    if (section) setSegment(elements["section-preview-fill"], section.start, section.end);
    const marker = elements["pin-preview-marker"];
    if (!marker) return;
    const pin = previewPinId ? getPin(guide(), previewPinId) : null;
    marker.hidden = !pin;
    if (pin) setMarkerPosition(marker, pin.t);
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

    // Cursor reports observation that has left Current. While it has not, this
    // readout would print a second copy of Current, so it reports nothing --
    // the same rule the Cursor marker follows on the map.
    elements["cursor-time"].textContent = physicallyDisplaced || moving
      ? formatTime(cursor)
      : "—";
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
      // A Step target answers "where would a Step land". While a Step is
      // actually being performed — held on a control or key, or dragged out on
      // Current — that question is being answered by the movement itself
      // several times a second, and two recomputed markers streaking across the
      // map read as artifacts rather than as information. They stand down for
      // the gesture exactly as they already do during live playback.
      const performingStep = state().stepGestureActive === true
        || state().currentDrag?.moved === true;
      if (livePlayback || performingStep) {
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
      // The parent owns one centered control, never the iframe-sized surface.
      // YouTube's controls therefore remain pointer-accessible in every state.
      const surfaceOwnsPointer = currentState.videoLoaded && (!ordinaryPlayback || !centerRunning);
      surface.hidden = !surfaceOwnsPointer;
      const activation = currentState.field?.activation || null;
      const preparing = Boolean(activation && !activation.ready);
      surface.disabled = !currentState.videoLoaded || preparing;
      const label = contextObservation
        ? "Stop Context and Play from Current"
        : ordinaryPlayback
          ? "Pause Panorama"
          : "Play Panorama";
      surface.setAttribute("aria-label", preparing ? "Preparing Panorama" : label);
      surface.setAttribute("aria-pressed", String(ordinaryPlayback));
      if (elements["center-transport-label"]) {
        elements["center-transport-label"].textContent = preparing ? "Preparing Panorama" : label;
      }
      if (elements["center-transport-icon"]) {
        elements["center-transport-icon"].textContent = (
          contextObservation || ordinaryPlayback
        ) ? "■" : "▶";
      }
    }

    if (state().videoLoaded && currentResolution) {
      // A Current drag seeks the player to the candidate, so the Cursor would
      // track the Current marker exactly and draw a second marker underneath
      // it. Cursor reports observation that has left Current; during the drag
      // it has not, so there is nothing for it to report.
      const showCursor = (moving || physicallyDisplaced)
        && !state().currentDrag?.moved;
      elements["cursor-marker"].hidden = !showCursor;
      if (showCursor) setMarkerPosition(elements["cursor-marker"], cursor);
    } else {
      elements["cursor-marker"].hidden = true;
    }
  }

  function render() {
    const currentState = state();
    const loaded = currentState.videoLoaded;
    // The matrix shows its own armed layer, and the physical modifier, which
    // is global by nature. A layer armed in the Guide is the Guide's.
    const shiftLayer = currentState.shiftLayers?.matrix === true
      || currentState.shiftKeyHeld;
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
    const positiveWorkingInterval = currentInterval
      && currentInterval.end - currentInterval.start > EPSILON
      ? currentInterval
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
      tag: shiftLayer
        ? positiveWorkingInterval
        : { start: semanticCurrent, end: semanticCurrent },
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
    // Dragging Current commits a Step, so the drag must show the Step it will
    // commit. Without this the Working Interval and the neighbourhood stand
    // still under a moving marker and then jump on release, which reads as the
    // gesture doing something other than what it does.
    const activeCurrentDrag = currentState.currentDrag?.moved
      ? currentState.currentDrag
      : null;
    const dragProjection = activeCurrentDrag?.projection || projection;
    const dragDistance = activeCurrentDrag
      ? Math.abs(
          dragProjection.sourceToTimeline(activeCurrentDrag.candidate)
          - dragProjection.sourceToTimeline(activeCurrentDrag.originSource)
        )
      : 0;
    const dragAction = activeCurrentDrag && dragDistance > EPSILON
      ? (
          activeCurrentDrag.candidate < activeCurrentDrag.originSource
            ? "stepBackward"
            : "stepForward"
        )
      : null;
    // Pressing a Step control focuses it, and focus legitimately arms the
    // operator preview — so a held Step would otherwise draw the whole
    // predictive apparatus, five markers and two extents, and recompute all of
    // it on every repeat. An operator preview answers "what would this do";
    // while the operator is running, the movement is answering that several
    // times a second. It stands down for the gesture, exactly as the Step
    // targets and Cursor do.
    const performingStepGesture = currentState.stepGestureActive === true;
    const armedPreviewAction = performingStepGesture ? null : resolvedPreviewAction;
    const previewResult = dragAction
      ? previewTransition(currentState.session, dragAction, {
          seconds: dragDistance,
          projection: dragProjection
        })
      : armedPreviewAction
        ? previewTransition(currentState.session, armedPreviewAction, {
            seconds: effectiveReach[previewDirection],
            destination: previewPin?.t,
            projection
          })
        : null;
    const previewKind = dragAction
      || (performingStepGesture ? null : previewAction);
    const focused = focusedProjection();
    const focusOwnsBoundaries = focusOwnsRangeBoundaries(model());

    elements["timeline-key-sections"].dataset.active = String(
      Boolean(sortedSections(guide()).length)
    );
    elements["timeline-key-range"].dataset.active = String(loaded);
    elements["timeline-key-resolution"].dataset.active = String(Boolean(currentResolution));
    elements["timeline-key-interval"].dataset.active = String(Boolean(currentInterval));
    elements["timeline-key-field"].dataset.active = String(Boolean(fieldSpan));
    elements["timeline-key-pins"].dataset.active = String(
      Boolean(orderedPins(guide()).length)
    );
    const overallStretch = formatStretch(projection.timelineExtent, model().duration);
    elements["duration-time"].textContent = overallStretch
      ? `${formatTime(model().duration)} · ${overallStretch} spatial`
      : formatTime(model().duration);
    elements["range-label"].textContent = loaded ? formatRange(activeRange) : "—";
    const resolutionTimelineExtent = currentResolution
      ? projection.timelineDistance(currentResolution.L, currentResolution.R)
      : null;
    const resolutionSourceDuration = currentResolution
      ? currentResolution.R - currentResolution.L
      : null;
    const resolutionStretch = formatStretch(
      resolutionTimelineExtent,
      resolutionSourceDuration
    );
    elements["resolution-label"].textContent = currentResolution
      ? `${
          formatDuration(resolutionSourceDuration)
        }${
          resolutionStretch ? ` · ${resolutionStretch} spatial` : ""
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

    // One bounded breathing relation: 0 < inner < outer.
    const fieldBreath = currentState.fieldBreath || { inner: 0.25, outer: 2.5, rate: 0.25 };
    elements["field-inner-offset"].value = String(fieldBreath.inner);
    elements["field-outer-offset"].value = String(fieldBreath.outer);
    elements["field-inner-offset"].max = String(fieldBreath.outer);
    elements["field-outer-offset"].min = String(fieldBreath.inner);
    if (elements["panorama-setting-value"]) {
      const configuredPair = breathRatePair(fieldBreath.rate);
      const pair = elements["field-breath-rate"]?.selectedOptions?.[0]?.textContent
        || `${configuredPair.tailRate}× / ${configuredPair.leadRate}×`;
      elements["panorama-setting-value"].textContent =
        `${fieldBreath.inner}–${fieldBreath.outer} s · ${pair}`;
    }
    // The stored quantum stays exact; only its presentation is rounded.
    elements["nudge-seconds"].value = String(
      Number((currentState.nudgeSeconds ?? 1 / 24).toFixed(3))
    );
    elements["step-size-seconds"].value = String(configuredReach.forward);
    const adaptiveStep = configuredReach.mode === STEP_REACH_MODE.ADAPTIVE;
    // Adaptive Reach derives a live map distance from the weighted Range, so it
    // is reported as the source time the next forward Step would actually
    // cross rather than as its raw map size.
    const adaptiveSourceSpan = loaded && currentResolution
      ? Math.abs(
          projection.stepTarget(
            semanticCurrent,
            effectiveReach.forward,
            "forward",
            activeRange
          ) - semanticCurrent
        )
      : null;
    elements["step-size-summary"].textContent = adaptiveStep
      ? `1/${Math.round(1 / configuredReach.fraction)} Range${
          adaptiveSourceSpan === null ? "" : ` · ${formatDuration(adaptiveSourceSpan)}`
        }`
      : `${Number(Number(configuredReach.forward).toFixed(3))} units · manual`;
    elements["step-mode-fixed"].setAttribute("aria-pressed", String(!adaptiveStep));
    elements["step-mode-adaptive"].setAttribute("aria-pressed", String(adaptiveStep));
    elements["step-size-seconds"].disabled = adaptiveStep || !loaded;
    for (const control of document.querySelectorAll("[data-step-fraction]")) {
      const selected = Math.abs(
        Number(control.dataset.stepFraction) - configuredReach.fraction
      ) <= Number.EPSILON;
      control.setAttribute("aria-pressed", String(selected));
      control.disabled = false;
    }

    const bypass = projection.deformationBypass;
    const deformationTarget = selectedForPreview;
    const deformationScopeKind = deformationTarget ? "section" : "all";
    const deformationScopeActive = deformationTarget
      ? bypass?.kind === "section" && bypass.sectionId === deformationTarget.id
      : bypass?.kind === "all";
    const deformationLabel = deformationScopeActive
      ? deformationTarget ? "Restore Section" : "Restore Timeline"
      : deformationTarget ? "Straighten Section" : "Straighten Timeline";
    const deformationMeta = deformationTarget
      ? sectionDisplayName(deformationTarget)
      : "Complete map";
    if (elements["deformation-toggle"]) {
      elements["deformation-toggle"].setAttribute(
        "aria-pressed",
        String(deformationScopeActive)
      );
      elements["deformation-toggle"].setAttribute(
        "aria-label",
        `${deformationLabel}: ${deformationMeta}`
      );
      elements["deformation-toggle"].dataset.scope = deformationScopeKind;
      elements["deformation-toggle"].dataset.activeScope = bypass?.kind || "none";
      elements["deformation-toggle-label"].textContent = deformationLabel;
      elements["deformation-toggle-meta"].textContent = deformationMeta;
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
      ? "Previous Pin"
      : "Step Backward";
    elements["step-forward-label"].textContent = shiftLayer
      ? "Next Pin"
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
            ? "Panorama"
            : sectionKind === "selected-pins"
              ? "Selected Pins"
              : "Working Interval"
        } ${formatRange(sectionExtent)}`
      : `No ${
          sectionKind === "field-span"
            ? "Held Panorama span"
            : sectionKind === "selected-pins"
              ? "two selected Pins"
              : "Working Interval"
        }`;

    elements["focused-section"].hidden = !focused;
    if (focused) {
      elements["focused-section-title"].textContent = focused.label?.trim()
        || (focusedSectionId() ? sectionLabel(focused) : "Working Interval");
      elements["focused-section-range"].textContent = formatRange(focused);
    } else {
      elements["focused-section-title"].textContent = "—";
      elements["focused-section-range"].textContent = "—";
    }

    const interactionLocked = !loaded;
    for (const id of [
      "go-range-start", "range-start-here", "range-midpoint",
      "go-range-end", "range-end-here", "full-video-range",
      "field-inner-offset", "field-outer-offset", "field-breath-rate",
      "nudge-seconds", "context-seconds", "playback-rate", "playback-dynamic",
      "deformation-toggle",
      "section-source", "section-label", "pin-label",
      "cue-source", "cue-parse", "cue-clear"
    ]) {
      if (elements[id]) elements[id].disabled = interactionLocked;
    }
    // The fixed Shift rate is not what Shift uses while the rate follows
    // weight. Saying so by disabling it is more honest than leaving a live
    // control nothing reads; the stored choice is untouched underneath and
    // returns as soon as the box is cleared.
    if (elements["playback-rate"]) {
      elements["playback-rate"].disabled = interactionLocked
        || state().dynamicPlaybackRate === true;
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
    // Plain Tag always has Current. Shifted Tag requires the positive Working
    // Interval it retains; the label and availability follow Shift, not the
    // incidental existence of an Interval.
    elements.tag.disabled = interactionLocked
      || (shiftLayer && !positiveWorkingInterval);
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
    elements["full-video-range"].disabled = interactionLocked
      || focusOwnsBoundaries
      || atFullVideo;
    elements["range-start-here"].disabled = interactionLocked
      || focusOwnsBoundaries
      || !currentResolution
      || semanticCurrent <= activeRange.start + EPSILON
      || semanticCurrent >= activeRange.end - minRangeSeconds;
    elements["range-end-here"].disabled = interactionLocked
      || focusOwnsBoundaries
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
    const rangeSourceSpan = activeRange.end - activeRange.start;
    const rangeStretch = formatStretch(
      projection.timelineDistance(activeRange.start, activeRange.end),
      rangeSourceSpan
    );
    elements["reopen-meta"].textContent = actionModel?.reopen
      ? `${formatDuration(rangeSourceSpan)} Range${
          rangeStretch ? ` · ${rangeStretch} spatial` : ""
        }`
      : "Range-level resolution";
    // Step Reach is a distance on the map, and inside a weighted Section a
    // given map distance covers less or more source time. Every readout that
    // announces a movement states the source time that movement actually
    // crosses, so "10s · to 0:43" can never appear beside a Current of 0:38.
    // The configured setting keeps its own number: it is a map distance, and a
    // map distance is stated in the source time it equals at neutral Weight.
    const stepSourceSpan = destination => formatDuration(
      Math.abs(destination - semanticCurrent)
    );
    elements["step-backward-meta"].textContent = actionModel?.stepBackward
      ? shiftLayer
        ? previous
          ? `${formatTime(previous.t)} · ${pinLabel(previous)}`
          : "No Pin backward"
        : `${stepSourceSpan(actionModel.stepBackward.destination)} · to ${formatTime(actionModel.stepBackward.destination)}`
      : shiftLayer && previous
        ? `${formatTime(previous.t)} · ${pinLabel(previous)}`
        : "Range start";
    elements["step-forward-meta"].textContent = actionModel?.stepForward
      ? shiftLayer
        ? next
          ? `${formatTime(next.t)} · ${pinLabel(next)}`
          : "No Pin forward"
        : `${stepSourceSpan(actionModel.stepForward.destination)} · to ${formatTime(actionModel.stepForward.destination)}`
      : shiftLayer && next
        ? `${formatTime(next.t)} · ${pinLabel(next)}`
        : "Range end";
    elements["release-meta"].textContent = currentInterval
      ? "Working Interval"
      : "No Interval";
    const tagLabel = shiftLayer ? "Tag as Section" : "Tag as Pin";
    const tagMeta = shiftLayer
      ? positiveWorkingInterval
        ? `${formatRange(positiveWorkingInterval)} → Section`
        : "No Working Interval"
      : `Current ${formatTime(semanticCurrent)} → Pin`;
    elements["tag-label"].textContent = tagLabel;
    elements["tag-meta"].textContent = tagMeta;
    elements.tag.setAttribute("aria-label", `${tagLabel}: ${tagMeta}`);
    elements["focus-toggle-meta"].textContent = focused
      ? `restore ${formatRange(model().focus.returnRange)}`
      : currentInterval
        ? "Working Interval"
        : selectedSection
          ? formatRange(selectedSection)
          : "No target";

    if (!loaded || !currentResolution) {
      for (const id of [
        "range-start-handle", "range-end-handle", "resolution-start-marker",
        "resolution-end-marker", "backward-target-marker", "forward-target-marker", "current-marker", "cursor-marker",
        "current-departure-marker"
      ]) elements[id].hidden = true;
      elements["interval-fill"].hidden = true;
      elements["field-span-fill"].hidden = true;
      elements["section-preview-fill"].hidden = true;
      elements["action-preview-fill"].hidden = true;
      elements["preview-current-marker"].hidden = true;
      renderTimelinePins();
      renderTransport();
      return;
    }

    for (const id of [
      "resolution-start-marker", "resolution-end-marker", "current-marker"
    ]) elements[id].hidden = false;
    for (const id of ["range-start-handle", "range-end-handle"]) {
      elements[id].hidden = focusOwnsBoundaries;
      elements[id].disabled = focusOwnsBoundaries;
    }
    setSegment(elements["range-fill"], activeRange.start, activeRange.end);
    setMarkerPosition(elements["range-start-handle"], activeRange.start);
    setMarkerPosition(elements["range-end-handle"], activeRange.end);

    // Dragging Current commits a Step: the marker follows the candidate
    // Address, the departure it extends or shortens from stays as a faint
    // marker, the previewed Interval and neighbourhood show the Step that
    // will land, and Session Current remains unchanged until release.
    const currentDrag = state().currentDrag;
    const dragging = Boolean(currentDrag?.moved);
    const candidate = dragging ? currentDrag.candidate : semanticCurrent;
    setMarkerPosition(elements["current-marker"], candidate);
    elements["current-marker"].classList.toggle("is-dragging", dragging);
    elements["current-marker"].classList.toggle(
      "is-precision",
      dragging && currentDrag.precision === true
    );
    elements["current-marker"].setAttribute(
      "aria-valuenow",
      String(candidate)
    );
    elements["current-marker"].setAttribute(
      "aria-valuetext",
      `${formatTime(candidate)}; Current${dragging ? " candidate" : ""}`
    );
    // Current reads its own source Address on the map, where it is looked at.
    if (!currentMarkerTime.parentElement) {
      elements["current-marker"].appendChild(currentMarkerTime);
    }
    currentMarkerTime.textContent = formatTime(candidate);
    elements["current-departure-marker"].hidden = !dragging;
    if (dragging) {
      setMarkerPosition(
        elements["current-departure-marker"],
        currentDrag.originSource
      );
    }

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
    renderActionPreview(previewResult, structuralPresentation, previewKind);
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
    setPreviewSection(value) { previewSectionId = value; },
    setPreviewPin(value) { previewPinId = value; }
  };
}
