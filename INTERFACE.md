# Video Cartography — Interface Grammar

The interface presents one source video as a Viewer, a Temporal Topography, and
one optional command rail. Every route resolves to canonical Session state;
surface-local selection and previews never become a second model.

## Workspace

The persistent reading surface is vertically ordered:

1. source loading and Guide/Operators rail controls;
2. the Tail–Center–Lead Panorama;
3. the Timeline;
4. the optional command rail.

On a wide desktop the Viewer and Timeline remain visible while the rail shows
either the full-height Guide or Operators followed by Parameters. The rail can
collapse completely, releasing its width to the panoramic surface. `I` opens or
closes Guide; `O` opens or closes Operators and Parameters. Switching the rail
changes presentation only.

On compact layouts Guide becomes a modal sheet with a scrim and focus trap. The
reader behind it is inert until Guide closes. Resizing does not reverse the
reader's deliberate open/closed choice.

## Panorama

Center is perceptually primary: it is slightly larger than Tail and Lead. The
two side panes are equally smaller, equally separated, and vertically centered,
so the three projections read as one curved temporal surface rather than three
unrelated players.

Each pane's top bar contains only identity, Address, and a local visibility
action. Center's bar also reports Panorama state. The sole bottom action is the
centered `Stretch both` / `Hold both` control. Remembered tuning lives in
Parameters, not around the video.

Center is the audible ordinary YouTube player. Tail and Lead are muted
projections. A non-blocking overlay contains one compact parent-owned Play
button; the overlay itself does not receive pointer events. Native seek,
captions, settings, volume, and fullscreen controls remain pointer-accessible
while paused, idle, or playing.

### Field Frame

When ordinary playback is not running, the panes form a stable directional
slideshow around Current:

- Step is the default: Tail and Lead show the exact weighted backward and
  forward Step destinations.
- Refine shows the next weighted backward and forward midpoints.
- Reopen shows the midpoints made available by the reopened Resolution.
- Context fixes Tail and Lead at its source-time window edges while Center
  observes inside it.
- a retained Section shows Start, weighted midpoint, and End while Current owns
  that midpoint.
- direct Pin manipulation centers the Pin between its weighted Step targets.
- direct Section manipulation shows Start, midpoint, and End.

Direct manipulation has first preview ownership, Context second, and the last
applicable operator third. Hover and keyboard focus preview operators on the
Timeline without seeking any player. Movement transitions use opacity, not pane
translation; reduced-motion users receive the same final frames without the
transition.

Tail and Lead act as Step controls only when their displayed Frame explicitly
offers a Step-to-Address activation or a live playback relation. Context,
Refine, Reopen, and direct-edit Frames remain informative; their side images do
not disguise another operator.

### Field Breath

During ordinary Panorama playback, Tail and Lead breathe between one Inner and
one Outer source-time offset around Center. The conservative shipped setting is:

```text
Inner 0.25 s · Outer 2.5 s
Tail 0.75× · Center 1× · Lead 1.25×
```

This is a high-coherence default, not a universal optimum. Wider offsets and
stronger provided rate pairs remain selectable, and existing saved values remain
unchanged.

`Hold both` preserves the attained relation and phase while Center continues.
`Stretch both` resumes from it. A side without enough Range room for the Inner
Offset becomes non-operational rather than crossing Center or silently shrinking
the configured minimum. Collapsed, hidden, or unavailable panes do not stall the
other side.

Plain Space owns Panorama playback at fixed `1×`. Shift+Space owns playback at
the configured fixed wish or the dynamic Weight texture. A fixed wish is
Center-only even when it is `1×`; the dynamic policy keeps its Panorama, because
the sides sit one rate rung either side of Center and hold that relation at any
Center the adapter's ladder can surround. Where it cannot — an end of the ladder,
or a ladder missing a neighbour — Center plays alone without ending the Playback
transaction.

## Temporal Topography

The Timeline is one weighted map with this visual order:

```text
free and shared Pins
main Range / Resolution / Working-Interval track
source ruler
bounded Section relationship tree
```

Equal source intervals are not necessarily equal Timeline distances. Exact
source-time contours reveal that difference: closer contours indicate
compression, wider contours expansion. A continuous violet/teal atmosphere is
centered on each effective Section, strengthens with signed Weight magnitude,
diffuses over broader extents, and fades past Section bounds. Neutral `1×`
contributes no atmosphere.

A Section's own colour is its identity, and identities may not collide: hues are
walked by the golden angle, so any number of Sections stay as far apart as they
can be and the sequence never revisits a hue. A Section's hue derives from its
identity alone, so it never changes because a neighbour was added, removed,
reordered or reweighted. Deformation is never drawn in that hue — the atmosphere
on the map and the tint on a Guide row both use the violet/teal pair, and their
direction carries the sign — so one channel is identity and the other is Weight,
and neither has to be read off the other.

The main layers remain distinct without relying on colour alone:

- Range is the admissible ground;
- Resolution is a quiet local contour;
- Active Span is the surviving directional relation;
- Current is the semantic Address and carries its own label;
- Cursor appears only when physical observation has left Current;
- Field span is the held Panorama relation;
- Pins and Section wires are retained topology;
- operator and direct-manipulation previews are transient.

