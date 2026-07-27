import { EPSILON, clamp } from "./range-geometry.js";

export const SOURCE_KIND = Object.freeze({
  CHAPTER: "chapter",
  TRANSCRIPT: "transcript"
});

export function createSourceField(videoId = null) {
  return {
    version: 1,
    videoId,
    records: []
  };
}

export function normalizeTimedRecord(record, options = {}) {
  const duration = Number.isFinite(options.duration)
    ? Math.max(0, options.duration)
    : Number.POSITIVE_INFINITY;
  const rawStart = Number(record?.start);
  if (!Number.isFinite(rawStart) || rawStart > duration + EPSILON) return null;
  const start = clamp(rawStart, 0, duration);
  const endValue = Number.isFinite(Number(record?.end)) ? Number(record.end) : start;
  const end = clamp(endValue, start, duration);
  const text = String(record?.text ?? record?.label ?? "").trim();
  if (!text) return null;

  const requestedKind = record?.kind || options.kind;
  const kind = Object.values(SOURCE_KIND).includes(requestedKind)
    ? requestedKind
    : SOURCE_KIND.TRANSCRIPT;
  const fallbackId = `${record?.source || options.source || "source"}:${start}:${end}:${text}`;

  return {
    id: String(record?.id || fallbackId).trim() || fallbackId,
    kind,
    start,
    end,
    text,
    source: record?.source || options.source || null,
    sourceId: record?.sourceId || null,
    language: record?.language || options.language || null
  };
}

export function normalizeSourceField(records, options = {}) {
  const normalized = (Array.isArray(records) ? records : [])
    .map(record => normalizeTimedRecord(record, options))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.text.localeCompare(b.text));

  const uniqueRecords = [];
  const exactRecords = new Set();
  const idCounts = new Map();
  for (const record of normalized) {
    const identity = [
      record.kind, record.start, record.end, record.text,
      record.source, record.sourceId, record.language
    ].join("\u0000");
    if (exactRecords.has(identity)) continue;
    exactRecords.add(identity);

    const count = (idCounts.get(record.id) || 0) + 1;
    idCounts.set(record.id, count);
    uniqueRecords.push(count === 1 ? record : { ...record, id: `${record.id}:${count}` });
  }

  return {
    version: 1,
    videoId: options.videoId || null,
    records: uniqueRecords
  };
}

export function parseTimestamp(value) {
  const parts = String(value || "").trim().split(":").map(Number);
  if (!parts.length || parts.some(part => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return seconds < 60 ? minutes * 60 + seconds : null;
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return minutes < 60 && seconds < 60
      ? hours * 3600 + minutes * 60 + seconds
      : null;
  }
  return null;
}

export function parseDescriptionChapters(description, duration) {
  const end = Number(duration);
  if (!Number.isFinite(end) || end <= 0) return [];

  const candidates = [];
  for (const line of String(description || "").split(/\r?\n/)) {
    const match = line.match(/^\s*((?:\d+:)?\d{1,2}:\d{2})\s+(.+?)\s*$/);
    if (!match) continue;
    const start = parseTimestamp(match[1]);
    const text = match[2].trim();
    if (!Number.isFinite(start) || !text || start < 0 || start >= end) continue;
    candidates.push({ start, text });
  }

  // Be deliberately conservative: a loose list of references must not become a
  // false chapter hierarchy. The sequence must begin at zero, contain at least
  // three ordered entries, and leave a meaningful extent for every chapter.
  if (candidates.length < 3 || Math.abs(candidates[0].start) > EPSILON) return [];
  for (let index = 1; index < candidates.length; index += 1) {
    if (!(candidates[index].start > candidates[index - 1].start + EPSILON)) return [];
  }

  const records = candidates.map((record, index) => ({
    id: `chapter:${record.start}`,
    kind: SOURCE_KIND.CHAPTER,
    start: record.start,
    end: index + 1 < candidates.length ? candidates[index + 1].start : end,
    text: record.text,
    source: "youtube-description"
  }));
  return records.every(record => record.end - record.start >= 10 - EPSILON)
    ? records
    : [];
}

export function parseTimestampedText(text, options = {}) {
  const starts = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*((?:\d+:)?\d{1,2}:\d{2}(?:\.\d{1,3})?)\s+(.+?)\s*$/);
    if (!match) continue;
    const start = parseTimestamp(match[1]);
    if (!Number.isFinite(start)) continue;
    starts.push({ start, text: match[2].trim() });
  }

  const duration = Number.isFinite(options.duration)
    ? Math.max(0, options.duration)
    : Number.POSITIVE_INFINITY;

  return starts
    .sort((a, b) => a.start - b.start)
    .map((record, index, list) => normalizeTimedRecord({
      id: `transcript:${index}:${record.start}`,
      kind: SOURCE_KIND.TRANSCRIPT,
      start: record.start,
      end: index + 1 < list.length
        ? list[index + 1].start
        : (Number.isFinite(duration) ? duration : record.start),
      text: record.text,
      source: options.source || "import"
    }, { duration, language: options.language }))
    .filter(Boolean);
}

export function recordsWithin(field, extent) {
  if (!field?.records || !extent) return [];
  return field.records.filter(record =>
    record.end >= extent.start - EPSILON
    && record.start <= extent.end + EPSILON
  );
}

export function searchSourceRecords(field, query) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  if (!needle || !field?.records) return [];
  return field.records.filter(record => record.text.toLocaleLowerCase().includes(needle));
}

export function potentialExtent(record) {
  if (!record || !Number.isFinite(record.start)) return null;
  return {
    start: record.start,
    end: Number.isFinite(record.end) ? Math.max(record.start, record.end) : record.start,
    label: record.text,
    sourceRef: record.id
  };
}
