# Binary YouTube Reader — Canonical Specification

## 1. Authority

This document is normative for v6. Source time is the only persisted temporal truth. Traversal Time is a pure derived metric used for navigation and layout.

## 2. State

- **Range** — the admissible source extent. A proper subset of the video is also the native-playback loop operand.
- **Current** — committed semantic source Address.
- **Cursor** — transient observed player Address.
- **Resolution** — `{ backward, current, forward, level }`, stored in source Addresses and interpreted through the active traversal metric.
- **Working Interval** — source-contiguous coverage `{ start, end }` plus an active side, endpoint frames, and directed `{ departure, arrival }`; arrival is Current. During playback Current may be inside retained coverage, while departure remains the opposite stored boundary.
- **Pin** — a shared source Address with optional title.
- **Section** — an edge between two Pins with positive source duration, optional title, and independent `collapsed` flag.
- **Focus context** — the exact containing Range and presentation context restored by Unfocus.
- **Step Reach** — independent fixed seconds or an adaptive fraction of active projected Range width.

## 3. Two time spaces

```text
σ  source time     player, persistence, Range, Current, Cursor,
                   Working Interval, Pins, Sections, Field placement

τ  Traversal Time  operator distance, midpoint arithmetic, timeline layout
```

Let `F` be the normalized union of collapsed Section extents after transient materialization and Range intersection. Every maximal Fold `[a,b]` contracts to one lateral coordinate:

```text
τ(σ) = σ − measure(F ∩ [Range.start, σ))
```

The mapping is monotone and non-injective exactly on Folds. Its inverse requires directional affinity at a Fold coordinate: forward resolves to the later face and backward to the earlier face.

## 4. Fold law

A Fold is a vertical source ruler at one lateral Address:

- bottom is the earliest contributing endpoint;
- top is the latest contributing endpoint;
- contributor Sections retain their own coloured vertical extents;
- contributing boundary Pins remain sequential operands;
- unrelated interior Pins and open child Sections are hidden;
- no navigation operator samples the vertical continuum.

Plain Step and both Refine variants cross a Fold at zero lateral cost. Pin traversal visits its visible boundary Pins in source order. Starting exactly on a Fold exits from the directional face before applying lateral distance. Exact arrival at its lateral coordinate selects the approached face.

Fold and unfold never move source Addresses, Current, or the Working Interval.

## 5. Operator laws

### Refine

Refine chooses the directional midpoint of the active Resolution in Traversal Time, increases `level`, and retains the usable Working Interval departure:

1. use `Interval.departure` when `Interval.arrival === Current`;
2. otherwise use pre-movement Current;
3. retain the bounded anchor-to-arrival extent;
4. expand only the receding Resolution bound enough to contain that extent;
5. preserve the refinement increment.

A Fold has no interior midpoint in Traversal Time, so Refine cannot descend inside it.

### Local Refine (`Shift+Refine`)

Local Refine uses the same directional midpoint and child-frame calculation, then applies midpoint membership:

- a target inside the Working Interval shortens toward the opposite endpoint;
- exact coincidence with that opposite endpoint collapses the Interval;
- a target outside replaces the Interval with the complete Current-to-target movement.

Example on a normalized Range:

```text
Refine:        50 → 25 → 12.5    Interval 50 → 12.5, frame {0,12.5,50}
Local Refine:  50 → 25 → 12.5    Interval 25 → 12.5, frame {0,12.5,25}
reverse Refine target             31.25
```

### Step

Step translates Current by the effective Reach in Traversal Time, clamped to Range. It preserves a usable departure anchor, so repeated movements extend, shrink, collapse, and redraw one Working Interval predictably.

The approached Resolution endpoint remains fixed while its prospective midpoint has at least one complete Step of headroom. Once a further Step would consume that guard, only the approached endpoint advances far enough to put the next midpoint one Step ahead. The result depends on the gesture origin, final destination, and configured Reach—not tap cadence.

Step Reach is:

- fixed: independently entered directional seconds;
- adaptive: `projectedRangeWidth × fraction`, with supported presets `1/32`, `1/16`, and `1/8`, bounded by the canonical minimum and maximum.

Hold and Stretch cannot write Step Reach or configured Field Offset.

### Pin traversal

Pin traversal uses Step’s anchor rule but chooses the next visible Pin operand. A Fold contributes its ordered boundary Pins at one lateral coordinate; a forward sequence therefore visits lower then upper Pins, and backward reverses that sequence. Range Start and Range End participate as synthetic stops and are deduplicated by real Pins at the same address.

### Reopen

Reopen restores Resolution endpoints to Range around unchanged Current and preserves the Working Interval.

### Switch Endpoint

Switch swaps departure and arrival, makes the new arrival Current, and restores its endpoint frame. Ordered extent and source addresses remain unchanged. Two Switch operations restore the previous model exactly.

### Release

Release sets the Working Interval to null and moves nothing. Release with a null Interval creates no history entry.

### Transpose

