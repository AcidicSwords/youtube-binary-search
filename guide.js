import { EPSILON, clamp, midpoint } from "./range-geometry.js";

export const PIN_KIND = Object.freeze({
  EXPLICIT: "explicit",
  ENDPOINT: "section-endpoint"
});

export const SECTION_WEIGHT_VALUES = Object.freeze([
  0.25,
  0.5,
  0.75,
  1,
  1.25,
  1.5,
  1.75,
  2
]);
export const DEFAULT_SECTION_WEIGHT = 1;
export const DEFAULT_DEFORM_WEIGHT = 0.5;

export function isSectionWeight(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    && SECTION_WEIGHT_VALUES.some(weight => Math.abs(weight - numeric) <= EPSILON);
}

export function normalizeSectionWeight(value, fallback = DEFAULT_SECTION_WEIGHT) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const exact = SECTION_WEIGHT_VALUES.find(
      weight => Math.abs(weight - numeric) <= EPSILON
    );
    if (exact !== undefined) return exact;
  }
  return isSectionWeight(fallback)
    ? Number(fallback)
    : DEFAULT_SECTION_WEIGHT;
}

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function now() {
  return Date.now();
}

export function createGuide(videoId = null) {
  return {
    version: 7,
    videoId,
    pins: [],
    sections: [],
    updatedAt: now()
  };
}

export function sortPins(pins) {
  return [...pins].sort((a, b) => a.t - b.t || a.createdAt - b.createdAt);
}

export function getPin(guide, pinId) {
  return guide.pins.find(pin => pin.id === pinId) || null;
}

export function findPinAt(guide, address, epsilon = EPSILON) {
  return guide.pins.find(pin => Math.abs(pin.t - address) <= epsilon) || null;
}

export function ensurePin(guide, address, options = {}) {
  if (!guide || !Array.isArray(guide.pins)) throw new TypeError("A valid Guide is required.");
  if (!Number.isFinite(address)) throw new TypeError("A Pin requires a finite Address.");

  const existing = findPinAt(guide, address, options.epsilon ?? EPSILON);
  if (existing) {
    if (options.label?.trim()) existing.label = options.label.trim();
    if (options.kind === PIN_KIND.EXPLICIT) existing.kind = PIN_KIND.EXPLICIT;
    else if (!existing.kind) existing.kind = options.kind || PIN_KIND.ENDPOINT;
    existing.updatedAt = now();
    guide.updatedAt = existing.updatedAt;
    return { pin: existing, created: false };
  }

  const createdAt = Number(options.createdAt) || now();
  const pin = {
    id: options.id || makeId("pin"),
    videoId: guide.videoId,
    t: address,
    label: String(options.label || "").trim(),
    kind: options.kind || PIN_KIND.EXPLICIT,
    provenance: options.provenance || null,
    createdAt,
    updatedAt: Number(options.updatedAt) || createdAt
  };
  guide.pins.push(pin);
  guide.pins = sortPins(guide.pins);
  guide.updatedAt = now();
  return { pin, created: true };
}

export function renamePin(guide, pinId, label) {
  const pin = getPin(guide, pinId);
  if (!pin) throw new RangeError("Pin not found.");
  pin.label = String(label || "").trim();
  pin.updatedAt = now();
  guide.updatedAt = pin.updatedAt;
  return pin;
}

export function sectionsForPin(guide, pinId) {
  return guide.sections.filter(section =>
    section.startPinId === pinId || section.endPinId === pinId
  );
}

function sectionEndpointKey(role) {
  return role === "start" ? "startPinId" : role === "end" ? "endPinId" : null;
}

export function coincidentPins(guide, pinId, epsilon = EPSILON) {
  const pin = getPin(guide, pinId);
  if (!pin) return [];
  return sortPins(guide.pins).filter(candidate =>
    candidate.id !== pin.id
    && Math.abs(candidate.t - pin.t) <= epsilon
  );
}

