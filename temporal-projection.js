// Pure source-time <-> traversal-time projection.
//
// Media, retained Pins, and Section endpoints remain anchored to source time.
// Collapsed Sections remove only their interior measure from the traversal
// timeline. Playback can temporarily materialize selected source extents by
// supplying them as expandedExtents.
import { EPSILON, clamp } from "./range-geometry.js";
import { resolveSection, sortedSections } from "./guide.js";

function overlapsInterior(first, second) {
  return first.start < second.end - EPSILON
    && second.start < first.end - EPSILON;
}

function containsExtent(outer, inner) {
  return outer.start <= inner.start + EPSILON
    && outer.end >= inner.end - EPSILON;
}

function sameExtent(first, second) {
  return Math.abs(first.start - second.start) <= EPSILON
    && Math.abs(first.end - second.end) <= EPSILON;
}

function normalizedExtent(extent) {
  if (
    !extent
    || !Number.isFinite(extent.start)
    || !Number.isFinite(extent.end)
  ) return null;
  return {
    start: Math.min(extent.start, extent.end),
    end: Math.max(extent.start, extent.end)
  };
}

function shouldMaterialize(section, expandedSections, expandedExtents) {
  if (expandedSections.some(expanded => containsExtent(section, expanded))) return true;
  return expandedExtents.some(extent => overlapsInterior(section, extent));
}

function resolvedExpandedSections(guide, ids) {
  return [...new Set(ids || [])]
    .map(id => resolveSection(guide, id))
    .filter(Boolean);
}

function groupEqualFrontierSections(sections) {
  const groups = [];
  for (const section of sections) {
    const existing = groups.find(group => sameExtent(group, section));
    if (existing) {
      existing.sections.push(section);
      existing.sectionIds.push(section.id);
      continue;
    }
    groups.push({
      start: section.start,
      end: section.end,
      sections: [section],
      sectionIds: [section.id]
    });
  }
  return groups;
}

/**
 * Compile the currently visible collapsed frontier.
 *
 * Collapsed Sections are laminar: disjoint, nested, or equal. A collapsed
 * ancestor represents its complete subtree; descendant fold states remain
 * stored and reappear when that ancestor expands. Equal extents share one
 * contraction while retaining each Section identity.
 */
function collapsedFrontier(guide, options = {}) {
  const expandedSections = resolvedExpandedSections(
    guide,
    options.expandedSectionIds
  );
  const expandedExtents = (options.expandedExtents || [])
    .map(normalizedExtent)
    .filter(Boolean);
  const collapsed = sortedSections(guide)
    .filter(section => section.collapsed === true)
    .filter(section => !shouldMaterialize(
      section,
      expandedSections,
      expandedExtents
    ));

  const frontier = collapsed.filter(section => !collapsed.some(other =>
    other.id !== section.id
    && !sameExtent(other, section)
    && containsExtent(other, section)
  ));
  return groupEqualFrontierSections(frontier)
    .sort((first, second) => first.start - second.start || first.end - second.end);
}

function createIdentityProjection(duration) {
  const end = Math.max(0, Number(duration) || 0);
  return {
    duration: end,
    effectiveDuration: end,
    folds: [],
    sourceToTraversal(value) {
      return clamp(Number(value) || 0, 0, end);
    },
    traversalToSource(value) {
      return clamp(Number(value) || 0, 0, end);
    },
    sourceDistance(first, second) {
      return Math.abs((Number(second) || 0) - (Number(first) || 0));
    },
    sourceMidpoint(first, second) {
      return first + (second - first) / 2;
    },
    sourceStep(current, seconds, direction, range) {
      const delta = direction === "backward" ? -seconds : seconds;
      return clamp(current + delta, range.start, range.end);
    },
    projectExtent(extent) {
      return extent ? { start: extent.start, end: extent.end } : null;
    },
    foldAtSource() {
      return null;
    },
    foldAtTraversal() {
      return null;
    },
    metric: null
  };
}

function affinityUsesStart(affinity) {
  return affinity === "backward"
    || affinity === "lower"
    || affinity === "start"
    || affinity === "before";
}

/**
 * Build one immutable projection for a render or semantic transaction.
 */
