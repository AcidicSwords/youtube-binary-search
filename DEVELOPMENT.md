# Development

## Principles

1. Source time is canonical.
2. Timeline Space is derived, positive, and pure.
3. Section weight changes map geometry only.
4. Playback, Context, and live Field geometry remain source-time systems;
   paused operator previews may supply addresses derived from Timeline Space.
5. A gesture creates at most one Undo checkpoint.
6. Current and Cursor remain distinct.
7. Step Reach, Field Offset, and Section weight have separate ownership.
8. Shared Pins form a graph; do not invent a stored Section hierarchy.
9. Pin linking is visible spatial acquisition; do not persist a hidden return target.
10. Ambient Field state is a stable Frame, not a temporary transport result.
11. The Temporal Topography owns spatial direct manipulation; Guide owns exact editing.
12. The minimum Field offset is a law; Range clipping may remove a side, never shrink `x`.
13. Any fine-adjustment quantum must exceed the kernel's semantic equality tolerance.
14. Current is displaced by Step law; only an exact Go draws a new neighbourhood.

## Change routing

- Session/operator law: `session.js`, with pure geometry in `range-geometry.js`
- Field Frame derivation, direction, and transitions: `field-frame.js`
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
- Never make playback, Context, YouTube adapters, or live Field geometry consult
  Section weights. Only the semantic operator owner may project preview
  addresses through Timeline Space.
- Preserve arbitrary overlap, asymmetric nesting, shared endpoints, and coincident extents.
- Unlink must preserve Address and require confirmation. Link must start from
  one independent endpoint, visibly arm after deliberate dwell on a valid
  target, and merge Pin identity only on release.
- Recompute adaptive Step from active weighted Range width, never from source duration or Field Offset.
- Keep fixed Step Reach unchanged when Section geometry changes.
- Hold and Stretch may update neither `fieldBreath`, `stepReach`, nor Guide.
- Keep configured Field Offset separate from attained breathing relation.
  Hidden/off panes must remain dormant, reject stale player events, and stay
  outside the breathing synchronization barrier.
- Guide precision editing and Deform stepping must call the same Session transactions.
- Ambient Field state is a stable Frame, not a temporary transport result.
  Resolve the next Frame once per semantic movement, never once per publish.
- Context ending cannot trigger reframing. Context transport may move Center
  only; its Tail and Lead edges are frozen for the window's whole lifetime.
- No second drag implementation may exist in Guide. Spatial gestures belong to
  the Timeline; Guide edits Addresses, metadata, and topology exactly.
- No control may claim exact frame stepping without an adapter-provided frame
  duration. Without one, the operation is Nudge and its quantum is seconds.
- Never reduce the configured inner offset to fit the room a side has. If the
  room is smaller than `x`, the side is non-operational and leaves the barrier.
- Never introduce a movement quantum at or below `EPSILON`; Session treats such a
  destination as the Address it started from, so the control becomes inert.
- Resume breathing with the rate of the phase actually preserved, never with a
  fixed outward pair.
- Dragging or nudging Current must go through Step, never Go, so the retained
  traversal extends or shortens instead of being redrawn.
- Every increment control must repeat while held and settle as one transaction.
- A pane bar that creates a stacking context must out-rank the transport surface,
  or its popovers become unclickable.
- Rapid visual transitions cannot block semantic commits. A transition is
  attached to a commit that has already happened; discard superseded player
  callbacks with the transition generation token rather than serializing them.

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
- `field-frame-tests.mjs` — Frame ownership, stable identity, transition descriptors
- `field-breath-tests.mjs` — bounded breathing, barriers, Range clipping, Hold
- `field-slideshow-tests.mjs` — directional transitions, coalescing, stale-event rejection
- `nudge-tests.mjs` — Current drag, Shift-wheel/drag, keyboard nudging, one-Undo batching
- `semantic-state-space-tests.mjs` — extended state-space proof

Smoke tests cover startup, persistent Guide selection, Timeline Section
endpoint/midpoint drag, Guide exact Address editing, spatial Pin unlink/link,
operational Pin clusters, Context, gestures, transport wrapping, Section
weighting, palette contracts, and metadata. Static palette,
hit-region, and preview-layer ownership belongs to `project-audit.mjs`; live
visual judgment belongs to `VALIDATION.md`.

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
- a proper Range during playback wrap;
- a full breathing cycle at each rate pair, including a Range-clipped side;
- rapid same-direction and reversing traversal, with reduced motion enabled.

No release is complete while canonical documents, audits, visible labels, or file names describe retired behavior.