export function unlinkSectionEndpoint(guide, sectionId, role) {
  const section = guide.sections.find(item => item.id === sectionId);
  const key = sectionEndpointKey(role);
  if (!section || !key) {
    return {
      changed: false,
      reason: section ? "invalid-endpoint-role" : "missing-section"
    };
  }
  const source = getPin(guide, section[key]);
  if (!source) return { changed: false, reason: "missing-pin" };
  if (sectionsForPin(guide, source.id).length <= 1) {
    return { changed: false, reason: "unshared-pin" };
  }

  const changedAt = now();
  const pin = {
    id: makeId("pin"),
    videoId: guide.videoId,
    t: source.t,
    label: "",
    kind: PIN_KIND.ENDPOINT,
    provenance: `unlink:${sectionId}:${role}:${source.id}`,
    createdAt: changedAt,
    updatedAt: changedAt
  };
  guide.pins.push(pin);
  guide.pins = sortPins(guide.pins);
  section[key] = pin.id;
  section.updatedAt = changedAt;
  guide.updatedAt = changedAt;
  return {
    changed: true,
    pin,
    section: resolveSection(guide, section),
    previousPinId: source.id
  };
}

export function linkSectionEndpoint(guide, sectionId, role) {
  const section = guide.sections.find(item => item.id === sectionId);
  const key = sectionEndpointKey(role);
  if (!section || !key) {
    return {
      changed: false,
      reason: section ? "invalid-endpoint-role" : "missing-section"
    };
  }
  const source = getPin(guide, section[key]);
  if (!source) return { changed: false, reason: "missing-pin" };
  const provenance = String(source.provenance || "").split(":");
  const originalPinId = provenance[0] === "unlink"
    && provenance[1] === sectionId
    && provenance[2] === role
    ? provenance[3]
    : null;
  const original = originalPinId ? getPin(guide, originalPinId) : null;
  const target = original || coincidentPins(guide, source.id)
    .sort((first, second) =>
      sectionsForPin(guide, second.id).length
      - sectionsForPin(guide, first.id).length
      || first.createdAt - second.createdAt
    )[0];
  if (!target) return { changed: false, reason: "no-coincident-pin" };

  const nextStartPinId = role === "start" ? target.id : section.startPinId;
  const nextEndPinId = role === "end" ? target.id : section.endPinId;
  const nextStart = getPin(guide, nextStartPinId);
  const nextEnd = getPin(guide, nextEndPinId);
  if (!nextStart || !nextEnd || nextEnd.t <= nextStart.t + EPSILON) {
    return { changed: false, reason: "invalid-link-geometry" };
  }
  if (findDuplicateSection(
    guide,
    nextStartPinId,
    nextEndPinId,
    section.label,
    section.id
  )) return { changed: false, reason: "duplicate-section" };

  const changedAt = now();
  section[key] = target.id;
  section.updatedAt = changedAt;
  guide.updatedAt = changedAt;
  removeOrphanEndpoint(guide, source.id);
  return {
    changed: true,
    pin: target,
    section: resolveSection(guide, section),
    previousPinId: source.id
  };
}

export function visiblePins(guide) {
  return sortPins(guide.pins);
}

export function deletePin(guide, pinId) {
  const pin = getPin(guide, pinId);
  if (!pin) return { deleted: false, references: 0 };
  const references = sectionsForPin(guide, pinId).length;
  if (references) return { deleted: false, references };
  guide.pins = guide.pins.filter(item => item.id !== pinId);
  guide.updatedAt = now();
  return { deleted: true, references: 0 };
}

export function resolveSection(guide, sectionOrId) {
  const section = typeof sectionOrId === "string"
    ? guide.sections.find(item => item.id === sectionOrId)
    : sectionOrId;
  if (!section) return null;

  const startPin = getPin(guide, section.startPinId);
  const endPin = getPin(guide, section.endPinId);
  if (!startPin || !endPin || !(endPin.t > startPin.t + EPSILON)) return null;

  return {
    ...section,
    startPin,
    endPin,
    start: startPin.t,
    end: endPin.t,
    midpoint: midpoint(startPin.t, endPin.t)
  };
}

export function sectionIdentityKey(startPinId, endPinId, label) {
  return `${startPinId}|${endPinId}|${String(label || "").trim().toLocaleLowerCase()}`;
}

export function findDuplicateSection(guide, startPinId, endPinId, label, excludeId = null) {
  const key = sectionIdentityKey(startPinId, endPinId, label);
  return guide.sections.find(section =>
    section.id !== excludeId
    && sectionIdentityKey(section.startPinId, section.endPinId, section.label) === key
  ) || null;
}

