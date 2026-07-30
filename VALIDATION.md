# Validation

`npm run check` is the required automated gate. `npm run test:semantic` runs the extended state-space suite.

## Operator matrix

- Confirm DOM and visual order is `QWE / ASD / RTF`.
- Confirm Shift changes only Refine to Local Refine and Step to Pin traversal.
- Confirm plain Refine `50 → 25 → 12.5` retains `50 → 12.5`, frame `{0,12.5,50}`, and reverses to `31.25`.
- Confirm Local Refine uses midpoint membership and the same sequence yields `25 → 12.5`, frame `{0,12.5,25}`.
- Alternate Refine and Local Refine in both directions; confirm the committed Working Interval matches the hover preview exactly.
- Refine once, Reopen, then Local Refine in the opposite direction; confirm an outside midpoint replaces the Interval with the complete Current-to-target movement rather than subtracting from the old extent.
- Confirm Reopen restores Range endpoints.
- Confirm Switch is an exact involution.
- Confirm Release clears only a non-null Working Interval and creates no history on null.
- Confirm Transpose preserves the Working Interval.
- Confirm Focus/Unfocus restores the containing Range and presentation exactly; changing Focus targets must preserve that same return Range.
- Confirm plain `Z` Undoes and plain `C` Redoes; a new semantic action after Undo clears Redo.

## Step size and Field independence

- Enter different manual backward and forward distances; reload and confirm persistence.
- Switch to each `1/32`, `1/16`, and `1/8` preset.
- Resize Range and transpose/unfold a Section; confirm effective adaptive distance follows projected Range width while the fraction remains fixed.
- Focus and Unfocus; confirm adaptive distance updates.
- Hold and Stretch Tail, Lead, and both sides. Confirm neither configured Offset nor Step size changes.
- Confirm side Step uses the visible differential without rewriting configured semantic Reach.
- Step toward a Resolution endpoint repeatedly. Confirm the endpoint remains fixed through the one-Step midpoint guard, then advances only enough to restore one Step of headroom.

## Fold geometry

- Fold one Section and confirm both endpoint Pins remain source-ordered on one lateral coordinate.
- Confirm plain Step and Refine spend zero lateral distance on the Fold.
- Confirm Pin traversal visits lower then upper endpoint going forward and reverses that order backward.
- Confirm Pin traversal reaches synthetic Range Start/End and deduplicates a real boundary Pin.
- Confirm no operator enters a Fold rail interior.
- Confirm Current can select either exact endpoint and Working Interval containment clearly distinguishes inclusion.
- Confirm playback Cursor travels continuously along the vertical rail.
- Confirm unfolding restores the exact prior lateral geometry.

## Overlap and nesting

- Create nested, asymmetric, crossing, touching, and coincident Sections.
- Fold arbitrary combinations and confirm maximal Fold union is deterministic.
- Confirm contributors retain independent colours and collapse flags.
- Unfold one contributor from a shared Fold and confirm every remaining contributor stays transposed.
- Focus a covered Section, then Unfocus; confirm prior contributor flags and Range return exactly.
- Confirm unrelated interior Pins and open child Sections are hidden.
- Go to a hidden Pin or Section from Guide; confirm all covering contributors unfold and exact placement commits in one Undo transaction.

## Direct manipulation

- Timeline/Guide Go across a visible lateral distance; confirm the movement is the Working Interval and its unclipped Resolution has two equal Interval-width margins on each side (five Interval widths total).
- Repeat beside each Range boundary and confirm clipping removes only unavailable margin.
- Move between stacked Fold faces and confirm the zero-lateral hop preserves the prior Resolution.
- Drag an open Section body; only its endpoint Pins should translate.
- Drag a shared Pin; every referencing Section should update.
- Drag a Fold endpoint vertically beyond the original rail; confirm the Section can extend and shrink while all shared constraints hold.
- Drag a contributor rail horizontally; confirm only that Section’s endpoints translate.
- Activate a unique hinge; confirm one Section toggles.
- Activate a composite hinge; confirm Guide opens without silently choosing a contributor.
- Release each drag outside the marker and confirm exactly one terminal action and one Undo.

## Guide lifecycle

- Create untitled and titled Pins and Sections.
- Reuse exact endpoint Pins when transposing or saving.
- Join two selected Pins.
- Overwrite one retained Section from the Working Interval.
- Rename, select, Go, Focus, Transpose, Unfold, and delete.
- Delete a referenced Pin; confirm the warning count and that exactly its referencing Sections dissolve in one transaction.
- Reload and confirm overlap, shared endpoints, titles, and per-Section collapse flags persist.

## Playback and Context

- Play across every Fold arrangement and confirm every source frame is heard.
- Start Context centered on, beside, and across a Fold; confirm its source window is unchanged by transposition.
- Focus a proper Range and play through its end.
- Confirm each wrap rebases each available side at most once, leaves an out-of-Range side parked, resumes, and increments the cycle count.
- Confirm a wrap commits no Current, Resolution, Working Interval, Context, or history.
- Start playback from the middle of a proper Range; after wrapping, confirm the entry watchdog follows Range Start and never jumps back to the original departure.
- Begin playback from either boundary and from inside an existing Working Interval; confirm settlement preserves or extends coverage and never shortens it.
- Unfocus to full-video Range and confirm native playback stops at the source end.
- Pause and accept Context; confirm the visible endpoint deformation and committed Session result match exactly.

## Timeline and responsive quality

- Confirm adaptive major/minor source-time guides remain useful on wide and narrow viewports.
- Confirm all open Sections occupy the lowest available lanes without a five-lane overlap cap.
- Confirm dense Fold roots, endpoint Pins, rails, and hinges have disjoint hit regions with readable connectors back to their exact knot.
- Confirm contributor rails, Current, Cursor, actual/preview Working Interval coverage, Resolution, selected state, and hidden interiors remain visually distinguishable.
- Confirm desktop workspace order is Parameters, Operators, Guide.
- Confirm narrow layout preserves timeline clarity, matrix order, and touch targets.
- Confirm keyboard, mouse, touch Shift latch, coarse pointer, and screen-reader names expose the same actions.

## Invariant checks

After every operator and drag:

```text
Range.start <= Current <= Range.end
Working Interval ⊆ Range in source time
Working Interval ⊆ Resolution ⊆ Range in Traversal Time
every Section has positive source duration
Fold union is normalized and derived
source playback is contiguous
history contains no transport-only wrap
```
