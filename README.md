# Binary YouTube Reader

Binary YouTube Reader is a spatial-temporal interface for navigating long YouTube videos through one semantic model:

```text
Current inside Range at a Resolution
```

Refine, Reopen, Step, Switch Endpoint, Undo, Loop, Pin, Section, Focus, native playback, and automatic Context all compose through that model. The optional three-pane Step Field projects a muted Tail and Lead around the audible Center without creating a second semantic timeline.

## Run

Serve the static repository over HTTP, then open `index.html`:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

The YouTube IFrame API requires a browser origin and network access. Repository checks require Node 20 or newer:

```bash
npm test
npm run test:semantic
npm run audit
npm run check
```

## Core objects

```text
Address → Current inside Range
Current + Resolution → Neighborhood
direct Go or Pin hop → replace the Working Section with that traversal
Refine midpoint outside Working Section → replace it with the new traversal
Refine midpoint inside Working Section → shorten it toward the opposite endpoint
Step or settled playback → move the Interval's active endpoint
linear movement → push the approached Resolution endpoint
Switch Endpoint → transpose Interval endpoints and restore the other endpoint frame
Address → Pin
explicit Extent → Section
Working or retained Section → Range through Focus
```

Range is the sole hard temporal boundary. Resolution controls semantic discrimination; it does not clip physical observation. Every non-null Interval is contained by active Resolution, and both endpoint frames contain that same Interval.

## Native playback and Context

Center is the only audible player and retains native YouTube controls during playback. While paused, a parent-owned Center surface and Space start Center, Tail, and Lead synchronously from one trusted gesture. Every ordinary play/unpause refolds each available side to Center and begins a fresh Stretch toward its configured Offset; once Center is playing, the surface withdraws and YouTube’s native controls remain available. During playback, Resolution and the Working Section deform continuously with Cursor. Pausing freezes each side once, then commits that exact visible projection by moving the active Interval endpoint and pushing only the approached Resolution endpoint.

Context is not a button. A custom `0–300s` Context window runs automatically after discrete traversal, plays only in Center, restores Center to committed Current, and never activates Tail or Lead.

The matrix has distinct ownership rather than one hidden edit mode. Refine subdivides Resolution conditionally: a destination midpoint inside the Working Section shortens it toward the preserved opposite endpoint, collapsing it on exact endpoint coincidence; a midpoint outside replaces it with the complete new traversal from Current. Pin Forward/Backward pushes the approached Resolution endpoint but replaces Interval with the single Pin hop. Step resizes the existing Interval around its opposite endpoint. Direct timeline/Guide Go replaces Interval. Settled native playback follows Step’s endpoint-edit rule.

Stepping outward extends the operand, stepping inward shrinks it, and crossing the anchor redraws it in the opposite direction. Every Step pushes only the approached Neighborhood endpoint while leaving the receding endpoint fixed. When it reaches or crosses the old directional endpoint, it keeps a full Step beyond Current, clamped to Range, so the next directional Refine remains half a Step away wherever Range permits. Arrow keys, matrix buttons, local Step buttons, and side surfaces share an application-owned hold cadence; one held press is one Undo transaction and starts Context at most once on release. Quick repeated taps also coalesce into one Undo step.

Every Interval endpoint retains a Resolution frame that contains the complete Interval. Switch Endpoint leaves the ordered extent unchanged, makes the other endpoint Current, and restores that endpoint’s frame. Switching twice is an exact involution. A following Step or playback edits from the transposed anchor. Refine uses the same destination-membership rule after transposition: inside shortens (or collapses at coincidence); outside replaces. Pin traversal records its own local movement. A collapsed Interval has nothing to switch.

## Step Field

```text
Tail             Center             Lead
slower, muted    1×, audible        faster, muted
Step Backward    native playback    Step Forward
Hold/Stretch     Hold/Stretch both  Hold/Stretch
```

Each side owns a maximum Offset and a supported directional Rate.

- While paused, Tail and Lead display the exact frames represented by their current offsets; they are not thumbnail placeholders.
- **Stretch** snaps the side to Current, primes it at `1×`, then diverges during genuine Center playback until its configured maximum Offset is reached.
- **Hold** switches the side to `1×` and preserves the measured Offset. Holding midway through Stretch may make that measured Offset the new maximum and Step distance, but never changes the semantic Interval.
- Clicking a side video surface or its Step button performs the same semantic Step by the visible differential, falling back to the configured maximum Offset. The complete Field translates by that amount and parks again, producing slideshow-like repeated traversal while editing the active Loop Interval.
- Context suspends the sides without remeasuring or changing their stored relation; Hold/Stretch is unavailable until suspension ends. The next genuine play refolds and starts a fresh Stretch.
- A side-player media error remains recoverable: restoring that pane or reloading the video retries its source instead of leaving the projection permanently unavailable.

Disabling the Field preserves the stable single-player reader and does not create side players.

## Operator matrix

```text
Refine Backward | Reopen | Refine Forward
Step Backward   | Loop   | Step Forward
Previous Pin    | Switch Endpoint | Next Pin
```

Loop freezes the current Interval when started. If playback is active, its visible deformation settles first and becomes the Loop without an intervening pause. Loop plays to the Interval end, internally returns to the frozen start without changing Session or invoking Context, rebases each Field side once, and unpauses again.

Undo is intentionally outside the relational matrix and uses the platform-standard Ctrl/Cmd+Z shortcut.

The current Loop is a semi-persistent Working Section: it may be focused and left without being saved. Guide provides explicit Save as new and Overwrite retained actions beside naming, traversal, Loop, Focus, rename, and deletion. Section endpoints are Pins and participate in matrix Pin traversal even before they receive independent titles.

## Keyboard

```text
A / W / D      Refine Backward / Reopen / Refine Forward
← / →          Step Backward / Step Forward
L              Loop current Interval
Shift+← / →    Previous / next Pin
S              Switch Endpoint
Ctrl/Cmd+Z     Undo
Space          Shared Field play/pause
P              Open Pins creation in Guide
Shift+P        Open Sections creation in Guide
G              Guide
[ / ]          Offset preset down / up
Esc            Stop or close
```

Inputs and selects suspend global shortcuts.

## Documentation map

- `SPEC.md` — canonical semantic and interaction contract.
- `IMPLEMENTATION.md` — runtime architecture and module ownership.
- `INTERFACE.md` — visible-element ownership and layout grammar.
- `DEVELOPMENT.md` — setup and change discipline.
- `VALIDATION.md` — automated and real-browser validation matrix.
