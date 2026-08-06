# Video Cartography — Canonical Specification

## 1. Authority

This document specifies Video Cartography package release **9.1.0**. `package.json` is the release-version authority; the final implementation and its release gates are executable proofs of this specification. A contradiction among code, tests, interface text, and this document is a defect, not an alternative product generation.

The objective is a stable video-comprehension instrument, not an editing suite or framework. Completion preserves these laws:

1. source time remains authoritative;
2. Timeline Space remains positive and invertible;
3. depth comes from composition of small primitives;
4. direct manipulation accepts intuition and resolves to exact canonical state;
5. advanced mechanisms remain optional;
6. ordinary video-player functionality remains intact;
7. operators exclude alternatives and leave one contiguous Active Span residue;
8. no operation mutates an unrelated state dimension;
9. one semantic consequence has one implementation even when multiple routes reach it.

No derived Timeline coordinate, visual lane, gradient, hover, preview, iframe drift, or transient comparison is source truth.

## 2. State and ownership

### 2.1 Canonical source-scoped state

A loaded Session owns:

- source duration;
- Range;
- Current;
- Current Neighborhood and Current Neighborhood basis;
- an optional Active Span with bounds, orientation, and endpoint frames;
- optional Focus and its return Range;
- configured Step Distance;
- Guide version 10 Groups, Pins, Sections, labels, membership, activity, drawn Group, and Section Weighting;
- bounded Undo history and Redo future.

The application owns the loaded source identity and the current Session. Guide persistence is keyed by source identity. Session history never crosses a source boundary.

### 2.2 Persisted preferences

Preferences may persist independently from a source:

- Context duration;
- Step Distance mode and values;
- Panorama Inner Offset, Outer Offset, and cycling-rate spread;
- Nudge quantum when no exact media frame is available;
- Shift playback fixed wish and dynamic-policy choice;
- Panorama enabled state and side visibility.

Valid saved preferences remain authoritative across release upgrades. Migration may translate a valid legacy representation into the current representation; it may not silently replace a valid choice with a new default.

### 2.3 Transient owners

The following are intentionally absent from Session history and Guide persistence:

- Cursor and media-player drift;
- active Context or Playback transport;
- requested and confirmed playback-rate runtime;
- pending Step and Nudge gesture accumulators;
- Current, Range, Pin, or Section drag state;
- selected Timeline operand and Guide Selection;
- selected/aligned Pin indicators;
- Matrix Shift latch, Guide Extend latch, and physical modifier state;
- weight relaxation;
- offered Chapters and Chapter-lane visibility;
- open panels, dialogs, cluster menus, hover, focus, and preview state;
- Panorama Frame transition revision, Panorama Cycle phase, and side-player synchronization.
- active Ripple identity, Ripple Observation Address, and Ripple Context Window;
- source-generation-scoped Traversal Prospects;
- Ghost Anchor, Ghost Candidate, frozen Trace/Prospect read, and wheel accumulator.

Each transient has one owner and one settlement or cancellation boundary. A timer cannot checkpoint state after its source or gesture owner has changed.

### 2.4 Minimal transforms

An operation is defined both by what it changes and what it preserves. Presentation-only actions issue no semantic checkpoint. Media events update only media-owned facts unless a defined transport settlement converts observation into one Session transaction. Guide metadata changes issue no player command unless Current or Range also changes as an explicit consequence.

## 3. Source geometry

### 3.1 Source Time

Every durable temporal value is a finite source Address. Source order and duration are immutable for one loaded source. All accepted state must satisfy:

```text
0 ≤ Address ≤ duration
Range.start ≤ Current ≤ Range.end
Range.start < Range.end, except the empty unloaded state
```

An interface may clip a pointer candidate as it meets a physical boundary. Exact numeric input does not reinterpret the entered value.

### 3.2 Range, Current Neighborhood, Current, and Cursor

**Range** is the contiguous source universe currently admissible to ordinary navigation. Full Video is `[0, duration]`. A proper Range excludes at least one full-video boundary.

**Current Neighborhood** is an ordered neighborhood `{L, C, R}` with a basis of `range` or `movement`:

```text
Range.start ≤ L ≤ C ≤ R ≤ Range.end
Current = C
```

Refine descends within this neighborhood. Reopen restores `{Range.start, Current, Range.end}`. Step translates a neighborhood by a Timeline-space distance while retaining a valid bounded frame. Direct Go seeds a movement-scale neighborhood from departure to destination.

**Current** is committed semantic position. **Cursor** is observed physical position. Polling Cursor must not rewrite Current. A defined transaction—Go, Step, Refine, or Playback settlement—owns any semantic conversion.

### 3.3 Subtractive Active Span

Range begins as the admissible universe. Navigation and search exclude alternatives from the current relation. The **Active Span** is the positive contiguous residue that survives those exclusions.

It stores:

- ordered source bounds `start < end`;
- directed `departure` and `arrival`;
- active side and direction;
- the operator and medium that established it;
- endpoint frames sufficient for Switch End.

It does not store a persistent path, visited-address ledger, exclusion tree, or object set. Composition resolves to the same two-bound representation.

