# Binary YouTube Reader

Binary YouTube Reader is a spatial-temporal interface for navigating long YouTube videos through a small composable operator set.

The reader keeps one semantic model—Current inside Range at a Resolution—and lets Refine, Step, Continue, Context, Skim, Loop, Return, Pin, Section, and Focus act on it predictably. The three-pane Step Field adds Tail and Lead projections without replacing the stable Center-player grammar.

## Run

Serve the repository as a static site and open `index.html` through that server. The YouTube IFrame API requires a normal browser origin and network access.

```bash
npm test
npm run check
```

Node 20 or newer is required for repository checks.

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

## Operators

| Operator | Effect |
|---|---|
| Refine Backward / Forward | select one side of the current Neighborhood |
| Reopen | return to Range-level Resolution |
| Step Backward / Forward | move by configured directional Reach |
| Return | restore one complete semantic checkpoint |
| Continue | traverse forward and commit on settlement |
| Context | observe around Current without committing movement |
| Skim | accelerate toward the forward boundary, then Continue |
| Loop | repeat a captured Interval or Held Field Span |
| Pin Current | retain an Address |
| Save Section | retain an explicit Extent |
| Focus / Leave Focus | install or restore Range scope |

The operators compose. Focus changes Range; Refine discriminates inside it; Step moves by directional Reach; Continue traverses from the resulting Current; Return restores the preceding semantic state.

## Step Field

```text
Tail   ← Current →   Lead
slower     1×        faster
muted   audible      muted
```

Backward and Forward Reach can be linked or independent. Tail and Lead rates are selected from the actual rates available to each YouTube player.

**Application Continue** is the authoritative three-pane start control. Native Center controls remain available, but browser policy may allow Center while blocking a side player; the Field reports blocked or unavailable sides explicitly.

Center is always the only audible and semantic player. Disabling Step Field preserves the original single-player reader and does not create side players.

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

## Persistence

Guide records are stored per video. Reader preferences include directional Reach, the last edited Reach side, Tail and Lead response preferences, Field visibility, and observation settings. Legacy scalar `stepSeconds` migrates to equal linked Reach.

Current Session Reach becomes the default for the next video. Return restores Reach with Session and updates that default.

## Architecture

The code separates pure geometry, immutable semantic transactions, transient transport, YouTube adapters, Step Field execution, Guide retention, and presentation. `IMPLEMENTATION.md` is the canonical architecture and operational matrix.

## Validation status

The automated suite covers the stable pre-Field reader, directional Reach, Field bounds, response selection, persistence contracts, accessibility, integration, startup, and interaction smoke paths.

A real desktop-browser pass with actual YouTube videos is still required before merge. It must verify per-video rates, simultaneous playback, buffering, native controls, autoplay blocking, hidden panes, fullscreen, and video replacement.
