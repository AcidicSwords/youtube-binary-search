# Validation

`npm run check` is the required automated gate. `npm run test:semantic` runs the extended state-space suite.

## Operator matrix

- Confirm DOM and visual order is `QWE / ASD / RTF`.
- Confirm Shift changes only Refine to Local Refine and Step to Pin traversal.
- Confirm plain Refine `50 → 25 → 12.5` retains `50 → 12.5`, frame `{0,12.5,50}`, and reverses to `31.25`.
- Refine, Reopen, then plain Refine past the retained departure in the opposite direction; confirm the complete movement becomes the Working Interval in both directions.
- Confirm same-direction Refine still retains the old departure.
- Create a forward Working Interval, then Local Refine backward into it.
  Confirm Local Refine draws Current-to-midpoint (the complementary half) while
  plain Refine keeps the original departure.
- Alternate Refine and Local Refine; committed Working Interval and hover preview must match.
- Confirm Reopen restores Range endpoints.
- Confirm Switch is an exact involution.
- Confirm Release clears only a non-null Working Interval.
- Confirm Deform preserves the Working Interval while changing only one Section factor.
- Confirm Focus/Unfocus restores the containing Range exactly.
- Confirm plain `Z` Undoes and plain `C` Redoes; a new action after Undo clears Redo.

## Canonical weight scale

- Paste a description carrying chapters into the Cues tab. Confirm the Cue count rises while Pins, Sections, the map and Undo are untouched; that clicking a Cue takes its extent; that `Shift`+click extends across two; and that `Retain` produces an ordinary Section carrying the creator's title.
- Confirm `Show on timeline` draws a mark per Cue and that no mark can be clicked, dragged, or joined to a Pin cluster; that Undo is unchanged by drawing; and that `Clear` removes both the offer and the drawing.
- Confirm a selected Section's `Start` and `End` labels select the corresponding Pin in the Pins tab without moving Current, and that a Pin holding two Sections offers one Unlink per Section, each naming it.
- Confirm a Guide saved under v8 with several Groups reopens with exactly one on the Timeline, the first it had marked visible, with every Group's activity, label, membership and Weight unchanged.
- Confirm New Group says the map is blank because the new empty layer took the Timeline, rather than leaving a blank map to be discovered.
- Confirm a Group cannot be left without a name, and that no two rows or Group options read alike.
- Confirm deleting the focused Section says its containing Range was restored, and that an unnamed Pin is called `the Pin at 0:10` rather than quoted as a title.
- Nudge, then immediately Refine before the settle window elapses. Confirm Undo reverses the Refine first and the Nudge second, and that the elapsed timer appends nothing.
- Hold a Weight increment across several rungs. Confirm one Undo returns the whole hold to its starting Weight, and that a single press remains its own entry.
- Retain a Cue, then reopen the video. Confirm the Section or Pin is still there.
- Confirm a Group is renamed and removed from its own row, that removing one returns its Sections to the map, and that Undo restores it in the state it was removed in.
- Confirm two unnamed Sections sharing one Pin offer two distinguishable Unlink buttons, and that Undo labels name the same object the status named.
- Confirm Group visibility is a single `On Timeline` radio choice while `Active` remains an independent checkbox: switching the visible Group atomically replaces all Timeline Sections and section-bound Pins without changing deformation; hidden active Groups continue multiplying Weight; visible inactive Groups remain editable with no deformation gradient.
- Confirm the on-Timeline Group is first in Guide, hidden Groups are below it, and every new Section created by operator, Timeline, Cue retention, or Guide save enters that Group unless explicitly reassigned.
- Confirm identical Sections in separate Groups survive persistence and multiply; assigning one into a Group that already contains the same identity is refused; removing a Group is also refused when its return to Map would create that duplicate.
- Confirm Pins are divided into `On Timeline` and `Hidden` in Guide. Clicking a hidden Pin or Section moves Current or establishes its Working Interval without revealing it, selecting it on Timeline, making it a Shift-Step stop, or making keyboard Nudge/Carry act on it.
- Confirm Guide’s Section selector contains, in order: `0.125×`, `0.25×`, `0.5×`, `0.75×`, `1×`, `1.25×`, `1.5×`, `1.75×`, `2×`, `4×`.
- Confirm every spatial figure is shown as a factor, never as a duration: with all weights at `1×` no factor appears anywhere; adding one 15 s `2×` Section to a one-minute source shows `1:00 · 1.25× spatial`; adding a second 15 s Section at `0.5×` removes the factor again.
- Confirm Focus draws the map across the focused extent: focus a `0.5×` Section and a `2×` Section in turn and check each spans the full timeline, that no unfocused Section or Pin is drawn against either edge, and that pressing anywhere on the timeline lands on the Address drawn there. Unfocus must restore the whole map.
- Confirm plain `T` toggles `1×` against the last non-neutral weight, `Shift+T`
  moves one step up, and `Alt+T` moves one step down without issuing a player
  or Field command.
