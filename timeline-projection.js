// Pure source-time <-> timeline-space projection.
//
// Source addresses remain the only stored coordinates. Each retained Section
// contributes a positive spatial multiplier over its source extent. Integrating
// the resulting piecewise-constant density yields one continuous, strictly
// increasing timeline coordinate. Overlapping Section scales compose by
// multiplication.
import { EPSILON, clamp } from "./range-geometry.js";
import {
  DEFAULT_SECTION_WEIGHT,
  normalizeSectionWeight,
  sortedSections,
  orderedPins,
  sectionIsActive
} from "./guide.js";

function activeWeight(section) {
  return normalizeSectionWeight(section?.weight, DEFAULT_SECTION_WEIGHT);
}

function sectionActsOnSegment(section, start, end) {
  return section.start < end - EPSILON
    && section.end > start + EPSILON;
}

function buildSegments(duration, guide) {
  // A Section deforms the map only while its Group is active. Nothing is
  // frozen: an inactive Group simply stops contributing to the density product,
  // so toggling it is exact and instantaneous in both directions.
  const source = guide || { sections: [], pins: [], groups: [] };
  const sections = sortedSections(source)
    .filter(section => sectionIsActive(source, section))
    .filter(section => Math.abs(activeWeight(section) - 1) > EPSILON);
  const boundaries = [...new Set([
    0,
    duration,
    ...sections.flatMap(section => [
      clamp(section.start, 0, duration),
      clamp(section.end, 0, duration)
    ])
  ])].sort((first, second) => first - second);

  let timeline = 0;
  const segments = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end - start <= EPSILON) continue;
    const contributors = sections.filter(section =>
      sectionActsOnSegment(section, start, end)
    );
    const weight = contributors.reduce(
      (product, section) => product * activeWeight(section),
      1
    );
    const timelineStart = timeline;
    timeline += (end - start) * weight;
    segments.push(Object.freeze({
      start,
      end,
      weight,
      timelineStart,
      timelineEnd: timeline,
      sectionIds: Object.freeze(contributors.map(section => section.id))
    }));
  }

  if (!segments.length && duration > 0) {
    segments.push(Object.freeze({
      start: 0,
      end: duration,
      weight: 1,
      timelineStart: 0,
      timelineEnd: duration,
      sectionIds: Object.freeze([])
    }));
    timeline = duration;
  }

  return {
    segments: Object.freeze(segments),
    timelineExtent: timeline,
    weightedSections: Object.freeze(sections)
  };
}

function findSourceSegment(segments, source) {
  if (!segments.length) return null;
  for (const segment of segments) {
    if (source <= segment.end + EPSILON) return segment;
  }
  return segments.at(-1);
}

function findTimelineSegment(segments, coordinate) {
  if (!segments.length) return null;
  for (const segment of segments) {
    if (coordinate <= segment.timelineEnd + EPSILON) return segment;
  }
  return segments.at(-1);
}

/**
 * Build one immutable spatial projection for a render or semantic transaction.
 */
