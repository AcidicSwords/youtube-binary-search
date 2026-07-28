# Binary YouTube Reader — Canonical Implementation

## 1. Architecture rule

The repository implements one semantic system through explicit ownership boundaries:

```text
user intention
→ settle incompatible transient state
→ Session transaction or observation transport
→ derive physical effects
→ execute through adapters
→ render one truthful projection
```

No presentation component owns semantic truth. No player callback directly mutates Guide or Return history.

## 2. State ownership

`session.js` owns immutable semantic state and Return history:

```js
{
  duration,
  range,
  resolution,
  resolutionBasis,
  focus,
  interval,
  stepReach: { backward, forward, linked },
  guide
}
```

`transport.js` owns transient Context, Continue, Skim, and Loop values. `app.js` composes transactions, persistence, lifecycle, and adapter effects. `view.js` projects state into DOM. `step-field.js` owns muted Tail/Lead execution state but cannot commit semantic state directly.

## 3. Module boundaries

| Module | Responsibility |
|---|---|
| `range-geometry.js` | pure Range, Resolution, Neighborhood, Step, and preview geometry |
| `session.js` | immutable semantic transactions and Return history |
| `transport.js` | transient observation and traversal values |
| `youtube.js` | sole raw YouTube IFrame API adapter and readiness boundary |
| `step-field-geometry.js` | pure Field targets, phases, constraints, Reach validation, and response policy |
| `step-field.js` | muted Tail/Lead execution and Field presentation state |
| `guide.js` | Pins, Sections, Focus references, migration, and validation |
| `source-field.js` | normalized external temporal records |
| `view.js` | DOM projection and control enablement |
| `app.js` | composition root, persistence, lifecycle, and dependency wiring |

Dependencies point toward pure kernels and adapters. A module must not bypass an owner to reproduce its logic privately.

## 4. Canonical normalization

Session owns persisted Reach normalization:

```text
linked = true ⇒ backward = forward
0.25s ≤ backward, forward ≤ 300s
```

Step Field execution receives already directional Reach and rejects malformed or unequal linked objects. Legacy scalar migration exists only in `app.js` preference loading.

Field response defaults and validation are owned by `step-field-geometry.js` and reused by both the composition root and execution controller:

```js
{ tailRate: 0.5, leadRate: 2 }
```

Tail must be below `1×`; Lead must be above `1×`. Player-specific availability is resolved later against each adapter snapshot.

## 5. Step Field lifecycle

The semantic key contains video, Current, Range, and directional Reach. A change to those values invalidates physical geometry.

Rate changes are kinetic and do not force re-establishment. Field enablement and pane visibility changes are structural and do.

Side players are created lazily only when the API is ready, the Field is enabled, and the corresponding pane is visible. They are always muted and removed from the accessibility tree.

Application Continue prepares side players before starting Center. Native Center Play is reconciled afterward and side activation remains best effort under autoplay policy.

## 6. Interface system

Styles are loaded by ownership:

1. `styles.css` — tokens, global controls, full application composition, timeline, Parameters, operator matrix, Guide, and responsive layout.
2. `step-field.css` — panoramic pane geometry, pane-local controls, collapse behavior, and mobile stacking.
3. `field-grammar.css` — Field phase cues, playback dock, live operands, and final transport interaction states.

Wide-desktop layout is defined only in `styles.css`. Later files must not redefine the application grid.

Shared sizing tokens are:

```css
--control-height: 40px;
--compact-control-height: 32px;
--touch: 48px;
```

Desktop composition is:

```text
Panoramic media
→ playback dock
→ full-width temporal map
→ Parameters | Operator matrix | Guide
```

The matrix contains operators only. Parameters alter operands without creating semantic transactions. Guide owns retained structure. Playback owns Continue, Context, Skim, Loop, and live movement operands. The timeline owns spatial projection.

`INTERFACE.md` states the purpose and negated consequence of every visible surface. `project-audit.mjs` prevents duplicate controls, stale layout owners, and retired matrix elements from returning.

## 7. Persistence

Guide schema remains video-specific under `binary-youtube-reader:v5:<videoId>`. Earlier Guide versions are read and sanitized without mutating their original keys.

Preferences are stored separately. Active Session Reach becomes the default for the next video; Return updates that default when it restores Reach.

Runtime-only player and Field state is never persisted.

## 8. Verification boundaries

`npm test` covers pure kernels, state transitions, fuzz invariants, regressions, Field geometry, response policy, and UI contracts.

`npm run audit` checks DOM references, accessible names, vocabulary, documentation authority, CSS ownership, adapter boundaries, and version consistency.

`npm run check` runs syntax, tests, audits, integration, and smoke paths.

Automated checks cannot prove browser autoplay behavior, per-video rate availability, buffering, fullscreen, or device layout. Those remain in `VALIDATION.md`.

## 9. Change discipline

A change is complete only when:

1. the owning module contains the behavior;
2. dependent modules consume that owner rather than duplicate it;
3. tests state the invariant, not merely the current text shape;
4. canonical documentation is updated in the same change;
5. `npm run check` passes;
6. browser/device-dependent behavior is recorded against the manual matrix.

Do not add compatibility fallbacks inside runtime kernels. Normalize legacy data once at the migration boundary.

Do not add a new mode when an existing operator and operand can express the behavior compositionally.
