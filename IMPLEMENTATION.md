# Marked Traversal v2 — Implementation Sequence

This package is a complete replacement source set for the current repository. Apply the files together on a feature branch; do not merge partially completed phases into `main`.

## 1. Replace the traversal foundation

Replace `traversal.js` first and run `npm test`.

Changes:

- Frames become `{L, C, R, level, returnPoint?}`.
- `level` records Narrow depth; history length no longer represents resolution.
- `descend()` increments `level`.
- `widenToRange()` returns Level 0.
- `canWiden()` is geometric.
- Widen is represented as a normal history frame and can be undone.
- Add pure Step geometry: `stepTarget()` and `stepFrame()`.
- Add pure bound operations: `bindPassageStart()` and `bindPassageEnd()`.
- Extend `getActionRanges()` with Step previews.

Required invariant:

```text
resolution level != navigation history length
```

## 2. Add the persistent structural model

Add `structure.js` and update `package.json` checks.

The model is deliberately small:

```text
Address = exact time
Mark    = persistent Address
Span    = ordered relation between two Marks
```

`structure.js` provides:

- coincident Mark reuse;
- shared Span endpoints;
- overlapping and nested Spans;
- optional Span Anchor;
- Previous/Next Mark lookup;
- safe deletion of referenced Marks;
- v1 saved-passage migration;
- validation and deterministic ordering.

Run `npm test` again before UI work.

## 3. Replace application state and orchestration

Replace `app.js` as one file. Do not layer it over the old `savedRegions` and `scope` paths.

Canonical state divisions:

```text
Frame level       binary resolution
stack             reversible Frame history
contextStack      entered Range history
structuralHistory Mark/Span edit history
```

The application adds:

- undoable Widen;
- Last Traversal provenance;
- exact Step Earlier/Later;
- 120 ms rapid-Step coalescing;
- Mark Current;
- Previous/Next Mark through Point + Narrow;
- Target and Go;
- Passage/Range bound assignment from Marks;
- Save Passage, Last Traversal, or Range as Span;
- Span drafting from two Marks;
- Enter, Enter Here, Focus, Loop, and Exit;
- returnable Range edits and handle drags;
- v2 local-storage persistence and v1 migration;
- separate navigation and structural Undo.

## 4. Replace the interface together

Replace `index.html` and `styles.css` in the same commit as `app.js`.

Main-column order:

```text
Player
Status
Temporal map and state
Traversal motion matrix
Playback
Return
Range tools disclosure
Help
```

The motion matrix uses shared columns:

```text
Resolution  Narrow Earlier | Widen        | Narrow Later
Linear      Step Earlier   | Step size    | Step Later
Marks       Previous Mark  | Mark Current | Next Mark
```

Undo and Exit share the Return strip. Range mutation controls are behind a disclosure because they are setup rather than frequent traversal.

Structure-panel order:

```text
Create Mark
Save as Span
Selected-object roles
Temporary Span draft
Marks
Spans
```

The interface has no organization mode. Selecting an object reveals only valid role applications.

## 5. Replace terminology everywhere

Use:

```text
Address, Mark, Span, Passage, Range, Frame, Current, Point,
Destination, Bound, Anchor, Level, Last Traversal,
Narrow, Widen, Step, Target, Go, Enter, Exit, Focus, Repeat
```

Remove product-facing uses of:

```text
scope, region, clip, bookmark, cursor, lastPassage, savedRegions
```

## 6. Keyboard rhythm

```text
Q W E           Narrow Earlier / Widen / Narrow Later
Left Right      Step Earlier / Step Later
[ ]             Step-size preset down / up
, .             Previous Mark / Next Mark
M               Mark Current
S               Skim
Space           Play/Pause
T               Repeat Last Traversal
R / Backspace   Undo
Shift+Backspace Widen
Alt/Option+Up   Exit Context
Escape          clear transient state
```

## 7. Persistence migration

The first load of a video checks:

```text
binary-youtube-reader:v2:<videoId>
```

If absent, it reads:

```text
binary-youtube-reader:v1:<videoId>
```

Each old passage creates or reuses two endpoint Marks and creates one Span. Shared timestamps become shared Marks. The v1 record remains untouched after successful v2 persistence.

## 8. Final presentation patch

The branch-ready package also:

- appends `Level n` to Passage;
- appends `jumped` or `played` to Last Traversal;
- adds sighted hover titles to timeline Marks;
- tests Span rename and deletion;
- keeps Skim constrained to supported rates at or above 1×.

## 9. Verification

Automated:

```bash
npm run check
```

Expected output:

```text
All logic tests passed.
```

Manual smoke test:

1. Load a YouTube video.
2. Narrow twice, Widen, then Undo; the exact pre-Widen Frame returns.
3. Set Step to 5 seconds and verify Left/Right move exactly 5 seconds.
4. Press `M` at three positions; use `,` and `.` to traverse them.
5. Save Passage as a Span; Enter it, Widen inside it, then Exit.
6. Assign two Marks as Span Start and End and save the draft.
7. Reload the page and confirm Marks/Spans persist.
8. Load a video with v1 saved passages and confirm migration.

## 10. Deployment

No build step or backend is added. The existing Pages workflow remains valid. Merge only after `npm run check` and the smoke test pass on the feature branch.
