# Video Cartography — Canonical Implementation

This document describes the release behavior implemented by version 8.0.0. It
is a module and ownership map, not a history of earlier designs.

## Ownership

| Owner | Sole responsibility |
|---|---|
| `range-geometry.js` | Pure Range, Resolution, Refine, Step-neighborhood, and interval geometry |
| `session.js` | Canonical semantic model, operator transactions, endpoint frames, Undo/Redo, Focus, and Guide transactions |
| `guide.js` | Pin graph, Section and Group lifecycle, canonical Weight values, validation, migration, and Group-deletion planning |
| `operator-grammar.js` | Frozen proof fixture for matrix identities, keys, areas, and shifted meanings |
| `timeline-projection.js` | One positive source-time ↔ Timeline-Space map compiled from the effective contributors |
| `transport.js` | Transient Context and Playback state, observation policy, requested-rate policy, and retry/wrap rebasing |
| `youtube.js` | YouTube player construction, actual media snapshots, actual-rate events, and adapter commands |
| `step-gesture.js` | Step press, repeat, release, and one-transaction gesture timing |
| `field-frame.js` | Pure Field Frame ownership, identity, direction, and transition descriptions |
| `step-field-geometry.js` | Pure Field offsets, breathing phases, bounds, and rate pairs |
| `step-field.js` | Tail/Lead players, placement, Field transitions, Breath runtime, Hold, and stale-event rejection |
| `cues.js` | Parsing offered chapter Addresses into transient candidate extents |
| `user-time.js` | The append-only encounter ledger: traversal records, the frozen readable stream, read cursors, and Ghost injection |
| `view.js` | DOM projection, timeline atmosphere and contours, Guide rows, operator labels, and accessible state |
| `app.js` | Composition, interaction acquisition, source generations, persistence, transient ownership, and adapter effects |

The pure semantic modules do not read the DOM or issue media commands. The
Field controller receives resolved source Addresses; it does not import Guide
topology or operator arithmetic. The YouTube adapter is the only module that
constructs `YT.Player`.

## Canonical model and transactions

Source time is the only stored temporal coordinate. A Session model contains
duration, Range, Current within a Resolution, the optional Working Interval,
Focus, Step Reach, Guide, and the last semantic operator. Pins and Section
endpoints are source Addresses. Timeline coordinates, lanes, gradients, hover
state, open panels, and deformation bypass are never stored in the model.

A semantic mutation follows one route:

```text
snapshot the current model
→ apply one pure candidate mutation
→ reconcile Focus and Working-Interval endpoint frames
→ validate Range and Guide invariants
→ append at most one history checkpoint
→ publish adapter effects from the accepted result
```

Session history is bounded to 100 entries. A new commit clears the Redo future.
Presentation-only consequences do not manufacture history: releasing only an
acquired Timeline operand and toggling deformation bypass are examples.

The Working Interval is the contiguous residue left by excluding alternatives.
Its compact endpoint representation records bounds, orientation, active side,
and endpoint frames; no persistent Path or exclusion ledger exists. Refine,
Step, Switch Endpoint, direct manipulation, retained extents, and Playback all
resolve to that same representation. Reopen and Undo restore previously
excluded alternatives or prior state. Release clears the residue without
deleting retained topology.

Step commits its first movement immediately and amends that transaction for the
rest of the gesture. The pending gesture alone records `visitedMinimum` and
`visitedMaximum`. Settlement labels the transaction by net direction; if it
returns to its departure after visiting a positive extent, `Step Reversal`
retains that extent as the same contiguous Working Interval. The envelope is
then discarded.

## Operator routes

The physical, visible, and keyboard matrix is exactly:

```text
Q  Refine Backward    W  Reopen            E  Refine Forward
A  Step Backward      S  Switch Endpoint   D  Step Forward
R  Release            T  Tag               F  Focus / Unfocus
```

`Shift+Q/E` invokes Local Refine, `Shift+A/D` traverses to the previous or next
visible Pin stop, `T` tags Current as a Pin, and `Shift+T` tags a positive
Working Interval as a Section. Button and key routes call the same functions.
Duplicate Tag selects the exact existing result rather than creating another.

