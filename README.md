# Binary YouTube Reader

Binary YouTube Reader is a spatial-temporal interface for navigating long YouTube videos through one semantic model:

```text
Current inside Range at a Resolution
```

Refine, Reopen, Step, Return, Loop, Pin, Section, Focus, native playback, and automatic Context all compose through that model. The optional three-pane Step Field projects a muted Tail and Lead around the audible Center without creating a second semantic timeline.

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
Address → Pin
explicit Extent → Section
Section → Range through Focus
```

Range is the sole hard temporal boundary. Resolution controls semantic discrimination; it does not clip physical observation.

## Native playback and Context

Center is the only audible player and retains native YouTube controls. Clicking Center or pressing Space owns ordinary play/pause. When native playback pauses, its physical movement settles once into semantic Current and Interval.

Context is not a button. A configured Context window runs automatically after discrete traversal, plays only in Center, restores Center to committed Current, and never activates Tail or Lead.

Step is also the Interval editor. The movement that establishes an Interval supplies its fixed departure anchor; subsequent Step actions move the active endpoint at Current. Stepping outward extends the Loop/Section region, stepping inward shrinks it, and crossing the anchor redraws it in the opposite direction. Held arrow-key repeats form one gesture and start Context once on keyup.

## Step Field

```text
Tail             Center             Lead
slower, muted    1×, audible        faster, muted
Step Backward    native playback    Step Forward
Hold/Stretch     Hold/Stretch both  Hold/Stretch
```

Each side owns a maximum Offset and a supported directional Rate.

- **Stretch** snaps the side to Current, then diverges on the next genuine Center playback until its maximum Offset is reached.
- **Hold** switches the side to `1×` and preserves the measured Offset. Holding midway through Stretch makes that measured Offset the new maximum and Step distance.
- Clicking a side pane or its Step button performs the same semantic Step by the visible differential, falling back to the configured maximum Offset, and edits the same active Interval used by Loop and Section creation.
- Context suspends the sides. Native Center playback resumes Field behaviour.

Disabling the Field preserves the stable single-player reader and does not create side players.

## Operator matrix

```text
Refine Backward | Reopen | Refine Forward
Step Backward   | Loop   | Step Forward
Previous Pin    | Return | Next Pin
```

Loop freezes the current Interval when started. It plays to the Interval end, internally returns to the frozen start without changing Session or invoking Context, and unpauses again.

Pin and Section creation live in Guide beside naming, traversal, Loop, Focus, rename, and deletion.

## Keyboard

```text
A / W / D      Refine Backward / Reopen / Refine Forward
← / →          Step Backward / Step Forward
L              Loop current Interval
Shift+← / →    Previous / next Pin
S              Return
Space          Native Center play/pause
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
