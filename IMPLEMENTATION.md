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

`localRefine()` always records the new Current-to-midpoint traversal. It never
inherits the previous departure. Consequently, reversing into an existing
Working Interval selects the complementary half, while plain `refine()` keeps
its established anchor.

`step()` and `stepToPin()` share the same interval-anchor helper and prospective-midpoint guard. They keep the approached Resolution endpoint fixed until another Step would leave less than one Reach of midpoint headroom. Playback has separate union-only interval ownership. `switchEndpoint()` is a strict boundary selection with no projection mode.

Direct Timeline/Pin Go first resolves Range or Focus scope, then calls `seedNeighborhoodFromMovement()` with the resulting projection. The complete movement becomes the Working Interval; its spatial width supplies two equal margins on each side, producing a five-times movement frame before Range clipping. Selecting a retained Section is topology-specific: its endpoints become the Working Interval boundaries and Current returns to its midpoint in one transaction.

## Guide graph and weights

Sections reference shared Pin IDs and store one canonical `weight`.

- `setSectionWeight()` validates and changes only that factor.
- `movePin()` clamps against every referencing partner and updates all edges through shared ownership.
- `translateSection()` moves only the Section’s two endpoint Pins.
- `unlinkSectionEndpoint()` clones one shared endpoint at the same source
  Address and rewires only that Section. It stores no hidden return target.
- `canLinkPins()` validates graph and label consequences before presentation;
  only an independent one-Section endpoint is a valid source. `linkPins()`
  merges that dragged, coincident source Pin into the visible snap target.
- `moveGuidePin()` also rebases any Working Interval bound aligned with the
  Pin's original Address and rebuilds its endpoint frames.
- `deformSection()` creates or reuses an exact Working-Interval Section, then assigns the requested canonical factor.
- `setGuideSectionWeight()` gives Guide precision editing and Deform stepping the same history-aware Session transaction.

Guide validation permits arbitrary overlap, nesting, touching siblings,
coincident extents, and independently owned coincident Pins. Version-seven
persistence preserves distinct coincident Pin IDs. It rejects non-positive
Section duration, out-of-bounds Pins, and non-canonical weights.

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

Each side keeps `configuredOffset` separate from its live `offset`.
`reconfigureOffset(role)` reconciles only the edited side: a relation following
its old configured maximum follows the new one, while a partial Hold is
preserved and only clamped when necessary. The sibling receives no player
command.

`sideIsOperational()` is the common availability boundary for the side Step
surface, its Hold/Stretch control, and the combined Field control. It requires
Field On, a visible ready source, completed establishment, and non-zero
Range-contained reach. Published Field identity includes enabled/visible state,
target geometry, span availability, and activation so application state cannot
retain a stale held span after collapse or Field Off.

Pause clears pending play intent. CUED and PLAYING callbacks re-check current
visibility, Field ownership, suspension, and Center playback intent before
acting. Hidden/off panes are omitted from polling placement and video-sync
paths, so a delayed iframe callback cannot resurrect them and repeated ticks
issue no dormant player commands.

Field target placement and measurement are source-time arithmetic. The projection is used only by the timeline view when drawing those source Addresses.

`app.js` alone derives ambient `fieldPreview` geometry. Idle Step uses the same
`projection.stepTarget()` calls and effective Reach as the committed Step;
Context uses the active transport's exact `start`, `anchor`, and `end`.
`step-field.js` only validates and displays those source Addresses, so it does
not import timeline projection or Context arithmetic.

All semantic Step surfaces resolve through `step-gesture.js`. A repeated press
commits Center at each Current, retargets the adjacent Step preview, keeps one
history origin, and starts automatic Context at most once after settlement.

## Timeline and direct manipulation

`view.js` renders:

- adaptive source timestamp guides positioned in Timeline Space;
- a named layer key plus distinct Current and physical Cursor readouts;
- free/shared Pins above the weighted track;
- Range ground, Resolution contour, directional Working-Interval ridge,
  Held Field overlay, and exact dry-run previews;
- a source ruler followed by greedily lane-packed Section endpoint wires in a
  bounded five-lane band;
- Start/midpoint/End Section nodes and presentation-only dotted relations back
  to their upper Pin or track positions;
- one composed deformation atmosphere built by adding midpoint-centered signed
  log-weight influences diluted by projected span, plus exact source-time
  contours projected through the canonical map;
- direct Section hit regions whose names, weights, endpoints, and lifecycle remain in Guide;
- Current, playback Cursor, and all free/shared Pins.

Guide reprojects each Section across the complete timeline, connects its exact
Start/End Pin controls, and derives endpoint visual weight from the existing
Section-reference count. Shared-Pin mutation is available through positioned
Guide endpoint nodes, full-map Guide Pin nodes, and direct Timeline Pin
drag. A stationary Timeline Pin release performs exact Pin Go. Working-Interval
bounds derive the selected endpoint Pins and follow their direct movement. The
Guide profile routes through the same whole-Section
translation used by its Timeline wire. Guide-local pointer deltas use the full
visible endpoint track or Guide row as their interaction width and convert
through the captured Timeline projection, so equal relative movement feels
equal and the Start/End controls retain travel on both sides. Timeline Pins use
the same relation count. These are pure projections of Guide ownership and
persist no additional topology.

