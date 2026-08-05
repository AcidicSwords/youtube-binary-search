# Video Cartography — Canonical Specification

## 1. Authority

This document specifies Video Cartography package release **8.0.0**. `package.json` is the release-version authority; the final implementation and its release gates are executable proofs of this specification. A contradiction among code, tests, interface text, and this document is a defect, not an alternative product generation.

The objective is a stable video-comprehension instrument, not an editing suite or framework. Completion preserves these laws:

1. source time remains authoritative;
2. Timeline Space remains positive and invertible;
3. depth comes from composition of small primitives;
4. direct manipulation accepts intuition and resolves to exact canonical state;
5. advanced mechanisms remain optional;
6. ordinary video-player functionality remains intact;
7. operators exclude alternatives and leave one contiguous Working Interval residue;
8. no operation mutates an unrelated state dimension;
9. one semantic consequence has one implementation even when multiple routes reach it.

No derived Timeline coordinate, visual lane, gradient, hover, preview, iframe drift, or transient comparison is source truth.

## 2. State and ownership

### 2.1 Canonical source-scoped state

A loaded Session owns:

- source duration;
- Range;
- Current;
- Resolution and Resolution basis;
- an optional Working Interval with bounds, orientation, and endpoint frames;
- optional Focus and its return Range;
- configured Step Reach;
- Guide version 9 Groups, Pins, Sections, labels, membership, activity, drawn Group, and Section Weight;
- bounded Undo history and Redo future.

The application owns the loaded source identity and the current Session. Guide persistence is keyed by source identity. Session history never crosses a source boundary.

### 2.2 Persisted preferences

Preferences may persist independently from a source:

- Context duration;
- Step Reach mode and values;
- Field Inner Offset, Outer Offset, and breathing-rate spread;
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
- selected Timeline operand and Guide focus;
- selected/aligned Pin indicators;
- Matrix Shift latch, Guide Extend latch, and physical modifier state;
- deformation bypass;
- offered Cues and Cue-lane visibility;
- open panels, dialogs, cluster menus, hover, focus, and preview state;
- Field Frame transition revision, Field Breath phase, and side-player synchronization.

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

### 3.2 Range, Resolution, Current, and Cursor

**Range** is the contiguous source universe currently admissible to ordinary navigation. Full Video is `[0, duration]`. A proper Range excludes at least one full-video boundary.

**Resolution** is an ordered neighborhood `{L, C, R}` with a basis of `range` or `movement`:

```text
Range.start ≤ L ≤ C ≤ R ≤ Range.end
Current = C
```

Refine descends within this neighborhood. Reopen restores `{Range.start, Current, Range.end}`. Step translates a neighborhood by a Timeline-space distance while retaining a valid bounded frame. Direct Go seeds a movement-scale neighborhood from departure to destination.

**Current** is committed semantic position. **Cursor** is observed physical position. Polling Cursor must not rewrite Current. A defined transaction—Go, Step, Refine, or Playback settlement—owns any semantic conversion.

### 3.3 Subtractive Working Interval

Range begins as the admissible universe. Navigation and search exclude alternatives from the current relation. The **Working Interval** is the positive contiguous residue that survives those exclusions.

It stores:

- ordered source bounds `start < end`;
- directed `departure` and `arrival`;
- active side and direction;
- the operator and medium that established it;
- endpoint frames sufficient for Switch Endpoint.

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

Focus installs an acquired Section or Working Interval as Range and saves the containing Range for Unfocus. The focused extent also becomes the viewport, so it fills the drawn Timeline at every Weight.

Viewport changes presentation only. It cannot alter source↔Timeline conversion, Step, Refine, Reach, Weight, or deformation-bypass state. Spatial Range-boundary edits that would change the world defining Focus are refused with a reason. Exact editing of a focused saved Section may rebase that Focus through the Guide’s canonical operation.

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

No Group drawn is valid. Hiding the drawn Group does not promote another Group and does not deactivate it. Therefore landmarks may disappear while their active deformation remains.

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
3. the current deformation bypass.

The same projection supplies:

- source→Timeline and Timeline→source mapping;
- Timeline distance and spatial midpoint;
- Step and Refine metric;
- adaptive Reach;
- hit testing and pointer-to-source drag conversion;
- Range-handle and retained-object spatial movement;
- section and Pin placement;
- spatial readouts;
- exact source-time contours;
- deformation atmosphere contributors;
- optional Dynamic Playback Weight.

An operation or drag captures the projection it begins with. Its geometry cannot change underneath its pointer or repeat sequence. A projection-changing action must wait for, settle, cancel, or refuse an active direct-manipulation owner.

### 4.4 Deformation-bypass law

The only transient bypass state is:

```ts
type DeformationBypass =
  | null
  | { kind: "all" }
  | { kind: "section"; sectionId: string };
```

`X` invokes **Toggle Deformation**:

- an acquired Timeline Section resolves scope `{kind: "section", sectionId}`;
- any other selection state resolves `{kind: "all"}`;
- the same resolved active scope restores deformation;
- a different scope transfers the single bypass;
- the command changes no stored Weight, Guide state, player setting, history, or persisted preference.

Guide focus alone never supplies the Section scope. Bare Timeline Go clears the acquired operand before navigation, making complete-map scope directly reachable.

The bypass is source-scoped. Source replacement clears it. Deleting its target clears it. An invalid target self-clears. Group visibility or activity changes do not mutate it. Undo and Redo do not own it. Release preserves it.

An active Current, Range, Pin, or Section drag causes `X` to refuse safely. Pending Step and Nudge settle before the projection changes. Active playback continues. `X` issues no direct media command; an explicitly dynamic playback may request a new rate later because its policy reads the changed effective projection.

### 4.5 Atmosphere and contours

The deformation atmosphere is derived only from `projection.weightedSections` or an equivalent effective-contributor output. It never rereads raw active Guide weights independently.

- Weight below `1×` contributes violet compression influence.
- Weight above `1×` contributes teal expansion influence.
- Hue states sign; log-magnitude states peak strength; source span diffuses the influence; each contribution fades beyond its bounds.
- Overlap composes in log space, matching multiplicative geometry.
- Contours begin at uniform source increments and are projected through the exact map. Their screen spacing is metric evidence.

With complete-map bypass, segments are identity, contours are evenly spaced, no compression or expansion class is present, and no colored atmosphere remains. Stored Section wires and Guide Weight values remain visible and unchanged. With a Section bypass, only that contribution disappears; overlapping effective Sections remain.

## 5. Operator grammar

### 5.1 Exact matrix

The visible, physical, keyboard, preview, and documented matrix is exactly:

