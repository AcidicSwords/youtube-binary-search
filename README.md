# Binary YouTube Reader

A lightweight static web implementation of recursive binary traversal for YouTube videos.

The intended rhythm is:

1. Set a range.
2. Narrow Earlier or Narrow Later to increase resolution, or tap a precise Point.
3. Skim fast-to-normal and continue at `1×`, or Repeat the passage just traversed.
4. Undo to restore the prior state, or Widen fully to the Range without moving.
5. Save and label a useful passage.

## Run locally

The project must be served over HTTP or HTTPS so the YouTube embedded player receives a referrer.

```bash
python -m http.server 8080
```

Open:

```text
http://localhost:8080
```

No build step or API key is required.

## Deploy to GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. Every push to `main` or `master`
checks the JavaScript, runs the tests, and deploys the repository through GitHub Pages.

After pushing the repository to GitHub, open **Settings → Pages** and set **Source** to
**GitHub Actions**. The next push to the default branch, or a manual run from the Actions tab,
publishes the site over HTTPS.

No YouTube API key, backend, secrets, or build output are required. Saved passages use browser
local storage, so they remain private to each browser and do not automatically synchronize
between devices.

## Implemented

- YouTube URL parsing for watch, youtu.be, Shorts, live, and embed links
- Native embedded YouTube player with normal controls
- Two draggable study-range handles
- One-press Narrow Earlier and Narrow Later operations
- Widen as their inverse: return directly to the lowest resolution while retaining the current
  place
- Fast-to-normal Skim playback that continues at `1×` after its destination
- Normal-speed playback that automatically Widens at crossed passage boundaries
- One-button repetition of the last jump, skim, or played passage
- Timeline Point selection composed with an immediate Narrow Earlier or Narrow Later operation
- Undo of a Point move restores that Point so it can be reused by Earlier, Later, or Skim
- One-step Undo to the previous passage and place
- One-step Widen from any recursion depth to the full Range while keeping the current place
- Undo restores one prior level and its old playhead; Widen exits all levels around the live one
- Visible destinations and affected ranges on every primary control
- Timeline previews and separate non-overlapping marker lanes
- Saved labelled passages stored locally per YouTube video
- Clicking a saved passage loads it as the new range and starts at its midpoint
- Keyboard shortcuts

## Keyboard

- Q: Narrow Earlier
- W: Widen
- E: Narrow Later
- R: Undo
- Left Arrow: Narrow Earlier
- Right Arrow: Narrow Later
- Shift + Right Arrow: skim to the Later destination
- Backspace: undo to the previous passage and place
- Shift + Backspace: Widen fully to the Range while staying in place
- Control/Command + Backspace: undo to the root passage
- Space: play/pause at 1×
- Escape: clear the selected Point

## API-constrained behaviour

The YouTube IFrame API exposes a video's available playback rates. Skim
uses only those rates and chooses a descending staircase that approximates a logarithmic
fast-to-normal curve.

The IFrame API does not expose reverse playback, so earlier traversal is implemented as a
jump. This is deliberate rather than simulated.

The custom controls remain outside the embedded YouTube player.

## Files

- `index.html` — application shell
- `styles.css` — responsive control-panel UI
- `traversal.js` — pure interval and recursion logic
- `youtube.js` — YouTube URL and timestamp parsing
- `app.js` — YouTube API integration and interactions
- `SPEC.md` — implementation contract and acceptance criteria
- `tests.mjs` — dependency-free state-transition tests

## Test the recursion model

```bash
npm test
```

Run all syntax checks and tests with:

```bash
npm run check
```