Plain Refine and consecutive Step operations retain an established anchor while that anchor remains outside the newly traversed path. When a reversal reaches or passes the retained departure, the complete Current-to-target movement becomes the new residue; the old departure cannot be reused to erase part of the movement.

A pending Step sequence may transiently record `visitedMinimum` and `visitedMaximum`. At settlement:

- one sequence creates one Undo transaction;
- net forward or backward displacement receives the corresponding Step label;
- a return to departure with positive visited extent is **Step Reversal** and retains that visited envelope with a deterministic active side;
- the transient envelope is then discarded.

Reopen restores excluded discrimination alternatives. Undo restores prior canonical state. Release clears the active residue. None requires a new persistent path type.

### 3.4 Timeline Space

For every active effective Section factor:

```text
density at source Address t = product of weights covering t
Timeline(t) = integral from 0 to t of density
```

Allowed Weights are positive, so every segment density is positive. The resulting map is continuous, strictly increasing, and singly invertible.

The canonical Weight ladder is:

```text
0.125×, 0.25×, 0.5×, 0.75×, 1×,
1.25×, 1.5×, 1.75×, 2×, 4×
```

Overlaps compose by multiplication. Their logarithms add, so composition is order-independent and requires no Section priority. `1×` contributes identity.

Timeline extent is spatial, not temporal duration. A Section with source duration `d` under one isolated Weight `w` receives `w × d` Timeline units. Playback duration remains `d`.

### 3.5 Focus and viewport

Focus installs an acquired Section or Active Span as Range and saves the containing Range for Unfocus. The focused extent also becomes the viewport, so it fills the drawn Timeline at every Weight.

Viewport changes presentation only. It cannot alter source↔Timeline conversion, Step, Refine, Reach, Weight, or topography-bypass state. Spatial Range-boundary edits that would change the world defining Focus are refused with a reason. Exact editing of a focused saved Section may rebase that Focus through the Guide’s canonical operation.

## 4. Retained topology and effective projection

### 4.1 Pins and Sections

A Pin owns one source Address and identity. A Section owns two Pin IDs, an optional title, one Group ID, one canonical Weight, provenance, and timestamps. Its resolved extent is the ordered pair of its endpoint Addresses and must have positive duration.

Shared Pin identity is topology. Moving one shared Pin updates every referencing Section. Coincident Pin Addresses do not imply shared identity. Moving a Section translates only its two endpoint Pins; unrelated interior Pins do not move. Structural bounds prevent a move from collapsing or reversing any incident Section.

Deleting a referenced Pin requires an explicit cascade that dissolves all referencing Sections in the same transaction. Unlinking one shared endpoint creates a new endpoint Pin at the same Address. Relinking is permitted only when:

- the source Pin has one Section reference;
- source and target are distinct and coincident at commit;
- replacement preserves positive geometry;
- it creates no duplicate Section in the destination Group;
- labels do not conflict.

Pointer proximity alone never links. A visible snap candidate must remain inside the threshold until its arm delay completes, and release then commits movement and linking as one semantic consequence.

### 4.2 Groups

Every Section belongs to exactly one ordinary Group. Group labels are unique. The default Group is not privileged except as a fallback identity in recovery.

Two independent relations exist:

- **drawn** — zero or one Group supplies Section wires and endpoint Pins to the Timeline;
- **active** — any number of Groups may contribute Section Weight.

No Group drawn is valid. Hiding the drawn Group does not promote another Group and does not deactivate it. Therefore landmarks may disappear while their active topography remains.

Group deletion uses one plan shared by confirmation, mutation, status, tooltip, and tests:

```js
{
  allowed,
  reason,
  heirGroupId,
  movedSectionIds
}
```

The last Group cannot be deleted. A deletion that would create a duplicate Section in the heir Group is refused. Otherwise all member Sections move to the actual reported heir; no conventional Group name may substitute for that identity.

### 4.3 One effective projection

One immutable projection is built for a render or semantic operation. Its contributors and piecewise segments are resolved after:

1. Group activity;
2. canonical Section Weight;
3. the current weight relaxation.

The same projection supplies:

- source→Timeline and Timeline→source mapping;
- Timeline distance and spatial midpoint;
- Step and Refine metric;
- adaptive Reach;
- hit testing and pointer-to-source drag conversion;
- Range-handle and retained-object spatial movement;
- section and Pin placement;
- spatial readouts;
- exact source-time sourceGridLines;
- topography atmosphere contributors;
- optional Textured Playback Weight.

An operation or drag captures the projection it begins with. Its geometry cannot change underneath its pointer or repeat sequence. A projection-changing action must wait for, settle, cancel, or refuse an active direct-manipulation owner.

### 4.4 Temporal Topography-bypass law

The only transient bypass state is:

```ts
type WeightRelaxation =
  | null
  | { kind: "all" }
  | { kind: "section"; sectionId: string };
```

`X` invokes **Relax Weights**:

- an acquired Timeline Section resolves scope `{kind: "section", sectionId}`;
- any other selection state resolves `{kind: "all"}`;
- the same resolved active scope restores topography;
- a different scope transfers the single bypass;
- the command changes no stored Weight, Guide state, player setting, history, or persisted preference.