```text
Q  Refine Backward    W  Reopen            E  Refine Forward
A  Step Backward      S  Switch Endpoint   D  Step Forward
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
| `switch-endpoint` | `S` | Switch Endpoint | unchanged |
| `step-forward` | `D` | Step Forward | Next Pin |
| `release` | `R` | Release | unchanged |
| `tag` | `T` | Tag as Pin | Tag as Section |
| `focus-toggle` | `F` | Focus / Unfocus | unchanged |

Toggle Deformation is an auxiliary `X` action inside Operators and outside the square matrix. Weight is edited on its Section in Guide.

### 5.2 Shift ownership

Three inputs may supply Shift semantics:

- physical Shift is global for the current action and consumes no latch;
- the Matrix Shift latch belongs only to Matrix Refine, Step, and Tag;
- Guide Extend belongs only to Guide/Cue composition.

Only the matching latched owner may be consumed, and only when that latch actually supplied a modified action:

```js
consumeShiftLayer(owner)
```

An unrelated plain action preserves both latches. Matrix and Guide cannot consume one another. Source transition clears both.

### 5.3 Refine Backward / Refine Forward

Refine targets the Timeline-space midpoint from Current toward the corresponding Resolution side and descends to finer Resolution. It uses the effective projection.

Plain Refine retains the Working Interval departure while the target remains on the same traversed side and the departure remains outside the new Current-to-target movement. A reversal that reaches or crosses the retained departure draws the complete immediate movement instead.

`Shift+Q` and `Shift+E` perform **Local Refine**. Local Refine uses the same midpoint but always retains the immediate Current-to-target traversal. Refine changes neither Guide topology nor Weight.

### 5.4 Reopen

Reopen sets Resolution to `{Range.start, Current, Range.end}` and basis to Range. It preserves Current, Working Interval, Focus, Guide, Weight, selection, and deformation bypass. It is unavailable when Resolution already spans Range.

### 5.5 Step Backward / Step Forward

Step moves a configured distance through Timeline Space using the effective projection. The target is clipped to Range. The source-time displacement therefore varies with density while the requested map distance remains stable.

Reach may be:

- fixed directional Timeline units, linked by the interface for symmetric ordinary use; or
- adaptive `1/32`, `1/16`, or `1/8` of the active Range’s effective Timeline width.

Adaptive Reach recomputes when Range, Weight, activity, or bypass changes. Fixed Reach does not.

Pressed, held, repeated, and quickly tapped routes use one Step gesture owner. Current and physical players move immediately; history and automatic Context settle once. A reversal retains the transient visited envelope as specified in §3.3.

Shifted Step traverses to the previous or next visible Pin stop or synthetic Range boundary. It uses Step’s same Working Interval and endpoint-frame law; it is not a separate Go operation.

### 5.6 Switch Endpoint

Switch Endpoint requires a Working Interval. It makes the opposite bound Current, flips the active side and orientation, and restores the Endpoint Frame owned by that bound. It preserves the Interval extent, Range, Guide, Weight, Focus, and bypass.

### 5.7 Release

Release clears:

- the Working Interval, if present;
- the acquired Timeline operand.

It preserves Current, Resolution, Range and Focus, Guide focus, Pins, Sections, Groups, Weight, deformation bypass, Field preferences, and playback preferences.

Clearing a semantic Working Interval creates one Undoable Session transaction. Clearing only presentation selection succeeds without history.

### 5.8 Tag

Tag has exactly two forms:

```text
T         Tag as Pin      operand: Current
Shift+T   Tag as Section  operand: Working Interval
```

The visible label follows physical or Matrix Shift state, never the accidental presence of a Working Interval:

- unshifted label: `Tag as Pin`;
- unshifted metadata: `Current <Address> → Pin`;
- shifted label: `Tag as Section`;
- shifted metadata: `<Working Interval> → Section`.

Plain Tag remains available while an Interval exists and still retains Current as a Pin. Shifted Tag is disabled without a positive Working Interval. An exact duplicate creates no second object or history; it selects and reports the existing Pin or Section. A newly retained Section enters the currently drawn Group, falling back to the ordinary default Group when none is drawn.

Before retention the source object is always called a Working Interval. Section names only the retained result.

### 5.9 Focus / Unfocus

Focus chooses an acquired Timeline Section when available, otherwise a positive Working Interval. It installs that extent as Range and viewport and stores the containing Range. Current remains if already inside; otherwise it moves to an effective spatial midpoint. Focus changes neither Weight nor deformation bypass.

Unfocus restores the containing Range and a valid Current. Focused spatial boundary edits that cannot be represented truthfully are refused rather than approximated.

### 5.10 Go

Go commits an exact known source Address, seeds movement-scale Resolution, and leaves the positive departure-to-arrival residue. Bare Timeline ground performs Go only within Range and clears the acquired Timeline operand first. Pin activation performs the same canonical movement while acquiring that Pin.

A Guide destination outside a focused Range may leave Focus or open Full Video as part of one reported transaction so the exact retained Address becomes admissible. Go to the existing Current is a no-op; Reopen is the explicit way to discard local scale at the same Current.

### 5.11 Undo and Redo

Every semantic operator commits the smallest complete transaction. Undo restores the checkpoint immediately before it; Redo restores the displaced state. A new semantic transaction clears the Redo future.

Metadata-only presentation, deformation bypass, panel state, previews, Cues, transport ticks, rate events, Field Breath, and playback wraps do not enter Session history. A changed Guide transaction is persisted after acceptance when recovery permits safe writing.

## 6. Selection and direct manipulation

### 6.1 Selection domains

`selectedRetained` is the acquired Timeline operand. `guideRetained` is Guide focus. Timeline acquisition also focuses the matching Guide row; Guide focus alone does not manufacture a spatial operand.

If a Working Interval’s endpoints align with Pins, every visible aligned Pin is indicated. If the acquired exact Section supplies the extent, its two endpoint identities are known and selected. Geometry alone never chooses one identity arbitrarily from coincident Pins.

Visual channels remain independent:

- quiet marker for identity;
- background fill for acquired Timeline operand;
- inset edge for Working Interval relation;
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
| Section wire middle | make the Section the Working Interval and center Current spatially | translate its two endpoint Pins |
| Range boundary | keyboard or pointer acquisition | change Range when Focus permits |

Section wire roles come from its end regions and middle. The Timeline does not draw redundant Start/midpoint/End node controls.

A click that does not cross the drag threshold remains a click. Drag settlement suppresses the synthetic trailing click. Each gesture captures its origin model, history, future, and effective projection; cancellation restores that origin exactly.

Pin and Section manipulation previews through the Field. A Pin uses its Step neighborhood; a Section uses its Start, midpoint, and End. Working Interval bounds that coincide with a moved Pin follow the same canonical Pin transaction.

### Current drag and Nudge as Step

Dragging Current is Step, not Go. Pointer movement changes only a candidate and Field preview; Session Current remains at departure until commit. Release converts the source candidate into an equivalent effective Timeline distance and commits one Step gesture. A stationary press is a no-op. Cancellation restores the origin.

This law preserves the established residue: moving Current extends or shortens the same traversal instead of inventing a fresh neighborhood around the landing point. Bare Timeline Go is the distinct route for that goal.

### Nudge

Nudge is one source-time operation reached by Timeline wheel, off-map wheel, keyboard comma/period, and Guide decrement/increment controls.

The target rule is:

- over Timeline, the exact Pin or Section under the pointer; bare map targets Current;
- elsewhere outside form controls, the acquired Timeline operand; absent one, Current.

Shift-wheel selects the dominant of `deltaX` and `deltaY`. Wheel right or up moves forward; left or down moves backward. High-resolution deltas accumulate until the quantum threshold is crossed, and one event may produce multiple quanta. Browser default is prevented only after a valid target is acquired.

Nudge Current invokes Step law while preserving a configured source-time quantum. Nudge Pin and Nudge Section invoke the same Guide movement operations as direct manipulation. One wheel series or held repetition creates one Undo transaction after its settlement timer.

When the adapter proves an exact frame duration, that duration is the quantum and the interface may call it a frame. Otherwise the configured source-time quantum is reported honestly.

### Exact Guide editing

Guide Address fields accept finite seconds or valid `MM:SS` / `HH:MM:SS` timecode. Non-leading timecode fields must be below 60. Exact Address fields reject anything outside
Range, any collapsed/reversed Section geometry, and any invalid structural relation. They never silently substitute a boundary value for the typed value.

Typing a valid candidate may preview it through the same Field Frame as a drag. Commit routes through `moveGuidePin` or `moveGuideSection` and one checkpoint. Guide decrement/increment controls route through Nudge and repeat while held.

### 6.3 Guide composition and Carry

A plain Guide click replaces the working relation with the clicked Pin or Section. Physical Shift or Guide Extend grows the current Working Interval to the minimum contiguous extent containing the selected Cue, Pin, or Section. Composition stores the resulting extent, not an object set.

Alt with a spatial navigation operator may Carry the acquired Timeline Pin or Section by the same effective Timeline-space displacement as Current. Structural and source bounds clip or refuse the retained-object movement without changing the underlying navigation law. Carry is optional and creates no second operator family.

## 7. Panoramic Phase Field

### Field Frame

The Field Frame is the stable Tail–Center–Lead presentation outside ordinary Panorama playback. It is a projection of canonical or direct-manipulation state, never a second semantic model.

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
4. ordinary playback hands presentation to Field Breath rather than Field Frame.

Operator Frames use the effective projection:

- Step, Pin, Go, and fallback: the configured backward Step destination, Current, and forward Step destination;
- Refine Backward/Forward and Local Refine: the next directional Refine targets around Current;
- Reopen: the directional midpoints available from the reopened Resolution;
- selected Section: Start, the active midpoint, and End while Current owns that relation.

Direct Pin editing uses the Step neighborhood around its candidate Address. Direct Section endpoint or whole-Section editing uses candidate Start, midpoint, and End.

#### Slideshow transitions

One sequencer owns settled Frame identity and revision. A new semantic movement may produce one directional transition: forward movement reads toward Lead; backward movement reads toward Tail. Semantic state commits before this presentation cue.

Republishing the same Frame does not create another transition. A moving Context Cursor does not change the identity of its fixed-edge Frame. Reduced-motion preference may remove the visual transition without changing any Frame Address.

#### Persistent Context framing

When Context duration is positive, Context owns Tail and Lead before, during, and after its Center transport. Its source-contiguous window is centered on Current and each side clips independently at Range; unused duration on one side is not moved to the other.

Tail is the first Context Address, Lead is the last, and Center is Current while idle or Cursor while running. Starting, pausing, stopping, or settling Context does not reassign the edges. Setting Context duration to zero returns ownership to operator framing.

### Field Breath

Field Breath is the live Tail/Lead relation during ordinary Panorama playback. Its configured relation is:

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

During contraction the side roles exchange. A side reaching a boundary first follows Center at Center rate while preserving the attained offset. When every operational side reaches the same boundary, the phase reverses. A collapsed, hidden, unavailable, or Range-clipped side is excluded from this synchronization barrier. If a side has less room than Inner Offset, the minimum is not reduced; the side is parked within available room and does not breathe.

Hold freezes attained offsets, clears waiting state, and places held sides at Center rate without rewriting the configured bounds or phase direction. Stretch resumes from that exact relation. Field Hold and Breath phase create no Session checkpoint.

Field runtime suspends while Context, pending Step, direct manipulation, or an incompatible Playback policy/actual rate owns observation. Stale side-player events cannot revive a hidden, collapsed, unavailable, or superseded side.

## 8. Context and Playback

### 8.1 Context transport

Context is transient source-contiguous Center observation around a semantic anchor. It plays at `1×` from its clipped start toward its clipped end, leaves Current unchanged, and keeps the Context Field Frame stable. A following semantic command may replace it without creating an intermediate history entry.

Context duration and Field offsets are independent. Similar numeric displacement does not create shared state ownership.

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
observationPolicy = center-only
ratePolicy = configured fixed wish or dynamic
```