export function createSection(guide, startPinId, endPinId, options = {}) {
  const first = getPin(guide, startPinId);
  const second = getPin(guide, endPinId);
  if (!first || !second) throw new RangeError("A Section requires two existing Pins.");

  const [start, end] = first.t < second.t ? [first, second] : [second, first];
  if (!(end.t > start.t + EPSILON)) throw new RangeError("A Section requires distinct Pins.");

  const requestedWeight = options.weight ?? DEFAULT_SECTION_WEIGHT;
  if (!isSectionWeight(requestedWeight)) {
    throw new RangeError("A Section requires a canonical timeline weight.");
  }
  const label = String(options.label || options.title || "").trim();
  const duplicate = findDuplicateSection(guide, start.id, end.id, label);
  if (duplicate) return { section: duplicate, created: false };

  const createdAt = Number(options.createdAt) || now();
  const section = {
    id: options.id || makeId("section"),
    videoId: guide.videoId,
    startPinId: start.id,
    endPinId: end.id,
    label,
    weight: normalizeSectionWeight(requestedWeight),
    provenance: options.provenance || null,
    createdAt,
    updatedAt: Number(options.updatedAt) || createdAt
  };
  guide.sections.push(section);
  guide.updatedAt = now();
  return { section, created: true };
}

export function createSectionFromTimes(guide, start, end, options = {}) {
  const A = clamp(Math.min(start, end), 0, Number.POSITIVE_INFINITY);
  const B = clamp(Math.max(start, end), 0, Number.POSITIVE_INFINITY);
  if (!(B > A + EPSILON)) throw new RangeError("A Section requires positive duration.");
  if (options.weight !== undefined && !isSectionWeight(options.weight)) {
    throw new RangeError("A Section requires a canonical timeline weight.");
  }

  const startPin = ensurePin(guide, A, {
    kind: PIN_KIND.ENDPOINT,
    createdAt: options.createdAt,
    provenance: options.provenance ? `${options.provenance}:start` : null
  }).pin;
  const endPin = ensurePin(guide, B, {
    kind: PIN_KIND.ENDPOINT,
    createdAt: options.createdAt,
    provenance: options.provenance ? `${options.provenance}:end` : null
  }).pin;

  return createSection(guide, startPin.id, endPin.id, options);
}

export function renameSection(guide, sectionId, label) {
  const section = guide.sections.find(item => item.id === sectionId);
  if (!section) throw new RangeError("Section not found.");
  const text = String(label || "").trim();
  if (findDuplicateSection(
    guide,
    section.startPinId,
    section.endPinId,
    text,
    section.id
  )) {
    throw new RangeError("A Section with this title and Extent already exists.");
  }
  section.label = text;
  section.updatedAt = now();
  guide.updatedAt = section.updatedAt;
  return section;
}

export function setSectionWeight(guide, sectionId, weight) {
  const section = guide.sections.find(item => item.id === sectionId);
  if (!section) return { changed: false, reason: "missing-section" };
  if (!isSectionWeight(weight)) {
    return { changed: false, reason: "invalid-section-weight" };
  }
  const next = normalizeSectionWeight(weight);
  if (Math.abs(section.weight - next) <= EPSILON) {
    return {
      changed: false,
      reason: "unchanged-section-weight",
      section: resolveSection(guide, section)
    };
  }
  section.weight = next;
  section.updatedAt = now();
  guide.updatedAt = section.updatedAt;
  return {
    changed: true,
    section: resolveSection(guide, section)
  };
}

function pinMovementBounds(guide, pinId, duration = Number.POSITIVE_INFINITY) {
  let minimum = 0;
  let maximum = Math.max(0, Number(duration) || 0);
  for (const source of sectionsForPin(guide, pinId)) {
    const section = resolveSection(guide, source);
    if (!section) continue;
    if (section.startPinId === pinId) {
      maximum = Math.min(maximum, section.end - EPSILON);
    }
    if (section.endPinId === pinId) {
      minimum = Math.max(minimum, section.start + EPSILON);
    }
  }
  return { minimum, maximum };
}

