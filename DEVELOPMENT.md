# Development

Video Cartography is a static ES-module application. It has no build step and no
framework runtime. Node 20 or newer runs the deterministic gates; Chromium is
used only for behavior that requires a real layout and event system.

## Setup and release gate

Install exactly what the lockfile resolves:

```bash
npm ci
```

Serve the repository over HTTP for local use, for example:

```bash
python -m http.server 8000
```

Then open `http://127.0.0.1:8000/`. A local server is required for reliable
YouTube embed identity and referrer behavior.

The complete release gate is:

```bash
npm run verify
```

`npm run check` is necessary but not complete proof. It performs syntax checks,
pure and semantic tests, DOM-free application journeys, and source/document
audits. `npm run test:browser` runs the rendered page in Chromium with a
deterministic media adapter, measuring actual geometry, pointer ownership,
focus, and responsive behavior. `verify` runs both.

Both Verify jobs and the Pages predeployment job use `npm ci`. Browser
installation is derived from the lockfile-resolved `playwright-core` version so
dependency code and the installed browser cannot drift independently. Pages
runs the same complete `npm run verify` gate before publishing.

## Design discipline

1. Source time is authoritative. Never store a Timeline coordinate.
2. Timeline Space is derived, positive, continuous, and singly invertible.
3. Compile one effective projection and pass it to every spatial consumer.
4. A semantic consequence has one implementation even when several routes
   acquire its operands differently.
5. An operation changes only the state dimension named by that operation.
6. Active Span is the contiguous residue of excluded alternatives; do not
   add a persistent Path.
7. One gesture creates at most one Undo checkpoint.
8. Current, Cursor, and media position are different authorities.
9. Pin identity is graph identity. Coincident Address does not imply identity.
10. Guide owns exact structure editing; Timeline owns spatial manipulation.
11. Step Distance, Nudge, Context, Panorama offsets, Section Weight, Playback policy,
    and deformation bypass have separate owners.
12. Ordinary player controls and simple Center-only use must remain complete
    when Guide, Panorama, Weight, or Focus is ignored.
13. Presentation may preview or reshape the map; it may not invent semantic state.
14. Repair a false test or document when a law changes; do not preserve an
    obsolete generation merely to keep a gauge green.

## Change routing

| Change | Primary owner | Required neighboring proof |
|---|---|---|
| Range, Resolution, Refine, Step geometry | `range-geometry.js` | `session.js` transaction and pure tests |
| Active Span, operator consequence, Focus, history | `session.js` | route preview and application smoke |
| Pin/Section/Group graph, Weight ladder, migration | `guide.js` | Guide validation, persistence, and group tests |
| Operator identity, key, and shifted label | `operator-grammar.js` | DOM order, runtime branch, CSS area, browser geometry, canonical docs |
| Effective density, inverse map, spatial midpoint | `timeline-projection.js` | every spatial consumer and atmosphere |
| Context/Playback policy, offer resolution, wrap | `transport.js` | adapter actual-rate and application playback tests |
| YouTube source identity or actual media state | `youtube.js` | source-generation and stale-event tests |
| Panorama Frame identity or transition | `panorama-frame.js` | application owner selection and Panorama runtime |
| Panorama bounds or cycling policy | `panorama-geometry.js` | controller lifecycle and browser presentation |
| Tail/Lead player behavior | `panorama.js` | stale events, dormant panes, user activation, native-player isolation |
| DOM projection and visual state | `view.js` | source audit plus Chromium proof |
| Interaction acquisition, persistence, source boundary | `app.js` | route convergence and whole-system journeys |
| Physical layout and accessibility | `index.html`, `styles.css`, `panorama.css`, `panorama-layout.css` | integration audit and Chromium proof |

Do not branch inside an operator on Section coverage. Extend or consume the
shared projection. Do not make a view-only fix by adding another semantic state
owner. Do not reach through the media adapter from application or Panorama code.

## Boundary requirements

### Projection

- Every effective factor is positive.
- Active overlapping Section factors compose by multiplication without
  priority.
- `projection.weightContributors` is the authority for atmosphere as well as
  geometry.
- Deformation bypass is passed into projection construction and is never
  written into Guide or history.
- A focused viewport changes drawing only; operator metrics cannot observe it.
- Textured Playback may read effective Weight only when its explicit rate policy
  requests that relation.

### Transactions and interaction

- Direct manipulation snapshots one origin, amends it, and checkpoints once.
- A pending Step stores only a transient visited envelope for reversal
  settlement.
- Timeline and off-map Shift-wheel share dominant-axis interpretation,
  accumulation threshold, target key, direction, and settlement timer.
- Browser scroll is prevented only after a valid Nudge target is acquired.
- Matrix and Guide one-shot Shift latches can consume only themselves; physical
  Shift consumes neither.
- Exact Address input rejects malformed, out-of-Range, or structurally invalid
  values instead of silently clamping.
