# Validation

`npm run check` is the required automated gate. `npm run test:semantic` runs the extended state-space suite.

## Operator matrix

- Confirm DOM and visual order is `QWE / ASD / RTF`.
- Confirm Shift changes only Refine to Additive Refine and Step to Pin traversal.
- Confirm ordinary Refine retains its existing midpoint/membership behavior.
- Confirm Additive Refine `50 → 25 → 12.5` retains `50 → 12.5`, frame `{0,12.5,50}`, and reverses to `31.25`.
- Confirm Reopen restores Range endpoints.
- Confirm Switch is an exact involution.
- Confirm Release clears only a non-null Working Interval and creates no history on null.
- Confirm Transpose preserves the Working Interval.
- Confirm Focus/Unfocus restores the containing Range and presentation exactly; changing Focus targets must preserve that same return Range.

## Step size and Field independence

- Enter different manual backward and forward distances; reload and confirm persistence.
- Switch to each `1/32`, `1/16`, and `1/8` preset.
- Resize Range and transpose/unfold a Section; confirm effective adaptive distance follows projected Range width while the fraction remains fixed.
- Focus and Unfocus; confirm adaptive distance updates.
- Hold and Stretch Tail, Lead, and both sides. Confirm physical Offset may change while Step size is byte-identical.
- Confirm side Step uses the visible differential without rewriting configured semantic Reach.

## Fold geometry

- Fold one Section and confirm both endpoint Pins remain source-ordered on one lateral coordinate.
- Confirm plain Step and Refine spend zero lateral distance on the Fold.
- Confirm Pin traversal visits lower then upper endpoint going forward and reverses that order backward.
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
- Unfocus to full-video Range and confirm native playback stops at the source end.
- Pause and accept Context; confirm the visible endpoint deformation and committed Session result match exactly.

## Timeline and responsive quality

- Confirm five useful source-time ruler markers on a wide viewport and reduced, non-overlapping labels on narrow screens.
- Confirm open Sections occupy the lowest available lanes.
- Confirm dense Fold endpoint Pins stagger with readable connectors and preserve exact source order.
- Confirm contributor rails, Current, Cursor, Working Interval inclusion, selected state, and hidden interiors remain visually distinguishable.
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