export function movePin(guide, pinId, address, duration = Number.POSITIVE_INFINITY) {
  const pin = getPin(guide, pinId);
  if (!pin || !Number.isFinite(address)) {
    return { changed: false, reason: pin ? "invalid-address" : "missing-pin" };
  }
  const { minimum, maximum } = pinMovementBounds(guide, pinId, duration);
  if (maximum < minimum) return { changed: false, reason: "immovable-pin" };
  const destination = clamp(address, minimum, maximum);
  if (Math.abs(destination - pin.t) <= EPSILON) {
    return { changed: false, reason: "unchanged-pin", pin };
  }
  pin.t = destination;
  pin.updatedAt = now();
  guide.pins = sortPins(guide.pins);
  guide.updatedAt = pin.updatedAt;
  return { changed: true, pin, destination };
}

function translatedPinIds(guide, section) {
  return new Set([section.startPinId, section.endPinId]);
}

function sectionTranslationBounds(guide, section, pinIds, duration) {
  let minimumDelta = -section.start;
  let maximumDelta = duration - section.end;
  for (const source of guide.sections) {
    const resolved = resolveSection(guide, source);
    if (!resolved) continue;
    const startMoves = pinIds.has(resolved.startPinId);
    const endMoves = pinIds.has(resolved.endPinId);
    if (startMoves === endMoves) continue;
    if (startMoves) {
      maximumDelta = Math.min(
        maximumDelta,
        resolved.end - EPSILON - resolved.start
      );
    } else {
      minimumDelta = Math.max(
        minimumDelta,
        resolved.start + EPSILON - resolved.end
      );
    }
  }
  return { minimumDelta, maximumDelta };
}

/**
 * Translate one Section through its two shared endpoint Pins. Geometric
 * containment is a query, not ownership: unrelated interior Pins never move.
 * Every Section incident to either shared endpoint deforms truthfully.
 */
export function translateSection(guide, sectionId, requestedDelta, duration) {
  const section = resolveSection(guide, sectionId);
  if (!section) return { changed: false, reason: "missing-section" };
  if (!Number.isFinite(requestedDelta)) {
    return { changed: false, reason: "invalid-delta" };
  }
  const end = Math.max(0, Number(duration) || 0);
  const pinIds = translatedPinIds(guide, section);
  const bounds = sectionTranslationBounds(guide, section, pinIds, end);
  if (bounds.maximumDelta < bounds.minimumDelta) {
    return { changed: false, reason: "immovable-section" };
  }
  const delta = clamp(
    requestedDelta,
    bounds.minimumDelta,
    bounds.maximumDelta
  );
  if (Math.abs(delta) <= EPSILON) {
    return { changed: false, reason: "unchanged-section", section };
  }
  const changedAt = now();
  for (const pin of guide.pins) {
    if (!pinIds.has(pin.id)) continue;
    pin.t = clamp(pin.t + delta, 0, end);
    pin.updatedAt = changedAt;
  }
  guide.pins = sortPins(guide.pins);
  for (const source of guide.sections) {
    if (
      pinIds.has(source.startPinId)
      || pinIds.has(source.endPinId)
    ) source.updatedAt = changedAt;
  }
  guide.updatedAt = changedAt;
  return {
    changed: true,
    delta,
    section: resolveSection(guide, sectionId),
    pinIds: [...pinIds]
  };
}

function removeOrphanEndpoint(guide, pinId) {
  const pin = getPin(guide, pinId);
  if (!pin || sectionsForPin(guide, pinId).length) return;
  if (pin.kind === PIN_KIND.ENDPOINT && !pin.label?.trim()) {
    guide.pins = guide.pins.filter(item => item.id !== pinId);
  }
}

