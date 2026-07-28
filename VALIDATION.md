# Validation Matrix

## 1. Automated gate

Run:

```bash
npm run check
```

The gate covers syntax, pure geometry, Session/Return, Guide integrity, transport, source normalization, deterministic fuzz, stable-reader regressions, Step Field phases and bounds, directional Reach, response policy, DOM/accessibility contracts, documentation consistency, startup, interaction, Context, and metadata paths.

A passing gate is necessary but not sufficient for release.

## 2. Desktop browser matrix

Use at least two ordinary videos with different durations and reported playback-rate sets.

### Interface composition

- Confirm Tail, Center, and Lead form one panoramic row at wide desktop widths.
- Confirm playback controls sit directly under the panes and share one visual grammar.
- Confirm the temporal map spans the media width and has no stretched empty panel area.
- Confirm Parameters, the centered operator matrix, and Guide occupy left, center, and right respectively.
- Confirm the matrix order is `W`; `A/D`; `←/S/→`; `Shift+←/P/Shift+→`.
- Confirm Step Reach and all other entered values are absent from the matrix.
- Confirm there is no duplicate retained-Pins button and no inert Section state button.
- Confirm Range and Resolution are presented as parameter/state information rather than playback commands.
- Confirm Loop matches Continue, Context, and Skim as a playback/observation action.
- Confirm each visible element has a specific capability or irreducible state described in `INTERFACE.md`.

### Load and stable reader

- Load by full URL, short URL, and raw video ID.
- Confirm Current, Range, Resolution, and Cursor labels.
- Disable Step Field and exercise Refine, Reopen, Step, Return, Context, Continue, Skim, Loop, Pin, Section, Focus, and Leave Focus.
- Reload and replace the video; confirm preferences persist and Guide remains video-specific.

### Step Field

- Confirm Tail, Center, and Lead initialize coincident.
- Use Application Continue and verify all available panes start from one gesture.
- Change Tail and Lead rates while unfolding; geometry must not reset.
- Exercise linked and independent Reach.
- Hide and restore each side.
- Reach Range Start, Range End, and both-constrained cases.
- Select a forming side and a Held side; verify Go versus Step semantics.
- Confirm Tail and Lead remain muted.

### Native Center controls

- Play, pause, and scrub through native controls.
- Confirm semantic Current follows settled native placement.
- Confirm side activation is reported honestly when autoplay blocks it.
- Enter and leave fullscreen.

### Failure states

- Use a video that reports only `1×` if available; directional controls should show unavailable rather than inventing rates.
- Observe buffering and delayed placement.
- Hide the document and return.
- Disconnect/reconnect network if practical and confirm state remains recoverable.

## 3. Mobile device matrix

Use a real coarse-pointer phone browser, not only responsive emulation.

- Confirm Center, Tail, and Lead stack vertically without horizontal overflow.
- Confirm each side player remains at least `200 × 200` CSS pixels.
- Confirm Tail and Lead selectors are visible in their pane headers and open the native picker.
- Confirm every visible button, summary, selector, Guide action, and close control has a practical touch target.
- Confirm the sticky load bar does not obscure focused controls.
- Open/close Guide, edit retained items, and verify safe-area padding.
- Drag Range handles while the page remains vertically scrollable.
- Rotate portrait/landscape and repeat Continue, rate selection, hide/restore, and fullscreen.

## 4. Record results

For each manual pass record:

```text
browser + version
device / viewport
video IDs tested
rates reported per player
scenarios passed
blocked or unavailable states observed
failures with reproduction steps
```

Only observed failures should create new implementation work. Pure visual preference changes remain UI/UX work and must not silently alter semantic contracts.