- For one isolated ten-second Section, confirm projected extent is `2.5`, `5`, `7.5`, `10`, `12.5`, `15`, `17.5`, and `20` respectively.
- Confirm `1×` restores identity geometry without deleting the Section.
- Confirm every allowed factor has a unique inverse at dense source samples.
- Confirm no weight changes source duration, player rate, Context, Field Offset, or playback order.
- Confirm a v6 collapsed Section migrates to `0.25×`, an open Section migrates to `1×`, and the old flag is discarded.

## Field Frame and slideshow transitions

- Traverse forward four or five times in quick succession. Confirm each
  committed movement produces exactly one leftward transition, that the sequence
  reads as one continuing slideshow, and that the Field settles on the latest
  resulting Frame rather than replaying obsolete intermediates.
- Repeat backward and confirm the strip travels rightward.
- Reverse direction immediately mid-transition. Confirm the Field turns cleanly
  without accumulating or snapping back.
- Hold a directional key or click a Step surface rapidly. Confirm no semantic
  movement is delayed or dropped while a transition is animating, and that
  Current always matches Center once the sequence stops.
- With Context enabled, traverse once. Confirm Tail shows Context Start, Lead
  shows Context End, and Center follows the Cursor across the window without
  either edge moving.
- Let that Context stop. Confirm neither Tail nor Lead is reassigned by the
  ending, and that Current has not moved to wherever the Cursor reached.
- Press Space while Context runs. Confirm Context stops, ordinary playback
  starts from Current, and Current is unchanged.
- Confirm Context edges materially different from one another let you locate the
  crossing by playing or stopping inside the window.
- With Context disabled, confirm the Frame follows the current operator: Step
  destinations, Refine or Reopen midpoints, a retained Section's Start and End
  while Current owns its midpoint, and the Go neighbourhood after a direct Go.
- Enable reduced motion. Confirm the same resulting Frames appear without the
  directional travel and without any intermediate frame.

## Field breathing

- Start playback and watch a full cycle. Confirm Tail falls behind Center and
  Lead advances ahead from the inner offset, both approach the outer offset, and
  the Field then contracts back to the inner offset and repeats.
- Confirm Tail never reaches or crosses Center, Lead never reaches or crosses
  Center, and neither offset leaves the effective `[x, y]` bounds.
- Switch between the three breathing rate pairs. Confirm both sides always
  change together and that the saved pair is unchanged by the inward phase.
- Place Current near a Range boundary so one side is clipped. Confirm the
  clipped side clamps exactly to its effective bound, waits there at Center
  rate, and that contraction begins only once the unclipped side also arrives.
- Collapse one side or turn the Field off mid-cycle. Confirm the remaining side
  keeps breathing and is not stalled at a boundary by the dormant one.
- Press Hold part-way through expansion. Confirm both sides freeze at their
  attained offsets at Center rate, playback continues, and no Offset, Step
  Reach, Section weight, or Undo entry changes.