export function replaceSectionExtent(guide, sectionId, start, end, options = {}) {
  const section = guide.sections.find(item => item.id === sectionId);
  if (!section) throw new RangeError("Section not found.");

  const A = clamp(Math.min(start, end), 0, Number.POSITIVE_INFINITY);
  const B = clamp(Math.max(start, end), 0, Number.POSITIVE_INFINITY);
  if (!(B > A + EPSILON)) throw new RangeError("A Section requires positive duration.");

  const label = String(options.label ?? section.label ?? "").trim();

  const existingStart = findPinAt(guide, A);
  const existingEnd = findPinAt(guide, B);
  if (
    existingStart
    && existingEnd
    && findDuplicateSection(
      guide,
      existingStart.id,
      existingEnd.id,
      label,
      section.id
    )
  ) {
    throw new RangeError("A Section with this title and Extent already exists.");
  }

  const previousStartPinId = section.startPinId;
  const previousEndPinId = section.endPinId;
  const startPin = ensurePin(guide, A, {
    kind: PIN_KIND.ENDPOINT,
    provenance: options.provenance ? `${options.provenance}:start` : null
  }).pin;
  const endPin = ensurePin(guide, B, {
    kind: PIN_KIND.ENDPOINT,
    provenance: options.provenance ? `${options.provenance}:end` : null
  }).pin;

  section.startPinId = startPin.id;
  section.endPinId = endPin.id;
  section.label = label;
  section.provenance = options.provenance ?? section.provenance ?? null;
  section.updatedAt = now();
  guide.updatedAt = section.updatedAt;

  for (const pinId of new Set([previousStartPinId, previousEndPinId])) {
    if (pinId !== startPin.id && pinId !== endPin.id) {
      removeOrphanEndpoint(guide, pinId);
    }
  }

  return resolveSection(guide, section);
}

export function deleteSection(guide, sectionId) {
  const section = guide.sections.find(item => item.id === sectionId);
  if (!section) return false;
  guide.sections = guide.sections.filter(item => item.id !== sectionId);
  removeOrphanEndpoint(guide, section.startPinId);
  removeOrphanEndpoint(guide, section.endPinId);
  guide.updatedAt = now();
  return true;
}

function timelineCoordinate(projection, source) {
  return projection?.sourceToTimeline
    ? projection.sourceToTimeline(source)
    : source;
}

function timelineStops(guide, range, projection = null) {
  const retained = projection?.orderedPinStops
    ? projection.orderedPinStops(range, guide)
    : visiblePins(guide)
      .filter(pin => pin.t >= range.start - EPSILON && pin.t <= range.end + EPSILON)
      .map(pin => ({
        ...pin,
        stopKind: "pin",
        sourcePin: pin,
        timeline: pin.t
      }));
  const boundaries = [
    {
      id: null,
      t: range.start,
      label: "Range Start",
      stopKind: "range-boundary",
      boundary: "start",
      sourcePin: null,
      timeline: timelineCoordinate(projection, range.start),
      createdAt: Number.NEGATIVE_INFINITY
    },
    {
      id: null,
      t: range.end,
      label: "Range End",
      stopKind: "range-boundary",
      boundary: "end",
      sourcePin: null,
      timeline: timelineCoordinate(projection, range.end),
      createdAt: Number.POSITIVE_INFINITY
    }
  ].filter(boundary =>
    !retained.some(stop => Math.abs(stop.t - boundary.t) <= EPSILON)
  );
  return [...retained, ...boundaries].sort((first, second) =>
    first.timeline - second.timeline
    || first.t - second.t
    || (first.createdAt ?? 0) - (second.createdAt ?? 0)
    || String(first.id || "").localeCompare(String(second.id || ""))
  );
}

export function previousPin(guide, current, range, projection = null) {
  const coordinate = timelineCoordinate(projection, current);
  const stops = timelineStops(guide, range, projection);
  return stops
    .filter(item => item.timeline < coordinate - EPSILON)
    .at(-1) || null;
}

export function nextPin(guide, current, range, projection = null) {
  const coordinate = timelineCoordinate(projection, current);
  const stops = timelineStops(guide, range, projection);
  return stops.find(item => item.timeline > coordinate + EPSILON) || null;
}

export function sortedSections(guide) {
  return guide.sections
    .map(section => resolveSection(guide, section))
    .filter(Boolean)
    .sort((a, b) =>
      a.start - b.start
      || b.end - a.end
      || String(a.label || "").localeCompare(String(b.label || ""))
      || a.id.localeCompare(b.id)
    );
}

export function clusterPinsByPixels(pins, duration, width, minimumGap = 16) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0) {
    return pins.map(pin => ({ pins: [pin], x: 0 }));
  }

  const clusters = [];
  for (const pin of sortPins(pins)) {
    const x = clamp(pin.t / duration, 0, 1) * width;
    const last = clusters.at(-1);
    if (last && x - last.lastX < minimumGap) {
      last.pins.push(pin);
      last.lastX = x;
      last.x = last.pins.reduce(
        (sum, item) => sum + clamp(item.t / duration, 0, 1) * width,
        0
      ) / last.pins.length;
    } else {
      clusters.push({ pins: [pin], x, lastX: x });
    }
  }
  return clusters.map(({ pins: cluster, x }) => ({ pins: cluster, x }));
}

