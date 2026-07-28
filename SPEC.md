# Binary YouTube Reader — Canonical Specification

## 1. Authority

This document defines the current semantic and interaction contract. `IMPLEMENTATION.md` defines its runtime ownership. Historical behaviour is non-normative.

## 2. Ordered temporal space

The primitive is an Address `t` inside duration `[0, D]`.

- **Current** — committed Address from which semantic operators act.
- **Cursor** — transient physical Center-player position.
- **Range** — sole hard admissible extent.
- **Resolution** — current grain of semantic discrimination.
- **Neighborhood** — `{L, C, R}` around Current at that Resolution.
- **Interval** — active editable movement extent. Departure is its retained anchor; arrival is the active endpoint at Current. Each endpoint retains the Resolution frame last occupied there.
- **Pin** — retained Address.
- **Section** — retained bounded Extent whose endpoints are Pins.
- **Guide** — video-specific Pins and Sections.
- **Field** — physical Tail/Center/Lead relation.

At semantic rest, Cursor and Current coincide. Cursor is never persisted in Session.

## 3. Invariants

```text
0 ≤ Range.start ≤ Current ≤ Range.end ≤ D
Range is the only hard Field boundary
0.25s ≤ backward Offset, forward Offset ≤ 300s
Center is the only audible player
Tail and Lead cannot commit Current except through Step
Interval is null or Interval.arrival = Current
Interval.arrivalFrame = current Resolution and basis
Interval endpoint frames remain inside Range
Step preserves a usable Interval.departure
Matrix Refine and Pin traversal preserve a usable Interval.departure
Step preserves its binary Neighborhood and pushes only a reached directional endpoint
Context never activates Tail or Lead
Loop wraps do not mutate Session
Undo restores semantic checkpoints, never transient player state
```

A null operation creates no history entry.

## 4. Semantic operators

### Go

Commits Current to a bounded Address and establishes a replacement Interval from the preceding Current. Timeline selection, direct Guide selection, Section midpoint selection, and settled native scrubbing project Go.

### Refine Backward / Forward

Selects one child of the active Neighborhood, commits its midpoint as Current, and increases discrimination. If that midpoint is within the 40 ms identity floor but the directional endpoint remains distinct, the terminal Refine consumes that endpoint instead of exposing a no-op target. Refine becomes unavailable only when no distinct Address remains on that side.

Refine is a matrix-direction operation: when an Interval is active at Current, it preserves that Interval’s departure and edits only its arrival. With no active Interval, the first Refine establishes one from Current.

### Reopen

Preserves Current and returns Resolution to Range scale. It preserves the current Interval.

### Step Backward / Forward

Moves Current by the directional Field Offset, clamped to Range. The matrix Step and the corresponding side-pane Step are the same operation.

Step edits the active Interval rather than replacing it:

```text
anchor = existing Interval.departure when Interval.arrival = Current
otherwise anchor = Current before the first Step
arrival = Current after Step
Interval = bounded extent between anchor and arrival
```

Consequences:

- Step away from the anchor extends the Interval.
- Step toward the anchor shrinks it.
- Step across the anchor redraws it in the opposite direction.
- Landing exactly on the anchor collapses the Interval; the next Step redraws from that same Current.
- Direct Go and settled native playback establish replacement Intervals.
- Refine, Step, and matrix Pin traversal share one endpoint-edit rule and preserve the active departure.

Step also preserves the active binary Neighborhood. It moves `C` inside that frame until the destination reaches or crosses `L` or `R`. It then pushes only the crossed directional endpoint to one Step beyond the new `C`, clamped to Range. Consequently, the next Refine in the Step direction is half a Step away whenever the remaining Range can contain that full Step of headroom. Range remains the sole hard boundary; at Range itself, Refine may necessarily become unavailable.

Each distinct Step gesture is a traversal and may invoke automatic Context. Auto-repeated arrow-key events coalesce into one transaction, update Current and the timeline immediately, and invoke Context once on keyup at the final Current.

### Switch Endpoint

Transposes the directed Interval:

```text
Interval (departure A, arrival B = Current)
→ Interval (departure B, arrival A = Current)
```

`Interval.start` and `Interval.end` do not change. The frame being left is stored at its endpoint and the frame retained at the destination is restored as active Resolution. Switching twice therefore restores the same Current, directed Interval, and endpoint frames. Refine, Step, and matrix Pin traversal after switching edit from the newly transposed departure anchor. A null/collapsed Interval has no endpoints and Switch Endpoint is unavailable; the next directional movement establishes again from that Current.

Switch Endpoint is a traversal and may invoke automatic Context.

### Undo

