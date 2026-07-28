# Binary YouTube Reader — Canonical Specification

## 1. Authority

This document defines the current semantic and interaction contract. `IMPLEMENTATION.md` explains how the contract is realized. Historical behavior is not normative.

## 2. Primitive and ordered space

The primitive is a temporal Address `t` inside video duration `[0, D]`.

- **Current** is the committed Address from which semantic operators act.
- **Cursor** is a transient physical player position.
- **Range** is the sole hard admissible extent.
- **Resolution** is the current scale of discrimination.
- **Neighborhood** is the left/current/right structure at that Resolution.
- **Interval** is the last committed movement extent.
- **Pin** is a retained Address.
- **Section** is a retained explicit Extent whose endpoints are Pins.
- **Guide** is the video-specific collection of Pins and Sections.
- **Field Span** is the live Tail-to-Lead physical extent.

At rest, Cursor and Current coincide. Observation may separate them temporarily; Cursor is never stored in Session.

## 3. Global invariants

```text
Range.start ≤ Current ≤ Range.end
Range is the only hard Field boundary
linked Reach ⇒ backward Reach = forward Reach
0.25s ≤ each Reach ≤ 300s
Center is the only audible player
Tail and Lead never commit Current directly
Return restores semantic checkpoints, not transient transport
```

A null operation creates no history entry. A transient player event cannot privately redefine semantic state.

## 4. Semantic operators

### Go

Commits Current to a bounded Address. Direct timeline placement, Pin selection, source selection, and midpoint actions are projections of Go.

### Refine Backward / Forward

Selects one directional child of the current Neighborhood, commits its midpoint as Current, and increases Resolution.

### Reopen

Preserves Current and restores Range-level Resolution. Reopen broadens availability; it is not Return.

### Step Backward / Forward

Moves from Current by the corresponding directional Reach and clamps to Range. A committed movement derives an Interval. Rapid repeated Steps coalesce into one transaction.

### Return

Restores the complete previous semantic checkpoint: Range, Resolution, Current, Interval, Focus, Reach, and Guide when changed by that transaction.

### Focus / Leave Focus

Focus installs a Section as Range. Leave Focus restores the containing Range. Only explicit Range operations change Range.

### Pin Current / Save Section

Pin Current retains an Address. Save Section retains an explicit Interval or Held Field Span, reusing coincident endpoint Pins.

## 5. Observation and traversal

Transport has one kind at a time:

```text
idle | context | continue | skim | loop
```

- **Context** observes a bounded window around Current and restores Cursor to Current.
- **Continue** traverses forward through Range and commits actual movement on settlement.
- **Skim** traverses toward the forward refinement target at a supported boosted rate, then hands off to Continue.
- **Loop** repeats an immutable captured Interval or Field Span and restores Current when stopped.

Semantic operators may interrupt transport. Observational transport restores Current unless replaced by an immediate Go; committing transport records only movement already manifested.

## 6. Step Field

```text
Tail   ← Current →   Lead
slower     1×        faster
muted   audible      muted
```

Field targets are:

```text
Tail target = max(Range Start, Current − Backward Reach)
Lead target = min(Range End, Current + Forward Reach)
```

Resolution never clips the Field.

Field phases are:

```text
Off → Coincident → Unfolding → Partially Held → Held
                         ↘ Suspended ↗
```

A forming side resolves through Go to its observed Cursor. A Held side resolves through directional Step to its semantic target.

Tail accepts supported rates below `1×`; Lead accepts supported rates above `1×`. Requested and actual rates remain distinct. Missing directional rates produce an unavailable side. Autoplay rejection produces a blocked side.

Changing rate is kinetic and preserves Field geometry. Enabling/disabling the Field or hiding/showing a pane is structural and re-establishes it.

## 7. Transport authority

Application Continue is the authoritative three-pane start gesture:

```text
settle prior transport
→ establish Continue
→ prepare available Tail and Lead
→ request side playback
→ start Center
→ verify actual states
```

Native Center Play remains supported but side activation is best effort because browser policy may treat later side-player requests differently.

With Step Field disabled, the application is observationally equivalent to the stable single-player reader.

## 8. Persistence

Guide data is stored per video. Preferences store Context duration, directional Reach, last edited Reach side, Field response, and pane visibility.

Legacy scalar `stepSeconds` is accepted only at the persistence migration boundary and becomes equal linked directional Reach before entering Session. Runtime Field APIs accept directional Reach only.

Actual rates, buffering, blocked state, Cursors, and Field phases are runtime-only.

## 9. Interface grammar

The interface has one ordered composition:

```text
Panoramic media
→ playback and live operands
→ full-width temporal map
→ Parameters | Operator matrix | Guide
```

The centered operator matrix is:

```text
        W
     A     D
     ←  S  →
    ⇧←  P  ⇧→
```

Step Reach, Range tools, Context duration, and Skim rate are parameters and therefore remain outside the matrix. Guide is the sole retained-structure surface; no duplicate retained-Pins access button belongs in the matrix. Focused Section state is shown in Guide rather than in playback controls.

`INTERFACE.md` defines the presence test for every visible element: removing an element must remove a concrete operation, conceal state required to predict one, or erase feedback needed to distinguish semantic commitment from physical observation.

On compact screens, Guide becomes an off-canvas sheet. On phones, Center, Tail, and Lead stack vertically; side-player viewports retain the minimum dimensions needed for IFrame capability reporting.

All visible controls, statuses, code, and documentation use the same vocabulary.

## 10. Non-contracts

The following are not current contracts:

- scalar runtime Step size;
- Resolution as a Field boundary;
- fixed immutable Tail/Lead rates;
- native Center Play as the sole transport authority;
- side Cursors as semantic history;
- implicit retention of Field Span;
- chronological documentation that competes with the current specification.