export function createTemporalProjection({
  duration = 0,
  guide,
  expandedSectionIds = [],
  expandedExtents = []
} = {}) {
  const end = Math.max(0, Number(duration) || 0);
  if (!guide?.sections?.length) return createIdentityProjection(end);

  const frontier = collapsedFrontier(guide, {
    expandedSectionIds,
    expandedExtents
  });
  if (!frontier.length) return createIdentityProjection(end);

  let removed = 0;
  const folds = frontier.map(group => {
    const sourceDuration = group.end - group.start;
    const traversal = group.start - removed;
    removed += sourceDuration;
    return Object.freeze({
      ...group,
      sourceDuration,
      traversal
    });
  });
  const effectiveDuration = Math.max(0, end - removed);

  function sourceToTraversal(value) {
    const source = clamp(Number(value) || 0, 0, end);
    let offset = 0;
    for (const fold of folds) {
      if (source < fold.start - EPSILON) break;
      if (source <= fold.end + EPSILON) return fold.traversal;
      offset += fold.sourceDuration;
    }
    return clamp(source - offset, 0, effectiveDuration);
  }

  function foldAtTraversal(value) {
    const traversal = clamp(Number(value) || 0, 0, effectiveDuration);
    return folds.find(fold =>
      Math.abs(traversal - fold.traversal) <= EPSILON
    ) || null;
  }

  function traversalToSource(value, affinity = "forward") {
    const traversal = clamp(Number(value) || 0, 0, effectiveDuration);
    let offset = 0;
    for (const fold of folds) {
      if (traversal < fold.traversal - EPSILON) break;
      if (Math.abs(traversal - fold.traversal) <= EPSILON) {
        return affinityUsesStart(affinity) ? fold.start : fold.end;
      }
      offset += fold.sourceDuration;
    }
    return clamp(traversal + offset, 0, end);
  }

  function foldAtSource(value) {
    const source = clamp(Number(value) || 0, 0, end);
    return folds.find(fold =>
      source >= fold.start - EPSILON && source <= fold.end + EPSILON
    ) || null;
  }

  function sourceDistance(first, second) {
    return Math.abs(
      sourceToTraversal(second) - sourceToTraversal(first)
    );
  }

  function sourceMidpoint(first, second, affinity = null) {
    const firstTraversal = sourceToTraversal(first);
    const secondTraversal = sourceToTraversal(second);
    const direction = affinity || (
      secondTraversal < firstTraversal ? "backward" : "forward"
    );
    return traversalToSource(
      firstTraversal + (secondTraversal - firstTraversal) / 2,
      direction
    );
  }

  function sourceStep(current, seconds, direction, range) {
    const amount = Number(seconds);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new TypeError("Traversal Step requires a non-negative duration.");
    }
    if (amount === 0) return clamp(current, range.start, range.end);
    const start = sourceToTraversal(range.start);
    const finish = sourceToTraversal(range.end);
    const origin = sourceToTraversal(current);
    const destination = direction === "backward"
      ? Math.max(start, origin - amount)
      : direction === "forward"
        ? Math.min(finish, origin + amount)
        : NaN;
    if (!Number.isFinite(destination)) {
      throw new TypeError(`Unknown direction: ${direction}`);
    }
    return clamp(
      traversalToSource(destination, direction),
      range.start,
      range.end
    );
  }

  function projectExtent(extent) {
    if (!extent) return null;
    return {
      start: sourceToTraversal(extent.start),
      end: sourceToTraversal(extent.end)
    };
  }

  const metric = Object.freeze({
    toCoordinate: sourceToTraversal,
    fromCoordinate: traversalToSource
  });

  return Object.freeze({
    duration: end,
    effectiveDuration,
    folds,
    sourceToTraversal,
    traversalToSource,
    sourceDistance,
    sourceMidpoint,
    sourceStep,
    projectExtent,
    foldAtSource,
    foldAtTraversal,
    metric
  });
}

function projectionExpandedSectionIds(model) {
  const ids = [];
  if (model?.focus?.kind === "saved-section" && model.focus.sectionId) {
    ids.push(model.focus.sectionId);
  }
  if (model?.guide && model?.range) {
    const semanticBoundaries = [
      model.range.start,
      model.range.end,
      model.resolution?.L,
      model.resolution?.R,
      model.interval?.start,
      model.interval?.end,
      model.interval?.departure,
      model.interval?.arrival
    ].filter(Number.isFinite);
    for (const section of sortedSections(model.guide)) {
      if (!section.collapsed) continue;
      const cutsInterior = semanticBoundaries.some(boundary =>
        boundary > section.start + EPSILON
        && boundary < section.end - EPSILON
      );
      if (cutsInterior) ids.push(section.id);
    }
  }
  return [...new Set(ids)];
}

export function projectionForModel(model, options = {}) {
  return createTemporalProjection({
    duration: model?.duration,
    guide: model?.guide,
    expandedSectionIds: [
      ...projectionExpandedSectionIds(model),
      ...(options.expandedSectionIds || [])
    ],
    expandedExtents: options.expandedExtents || []
  });
}
