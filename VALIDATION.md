# Validation

Validation is release acceptance for the implemented instrument. Automated
proof establishes deterministic laws; the manual journeys establish ordinary
media access, spatial legibility, and interaction quality in a real browser.

## Release gate

From a clean checkout with Node 20 or newer:

```bash
npm ci
npm run verify
```

The command must finish without warnings treated as failures, browser console
errors, unhandled rejections, or changed generated files. `npm run verify` is the
only complete automated release proof: `npm run check` alone does not measure
real layout, hit regions, native-control access, or browser focus.

Confirm in CI that both Verify jobs and the Pages predeployment job use
`npm ci`, the committed lockfile is unchanged, the installed Chromium matches
the resolved `playwright-core` version, and Pages runs `npm run verify` before
publishing.

## Automated acceptance

The complete gate must prove all of the following.

### Matrix and Tag

- The fixture, DOM order, visible keys, `aria-keyshortcuts`, runtime branches,
  CSS grid areas, and canonical documents all state exact `QWE / ASD / RTF`.
- Chromium measures three distinct row tops and three column lefts, three cells
  in each, and equal widths/heights within tolerance. Tag is row 3, column 2;
  there is no tenth auto-placed cell.
- Shifted labels do not change matrix geometry.
- Matrix click and `T` create or select the same Pin. Shifted matrix click and
  `Shift+T` create or select the same Section.
- Plain Tag remains `Retain Pin` when a Active Span exists. Shifted Tag is
  disabled without a positive Active Span, and label, meta, and preview
  follow Shift state.
- Guide creation summaries use `T` and `Shift+T`.

### Effective projection and weight relaxation

- Every projection remains positive, continuous, strictly increasing, and
  round-trips source ↔ Timeline within tolerance.
- Active overlapping Weight factors compose by multiplication in any insertion
  order. Reciprocal factors cancel over only their shared extent.
- Section-scoped bypass removes only that Section from geometry, sourceGridLines,
  atmosphere, Step, Refine, adaptive Reach, hit testing, and dynamic-rate input.
  Stored Weight and history are unchanged; other overlapping Sections remain.
- Whole-map bypass produces identity geometry, even sourceGridLines, and neutral
  atmosphere while retained Section wires and Guide values remain visible.
- Repeating the same `X` scope restores the exact prior projection. Changing
  scope transfers the one active bypass.
- Deleting the target or replacing the source clears bypass. An active drag
  safely refuses `X`; pending Step/Nudge settles first.
- `X` issues no direct player command. Fixed Playback and Panorama configuration
  remain unchanged; only explicitly Textured Playback may retune from the new
  effective map.

### Playback and ordinary-player integrity

- Plain `1×` Playback owns `panorama`; Shift fixed `1×` owns `center-only`.
- The configured wish, offered-rate resolution, requested rate, and confirmed
  actual rate remain distinct. The adapter rate event alone changes actual rate.
- A native Panorama changed away from actual `1×` suspends Tail/Lead without a
  new semantic transaction; confirmed `1×` restores them only for Panorama.
- Offer expansion re-resolves a stored fixed wish by log-space distance and
  retunes an active fixed Shift Playback when a closer rate appears. Ties favor
  the offer nearer `1×`.
- Dynamic wish is one playback-rate step per octave of effective Weight; the adapter
  offer supplies actual limits.
- Retry preserves observation and rate policy. Proper-Range wrap rebases the
  same transport, resolves fixed wish or dynamic Weight at Range Start, applies
  that request, preserves Panorama eligibility, and adds no history. Each wrap
  rebases each available side at most once.
- Playback says where voluntary watching began and records the source time
  actually crossed. Automatic Context recognizes Current or a Ghost Candidate
  already reached and never appends Traversal Trace evidence.
- Native seek, captions/settings, volume, and fullscreen hit regions remain
  pointer-accessible while paused and idle.

### Traversal Trace and Ghost Traversal

`traversal-trace-tests.mjs` owns the ledger, `ghost-tests.mjs` the Session operator,
and `ghost-smoke.mjs` the gesture in a real browser.

- Every route that moves the reader writes one occurrence: Go, Step, Nudge, a
  Current drag, Playback, and an Undo or Redo that
  puts them somewhere else. A rename, a Weight, a Group toggle, a new Pin, and
  an Undo of any of those write nothing. Programmatic placement never writes.
- A held or coalesced gesture writes one sequence that keeps its reversals; a
  Current drag writes one movement, not the ground it was dragged across.
- Watched spans are recallable at any Address inside them, subdivided by the
  frozen Step law and clipped to the active Range. Jumps offer only their two
  endpoints.
- Arming `G` costs nothing: no Anchor, no history, no settled playback, until a
  whole wheel quantum is earned. One turn of the wheel recalls exactly one
  moment whatever the device reports for a detent.
