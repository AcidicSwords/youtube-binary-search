# Binary YouTube Reader — Canonical Specification

## 1. Authority

This document is normative for v7. Source time is the only persisted temporal truth. Timeline Space is a pure derived spatial coordinate for navigation and layout.

## 2. State

- **Range** — the admissible source extent. A proper subset of the video is also the native-playback loop operand.
- **Current** — committed semantic source Address.
- **Cursor** — transient observed player Address.
- **Resolution** — `{ backward, current, forward, level }`, stored in source Addresses and interpreted through Timeline Space.
- **Working Interval** — source-contiguous coverage `{ start, end }` plus active side, endpoint frames, and directed `{ departure, arrival }`.
- **Pin** — a shared source Address with optional title.
- **Section** — an edge between two Pins with positive source duration, optional title, and one canonical timeline `weight`.
- **Focus context** — the containing Range restored by Unfocus.
- **Step Reach** — independent fixed timeline units or an adaptive fraction of active weighted Range width.

## 3. Source time and Timeline Space

```text
σ  Source Time      player, persistence, Range, Current, Cursor,
                    Working Interval, Pins, Sections, Field geometry

x  Timeline Space   map position, Step distance, Refine midpoints,
                    adaptive Reach and visual layout
```

Each Section weight is selected from:

```text
W = {0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2}
```

The set deliberately mirrors the familiar Tail/Lead rate scale, but the values act on different axes. Section weights have no playback or Field effect.

At source Address \(u\), let the effective spatial density be the product of every Section weight covering that Address:

\[
\rho(u)=\prod_{S_i \ni u} w_i
\]

With an empty product equal to one, Timeline Space is:

\[
x(\sigma)=\int_0^\sigma \rho(u)\,du
\]

This is equivalent to a piecewise-linear map whose slope changes only at Section endpoints. Because every factor is positive, \(x\) is continuous, strictly increasing, and has one ordinary inverse. No source Address can coincide with, hide behind, or become unreachable from another.

For one isolated Section of source duration \(d\), its timeline extent is \(w d\). Overlapping scales compose multiplicatively because independent spatial scale transforms compose by multiplication. The selected Section values remain canonical even when their local product is outside the selector ladder.

## 4. Section-weight law

Changing a Section weight:

- moves no Pin, Section endpoint, Range boundary, Current, Cursor, Resolution Address, or Working Interval Address;
- changes only the derived Timeline Space positions and distances;
- never changes source duration, playback rate, playback order, Context, or Field Offset;
- preserves ordinary source order and direct reachability;
- becomes spatially neutral at `1×`.

The gradient is the visible expression of the same weight, not a second value:

- compression converges inward below `1×`;
- expansion opens outward above `1×`;
- `1×` renders as a neutral span.

## 5. Operator laws

### Refine

Refine chooses the directional midpoint of the active Resolution in Timeline Space, increments `level`, and retains the usable Working Interval departure until the new movement reaches it:

1. use `Interval.departure` when `Interval.arrival === Current`;
2. if the Current-to-target path reaches or passes that departure, rebase at pre-movement Current;
3. otherwise retain the departure;
4. bound the resulting departure-to-arrival extent;
5. expand only the receding Resolution bound enough to contain it;
6. preserve the refinement increment.

Positive Timeline Space guarantees a valid spatial midpoint for every positive source span.

### Local Refine (`Shift+Refine`)

Local Refine uses the same directional midpoint and child-frame calculation, then applies midpoint membership:

- a target inside the Working Interval shortens toward the opposite endpoint;
- exact coincidence with that endpoint collapses the Working Interval;
- a target outside replaces it with the complete Current-to-target movement.

Example on an unweighted normalized Range:

```text
Refine:        50 → 25 → 12.5    Interval 50 → 12.5, frame {0,12.5,50}
Local Refine:  50 → 25 → 12.5    Interval 25 → 12.5, frame {0,12.5,25}
reverse Refine target             31.25
```

Weighting changes which source Address occupies a spatial midpoint; it does not add an operator exception.

### Step

Step translates Current by the effective Reach in Timeline Space and clamps the result to Range. It preserves a usable departure, so repeated movements extend, shrink, collapse, and redraw one Working Interval predictably.

The approached Resolution endpoint remains fixed while its prospective midpoint has at least one complete Step of headroom. Once a further Step would consume that guard, only the approached endpoint advances far enough to restore one Step of midpoint headroom.

Step Reach is:

- fixed: independently entered backward and forward spatial distances;
- adaptive: `weightedRangeWidth × fraction`, with `1/32`, `1/16`, and `1/8`.

Hold, Stretch, and Section weight editing cannot write Step Reach.

### Pin traversal

Pin traversal applies Step’s interval-anchor law to the next source-ordered retained Pin. All Pins remain visible operands. Range Start and Range End are synthetic stops and are deduplicated by real Pins at the same Address.

