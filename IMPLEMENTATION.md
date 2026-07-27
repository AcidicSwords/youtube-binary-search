# Binary YouTube Reader v5.5.2 — Canonical Implementation

## 1. Design rule

Binary YouTube Reader is one temporal navigation system, not a collection of independent playback features.

```text
Address → Current inside Range
Current + Resolution → Neighborhood
movement → Interval
explicit Address → Pin
explicit Extent → Section
Section → Range through Focus
```

The three-pane Step Field projects that model physically. It does not create a second semantic timeline.

The design target is Vim-like compositional depth: a compact set of precise operators, stable operands, and predictable composition. Depth comes from combining operators, not from adding modes with overlapping meanings.

## 2. Canonical objects

| Object | Meaning | Owner |
|---|---|---|
| Address | A time in the video | geometry |
| Current | The committed semantic Address | Session |
| Cursor | A transient player position | transport/player |
| Range | The only hard admissible time domain | Session |
| Resolution | The current semantic scale | Session |
| Neighborhood | The left/current/right structure at Resolution | Session |
| Interval | The last committed movement extent | Session |
| Pin | A retained Address | Guide |
| Section | A retained explicit Extent | Guide |
| Field Span | The live Tail-to-Lead physical extent | Step Field |

Current and Cursor are deliberately distinct. Physical playback may move a Cursor without committing Current until transport settlement.

## 3. Operators

### Semantic navigation

| Operator | Operand | Result |
|---|---|---|
| Refine Backward / Forward | Neighborhood side | commits the selected child Current and Resolution |
| Reopen | Resolution | returns to Range-level Resolution |
| Step Backward / Forward | directional Reach | commits bounded movement and Interval |
| Return | Session history | restores one complete semantic checkpoint |
| Go | Address | commits direct placement through Session |

### Observation and traversal

| Operator | Operand | Result |
|---|---|---|
| Context | Current | bounded observation; restores Current on settlement |
| Continue | Current through Range | continuous traversal; commits settlement Cursor |
| Skim | forward Range remainder | accelerated traversal followed by Continue |
| Loop | captured Interval or Field Span | observes immutable captured boundaries |

### Retention and scope

| Operator | Operand | Result |
|---|---|---|
| Pin Current | Current | creates or reuses a Pin |
| Save Section | Interval or Field Span | retains one explicit Extent |
| Focus | Section | installs that Section as Range |
| Leave Focus | focused Range | restores the preceding Range |

No operator privately redefines another operator's operand.

## 4. Semantic state and ownership

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

Directional Reach is semantic because it changes Step destinations and Field targets. It is included in Session snapshots and restored by Return.

```text
linked = true  ⇒  backward = forward
0.25s ≤ backward, forward ≤ 300s
```

Malformed persisted values are normalized before entering Session. If an invalid linked object contains unequal values, Forward is the deterministic salvage source; normal UI linking always supplies equal values.

Tail and Lead playback rates are physical preferences. They affect formation kinetics, not semantic destinations, and are not Returnable.

## 5. Step Field

```text
Tail   ← Current →   Lead
slower     1×        faster
muted   audible      muted
```

Center remains authoritative for sound, native media controls, semantic settlement, and transport reconciliation. Tail and Lead cannot commit Current directly.

### Geometry

```text
Tail target = max(Range Start, Current − Backward Reach)
Lead target = min(Range End, Current + Forward Reach)
```

Resolution does not clip the Field. Range is its only hard boundary.

### Phases

```text
Off → Coincident → Unfolding → Partially Held → Held
                         ↘ Suspended ↗
```

A forming side resolves through Go to its observed Cursor. A Held side resolves through directional Step to the semantic target.

### Response

Each side reads its own available rate set. Tail accepts rates below 1×; Lead accepts rates above 1×. Requested and actual rates remain distinct. Missing directional rates produce an unavailable side; autoplay rejection produces a blocked side.

