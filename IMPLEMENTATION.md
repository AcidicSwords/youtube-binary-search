# Binary YouTube Reader — Canonical Implementation

## Ownership

| Module | Responsibility |
|---|---|
| `session.js` | canonical model, semantic transactions, endpoint frames, history |
| `range-geometry.js` | pure Resolution and interval arithmetic |
| `guide.js` | shared Pin graph, Section lifecycle, persistence and migration |
| `temporal-projection.js` | Fold union, source/Traversal mapping, Pin stop ordering |
| `transport.js` | Context and native-playback runtime values |
| `step-gesture.js` | shared press/repeat/settlement and one-Undo gesture boundary |
| `step-field-geometry.js` | pure Tail/Lead target and phase geometry |
| `step-field.js` | physical Tail/Lead players and Hold/Stretch runtime |
| `view.js` | DOM projection, timeline layout, Guide and operator presentation |
| `app.js` | composition, adapters, persistence, direct manipulation |
| `youtube.js` | the only owner of YouTube player construction |

`session.js`, `guide.js`, `range-geometry.js`, `temporal-projection.js`, and `transport.js` remain DOM- and I/O-free.

## Canonical model and transactions

Every durable temporal field is a source Address. A Session mutation follows:

```text
clone current model
→ apply one pure candidate change
→ normalize Resolution and endpoint frames
→ validate Guide and Range invariants
→ append at most one history checkpoint
→ publish effects for adapter composition
```

Held Step, drag, cascade deletion, Fold/Unfold, hidden-object Go, and Focus/Unfocus amend one origin snapshot and settle as one Undo transaction.

`stepReach` is semantic and stores `{ mode, backward, forward, fraction }`. Physical Field offsets are a separate preference value. `effectiveStepReach()` is the sole adaptive conversion boundary and receives the current temporal projection.

## Projection

`createTemporalProjection()` compiles one view of Guide and Range:

```text
independently collapsed Section extents
→ subtract transiently materialized contributors
→ intersect with active Range
→ normalize overlap/touch into maximal Fold unions
→ derive sourceToTraversal / traversalToSource
→ derive visible Pin stops and timeline geometry
```

The projection persists nothing. Overlapping Sections remain independent graph edges even when their collapsed extents share one Fold. `expandedExtents` is accepted only as transient materialization input for exact Focus and hard Range cuts.

All lateral operator distance and midpoint work routes through this projection. No operator keeps a private `if (collapsed)` arithmetic path.

The inverse mapping uses direction at a Fold coordinate. Plain Step translates continuously in the quotient metric; it does not use an exact-value reissue exception. Starting on a Fold first chooses the directional source face, then applies Reach.

## Refine and interval composition

Ordinary `refine()` delegates target and child-frame calculation to the established Range kernel.

`additiveRefine()` invokes the same movement, then replaces only the interval/frame decision:

- retain the existing Step departure when it is usable;
- otherwise retain the pre-movement Current;
- contain the resulting extent by expanding its receding frame bound;
- do not reset the refinement level.

`step()`, `stepToPin()`, and settled playback share the same interval-anchor helper. `switchEndpoint()` is a strict role swap; folded endpoint choice is represented by which exact Pin is Current, never a hidden side mode.

## Guide graph

Sections reference shared Pin IDs. `movePin()` clamps against every referencing partner and updates all edges implicitly. `translateSection()` moves only the Section’s two endpoint Pins, respecting constraints imposed by any other shared edges. It never captures unrelated interior Pins.

Guide validation permits arbitrary overlap, nesting, touching siblings, and coincident extents. The only geometric rejection is a non-positive Section duration or an out-of-bounds Pin.

Hidden Guide targets use `goToGuidePin()` or `goToGuideSection()`. These identify every Fold contributor covering the source target, unfold them in the candidate Guide, then commit exact placement in the same checkpoint.

## Transport

Transport has two active kinds:

```text
idle | context | playback
```

Context stores one frozen source window centered on its anchor and never consults Fold geometry. Playback stores source start/end, phase, and cycle count.

A proper active Range loops. `rebasePlaybackTransport()` creates the next cycle without touching Session. The application places Center at Range start, rebases the existing Field relation once, and resumes. Full-video playback settles at its natural end.

Playback projection and settlement both use `projectPlayback()`; this prevents the visible Working Interval and committed result from diverging.

## Field

Field Offset is physical state. `step-field.js` may report measured offsets when Hold occurs, but `app.js` records them only in `fieldOffsets`. It never calls `setStepReach()` from Hold or Stretch.

All semantic Step surfaces resolve through `step-gesture.js`. A repeated press parks Center, Tail, and Lead at each committed Current, keeps one history origin, and starts automatic Context at most once after settlement.

## Timeline and direct manipulation

`view.js` renders:

- a five-marker source timestamp ruler positioned in Traversal Time;
- Range, Resolution, action previews, and Working Interval;
- greedily lane-packed open Sections;
- maximal Fold axes with per-Section contributor rails;
- staggered but source-accurate dense endpoint Pins;
- Current and source-contiguous playback Cursor;
- visible free/shared Pins.

The Fold rail is presentation of source order, not an operator track. Only boundary Pin buttons are operands.

Timeline input stays in `app.js`:

- open Section body: select/translate;
- open Section hinge: transpose;
- unique Fold hinge or contributor rail: unfold that Section;
- composite Fold hinge: open Guide for explicit contributor choice;
- Fold endpoint: exact Pin Go/drag;
- horizontal Fold rail drag: translate that Section;
- Range handles: update Range without rewriting Guide.

Pointer capture and document fallback give each drag exactly one terminal event.

## Persistence

Guide data is video-specific. Preferences store Context duration, semantic Step Reach, independent Field offsets, rates, Field visibility, and pane visibility.

Legacy scalar Step values migrate to fixed mode. Legacy coupled Field values seed both preferences once, after which they remain independent. Traversal Time and Fold unions are always derived and never serialized.
