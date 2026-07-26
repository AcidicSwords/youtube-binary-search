# Binary YouTube Reader

A lightweight static interface for traversing and organizing long YouTube videos as addressable temporal spaces.

The system is built around one primitive—an exact temporal **Address**—and a small set of tightly composed operations.

## Core objects

- **Current** — the active Address.
- **Range** — the one active bounded workspace. Normal Play loops it.
- **Resolution** — the current binary refinement inside Range.
- **Traversal** — movement from one Address to another.
- **Repeat Window** — the extent of the latest Traversal. Repeat loops it.
- **Mark** — a saved Address.
- **Section** — a named persistent relation between two Marks.
- **Focused Section** — the Section currently supplying Range.

`Interval`, `Frame`, `extent`, and endpoint identity remain implementation terms. The interface does not expose Passage, Span, Point, Context, Anchor, endpoint roles, or structural drafts.

## Operator grammar

Every movement operator resolves or retrieves a destination Address and produces the same consequence:

```text
choose or derive destination
→ traverse
→ Current changes
→ Repeat Window becomes departure–arrival
→ Undo becomes available
```

Destination sources:

- timeline click — direct Address;
- Narrow Earlier/Later — logarithmic destination;
- Step Earlier/Later — fixed linear destination;
- Previous/Next Mark — adjacent saved Address;
- Mark click — exact saved Address;
- Section click — derived midpoint;
- Skim and Play — actual playback arrival.

Nonmovement deformations:

- **Widen** — restore Range-level Resolution without moving or replacing Repeat Window.
- **Focus** — apply a Section as Range.
- **Unfocus** — restore the Range that preceded Focus.
- **Undo** — restore the complete state preceding the last committed operator, including Guide edits.

## Primary rhythm

```text
click or Narrow
→ Repeat when useful
→ Widen for context
→ click, Narrow, or Step again

Current → Add Mark
Repeat Window → Save Section
Section → Focus → Range
```

Clicking a Section moves to its midpoint. Clicking either endpoint Mark then makes that half of the Section the new Repeat Window without requiring a dedicated half-section command.

## Playback

- **Play Range** loops the active Range continuously.
- **Repeat** loops the Repeat Window.
- **Skim** approaches the Later destination fast-to-normal and continues at `1×`.
- When Play wraps Range, it preserves the prior Repeat Window because a wrapped cyclic path is not one ordinary interval.

## Guide and visual density

The sidebar is a Guide rather than a structural editor:

- add a Mark at Current;
- save the Repeat Window as a Section;
- click Marks and Sections to navigate;
- Focus or Unfocus Sections;
- rename or delete Guide objects.

Sections retain linked endpoint Marks internally. Automatically generated unnamed endpoints are not projected into the global Mark lane or Marks list. Explicit or named Marks are clustered by screen position when they would overlap. Only the hovered Section receives a temporary timeline preview; all Section extents are not drawn simultaneously.

## Keyboard

### Resolution

- `Q` — Narrow Earlier
- `W` — Widen
- `E` — Narrow Later

### Linear

- `Left Arrow` — Step Earlier
- `Right Arrow` — Step Later
- `[` / `]` — decrease/increase Step size

### Marks

- `,` — Previous Mark
- `.` — Next Mark
- `M` — focus the Mark title field

### Playback and history

- `S` — Skim
- `Space` — Play/Pause Range
- `T` — Repeat/Stop Repeat
- `R` or `Backspace` — Undo
- `Escape` — close transient menus or previews

## Persistence

Guide data is stored locally per video at:

```text
binary-youtube-reader:v3:<videoId>
```

Version 3 reads and migrates existing version 2 Marks and Spans into Marks and Sections. The version 2 key is left untouched as a rollback copy. Version 1 saved passages also migrate.

## Run

Serve the directory over HTTP or HTTPS so the YouTube embed receives a referrer:

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

No build step, dependency installation, API key, backend, or secret is required.

## Verification

```bash
npm run check
```

The check runs:

- JavaScript syntax validation;
- traversal and Guide model tests;
- DOM-binding validation;
- obsolete-state validation;
- startup smoke under a minimal DOM.
