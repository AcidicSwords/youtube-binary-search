# Video Cartography — Lexicon

This document is the **normative naming authority** for the project. Where any
other surface — source code, model fields, module names, DOM identifiers, CSS
classes, operator labels, Guide controls, State & Settings, Timeline labels,
tooltips, status messages, accessibility text, persistence, tests, audits, or
canonical documentation — disagrees with an entry here, this document wins and
the other surface is the defect.

`GLOSSARY.md` is a reader-facing derivative of this file and holds no
independent authority. `lexicon-audit.mjs` enforces the **Forbidden synonyms**
and cross-surface consistency mechanically.

## Governing lexical law

> One canonical term names one canonical object, operation, attribute, state,
> or relation. A word may be shared only where the things named formally share
> that relation. Generic mathematical words must identify their operand
> whenever ambiguity is possible.

Consequences:

- **One object, one name.** The `{backward, current, forward}` triple is the
  *Current Neighborhood* on every surface — never Resolution here and
  Neighborhood there.
- **One name, one meaning.** A term must not name unrelated things (Group
  `Active` and a transient active relation; Guide `Focus` and the Focus
  operator).
- **Shared terms express real shared structure.** *Window* in Context Window
  and Panorama Window (both temporary observational intervals); *Weight* in
  participating Weights and Effective Weight (both operative consequences of
  Section Weightings); *Current* in Current Neighborhood (defined around
  Current).
- **Generic words require qualification.** No naked visible *interval*,
  *midpoint*, *start*, *end*, *active*, *weight*, *focus*, *frame*, *window*,
  *position*, or *anchor*. Qualify the operand: Range Timeline Midpoint, Active
  Span, Section Weighting, Effective Weight, Ghost Anchor, Panorama Frame,
  Context Window.
- **Key bindings do not determine product names.** `T` is the physical key for
  Retain Pin / Retain Section; it does not make the operator "Tag." `G` is
  Ghost even though it could have been mnemonic for Guide; Guide is on `I`. The
  semantic grammar and the physical keyboard grammar are related but separate
  systems.

Formal uses of `resolution`, `interval`, `extent`, `midpoint`, `density`, or
`frame` remain permitted **only** when their ordinary mathematical or media
meaning is explicitly qualified (e.g. a code comment stating
`Effective Weight = d(Timeline Space) / d(Source Time)`, or an accessible
`source-time midpoint`).

## How to read an entry

Each canonical term carries:

- **Class** — object · position · attribute · operator · state · relation ·
  presentation.
- **Definition** — necessary and sufficient meaning.
- **Owner** — the semantic module responsible for it.
- **Code stem** — the required identifier root.
- **UI label** — the required visible wording (`—` when the term is not itself
  shown).
- **Qualifiers** — valid grammatical forms.
- **Forbidden synonyms** — retired terms the audit rejects.
- **Non-effects** — what the term explicitly does not mean.

---

## Source and temporal position

### Source
- **Class** object · **Owner** `youtube.js`
- **Definition** The loaded audiovisual sequence.
- **Code stem** `source` · **UI label** —
- **Qualifiers** Source Time, Source Address, Source-scoped.
- **Forbidden synonyms** video (as the model object), clip.
- **Non-effects** Not the Timeline; not the map.

### Source Time
- **Class** position · **Owner** `range-geometry.js`
- **Definition** The authoritative temporal coordinate of the Source.
- **Code stem** `source` (time context) · **UI label** Source Time
- **Qualifiers** Source-Time duration, Source-Time Grid, Source-Time midpoint.
- **Forbidden synonyms** real time (for source position), video time.
- **Non-effects** Not Timeline Space; not wall-clock time.

### Address
- **Class** position · **Owner** `range-geometry.js`
- **Definition** One finite location in Source Time.
- **Code stem** `address` · **UI label** — (shown as a formatted time)
- **Qualifiers** Source Address, Range Start Address, known Address.
- **Forbidden synonyms** point (as the model object), time (as the object).
- **Non-effects** Not Current; not Cursor; not Candidate.

### Range
- **Class** object · **Owner** `session.js`
- **Definition** The source interval currently admissible to ordinary operation.
- **Code stem** `range` · **UI label** Range
- **Qualifiers** Range Start, Range End, Range Fraction, Range Timeline Midpoint,
  active Range, containing Range, Full Video.
- **Forbidden synonyms** window (for Range), viewport (for Range).
- **Non-effects** Not Focus; not a Panorama Window or Context Window.

### Current
- **Class** position · **Owner** `session.js`
- **Definition** The committed semantic Address.
- **Code stem** `current` · **UI label** Current
- **Qualifiers** Current Neighborhood, Set … to Current, Retain Current as Pin.
- **Forbidden synonyms** playhead (for Current), position (naked).
- **Non-effects** Not the media playback position (that is Cursor); not a
  Candidate.

