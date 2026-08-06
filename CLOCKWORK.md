# Video Cartography Clockwork

This index names the owner and bounded consequence of each cross-module
relation. Detailed behavior remains in `SPEC.md` and `IMPLEMENTATION.md`.

## Freeze Panorama

- **Owner** `panorama.js`
- **Inputs** current Cycle, attained Tail/Lead offsets, available sides
- **Relation** stop the Cycle at the attained relation
- **Outputs** Frozen Panorama, stable Panorama Window
- **Allowed mutations** Panorama runtime Cycle and side modes
- **Protected non-effects** Current, preferences, projection, Section
  Weightings, history, Traversal Trace
- **Tests** `panorama-runtime-tests.mjs`, `panorama-bounds-tests.mjs`,
  `panorama-render-smoke.mjs`

## Stretch Panorama

- **Owner** `panorama.js` with the pure Cycle in `panorama-geometry.js`
- **Inputs** Frozen Panorama and its attained offsets
- **Relation** continue expansion or contraction from the frozen relation
- **Outputs** stretching Panorama Cycle
- **Allowed mutations** Panorama runtime Cycle and side modes
- **Protected non-effects** Current, Step Distance, projection, Section
  Weightings, history, Traversal Trace
- **Tests** `panorama-cycle-tests.mjs`, `panorama-runtime-tests.mjs`,
  `panorama-render-smoke.mjs`

## Panorama Window retention

- **Owner** `panorama.js` for observation; `session.js` for retention
- **Inputs** Frozen positive Panorama Window
- **Relation** offer the Window as an ordinary Section source
- **Outputs** ordinary Guide Section
- **Allowed mutations** ordinary Session/Guide retention transaction
- **Protected non-effects** no Panorama identity enters the Guide schema
- **Tests** `panorama-layout-tests.mjs`, `panorama-bounds-tests.mjs`

## Timeline Allocation Factor

- **Owner** `timeline-projection.js`; formatted by `view.js`
- **Inputs** effective projected extent and positive Source-Time extent
- **Relation** projected Timeline-Space extent divided by Source-Time extent
- **Outputs** qualified derived allocation factor
- **Allowed mutations** none
- **Protected non-effects** stored Section Weighting and Effective Weight remain
  distinct; arithmetic and projection are unchanged
- **Tests** `timeline-projection-tests.mjs`, `section-weighting-smoke.mjs`

## Active playback policy

- **Owner** `transport.js`; orchestrated by `app.js`
- **Inputs** Shift Playback, textured setting, fixed wish, Effective Weight,
  offered rates, actual rate, Panorama availability
- **Relation** derive observation policy, rate policy, requested rate, and
  Panorama eligibility atomically
- **Outputs** one coherent active Playback transport policy
- **Allowed mutations** active Playback policy and environmental rate request
- **Protected non-effects** Current, Active Span, history, Traversal Trace,
  transport identity unless existing replacement law requires it
- **Tests** `transport-tests.mjs`, `transport-coherence-smoke.mjs`

## Automatic Context

- **Owner** Context transport in `transport.js`; orchestration in `app.js`
- **Inputs** committed Current, Context Duration, Range
- **Relation** derive one clipped Context Window and observe it
- **Outputs** Context transport, Cursor, Panorama Context Frame
- **Allowed mutations** environmental observation state
- **Protected non-effects** Current, history, Traversal Trace
- **Tests** `context-smoke.mjs`, `transport-tests.mjs`

## Ghost scan and settlement

- **Owner** `app.js`; historical evidence in `traversal-trace.js`; future
  addresses in `traversal-prospects.js`
- **Inputs** fixed Anchor, one frozen Trace or Prospect read, wheel direction
- **Relation** scan a provisional Ghost Candidate; commit only on settlement
- **Outputs** preview Active Span/Neighborhood, then one settled movement
- **Allowed mutations** preview state during scan; one canonical settlement
- **Protected non-effects** scan and cancellation change neither Current,
  history, nor Traversal Trace
- **Tests** `ghost-tests.mjs`, `ghost-smoke.mjs`, `ripple-smoke.mjs`

## Traversal Prospect

- **Owner** `traversal-prospects.js`
- **Inputs** Ripple identity, source generation, resolved Context boundaries
- **Relation** append distinct Start then End occurrences; expose newest valid
  occurrence first; consume by identity
- **Outputs** Ripple Start Prospect and Ripple End Prospect
- **Allowed mutations** transient source-scoped prospect collection
- **Protected non-effects** no persistence, Guide, history, or Traversal Trace
- **Tests** `traversal-prospects-tests.mjs`, `ripple-random-tests.mjs`, Ripple
  semantic/browser proofs

## Ripple observation

- **Owner** active identity in `app.js`; observation in the shared Context
  transport
- **Inputs** Shift-clicked bare-Timeline Address, Context Duration, Range,
  source generation
- **Relation** invert through the effective Timeline Projection, derive the
  ordinary clipped Context Window, and observe without moving Current
- **Outputs** Ripple Observation Address, Ripple Context Window, Cursor, two
  Traversal Prospects after successful completion
- **Allowed mutations** transient Ripple observation and prospect state
- **Protected non-effects** Current, Neighborhood, Active Span, Focus, Guide,
  selections, Weightings, relaxation, history, Traversal Trace
- **Tests** Ripple pure, randomized, semantic, transport, browser, and render
  proofs

## Ripple prospect settlement

- **Owner** canonical Go in `app.js`/`session.js`
- **Inputs** one selected valid Traversal Prospect
- **Relation** settle through ordinary Go, then consume that prospect
- **Outputs** Current movement, ordinary Active Span, one history checkpoint,
  one ordinary Traversal Trace movement
- **Allowed mutations** exactly the canonical Go transaction plus prospect
  consumption after success
- **Protected non-effects** no Ghost Return, parallel movement operation,
  Ripple-specific history, transport, projection, player, or Active Span
- **Tests** Ripple Ghost/semantic/browser proofs

## Source replacement

- **Owner** `app.js`
- **Inputs** new loaded-source generation
- **Relation** invalidate callbacks, cancel active observation, clear
  source-scoped transient state
- **Outputs** clean source boundary
- **Allowed mutations** transport cancellation, Ripple/Ghost preview cleanup,
  Traversal Prospect clear
- **Protected non-effects** no stale callback may mutate the replacement source
- **Tests** `source-boundary-smoke.mjs`, Ripple lifecycle proofs