Guide Selection alone never supplies the Section scope. Bare Timeline Go clears the acquired operand before navigation, making complete-map scope directly reachable.

The bypass is source-scoped. Source replacement clears it. Deleting its target clears it. An invalid target self-clears. Group visibility or activity changes do not mutate it. Undo and Redo do not own it. Release preserves it.

An active Current, Range, Pin, or Section drag causes `X` to refuse safely. Pending Step and Nudge settle before the projection changes. Active playback continues. `X` issues no direct media command; an explicitly Textured Playback may request a new rate later because its policy reads the changed effective projection.

### 4.5 Atmosphere and sourceGridLines

The topography atmosphere is derived only from `projection.weightContributors` or an equivalent effective-contributor output. It never rereads raw active Guide weights independently.

- Weight below `1×` contributes violet compression influence.
- Weight above `1×` contributes teal expansion influence.
- Hue states sign; log-magnitude states peak strength; source span diffuses the influence; each contribution fades beyond its bounds.
- Overlap composes in log space, matching multiplicative geometry.
- SourceGridLines begin at uniform source increments and are projected through the exact map. Their screen spacing is metric evidence.

With complete-map bypass, segments are identity, sourceGridLines are evenly spaced, no compression or expansion class is present, and no colored atmosphere remains. Stored Section wires and Guide Weight values remain visible and unchanged. With a Section bypass, only that contribution disappears; overlapping effective Sections remain.

## 5. Operator grammar

### 5.1 Exact matrix

The visible, physical, keyboard, preview, and documented matrix is exactly:

```text
Q  Refine Backward    W  Reopen            E  Refine Forward
A  Step Backward      S  Switch End   D  Step Forward
R  Release            T  Tag               F  Focus / Unfocus
```

The semantic rows are:

1. discriminate;
2. traverse or change viewpoint;
3. resolve the current relation into absence, retained structure, or active scope.

The canonical action identities and shifted meanings are:

| ID | Key | Visible action | Shift meaning |
| --- | --- | --- | --- |
| `refine-backward` | `Q` | Refine Backward | Local Refine Backward |
| `reopen` | `W` | Reopen | unchanged |
| `refine-forward` | `E` | Refine Forward | Local Refine Forward |
| `step-backward` | `A` | Step Backward | Previous Pin |
| `switch-end` | `S` | Switch End | unchanged |
| `step-forward` | `D` | Step Forward | Next Pin |
| `release` | `R` | Release | unchanged |
| `tag` | `T` | Retain Pin | Retain Section |
| `focus-toggle` | `F` | Focus / Unfocus | unchanged |

Relax Weights is an auxiliary `X` action inside Operators and outside the square matrix. Weight is edited on its Section in Guide.

### 5.2 Shift ownership

Three inputs may supply Shift semantics:

- physical Shift is global for the current action and consumes no latch;
- the Matrix Shift latch belongs only to Matrix Refine, Step, and Tag;
- Guide Extend belongs only to Guide/Chapter composition.

Only the matching latched owner may be consumed, and only when that latch actually supplied a modified action:

```js
consumeShiftLayer(owner)
```

An unrelated plain action preserves both latches. Matrix and Guide cannot consume one another. Source transition clears both.

### 5.3 Refine Backward / Refine Forward

Refine targets the Timeline-space midpoint from Current toward the corresponding Current Neighborhood side and descends to finer Current Neighborhood. It uses the effective projection.

Plain Refine retains the Active Span departure while the target remains on the same traversed side and the departure remains outside the new Current-to-target movement. A reversal that reaches or crosses the retained departure draws the complete immediate movement instead.

`Shift+Q` and `Shift+E` perform **Local Refine**. Local Refine uses the same midpoint but always retains the immediate Current-to-target traversal. Refine changes neither Guide topology nor Weight.

### 5.4 Reopen

Reopen sets Current Neighborhood to `{Range.start, Current, Range.end}` and basis to Range. It preserves Current, Active Span, Focus, Guide, Weight, selection, and weight relaxation. It is unavailable when Current Neighborhood already spans Range.

### 5.5 Step Backward / Step Forward

Step moves a configured distance through Timeline Space using the effective projection. The target is clipped to Range. The source-time displacement therefore varies with density while the requested map distance remains stable.

Reach may be:

- fixed directional Timeline units, linked by the interface for symmetric ordinary use; or
- adaptive `1/32`, `1/16`, or `1/8` of the active Range’s effective Timeline width.

Adaptive Reach recomputes when Range, Weight, activity, or bypass changes. Fixed Reach does not.

Pressed, held, repeated, and quickly tapped routes use one Step gesture owner. Current and physical players move immediately; history and automatic Context settle once. A reversal retains the transient visited envelope as specified in §3.3.

Shifted Step traverses to the previous or next visible Pin stop or synthetic Range boundary. It uses Step’s same Active Span and endpoint-frame law; it is not a separate Go operation.

### 5.6 Switch End

Switch End requires a Active Span. It makes the opposite bound Current, flips the active side and orientation, and restores the Endpoint Frame owned by that bound. It preserves the Interval extent, Range, Guide, Weight, Focus, and bypass.

### 5.7 Release

Release clears:

- the Active Span, if present;
- the Timeline Selection.

