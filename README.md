# Binary YouTube Reader

Binary YouTube Reader is a spatial-temporal interface for navigating long YouTube videos through one semantic model:

```text
Current inside Range at a Resolution
```

Refine, Reopen, Step, Switch Endpoint, Undo, Loop, Pin, Section, Fold, Focus, native playback, and automatic Context all compose through that model. The optional three-pane Step Field projects a muted Tail and Lead around the audible Center without creating a second semantic timeline.

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
Source Address → Current inside Range
collapsed Section → one atomic point in Traversal Time
Current + Resolution → Neighborhood
direct Go or Pin hop → replace the Working Section with that traversal
Refine midpoint outside Working Section → replace it with the new traversal
Refine midpoint inside Working Section → shorten it toward the opposite endpoint
Step or settled playback → move the Interval's active endpoint
linear movement → push the approached Resolution endpoint
Switch Endpoint → transpose Interval endpoints and restore the other endpoint frame
Address → Pin
two Pins or an explicit Extent → Section
Working or retained Section → Range through Focus
```

Range is the sole hard temporal boundary. Resolution controls semantic discrimination; it does not clip physical observation. Every non-null Interval is contained by active Resolution, and both endpoint frames contain that same Interval.

## Pins, Sections, and folded traversal

A Pin is one retained source Address. A Section is one retained source interval linked to two shared endpoint Pins. Any two selected Pins can form a Section; moving a shared endpoint deforms every Section that references it.

An expanded Section renders as a coloured span, `Start of …` and `End of …` endpoint Pins, and a faint midpoint Fold control. Folding it retains the complete source interval but contracts its interior to one coloured Section Pin in **Traversal Time**. For example, folding `0:30–0:45` in a three-minute video produces `2:45` of traversal distance:

```text
source:     0:29 → 0:30 … 0:45 → 0:46
traversal:  0:29 → [Section point] → 0:31
```

Step, Refine, Range midpoint, timeline placement, Pin Forward/Backward, and Field offsets all use that contracted distance. Landing on a folded point from either side includes its entire source Section in the Working Section. Plain `S` at that active point toggles the near/far Section face—exclude/include—without moving its displayed position; `Shift+S` always performs ordinary Working endpoint transposition.

Click the folded Section Pin to expand it, or drag it to translate its endpoint Pins and all retained Pins nested inside it. Expanded endpoint Pins are independently draggable. Select a Pin or Section, then hold Alt/Option while traversing to carry that retained object by the same signed traversal distance in the same Undo transaction.

Folded Sections may be separated, nested, or coincident. Crossing Sections remain valid retained relations, but two crossing Sections cannot both be folded because that would make inverse traversal ambiguous. Adjacent sibling Sections sharing only one endpoint likewise require one of them to remain expanded; otherwise both would contract onto the same traversal coordinate with incompatible faces. Coincident Sections share one proxy and expand together from that proxy. A folded parent hides its descendants while preserving each child’s Fold state; expanding or deleting the parent reveals those states again. Focus temporarily materializes a folded Section and installs its source extent as Range. A Range boundary cutting through a folded interior likewise materializes that Section rather than hiding the boundary. A Range ending on one Fold face never permits traversal through the other face outside Range.

## Native playback and Context

Center is the only audible player and retains native YouTube controls during playback. While paused, a parent-owned Center surface and Space start Center, Tail, and Lead synchronously from one trusted gesture. Every ordinary play/unpause refolds each available side to Center and begins a fresh Stretch toward its configured Offset; once Center is playing, the surface withdraws and YouTube’s native controls remain available. During playback, Resolution and the Working Section deform continuously with Cursor. Pausing freezes each side once, then commits that exact visible projection by moving the active Interval endpoint and pushing only the approached Resolution endpoint.

Fold affects traversal and presentation, never media continuity. Playback, Context, Loop, and the physical Field are source-contiguous through every folded Section they cross. Ordinary playback and Loop materialize the complete active Range so Center and either Field side use one contiguous source metric even behind Center’s active extent; a retained Section Loop outside Range expands the physical envelope through that frozen operand and returns to its original semantic address when stopped. Center-only Context materializes its frozen source window. The retained projection returns on settlement unless exact Resolution, Range, or Working Section geometry still cuts the source interior; such a cut remains visibly materialized until a later operator removes it. Current alone may retain its exact source Address latently at the Fold Point. Duration readouts distinguish contracted traversal duration from source duration whenever they differ.

Context is not a button. A custom `0–300s` Context window runs automatically after discrete traversal, plays only in Center, restores Center to committed Current, and never activates Tail or Lead. The traversal point bisects the window: Center plays half the duration before Current, crosses Current, and plays up to half after it; Range clips either half independently. Pressing Space or the Center surface stops at the heard Cursor and accepts that address as Current through the shared Step-like continuous projection: the Working Section moves its active endpoint while Resolution pushes only its approached endpoint instead of collapsing both into a new local frame. Accepting the earlier half can extend the Working Section; accepting the later half can shorten it. Ordinary Context completion remains transient.

The matrix has distinct ownership rather than one hidden edit mode. Refine subdivides Resolution conditionally: a destination midpoint inside the Working Section shortens it toward the preserved opposite endpoint, collapsing it on exact endpoint coincidence; a midpoint outside replaces it with the complete new traversal from Current. Pin Forward/Backward pushes the approached Resolution endpoint but replaces Interval with the single Pin hop. Step resizes the existing Interval around its opposite endpoint. Direct timeline/Guide Go replaces Interval. Settled native playback follows Step’s endpoint-edit rule.

Stepping outward extends the operand, stepping inward shrinks it, and crossing the anchor redraws it in the opposite direction. Every Step pushes only the approached Neighborhood endpoint while leaving the receding endpoint fixed. Step distance is measured in Traversal Time, so crossing a Fold Point includes its full source Section without consuming its hidden duration. When Step reaches or crosses the old directional endpoint, it keeps a full Step beyond Current, clamped to Range, so the next directional Refine remains half a Step away wherever Range permits. Arrow keys, matrix buttons, local Step buttons, and side surfaces share an application-owned hold cadence; each repeat immediately parks Center and both sides at the new Current, while one held press remains one Undo transaction and starts Context at most once on release. Human-speed rapid taps share the short settlement window and likewise produce one Undo step and one final Context window.

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

Loop freezes the current source Interval when started. If playback is active, its visible deformation settles first and becomes the Loop without an intervening pause. Loop plays every source frame in that interval—including folded material—to the Interval end, internally returns to the frozen start without changing Session or invoking Context, rebases each Field side once, and unpauses again.

Undo is intentionally outside the relational matrix and uses the platform-standard Ctrl/Cmd+Z shortcut.

The current Loop is a semi-persistent Working Section: it may be focused and left without being saved. Guide provides explicit Save as new and Overwrite retained actions beside naming, traversal, Loop, Focus, rename, and deletion. Section endpoints are Pins and participate in matrix Pin traversal even before they receive independent titles.

## Keyboard

```text
A / W / D      Refine Backward / Reopen / Refine Forward
← / →          Step Backward / Step Forward
L              Loop current Interval
Shift+← / →    Previous / next Pin
S              Switch Endpoint
Shift+S        Force ordinary Working endpoint switch
F              Fold / expand selected Section
Alt/Option     Carry selected Pin or Section with a traversal
Ctrl/Cmd+Z     Undo
Space          Shared Field play/pause; during Context, set Cursor as Current
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