One visual channel has one meaning. Object identity uses a marker, an acquired
Timeline operand uses background fill, Working-Interval participation uses a
separate inset edge, keyboard focus uses the focus ring, and Link candidate or
armed state uses an outline/glow. These channels compose instead of overwriting
one another.

### Timeline interaction

- Bare ground clears the acquired retained operand, then Goes to the addressed
  source position through the effective inverse map.
- A Pin click acquires that Pin and moves Current to its exact Address. Dragging
  past the threshold moves the Pin instead.
- A Section click acquires that Section, makes its complete extent the Working
  Interval, and returns Current to its weighted midpoint.
- A Section wire is its own control. Pressing its first or last quarter moves
  the corresponding endpoint Pin; pressing the middle translates the complete
  Section. The wire has no additional node controls.
- Current drag is Step, not Go. It preserves the traversal relation and commits
  only on release.
- Range handles edit Range only when Focus does not own those boundaries.
- Escape cancels the active drag to its origin before closing or stopping
  anything behind it.
- Holding `G` and scrolling is Ghost Traversal: the wheel moves backward and
  forward through the order the reader encountered Addresses in, rather than
  through source time. Holding the key alone does nothing at all.

### Ghost Traversal

Ghost is drawn with what is already there. The Address the reader began at
becomes the fixed Anchor and reuses the departure marker; the recalled Address
is ordinary Current; the relation between them is an ordinary Active Span
marked as recalled. The Anchor is solid because it is the thing being measured
against, while Current and the interval read as transient — a gesture still in
the hand.

The recalled path itself is never drawn. It exists operationally and becomes
perceptible by scrolling through it. Drawing every occurrence would confuse
source order with encounter order, and would turn an invisible recognition
operator into a history editor.

Scanning and landing are different events. The wheel motion used to find a
moment is search and leaves no trace; releasing records that the reader
re-entered that moment, once. So repeated recall accumulates the moments
returned to, never mirrored copies of the searching.

With automatic Context on, the recall is heard as well as seen: each candidate
plays, because a second of motion and sound is what actually places a moment
and a still frame is not. It is one window following the wheel, not a new one at
every notch, so the scan sweeps rather than stutters. What the scan played
through is still search — only the window still running when the gesture ended
counts as watched. With Context off, recall stays a silent frame-by-frame scan.

Section wires are greedily lane-packed. The visible relationship band is bounded
to five lanes; deeper overlap scrolls inside it, and no two Sections share a
control. Faint dotted relations connect each wire's start, midpoint, and end to
the corresponding upper position without introducing more controls.

Nearby Pins cluster before their hit regions overlap. Activating a cluster opens
a vertically ordered, wheel-scrollable menu. Each row follows the same rule as a
single Pin: click Goes to that exact Pin; drag moves that exact Pin. Arrow keys,
Home, End, and Escape operate the menu.

## Operators

The matrix is a physical square with nine equal cells in exact `QWE / ASD / RTF`
order:

| Key | Operator | Shift meaning |
|---|---|---|
| Q | Refine Backward | Local Refine Backward |
| W | Reopen | — |
| E | Refine Forward | Local Refine Forward |
| A | Step Backward | Previous Pin |
| S | Switch End | — |
| D | Step Forward | Next Pin |
| R | Release | — |
| T | Tag as Pin | Tag as Section |
| F | Focus / Unfocus | — |

The first row discriminates, the second traverses or changes viewpoint, and the
third resolves the current relation into absence, retained structure, or active
scope. Labels and dry-run previews follow physical or matrix-latched Shift, not
the incidental presence of a Active Span.

### Tag

`T` always means `Tag as Pin`: Current is the operand. `Shift+T` means `Tag as
Section`: a positive Active Span is the operand, and the action is disabled
without one. The shifted action creates a Section; before retention the source
relation is still called the Active Span. Duplicate tagging selects and
reports the exact existing Pin or Section.

### Release and Focus

Release clears the Active Span and the acquired Timeline operand. It
preserves Current, Resolution, Range, Focus, Guide focus, retained topology,
Weights, playback preferences, and deformation-bypass state. Clearing only a
presentation operand creates no history; clearing the semantic interval is
Undoable.

Focus makes an acquired Section or Active Span the active Range and drawn
world. Unfocus restores the containing Range. Focus never edits Weight or the
deformation-bypass scope. While focused, spatial boundary changes that cannot be
expressed honestly are refused; exact Guide edits remain available.

### Toggle Deformation

The compact `X` action lives below the square but inside Operators, before
history. It is not a tenth matrix cell and does not live in the Timeline header.
Its contextual label is `Straighten Section`, `Restore Section`, `Straighten
Timeline`, or `Restore Timeline`, with the exact scope shown beside it.

An acquired Timeline Section scopes the action to that Section. With no acquired
Section, it scopes the complete map. It changes geometry, contours, atmosphere,
Step, Refine, adaptive Reach, hit testing, and explicitly dynamic Playback
together, while the stored Weight display remains unchanged. It creates no
history entry and sends no direct player command.