function kindFromLegacy(pin) {
  if (pin.kind === PIN_KIND.EXPLICIT || pin.kind === PIN_KIND.ENDPOINT) return pin.kind;
  if (pin.provenance === "mark" || pin.provenance === "pin" || pin.provenance === "current" || pin.label) {
    return PIN_KIND.EXPLICIT;
  }
  return PIN_KIND.ENDPOINT;
}

export function normalizeGuide(parsed, videoId) {
  const guide = createGuide(videoId);
  const sourceVersion = Number(parsed?.version) || 0;
  const sourcePins = Array.isArray(parsed?.pins)
    ? parsed.pins
    : (Array.isArray(parsed?.marks) ? parsed.marks : []);
  const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];

  const idMap = new Map();
  for (const source of sourcePins) {
    if (!source?.id || !Number.isFinite(Number(source.t))) continue;
    const id = source.id.startsWith?.("mark-")
      ? source.id.replace(/^mark-/, "pin-")
      : source.id;
    idMap.set(source.id, id);
    guide.pins.push({
      id,
      videoId,
      t: Number(source.t),
      label: String(source.label || ""),
      kind: kindFromLegacy(source),
      provenance: source.provenance || null,
      createdAt: Number(source.createdAt) || now(),
      updatedAt: Number(source.updatedAt) || Number(source.createdAt) || now()
    });
  }
  guide.pins = sortPins(guide.pins);

  for (const source of sections) {
    if (!source?.id) continue;
    const startPinId = idMap.get(source.startPinId || source.startMarkId) || source.startPinId || source.startMarkId;
    const endPinId = idMap.get(source.endPinId || source.endMarkId) || source.endPinId || source.endMarkId;
    if (!startPinId || !endPinId) continue;
    const section = {
      id: source.id,
      videoId,
      startPinId,
      endPinId,
      label: String(source.label || "").trim(),
      weight: sourceVersion >= 7
        ? normalizeSectionWeight(source.weight)
        : source.collapsed === true
          ? 0.25
          : normalizeSectionWeight(source.weight),
      provenance: source.provenance || null,
      createdAt: Number(source.createdAt) || now(),
      updatedAt: Number(source.updatedAt) || Number(source.createdAt) || now()
    };
    if (resolveSection({ ...guide, sections: [section] }, section)) guide.sections.push(section);
  }

  guide.updatedAt = now();
  return guide;
}

export function migrateStructureV2(parsed, videoId) {
  if (!parsed || !Array.isArray(parsed.marks) || !Array.isArray(parsed.spans)) return createGuide(videoId);
  return normalizeGuide({
    marks: parsed.marks,
    sections: parsed.spans.map(span => ({
      id: span.id,
      startMarkId: span.startMarkId,
      endMarkId: span.endMarkId,
      label: span.label || span.title,
      provenance: span.provenance,
      createdAt: span.createdAt,
      updatedAt: span.updatedAt
    }))
  }, videoId);
}

export function migrateSavedRegions(parsed, videoId) {
  if (!parsed || !Array.isArray(parsed.regions)) return createGuide(videoId);
  const guide = createGuide(videoId);
  for (const region of parsed.regions) {
    const start = Number(region?.start);
    const end = Number(region?.end);
    const label = String(region?.label || region?.title || "").trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start + EPSILON) || !label) continue;
    createSectionFromTimes(guide, start, end, {
      label,
      provenance: "legacy-region",
      createdAt: region.createdAt
    });
  }
  return guide;
}

export function validateGuide(guide, duration) {
  if (!guide || !Array.isArray(guide.pins) || !Array.isArray(guide.sections)) return false;
  const ids = new Set();
  for (const pin of guide.pins) {
    if (
      !pin?.id
      || ids.has(pin.id)
      || !Number.isFinite(pin.t)
      || pin.t < 0
      || pin.t > duration
      || !Object.values(PIN_KIND).includes(pin.kind)
    ) return false;
    ids.add(pin.id);
  }
  for (const section of guide.sections) {
    if (
      !section?.id
      || ids.has(section.id)
      || !section.startPinId
      || !section.endPinId
      || !isSectionWeight(section.weight)
      || !resolveSection(guide, section)
    ) return false;
    ids.add(section.id);
  }
  return true;
}

