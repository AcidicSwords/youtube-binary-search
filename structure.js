import { EPSILON, clamp, spanMidpoint } from "./traversal.js";

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createStructure(videoId = null) {
  return { version: 2, videoId, marks: [], spans: [], updatedAt: Date.now() };
}

export function sortMarks(marks) {
  return [...marks].sort((a, b) => a.t - b.t || a.createdAt - b.createdAt);
}

export function findCoincidentMark(structure, t, epsilon = EPSILON) {
  return structure.marks.find(mark => Math.abs(mark.t - t) <= epsilon) || null;
}

export function createOrReuseMark(structure, t, options = {}) {
  if (!structure || !Array.isArray(structure.marks)) throw new TypeError("A valid Structure is required.");
  if (!Number.isFinite(t)) throw new TypeError("A Mark requires a finite Address.");

  const existing = findCoincidentMark(structure, t, options.epsilon ?? EPSILON);
  if (existing) {
    if (options.label?.trim()) existing.label = options.label.trim();
    existing.updatedAt = Date.now();
    structure.updatedAt = existing.updatedAt;
    return { mark: existing, created: false };
  }

  const now = Date.now();
  const mark = {
    id: options.id || makeId("mark"),
    videoId: structure.videoId,
    t,
    label: options.label?.trim() || "",
    note: options.note?.trim() || "",
    provenance: options.provenance || null,
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now
  };
  structure.marks.push(mark);
  structure.marks = sortMarks(structure.marks);
  structure.updatedAt = now;
  return { mark, created: true };
}

export function renameMark(structure, markId, label) {
  const mark = structure.marks.find(item => item.id === markId);
  if (!mark) throw new RangeError("Mark not found.");
  mark.label = String(label || "").trim();
  mark.updatedAt = Date.now();
  structure.updatedAt = mark.updatedAt;
  return mark;
}

export function spansForMark(structure, markId) {
  return structure.spans.filter(span =>
    span.startMarkId === markId
    || span.endMarkId === markId
    || span.anchorMarkId === markId
  );
}

export function deleteMarkSafely(structure, markId) {
  const mark = structure.marks.find(item => item.id === markId);
  if (!mark) return { deleted: false, anonymized: false };
  const references = spansForMark(structure, markId);
  if (references.length) {
    mark.label = "";
    mark.note = "";
    mark.updatedAt = Date.now();
    structure.updatedAt = mark.updatedAt;
    return { deleted: false, anonymized: true, references: references.length };
  }
  structure.marks = structure.marks.filter(item => item.id !== markId);
  structure.updatedAt = Date.now();
  return { deleted: true, anonymized: false };
}

export function getMark(structure, markId) {
  return structure.marks.find(mark => mark.id === markId) || null;
}

export function resolveSpan(structure, spanOrId) {
  const span = typeof spanOrId === "string"
    ? structure.spans.find(item => item.id === spanOrId)
    : spanOrId;
  if (!span) return null;
  const startMark = getMark(structure, span.startMarkId);
  const endMark = getMark(structure, span.endMarkId);
  const anchorMark = span.anchorMarkId ? getMark(structure, span.anchorMarkId) : null;
  if (!startMark || !endMark || !(endMark.t > startMark.t + EPSILON)) return null;
  return {
    ...span,
    startMark,
    endMark,
    anchorMark,
    start: startMark.t,
    end: endMark.t,
    anchor: anchorMark?.t ?? null,
    midpoint: spanMidpoint(startMark.t, endMark.t)
  };
}

export function createSpan(structure, startMarkId, endMarkId, options = {}) {
  const startMark = getMark(structure, startMarkId);
  const endMark = getMark(structure, endMarkId);
  if (!startMark || !endMark) throw new RangeError("Span endpoints must reference existing Marks.");

  let start = startMark;
  let end = endMark;
  if (start.t > end.t) [start, end] = [end, start];
  if (!(end.t > start.t + EPSILON)) throw new RangeError("A Span requires distinct ordered Marks.");

  if (options.anchorMarkId) {
    const anchor = getMark(structure, options.anchorMarkId);
    if (!anchor || anchor.t < start.t - EPSILON || anchor.t > end.t + EPSILON) {
      throw new RangeError("Anchor must reference a Mark inside the Span.");
    }
  }

  const now = Date.now();
  const span = {
    id: options.id || makeId("span"),
    videoId: structure.videoId,
    startMarkId: start.id,
    endMarkId: end.id,
    anchorMarkId: options.anchorMarkId || null,
    label: options.label?.trim() || "",
    summary: options.summary?.trim() || "",
    provenance: options.provenance || null,
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now
  };
  structure.spans.push(span);
  structure.updatedAt = now;
  return span;
}