It preserves Current, Current Neighborhood, Range and Focus, Guide Selection, Pins, Sections, Groups, Weight, weight relaxation, Panorama preferences, and playback preferences.

Clearing a semantic Active Span creates one Undoable Session transaction. Clearing only presentation selection succeeds without history.

### 5.8 Tag

Tag has exactly two forms:

```text
T         Retain Pin      operand: Current
Shift+T   Retain Section  operand: Active Span
```

The visible label follows physical or Matrix Shift state, never the accidental presence of a Active Span:

- unshifted label: `Retain Pin`;
- unshifted metadata: `Current <Address> → Pin`;
- shifted label: `Retain Section`;
- shifted metadata: `<Active Span> → Section`.

Plain Tag remains available while an Interval exists and still retains Current as a Pin. Shifted Tag is disabled without a positive Active Span. An exact duplicate creates no second object or history; it selects and reports the existing Pin or Section. A newly retained Section enters the currently drawn Group, falling back to the ordinary default Group when none is drawn.

Before retention the source object is always called a Active Span. Section names only the retained result.

### 5.9 Focus / Unfocus

Focus chooses an acquired Timeline Section when available, otherwise a positive Active Span. It installs that extent as Range and viewport and stores the containing Range. Current remains if already inside; otherwise it moves to an effective spatial midpoint. Focus changes neither Weight nor weight relaxation.

Unfocus restores the containing Range and a valid Current. Focused spatial boundary edits that cannot be represented truthfully are refused rather than approximated.

### 5.10 Go

Go commits an exact known source Address, seeds movement-scale Current Neighborhood, and leaves the positive departure-to-arrival residue. Bare Timeline ground performs Go only within Range and clears the Timeline Selection first. Pin activation performs the same canonical movement while acquiring that Pin.

A Guide destination outside a focused Range may leave Focus or open Full Video as part of one reported transaction so the exact retained Address becomes admissible. Go to the existing Current is a no-op; Reopen is the explicit way to discard local scale at the same Current.

### 5.11 Undo and Redo

Every semantic operator commits the smallest complete transaction. Undo restores the checkpoint immediately before it; Redo restores the displaced state. A new semantic transaction clears the Redo future.

Metadata-only presentation, weight relaxation, panel state, previews, Chapters, transport ticks, rate events, Panorama Cycle, and playback wraps do not enter Session history. A changed Guide transaction is persisted after acceptance when recovery permits safe writing.

## 6. Selection and direct manipulation

### 6.1 Selection domains

`timelineSelection` is the Timeline Selection. `guideSelection` is Guide Selection. Timeline acquisition also focuses the matching Guide row; Guide Selection alone does not manufacture a spatial operand.

If a Active Span’s endpoints align with Pins, every visible aligned Pin is indicated. If the acquired exact Section supplies the extent, its two endpoint identities are known and selected. Geometry alone never chooses one identity arbitrarily from coincident Pins.

Visual channels remain independent:

- quiet marker for identity;
- background fill for Timeline Selection;
- inset edge for Active Span relation;
- focus ring for keyboard focus;
- outline/glow for transient snap source, target, and armed state.

No channel may erase another state’s meaning.

### 6.2 Timeline pointer grammar

| Target | Click | Drag |
| --- | --- | --- |
| bare Timeline ground | clear Timeline operand, then Go | none |
| Current marker | no generic Go | preview candidate, commit one Step |
| single Pin | acquire exact Pin and move Current | move that Pin |
| Pin cluster | open a vertical, wheel-scrollable exact-choice menu | drag the chosen Pin from its menu row |
| Section wire end region | acquire the Section endpoint relation | move that endpoint Pin |
| Section wire middle | make the Section the Active Span and center Current spatially | translate its two endpoint Pins |
| Range boundary | keyboard or pointer acquisition | change Range when Focus permits |

Section wire roles come from its end regions and middle. The Timeline does not draw redundant Start/midpoint/End node controls.

`Shift+click` modifies only bare Timeline ground: it acquires Ripple instead of
ordinary Go. Retained Pins, Sections, Range handles, Current, cluster menus, and
their descendants keep their own Shift meanings. Ripple pointer inversion uses
the same effective Timeline Projection as Go; there is no second hit-testing
map.

A click that does not cross the drag threshold remains a click. Drag settlement suppresses the synthetic trailing click. Each gesture captures its origin model, history, future, and effective projection; cancellation restores that origin exactly.

Pin and Section manipulation previews through the Panorama. A Pin uses its Step neighborhood; a Section uses its Start, midpoint, and End. Active Span bounds that coincide with a moved Pin follow the same canonical Pin transaction.

### Current drag and Nudge as Step

Dragging Current is Step, not Go. Pointer movement changes only a candidate and Panorama preview; Session Current remains at departure until commit. Release converts the source candidate into an equivalent effective Timeline distance and commits one Step gesture. A stationary press is a no-op. Cancellation restores the origin.

This law preserves the established residue: moving Current extends or shortens the same traversal instead of inventing a fresh neighborhood around the landing point. Bare Timeline Go is the distinct route for that goal.

### Nudge

