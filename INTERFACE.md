# Binary YouTube Reader — Interface Grammar

## Layout

The wide interface is a fixed instrument: `Viewer + Timeline | Operators + Parameters + Guide`. The observation surface and map remain visible while Guide alone scrolls retained structure. Narrow layouts stack without changing operator order or meaning.

## Parameters

Parameters expose Active Range, Context duration, and Step Reach. Resolution remains visible on the Timeline, so the wide rail does not duplicate it.

- **Manual** exposes editable spatial units.
- **Range-relative** exposes `1/32`, `1/16`, and `1/8`.
- The summary shows the stored mode and current effective distance.

Tail/Lead Offset fields remain beside their players. Field Offset never relabels or rewrites Step Reach or Section weight.

## Timeline

The temporal map uses lateral Timeline Space while the ruler labels source timestamps.

Visual order:

```text
weighted Section lanes
main Range / Resolution track
source ruler
free and shared Pins
```

The compact key names every projection rather than requiring color recall.
Range is the ground, Resolution is its current neighborhood contour, the
Working Interval is the directional ridge between its endpoints, and a Held
Field span is a patterned physical overlay. Current and Cursor have separate
readouts and needles: Current is committed Session state; Cursor is the moving
physical observation.

Sections are coloured horizontal spans packed into the lowest available lane.
Their width shows the composed global projection, while their gradient
describes that Section's own contribution:

- compressed Sections converge toward their center;
- expanded Sections open toward their edges;
- neutral Sections render as an ordinary line.

Persistent names and selectors do not consume map lanes. Click a span to make
its complete extent the Working Interval and return Current to its center; drag
it to translate its endpoint Pins. Guide provides the Section's name, endpoint
relations, Focus, and complete familiar weight ladder:

```text
0.25×  0.5×  0.75×  1×  1.25×  1.5×  1.75×  2×
```

Weight changes timeline geometry only. Every endpoint and interior Pin
remains laterally ordered and clickable. Pin clustering follows the complete
interactive hit region, so nearby controls neither overlap nor compete for the
same pointer. Shared endpoints gain visual weight without acquiring a different
interaction rule. There is no perpendicular interaction axis, stacking, or
hidden interior.

The timeline packs actual overlap into a bounded five-lane visual band. Major and minor source-time guides adapt to available width. Range, Resolution, Working Interval, exact previews, Current, and Cursor all use the same projection.

## Operator matrix

```text
Q Refine Backward     W Reopen           E Refine Forward
A Step Backward       S Switch Endpoint  D Step Forward
R Release             T Deform           F Focus / Unfocus
```

Deform pairs the `T` action with the same eight-value selector. It applies that value to a selected Section or creates/reuses a Section for the Working Interval.

The Shift layer relabels only directional families:

```text
Shift+Q/E   Local Refine
Shift+A/D   Previous / Next Pin
```

Touch users can latch Shift. Mouse, keyboard, local Field buttons, and side-player surfaces invoke the same semantic operators.

Operator buttons expose destination or consequence in concise metadata. Disabled controls state a concrete reason.

## Guide

Guide has Sections and Pins tabs.

Section creation accepts:

- Working Interval;
- held Field span;
- two selected Pins.

Titles are optional. Each Section row exposes selection, Focus, Weight, and both endpoint Pins; infrequent Overwrite, Rename, and Delete actions sit under More. Each Pin row exposes Go, while Shift-click performs pair selection and More contains explicit selection, Rename, and Delete.

Guide and Deform weight selectors are two views of the same transaction.
Guide Section rows project the Section against the complete timeline and connect
their Start and End Pin controls as one owned extent. Endpoint node weight and
Pin metadata expose how many Sections share each Pin. Selection is lightweight
and visible. Range Start and Range End remain visible navigation guides and
synthetic Previous/Next Pin stops.

## Focus and playback

Focus clamps Range without changing Section weight or the global timeline projection. Unfocus restores the containing Range.

Native playback loops when Range is a proper subset of the video. There is no separate Loop operator. Playback remains source-contiguous and always uses media runtime rate, never Section weight.

Weight remains editable during playback; the map changes around the moving Cursor without pausing or seeking the video.

## Step Field

Tail and Lead controls mirror around Center:

```text
Tail outside → Step · Hold/Stretch · Offset · Rate → Center
Center → Rate · Offset · Hold/Stretch · Step → Lead outside
```

Center alone is audible. Tail and Lead are muted projections. Their rate selectors supply the familiar numeric vocabulary reused by Section weight, but the controls have independent state and affect different axes.

Hold and Stretch change live playback state only. Offset changes only through explicit input. Timeline deformation cannot change a player rate or Field relation.

## Accessibility and touch

- Every form control has a programmatic name.
- Every button declares a type.
- Matrix and Guide actions remain keyboard reachable.
- Space owns shared play/pause or Context acceptance everywhere outside text
  editing and modal Guide work; Enter activates a focused Step control.
- Pointer release clears pointer-acquired control focus, and Center playback
  state changes release iframe focus back to the reader.
- Narrow Timeline preserves vertical page scrolling; wide desktop keeps the application frame fixed and scrolls only Guide content.
- Coarse pointers receive 48px Pin and Section-drag hit regions
  without enlarging their visual marks.
- Gradients are supplemented by numeric weight labels and compressed/expanded state text.
- Compact visible markers retain coarse-pointer touch targets.
- Plain `Z` is Undo and plain `C` is Redo.
