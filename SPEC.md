# Binary YouTube Reader — Interaction Contract

## 1. Product

The application makes a long video navigable like a written guide. Its small set of primitives
must combine naturally: Narrow Earlier or Later, Widen, choose a precise Point, Undo, Skim,
Play, Repeat, and save.

The interface must not require users to understand a separate focus model or visible recursion
machinery.

## 2. State

```text
videoId
duration
range = [A, B]
stack = [F0, F1, ..., Fn]
active frame Fn = [L, C, R, optional returnPoint]
optional selected Point P
optional lastPassage = [S, E]
optional repeat
optional skim
saved passages
```

`C` is the current place when playback is stopped. The stack is navigation history.

```text
0 <= A < B <= duration
A <= L <= C <= R <= B
```

## 3. Range and passage

The outer range `[A, B]` bounds the part of the video being studied. The active frame `[L, C, R]`
is the current passage at the current resolution.

- Editing the range starts a new root frame.
- Play may cross the active passage, but remains inside the outer range.
- Crossing a passage edge performs Widen at the current playhead, immediately returning to the
  outer Range.
- Loading a saved passage makes it the new outer range.

## 4. Destinations and Point

```text
earlierDestination = (L + C) / 2
laterDestination   = (C + R) / 2
```

A Point `P` may be selected anywhere in the outer range except on `C`.

```text
P < C -> earlierDestination = P
P > C -> laterDestination = P
```

Point is not a separate movement. A timeline tap is the composition:

```text
Timeline(P) = select Point(P) + Narrow Earlier/Later to P
```

Arriving consumes the selected Point into the child frame as `returnPoint`. Undoing that
movement restores `P` as the selected Point, so it can be approached again with Narrow Earlier,
Narrow Later, or Skim. If `P` is outside the active passage, movement deliberately extends
toward the corresponding outer-range boundary. A newly selected Point replaces an older one;
Escape clears it.

## 5. Resolution and history

There is no direction mode.

- **Narrow Earlier** jumps to the Earlier destination and pushes an Earlier child frame.
- **Narrow Later** jumps to the Later destination and pushes a Later child frame.
- **Widen** exits every recursion level, restores the full outer Range, keeps the current place,
  and recomputes Earlier and Later destinations around that place.
- **Skim** plays fast-to-normal to the Later destination, pushes the same child as Narrow Later,
  and then continues at `1×`.
- A timeline tap selects a Point and immediately performs Narrow Earlier or Narrow Later to it.
- **Undo** restores the parent passage and its prior current place.

Each movement records the span between its departure and arrival as `lastPassage`.
If the movement consumed a Point, Undo restores that Point independently of restoring the
parent place. Widen preserves any already-selected Point but does not reverse movement history.

Narrow Earlier and Narrow Later increase resolution in opposite directions. Widen is their
resolution inverse: it returns directly to the lowest resolution while retaining the current
place. Together these three operations form the core loop: Narrow toward information, Widen
fully for context, then Narrow back quickly. Undo is distinct history: it restores exactly one
previous passage and previous place rather than exiting the recursion. At the root, Widen
restores the outer-Range boundaries if playback previously narrowed the root passage.

## 6. Playback and repetition

- **Play/Pause** always plays at `1×`.
- Play continues across active-passage edges. Crossing an edge performs the same full Widen
  without interrupting playback.
- If Play pauses without crossing an edge, the played span refines the current passage.
- If Play crossed an edge, pausing keeps the full Range and refactors Earlier and Later
  destinations around the pause position.
- Because Widen exits all recursion levels, one edge crossing is enough to restore the full Range.
- Playback stops only at the outer-range boundary or when the user pauses.
- The played span becomes `lastPassage`.
- **Repeat** loops `lastPassage` at `1×`.
- Stopping repetition returns to `C` and does not add navigation history.

This lets one Repeat action reread whatever the user just jumped across, skimmed through, or
played normally.