Nudge is one source-time operation reached by Timeline wheel, off-map wheel, keyboard comma/period, and Guide decrement/increment controls.

The target rule is:

- over Timeline, the exact Pin or Section under the pointer; bare map targets Current;
- elsewhere outside form controls, the Timeline Selection; absent one, Current.

Shift-wheel selects the dominant of `deltaX` and `deltaY`. Wheel right or up moves forward; left or down moves backward. High-resolution deltas accumulate until the quantum threshold is crossed, and one event may produce multiple quanta. Browser default is prevented only after a valid target is acquired.

Nudge Current invokes Step law while preserving a configured source-time quantum. Nudge Pin and Nudge Section invoke the same Guide movement operations as direct manipulation. One wheel series or held repetition creates one Undo transaction after its settlement timer.

When the adapter proves an exact frame duration, that duration is the quantum and the interface may call it a frame. Otherwise the configured source-time quantum is reported honestly.

### Exact Guide editing

Guide Address fields accept finite seconds or valid `MM:SS` / `HH:MM:SS` timecode. Non-leading timecode fields must be below 60. Exact Address fields reject anything outside
Range, any collapsed/reversed Section geometry, and any invalid structural relation. They never silently substitute a boundary value for the typed value.

Typing a valid candidate may preview it through the same Panorama Frame as a drag. Commit routes through `moveGuidePin` or `moveGuideSection` and one checkpoint. Guide decrement/increment controls route through Nudge and repeat while held.

### 6.3 Guide composition and Carry

A plain Guide click replaces the working relation with the clicked Pin or Section. Physical Shift or Guide Extend grows the current Active Span to the minimum contiguous extent containing the selected Chapter, Pin, or Section. Composition stores the resulting extent, not an object set.

Alt with a spatial navigation operator may Carry the acquired Timeline Pin or Section by the same effective Timeline-space displacement as Current. Structural and source bounds clip or refuse the retained-object movement without changing the underlying navigation law. Carry is optional and creates no second operator family.

## 7. Panoramic Phase Panorama

### Panorama Frame

The Panorama Frame is the stable Tail–Center–Lead presentation outside ordinary Panorama playback. It is a projection of canonical or direct-manipulation state, never a second semantic model.

Every valid Frame satisfies:

```text
Range.start ≤ Tail ≤ Center ≤ Lead ≤ Range.end
```

An edge collapsed onto Center conveys no distinct observation and may make that side unavailable.

#### Frame ownership

Frame ownership has one priority order:

1. active direct manipulation supplies its exact candidate Frame;
2. otherwise enabled Context supplies its bounded Context Frame;
3. otherwise the last applicable operator supplies its Frame;
4. ordinary playback hands presentation to Panorama Cycle rather than Panorama Frame.

Operator Frames use the effective projection:

- Step, Pin, Go, and fallback: the configured backward Step destination, Current, and forward Step destination;
- Refine Backward/Forward and Local Refine: the next directional Refine targets around Current;
- Reopen: the directional midpoints available from the reopened Current Neighborhood;
- selected Section: Start, the active midpoint, and End while Current owns that relation.

Direct Pin editing uses the Step neighborhood around its candidate Address. Direct Section endpoint or whole-Section editing uses candidate Start, midpoint, and End.

#### Slideshow transitions

One sequencer owns settled Frame identity and revision. A new semantic movement may produce one directional transition: forward movement reads toward Lead; backward movement reads toward Tail. Semantic state commits before this presentation chapter.

Republishing the same Frame does not create another transition. A moving Context Cursor does not change the identity of its fixed-edge Frame. Reduced-motion preference may remove the visual transition without changing any Frame Address.

#### Persistent Context framing

When Context duration is positive, Context owns Tail and Lead before, during, and after its Center transport. Its source-contiguous window is centered on Current and each side clips independently at Range; unused duration on one side is not moved to the other.

Tail is the first Context Address, Lead is the last, and Center is Current while idle or Cursor while running. Starting, pausing, stopping, or settling Context does not reassign the edges. Setting Context duration to zero returns ownership to operator framing.

### Panorama Cycle

Panorama Cycle is the live Tail/Lead relation during ordinary Panorama playback. Its configured relation is:

```text
0 < Inner Offset x < Outer Offset y
```

The conservative high-coherence defaults are:

```js
{ inner: 0.25, outer: 2.5, rate: 0.25 }
```

At Center `1×`, the default rate pair is:

```text
Tail 0.75× | Center 1× | Lead 1.25×
```

Wider offsets and stronger supported symmetric pairs remain selectable. Existing saved preferences remain unchanged. Valid legacy side settings migrate to one bounded symmetric relation.

The rate value is fractional spread around Center:

```text
outward Tail = Center × (1 - rate)
outward Lead = Center × (1 + rate)
```

During contraction the side roles exchange. A side reaching a boundary first follows Center at Center rate while preserving the attained offset. When every operational side reaches the same boundary, the phase reverses. A collapsed, hidden, unavailable, or Range-clipped side is excluded from this synchronization barrier. If a side has less room than Inner Offset, the minimum is not reduced; the side is parked within available room and does not cycle.

