# Video Cartography
## Canonical Project Establishment

**Category:** A spatial comprehension workspace for video  
**Primary surfaces:** Panoramic Phase Field · Temporal Topography · Guide · Operator Matrix  
**Tagline:** See the phases. Map the whole.

Video Cartography turns a linear audiovisual source into a perceptually panoramic and spatially navigable environment without changing the source itself.

Ordinary video is globally present but locally actualized: the complete source exists, while only one source moment ordinarily occupies the audiovisual present. Video Cartography preserves chronological order and source continuity while creating three complementary forms of availability:

- the **Panoramic Phase Field** makes a bounded neighbourhood of source phases perceptually co-present;
- the **Temporal Topography** makes the complete ordered source available as one navigable, positively deformable map;
- the **Guide** makes discovered places and relations persist as Pins and Sections.

The **Operator Matrix** governs how the viewer discriminates, traverses, resolves, retains, and revisits that environment.

```text
linear temporal exclusivity
→ bounded perceptual and spatial availability
→ retained and deformable map
```

## The source and the environment

Source time is the only durable temporal truth. Playback, Range, Current, Cursor, Working Intervals, Pins, Sections, and Field addresses remain source Addresses.

Timeline Space is a derived coordinate. It may allocate more or less visible distance to fixed source material, but it never changes source order, duration, playback, or reachability. Every effective spatial density remains positive, so the map is continuous, strictly increasing, and ordinarily invertible.

The project therefore changes neither the video nor the truth of its sequence. It changes the environment through which that sequence can be perceived, traversed, structured, and understood.

## Panoramic Phase Field

The Panoramic Phase Field is the local perceptual surface formed by Tail, Center, and Lead.

```text
Tail | Center | Lead
```

Center is the audible and actualized source phase. Tail remains behind Center. Lead remains ahead. Their presentations are spatially co-present without making the represented source events simultaneous.

The Field has two regimes.

### Field Frame

Outside ordinary playback, the Field presents one stable three-frame interpretation of the current state.

When Context is enabled, Tail and Lead remain the bounded Context edges before, during, and after Context transport. Center is Current while idle and Cursor while Context is running. Context ending does not reassign the side panes.

When Context is disabled, the Field falls back to the active operator geometry: Step destinations, Refine midpoints, Reopen alternatives, or an exact retained extent.

Committed movement creates one brief directional transition from the preceding Frame to the resulting Frame. Semantic state commits immediately; the transition is presentation, not a second transition model. It is an opacity cue rather than motion, because three media surfaces cannot be reparented and translating them reads as a shake rather than as travel.

Direct Current, Pin, or Section manipulation temporarily supplies exact source frames for perceptual verification and then restores the ambient Frame.

### Field Breath

During ordinary playback, Stretch becomes a continuous bounded breath.

Each operational side moves between an inner offset `x` and outer offset `y`, where `0 < x < y`. Tail never becomes less than `x` behind Center; Lead never becomes less than `x` ahead. Outward rates are symmetric around Center's rate where the adapter supports them. At the outer boundary the rates exchange and the Field contracts. At the inner boundary the original rates return and expansion resumes.

If one side reaches a boundary first, it follows Center at Center's rate while preserving that exact offset until the other operational side arrives. Hidden, collapsed, unavailable, or Range-clipped sides are excluded from the synchronization barrier.

The minimum offset is a law rather than a preference. A side with less room than `x` cannot preserve it, so it does not breathe at all: it is excluded from the barrier and parked at whatever room remains. `x` is never silently reduced to fit.

Hold alone stops the breath and preserves the attained relation. Reaching a boundary never chooses Hold on the viewer's behalf.

## Temporal Topography

The Timeline is the Temporal Topography: the complete source projected into lateral Timeline Space.

- **Range** is admissible territory.
- **Resolution** is the active neighbourhood and discrimination grain.
- **Current** is committed semantic location.
- **Cursor** is transient physical observation.
- **Working Interval** is the active continuous crossing.
- **Pins** are retained source landmarks.
- **Sections** are retained relations between Pins.
- **Weight** controls how much map distance a Section contributes.

Section factors compose multiplicatively. Their signed logarithms compose visually as one continuous compression/expansion atmosphere, while projected source-time contours retain exact metric meaning.