- Press Stretch again. Confirm it resumes from the attained relation and in the
  same direction it was travelling.
- Repeat the Hold and resume during contraction.
- Confirm reaching the outer offset begins contraction rather than becoming Hold.
- Move Current until one side has less room than the Inner Offset. Confirm that
  side stops breathing, parks at the room it has, and does not creep closer to
  Center; confirm the other side keeps breathing and is not stalled by it.
- Set the Inner Offset equal to the Outer Offset and confirm `0 < x < y` is
  restored rather than accepted.
- Wrap a proper Range while the Field is contracting. Confirm the resumed side
  rates are the contracting pair, not the outward pair.

## Step size and Field independence

- Enter different manual backward and forward distances; reload and confirm persistence.
- Switch through `1/32`, `1/16`, and `1/8`.
- Edit Section weight and confirm adaptive Reach follows weighted Range width while its fraction remains fixed.
- Confirm fixed Reach does not change.
- Focus and Unfocus; confirm adaptive distance updates.
- Hold and Stretch the Field. Neither configured Offset, Step Reach, nor Section
  weight may change, and no Undo entry may appear.
- Confirm side Step uses the visible differential without rewriting semantic Reach.
- Hold at a partial relation, edit the configured Outer Offset, and confirm the
  partial relation remains and the edit is neither a Hold nor a Stretch. Repeat
  with the Field fully at its bound and confirm it follows the new bound.
- Confirm no independent per-side Stretch/Hold or rate control is present.
- Clear or invalidate an Offset input; confirm the canonical value returns and
  no preference changes.
- Collapse a side while its source is preparing or playback is starting, then
  deliver the delayed player event; confirm it remains paused and cannot Step.
  Repeat with Field Off. Poll repeatedly and confirm dormant panes receive no
  further player commands.
- At a Range boundary, confirm only sides with positive reach participate in
  the combined Hold/Stretch action. A hidden, errored, or preparing side must
  not advertise side Step or contribute a held Field span.
- Step toward a Resolution endpoint repeatedly. It must remain fixed through the one-Step midpoint guard, then advance only enough to restore headroom.

## Positive projection

- Confirm Timeline Space is continuous at every Section endpoint.
- Confirm source-to-timeline and timeline-to-source round trips are exact within tolerance.
- Confirm every Pin remains visible, laterally ordered, and directly reachable at every factor.
- Confirm Refine always has a valid spatial midpoint for every positive source span.
- Confirm Range Start/End are synthetic Pin stops and deduplicate real boundary Pins.
- Confirm Timeline Go has one ordinary inverse and no direction-dependent result.

## Overlap and nesting

- Create nested, asymmetric, crossing, touching, and coincident Sections.
- Confirm local effective density is the product of covering Section factors.
- Confirm overlap composition is independent of insertion/edit order.
- Confirm reciprocal factors such as `0.5×` and `2×` cancel over their common extent.
- Change one contributor and confirm all others retain their stored values.
- Confirm no stored hierarchy, priority, hidden interior, or stacked endpoint state appears.

## Direct manipulation

- Press the Current marker and release without moving. Confirm nothing moves and
  no history entry appears.
- Confirm the fine Nudge distance sits inside Movement distance beside Step
  Reach, and that the Field Tune popover holds only Inner, Outer and rate.
- With no video loaded, confirm every Parameters and Field input is disabled.
- Narrow the Guide rail until it wraps. Confirm no Address field, Weight select,
  or action button is clipped by the card, and that every row shares one gutter.
- Confirm the keyboard reference lists Nudge, Shift-wheel and Shift-drag, and
  that its Weight chord matches the one the application binds.
- Drag each manipulable object, then edit the same object's Address in Guide.
  Confirm both present identical Tail, Center and Lead addresses.
- Press Escape during a Current drag, a Pin drag, a Section drag, and a Range
  drag. Confirm each abandons only that gesture and leaves its surface open.
