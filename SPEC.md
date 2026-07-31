# Video Cartography — Canonical Specification

## 1. Authority

This document is normative for v8. Source time is the only persisted temporal truth. Timeline Space is a pure derived spatial coordinate for navigation and layout.

### 1.1 Project objective

A video is globally present as a source but locally actualized in playback. At any instant, its frames are linearly ordered and mutually exclusive: only one source moment can occupy the ordinary audiovisual present.

Video Cartography transforms that condition into bounded spatiotemporal availability without changing source order:

```text
linear temporal exclusivity
→ bounded perceptual and spatial availability
→ retained map
```

The application maintains the usable illusion that the complete video is available as one environment while only a bounded part is being actively perceived or discriminated.

That availability has three complementary forms:

- **Field availability** — the Panoramic Phase Field makes a bounded neighbourhood of Tail, Center, and Lead perceptually co-present as a stable Frame or live Breath.
- **Map availability** — Timeline Space makes the complete ordered source spatially present as one deformable terrain.
- **Guide availability** — Pins and Sections make prior distinctions persist as landmarks and regions.

Range and Resolution bound active perception within that whole. Operators must preserve the relation between the locally instantiated state and the broader available complement.

The governing implementation rule is:

> Every operator must produce the smallest state transformation sufficient for its goal and preserve every unrelated state dimension.

An operator is not defined only by what it changes. It is equally defined by what it cannot change.

## 2. State

- **Range** — the admissible source extent. A proper subset of the video is also the native-playback loop operand.
- **Current** — committed semantic source Address.
- **Cursor** — transient observed player Address.
- **Resolution** — `{ backward, current, forward, level }`, stored in source Addresses and interpreted through Timeline Space.
- **Working Interval** — source-contiguous coverage `{ start, end }` plus active side, endpoint frames, and directed `{ departure, arrival }`.
- **Pin** — a shared source Address with optional title.
- **Section** — an edge between two Pins with positive source duration, optional title, and one canonical timeline `weight`.
- **Focus context** — the containing Range restored by Unfocus.
- **Step Reach** — independent fixed timeline units or an adaptive fraction of active weighted Range width.

### 2.1 State dimensions

Operator contracts use the following canonical dimensions:

| Dimension | State | Meaning |
|---|---|---|
| availability | Range and Focus context | what source territory is admissible |
| commitment | Current | where semantic traversal is committed |
| observation | Cursor and transport phase | what source moment is physically observed |
| discrimination | Resolution and basis | the active scale and neighbourhood |
| traversal coverage | Working Interval extent | what continuous crossing has been retained |
| traversal orientation | departure, arrival, active side, endpoint frames | which side of that crossing owns the viewpoint |
| topology | Pins, Sections, shared references | persistent landmarks and regions |
| metric | Section weights and derived Timeline Space | how much map distance content receives |
| movement magnitude | stored Step Reach and derived effective Reach | how far Step moves |
| traversal provenance | `lastOperator` | which committed spatial grammar supplies the Context-disabled fallback Frame |
| perceptual horizon | stable Field Frame, Breath phase, pane addresses, rates, offsets, Hold/Stretch state | what nearby moments are perceptually co-present |
| reversibility | history and future | which semantic transformations can be restored |

Derived values are not stored dimensions. In particular:

- changing Section weight may change projected positions, spatial midpoints, and adaptive effective Reach without changing any source Address or stored Step Reach;
- moving Current may translate Field panes physically without allowing Field state to write Session state;
- presentation selection, hover, Field Frame transition, and viewport state are not semantic dimensions; `lastOperator` is traversal provenance, while Frame geometry derived from Context, the operator, or direct manipulation remains presentation.

## 3. Source time and Timeline Space

```text
σ  Source Time      player, persistence, Range, Current, Cursor,
                    Working Interval, Pins, Sections, Field geometry

x  Timeline Space   map position, Step distance, Refine midpoints,
                    adaptive Reach and visual layout
```

Each Section weight is selected from:

```text
W = {0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2}
```

The set deliberately mirrors the familiar Tail/Lead rate scale, but the values act on different axes. Section weights have no playback or Field effect.

At source Address \(u\), let the effective spatial density be the product of every Section weight covering that Address:

\[
\rho(u)=\prod_{S_i \ni u} w_i
\]

With an empty product equal to one, Timeline Space is:

\[
x(\sigma)=\int_0^\sigma \rho(u)\,du
\]

This is equivalent to a piecewise-linear map whose slope changes only at Section endpoints. Because every factor is positive, \(x\) is continuous, strictly increasing, and has one ordinary inverse. No source Address can coincide with, hide behind, or become unreachable from another.

For one isolated Section of source duration \(d\), its timeline extent is \(w d\). Overlapping scales compose multiplicatively because independent spatial scale transforms compose by multiplication. The selected Section values remain canonical even when their local product is outside the selector ladder.

## 4. Section-weight law

Changing a Section weight:

- moves no Pin, Section endpoint, Range boundary, Current, Cursor, Resolution Address, or Working Interval Address;
- changes only the derived Timeline Space positions and distances;
- never changes source duration, playback rate, playback order, Context, or Field Offset;
- preserves ordinary source order and direct reachability;
- becomes spatially neutral at `1×`.

The deformation display is a projection of the same weight, not a second value:

- each non-neutral Section contributes a soft influence centered at its
  projected midpoint and fading beyond its endpoints;
- hue records sign: compression below `1×` and expansion above `1×`;
- peak strength records the magnitude of the Section’s signed log weight;
- overlapping influences add in log space, the visual counterpart of
  multiplicative weight composition;
- projected source-time contours retain the exact metric and make local density
  visible independently of the softened atmosphere.

## 5. Operator laws

### Refine

Refine chooses the directional midpoint of the active Resolution in Timeline Space, increments `level`, and retains the usable Working Interval departure until the new movement reaches it:

1. use `Interval.departure` when `Interval.arrival === Current`;
2. if the Current-to-target path reaches or passes that departure, rebase at pre-movement Current;
3. otherwise retain the departure;
4. bound the resulting departure-to-arrival extent;
5. expand only the receding Resolution bound enough to contain it;
6. preserve the refinement increment.

Positive Timeline Space guarantees a valid spatial midpoint for every positive source span.

### Local Refine (`Shift+Refine`)

Local Refine uses the same directional midpoint and child-frame calculation,
then records exactly the new pre-movement Current-to-target traversal. It never
inherits the previous Working Interval departure. Therefore, when the midpoint
lies inside an existing Working Interval, Local Refine preserves the
complementary half from Current to that midpoint; plain Refine preserves the
established anchor instead.

Example on an unweighted normalized Range:

```text
Refine:        50 → 25 → 12.5    Interval 50 → 12.5, frame {0,12.5,50}
Local Refine:  50 → 25 → 12.5    Interval 25 → 12.5, frame {0,12.5,25}
reverse Refine target             31.25
```

Weighting changes which source Address occupies a spatial midpoint; it does not add an operator exception.

### Step

Step translates Current by the effective Reach in Timeline Space and clamps the result to Range. It preserves a usable departure, so repeated movements extend, shrink, collapse, and redraw one Working Interval predictably.

The approached Resolution endpoint remains fixed while its prospective midpoint has at least one complete Step of headroom. Once a further Step would consume that guard, only the approached endpoint advances far enough to restore one Step of midpoint headroom.

Step Reach is:

- fixed: independently entered backward and forward spatial distances;
- adaptive: `weightedRangeWidth × fraction`, with `1/32`, `1/16`, and `1/8`.

Hold, Stretch, and Section weight editing cannot write Step Reach.

### Pin traversal

Pin traversal applies Step’s interval-anchor law to the next source-ordered retained Pin. All Pins remain visible operands. Range Start and Range End are synthetic stops and are deduplicated by real Pins at the same Address.

### Pin selection and Section ownership

Pin selection is derived from the Working Interval. A Pin coincident with its
Start or End is selected automatically; when both bounds coincide with Pins,
both endpoints are selected. Clicking a Pin moves Current to its Address and
does not create or alter the Working Interval. Selection changes no Pin identity.

Sections move together at a bound only when they reference the same Pin ID.
Unlinking one Section endpoint creates an independent coincident Pin and rewires
only that edge. Unlink preserves source Address and Section weight and stores no
hidden return target. A referenced Pin links only through direct spatial
manipulation after its edge is independent: while it is dragged within a
16-pixel acquisition radius of another valid Pin, that Pin becomes a candidate.
The candidate must remain stable for 450 ms before it arms; release then aligns
and merges the source identity into the target. Leaving the radius, crossing to
another candidate, or releasing before arming commits ordinary movement only.
A Pin already shared by multiple Sections cannot be a link source; Unlink first
chooses the one edge whose ownership may change. A link is
rejected if it would collapse or reverse a Section, duplicate a Section, or
silently discard a conflicting non-empty Pin title.

### Reopen

Reopen restores Resolution endpoints to Range around unchanged Current and preserves the Working Interval.

### Switch Endpoint

Switch swaps departure and arrival, makes the new arrival Current, and restores that endpoint’s frame. Ordered extent and source Addresses remain unchanged. Two Switch operations restore the previous model exactly.

### Release

Release sets the Working Interval to null and moves nothing. Release with a null Working Interval creates no history.

### Deform

Deform requires a positive-duration Working Interval or a selected Section and a canonical weight:

- it reuses exact endpoint Pins;
- creates or reuses the matching Section when necessary;
- assigns the selected Section weight;
- preserves the Working Interval;
- makes `1×` neutral without deleting the Section.

Changing weight from the operator matrix or Guide uses the same Session transaction.

The input grammar separates normalization from tuning:

- plain `T` toggles a weighted Section to `1×` and restores its remembered
  non-neutral factor when pressed again;