- A gesture freezes the readable stream, Range, projection, and Step Distance at
  its start, so later movement cannot mutate its candidates and no mid-gesture change
  moves a candidate already passed.
- The scan is transient in both directions. Historical settlement appends no
  traversal record and preserves one cursor; Escape appends nothing and restores
  the origin, history, and future exactly.
- The same held gesture and repeated gestures can reverse backward and forward
  across the history/future boundary without choosing a second reader or Ghost
  presentation. Ordinary movement clears the continuation cursor.
- A recalled Address the active Range excludes is unavailable rather than
  clamped; Ghost never leaves Focus, widens Range, or opens Full Video.
- One Undo returns to the Anchor with all structure intact.

### Ripple and Traversal Prospects

`traversal-prospects-tests.mjs`, `ripple-random-tests.mjs`,
`ripple-smoke.mjs`, and `ripple-render-smoke.mjs` jointly prove:

- bare `Shift+click` uses the effective Timeline inverse; retained objects keep
  their own Shift ownership and no ordinary Go leaks through;
- shared Context derivation independently clips both Ripple Window boundaries
  to full or focused Range, and published Start/End Addresses equal those
  resolved boundaries;
- acquisition, retarget, observation, completion, cancellation, and source
  replacement change no Current, Neighborhood, Active Span, semantic history,
  or Traversal Trace unless a prospect later settles through ordinary Go;
- completed batches coexist newest first, with End before Start and the last
  Ripple before every older Ripple; identity remains
  exact under duplicate Addresses, Focus filtering, consumption, and generation
  invalidation;
- Ghost freezes one stream with future entries after history; preview and Escape
  commit nothing, successful Go writes one ordinary history/Trace movement and
  consumes only its selected endpoint;
- Chromium proves Ripple leaves Timeline DOM and geometry untouched, future and
  historical positions share one Ghost presentation, reversal is fluid, and
  Freeze/Stretch cannot vertically move the Timeline;
- 20,000 deterministic lifecycle operations and 2,000 Go settlements preserve
  all prospect, Session, history, and Trace invariants.

### Source and Guide integrity

`source-boundary-smoke.mjs` owns generation and transient-cleanup coverage;
`guide-recovery-smoke.mjs` owns fallback, storage-failure, quarantine, and
rewrite-refusal coverage.

- Request A, then B, then stale A CUED or duration cannot initialize B. Adapter
  identity and current generation must both match.
- Replacing a source during Nudge, Step, Current/Pin/Section/Range drag,
  Playback, Context, Ripple, Ghost, or weight relaxation leaves no old-source Address,
  identity, timer, Panorama owner, or history checkpoint in the fresh Session.
- The old semantic Guide is persisted only after pending ownership is resolved.
- An unreadable current Guide plus valid older fallback preserves the unreadable
  evidence before migration can rewrite the current key.
- A quarantine write failure sets `safeToRewriteCurrent` false and prevents
  destructive persistence. Status distinguishes no saved Guide from failed
  recovery and never claims evidence was preserved when it was not.
- A present empty-string current record is unreadable evidence, not absence; it
  is quarantined exactly before an older valid record may be promoted.
- Valid saved preferences survive unchanged; a legacy Panorama preference migrates
  deterministically.

### Groups, modifiers, Nudge, and Step reversal

- Zero or one Group may be On Timeline. Any number may independently be Active;
  hidden active Sections contribute Weight while remaining absent from Timeline hit
  testing and shifted Pin traversal.
- Group deletion confirmation, mutation, tooltip, and result consume one plan,
  name the actual heir, refuse the last Group, and refuse heir collisions.
- Matrix and Guide Shift latches cannot consume one another. Physical Shift
  consumes neither. Source replacement clears both.
- Timeline and off-map Shift-wheel share dominant-axis selection, right/up
  forward direction, high-resolution accumulation, multi-quantum calculation,
  target key, and one Undo timer. Default scroll is preserved until a valid
  target exists.
- Keyboard and Guide increments reach the same Nudge mutation. Weight does not
  alter its source-time displacement.
- A Current Nudge round trip settles as one positive `Step Reversal`; exact Pin
  and Section round trips create no history entry.
- A Step sequence that returns to departure after visiting a positive extent
  creates one `Step Reversal` history entry and retains the visited contiguous
  envelope; no persistent Path remains.

### Panorama

- With no saved preference, defaults are exactly `0.25–2.5 s` and
  Tail/Center/Lead `0.75× / 1× / 1.25×`.
- Existing valid preferences and wider available values remain valid.
- Direct manipulation outranks Context, which outranks ambient operator framing.
  Step, Refine, Reopen, Pin drag, and Section drag supply their exact expected
  source Addresses.