- Drag Current forward, then back past its own departure. Confirm the Working
  Interval extends and then shortens from the same anchor, and that neither drag
  draws a new interval around the landing point.
- Open the Field Tune popover while Center is paused and edit each value.
  Confirm no click reaches the play/pause surface underneath.
- Press and hold every increment control in Guide and on Deform. Confirm it
  repeats and that the whole hold is one Undo entry.
- Confirm no Section node chrome is drawn over the map, and that pressing a
  Section wire near an end moves that endpoint Pin while its middle translates
  the Section.
- Confirm a Section row shows one Address line with Start and End, and no second
  positional endpoint track.
- Drag Current across a spatial distance. Confirm the marker follows the
  candidate, the original Current remains as a faint departure marker, Center
  shows the candidate frame, the Field shows the candidate Context Frame when
  Context is enabled and the candidate Go Frame otherwise, and Session Current is
  unchanged until release.
- Release and confirm one Step: the retained departure is preserved, one Undo
  checkpoint is created, and one Field transition runs in the traversal
  direction.
- Repeat and cancel with Escape or a lost pointer. Confirm the original Current
  presentation returns with no semantic change and no history.
- Shift-drag Current. Confirm reduced gain, quantized source Addresses, the same
  gesture owner, and one transaction on release.
- Shift-wheel over Current, a Pin, a Section endpoint, a Section midpoint, and
  empty Timeline. Confirm each nudges its own object, that trackpad deltas
  accumulate until one quantum is crossed, and that the browser only scrolls when
  no Timeline target was acquired.
- Confirm one continuous wheel series is one Undo entry, and that holding `,` or
  `.` is likewise one entry.
- Change Section Weight and repeat one Nudge. Confirm the temporal size of the
  nudge is unchanged.
- Confirm no control claims a frame step while the adapter reports no frame
  duration; the quantum must be shown in seconds.
- Nudge once at the shipped default quantum and confirm Current actually moves.
  Enter a quantum below the semantic tolerance and confirm it is rejected.
- During a transition, confirm the trailing pane reads as carrying what Center
  just showed and the leading pane reads as new material.
- Edit a Pin Address in Guide and drag the same Pin on the Timeline. Confirm both
  produce the same model and the same single Undo entry per gesture.
- Enter an invalid Address, one outside Range, and one that would collapse or
  reverse a Section. Confirm each is rejected with the committed value restored.
- Confirm Guide contains no draggable Pin, endpoint, or profile node.
- Drag a Timeline Section Start node, End node, and midpoint node. Confirm they
  move that endpoint Pin, that endpoint Pin, and the complete Section
  respectively.
- Timeline/Pin Go across a spatial distance; confirm the movement is the Working Interval and its unclipped Resolution has two equal Interval-width margins on each side.
- Click a Section in Timeline and Guide; confirm its endpoints become the Working Interval and Current returns to its center in one Undoable transaction.
- Repeat beside each Range boundary and confirm clipping removes only unavailable margin.
- Drag a Timeline Section midpoint node; only its endpoint Pins should translate.
- Drag a shared Pin; every referencing Section should update.
- Choose Unlink on one shared Section endpoint and confirm graph ownership does
  not change until the dialog is confirmed. Move the independent endpoint and
  confirm the other Section no longer moves. Reload and confirm the Pins remain
  distinct. Drag toward a valid Pin: outside 16 pixels it remains free; inside,
  the target is an amber candidate. Cross it quickly or release immediately and
  confirm only ordinary movement occurs. Hold on one candidate for at least
  450 ms; it must turn green, and release must merge ownership. Undo restores
  the complete independent pre-drag state in one action.
- Establish a Working Interval whose Start and End coincide with Pins; confirm
  both endpoint Pins select automatically.
- Click the visible center of a Timeline Pin; confirm Current moves to it
  without the marker or its hitbox jumping. Drag beyond the threshold and confirm that
  exact Pin moves while Center previews its new Address.
