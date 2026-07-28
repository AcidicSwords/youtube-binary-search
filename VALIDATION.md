# Validation Matrix

## 1. Automated gate

```bash
npm run check
```

The gate covers syntax, Session/Return, Guide, Context/playback/Loop values, source normalization, 25,000-operation fuzzing, native-playback regressions, Field geometry and controller behaviour, DOM/accessibility contracts, repository audits, startup, interaction, Context, and metadata paths.

A passing gate is necessary, not sufficient, because actual YouTube iframe behaviour remains browser- and video-dependent.

## 2. Wide desktop

### Composition

- Tail, Center, Lead form one panoramic row at approximately `1 : 1.1 : 1`.
- Object-local Rate, Offset, Hold/Stretch, and Step controls sit beneath each side.
- Center exposes Field state and Hold both/Stretch both, not duplicate playback.
- Timeline spans viewer width.
- Parameters, exact 3×3 matrix, and Guide occupy left/centre/right.
- Matrix is `Refine/Reopen/Refine`, `Step/Loop/Step`, `Pin/Return/Pin`.
- Pin and Section creation appear only in Guide.

### Native playback

- Start through the paused Center surface and Space; confirm Tail, Center, and Lead receive play requests in the same event turn.
- Confirm the shared surface withdraws during ordinary playback, native Center controls remain usable, and native pause restores the surface while settling Current and Interval once.
- Confirm native scrub settles as Go after the grace period.
- Confirm crossing Resolution during playback reopens Range scale.

### Automatic Context

- Enable each duration and invoke timeline, Refine, Step, side Step, Pin, Section, and Return traversal.
- Hold each arrow key through repeated Step events; confirm Current/Interval update during repeat, no intermediate Context starts, and one Context runs on keyup at the final Current.
- Confirm Center plays the bounded window and restores Current.
- Confirm Tail/Lead remain paused and preserve their modes/Offsets.
- Trigger a new traversal while Context is active; only the new destination remains authoritative.
- Set Off and confirm traversal remains paused at destination.

### Step Field

- Confirm initial coincidence.
- Stretch each side independently and together.
- Confirm sides prime at 1× before directional rate takes effect.
- Hold midway and verify displayed maximum Offset and subsequent Step distance change to measured Offset.
- Reach maximum and verify automatic 1× Held state.
- Click pane and local Step button; confirm both equal matrix Step and translate the whole relation.
- Exercise different Tail/Lead Offsets and rates.
- Confirm blocked/unavailable rate states are honest.
- Confirm sides remain muted.

### Composable Step Interval

- Establish an Interval through Refine, timeline, Pin traversal, and native playback.
- Step away from its departure and confirm the displayed Interval extends without moving the anchor.
- Step back into the extent and confirm it shrinks.
- Cross the anchor and confirm direction reverses while the ordered timeline extent remains valid.
- Confirm matrix Step, pane click, and local side Step edit the same Interval.
- Confirm Loop and Save Section consume the resized extent exactly.
- Return after each resize and confirm the preceding Current, Resolution, and Interval are restored.

### Loop

- Establish Interval through each movement class.
- Start matrix Loop and confirm frozen start/end.
- Confirm end-to-start wraps do not change Current, Interval, Return history, or invoke Context.
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