Freeze Panorama preserves attained offsets, clears waiting state, and places frozen sides at Center rate without rewriting the configured bounds or phase direction. Stretch Panorama continues from that exact relation. Freeze and Cycle phase create no Session checkpoint.

Panorama runtime suspends while Context, pending Step, direct manipulation, or an incompatible Playback policy/actual rate owns observation. Stale side-player events cannot revive a hidden, collapsed, unavailable, or superseded side.

## 8. Context and Playback

### 8.1 Context transport

Context is transient source-contiguous Center observation around a semantic anchor. It plays at `1×` from its clipped start toward its clipped end, leaves Current unchanged, and keeps the Context Panorama Frame stable. A following semantic command may replace it without creating an intermediate history entry.

Context duration and Panorama offsets are independent. Similar numeric displacement does not create shared state ownership.

### 8.1b Ripple observation and Traversal Prospects

Ripple is acquired by `Shift+click` on bare Timeline ground. The pointed
coordinate is inverted through the current effective Timeline Projection into a
Ripple Observation Address. That Address does not become Current. The shared
Context derivation independently clips `address - duration/2` and
`address + duration/2` to the active Range; the resulting exact boundaries form
the Ripple Context Window.

Ripple reuses the one Context transport and Panorama Context Frame. Repeated
Ripple acquisition while its Context is playing retargets that owner without a
stop/start seam. Current, Current Neighborhood, Active Span, Range, Focus,
Guide, both selections, Section Weightings, weight relaxation, semantic history,
and Traversal Trace remain unchanged. The Timeline simultaneously distinguishes
Current, Cursor, Ripple Observation Address, Ripple Context Window, Ripple Start
Prospect, Ripple End Prospect, and any Ghost Candidate.

The Start entry is appended before End, so newest-first forward reading offers
End then Start. Entries carry unique identity, Ripple batch identity, and source
generation; coincident Addresses remain distinct occurrences. Availability is
filtered by the active Range without deletion. Completion clears active Ripple
identity and retains both prospects. Retarget, Escape, or source replacement
removes an uncompleted batch. No prospect is persisted, stored in Session,
entered into semantic history, or appended to Traversal Trace.

### 8.2 Explicit Playback ownership

A Playback transport contains:

```ts
{
  observationPolicy: "panorama" | "center-only",
  ratePolicy:
    | { kind: "fixed", wish: number }
    | { kind: "dynamic" },
  requestedRate: number,
  actualRate: number
}
```

Plain `Space` creates:

```text
observationPolicy = panorama
ratePolicy = fixed 1×
```

`Shift+Space` creates:

```text
configured fixed wish: observationPolicy = center-only, ratePolicy = fixed
Textured Playback:     observationPolicy = panorama,    ratePolicy = dynamic
```

Observation policy does not derive from numeric rate. A fixed Shift wish that resolves to `1×` remains Center only.

A native Center Play event may create an ordinary Panorama Playback session at the adapter’s actual native rate. If that actual rate is incompatible with the fixed side relation, the Panorama suspends; ordinary Center playback continues.

### 8.3 Rate authority

Three rate facts remain distinct:

- **wish** — persisted fixed intent, or the dynamic log-compressed target;
- **requested** — the nearest currently offered rate sent to the adapter;
- **actual** — the rate confirmed by the adapter’s playback-rate event.

The actual-rate event updates only transport runtime and Panorama availability. It creates no new semantic Playback transaction.

Fixed wishes resolve against positive offered rates in logarithmic distance, because rate distance is multiplicative. An exact tie prefers the offer nearer `1×`, then a deterministic numeric tie. If available rates expand, the fixed wish is retained and an active fixed Shift playback retunes when a closer offer appears.

Textured Playback requests:

```text
wish = 1 - 0.25 × log₂(effective Weight at Current)
```

The media adapter’s offered rates provide the real bounds. Textured Playback is
the sole playback mode that reads effective projection Weight. Its Panorama
remains eligible wherever the offered ladder supplies the adjacent Tail/Center/
Lead rate triplet; at ladder ends Center continues alone.

### 8.4 Retry, wrap, and settlement

Retry preserves the active observation and rate policies, re-resolves the current offer, and does not reset to `1×`.

A proper-Range wrap:

1. rebases the same transport at Range Start;
2. preserves observation policy;
3. resolves the stored fixed wish again or derives Textured Playback Weight at Range Start;
4. requests that rate;
5. preserves Panorama availability or suspension from explicit ownership and actual compatibility;
6. adds no history.

No stale pre-retune transport object may own the wrap.

Playback settlement uses the transport’s departure, parent Current Neighborhood, return model, current Cursor, and completed cycles to commit at most one semantic transaction. Watched coverage extends or preserves existing Active Span coverage and never shortens it. A completed proper-Range cycle covers the Range. Full-video playback stops at source end.

### 8.4b Ghost Traversal and the Traversal Trace

Video Cartography distinguishes four temporal orders: source time, Timeline Space, semantic history, and the Traversal Trace — the order in which the reader actually encountered source Addresses. Only the fourth records where the reader has been, as opposed to what the world was.

Traversal Trace is an append-only, source-scoped ledger of traversal records. A record holds directed units: a jump has only the two Addresses occupied, while a span was continuously observed and may be recalled at any Address inside it. A route writes to it when the reader comes to occupy a different Address; editing the world without moving — renaming, reweighting, creating a Pin, toggling a Group — writes nothing, and programmatic placement never writes.