- Change weight from Guide and Deform stepping; confirm both paths produce the same model and one Undo entry.
- Confirm the main timeline shows one composed field: compressed, neutral, and
  expanded influence uses distinct colours; magnitude controls peak strength;
  influence is centered at the Section midpoint and fades smoothly beyond its
  endpoints; equal-weight broad Sections are more diffuse than narrow Sections;
  projected contour spacing follows effective weight; Section identity remains
  a thin endpoint wire.
- Release each drag outside its marker; confirm one terminal action and one Undo.

## Guide lifecycle

- Create untitled and titled Pins and Sections.
- Reuse exact endpoint Pins when deforming or saving.
- Align a Working Interval with two Pins, confirm both select, then save its Section.
- Select one Section, then change Weight, drag an endpoint, rename, and Focus
  without reselecting it between operations.
- Confirm Rename and Delete remain visible beside every Guide title and no More
  disclosure is present.
- From Viewer, Timeline, Operators, and Guide lists, press `P` and confirm
  Current is pinned immediately without moving focus into the title field.
- Press `Shift+P` and confirm the Working Interval is saved immediately as an
  untitled Section; stale Guide title/source fields must not alter the command.
- Rename, select, Go, Focus, set Weight, and delete.
- Delete a referenced Pin; warning count and dissolved Section count must agree.
- Reload and confirm overlap, shared endpoints, titles, and per-Section weights persist.

## Playback and Context

- Play across compressed, neutral, expanded, and overlapping Sections; every source frame must remain ordered and audible exactly as before.
- Start Context centered on and across weighted boundaries; its source window must remain unchanged.
- Focus a proper Range and play through its end.
- Confirm each wrap rebases each available side at most once, parks an unavailable side, resumes, and increments cycle count.
- Confirm a wrap commits no Current, Resolution, Working Interval, Context, or history.
- Begin playback from inside existing coverage; settlement must preserve or extend coverage and never shorten it.
- Unfocus to full-video Range and confirm playback stops at source end.

## Timeline and responsive quality

- Confirm major/minor source-time guides remain useful on wide and narrow viewports.
- Confirm palette ownership: neutral slate Range; blue Resolution/Cursor; gold
  Working Interval/Pins; green Field; violet operator candidates; warm Section
  identity; violet/teal only for compression/expansion.
- Confirm Range and metric contours recede behind Current, the Working Interval,
  retained Pins, and the object under direct manipulation.
- Confirm vertical order is Pins, weighted track, source ruler, then the
  Section relationship tree.
- Confirm Sections occupy the lowest available lanes and fold into the bounded five-lane visual band under extreme overlap.
- Confirm every Section wire has Start, midpoint, and End nodes and faint dotted
  relations align them with the corresponding Pin/track positions.
- Confirm compression is violet, expansion is teal, magnitude strengthens the
  midpoint, influence bleeds beyond each Section, and `1×` is neutral.
- Confirm gradients remain backed by a numeric selector and state text rather than colour alone.
- In overlapping Sections, confirm `Compresses`/`Expands` describes the
  individual factor while each span and Guide profile show the composed global
  projection.
- Confirm dense Section spans, Pins, and Range handles have distinct hit regions.
- Under a coarse pointer, confirm Pin and Section-drag targets
  are at least 48px and nearby Pins cluster before their hit regions overlap.
- Open a Pin cluster; confirm the compact inline chooser stays anchored to the
  cluster, lists choices vertically, scrolls by wheel when dense, and selecting
  one exact Pin moves Current to it.
- Press a Pin cluster; confirm it opens before any Timeline action occurs. Choose
  one Pin and confirm its row remains selected. Drag only its dedicated handle
  and confirm that exact Pin moves, with no dead click or random neighboring
  selection.
- Select both endpoint Pins of an existing Section, then use Deform and Focus;
  confirm the existing Section is selected and no duplicate Section is created.
- Confirm Current, Cursor, actual/preview Working Interval, Resolution, and selected state remain distinguishable.
- At 1440px wide, confirm Viewer and Timeline remain visible beside either the
  full-height Guide or Operators with Parameters, without page scrolling.
