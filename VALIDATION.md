# Validation Matrix

## 1. Automated gate

```bash
npm run check
```

The gate covers syntax, Session/Undo, endpoint-frame containment and transposition, distinct operator ownership, all seven semantic-audit regressions, Guide, Source Time ↔ Traversal Time projection, nested Fold topology, Focus/Range materialization, folded face inclusion, migration, retained subtree movement, Context/playback/Loop source continuity, source normalization, 25,000-operation fuzzing, native-playback regressions, Field geometry and controller behaviour, captured/fallback pointer and focused-key Step gestures, human-cadence tap batching, Context Cursor acceptance without Working Section or Resolution collapse, replacement-start ownership, DOM/accessibility contracts, repository audits, startup, interaction, Context, Section folding, transport-coherence, and metadata paths.

The deeper semantic proof is separate:

```bash
npm run test:semantic
```

It covers 200,000 mixed random operations, 10,000 arbitrary point targets, and 10,000 variable-Step Interval trials while checking `Interval ⊆ Resolution ⊆ Range` in the live frame and both Switch frames.

A passing gate is necessary, not sufficient, because actual YouTube iframe behaviour remains browser- and video-dependent.

## 2. Wide desktop

### Composition

- Tail, Center, Lead form one panoramic row at approximately `1 : 1.1 : 1`.
- Object-local Rate, Offset, Hold/Stretch, and Step controls sit beneath each side.
- Center exposes Field state and Hold both/Stretch both, not duplicate playback.
- Timeline spans viewer width.
- Parameters, exact 3×3 matrix, and Guide occupy left/centre/right.
- Matrix is `Refine/Reopen/Refine`, `Step/Loop/Step`, `Pin/Switch Endpoint/Pin`.
- Undo sits below the matrix and advertises Ctrl/Cmd+Z; `S` invokes Switch Endpoint.
- Pin and Section creation appear only in Guide.

### Temporal Fold and retained structure

- Save `0:30–0:45` as a Section in a three-minute source and Fold it. Confirm the map reports `2:45 traversal · 3:00 source`.
- Confirm its two endpoint Pins, midpoint Fold control, and every contained Pin disappear from the timeline and are replaced by one coloured labelled Section Pin.
- Step across it from both directions. Confirm one traversal unit crosses the point, Current resolves to the far source face, and the Working Section includes the complete `0:30–0:45`.
- At the folded Working endpoint, press `S` twice and confirm include/exclude toggles the complete source Section while the visible point does not move. Press `Shift+S` and confirm ordinary Working endpoint transposition still occurs.
- Invoke Refine, Range midpoint, timeline Go, Pin Forward/Backward, and Tail/Lead Step around the Fold. Confirm every destination agrees with the same Traversal Time projection.
- Click the Section Pin and confirm the source span, Start/End Pins, and retained internal Pins return. Click the faint midpoint marker and confirm they fold again.
- Drag an expanded endpoint. Confirm every Section sharing that Pin deforms and one Undo restores all references.
- Drag the collapsed Section Pin. Confirm both endpoints and every contained retained Pin translate by one delta, nested relations remain valid, and one Undo restores the subtree.
- Select any two distinct Pins, choose `Two selected Pins`, save, and confirm the Section references those exact Pins.
- Select a retained Pin or Section, hold Alt/Option, and exercise Refine, Step, Switch, direct Go, and Pin traversal. Confirm Current and the selected object use the same signed projected delta and Undo restores both in one action. Select a child hidden by a folded parent and confirm it stays owned by the parent until Focus/Expand exposes it.
- Fold nested parent and child Sections. Confirm the parent owns one visible point; expanding or deleting it reveals the child’s prior Fold state.
- Retain two crossing Sections and two adjacent siblings sharing one endpoint. Confirm either relation may fold alone, but folding its conflict produces no partial mutation. Confirm coincident folded Sections share one proxy and expand together in one Undoable action.
- Set Range to exclude a Fold at only its start or end face. Confirm Step, Refine, Pin traversal, Switch, timeline click, and Field offsets never resolve through the opposite face outside Range.
- Focus a folded child. Confirm the child and every required ancestor materialize, Range becomes the complete child source extent, and Leave restores the prior Fold frontier.
- Drag a Range boundary into a folded interior. Confirm the Section materializes while cut and refolds when the cut is removed.
- Pause playback, accept Context, and native-scrub inside a folded interior. Confirm the exact source Address is retained, the Section materializes while Resolution/Working Section cuts it, and no partial source relation is hidden behind one Fold Point. Confirm Current alone can remain latent at the point and Focus→Leave restores the parent Fold.
- Reload a v6 Guide and confirm Fold state persists. Load a v5 Guide and confirm every migrated Section starts expanded.

### Native playback

