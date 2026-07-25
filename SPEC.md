# Binary YouTube Reader — Implementation Contract

## 1. Product

The application accepts a YouTube URL and adds a lightweight control panel for traversing
the video as one traverses a written guide: bound a passage, move approximately, narrow,
reverse, back out, and retain useful passages.

The application must not analyze or restructure the content. Its value comes from temporal
navigation alone.

## 2. Minimal state

```text
videoId
duration
scope = [A, B]
stack = [F0, F1, ..., Fn]
frame Fn = [L, C, R]
optional split P
direction = earlier | later
saved regions
```

Invariants:

```text
0 <= A < B <= duration
A <= L <= C <= R <= B
```

## 3. Outer scope

The outer scope `[A, B]` is placed with two timeline handles or by setting either endpoint
at the playhead.

- Video outside the scope is excluded from app traversal.
- Ordinary playback loops from `B` to `A`.
- Editing the scope clears recursive depth.
- The full-video command restores `[0, duration]`.

## 4. Recursive interval

The active frame is `[L, C, R]`.

Without a custom split:

```text
earlierTarget = (L + C) / 2
laterTarget   = (C + R) / 2
```

A temporary split `P` replaces the target on its own side:

```text
P < C -> earlierTarget = P
P > C -> laterTarget   = P
```

Placing a split does not move the player or alter the bounds. Placing another split replaces it.
Using any traversal clears it.

## 5. Descending

Earlier:

```text
[L, C, R] -> [L, earlierTarget, C]
```

Later:

```text
[L, C, R] -> [C, laterTarget, R]
```

Each descent pushes one frame. There is no Down command because traversal itself descends.

## 6. Actions

### Earlier

Supported action:

- Jump Earlier

Backward playback is not simulated.

### Later

Supported actions:

- Jump Later
- Play Forward

Jump and Play Forward must commit the same child frame when they use the same target.

## 7. Forward playback curve

Let:

```text
D = departure
Q = target
u = (currentTime - D) / (Q - D)
```

The desired logarithmic curve is:

```text
desiredRate(u) = maxRate ^ (1 - u)
```

The YouTube player accepts only rates reported by `getAvailablePlaybackRates()`.
At each update, choose the greatest supported rate not exceeding `desiredRate`.

The resulting curve is a descending staircase through actual YouTube playback rates and reaches
`1x` at the target.

On arrival:

- pause;
- seek exactly to the target;
- set playback rate to `1x`;
- push the child frame.

If the user stops early, use the actual stopping position as the child current position.

## 8. Depth

- Up removes one child frame and restores the exact parent.
- The depth selector may restore any ancestor.
- Restoring an ancestor discards deeper frames.
- There is no redo or Down operation.

## 9. Saved regions

Save the current active recursive interval `[L, R]`, not only the outer scope.

A saved region contains:

```text
id
videoId
label
start
end
createdAt
```

Storage is local to the browser and separated by YouTube video ID.

Clicking a saved region:

1. sets the outer scope to `[start, end]`;
2. clears recursive depth;
3. places the playhead at `(start + end) / 2`;
4. establishes root frame `[start, midpoint, end]`;
5. pauses playback.

Deletion requires one visible delete control. Renaming after save is not required in v1.

## 10. Interface

The interface is a control panel outside the YouTube player.

Primary controls:

- Load URL
- Scope start handle
- Scope end handle
- Start at playhead
- End at playhead
- Centre
- Full video
- Place split
- Clear split
- Earlier / Later direction
- Jump
- Play Forward
- Play/Pause
- Up one level
- Ancestor depth selector
- Maximum forward speed
- Region label
- Save interval
- Saved-region list

The saved-region list is beside the player on wide screens and below it on narrow screens.

## 11. User rhythm

```text
BOUND -> SPLIT -> TRAVERSE -> UP OR SAVE
```

A successful interface should make that rhythm apparent without requiring the user to understand
the underlying equations.

## 12. Acceptance tests

Given frame `[0, 60, 180]`:

- Earlier target is `30`.
- Later target is `120`.
- Jump Earlier produces `[0, 30, 60]`.
- Jump Later produces `[60, 120, 180]`.

Given frame `[90, 150, 180]` and split `120`:

- Earlier target is `120`.
- Jump Earlier produces `[90, 120, 150]`.
- New targets are `105` and `135`.

Given stack:

```text
[0, 60, 180]
[60, 120, 180]
[120, 150, 180]
```

Up restores `[60, 120, 180]`.

Saving active frame `[120, 150, 180]` stores region `[120, 180]`.
Loading it produces root frame `[120, 150, 180]`.

## 13. Explicit exclusions

Do not add:

- transcripts
- annotations
- content analysis
- generated chapters
- visible recursion trees
- multiple active players
- reverse seek-stepping animation
- virtual speeds above rates exposed by YouTube
- accounts or backend storage
- collaborative features
- AI features

The project is complete when the traversal rhythm is fast, predictable, and comfortable.
