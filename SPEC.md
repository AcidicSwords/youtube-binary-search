# Binary YouTube Reader — Unified Marked Traversal Contract

## 1. Product

Binary YouTube Reader turns a transient video stream into a persistent, navigable temporal topology.

The system must remain lightweight and compositional. It has no editing mode and no separate navigation mode. Traversal creates structure, and structure becomes traversable.

The project succeeds when its controls feel like one small vocabulary rather than unrelated video-player features.

## 2. Primitive objects

### Address

An exact temporal position:

```text
0 <= t <= duration
```

Current, Point, Destination, Bound, Anchor, midpoint, and Mark are Address roles or forms.

### Mark

A persistent Address:

```text
{id, videoId, t, label, note, provenance, createdAt, updatedAt}
```

A Mark has no permanent role. It may become Point, Passage Start, Passage End, Range Start, Range End, Span Start, Span End, or Anchor.

### Span

An ordered relation between two Marks:

```text
startMark.t < endMark.t
```

Persistent schema:

```text
{id, videoId, startMarkId, endMarkId, anchorMarkId|null,
 label, summary, provenance, createdAt, updatedAt}
```

### Frame

The active Passage, Current, and Narrow depth:

```text
{L, C, R, level, optional returnPoint}
```

Invariant:

```text
Range.start <= L <= C <= R <= Range.end
level >= 0
```

### Context

A Range plus its Frame history, Point, Last Traversal, and structural selection.

Entered Spans create child Contexts. Exit restores the exact parent Context.

## 3. Lexicon

- **Current:** active Address `C`.
- **Point:** temporary exact Destination replacing automatic Earlier or Later.
- **Destination:** Address toward which an operation moves.
- **Bound:** Address used as an edge.
- **Midpoint:** arithmetic midpoint only.
- **Anchor:** preferred entry Address of a saved Span.
- **Passage:** active working Span `[L,R]`.
- **Range:** outer Span bounding the active Context `[A,B]`.
- **Level:** number of binary Narrows from the Context root.
- **Last Traversal:** actual last movement extent plus operator and medium.
- **Narrow:** move and increase Level.
- **Widen:** restore the active Range around Current and set Level to zero.
- **Step:** move by a fixed duration without intentionally increasing Level.
- **Target:** use an Address as Point without moving.
- **Go:** Target a Mark and Narrow toward it.
- **Enter:** use a Span as a child Context Range.
- **Exit:** restore the parent Context.
- **Focus:** use a Span as Passage without changing Range.
- **Undo:** restore the preceding navigation Frame.
- **Undo Edit:** restore the preceding structural mutation.

Avoid `scope`, `region`, `clip`, `bookmark`, `cursor`, and `focus mode` in product language.

## 4. State

```text
videoId
duration

range = {start, end, sourceSpanId|null}
stack = [Frame0, Frame1, ... FrameN]
contextStack = [ContextSnapshot...]
point = Address|null
lastTraversal = Traversal|null

structure = {marks[], spans[]}
selectedMarkId|null
selectedSpanId|null
draftStartMarkId|null
draftEndMarkId|null
structuralHistory[]

stepSeconds
skimSession|null
repeatSession|null
playbackStart|null
playWidened
```

`stack` is navigation history. `frame.level` is resolution depth. They are not interchangeable.

## 5. Resolution

### Narrow Earlier

```text
automatic = (L + C) / 2
Point < C => destination = Point
```

Push an Earlier child Frame at `level + 1`, record Last Traversal, and consume Point when used.

### Narrow Later

```text
automatic = (C + R) / 2
Point > C => destination = Point
```

Push a Later child Frame at `level + 1`, record Last Traversal, and consume Point when used.

### Widen

```text
[L,C,R,level] -> [Range.start,C,Range.end,0]
```

Widen is available only when Passage differs geometrically from Range. Widen pushes history, preserves Point, and is reversible by Undo. Widen never exits a Context.

## 6. Linear movement

Step size is a positive duration. Default: 10 seconds.

### Step Earlier

```text
C' = max(Range.start, C - stepSeconds)
```

### Step Later

```text
C' = min(Range.end, C + stepSeconds)
```

If `C'` remains inside Passage, preserve Passage bounds and Level. If it crosses a Passage edge, Widen at `C'`.

Rapid Steps inside 120 ms form one history transaction and one final YouTube seek.

Step records Last Traversal and does not snap to Marks.

## 7. Structural movement

### Previous Mark

Select the nearest Mark earlier than Current inside Range, instantiate it as Point, and Narrow Earlier.

### Next Mark

Select the nearest Mark later than Current inside Range, instantiate it as Point, and Narrow Later.

### Target

Assign a selected Mark as Point without moving. Valid only inside the active Range.

### Go

Inside Range, Go is Target plus Narrow. Outside Range, preserve the present Context, establish a containing Range, then Target and Narrow. Exit returns to the displaced Context.

## 8. Playback

### Skim

Approach the Later or Point Destination using supported fast-to-normal rates, create the same child as Narrow Later, then continue at 1×.

### Play

Play at 1×. Crossing a Passage edge Widens at live Current without interrupting playback. Pausing records Last Traversal.

### Repeat

