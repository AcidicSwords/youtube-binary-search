# Video Cartography

**A spatial comprehension workspace for video.** See the phases. Map the whole.

Video Cartography keeps YouTube source time exact while making a video available in three complementary ways:

- the **Panoramic Phase Field** places nearby Tail, Center, and Lead phases side by side;
- the **Temporal Topography** projects the ordered source into a positively deformable Timeline;
- the **Guide** retains discovered Addresses as Pins and relations as Sections.

The application remains useful at every depth. You can use only the ordinary Center player, add keyboard navigation, open the Guide, or use the complete Field and weighted map. None of the advanced layers is required by another.

## Load and play

Paste a YouTube URL, Shorts/live/embed URL, `youtu.be` URL, or video ID and choose **Load**. A start time in the URL is honored.

Center is an ordinary YouTube player. Its seek bar, captions, settings, volume, and fullscreen controls remain pointer-accessible while paused or playing. The parent Play button and `Space` start or pause a `1×` Panorama. `Shift+Space` plays Center alone using the configured fixed rate or the optional dynamic rate policy.

Playback owns two independent facts:

- its observation policy is either **Panorama** or **Center only**;
- its rate policy is either a stored fixed wish or a dynamic request.

The YouTube adapter remains authoritative about the actual rate. A fixed Shift wish of `1×` is still Center only. If native controls move a Panorama playback away from `1×`, Tail and Lead suspend until the actual rate is compatible again. A focused proper Range wraps; the full-video Range stops at source end.

## Panoramic Phase Field

```text
Tail | Center | Lead
```

Center is audible. Tail and Lead are optional muted observations. Outside playback, the Field is a stable directional slideshow
around Current:

- Step shows the next backward and forward Step destinations;
- Refine and Reopen show their directional midpoint candidates;
- a selected or manipulated Section shows Start, its spatial midpoint, and End;
- a Pin or ordinary Go uses the Step neighborhood;
- direct manipulation temporarily previews the exact candidate relation.

When Context is enabled, its bounded source window owns the Frame: Tail and Lead remain at the window edges while Center observes within it. Context duration and Field offsets are independent settings.

During ordinary Panorama playback, the Field breathes continuously between inner
and outer offsets until Hold preserves the attained relation. The conservative shipped defaults are:

```text
Inner 0.25 s · Outer 2.5 s
Tail 0.75× | Center 1× | Lead 1.25×
```

These values favor one coherent local horizon; they are not a restriction. Wider offsets and stronger symmetric rate pairs remain available, and existing saved preferences are preserved. A collapsed, hidden, unavailable, or Range-clipped side does not participate in the breathing barrier. **Hold** freezes the attained offsets at Center rate; **Stretch** resumes from that relation.

## Temporal Topography

Source time is authoritative. Timeline Space is a derived, continuous coordinate:

```text
density at an Address = product of effective covering Section weights
Timeline Space         = integral of density
```

Every factor is positive, so source order is preserved and every Timeline coordinate has one source Address. Weight changes map distance, not source duration or identity.

The canonical Section Weight ladder is:

```text
0.125×  0.25×  0.5×  0.75×  1×  1.25×  1.5×  1.75×  2×  4×
```

Overlapping active Sections compose by multiplication. Violet atmosphere indicates compression below `1×`; teal indicates expansion above `1×`; projected source-time contours expose the exact spatial density. The atmosphere is perceptual, while the mapping and contours are metric.

All spatial consumers share one effective projection: drawing, contours, hit testing, drag conversion, Step, Refine, adaptive Reach, spatial readouts, and the optional dynamic playback policy.

`X` is the auxiliary **Toggle Deformation** action in Operators. With an acquired Timeline Section it temporarily bypasses only that Section; otherwise it bypasses the complete map. Press `X` again on the same scope to restore it. The bypass is source-scoped, transient, absent from Undo and persistence, and never changes the stored Weight. Fixed playback receives no command from `X`; dynamic Shift playback may retune on a later transport tick because that policy explicitly reads the effective map.

## Working Interval and operators

Range is the admissible source universe. Refine, Step, Go, playback, and direct manipulation exclude alternatives from the current relation. The **Working Interval** is the surviving positive, contiguous residue, stored as two source bounds with orientation and endpoint frames—not as a path log.

The visible and physical operator matrix is exactly:

```text
Q  Refine Backward    W  Reopen            E  Refine Forward
A  Step Backward      S  Switch Endpoint   D  Step Forward
R  Release            T  Tag               F  Focus / Unfocus
```

