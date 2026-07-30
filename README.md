# Binary YouTube Reader

Binary YouTube Reader is a spatial interface for resolving long videos. It keeps one exact source-time model while letting the reader refine a neighborhood, draw a Working Interval, retain Pins and Sections, and transpose settled Sections out of lateral navigation.

Transposition is non-destructive. A folded Section has zero lateral distance, but its earlier and later endpoint Pins remain sequential on a vertical rail. Operators cross the knot without spending the hidden duration; native playback and Context still play every source frame.

## The operator matrix

```text
Refine Backward   Reopen             Refine Forward
Step Backward     Switch Endpoint    Step Forward
Release           Transpose          Focus / Unfocus
```

The physical arrangement is also the keyboard arrangement:

```text
Q W E
A S D
R T F
```

Shift changes the two directional operator families:

- Plain `Q/E` Refine retains the Working Interval’s departure anchor while increasing logarithmic resolution. If a reversal reaches or passes that anchor, the complete Current-to-target movement becomes the new Working Interval.
- `Shift+Q/E` invokes Local Refine. It uses midpoint membership to shorten an existing Working Interval or replace it with the new local traversal.
- `Shift+A/D` or `Shift+←/→` traverses Pins. Consecutive Pin hops use Step’s retained-anchor rule, so they compose into one Working Interval.

The remaining operators are deliberately small:

- Reopen restores the Resolution endpoints to the active Range.
- Switch Endpoint swaps the Working Interval’s directed endpoints without changing its ordered extent.
- Release clears the Working Interval and does nothing when there is none.
- Transpose saves or reuses the Working Interval’s endpoint Pins and Section, then folds that Section. On a selected Section it toggles only that Section.
- Focus clamps Range to a Working or saved Section. A transposed Section materializes while focused; Unfocus restores both the containing Range and its previous presentation.
- Undo and Redo are outside the matrix on plain `Z` and `C`.

## Step size

Step size is independent from the three-player Field.

- Manual mode accepts a lateral distance in seconds.
- Range-relative mode derives the distance from the active Range’s current lateral width.
- The `1/32`, `1/16`, and `1/8` presets make the adaptive interval easy to change. Bracket shortcuts cycle the same presets.
- Hold and Stretch change only the live Tail/Lead relation. They never overwrite configured Offset or semantic Step size.

Adaptive size is recomputed after Focus, Unfocus, or transposition because those operations change the active lateral Range. The stored fraction does not change.

## Pins, Sections, and Folds

Pins are shared source Addresses. Sections are edges between two Pins; endpoint ownership is not duplicated.

- Sections may overlap, nest asymmetrically, share endpoints, or coincide.
- Folding one Section never changes another Section’s persisted fold flag.
- Overlapping folded Sections form one derived maximal Fold rail while retaining separate coloured contributor rails and identities.
- A Pin strictly inside a Fold is hidden from lateral traversal. Direct Guide navigation to it unfolds the covering contributors and completes the exact Go in one Undo transaction.
- Range Start and Range End are synthetic Pin-traversal stops, deduplicated when a real Pin already exists there.
- Moving a shared Pin updates every referencing Section.
- Moving a Section translates only its two endpoint Pins; unrelated Pins inside its span are not captured.
- Deleting a referenced Pin previews the affected count, dissolves all referencing Sections, and cleans up orphaned untitled endpoint Pins in one transaction.

The Fold rail is a source-time ruler rotated vertically at one lateral coordinate. Its bottom endpoint is earlier and its top endpoint is later. Plain Step and either Refine form treat that rail as zero lateral distance. Pin traversal visits the stacked endpoints sequentially. No operator moves through the rail’s interior.

The timeline remains full width. It separates open Section lanes, the Fold stage, the semantic track, the source ruler, and free Pins into collision-aware bands. It shows adaptive major/minor source-time guides, active Range and Resolution, Working Interval, exact action previews, transposed contributor rails, shared Pins, Current, and the observed playback Cursor. Its height follows the actual lane and Fold density instead of overlapping excess structure.

## Playback and Context

Current is committed semantic position. Cursor is observed physical position.

Native playback and automatic Context are source-contiguous under every Fold configuration. A proper focused Range loops automatically; the full video Range stops at its end. A wrap:

- appends no history;
- commits no Current or Working Interval;
- rebases the existing Field relation once;
- resumes at Range start.

Playback coverage is monotonic: settling playback preserves or extends the Working Interval with every watched source segment and never shortens it. Folding therefore changes navigation and presentation, never audio or media order.

## Step Field

Center is the audible player. Tail and Lead are optional muted projections around it.

- Offset is physical Field spacing, not Step size.
- Stretch forms a side relation during genuine Center playback.
- Hold freezes the live measured relation at `1×` without saving it into the Offset controls.
- Side surfaces and local Step buttons invoke semantic Step using the visible differential.
- Context suspends the side projections and cannot be mistaken for a stored Field relation.

All arrow, keyboard-matrix, local-button, and side-surface Step gestures share one cadence and one Undo boundary.

## Run locally

Serve the directory over HTTP and open it in a modern browser:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

Run the release gate with:

```bash
npm run check
```

## Canonical project documents

- `SPEC.md` — normative state, geometry, and operator laws
- `IMPLEMENTATION.md` — module ownership and transaction architecture
- `INTERFACE.md` — visible grammar and direct manipulation
- `DEVELOPMENT.md` — contribution constraints and test map
- `VALIDATION.md` — automated and manual release gates
