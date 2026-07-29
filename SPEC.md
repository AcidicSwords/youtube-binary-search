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
- **Working Section / Interval / Loop** — the semi-persistent directed extent currently being formed. Departure and arrival define its ordered extent; arrival is Current. It can be focused and left without entering Guide, and becomes retained only through Save or Overwrite. Each endpoint retains a Resolution frame that contains the complete extent.
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
Interval ⊆ active Resolution ⊆ Range
both Interval endpoint frames contain the complete Interval and remain inside Range
Step and settled playback preserve a usable Interval.departure
Refine to a midpoint outside Interval replaces it with the new traversal
Refine to a midpoint inside Interval shortens it toward the opposite endpoint
Pin Forward/Backward replaces Interval with its own Pin hop
Step, playback, and Pin traversal push only the approached Resolution endpoint
Context never activates Tail or Lead
Loop wraps do not mutate Session
Undo restores semantic checkpoints, never transient player state
```

A null operation creates no history entry.

## 4. Semantic operators

### Go

Commits Current to a bounded Address and establishes a replacement Interval from the preceding Current. Timeline selection, direct Guide selection, Section midpoint selection, and settled native scrubbing project Go.

### Refine Backward / Forward

Selects one child of the active Neighborhood, commits its midpoint as Current, and increases discrimination. The result keeps Current centered between two refinement endpoints and therefore exposes two child midpoints whenever both sides remain above the 40 ms identity floor. If a directional midpoint is within that floor, Refine is unavailable on that side until a linear operator restores scale; it never consumes an endpoint and leaves Current stranded on the bound.

Refine owns subdivision and transforms the Working Section according to one geometric test:

```text
before Refine: C = Current, M = destination midpoint, O = opposite Loop endpoint

M is inside the existing Working Section, including an endpoint
→ shorten the existing Working Section
→ Working Section = M ↔ O, directed O → M