Restores the previous complete semantic checkpoint: Range, Resolution, Current, Interval, Focus, directional Offsets, and Guide changes belonging to that transaction. If Hold changes an Offset during native playback, playback settlement follows it in history; one Undo restores the pre-settlement spatial state with the Held Offset intact, and the next Undo restores the earlier Offset.

### Loop

Consumes a frozen snapshot of the current Interval. One cycle is:

```text
play/unpause from start toward end
→ internal physical placement to start
→ play/unpause again
```

The internal end-to-start wrap does not commit Current, redefine Interval, append Undo history, or invoke Context. Reopen does not alter the ordered operand, though it updates the active endpoint frame. Movement operators may establish a later Interval after Loop stops, while Step may resize the current operand before Loop starts.

### Pin / Section / Focus

- Pin Current retains Current as an Address.
- Every Section endpoint is a Pin operand for timeline and matrix Pin traversal, whether or not it has an independent title.
- Save Section retains an Active Interval or Held Field span and reuses coincident endpoint Pins.
- Section identity is case-insensitive for equal endpoints and title, both at runtime and after persistence recovery.
- Focus installs a Section as Range.
- Leave restores the containing Range.

Creation and management belong to Guide.

## 5. Native playback

A paused Center surface and Space invoke ordinary playback through the parent document. The same trusted gesture first refolds each available side to Center, then requests muted Tail, audible Center, and muted Lead playback synchronously. Every ordinary play/unpause therefore starts a fresh Stretch rather than resuming stale side clocks. Once Center enters ordinary playback, the surface withdraws so native YouTube controls remain available. Starting playback creates a transient playback transaction from the current physical position. Pausing freezes side frames at their represented addresses and settles Center movement once through Session:

```text
physical Cursor movement
→ complete playback
→ committed Current and Interval
```

Playback crossing the current Neighborhood reopens Resolution to Range scale. Native playback is not exposed as a separate Continue operator.

## 6. Automatic Context

Context is a post-traversal policy parameterized by duration.

After a discrete operation commits a different Current and produces an Interval:

```text
commit Current
→ suspend Tail and Lead
→ play bounded Center window around Current
→ restore Center Cursor to Current
→ remain paused until genuine native playback
```

A new traversal during Context supersedes the old window and starts Context around the new destination. Context creates no history and does not redefine Interval. Held arrow-key Step suppresses intermediate Context windows and starts one observation only when the key gesture ends.

## 7. Step Field

Each side has:

```text
mode ∈ {held, stretching}
parked / desired Address
actual and progress Offset
maximum Offset / Step distance
requested and confirmed Rate
player readiness / playback state
```

A side-player media error does not invalidate its IFrame adapter. Restoring the pane or reloading a video may re-cue that source. Pane collapse is projection-local, and the Field-off projection remains Center-only regardless of persisted collapse state.

### Stretch

Stretch is one operation containing refold and unfold:

```text
snap side to Current
→ preserve maximum Offset
→ wait for genuine Center playback
→ prime side at 1×
→ request supported directional Rate
→ diverge toward maximum Offset
→ switch to 1× and become Held
```

Tail requests a rate below `1×`; Lead requests a rate above `1×`. Rate requests are retried against the player’s confirmed rate. If a source exposes no valid directional rate, the side is placed at its requested target and becomes Held instead of remaining stuck in Stretch.

### Hold

Hold switches the side to `1×` and fixes its measured Offset. If invoked during Stretch, the measured Offset may become the new maximum Offset and Step distance. Hold and Stretch are physical Field transitions: neither operation commits Current nor rewrites Interval.

Center exposes Hold both / Stretch both. Each side remains independently controllable.

### Side Step and translation

The read-only side video surface and local Step button invoke the same Step. Distance is the meaningful visible Offset, otherwise the maximum Offset. At a hard Range boundary the corresponding surface and button are unavailable rather than exposing a null action. The Step moves the active Interval endpoint, so repeated side clicks extend, shrink, or reverse the same Loop/Section region. After Step, the complete Field translates by the same signed movement and all three panes park at their translated addresses. Automatic Context then runs in Center only and leaves the parked Field relation untouched.

## 8. Physical versus semantic effects

All meaningful state is expressed through Session, but runtime effects remain separate:

```text
Session: Range, Resolution, Current, Interval endpoint frames, Guide, Focus, Offsets
Runtime: Cursor, Context, Loop cycle, side mode/address/offset/rate/playback
```

A physical command is never assumed successful merely because it was requested. Adapter events and snapshots are authoritative for actual playback, placement, and rate. Sibling iframe playback must be requested in the same trusted parent-page gesture; a later Center state callback is not treated as transferable activation.