The matrix and Guide each own an independent one-shot Shift latch. Physical
Shift is global and consumes neither latch. `consumeShiftLayer(owner)` clears
only the latch that supplied the modified action. Alt carries an acquired
retained object through compatible movement without changing the base operator.

Release clears a semantic Working Interval through Session and separately
clears the acquired Timeline operand. The semantic change is Undoable; a
selection-only release is not. Bare Timeline Go clears the acquired operand
before navigating. Guide focus remains independent in both cases.

## One effective projection

`createTimelineProjection()` compiles one immutable map for a render or
operation:

```text
active Groups and their Sections
→ remove the current deformation-bypass scope
→ discard neutral 1× contributors
→ split source time at effective Section boundaries
→ multiply covering positive factors per segment
→ integrate density into Timeline Space
→ expose one forward/inverse mapping and effective contributors
```

Every canonical Section Weight belongs to the `0.125×–4×` ladder and every
segment product is positive. Timeline Space is therefore continuous, strictly
increasing, and singly invertible. Overlaps compose by multiplication without
priority or stored hierarchy.

The projection exposes its effective `segments`, `weightedSections`, and
resolved `deformationBypass`, together with source/timeline conversion,
distance, midpoint, Step target, Pin-stop ordering, projected extents, and
`weightAtSource()`. Step, Refine, adaptive Reach, hit testing, drag conversion,
spatial readouts, exact contours, atmosphere, and explicitly dynamic Playback
all consume this same object. No consumer rereads raw Guide Weight to decide
what counts.

Focus changes only the drawn viewport. The focused extent fills the timeline,
but the viewport cannot alter map density or operator arithmetic.

### Deformation bypass

The application owns one source-scoped transient value:

```js
null
{ kind: "all" }
{ kind: "section", sectionId }
```

`X` resolves its scope from the acquired Timeline Section, otherwise the whole
map. Repeating the same scope restores it; choosing another transfers the one
active bypass. The value is neither persisted nor recorded in history. It
self-clears when its target disappears and clears at the source boundary.
Active direct manipulation must finish or cancel first; pending Step and Nudge
settle before the map changes. Playback continues. The command itself issues no
player command, although a dynamic rate policy may read the changed projection
on a later tick.

Because `view.js` draws atmosphere from `projection.weightedSections`, a whole-
map bypass yields even contours and no compression/expansion atmosphere while
stored Section wires and Guide Weight values remain intact. A Section-scoped
bypass removes only that contributor; overlapping contributors remain.

## Guide graph, Groups, and exact editing

Sections reference two Pin identities and store one Weight and one Group
identity. Shared Pins are the graph. Moving a Pin updates every referencing
Section. Moving a Section translates only its two endpoint Pins. Unlink clones
one Section endpoint at the same Address; Link later merges an independent
one-Section endpoint into a valid Pin target. No hidden relationship or return
target is stored.

Weight changes are single Guide selector transactions. Weight has no matrix
route and no press-and-hold gesture; every edit calls the one Session
`setGuideSectionWeight()` transaction.

The spatial Link gesture uses the same Pin drag as ordinary movement. A target
within 16 pixels is only a candidate until the pointer remains on it for 450 ms;
release before arming performs movement only. Once armed, release calls the
canonical Pin-link transaction. Undo restores the complete pre-drag state.

Groups form a flat Section partition. `visibleGroupId` is nullable, so zero or
one Group may be drawn on Timeline; any number of Groups may independently be
Active and contribute Weight. Hidden active structure still deforms the map.
The default Group is ordinary. Only the last Group is protected from deletion.
`groupDeletionPlan()` is the one authority for permission, reason, heir Group,
and moved Section identities; kernel mutation, confirmation, tooltip, status,
and tests consume that plan. A collision in the actual heir refuses deletion.

