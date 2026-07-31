# Binary YouTube Reader — Project

A video is globally present as a source but locally actualized in playback. At
any instant its frames are linearly ordered and mutually exclusive: only one
source moment can occupy the ordinary audiovisual present.

Binary YouTube Reader turns that condition into bounded spatiotemporal
availability without changing source order:

```text
linear temporal exclusivity
→ bounded perceptual and spatial availability
→ retained map
```

Availability has three complementary forms:

- **Field availability** — Tail, Center and Lead make a bounded temporal
  neighbourhood perceptually co-present.
- **Map availability** — Timeline Space makes the complete ordered source
  spatially present as one deformable terrain.
- **Guide availability** — Pins and Sections make prior distinctions persist as
  landmarks and regions.

## The Field

The Field does not merely preview operators. Its role is to preserve perceptual
continuity while Current moves through the video. A viewer moving rapidly should
retain the impression of where the traversal came from, where Current now is,
what lies ahead, and how those positions move through one continuous panoramic
surface.

The Field has two operational regimes, and they are mutually exclusive
presentation owners.

### Field Frame

The **Field Frame** is the stable Tail–Center–Lead presentation used outside
ordinary playback:

```text
Tail | Center | Lead
```

It is not itself a semantic operator. It is a perceptual projection of the state
produced by an operator, by Context, or by a direct manipulation. Center
represents Current, except while Context transport is displaying its Cursor or
while a direct manipulation is displaying a candidate position. Tail and Lead
provide the surrounding frames through which movement can be understood.

Every committed movement produces one directional transition from the currently
displayed Frame to the next. Forward traversal moves the visible strip leftward;
backward traversal moves it rightward. Frames enter through Tail or Lead, pass
through Center when they become Current, and leave through the opposite side:

```text
A | B | C        C | D | E
    ↓                ↓
B | C | D        B | C | D
    ↓                ↓
C | D | E        A | B | C
```

The result reads as a directional slideshow or carousel. It is a stable Frame,
not a continuously changing operator preview: Context beginning, moving, pausing
or settling never reassigns Tail or Lead.

### Field Breath

The **Field Breath** is the live Stretch relation used during ordinary Center
playback. Tail remains behind Center, Lead remains ahead of Center, and both
move continuously between a configured inner offset and outer offset until Hold
is deliberately chosen:

```text
x → expand → y → contract → x → repeat
```

Expansion gives Tail the slower outward rate and Lead the faster one; contraction
exchanges them. A side that reaches its boundary first waits there at Center rate
until every operational side has arrived, so the Field breathes as one relation
rather than two independent sides. Hold preserves the attained relation and the
direction the cycle would resume in.

```text
ordinary playback              → Breath
idle traversal, Context, edit  → Frame
```

Direct manipulation may temporarily override either presentation, but it never
mutates their configured state.

## Direct manipulation

The Temporal Topography owns spatial direct manipulation, because it is the
surface that displays the actual global geometry. Current, Pins, Section Start,
End and midpoint nodes, and Range boundaries are all dragged there. Guide owns
exact topology, metadata and numeric editing instead of a second drag geometry.

```text
Current marker          → Go
Pin marker              → Move Pin
Section Start or End    → Move endpoint Pin
Section midpoint        → Translate Section
Range boundary          → Change Range
```

Fine adjustment is called **Nudge** unless the active media adapter supplies a
verified frame duration. It acts in source time and is invoked identically from
Timeline Shift-wheel, Shift-drag, the keyboard, and Guide increment controls.

## Canonical project documents

- `README.md` — orientation and vocabulary
- `SPEC.md` — normative state, geometry, and operator laws
- `IMPLEMENTATION.md` — module ownership and transaction architecture
- `INTERFACE.md` — visible grammar and direct manipulation
- `DEVELOPMENT.md` — contribution constraints and test map
- `VALIDATION.md` — automated and manual release gates