Current, Pins, Section endpoints, whole Sections, and Range boundaries are manipulated spatially on the Temporal Topography. Section wires carry their own roles: pressing near an end acquires that endpoint Pin, pressing the middle translates the Section. Guide objects remain source topology rather than generic interface selections.

Dragging or nudging Current is a Step, not a Go. It extends or shortens the traversal already established rather than drawing a new Working Interval around wherever it lands. Drawing a new neighbourhood is what an exact Go is for.

Fine adjustment is **Nudge**. Shift-drag enters quantized precision mode. Shift-wheel and comma/period move the acquired object by one source-time quantum and batch a continuous sequence into one Undo checkpoint. The interface calls this a frame only when a media adapter can prove an exact frame duration.

## Guide

The Guide is the retained cartographic graph.

A Pin owns one source Address. A Section owns an edge between two Pin IDs. Coincident Pins may remain distinct; shared identity, not visual coincidence, determines whether connected Sections move together.

The Temporal Topography owns spatial dragging. The Guide owns exact addresses, titles, weights, topology, Focus, Unlink, Rename, and Delete. Address fields and increment controls invoke the same Session operations used by Timeline gestures.

## Operator Matrix

```text
Q  Refine Backward    W  Reopen            E  Refine Forward
A  Step Backward      S  Switch Endpoint   D  Step Forward
R  Release            T  Deform            F  Focus / Unfocus
```

The first row changes discrimination. The second changes traversal or viewpoint. The third determines the fate of the Working Interval:

```text
Release → return the relation to absence
Deform  → make the relation modify the world
Focus   → make the relation become the world
```

Every operator must produce the smallest state transformation sufficient for its goal and preserve every unrelated state dimension. An operator is defined equally by what it changes and what it cannot change.

## Codebase as executable theory

Module boundaries instantiate the conceptual distinctions:

- `session.js` owns canonical state, semantic transactions, and history;
- `range-geometry.js` owns pure Range, Resolution, and interval arithmetic;
- `timeline-projection.js` owns the positive source↔Timeline Space map;
- `guide.js` owns persistent Pin/Section topology and Weight;
- `transport.js` owns Context and playback runtime;
- `field-frame.js` owns pure Frame derivation, stable Frame identity, traversal
  direction, transition descriptors, and the revisioned Frame sequencer;
- `step-field-geometry.js` owns pure Field and breathing arithmetic;
- `step-field.js` owns physical side players, Frame placement, the transition
  lifecycle, the Breath runtime, boundary synchronization, and Hold;
- `app.js` composes owners, routes gestures, and establishes one transaction boundary;
- `view.js` projects state into the accessible interface;
- `youtube.js` is a media adapter, not the identity of the project.

Durable state stores source Addresses and canonical factors. It never stores Timeline positions, lanes, gradients, slideshow animation state, or physical iframe drift.

## Operational cycle

```text
load source
→ perceive a Field Frame
→ traverse or discriminate
→ establish a Working Interval
→ verify through the Field
→ retain Pins or Sections
→ Deform or Focus
→ re-enter the changed map
```

The map becomes more useful through use while the source remains unchanged.

## Natural extensions

Transcript cues are exact Addresses. Transcript selection is a Working Interval. Search results remain ephemeral until retained. Chapters import as boundary Pins and neutral Sections. Ordinary player conveniences such as Center playback rate, captions, volume, quality, fullscreen, and verified frame stepping remain media-runtime controls and cannot acquire the meanings of Field rate, Step Reach, Resolution, or Section Weight.

## Non-goals

Video Cartography is not a non-linear editor, automatic summarizer, uniform annotation timeline, transcript reader with a player attached, or claim that the retained map is objectively inherent in the source. It is an instrument for constructing and navigating a defensible representation while preserving the source as authority.

## Canonical documents

- `GLOSSARY.md` — the normative lexicon
- `README.md` — orientation and vocabulary
- `SPEC.md` — normative state, geometry, and operator laws
- `IMPLEMENTATION.md` — module ownership and transaction architecture
- `INTERFACE.md` — visible grammar and direct manipulation
- `DEVELOPMENT.md` — contribution constraints and test map
- `VALIDATION.md` — automated and manual release gates