Observation policy does not derive from numeric rate. A fixed Shift wish that resolves to `1×` remains Center only.

A native Center Play event may create an ordinary Panorama Playback session at the adapter’s actual native rate. If that actual rate is incompatible with the fixed side relation, the Field suspends; ordinary Center playback continues.

### 8.3 Rate authority

Three rate facts remain distinct:

- **wish** — persisted fixed intent, or the dynamic inverse target;
- **requested** — the nearest currently offered rate sent to the adapter;
- **actual** — the rate confirmed by the adapter’s playback-rate event.

The actual-rate event updates only transport runtime and Field availability. It creates no new semantic Playback transaction.

Fixed wishes resolve against positive offered rates in logarithmic distance, because rate distance is multiplicative. An exact tie prefers the offer nearer `1×`, then a deterministic numeric tie. If available rates expand, the fixed wish is retained and an active fixed Shift playback retunes when a closer offer appears.

Dynamic Playback requests:

```text
wish = 1 / effective Weight at Current
```

The inverse is unconstrained. The media adapter’s offered rates provide the real bounds. Dynamic Playback is Center only and is the sole playback mode that reads effective projection Weight.

### 8.4 Retry, wrap, and settlement

Retry preserves the active observation and rate policies, re-resolves the current offer, and does not reset to `1×`.

