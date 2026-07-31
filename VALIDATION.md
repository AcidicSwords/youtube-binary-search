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

- Confirm Guide’s Section selector contains, in order: `0.25×`, `0.5×`, `0.75×`, `1×`, `1.25×`, `1.5×`, `1.75×`, `2×`.
- Confirm plain `T` toggles `1×` against the last non-neutral weight, `Shift+T`
  moves one step up, and `Alt+T` moves one step down without issuing a player
  or Field command.
- For one isolated ten-second Section, confirm projected extent is `2.5`, `5`, `7.5`, `10`, `12.5`, `15`, `17.5`, and `20` respectively.
- Confirm `1×` restores identity geometry without deleting the Section.
- Confirm every allowed factor has a unique inverse at dense source samples.
- Confirm no weight changes source duration, player rate, Context, Field Offset, or playback order.
- Confirm a v6 collapsed Section migrates to `0.25×`, an open Section migrates to `1×`, and the old flag is discarded.

## Step size and Field independence

- Enter different manual backward and forward distances; reload and confirm persistence.
- Switch through `1/32`, `1/16`, and `1/8`.
- Edit Section weight and confirm adaptive Reach follows weighted Range width while its fraction remains fixed.
- Confirm fixed Reach does not change.
- Focus and Unfocus; confirm adaptive distance updates.
- Hold and Stretch Tail, Lead, and both sides. Neither configured Offset, Step Reach, nor Section weight may change.
- Confirm side Step uses visible differential without rewriting semantic Reach.
- Hold one side at a partial relation, edit its configured Offset, and confirm
  the partial Hold remains while the sibling receives no seek, pause, rate, or
  mode change. Repeat with the side fully at its target and confirm it follows
  the new target.
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

- Timeline/Pin Go across a spatial distance; confirm the movement is the Working Interval and its unclipped Resolution has two equal Interval-width margins on each side.
- Click a Section in Timeline and Guide; confirm its endpoints become the Working Interval and Current returns to its center in one Undoable transaction.
- Repeat beside each Range boundary and confirm clipping removes only unavailable margin.
- Drag a Guide Section profile; only its endpoint Pins should translate.
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
- Confirm the timeline key, Current/Cursor readouts, Range ground, Resolution
  contour, Working-Section ridge, Field overlay, Section spans, and Pins
  remain distinguishable at desktop and compact widths.
- With a matrix control or side viewer focused, press Space and confirm it controls
  shared playback rather than reactivating that button.
- Play and pause Center after interacting with its iframe, then immediately use
  a reader hotkey without clicking the timeline.
- Confirm each timeline Section span selects the corresponding named Guide row
  and full Working Interval.
- Drag either Guide Section endpoint node; confirm the same shared Pin and every
  referencing Section update in one Undo transaction.
- Drag a selected Guide Pin node and a Section endpoint by the same pixel
  distance on equal-width tracks; confirm both produce the same temporal
  displacement and viewer preview.
- Drag a Guide Section profile; confirm both endpoint Pins translate by the same
  amount and cancellation restores the complete original extent.
- During a Pin drag, confirm Center previews the Pin while Tail/Lead show the
  exact weighted Step destinations around it. During either Section drag,
  confirm Tail, Center, and Lead
  preview Start, midpoint, and End respectively, then restore ordinary Field
  state on release or cancellation.
- Set Step Reach to 10 seconds, Context to 5 seconds, and both Field Offsets to
  2.5 seconds. Confirm idle Field shows exact weighted Step targets; Context
  shows its first/last source frames; Pin drag still uses weighted Step; and the
  2.5-second Offsets appear only during Stretch/Hold. Confirm no setting
  rewrites either of the others.
- Refine once and confirm Tail/Lead show the next backward/forward weighted
  midpoints. Reopen and confirm they show the newly available Refine midpoints.
  Let Context complete after each traversal and confirm it returns to that last
  semantic preview.
- Pause after attaining asymmetric Stretch/Hold relations. Confirm Step preview
  replaces the visible side frames without rewriting those stored runtime
  relations, and the next Play still performs the ordinary refold/Stretch.
- Start playback from every idle preview kind. Confirm preview labeling and
  non-Held spans disappear synchronously, both sides refold to Center, configured
  physical Offsets/rates govern Stretch/Hold, and pausing returns to Step.
- Hover and keyboard-focus operator controls without pressing them. Confirm the
  timeline previews their exact dry-run result while Center, Tail, and Lead do
  not seek, pause, or change rate.
- In compact Guide, switch between Sections and Pins and operate each control;
  confirm background surfaces are inert while the sheet never falls through to
  its scrim.
- Confirm keyboard, mouse, touch Shift latch, coarse pointer, and screen-reader names expose the same actions.

## Invariant checks

After every operator and drag:

```text
Range.start <= Current <= Range.end
Working Interval ⊆ Range in source time
Working Interval ⊆ Resolution ⊆ Range in Timeline Space
every Section has positive source duration
every Section stores one canonical weight
effective spatial density is positive
source/timeline mapping is strictly increasing and invertible
source playback is contiguous
history contains no transport-only wrap
```
