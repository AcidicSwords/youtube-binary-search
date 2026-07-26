# Binary YouTube Reader

A lightweight static web application for treating long YouTube videos as addressable temporal spaces.

The reader combines four movement geometries:

- **Resolution:** Narrow Earlier, Widen, Narrow Later.
- **Linear:** Step Earlier or Later by an exact number of seconds.
- **Structural:** Previous Mark, Mark Current, Next Mark, and Go to a selected Mark.
- **Continuous:** Skim, Play, Repeat Last Traversal, and Loop a saved Span.

The three directional families share one visible and keyboard rhythm:

```text
Narrow Earlier | Widen        | Narrow Later
Step Earlier   | Step size    | Step Later
Previous Mark  | Mark Current | Next Mark
```

Earlier is always left, Later is always right, and the centre holds that row's own control.

Traversal and organization use the same temporal objects:

- An **Address** is an exact position in the video.
- A **Mark** is an Address given persistent identity.
- A **Span** is an ordered relation between two Marks.
- A **Passage** is the active working Span.
- A **Range** bounds the active Context.

## Intended rhythm

1. Load or establish a Range.
2. Narrow logarithmically, Step linearly, or choose a precise Point.
3. Skim, Play, or Repeat the resulting traversal.
4. Mark meaningful Addresses.
5. Move through Marks with Previous Mark and Next Mark.
6. Relate Marks into saved Spans.
7. Enter or Focus a Span and continue traversing within it.
8. Return through Widen, Undo, or Exit according to whether the displaced relation is resolution, navigation history, or Context.

## Run locally

The project must be served over HTTP or HTTPS so the YouTube embedded player receives a referrer.

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

No build step, dependency installation, API key, backend, or secret is required.

## Persistence

Marks and Spans are stored locally per YouTube video in browser `localStorage`.

Version 2 automatically migrates version 1 saved passages into:

- shared endpoint Marks;
- saved Spans referencing those Marks.

The data remains private to the current browser and does not synchronize between devices.

## Keyboard

### Resolution

- `Q`: Narrow Earlier
- `W`: Widen
- `E`: Narrow Later
- `R` or `Backspace`: Undo
- `Shift + Backspace`: Widen
- `Control/Command + Backspace`: restore the active Context root

### Linear

- `Left Arrow`: Step Earlier
- `Right Arrow`: Step Later
- `[`: decrease Step size
- `]`: increase Step size

### Marks

- `,`: Previous Mark
- `.`: Next Mark
- `M`: Mark Current

### Playback

- `S`: Skim
- `Space`: Play/Pause
- `T`: Repeat Last Traversal

### Context and selection

- `Alt/Option + Up`: Exit Context
- `Escape`: clear Point, Span draft, or structural selection

## Files

- `index.html` — application shell and control placement
- `styles.css` — responsive temporal map and Structure panel
- `traversal.js` — pure Frame, destination, Widen, Step, and playback geometry
- `structure.js` — pure Mark and Span model, relations, and migration
- `youtube.js` — YouTube URL and timestamp parsing
- `app.js` — YouTube API integration, state transitions, persistence, and UI orchestration
- `SPEC.md` — canonical interaction and implementation contract
- `tests.mjs` — dependency-free model tests

## Test

```bash
npm test
npm run check
```