Changing a rate is kinetic: it preserves Field geometry and changes subsequent motion. Visibility and Field-enabled changes are structural and re-establish the projection. Tail and Lead rate controls are object-local in their pane headers. On narrow coarse-pointer layouts, the side panes stack and retain a minimum 200 × 200 IFrame viewport so rate capability remains available to the player API.

## 6. Transport authority

**Application Continue** is the authoritative three-pane start gesture:

```text
settle prior transport
→ establish Continue
→ prepare available Tail and Lead
→ request side playback
→ start Center
→ verify actual states
```

Native Center Play remains supported. Its later application event makes side activation best effort under browser autoplay policy. The interface reports partial or blocked state rather than treating both paths as physically identical.

When Step Field is disabled, Continue and every stable single-player operator remain valid. No side player is created, and the reader is observationally equivalent to the pre-Field application.

## 7. Suspension and settlement

Context, Skim, Loop, pending Step, Range manipulation, and document hiding suspend or settle the Field according to transport ownership. Continue permits differential formation.

Range mutation, Focus, Leave Focus, Refine, Return, and committed movement invalidate stale side geometry and derive a new Field from the resulting semantic model.

Loop captures scalar boundaries once. Later Field or Range changes cannot mutate its active extent.

## 8. Persistence and migration

```js
{
  contextSeconds,
  stepReach,
  stepReachLastEdited,
  fieldResponse,
  stepFieldEnabled,
  tailVisible,
  leadVisible
}
```

Legacy `stepSeconds` migrates to equal linked Reach. Active Session Reach becomes the default for the next loaded video. Return updates that default when it restores a preceding Reach.

Guide data remains video-specific. Actual rates, buffering, blocked state, Cursors, and Field phases are runtime-only.

## 9. Module boundaries

| Module | Responsibility |
|---|---|
| `range-geometry.js` | pure Range, Resolution, Neighborhood, Step, and preview geometry |
| `session.js` | immutable semantic transactions and Return history |
| `transport.js` | transient Context, Continue, Skim, and Loop values |
| `youtube.js` | the only raw IFrame API boundary |
| `step-field-geometry.js` | pure Field targets, phases, constraints, and rate selection |
| `step-field.js` | muted Tail/Lead execution and Field presentation state |
| `guide.js` | Pins, Sections, Focus references, migration, and validation |
| `source-field.js` | normalized external temporal records |
| `view.js` | presentation and control enablement only |
| `app.js` | operator composition, lifecycle, persistence, and dependency wiring |

```text
user intention
→ settle incompatible transient state
→ Session transaction or observation transport
→ derive physical effects
→ execute through adapters
→ render one truthful state
```

## 10. Interface grammar

The interface mirrors the operator geometry:

```text
Backward | shared spine | Forward
```

```text
W / A / S / D = Reopen / Refine Backward / Return / Refine Forward
← / →         = Step Backward / Step Forward
[ / ]         = decrease / increase linked Reach preset
Space         = Continue / Pause
C             = Context
F             = Skim
L             = Loop
P             = Pin Current
Shift+P       = Save Section
Shift+← / →   = previous / next Pin
```

Inputs suspend global shortcuts. Space does not double-activate a focused native button or summary. Code, controls, statuses, and documentation use the same vocabulary.

## 11. Verification

`npm run check` covers runtime syntax, geometry, Guide, Session, transport, source normalization, 25,000 deterministic semantic operations, stable-reader regressions, Step Field grammar and bounds, directional Reach and response coherence, DOM/accessibility/layout integration, and startup/interaction/Context/metadata smoke paths.

A real-browser IFrame pass remains mandatory before merge. It must exercise multiple videos, per-video rates, buffering, native controls, Application Continue, autoplay blocking, hidden panes, fullscreen, and video replacement.

## 12. Retired contracts

The following are historical, not current:

- one scalar Step size;
- fixed Tail 0.5× and Lead 2× as unchangeable behavior;
- Resolution as a physical Field boundary;
- native Center Play as the sole application transport control;
- side Cursors as semantic history;
- Field Span as an implicit Session Interval;
- cumulative version notes that contradict current architecture.

Documentation states the current system. Git history retains implementation chronology.
