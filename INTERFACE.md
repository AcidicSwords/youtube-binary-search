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
| Tail pane | paused backward frame, simultaneous backward material, and direct Step Backward surface | backward comparison and pane-local Step |
| Center pane | audible authority, paused shared-start surface, native YouTube controls while running, physical Cursor | reliable ordinary playback and authoritative player state |
| Lead pane | paused forward frame, simultaneous forward material, and direct Step Forward surface | forward comparison and pane-local Step |
| Rate | requested side Stretch kinetics | directional formation speed cannot be chosen |
| Offset | maximum differential and Step distance | side target and Step magnitude become implicit |
| Hold / Stretch | freezes measured relation or snaps/refolds and re-forms it | Field relation cannot be controlled |
| Side video surface / Local Step | one read-only visual target and one explicit button for the same Step; moves the active Interval endpoint | slideshow traversal and Interval editing are not discoverable |
| Hold both / Stretch both | coordinated two-side transition | common Field transition requires two commands |
| Field state/rates/span | reports measured relation, actual rates, and Held extent | physical claims cannot be verified |
| Field on/off and pane hide/restore | removes optional projection cost without changing semantics | single-player fallback and space recovery are lost |

No separate playback dock, Context button, or Skim button appears here. Clicking paused Center or pressing Space refolds available sides and starts all three players through one parent-owned gesture; once ordinary playback begins, the surface withdraws and Center’s native YouTube controls are exposed. When paused, each side shows its represented frame. Side iframe pointer input is disabled so clicking the visible side surface performs semantic Step rather than independently toggling a muted player. Context is configured elsewhere and runs automatically.

Side controls mirror across Center. Tail reads from its outside edge toward Center as `Step | Hold/Stretch | Offset | Rate`; Lead reads from Center toward its outside edge as `Rate | Offset | Hold/Stretch | Step`. Collapsing one side pauses and removes only that projection; it must not refold or reset the still-visible side. Center’s combined Hold/Stretch action applies only to visible sides.

## 3. Temporal map

The map spans the same width as the viewer and shows:

- Range and editable handles;
- Resolution;
- semantic Current;
- physical Cursor during playback/Context/Loop;
- current movement Interval, resized live by Step;
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
Refine Backward | Reopen          | Refine Forward
Step Backward   | Loop            | Step Forward
Previous Pin    | Switch Endpoint | Next Pin
```

The layout expresses relations, not keyboard geometry.

- Row 1 acts on Resolution.
- Row 2 acts on movement and its active Interval: Step resizes the operand and Loop consumes its frozen extent.
- Row 3 crosses retained Addresses or transposes the active movement’s endpoints.
- Loop is central because surrounding movement operators establish the Interval it consumes and Step directly extends or shrinks that operand. It is genuine bounded playback with internal non-committing wraps.
- Switch Endpoint is central between directional Pin traversal because it crosses the active Interval without changing its ordered extent. It restores the other endpoint’s retained Resolution frame and gives subsequent Step a transposed anchor.

Pin Current and Save Section do not belong in the matrix; they create retained records and therefore belong in Guide.

Undo is history rather than a spatial relation. It therefore sits beneath the matrix as a separate compact action and uses Ctrl/Cmd+Z; `S` belongs to Switch Endpoint.

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
- A collapsed pane contracts to a restore rail/bar at every breakpoint and the remaining pane reclaims the freed width.
- Guide becomes a modal sheet below 900px.
- Coarse-pointer controls preserve the shared 48px target.

Responsive changes may alter placement, never ownership or meaning.
