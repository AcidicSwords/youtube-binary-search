# Handoff — Video Cartography lexicon overhaul, remaining work

Written after release **9.0.0**. This file documents the lexicon items that
were deliberately **not** renamed. It names retired terms on purpose, so it is
exempt from `lexicon-audit.mjs` (see `EXEMPT_FILES`). **Delete this file and its
exemption entry once the work below is done.**

## Where things stand

- **9.0.0 is released and green.** `npm run verify` passes (full check suite +
  browser, ghost, and timeline-render smokes). `lexicon-audit.mjs --strict`
  reports zero retired terms.
- The enforced lexicon is clean. Everything below is **LEXICON-forbidden but not
  yet enforced** — none of these stems are in `lexicon-audit.mjs`'s
  `RETIRED_TERMS`, which is exactly why `--strict` passes without them. They are
  internal identifiers only; no remaining item changes any user-facing text.

## Method (what kept phases 1–8 safe)

1. **Explicit, ordered rename** over `git ls-files`, longest token first, with
   `\b` word boundaries — never a bare-word sweep. A bare `perl` word-boundary
   pattern matches CSS tokens that share a prefix before a hyphen/colon
   (`\.active\b` hit `.active-span-fill`); that is what broke timeline rendering
   before `8a45980`.
2. **Rename source and its test assertions in lockstep** — the suites are the
   safety net.
3. **Verify:** `node --check` each touched `.js`, then `npm run check`, then
   `npm run test:browser`. After any CSS rename, the camelCase-in-selector scan
   (`grep -rnE '[.#][a-z]+[A-Z]' *.css` must be empty) and the render smoke.
4. **Blind spot:** `timeline-render-smoke.mjs` guards the timeline *fills*
   (Current Neighborhood, Active Span, Weight Gradient). It does **not** cover
   the Panorama controls or the Panorama freeze visuals — add an assertion there
   before touching item 2.

## Remaining items, in priority order

### 1. Preference-key renames — *moderate value, user-data sensitive*

LEXICON retires two persisted preference keys:

- `contextSeconds` → `contextDuration` (LEXICON §"Context Duration"). ~29
  occurrences: `app.js`, `view.js`, `panorama-coherence-tests.mjs`,
  `transport-coherence-smoke.mjs`.
- `nudgeSeconds` → `nudgeDistance` (LEXICON §"Nudge"). ~14 occurrences:
  `app.js`, `view.js`, `transport-coherence-smoke.mjs`.

**These are persisted storage keys.** The read side MUST keep back-compat or
upgrading users silently lose the setting — the same failure fixed in `29974ec`:

```js
// in readPreferences(), mirror app.js:233 / app.js:253
contextDuration: normalizeContextDuration(value?.contextDuration ?? value?.contextSeconds), // lexicon-allow: v8 preference back-compat
nudgeDistance:   normalizeNudgeDistance(value?.nudgeDistance ?? value?.nudgeSeconds),         // lexicon-allow: v8 preference back-compat
```

- `playbackRate`: **LEXICON has no target entry** for this — do not assume
  `fixedPlaybackRate`. It is not currently a forbidden synonym. Decide and spec
  it in LEXICON.md first, or leave it.

### 2. `held` → `frozen` runtime state — *low value, HIGH risk*

LEXICON §"Freeze Panorama" makes the freeze runtime state `frozen`. `held` is
overloaded **five ways** in `panorama.js` / `panorama-geometry.js`; no mechanical
sweep is possible — separate them by hand:

| # | Usage | Action |
|---|---|---|
| a | `runtime.cycle.held` (freeze boolean) | → `frozen` — this is the real target |
| b | `PANORAMA_STATE.HELD = "held"` (phase value) | **coupled to CSS** `[data-phase="held"]` and `[data-phase="partially-held"]` in `styles.css` — rename value and CSS together or freeze styling breaks |
| c | `FIELD_SIDE_MODE.HELD` (side-mode enum) | see item 3 |
| d | `side.held` (per-side boolean) | → `frozen` with (a) |
| e | English "held"/"holding"/"unheld" in comments | **keep** |

The UI already says "Panorama is frozen" (`panorama.js:1787`), so this is pure
internal churn. Not covered by the render smoke — add a Panorama-freeze visual
assertion first.

### 3. `FIELD_SIDE_MODE` → `PANORAMA_SIDE_MODE` — *low value, low–moderate risk*

Retired `FIELD_` prefix on a code constant. ~31 occurrences: `panorama.js` (18)
plus `panorama-{bounds,layout,runtime,}tests.mjs`. Distinctive, no English
collision, so a safe ordered rename — but its `.HELD` member interlocks with
item 2, so do them together.

### 4. Lower-priority — *needs a LEXICON decision before renaming*

- `step-pane-*` class family (`step-pane`, `-bar`, `-side`, `-center`, `-meta`,
  `-role`, `-restore`, `-action`) — the Panorama side-view panes. "step" is
  ambiguous against the Step operator; pick a canonical name in LEXICON.md
  (e.g. `panorama-pane`) before touching.
- `neighborhood.L` / `.R` (and `.C`) display keys in `session.js` / `view.js` —
  deferred single-letter axis keys; pick canonical directional names
  (backward/forward, or tail/lead) per LEXICON first.

## Definition of done

1. Complete items 1–3 (and 4 after a LEXICON decision).
2. Add each retired stem to `RETIRED_TERMS` in `lexicon-audit.mjs` (`word: true`
   where the stem is a prefix) so `--strict` enforces it — do this **after** the
   rename, never before, or the audit goes red.
3. `npm run verify` green.
4. Delete this `HANDOFF.md` and remove it from `EXEMPT_FILES` in
   `lexicon-audit.mjs`.
