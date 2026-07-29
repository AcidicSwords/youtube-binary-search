# Binary YouTube Reader — Canonical Implementation

## 1. Architecture

```text
user action or player event
→ settle incompatible transient runtime
→ Session transaction or physical transport
→ adapter effect
→ measured state
→ one truthful DOM projection
```

Semantic truth is immutable Session state. Physical player commands are requests. No callback may privately mutate Guide or Undo history.

## 2. Ownership

| Module | Ownership |
|---|---|
| `range-geometry.js` | pure Range, Resolution, Neighborhood, Step, preview geometry |
| `temporal-projection.js` | pure Source Time ↔ Traversal Time mapping, visible Fold frontier, materialization |
| `session.js` | semantic transactions, endpoint frames, Interval creation/editing, directional Offset normalization, Undo |
| `transport.js` | transient Context, native playback, and frozen Loop values |
| `youtube.js` | sole raw YouTube IFrame API boundary |
| `step-field-geometry.js` | pure Field bounds, phases, and rate policy |
| `step-field.js` | Tail/Lead players, Hold/Stretch runtime, side Step payloads |
| `step-gesture.js` | shared pointer/key Step press, deterministic repeat cadence, release boundary |
| `guide.js` | Pins, Sections, Focus references, migration, validation |
| `source-field.js` | normalized external temporal records |
| `view.js` | DOM projection and control availability |
| `app.js` | composition, persistence, lifecycle, operator wiring |

## 3. Session model

```js
{
  duration,
  range,
  resolution,
  resolutionBasis,
  focus,
  interval,
  stepReach: { backward, forward, linked },
  guide
}
```

`focus` is either `null`, a retained-Section reference plus `returnRange`, or a Working Section Extent plus `returnRange`. The latter is Session-only and never serializes into Guide.

`stepReach` is the persisted maximum Field Offset and default Step distance. Runtime no longer broadens this API to accept obsolete scalar values; legacy preference migration normalizes at the persistence boundary.

The Interval is directed even though it renders as an ordered extent:

```text
Interval.departure = fixed anchor
Interval.arrival = active endpoint = Current
Interval.departureFrame = Resolution/basis retained at the anchor
Interval.arrivalFrame = active Resolution/basis at Current
```

Operator ownership is explicit. Direct Go and Pin traversal replace Interval with their actual movement. Step and settled playback preserve a usable existing departure and edit only arrival. Refine derives its Interval departure from destination membership: a midpoint inside the current ordered extent retains `Interval.departure` and shortens the Loop, collapsing it at exact endpoint coincidence; an exterior midpoint uses preceding Current and replaces the Loop with the complete new traversal. `moveDraft()` keeps movement departure separate from `intervalDeparture`, so this relation is explicit in the transaction rather than selected by a hidden mode.

`stepNeighborhood()` retains the gesture-origin binary frame, leaves the receding endpoint fixed, and advances the approached endpoint by the signed Step. When the destination reaches or crosses the old directional endpoint, it retains `Current ± stepReach`, clamped to Range. `translateNeighborhood()` applies the same one-sided rule to playback and Pin hops. Scale deformation resets refinement lineage. Full-Range geometry is canonicalized to Range basis, so Session and view share one Reopen predicate.

Every commit runs one containment postcondition:

```text
Interval ⊆ active Resolution ⊆ Range
Interval ⊆ departure endpoint frame
Interval ⊆ arrival endpoint frame
```

`containExtent()` expands only a bound that fails that relation and never moves Current or changes Interval. This repairs legacy/narrow endpoint frames without letting Switch Endpoint sacrifice the Loop it transposes.

`getTargets()` never advertises a movement that `moveDraft()` will reject at the 40 ms identity floor. When a half-side midpoint is no longer distinct, that direction becomes unavailable; it does not substitute the endpoint, because every successful Refine must leave Current centered in its child Neighborhood. A later linear endpoint push can restore useful scale.

`switchEndpoint()` captures the active frame being left, restores the retained departure frame, swaps directed departure/arrival and their frames, and preserves ordered `start/end`, provenance, medium, and creation time. Restored frames are normalized to contain the unchanged Interval. It is an involution over semantic state. Range changes defensively rebase any endpoint frame that no longer fits the sole hard bound.

Every movement transaction compiles `projectionForModel()` once for its source model and passes its metric into Range geometry. `range-geometry.js` stays fold-agnostic: optional `toCoordinate` and `fromCoordinate` functions change distance, midpoint, and inverse affinity while preserving the existing operator algorithms. Identity projection is the exact v5.8.6 behaviour.