Semantic history and the Traversal Trace are different orders, and traversing one is a route through the other: an Undo or Redo that puts the reader at a different Address writes one occurrence like any other movement, and one that only changes the world writes nothing. A held or coalesced gesture writes one sequence that keeps its reversals, because collapsing a Step run to its endpoints erases the shape the reader remembers. A Current drag writes one movement: the ground under the pointer is a search for a place, exactly as a Ghost scan is, and only the release is an arrival.

Ghost Traversal is held `G` plus the wheel. Arming costs nothing: no Anchor, no history, no settled playback. The first wheel quantum settles pending work, captures Current as a fixed Anchor, and freezes the projection, effective Step Distance, and exactly one readable source, so the gesture reads a world that cannot change underneath it and can never follow its own output.

Backward opens a frozen Traversal Trace read. Forward first opens a frozen,
newest-first Traversal Prospect read; when none is available it may open the
valid historical continuation. Once acquired, reversing the wheel retraces that
same frozen source instead of switching sources mid-gesture. Trace directions
may move either way through source time. Watched passages are subdivided by the
frozen Step law, so expanded ground yields finer recall while watched boundaries
stay exact. An Address the active Range excludes is unavailable rather than
clamped, and Ghost never leaves Focus, widens Range, or opens Full Video.

Ghost restores no historical Pins, Sections, Groups, Weights, titles, visibility, Focus, Range, Step Distance, topography state or Guide selection. What it produces is an ordinary Active Span between the Anchor and the recalled Address, so Switch End, Tag, Release and Focus act on it exactly as they would on any other.

Where automatic Context is enabled, each recalled Address plays: the stop condition for a recall is recognition, and a still frame is a poor thing to recognise a moment from. Successive candidates retarget one Context window rather than opening a new one, so the window follows the wheel instead of being torn down and rebuilt at every notch. Automatic Context verifies a Current or Ghost Candidate already reached; whether superseded, completed, or still running when the gesture ends, it appends no Traversal Trace evidence. Escape stops it with everything else the scan did. With Context off, recall remains a silent frame-by-frame scan.

Scanning and Ghost Return are different events. The scan is transient: accepted
Session Current and semantic history remain at the Anchor while a Ghost
Candidate, preview Active Span, and preview Current Neighborhood follow the
frozen read. Cancellation changes nothing and consumes nothing. Releasing a
historical Candidate commits one Ghost transaction, then appends exactly one
Ghost Return from the live Anchor to the Address re-entered, carrying
provenance to the Anchor occurrence, historical occurrence, and scan. A gesture
that returns to its Anchor appends nothing, though Session may retain the ground
crossed.

A Ghost Return has two relations. Backward follows the live predecessor and asks
what led to this re-entry. Forward may resume the historical successors of the
occurrence re-entered and asks what originally followed it. Its continuation
survives Release until an ordinary route withdraws it.

Releasing over a Traversal Prospect is not historical recall and never appends a
Ghost Return. The application reruns canonical Go against the accepted Session.
Only successful Go commits Current, ordinary Neighborhood and Active Span, one
semantic-history entry, and one ordinary Traversal Trace movement; only then is
the selected prospect consumed by exact identity. A refused or cancelled Go
leaves both semantic state and the prospect unchanged. The other Ripple
endpoint remains available.

### 8.5 Native-player accessibility

The container over Center is non-blocking. Only the centered parent-owned Play/Panorama control accepts pointer events; the rest of the overlay does not. Native seek, captions, settings, volume, quality, and fullscreen controls remain pointer-accessible while paused, idle, or playing.

Keyboard focus on a button, form control, menu item, slider, or other native Space owner keeps its native activation. Reader-background `Space` remains the universal playback toggle.

A focused control keeps only the keys it can act on, which is a question about the keystroke and not about the element's tag. Text entry — a text field, a number field, or an editable region — keeps every key while the caret is in it, and `Escape` returns them. Every other control keeps its own activation key and nothing further: a checkbox, a selector, or any other chosen-from control never absorbs an operator letter merely by holding focus. Working in a side panel therefore never disarms the map, and no hotkey requires clicking the Timeline first to revive it. A selector's open list is the browser's own surface and owns the keyboard until it closes.

## 9. Guide lifecycle and persistence

### 9.1 Creation, duplicates, and deletion

Retain Pin retains Current as an explicit Pin. Retain Section retains a positive Active Span using existing exact endpoint Pins when available or creates endpoint Pins. Duplicate identity is determined canonically, not by visual proximity. Duplicate Tag selects the existing object.

Guide renames, Weight changes, Group changes, Pin moves, Section moves, unlink/link, and deletion are ordinary Session transactions and use the same operations from every surface. Deleting the Section targeted by weight relaxation clears that bypass presentation. Deleting a focused Section leaves Focus through the same containing-Range law as other exits.

### 9.2 Chapters

Chapters are transient candidates parsed from offered text. They may be previewed, navigated with Go, composed into a Active Span, or explicitly retained with their title. They never enter Guide persistence, Section Weight, effective projection, or Pin traversal before retention.