/**
 * Recover the valid, canonical subset of a persisted Guide.
 * Corrupt entries are discarded independently so one malformed record does not
 * make the rest of the user's retained structure unreadable.
 */
export function sanitizeGuide(input, videoId, duration) {
  const end = Math.max(0, Number(duration) || 0);
  const source = input && Array.isArray(input.pins) && Array.isArray(input.sections)
    ? input
    : normalizeGuide(input, videoId);
  const preserveIndependentCoincidentPins = Number(source?.version) >= 7;
  const guide = createGuide(videoId);
  const idMap = new Map();
  const usedIds = new Set();

  for (const sourcePin of sortPins(source.pins || [])) {
    const address = Number(sourcePin?.t);
    if (
      !sourcePin?.id
      || usedIds.has(sourcePin.id)
      || !Number.isFinite(address)
      || address < 0
      || address > end
      || !Object.values(PIN_KIND).includes(sourcePin.kind)
    ) continue;

    const coincident = preserveIndependentCoincidentPins
      ? null
      : findPinAt(guide, address);
    if (coincident) {
      idMap.set(sourcePin.id, coincident.id);
      if (sourcePin.kind === PIN_KIND.EXPLICIT) coincident.kind = PIN_KIND.EXPLICIT;
      if (!coincident.label && String(sourcePin.label || "").trim()) {
        coincident.label = String(sourcePin.label).trim();
      }
      coincident.updatedAt = Math.max(
        Number(coincident.updatedAt) || 0,
        Number(sourcePin.updatedAt) || Number(sourcePin.createdAt) || 0
      );
      continue;
    }

    const pin = {
      id: sourcePin.id,
      videoId,
      t: address,
      label: String(sourcePin.label || "").trim(),
      kind: sourcePin.kind,
      provenance: sourcePin.provenance || null,
      createdAt: Number(sourcePin.createdAt) || now(),
      updatedAt: Number(sourcePin.updatedAt) || Number(sourcePin.createdAt) || now()
    };
    guide.pins.push(pin);
    idMap.set(sourcePin.id, pin.id);
    usedIds.add(pin.id);
  }
  guide.pins = sortPins(guide.pins);

  const sectionKeys = new Set();
  for (const sourceSection of source.sections || []) {
    if (!sourceSection?.id || usedIds.has(sourceSection.id)) continue;
    const firstPinId = idMap.get(sourceSection.startPinId);
    const secondPinId = idMap.get(sourceSection.endPinId);
    const label = String(sourceSection.label || "").trim();
    if (!firstPinId || !secondPinId || firstPinId === secondPinId) continue;

    const firstPin = getPin(guide, firstPinId);
    const secondPin = getPin(guide, secondPinId);
    if (!firstPin || !secondPin || Math.abs(firstPin.t - secondPin.t) <= EPSILON) continue;
    const [startPinId, endPinId] = firstPin.t < secondPin.t
      ? [firstPinId, secondPinId]
      : [secondPinId, firstPinId];
    const duplicateKey = sectionIdentityKey(startPinId, endPinId, label);
    if (sectionKeys.has(duplicateKey)) continue;

    const section = {
      id: sourceSection.id,
      videoId,
      startPinId,
      endPinId,
      label,
      weight: normalizeSectionWeight(
        sourceSection.weight,
        sourceSection.collapsed === true ? 0.25 : DEFAULT_SECTION_WEIGHT
      ),
      provenance: sourceSection.provenance || null,
      createdAt: Number(sourceSection.createdAt) || now(),
      updatedAt: Number(sourceSection.updatedAt) || Number(sourceSection.createdAt) || now()
    };
    const resolved = resolveSection({ ...guide, sections: [section] }, section);
    if (!resolved) continue;
    guide.sections.push(section);
    sectionKeys.add(duplicateKey);
    usedIds.add(section.id);
  }

  guide.updatedAt = Number(source.updatedAt) || now();
  return guide;
}