- Frame identity is stable across republish, movement direction is truthful,
  rapid transitions coalesce, stale media callbacks cannot restore an obsolete
  frame, and reduced motion preserves the result.
- Cycle remains within effective Inner/Outer bounds, excludes unavailable
  sides from the barrier, reverses only when every operational side arrives,
  and continues the preserved phase after Freeze.
- A turn reports the direction it is heading in, not the one it arrived by, so
  a leg resumed at a fully attained bound contracts immediately rather than
  depending on how much wall clock has passed since the resume.
- Panorama Off, collapsed panes, Center-only Playback, Context, and incompatible
  actual rate keep side players dormant. Freeze/Stretch changes no preference,
  Guide, Step Distance, Weight, or history.

### Documentation and gauges

- Package and specification versions agree.
- Canonical documents state that automatic Context and Ripple observation are
  not traversal, while successful prospect Go is ordinary traversal.
- No canonical document or visible control advertises retired keys, operators,
  or a Timeline header action for `X`.
- Every executable suite is mapped in `DEVELOPMENT.md`; no removed suite is
  retained as release evidence.
- The source audit checks actual implementation seams and the browser gate
  checks physical geometry rather than accepting a matching comment or CSS
  fragment as behavior.

## Manual acceptance environment

Use a current Chromium build, an embeddable YouTube video with ordinary controls,
and a desktop viewport near 1440p. Also inspect a compact viewport, a coarse
pointer if available, reduced motion, a proper sub-Range, dense overlapping
Sections, and a Pin cluster. Begin with the conservative Panorama defaults unless a
journey says otherwise.

### Journey A — ordinary player

1. Load a YouTube URL.
2. While paused, use native seek, captions/settings, volume, and fullscreen.
3. Play and pause with native controls.
4. With focus on reader background, play and pause with Space.
5. Focus an application button and press Space; the focused control must keep
   its native activation instead of starting playback behind it.
6. Confirm no Guide, operator, Panorama side, Weight, or Focus setup is required to
   use the application as an ordinary player.
7. Set a Section's Weight from the Guide, tick a Group's visibility box, then
   press an operator hotkey without clicking anything else; it must act on the
   map. Click into a Guide Address field and press the same key; it must type
   there instead, and `Escape` must hand the keyboard back.

Accept when native controls never require a click through an overlay and an app
hotkey works after leaving the iframe, or after working in a side panel, without
first clicking Timeline.

### Journey B — operator comprehension

1. Confirm the matrix is a square `QWE / ASD / RTF`; hover/focus each cell and
   compare its preview to its eventual result.
2. Refine in both directions, including Local Refine into an existing interval.
   Plain Refine keeps its established anchor; Local Refine draws the complementary
   Current-to-midpoint half.
3. Step repeatedly, reverse direction, and return to departure. Confirm one
   `Step Reversal` Undo entry and a positive visited Active Span.
4. Switch End twice. Current, Current Neighborhood, orientation, and endpoint frames
   must return exactly.
5. Release. Current and Guide Selection stay; Active Span and acquired Timeline
   operand clear.
6. Undo and Redo, then make a new action after Undo and confirm Redo clears.

Accept when every matrix label describes the action performed, no preview changes
semantic state, and a gesture produces at most one history entry.

### Journey C — retain and compose

1. Press `T`; confirm Current becomes a Pin and the exact Pin is acquired.
2. Establish a positive Active Span. Press plain `T` again and confirm it
   still tags Current as a Pin.
3. Press `Shift+T`; confirm the Active Span becomes a Section and duplicate
   Tag selects rather than duplicates it.
4. Plain-click and Shift/Extend-click Pins, Sections, and a Chapter. Confirm plain
   selection replaces and shifted selection expands one contiguous extent.
5. Focus that extent, change a retained Section's Weight in Guide, then Unfocus.
6. Create another Group. Toggle On Timeline and Active independently, including
   no Group drawn and a hidden active Group.

Accept when no separate mode is introduced, hidden Guide structure remains
navigable, and Group visibility changes landmarks without silently changing
activity.

### Journey D — topography comparison

1. Give a Section a non-neutral Weight and acquire it from Timeline.
2. Press `X`. Its geometry, exact sourceGridLines, atmosphere contribution, Step,
   Refine, adaptive Reach, and hit testing must all use the straightened relation.
3. Confirm its Guide Weight remains visible and unchanged and history is
   unchanged. Overlapping weighted Sections must continue contributing.
4. Press `X` again and confirm exact restoration.
5. Click bare Timeline ground, then press `X`. The complete map must become
   identity geometry with neutral atmosphere and retained wires intact.
6. Restore the complete map. While dragging an object, press `X` and confirm the
   operation is refused until the gesture is resolved.

