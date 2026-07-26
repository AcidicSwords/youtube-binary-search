import { EPSILON, clamp, spanMidpoint } from "./traversal.js";

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createGuide(videoId = null) {
  return {
    version: 3,
    videoId,
    marks: [],
    sections: [],
    updatedAt: Date.now()
  };
}

export function sortMarks(marks) {
  return [...marks].sort((a, b) => a.t - b.t || a.createdAt - b.createdAt);
}

export function findCoincidentMark(guide, t, epsilon = EPSILON) {
  return guide.marks.find(mark => Math.abs(mark.t - t) <= epsilon) || null;
}

export function createOrReuseMark(guide, t, options = {}) {
  if (!guide || !Array.isArray(guide.marks)) throw new TypeError("A valid Guide is required.");
  if (!Number.isFinite(t)) throw new TypeError("A Mark requires a finite Address.");

  const existing = findCoincidentMark(guide, t, options.epsilon ?? EPSILON);
  if (existing) {
    if (options.label?.trim()) existing.label = options.label.trim();
    if (options.explicit || options.provenance === "mark") existing.provenance = "mark";
    else if (!existing.provenance && options.provenance) existing.provenance = options.provenance;
    existing.updatedAt = Date.now();
    guide.updatedAt = existing.updatedAt;
    return { mark: existing, created: false };
  }

  const now = Date.now();
  const mark = {
    id: options.id || makeId("mark"),
    videoId: guide.videoId,
    t,
    label: options.label?.trim() || "",
    provenance: options.explicit ? "mark" : (options.provenance || "mark"),
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now
  };
  guide.marks.push(mark);
  guide.marks = sortMarks(guide.marks);
  guide.updatedAt = now;
  return { mark, created: true };
}

export function renameMark(guide, markId, label) {
  const mark = getMark(guide, markId);
  if (!mark) throw new RangeError("Mark not found.");
  mark.label = String(label || "").trim();
  mark.updatedAt = Date.now();
  guide.updatedAt = mark.updatedAt;
  return mark;
}

export function getMark(guide, markId) {
  return guide.marks.find(mark => mark.id === markId) || null;
}

export function sectionsForMark(guide, markId) {
  return guide.sections.filter(section =>
    section.startMarkId === markId || section.endMarkId === markId
  );
}

export function visibleMarks(guide) {
  return sortMarks(guide.marks).filter(mark =>
    mark.provenance === "mark" || Boolean(mark.label?.trim())
  );
}

export function deleteMark(guide, markId) {
  const mark = getMark(guide, markId);
  if (!mark) return { deleted: false, references: 0 };
  const references = sectionsForMark(guide, markId).length;
  if (references) return { deleted: false, references };
  guide.marks = guide.marks.filter(item => item.id !== markId);
  guide.updatedAt = Date.now();
  return { deleted: true, references: 0 };
}

export function resolveSection(guide, sectionOrId) {
  const section = typeof sectionOrId === "string"
    ? guide.sections.find(item => item.id === sectionOrId)
    : sectionOrId;
  if (!section) return null;

  const startMark = getMark(guide, section.startMarkId);
  const endMark = getMark(guide, section.endMarkId);
  if (!startMark || !endMark || !(endMark.t > startMark.t + EPSILON)) return null;

  return {
    ...section,
    startMark,
    endMark,
    start: startMark.t,
    end: endMark.t,
    midpoint: spanMidpoint(startMark.t, endMark.t)
  };
}

export function createSection(guide, startMarkId, endMarkId, options = {}) {
  const first = getMark(guide, startMarkId);
  const second = getMark(guide, endMarkId);
  if (!first || !second) throw new RangeError("A Section requires two existing Marks.");

  const [start, end] = first.t < second.t ? [first, second] : [second, first];
  if (!(end.t > start.t + EPSILON)) throw new RangeError("A Section requires distinct Marks.");

  const label = String(options.label || options.title || "").trim();
  if (!label) throw new RangeError("A Section requires a title.");

  const duplicate = guide.sections.find(section =>
    section.startMarkId === start.id
    && section.endMarkId === end.id
    && section.label === label
  );
  if (duplicate) return duplicate;

  const now = Date.now();
  const section = {
    id: options.id || makeId("section"),
    videoId: guide.videoId,
    startMarkId: start.id,
    endMarkId: end.id,
    label,
    provenance: options.provenance || null,
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now
  };
  guide.sections.push(section);
  guide.updatedAt = now;
  return section;
}

export function createSectionFromTimes(guide, start, end, options = {}) {
  const A = clamp(Math.min(start, end), 0, Number.POSITIVE_INFINITY);
  const B = clamp(Math.max(start, end), 0, Number.POSITIVE_INFINITY);
  if (!(B > A + EPSILON)) throw new RangeError("A Section requires positive duration.");

  const startMark = createOrReuseMark(guide, A, {
    provenance: "section:endpoint",
    createdAt: options.createdAt
  }).mark;
  const endMark = createOrReuseMark(guide, B, {
    provenance: "section:endpoint",
    createdAt: options.createdAt
  }).mark;

  return createSection(guide, startMark.id, endMark.id, options);
}