Guide is the exact editor. A typed Address is parsed as seconds or canonical
timecode and is rejected—not silently clamped—when malformed, outside Range, or
structurally impossible. Enter applies one canonical Pin or Section movement;
Escape restores the committed value. Guide increments, keyboard Nudge,
Shift-wheel, and direct-manipulation Nudge converge on the same transaction.
Spatial dragging remains on Timeline.

## Persistence and recovery

Guide persistence is source-keyed under version 9. Older version 1–8 records
are migrated through the Guide kernel; valid current records round-trip without
changing identity. User preferences have a separate versioned key and include
Step Reach, Nudge, Context, Shift playback, Panorama settings, and pane
visibility. Deformation bypass, open surfaces, selections, Cues, and Field
runtime are transient.

Guide loading returns an explicit recovery result:

```js
{
  guide,
  sourcePrefix,
  exact,
  sanitized,
  discardedCount,
  unreadableHigherPriorityRecords,
  quarantineSucceeded,
  safeToRewriteCurrent
}
```

Candidates are inspected newest first. Before an older fallback or empty Guide
can replace unreadable higher-priority evidence, that evidence is written to a
unique quarantine envelope. If quarantine fails, the recovered Guide remains
usable in memory but `safeToRewriteCurrent` prevents destructive persistence.
Status copy distinguishes no saved Guide from failed recovery and never claims
preservation when the write failed. A migrated or sanitized record is rewritten
only when evidence is safe.

## Source-generation boundary

Every load produces an immutable request containing `generation`, `videoId`,
`startSeconds`, and `metadataStartedAt`. Generations increase monotonically.
Initialization requires both the current request generation and an adapter
snapshot whose actual loaded `videoId` matches it; duration must also be valid.
Thus an untagged stale CUED or metadata event from source A cannot initialize
source B.

Before cueing a new identity, `transitionSourceBoundary()` resolves all owners
of the old source in one place. It cancels Current, Pin, Section, and Range
drags to their origins; settles Nudge and pending Step; safely settles active
Context or Playback; persists settled Guide changes; clears native Go and
programmatic placement; closes transient dialogs and Pin clusters; clears Cues,
selection, Guide focus, Shift latches, Field runtime, and deformation bypass;
then creates a fresh Session and cues the new source. Player errors use the same
boundary. No source Address, identity, timer, or history checkpoint may cross it.

## Nudge and direct manipulation

One wheel handler owns Timeline and off-map Shift-wheel. It resolves only the
target differently: the exact Timeline object under the pointer, or elsewhere
the acquired Timeline operand and then Current. It chooses the dominant wheel
axis, treats right/up as forward, accumulates high-resolution deltas, calculates
multiple quanta when earned, and uses one target-keyed settlement timer. Browser
scroll is prevented only after a valid Shift-Nudge target exists. Form controls
retain their own wheel behavior.

Nudge Current uses the same sparse visited envelope and settlement law as Step,
so a round trip retains one positive `Step Reversal` residue. Pin and Section
round trips restore their exact origin and create no no-op history entry.

Current drag is a Step gesture. Pin drag changes that Pin. A Section wire uses
its end quarters for endpoint Pins and its middle for whole-Section translation;
no additional Timeline node chrome exists. Every gesture snapshots one origin,
amends it while moving, and checkpoints once on release. Escape or a lost
pointer restores the origin.

## User time and Ghost Traversal

`user-time.js` is pure: no DOM, no media, no Session, no persistence. It holds
one append-only ledger per source.

```js
{ kind: "atomic" | "sequence" | "continuous" | "ghost-injection",
  cause, createdAt,
  units: [{ kind: "jump" | "span", from, to }] }
```

`app.js` owns every decision about *when* to write. One route, one shape: a
single movement is atomic; a held or coalesced gesture is a sequence that keeps
its reversals, because collapsing a Step run to its endpoints erases the shape
the reader remembers; watched source time is continuous, so any Address inside
it may be recalled. A unit of no extent is refused by the ledger itself, which
is what keeps an inert operation — a rename, a Weight, an Undo of either — out
of the stream without every caller having to test for it. Undo and Redo write
when they move the reader and not otherwise: semantic history and user time are
different orders, and traversing one is a route through the other.