- Release, bare Timeline Go, Guide focus, and Timeline acquisition must preserve
  their distinct selection consequences.

### Playback and Panorama

- Observation policy and rate policy are explicit and independent.
- Stored wish, offered resolution, requested command, and confirmed actual rate
  are never conflated.
- Only the adapter's playback-rate event updates actual rate.
- Retry and proper-Range wrap preserve the transport and reapply its policy.
- A fixed Shift wish of `1×` remains Center-only.
- The parent Play control may not cover native YouTube controls.
- Panorama suspension derives from observation policy and confirmed compatibility,
  not a numeric shortcut.
- Panorama Cycle defaults to `0.25–2.5 s` and `0.75× / 1× / 1.25×`, while saved
  valid preferences and wider available settings remain valid.
- Hold/Stretch changes neither preferences, Guide, Step Distance, nor history.

### Source and persistence

- A load request is immutable and generation-owned.
- Initialization requires the current generation and matching adapter `videoId`.
- Every source replacement runs the one transition boundary before chaptering.
- No old-source drag, timer, selection, Panorama owner, transport, or checkpoint may
  reach the fresh Session.
- Version-9 Guide evidence is inspected before older fallbacks.
- An unreadable higher-priority record must be quarantined before a fallback may
  overwrite its current key. A failed quarantine disables that rewrite.
- Empty because nothing existed and empty because recovery failed must produce
  different status.

## Test suite map

Every executable suite is listed here by the current behavior it protects.

### Pure kernel, projection, and semantic state

- `tests.mjs` — Range geometry, Guide primitives, Session transactions, URL parsing, and base invariants.
- `timeline-projection-tests.mjs` — positive factors, overlap products, forward/inverse round trips, effective contributors, bypass scope, Pin order, and migration.
- `ghost-smoke.mjs` — Ghost in a real browser: the Guide on `I` while Tab stays the browser's, G arming without cost, a wheel notch recalling behind a fixed Anchor, one transaction on release, exact cancellation, wheel ownership between Ghost and Nudge, and Context playing through the recall as one retargeted window whose scan writes no observation.
- `ghost-tests.mjs` — Ghost Traverse against a live Session: a preserved semantic world, Focus/Range bounds, one Undo per held gesture, the reversal envelope, recorded rather than recomputed Addresses, and a Section retained entirely in the past.
- `traversal-trace-tests.mjs` — the append-only encounter ledger: records that keep reversals, direction in user time independent of source order, watched spans subdivided by the frozen Step law and clipped to the active Range, a frozen readable stream, and injection with provenance.
- `section-deformation-tests.mjs` — Section Weight, nested/overlapping Guide geometry, Pin movement, and spatial traversal consequences.
- `operator-coherence-tests.mjs` — guarded Step, Refine roles, exact previews, weighted navigation, monotonic Playback residue, history, and lane packing.
- `core-regression-tests.mjs` — kernel guarantees for scale, endpoint frames, Range, Focus, Guide, Playback, and Undo.
- `endpoint-transposition-tests.mjs` — endpoint-frame involution, Local Refine, Step composition, collapse, and matrix consequence.
- `semantic-composition-tests.mjs` — cross-operator interval containment, Local Refine complements, and truthful limits.
- `semantic-boundary-tests.mjs` — adversarial operator boundaries and semantic-equivalence regressions.
- `semantic-state-space-tests.mjs` — extended randomized state-space proof across operators, Focus, Guide, and bounds.
- `fuzz-tests.mjs` — deterministic long sequences preserving Session and Guide invariants.
- `weight-invariance-tests.mjs` — exact boundary between Weight-aware Timeline operations and Weight-blind source-time dimensions.
- `focus-viewport-tests.mjs` — focused drawing fills the map while operator geometry remains independent of viewport.
- `guide-session-completion-tests.mjs` — shared Group-deletion plan and sparse Step Reversal settlement.

### Transport, media, and Panorama

- `transport-tests.mjs` — explicit observation/rate policies, actual-rate authority, policy-preserving retry/rebase, log-space offers, and unbounded inverse Weight.
- `youtube-tests.mjs` — URL/time parsing, loaded-source identity in snapshots, and actual playback-rate event delivery.
- `step-gesture-tests.mjs` — repeat cadence, release batching, boundary stop, cancellation, and takeover.
- `panorama-tests.mjs` — Panorama geometry, suspension, Hold/Stretch, side activation, user activation, and panoramic layout contracts.
- `panorama-bounds-tests.mjs` — Range-contained side geometry, unavailable sides, Context suspension, and side Step.
- `panorama-cycle-tests.mjs` — conservative defaults, symmetric rates, expansion/contraction, Range clipping, synchronization, Hold, and resume.
- `panorama-coherence-tests.mjs` — semantic Step Distance and physical Panorama offsets remain independent.
- `panorama-frame-tests.mjs` — Frame ownership priority, stable identity, direction, Context edges, and direct-frame validation.
- `panorama-layout-tests.mjs` — Panorama UI ownership and the separation of Context, Hold/Stretch, Range loop, side Step, and Guide retention.
- `panorama-runtime-tests.mjs` — real controller placement, proportional cycling, dormant panes, stale events, rate fallback, direct previews, and boundary recovery.
- `panorama-transition-tests.mjs` — directional opacity transitions, rapid coalescing, reversal, stale callback rejection, and reduced motion.

