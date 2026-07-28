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

`stepReach` is the persisted maximum Field Offset and default Step distance. Runtime no longer broadens this API to accept obsolete scalar values; legacy preference migration normalizes at the persistence boundary.

The Interval is directed even though it renders as an ordered extent:

```text
Interval.departure = fixed anchor
Interval.arrival = active endpoint = Current
Interval.departureFrame = Resolution/basis retained at the anchor
Interval.arrivalFrame = active Resolution/basis at Current
```

Non-Step movement establishes both endpoints and captures both frames. Step preserves a usable existing departure and departure frame while replacing arrival and its frame. `moveDraft()` therefore keeps movement departure separate from `intervalDeparture`: movement departure controls Step Neighborhood geometry and Undo provenance, while `intervalDeparture` controls the extent consumed by Loop and Section creation.

`switchEndpoint()` captures the active frame being left, restores the retained departure frame, swaps directed departure/arrival and their frames, and preserves ordered `start/end`, provenance, medium, and creation time. It is an involution over semantic state. Range changes defensively rebase any endpoint frame that no longer fits the sole hard bound.

## 4. Transport model

`transport.js` exposes:

```text
idle | context | playback | loop
```

- Context stores anchor and bounded observation window.
- Playback stores departure, parent Neighborhood/basis, and Undo model until physical settlement.
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

Pending rapid Steps suppress intermediate Context and invoke it once after coalescing. Pointer/button Step uses the short debounce boundary. Arrow-key Step freezes the gesture origin, Interval anchor, and departure frame across key repeat, updates Session immediately, and invokes Context explicitly on keyup. Blur or hidden-document settlement commits the final Step without autoplay.

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
  error
}
```

Every ordinary play calls `beginStretch()` for each available side. It records the prior relation, resets physical offset to zero, places or cues the side at Center, requests `1×`, and starts it in the same trusted gesture as Center. Only after the side reports playback does the controller inspect that iframe’s own rate menu and request the nearest valid directional rate. `onPlaybackRateChange` and adapter snapshots own actual rate; requests are retried with throttling until confirmed.

Paused sides retain a desired address. After first activation, parking uses seek plus pause so each pane displays the represented video frame rather than reverting to a source thumbnail. Pre-activation parking cues the source and requests frame placement; any transient muted playback is immediately paused. Held sides run at `1×` with drift correction while Center runs and park exactly when Center pauses.

Holding emits measured offsets to `app.js`, which may commit them through Session `setStepReach()`. It never mutates Session Interval. Context parks the existing relation around semantic Current without measuring against its transient Cursor.

Side selection emits a Step payload only. `app.js` commits through the same `performStep()` used by matrix arrows, preserves the pending Interval anchor, and translates the complete Field around the new Current before Center-only Context.

Pane collapse is projection-local. Hiding a side pauses it immediately without re-establishing its sibling; restoring a side establishes only that projection. Combined Hold/Stretch derives its state and targets from visible roles. Tail control order mirrors Lead around Center.

## 8. Guide integration

Guide tabs own creation and management:

- Pins tab: title + Pin Current, then Go/Rename/Delete.
- Sections tab: source extent + title + Save, then Go/Focus/Loop/Rename/Delete.

Section Loop passes the resolved Section extent into the same `startLoopExtent()` used by matrix Loop. Matrix Loop consumes only the current movement Interval.

## 9. Rendering and layout

`view.js` derives all labels and enabled states from Session and runtime snapshots. The wide Step Field ratio is `1 : 1.1 : 1`. A paused Center surface owns the shared user activation; it withdraws during ordinary playback so native YouTube controls remain usable. Below each player are mirrored object-local Field controls; no generic playback dock exists. `styles.css` owns the wide application layout, the exact 3×3 matrix, and the separate Undo action; `step-field.css` owns only the Field component and narrower stacking.

## 10. Persistence

Preferences store Context duration, directional Offsets, last edited direction, Field response, Field enablement, and pane visibility. Guide remains video-specific. Migrations normalize once at read time; canonical runtime structures stay strict.