Session snapshots retain `lastOperator`, so Undo and Redo restore the same
three-frame interpretation as the spatial state. `app.js` owns preview
selection: Context temporarily takes precedence; otherwise Refine and Reopen
derive exact weighted midpoint targets, a selected Section uses its exact
extent only while Current is its midpoint, and Step is the default. An edited
Section whose midpoint no longer equals Current therefore returns to Step
after its direct preview ends. The Field controller receives only source
addresses and imports neither projection nor operator arithmetic.

During a retained-object drag, `app.js` supplies one temporary extent to
`step-field.js`. Pin preview uses exact spatial Step targets around the Pin;
Section preview uses exact Start/midpoint/End addresses. Configured Field
offsets remain exclusive to live Stretch/Hold. `previewExtent()` accepts only
those two complete request forms. Polling re-publishes the active preview
instead of running ordinary side motion. Direct preview has precedence over
the ambient operator or Context preview and restores that ambient owner when
cleared. Preview spans are never published as Held Field spans, and malformed
or unknown requests cannot acquire Field ownership. Presentation hover/focus
remains a non-invasive Session dry run in `view.js`; only a drag that has
crossed its movement threshold seeks the three players.

There is one lateral coordinate and one Pin placement path. Vertical lanes pack
projected extents and fold into a bounded visual band; they do not add another
interaction axis or alter projection. Fine and coarse pointers use different
lane and Pin hit geometry, and clustering uses the same hit width; visual marks
remain unchanged while interactive regions cannot overlap ambiguously.

`previewTransition()` uses the exact Session operator used for commit, so presentation does not maintain parallel operator arithmetic.

Timeline input stays in `app.js`:

- Section body click: make its full extent the Working Interval and center Current;
- Guide endpoint drag: move that shared Pin using relative Timeline distance;
- Guide profile drag: translate the complete Section;
- Guide selector or Deform step: commit one canonical factor;
- timeline or Guide Pin Go: invert or use an exact source target;
- Timeline Pin marker: exact Go on stationary release or exact drag after the
  movement threshold;
- Guide Pin map node or cluster Move handle: move one exact Pin;
- independent endpoint Pin drag within the 16-pixel acquisition radius: show an
  amber candidate, arm it green only after a 450 ms dwell, and link on release;
- Range handles: update Range without rewriting Guide;
- Range Start/End: distinct Go/set actions and synthetic Pin stops.

Pointer capture begins only after movement crosses the drag threshold; a simple
Pin press/release therefore remains selection, while motion keeps the same Pin
as the drag owner.
Changing or leaving a candidate cancels its dwell timer. Releasing before the
candidate arms commits only the ordinary Pin move. Unlink uses the shared Guide
confirmation dialog because it changes graph ownership even though source
geometry is initially unchanged.
Document fallback still gives each real drag exactly one terminal event.
Grouped-Pin triggers open on pointer-down before Timeline Go can run. Each
chooser row is a click-only exact selection beside a separate horizontal drag
handle. The chooser stays open after selection, marks the retained Pin, and
closes after a committed drag.

Space is captured as the reader-wide observation command before native button
activation. Text inputs, selects, modal Guide work, and compact Guide focus keep
their ordinary ownership; Enter remains the focused Step-control gesture.
Pointer-acquired button focus is released after activation, and `youtube.js`
owns iframe focus release across Center play, buffer, pause, and end state
changes. Application and Field code never reach through the adapter to raw
YouTube objects.

The Operator matrix is constrained to a square 3×3 grid because row and column
placement carry semantic meaning. Its cells use a fixed three-level hierarchy:
corner key, centered operator identity, then at most two lines of current
consequence. Parameter labels use one compact sans-serif level while state
values use one monospaced level; differences communicate role, not accidental
inheritance.

Compact Guide marks only the background viewer, map, Parameters, Operators, and
source bar inert. Guide is nested inside `reader-column`, so the column itself
must remain interactive; otherwise visible tab controls fall through to the
scrim.

## Persistence and migration

Guide data is video-specific. Preferences store Context duration, semantic Step Reach, independent Field offsets and rates, Field visibility, and pane visibility.

Guide schema v7 persists Section `weight`; it never persists Timeline Space, segment density, lanes, gradients, or projected positions. Legacy v6 `collapsed: true` migrates once to `0.25×`, the closest positive replacement, while open Sections migrate to `1×`. The legacy flag is discarded.

Legacy scalar Step values migrate to fixed mode. Legacy coupled Field values seed separate preferences once and remain independent afterward.