export function createTimelineProjection({
  duration = 0,
  guide = null,
  view = null
} = {}) {
  const end = Math.max(0, Number(duration) || 0);
  const {
    segments,
    timelineExtent,
    weightedSections
  } = buildSegments(end, guide);

  function sourceToTimeline(value) {
    const source = clamp(Number(value) || 0, 0, end);
    const segment = findSourceSegment(segments, source);
    if (!segment) return 0;
    return clamp(
      segment.timelineStart
        + (source - segment.start) * segment.weight,
      0,
      timelineExtent
    );
  }

  function timelineToSource(value) {
    const coordinate = clamp(
      Number(value) || 0,
      0,
      timelineExtent
    );
    const segment = findTimelineSegment(segments, coordinate);
    if (!segment) return 0;
    return clamp(
      segment.start
        + (coordinate - segment.timelineStart) / segment.weight,
      0,
      end
    );
  }

  function timelineDistance(first, second) {
    return Math.abs(sourceToTimeline(second) - sourceToTimeline(first));
  }

  function timelineMidpoint(first, second) {
    const firstCoordinate = sourceToTimeline(first);
    const secondCoordinate = sourceToTimeline(second);
    return timelineToSource(
      firstCoordinate + (secondCoordinate - firstCoordinate) / 2
    );
  }

  function stepSourceByTimeline(current, seconds, direction, range) {
    const amount = Number(seconds);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new TypeError("Timeline Step requires a non-negative distance.");
    }
    if (direction !== "backward" && direction !== "forward") {
      throw new TypeError(`Unknown direction: ${direction}`);
    }
    const sign = direction === "backward" ? -1 : 1;
    const minimum = sourceToTimeline(range.start);
    const maximum = sourceToTimeline(range.end);
    const destination = clamp(
      sourceToTimeline(current) + sign * amount,
      minimum,
      maximum
    );
    return clamp(
      timelineToSource(destination),
      range.start,
      range.end
    );
  }

  function weightAtSource(value) {
    const source = clamp(Number(value) || 0, 0, end);
    return findSourceSegment(segments, source)?.weight ?? 1;
  }

  function projectExtent(extent) {
    if (!extent) return null;
    return {
      start: sourceToTimeline(extent.start),
      end: sourceToTimeline(extent.end)
    };
  }

  function orderedPinStops(range, sourceGuide = guide) {
    return orderedPins(sourceGuide || { pins: [] })
      .filter(pin =>
        pin.t >= range.start - EPSILON
        && pin.t <= range.end + EPSILON
      )
      .map(pin => ({
        ...pin,
        sourcePin: pin,
        stopKind: "pin",
        timeline: sourceToTimeline(pin.t)
      }))
      .sort((first, second) =>
        first.timeline - second.timeline
        || first.t - second.t
        || first.createdAt - second.createdAt
        || first.id.localeCompare(second.id)
      );
  }

  const metric = Object.freeze({
    toCoordinate: sourceToTimeline,
    fromCoordinate: timelineToSource
  });

  // The viewport is the source extent the map is drawn across. It is a
  // presentation extent and nothing else: it never touches sourceToTimeline,
  // timelineToSource, or any Step, Refine, or Reach arithmetic, so no operator
  // can observe it. Its only job is to answer "where across the drawn map does
  // this coordinate fall", which is what Focus needs in order to make the
  // focused extent occupy the whole timeline.
  const viewExtent = Object.freeze(
    Number.isFinite(view?.start) && Number.isFinite(view?.end)
      && view.end - view.start > EPSILON
      ? { start: clamp(view.start, 0, end), end: clamp(view.end, 0, end) }
      : { start: 0, end }
  );
  const viewStart = sourceToTimeline(viewExtent.start);
  const viewEnd = sourceToTimeline(viewExtent.end);
  const viewSpan = Math.max(viewEnd - viewStart, 0);

  function coordinateToFraction(coordinate) {
    if (!(viewSpan > 0)) return 0;
    return (Number(coordinate) - viewStart) / viewSpan;
  }

  function fractionToCoordinate(fraction) {
    return viewStart + clamp(Number(fraction) || 0, 0, 1) * viewSpan;
  }

  // A pixel-space length converted into timeline units. Widths and distances
  // scale by the drawn span, never by the whole map.
  function fractionToDistance(fraction) {
    return (Number(fraction) || 0) * viewSpan;
  }

  function withinView(source) {
    return source >= viewExtent.start - EPSILON
      && source <= viewExtent.end + EPSILON;
  }

  return Object.freeze({
    duration: end,
    timelineExtent,
    viewExtent,
    viewStart,
    viewEnd,
    viewSpan,
    coordinateToFraction,
    fractionToCoordinate,
    fractionToDistance,
    withinView,
    segments,
    weightedSections,
    sourceToTimeline,
    timelineToSource,
    timelineDistance,
    timelineMidpoint,
    stepSourceByTimeline,
    stepTarget: stepSourceByTimeline,
    weightAtSource,
    projectExtent,
    orderedPinStops,
    metric
  });
}

// Focus is the operator that makes a relation become the world. Once a Section
// or Working Interval is the world, the map must be drawn across it: the
// focused extent occupies the whole timeline. An ordinary Range is admissible
// territory inside a world that is still visible around it, so it does not
// take the viewport.
export function projectionForModel(model) {
  return createTimelineProjection({
    duration: model?.duration,
    guide: model?.guide,
    view: model?.focus ? model.range : null
  });
}
