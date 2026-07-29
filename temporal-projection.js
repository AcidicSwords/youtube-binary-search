// Pure source-time <-> traversal-time projection.
//
// Source time is the only stored truth. Collapsed Sections contribute their
// normalized union to a derived traversal metric: every Fold has zero lateral
// measure while retaining its complete ordered source extent orthogonally.
import { EPSILON, clamp } from "./range-geometry.js";
import { getPin, resolveSection, sortedSections, visiblePins } from "./guide.js";

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

function overlapsInterior(first, second) {
  return first.start < second.end - EPSILON
    && second.start < first.end - EPSILON;
}

function containsInterior(extent, address) {
  return Number.isFinite(address)
    && address > extent.start + EPSILON
    && address < extent.end - EPSILON;
}

function affinityUsesStart(affinity) {
  return affinity === "backward"
    || affinity === "lower"
    || affinity === "start"
    || affinity === "before";
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function activeCollapsedSections(guide, options = {}) {
  const explicitlyExpanded = new Set(options.expandedSectionIds || []);
  const expandedSections = [...explicitlyExpanded]
    .map(id => resolveSection(guide, id))
    .filter(Boolean);
  const expandedExtents = (options.expandedExtents || [])
    .map(normalizedExtent)
    .filter(Boolean);

  return sortedSections(guide).filter(section => {
    if (!section.collapsed || explicitlyExpanded.has(section.id)) return false;
    if (expandedSections.some(expanded => overlapsInterior(section, expanded))) {
      return false;
    }
    return !expandedExtents.some(extent => overlapsInterior(section, extent));
  });
}

function normalizeFoldUnion(sections) {
  const groups = [];
  for (const section of sections) {
    const last = groups.at(-1);
    if (!last || section.start > last.end + EPSILON) {
      groups.push({
        start: section.start,
        end: section.end,
        sections: [section]
      });
      continue;
    }
    last.end = Math.max(last.end, section.end);
    last.sections.push(section);
  }
  return groups;
}

function foldBoundaryPins(guide, sections) {
  return uniqueById(
    sections.flatMap(section => [
      getPin(guide, section.startPinId),
      getPin(guide, section.endPinId)
    ]).filter(Boolean)
  ).sort((first, second) =>
    first.t - second.t
    || first.createdAt - second.createdAt
    || first.id.localeCompare(second.id)
  );
}

function createIdentityProjection(duration, guide = null) {
  const end = Math.max(0, Number(duration) || 0);
  const sourceToTraversal = value => clamp(Number(value) || 0, 0, end);
  const traversalToSource = value => clamp(Number(value) || 0, 0, end);
  const sourceStep = (current, seconds, direction, range) => {
    const amount = Number(seconds);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new TypeError("Traversal Step requires a non-negative duration.");
    }
    const delta = direction === "backward"
      ? -amount
      : direction === "forward"
        ? amount
        : NaN;
    if (!Number.isFinite(delta)) throw new TypeError(`Unknown direction: ${direction}`);
    return clamp(current + delta, range.start, range.end);
  };
  const orderedPinStops = range => visiblePins(guide || { pins: [] })
    .filter(pin => pin.t >= range.start - EPSILON && pin.t <= range.end + EPSILON)
    .map(pin => ({
      ...pin,
      sourcePin: pin,
      stopKind: "pin",
      traversal: pin.t,
      fold: null
    }));
  return Object.freeze({
    duration: end,
    effectiveDuration: end,
    folds: Object.freeze([]),
    sourceToTraversal,
    traversalToSource,
    sourceDistance(first, second) {
      return Math.abs(sourceToTraversal(second) - sourceToTraversal(first));
    },
    sourceMidpoint(first, second) {
      return first + (second - first) / 2;
    },
    sourceStep,
    stepTarget: sourceStep,
    sourceToLayout(source) {
      const bounded = sourceToTraversal(source);
      return { source: bounded, traversal: bounded, fold: null, vertical: null };
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
    orderedPinStops,
    metric: null
  });
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
  if (!guide?.sections?.length) return createIdentityProjection(end, guide);

  const activeSections = activeCollapsedSections(guide, {
    expandedSectionIds,
    expandedExtents
  });
  if (!activeSections.length) return createIdentityProjection(end, guide);

  let removed = 0;
  const folds = normalizeFoldUnion(activeSections).map(group => {
    const start = clamp(group.start, 0, end);
    const finish = clamp(group.end, 0, end);
    const sourceDuration = Math.max(0, finish - start);
    const traversal = start - removed;
    removed += sourceDuration;
    const sections = Object.freeze([...group.sections]);
    const boundaryPins = Object.freeze(foldBoundaryPins(guide, sections));
    return Object.freeze({
      start,
      end: finish,
      traversal,
      sourceDuration,
      sections,
      sectionIds: Object.freeze(sections.map(section => section.id)),
      boundaryPins,
      boundaryPinIds: Object.freeze(boundaryPins.map(pin => pin.id))
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
    return Math.abs(sourceToTraversal(second) - sourceToTraversal(first));
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

  /**
   * Step translates through the quotient metric. A Fold contributes no
   * lateral distance, and directional affinity resolves an exact landing to
   * the outward endpoint. Starting on any point of the quotient similarly
   * exits through the directional face before Reach is applied. Shift+Step is
   * the separate operation that can visit every stacked endpoint in sequence.
   */
  function sourceStep(current, seconds, direction, range) {
    const amount = Number(seconds);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new TypeError("Traversal Step requires a non-negative duration.");
    }
    if (direction !== "backward" && direction !== "forward") {
      throw new TypeError(`Unknown direction: ${direction}`);
    }
    if (amount === 0) return clamp(current, range.start, range.end);

    const sign = direction === "backward" ? -1 : 1;
    const minimum = sourceToTraversal(range.start);
    const maximum = sourceToTraversal(range.end);
    const originFold = foldAtSource(current);
    let destination = sourceToTraversal(current) + sign * amount;

    // Starting anywhere on the quotient exits through the directional face
    // before applying Reach.
    if (originFold) {
      destination = originFold.traversal + sign * amount;
    }

    destination = clamp(destination, minimum, maximum);
    return clamp(
      traversalToSource(destination, direction),
      range.start,
      range.end
    );
  }

  function sourceToLayout(value) {
    const source = clamp(Number(value) || 0, 0, end);
    const fold = foldAtSource(source);
    return {
      source,
      traversal: sourceToTraversal(source),
      fold,
      vertical: fold
        ? clamp((source - fold.start) / Math.max(fold.sourceDuration, EPSILON), 0, 1)
        : null
    };
  }

  function projectExtent(extent) {
    if (!extent) return null;
    return {
      start: sourceToTraversal(extent.start),
      end: sourceToTraversal(extent.end)
    };
  }

  function orderedPinStops(range, sourceGuide = guide) {
    const boundaryIds = new Set(folds.flatMap(fold => fold.boundaryPinIds));
    return visiblePins(sourceGuide)
      .filter(pin => pin.t >= range.start - EPSILON && pin.t <= range.end + EPSILON)
      .map(pin => {
        const fold = foldAtSource(pin.t);
        if (fold && !boundaryIds.has(pin.id)) return null;
        return {
          ...pin,
          sourcePin: pin,
          stopKind: fold ? "fold-endpoint" : "pin",
          traversal: sourceToTraversal(pin.t),
          fold
        };
      })
      .filter(Boolean)
      .sort((first, second) =>
        first.traversal - second.traversal
        || first.t - second.t
        || first.createdAt - second.createdAt
        || first.id.localeCompare(second.id)
      );
  }

  const metric = Object.freeze({
    toCoordinate: sourceToTraversal,
    fromCoordinate: traversalToSource
  });

  return Object.freeze({
    duration: end,
    effectiveDuration,
    folds: Object.freeze(folds),
    sourceToTraversal,
    traversalToSource,
    sourceDistance,
    sourceMidpoint,
    sourceStep,
    stepTarget: sourceStep,
    sourceToLayout,
    projectExtent,
    foldAtSource,
    foldAtTraversal,
    orderedPinStops,
    metric
  });
}

function projectionMaterialization(model) {
  const expandedSectionIds = new Set();
  if (!model?.guide) return { expandedSectionIds: [], expandedExtents: [] };

  const structural = createTemporalProjection({
    duration: model.duration,
    guide: model.guide
  });

  const expandFold = fold => {
    for (const id of fold?.sectionIds || []) expandedSectionIds.add(id);
  };

  if (model.focus?.kind === "saved-section" && model.focus.sectionId) {
    const focused = resolveSection(model.guide, model.focus.sectionId);
    if (focused) {
      // A selected retained Section must become an ordinary lateral Range.
      // Expand every contributor in a Fold that covers any of its span.
      for (const fold of structural.folds) {
        if (overlapsInterior(fold, focused)) expandFold(fold);
      }
    }
  } else if (model.focus?.kind === "working-section" && model.focus.extent) {
    // A wider ad-hoc Working Range may keep unrelated Folds. Materialize only
    // when it names the exact extent of an existing collapsed Section.
    const exact = sortedSections(model.guide).filter(section =>
      section.collapsed
      && Math.abs(section.start - model.focus.extent.start) <= EPSILON
      && Math.abs(section.end - model.focus.extent.end) <= EPSILON
    );
    for (const section of exact) {
      expandFold(structural.folds.find(fold =>
        fold.sectionIds.includes(section.id)
      ));
    }
  }

  // A hard admissible boundary must never be hidden in a Fold. Current,
  // Resolution, and Working endpoints may remain exact latent source state.
  if (model.range) {
    for (const address of [model.range.start, model.range.end]) {
      const fold = structural.foldAtSource(address);
      if (fold && containsInterior(fold, address)) expandFold(fold);
    }
  }

  return {
    expandedSectionIds: [...expandedSectionIds],
    expandedExtents: []
  };
}

export function projectionForModel(model, options = {}) {
  const materialized = projectionMaterialization(model);
  return createTemporalProjection({
    duration: model?.duration,
    guide: model?.guide,
    expandedSectionIds: [
      ...materialized.expandedSectionIds,
      ...(options.expandedSectionIds || [])
    ],
    expandedExtents: [
      ...materialized.expandedExtents,
      ...(options.expandedExtents || [])
    ]
  });
}