## Guide

Guide focus is inspection and exact editing. Timeline acquisition is the
spatial operand for `X`, Nudge, Carry, and direct manipulation. A Guide click and
a Timeline click can establish the same Active Span, but only the latter
acquires the Timeline object. Clicking bare Timeline ground clears that
acquisition without closing the Guide row.

A plain Guide click replaces the Active Span with the clicked Pin, Section,
or Cue extent. Physical Shift or Guide's one-shot `Extend` latch grows the
existing interval to include it. The Guide and matrix latches are independent;
using one cannot consume the other.

### Sections

Each Section row shows title, source extent, duration, Weight, and membership
once. Selecting the row expands exact Start and End Address controls plus Focus,
Weight, and Group. Rename and Delete remain beside the title. Start and End
labels reveal their actual Pins in the Pins tab.

Groups are a flat Section partition. At most one Group is `On Timeline`, and no
Group drawn is valid. `Active` is independent: any number of Groups may
contribute Weight while hidden. Hiding the drawn Group removes its Sections and
endpoint Pins from Timeline but does not deactivate its deformation.

Every Group can be renamed. The last Group cannot be removed. Removing another
Group moves its Sections to the real heir named in the confirmation and result;
if that move would collide with an existing Section in the heir, removal is
refused. The default Group has no special deletion immunity.

### Pins

Pins are divided into `On Timeline` and `Hidden`, but every Pin remains
navigable and exactly editable in Guide. A Pin row shows title, Address, Section
reference count when nonzero, Rename, and Delete. A selected shared Pin offers
one `Unlink` action per referencing Section, naming the exact Section released.

Unlink gives one Section its own Pin at the same Address. To Link again, drag
that independent endpoint near a valid Pin. Amber is a candidate; remaining on
the same target arms a green relation; only release after arming merges identity.
Passing through or releasing early performs ordinary movement.

### Cues

Cues are chapter Addresses offered from pasted text, not retained structure.
They have no persistence, Weight, topology, or traversal identity. A Cue click
navigates or establishes its derived extent; Shift/Extend composes it like any
other extent. `Retain` creates an ordinary Pin or Section carrying the offered
title. `Show on timeline` adds inert marks only: they cannot be clicked, dragged,
or clustered.

### Exact Address controls

Guide Address inputs accept canonical timecode or seconds. Enter commits;
Escape restores the committed value. Malformed timecode, an Address outside
Range, or a move that would collapse/reverse structure is rejected rather than
silently changed. The adjacent minus/plus buttons repeat while held and settle
as one Nudge transaction. Spatial drag and exact input show the same Panorama
preview and reach the same canonical mutation.

## Parameters

Parameters contains remembered configuration, grouped by the question it
answers:

- Active Range and Range tools;
- Resolution state;
- manual Step distance or adaptive `1/32`, `1/16`, `1/8` of weighted Range;
- source-time Fine Nudge distance;
- source-time Automatic Context duration;
- fixed or effective-Weight-following Shift playback;
- Panorama Inner/Outer offsets and symmetric Breath rate.

Step distance is Timeline Space; at neutral Weight one unit equals one source
second. Nudge and Context are source time. Panorama offsets are physical
observation. Changing one setting does not rewrite another dimension.

## Keyboard and modifier reference

| Input | Consequence |
|---|---|
| Q / E | Refine Backward / Forward |
| Shift+Q / Shift+E | Local Refine Backward / Forward |
| A or Left / D or Right | Step Backward / Forward |
| Shift+A or Shift+Left / Shift+D or Shift+Right | Previous / Next Pin |
| W | Reopen |
| S | Switch End |
| R | Release |
| T / Shift+T | Tag as Pin / Tag as Section |
| X | Toggle deformation for acquired Section, otherwise complete Timeline |
| F | Focus / Unfocus |
| Space / Shift+Space | Panorama playback / Center-only Shift playback |
| Alt + compatible operator | Carry the acquired retained object |
| , / . | Nudge backward / forward |
| Shift+wheel | Nudge the object under pointer, otherwise acquired operand or Current |
| Shift+drag | Precision direct manipulation |
| [ / ] | Previous / next Step preset |
| Z / C | Undo / Redo |
| G / O | Guide / Operators and Parameters |
| ? | Keyboard reference |
| Escape | Cancel active gesture, then stop or close the topmost transient layer |

Space is captured only from reader background. A deliberately focused button,
menu item, slider, form control, compact Guide, or dialog retains its native
keyboard behavior. After Center state changes, iframe focus is released so
reader hotkeys work without another Timeline click.

## Accessibility and target integrity

Every form control has an accessible name and every button declares its type.
Operator keys are visible and exposed through `aria-keyshortcuts`. Contextual
disabled states state the missing operand. `aria-pressed` communicates Shift,
Field, Group, and deformation-bypass state.

Fine and coarse pointers share visual marks but use different hit geometry.
Coarse Pin and Section targets are at least 48 pixels. The visible Pin or Section
wire and its centered hit region are one control, so clicking what is drawn does
not fall through to bare Timeline Go. Responsive panels contain their own
overflow; the application does not grow vertically for dense Guide structure.