### Guide, Groups, Chapters, modifiers, and routes

- `group-tests.mjs` — zero-or-one visible Group, independent Active stack, hidden Guide navigation, Pin visibility, multiplicative layering, and planned deletion.
- `system-coherence-tests.mjs` — Section reachability, projected midpoints, Chapter extents, flat Group blocks, Focus ownership, and explicit Panorama activation.
- `group-coherence-tests.mjs` — nullable visible-Group identity, independent activity, hidden-but-active deformation, Group removal, and version-9 migration.
- `state-integrity-tests.mjs` — Guide validation, repair, round-trip completeness, membership recovery, and impossible source extents.
- `chapter-tests.mjs` — timestamp parsing and contiguous transient candidate extents without retained side effects.
- `nudge-tests.mjs` — one wheel route, dominant axis, accumulation, target acquisition, keyboard and Guide convergence, one Undo, and preview parity.
- `operator-grammar-tests.mjs` — the pure `QWE / ASD / RTF` fixture matches DOM order, keys, runtime branches, CSS areas, shifted meanings, and canonical docs.
- `route-correspondence-tests.mjs` — distinct interaction routes claiming one operation reach the same canonical consequence.

### DOM-free application behavior

- `startup-smoke.mjs` — the module graph loads and binds against the minimal document contract.
- `interaction-smoke.mjs` — matrix Tag routes, retained editing, unlink/link, Timeline manipulation, clusters, Shift traversal, Frame previews, Undo/Redo, and playback focus.
- `guide-composition-smoke.mjs` — plain Guide selection replaces, Shift/Extend composes monotonically, and the result can be tagged as one parent Section.
- `chapter-smoke.mjs` — offering and drawing Chapters is inert; navigation, composition, and Retain use canonical routes.
- `section-weight-smoke.mjs` — Guide-only Weight editing, effective geometry and atmosphere, scoped/whole-map bypass, weighted Step, and exact restoration.
- `context-smoke.mjs` — post-traversal Context, Step deferral, replacement, Panorama suspension, reversal naming, Off, and Undo isolation.
- `step-gesture-smoke.mjs` — captured/fallback release, keyboard hold, and rapid taps settle as one action.
- `transport-coherence-smoke.mjs` — actual-rate observation, effective dynamic projection, settlement, proper-Range wrap, retry, Panorama rebasing, and history isolation.
- `metadata-smoke.mjs` — delayed valid metadata is retried without creating a zero-duration Session.
- `source-boundary-smoke.mjs` — stale load generations plus Nudge, Step, Context, Playback, every drag owner, Guide identity, and bypass cleanup at source replacement.
- `guide-recovery-smoke.mjs` — older fallback preservation, read/quarantine failures, truthful status, and unsafe current records remaining read-only.
- `transaction-integrity-smoke.mjs` — one checkpoint per gesture, persistence honesty, source recovery evidence, Group identity, dense lanes, and coincident Pin identity.
- `cross-interaction-stress.mjs` — Groups, Chapters, Focus, Weight, traversal, Shift layers, Pin topology, and one history stack do not leak meanings into one another.
- `journey-smoke.mjs` — the complete use order from load through traversal, Tag, Guide, Weight, Chapters, composition, Focus, persistence, and source replacement.

### Composition, source audits, and browser proof

- `integration-check.mjs` — DOM references, accessibility names, exact matrix, module seams, source boundary, projection use, and route wiring.
- `project-audit.mjs` — lockfile/release coherence, retired-language exclusions, canonical document agreement, CSS and module boundaries, and suite completeness.
- `lexicon-audit.mjs` — scans every product surface against `LEXICON.md` for retired vocabulary; report-only during the lexicon overhaul, `--strict` in the final gate. Run with `npm run audit:lexicon`.
- `browser-smoke.mjs` — real Chromium geometry, equal square matrix cells, stable shifted labels, native-control hit access, exact Timeline pointer mapping, focus, responsive rails, dense structure, and compact reachability.

## Change completion

Before considering a change complete:

1. add the smallest pure proof at the owner boundary;
2. add a route-level proof when application acquisition or effects change;
3. add Chromium coverage only for layout, hit testing, focus, native-control
   access, or real browser event behavior;
4. update all canonical documents and source audits from final behavior;
5. run from a lockfile-controlled install:

```bash
npm ci
npm run verify
```

A clean release has no untracked generated dependency state, no retired control
or key claims, and no parallel implementation of the same law.
