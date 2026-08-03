# Video Cartography

**A spatial comprehension workspace for video.**
See the phases. Map the whole.

Video Cartography turns a linear video into a spatial map. Source time remains exact while the reader refines neighborhoods, draws a Working Interval, retains Pins and Sections, and changes how much timeline space a Section receives.

A Section weight is a spatial scale, not a playback rate. Its interior copies the familiar Tail/Lead rate ladder, and it extends one step past that ladder at each end:

```text
0.125×  0.25×  0.5×  0.75×  1×  1.25×  1.5×  1.75×  2×  4×
```

The correspondence is perceptual:

- Tail/Lead rate scales motion through time in a side viewer.
- Section weight scales the same fixed source material across the timeline.
- Every video player still follows its own existing runtime rules; Section weight never changes playback.

Because every allowed weight is positive, every source Address remains ordered, visible, and directly reachable. There are no collapsed spans, stacked endpoints, directional faces, or vertical navigation rules. A Pin can be hidden from the Timeline — that is what Group visibility does — but it stays in the Guide, exactly reachable, and returns the moment its layer is drawn again.

## The operator matrix

```text
Refine Backward   Reopen             Refine Forward
Step Backward     Switch Endpoint    Step Forward
Release           Deform             Focus / Unfocus
```

The rendered matrix is square so its three semantic rows and three directional
columns have equal visual weight.

The keyboard has the same shape:

```text
Q W E
A S D
R T F
```

Shift changes the two directional families and raises Deform by one canonical weight step:

- Plain `Q/E` Refine retains the Working Interval’s departure while increasing logarithmic resolution. If a reversal reaches or passes that departure, the complete Current-to-target movement becomes the new Working Interval.
- `Shift+Q/E` invokes Local Refine. Midpoint membership decides whether it shortens the existing traversal or replaces it with the new local traversal.
- `Shift+A/D` or `Shift+←/→` traverses Pins. Consecutive Pin hops use Step’s retained-anchor law.
- `Shift+X` raises Section weight one step; `Alt+X` lowers it one step.

The remaining operators each own one small intent:

- Reopen restores Resolution to the active Range without discarding coverage.
- Switch Endpoint chooses the other boundary of the same Working Interval.
- Release clears only the Working Interval.
- Deform creates or reuses a Section for the Working Interval. Plain `X` toggles `1×` against that Section’s remembered non-neutral weight; `Shift+X` and `Alt+X` tune the canonical ladder directly. `T` is Tag, so Deform holds `X`.
- Focus makes a Working Interval or saved Section the active Range; Unfocus restores its containing Range.
- Plain `Z` is Undo and plain `C` is Redo.
- `T` immediately Tags Current as a Pin; `Shift+X` immediately Tags the Working
  Interval as an untitled Section. Guide forms add optional titles explicitly.

## Timeline weighting

For a source interval of duration \(d\) with one Section weight \(w\):

```text
timeline extent = w × d
```

Thus ten source seconds receive 2.5 units of timeline space at `0.25×`, ten at `1×`, and twenty at `2×`. Source duration and playback duration remain ten seconds in every case.

Overlapping Section weights compose by multiplication. This is the ordinary composition of independent scale transforms, is order-independent, and needs no Section priority or stored hierarchy. Setting a Section to `1×` makes that Section spatially neutral without deleting it.

One composed field across the main timeline makes deformation legible:

- below `1×`, violet influence marks compression;
- above `1×`, teal influence marks expansion;
- at `1×`, regular slate contours provide neutral scale.

Each Section contributes a soft influence centered on its midpoint. Hue shows
the sign of deformation, peak strength shows the magnitude of its log weight,
and the influence fades beyond both endpoints so adjacent Sections read as one
continuous terrain. Overlapping influences add in log space, exactly matching
the multiplication of the underlying weights. Source-time contours are then
projected through the exact map: compression packs them together and expansion
spreads them apart. The atmosphere is perceptual; the contours remain metric.

## Step size

Step Reach is independent from the three-player Field.

- Manual mode accepts a distance in timeline units.
- Range-relative mode derives Reach from the active Range’s weighted timeline width.
- `1/32`, `1/16`, and `1/8` are the adaptive presets.
- The fine Nudge quantum sits with them: both answer how far one movement goes.
- Stretch and Hold change only the live Tail/Lead relation. They never overwrite the configured Inner/Outer Offset, Step Reach, or Section weight.

Changing Section weight recomputes adaptive Reach because the active spatial width changed. It does not change fixed Reach.

## Pins and Sections

Pins are shared source Addresses. Sections are edges between two Pins, so endpoint ownership is never duplicated.

- Sections may overlap, nest asymmetrically, share endpoints, or coincide.
- Every Section owns one weight from the canonical ladder.
- Every Pin remains a normal lateral traversal stop at every weight.
- Range Start and Range End are synthetic Pin-traversal stops, deduplicated when a real Pin already exists there.
- Moving a shared Pin updates every referencing Section.
- Moving a Section translates only its endpoint Pins; unrelated interior Pins are not captured.
- Deleting a referenced Pin previews the affected count and dissolves all referencing Sections in one transaction.

