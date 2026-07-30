# Binary YouTube Reader — Canonical Implementation

## Ownership

| Module | Responsibility |
|---|---|
| `session.js` | canonical model, semantic transactions, endpoint frames, history |
| `range-geometry.js` | pure Resolution and interval arithmetic |
| `guide.js` | shared Pin graph, Section weights, lifecycle, persistence, migration |
| `timeline-projection.js` | positive spatial density, source/timeline mapping, Pin ordering |
| `transport.js` | Context and native-playback runtime values |
| `step-gesture.js` | press/repeat/settlement and one-Undo gesture boundary |
| `step-field-geometry.js` | pure Tail/Lead source target and phase geometry |
| `step-field.js` | physical Tail/Lead players and Hold/Stretch runtime |
| `view.js` | DOM projection, weighted timeline, Guide and operator presentation |
| `app.js` | composition, adapters, persistence, direct manipulation |
| `youtube.js` | the only owner of YouTube player construction |

`session.js`, `guide.js`, `range-geometry.js`, `timeline-projection.js`, and `transport.js` remain DOM- and I/O-free.

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

Held Step, drag, cascade deletion, Deform, direct weight editing, Focus, and Unfocus amend one origin snapshot and settle as one Undo transaction. Session owns bounded `history` and `future`; a new commit clears `future`.

`stepReach` stores `{ mode, backward, forward, fraction }`. Field offsets are separate preferences. `effectiveStepReach()` is the sole adaptive conversion boundary and receives the current timeline projection.

## Positive spatial projection

`createTimelineProjection()` compiles Guide into one piecewise-linear map:

```text
non-neutral Section endpoint boundaries
→ sorted source segments
→ product of covering Section weights per segment
→ integrated positive timeline extent
→ source/timeline inverse pair
→ projected Pins, Sections, Range and operator geometry
```

Every stored factor belongs to the canonical `0.25×–2×` ladder. Overlap composition is multiplication. Since every product is positive, the projection is strictly increasing and `timelineToSource()` needs no direction, affinity, face, visibility, or materialization option.

The projection persists nothing. Models store source Addresses and Section factors only. All spatial operator distance and midpoint arithmetic routes through this module; operators do not inspect Section coverage.

The canonical scale copies the familiar Tail/Lead rate values for perceptual correspondence. There is intentionally no runtime dependency between the controls: player rate availability cannot alter persisted Section weights, and Section edits cannot issue player commands.

## Refine and interval composition

Both Refine variants delegate target and child-frame calculation to the Range kernel through the projection metric.

Plain `refine()` retains the existing Step departure while that Address remains outside the new Current-to-target path. If the target reaches or passes it, Refine rebases at Current and records the complete movement.

`localRefine()` applies midpoint membership: an inside target shortens toward the opposite endpoint, while an outside target replaces the Working Interval.

`step()` and `stepToPin()` share the same interval-anchor helper and prospective-midpoint guard. They keep the approached Resolution endpoint fixed until another Step would leave less than one Reach of midpoint headroom. Playback has separate union-only interval ownership. `switchEndpoint()` is a strict boundary selection with no projection mode.

Direct Timeline/Guide Go first resolves Range or Focus scope, then calls `seedNeighborhoodFromMovement()` with the resulting projection. The complete movement becomes the Working Interval; its spatial width supplies two equal margins on each side, producing a five-times movement frame before Range clipping.

## Guide graph and weights

Sections reference shared Pin IDs and store one canonical `weight`.

- `setSectionWeight()` validates and changes only that factor.
- `movePin()` clamps against every referencing partner and updates all edges through shared ownership.
- `translateSection()` moves only the Section’s two endpoint Pins.
- `deformSection()` creates or reuses an exact Working-Interval Section, then assigns the selected factor.
- `setGuideSectionWeight()` gives timeline and Guide selectors the same history-aware Session transaction.

Guide validation permits arbitrary overlap, nesting, touching siblings, and coincident extents. It rejects non-positive Section duration, out-of-bounds Pins, and non-canonical weights.

