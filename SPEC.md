# Binary YouTube Reader — Canonical Specification v5.1

## 1. Primitive

The sole semantic primitive is a temporal **Address**:

\[
t \in [0,D]
\]

where \(D\) is video duration. Every semantic object is an Address, a bounded relation between Addresses, or a transformation of those values.

## 2. Ordered space

### Current

\[
C \in Range
\]

Current is the settled Address from which operators act.

### Range

\[
Range=[A,B], \qquad 0\le A<B\le D
\]

Range is the complete bounded extent currently available. The full video is the default Range. Focusing a Section makes that Section the active Range.

### Neighborhood and Resolution

\[
N=(L,C,R,\ell)
\]

subject to:

\[
A\le L\le C\le R\le B
\]

Neighborhood is the recursively restricted part of Range presently under examination. \(\ell\) is Resolution Level. Greater \(\ell\) represents finer recursive distinction.

### Interval

A committed movement from departure \(x\) to arrival \(y\), where \(x\ne y\), derives:

\[
I=[\min(x,y),\max(x,y)]
\]

Interval also records:

```text
departure
arrival
operator
medium: direct | continuous
direction: backward | forward
```

Interval is transient. It can be Loop-ed or retained as a Section.

### Pin

A Pin is one persistent Address.

### Section

A Section is one persistent named bounded extent whose endpoints are shared Pins. Start, End, midpoint, and duration are derived from those endpoint Pins.

### Guide

Guide is the persistent per-video structure:

```text
Guide = Pins + Sections
```

### Source

A Source is external read-only temporal structure such as a chapter or transcript cue. Source records remain potential structure until an explicit Guide transaction retains them.

## 3. Direction

Forward and Backward are defined by reading order, not by screen geometry.

```text
video timeline: Forward → right
vertical document: Forward → down
```

The vocabulary therefore remains valid across layouts.

## 4. Semantic transformations

### Go

Direct placement establishes Current at a selected Address \(x\):

\[
Go(x): C\rightarrow x
\]

Timeline click, Pin selection, source cue selection, Section midpoint, and Range midpoint are projections of Go.

Go is scale-independent. Even when \(x=C\), Go reopens a refined Neighborhood to Range-level Resolution. Because the Address did not change, this scale-only transformation preserves the existing Interval and does not create a false movement.

### Refine Backward / Forward

Let:

\[
T_B=\frac{L+C}{2}, \qquad T_F=\frac{C+R}{2}
\]

Refine chooses the corresponding directional target, restricts Neighborhood toward that side, and increments Resolution Level.

```text
Refine Backward:
  Current becomes T_B
  Neighborhood becomes [L, previous C]
  Resolution Level increases

Refine Forward:
  Current becomes T_F
  Neighborhood becomes [previous C, R]
  Resolution Level increases
```

Binary subdivision is implementation. The semantic operation is directional refinement: restricting Neighborhood to gain Resolution.

### Reopen

\[
Reopen(L,C,R,\ell)=(A,C,B,0)
\]

Reopen preserves Current, escapes recursive restriction, and restores the entire active Range as available Neighborhood.

Reopen is not Return. It constructs broader availability around the present Current rather than restoring an earlier state.

### Step Backward / Forward

For configured distance \(\delta>0\):

\[
Step_B(C)=\max(A,C-\delta)
\]

\[
Step_F(C)=\min(B,C+\delta)
\]

Step translates Current locally without intentionally increasing Resolution. If the destination remains inside Neighborhood, its existing bounds are preserved. If Step exits Neighborhood, Resolution reopens to Range around the destination.

Rapid repeated Steps coalesce into one departure, one Interval, and one Return entry.

### Return

Return restores the complete model stored by the latest committed semantic transaction:

```text
Range
Neighborhood / Resolution
Current
Interval
Focus
Guide, when the transaction changed Guide
```

Context and other transient transport states never enter Return history.

### Focus / Leave

Focus applies one Section as Range while retaining the Range to restore later. If prior Current lies outside the Section, Current relocates to the Section midpoint and produces an ordinary Go Interval.

Leave restores the retained Range. It physically relocates Cursor only if the restored Range displaces Current.

### Pin Current

Pin Current retains Current as an explicit Pin. A coincident Pin is reused rather than duplicated.

### Save Section

Save Section retains the current Interval. Its endpoints are resolved through shared Pins; coincident endpoint Pins are reused.

## 5. Physical execution

The YouTube iframe has an internal physical playhead or Cursor \(P\):

\[
P\in[0,D]
\]

At rest:

\[
P=C
\]

During transient observation:

\[
P\ne C
\]

Cursor is never stored in Session.

The temporal map projects both values when they differ: Current remains fixed as the semantic reference, while Cursor indicates the material physically unfolding.

