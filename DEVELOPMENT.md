# Development

## Principles

1. Source time is canonical.
2. Timeline Space is derived, positive, and pure.
3. Section weight changes map geometry only.
4. Playback, Context, and Field geometry remain source-time systems.
5. A gesture creates at most one Undo checkpoint.
6. Current and Cursor remain distinct.
7. Step Reach, Field Offset, and Section weight have separate ownership.
8. Shared Pins form a graph; do not invent a stored Section hierarchy.

## Change routing

- Session/operator law: `session.js`, with pure geometry in `range-geometry.js`
- Section density, mapping, and Pin positions: `timeline-projection.js`
- Pin/Section lifecycle, weight validation, and migration: `guide.js`
- Context/playback runtime: `transport.js`
- Timeline and Guide projection: `view.js`
- Timeline input, shortcuts, persistence, adapters: `app.js`
- Held Step ownership: `step-gesture.js`
- Field geometry/runtime: `step-field-geometry.js`, `step-field.js`
- YouTube construction and placement: `youtube.js`

Do not add Section-coverage branches to an operator. Extend the shared positive projection and prove its mapping first.

## Required semantic discipline

- Keep Range, Current, Cursor, Working Interval, Pins, and Section endpoints in source seconds.
- Persist only a canonical Section factor, never Timeline Space, segment products, lane placement, or gradient state.
- Keep every effective density strictly positive.
- Compose overlapping Section factors deterministically and without priority.
- Never make playback, Context, YouTube adapters, or Field geometry consult Section weights.
- Preserve arbitrary overlap, asymmetric nesting, shared endpoints, and coincident extents.
- Recompute adaptive Step from active weighted Range width, never from source duration or Field Offset.
- Keep fixed Step Reach unchanged when Section geometry changes.
- Hold and Stretch may update neither `fieldOffsets`, `stepReach`, nor Guide.
- Timeline and Guide weight selectors must call the same Session transaction.

## Testing map

- `tests.mjs` — Range geometry and Session transactions
- `timeline-projection-tests.mjs` — canonical factors, maps, inverses, overlap composition, Pin order, migration
- `v7-deformation-tests.mjs` — Deform ownership, adaptive Step, Guide graph, nested weights
- `v7-coherence-tests.mjs` — guarded Step, Refine roles, source Field behavior, monotonic playback, Redo, exact previews, lane packing
- `transport-tests.mjs` — source Context and proper-Range looping
- `fuzz-tests.mjs` — deterministic semantic operations
- `v5.8-regression-tests.mjs` — preserved interaction-kernel guarantees
- `endpoint-transposition-tests.mjs` — endpoint frames and matrix ownership
- `semantic-composition-tests.mjs` — cross-operator sequences
- `semantic-audit-probes.mjs` — adversarial regressions
- `step-gesture-tests.mjs` — cadence, batching, one-Undo settlement
- `step-field-tests.mjs` — pure Field geometry
- `field-runtime-tests.mjs` — controller lifecycle
- `field-grammar-tests.mjs` — UI ownership
- `field-bounds-tests.mjs` — hard Range boundaries
- `field-coherence-tests.mjs` — Step/Offset independence
- `semantic-state-space-tests.mjs` — extended state-space proof

Smoke tests cover startup, interaction, Context, gestures, transport wrapping, Section weighting, and metadata.

## Release workflow

```bash
npm run check
```

Also inspect wide, narrow, and coarse-pointer layouts with:

- all eight Section weights;
- overlapping, nested, crossing, and coincident Sections;
- dense Section lanes and Pin clusters;
- compressed and expanded gradients;
- a focused weighted Section;
- a proper Range during playback wrap.

No release is complete while canonical documents, audits, visible labels, or file names describe retired behavior.