- Start through the paused Center surface and Space; confirm Tail, Center, and Lead receive play requests in the same event turn.
- Confirm the shared surface withdraws during ordinary playback, native Center controls remain usable, and native pause restores the surface while settling Current and Interval once.
- Confirm native scrub settles as Go after the grace period.
- Confirm playback leaves the receding Resolution endpoint fixed, pushes only the approached endpoint, and keeps the edited Loop contained.
- Confirm Resolution and Working Section deform continuously with Cursor and exactly match their paused settlement.
- Pause through Space and native controls; each must settle once, and no later poll may freeze the Field again.
- Rapidly issue Play then Pause, Escape, and a replacement traversal before `PLAYING`; each late confirmation must be consumed without reviving playback.
- Start Loop during playback; it must consume the visible settled Working Section without an intermediate Center pause.
- Play across a folded Section. Confirm Center plays every source frame with no `start → end` seek, the complete active Range materializes so both Field sides also use contiguous source distance, and the retained Fold returns after settlement.

### Automatic Context

- Enter preset and custom durations, including fractional values and both bounds, then invoke timeline, Refine, Step, side Step, Switch Endpoint, Pin, Section, and Undo traversal.
- Away from Range edges, confirm Context starts exactly half its duration before Current, audibly crosses Current, and ends half its duration after; at either edge, confirm only the unavailable half is clipped.
- During one Context, press Space before Current and confirm the Working Section extends through the accepted point; Undo, then press Space after Current and confirm the same Working Section shortens without Resolution collapse.
- Hold each arrow, matrix Step button, local Step button, and side surface; confirm the application cadence alone advances Current/Interval, no intermediate Context starts, and one Context runs on release at the final Current.
- Undo once after each held Step and confirm the entire repeated gesture is reverted.
- Rapidly tap each Step source several times inside the debounce window and confirm one Undo reverts the complete sequence.
- Confirm Center plays the bounded window and restores Current.
- Confirm Tail/Lead remain paused and preserve their modes/Offsets.
- Confirm Hold/Stretch controls are unavailable throughout Context and cannot record its transient Cursor.
- Trigger a new traversal while Context is active; only the new destination remains authoritative.
- Set Off and confirm traversal remains paused at destination.
- Center Context on or beside a Fold Point. Confirm each half is measured in Traversal Time, the complete crossed source Section is heard continuously, and the stored Fold state returns afterward.

### Step Field

- Confirm the initial paused panorama shows Tail and Lead at their represented Step frames rather than source thumbnails.
- Start through Center and Space; every start must refold both sides to Center before a fresh Stretch.
- Stretch each side independently and together.
- Confirm sides prime at `1×`, then use only a rate confirmed by that iframe.
- Change each Rate during Stretch and confirm the new supported rate takes effect without restarting or sticking.
- Hold midway and verify displayed maximum Offset and subsequent Step distance change to measured Offset while semantic Interval remains unchanged.
- Reach maximum and verify automatic `1×` Held state.
- Pause Center and confirm both sides are paused on the exact frames their displayed offsets imply.
- Click each side video surface and local Step button; confirm all equal matrix Step, translate the whole relation, and park again like a slideshow.
- Confirm Tail controls mirror Lead around Center, corresponding controls have identical widths, and no control clips in the narrow three-pane width band.
- Collapse Tail and confirm Lead keeps its current frame/mode/Offset; repeat in the other direction.
- With one side collapsed, confirm Hold/Stretch visible side affects only the visible projection and the expanded pane reclaims width.
- Force a side-player media error, hide/show that pane, and confirm the current source is retried; reload the same video and confirm both panes can recover.
- Exercise different Tail/Lead Offsets and rates, Range boundaries, rapid pause/play, native scrub, Loop wraps, and Context replacement.
- Confirm Context never changes stored side offsets and the first Play immediately after Context still starts both sides.
- Confirm a source with only `1×` parks each side at its target and becomes Held instead of remaining stuck.
- Confirm blocked playback can be retried, unavailable-rate states are honest, and sides remain muted.

### Composable Step Interval

- Establish an Interval through any replacement movement, then verify Step adopts its opposite endpoint as anchor.
- Step away from its departure and confirm the displayed Interval extends without moving the anchor.
- Step back into the extent and confirm it shrinks.
- Cross the anchor and confirm direction reverses while the ordered timeline extent remains valid.
- Confirm matrix Step, pane click, and local side Step edit the same Interval.
- Confirm Loop and Save Section consume the resized extent exactly.
- Undo after each resize and confirm the preceding Current, Resolution, and Interval are restored.
- Confirm every Step pushes only the approached Neighborhood endpoint while the receding endpoint remains exact.
- Step exactly onto each non-Range binary Neighborhood endpoint and confirm that endpoint remains one Step beyond Current and the next directional Refine is half a Step away.
- Repeat past the original endpoint and confirm only Range stops further endpoint pushing.

### Operator ownership and containment

