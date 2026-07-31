# Binary YouTube Reader — Interface Grammar

## Layout

The wide interface is a fixed instrument: `Viewer + Timeline | Guide` or
`Viewer + Timeline | Operators + Parameters`. The right rail is one contextual
surface, never three stacked panels: Guide receives the full rail when retained
structure is being edited, while Operators and Parameters share it when the
transformation matrix is being used. Either mode can collapse completely,
leaving Viewer and Timeline as one panoramic surface. `G` opens or collapses
Guide without changing operator state. Narrow layouts keep Operators and
Parameters in flow and present Guide as a modal sheet.

## Parameters

Parameters expose Active Range, Context duration, and Step Reach. Resolution remains visible on the Timeline, so the wide rail does not duplicate it.

- **Manual** exposes editable spatial units.
- **Range-relative** exposes `1/32`, `1/16`, and `1/8`.
- The summary shows the stored mode and current effective distance.
- Single labels share one compact sans-serif level; trailing state values share
  one compact monospaced level. A one-label disclosure is never styled as a
  value merely because it is also its last child.

Inner Offset, Outer Offset, the breathing rate pair, and the Nudge quantum share
one compact Tune disclosure in the Center bar, because they describe one Field
relation rather than two independent sides. Field Offset never relabels or
rewrites Step Reach or Section weight.

## Timeline

The temporal map uses lateral Timeline Space while the ruler labels source timestamps.

Visual order:

```text
free and shared Pins
main Range / Resolution track
source ruler
Section relationship tree
```

The compact key names every projection rather than requiring color recall.
Range is the ground, Resolution is its current neighborhood contour, the
Working Interval is the directional ridge between its endpoints, and a Held
Field span is a patterned physical overlay. Current and Cursor have separate
readouts and needles: Current is committed Session state; Cursor is the moving
physical observation.

The palette follows ownership rather than decoration: Range is low-contrast
neutral slate, Resolution and Cursor use restrained blue, Working Interval and
Pins use gold, Field uses green, operator candidates use violet, and retained
Section wires use a separate warm structural palette. Deformation alone owns
the violet-compression/teal-expansion field. Opacity establishes hierarchy:
metric contours and Range recede; committed Current, active Interval, and the
object under direct manipulation remain strongest.

Sections are thin endpoint wires packed into the lowest available lane below
the ruler. Start, midpoint, and End nodes define each extent. Faint dotted
relations connect the two endpoint Pins and the mapped midpoint down to those
nodes, so the lower tree explains which upper landmarks deform the track.
Their width shows the composed global projection and their hit region remains
easy to acquire without turning the Section into a persistent bar.

The main track is the deformation display. Every weighted Section contributes
a soft influence centered on its projected midpoint. Compression is violet,
expansion is teal, and peak opacity follows the magnitude of the Section’s log
weight. Width distributes that strength: a short Section concentrates the
influence while a long Section with the same factor is more diffuse. Influence
remains present at the endpoints and fades smoothly beyond them, so neighboring
Sections cohere as one field rather than hard blocks.
Signed log contributions add where Sections overlap, matching multiplicative
weight composition. Projected source-time contours provide the exact metric:
they pack under compression and spread under expansion.

Persistent names and selectors do not consume map lanes. Click a span to make
its complete extent the Working Interval and return Current to its center.

The Temporal Topography owns spatial direct manipulation, so every draggable
object lives here with one visually centered acquisition region and one
unambiguous gesture owner:

```text
Current marker          → Go
Pin marker              → Move Pin
Section Start or End    → Move endpoint Pin
Section midpoint        → Translate Section
Range boundary          → Change Range
```

The Current marker is itself a control. Pressing it acquires Current before the
Timeline can read the press as generic Go; crossing the movement threshold shows
a candidate Address while the original Current stays as a faint departure marker,
and release commits one exact Go. A stationary press moves nothing, and Escape or
a cancelled pointer restores the original presentation without history.