Transpose requires a positive-duration Working Interval or a selected Section. It reuses Pins at exact endpoint Addresses, creates or reuses a Section when necessary, and toggles only that Section’s `collapsed` flag. It preserves the Working Interval.

### Focus / Unfocus

Focus installs a Section or Working Interval as Range. Focusing a transposed saved Section materializes its covered Fold contributors without mutating their flags. Selecting another Focus target while focused preserves the original containing Range. Unfocus restores that Range and presentation exactly.

### Go

Timeline Go targets visible Traversal Time. Guide Go targets an exact source object. Navigating to a hidden interior Pin or Section unfolds every covering contributor and commits that exact Go as one Undo transaction.

Every non-zero lateral Go records the complete departure-to-arrival Working Interval and seeds a movement-scale Resolution around it. In Traversal Time, the Interval is the central fifth of that frame: two Interval-width margins precede it and two follow it. Range clips unavailable margin without shifting the Interval or compensating on the other side. A zero-lateral hop between stacked Fold faces preserves the existing Resolution because it communicates no new lateral scale.

### Undo / Redo

Every semantic gesture creates at most one history entry. Fold/unfold, drag, cascade deletion, hidden-object Go, Focus, and Unfocus are each atomic.

Plain `Z` restores the preceding checkpoint. Plain `C` reapplies the next checkpoint. Any new semantic commit clears the Redo future.

## 6. Operator selection and placement

Each operator is optimal for one distinct intent. Shared state changes are consequences of that intent, not alternate meanings selected by presentation or Fold state.

| Intent | Optimal operator | Primary deformation |
|---|---|---|
| recursively inspect one side while retaining the traversed thread | Refine | Current + Resolution scale + retained Working Interval |
| locally trim or replace the traversed thread at the same midpoint | Local Refine | Current + Resolution scale + membership-governed Working Interval |
| move a known lateral distance without choosing a new scale | Step | Current + guarded Resolution endpoint + anchored Working Interval |
| move to the next retained landmark | Pin traversal | Step law with a discrete target, including stacked Fold faces and Range boundaries |
| abandon local discrimination while keeping place and coverage | Reopen | Resolution only |
| choose the other end of the same coverage | Switch Endpoint | Interval orientation + endpoint-owned Resolution frame |
| jump to an exact visible or retained Address | Go | Current + complete movement Interval + five-times movement frame |
| discard only the active traversal trace | Release | Working Interval only |
| remove understood duration from lateral competition | Transpose | derived projection topology only |
| make one extent the admissible world | Focus | Range + root Resolution + transient materialization |
| redefine admissibility directly | Range tools | Range + root Resolution |
| observe source continuity | Playback / Context | Cursor/runtime; playback settlement unions watched coverage |
| present mutually exclusive temporal context together | Stretch / Hold | live Field relation only |

The expected interaction frequency determines matrix placement rather than changing semantics. Directional Refine and Step are the frequent search/traversal surface; Reopen and Switch are their centered recovery/orientation operators; Release, Transpose, and Focus are less frequent lifecycle/topology operations. Exact Go and Range manipulation remain on the map and Range tools because they are direct spatial actions. Undo/Redo remain outside the matrix because they operate on history rather than video topology.

## 7. Range playback

Playback and Context are source-contiguous and projection-independent.

- Full-video Range plays to the source end and stops.
- A proper Range loops.
- Each wrap seeks to Range start, increments transport cycles, and resumes.
- A wrap commits no Current, Working Interval, Resolution, Context, or history.
- The wrap watchdog follows the current cycle entry at Range start rather than the original playback departure.
- Playback settlement commits the same coverage rendered live: the union of prior Working coverage and every watched source segment. It may preserve or extend coverage, never shorten it.

## 8. Guide lifecycle

```text
Pin Current       create/reuse Pin at Current
Save Section      create/reuse endpoint Pins and one Section
Join              create Section from two selected Pins
Rename            change optional title only
Fold / Unfold     toggle one Section
Move Pin          update every referencing Section
Move Section      translate only its two endpoint Pins
Delete Section    remove Section; clean up unshared untitled endpoint Pins
Delete Pin        dissolve all referencing Sections, remove Pin, clean up orphan endpoints
Overwrite         replace one Section extent from Working Interval
```

Arbitrary overlap, nesting, shared endpoints, and coincident extents are valid. Derived union geometry, not stored hierarchy, resolves overlapping folds.

## 9. Invariants

```text
Section.end > Section.start
Range.start <= Current <= Range.end
Working Interval ⊆ Range in source time
Working Interval ⊆ Resolution ⊆ Range in Traversal Time
Working Interval is one continuous source extent
fold → unfold preserves exact source state
playback and Context are source-contiguous under every Fold configuration
adaptive Step changes with projected Range width, not Field Offset
Release is the only operator whose sole effect is clearing the Working Interval
τ and Fold union are never persisted
```

Source-contiguous media behavior is the highest-priority invariant.