## 7. Skim curve

For departure `D`, destination `Q`, and progress `u`:

```text
u = (currentTime - D) / (Q - D)
desiredRate(u) = maxRate ^ (1 - u)
```

Choose the greatest YouTube-supported rate that does not exceed the desired rate. On arrival,
restore `1×`, push the child frame, and keep playing. The eventual pause settles the full span
from the Skim departure through the `1×` continuation. Stopping Skim before its destination uses
the actual stopping position; stopping immediately retains the parent.

## 8. Timeline

- top blue circles: outer-range handles;
- upper gold flag: selected Point;
- white line: current playhead and track;
- lower green diamonds: active-passage edges;
- bottom grey dots: automatic Earlier and Later destinations.

When a Point replaces an automatic destination, the automatic marker on that side is hidden.
A single temporary preview band shows the passage affected by the focused or hovered Narrow
Earlier, Widen, Narrow Later, Undo, Skim, or Repeat control. Each permanent marker type has its
own vertical lane, and permanent handles and markers always remain visible.

## 9. Controls

Primary controls are grouped into two families:

- **Resolution:** Narrow Earlier, Widen, Narrow Later
- **Playback:** Skim, Play, Repeat

Undo is a secondary History action beneath Resolution. Point is selected directly on the
timeline, not through another mode or button. Every action shows its destination or affected
range as persistent secondary text. Undo shows the restored range, place, and resulting
destinations. Widen shows the full Range and identifies the place it keeps. Repeat shows
`lastPassage`, and Skim shows its destination and maximum-to-normal handoff. The timeline labels
any selected Point. Internal recursion depth is not exposed as a selector.

The lexicon is deliberately algebraic:

- Narrow Earlier/Later: move and increase resolution in opposite directions.
- Widen: return to the full Range around the current place without reversing the move.
- Undo: restore the previous state, including the Point consumed by that movement.
- Point: replace one automatic destination.
- Skim: approach Later quickly, then become Play.
- Play: move at `1×`, Widening as passage edges are crossed.
- Repeat: reread the last traversed or played span without changing resolution.

## 10. Saved passages

Save active passage `[L, R]` with:

```text
id
videoId
label
start
end
createdAt
```

Storage is local to each browser and separated by video ID.

## 11. Keyboard

- Q: Narrow Earlier
- W: Widen
- E: Narrow Later
- R: Undo
- Left Arrow: Narrow Earlier
- Right Arrow: Narrow Later
- Shift + Right Arrow: Skim
- Backspace: Undo
- Shift + Backspace: Widen
- Control/Command + Backspace: Undo to the root
- Space: Play/Pause at `1×`
- Escape: clear the selected Point

## 12. Acceptance criteria

- Narrow Earlier, Widen, and Narrow Later are presented as the three core Resolution controls.
- Narrow Earlier and Narrow Later are always directly available when their destinations exist.
- Play is always `1×`.
- Play continues past passage edges by performing Widen at the live playhead.
- Repeat replays the span of the immediately preceding movement or playback.
- Tapping anywhere in the outer range selects that Point and immediately Narrows Earlier or
  Later to it.
- Undoing a timeline Point move restores the Point, and Skim can then approach it.
- Every timeline marker type occupies a separate vertical lane.
- Narrow Later and the destination handoff of Skim produce the same child frame.
- Undo restores the parent passage and place.
- Widen exits every recursion level, restores the full Range, retains the current place, and
  recomputes both destinations.
- At `0:00–3:00`, Undoing `[1:30, 2:15, 3:00]` restores `C=1:30` with destinations
  `0:45/2:15`; Widening it keeps `C=2:15` with destinations `1:07.5/2:37.5`.
- Repeat displays its loop range before activation.
- No separate direction, focus, or playback-mode selection is required.

The project succeeds when these primitives feel like a small vocabulary rather than a control
panel full of unrelated features.
