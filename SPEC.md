# Binary YouTube Reader — Interaction Contract

## 1. Product

The application makes a long video navigable like a written guide. Its small set of primitives
must combine naturally: bound the material, move backward or forward, skim, replay a passage,
split deliberately, undo, and save.

The interface must not require users to understand a separate focus model or visible recursion
machinery.

## 2. State

```text
videoId
duration
range = [A, B]
stack = [F0, F1, ..., Fn]
active frame Fn = [L, C, R]
optional split P
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
- Ordinary playback stays inside the active passage.
- Loading a saved passage makes it the new outer range.

## 4. Automatic points and split

```text
backPoint    = (L + C) / 2
forwardPoint = (C + R) / 2
```

A split `P` may be placed anywhere inside the outer range except on `C`.

```text
P < C -> backPoint = P
P > C -> forwardPoint = P
```

Using a split clears it. If a split is outside the active passage, the movement deliberately
escapes toward the corresponding outer-range boundary. Undo still restores the exact parent.

## 5. Movement

There is no direction mode.

- **Back** jumps to the back point and pushes an earlier child frame.
- **Forward** jumps to the forward point and pushes a later child frame.
- **Skim** plays fast-to-normal to the forward point and pushes the same child as Forward.
- A direct timeline click moves to that time and pushes an undoable child frame.
- **Undo Last Move** restores the exact parent frame.

Each movement records the span between its departure and arrival as `lastPassage`.

## 6. Playback and repetition

- **Play/Pause** always plays at `1×`.
- While playing, the passage bounds and automatic points remain still.
- When forward playback stops, its departure becomes `L` and its actual position becomes `C`.
  The next Back action therefore bisects exactly the passage just played.
- The played span becomes `lastPassage`.
- **Repeat Last Passage** loops `lastPassage` at `1×`.
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
pause exactly at `Q`, restore `1×`, and push the child frame. Stopping after meaningful progress
uses the actual stopping position; stopping immediately retains the parent.

## 8. Timeline

- blue handles and fill: outer range;
- green band and edge markers: active passage;
- white line: current playhead;
- lower grey markers: automatic back and forward points;
- upper gold flag: split.

When a split replaces an automatic point, the automatic marker on that side is hidden.

## 9. Saved passages

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

## 10. Keyboard

- Left Arrow: Back
- Right Arrow: Forward
- Shift + Right Arrow: Skim
- Backspace: Undo Last Move
- Shift + Backspace: restore level zero
- S: Place Split
- R: Repeat Last Passage
- Space: Play/Pause at `1×`
- Escape: clear split

## 11. Acceptance criteria

- Back and Forward are always directly available.
- Play is always `1×`.
- Playback does not move passage bounds or automatic points while it is running.
- Repeat replays the span of the immediately preceding movement or playback.
- A split can be placed anywhere inside the outer range.
- Split and automatic markers never overlap.
- Forward and a completed Skim produce the same child frame.
- Undo restores the exact parent.
- No separate direction, focus, or playback-mode selection is required.

The project succeeds when these primitives feel like a small vocabulary rather than a control
panel full of unrelated features.
