# Binary YouTube Reader

A lightweight static web implementation of recursive binary traversal for YouTube videos.

The intended rhythm is:

1. Define an outer region.
2. Place an optional split point.
3. Choose a direction.
4. Jump, or play forward fast-to-normal.
5. Move up a recursion level when more context is needed.
6. Save a useful interval and label it.

## Run locally

The project must be served over HTTP or HTTPS so the YouTube embedded player receives a referrer.

```bash
cd youtube-binary-reader
python -m http.server 8080
```

Open:

```text
http://localhost:8080
```

No build step or API key is required.

## Deploy to GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. Every push to `main` checks the
JavaScript, runs the tests, and deploys this folder through GitHub Pages.

After pushing the repository to GitHub, open **Settings → Pages** and set **Source** to
**GitHub Actions**. The next push to `main`, or a manual run from the Actions tab, publishes
the site over HTTPS.

No YouTube API key, backend, secrets, or build output are required. Saved regions use browser
local storage, so they remain private to each browser and do not automatically synchronize
between devices.

## Implemented

- YouTube URL parsing for watch, youtu.be, Shorts, live, and embed links
- Native embedded YouTube player with normal controls
- Two draggable outer-scope handles
- Set scope start/end at the playhead
- Centre playhead in scope
- Current recursive interval and depth stack
- Temporary split point placed by clicking the custom timeline
- Earlier jump
- Later jump
- Forward fast-to-normal playback
- Up one level and direct ancestor-depth selection
- Scope looping
- Saved labelled intervals stored locally per YouTube video
- Clicking a saved interval loads it as the new scope and starts at its midpoint
- Keyboard shortcuts

## Keyboard

- Left Arrow: jump earlier
- Right Arrow: jump later
- Shift + Right Arrow: play forward to the later target
- Backspace: up one level
- Shift + Backspace: return to depth zero
- S: place split mode
- Space: play/pause
- Escape: clear split

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
