# Binary YouTube Reader — Guide v3 Canonical Specification

## 1. Purpose

The application converts a transient video stream into an addressable, repeatable, and lightly organized temporal workspace.

The design requirement is compositional closure: a small set of operators act on shared temporal attributes, and useful compound manoeuvres emerge from their sequence rather than from dedicated feature buttons.

## 2. Primitive

An **Address** is a finite timestamp:

```text
Address = t, 0 ≤ t ≤ Duration
```

Address is internal vocabulary. The interface presents Address roles such as Current and Mark.

## 3. User-facing state

### 3.1 Current

The active Address.

### 3.2 Range

The one active bounded workspace:

```text
Range = [A, B], A < B
```

Range constrains direct timeline traversal, Step, Narrow, Skim, and playback. Normal Play loops Range.

### 3.3 Resolution

The current binary refinement inside Range. Internally:

```text
Frame = {L, C, R, level}
A ≤ L ≤ C ≤ R ≤ B
```

The interface calls `[L,R]` Resolution, not Passage.

### 3.4 Traversal

An ordered movement event:

```text
Traversal = {
  departure,
  arrival,
  start = min(departure, arrival),
  end = max(departure, arrival),
  operator,
  medium
}
```

### 3.5 Repeat Window

The extent of the latest Traversal:

```text
Repeat Window = [Traversal.start, Traversal.end]
```

Repeat loops this interval.

### 3.6 Mark

A persistent saved Address:

```text
Mark = {id, t, label, provenance, createdAt, updatedAt}
```

Clicking a Mark traverses to `Mark.t`.

### 3.7 Section

A persistent named relation between two Marks:

```text
Section = {
  id,
  startMarkId,
  endMarkId,
  label,
  createdAt,
  updatedAt
}
```

Section geometry is derived through linked Marks:

```text
start(Section) = startMark.t
end(Section)   = endMark.t
mid(Section)   = (start + end) / 2
```

A Mark may be referenced by any number of Sections.

Clicking a Section traverses to its midpoint. Clicking either endpoint control traverses to that Mark.

### 3.8 Focused Section

A Section is Focused when its bounds supply Range.

Only one Section can be Focused. The Range preceding the first Focus is retained for Unfocus. Switching directly between Focused Sections retains that original return Range.

## 4. Movement operators

All movement operators commit the same state relation:

```text
resolve destination
→ Current := destination
→ update Resolution according to movement geometry
→ Repeat Window := departure–arrival
→ record one Undo snapshot
```

### 4.1 Timeline Click

A click inside Range supplies an exact destination and performs direct refinement through the same binary descent used by Narrow.

A click outside Range is rejected.

### 4.2 Narrow Earlier / Narrow Later

Automatic logarithmic destinations:

```text
Earlier = (L + C) / 2
Later   = (C + R) / 2
```

Narrow increments Level and replaces one side of Resolution.

### 4.3 Step Earlier / Step Later

Fixed linear movement:

```text
Destination = clamp(C ± stepSeconds, Range)
```

If Destination remains inside Resolution, Resolution is translated only through Current. If it leaves Resolution, Resolution resets to Range at Destination.

Rapid Steps coalesce into one Traversal and one Undo entry.

### 4.4 Previous Mark / Next Mark

Move to the closest visible Mark earlier or later inside Range.

Visible Marks are explicit Marks or Marks with nonempty labels. Anonymous Section endpoints are not global navigation landmarks.

### 4.5 Mark click

Move directly to the Mark Address. If the Mark lies outside a Focused Section, Focus is removed and the preceding Range is restored within the same undoable action. If the Address remains outside a manually restricted Range, Range expands to Full Video for that action.

### 4.6 Section click

Move directly to the Section midpoint under the same availability rules as Mark click.

## 5. Nonmovement operators

### 5.1 Widen

```text
{L,C,R,level} → {Range.start,C,Range.end,0}
```

Widen does not move Current, alter Range, or replace Repeat Window. It records one Undo entry.

### 5.2 Focus

```text
Section bounds → Range
```

Focus:

1. stores the preceding Range if no Section is currently Focused;
2. applies Section Start and End as Range;
3. retains Current if it lies inside the Section;
4. otherwise moves Current to the Section midpoint and records that movement as the latest Traversal;
5. resets Resolution to the new Range;
6. records one Undo entry.

### 5.3 Unfocus