### Cursor
- **Class** position · **Owner** `app.js`
- **Definition** The transient Address currently being observed when media
  presentation has moved away from Current.
- **Code stem** `cursor` · **UI label** Cursor
- **Qualifiers** Cursor marker.
- **Forbidden synonyms** Trace Cursor, temporal cursor, playhead.
- **Non-effects** Not committed; not a Trace Position (a Trace record slot); not
  a Candidate.

### Candidate
- **Class** position · **Owner** `app.js`
- **Definition** An uncommitted Address proposed by an active gesture.
- **Code stem** `candidate` · **UI label** Candidate
- **Qualifiers** Candidate marker, candidate Address.
- **Forbidden synonyms** preview current, preview-current.
- **Non-effects** Not committed until settlement; not a Ghost Position.

### Anchor
- **Class** position · **Owner** `app.js`
- **Definition** A fixed gesture Address; always qualified in visible language.
- **Code stem** `anchor` · **UI label** Drag Anchor · Ghost Anchor
- **Qualifiers** Ghost Anchor, Drag Anchor, Gesture Anchor.
- **Forbidden synonyms** naked "Anchor" in visible text, departure (visible).
- **Non-effects** Not Current; not a retained structure.

---

## Navigation

### Current Neighborhood
- **Class** object · **Owner** `range-geometry.js`, `session.js`
- **Definition** The ordered Backward Bound, Current, and Forward Bound used by
  Refine and Step.
- **Code stem** `neighborhood` (`model.neighborhood`, `currentNeighborhood`) ·
  **UI label** Current Neighborhood
- **Qualifiers** Neighborhood Basis, Refinement Level, Backward/Forward Bound.
- **Forbidden synonyms** Resolution, Resolution Basis, Resolution Level,
  Resolution limit, frame (for the triple), local interval.
- **Non-effects** Not an Active Span; narrowing it *produces* temporal
  resolution but is not itself "Resolution."

### Backward Bound
- **Class** position · **Owner** `range-geometry.js`
- **Definition** Earlier bound of the Current Neighborhood.
- **Code stem** `backward` · **UI label** Backward Bound
- **Forbidden synonyms** L (visible), resolution-start-marker, left bound.

### Forward Bound
- **Class** position · **Owner** `range-geometry.js`
- **Definition** Later bound of the Current Neighborhood.
- **Code stem** `forward` · **UI label** Forward Bound
- **Forbidden synonyms** R (visible), resolution-end-marker, right bound.

### Neighborhood Basis
- **Class** attribute · **Owner** `session.js`
- **Definition** Whether the Neighborhood is established from Range or movement.
- **Code stem** `neighborhoodBasis` / `NEIGHBORHOOD_BASIS` · **UI label** Range
  basis · movement basis
- **Forbidden synonyms** resolutionBasis, RESOLUTION_BASIS.

### Refinement Level
- **Class** attribute · **Owner** `session.js`
- **Definition** Depth of directional refinement represented by the Neighborhood.
- **Code stem** `refinementLevel` · **UI label** refinement level
- **Forbidden synonyms** resolution.level, Resolution Level.

### Refine
- **Class** operator · **Owner** `session.js` · **Key** `Q` / `E`
- **Definition** Move to a weighted midpoint on one side of Current.
- **Code stem** `refine` · **UI label** Refine Backward · Refine Forward
- **Qualifiers** Local Refine, Backward/Forward Refine Target.
- **Non-effects** Does not change Range.

### Local Refine
- **Class** operator · **Owner** `session.js` · **Key** `Shift+Q` / `Shift+E`
- **Definition** Refine while retaining only the immediate Current-to-target
  movement.
- **Code stem** `localRefine` · **UI label** Local Refine Backward · Local
  Refine Forward

### Reopen
- **Class** operator · **Owner** `session.js` · **Key** `W`
- **Definition** Restore the Current Neighborhood to Range.
- **Code stem** `reopen` · **UI label** Reopen · Restore Neighborhood to Range

### Step
- **Class** operator · **Owner** `session.js` · **Key** `A` / `D`
- **Definition** Move a configured distance through Timeline Space.
- **Code stem** `step` · **UI label** Step Backward · Step Forward
- **Qualifiers** Step Distance, Step Mode, Step Reversal.
- **Forbidden synonyms** Step Reach (for the distance setting).
- **Non-effects** Distance is Timeline Space, not Source-Time seconds.

### Go
- **Class** operator · **Owner** `session.js`
- **Definition** Move directly to a known Source Address.
- **Code stem** `go` · **UI label** Go

