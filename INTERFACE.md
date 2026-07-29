# Binary YouTube Reader — Interface Grammar

## 1. Presence rule

A visible element is admitted only when removing it would remove an implemented operation, conceal state needed to predict an operation, erase feedback required to distinguish semantic commitment from physical observation, or remove the minimum orientation copy needed to explain the operator grammar.

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
| Side video surface / Local Step | one read-only visual target and one explicit button for the same Step; moves the active Loop endpoint | slideshow traversal and Loop editing are not discoverable |
| Hold both / Stretch both | coordinated two-side transition | common Field transition requires two commands |
| Field state/rates/span | reports measured relation, actual rates, and Held extent | physical claims cannot be verified |
| Field on/off and pane hide/restore | removes optional projection cost without changing semantics | single-player fallback and space recovery are lost |

No separate playback dock, Context button, or Skim button appears here. While Context is idle, clicking paused Center or pressing Space refolds available sides and starts all three players through one parent-owned gesture; once ordinary playback begins, the surface withdraws and Center’s native YouTube controls are exposed. Automatic Context starts half its configured duration before the traversal point and plays up to half after it. During Context the same surface reads `Set Current Here`, and it or Space pauses at the heard Cursor and accepts that address as Current. Acceptance deforms the existing Working Section and Resolution at the moving endpoint—extending or shortening the operand like Step—instead of redrawing both around the Cursor. When paused, each side shows its represented frame. Side iframe pointer input is disabled so clicking the visible side surface performs semantic Step rather than independently toggling a muted player. Context is configured elsewhere and runs automatically.

Side controls mirror across Center. Tail reads from its outside edge toward Center as `Step | Hold/Stretch | Offset | Rate`; Lead reads from Center toward its outside edge as `Rate | Offset | Hold/Stretch | Step`. Each mirrored function uses the same track width on both sides. Press-and-hold on either Step button or side surface follows the same repeat and one-Undo gesture as the matrix Step; pointer release outside the control and focused Space/Enter release use that same boundary. Each repeat visibly parks all three panes before optional Context begins. Collapsing one side pauses and removes only that projection; it must not refold or reset the still-visible side. Restoring a pane may also retry a failed side source. Center’s combined Hold/Stretch action applies only to visible sides and is unavailable while Context suspends the Field.

## 3. Temporal map

The map spans the same width as the viewer and shows:

- Range and editable handles;
- Resolution, continuously projected through ordinary playback;
- semantic Current;
- physical Cursor during playback/Context/Loop;
- Working Section / Active Interval, replaced by local Go/Pin movements or an outside Refine, shortened by an inside Refine, resized by Step, and continuously projected through playback before identical settlement;
- Held Field span;
- ordinary Pins and linked Section endpoint Pins;
- expanded Section colour spans with faint midpoint Fold controls;
- collapsed Section Pins representing complete source intervals;
- action and Section previews.

Without both Current and Cursor, physical observation could be mistaken for semantic commitment. Without Interval, Loop and Section-source identity would be hidden.

The map’s horizontal coordinate is Traversal Time. Source timestamps remain on labels. When retained Folds shorten the traversal metric, duration and Resolution readouts distinguish traversal from source measure, for example `2:45 traversal · 3:00 source`. Ordinary playback and Loop expand the complete active Range for the three-pane Field; a retained Section Loop outside it also expands the physical envelope through its frozen operand. Center-only Context expands its source window; Focus and partial-Range cuts expose the required interior. Cursor and Field motion therefore remain continuous through material that is atomic only to semantic traversal.

An expanded Section presents one coloured line from Start Pin to End Pin. Its midpoint contains a subtle diamond Fold control. The colour repeats on its endpoint Pins and Guide item. Folding replaces the span, endpoint Pins, and every contained timeline Pin with one larger labelled Section Pin. Click that Section Pin to expand; coincident Sections share one proxy and expand together. Drag the proxy to translate the complete retained subtree. Drag an expanded endpoint Pin to deform all Sections sharing it. Visible markers remain small, but their pointer hit regions are larger. Pointer capture and document-level release fallback ensure a drag finishes once even if release occurs outside the marker. The Field suspends during retained-object drag so live polling cannot compete with topology preview.

## 4. Parameters

The left panel contains non-operator values:

- textual Range and Range tools;
- textual Resolution;
- custom centered Center-only Context duration (`0–300s`, with presets as suggestions);
- keyboard reference.

Directional Offset and side Rate remain object-local beneath Tail and Lead rather than being duplicated here.

## 5. Operator matrix

```text
Refine Backward | Reopen          | Refine Forward
Step Backward   | Loop            | Step Forward
Previous Pin    | Switch Endpoint | Next Pin
```

The layout expresses relations, not keyboard geometry.