- Confirm the 3×3 Operator matrix is geometrically square and its three rows
  and columns divide that square evenly.
- Confirm every Parameters disclosure label uses the same compact label size,
  every state/summary value uses the same compact value size, and input text
  does not jump in scale when a disclosure opens.
- Switch between Guide and Operators; confirm only the selected rail mode is
  present and no state changes.
- Collapse either rail mode (or Guide with `G`); confirm Viewer and Timeline
  expand into the released width and the corresponding header control reopens it.
- Confirm the timeline key, Current's Address beneath its marker, the Cursor
  readout, Range ground, Resolution contour, Working-Section ridge, Field
  overlay, Section spans, and Pins remain distinguishable and unclipped at
  desktop and compact widths.
- With a matrix control or side viewer focused, press Space and confirm it controls
  shared playback rather than reactivating that button.
- Play and pause Center after interacting with its iframe, then immediately use
  a reader hotkey without clicking the timeline.
- Confirm each timeline Section span selects the corresponding named Guide row
  and full Working Interval.
- Drag either Timeline Section endpoint node; confirm the same shared Pin and
  every referencing Section update in one Undo transaction.
- Confirm the Guide row reprojects that result without offering its own drag.
- Drag a Timeline Section midpoint node; confirm both endpoint Pins translate by
  the same amount and cancellation restores the complete original extent.
- During a Pin drag, confirm Center shows the Pin while Tail/Lead show the exact
  weighted Step destinations around it. During either Section drag, confirm Tail,
  Center, and Lead show Start, midpoint, and End respectively, then restore the
  ambient Frame in one transition on release or cancellation.
- Set Step Reach to 10 seconds, Context to 5 seconds, the Inner Offset to 2.5
  seconds, and the Outer Offset to 10 seconds. Confirm the idle Field shows exact
  weighted Step targets; Context shows its first/last source frames; Pin drag
  still uses weighted Step; and the breathing bounds appear only during
  Stretch/Hold. Confirm no setting rewrites any other.
- Enter an Inner Offset larger than the Outer Offset and confirm it is clamped
  against the sibling bound rather than accepted.
- Refine once and confirm Tail/Lead show the next backward/forward weighted
  midpoints. Reopen and confirm they show the newly available Refine midpoints.
  Let Context complete after each traversal and confirm it returns to that last
  semantic preview.
- Pause after attaining an asymmetric breathing relation. Confirm the Step Frame
  replaces the visible side frames without rewriting those stored runtime
  relations, and the next Play still starts a fresh breath.
- Start playback from every idle Frame kind. Confirm Frame labeling and non-Held
  spans disappear synchronously, both sides begin at the inner offset, the
  configured bounds and rate pair govern the breath, and pausing returns to Step.
- Hover and keyboard-focus operator controls without pressing them. Confirm the
  timeline previews their exact dry-run result while Center, Tail, and Lead do
  not seek, pause, or change rate.
- Confirm that preview is the extent and the destination only: no second
  neighbourhood fill, no neighbourhood bounds, and no Step targets are drawn
  ahead of the movement that would establish them.
- In compact Guide, switch between Sections and Pins and operate each control;
  confirm background surfaces are inert while the sheet never falls through to
  its scrim.
- Confirm keyboard, mouse, touch Shift latch, coarse pointer, and screen-reader names expose the same actions.

## Invariant checks

After every operator and drag:

```text
Range.start <= Current <= Range.end
Center equals Current unless Context or a direct Frame owns Center
Tail remains behind Center and Lead remains ahead of Center
breathing offsets remain within effective [x, y] bounds
Working Interval ⊆ Range in source time
Working Interval ⊆ Resolution ⊆ Range in Timeline Space
every Section has positive source duration
every Section stores one canonical weight
effective spatial density is positive
source/timeline mapping is strictly increasing and invertible
source playback is contiguous
history contains no transport-only wrap
```