Each Section wire carries Start, midpoint and End nodes as its acquisition
regions. Coarse pointers receive enlarged hit areas without enlarging the marks.
`Shift`-drag on any of these enters precision mode: reduced gain, quantized to
the Nudge quantum, same gesture owner, one transaction on release. `Shift` +
wheel nudges the exact object under the pointer — Current, a Pin, a Section
endpoint, the whole Section, or Current over empty Timeline — and `,` and `.`
nudge the selected map object from the keyboard.

Timeline Section bodies are acquisition-only. A Timeline Pin is itself the
direct manipulation surface: release without movement moves Current to it, and
drag moves that exact Pin. Pin selection is derived from the Working Interval:
any Pins aligned with its Start and End are highlighted together. Guide
also provides the Section's name, endpoint relations, Focus, and complete
familiar weight ladder:

```text
0.25×  0.5×  0.75×  1×  1.25×  1.5×  1.75×  2×
```

Weight changes timeline geometry only. Section wires use a warm structural
palette that is separate from the violet/teal deformation field. Every endpoint
and interior Pin remains laterally ordered and clickable. Pin clustering follows
the complete interactive hit region, so nearby controls neither overlap nor
compete for the same pointer. A cluster opens a compact vertical chooser at its
map position; the chooser scrolls through dense groups without spreading across
the Timeline and does not move Current until an exact Pin is chosen. Shared
endpoints gain visual weight without acquiring a different interaction rule.
Choosing keeps the exact row visibly selected; click goes to it and horizontal
movement uses the row's dedicated drag handle. The cluster itself opens on
pointer-down, before the Timeline can interpret the gesture as Go. This resolves
a cluster before manipulation instead of asking overlapping Timeline markers
to compete for the gesture.
There is no perpendicular interaction axis, stacking, or hidden interior.

The timeline packs actual overlap into a bounded five-lane visual band. Major and minor source-time guides adapt to available width. Range, Resolution, Working Interval, exact previews, Current, and Cursor all use the same projection.

## Operator matrix

The nine operators occupy a square 3×3 matrix. Equal row and column geometry
keeps backward/neutral/forward placement and discriminate/traverse/lifecycle
placement equally legible; no axis is visually privileged.

```text
Q Refine Backward     W Reopen           E Refine Forward
A Step Backward       S Switch Endpoint  D Step Forward
R Release             T Deform           F Focus / Unfocus
```

Plain `T` normalizes a weighted Section to `1×` or restores its remembered
non-neutral value. `Shift+T` raises weight one canonical step and `Alt+T`
lowers it one step. The small `−/+` controls appear when Deform is hovered or
focused; Guide retains the exact eight-value selector.

The Shift layer relabels only directional families:

```text
Shift+Q/E   Local Refine
Shift+A/D   Previous / Next Pin
```

Plain Refine keeps the established Working Interval anchor when possible.
Local Refine always draws the new Current-to-midpoint path; reversing into an
existing interval therefore selects its complementary half.

Touch users can latch Shift. Mouse, keyboard, compact Field controls, and side-player surfaces invoke the same semantic operators.

Each cell fixes its key in the upper-left, centers a balanced operator label,
and reserves two compact lines below for destination or consequence. The key,
identity, and current effect therefore remain distinct when labels change under
Shift or Focus. Disabled controls state a concrete reason.

`P` immediately Pins Current. `Shift+P` immediately saves the Working Interval
as an untitled Section. These are creation commands, not shortcuts into the
optional title fields; Guide supplies the named-creation and later Rename paths.

## Guide

Guide has Sections and Pins tabs.

Section creation accepts:

- Working Interval;
- held Field span;
- two selected Pins.

Titles are optional. Each Section row exposes selection, Focus, Weight, and
both endpoint Pins. Compact Rename and Delete controls sit beside the title;
applicable Unlink controls sit with Focus and Weight. Direct endpoint and
whole-profile dragging make a separate replacement action redundant. A selected
Pin row exposes the same full-map track and draggable node as Section endpoints,
with Rename and Delete beside its title. On the Timeline, the visible Pin
and its centered hit region are one control: click moves Current to the Pin;
drag moves the Pin only after crossing the movement threshold.

