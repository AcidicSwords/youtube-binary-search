# Binary YouTube Reader — Interface Grammar

## 1. Presence rule

A visible element is admitted only when removing it would remove an implemented operation, conceal state needed to predict an operation, or erase feedback required to distinguish semantic commitment from physical observation.

```text
Panoramic Field
→ full-width temporal map
→ Parameters | 3×3 operators | Guide
```

## 2. Panoramic Field

Tail and Lead are constitutive projections, not thumbnails. On wide desktop the ratio is `1 : 1.1 : 1`, making Center only marginally larger.

| Element | Contribution | Lost if removed |
|---|---|---|
| Tail pane | simultaneous backward material and direct Step Backward target | backward comparison and pane-local Step |
| Center pane | audible authority, native YouTube playback, physical Cursor | ordinary playback and authoritative player state |
| Lead pane | simultaneous forward material and direct Step Forward target | forward comparison and pane-local Step |
| Rate | requested side Stretch kinetics | directional formation speed cannot be chosen |
| Offset | maximum differential and Step distance | side target and Step magnitude become implicit |
| Hold / Stretch | freezes measured relation or snaps/refolds and re-forms it | Field relation cannot be controlled |
| Local Step | explicit equivalent of clicking the pane | side Step is not discoverable |
| Hold both / Stretch both | coordinated two-side transition | common Field transition requires two commands |
| Field state/rates/span | reports measured relation, actual rates, and Held extent | physical claims cannot be verified |
| Field on/off and pane hide/restore | removes optional projection cost without changing semantics | single-player fallback and space recovery are lost |

No application play/pause, Context, or Skim button appears here. Center native controls own ordinary playback. Context is configured elsewhere and runs automatically.

## 3. Temporal map

The map spans the same width as the viewer and shows:

- Range and editable handles;
- Resolution;
- semantic Current;
- physical Cursor during playback/Context/Loop;
- current movement Interval;
- Held Field span;
- Pins;
- action and Section previews.

Without both Current and Cursor, physical observation could be mistaken for semantic commitment. Without Interval, Loop and Section-source identity would be hidden.

## 4. Parameters

The left panel contains non-operator values:

- textual Range and Range tools;
- textual Resolution;
- automatic Center-only Context duration;
- keyboard reference.

Directional Offset and side Rate remain object-local beneath Tail and Lead rather than being duplicated here.

## 5. Operator matrix

```text
Refine Backward | Reopen | Refine Forward
Step Backward   | Loop   | Step Forward
Previous Pin    | Return | Next Pin
```

The layout expresses relations, not keyboard geometry.

- Row 1 acts on Resolution.
- Row 2 acts on movement and its active Interval.
- Row 3 crosses retained Addresses or restores history.
- Loop is central because surrounding movement operators establish the Interval it consumes. It is genuine bounded playback with internal non-committing wraps.

Pin Current and Save Section do not belong in the matrix; they create retained records and therefore belong in Guide.

## 6. Guide

Guide is the complete retained-structure surface.

### Pins

Creation row: Current, optional title, Pin Current. Each retained Pin exposes Go, Rename, Delete.

### Sections

Creation row: source (`Last movement Interval` or `Held Field span`), title, Save Section. Each retained Section exposes Go, Focus, Loop, Rename, Delete.

### Sources

External chapter/transcript records remain potential structure until explicitly retained.

Focused Section state and Leave remain in Guide because Focus makes a retained Section own Range.

## 7. Responsive behaviour

- Wide desktop: three panes in one row, Center only 10% wider.
- Medium: Center above Tail and Lead.
- Phone: Center, Tail, Lead stack; each player remains at least `200 × 200` CSS pixels.
- Guide becomes a modal sheet below 900px.
- Coarse-pointer controls preserve the shared 48px target.

Responsive changes may alter placement, never ownership or meaning.