At a visible Fold Point, `switchEndpoint()` has one additional relation before ordinary transposition: it toggles the active source endpoint between the near and far Fold faces. `forceInterval` bypasses that relation for `Shift+S`.

Guide geometry changes are semantic transactions too. Fold/Expand, endpoint drag, collapsed-Section translation, and modifier carry clone Guide once, validate the result, reconcile a focused Section if necessary, and create one Undo checkpoint. A `projectionChanged` result tells composition to rebase the physical Field once without treating the topology change as a Current movement.

## 4. Temporal projection

`temporal-projection.js` is the only owner of contracted traversal. Canonical Session and Guide values never leave Source Time.

```text
Guide Sections + retained collapsed flags
→ collapsedFrontier()
→ disjoint top-level source fibers
→ sourceToTraversal() / traversalToSource(affinity)
→ one metric shared by Session, Field, Context, and View
```

The collapsed frontier is laminar. A collapsed ancestor suppresses descendants from the visible frontier without changing their stored flags. Equal extents share one contraction and one timeline proxy while retaining their Section identities; activating that proxy expands the coincident group in one transaction. Crossing collapsed extents and adjacent collapsed siblings are rejected by Guide validation because both would make inverse faces ambiguous. Persisted conflicts recover the later Section expanded rather than discarding either relation.

`projectionForModel()` adds temporary materialization:

- the focused retained Section and every containing Fold;
- any Fold whose interior is cut by Range, a Resolution edge, or an Interval endpoint;
- explicit source extents supplied by playback, Context, or Loop presentation.

Materialization changes only one compiled projection. It never writes `section.collapsed`. Playback therefore expands its path on screen without creating history or modifying Guide. Settlement returns to the retained frontier unless the settled Resolution, Range, or Interval still cuts a folded interior; that exact semantic cut remains materialized until a later transaction removes it. Current itself may remain an exact latent source Address at the Fold Point, so Focus→Leave can restore the parent topology without manufacturing a cut.

At an inverse Fold Point, backward affinity returns `start` and forward affinity returns `end`. That rule gives Step, Refine, timeline clicks, Field offsets, and Pin traversal one predictable face choice. A forward Pin hop returns the far end face and a backward hop returns the far start face, making membership of the complete source Section automatic.

## 5. Transport model

`transport.js` exposes:

```text
idle | context | playback | loop
```

- Context stores an anchor and a bounded observation window split equally around it, with each half clipped independently by Range.
- Playback stores departure, parent Neighborhood/basis, the active Interval anchor, and Undo model until physical settlement. `projectPlayback()` derives the live Current, Resolution, and Interval without history; `completePlayback()` commits that same projection. Settlement moves that active endpoint, pushes only the approached refinement bound, and merges any intervening Held Offset and Guide state into the checkpoint so history order remains compositional.
- Loop stores an immutable start/end/source snapshot and a cycle count.

Loop wraps use adapter placement directly and never call a Session movement transaction. Playback settlement uses `completePlayback()` exactly once. Starting matrix Loop settles any live playback projection before reading the Working Section, then hands Center directly to the frozen Loop without an intermediate pause. Each wrap resolves before the Field poll, and `resumeAt()` rebases the existing physical relation once.

Transport values remain source-contiguous. Context windows use the projection to step half their configured duration on each side in Traversal Time, then store the resulting source start/end. Playback and Loop retain raw source operands. `transportMaterializedExtents()` is the shared presentation owner: ordinary playback and Loop expand the complete active Range for Center and both Field sides; a retained Section Loop outside that Range also expands its frozen source operand. Center-only Context exposes its frozen source extent. Neither transport polling nor the YouTube adapter contains Fold-specific skipping.

## 6. Center lifecycle

While Context is idle, a trusted parent-page Center click or Space command first establishes a starting playback transport, refolds each available side to the physical Center, primes it at `1×`, and calls Tail, Lead, and Center playback synchronously. A native Center `PLAYING` event begins the transport when no parent request already owns it. An application pause records the exact logical transport it intends to stop; if Pause arrives before the iframe confirms `PLAYING`, the pending transport reissues that owned command on confirmation. Replacement actions retain a cancellation claim over that late confirmation while proceeding with their own placement. A replacement Context adopts the next confirmation at its newly placed address, so a superseded cancellation cannot pause it. Matching `PAUSED` settles immediately, while stale programmatic pause events cannot stop a newer transport. Settlement captures the latest side offsets once:

- Context restores committed Current.
- Loop ends without committing internal wraps.
- Playback calls `completePlayback()`.

Programmatic placement has a grace record so delayed iframe reporting cannot be mistaken for a native scrub.