One transport value describes current execution:

```text
idle
context
continue
skim
loop
```

### Context

A direct movement may derive a local observation window around Current:

\[
Context_\delta(C)=[C-p,C+(\delta-p)]\cap Range
\]

The window shifts at Range boundaries to preserve as much requested duration as possible.

Settlement:

```text
unfold local window
→ pause
→ restore Cursor to Current
→ idle
```

Context does not mutate Session.

### Continue

Continue unfolds normally forward through Range. It wraps Range End to Range Start. When paused, actual movement is committed as one continuous Interval. Crossing the current Neighborhood reopens Resolution to Range.

### Skim

Skim targets the forward Refine destination. Unfolding rate decreases logarithmically from the configured maximum toward `1×`. On reaching the target, it continues normally until stopped. Actual movement is committed.

### Loop

Loop repeatedly unfolds the current Interval. It is observational; stopping restores Cursor to Current and does not mutate Session.

### Pause

Pause settles the active transport according to its class:

```text
Context / Loop → restore Current
Continue / Skim → commit physical movement
```

## 6. Interruption

Transport is not a modal lock. Any semantic operator may interrupt it.

- A new Go replaces active Context directly without first returning visibly to the old anchor.
- Context and Loop restore Current unless replaced by an immediate new Go.
- Continue and Skim commit the movement already manifested.
- The requested operator then runs normally.

## 7. Potential source field

A normalized source record has the form:

```js
{
  id,
  kind: "chapter" | "transcript",
  start,
  end,
  text,
  source,
  sourceId,
  language
}
```

It supplies:

```text
start / end → potential Pins
[start, end] → potential Section
text → timed semantic content
```

Source records:

- do not enter Guide automatically;
- do not add Return history;
- do not alter Range or Resolution merely by existing;
- may be searched, filtered by extent, previewed, or projected into existing Go, Focus, Pin, and Save Section operations.

## 8. Interface grammar

The desktop Navigation deck has three invariant columns:

```text
BACKWARD              SHARED               FORWARD
```

Its vertical grammar is:

```text
                         Reopen
Refine Backward          Return           Refine Forward
                       Step size
Step Backward                              Step Forward
                       Pin Current
Pin Backward              Pins             Pin Forward
```

Reopen is adjacent to the Refine pair but not between it. Step size is adjacent to the Step pair but not between its directional actions. Pin Current occupies the same shared spine. Return remains central and prominent.

On wide desktop:

```text
Video + temporal map | Navigation | Guide
```

On compact screens, Guide becomes an off-canvas sheet while the operator grammar remains unchanged.

## 9. Keyboard grammar

```text
    W Reopen
A Refine Backward   S Return   D Refine Forward

← Step Backward                 Step Forward →
Shift+← Pin Backward            Pin Forward Shift+→
```

Additional direct operations:

```text
P Pin Current
C Context
Space Continue / Pause
F Skim
L Loop
G Guide
[ ] Step size
Ctrl/Cmd+Z or Backspace Return
Escape stop or close
? help
```

Only unmodified Step arrows repeat while held.

## 10. Interaction integrity

### Native YouTube controls

A stable native YouTube scrub is reconciled through ordinary Go after a short settlement window. The destination is clamped to Range. App-generated placements carry temporary ownership so keyframe delay is not misread as user intent; ownership ends as soon as the adapter reports the requested Address.

### Coalesced gestures

Rapid Step presses share one departure and one Return checkpoint. If the net sequence returns to the original Range, Neighborhood, Resolution, Current, and Focus, the pending transaction is discarded entirely.

Range-handle preview is derived from the drag origin on every pointer movement. Returning the handle to its origin restores the exact starting model and adds no Return checkpoint.

### Modal ownership

A compact Guide or Guide edit dialog owns pointer, focus, and keyboard interaction. Background spatial commands are suspended. Escape closes one active layer at a time.

### Persistence recovery

Guide loading salvages valid Pins and Sections independently. Coincident Pins are merged, reversed Section endpoints are reordered by Address, duplicate Sections are removed, and invalid records are discarded without invalidating unrelated retained structure.

### Asynchronous player boundaries

Context, Loop, Continue, and Skim tolerate delayed player placement. Initial placements are retried only after a grace period. Internal PAUSED events are counted and bounded so delayed adapter events cannot cancel a later transport. Video duration is retried before a zero-duration load is rejected.

## 11. Persistence

Canonical Guide schema version is 5:

```js
{
  version: 5,
  videoId,
  pins: [],
  sections: [],
  updatedAt
}
```

Storage key:

```text
binary-youtube-reader:v5:<videoId>
```

Legacy v4, v3, v2, and v1 records are read and migrated. Their original keys remain untouched.
