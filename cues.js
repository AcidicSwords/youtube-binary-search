// Cues: candidate Addresses that are not yet structure.
//
// A creator who writes chapters into a description has already partitioned the
// video semantically. That partition is worth navigating immediately and worth
// retaining selectively — but it is not the reader's map, so it never enters
// the Guide on its own. A Cue is offered, not placed.
//
// Cues are ephemeral by construction: nothing here is persisted, nothing enters
// the projection, and nothing is traversable until the reader retains it as a
// Pin or a Section. This module is pure — no DOM, no I/O, no Session.

// A chapter list is a contiguous partition, so every Cue owns an extent: it
// runs from its own Address to the next one's, and the last runs to the end of
// the source. That is what lets a Cue behave exactly like a Section row under
// the Guide's existing composition rule rather than needing a grammar of its
// own.
const TIMESTAMP = /(?:^|[\s([\-–—|])((?:\d{1,2}:)?\d{1,2}:\d{2})(?![\d:])/;

// Separators a description conventionally puts between a timestamp and a title.
const LEADING_SEPARATORS = /^[\s\-–—|:.)\]}·•>]+/;

export function parseTimestamp(text) {
  if (typeof text !== "string") return null;
  const parts = text.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const numbers = parts.map(part => Number(part));
  if (numbers.some(value => !Number.isInteger(value) || value < 0)) return null;
  const [seconds, minutes, hours = 0] = numbers.reverse();
  if (seconds > 59) return null;
  if (parts.length === 3 && minutes > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

// Real descriptions carry links, sponsor blocks and social handles between the
// chapter lines, so a line earns its place only by containing a timestamp.
// Everything else is ignored rather than rejected: a description is not a file
// format and must not be treated as one.
export function parseCueList(text, { duration = 0 } = {}) {
  if (typeof text !== "string" || !text.trim()) return [];
  const limit = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  const found = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const match = rawLine.match(TIMESTAMP);
    if (!match) continue;
    const time = parseTimestamp(match[1]);
    if (time === null || time > limit) continue;
    const label = rawLine
      .slice(match.index + match[0].length)
      .replace(LEADING_SEPARATORS, "")
      .trim();
    found.push({ time, label });
  }
  if (!found.length) return [];

  // Order by Address and keep the first label at any repeated Address, so a
  // description that mentions a time twice does not produce two Cues.
  found.sort((first, second) => first.time - second.time);
  const unique = [];
  for (const entry of found) {
    const previous = unique.at(-1);
    if (previous && Math.abs(previous.time - entry.time) < 0.001) continue;
    unique.push(entry);
  }

  // Derive the partition. The end of a Cue is the start of the next; the last
  // ends at the source duration when one is known, and is otherwise a point.
  return unique.map((entry, index) => {
    const next = unique[index + 1];
    const end = next ? next.time : (Number.isFinite(limit) ? limit : entry.time);
    return Object.freeze({
      index,
      time: entry.time,
      label: entry.label,
      start: entry.time,
      end: Math.max(entry.time, end)
    });
  });
}

// A Cue's own name if the creator gave it one, and its Address otherwise. Cues
// carry no derived titles: an unnamed Cue is a bare Address, and inventing a
// name for it would make a candidate look like something retained.
export function cueName(cue) {
  return cue?.label?.trim() || null;
}