### Nudge
- **Class** operator · **Owner** `app.js` · **Key** `,` / `.` and `Shift+wheel`
- **Definition** Move a precise distance in Source Time.
- **Code stem** `nudge` · **UI label** Nudge
- **Qualifiers** Nudge Distance, Nudge Backward/Forward.
- **Forbidden synonyms** nudgeSeconds (persisted key retired to `nudgeDistance`).

---

## Active relation

### Active Span
- **Class** relation · **Owner** `session.js`
- **Definition** The one temporary positive relation established between two
  Addresses by navigation, selection, observation, composition, or Ghost.
- **Code stem** `activeSpan` (`model.activeSpan`) · **UI label** Active Span
- **Qualifiers** Span Start, Span End, Active End, Active-Span Timeline Midpoint.
- **Forbidden synonyms** Working Interval, No Interval, working-section,
  `FOCUS_KIND.WORKING`, naked "interval" (visible).
- **Non-effects** Has no retained identity, Pins, Group, or Section Weighting.

### Span Start
- **Class** position · **Owner** `session.js`
- **Definition** Earlier Address of the Active Span.
- **Code stem** `spanStart` · **UI label** Span Start
- **Non-effects** Not a Pin; not a Section Start Pin.

### Span End
- **Class** position · **Owner** `session.js`
- **Definition** Later Address of the Active Span.
- **Code stem** `spanEnd` · **UI label** Span End

### Active End
- **Class** position · **Owner** `session.js`
- **Definition** The Active-Span end currently occupied by Current.
- **Code stem** `activeEnd` · **UI label** — (implied by Switch End)
- **Forbidden synonyms** activeSide.

### Switch End
- **Class** operator · **Owner** `session.js` · **Key** `S`
- **Definition** Make the opposite end of the Active Span Current and restore the
  Current Neighborhood stored there.
- **Code stem** `switchActiveEnd` · **UI label** Switch End
- **Forbidden synonyms** Switch Endpoint, switchEndpoint, switchCurrentEndpoint,
  switch-endpoint. Reserve `endpoint` for Section endpoint Pins.

### Release
- **Class** operator · **Owner** `session.js` · **Key** `R`
- **Definition** Clear the Active Span and Timeline Selection.
- **Code stem** `release` · **UI label** Release
- **Qualifiers** metadata states the operand: Active Span · Timeline Selection ·
  Active Span and Timeline Selection · Nothing to release.
- **Forbidden synonyms** Release Working Interval.

---

## Retained structure (Guide)

### Pin
- **Class** object · **Owner** `guide.js`
- **Definition** A retained Address with identity.
- **Code stem** `pin` · **UI label** Pin
- **Qualifiers** Section Start Pin, Section End Pin, Shown/Hidden Pin.

### Section
- **Class** object · **Owner** `guide.js`
- **Definition** A retained interval between two Pin identities; owns one Group
  and one Section Weighting.
- **Code stem** `section` · **UI label** Section
- **Qualifiers** Section Start Pin, Section End Pin, Section Weighting, Section
  Timeline Midpoint, Section Timeline Allocation Factor.
- **Non-effects** Not an Active Span.

### Section Start Pin
- **Class** object · **Owner** `guide.js`
- **Definition** Pin identity at the Section's earlier Address.
- **Code stem** `startPinId` · **UI label** Start Pin

### Section End Pin
- **Class** object · **Owner** `guide.js`
- **Definition** Pin identity at the Section's later Address.
- **Code stem** `endPinId` · **UI label** End Pin

### Group
- **Class** object · **Owner** `guide.js`
- **Definition** A flat partition of Sections.
- **Code stem** `group` · **UI label** Group (default label `Group 1`, `Group 2`…)
- **Qualifiers** Show on Timeline, Use Weights, shown Group.
- **Forbidden synonyms** Group Active, `group.active`, default label `Map`.
- **Non-effects** Group activity (Use Weights) is independent of being shown.

### Timeline Selection
- **Class** state · **Owner** `app.js`
- **Definition** Pin or Section selected from the Timeline.
- **Code stem** `timelineSelection` · **UI label** Timeline Selection
- **Forbidden synonyms** Acquired Timeline Operand, `selectedRetained`.

### Guide Selection
- **Class** state · **Owner** `app.js`
- **Definition** Pin, Section, or Chapter selected in Guide.
- **Code stem** `guideSelection` · **UI label** Guide Selection
- **Forbidden synonyms** Guide Focus, `guideRetained`.
- **Non-effects** Not the Focus operator; not DOM keyboard focus.

### Retain Pin
- **Class** operator · **Owner** `session.js` · **Key** `T`
- **Definition** Create a Pin at Current.
- **Code stem** `retainCurrentAsPin` · **UI label** Retain Pin
- **Forbidden synonyms** Tag, Tag as Pin, `pinCurrent`, tag-label, tag-meta,
  pin-capture.

