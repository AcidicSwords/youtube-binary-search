# Video Cartography — Interface Grammar

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

Tail/Lead Offset fields remain beside their players. Field Offset never relabels or rewrites Step Reach or Section weight.

## Temporal Topography

The Temporal Topography uses lateral Timeline Space while the ruler labels source timestamps.

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

Guide’s exact selector and Deform’s step controls are two views of the same transaction. Guide Section rows project the Section against the complete timeline, expose exact Start, End, and whole-extent Address editors, and provide −/+ Nudge controls. Guide Pin rows expose the same exact Address editor. Spatial dragging belongs to the Temporal Topography: drag Pins, Section endpoint nodes, or midpoint/profile nodes there. Guide and Timeline routes invoke the same Session transactions. Endpoint metadata exposes how many Sections share each Pin. Unlink clones only this Section's endpoint at the same Address,
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

## Panoramic Phase Field

Tail and Lead form one panoramic surface around Center. Center is subtly larger; side projections remain visually subordinate and muted.

The Field has two visible regimes.

### Stable Frame

Outside ordinary playback, Tail–Center–Lead present one stable Field Frame. With Context enabled, Tail and Lead are the bounded Context edges before, during, and after observation; Center changes from Current to Cursor only while Context runs. With Context disabled, the active operator supplies exact fallback geometry.

Every committed movement receives one brief directional slideshow transition. Forward movement visually enters through Lead and exits through Tail; backward movement reverses it. Rapid operations replace stale frame revisions and settle on the latest committed state. Reduced-motion preferences remove the animation without changing addresses.

Direct Current, Pin, or Section manipulation temporarily presents exact candidate frames. Current drag centers the candidate and previews its Context or operator neighbourhood. Section drag shows Start, midpoint, and End. Hover/focus dry-runs remain on the map.

### Breath and Hold

During ordinary playback, the Field Breath moves between Inner and Outer Offset. Outward Tail/Lead rates are presented as one symmetric pair around Center rate. At the outer synchronization barrier the pair exchanges; at the inner barrier it restores. An early side follows Center at `1×` until the other operational side arrives. Tail always remains behind and Lead always remains ahead.

One combined Breathe/Hold control owns the coordinated relation. Hold preserves the attained offsets and direction. Side visibility and Tune remain side-owned; no Field setting changes Step Reach, Section Weight, Context duration, or playback truth.

### Direct manipulation and precision

Current is a draggable slider on the Temporal Topography. Section Start, midpoint, and End nodes are separate controls. Pins remain directly draggable. Shift-drag reduces gain and quantizes in source time. Shift-wheel over an object, or comma/period from the keyboard, Nudges that object; an uninterrupted sequence settles as one Undo action.

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
