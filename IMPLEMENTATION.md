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
| `session.js` | semantic transactions, endpoint frames, Interval creation/editing, directional Offset normalization, Undo |
| `transport.js` | transient Context, native playback, and frozen Loop values |
| `youtube.js` | sole raw YouTube IFrame API boundary |
| `step-field-geometry.js` | pure Field bounds, phases, and rate policy |
| `step-field.js` | Tail/Lead players, Hold/Stretch runtime, side Step payloads |
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

Operator ownership is explicit. Direct Go and Pin traversal replace Interval with their actual movement. Step and settled playback preserve a usable existing departure and edit only arrival. Refine derives its Interval departure relationally: moving away from the existing departure uses preceding Current and records the new unlooped crossing; moving toward the existing departure retains that endpoint and therefore stores the side complementary to the fold. Passing the departure keeps only the overrun. `moveDraft()` keeps movement departure separate from `intervalDeparture`, so this relation is explicit in the transaction rather than selected by a hidden mode.

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

## 4. Transport model

`transport.js` exposes:

```text
idle | context | playback | loop
```

- Context stores anchor and bounded observation window.
- Playback stores departure, parent Neighborhood/basis, the active Interval anchor, and Undo model until physical settlement. Settlement moves that active endpoint, pushes only the approached refinement bound, and merges any intervening Held Offset and Guide state into the checkpoint so history order remains compositional.
- Loop stores an immutable start/end/source snapshot and a cycle count.

Loop wraps use adapter placement directly and never call a Session movement transaction. Playback settlement uses `completePlayback()` exactly once.

## 5. Center lifecycle

A trusted parent-page Center click or Space command first refolds each available side to the physical Center, primes it at `1×`, and calls Tail, Lead, and Center playback synchronously. Center `PLAYING` then begins a playback transport unless Context or Loop already owns playback. Native `PAUSED` captures the latest side offsets before settling the active kind:

- Context restores committed Current.
- Loop ends without committing internal wraps.
- Playback calls `completePlayback()`.

Programmatic placement has a grace record so delayed iframe reporting cannot be mistaken for a native scrub.

## 6. Automatic Context

`applyPlayerEffect()` receives a changed Session result. When the result includes an Interval and Context duration is non-zero, it translates the complete Field to the new Current, parks the sides without remeasurement, and starts Center-only Context. Otherwise it places Center and the translated Field at Current.

Pending rapid Steps suppress intermediate Context and invoke it once after coalescing. Pointer/button Step uses the short debounce boundary. Held Arrow Step freezes the gesture origin, Interval anchor, and departure frame, then uses an application-owned initial delay and repeat timer rather than browser repeat frequency. It updates Session immediately and invokes Context explicitly on keyup. Blur or hidden-document settlement commits the final Step without autoplay.

## 7. Step Field runtime

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

Holding emits measured offsets to `app.js`, which may commit them through Session `setStepReach()`. It never mutates Session Interval. Context parks the existing relation around semantic Current without measuring against its transient Cursor.

Side selection emits a Step payload only. `app.js` commits through the same `performStep()` used by matrix arrows, preserves the pending Interval anchor, and translates the complete Field around the new Current before Center-only Context.

Pane collapse is projection-local. Hiding a side pauses it immediately without re-establishing its sibling; restoring a side establishes only that projection. A media error retains the reusable adapter; restoring that pane sets `retrySource`, while a video load resets both side sources so reloading the same video can recover. Combined Hold/Stretch derives its state and targets from visible roles. Tail control order mirrors Lead around Center.

## 8. Guide integration

The current Interval is projected as a semi-persistent Working Section. `focusWorkingSection()` stores a frozen focus Extent plus the containing return Range, installs that Extent as Range, and does not edit Guide. `leaveSection()` restores the containing Range while Session retains the latest Working Section.

Guide tabs own explicit persistence and management:

- Pins tab: title + Pin Current, then Go/Rename/Delete.
- Sections tab: source extent + title + Save and Focus Working, then Go/Focus/Loop/Overwrite/Rename/Delete.

`overwriteGuideSection()` replaces the selected Section’s endpoint references through `replaceSectionExtent()`. It preserves Section ID, title, creation time, shared Pins, and Undo identity; newly orphaned anonymous endpoint Pins are removed. If the overwritten Section owns Range, that Range is atomically rebased to the new Extent.

Section Loop passes the resolved Section extent into the same `startLoopExtent()` used by matrix Loop. Matrix Loop consumes only the Active Interval.

All Section endpoints remain Pin operands. `visiblePins()` therefore projects the complete retained Address set to timeline, Guide, and previous/next traversal; Pins used by Sections cannot be deleted until those references are removed. Section duplicate identity uses the same case-insensitive endpoint/title key at creation, rename, and persistence sanitization.

## 9. Rendering and layout

`view.js` derives all labels and enabled states from Session and runtime snapshots. Refine exhaustion distinguishes a hard Range edge from the Resolution floor. Switch previews the destination endpoint’s retained Neighborhood and reports its Address, duration, and basis. The UI reports actual Resolution duration rather than a lineage count invalidated by Step.

The wide Step Field ratio is `1 : 1.1 : 1`. Tail, Center, and Lead occupy explicit grid areas with zero-minimum tracks; every pane also owns an explicit `minmax(0, 1fr)` content column so child controls cannot widen and clip the player. Field-off always projects Center alone, independent of collapsed-side preferences. The player panel is an inline-size container, so controls fold and panes stack from actual component width rather than the outer viewport. A paused Center surface owns the shared user activation; it withdraws during ordinary playback so native YouTube controls remain usable. Below each player are mirrored object-local Field controls; no generic playback dock exists. `styles.css` owns the wide application layout, the exact 3×3 matrix, and the separate Undo action; `step-field.css` owns only the Field component and narrower stacking.

## 10. Persistence

Preferences store Context duration, directional Offsets, last edited direction, Field response, Field enablement, and pane visibility. Guide remains video-specific. Migrations normalize once at read time; canonical runtime structures stay strict.