### Retain Section
- **Class** operator · **Owner** `session.js` · **Key** `Shift+T`
- **Definition** Create a Section from the Active Span.
- **Code stem** `retainActiveSpanAsSection` · **UI label** Retain Section
- **Forbidden synonyms** Tag as Section, `saveCurrentIntervalAsSection`,
  section-capture.

### Focus
- **Class** operator · **Owner** `session.js` · **Key** `F`
- **Definition** Make an Active Span or Section the active Range.
- **Code stem** `focus` · **UI label** Focus · Focus Active Span
- **Non-effects** Not Guide Selection; not DOM keyboard focus.

### Unfocus
- **Class** operator · **Owner** `session.js` · **Key** `F`
- **Definition** Restore the containing Range.
- **Code stem** `unfocus` · **UI label** Unfocus
- **Forbidden synonyms** Leave (as the Focus control).

### Extend Span
- **Class** operator · **Owner** `app.js`, `guide.js`
- **Definition** Expand the Active Span to include another interval.
- **Code stem** `extendSpan` · **UI label** Extend Span
- **Forbidden synonyms** Extend (naked), `guideCompose`, guide-compose-toggle.

### Carry
- **Class** operator modifier · **Owner** `app.js` · **Key** `Alt`
- **Definition** While held, carries the current Timeline Selection through a
  traversal (Step, Refine, Go, Pin traversal), so the acquired Pin or Section
  moves with Current instead of being left behind.
- **Code stem** `carry` (`carryModifier`, `carryRetained`,
  `carryRetainedThrough`) · **UI label** Carry (Alt)
- **Qualifiers** carried Timeline Selection.
- **Non-effects** Not a semantic operator of its own; it modifies another
  traversal and commits within that traversal's transaction. Distinct from
  Extend Span, which grows the Active Span rather than moving a retained object.

---

## Topography and playback texture

### Section Weighting
- **Class** attribute · **Owner** `guide.js`
- **Definition** Stored factor assigned to one Section.
- **Code stem** `section.weighting` · **UI label** Weighting
- **Qualifiers** `SECTION_WEIGHTING_VALUES`, `DEFAULT_SECTION_WEIGHTING`.
- **Forbidden synonyms** Section Weight, `section.weight`,
  `SECTION_WEIGHT_VALUES`, `DEFAULT_SECTION_WEIGHT`.
- **Non-effects** Not the operative Weight; not the Timeline Allocation Factor.

### Weight
- **Class** attribute · **Owner** `timeline-projection.js`
- **Definition** The currently operative contribution of a Section Weighting.
- **Code stem** `weight` (contributor context) · **UI label** Weights (plural,
  operative): Use Weights, Relax Weights, Restore Weights.
- **Qualifiers** participating Weights, Effective Weight, weight contributors.
- **Forbidden synonyms** naked visible singular "Weight" for a Section
  attribute (that is Weighting).

### Effective Weight
- **Class** attribute · **Owner** `timeline-projection.js`
- **Definition** Product of all participating, non-relaxed Weights at an Address.
- **Code stem** `effectiveWeight` / `effectiveWeightAtSource` · **UI label**
  Effective Weight
- **Forbidden synonyms** `weightAtSource` (naked), density (public).

### Timeline Space
- **Class** presentation · **Owner** `timeline-projection.js`
- **Definition** Positive spatial coordinate derived from Effective Weight.
- **Code stem** `timeline` · **UI label** Timeline Space · Timeline units
- **Non-effects** Not Source Time; one Timeline unit equals one source second
  only at neutral Effective Weight.

### Effective Projection
- **Class** object · **Owner** `timeline-projection.js`
- **Definition** Current invertible mapping between Source Time and Timeline
  Space.
- **Code stem** `projection` · **UI label** —
- **Qualifiers** `sourceToTimeline`, `timelineToSource`, `stepTarget`.

### Timeline Allocation Factor
- **Class** attribute · **Owner** `timeline-projection.js`
- **Definition** Effective projected Timeline-Space extent divided by
  Source-Time extent for one qualified interval.
- **Code stem** `timelineAllocationFactor`
  (`formatTimelineAllocationFactor`, `rangeTimelineAllocationFactor`) ·
  **UI label** Timeline Allocation
- **Qualifiers** Section Timeline Allocation Factor, Range Timeline Allocation
  Factor, Neighborhood Timeline Allocation Factor, Overall Timeline Allocation
  Factor.
- **Forbidden synonyms** Stretch Factor, Section Stretch Factor,
  `formatStretchFactor`, `rangeStretchFactor`.
