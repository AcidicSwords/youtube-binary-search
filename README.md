# Binary YouTube Reader

A lightweight static web implementation of recursive binary traversal for YouTube videos.

The intended rhythm is:

1. Set a range.
2. Move earlier or later with one action.
3. Skim forward fast-to-normal, or repeat the passage just traversed.
4. Undo the last move when more context is needed.
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
- Direct one-press earlier and later movement
- Forward fast-to-normal skimming
- Normal-speed playback that advances the current place when paused
- One-button repetition of the last jump, skim, or played passage
- Split placement anywhere inside the range
- Undoable moves and direct history-level selection
- Saved labelled passages stored locally per YouTube video
- Clicking a saved passage loads it as the new range and starts at its midpoint
- Keyboard shortcuts

## Keyboard

- Left Arrow: go earlier
- Right Arrow: go later
- Shift + Right Arrow: skim to the later point
- Backspace: undo the last move
- Shift + Backspace: return to level zero
- S: place split mode
- Space: play/pause at 1×
- R: repeat the last passage
- Escape: clear the split

## API-constrained behaviour

The YouTube IFrame API exposes a video's available playback rates. The forward traversal
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
