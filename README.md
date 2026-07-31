# Video Cartography

**A spatial comprehension workspace for video.**

Video Cartography turns linear video into a Panoramic Phase Field and a navigable, deformable Temporal Topography without changing source order, duration, or playback.

```text
Panoramic Phase Field  local phases made perceptually co-present
Temporal Topography   the complete source made spatially navigable
Guide                  discovered landmarks and regions retained
Operator Matrix        bounded transformations of that environment
```

## Field Frame and Field Breath

Outside ordinary playback, Tail–Center–Lead form a stable Field Frame. With Context enabled, Tail and Lead remain the Context edges before, during, and after observation. With Context off, the Frame uses the active operator geometry. Traversal produces a brief directional slideshow: frames enter from the direction of travel, pass through Center as Current, and leave through the opposite side.

During playback, Stretch produces a bounded Field Breath. Tail remains behind Center and Lead remains ahead while both expand from an Inner Offset to an Outer Offset, exchange rates, contract, and repeat. A side that reaches a boundary first follows Center at `1×` until the other arrives. Hold alone preserves an attained relation.

## Temporal Topography

Source time is canonical. Timeline Space is derived, positive, and invertible. Pins remain ordered and reachable at every Section Weight.

```text
0.25×  0.5×  0.75×  1×  1.25×  1.5×  1.75×  2×
```

Weight changes map allocation only. It never changes playback or source duration. Overlapping factors compose multiplicatively.

Step Reach determines traversal distance through the projected map and remains independent from Field offsets and Section Weight.

Current, Pins, Section endpoints, whole Sections, and Range boundaries are manipulated on the Timeline. Drag Current to perform exact Go. Shift-drag for quantized precision. Shift-wheel or comma/period Nudges the acquired object; one continuous sequence creates one Undo checkpoint. Guide supplies exact Address fields and increment controls rather than a second drag system.

## Operator Matrix

```text
Refine Backward   Reopen             Refine Forward
Step Backward     Switch Endpoint    Step Forward
Release           Deform             Focus / Unfocus

Q W E
A S D
R T F
```

- `Shift+Q/E` — Local Refine.
- `Shift+A/D` or `Shift+←/→` — Previous/Next Pin.
- `T` — toggle neutral/non-neutral Weight.
- `Shift+T` / `Alt+T` — move through the Weight ladder.
- `P` — Pin Current.
- `Shift+P` — save the Working Interval.
- `Z` / `C` — Undo / Redo.
- `,` / `.` — Nudge backward / forward.

## Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

Run the complete release gate:

```bash
npm run check
```

## Canonical documents

- `PROJECT.md` — project identity, purpose, product definition, and theoretical establishment.
- `GLOSSARY.md` — normative lexicon.
- `SPEC.md` — normative state, geometry, and operator laws.
- `IMPLEMENTATION.md` — module ownership and transaction architecture.
- `INTERFACE.md` — visible grammar and direct manipulation.
- `DEVELOPMENT.md` — contribution constraints and test map.
- `VALIDATION.md` — automated and manual release gates.
