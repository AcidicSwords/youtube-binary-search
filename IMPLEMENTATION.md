# Guide v3 Implementation and Replacement Map

## Baseline

This replacement was built from the exact current `main` blobs:

```text
app.js       138b3426a5393122e8020722d4383fd60ff71ae3
index.html   82ed47e4882512c9812487e013989884008e223c
styles.css   b3cafa5e7f652330b16d2256694b1bf4f6704f8e
structure.js f27711e320634524b891f4d67dba07d86640487b
traversal.js e536495befefe60cf8cb97004557ed2378778a34
```

## Preserved mechanisms

The following working relationships remain:

- binary `Frame` geometry and Level;
- direct timeline click through binary descent;
- logarithmic Narrow Earlier/Later;
- fixed Step with rapid-action coalescing;
- Widen to Range while retaining Current;
- Skim fast-to-normal;
- Last Traversal provenance and Repeat looping;
- linked endpoint Marks for persistent bounded regions;
- per-video local persistence;
- v1 and v2 migration;
- static deployment with no dependencies or build step.

## Refactored mechanisms

### Resolution state

`state.stack` and Passage-level navigation history are replaced by one current `state.frame`. A single full-state Undo history now restores prior Frames and all other committed state.

### Direct traversal

Timeline clicks, Narrow, Mark navigation, Section midpoint navigation, Range midpoint, and adjacent Marks all converge on `commitSeekTraversal()`.

### Guide model

`structure.js` remains the replacement filename, but its internal contract is now:

```text
Guide = {version: 3, videoId, marks, sections}
```

Existing v2 Spans migrate to Sections. Sections continue to reference shared Marks.

### Focus

The former Context stack, Enter, Enter Here, Focus, and Exit system is replaced by:

```text
focusedSectionId
focusReturnRange
```

Focus snaps Section bounds to Range. Unfocus restores the prior Range.

### Unified Undo

Every committed operator records the same snapshot:

```text
Range
Frame
Focus state
Repeat Window
Guide
```

Rapid Step and continuous playback coalesce into one entry.

### Playback

Play loops Range instead of stopping at Range End. Repeat remains independent and loops Repeat Window.

## Removed interface and state

- Point row and marker;
- Passage terminology;
- Context and Exit;
- Span terminology;
- Anchor;
- Address-source selector;
- Save Passage / Save Range / Save Last Traversal split;
- selected Mark and selected Span state;
- role chips;
- Span endpoint draft;
- separate structural Undo button;
- Passage-bound mutation functions.

## New sidebar

The old Structure editor is replaced by Guide:

1. Add Mark at Current.
2. Save Repeat Window as Section.
3. Focused Section state and Unfocus.
4. Sections list with midpoint navigation, endpoint navigation, Focus, Rename, Delete.
5. Collapsed explicit/named Marks list with navigation, Rename, Delete.

## Visual clutter strategy

- automatic unnamed Section endpoints remain internal;
- only explicit or named Marks are shown globally;
- visible Marks cluster according to screen pixels;
- Section intervals are previewed only on row hover/focus;
- Repeat Window is always shown because it is immediately actionable;
- Focused Section needs no extra persistent bar because it is Range.

## File changes

### Replaced

- `app.js`
- `index.html`
- `styles.css`
- `structure.js`
- `traversal.js`
- `tests.mjs`
- `package.json`
- `README.md`
- `SPEC.md`

### Added

- `integration-check.mjs`
- `startup-smoke.mjs`
- `IMPLEMENTATION.md`
- `BRANCH_INSTALL.md`

### Unchanged

- `youtube.js`
- `favicon.svg`
- GitHub Pages workflow

## Verification

```text
All logic tests passed.
Integration check passed: 74 DOM references, 0 missing.
Startup smoke passed.
```

A real YouTube IFrame browser test is still required after copying because this environment cannot reliably complete an external embedded-player session.
