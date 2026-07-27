# Branch installation

This directory is a complete v5.1 audited drop-in replacement for the supplied v4.1 package.

## Install

From the repository root:

```bash
git switch -c feature/spatial-reader-v5.1
```

Copy the package contents over the project, then remove obsolete modules if they remain:

```bash
rm -f structure.js traversal.js
```

Confirm the canonical modules exist:

```bash
ls range-geometry.js guide.js session.js transport.js youtube.js source-field.js view.js app.js
```

Run the full suite:

```bash
npm run check
```

## Manual desktop smoke

Serve over HTTP or HTTPS:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a desktop browser and verify:

1. At approximately 1440×900, Video, Navigation, and Guide are all visible without scrolling to reach primary operators.
2. Observation controls remain directly below the video.
3. Backward actions align left, shared actions occupy the centre spine, and Forward actions align right.
4. `W/A/S/D` perform Reopen, Refine Backward, Return, and Refine Forward.
5. Arrow keys repeat Step smoothly; Shift+Arrow moves one Pin per distinct press.
6. `P` pins Current immediately; the Pin appears on the timeline and in Guide.
7. Establish an Interval, activate its state chip, and save a titled Section inline.
8. Focus and Leave a Section; confirm Range changes and restores correctly.
9. Continue wraps the active Range; Loop wraps the current Interval.
10. Skim approaches the Forward refinement destination and continues at normal speed.
11. Context samples around each direct movement and restores Current.
12. Rapid Refine, Step, Pin, and timeline actions interrupt Context without a visible return to the old anchor.
13. Return restores the preceding complete semantic state and Context adds no extra Return entry.
14. Reload and confirm Guide plus Context/Step preferences persist.

## Manual mobile smoke

At a phone-sized viewport:

1. Rapidly press Refine, Return, Step, and Pin controls; confirm the page does not double-tap zoom.
2. Begin a vertical scroll gesture over the timeline; confirm the page scrolls.
3. Drag only a Range handle; confirm Range changes without scrolling.
4. Open Guide from the header and from Pins; confirm it appears as an off-canvas sheet on the correct tab.
5. Close Guide and confirm the prior reader scroll position is retained.
6. Confirm all primary controls have usable touch targets and no horizontal overflow.

## Commit

```bash
git add -A
git commit -m "Audit spatial reader interaction and edge-case integrity"
git push -u origin feature/spatial-reader-v5.1
```

## Persistence and rollback

New Guide records use:

```text
binary-youtube-reader:v5:<videoId>
```

The application reads prior v4–v1 keys without deleting them. Preferences remain under:

```text
binary-youtube-reader:preferences:v1
```

A Git rollback restores the previous application while leaving saved records intact.


## Additional v5.1 edge smoke

1. Refine, then click exactly on Current; Resolution should return to Range-level without creating a new Interval.
2. Press Step Forward then Step Backward rapidly; Current and Return provenance should remain unchanged after settlement.
3. Drag a Range handle away and back before release; Range, Current, Focus, and Return provenance should be identical to the origin.
4. Scrub with YouTube’s native controls while paused; Current should follow after settlement and remain inside Range.
5. Start Loop immediately after several direct placements; delayed internal PAUSED events must not stop it.
6. Open compact Guide and press `?`, `D`, or arrows; no reader command or background Help surface should activate.
7. Rename a Pin or Section by keyboard; focus should return to its recreated Rename action. Delete one; focus should return to the relevant Guide tab.
8. Simulate blocked local storage; the status must report that the change is only retained for the current page.
9. Load a video whose duration is initially unavailable; the reader should retry metadata rather than construct a zero-length Range.