A proper-Range wrap:

1. rebases the same transport at Range Start;
2. preserves observation policy;
3. resolves the stored fixed wish again or derives Dynamic Playback Weight at Range Start;
4. requests that rate;
5. preserves Panorama availability or suspension from explicit ownership and actual compatibility;
6. adds no history.

No stale pre-retune transport object may own the wrap.

Playback settlement uses the transport’s departure, parent Resolution, return model, current Cursor, and completed cycles to commit at most one semantic transaction. Watched coverage extends or preserves existing Working Interval coverage and never shortens it. A completed proper-Range cycle covers the Range. Full-video playback stops at source end.

### 8.4b Ghost Traversal and user time

Video Cartography distinguishes four temporal orders: source time, Timeline Space, semantic history, and user time — the order in which the reader actually encountered source Addresses. Only the fourth records where the reader has been, as opposed to what the world was.

User time is an append-only, source-scoped ledger of traversal records. A record holds directed units: a jump has only the two Addresses occupied, while a span was continuously observed and may be recalled at any Address inside it. A route writes to it when the reader comes to occupy a different Address; editing the world without moving — renaming, reweighting, creating a Pin, toggling a Group — writes nothing, and programmatic placement never writes.

Ghost Traversal is held `G` plus the wheel. Arming costs nothing: no Anchor, no history, no settled playback. The first wheel quantum settles pending work, captures Current as a fixed Anchor, and freezes the projection, the effective Step Reach and the readable extent of the stream, so the gesture reads a world that cannot change underneath it and can never follow its own output.