Guide’s exact selector and Deform’s step controls are two views of the same transaction.

Guide is the exact editor. A Pin row exposes its Title, Address input, `−`/`+`
Nudge controls, Go, reference count, Rename, and Delete. A Section row exposes
its Title, Start and End Address inputs, a Duration readout, `−`/`+` controls for
each endpoint and for the whole Section, Weight, Focus, Unlink, Rename, and
Delete. Address inputs accept canonical timecode or seconds, clamp against Range
and structural partners, reject Section collapse or reversal, commit on Enter,
cancel on Escape, and create one Undo transaction. The increment controls invoke
the same Nudge operation as Timeline Shift-wheel and keyboard nudging.

Guide Section rows still project the Section against the complete timeline and
connect their Start and End Pin controls as one owned extent, but that full-map
profile is a read-only positional representation and an acquisition link: it owns
no drag geometry. Click an endpoint to Go, edit its Address to move it exactly,
or drag it on the Timeline to move it spatially. Endpoint node weight and Pin
metadata expose how many Sections share each Pin. Unlink clones only this Section's endpoint at the same Address,
so subsequent movement is independent. Linking is spatial rather than a
separate command: confirm Unlink, then drag its independent endpoint Pin within
16 pixels of another valid Pin. An amber candidate means ordinary movement is
still active; hold on that same target for 450 ms to arm a green acquisition
ring, then release to merge ownership. Passing through, leaving the radius, or
releasing before arming only moves the Pin. A shared junction must first be
Unlinked so one deliberate edge—not every connected Section—is the link source.
No original relationship is remembered.
Timeline and Guide Section clicks share one selection
transaction: the Section becomes the Working Interval and Current returns to
its midpoint. When the Working Interval's bounds coincide with Pins, those Pins
are selected automatically. If they bound one existing Section, Deform and
Focus reuse it instead of constructing an identical extent. Selection is a
projection of the interval, not a separate manual mode.
Dragging either selected endpoint Pin reshapes the corresponding Working
Interval bound in the same transaction.
Range Start and Range End remain visible navigation guides and synthetic
Previous/Next Pin stops.

## Focus and playback

Focus clamps Range without changing Section weight or the global timeline projection. Unfocus restores the containing Range.

Native playback loops when Range is a proper subset of the video. There is no separate Loop operator. Playback remains source-contiguous and always uses media runtime rate, never Section weight.

Weight remains editable during playback; the map changes around the moving Cursor without pausing or seeking the video.

## Step Field

Tail and Lead form one panoramic surface around Center. Center is subtly larger;
the smaller side projections are vertically centered with equal separation so
their scale reads as temporal distance and curvature rather than three separate
top-aligned players. Identity and address live in each top bar, the Field's one
Tune disclosure sits in the Center bar, and one combined Stretch/Hold control
sits beneath Center:

```text
Tail:   identity · address | collapse
Center: identity · address | Field state · Tune · Field
Lead:   identity · address | collapse
Bottom:            Stretch / Hold
```

Center alone is audible. Tail and Lead are muted projections.

### Field Frame

Outside ordinary playback the Field is a stable Frame, not a continuously
changing preview:

- Step is the default: Tail and Lead park on the exact weighted Step Backward
  and Step Forward destinations while Center remains at Current;
- Refine parks Tail and Lead on the next weighted backward and forward
  midpoints;
- Reopen parks them on the Refine midpoints made available by the reopened
  Neighborhood;
- Context parks Tail on its first frame and Lead on its last frame while Center
  follows the Cursor through that window;
- a retained Section shows exact Start, midpoint, and End while Current owns
  that midpoint;
- direct manipulation temporarily shows the candidate extent.

Every committed movement produces one directional transition between the
displayed Frame and the next. Forward traversal moves the visible strip leftward
and backward traversal moves it rightward, so frames enter through Tail or Lead,
pass through Center as they become Current, and leave through the opposite side.
Rapid same-direction movements compose as one continuing slideshow; a reversal
turns cleanly. The transition never delays the semantic commit, and it never
creates history.