Loop Last Traversal at 1×. The display identifies both the operator and medium: seek-based Traversals are shown as `jumped`; Skim and Play Traversals are shown as `played`.

### Loop Span

Loop a selected saved Span without replacing Last Traversal.

## 9. Marks and roles

Creating a Mark at a coincident Address reuses the existing Mark.

Available Mark roles:

```text
Go
Target
Passage Start
Passage End
Range Start
Range End
Span Start
Span End
Anchor
```

Internally these are typed role assignments. The interface retains specific verbs because their consequences differ.

Referenced Marks cannot be silently deleted. Removing a referenced Mark anonymizes it while preserving its Address.

## 10. Saved Spans

Immediate constructors:

```text
Save Passage
Save Last Traversal
Save Range
```

Each creates or reuses endpoint Marks.

Two selected Marks may also define a Span draft.

Available Span roles:

```text
Enter
Enter Here
Focus
Loop
Target Start
Target End
Target Anchor or Midpoint
```

Spans may overlap, nest, and share Marks.

## 11. Contexts and Range

Every Range mutation leaves a return path.

- Enter Span creates a child Context.
- Range Start Here and Range End Here create returnable Range contexts.
- Dragging a Range handle captures one parent snapshot at drag start and commits one child Context at drag end.
- Full Video may create a returnable full-video Context.
- Exit restores the exact parent Context.
- Widen remains inside the active Context.

## 12. History

Navigation history and structural history are separate.

Undo reverses Frame-producing navigation, including Narrow, Widen, Step, structural movement, Focus, and bound establishment.

Undo Edit reverses Mark and Span mutations.

Context nesting is reversed by Exit.

## 13. Interface placement

Main order:

```text
Player
Status
Temporal map and state
Traversal motion matrix
Playback
Return
Range tools disclosure
Help
```

The motion matrix is one aligned three-row grammar:

```text
Resolution  Narrow Earlier | Widen        | Narrow Later
Linear      Step Earlier   | Step size    | Step Later
Marks       Previous Mark  | Mark Current | Next Mark
```

Left always moves Earlier, right always moves Later, and the centre holds the row's own control. Playback remains separate because Skim, Play, and Repeat are not a directional axis.

Return pairs:

```text
Undo  restore navigation history
Exit  restore the parent Context
```

Range Start Here, Midpoint, Range End Here, and Full Video are setup controls and remain behind a disclosure below Return. Range itself remains continuously visible in the timeline and state readout.

Right-side Structure panel:

```text
Create Mark
Save as Span
Selected object roles
Temporary Span draft
Marks list
Spans list
```

The Passage readout appends `Level n`. Last Traversal appends `jumped` or `played`. Timeline Mark controls expose the same label through both `aria-label` and sighted hover `title`.

The timeline displays:

```text
Range — blue
Marks — violet
Point — gold
Current — white
Passage — green
Destinations — grey
```

The Structure panel supplies labels and survey. The timeline supplies metric orientation.

## 14. Keyboard

```text
Q / W / E       Narrow Earlier / Widen / Narrow Later
R / Backspace   Undo
Left / Right    Step Earlier / Step Later
[ / ]           decrease / increase Step size
, / .           Previous Mark / Next Mark
M               Mark Current
S               Skim
Space           Play/Pause
T               Repeat Last Traversal
Shift+Backspace Widen
Ctrl/Cmd+Backspace restore Context root
Alt/Option+Up   Exit Context
Escape          clear transient selection
```

## 15. Persistence

Version 2 key:

```text
binary-youtube-reader:v2:<videoId>
```

Version 1 saved passages migrate into shared endpoint Marks and saved Spans. Migration is idempotent and version 1 data is retained until version 2 persistence succeeds.

## 16. Implementation sequence

1. Add Frame Level and make Widen undoable.
2. Rename Last Passage to Last Traversal and add provenance.
3. Add exact Step geometry, controls, previews, keyboard, history, and coalesced seeking.
4. Add the Mark/Span model and versioned persistence migration.
5. Add Mark Current, Previous Mark, Next Mark, Target, and Go.
6. Add Span creation and selected-object role chips.
7. Add Enter, Exit, Focus, and returnable Range establishment.
8. Align Resolution, Linear, and Marks into one motion matrix; pair Undo and Exit as Return; demote Range setup to a disclosure.
9. Surface Level and Last Traversal medium, add sighted Mark hover labels, expand mutation tests, and update documentation.

## 17. Acceptance

The project is complete when:

- Widen can be undone exactly.
- Level is independent of history length.
- Step moves by exactly the configured duration and remains undoable.
- Previous and Next Mark traverse authored structure through Point and Narrow.
- Marks are reusable Addresses, not isolated bookmarks.
- Spans reference shared Marks and may overlap or nest.
- Saved structure can become Passage, Range, Point, or Loop.
- Every Range change leaves a return path.
- every primary operation previews its destination or affected Span.
- the interface remains useful before any Marks exist and becomes faster as structure is authored.
- no separate organization or traversal mode is required.
- Passage visibly reports Level, Last Traversal visibly reports medium, and timeline Marks are readable on hover.
- Span rename and deletion preserve their documented referential behaviour under test.