- Row 1 acts on Resolution and the Working Section relation: a destination midpoint inside the Loop shortens it toward its opposite endpoint, with endpoint coincidence collapsing it; an exterior midpoint replaces it with the new traversal.
- Row 2 acts on movement and its active Interval: Step resizes the operand and Loop consumes its frozen extent.
- Row 3 crosses visible retained Addresses one Pin hop at a time, or acts on the active endpoint relation. A collapsed Section is one Pin stop; forward/backward arrival chooses its far source face so its complete Section enters the Working Section.
- Loop is central because surrounding movement operators establish the Interval it consumes and Step directly extends or shrinks that operand. It is genuine bounded playback with internal non-committing wraps.
- Switch Endpoint is central because it crosses the active Interval without changing its ordered extent. At a folded endpoint, plain `S` first toggles whether the complete Section is included or excluded while its displayed point stays fixed; the meta states that relation. `Shift+S` always forces ordinary endpoint transposition. Outside that Fold relation, Switch restores a destination Resolution frame that contains the same Loop. Subsequent Step or playback may edit from the transposed anchor; Refine shortens only for a midpoint still inside that Loop and otherwise replaces it, while Pin traversal records its own movement.

Each available Refine meta names `shorten loop` or `replace loop` before its destination, so the retained-side consequence is visible before invocation.

Pin Current and Save Section do not belong in the matrix; they create retained records and therefore belong in Guide.

Undo is history rather than a spatial relation. It therefore sits beneath the matrix as a separate compact action and uses Ctrl/Cmd+Z; `S` belongs to Switch Endpoint.

## 6. Guide

Guide is the complete retained-structure surface.

### Pins

Creation row: Current, optional title, Pin Current. Every Section endpoint is also a Pin and is available to timeline and matrix traversal when not hidden by an active Fold. Each retained Pin exposes Go, Select/Unselect, and Rename; Delete is unavailable while a Section references it. Two selected Pins automatically become the proposed `Two selected Pins` Section source. A Pin retained inside a Fold remains listed and labelled with its containing Section, but Go resolves to the visible Section Point until that Fold is expanded or focused.

### Sections

The Active Interval appears here as the semi-persistent **Working Section**. It exposes Focus Working independently of persistence: Focus installs its current Extent as Range, and Leave restores the containing Range without creating a Guide record.

Creation row: source (`Working Section`, `Held Field span`, or `Two selected Pins`), title, Save Section. Each retained Section exposes Go, Focus, Loop, Fold/Expand, Overwrite, Rename, and Delete. Overwrite copies the current Working Section into that retained identity; it is never implied by Focus. Equal endpoints and titles are duplicate identity case-insensitively, so runtime and reloaded Guide state cannot disagree.

Fold state is explicit in the item title. `Folded` means the Section owns a retained Section Point at semantic rest. `Inside …` means a folded ancestor owns that point. `Materialized` means the retained folded flag remains set while Focus or a structural semantic boundary—Range, a Resolution edge, or Working Section—exposes the source interior. Transient playback materialization does not rewrite this retained label. Current alone may remain an exact latent Address at the point. Focusing a folded Section is the intentional dive-in operation; Leave restores its containing Range and prior Fold frontier.

Crossing expanded Sections are allowed. Attempting to Fold one across an already Folded Section yields a precise conflict message and no mutation. Adjacent siblings sharing only one endpoint also require one expanded boundary so they cannot claim incompatible faces at the same coordinate. Nested Sections retain independent Fold states. Deleting or expanding a parent reveals the children exactly as they were.

The selected retained object has one cross-operator modifier: Alt/Option plus Refine, Step, Switch, timeline/Guide Go, or Pin traversal moves that Pin or complete Section subtree by the same Traversal Time delta. A child hidden by a folded parent remains owned by that parent proxy and must be expanded or focused before it can move independently. The original selection is retained through the transaction, structural limits are reported, and Undo restores both the primary movement and retained object together.

Focused Section state and Leave remain in Guide because Focus makes either a Working or retained Section own Range.

Unimplemented Sources do not appear. Range extent is shown once in Parameters rather than repeated in the Range-tools disclosure; Guide totals remain on the closed toggle and individual tabs rather than a third combined header readout.

## 7. Responsive behaviour

- Wide desktop: three panes in one row, Center only 10% wider.
- Medium: Center above Tail and Lead.
- Phone: Center, Tail, Lead stack; each player remains at least `200 × 200` CSS pixels.
- A collapsed pane contracts to a restore rail/bar at every breakpoint and the remaining pane reclaims the freed width.
- Pane placement is explicit rather than DOM-auto-flowed; Field-off remains Center-only and no grid track may force horizontal clipping.
- Breakpoints follow player-panel width, not viewport width, so outer padding or embedding cannot strand Lead in a clipped three-pane band.
- Guide becomes a modal sheet below 900px.
- Coarse-pointer controls preserve the shared 48px target; visually faint Fold controls use expanded invisible hit regions rather than becoming visually heavy.

Responsive changes may alter placement, never ownership or meaning.
