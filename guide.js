import { EPSILON, clamp, midpoint } from "./range-geometry.js";

export const PIN_KIND = Object.freeze({
  EXPLICIT: "explicit",
  ENDPOINT: "section-endpoint"
});

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
    version: 5,
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

  const label = String(options.label || options.title || "").trim();
  if (!label) throw new RangeError("A Section requires a title.");

  const duplicate = findDuplicateSection(guide, start.id, end.id, label);
  if (duplicate) return { section: duplicate, created: false };

  const createdAt = Number(options.createdAt) || now();
  const section = {
    id: options.id || makeId("section"),
    videoId: guide.videoId,
    startPinId: start.id,
    endPinId: end.id,
    label,
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
  if (!text) throw new RangeError("A Section requires a title.");
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

function removeOrphanEndpoint(guide, pinId) {
  const pin = getPin(guide, pinId);
  if (!pin || sectionsForPin(guide, pinId).length) return;
  if (pin.kind === PIN_KIND.ENDPOINT && !pin.label?.trim()) {
    guide.pins = guide.pins.filter(item => item.id !== pinId);
  }
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

export function previousPin(guide, current, range) {
  return visiblePins(guide)
    .filter(pin => pin.t >= range.start - EPSILON && pin.t <= range.end + EPSILON)
    .filter(pin => pin.t < current - EPSILON)
    .at(-1) || null;
}

export function nextPin(guide, current, range) {
  return visiblePins(guide)
    .filter(pin => pin.t >= range.start - EPSILON && pin.t <= range.end + EPSILON)
    .find(pin => pin.t > current + EPSILON) || null;
}

export function sortedSections(guide) {
  return guide.sections
    .map(section => resolveSection(guide, section))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end || a.label.localeCompare(b.label));
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
      provenance: source.provenance || null,
      createdAt: Number(source.createdAt) || now(),
      updatedAt: Number(source.updatedAt) || Number(source.createdAt) || now()
    };
    if (section.label && resolveSection({ ...guide, sections: [section] }, section)) guide.sections.push(section);
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
      || !String(section.label || "").trim()
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

    const coincident = findPinAt(guide, address);
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
    if (!firstPinId || !secondPinId || !label || firstPinId === secondPinId) continue;

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
      provenance: sourceSection.provenance || null,
      createdAt: Number(sourceSection.createdAt) || now(),
      updatedAt: Number(sourceSection.updatedAt) || Number(sourceSection.createdAt) || now()
    };
    if (!resolveSection({ ...guide, sections: [section] }, section)) continue;
    guide.sections.push(section);
    sectionKeys.add(duplicateKey);
    usedIds.add(section.id);
  }

  guide.updatedAt = Number(source.updatedAt) || now();
  return guide;
}
