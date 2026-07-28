# Validation Matrix

## 1. Automated gate

```bash
npm run check
```

The gate covers syntax, Session/Undo, endpoint frames and transposition, Guide, Context/playback/Loop values, source normalization, 25,000-operation fuzzing, native-playback regressions, Field geometry and controller behaviour, DOM/accessibility contracts, repository audits, startup, interaction, Context, and metadata paths.

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

### Native playback

- Start through the paused Center surface and Space; confirm Tail, Center, and Lead receive play requests in the same event turn.
- Confirm the shared surface withdraws during ordinary playback, native Center controls remain usable, and native pause restores the surface while settling Current and Interval once.
- Confirm native scrub settles as Go after the grace period.
- Confirm crossing Resolution during playback reopens Range scale.

### Automatic Context

- Enable each duration and invoke timeline, Refine, Step, side Step, Switch Endpoint, Pin, Section, and Undo traversal.
- Hold each arrow key through repeated Step events; confirm Current/Interval update during repeat, no intermediate Context starts, and one Context runs on keyup at the final Current.
- Confirm Center plays the bounded window and restores Current.
- Confirm Tail/Lead remain paused and preserve their modes/Offsets.
- Trigger a new traversal while Context is active; only the new destination remains authoritative.
- Set Off and confirm traversal remains paused at destination.

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
- Confirm Tail controls mirror Lead around Center.
- Collapse Tail and confirm Lead keeps its current frame/mode/Offset; repeat in the other direction.
- With one side collapsed, confirm Hold/Stretch visible side affects only the visible projection and the expanded pane reclaims width.
- Exercise different Tail/Lead Offsets and rates, Range boundaries, rapid pause/play, native scrub, Loop wraps, and Context replacement.
- Confirm Context never changes stored side offsets and the first Play immediately after Context still starts both sides.
- Confirm a source with only `1×` parks each side at its target and becomes Held instead of remaining stuck.
- Confirm blocked playback can be retried, unavailable-rate states are honest, and sides remain muted.

### Composable Step Interval

- Establish an Interval through Refine, timeline, Pin traversal, and native playback.
- Step away from its departure and confirm the displayed Interval extends without moving the anchor.
- Step back into the extent and confirm it shrinks.
- Cross the anchor and confirm direction reverses while the ordered timeline extent remains valid.
- Confirm matrix Step, pane click, and local side Step edit the same Interval.
- Confirm Loop and Save Section consume the resized extent exactly.
- Undo after each resize and confirm the preceding Current, Resolution, and Interval are restored.

### Endpoint Transposition

- Establish Intervals through Refine, timeline/Pin Go, Step, and native playback.
- Switch Endpoint and confirm `start/end` and rendered extent remain fixed while directed departure/arrival swap.
- Confirm Current moves to the other endpoint and its retained Resolution frame/basis is restored.
- Reopen at one endpoint, switch away and back, and confirm the reopened frame returns.
- Switch, then Step inward/outward/across the new anchor; confirm Step composes from the transposed departure.
- Hold an arrow through repeat after switching and confirm one history entry and one Context window.
- Switch twice and confirm semantic Current, direction, frames, and extent return exactly.
- Collapse an Interval by stepping onto its anchor and confirm Switch Endpoint is disabled and `S` is a no-op.
- Undo a switch and confirm the complete preceding semantic checkpoint is restored.

### Loop

- Establish Interval through each movement class.
- Start matrix Loop and confirm frozen start/end.
- Confirm end-to-start wraps do not change Current, Interval, Undo history, or invoke Context.
- Pause/stop and restart.
- Loop a saved Section from Guide and confirm its own frozen extent.

### Guide

- Create titled/untitled Pins from Pins tab.
- Create Sections from Interval and Held Field span.
- Exercise Go, Focus, Loop, Rename, Delete, and Leave.
- Reload and replace video; Guide remains video-specific.

## 3. Responsive and mobile

- Medium layout places Center above side panes.
- Phone layout stacks Center, Tail, Lead without horizontal overflow.
- Every iframe remains at least `200 × 200` CSS pixels.
- Native Center controls remain usable during ordinary playback; the paused shared-start surface is keyboard accessible and clearly labelled.
- Side controls remain reachable with 48px coarse-pointer targets.
- Guide opens as a modal sheet, traps focus, restores focus, and respects safe-area padding.
- Range dragging preserves vertical page scrolling.

## 4. Failure matrix

Test buffering, delayed placement, autoplay blocking, videos with only `1×`, hidden-tab suspension, network interruption, embed-disabled videos, fullscreen, and video replacement.

Record browser/version, device/viewport, video IDs, actual rates per iframe, passed scenarios, blocked states, and exact reproductions. Do not claim real iframe validation from automated tests alone.