Context beginning, moving, pausing, or settling reassigns neither side. Its Tail
and Lead are the frozen observation edges, so materially different side frames
mean the transition being sought lies inside the window.

Side panes remain Step controls only when they display Step targets or live
playback relations. Context, Current, Pin, and Section Frames make those surfaces
temporarily non-actionable; Refine and Reopen Frames are informative rather than
disguised Step controls. Hover and keyboard focus stay on the temporal map.

### Field Breath

During ordinary Center playback the Field breathes. Tail stays behind Center and
Lead stays ahead while both travel between the configured Inner and Outer
Offsets:

```text
Inner offset   x
Outer offset   y
Breath rate    one symmetric pair
Field          Stretch / Hold
```

The breathing rate pair is one control, not two: `0.75×/1.25×`, `0.5×/1.5×`, or
`0.25×/1.75×` around Center's `1×`. The configured values are the outward rates;
contraction exchanges them without rewriting the saved pair. A side that reaches
a boundary first waits there at Center rate until every operational side arrives,
then the whole Field reverses direction.

Hold alone stops the cycle. It preserves each attained offset, sets every held
side to Center rate, and preserves the direction for later resumption; Stretch
resumes from the attained relation. Hold changes no configuration and creates no
Undo checkpoint. There are no independent per-side Stretch/Hold controls.

Automatic Context controls the duration of a transient Center observation; Field
Offset controls the source-time displacement of Tail and Lead from Current. They
can be tuned into a useful proportion — such as 2.5 seconds on each side of a
5-second Context — but neither derives from or updates the other. Empty or
invalid Offset input is rejected and the last canonical value is restored;
`0 < inner < outer` is enforced against the sibling bound.

Field Off and pane collapse are operational boundaries, not merely visual
styles. Their side players pause once and remain dormant; delayed CUED or
PLAYING events cannot reactivate them, and a dormant side is excluded from the
breathing barrier so it cannot stall the Field. A side surface becomes actionable
only after that visible source frame is ready and a non-zero Range-contained
relation exists. A held Field span exists only while both sides are visible and
available.

Starting playback clears Frame ownership synchronously and begins the breath at
the inner offset.

### Direct manipulation Frames

Direct manipulation temporarily turns the panoramic Viewer into an exact
instrument. A Current drag centers the candidate Address and surrounds it with
the candidate Context Frame when Context is enabled, or the candidate Go Frame
otherwise. A Pin drag centers that Pin and places Tail/Lead at its exact weighted
Step destinations. A Section endpoint or whole-Section drag parks Tail at Start,
Center at midpoint, and Lead at End. Releasing commits one transaction and one
transition back to the ambient Frame; cancelling restores the prior presentation.
If an endpoint edit leaves Current away from the new midpoint, the idle Viewer
returns to Current-centered Step rather than mislabeling Current as midpoint.
These Frames begin only after the pointer crosses the drag threshold. Ordinary
hover and keyboard focus preview the dry-run geometry on the timeline without
seeking or pausing any player.

Users who prefer reduced motion receive the same resulting Frames without the
travelling transition.

## Accessibility and touch

- Every form control has a programmatic name.
- Every button declares a type.
- Matrix and Guide actions remain keyboard reachable.
- Space owns shared play/pause or Context acceptance everywhere outside text
  editing and modal Guide work; Enter activates a focused Step control.
- Pointer release clears pointer-acquired control focus, and Center playback
  state changes release iframe focus back to the reader.
- Narrow Timeline preserves vertical page scrolling; wide desktop keeps the application frame fixed and scrolls only the active right-rail surface.
- Coarse pointers receive at least 48px Pin and Section-drag hit regions
  without enlarging their visual marks.
- Gradients are supplemented by numeric weight labels and compressed/expanded state text.
- Compact visible markers retain coarse-pointer touch targets.
- Plain `Z` is Undo and plain `C` is Redo.
- `,` and `.` nudge the selected map object, or Current when unambiguous.
- Reduced-motion users receive settled Field Frames without directional travel.