M is outside the existing Working Section
→ disregard the existing Working Section
→ Working Section = C ↔ M, directed C → M
```

The selected child Neighborhood and its boundaries are determined only by the Refine direction. Loop membership does not alter that subdivision; it determines which side of the subdivision is retained as the Working Section. The destination midpoint’s membership is decisive, not movement direction relative to the old endpoint. An inside midpoint increases Resolution while retaining the midpoint-to-opposite-endpoint remainder of the old Loop, never the Current-to-midpoint traversal. Landing exactly on the opposite endpoint shortens the Loop to zero and collapses it. Once a midpoint passes outside an endpoint, the complete preceding-Current-to-midpoint traversal replaces the old Loop. Both non-null results remain inside the selected child Neighborhood, so Current stays centered and binary point-location retains its ordinary convergence.

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
- Direct Go and Pin traversal establish replacement Intervals from their actual movements. Refine likewise replaces the Working Section when its midpoint lies outside it, but preserves the opposite endpoint when the midpoint lies inside and shortens it, collapsing at exact endpoint coincidence.
- Settled native playback shares Step’s endpoint-edit rule and preserves the active departure.

Step also preserves the active binary relation. Every Step leaves the receding Neighborhood endpoint fixed and pushes the approached endpoint by the signed movement. If the destination reaches or crosses the old `L` or `R`, the approached endpoint remains a full Step beyond the new `C`, clamped to Range. Consequently, the next Refine in the Step direction is half a Step away after a crossing whenever Range can contain that headroom. Range remains the sole hard boundary; at Range itself, Refine may necessarily become unavailable.

Each distinct Step sequence is a traversal and may invoke automatic Context. Arrow keys, matrix buttons, side buttons, and side-player surfaces share one press contract: the first Step occurs immediately, an application-owned initial delay and repeat cadence drives a hold, and release coalesces the entire held gesture into one Undo transaction and at most one Context window. Quick repeated taps within the short debounce window likewise form one transaction. Browser-generated key repeat noise does not control cadence.

### Switch Endpoint

Transposes the directed Interval:

```text
Interval (departure A, arrival B = Current)
→ Interval (departure B, arrival A = Current)
```

`Interval.start` and `Interval.end` do not change. The frame being left is stored at its endpoint and the frame retained at the destination is restored as active Resolution. Both frames are enlarged only when necessary to contain the unchanged Interval. Switching twice therefore restores the same Current, directed Interval, and endpoint frames. Step and settled playback after switching edit from the newly transposed departure anchor. A following Refine shortens when its destination midpoint remains inside the transposed Loop, including collapse at the opposite endpoint; otherwise it replaces the Loop with its new traversal. Pin traversal records its own local movement. A null/collapsed Interval has no endpoints and Switch Endpoint is unavailable.

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

The internal end-to-start wrap does not commit Current, redefine Interval, append Undo history, or invoke Context. A wrap rebases each physical Field side once while preserving its relation. Starting Loop during playback first settles the visible playback deformation and freezes that resulting Working Section; the handoff does not insert a pause between transports. Reopen does not alter the ordered operand, though it updates the active endpoint frame. Movement operators may establish a later Interval after Loop stops, while Step may resize the current operand before Loop starts.

### Pin / Section / Focus

- Pin Current retains Current as an Address.
- Every Section endpoint is a Pin operand for timeline and matrix Pin traversal, whether or not it has an independent title.
- Pin Forward/Backward is linear for Resolution: it leaves the receding endpoint fixed and pushes the approached endpoint. The resulting Interval is exactly the one-hop movement from the preceding Current to that Pin.
- The current Interval is the semi-persistent Working Section. Focus Working projects its current extent into Range without creating a Guide record; Leave restores the containing Range while preserving its latest deformation.
- Save Section copies a Working Section or Held Field span into Guide and reuses coincident endpoint Pins.
- Overwrite replaces one retained Section’s endpoint Pins with the current Working Section while preserving the retained Section’s identity and title.
- Section identity is case-insensitive for equal endpoints and title, both at runtime and after persistence recovery.
- Focus installs either a retained Section or the Working Section as Range; focus and persistence are independent relations.
- Leave restores the containing Range.

Creation and management belong to Guide.

## 5. Native playback

While Context is idle, a paused Center surface and Space invoke ordinary playback through the parent document. The same trusted gesture first refolds each available side to Center, then requests muted Tail, audible Center, and muted Lead playback synchronously. Every ordinary play/unpause therefore starts a fresh Stretch rather than resuming stale side clocks. Once Center enters ordinary playback, the surface withdraws so native YouTube controls remain available. Starting playback creates a transient playback transaction from the current physical position. While it runs, the map projects the exact Resolution and Working Section that settlement would produce without committing Session. Pausing freezes side frames at their represented addresses once and settles Center movement once through Session:

```text
physical Cursor movement
→ complete playback
→ committed Current and Interval
```

Playback uses the Neighborhood captured when playback starts. On settlement it leaves the receding refinement endpoint fixed, pushes the approached endpoint by the signed playback movement, and edits the active Interval around its retained opposite endpoint. The containment postcondition keeps that Loop inside active Resolution and both endpoint frames. Native playback is not exposed as a separate Continue operator.

## 6. Automatic Context

Context is a post-traversal policy parameterized by a custom `0–300s` duration; `0` is Off and preset values are suggestions.

After a discrete operation commits a different Current and produces an Interval:

```text
commit Current
→ suspend Tail and Lead
→ play bounded Center window around Current
→ restore Center Cursor to Current
→ remain paused until genuine native playback
```

A new traversal during Context supersedes the old window and starts Context around the new destination. Changing the duration while Context runs retargets that transient window immediately; even a duration shorter than the one-second default pre-roll must still contain Current. Ordinary Context creates no history and does not redefine Interval. Space or the Center surface explicitly accepts the presently heard Cursor: Context pauses without restoring its anchor, that Cursor becomes Current through a direct Go, and the resulting movement enters Undo history. Context owns Space even when a traversal button retains focus.

A held Step suppresses intermediate Context windows and starts one observation only when the key or pointer gesture ends. Each repeat still commits and visibly parks Center, Tail, and Lead at its new Current; only automatic observation and final history settlement are deferred. Rapid taps inside the shared settlement window amend that same transaction. Hold/Stretch is unavailable during Context because its transient Cursor is not a valid source for a stored Field relation.

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
