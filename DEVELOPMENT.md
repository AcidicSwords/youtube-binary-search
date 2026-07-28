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
- semantic transactions and Return: `session.js`
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

Never access `YT.Player` outside `youtube.js`. Treat play, pause, placement, and rate commands as requests. Actual adapter state and events are authoritative.

Autoplay blocking, buffering, delayed placement, and missing directional rates are ordinary runtime states. They must remain visible and recoverable without mutating Session incorrectly.

## 5. Field discipline

- Context is the only transport that suspends Field playback by definition.
- Native playback and Loop may drive Held/Stretching sides.
- Stretch always snaps to Current before forming.
- Hold during formation commits measured Offset through Session.
- Pane Step and matrix Step must share `performStep()`.
- Internal Loop wraps must never invoke Session movement or Context.

## 6. UI discipline

The interface has four ownership regions: Field, map, operators/parameters, Guide. Do not reintroduce a generic playback dock.

Every form control needs an accessible name; every button declares a type; focus and coarse-pointer targets remain visible and practical. Desktop is primary, but all operations must survive stacking and Guide modal presentation.

## 7. Tests

- `tests.mjs` — geometry, Session, Guide fundamentals
- `transport-tests.mjs` — Context, playback, Loop values
- `source-field-tests.mjs` — external structure normalization
- `fuzz-tests.mjs` — deterministic semantic invariants
- `v5.8-regression-tests.mjs` — stable reader and native playback contracts
- `step-field-tests.mjs` — Field geometry and source-level wiring
- `field-grammar-tests.mjs` — composed operator grammar
- `field-bounds-tests.mjs` — Range containment and controller behaviour
- `field-coherence-tests.mjs` — offset/rate/UI coherence
- audits — DOM, architecture, documentation, CSS, repository hygiene
- smoke files — startup and integrated interaction paths

A branch is ready only after `npm run check` passes and browser-dependent validation remains explicitly separated from automated proof.