### 9.3 Recovery result

Loading Guide data returns an explicit result:

```ts
{
  guide,
  sourcePrefix,
  exact,
  sanitized,
  discardedCount,
  unreadableHigherPriorityRecords,
  quarantineSucceeded,
  safeToRewriteCurrent
}
```

Current version data is inspected before older fallbacks. Every readable candidate is normalized, sanitized against source identity and duration, and validated before use.

If a higher-priority record is unreadable and an older record is valid:

- the unreadable evidence is quarantined under a distinct key before fallback can be rewritten as current;
- preservation is reported only when the quarantine write succeeds;
- failure sets `safeToRewriteCurrent = false` and disables destructive overwrite for that source in the current session;
- a migrated or sanitized Guide is rewritten only when original evidence is safe.

An empty Guide status distinguishes “no saved Guide existed” from “saved data could not be recovered.” Storage read and quarantine-write failures follow the same non-destructive rule.

### 9.4 Persistence boundary

Guide persistence occurs after accepted semantic Guide changes and before a safe source replacement. A failed persistence write is reported. A recovery result that forbids rewrite remains authoritative for the session, even if the in-memory Guide continues to be usable.

Preferences persist separately and do not rewrite source Guide data.

## 10. Source-boundary integrity

### 10.1 Generation-owned loading

Every requested source receives an immutable request:

```ts
{
  generation,
  videoId,
  startSeconds,
  metadataStartedAt
}
```

Generation increments for every request. The YouTube adapter snapshot reports its actual loaded `videoId` when available. Initialization requires all of:

- request generation and video ID still match the current request;
- adapter loaded video ID matches the request;
- duration is finite and positive.

A stale state, duration, or CUED event from source A cannot initialize source B. Metadata retries retain the same immutable generation and identity.

### 10.2 One source-transition boundary

Before chaptering a new identity, one boundary resolves every old-source owner:

- settle or cancel the active Step sequence according to its existing law;
- settle Nudge before its timer can checkpoint;
- cancel Current, Pin, Section, and Range drags to their origins;
- settle old Playback when safe and cancel Context;
- cancel active Ripple, remove its uncompleted batch, and clear all
  source-scoped Traversal Prospects;
- clear native Go, programmatic placement, player-pause claims, and metadata retry;
- close dialogs and Pin-cluster menus;
- persist safe settled Guide changes;
- clear Chapters, Timeline selection, Guide Selection, aligned Pins, Shift layers, direct preview, Panorama runtime, and weight relaxation;
- reset source identity, Session, transport, offers, and physical side sources;
- only then chapter the new source.

Player error and ordinary source replacement use the same boundary. No old Address, retained ID, timer, transport, preview, or history entry may reach the new Session.

## 11. Route convergence

Every visible route is an adapter to one semantic consequence:

- Matrix click and keyboard keys call the same Refine, Reopen, Step, Switch End, Release, Tag, and Focus operations;
- Timeline Pin click and Guide Pin Go call the same exact movement;
- Timeline Section click and Guide Section selection install the same Active Span;
- Timeline and Guide Pin/Section movement call the same Guide kernel operations;
- Timeline wheel, off-map wheel, keyboard, and Guide controls call one Nudge operation and settlement owner;
- typed Address and pointer movement differ only in candidate acquisition and boundary policy, then converge on the same canonical move;
- Tag duplicate detection has one identity rule;
- Group deletion copy and mutation consume one deletion plan;
- geometry, atmosphere, navigation, preview, and Textured Playback consume one effective projection.
- bare Shift-click Ripple and bare click Go consume the same pointer inversion;
- prospect settlement consumes canonical Go and ordinary traversal recording.

Previews are dry runs or pure projections. They cannot maintain parallel target arithmetic. When commit occurs, the same operation that supplied the preview consequence owns the canonical state transition.

## 12. Invariants and completion gate

The following are release invariants:

- source time is the only stored temporal coordinate;
- Range, Current Neighborhood, Active Span, Pins, Sections, Context, and Panorama Frames remain source-contiguous;
- effective Timeline density is always positive;
- source↔Timeline mapping is continuous and invertible;
- at most one Group is drawn, while any number may be active;
- Section Weight is retained Guide state; weight relaxation is transient comparison state;
- all effective spatial consumers agree on one projection;
- the physical matrix has three equal rows and columns, with Tag at row 3 column 2;
- Tag label, preview, availability, key route, and pointer route agree with Shift state;
- Release clears both the semantic residue and Timeline Selection without collateral mutation;
- observation policy is explicit and independent from rate;
- actual playback rate comes from the media adapter;
- Panorama suspension never prevents ordinary Center playback or native controls;
- each gesture owner creates at most one Undo checkpoint;
- source generations and transition boundary prevent cross-source state;
- damaged Guide evidence is never overwritten without successful preservation;
- new Panorama defaults do not overwrite valid saved settings or restrict available settings;
- advanced layers can be ignored without making the ordinary player incomplete.

The complete release proof is a clean locked install followed by:

```bash
npm ci
npm run verify
```

After this gate passes, further work is driven by observed use rather than speculative modes or abstractions.