Playback-to-Loop is a direct handoff: the old transport is settled without issuing a pause that could arrive after the new play request. Space or the Center surface during Context instead pauses at the physical Cursor and commits it through Session `completePlayback()` as `contextAccept`. Reusing the continuous projection preserves the receding Resolution endpoint and the Working Section’s opposite endpoint while moving their approached endpoints to the accepted Current; it does not seed a direct-Go frame from the short observed crossing. The normal completion path still restores the Context anchor without history.

## 7. Automatic Context

`applyPlayerEffect()` receives a changed Session result. When the result includes an Interval and Context duration is non-zero, it translates the complete Field to the new Current, parks the sides without remeasurement, and starts Center-only Context. Otherwise it places Center and the translated Field at Current.

Pending rapid Steps suppress intermediate Context and invoke it once after coalescing. `step-gesture.js` centralizes initial delay, repeat cadence, and tap-settlement timing for Arrow keys, matrix buttons, side buttons, and side-player surfaces. Pointer/key down commits the first Step immediately, an application timer owns held repetition, and every repeat immediately places Center while translating the complete Field. Release completes one held transaction and one optional Context window. Quick pointer or keyboard taps inside the settlement boundary amend that same transaction. Pointer capture has a document-level release fallback; focused controls use the same key-down/key-up lifecycle; browser key repeat is ignored. Blur, pointer cancellation, or hidden-document settlement commits the final Step without autoplay.

Context duration is normalized to `0–300s`. `deriveContextWindow()` steps half that duration backward and forward through the shared projection, then clips each side independently to Range. It never reallocates a clipped half across the traversal point. Crossing a Fold expands the resulting source window to include that complete Section; Center plays it normally. Changing duration during active Context replaces only this centered transient window and placement; it reuses the already-suspended Field without a pause/play cycle.

## 8. Step Field runtime

Side players are created lazily only when enabled and visible. They are always muted, control-free, and removed from keyboard and accessibility traversal.

Each side runtime owns:

```js
{
  mode: "held" | "stretching",
  offset,
  progressOffset,
  targetOffset,
  desiredAddress,
  lastPlacedAddress,
  requestedRate,
  desiredRate,
  actualRate,
  availableRates,
  playback,
  ready,
  activated,
  rateAvailable,
  blocked,
  error,
  retrySource
}
```

Every ordinary play calls `beginStretch()` for each available side. It records the prior relation, resets physical offset to zero, places or cues the side at Center, requests `1×`, and starts it in the same trusted gesture as Center. Only after the side reports playback does the controller inspect that iframe’s own rate menu and request the nearest valid directional rate. `onPlaybackRateChange` and adapter snapshots own actual rate; requests are retried with throttling until confirmed.

Paused sides retain a desired address. After first activation, parking uses seek plus pause so each pane displays the represented video frame rather than reverting to a source thumbnail. Pre-activation parking cues the source and requests frame placement; any transient muted playback is immediately paused. Held sides run at `1×` with drift correction while Center runs and park exactly when Center pauses.

Holding emits measured offsets to `app.js`, which may commit them through Session `setStepReach()`. It never mutates Session Interval. Context parks the existing relation around semantic Current without measuring against its transient Cursor. Hold/Stretch is unavailable while the Field is suspended, so a Context cursor, Range drag, or pending Step cannot be mistaken for a new measured relation.

Side selection exposes a Step payload only. `app.js` binds every Step surface through `step-gesture.js`, commits through the same `performStep()`, preserves the pending Interval anchor, and translates the complete Field around the new Current before Center-only Context. The Field controller does not own Step DOM events.

Field Offset is measured in Traversal Time. `step-field-geometry.js` and `step-field.js` use the same projection for targets, measured offsets, Hold, Stretch, and translation, while every physical side placement remains a source Address. During source-contiguous playback the active transport materializes its path before the Field snapshot is derived, so side clocks never jump over folded source material.

Pane collapse is projection-local. Hiding a side pauses it immediately without re-establishing its sibling; restoring a side establishes only that projection. A media error retains the reusable adapter; restoring that pane sets `retrySource`, while a video load resets both side sources so reloading the same video can recover. Combined Hold/Stretch derives its state and targets from visible roles. Tail control order mirrors Lead around Center.

## 9. Guide integration

The current Interval is projected as a semi-persistent Working Section. `focusWorkingSection()` stores a frozen focus Extent plus the containing return Range, installs that Extent as Range, and does not edit Guide. `leaveSection()` restores the containing Range while Session retains the latest Working Section.

Guide tabs own explicit persistence and management:

- Pins tab: title + Pin Current, then Go/Select/Rename/Delete.
- Sections tab: source extent + title + Save and Focus Working, then Go/Focus/Loop/Fold or Expand/Overwrite/Rename/Delete.

