# Development Guide

## 1. Start here

Read in this order:

1. `README.md` for the product surface.
2. `SPEC.md` for semantic invariants.
3. `IMPLEMENTATION.md` for ownership and module boundaries.
4. `VALIDATION.md` before changing browser/player behavior.

Serve the static application through HTTP:

```bash
python3 -m http.server 8000
```

Run the repository gate:

```bash
npm run check
```

Node 20 or newer is required. The application has no build step and no runtime package dependency.

## 2. Where changes belong

- Change temporal mathematics in `range-geometry.js`.
- Change semantic transactions or Return behavior in `session.js`.
- Change transient observation values in `transport.js`.
- Change raw IFrame interaction only in `youtube.js`.
- Change Field mathematics or response validation in `step-field-geometry.js`.
- Change Tail/Lead execution in `step-field.js`.
- Change retained structure in `guide.js`.
- Change DOM projection in `view.js`.
- Compose user actions, persistence, and lifecycle in `app.js`.

When a rule appears in two modules, identify its owner and remove the duplicate.

## 3. Semantic change protocol

Before editing, state:

- the operator being changed;
- its operand;
- its owner;
- whether it is semantic, transient, physical, retained, or presentational;
- which existing invariant constrains it.

Then add or update the smallest pure test first. Integration and smoke tests should confirm wiring, not replace kernel tests.

## 4. UI change protocol

The UI mirrors operator geometry; it is not an independent taxonomy.

- Backward controls remain left.
- Shared controls remain on the spine.
- Forward controls remain right.
- Object-local settings stay with the object they modify.
- One visible control must not imply authority it does not possess.
- Disabled controls must remain legible enough to explain unavailable state.
- Every interactive element needs an explicit accessible name and a visible focus state.
- Coarse-pointer targets must be at least `48px` unless a larger invisible hit area is provided.

Desktop is the primary dense layout. Mobile may stack and disclose, but must preserve every operation and remain usable without a keyboard.

## 5. Player and asynchronous work

Never read or construct `YT.Player` outside `youtube.js`. Use normalized adapter state.

Treat player commands as requests, not facts. Verify reported state after play, pause, placement, and rate changes. Keep requested and actual rates separate.

Autoplay rejection, buffering, delayed placement, and unavailable rates are ordinary runtime states, not exceptional semantic states.

## 6. Persistence and migrations

Do not broaden runtime APIs to accept historical schemas. Read legacy records at the persistence boundary, normalize once, and pass canonical data inward.

Guide migrations must salvage valid independent records. Preference migration must preserve current behavior without creating Session history.

## 7. Test map

- `tests.mjs` — Range and Session fundamentals.
- `transport-tests.mjs` — transient transport values.
- `source-field-tests.mjs` — external source normalization.
- `fuzz-tests.mjs` — deterministic long-run invariants.
- `v5.2-regression-tests.mjs` — stable reader interaction contracts.
- `step-field-tests.mjs` — Field phases and execution wiring.
- `field-grammar-tests.mjs` — operator/Field interaction grammar.
- `field-bounds-tests.mjs` — Range-only Field boundaries and suspension.
- `field-coherence-tests.mjs` — directional Reach, response, persistence, and UI coherence.
- `integration-check.mjs` — DOM, accessibility, vocabulary, and module wiring.
- `project-audit.mjs` — documentation, CSS ownership, adapter boundary, and repository hygiene.
- smoke files — startup and high-level interaction paths.

## 8. Completion standard

A branch is ready for review when `npm run check` passes and the PR states which `VALIDATION.md` scenarios were exercised. Keep browser-dependent items explicit; do not claim automated proof of IFrame behavior.
