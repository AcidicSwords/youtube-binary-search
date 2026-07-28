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

Semantic truth is immutable Session state. Physical player commands are requests. No callback may privately mutate Guide or Return history.

## 2. Ownership

| Module | Ownership |
|---|---|
| `range-geometry.js` | pure Range, Resolution, Neighborhood, Step, preview geometry |
| `session.js` | semantic transactions, Interval creation/editing, directional Offset normalization, Return |
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
```

Non-Step movement establishes both endpoints. Step preserves a usable existing departure and replaces only arrival. `moveDraft()` therefore keeps movement departure separate from `intervalDeparture`: movement departure controls Step Neighborhood geometry and Return provenance, while `intervalDeparture` controls the extent consumed by Loop and Section creation.

## 4. Transport model

`transport.js` exposes:

```text
idle | context | playback | loop
```

- Context stores anchor and bounded observation window.
- Playback stores departure, parent Neighborhood/basis, and Return model until physical settlement.
- Loop stores an immutable start/end/source snapshot and a cycle count.

Loop wraps use adapter placement directly and never call a Session movement transaction. Playback settlement uses `completePlayback()` exactly once.

## 5. Center lifecycle

A trusted parent-page Center click or Space command calls Tail, Lead, and Center playback synchronously. Center `PLAYING` then begins a playback transport unless Context or Loop already owns playback. Native `PAUSED` settles the active kind:

- Context restores committed Current.
- Loop ends without committing internal wraps.
- Playback calls `completePlayback()`.

Programmatic placement has a grace record so delayed iframe reporting cannot be mistaken for a native scrub.

## 6. Automatic Context

`applyPlayerEffect()` receives a changed Session result. When the result includes an Interval and Context duration is non-zero, it translates the Field to the new Current, pauses sides, and starts Context. Otherwise it places Center at Current.

Pending rapid Steps suppress intermediate Context and invoke it once after coalescing. Pointer/button Step uses the short debounce boundary. Arrow-key Step freezes the gesture origin and Interval anchor across key repeat, updates Session immediately, and invokes Context explicitly on keyup. Blur or hidden-document settlement commits the final Step without autoplay.

## 7. Step Field runtime

Side players are created lazily only when enabled and visible. They are always muted, control-free, and removed from keyboard and accessibility traversal.

Each side runtime owns:

```js
{
  mode: "held" | "stretching",
  offset,
  requestedRate,
  actualRate,
  playback,
  ready,
  rateAvailable,
  error
}
```

Stretch first places the side at Current. On genuine Center playback the side is started at `1×`; only after its own state reports playback does the controller inspect its own available rates and request the nearest valid directional rate. `onPlaybackRateChange` owns actual rate.

Held sides run at `1×`; measured drift beyond tolerance is corrected by placement. Holding emits measured offsets to `app.js`, which commits them through Session `setStepReach()`.

Side selection emits a Step payload only. `app.js` commits through the same `performStep()` used by matrix arrows, preserves the pending Interval anchor, and translates the Field around the new Current.

## 8. Guide integration

Guide tabs own creation and management:

- Pins tab: title + Pin Current, then Go/Rename/Delete.
- Sections tab: source extent + title + Save, then Go/Focus/Loop/Rename/Delete.

Section Loop passes the resolved Section extent into the same `startLoopExtent()` used by matrix Loop. Matrix Loop consumes only the current movement Interval.

## 9. Rendering and layout

`view.js` derives all labels and enabled states from Session and runtime snapshots. The wide Step Field ratio is `1 : 1.1 : 1`. A paused Center surface owns the shared user activation; it withdraws during ordinary playback so native YouTube controls remain usable. Below each player are object-local Field controls; no generic playback dock exists. `styles.css` owns the wide application layout and exact 3×3 matrix; `step-field.css` owns only the Field component and narrower stacking.

## 10. Persistence

Preferences store Context duration, directional Offsets, last edited direction, Field response, Field enablement, and pane visibility. Guide remains video-specific. Migrations normalize once at read time; canonical runtime structures stay strict.
