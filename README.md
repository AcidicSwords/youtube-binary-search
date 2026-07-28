# Binary YouTube Reader

Binary YouTube Reader is a spatial-temporal interface for navigating long YouTube videos through a compact, composable operator grammar.

The application keeps one semantic model—Current inside Range at a Resolution—and lets Refine, Reopen, Step, Return, Continue, Context, Skim, Loop, Pin, Section, and Focus act on it predictably. The three-pane Step Field projects Tail and Lead around the audible Center without creating a second timeline.

## Run

Serve the repository through a local HTTP server, then open `index.html`. The YouTube IFrame API requires a normal browser origin and network access.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Repository checks require Node 20 or newer:

```bash
npm test
npm run audit
npm run check
```

## Core model

```text
Address → Current inside Range
Current + Resolution → Neighborhood
movement → Interval
Address → Pin
explicit Extent → Section
Section → Range through Focus
```

Range is the sole hard temporal boundary. Resolution controls semantic discrimination; it does not clip physical observation.

## Step Field

```text
Tail   ← Current →   Lead
slower     1×        faster
muted   audible      muted
```

Backward and Forward Reach can be linked or independent. Tail and Lead rate controls live in their respective pane headers and expose only rates reported by the current YouTube player. Application Continue is the authoritative three-pane start gesture; native Center controls remain available.

Disabling Step Field preserves the stable single-player reader and does not create side players.

## Keyboard

```text
W / A / S / D = Reopen / Refine Backward / Return / Refine Forward
← / →         = Step Backward / Step Forward
[ / ]         = Reach preset down / up
Space         = Continue / Pause
C             = Context
F             = Skim
L             = Loop
P             = Pin Current
Shift+P       = Save Section
Shift+← / →   = previous / next Pin
```

Inputs and selects suspend global shortcuts.

## Documentation map

- `SPEC.md` — canonical semantic and interaction contract.
- `IMPLEMENTATION.md` — runtime architecture, ownership, and module boundaries.
- `INTERFACE.md` — visible-element ownership, layout grammar, and the presence test.
- `DEVELOPMENT.md` — setup, change discipline, and extension workflow.
- `VALIDATION.md` — automated coverage and the real-browser/device matrix.

These documents describe the current tree. Git history and merged pull requests retain chronology; canonical documentation does not accumulate obsolete version layers.