A gesture resolves the whole readable sequence once, at the moment it begins:
the frozen stream end, the active Range, the projection, and the effective Step
Reach. That single decision settles three separate requirements — the gesture
cannot follow its own newly injected output, a mid-gesture Weight change cannot
move candidates already passed, and the Range in force at the start is the Range
the whole gesture obeys.

`session.js` supplies `ghostTraverse`, which amends one captured origin per
notch, and `settleGhostSequence`, which commits the gesture as one transaction.
Releasing appends exactly one occurrence — Anchor to landing — with the scan
kept as provenance rather than as traversal. A resume cursor lets an
immediately-forward gesture replay the historical successors of the moment
re-entered; it is refused once the reader is standing anywhere else, once its
record or unit is gone, once its Address is not one the unit actually occupied,
and once the active Range excludes it. Any route that moves the reader also
withdraws it outright, so stepping away and back does not revive it.

Where automatic Context is enabled, each Ghost candidate retargets one Context
window rather than opening a new one. A window superseded or run out during the
scan writes no observation; the one still running when the gesture ended does.

## Playback and media authority

A Playback transport explicitly separates presentation from rate:

```js
observationPolicy: "panorama" | "center-only"
ratePolicy: { kind: "fixed", wish } | { kind: "dynamic" }
requestedRate
actualRate
```

Plain Space requests Panorama with fixed `1×`. Shift+Space requests Center-only
with the configured fixed wish or dynamic policy; a fixed Shift wish of `1×`
still remains Center-only. A native YouTube start is materialized as an explicit
Playback transport rather than inferred from player motion.

The stored wish is user intent. `resolveOfferedRate()` selects among the current
adapter offers by multiplicative/log-space distance, with ties toward `1×`.
`requestedRate` is the resulting command candidate. Only the YouTube
`onPlaybackRateChange` event confirms `actualRate`. Panorama availability derives
from `observationPolicy === "panorama"` and confirmed actual `1×`; a native rate
change suspends or restores the sides without opening another semantic
transaction.

Dynamic policy reads `1 / effectiveWeight` without transport-level bounds; the
adapter offer supplies real limits. When offers expand, a fixed Center-only
playback re-resolves its stored wish. Retry preserves both policies and reapplies
their current requested rate. Proper-Range wrap rebases the same transport,
preserves observation, resolves fixed wish or dynamic effective Weight at Range
Start, requests that rate, and creates no history.

The centered parent overlay is non-blocking. Only its compact Play/Panorama
button receives pointer events, leaving native YouTube seek, captions, settings,
volume, and fullscreen controls reachable while paused or idle.

## Field Frame and Field Breath

Outside ordinary playback, the application resolves one Field Frame per
semantic movement. Ownership priority is direct manipulation, then enabled
Context framing, then the last applicable operator. Step is the default;
Refine and Reopen show their next weighted midpoints; a selected Section shows
Start/midpoint/End while Current owns that midpoint. Pin manipulation centers
the Pin between weighted Step destinations, and Section manipulation supplies
its exact three-point extent. The Field controller receives only those source
Addresses.

`field-frame.js` gives each Frame a stable identity and direction. The runtime
uses opacity-only transitions and coalesces rapid movement; semantic commits do
not wait for animation. Superseded media callbacks are rejected by current
placement ownership.

During ordinary Panorama playback, Frame ownership yields to Field Breath. The
conservative default is:

```js
{ inner: 0.25, outer: 2.5, rate: 0.25 }
```

At Center `1×`, Tail/Center/Lead therefore request `0.75× / 1× / 1.25×` while
breathing between 0.25 and 2.5 source seconds. The available settings remain
wider; saved valid preferences are not replaced. The pure breathing state
machine clamps against Range, excludes a side without the minimum room from its
synchronization barrier, reverses only after every operational side arrives,
and preserves phase through deliberate Hold/Stretch. Hold changes no semantic
state or preference.

Context, Step Reach, Field offsets, and Weight have separate owners. Context and
live Field displacement remain source-time geometry. Weight affects only
Timeline-derived addresses and explicitly dynamic Playback.
