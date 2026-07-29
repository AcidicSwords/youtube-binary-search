# Development

## Principles

1. Source time is canonical.
2. Traversal Time is derived and pure.
3. Folding changes navigation and layout, never media continuity.
4. A gesture creates at most one Undo checkpoint.
5. Current and Cursor remain distinct.
6. Semantic Step size and physical Field offsets remain independent.
7. Shared Pins form a graph; do not invent a stored Section hierarchy.

## Change routing

- Session/operator law: `session.js`, with pure geometry in `range-geometry.js`
- Fold union, mapping, Pin stops: `temporal-projection.js`
- Pin/Section lifecycle and migration: `guide.js`
- Context/playback runtime: `transport.js`
- Timeline and Guide projection: `view.js`
- Timeline input, shortcuts, persistence, adapter coordination: `app.js`
- Held Step ownership: `step-gesture.js`
- Field geometry/runtime: `step-field-geometry.js`, `step-field.js`
- YouTube construction and placement: `youtube.js`

Do not add Fold-specific arithmetic to an operator. Extend the shared projection and prove the mapping first.

## Required semantic discipline

- Keep Range, Current, Cursor, Working Interval, Pins, and Section endpoints in source seconds.
- Never persist a Fold union, Traversal coordinate, lane, colour, or stagger offset.
- Do not make playback, Context, or YouTube adapters skip collapsed media.
- Preserve arbitrary overlap and asymmetrical nesting.
- Toggle collapse per Section even when several contributors share a Fold.
- Keep interior Fold positions non-operable; only boundary Pins are vertical stops.
- Materialize a transposed Section for Focus without mutating its stored flag.
- Unfold covering contributors for an exact hidden Guide target in the same transaction.
- Recompute adaptive Step from active projected Range; never from source duration or Field Offset.
- Hold/Stretch may update only `fieldOffsets`.

## Testing map

- `tests.mjs` — Range geometry and Session transactions
- `temporal-projection-tests.mjs` — Fold union, maps, layout, materialization
- `v6-transposition-tests.mjs` — matrix additions, Pin graph, adaptive Step, cascade behavior
- `transport-tests.mjs` — source Context and proper-Range looping helpers
- `source-field-tests.mjs` — source player relationships
- `fuzz-tests.mjs` — 25,000 deterministic semantic operations
- `v5.8-regression-tests.mjs` — preserved interaction-kernel guarantees
- `endpoint-transposition-tests.mjs` — endpoint frames and matrix ownership
- `semantic-composition-tests.mjs` — cross-operator sequences
- `semantic-audit-probes.mjs` — adversarial semantic regressions
- `step-gesture-tests.mjs` — cadence, batching, and one-Undo settlement
- `step-field-tests.mjs` — pure Field geometry
- `field-runtime-tests.mjs` — controller lifecycle
- `field-grammar-tests.mjs` — UI ownership
- `field-bounds-tests.mjs` — hard Range boundaries
- `field-coherence-tests.mjs` — Step/Offset independence
- `semantic-state-space-tests.mjs` — extended state-space proof

Smoke tests cover startup, interaction, Context, gestures, transport wrapping, Section folding, and metadata.

## Release workflow

```bash
npm run check
npm run test:semantic
```

Also inspect desktop and narrow layouts with at least:

- several open overlapping Sections;
- one composite Fold;
- a dense cluster of stacked endpoints;
- a focused transposed Section;
- a proper Range during a playback wrap;
- coarse-pointer hit targets.

No release is complete while canonical documents, audits, and visible labels describe retired behavior.
