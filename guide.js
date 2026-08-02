import { EPSILON, clamp, midpoint } from "./range-geometry.js";

export const PIN_KIND = Object.freeze({
  EXPLICIT: "explicit",
  ENDPOINT: "section-endpoint"
});

// The canonical ladder. Its interior is a familiar linear quarter-step scale
// around 1; its two ends are deliberate extremes — 0.125 to fold a Section
// nearly out of the way, 4 to open one far past ordinary inspection. Nothing
// between 2 and 4, or below 0.125, earns its place on a ladder that must stay
// steppable one press at a time.
export const SECTION_WEIGHT_VALUES = Object.freeze([
  0.125,
  0.25,
  0.5,
  0.75,
  1,
  1.25,
  1.5,
  1.75,
  2,
  4
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

// A Group carries two independent relations over its Sections.
//
//   visible  -- exactly one Group supplies Sections and endpoint Pins to Timeline
//   active   -- any number of Groups may contribute deformation
//
// Nothing is frozen, so nothing can go stale: an active Group contributes to the
// density product whether or not its landmarks are drawn, and editing a Weight
// updates that product immediately. Groups partition the Sections: every
// Section belongs to exactly one Group, so a Section can never be half-hidden.
export const DEFAULT_GROUP_ID = "group-default";

function moveVisibleGroupFirst(guide, groupId) {
  const index = guide.groups.findIndex(group => group.id === groupId);
  if (index <= 0) return;
  const [group] = guide.groups.splice(index, 1);
  guide.groups.unshift(group);
}

function preferredVisibleGroup(guide, preferredId = null) {
  return guide.groups.find(group => group.id === preferredId)
    || guide.groups.find(group => group.id === guide.visibleGroupId)
    || guide.groups.find(group => group.id === DEFAULT_GROUP_ID)
    || guide.groups[0]
    || null;
}

// Visibility has one spatial owner, and the Guide names it once.
//
// It was carried as a boolean on every Group, which made "exactly one Group is
// visible" a rule about N fields that any mutation could break: two true, or
// none, are both expressible, and the model was only correct because a repair
// pass ran after every write. One identity cannot express either fault, so the
// invariant stops being maintained and starts being structural. Activity stays
// per-Group, because any number of Groups may be active at once -- that is a
// genuine set, and a set is what a per-Group field is for.
//
// Keeping the visible Group first also makes the Guide's order state the same
// relation it renders, rather than maintaining a second presentation-only rule.
// A Group has no Address, so its name is the only thing that identifies it --
// which makes uniqueness a model invariant rather than naming policy. Two rows
// reading alike make the header ambiguous and the Section's Group control
// unusable, and neither can be disambiguated by any other field.
export function groupLabelTaken(guide, label, exceptId = null) {
  const wanted = String(label || "").trim().toLowerCase();
  if (!wanted) return false;
  return (guide?.groups || []).some(group =>
    group.id !== exceptId
    && String(group.label || "").trim().toLowerCase() === wanted
  );
}

export function nextGroupLabel(guide) {
  for (let ordinal = 1; ordinal < 1000; ordinal += 1) {
    const candidate = `Group ${ordinal}`;
    if (!groupLabelTaken(guide, candidate)) return candidate;
  }
  return `Group ${Date.now()}`;
}

export function groupIsVisible(guide, group) {
  const id = typeof group === "string" ? group : group?.id;
  if (!id || !guide) return false;
  return visibleGroup(guide)?.id === id;
}

export function enforceVisibleGroup(guide, preferredId = null) {
  if (!guide || !Array.isArray(guide.groups) || !guide.groups.length) return null;
  const visible = preferredVisibleGroup(guide, preferredId);
  guide.visibleGroupId = visible.id;
  moveVisibleGroupFirst(guide, visible.id);
  return visible;
}

export function visibleGroup(guide) {
  if (!guide || !Array.isArray(guide.groups) || !guide.groups.length) return null;
  return guide.groups.find(group => group.id === guide.visibleGroupId)
    || guide.groups.find(group => group.id === DEFAULT_GROUP_ID)
    || guide.groups[0]
    || null;
}

export function createGroup(
  guide,
  label = "",
  { id = null, visible = true, active = true } = {}
) {
  const changedAt = now();
  const group = {
    id: id || makeId("group"),
    label: String(label || "").trim(),
    active: active !== false,
    createdAt: changedAt,
    updatedAt: changedAt
  };
  guide.groups.push(group);
  // A newly authored Group is the layer being worked on. Recovery paths may
  // create hidden Groups explicitly and choose the persisted visible Group once
  // the complete set has been read.
  enforceVisibleGroup(guide, visible ? group.id : visibleGroup(guide)?.id);
  guide.updatedAt = changedAt;
  return group;
}

export function resolveGroup(guide, groupId) {
  return guide.groups.find(group => group.id === groupId)
    || guide.groups.find(group => group.id === DEFAULT_GROUP_ID)
    || guide.groups[0]
    || null;
}

export function groupForSection(guide, section) {
  return resolveGroup(guide, section?.groupId);
}

export function sectionIsActive(guide, section) {
  return groupForSection(guide, section)?.active !== false;
}

export function sectionIsVisible(guide, section) {
  return groupIsVisible(guide, groupForSection(guide, section));
}

export function setGroupState(guide, groupId, changes = {}) {
  const group = guide.groups.find(entry => entry.id === groupId);
  if (!group) return null;
  const before = guide.groups.map(entry => ({
    id: entry.id,
    active: entry.active,
    label: entry.label
  }));
  const visibleBefore = visibleGroup(guide)?.id || null;

  if (typeof changes.visible === "boolean") {
    if (changes.visible) {
      enforceVisibleGroup(guide, group.id);
    } else if (groupIsVisible(guide, group)) {
      // Hiding the current layer means showing another retained layer. With no
      // alternative, the sole Group remains visible because zero visible Groups
      // would make Timeline topology ownerless.
      const fallback = guide.groups.find(entry => entry.id !== group.id) || group;
      enforceVisibleGroup(guide, fallback.id);
    }
  }
  if (typeof changes.active === "boolean") group.active = changes.active;
  if (typeof changes.label === "string") group.label = changes.label.trim();

  const changedAt = now();
  let changed = false;
  for (const entry of guide.groups) {
    const previous = before.find(item => item.id === entry.id);
    if (!previous) continue;
    if (previous.active !== entry.active || previous.label !== entry.label) {
      entry.updatedAt = changedAt;
      changed = true;
    }
  }
  // Which Group is visible is one fact about the Guide, not a field of any
  // Group, so a change of layer is detected once rather than per Group.
  if (visibleGroup(guide)?.id !== visibleBefore) {
    group.updatedAt = changedAt;
    changed = true;
  }
  if (!changed) return null;
  guide.updatedAt = changedAt;
  return group;
}

export function assignSectionGroup(guide, sectionId, groupId) {
  const section = guide.sections.find(entry => entry.id === sectionId);
  const group = guide.groups.find(entry => entry.id === groupId);
  if (!section || !group) {
    return { changed: false, reason: section ? "missing-group" : "missing-section" };
  }
  if (section.groupId === group.id) {
    return { changed: false, reason: "unchanged-group", section };
  }
  if (findDuplicateSection(
    guide,
    section.startPinId,
    section.endPinId,
    section.label,
    section.id,
    group.id
  )) {
    return { changed: false, reason: "duplicate-section" };
  }
  const changedAt = now();
  section.groupId = group.id;
  section.updatedAt = changedAt;
  guide.updatedAt = changedAt;
  return { changed: true, section };
}

// Deleting a Group returns its Sections to the default rather than destroying
// them: a Group is an organizing choice, not an owner. The move is refused when
// it would collapse two distinct layered Sections into one Group identity;
// silently merging them would destroy a layer, while keeping both would make
// selection and exact editing ambiguous again.
export function groupDeletionBlockReason(guide, groupId) {
  if (groupId === DEFAULT_GROUP_ID) return "default-group";
  const group = guide.groups.find(entry => entry.id === groupId);
  if (!group) return "missing-group";
  for (const section of guide.sections.filter(entry => entry.groupId === groupId)) {
    if (findDuplicateSection(
      guide,
      section.startPinId,
      section.endPinId,
      section.label,
      section.id,
      DEFAULT_GROUP_ID
    )) return "duplicate-section";
  }
  return null;
}

export function deleteGroup(guide, groupId) {
  if (groupDeletionBlockReason(guide, groupId)) return false;
  const index = guide.groups.findIndex(group => group.id === groupId);
  const changedAt = now();
  guide.groups.splice(index, 1);
  for (const section of guide.sections) {
    if (section.groupId !== groupId) continue;
    section.groupId = DEFAULT_GROUP_ID;
    section.updatedAt = changedAt;
  }
  // Removing any Group re-resolves the named layer. When the removed Group was
  // the drawn one its id no longer resolves and the chain lands on Map; when it
  // was not, the id still resolves and the drawn layer does not move. One call
  // covers both, because the fallback lives in the resolution rather than here.
  enforceVisibleGroup(guide, guide.visibleGroupId);
  guide.updatedAt = changedAt;
  return true;
}

export function createGuide(videoId = null) {
  const guide = {
    version: 9,
    videoId,
    pins: [],
    sections: [],
    groups: [],
    // The one Group the Timeline draws. Named here rather than flagged on each
    // Group, so "exactly one is visible" is a shape the Guide has instead of a
    // rule something has to keep restoring.
    visibleGroupId: DEFAULT_GROUP_ID,
    updatedAt: now()
  };
  createGroup(guide, "Map", { id: DEFAULT_GROUP_ID });
  return guide;
}

function sortPins(pins) {
  return [...pins].sort((a, b) => a.t - b.t || a.createdAt - b.createdAt);
}

export function getPin(guide, pinId) {
  return guide.pins.find(pin => pin.id === pinId) || null;
}

export function findPinAt(guide, address, epsilon = EPSILON) {
  return guide.pins.find(pin => Math.abs(pin.t - address) <= epsilon) || null;
}

// Address equality is not identity equality. Unlink deliberately produces
// independently owned Pins at one Address, so "the Pin at 0:30" can name more
// than one object -- and picking the first in array order silently attached new
// structure to whichever happened to be created earliest.
export function pinsAt(guide, address, epsilon = EPSILON) {
  return (guide?.pins || []).filter(pin => Math.abs(pin.t - address) <= epsilon);
}

export function ensurePin(guide, address, options = {}) {
  if (!guide || !Array.isArray(guide.pins)) throw new TypeError("A valid Guide is required.");
  if (!Number.isFinite(address)) throw new TypeError("A Pin requires a finite Address.");

  // Zero matches creates; exactly one reuses it; more than one is ambiguous and
  // is never guessed. A caller that knows which identity it means says so with
  // `preferPinId`; otherwise an independent coincident Pin is created, because
  // inventing an attachment to one of several equals is the one outcome that
  // cannot be undone by inspection.
  const matches = pinsAt(guide, address, options.epsilon ?? EPSILON);
  const preferred = options.preferPinId
    ? matches.find(pin => pin.id === options.preferPinId)
    : null;
  const existing = preferred || (matches.length === 1 ? matches[0] : null);
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
    provenance: "unlink",
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

export function canLinkPins(guide, sourcePinId, targetPinId) {
  const source = getPin(guide, sourcePinId);
  const target = getPin(guide, targetPinId);
  if (!source || !target) {
    return {
      allowed: false,
      reason: source ? "missing-target-pin" : "missing-source-pin"
    };
  }
  if (source.id === target.id) {
    return { allowed: false, reason: "same-pin" };
  }
  const sections = sectionsForPin(guide, source.id);
  if (!sections.length) {
    return { allowed: false, reason: "unreferenced-source-pin" };
  }
  if (sections.length > 1) {
    return { allowed: false, reason: "shared-source-pin" };
  }
  for (const section of sections) {
    const startPinId = section.startPinId === source.id
      ? target.id
      : section.startPinId;
    const endPinId = section.endPinId === source.id
      ? target.id
      : section.endPinId;
    const start = getPin(guide, startPinId);
    const end = getPin(guide, endPinId);
    if (
      !start
      || !end
      || start.id === end.id
      || end.t <= start.t + EPSILON
    ) {
      return { allowed: false, reason: "invalid-link-geometry" };
    }
    if (findDuplicateSection(
      guide,
      startPinId,
      endPinId,
      section.label,
      section.id,
      section.groupId
    )) {
      return { allowed: false, reason: "duplicate-section" };
    }
  }
  if (
    source.label?.trim()
    && target.label?.trim()
    && source.label.trim() !== target.label.trim()
  ) {
    return { allowed: false, reason: "label-conflict" };
  }
  return { allowed: true, source, target, sections };
}

export function linkPins(guide, sourcePinId, targetPinId) {
  const link = canLinkPins(guide, sourcePinId, targetPinId);
  if (!link.allowed) return { changed: false, reason: link.reason };
  if (Math.abs(link.source.t - link.target.t) > EPSILON) {
    return { changed: false, reason: "pins-not-coincident" };
  }

  const changedAt = now();
  for (const section of link.sections) {
    if (section.startPinId === link.source.id) {
      section.startPinId = link.target.id;
    }
    if (section.endPinId === link.source.id) {
      section.endPinId = link.target.id;
    }
    section.updatedAt = changedAt;
  }
  if (!link.target.label?.trim() && link.source.label?.trim()) {
    link.target.label = link.source.label.trim();
  }
  if (link.source.kind === PIN_KIND.EXPLICIT) {
    link.target.kind = PIN_KIND.EXPLICIT;
  }
  link.target.updatedAt = changedAt;
  guide.pins = guide.pins.filter(pin => pin.id !== link.source.id);
  guide.updatedAt = changedAt;
  return {
    changed: true,
    pin: link.target,
    linkedPinId: link.source.id,
    sectionIds: link.sections.map(section => section.id)
  };
}

// Pins in map order, minus those hidden by a Group.
//
// An endpoint Pin belongs to its Sections, so it is drawn and traversable while
// any Section referencing it sits in a visible Group. A Pin referencing no
// Section is standalone and is never hidden -- which is exactly what lets a
// lone Pin stay reachable inside terrain a hidden Group has compressed.
export function orderedPins(guide) {
  return sortPins(guide.pins.filter(pin => pinIsVisible(guide, pin)));
}

export function pinIsVisible(guide, pin) {
  const owners = sectionsForPin(guide, pin.id);
  if (!owners.length) return true;
  return owners.some(section => sectionIsVisible(guide, section));
}

// Every Pin remains in the Guide. Visible Pins are ordered before hidden Pins
// so the Guide preserves the same above/below distinction as the Timeline while
// retaining exact access to both sets.
export function partitionGuidePins(guide) {
  const visible = [];
  const hidden = [];
  for (const pin of sortPins(guide.pins)) {
    (pinIsVisible(guide, pin) ? visible : hidden).push(pin);
  }
  return { visible, hidden };
}

export function allPins(guide) {
  const pins = partitionGuidePins(guide);
  return [...pins.visible, ...pins.hidden];
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

function sectionIdentityKey(startPinId, endPinId, label, groupId) {
  return [
    groupId || DEFAULT_GROUP_ID,
    startPinId,
    endPinId,
    String(label || "").trim().toLocaleLowerCase()
  ].join("|");
}

export function findDuplicateSection(
  guide,
  startPinId,
  endPinId,
  label,
  excludeId = null,
  groupId = DEFAULT_GROUP_ID
) {
  const key = sectionIdentityKey(startPinId, endPinId, label, groupId);
  return guide.sections.find(section =>
    section.id !== excludeId
    && sectionIdentityKey(
      section.startPinId,
      section.endPinId,
      section.label,
      section.groupId
    ) === key
  ) || null;
}

function sectionGroupForCreation(guide, requestedGroupId) {
  if (requestedGroupId) {
    const requested = guide.groups.find(group => group.id === requestedGroupId);
    if (requested) return requested;
  }
  return visibleGroup(guide)
    || guide.groups.find(group => group.id === DEFAULT_GROUP_ID)
    || guide.groups[0]
    || null;
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
  const group = sectionGroupForCreation(guide, options.groupId);
  if (!group) throw new RangeError("A Section requires a Guide Group.");
  const duplicate = findDuplicateSection(
    guide,
    start.id,
    end.id,
    label,
    null,
    group.id
  );
  if (duplicate) return { section: duplicate, created: false };

  const createdAt = Number(options.createdAt) || now();
  const section = {
    id: options.id || makeId("section"),
    videoId: guide.videoId,
    startPinId: start.id,
    endPinId: end.id,
    label,
    weight: normalizeSectionWeight(requestedWeight),
    groupId: group.id,
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
    section.id,
    section.groupId
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
      section.id,
      section.groupId
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
    : orderedPins(guide)
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

  // Groups arrived in v8 carrying a visible flag each; v9 names the visible
  // Group once on the Guide. Both are read here, and a v8 Guide that recorded
  // several visible Groups -- or none -- resolves deterministically to the
  // first it marked visible, then to Map. Activity, membership, labels, and
  // every retained identity cross unchanged: only where visibility is written
  // down has changed.
  const sourceGroups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  const persistedVisibleId = (
    typeof parsed?.visibleGroupId === "string"
      && sourceGroups.some(source => source?.id === parsed.visibleGroupId)
      ? parsed.visibleGroupId
      : sourceGroups.find(source => source?.visible === true)?.id
  );
  const defaultSource = sourceGroups.find(source => source?.id === DEFAULT_GROUP_ID);
  const defaultGroup = guide.groups.find(group => group.id === DEFAULT_GROUP_ID);
  if (defaultSource && defaultGroup) {
    defaultGroup.label = String(defaultSource.label || "Map").trim();
    defaultGroup.active = typeof defaultSource.active === "boolean"
      ? defaultSource.active
      : true;
    defaultGroup.createdAt = Number(defaultSource.createdAt) || defaultGroup.createdAt;
    defaultGroup.updatedAt = Number(defaultSource.updatedAt) || defaultGroup.createdAt;
  }
  for (const source of sourceGroups) {
    if (!source?.id || source.id === DEFAULT_GROUP_ID) continue;
    // A Guide written before names were identities may carry blanks or repeats.
    // Migration resolves them deterministically rather than importing rows that
    // cannot be told apart.
    const wanted = String(source.label || "").trim();
    const label = wanted && !groupLabelTaken(guide, wanted)
      ? wanted
      : nextGroupLabel(guide);
    const group = createGroup(guide, label, {
      id: source.id,
      visible: false,
      active: typeof source.active === "boolean" ? source.active : true
    });
    group.createdAt = Number(source.createdAt) || group.createdAt;
    group.updatedAt = Number(source.updatedAt) || group.createdAt;
  }
  enforceVisibleGroup(guide, persistedVisibleId || DEFAULT_GROUP_ID);

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
      groupId: source.groupId || DEFAULT_GROUP_ID,
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
  if (
    !guide
    || Number(guide.version) !== 9
    || !Array.isArray(guide.groups)
    || !Array.isArray(guide.pins)
    || !Array.isArray(guide.sections)
  ) return false;

  const end = Math.max(0, Number(duration) || 0);
  const ids = new Set();
  const groupIds = new Set();
  let defaultGroups = 0;
  let visibleGroups = 0;

  for (const group of guide.groups) {
    if (
      !group?.id
      || ids.has(group.id)
      || typeof group.label !== "string"
      || typeof group.active !== "boolean"
      || !Number.isFinite(group.createdAt)
      || !Number.isFinite(group.updatedAt)
    ) return false;
    if (group.id === DEFAULT_GROUP_ID) defaultGroups += 1;
    if (group.id === guide.visibleGroupId) visibleGroups += 1;
    ids.add(group.id);
    groupIds.add(group.id);
  }
  // Exactly one Map, exactly one named visible Group, and that Group drawn
  // first so the Guide's order states the relation it renders.
  if (
    defaultGroups !== 1
    || visibleGroups !== 1
    || guide.groups[0]?.id !== guide.visibleGroupId
  ) return false;
  // Names are identities here, so they must be distinguishable.
  const labels = guide.groups.map(group => String(group.label || "").trim().toLowerCase());
  if (labels.some(label => !label)) return false;
  if (new Set(labels).size !== labels.length) return false;

  for (const pin of guide.pins) {
    if (
      !pin?.id
      || ids.has(pin.id)
      || !Number.isFinite(pin.t)
      || pin.t < 0
      || pin.t > end
      || !Object.values(PIN_KIND).includes(pin.kind)
      || !Number.isFinite(pin.createdAt)
      || !Number.isFinite(pin.updatedAt)
    ) return false;
    ids.add(pin.id);
  }

  for (const section of guide.sections) {
    if (
      !section?.id
      || ids.has(section.id)
      || !section.startPinId
      || !section.endPinId
      || !section.groupId
      || !groupIds.has(section.groupId)
      || !isSectionWeight(section.weight)
      || !Number.isFinite(section.createdAt)
      || !Number.isFinite(section.updatedAt)
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
  guide.groups = [];

  const idMap = new Map();
  const usedIds = new Set();
  const validGroupIds = new Set();

  const recoverGroup = (sourceGroup, forcedId = null) => {
    const id = forcedId || sourceGroup?.id;
    if (!id || usedIds.has(id)) return null;
    const createdAt = Number(sourceGroup?.createdAt) || now();
    const group = {
      id,
      label: String(
        sourceGroup?.label
        || (id === DEFAULT_GROUP_ID ? "Map" : "")
      ).trim(),
      active: typeof sourceGroup?.active === "boolean"
        ? sourceGroup.active
        : true,
      createdAt,
      updatedAt: Number(sourceGroup?.updatedAt) || createdAt
    };
    guide.groups.push(group);
    usedIds.add(id);
    validGroupIds.add(id);
    return group;
  };

  const sourceGroups = Array.isArray(source.groups) ? source.groups : [];
  const persistedVisibleId = (
    typeof source.visibleGroupId === "string"
      && sourceGroups.some(group => group?.id === source.visibleGroupId)
      ? source.visibleGroupId
      : sourceGroups.find(group => group?.visible === true)?.id
  );
  recoverGroup(
    sourceGroups.find(group => group?.id === DEFAULT_GROUP_ID),
    DEFAULT_GROUP_ID
  );
  for (const sourceGroup of sourceGroups) {
    if (!sourceGroup?.id || sourceGroup.id === DEFAULT_GROUP_ID) continue;
    recoverGroup(sourceGroup);
  }
  enforceVisibleGroup(guide, persistedVisibleId || DEFAULT_GROUP_ID);

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

    const createdAt = Number(sourcePin.createdAt) || now();
    const pin = {
      id: sourcePin.id,
      videoId,
      t: address,
      label: String(sourcePin.label || "").trim(),
      kind: sourcePin.kind,
      provenance: sourcePin.provenance || null,
      createdAt,
      updatedAt: Number(sourcePin.updatedAt) || createdAt
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
    const groupId = validGroupIds.has(sourceSection.groupId)
      ? sourceSection.groupId
      : DEFAULT_GROUP_ID;
    const duplicateKey = sectionIdentityKey(
      startPinId,
      endPinId,
      label,
      groupId
    );
    if (sectionKeys.has(duplicateKey)) continue;

    const createdAt = Number(sourceSection.createdAt) || now();
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
      groupId,
      provenance: sourceSection.provenance || null,
      createdAt,
      updatedAt: Number(sourceSection.updatedAt) || createdAt
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
