# Binary YouTube Reader — Interface Grammar

## Layout

The wide interface is ordered vertically:

1. panoramic Step Field;
2. temporal map;
3. command workspace.

The command workspace is `Parameters | Operators | Guide`. Narrow layouts stack without changing operator order or semantics.

## Parameters

Parameters show Active Range, Resolution, Context duration, and Step size.

Step size is intentionally prominent:

- **Manual** exposes editable seconds.
- **Range-relative** exposes `1/32`, `1/16`, and `1/8`.
- The summary always shows the stored mode and current effective lateral distance.

Tail/Lead **Offset** fields remain beside their players. Offset controls the physical Field relation and never relabels or rewrites Step size.

## Timeline

The temporal map uses lateral Traversal Time while its ruler labels remain source timestamps.

Visual order:

```text
source ruler
open Section lanes
Fold rails and endpoint Pins
main Range / Resolution track
free and shared Pins
```

Open Sections are coloured horizontal spans packed into the lowest available lane. Their centered diamond is the transpose hinge. Section endpoints and Guide rows repeat the same stable colour.

A Fold is one vertical axis at its lateral knot:

- endpoint Pins are circular, labelled, source-ordered controls;
- close endpoints stagger sideways with connector ticks instead of overlapping;
- each contributing Section has its own coloured rail;
- duration is visible without dominating the map;
- a unique hinge toggles directly;
- a composite hinge opens Guide so the contributor is chosen explicitly.

The Working Interval highlights an included Fold rail only when both of that Section’s endpoint Pins are contained. Current sits on an exact endpoint when that endpoint is selected. Cursor may move continuously along the rail during playback; that observation does not create a vertical navigation mode.

## Operator matrix

```text
Q Refine Backward     W Reopen           E Refine Forward
A Step Backward       S Switch Endpoint  D Step Forward
R Release             T Transpose        F Focus / Unfocus
```

The Shift layer relabels only the directional families:

```text
Shift+Q/E   Additive Refine
Shift+A/D   Previous / Next Pin
```

Touch users can latch the visible Shift layer. Mouse, keyboard, local Field buttons, and side player surfaces invoke the same semantic owners.

Operator buttons expose destination or consequence in concise metadata. Disabled controls state a concrete reason; the interface does not present null actions.

## Guide

Guide has Sections and Pins tabs.

Section creation accepts:

- Working Interval;
- held Field span;
- two explicitly selected Pins.

Titles are optional. Untitled records receive stable descriptive fallbacks instead of blocking creation.

Each Section row exposes Go, Focus, Transpose/Unfold, Overwrite, Rename, and Delete. Each Pin row exposes Go, pair selection, Rename, and Delete. Referenced Pin deletion opens a confirmation with the exact number of Sections that will be dissolved.

Selection is lightweight and visible. Clicking an open span or Fold contributor selects that Section. Clicking an endpoint selects its Pin. Composite Fold actions never silently choose the first contributor.

## Focus and playback

Focus clamps Range. If the target is transposed, its span materializes so it can be traversed normally. Unfocus restores the containing Range and prior transposition.

Native playback loops when Range is a proper subset of the video. There is no separate Loop operator or transport mode. Wraps are visually continuous but do not alter semantic state.

## Step Field

Tail and Lead controls mirror around Center:

```text
Tail outside → Step · Hold/Stretch · Offset · Rate → Center
Center → Rate · Offset · Hold/Stretch · Step → Lead outside
```

Center alone is audible. Side panes are muted projections. Hiding one side releases only that projection and lets the remaining pane reclaim width.

Hold/Stretch is unavailable while Context, a semantic drag, or a pending Step suspends the Field. A transient Cursor can therefore never be recorded as a persistent relation.

## Accessibility and touch

- Every form control has a programmatic name.
- Every button declares a type.
- Matrix and Guide actions remain keyboard reachable.
- Timeline preserves vertical page scrolling.
- Visible markers keep compact geometry while coarse-pointer hit areas meet the touch target.
- Fold colour is supplemented by shape, placement, labels, and state text.
- Undo remains the platform-standard `Ctrl/⌘ Z`.
