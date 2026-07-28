# Development Guide

## 1. Setup

Read `SPEC.md`, `IMPLEMENTATION.md`, and `INTERFACE.md` before changing behaviour. Serve locally:

```bash
python3 -m http.server 8000
```

Run the complete gate:

```bash
npm run check
```

Node 20 or newer is required. There is no build step or runtime dependency.

## 2. Ownership

- temporal mathematics: `range-geometry.js`
- semantic transactions, endpoint frames, and Undo: `session.js`
- Context/playback/Loop runtime values: `transport.js`
- raw IFrame API: `youtube.js`
- Field mathematics: `step-field-geometry.js`
- Tail/Lead execution: `step-field.js`
- retained structure: `guide.js`
- DOM projection: `view.js`
- composition and persistence: `app.js`

When the same rule appears twice, choose its owner and remove the duplicate.

## 3. Change protocol

State the operator, operand, owner, and effect class before editing:

```text
semantic | physical | transient | retained | presentational
```

Add the smallest pure test first. Integration and smoke tests confirm wiring; they do not replace kernel tests.

## 4. Player discipline

Never access `YT.Player` outside `youtube.js`. Treat play, pause, placement, and rate commands as requests. Actual adapter state and events are authoritative. Ordinary Field start must synchronously request Tail, Center, and Lead from the same trusted parent-page click or Space event; do not defer side activation to Center’s later state callback.

Autoplay blocking, buffering, delayed placement, and missing directional rates are ordinary runtime states. They must remain visible and recoverable without mutating Session incorrectly.

## 5. Field discipline

- Context is the only transport that suspends Field playback by definition.
- Native playback and Loop may drive Held/Stretching sides.
- Every ordinary play/unpause starts a fresh Stretch: refold to Current, prime at `1×`, then request the confirmed directional rate.
- Paused sides must park on their represented frames; thumbnail-only cue state is not a valid settled Field after frame placement is possible.
- Hold during formation may commit measured Offset through Session Step Reach, but must never write semantic Interval.
- Context must preserve stored Field geometry and must not remeasure against its transient Cursor.
- Side video surface, local Step button, and matrix Step must share `performStep()`.
- Direct Go, Refine, and Pin traversal replace Interval with their own local movement. Step and settled playback preserve the active departure while moving arrival.
- Step, playback, and Pin traversal leave the receding Neighborhood endpoint fixed and push the approached endpoint. A Step that reaches or crosses the old bound retains one full Step beyond Current, clamped to Range.
- Every non-null Interval and both stored endpoint frames must satisfy `Interval ⊆ Resolution ⊆ Range`.
- Switch Endpoint must preserve ordered Interval extent, swap its directed roles, and restore a retained frame containing that unchanged extent.
- Held Arrow Step owns its repeat timer, one pending transaction, and one Context on keyup; browser repeat events must not control cadence.
- Internal Loop wraps must never invoke Session movement or Context.
- Collapsing one Field side must not re-establish the other; combined Field controls operate only on visible sides.
- Side-player errors must remain recoverable through pane restore or video reload; a retained adapter must never be stranded behind `ready = false`.

## 6. UI discipline

The interface has four ownership regions: Field, map, operators/parameters, Guide. Do not reintroduce a generic playback dock.

Every form control needs an accessible name; every button declares a type; focus and coarse-pointer targets remain visible and practical. Desktop is primary, but all operations must survive stacking and Guide modal presentation. Use explicit Field grid areas, an explicit zero-minimum column inside every pane, and player-panel container breakpoints; child minima may not clip a pane or displace Center when Field is off.

## 7. Tests

- `tests.mjs` — geometry, Session, Guide fundamentals
- `transport-tests.mjs` — Context, playback, Loop values
- `source-field-tests.mjs` — external structure normalization
- `fuzz-tests.mjs` — deterministic semantic invariants
- `v5.8-regression-tests.mjs` — stable reader and native playback contracts
- `endpoint-transposition-tests.mjs` — endpoint frames, Switch involution, Step composition, collapsed state, and Undo separation
- `semantic-composition-tests.mjs` — distinct Refine, Step, Pin, direct-Go, and Switch ownership plus truthful availability
- `semantic-audit-probes.mjs` — deterministic regressions for the seven relational-audit discrepancies
- `semantic-state-space-tests.mjs` — 200,000 mixed operations plus point and arbitrary-Interval reachability (`npm run test:semantic`)
- `step-field-tests.mjs` — Field geometry and source-level wiring
- `field-runtime-tests.mjs` — explicit address/offset/rate state transitions and edge recovery
- `field-grammar-tests.mjs` — composed operator grammar
- `field-bounds-tests.mjs` — Range containment and controller behaviour
- `field-coherence-tests.mjs` — offset/rate/UI coherence
- audits — DOM, architecture, documentation, CSS, repository hygiene
- smoke files — startup and integrated interaction paths

A branch is ready only after `npm run check` passes and browser-dependent validation remains explicitly separated from automated proof.