- **Non-effects** Derived rather than stored; may differ from a Section
  Weighting under overlap; does not change Timeline Projection.

### Temporal Topography
- **Class** presentation · **Owner** `view.js`
- **Definition** The complete weighted map of Source Time.
- **Code stem** `temporalTopography` (`renderTemporalTopography`) · **UI label**
  Temporal Topography
- **Forbidden synonyms** Deformation, Deformation Field, Deformation Atmosphere.

### Weight Gradient
- **Class** presentation · **Owner** `view.js`
- **Definition** Continuous visual representation of topographic variation.
- **Code stem** `weightGradient` · **UI label** Weight Gradient
- **Forbidden synonyms** deformation-atmosphere, atmosphere, terrain line.

### Source-Time Grid
- **Class** presentation · **Owner** `view.js`
- **Definition** Regular Source-Time lines projected into Timeline Space.
- **Code stem** `sourceTimeGrid` (`gridLine`, `sourceGridLineCount`,
  `sourceGridRange`) · **UI label** Source-Time Grid
- **Forbidden synonyms** deformation-contours, contour, contourCount,
  contourSpan.
- **Non-effects** Not the Timeline Ruler (labelled Addresses are separate).

### Grid Spacing
- **Class** presentation · **Owner** `view.js`
- **Definition** Visible separation between adjacent Source-Time Grid lines.
- **Code stem** `gridSpacing` · **UI label** Grid Spacing

### Timeline Ruler
- **Class** presentation · **Owner** `view.js`
- **Definition** Sparse labelled Addresses for reading position.
- **Code stem** `timelineRuler` · **UI label** Timeline Ruler

### Textured Playback
- **Class** operator · **Owner** `transport.js` · **Key** `Shift+Space`
- **Definition** A Center-only playback-rate policy whose requested rate is
  derived from Effective Weight at Cursor.
- **Code stem** `texturedPlayback` (`RATE_POLICY_KIND.TEXTURED`,
  `texturedRatePolicy`, `texturedRateForWeight`, `resolveTexturedRate`) ·
  **UI label** Textured Playback
- **Forbidden synonyms** Dynamic Playback, Dynamic Weight Texture,
  `dynamic-weight-texture`, `dynamicRatePolicy`, `desiredCenterRate`,
  `resolveCenterRate`, Follow Section weight.
- **Non-effects** Does not cancel or invert Temporal Topography; Shift+Space is
  Center-only (never Panorama).

### Relax Weights
- **Class** operator · **Owner** `app.js` · **Key** `X`
- **Definition** Temporarily treat one selected Weight or all Weights as neutral
  `1×` without modifying stored Section Weightings.
- **Code stem** `weightRelaxation` (`toggleWeightRelaxation`,
  `resolvedWeightRelaxationScope`) · **UI label** Relax Weights
- **Forbidden synonyms** Deformation Bypass, Toggle Deformation, Straighten
  Timeline, Straighten Section, Bypass Weight, Suspend Weight,
  `deformationBypass`.
- **Non-effects** Changes no Section Weighting; no Undo history; no persistence;
  does not necessarily flatten an overlapping region.

### Restore Weights
- **Class** operator · **Owner** `app.js` · **Key** `X`
- **Definition** End Weight relaxation, returning Weights to the Effective
  Projection.
- **Code stem** `restoreWeights` · **UI label** Restore Weights

---

## Observation

### Automatic Context
- **Class** state · **Owner** `app.js`
- **Definition** Configured nearby observation after eligible traversal.
- **Code stem** `automaticContext` · **UI label** Automatic Context
- **Qualifiers** Context Window, Context Playback, Context Duration.

### Context Window
- **Class** object · **Owner** `transport.js`
- **Definition** Bounded interval around Current used by Context Playback.
- **Code stem** `contextWindow` · **UI label** Context Window
- **Non-effects** Not called a span in visible language; not an Active Span.

### Context Playback
- **Class** state · **Owner** `transport.js`, `app.js`
- **Definition** Temporary observation moving Cursor through the Context Window
  while Current remains fixed.
- **Code stem** `contextPlayback` · **UI label** Context Playback

### Context Duration
- **Class** attribute · **Owner** `app.js`
- **Definition** Configured total Source-Time span of the Context Window.
- **Code stem** `contextDuration` · **UI label** Context Duration
- **Forbidden synonyms** Center-only duration, `contextSeconds` (persisted key).

### Ripple Observation Address
- **Class** address · **Owner** `app.js`
- **Definition** Non-Current Address acquired from bare Timeline ground for
  observation through the shared Context relation.
- **Code stem** `rippleObservation.observationAddress` · **UI label** Ripple
  Observation Address