### Reopen

Reopen restores Resolution endpoints to Range around unchanged Current and preserves the Working Interval.

### Switch Endpoint

Switch swaps departure and arrival, makes the new arrival Current, and restores that endpoint’s frame. Ordered extent and source Addresses remain unchanged. Two Switch operations restore the previous model exactly.

### Release

Release sets the Working Interval to null and moves nothing. Release with a null Working Interval creates no history.

### Deform

Deform requires a positive-duration Working Interval or a selected Section and a canonical weight:

- it reuses exact endpoint Pins;
- creates or reuses the matching Section when necessary;
- assigns the selected Section weight;
- preserves the Working Interval;
- makes `1×` neutral without deleting the Section.

Changing weight on the timeline or in Guide is the same Session transaction.

### Focus / Unfocus

Focus installs a Section or Working Interval as Range without changing any Section weight. Unfocus restores the containing Range exactly.

### Go

Timeline Go converts one visible Timeline Space coordinate through the unique inverse. Guide Go targets an exact source object. Neither mutates Section weights.

Every non-zero Go records the complete departure-to-arrival Working Interval and seeds a movement-scale Resolution around it. In Timeline Space, the Working Interval occupies the central fifth: two equal Interval-width margins precede it and two follow it. Range clipping removes unavailable margin without shifting the Interval or compensating on the other side.

### Undo / Redo

Every semantic gesture creates at most one history entry. Deform, weight editing, drag, cascade deletion, Focus, and Unfocus each commit as one Undo transaction.

Plain `Z` restores the preceding checkpoint. Plain `C` reapplies the next checkpoint. Any new semantic commit clears the Redo future.

## 6. Operator selection and placement

Each operator is optimal for one distinct intent:

| Intent | Optimal operator | Primary transformation |
|---|---|---|
| inspect one side recursively while retaining the traversed thread | Refine | Current, Resolution scale, retained Working Interval |
| trim or branch locally at the same midpoint | Local Refine | Current, Resolution scale, membership-governed Working Interval |
| move a known spatial distance without choosing a new scale | Step | Current, guarded Resolution endpoint, anchored Working Interval |
| move to the next retained landmark | Pin traversal | Step law with a discrete source target |
| abandon local discrimination while preserving place and coverage | Reopen | Resolution only |
| work from the opposite boundary of the same coverage | Switch Endpoint | Interval orientation and endpoint frame |
| map an exact movement | Go | Current, complete movement Interval, five-times frame |
| discard only the traversal trace | Release | Working Interval only |
| allocate more or less map space to fixed content | Deform | one Section’s spatial weight |
| make one extent the active world | Focus | Range and root Resolution |
| redefine admissibility directly | Range tools | Range and root Resolution |
| observe source continuity | Playback / Context | Cursor and runtime; settlement unions watched coverage |
| present mutually exclusive temporal context together | Stretch / Hold | live Field relation only |

Directional Refine and Step occupy the frequent search surface. Reopen and Switch are recovery/orientation operations. Release, Deform, and Focus are less frequent lifecycle/spatial operations. Undo and Redo remain outside the matrix because they operate on history.

## 7. Playback and Context

Playback and Context are source-contiguous and independent of Timeline Space.

- Full-video Range plays to source end and stops.
- A proper Range loops.
- Each wrap seeks to Range start, increments transport cycles, and resumes.
- A wrap commits no Current, Working Interval, Resolution, Context, or history.
- The watchdog follows the current cycle entry rather than the original departure.
- Playback settlement unions prior Working coverage with every watched source segment; it never shortens coverage.

## 8. Guide lifecycle

```text
Pin Current       create or reuse a Pin at Current
Save Section      create or reuse endpoint Pins and one Section
Join              create a Section from two selected Pins
Rename            change optional title only
Set Weight        assign one canonical spatial factor
Move Pin          update every referencing Section
Move Section      translate only its two endpoint Pins
Delete Section    remove Section and unshared untitled endpoint Pins
Delete Pin        dissolve all references and clean up orphan endpoints
Overwrite         replace one Section extent from the Working Interval
```

Arbitrary overlap, nesting, shared endpoints, and coincident extents are valid. The effective density is derived from independent Section factors; no stored hierarchy or priority is introduced.

## 9. Invariants

```text
Section.end > Section.start
Section.weight ∈ W
effective spatial density > 0
Range.start <= Current <= Range.end
Working Interval ⊆ Range in source time
Working Interval ⊆ Resolution ⊆ Range in Timeline Space
Working Interval is one continuous source extent
every source Address has one timeline position and one inverse
playback, Context, and Field geometry are source-time operations
adaptive Step changes with weighted Range width, not Field Offset
Release is the only operator whose sole effect is clearing the Working Interval
Timeline Space is derived and never persisted
```

Source-contiguous media behavior and strict spatial invertibility are the highest-priority invariants.
