# Binary YouTube Reader — Interface Grammar

## Layout

The wide interface is ordered vertically:

1. panoramic Step Field;
2. weighted temporal map;
3. command workspace.

The command workspace is `Parameters | Operators | Guide`. Narrow layouts stack without changing operator order or meaning.

## Parameters

Parameters show Active Range, Resolution, Context duration, and Step Reach.

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

Sections are coloured horizontal spans packed into the lowest available lane. Their actual width is already weighted; a gradient makes the deformation direction readable:

- compressed Sections converge toward their center;
- expanded Sections open toward their edges;
- neutral Sections render as an ordinary line.

Every Section has a compact midpoint selector with the complete familiar ladder:

```text
0.25×  0.5×  0.75×  1×  1.25×  1.5×  1.75×  2×
```

The selector changes timeline geometry only. Every endpoint and interior Pin remains laterally ordered and clickable. There is no perpendicular interaction axis, stacking, hidden interior, or special endpoint affordance.

The timeline grows with actual Section-lane demand. Major and minor source-time guides adapt to available width. Range, Resolution, Working Interval, exact previews, Current, and Cursor all use the same projection.

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

Titles are optional. Each Section row exposes Go, Focus, Weight, Overwrite, Rename, and Delete. Each Pin row exposes Go, pair selection, Rename, and Delete.

Timeline and Guide weight selectors are two views of the same transaction. Selection is lightweight and visible. Range Start and Range End remain visible navigation guides and synthetic Previous/Next Pin stops.

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
- Timeline preserves vertical page scrolling.
- Gradients are supplemented by numeric weight labels and compressed/expanded state text.
- Compact visible markers retain coarse-pointer touch targets.
- Plain `Z` is Undo and plain `C` is Redo.