- **Non-effects** Does not change Current, semantic history, Traversal Trace,
  Guide structure, Focus, Range, or Section Weightings.

### Ripple Context Window
- **Class** interval · **Owner** `transport.js`
- **Definition** Independently Range-clipped Context Window derived for a Ripple
  Observation Address.
- **Code stem** `rippleObservation.contextStart` /
  `rippleObservation.contextEnd` · **UI label** Ripple Context Window
- **Non-effects** Not a second transport or Context Duration; uses the ordinary
  Context owner and clipping relation.

### Panorama
- **Class** object · **Owner** `panorama.js`
- **Definition** The Tail–Center–Lead observation system.
- **Code stem** `panorama` · **UI label** Panorama
- **Forbidden synonyms** Panoramic Phase Field, Field, Step Field.

### Panorama Frame
- **Class** presentation · **Owner** `panorama-frame.js`
- **Definition** Stable Tail–Center–Lead arrangement outside Panorama Playback.
- **Code stem** `panoramaFrame` · **UI label** Panorama Frame
- **Forbidden synonyms** Field Frame.

### Panorama Window
- **Class** object · **Owner** `panorama.js`
- **Definition** The current source interval bounded by Tail and Lead.
- **Code stem** `panoramaWindow` · **UI label** Panorama Window
- **Forbidden synonyms** Field span, Panorama span, Panorama Extent,
  `fieldSpan`.
- **Non-effects** A frozen positive Window may be retained as an ordinary
  Section; that Section carries no Panorama identity.

### Panorama Width
- **Class** attribute · **Owner** `panorama.js`
- **Definition** Source-Time duration of the Panorama Window.
- **Code stem** `panoramaWidth` · **UI label** Panorama Width

### Panorama Pane
- **Class** presentation · **Owner** `panorama.js`
- **Definition** One Tail, Center, or Lead viewing pane in the Panorama.
- **Code stem** `panorama-pane` · **UI label** Tail · Center · Lead
- **Forbidden synonyms** `step-pane`.

### Panorama Cycle
- **Class** state · **Owner** `panorama-geometry.js`
- **Definition** Bounded expansion and contraction of Tail and Lead offsets.
- **Code stem** `panoramaCycle` (`createPanoramaCycle`, `PANORAMA_DIRECTION`) ·
  **UI label** Panorama Cycle
- **Forbidden synonyms** Field Breath, Breath, Breath Rate, `fieldBreath`,
  `BREATH_PHASE`, `DEFAULT_FIELD_BREATH`.

### Cycle Direction
- **Class** attribute · **Owner** `panorama-geometry.js`
- **Definition** Whether the Panorama Cycle is currently expanding or contracting.
- **Code stem** `PANORAMA_DIRECTION` · **UI label** — (Expanding · Contracting)

### Inner Offset
- **Class** attribute · **Owner** `panorama-geometry.js`
- **Definition** Minimum side separation from Center.
- **Code stem** `innerOffset` · **UI label** Inner Offset

### Outer Offset
- **Class** attribute · **Owner** `panorama-geometry.js`
- **Definition** Maximum side separation from Center.
- **Code stem** `outerOffset` · **UI label** Outer Offset

### Side Rate Step
- **Class** attribute · **Owner** `panorama-geometry.js`
- **Definition** Playback-rate difference between Center and a moving side.
- **Code stem** `sideRateStep` (`PANORAMA_SIDE_RATE_STEPS`, `panoramaSideRates`) ·
  **UI label** Side Rate Step
- **Forbidden synonyms** Breath Rate, `breathRatePair`.

### Tail · Center · Lead
- **Class** object · **Owner** `panorama.js`
- **Definition** The trailing side, the committed centre, and the leading side of
  Panorama.
- **Code stem** `tail` / `center` / `lead` · **UI label** Tail · Center · Lead

### Freeze Panorama
- **Class** operator · **Owner** `panorama.js`
- **Definition** Stop the Panorama Cycle at its attained Tail and Lead offsets.
- **Code stem** `freezePanorama` (runtime state `frozen`) · **UI label** Freeze
  Panorama
- **Forbidden synonyms** Hold Panorama, Hold both, `holdPanorama`, `held`.
- **Non-effects** Does not change Panorama preferences, Current, Timeline
  Projection, Section Weighting, semantic history, or Traversal Trace.

### Frozen Panorama
- **Class** state · **Owner** `panorama.js`
- **Definition** Panorama state in which the Cycle is stopped and attained Tail
  and Lead offsets remain stable.
- **Code stem** `PANORAMA_STATE.FROZEN` / `cycle.frozen` · **UI label** Frozen
  Panorama

### Stretch Panorama
- **Class** operator · **Owner** `panorama.js`
- **Definition** Continue the Panorama Cycle from the frozen relation.
- **Code stem** `stretchPanorama` / `stretchCycle` · **UI label** Stretch
  Panorama