- Establish `25–50` with Current at `25`, Refine Backward, and confirm the outside midpoint replaces it with `12.5–25`, Current `12.5`.
- Return to `25–50` with Current at `25`, Refine Forward, and confirm the inside midpoint shortens it to `37.5–50`, Current `37.5`.
- Refine Backward from that state and confirm the outside midpoint replaces it with `31.25–37.5`, Current `31.25`.
- Switch to an endpoint whose next Refine passes the opposite endpoint; confirm the old Loop is discarded and the complete Current-to-midpoint traversal replaces it.
- Traverse several Section endpoint Pins; confirm each result is exactly the latest one-hop Pin movement.
- Confirm Pin Forward/Backward and playback push only the approached refinement endpoint.
- After every Refine, Step, Pin, playback settlement, Reopen, and Switch, confirm the Loop is contained by active Resolution and both endpoint frames.
- Invoke a direct timeline or Guide Go and confirm it intentionally replaces the Active Interval.
- Exhaust Refine away from a Range edge and confirm the UI says `Resolution limit`; Reopen or Step must restore useful scale.
- Exercise a final side narrower than 80 ms; confirm Refine reports `Resolution limit` rather than exposing an enabled no-op or stranding Current on the endpoint. Apply a linear move and confirm refinement becomes useful again when scale permits.
- Switch and confirm its meta and hover/focus preview expose the destination endpoint frame before committing.

### Endpoint Transposition

- Establish Intervals through Refine, timeline/Pin Go, Step, and native playback.
- Switch Endpoint and confirm `start/end` and rendered extent remain fixed while directed departure/arrival swap.
- Confirm Current moves to the other endpoint and its retained Resolution frame/basis is restored.
- Confirm the restored frame contains the complete unchanged Loop.
- Reopen at one endpoint, switch away and back, and confirm the reopened frame returns.
- Switch, then Step or settle playback inward/outward/across the new anchor; confirm both compose from the transposed departure.
- Switch, then Refine to a midpoint inside the transposed Loop and confirm shortening; Refine to one outside or beyond it and confirm full traversal replacement. Traverse a Pin and confirm it records its own movement.
- Hold an arrow through repeat after switching and confirm one history entry and one Context window.
- Switch twice and confirm semantic Current, direction, frames, and extent return exactly.
- Collapse an Interval by stepping onto its anchor and confirm Switch Endpoint is disabled and `S` is a no-op.
- Undo a switch and confirm the complete preceding semantic checkpoint is restored.

### Loop

- Establish Interval through each movement class.
- Start matrix Loop and confirm frozen start/end.
- Confirm end-to-start wraps do not change Current, Interval, Undo history, or invoke Context.
- Confirm each wrap places each side once; no pre-wrap out-of-window Field reaction may run first.
- Pause/stop and restart.
- Loop a saved Section from Guide and confirm its own frozen extent.
- Loop a folded Section and a larger Interval crossing it. Confirm every cycle plays the full source material and wraps only at the frozen source end.
- Loop a retained Section outside active Range. Confirm the physical timeline/Field envelope includes both extents during Loop and stopping returns Center to the semantic address from which Loop began.

### Guide

- Create titled/untitled Pins from Pins tab.
- Focus and Leave the unsaved Working Section; confirm it owns Range temporarily, survives Leave, and does not change Guide.
- Create Sections from Working Section, Held Field span, and two selected Pins.
- Overwrite a retained Section from the Working Section; confirm ID/title survive, retired anonymous endpoint Pins are removed, persistence updates, and Undo restores the prior Extent.
- Overwrite a currently focused retained Section and confirm Range, Working Section containment, Focus, and the return Range remain coherent.
- Confirm every expanded Section endpoint appears as a Pin target and participates in previous/next traversal; when folded, its complete subtree becomes one Section Pin target.
- Attempt case-only duplicate Section titles on the same Extent and confirm runtime and reload preserve the same single identity.
- Exercise Go, Focus, Loop, Fold/Expand, endpoint drag, Section drag, Rename, Delete, and Leave.
- Reload and replace video; Guide remains video-specific.

## 3. Responsive and mobile

- Resize across each player-panel container breakpoint, including viewport widths just above it where application padding makes the panel narrower; no pane child may exceed its pane and no panes may overlap.
- Medium layout places Center above side panes.
- Phone layout stacks Center, Tail, Lead without horizontal overflow.
- Field-off remains a full-width Center-only projection even when either collapsed-side preference is persisted.
- Every iframe remains at least `200 × 200` CSS pixels.
- Native Center controls remain usable during ordinary playback; the paused shared-start surface is keyboard accessible and clearly labelled.
- Side controls remain reachable with 48px coarse-pointer targets.
- Faint Fold controls and Section Pins retain practical coarse-pointer hit areas without obscuring neighbouring markers.
- Guide opens as a modal sheet, traps focus, restores focus, and respects safe-area padding.
- Range dragging preserves vertical page scrolling.

## 4. Failure matrix

Test buffering, delayed placement, autoplay blocking, videos with only `1×`, hidden-tab suspension, network interruption, embed-disabled videos, fullscreen, and video replacement.

Record browser/version, device/viewport, video IDs, actual rates per iframe, passed scenarios, blocked states, and exact reproductions. Do not claim real iframe validation from automated tests alone.