Each quantum moves a read cursor one occurrence backward or forward through user time and applies the recalled Address as an amendment against one captured origin. Backward and forward name directions in user time; either may move either way through source time. Watched spans are subdivided by the frozen Step law, so expanded ground yields finer recall while the watched boundaries stay exact. An Address the active Range excludes is unavailable rather than clamped, and Ghost never leaves Focus, widens Range, or opens Full Video to reach one.

Ghost restores no historical Pins, Sections, Groups, Weights, titles, visibility, Focus, Range, Step Reach, deformation state or Guide selection. What it produces is an ordinary Working Interval between the Anchor and the recalled Address, so Switch Endpoint, Tag, Release and Focus act on it exactly as they would on any other.

Where automatic Context is enabled, each recalled Address plays: the stop condition for a recall is recognition, and a still frame is a poor thing to recognise a moment from. Successive candidates retarget one Context window rather than opening a new one, so the window follows the wheel instead of being torn down and rebuilt at every notch. A window superseded or run out during the scan is search and writes no observation; only the one still running when the gesture ended was watched, and it joins the path as observed source time on its own terms. Escape stops it with everything else the scan did. With Context off, recall remains a silent frame-by-frame scan.

Scanning and injection are different events. The scan is transient: it inspects prior user time and is never written as a path, because copying the search motion into the stream mirrors paths already in it. Releasing appends exactly one occurrence — a jump from the live Anchor to the Address re-entered — carrying provenance to the Anchor occurrence, to the historical occurrence re-entered, and to the scan as evidence. A gesture that returns to its Anchor appends nothing, though the Session may still retain the ground crossed. The whole gesture commits as one semantic transaction; one Undo returns to the Anchor with all structure intact.

An injected occurrence has two relations, and direction chooses between them. Backward follows the live predecessor and asks what led to this re-entry. Forward may resume the historical successors of the occurrence re-entered and asks what originally followed it. The choice is made once, from the direction the gesture opens with, and reversing the wheel afterwards retraces the cursor already chosen rather than switching streams mid-gesture. A gesture begins only once a whole wheel quantum is earned, so input below the threshold settles nothing and captures no Anchor. A gesture that returns to its Anchor retains the positive extent it crossed, on the same principle as Step Reversal. The historical read cursor survives Release, so severing the Working Interval and Ghosting forward replays the recalled point's original successors as a newly informed traversal.

### 8.5 Native-player accessibility

The container over Center is non-blocking. Only the centered parent-owned Play/Panorama control accepts pointer events; the rest of the overlay does not. Native seek, captions, settings, volume, quality, and fullscreen controls remain pointer-accessible while paused, idle, or playing.

Keyboard focus on a button, form control, menu item, slider, or other native Space owner keeps its native activation. Reader-background `Space` remains the universal playback toggle.

A focused control keeps only the keys it can act on, which is a question about the keystroke and not about the element's tag. Text entry — a text field, a number field, or an editable region — keeps every key while the caret is in it, and `Escape` returns them. Every other control keeps its own activation key and nothing further: a checkbox, a selector, or any other chosen-from control never absorbs an operator letter merely by holding focus. Working in a side panel therefore never disarms the map, and no hotkey requires clicking the Timeline first to revive it. A selector's open list is the browser's own surface and owns the keyboard until it closes.