- **Forbidden synonyms** Resume Panorama, `resumePanorama`, `resumeCycle`.
- **Non-effects** Does not change Section Weighting, Timeline Projection, Step
  Distance, Current, semantic history, or Traversal Trace. While stretching,
  the Panorama Window is not eligible as a stable Section source.

> `Suspended` remains a legal **internal** system condition (Center-only
> Shift+Space, unavailable side players, synchronization transitions, source
> replacement). It must never label the user control.

---

## Traversal record and Ghost

### Traversal Trace
- **Class** object · **Owner** `traversal-trace.js`
- **Definition** Append-only record of the route actually taken through the
  Source.
- **Code stem** `traversalTrace` (`createTraversalTrace`) · **UI label**
  Traversal Trace
- **Forbidden synonyms** User Time, Encounter Order, `userTime`, `user-time`.
- **Non-effects** Automatic Context and Ripple observation do not append Trace
  evidence. Movement to a Ripple prospect is ordinary traversal and does.

### Traversal Prospect
- **Class** transient object · **Owner** `traversal-prospects.js`
- **Definition** Known Source Address available to Ghost's forward route that
  has not yet been committed as Current.
- **Code stem** `traversalProspects` · **UI label** Traversal Prospect
- **Non-effects** Not Traversal Trace, semantic history, Guide structure, or
  persistent state.

### Ripple Start Prospect
- **Class** transient object · **Owner** `traversal-prospects.js`
- **Definition** Traversal Prospect at the resolved start of a Ripple Context
  Window.
- **Code stem** `kind: "ripple-start"` · **UI label** Ripple Start Prospect

### Ripple End Prospect
- **Class** transient object · **Owner** `traversal-prospects.js`
- **Definition** Traversal Prospect at the resolved end of a Ripple Context
  Window.
- **Code stem** `kind: "ripple-end"` · **UI label** Ripple End Prospect

### Trace Entry
- **Class** object · **Owner** `traversal-trace.js`
- **Definition** One committed record in the Traversal Trace.
- **Code stem** `traceEntry` (`appendTraceEntry`) · **UI label** Trace Entry

### Trace Position
- **Class** position · **Owner** `traversal-trace.js`
- **Definition** One readable position in a frozen Trace.
- **Code stem** `tracePosition` (`tracePositionIsValid`,
  `latestTracePositionAtAddress`) · **UI label** Trace Position
- **Forbidden synonyms** Trace Cursor, cursor (for a Trace slot).

### Jump
- **Class** object · **Owner** `traversal-trace.js`
- **Definition** Movement between two occupied Addresses without continuous
  observation.
- **Code stem** `UNIT_KIND.JUMP` · **UI label** Jump

### Observed Passage
- **Class** object · **Owner** `traversal-trace.js`
- **Definition** Source-Time interval watched continuously.
- **Code stem** `UNIT_KIND.PASSAGE` (`appendObservedPassages`,
  `passagePositions`) · **UI label** Observed Passage
- **Forbidden synonyms** Observed Span, span (for a watched interval).

### Ghost
- **Class** operator · **Owner** `app.js`, `session.js` · **Key** held `G` +
  wheel
- **Definition** Operator that replays the Traversal Trace while preserving the
  current semantic environment.
- **Code stem** `ghost` · **UI label** Ghost
- **Non-effects** Restores no historical Range, Guide, Groups, Section
  Weightings, Focus, or semantic history.

### Ghost Candidate
- **Class** provisional address · **Owner** `app.js`
- **Definition** Address currently previewed by a Ghost gesture while accepted
  Session Current remains unchanged.
- **Code stem** `ghostGesture.candidate` · **UI label** Ghost Candidate
- **Non-effects** Scanning changes neither semantic history nor Traversal Trace;
  cancellation discards the Candidate.

### Ghost Anchor
- **Class** position · **Owner** `app.js`
- **Definition** Current when a Ghost gesture begins.
- **Code stem** `ghostAnchor` · **UI label** Ghost Anchor

### Ghost Position
- **Class** position · **Owner** `app.js`
- **Definition** Trace Address currently previewed during a Ghost Scan.
- **Code stem** `ghostPosition` · **UI label** Ghost Position
- **Forbidden synonyms** Ghost Current.
- **Non-effects** Becomes Current only after settlement.

### Ghost Scan
- **Class** state · **Owner** `app.js`
- **Definition** Transient movement through the frozen Trace.
- **Code stem** `ghostScan` · **UI label** Ghost Scan

### Ghost Return
- **Class** object · **Owner** `traversal-trace.js`
- **Definition** Settled movement from Ghost Anchor to Ghost Position, appended
  as one Trace Entry.
