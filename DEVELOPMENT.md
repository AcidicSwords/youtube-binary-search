# Development

## Gates

`npm run check` is the fast gate: it runs every semantic, randomized, smoke and
audit suite against a DOM-free harness, and it is the one that must pass for any
change.

`npm run test:browser` runs the page in Chromium with a deterministic media
adapter substituted for YouTube. It exists because the DOM-free harness returns
fixed geometry and has no stylesheet: it cannot see whether a control is where
it is drawn, whether one element covers another, whether focus survives a
rebuild, or which handler a key reaches. Those are not gaps in its coverage —
they are outside what it can represent. Keep this suite small; anything provable
without a browser belongs in `check`.

`npm run verify` is both, and is what a release should pass.


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
- Settings live with the question they answer. Movement magnitudes belong to
  Movement distance; physical observation belongs to the Field.
- One gutter and one control height per card. A row that measures itself
  independently will not align with the rows above it.
- A gesture and its exact numeric equivalent must present the same Field Frame.
  If dragging an object centres the Viewer somewhere, editing its Address must
  centre it in the same place.
- Escape cancels the live direct manipulation before it closes anything behind
  it, so one key never both abandons a drag and dismisses its surface.
- Do not keep a guard that cannot fire. `parkSide` records the newest desired
  address before any early return, so coalescing needs no second token.
- Rapid visual transitions cannot block semantic commits. A transition is
  attached to a commit that has already happened; discard superseded player
  callbacks with the transition generation token rather than serializing them.

## Testing map

Every suite is listed. A suite that holds a law nobody can name from its
filename is a suite nobody can audit, so the entry says what it holds rather
than when it was written — six names still carry the release that motivated
them, and the entry is the correction.

### Kernel and semantics

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
- `semantic-state-space-tests.mjs` — extended state-space proof
- `weight-invariance-tests.mjs` — what Weight may and may not reach: retained Addresses, duration, Nudge displacement, Context and Field geometry stay Weight-blind while Step, Refine and seeded Resolution are weighted
- `focus-viewport-tests.mjs` — a focused extent fills the drawn timeline at every Weight, the drawing stays invertible edge to edge, and Unfocus restores the whole map

### Guide graph, Groups and Cues

- `group-tests.mjs` — one visible Timeline layer, an independent active deformation stack, hidden Guide navigation, endpoint visibility, multiplicative layering, non-destructive removal
- `coherence-2-tests.mjs` — Section reachability, projected source midpoints, Cue extents, flat Group blocks, Focus boundary ownership, explicit Panorama activation
- `coherence-3-tests.mjs` — canonical visible-Group identity that cannot express two or none, deterministic default and fallback, hidden-but-active layers, and the v8-to-v9 migration
- `stabilization-tests.mjs` — Guide validation and repair: v8 round-trip of every retained dimension, corrupt membership repaired without invalidating a recoverable Guide, and source-impossible extents rejected at the Session boundary
- `cue-tests.mjs` — timestamp forms, lenient description parsing, contiguous partition
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

### Interaction, against a DOM-free application

- `startup-smoke.mjs` — the module graph loads and binds against a minimal document
- `interaction-smoke.mjs` — the broad interaction sweep: Pin creation, retained Section editing, spatial unlink/link, Timeline dragging, exact Address editing, clustered Pins, Refine preview, Switch involution, composable Step intervals, universal Space playback, focus release
- `guide-composition-smoke.mjs` — a plain click replaces, Shift extends across Pins and Sections alike, extension is monotonic, and a composed span Deforms into a parent
- `cue-smoke.mjs` — offering retains nothing; navigation, composition, and retention
- `section-weight-smoke.mjs` — shared familiar scale, Guide-only tuning, compression, expansion, gradients, weighted Step, identity recovery
- `context-smoke.mjs` — automatic post-traversal observation, held-key Step deferral, delayed placement, Field suspension, replacement traversal, and the reversed Step sequence's observation and naming
- `step-gesture-smoke.mjs` — captured and fallback pointer release, keyboard hold, and rapid taps on control and hotkey alike retaining one-operation Undo
- `transport-coherence-smoke.mjs` — live projection, exact settlement, Focus-owned proper-Range looping, one-pass Field rebasing, wrap history isolation, Unfocus restoration
- `metadata-smoke.mjs` — delayed YouTube duration is retried without a false zero-length session

### Whole-system properties

- `transaction-integrity-smoke.mjs` — one physical gesture is at most one checkpoint, a reported save is a save, Group names cannot collide, coincident Pin identity is never guessed, and an unreadable saved map is reported and set aside rather than overwritten
- `route-correspondence-tests.mjs` — routes claiming one operation reach one result; each route runs in its own process because `app.js` is a module singleton
- `cross-interaction-stress.mjs` — Group visibility and activity govern drawing and deformation independently, Cues project while staying inert, and one history stack unwinds the whole construction
- `journey-smoke.mjs` — one operator's path end to end: arrive, orient, Pin, retain, name, weight, offer chapters, compose, focus, leave, reopen, move on
- `browser-smoke.mjs` — the only suite in a real browser: the app runs in Chromium without error, a press lands on the Address drawn under it, a focused control owns Space, nothing reachable is covered, and the page never scrolls sideways

### Gauges over the source itself

- `integration-check.mjs` — the composed product: DOM references, accessible controls, matrix ownership, weighted timeline, Guide graph, proper-Range playback
- `project-audit.mjs` — module boundaries, retired artifacts, palette, hit regions, preview-layer ownership, and agreement between the canonical documents and the code

Live visual judgment belongs to `VALIDATION.md`; nothing here replaces it.

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