- `Shift+T` moves one step up the canonical ladder;
- `Alt+T` moves one step down the canonical ladder. The browser-reserved
  `Ctrl+T` chord is not part of the web interface grammar.

Timeline presentation renders all active Section factors as one continuous
field. The atmosphere expresses sign, log magnitude, midpoint, and softly
diluted span without claiming an extra boundary; the same weight is visually
more concentrated over a narrow Section and more diffuse over a broad Section.
Contour placement expresses the exact composed density. Presentation orders
Pins above the weighted track and source ruler, with the Section relationship
tree below. Individual Sections remain thin selectable Start/midpoint/End wires
rather than weight bars; dotted relations are presentation only.

### Focus / Unfocus

Focus installs a Section or Working Interval as Range without changing any Section weight. Unfocus restores the containing Range exactly.

### Go

Timeline Go converts one visible Timeline Space coordinate through the unique inverse. Guide Go targets an exact source object. Neither mutates Section weights.

Every non-zero Go records the complete departure-to-arrival Working Interval and seeds a movement-scale Resolution around it. In Timeline Space, the Working Interval occupies the central fifth: two equal Interval-width margins precede it and two follow it. Range clipping removes unavailable margin without shifting the Interval or compensating on the other side.

### Playback and Context acceptance

Playback actualizes source continuity. Cursor moves physically while Current remains semantic until settlement. Settlement translates the active Resolution through the observed path and unions watched source coverage into the Working Interval; it never shortens prior coverage.

Context is bounded observation around Current. It remains transient unless the user accepts Cursor. Context acceptance uses the same continuous settlement law rather than direct-Go framing.

### Field Frame

Outside ordinary playback, the Panoramic Phase Field presents one stable Frame:

```text
Context enabled = bounded Context Start | Current or Cursor | bounded Context End
Context disabled = operator backward frame | Current | operator forward frame
```

Context edges persist before, during, and after Context transport. Settlement or acceptance may move Center from Cursor to Current but cannot reassign Tail and Lead. A new semantic movement establishes one new Frame. Its direction is rendered as a brief slideshow transition: forward movement enters through Lead and exits through Tail; backward movement reverses that relation. The transition is presentation-only and never delays or replays the semantic commit.

Direct Current, Pin, or Section manipulation temporarily supplies exact source Addresses. It overrides the ambient Frame only for the gesture lifetime and restores the Context Frame or operator fallback afterward. Hover and focus dry-runs remain on the Temporal Topography and do not seek players.

### Stretch, Breath, and Hold

Stretch begins or resumes a bounded Field Breath during genuine Center playback. Let `x` be the configured Inner Offset and `y` the effective Outer Offset, with `0 < x < y` for each operational side:

```text
x <= Center - Tail <= y
x <= Lead - Center <= y
```

Tail always remains behind Center and Lead always remains ahead. Outward rates `z < c < w` are symmetric about Center rate `c` where supported, so `c - z = w - c`. Expansion moves both offsets from `x` toward `y`. A side that reaches its outer boundary first follows Center at rate `c` while preserving `y`. When every operational side reaches its outer boundary, the rates exchange and contraction begins. At the inner boundary, an early side again follows Center at rate `c`; once all operational sides reach `x`, the outward assignment returns.

Hidden, collapsed, unavailable, or Range-clipped sides are excluded from synchronization. Hold alone stops the Breath, returns participating sides to Center rate, and preserves their attained offsets and sweep direction. Reaching a boundary never chooses Hold automatically.

Field Frame, Breath, Stretch, and Hold are runtime/presentation systems. They cannot write Current, Working Interval, Resolution, Range, Guide, Weight, Step Reach, configured offsets, or history.

### Current drag and Nudge

Dragging Current on the Temporal Topography is exact Go. Pointer movement previews a candidate Address through the captured Timeline projection without mutating Session; release commits one Go and one Undo checkpoint, while cancellation restores the original state.

Nudge is source-time precision movement. Shift-drag reduces gain and quantizes the candidate Address. Shift-wheel and comma/period move Current, a Pin, a Section endpoint, or a whole Section by the active source-time quantum. One continuous wheel or key sequence amends one candidate model and settles as one Undo transaction. The interface may call the quantum a frame only when the media adapter supplies a verified frame duration.

### Alt Carry

Alt Carry modifies a semantic movement by translating the selected retained Pin or Section through the same Timeline Space displacement as Current, subject to structural bounds. It preserves the selected object’s spatial relation to Current as far as topology permits.

### Undo / Redo

Every semantic gesture creates at most one history entry. Deform, weight editing, drag, cascade deletion, Focus, and Unfocus each commit as one Undo transaction.

Plain `Z` restores the preceding checkpoint. Plain `C` reapplies the next checkpoint. Any new semantic commit clears the Redo future.

## 6. Operator coherence and selection

### 6.1 Operator families

The operator surface is organized by semantic role:

```text
OBSERVE
Playback · Context · Stretch · Hold

DISCRIMINATE
Refine Backward · Reopen · Refine Forward
Local Refine Backward · Local Refine Forward

TRAVERSE
Step Backward · Switch Endpoint · Step Forward
Previous Pin · Next Pin · Go

RESOLVE THE WORKING INTERVAL
Release · Deform · Focus

RETAIN AND EDIT TOPOLOGY
Pin · Save Section · Join · Move · Rename · Delete

RESTORE HISTORY
Undo · Redo
```

The keyboard matrix expresses the three central transformation rows:

```text
Q Refine Backward     W Reopen           E Refine Forward
A Step Backward       S Switch Endpoint  D Step Forward
R Release             T Deform           F Focus / Unfocus
```

Their meanings are:

- the first row changes discrimination;
- the second row changes traversal or viewpoint;
- the third row determines the fate of the Working Interval.

The third row is one semantic trichotomy:

```text
Release  → return the relation to absence
Deform   → make the relation modify the world
Focus    → make the relation become the world
```

Space remains outside the matrix because observation actualizes source continuity rather than transforming the map directly. Undo and Redo remain outside because they operate on transformation history rather than the video environment.

### 6.2 Optimal-goal rule

An operator is optimal when its goal is present and no smaller transformation can satisfy that goal.

| Goal condition | Optimal operator | Why alternatives are not optimal |
|---|---|---|
| choose one side at a finer scale while retaining the path of approach | Refine | Step assumes a known distance; Go assumes an exact destination |
| choose the same midpoint but edit only the local interval relation | Local Refine | Refine retains the broader traversed thread |
| move a known Timeline Space distance without selecting a new scale | Step | Refine changes scale; Go derives scale from an exact crossing |
| move to the next known retained landmark | Pin traversal | ordinary Step ignores landmark identity |
| move to an exact known Address | Go | Refine and Step deliberately derive targets rather than accept one |
| restore broad alternatives without changing place or retained coverage | Reopen | Undo restores an old state; Go and Step move |
| continue from the opposite side of the same retained relation | Switch Endpoint | backward movement changes the relation; Switch preserves its extent |
| discard only the traversal trace | Release | deletion changes retained topology; Reopen changes scale |
| allocate map distance to fixed source content | Deform | Focus changes admissibility; playback rate changes media runtime |
| make one extent the complete active world | Focus | Deform changes metric but not admissibility |
| return from a focused world to its containing world | Unfocus | Reopen restores Resolution only |
| perceive continuous source development | Playback | map operators move discretely |
| inspect a bounded audiovisual neighbourhood without immediate commitment | Context | Playback continues through Range; Go commits immediately |
| make nearby mutually exclusive moments perceptually co-present | Stretch | Timeline deformation is spatial, not live audiovisual |
| preserve one attained Field relation | Hold | Stretch continues changing the relation |
| preserve a retained object’s relation while Current moves | Alt Carry | ordinary traversal changes their relative position |
| retain one exact place | Pin | Section requires an extent |
| retain one bounded relation | Save Section or Join | Pin retains only one Address |
| negate or reinstate the last semantic transformation | Undo / Redo | recovery operators move forward under current state |

### 6.3 Frequency and placement

Placement follows expected goal frequency and motor continuity:

- **continuous observation:** Space and the Field surface;
- **high-frequency search:** directional Refine and Step;
- **moderate-frequency orientation:** Reopen, Switch, Pin traversal, and Go;
- **lower-frequency high-consequence resolution:** Release, Deform, and Focus;
- **object-local map construction:** Timeline and Guide controls;
- **global meta-history:** Undo and Redo.

Shift modifies an existing family rather than introducing an unrelated one:

```text
Shift+Refine  changes Working-Interval composition while retaining the midpoint target
Shift+Step    changes the target class from metric distance to retained landmark
```

Alt modifies whether a selected retained relation moves with Current. It does not change target selection.

### 6.4 Minimal-transform contracts

The following contracts are normative. “May change” includes conditional changes explicitly required by bounds or composition. Every unlisted canonical dimension must be preserved.

