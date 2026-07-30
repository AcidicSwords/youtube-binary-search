# Validation

`npm run check` is the required automated gate. `npm run test:semantic` runs the extended state-space suite.

## Operator matrix

- Confirm DOM and visual order is `QWE / ASD / RTF`.
- Confirm Shift changes only Refine to Local Refine and Step to Pin traversal.
- Confirm plain Refine `50 → 25 → 12.5` retains `50 → 12.5`, frame `{0,12.5,50}`, and reverses to `31.25`.
- Refine, Reopen, then plain Refine past the retained departure in the opposite direction; confirm the complete movement becomes the Working Interval in both directions.
- Confirm same-direction Refine still retains the old departure.
- Confirm Local Refine uses midpoint membership.
- Alternate Refine and Local Refine; committed Working Interval and hover preview must match.
- Confirm Reopen restores Range endpoints.
- Confirm Switch is an exact involution.
- Confirm Release clears only a non-null Working Interval.
- Confirm Deform preserves the Working Interval while changing only one Section factor.
- Confirm Focus/Unfocus restores the containing Range exactly.
- Confirm plain `Z` Undoes and plain `C` Redoes; a new action after Undo clears Redo.

## Canonical weight scale

- Confirm every Deform and Section selector contains, in order: `0.25×`, `0.5×`, `0.75×`, `1×`, `1.25×`, `1.5×`, `1.75×`, `2×`.
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

- Timeline/Guide Go across a spatial distance; confirm the movement is the Working Interval and its unclipped Resolution has two equal Interval-width margins on each side.
- Repeat beside each Range boundary and confirm clipping removes only unavailable margin.
- Drag a Section body; only its endpoint Pins should translate.
- Drag a shared Pin; every referencing Section should update.
- Change weight from the timeline and Guide; confirm both paths produce the same model and one Undo entry.
- Release each drag outside its marker; confirm one terminal action and one Undo.

## Guide lifecycle

- Create untitled and titled Pins and Sections.
- Reuse exact endpoint Pins when deforming or saving.
- Join two selected Pins.
- Overwrite one retained Section from the Working Interval.
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
- Confirm Sections occupy the lowest available lanes without a fixed cap.
- Confirm compressed gradients converge, expanded gradients open, and `1×` is neutral.
- Confirm gradients remain backed by a numeric selector and state text rather than colour alone.
- Confirm dense Section selectors, Pins, and Range handles have distinct hit regions.
- Confirm Current, Cursor, actual/preview Working Interval, Resolution, and selected state remain distinguishable.
- Confirm desktop workspace order is Parameters, Operators, Guide.
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