- **Code stem** `GHOST_RETURN` (`appendGhostReturn`) · **UI label** Ghost Return
- **Forbidden synonyms** Ghost Injection, Ghost Landing, `GHOST_INJECTION`,
  `appendGhostInjection`.

### Ghost Continuation
- **Class** position · **Owner** `app.js`
- **Definition** Trace Position from which a later Ghost gesture may continue.
- **Code stem** `ghostContinuation` · **UI label** —
- **Forbidden synonyms** `ghostResumeCursor`, resumeCursor (public).

---

## Imported transient structure

### Chapter
- **Class** object · **Owner** `chapters.js`
- **Definition** Creator-authored chapter Address and derived interval.
- **Code stem** `chapter` (`parseChapters`, `chapterTitle`) · **UI label** Chapter
- **Qualifiers** Chapters, Find Chapters, Show Chapters on Timeline.
- **Forbidden synonyms** Cue, Cues, Chapter Candidate, Chapter Proposal,
  `parseCueList`, `cueName`.
- **Non-effects** Transience is a state, not part of the noun; does not enter
  Guide topology or Temporal Topography until retained.

### Chapter mark
- **Class** presentation · **Owner** `view.js`
- **Definition** Non-interactive Timeline rendering of a Chapter.
- **Code stem** `chapterMark` · **UI label** Chapter mark
- **Forbidden synonyms** cue-lane, timeline-cue.

### Retain Chapter as Pin
- **Class** operator · **Owner** `app.js`
- **Definition** Retain the Chapter Address.
- **Code stem** `retainChapterAsPin` · **UI label** Retain Pin (in Chapter
  context)

### Retain Chapter as Section
- **Class** operator · **Owner** `app.js`
- **Definition** Retain the Chapter interval.
- **Code stem** `retainChapterAsSection` · **UI label** Retain Section (in
  Chapter context)

---

## Project surfaces

### Guide
- **Class** presentation · **Owner** `view.js`
- **Definition** The panel of retained Groups, Sections, and Pins plus transient
  Chapters. Toggled by `I`.
- **Code stem** `guide` · **UI label** Guide · Structure and Chapters
- **Forbidden synonyms** Guide on `G`; `Retained structure` eyebrow (panel also
  holds Chapters).

### Operators
- **Class** presentation · **Owner** `view.js`
- **Definition** The operator matrix surface. Toggled by `O`.
- **Code stem** `operators` · **UI label** Operators

### State & Settings
- **Class** presentation · **Owner** `view.js`
- **Definition** Current navigation state plus settings for Range, Step, Context,
  Playback, and Panorama.
- **Code stem** `stateSettings` · **UI label** State & Settings
- **Forbidden synonyms** Parameters.

### Semantic History · Undo · Redo
- **Class** state / operator · **Owner** `session.js` · **Key** `Z` / `C`
- **Definition** Traversal of semantic Session transactions.
- **Code stem** `history` / `undo` / `redo` · **UI label** Undo · Redo
- **Non-effects** Distinct from the Traversal Trace (user time); Weight
  relaxation is outside this history.

---

## Retired terms (audit-rejected)

The following must not occur in current code, UI, tests, or canonical
documentation except inside explicit migration notes, this file's Forbidden
synonyms, or `lexicon-audit.mjs`'s own prohibited-term list:

```
Working Interval · No Interval · working-section
Resolution · Resolution Basis · Resolution Level · resolution-fill ·
  resolution-start-marker · resolution-end-marker
Switch Endpoint · Endpoint Frame
Tag · Tag as Pin · Tag as Section
Carry · carryModifier · Alt + operator
Section Weight · Group Active · Apply Weightings · Weights Applied
  (Carry / Alt is a kept feature — see the Carry entry — not retired.)
Deformation · Deformation Field · Deformation Atmosphere · Deformation Bypass ·
  Toggle Deformation · Straighten Timeline · Straighten Section · Bypass Weight ·
  Suspend Weight
Dynamic Playback · Dynamic Weight Texture · Follow Section weight
Panoramic Phase Field · Field · Step Field · Field Frame · Field Breath ·
  Breath Rate · Stretch both · Hold both · Hold Panorama · Panorama Extent ·
  Field span · Panorama span
User Time · Encounter Order · Ghost Injection · Ghost Landing · Ghost Current ·
  Trace Cursor · Observed Span
Cue · Cues · Chapter Candidate · Chapter Proposal
Guide Focus · Acquired Timeline Operand
Parameters · Native play/pause
```

Formal `resolution`, `interval`, `extent`, `midpoint`, `density`, and `frame`
remain permitted only with an explicit qualified mathematical or media meaning.