export function renameSection(guide, sectionId, label) {
  const section = guide.sections.find(item => item.id === sectionId);
  if (!section) throw new RangeError("Section not found.");
  const text = String(label || "").trim();
  if (!text) throw new RangeError("A Section requires a title.");
  section.label = text;
  section.updatedAt = Date.now();
  guide.updatedAt = section.updatedAt;
  return section;
}

function removeOrphanEndpoint(guide, markId) {
  const mark = getMark(guide, markId);
  if (!mark) return;
  if (sectionsForMark(guide, markId).length) return;
  if (mark.provenance === "section:endpoint" && !mark.label?.trim()) {
    guide.marks = guide.marks.filter(item => item.id !== markId);
  }
}

export function deleteSection(guide, sectionId) {
  const section = guide.sections.find(item => item.id === sectionId);
  if (!section) return false;
  guide.sections = guide.sections.filter(item => item.id !== sectionId);
  removeOrphanEndpoint(guide, section.startMarkId);
  removeOrphanEndpoint(guide, section.endMarkId);
  guide.updatedAt = Date.now();
  return true;
}

export function previousMark(guide, current, range) {
  return visibleMarks(guide)
    .filter(mark => mark.t >= range.start - EPSILON && mark.t <= range.end + EPSILON)
    .filter(mark => mark.t < current - EPSILON)
    .at(-1) || null;
}

export function nextMark(guide, current, range) {
  return visibleMarks(guide)
    .filter(mark => mark.t >= range.start - EPSILON && mark.t <= range.end + EPSILON)
    .find(mark => mark.t > current + EPSILON) || null;
}

export function sortedResolvedSections(guide) {
  return guide.sections
    .map(section => resolveSection(guide, section))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end || a.label.localeCompare(b.label));
}

export function clusterMarksByPixels(marks, duration, width, minimumGap = 16) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0) {
    return marks.map(mark => ({ marks: [mark], x: 0 }));
  }

  const sorted = sortMarks(marks);
  const clusters = [];
  for (const mark of sorted) {
    const x = clamp(mark.t / duration, 0, 1) * width;
    const last = clusters.at(-1);
    if (last && x - last.lastX < minimumGap) {
      last.marks.push(mark);
      last.lastX = x;
      last.x = last.marks.reduce((sum, item) => sum + clamp(item.t / duration, 0, 1) * width, 0) / last.marks.length;
    } else {
      clusters.push({ marks: [mark], x, lastX: x });
    }
  }
  return clusters.map(({ marks: cluster, x }) => ({ marks: cluster, x }));
}

export function migrateStructureV2(parsed, videoId) {
  const guide = createGuide(videoId);
  if (!parsed || !Array.isArray(parsed.marks) || !Array.isArray(parsed.spans)) return guide;

  for (const source of parsed.marks) {
    if (!source?.id || !Number.isFinite(source.t)) continue;
    guide.marks.push({
      id: source.id,
      videoId,
      t: source.t,
      label: String(source.label || ""),
      provenance: source.provenance === "current" || source.provenance === "mark"
        ? "mark"
        : (source.provenance || (source.label ? "mark" : "section:endpoint")),
      createdAt: Number(source.createdAt) || Date.now(),
      updatedAt: Number(source.updatedAt) || Number(source.createdAt) || Date.now()
    });
  }
  guide.marks = sortMarks(guide.marks);

  for (const source of parsed.spans) {
    if (!source?.id || !source.startMarkId || !source.endMarkId) continue;
    const label = String(source.label || "").trim() || `Section ${guide.sections.length + 1}`;
    const section = {
      id: source.id.replace(/^span-/, "section-"),
      videoId,
      startMarkId: source.startMarkId,
      endMarkId: source.endMarkId,
      label,
      provenance: source.provenance || "migration:v2",
      createdAt: Number(source.createdAt) || Date.now(),
      updatedAt: Number(source.updatedAt) || Number(source.createdAt) || Date.now()
    };
    if (resolveSection({ ...guide, sections: [section] }, section)) guide.sections.push(section);
  }

  guide.updatedAt = Date.now();
  return guide;
}

export function migrateSavedRegions(records, videoId) {
  const guide = createGuide(videoId);
  if (!Array.isArray(records)) return guide;

  for (const record of records) {
    if (
      !record
      || !Number.isFinite(record.start)
      || !Number.isFinite(record.end)
      || !(record.end > record.start + EPSILON)
    ) continue;

    createSectionFromTimes(guide, record.start, record.end, {
      id: record.id ? `migrated-${record.id}` : undefined,
      label: record.label || `Section ${guide.sections.length + 1}`,
      createdAt: record.createdAt,
      provenance: "migration:v1"
    });
  }

  return guide;
}

export function validateGuide(guide, duration = Number.POSITIVE_INFINITY) {
  if (!guide || !Array.isArray(guide.marks) || !Array.isArray(guide.sections)) return false;
  const ids = new Set();
  for (const mark of guide.marks) {
    if (!mark?.id || ids.has(mark.id) || !Number.isFinite(mark.t) || mark.t < 0 || mark.t > duration) return false;
    ids.add(mark.id);
  }
  for (const section of guide.sections) {
    if (!section?.id || ids.has(section.id) || !section.label?.trim()) return false;
    ids.add(section.id);
    if (!resolveSection(guide, section)) return false;
  }
  return true;
}