The third Section source is exactly two selected Pins. Creation reuses those Pin identities instead of copying their timestamps. Section endpoints remain shared objects: moving one endpoint deforms every Section reference.

Expanded Sections render their two endpoint Pins, one coloured span, and a faint midpoint Fold control. Collapsed Sections render one coloured Section Pin. `setSectionCollapsed()` accepts only laminar collapsed topology. `collapsedFrontier()` hides all Pins spatially contained by an active Fold from timeline and Previous/Next Pin traversal, while Guide retains and labels those records.

`movePin()` preserves the ordering of every Section that references the Pin. `translateSection()` moves both Section endpoints and all spatially contained Pins as one subtree, then `validateGuide()` rejects any collapsed crossing or adjacent-sibling collision created by the candidate geometry. Range and retained-object drags freeze the projection visible at pointer-down before settling transport, so playback materialization cannot contract beneath the pointer. Drag preview amends from one frozen origin; release creates one checkpoint, while cancellation restores that origin exactly. Pointer capture plus document-level release/cancel fallback gives every drag one terminal event.

Alt/Option carry is composed after the primary semantic movement with `amend`: its delta is computed in the origin projection, then applied to the selected Pin or Section. A visible Section expands its whole moving subtree only for inverse-delta calculation, so a nested child Fold cannot distort the parent’s translation; a child hidden by another active Fold is rejected until its owner expands or focuses. Pin Forward/Backward preserves the pre-existing selection until that combined transaction completes, so the traversal destination cannot silently become the object being carried.

`overwriteGuideSection()` replaces the selected Section’s endpoint references through `replaceSectionExtent()`. It preserves Section ID, title, creation time, shared Pins, and Undo identity; newly orphaned anonymous endpoint Pins are removed. If the overwritten Section owns Range, that Range is atomically rebased to the new Extent.

Section Loop passes its resolved frozen extent through `startLoopExtent()`. Matrix Loop first settles live playback, then consumes the resulting Active Interval.

All Section endpoints remain Pin operands. `visiblePins()` therefore projects the complete retained Address set to timeline, Guide, and previous/next traversal; Pins used by Sections cannot be deleted until those references are removed. Section duplicate identity uses the same case-insensitive endpoint/title key at creation, rename, and persistence sanitization.

## 10. Rendering and layout

`view.js` derives all labels and enabled states from Session and runtime snapshots. During playback it renders `projectPlayback()` continuously, so the visible Resolution and Working Section deform along the Cursor and equal the eventual settlement. Refine exhaustion distinguishes a hard Range edge from the Resolution floor. Switch previews the destination endpoint’s retained Neighborhood and reports its Address, duration, and basis. The UI reports actual Resolution duration rather than a lineage count invalidated by Step.

Timeline percentages always derive from `timelineProjection()`. At rest it reports both effective traversal duration and source duration when they differ. An active playback, Context, or Loop supplies its source extent as materialized presentation, so Cursor motion remains continuous and no visual jump is disguised as media skipping. Fold markers and Section Pins use an isolated Section lane above ordinary Pins; their visible geometry may stay faint while pseudo-element hit regions preserve pointer usability.

The wide Step Field ratio is `1 : 1.1 : 1`. Tail, Center, and Lead occupy explicit grid areas with zero-minimum tracks; every pane also owns an explicit `minmax(0, 1fr)` content column so child controls cannot widen and clip the player. Field-off always projects Center alone, independent of collapsed-side preferences. The player panel is an inline-size container, so controls fold and panes stack from actual component width rather than the outer viewport. A paused Center surface owns the shared user activation; it withdraws during ordinary playback so native YouTube controls remain usable. Below each player are mirrored object-local Field controls. Named Rate, Offset, Mode, and Step tracks reverse across Center, so mirrored functions have identical widths as well as mirrored order. No generic playback dock exists. `styles.css` owns the wide application layout, the exact 3×3 matrix, and the separate Undo action; `step-field.css` owns only the Field component and narrower stacking.

Range changes are accepted semantically without a generic player effect, then use one shared physical reset: pause Center, place committed Current, invalidate Field once, and establish it once in the new Range.

## 11. Persistence

Preferences store custom Context duration (`0–300s`), directional Offsets, last edited direction, Field response, Field enablement, and pane visibility. Guide v6 remains video-specific and persists `collapsed` per Section. v5 and earlier Guide records migrate expanded; no hidden topology is invented. Sanitization preserves valid records independently, coalesces coincident Pins, and recovers a later crossing or adjacent conflicting Fold expanded. Canonical runtime structures stay strict.
