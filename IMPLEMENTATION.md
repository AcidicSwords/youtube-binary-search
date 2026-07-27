# Binary YouTube Reader v5.1 — Implementation Notes

## Purpose of the refactor

The v5.1 audited refactor aligns implementation, vocabulary, control placement, keyboard geometry, and persistence around one ordered spatial grammar.

The application no longer presents one vocabulary in the kernel and another in the UI. Canonical names now propagate through modules, transaction labels, DOM IDs, status messages, Guide data, tests, and documentation.

## Semantic kernel

```text
Address
→ Current inside Range
→ Neighborhood at Resolution
→ movement derives Interval

Address → Pin
Interval → Section
Section → Range through Focus
```

### `range-geometry.js`

Provides the canonical spatial geometry kernel. It contains pure operations only:

```js
createRoot
getTargets
descend
refineNeighborhood
reopenToRange
canReopen
stepTarget
stepNeighborhood
settleContinuous
getActionRanges
logSpeed
chooseSupportedRate
```

It knows nothing about DOM, YouTube, persistence, Guide, or history.

### `guide.js`

Guide schema v5 uses Pins directly:

```text
pins[]
sections[].startPinId
sections[].endPinId
```

It owns endpoint reuse, visibility, adjacency, clustering, validation, and migration from pre-v5 point records.

### `session.js`

Session is the immutable semantic transaction layer. Its model contains:

```text
duration
range
resolution
focus
interval
guide
```

Every committed transformation adds one Return checkpoint unless it is a no-op. Coalesced Step amends one pending transaction rather than generating one entry per repeated key press.

## Transport boundary

`transport.js` defines one transient execution value:

```text
idle | context | continue | skim | loop
```

The command path is:

```text
browser intention
→ settle active transport
→ Session transaction
→ install semantic result
→ derive player effect
→ execute through YouTube adapter
→ project through View
```

Observation classes:

```text
Context
Loop
```

restore semantic Current on settlement.

Committing classes:

```text
Continue
Skim
```

commit actual Cursor movement on settlement.

## YouTube boundary

`youtube.js` remains the only module that touches raw IFrame methods and numeric player states. It exposes a small adapter:

```js
cue(videoId, startSeconds)
place(address)
play()
pause()
setRate(rate)
read()
```

`app.js` never calls raw `playVideo`, `pauseVideo`, `seekTo`, or `getCurrentTime` methods.

The adapter counts internal pause requests and avoids redundant pauses on already-settled states. This prevents delayed PAUSED events from being misclassified as user intent.

## View boundary

`view.js` owns presentation only:

- formatting;
- semantic state chips;
- timeline Range, Resolution, Interval, previews, and Pins;
- Pin clustering;
- Guide Sections and Pins;
- control enablement and destination metadata;
- semantic Current versus transient Cursor projection.

It receives state through a getter and does not mutate Session.

## Desktop interaction architecture

At widths above 1220 px, CSS places the working surfaces into three adjacent zones:

```text
reader surface | navigation deck | sticky Guide
```

Within the reader surface:

```text
video
observation dock
temporal map
secondary tools
```

Navigation remains sticky beside the video. This keeps Refine, Return, Reopen, Step, and Pin operations above the fold at a standard 1440×900 viewport.

The Navigation grid uses explicit named areas, enforcing:

```text
backward column | shared spine | forward column
```

At intermediate widths, Navigation returns below the player. At 900 px and below, Guide becomes a fixed off-canvas sheet.

## Touch behaviour

The mobile refactor does not disable page zoom.

```css
button,
summary,
select,
[role="button"] {
  touch-action: manipulation;
}
```

This prevents accidental double-tap zoom on rapid operator presses while preserving intentional pinch zoom.

The timeline uses:

```css
.timeline { touch-action: pan-y; }
.range-handle { touch-action: none; }
```

so a gesture beginning on the timeline may still scroll the page unless it begins on a draggable Range handle.

## Keyboard handling

The compact spatial key cluster mirrors the Navigation deck:

```text
W / A / S / D = Reopen / Refine Backward / Return / Refine Forward
```

Arrows perform Step; Shift+Arrows move among Pins. Only unmodified Step arrows repeat while held. Space does not intercept native activation when focus is already on a button or summary, preventing double execution.

Input, select, textarea, and contenteditable elements suspend global shortcuts. Escape leaves editing or settles transient UI.

## One-click retention

`Pin Current` creates or reuses an explicit Pin immediately. It no longer sends the user to a distant composer.

`Interval` is displayed beside Current and Resolution. Activating its state chip opens the inline Section capture bar in place. On save, the Guide selects Sections.

## Guide access