export function renameSpan(structure, spanId, label) {
  const span = structure.spans.find(item => item.id === spanId);
  if (!span) throw new RangeError("Span not found.");
  span.label = String(label || "").trim();
  span.updatedAt = Date.now();
  structure.updatedAt = span.updatedAt;
  return span;
}

export function setSpanAnchor(structure, spanId, markId = null) {
  const span = structure.spans.find(item => item.id === spanId);
  if (!span) throw new RangeError("Span not found.");
  if (markId === null) {
    span.anchorMarkId = null;
  } else {
    const resolved = resolveSpan(structure, span);
    const mark = getMark(structure, markId);
    if (!resolved || !mark || mark.t < resolved.start - EPSILON || mark.t > resolved.end + EPSILON) {
      throw new RangeError("Anchor must lie inside the Span.");
    }
    span.anchorMarkId = markId;
  }
  span.updatedAt = Date.now();
  structure.updatedAt = span.updatedAt;
  return span;
}

export function deleteSpan(structure, spanId) {
  const before = structure.spans.length;
  structure.spans = structure.spans.filter(span => span.id !== spanId);
  if (structure.spans.length !== before) structure.updatedAt = Date.now();
  return structure.spans.length !== before;
}

export function previousMark(structure, current, range) {
  return sortMarks(structure.marks)
    .filter(mark => mark.t >= range.start - EPSILON && mark.t <= range.end + EPSILON)
    .filter(mark => mark.t < current - EPSILON)
    .at(-1) || null;
}

export function nextMark(structure, current, range) {
  return sortMarks(structure.marks)
    .filter(mark => mark.t >= range.start - EPSILON && mark.t <= range.end + EPSILON)
    .find(mark => mark.t > current + EPSILON) || null;
}

export function marksInRange(structure, range) {
  return sortMarks(structure.marks).filter(mark =>
    mark.t >= range.start - EPSILON && mark.t <= range.end + EPSILON
  );
}

export function sortedResolvedSpans(structure) {
  return structure.spans
    .map(span => resolveSpan(structure, span))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end || a.label.localeCompare(b.label));
}

export function createSpanFromTimes(structure, start, end, options = {}) {
  const A = clamp(Math.min(start, end), 0, Number.POSITIVE_INFINITY);
  const B = clamp(Math.max(start, end), 0, Number.POSITIVE_INFINITY);
  if (!(B > A + EPSILON)) throw new RangeError("A Span requires positive duration.");
  const startResult = createOrReuseMark(structure, A, {
    label: options.startLabel || "",
    provenance: options.provenance ? `${options.provenance}:start` : null
  });
  const endResult = createOrReuseMark(structure, B, {
    label: options.endLabel || "",
    provenance: options.provenance ? `${options.provenance}:end` : null
  });
  return createSpan(structure, startResult.mark.id, endResult.mark.id, options);
}

export function migrateSavedRegions(records, videoId) {
  const structure = createStructure(videoId);
  if (!Array.isArray(records)) return structure;

  for (const record of records) {
    if (
      !record
      || !Number.isFinite(record.start)
      || !Number.isFinite(record.end)
      || !(record.end > record.start + EPSILON)
    ) continue;

    const start = createOrReuseMark(structure, record.start, {
      provenance: "migration:saved-region:start",
      createdAt: record.createdAt
    }).mark;
    const end = createOrReuseMark(structure, record.end, {
      provenance: "migration:saved-region:end",
      createdAt: record.createdAt
    }).mark;

    createSpan(structure, start.id, end.id, {
      id: record.id ? `migrated-${record.id}` : undefined,
      label: record.label || "",
      createdAt: record.createdAt,
      provenance: "migration:saved-region"
    });
  }

  return structure;
}

export function validateStructure(structure, duration = Number.POSITIVE_INFINITY) {
  if (!structure || !Array.isArray(structure.marks) || !Array.isArray(structure.spans)) return false;
  const ids = new Set();
  for (const mark of structure.marks) {
    if (!mark?.id || ids.has(mark.id) || !Number.isFinite(mark.t) || mark.t < 0 || mark.t > duration) return false;
    ids.add(mark.id);
  }
  for (const span of structure.spans) {
    if (!span?.id || ids.has(span.id)) return false;
    ids.add(span.id);
    if (!resolveSpan(structure, span)) return false;
  }
  return true;
}