Unfocus restores the Range retained before Focus, retains or clamps Current, resets Resolution to restored Range, preserves Repeat Window, and records one Undo entry.

### 5.4 Manual Range deformation

Dragging a Range handle or using Start Here, End Here, or Full Video:

- clears Focus;
- applies the new Range;
- resets Resolution;
- preserves Repeat Window;
- records one Undo entry.

Go to Midpoint is movement, not Range deformation, and therefore replaces Repeat Window.

## 6. Playback

### 6.1 Play Range

Play begins at Current at `1×`.

At Range End, playback seeks to Range Start and continues. Range is therefore the normal playback loop.

If Play pauses before wrapping, its departure-to-arrival extent becomes Repeat Window. If Play wraps Range at least once, the previous Repeat Window is retained because the cyclic route cannot be represented by one ordinary interval.

Crossing a Resolution boundary during Play Widens Resolution to Range without interrupting playback.

### 6.2 Repeat

Repeat loops Repeat Window at `1×`. Stopping Repeat returns playback to Current. Repeat does not alter Range, Resolution, Guide, or history.

### 6.3 Skim

Skim moves toward the Later destination through supported playback rates from selected maximum toward `1×`. Actual movement becomes Repeat Window. Reaching the destination continues as normal Play.

## 7. Persistence operators

### 7.1 Add Mark

The only Mark constructor is:

```text
Current → Mark
```

The title is optional. Adding at an existing Section endpoint promotes that endpoint into an explicit global Mark instead of creating a duplicate.

### 7.2 Save Section

The only primary Section constructor is:

```text
Repeat Window → Section
```

The operation creates or reuses Marks at Repeat Window Start and End, links them, and requires a Section title.

The operation does not modify Repeat Window, Range, Resolution, or Current.

### 7.3 Rename and delete

Marks and Sections can be renamed.

A referenced Mark cannot be deleted. Its Sections must be removed first.

Deleting a Section removes orphan unnamed automatic endpoint Marks but retains explicit or named Marks.

## 8. Undo

Undo uses one history across:

- timeline clicks;
- Narrow;
- Step;
- Mark and Section navigation;
- Widen;
- Focus and Unfocus;
- Range deformation;
- Mark and Section creation;
- rename and deletion;
- completed Play and Skim movement.

Each history entry restores:

```text
Range
Resolution Frame
Focused Section and return Range
Repeat Window
Guide data
```

Repeat playback itself is transient and does not create history.

## 9. Guide projection

The sidebar contains only:

1. Mark Current composer;
2. Save Repeat Window as Section composer;
3. Focused Section state with Unfocus;
4. chronological Sections list;
5. collapsed Marks list.

No persistent object selection, role chips, endpoint draft, Anchor, Enter, Exit, or separate structural Undo appears.

## 10. Visual density

### 10.1 Timeline Marks

Only explicit or named Marks are globally projected.

Marks are clustered by rendered pixel distance. A cluster displays a count; activating it opens a compact list of its Marks.

### 10.2 Sections

All Section intervals are never drawn simultaneously.

A temporary Section preview is shown only while its Guide row is hovered or focused. A Focused Section is already represented by Range.

### 10.3 Repeat Window

Repeat Window remains persistently visible because it is immediately actionable through Repeat and Save Section.

## 11. Storage and migration

Version 3 storage:

```text
binary-youtube-reader:v3:<videoId>
```

Load order:

1. valid v3 Guide;
2. migrate v2 `{marks, spans}` to `{marks, sections}`;
3. migrate v1 saved regions.

Earlier keys are not deleted.

## 12. Acceptance conditions

- A timeline click immediately moves and creates Repeat Window.
- Two successive clicks make the second movement the Repeat Window.
- Narrow and Step create Repeat Window through their respective geometries.
- Widen preserves Current and Repeat Window.
- Play loops Range.
- Repeat loops Repeat Window.
- Add Mark saves only Current.
- Save Section uses only Repeat Window.
- Clicking a Mark moves to it.
- Clicking a Section moves to its midpoint.
- Clicking a Section endpoint moves to its bound and makes the traversed half repeatable.
- Focus applies Section bounds as Range.
- Unfocus restores the preceding Range.
- Undo reverses the last committed operator regardless of whether it was navigation, Range, Focus, or Guide mutation.
- Automatic unnamed Section endpoints do not clutter the global Mark lane.
- Dense visible Marks cluster without overlap.
- Existing v2 data migrates without deleting the v2 key.