Accept when the contextual control and `X` agree, the action lives inside
Operators outside the matrix, and no Timeline-header control duplicates it.

### Journey E — Panorama

1. Confirm the initial State & Settings read `0.25–2.5 s` and
   `0.75× / 1× / 1.25×`.
2. Start plain playback. Tail must remain behind, Lead ahead, and both must
   cycle through a complete expansion/contraction cycle.
3. Freeze partway through expansion, Stretch, then repeat during contraction.
   Direction and attained relation must survive.
4. Collapse each side in turn and restore it. The other side must not stall.
5. Start Shift playback at fixed `1×` and at another offered rate. Both are
   Center-only; ordinary plain playback restores Panorama policy.
6. Refine, Reopen, Step, drag a Pin, and drag a Section while paused. Confirm
   Tail/Center/Lead show the corresponding exact Panorama Frames. A gesture restores
   the configured ambient owner: Context edges while Context is enabled, and the
   last applicable operator frame after Context is turned off.

Accept when Context duration, Step Distance, Panorama offsets, Weight, and playback
rate policy remain independent and no preview breaks live Cycle behavior.

### Journey F — source and recovery integrity

1. Begin an unsaved Nudge or Step sequence, then load another source. Repeat
   during a Section drag, Playback, Context, and active weight relaxation.
2. Confirm the fresh source has no old Active Span, Guide identity,
   selection, timer, transport, Panorama preview, Shift latch, or bypass.
3. Rapidly request source A then source B. Allow late A events to arrive. Only B
   may initialize.
4. Reopen the original source and confirm its settled Guide persisted.
5. In a disposable profile, preserve a valid older Guide record and corrupt the
   current version. Reload: the older Guide should recover only after the damaged
   evidence is preserved, with truthful status.
6. Simulate a failed quarantine write. Confirm recovered data remains available
   only in memory and the current key is not overwritten.

Accept when no cross-source state appears and no failure message claims a save
or preservation that did not happen.

## Direct-manipulation and responsive pass

- Click the visible center of every single Pin and clustered Pin row. The same
  visual control must receive the click; no fall-through Go, offset hitbox, jump,
  or random neighbor is acceptable. Drag the same control and verify only that
  Pin moves.
- Unlink one endpoint from a shared Pin. Drag it through a Link candidate and
  release early: only movement occurs. Dwell on one target until armed and
  release: ownership merges. Undo restores the independent state.
- Drag each Section wire near Start, in the middle, and near End. The two ends
  move their Pins; the middle translates both. The Guide's exact fields update
  live, and cancellation restores the complete origin.
- Edit the same Pin and Section through Guide Address inputs. Gesture and exact
  edit must reach the same model and Panorama preview. Out-of-Range, malformed
  (`1:75`), collapse, and reversal inputs must be rejected.
- Shift-wheel over Current, Pin, Section end, Section middle, and bare Timeline;
  then repeat off-map. Right/up is forward, high-resolution deltas accumulate,
  multiple earned quanta apply, and one continuous series is one Undo entry.
  A wheel without an acquired target scrolls normally.
- Open a dense Pin cluster. It lists choices vertically, scrolls by wheel, stays
  anchored, supports arrow/Home/End/Escape, and allows both exact click and drag.
- At 1440p, confirm Viewer and Timeline remain visible beside full-height Guide
  or Operators plus State & Settings without page scrolling. Collapse the rail and
  confirm the panoramic surface receives the released width.
- With more than five overlapping Sections, confirm the Section tree scrolls
  within a bounded band and all wires remain individually reachable.
- At compact width, confirm Guide is modal, focus remains trapped within it,
  background controls are inert, and every Address, Weight, title action, and
  tab remains reachable.
- With a coarse pointer, confirm Pin and Section hit regions are at least 48
  pixels without visually inflating the marks.
- Enable reduced motion and confirm all final previews and states remain present
  without traveling transitions.

## Invariants after every journey

```text
Range.start ≤ Current ≤ Range.end
Active Span ⊆ Range in source time
Active Span ⊆ Current Neighborhood ⊆ Range in effective Timeline Space
every Section has positive source duration and one canonical Weight
every Section belongs to one existing Group
zero or one Group is On Timeline; any number may be Active
effective density is positive
source-to-Timeline mapping is continuous, strictly increasing, and invertible
Tail is behind Center and Lead is ahead whenever each side is operational
Panorama offsets remain inside their effective Inner/Outer bounds
source playback remains contiguous
transport-only retry and wrap add no history
one interaction gesture creates at most one checkpoint
no transient or source identity crosses a source-generation boundary
```

The release is complete only when the automated gate and all six real-browser
journeys pass without a special setup path for ordinary playback.