Desktop Guide is always present and sticky. The top Guide control and central Pins control select the relevant tab rather than hiding the rail.

Mobile Guide is an off-canvas sheet opened directly to Sections, Pins, or Sources. It preserves the reader’s page position.

## Source boundary

`source-field.js` remains separate from Guide and Session. It currently provides:

```js
createSourceField
normalizeTimedRecord
normalizeSourceField
parseTimestamp
parseDescriptionChapters
parseTimestampedText
recordsWithin
searchSourceRecords
potentialExtent
```

No undocumented transcript scraper, API credential flow, or automatic Guide population is included. Future adapters project source records through existing operators.

## Verification

`npm run check` performs:

1. syntax validation for every runtime module;
2. Range geometry tests;
3. Guide schema, migration, Pin, and Section tests;
4. Session, no-op, coalescing, and Return tests;
5. transport and Context-window tests;
6. source-field parsing and filtering tests;
7. DOM reference and canonical-vocabulary validation;
8. CSS spatial-layout and touch-contract validation;
9. startup smoke;
10. complete interaction smoke;
11. delayed-player Context and Loop startup, restoration, replacement, Return isolation, and startup-Pause smoke;
12. delayed YouTube metadata availability;
13. 25,000 deterministic semantic operations preserving model invariants.

A real-network browser smoke is still required for video-specific embedding permission, buffering, keyframe precision, and autoplay policy.


## v5.1 audit corrections

### Direct placement and native reconciliation

`seekPlayer()` is the only app-level physical-placement path. It records temporary programmatic ownership, acknowledges synchronous adapter placement, and prevents keyframe lag from becoming a false native Go.

Stable native YouTube scrubbing is settled and passed through `session.goTo()`. It therefore receives normal Range clamping, Resolution reopening, Interval derivation, and Return history.

### Gesture transactions

A pending Step stores its origin model and origin history. Opposed rapid Steps that return to that origin are cancelled as one net-zero gesture.

Range dragging is path-independent: every preview derives from the original model, not from the previous preview. Pointer cancellation and a handle returned to origin restore Range, Current, Focus, Resolution, Interval, and history exactly.

### Presentation truthfulness

`view.js` keeps semantic Current fixed and renders a separate Cursor only while the physical YouTube position differs. Resolution is shown as Range-level or as a count of refinements rather than an implementation-style level code. Pin Current disables only when Current is already an explicit Pin.

### Accessibility and focus

Timeline Pin clusters expose menu semantics, expanded state, arrow/Home/End navigation, Escape restoration, focus-leave dismissal, and outside-pointer dismissal.

Guide mutations deliberately restore focus to the recreated rename action or the relevant Guide tab after deletion. Compact Guide uses `inert`, focus trapping, and complete shortcut suspension.

### Persistence salvage

`sanitizeGuide()` now canonicalizes reversed Section endpoints, merges coincident Pins, rejects invalid references, and deduplicates equivalent labelled Sections while retaining every independent valid record.

## v5.2 comprehensive interaction patch

The v5.2 kernel adds `resolutionBasis: "range" | "movement"` to Session state without changing the Neighborhood object shape. This preserves geometry consumers and existing persisted Guide data.

`range-geometry.js` adds movement seeding and makes an out-of-Neighborhood Step derive a new local scale. `session.js` owns same-address null semantics, path-independent Step settlement, Interval containment under Range changes, administrative Focus relocation, wrapped-Continue clearing, stale-Focus reconciliation, and composite scope labels. `transport.js` keeps Skim at one selected supported rate.

`app.js` passes the origin Resolution through coalesced Step sequences, carries Resolution basis through Continue and Skim, and discloses implicit scope transitions in status text. `view.js` distinguishes Range and movement scale, disables Skim without a boosted rate, clears stale focused-Section presentation, and shows fixed-rate Skim metadata.

The new `v5.2-regression-tests.mjs` is part of `npm test`. Installation is transactional: the applicator verifies the exact v5.1 checksums, creates backups, runs the complete existing `npm run check`, and restores the original tree automatically on failure.

## v5.3 Step Field projection

`step-field.js` is a small physical projection layer around the existing Center player. It derives both side targets from `stepTarget(Current, Step Size, Range)`, owns only muted side-player synchronization and pane visibility, and never mutates Session.

```text
Session       semantic Current, Range, Resolution, Interval, Guide, Return
Transport     Context, Continue, Skim, Loop settlement
Step Field    Tail/Lead cursors, differential rates, hold and collapse state
View          existing semantic and timeline projection
```

The Center player remains authoritative. Side-player events cannot create Go, settle Transport, or update Current. The Field uses fixed conservative rates, exposes no separate distance setting, and adds only one Center-level toggle plus one collapse control per side.

