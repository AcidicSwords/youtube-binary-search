# Binary YouTube Reader — Field grammar v5.4 package

This package applies the coherent three-pane Field grammar without modifying `main`.

## Base

Create a clean branch from the verified Step Field branch:

```bash
git switch feature/step-field-v5.3-final
git switch -c feature/field-grammar-v5.4
```

The installer requires Binary YouTube Reader `5.3.0`.

## Install and test

From any directory:

```bash
python3 /path/to/install-field-grammar-v5.4.py --repo /path/to/youtube-binary-search
```

The installer:

1. verifies that it is operating on the correct v5.3 repository;
2. refuses a dirty Git worktree by default;
3. downloads the exact staged files from `feature/field-grammar-v5.4`;
4. verifies each file by Git blob SHA;
5. backs up every file the applicator may touch;
6. applies the v5.4 transformation;
7. runs syntax checks and the complete `npm run check`;
8. restores the pre-installation tree automatically if any step fails;
9. leaves the verified result uncommitted for review.

Then inspect and commit:

```bash
git diff
git status
git add -A
git commit -m "Integrate coherent Field grammar v5.4"
```

## Resulting grammar

```text
Center native controls → Continue / Pause
Current        → Context
Forward Target → Skim
Interval       → Loop / Retain
Field Span     → Loop / Retain
```

Field formation is physical:

```text
Coincident → Unfolding → Partially Held → Held
```

During Unfolding, a side pane is an actual visible Cursor and selects through `Go`.
When Held, the side Cursor equals its Step Target and selects through `Step`.
The Tail-to-Lead relation is `Field Span`, a transient actual Extent rather than a second
Current, movement Interval, or Return history.

## UI effect

The flat playback dock is removed. YouTube’s native Center controls remain the sole visible Continue/Pause authority. Context, Skim, and
Loop are attached to the objects they consume. The panes visually read as one restrained
stretch: they soften while unfolding, settle when held, and then slide together at `1×`.

## Important limits

A real-network browser smoke remains necessary for YouTube embed permissions, autoplay,
rate availability, buffering, keyframe placement, and three-iframe bandwidth. The Node
suite cannot reproduce those platform behaviours.