## 9. Guide lifecycle and persistence

### 9.1 Creation, duplicates, and deletion

Tag as Pin retains Current as an explicit Pin. Tag as Section retains a positive Working Interval using existing exact endpoint Pins when available or creates endpoint Pins. Duplicate identity is determined canonically, not by visual proximity. Duplicate Tag selects the existing object.

Guide renames, Weight changes, Group changes, Pin moves, Section moves, unlink/link, and deletion are ordinary Session transactions and use the same operations from every surface. Deleting the Section targeted by deformation bypass clears that bypass presentation. Deleting a focused Section leaves Focus through the same containing-Range law as other exits.

### 9.2 Cues

Cues are transient candidates parsed from offered text. They may be previewed, navigated with Go, composed into a Working Interval, or explicitly retained with their title. They never enter Guide persistence, Section Weight, effective projection, or Pin traversal before retention.

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

Before cueing a new identity, one boundary resolves every old-source owner:

- settle or cancel the active Step sequence according to its existing law;
- settle Nudge before its timer can checkpoint;
- cancel Current, Pin, Section, and Range drags to their origins;
- settle old Playback when safe and cancel Context;
- clear native Go, programmatic placement, player-pause claims, and metadata retry;
- close dialogs and Pin-cluster menus;
- persist safe settled Guide changes;
- clear Cues, Timeline selection, Guide focus, aligned Pins, Shift layers, direct preview, Field runtime, and deformation bypass;
- reset source identity, Session, transport, offers, and physical side sources;
- only then cue the new source.

Player error and ordinary source replacement use the same boundary. No old Address, retained ID, timer, transport, preview, or history entry may reach the new Session.

## 11. Route convergence

Every visible route is an adapter to one semantic consequence:

- Matrix click and keyboard keys call the same Refine, Reopen, Step, Switch Endpoint, Release, Tag, and Focus operations;
- Timeline Pin click and Guide Pin Go call the same exact movement;
- Timeline Section click and Guide Section selection install the same Working Interval;
- Timeline and Guide Pin/Section movement call the same Guide kernel operations;
- Timeline wheel, off-map wheel, keyboard, and Guide controls call one Nudge operation and settlement owner;
- typed Address and pointer movement differ only in candidate acquisition and boundary policy, then converge on the same canonical move;
- Tag duplicate detection has one identity rule;
- Group deletion copy and mutation consume one deletion plan;
- geometry, atmosphere, navigation, preview, and Dynamic Playback consume one effective projection.

Previews are dry runs or pure projections. They cannot maintain parallel target arithmetic. When commit occurs, the same operation that supplied the preview consequence owns the canonical state transition.

## 12. Invariants and completion gate

The following are release invariants:

- source time is the only stored temporal coordinate;
- Range, Resolution, Working Interval, Pins, Sections, Context, and Field Frames remain source-contiguous;
- effective Timeline density is always positive;
- source↔Timeline mapping is continuous and invertible;
- at most one Group is drawn, while any number may be active;
- Section Weight is retained Guide state; deformation bypass is transient comparison state;
- all effective spatial consumers agree on one projection;
- the physical matrix has three equal rows and columns, with Tag at row 3 column 2;
- Tag label, preview, availability, key route, and pointer route agree with Shift state;
- Release clears both the semantic residue and acquired Timeline operand without collateral mutation;
- observation policy is explicit and independent from rate;
- actual playback rate comes from the media adapter;
- Panorama suspension never prevents ordinary Center playback or native controls;
- each gesture owner creates at most one Undo checkpoint;
- source generations and transition boundary prevent cross-source state;
- damaged Guide evidence is never overwritten without successful preservation;
- new Field defaults do not overwrite valid saved settings or restrict available settings;
- advanced layers can be ignored without making the ordinary player incomplete.

The complete release proof is a clean locked install followed by:

```bash
npm ci
npm run verify
```

After this gate passes, further work is driven by observed use rather than speculative modes or abstractions.