All Guide targets remain ordinary source objects. `goToGuidePin()` and `goToGuideSection()` perform exact Go without rewriting Section weights.

## Transport

Transport kinds are:

```text
idle | context | playback
```

Context stores one frozen source window centered on its anchor. Playback stores source start/end, phase, and cycle count. Neither imports the timeline projection.

A proper Range loops. `rebasePlaybackTransport()` records Range start as the current cycle’s watchdog entry, places Center, rebases each available Field side once, and resumes without touching Session. Full-video playback settles at source end.

Playback presentation and settlement both use `projectPlayback()`. It unions prior Working coverage with watched source segments, so coverage can only remain equal or grow.

Section-weight edits neither settle nor rebase an active transport. The timeline can deform around a moving Cursor without issuing a pause, seek, or rate command.

## Field

Field Offset is configured physical state. Only explicit Offset input updates `fieldOffsets`. Hold and Stretch maintain runtime side state without reporting or persisting their measured relation, and neither can call `setStepReach()` or a Section-weight transaction.

Field target placement and measurement are source-time arithmetic. The projection is used only by the timeline view when drawing those source Addresses.

All semantic Step surfaces resolve through `step-gesture.js`. A repeated press parks Center, Tail, and Lead at each committed Current, keeps one history origin, and starts automatic Context at most once after settlement.

## Timeline and direct manipulation

`view.js` renders:

- adaptive source timestamp guides positioned in Timeline Space;
- a named layer key plus distinct Current and physical Cursor readouts;
- Range ground, Resolution contour, directional Working-Interval ridge,
  Held Field overlay, and exact dry-run previews;
- greedily lane-packed Section spans with no fixed lane cap;
- a converging compression gradient, diverging expansion gradient, or neutral `1×` line;
- one Section-named tuning control and weight selector attached to each span;
- Current, playback Cursor, and all free/shared Pins.

Guide reprojects each Section across the complete timeline, connects its exact
Start/End Pin controls, and derives endpoint visual weight from the existing
Section-reference count. Timeline Pins use the same relation count. These are
pure projections of Guide ownership and persist no additional topology.

There is one lateral coordinate and one Pin placement path. Vertical lanes only
prevent retained Section controls from colliding; they do not add another
interaction axis or alter projection. Fine and coarse pointers use different
lane and Pin hit geometry, and clustering uses the same hit width; visual marks
remain unchanged while interactive regions cannot overlap ambiguously.

`previewTransition()` uses the exact Session operator used for commit, so presentation does not maintain parallel operator arithmetic.

Timeline input stays in `app.js`:

- Section body: select and translate its endpoint Pins;
- Section weight selector: commit one factor;
- timeline or Guide Go: invert or use an exact source target;
- Pin marker: Go or drag;
- Range handles: update Range without rewriting Guide;
- Range Start/End: distinct Go/set actions and synthetic Pin stops.

Pointer capture plus document fallback gives each drag exactly one terminal event.

Space is captured as the reader-wide observation command before native button
activation. Text inputs, selects, modal Guide work, and compact Guide focus keep
their ordinary ownership; Enter remains the focused Step-control gesture.
Pointer-acquired button focus is released after activation, and `youtube.js`
owns iframe focus release across Center play, buffer, pause, and end state
changes. Application and Field code never reach through the adapter to raw
YouTube objects.

Compact Guide marks only the background viewer, map, Parameters, Operators, and
source bar inert. Guide is nested inside `reader-column`, so the column itself
must remain interactive; otherwise visible tab controls fall through to the
scrim.

## Persistence and migration

Guide data is video-specific. Preferences store Context duration, semantic Step Reach, independent Field offsets and rates, Field visibility, and pane visibility.

Guide schema v7 persists Section `weight`; it never persists Timeline Space, segment density, lanes, gradients, or projected positions. Legacy v6 `collapsed: true` migrates once to `0.25×`, the closest positive replacement, while open Sections migrate to `1×`. The legacy flag is discarded.

Legacy scalar Step values migrate to fixed mode. Legacy coupled Field values seed separate preferences once and remain independent afterward.