| Operator | Must or may change | Must preserve |
|---|---|---|
| Refine | Current, Resolution, Working Interval coverage/orientation, traversal provenance | Range, Focus, Guide topology, weights, stored Step Reach |
| Local Refine | Current, Resolution, membership-governed Working Interval, traversal provenance | Range, Focus, Guide topology, weights, stored Step Reach |
| Step | Current, guarded Resolution placement, Working Interval, traversal provenance | Range, Focus, Guide topology, weights, stored Step Reach |
| Pin traversal | same semantic dimensions as Step | Pin and Section topology, weights, Range |
| Reopen | Resolution, basis, traversal provenance | Current, Working Interval, Range, Focus, Guide, Step Reach |
| Switch Endpoint | Current, Resolution frame, interval orientation | interval ordered extent, traversal provenance, Range, Focus, Guide, weights, Step Reach |
| Release | Working Interval, traversal provenance reset to default Step | Current, Resolution, Range, Focus, Guide, weights, Step Reach |
| Deform | Section creation/reuse and/or one Section weight; derived metric | all source Addresses, Current, Resolution source Addresses, Range, Focus, Working Interval, stored Step Reach, Field |
| Focus | Range, Focus context, root Resolution, traversal provenance; Current and Interval only when required by bounds | Guide, weights, stored Step Reach |
| Unfocus | Range, Focus context, root Resolution, traversal provenance; Current and Interval only when required by bounds | Guide, weights, stored Step Reach |
| Go | Current, Resolution, Working Interval, traversal provenance; Range/Focus only when opening the target | Guide, weights, stored Step Reach |
| Section selection | Current, exact Section Resolution/Interval, traversal provenance | Range, Focus, Guide topology, weights, stored Step Reach |
| Playback settlement | Current, translated Resolution, unioned Working Interval, traversal provenance | Range, Focus, Guide, weights, stored Step Reach |
| Context before acceptance | Cursor and runtime transport only | every Session dimension |
| Context acceptance | same semantic class as playback settlement | Guide, weights, Range, Focus, stored Step Reach |
| Stretch / Hold | Field runtime relation only | every Session dimension and persisted Field Offset |
| Offset edit | one side's configured Field bound and its necessary local reconciliation | sibling side state, every Session dimension, Step Reach, Guide, weights |
| Alt Carry | movement operator effects plus selected Guide geometry | selected object identity and weight; unrelated Guide objects except shared-endpoint consequences |
| Weight edit | one Section weight and derived metric | every source Address, playback, Field, stored Step Reach |
| Move Pin | one Pin Address and all incident Section extents | unrelated Pins, Section identities and weights |
| Move Section | its two endpoint Pin Addresses and incident shared-edge consequences | unrelated interior Pins, Section identity and weight |
| Undo / Redo | exact checkpoint model and history/future stacks | no partial reinterpretation of the checkpoint |

Derived effects must not be mistaken for stored writes. For example, Deform may change Refine targets and adaptive effective Reach because the metric changed, while the stored Resolution Addresses and Step Reach remain untouched.

## 7. Playback and Context

Playback and Context are source-contiguous and independent of Timeline Space.

- Full-video Range plays to source end and stops.
- A proper Range loops.
- Each wrap seeks to Range start, increments transport cycles, and resumes.
- A wrap commits no Current, Working Interval, Resolution, Context, or history.
- The watchdog follows the current cycle entry rather than the original departure.
- Playback settlement unions prior Working coverage with every watched source segment; it never shortens coverage.

Space is the reader-wide observation command:

```text
idle       → begin Playback
Playback   → pause and settle observation
Context    → accept Cursor as Current
```

Text editing and modal Guide interaction retain ordinary Space ownership.

## 8. Guide lifecycle

```text
Pin Current       create or reuse a Pin at Current
Save Section      create or reuse endpoint Pins and one Section
Join              create a Section from two selected Pins
Rename            change optional title only
Set Weight        assign one canonical spatial factor
Move Pin          update every referencing Section
Move Section      translate only its two endpoint Pins
Delete Section    remove Section and unshared untitled endpoint Pins
Delete Pin        dissolve all references and clean up orphan endpoints
```

Arbitrary overlap, nesting, shared endpoints, and coincident extents are valid. The effective density is derived from independent Section factors; no stored hierarchy or priority is introduced.

## 9. Invariants

```text
Section.end > Section.start
Section.weight ∈ W
effective spatial density > 0
Range.start <= Current <= Range.end
Working Interval ⊆ Range in source time
Working Interval ⊆ Resolution ⊆ Range in Timeline Space
Working Interval is one continuous source extent
every source Address has one timeline position and one inverse
playback, Context, and live Field Breath geometry are source-time operations
adaptive Step changes with weighted Range width, not Field Offset
Release is the only operator whose sole effect is clearing the Working Interval
Timeline Space is derived and never persisted
each operator changes only dimensions permitted by its effect contract
Tail remains behind Center throughout Field Breath
Lead remains ahead of Center throughout Field Breath
Context settlement preserves the established Field Frame edges
one Current drag, retained-object drag, wheel series, or held-key Nudge creates at most one history checkpoint
Guide exact editing and Temporal Topography manipulation invoke the same Session operations
semantic dry-run and commit invoke the same operator implementation; Field Frame presentation receives only resulting source Addresses
```

Source-contiguous media behavior and strict spatial invertibility are the highest-priority invariants.

## 10. Implementation plan: declarative operator grammar

### 10.1 New module

Add a DOM-free, I/O-free module:

```text
operator-grammar.js
```

It defines frozen semantic descriptors. It does not calculate targets, mutate Session, inspect media players, or reproduce operator arithmetic.

Minimum descriptor shape:

```js
{
  id: "refineForward",
  family: "discriminate",
  goal: "Inspect the forward side at a finer scale while retaining the path",
  frequency: "primary",
  key: "E",
  shiftedKey: null,
  direction: "forward",
  operand: "resolution-midpoint",
  targetClass: "derived",
  availability: "can-refine-forward",
  preview: "session-dry-run",
  transforms: [
    "commitment",
    "discrimination",
    "traversal-coverage",
    "traversal-orientation"
  ],
  preserves: [
    "availability",
    "topology",
    "metric-source-values",
    "stored-step-reach"
  ],
  counterpart: "refineBackward",
  recoveryComplement: "reopen",
  matrix: { row: 0, column: 2 }
}
```

The registry must include:

- Refine Backward and Forward;
- Local Refine Backward and Forward;
- Step Backward and Forward;
- Previous and Next Pin;
- Reopen;
- Switch Endpoint;
- Release;
- Deform;
- Focus and Unfocus;
- Go;
- Playback;
- Context and Context acceptance;
- Stretch and Hold;
- Pin, Save Section, Join, Weight, Move Pin, Move Section, Rename, Delete;
- Alt Carry;
- Undo and Redo.

Runtime-only operators and semantic Session operators share the vocabulary but declare different effect domains.

### 10.2 Registry rules

The registry is authoritative for:

- family and UI grouping;
- user-facing goal;
- frequency tier;
- key and modifier presentation;
- counterpart and complement relationships;
- transformed and preserved dimensions;
- preview ownership;
- concise availability and disabled-reason identity;
- documentation tables and audit coverage.

The registry is not authoritative for:

- target arithmetic;
- Range or Resolution geometry;
- Timeline projection;
- Guide mutations;
- media commands;
- runtime Field control;
- history commits.

Those remain owned by their current modules.

### 10.3 Stable operator IDs

Operator IDs must be stable across:

- `session.js` interval provenance;
- `app.js` bindings;
- `view.js` presentation;
- keyboard help;
- status and accessibility metadata;
- tests and audits.

Existing stored Guide and Session data must not persist the descriptor itself.

## 11. Implementation plan: availability and action routing

### 11.1 One action map

`app.js` should expose one map from operator ID to the existing action function:

```js
const OPERATOR_ACTIONS = {
  refineBackward: () => refine("backward"),
  refineForward: () => refine("forward"),
  stepBackward: selection => performStep("backward", selection.distance),
  stepForward: selection => performStep("forward", selection.distance),
  reopen: reopenFully,
  switchEndpoint,
  release: releaseWorkingSection,
  deform: deformSelectedTarget,
  focus: focusSelectedTarget
};
```

The action map delegates to existing Session, transport, Guide, and Field owners. It must contain no independent semantic calculation.

### 11.2 Availability resolvers

Add a pure or composition-level resolver:

```text
operator-availability.js
```

It maps descriptor availability keys to current existing predicates and block-reason helpers.

Examples:

```text
can-refine-forward   → getTargets + refineBlockReason
can-reopen           → canReopen
has-interval         → Boolean(model.interval)
has-deform-target    → selected Section or positive Working Interval
can-focus-target     → selected Section or positive Working Interval
has-next-pin         → nextPin within active Range
```

Availability resolution may aggregate existing facts but cannot derive alternate destinations.

Each result has:

```js
{
  available: true,
  reason: null,
  target: optionalPresentationTarget,
  consequence: optionalConciseMetadata
}
```

Disabled reasons must describe the missing condition, not an implementation detail.

### 11.3 Preview routing

Every semantic preview must continue to dry-run the exact Session operation used for commit.

The registry selects the preview owner; it does not calculate the preview.

```text
operator descriptor
→ availability resolver
→ exact Session dry run
→ projected consequence
→ presentation
```

Field and transport previews use their existing runtime geometry owners.

## 12. Implementation plan: executable effect contracts

### 12.1 Canonical state projection

Add a pure test helper:

```text
semantic-state-projection.js
```

It converts an application or Session snapshot into normalized contract dimensions:

```js
{
  availability: { range, focus },
  commitment: { current },
  discrimination: { resolution, basis },
  traversalCoverage: { start, end },
  traversalOrientation: {
    departure,
    arrival,
    activeSide,
    startFrame,
    endFrame
  },
  topology: {
    pinIds,
    sectionIds,
    references,
    sourceAddresses
  },
  metricSourceValues: {
    sectionWeights
  },
  movementMagnitude: {
    storedStepReach
  },
  reversibility: {
    historyLength,
    futureLength
  }
}
```

A separate runtime projection covers:

```js
{
  observation: { cursor, transportKind, phase },
  perceptualHorizon: {
    tailAddress,
    leadAddress,
    rates,
    modes,
    configuredOffsets
  }
}
```

The projections normalize ordering and omit timestamps, labels, object identity noise, and derived Timeline coordinates unless a test explicitly targets projection.

### 12.2 State diff

Add:

```text
operator-effect-diff.js
```

It compares normalized before and after projections and returns changed dimension paths.

It must distinguish:

- stored changes;
- derived projection changes;
- runtime-only changes;
- history bookkeeping;
- optional bound-driven changes.

### 12.3 Contract suite

Add:

```text
operator-contract-tests.mjs
```

