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
npm run audit
npm run check
```

## Core objects

```text
Address → Current inside Range
Current + Resolution → Neighborhood
committed movement → Interval
Step → move the Interval's active endpoint
Switch Endpoint → transpose Interval endpoints and restore the other endpoint frame
Address → Pin
explicit Extent → Section
Section → Range through Focus
```

Range is the sole hard temporal boundary. Resolution controls semantic discrimination; it does not clip physical observation.

## Native playback and Context

Center is the only audible player and retains native YouTube controls during playback. While paused, a parent-owned Center surface and Space start Center, Tail, and Lead synchronously from one trusted gesture. Every ordinary play/unpause refolds each available side to Center and begins a fresh Stretch toward its configured Offset; once Center is playing, the surface withdraws and YouTube’s native controls remain available. Pausing freezes each side on its represented frame, then settles Center movement once into semantic Current and Interval.

Context is not a button. A configured Context window runs automatically after discrete traversal, plays only in Center, restores Center to committed Current, and never activates Tail or Lead.

Step is also the Interval editor. The movement that establishes an Interval supplies its fixed departure anchor; subsequent Step actions move the active endpoint at Current. Stepping outward extends the Loop/Section region, stepping inward shrinks it, and crossing the anchor redraws it in the opposite direction. Held arrow-key repeats form one gesture and start Context once on keyup.

Every Interval endpoint retains the Resolution frame last occupied there. Switch Endpoint leaves the ordered extent unchanged, makes the other endpoint Current, and restores that endpoint’s frame. Step then composes from the transposed anchor. A collapsed Interval has nothing to switch.

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
- Clicking a side video surface or its Step button performs the same semantic Step by the visible differential, falling back to the configured maximum Offset. The complete Field translates by that amount and parks again, producing slideshow-like repeated traversal while editing the active Loop/Section Interval.
- Context suspends the sides without remeasuring or changing their stored relation. The next genuine play refolds and starts a fresh Stretch.

Disabling the Field preserves the stable single-player reader and does not create side players.

## Operator matrix

```text
Refine Backward | Reopen | Refine Forward
Step Backward   | Loop   | Step Forward
Previous Pin    | Switch Endpoint | Next Pin
```

Loop freezes the current Interval when started. It plays to the Interval end, internally returns to the frozen start without changing Session or invoking Context, and unpauses again.

Undo is intentionally outside the relational matrix and uses the platform-standard Ctrl/Cmd+Z shortcut.

Pin and Section creation live in Guide beside naming, traversal, Loop, Focus, rename, and deletion.

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
