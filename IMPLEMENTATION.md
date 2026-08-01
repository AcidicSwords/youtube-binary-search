# Video Cartography — Canonical Implementation

## Ownership

| Module | Responsibility |
|---|---|
| `session.js` | canonical model, semantic transactions, endpoint frames, history |
| `range-geometry.js` | pure Resolution and interval arithmetic |
| `guide.js` | shared Pin graph, Section weights, lifecycle, persistence, migration |
| `cues.js` | candidate Addresses parsed from offered text; no persistence, no projection |
| `timeline-projection.js` | positive spatial density, source/timeline mapping, the drawn viewport, Pin ordering |
| `transport.js` | Context and native-playback runtime values |
| `step-gesture.js` | press/repeat/settlement and one-Undo gesture boundary |
| `field-frame.js` | pure Field Frame derivation, direction, and transition descriptors |
| `step-field-geometry.js` | pure Tail/Lead source geometry and the breathing state machine |
| `step-field.js` | physical Tail/Lead players, Frame placement, breathing runtime, Hold |
| `view.js` | DOM projection, weighted timeline, Guide and operator presentation |
| `app.js` | composition, adapters, persistence, direct manipulation |
| `youtube.js` | the only owner of YouTube player construction |

`session.js`, `guide.js`, `range-geometry.js`, `timeline-projection.js`,
`transport.js`, `field-frame.js`, and `step-field-geometry.js` remain DOM- and
I/O-free.

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

### Field Frame resolution

`field-frame.js` is the only owner of Frame derivation. `createFieldFrameSequencer()`
resolves one request per publish and returns a descriptor:

```text
{ owner, kind, tail, center, lead, direction, revision, reframed, outgoing }
```

Frame identity is `(owner, kind, tail, lead)` and deliberately excludes Center,
so a Context Cursor crossing its own window keeps one Frame and one revision.
`revision` therefore advances once per semantic movement, never once per publish.

`app.js` composes the request. Direct manipulation has the highest priority for
the gesture's lifetime, Context outranks operator framing while it is enabled,
and ordinary Center playback returns `null` so the Breath owns presentation.
Semantic Step Reach travels with the descriptor as `backwardDistance` and
`forwardDistance` because a Range-clipped Frame edge is not the semantic Reach.

### Transition revision ownership

`step-field.js` owns the transition lifecycle. `beginFrameTransition()` compares
the incoming Frame identity with the settled one; an unchanged identity updates
Center only. A changed identity advances `runtime.frameGeneration`, classifies
the direction from the transient outgoing Current, and marks the presentation for
one `FIELD_TRANSITION_MS` window. Repeated same-direction movements simply
retrigger the same animation, so rapid traversal reads as one continuing
slideshow.

The generation is also the stale-event token. Every placement records
`side.placementGeneration`; a CUED callback whose generation no longer matches
the current one is discarded, so obsolete intermediate Frames are never replayed
and the Field settles on the latest committed state. The transition never blocks
a semantic commit: Session has already changed by the time a Frame arrives.

### Breathing state machine

`step-field-geometry.js` owns the pure cycle. `advanceBreath()` receives the
configured `{ inner, outer, rate }`, the elapsed Center source time, and each
side's operational state and Range-clipped room. It returns the next phase, the
per-side offset, the boundary-waiting flag, and the rate that side should run at.

```text
expanding    tail → c − r, lead → c + r
contracting  tail → c + r, lead → c − r
waiting/held → c
```

A side that reaches its effective bound clamps exactly to it and waits at Center
rate. The phase reverses only when every operational side is waiting;
non-operational sides are excluded from that barrier entirely.
`effectiveBreathBounds()` clips both bounds against the room Range leaves the
side, so a Range-constrained Field still breathes and still never crosses Center.

`step-field.js` owns the runtime. `driveField()` advances the machine once per
tick and then places both sides from its authoritative offsets, so the two sides
can never disagree about the phase. `holdBreath()` and `resumeBreath()` preserve
the direction across a Hold. A fresh playback gesture calls `startBreathCycle()`
to begin at the inner boundary; the deliberate Stretch control instead resumes
from the attained relation.

Field Offset is configured physical state. Only explicit Inner/Outer Offset input
updates `fieldBreath`. Hold and Stretch maintain runtime side state without
reporting or persisting their measured relation, and neither can call
`setStepReach()` or a Section-weight transaction.

Each side keeps `configuredOffset` separate from its live `offset`.
`reconfigureOffset()` reconciles the live relation with a newly configured bound:
a side already following its configured bound follows the new one, while a
partial relation is preserved and only clamped when necessary. Configuration
edits are neither a Hold nor a Stretch.

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

`app.js` alone derives the ambient Frame request. Idle Step uses the same
`projection.stepTarget()` calls and effective Reach as the committed Step;
Context uses the active transport's exact `start` and `end` with the observed
Cursor as Center. `step-field.js` only validates and displays those source
Addresses, so it does not import timeline projection or Context arithmetic.

All semantic Step surfaces resolve through `step-gesture.js`. A repeated press
commits Center at each Current, retargets the adjacent Step preview, keeps one
history origin, and starts automatic Context at most once after settlement.

## Timeline and direct manipulation

`view.js` renders:

- adaptive source timestamp guides positioned in Timeline Space;
- a named layer key, Current's own Address carried under its marker, and a physical Cursor readout that reports only once observation has left Current;
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
Section-reference count. That full-map profile is a read-only positional
representation and an acquisition link back to the Timeline; it carries no drag
geometry. Shared-Pin mutation happens on the Temporal Topography — Timeline Pin
markers and Section Start/End nodes — or through Guide's exact Address inputs.
A stationary Timeline Pin release performs exact Pin Go. Working-Interval bounds
derive the selected endpoint Pins and follow their direct movement. Timeline Pins
use the same relation count. These are pure projections of Guide ownership and
persist no additional topology.

### Exact Guide input routing

`addressField()` renders one row per editable Address: a text input accepting
canonical timecode or seconds, the shared `−`/`+` Nudge increments, and Go.
`applyGuideAddressInput()` parses and clamps the value, calls the same
`moveGuidePin()` or `moveGuideSection()` transaction the Timeline drag uses, and
commits one `checkpoint()`. Enter applies, Escape re-renders the committed value,
and the increment buttons route to `nudgeTarget()` rather than a private path, so
Timeline, Guide, keyboard, and pointer share one operation implementation.

### Nudge transaction batching

`nudgeQuantum()` returns an adapter-verified frame duration when one exists and
the configured source-time quantum otherwise; `nudgeUnitLabel()` never claims a
frame step without that verification. `beginNudgeGesture()` keys a gesture by its
target, snapshots the origin model once, and restarts a settle timer on every
repetition. `nudgeTarget()` amends that origin with `{ amend: true }` so no
intermediate step touches history, and `settleNudgeGesture()` appends exactly one
`checkpoint()` when the gesture ends. High-resolution wheel deltas accumulate on
the gesture until one discrete quantum threshold is crossed, and the browser
default is prevented only once a valid Timeline target has been acquired.
Precision drag reduces pointer gain, quantizes in source time, and reprojects, so
Section Weight cannot change the temporal size of one Nudge.

Session snapshots retain `lastOperator`, so Undo and Redo restore the same
three-frame interpretation as the spatial state. `app.js` owns Frame-owner
selection: direct manipulation first, then Context while it is enabled, then the
operator fallback — Refine and Reopen derive exact weighted midpoint targets, a
selected Section uses its exact extent only while Current is its midpoint, and
Step is the default. An edited Section whose midpoint no longer equals Current
therefore returns to Step when its gesture ends. The Field controller receives
only source addresses and imports neither projection nor operator arithmetic.

During a direct manipulation, `app.js` supplies one exact Frame to
`step-field.js` through `previewExtent()`, which validates it with
`directFrame()`; malformed or unknown kinds cannot acquire Field ownership.
Current drag supplies the candidate Context Frame when Context is enabled and the
candidate Go Frame otherwise; Pin drag uses exact spatial Step targets around the
Pin; Section drag uses exact Start/midpoint/End addresses. Configured breathing
bounds remain exclusive to live Stretch/Hold. Polling re-publishes the active
Frame instead of running ordinary side motion. A direct Frame has precedence over
the ambient Context or operator Frame and one transition restores that ambient
owner when cleared. Frames are never published as Held Field spans. Presentation
hover/focus remains a non-invasive Session dry run in `view.js`; only a drag that
has crossed its movement threshold seeks the three players.

There is one lateral coordinate and one Pin placement path. Vertical lanes pack
projected extents and fold into a bounded visual band; they do not add another
interaction axis or alter projection. Fine and coarse pointers use different
lane and Pin hit geometry, and clustering uses the same hit width; visual marks
remain unchanged while interactive regions cannot overlap ambiguously.

`previewTransition()` uses the exact Session operator used for commit, so presentation does not maintain parallel operator arithmetic.

Timeline input stays in `app.js`:

- Section body click: make its full extent the Working Interval and center Current;
- Current marker: acquired on pointer-down, then exact Go on release after the
  movement threshold; a stationary press moves nothing;
- Section Start/End node: move that endpoint Pin;
- Section midpoint node: translate the complete Section;
- Guide selector or Deform step: commit one canonical factor;
- Guide Address input or increment: the same Pin/Section transaction;
- timeline or Guide Pin Go: invert or use an exact source target;
- Timeline Pin marker: exact Go on stationary release or exact drag after the
  movement threshold;
- cluster Move handle: move one exact Pin;
- `Shift` + wheel: nudge the exact object under the pointer;
- `Shift` + drag: precision mode for the same gesture owner;
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

Guide data is video-specific. Preferences store Context duration, semantic Step
Reach, the configured Field Breath `{ inner, outer, rate }`, the Nudge quantum,
Field visibility, and pane visibility.

Guide schema v7 persists Section `weight`; it never persists Timeline Space, segment density, lanes, gradients, or projected positions. Legacy v6 `collapsed: true` migrates once to `0.25×`, the closest positive replacement, while open Sections migrate to `1×`. The legacy flag is discarded.

Legacy scalar Step values migrate to fixed mode. Legacy independent side Offsets
migrate once into one bounded breathing relation: the widest side becomes the
outer offset, a proportional fraction becomes the inner offset, and the saved
side rates become the nearest symmetric breathing pair.