For every registered operator:

1. construct or generate states in which it is available;
2. invoke the actual implementation;
3. verify the result satisfies global invariants;
4. diff canonical dimensions;
5. reject changes outside the declared contract;
6. require declared core effects when the operation reports `changed`;
7. verify one gesture creates at most one history entry;
8. verify unavailable states return no semantic change;
9. verify preview and commit produce equivalent candidate models;
10. verify counterpart, complement, or involution laws where declared.

Required relational tests:

```text
Switch × 2                         = exact prior model
Undo after one semantic gesture    = exact prior checkpoint
Redo after Undo                    = exact committed checkpoint
Reopen                             preserves Current and Working Interval
Release                            changes only Working Interval
Weight edit                        preserves all source Addresses
Deform                             preserves Working Interval
Stretch / Hold                     preserve every Session dimension
Pin traversal                      uses Step interval law
Local Refine                       shares Refine target and child frame
Refine opposite-side crossing      rebases exactly as specified
Focus then Unfocus                 restores containing Range
complete weight cycle to 1×        restores neutral contribution, not deletion
```

### 12.4 Generated coverage

Extend deterministic fuzz and semantic state-space tests to record:

- operator availability frequency;
- successful use frequency;
- changed dimensions;
- block reasons;
- contract coverage.

Every registered semantic operator must be exercised in:

- at least one ordinary state;
- at least one boundary state;
- at least one weighted state where Timeline Space differs from source time;
- overlap or shared-topology states when relevant.

## 13. Implementation plan: UI derivation

### 13.1 Matrix and hierarchy

`view.js` derives the operator matrix from grammar metadata:

The rendered matrix is geometrically square. Its three equal columns encode
backward, neutral, and forward roles while its three equal rows encode
discrimination, traversal, and lifecycle; neither semantic axis may be
visually compressed relative to the other.
Within each cell, the shortcut is a stable corner anchor, the operator identity
is centered and may balance across two lines, and consequence metadata occupies
a separate compact two-line region. Dynamic labels may change words but not
this hierarchy.

```text
row 0  discriminate
row 1  traverse
row 2  resolve Working Interval
```

The visible row labels or accessible group names must expose those roles.

Primary emphasis follows frequency:

- Refine and Step: primary;
- Reopen, Switch, Pin traversal, Go: secondary or modifier layer;
- Release, Deform, Focus: contextual high-consequence;
- Undo and Redo: separate history controls.

The matrix must not imply that Release, Deform, and Focus are directional counterparts. Their unity is the fate of the Working Interval.

### 13.2 Shift and Alt presentation

Holding or latching Shift updates the same controls in place:

- Refine labels become Local Refine;
- Step labels become Previous/Next Pin;
- exact previews change accordingly.

Holding or latching Alt:

- marks the selected retained object as carried;
- previews its translated map position and shared-endpoint consequences;
- preserves the base movement operator’s target.

### 13.3 Consequence metadata

Every control displays or exposes:

- goal-oriented label;
- exact destination or transformation;
- primary changed dimension;
- concise blocked reason;
- modifier consequence where active.

Examples:

```text
Refine Forward
Choose the forward half · Current 12:30 → 14:08

Reopen
Restore full Range Resolution · keep Current and Working Section

Deform
Allocate 0.5× map space to Working Section · source times unchanged

Focus
Make Working Section the active Range
```

### 13.4 Working-Interval resolution group

The third row and any contextual duplicate must be labeled or described as:

```text
Resolve Working Section
Release · Deform · Focus
```

Availability:

- Release requires a Working Interval;
- Deform requires a Working Interval or selected Section;
- Focus requires a Working Interval or selected Section;
- Unfocus replaces Focus when a Focus context exists.

### 13.5 Observation command

Space presentation must reflect current state:

```text
Play
Pause and settle
Accept Context position
```

The underlying key remains constant because each action crosses the same boundary between available observation and semantic commitment.

### 13.6 Documentation generation

Where practical, README shortcut tables, help overlays, and matrix labels should be generated from or audited against `operator-grammar.js`.

A manual document may add explanation but cannot contradict:

- operator ID;
- key;
- family;
- goal;
- transform contract;
- complement relationships.

## 14. Implementation phases

### Phase 1 — Formal grammar without behavior change

1. add state-dimension constants;
2. add `operator-grammar.js`;
3. register the current operator set;
4. add registry validation;
5. preserve all current bindings and rendering;
6. add project-audit checks for duplicate IDs, duplicate keys within a layer, missing families, and missing actions.

Acceptance:

- no semantic or visual behavior changes;
- every existing operator has one descriptor;
- `npm run check` remains green.

### Phase 2 — Effect projection and contract tests

1. add semantic and runtime state projections;
2. add normalized state diff;
3. encode minimal-transform contracts;
4. implement ordinary and boundary tests;
5. add counterpart, complement, and involution tests;
6. add preview/commit equivalence checks.

Acceptance:

- every registered operator is contract-tested;
- undeclared state changes fail the suite;
- existing fuzz and state-space tests remain green.

### Phase 3 — Availability and disabled reasons

1. centralize availability resolution;
2. route matrix, keyboard, Field, Timeline, and Guide surfaces through the same operator availability identity;
3. preserve target calculations in existing owners;
4. make disabled reasons goal-based and consistent.

Acceptance:

- the same operator is available or blocked consistently on every surface;
- no UI surface maintains independent semantic eligibility arithmetic.

### Phase 4 — Grammar-derived operator presentation

1. derive matrix placement and group labels;
2. derive Shift-layer labels and keyboard help;
3. expose primary transformation metadata;
4. present the third row as Working-Interval resolution;
5. separate history and observation from the matrix;
6. preserve current exact previews.

Acceptance:

- UI placement matches family and frequency metadata;
- keyboard, mouse, touch, and screen-reader labels describe the same operator;
- no operator gains a second semantic implementation.

### Phase 5 — Runtime operator integration

1. add Playback, Context, Stretch, Hold, and Alt Carry descriptors;
2. add runtime effect projections;
3. verify Session preservation under Field-only operations;
4. verify Space state transitions;
5. verify Carry composes with each supported movement family.

Acceptance:

- runtime operations are included in the same semantic vocabulary;
- Session/runtime ownership remains strictly separated.

### Phase 6 — Usage and optimality validation

Instrument development builds to collect non-content telemetry locally:

- operator availability counts;
- activation counts;
- block reasons;
- modifier use;
- immediate Undo;
- repeated switching between operators;
- time between movement and Release/Deform/Focus.

The application must not transmit video identity, source time, Guide content, labels, or personal usage data unless a separate explicit telemetry design is approved.

Use findings to test placement assumptions:

- whether frequent goals occupy primary surfaces;
- whether an operator is rarely used because its goal is rare or because its meaning is unclear;
- whether immediate Undo indicates an incorrect consequence;
- whether users choose a larger transformation when a smaller one was available.

Acceptance:

- every operator has observed or testable conditions under which it is optimal;
- no operator exists only because it is symmetrical with another;
- low-frequency operators remain accessible without competing with primary traversal.

## 15. Audits and repository ownership

### 15.1 Module ownership

```text
operator-grammar.js             semantic descriptors and relationships only
operator-availability.js        current-state eligibility composition
semantic-state-projection.js    normalized contract state for tests/audits
operator-effect-diff.js         canonical dimension diff
session.js                      semantic arithmetic and history
range-geometry.js               Range and Resolution arithmetic
timeline-projection.js          positive metric and inverse
guide.js                        Pin/Section topology and weights
transport.js                    Playback and Context projection
step-field-geometry.js          Field source geometry
step-field.js                   Field runtime
app.js                          action routing and adapter composition
view.js                         grammar-derived presentation
```

No new module may import DOM or media APIs unless its ownership explicitly requires them.

### 15.2 Audit rules

`project-audit.mjs` must fail when:

- an operator used by `app.js`, `session.js`, transport, Field, or Guide has no descriptor;
- a descriptor has no action or documented presentation-only role;
- two operators claim the same unmodified key in the same interaction layer;
- a matrix operator lacks family, goal, frequency, availability, transform, or preserve metadata;
- a UI shortcut table disagrees with the registry;
- a semantic preview bypasses the actual operation;
- a runtime-only descriptor claims Session dimensions;
- a semantic descriptor omits history behavior;
- the docs describe an operator family or key that does not exist.

## 16. Completion criteria

The operator-coherence implementation is complete when:

1. every operator is defined by one stable ID;
2. every operator has one explicit optimal goal;
3. every operator belongs to a semantic family;
4. every operator declares transformed and preserved dimensions;
5. every operator’s availability is consistent across all surfaces;
6. every semantic preview invokes the same implementation as commit;
7. undeclared state changes fail automated tests;
8. Refine, Step, and Go remain differentiated by side, distance, and exact-target knowledge;
9. Reopen remains recovery without reversal;
10. Switch remains viewpoint inversion without extent change;
11. Release, Deform, and Focus are presented as the three fates of the Working Interval;
12. Playback and Context remain observation and actualization rather than map deformation;
13. Stretch and Hold remain Field-only perceptual operations;
14. Weight changes map geometry without changing source truth or media runtime;
15. Alt Carry composes with movement without becoming a second movement law;
16. Guide operations preserve graph ownership and shared Pin consequences;
17. history operators remain outside the environmental operator matrix;
18. every operator has at least one ordinary, boundary, and weighted contract test where relevant;
19. all existing semantic, fuzz, audit, smoke, and browser checks pass;
20. the interface makes the complete video remain legibly available as terrain while bounded operators determine what is currently perceived, traversed, retained, deformed, or focused.

The completed grammar should make the system reconstructable from consequence:

> Given the user’s goal, the available operator should be the smallest valid transformation. Given the transformation, its semantic role and placement should be inferable from the dimensions it changes and preserves.