The timeline places Pins above the weighted track and its source ruler, then
lane-packs overlapping Sections into a relationship tree below. Each thin
Section wire has Start, midpoint, and End nodes with faint relations back to
its Pin/track positions. Click a Section to make its complete extent the
Working Interval and return Current to its center. Drag near either end of a
Section wire to move that endpoint Pin, or its middle to translate the whole
Section, while the three viewers show the resulting extent. The
collapsible right rail has two exclusive modes: full-height Guide, or Operators
with Parameters. Guide and the operator controls never compete for vertical
space. Collapse either mode to leave Viewer and Timeline as one panoramic
surface; reopen Guide with its header control or `G` for exact weights, Addresses, and
endpoint editing. Unlink separates one shared Section endpoint; drag that Pin
onto another Pin's visible candidate, pause until it arms, then release to link
their ownership again. Unlink asks for confirmation; proximity alone never
changes the graph.

## Playback, Context, and Field

Current is committed semantic position. Cursor is observed physical position.

Playback and Context use source time only. A proper focused Range loops; the full-video Range stops at its source end. A wrap adds no history, changes no semantic Current, and rebases each available Field side at most once.

Playback settlement preserves or extends watched Working Interval coverage and never shortens it.

Center is the audible player. Tail and Lead are optional muted projections.

During traversal, Tail–Center–Lead behave as a stable directional slideshow
around Current. During playback, the Field breathes continuously between inner
and outer offsets until Hold preserves the attained relation.

- The **Field Frame** is the settled Tail–Center–Lead presentation outside
  ordinary playback. It is resolved once per semantic movement, and each
  movement produces one directional transition: forward traversal moves the
  visible strip leftward, backward traversal moves it rightward.
- Context has priority over operator framing while it is enabled. Its Tail and
  Lead are the frozen observation edges; only Center follows the Cursor, and
  Context beginning, pausing, stopping or settling reassigns neither side.
- Without Context, the Frame uses the current operator: exact Step destinations,
  Refine or Reopen midpoints, a retained Section's Start and End, or an exact
  Go-derived neighbourhood.
- The **Field Breath** is the live relation during Center playback. Tail stays
  behind Center and Lead stays ahead while both travel between the configured
  Inner and Outer Offsets. A side reaching a boundary first waits there at
  Center rate until every operational side arrives, then the cycle reverses.
- One combined Stretch/Hold control owns that cycle, and one symmetric breathing
  rate pair — `0.75×/1.25×`, `0.5×/1.5×`, `0.25×/1.75×` — describes both sides.
- Hold alone stops breathing. It preserves each attained offset, sets every held
  side to Center rate, and preserves the direction for later resumption. A held
  Field is not a configured Offset change and creates no Undo checkpoint.
- A collapsed or Field-off side is dormant and cannot be revived by a delayed
  player event; unavailable panes are excluded from the breathing barrier and
  are not Step operands.
- Context duration and Field Offset are independent observation settings. A
  2.5-second Offset and either half of a 5-second Context can describe the same
  displacement, but changing either value never rewrites the other.
- Direct manipulation temporarily supplies an exact Frame — a Current, Pin or
  Section candidate — and one transition returns to the ambient Frame when the
  gesture ends. Hover and keyboard focus remain map-only dry runs.
- Timeline weighting only changes where source Addresses are drawn and navigated.

## Run locally

Serve the directory over HTTP:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Run the release gate with:

```bash
npm run check
```

## Direct manipulation and fine adjustment

The Temporal Topography owns spatial direct manipulation. Current, Pins, Section
Start/End/midpoint nodes, and Range boundaries are all dragged there:

```text
Current marker          → Step
Pin marker              → Move Pin
Section wire ends       → Move endpoint Pin
Section wire middle     → Translate Section
Range boundary          → Change Range
```

Dragging Current is a Step gesture, not a Go: the marker follows a candidate
Address, the original Current remains as a faint departure marker, Session
Current is unchanged until release, and the release commits one Step that
extends or shortens the retained traversal. It does not draw a new Working
Interval around the landing point — clicking the Timeline is what does that. A
stationary press moves nothing.

Fine adjustment is called Nudge, because a verified source frame duration is not
available from every media adapter. It acts in source time:

- `Shift` + wheel up/right nudges forward, down/left nudges backward, and the
  exact object under the pointer owns the gesture;
- `Shift`-drag enters precision mode: reduced gain, quantized to the same Nudge
  quantum, same gesture owner;
- `,` and `.` nudge the selected map object, or Current when unambiguous;
- every increment control repeats while held;
- Guide's `−`/`+` controls invoke the same operation.

One drag, wheel series, or held-key repetition creates at most one Undo
checkpoint. Guide owns exact topology and numeric editing — Address inputs,
Nudge increments, Go, Weight, Rename, Delete — and no second drag geometry.

## Canonical project documents

- `PROJECT.md` — canonical project establishment
- `GLOSSARY.md` — normative lexicon
- `SPEC.md` — normative state, geometry, and operator laws
- `IMPLEMENTATION.md` — module ownership and transaction architecture
- `INTERFACE.md` — visible grammar and direct manipulation
- `DEVELOPMENT.md` — contribution constraints and test map
- `VALIDATION.md` — automated and manual release gates