- `Q/E` choose directional spatial midpoints at finer Resolution while preserving the established residue when possible.
- `Shift+Q/E` perform Local Refine and retain only the immediate traversal.
- `A/D` or `←/→` Step through a configured Timeline distance. A repeated sequence is one transaction; a reversal that returns to its departure retains the positive visited envelope.
- `Shift+A/D` or `Shift+←/→` Step to the previous or next Pin or Range boundary.
- `W` restores Range-level Resolution without discarding Current or the Working Interval.
- `S` moves to the opposite endpoint and restores that endpoint’s saved viewpoint.
- `R` clears the Working Interval and the acquired Timeline operand. Current, Guide focus, retained topology, Weight, Focus, and deformation bypass remain.
- `T` tags Current as a Pin. `Shift+T` tags a positive Working Interval as a Section. Plain Tag remains a Pin action even while an Interval exists; an exact duplicate is selected rather than recreated.
- `F` focuses an acquired Section or the Working Interval as Range and viewport; the same action unfocuses to the containing Range.

The Matrix Shift button is a one-shot layer owned only by Matrix actions. Guide **Extend** is a separate one-shot layer owned only by Guide composition. Holding the physical Shift key modifies the current action without consuming either latch.

## Guide and direct manipulation

A Pin owns one source Address. A Section is an edge between two Pin identities and owns one Weight. Shared endpoint identity makes connected Sections move together; coincident but distinct Pins remain independent.

The Guide has Sections, Pins, and transient Cues:

- click a Timeline Pin to acquire it and move Current there;
- click a Timeline Section to make its extent the Working Interval and center Current spatially within it;
- use exact Address fields, Nudge controls, Weight, Group, rename, delete, Focus, and unlink controls in the Guide;
- drag Pins, Section end regions, or Section middles on the Timeline or from their Guide rows; both routes invoke the same operations and preview through the Field;
- unlink a shared endpoint to create an independent Pin at the same Address; drag it near another Pin and hold for the visible snap to arm before release to link;
- offer chapter text as Cues, then navigate, compose, or retain it explicitly. Cues do not enter the map or Guide on their own.

Every Section belongs to one ordinary Group. At most one Group is drawn on the Timeline, and drawing none is valid. Any number of Groups may be Active and contribute Weight even while hidden. Deleting a Group moves its Sections to the reported surviving Group; the last Group and a move that would create a duplicate Section are refused.

The Timeline is the spatial manipulation surface. Drag Current to perform one Step gesture; drag a Pin to update every Section that shares it; drag a Section’s end region to move that endpoint or its middle to translate the whole Section. There is no extra endpoint-node chrome. Bare Timeline ground clears the retained Timeline operand and performs ordinary Go.

Nudge is exact source-time adjustment. `Shift`+wheel uses the dominant wheel axis: up/right is forward and down/left is backward. High-resolution deltas accumulate into discrete quanta, and a wheel series or held repeat creates one Undo transaction. Over the Timeline, the object under the pointer owns the gesture; elsewhere, the acquired Timeline operand owns it, falling back to Current. Guide Address input accepts seconds or timecode and rejects a value outside the active Range or invalid topology instead of silently changing it.

## Shortcuts

| Keys | Action |
| --- | --- |
| `Space` | Play/pause `1×` Panorama |
| `Shift+Space` | Play/pause Center-only fixed or dynamic playback |
| `Q` / `E` | Refine backward / forward |
| `Shift+Q` / `Shift+E` | Local Refine backward / forward |
| `A` / `D`, `←` / `→` | Step backward / forward |
| `Shift+A` / `Shift+D`, `Shift+←` / `Shift+→` | Previous / next Pin |
| `W` / `S` | Reopen / Switch Endpoint |
| `R` / `T` / `Shift+T` / `F` | Release / Tag as Pin / Tag as Section / Focus |
| `X` | Toggle deformation for the acquired Section, otherwise the complete Timeline |
| `Z` / `C` | Undo / Redo |
| `[` / `]` | Decrease / increase Step Reach preset |
| `,` / `.` | Nudge backward / forward |
| `I` / `O` | Open Guide / Operators and Parameters |
| Hold `G` + wheel | Ghost Traversal: backward and forward through the order you encountered Addresses in |
| `Alt+Q/W/E/A/S/D` or `Alt` + an arrow Step | Carry the acquired retained object with Current |
| `Esc` | Cancel the active manipulation or close the transient surface |
| `?` | Shortcut help |

## Run locally

Use Node.js 20 or newer. Install the locked development dependencies:

```bash
npm ci
```

Serve the repository over HTTP, for example:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. The complete release gate is:

```bash
npm run verify
```

## Canonical documents

- `PROJECT.md` — stable conceptual model
- `GLOSSARY.md` — normative vocabulary
- `SPEC.md` — normative state and behavior laws
- `IMPLEMENTATION.md` — module and runtime ownership
- `INTERFACE.md` — visible and interaction grammar
- `DEVELOPMENT.md` — contribution constraints and automated suite map
- `VALIDATION.md` — executable and manual release criteria
