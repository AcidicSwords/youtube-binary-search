from pathlib import Path
import json
import re

ROOT = Path.cwd()


def read(path):
    return (ROOT / path).read_text()


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def replace_once(path, old, new, label):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match in {path}, found {count}")
    write(path, text.replace(old, new, 1))


def regex_once(path, pattern, replacement, label, flags=re.S):
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match in {path}, found {count}")
    write(path, updated)


# ---------------------------------------------------------------------------
# Runtime boundaries and canonical Field normalization.
# ---------------------------------------------------------------------------

for path, header in {
    "app.js": "// Application composition root. Semantic mutations pass through Session; player effects pass through adapters.\n",
    "session.js": "// Immutable semantic kernel and Return history. This module does not touch the DOM or media players.\n",
    "view.js": "// DOM projection layer. It derives presentation from state and does not own semantic transactions.\n",
    "step-field.js": "// Step Field execution controller. Tail and Lead remain muted physical projections of Session state.\n",
    "step-field-geometry.js": "// Pure Step Field geometry, phase, and response-policy helpers.\n",
    "youtube.js": "// Sole raw YouTube IFrame API adapter. Other modules consume this normalized boundary.\n",
    "transport.js": "// Transient observation and traversal values. Transport state never enters Return history directly.\n",
}.items():
    text = read(path)
    if not text.startswith(header):
        write(path, header + text)

replace_once(
    "youtube.js",
    "export function createYouTubePlayer(elementId, options = {}) {\n",
    '''export function isYouTubeApiReady() {
  return typeof globalThis.YT?.Player === "function";
}

export function createYouTubePlayer(elementId, options = {}) {
  if (!isYouTubeApiReady()) throw new Error("YouTube IFrame API is not ready.");
''',
    "YouTube readiness boundary"
)
replace_once(
    "youtube.js",
    "  rawPlayer = new YT.Player(elementId, {",
    "  rawPlayer = new globalThis.YT.Player(elementId, {",
    "YouTube constructor boundary"
)

geometry = read("step-field-geometry.js")
old_geometry_head = '''export const FIELD_REACH_TOLERANCE = 0.16;

export function normalizeFieldReach(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) {
    const reach = Number(value);
    return { backward: reach, forward: reach, linked: true };
  }
  const backward = Number(value?.backward);
  const forward = Number(value?.forward);
  if (!(Number.isFinite(backward) && backward > 0 && Number.isFinite(forward) && forward > 0)) {
    throw new TypeError("Step Field requires positive backward and forward Reach.");
  }
  return { backward, forward, linked: value?.linked !== false };
}
'''
new_geometry_head = '''export const FIELD_REACH_TOLERANCE = 0.16;
export const DEFAULT_FIELD_RESPONSE = Object.freeze({ tailRate: 0.5, leadRate: 2 });

export function normalizeFieldResponse(value = DEFAULT_FIELD_RESPONSE) {
  const tailRate = Number(value?.tailRate);
  const leadRate = Number(value?.leadRate);
  return {
    tailRate: Number.isFinite(tailRate) && tailRate > 0 && tailRate < 1
      ? tailRate
      : DEFAULT_FIELD_RESPONSE.tailRate,
    leadRate: Number.isFinite(leadRate) && leadRate > 1
      ? leadRate
      : DEFAULT_FIELD_RESPONSE.leadRate
  };
}

export function normalizeFieldReach(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Step Field requires directional Reach.");
  }
  const backward = Number(value.backward);
  const forward = Number(value.forward);
  const linked = value.linked !== false;
  if (!(Number.isFinite(backward) && backward > 0 && Number.isFinite(forward) && forward > 0)) {
    throw new TypeError("Step Field requires positive backward and forward Reach.");
  }
  if (linked && Math.abs(backward - forward) > EPSILON) {
    throw new TypeError("Linked Step Field Reach must be equal in both directions.");
  }
  return { backward, forward, linked };
}
'''
if geometry.count(old_geometry_head) != 1:
    raise RuntimeError("Step Field geometry normalization anchor")
geometry = geometry.replace(old_geometry_head, new_geometry_head, 1)
geometry = geometry.replace(
    "export function deriveFieldBounds({ current, stepSeconds = null, stepReach = null, range }) {\n  const requested = normalizeFieldReach(stepReach ?? stepSeconds);",
    "export function deriveFieldBounds({ current, stepReach, range }) {\n  const requested = normalizeFieldReach(stepReach);",
    1
)
write("step-field-geometry.js", geometry)

field = read("step-field.js")
field = field.replace(
    'import { YOUTUBE_STATE, createYouTubePlayer } from "./youtube.js";',
    'import { YOUTUBE_STATE, createYouTubePlayer, isYouTubeApiReady } from "./youtube.js";',
    1
)
field = field.replace(
    "  FIELD_REACH_TOLERANCE,\n",
    "  FIELD_REACH_TOLERANCE,\n  DEFAULT_FIELD_RESPONSE,\n  normalizeFieldResponse,\n",
    1
)
field = field.replace(
    "  STEP_FIELD_PHASE,\n  deriveFieldBounds,",
    "  STEP_FIELD_PHASE,\n  DEFAULT_FIELD_RESPONSE,\n  normalizeFieldResponse,\n  deriveFieldBounds,",
    1
)
old_defaults = '''function defaultPreferences() {
  return {
    stepFieldEnabled: true,
    tailVisible: true,
    leadVisible: true,
    tailRate: 0.5,
    leadRate: 2
  };
}

function snapshotReach(snapshot) {
  return snapshot.stepReach ?? snapshot.stepSeconds ?? 10;
}
'''
new_defaults = '''function defaultPreferences() {
  return {
    stepFieldEnabled: true,
    tailVisible: true,
    leadVisible: true,
    ...DEFAULT_FIELD_RESPONSE
  };
}

function snapshotReach(snapshot) {
  return normalizeFieldReach(snapshot?.stepReach);
}
'''
if field.count(old_defaults) != 1:
    raise RuntimeError("Step Field default preference anchor")
field = field.replace(old_defaults, new_defaults, 1)
field = field.replace(
    "    if (side.adapter || !globalThis.YT?.Player || !document?.getElementById?.(side.elementId)) return;",
    "    if (side.adapter || !isYouTubeApiReady() || !document?.getElementById?.(side.elementId)) return;",
    1
)
write("step-field.js", field)

app = read("app.js")
app = app.replace(
    'import { createStepFieldController } from "./step-field.js";',
    'import {\n  DEFAULT_FIELD_RESPONSE,\n  createStepFieldController,\n  normalizeFieldResponse\n} from "./step-field.js";',
    1
)
app = app.replace(
    '''const NATIVE_POSITION_TOLERANCE_SECONDS = 0.25;
const DEFAULT_FIELD_RESPONSE = Object.freeze({ tailRate: 0.5, leadRate: 2 });

function normalizeFieldResponse(value = DEFAULT_FIELD_RESPONSE) {
  const tailRate = Number(value?.tailRate);
  const leadRate = Number(value?.leadRate);
  return {
    tailRate: Number.isFinite(tailRate) && tailRate > 0 && tailRate < 1
      ? tailRate
      : DEFAULT_FIELD_RESPONSE.tailRate,
    leadRate: Number.isFinite(leadRate) && leadRate > 1
      ? leadRate
      : DEFAULT_FIELD_RESPONSE.leadRate
  };
}
''',
    "const NATIVE_POSITION_TOLERANCE_SECONDS = 0.25;\n",
    1
)
write("app.js", app)

# Remove execution-level scalar Reach compatibility. Persistence migration remains
# isolated in app.js, where legacy stepSeconds is normalized into Session Reach.
for path in ["step-field-tests.mjs", "field-bounds-tests.mjs"]:
    text = read(path)
    text = text.replace(
        "stepSeconds: 10",
        "stepReach: { backward: 10, forward: 10, linked: true }"
    )
    write(path, text)

step_tests = read("step-field-tests.mjs")
step_tests = step_tests.replace(
    "  const css = readFileSync(\"step-field.css\", \"utf8\");",
    "  const css = readFileSync(\"step-field.css\", \"utf8\");\n  const layoutCss = readFileSync(\"styles.css\", \"utf8\");",
    1
)
step_tests = step_tests.replace(
    '  assert.match(css, /@media \\(min-width: 1221px\\)/);',
    '  assert.doesNotMatch(css, /@media \\(min-width: 1221px\\)/);\n  assert.match(layoutCss, /@media \\(min-width: 1221px\\)/);',
    1
)
write("step-field-tests.mjs", step_tests)

# ---------------------------------------------------------------------------
# UI vocabulary and component geometry.
# ---------------------------------------------------------------------------

index = read("index.html")
index = index.replace("<span>Step Field</span>\n                  <strong id=\"step-setting-value\">", "<span>Step Reach</span>\n                  <strong id=\"step-setting-value\">", 1)
index = index.replace("<span><kbd>[</kbd>/<kbd>]</kbd> Step size</span>", "<span><kbd>[</kbd>/<kbd>]</kbd> Reach preset</span>", 1)
write("index.html", index)

styles = read("styles.css")
styles = styles.replace(
    "  --touch: 44px;\n",
    "  --control-height: 40px;\n  --compact-control-height: 32px;\n  --touch: 48px;\n",
    1
)
styles = styles.replace("  min-height: 38px;\n  border: 1px solid var(--line);", "  min-height: var(--control-height);\n  border: 1px solid var(--line);", 1)
styles = styles.replace("  min-height: 38px;\n  border: 1px solid var(--line);", "  min-height: var(--control-height);\n  border: 1px solid var(--line);", 1)

ui_source = "\n".join(read(path) for path in ["index.html", "app.js", "view.js", "step-field.js"])
for token in ["observation-dock", "context-control", "compact-select", "observation-button", "skim-speed"]:
    if token in ui_source:
        raise RuntimeError(f"Cannot remove live legacy UI selector: {token}")
styles = re.sub(
    r"\n\.observation-dock \{.*?\.skim-speed select \{ min-width: 68px; \}\n",
    "\n",
    styles,
    count=1,
    flags=re.S
)
styles = styles.replace("grid-template-columns: repeat(5, minmax(0, 1fr));", "grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));", 1)
styles = styles.replace(
    "  box-shadow: var(--shadow);\n}\n.settings-popover > label:first-child { display: block; margin-bottom: 6px; color: var(--muted); font-size: 0.72rem; }\n.settings-popover input[type=\"range\"] { width: 100%; }",
    "  max-height: min(70vh, 560px);\n  overflow: auto;\n  overscroll-behavior: contain;\n  box-shadow: var(--shadow);\n}",
    1
)
old_wide = '''/* Wide desktop: keep the transformation deck and retained Guide beside the video.
   This shortens the dominant mouse paths and keeps every primary operator above the fold. */
@media (min-width: 1221px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr) 330px;
  }

  .reader-column {
    grid-template-columns: minmax(0, 1fr) 360px;
    grid-template-areas:
      "player navigation"
      "timeline navigation"
      "secondary navigation";
    align-items: start;
  }

  .player-panel { grid-area: player; container-type: inline-size; }
  .interaction-grid { display: contents; }
  .timeline-panel { grid-area: timeline; }
  .navigation-panel {
    grid-area: navigation;
    position: sticky;
    top: 14px;
  }
  .secondary-tools { grid-area: secondary; }
}

@container (max-width: 700px) {
  .observation-dock {
    grid-template-columns: 1fr 1fr;
  }
  .skim-speed {
    grid-column: 1 / -1;
    grid-template-columns: auto 90px;
    justify-content: end;
    align-items: center;
  }
}

/* Active observation state is shared across Context, Continue, Skim, and Loop. */
.observation-button[aria-pressed="true"],
.observation-button.is-active {
  border-color: rgba(121, 168, 255, 0.78);
  background: linear-gradient(180deg, rgba(89, 137, 226, 0.34), rgba(54, 94, 168, 0.23));
  box-shadow: inset 0 0 0 1px rgba(166, 197, 255, 0.12);
}
'''
new_wide = '''/* Wide desktop keeps the full Step Field width, with Timeline and Navigation
   sharing the row below it. This is the sole authoritative desktop layout. */
@media (min-width: 1221px) {
  .workspace { grid-template-columns: minmax(0, 1fr) 330px; }
  .reader-column { grid-template-columns: minmax(0, 1fr); }
  .interaction-grid {
    display: grid;
    grid-template-columns: minmax(430px, 1.18fr) minmax(390px, 0.82fr);
  }
  .navigation-panel { position: static; top: auto; }
}
'''
if styles.count(old_wide) != 1:
    raise RuntimeError("Authoritative desktop layout anchor")
styles = styles.replace(old_wide, new_wide, 1)
styles = styles.replace(
    "  .range-handle { width: 30px; height: 42px; top: 10px; }\n  .range-handle::before { inset: 12px 12px; }",
    "  .range-handle { width: var(--touch); height: var(--touch); top: 7px; }\n  .range-handle::before { inset: 15px 20px; }\n  .guide-tab,\n  .guide-item-actions button,\n  .endpoint-button,\n  .guide-close,\n  .dialog-actions button { min-height: var(--touch); }\n  .guide-close { width: var(--touch); }",
    1
)
write("styles.css", styles)

step_css = read("step-field.css")
step_css = step_css.replace("  min-height: 31px;", "  min-height: var(--control-height);", 1)
step_css = step_css.replace("  min-height: 25px;\n  height: 25px;", "  min-height: var(--compact-control-height);\n  height: var(--compact-control-height);", 1)
step_css = step_css.replace("  min-height: 25px;\n  border-color:", "  min-height: var(--compact-control-height);\n  border-color:", 1)
old_field_wide = '''/* Three panes need the reader width; Navigation stays compact below the Field. */
@media (min-width: 1221px) {
  .reader-column {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: none;
  }

  .player-panel,
  .timeline-panel,
  .navigation-panel,
  .secondary-tools { grid-area: auto; }

  .interaction-grid {
    display: grid;
    grid-template-columns: minmax(430px, 1.18fr) minmax(390px, 0.82fr);
  }

  .navigation-panel { position: static; top: auto; }
}

'''
if step_css.count(old_field_wide) != 1:
    raise RuntimeError("Step Field duplicate desktop layout anchor")
step_css = step_css.replace(old_field_wide, "", 1)
step_css = step_css.replace(
    '''@media (pointer: coarse) {
  .step-pane-bar { min-height: 52px; }
  .pane-rate-setting select {
    width: 84px;
    min-width: 84px;
    min-height: 44px;
    height: 44px;
    font-size: 16px;
  }
}''',
    '''@media (pointer: coarse) {
  .step-pane-bar { min-height: 56px; }
  .pane-rate-setting select,
  .pane-collapse,
  .field-toggle {
    min-height: var(--touch);
    height: var(--touch);
  }
  .pane-rate-setting select {
    width: 88px;
    min-width: 88px;
    font-size: 16px;
  }
  .pane-collapse { width: var(--touch); }
}''',
    1
)
write("step-field.css", step_css)

field_css = read("field-grammar.css")
field_css = field_css.replace("  min-height: 25px;", "  min-height: var(--control-height);", 1)
field_css = field_css.replace("  min-height: 27px;", "  min-height: var(--compact-control-height);", 1)
field_css = field_css.replace(
    ".link-setting,\n.rate-setting,\n.fixed-rate,\n.step-field-settings .number-setting {",
    ".link-setting,\n.step-field-settings .number-setting {",
    1
)
field_css = field_css.replace(".step-field-settings select { min-width: 92px; }\n.fixed-rate strong { color: var(--text); }\n", "", 1)
field_css += '''

/* Final coarse-pointer override: component selectors loaded after styles.css must
   not shrink below the shared touch target. */
@media (pointer: coarse) {
  .field-transport,
  .object-action,
  .extent-action,
  .step-settings summary,
  .tool-disclosure > summary {
    min-height: var(--touch);
  }
}
'''
write("field-grammar.css", field_css)

# ---------------------------------------------------------------------------
# Canonical documentation.
# ---------------------------------------------------------------------------

readme = r'''# Binary YouTube Reader

Binary YouTube Reader is a spatial-temporal interface for navigating long YouTube videos through a compact, composable operator grammar.

The application keeps one semantic model—Current inside Range at a Resolution—and lets Refine, Reopen, Step, Return, Continue, Context, Skim, Loop, Pin, Section, and Focus act on it predictably. The three-pane Step Field projects Tail and Lead around the audible Center without creating a second timeline.

## Run

Serve the repository through a local HTTP server, then open `index.html`. The YouTube IFrame API requires a normal browser origin and network access.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Repository checks require Node 20 or newer:

```bash
npm test
npm run audit
npm run check
```

## Core model

```text
Address → Current inside Range
Current + Resolution → Neighborhood
movement → Interval
Address → Pin
explicit Extent → Section
Section → Range through Focus
```

Range is the sole hard temporal boundary. Resolution controls semantic discrimination; it does not clip physical observation.

## Step Field

```text
Tail   ← Current →   Lead
slower     1×        faster
muted   audible      muted
```

Backward and Forward Reach can be linked or independent. Tail and Lead rate controls live in their respective pane headers and expose only rates reported by the current YouTube player. Application Continue is the authoritative three-pane start gesture; native Center controls remain available.

Disabling Step Field preserves the stable single-player reader and does not create side players.

## Keyboard

```text
W / A / S / D = Reopen / Refine Backward / Return / Refine Forward
← / →         = Step Backward / Step Forward
[ / ]         = Reach preset down / up
Space         = Continue / Pause
C             = Context
F             = Skim
L             = Loop
P             = Pin Current
Shift+P       = Save Section
Shift+← / →   = previous / next Pin
```

Inputs and selects suspend global shortcuts.

## Documentation map

- `SPEC.md` — canonical semantic and interaction contract.
- `IMPLEMENTATION.md` — runtime architecture, ownership, and module boundaries.
- `DEVELOPMENT.md` — setup, change discipline, and extension workflow.
- `VALIDATION.md` — automated coverage and the real-browser/device matrix.

These documents describe the current tree. Git history and merged pull requests retain chronology; canonical documentation does not accumulate obsolete version layers.
'''
write("README.md", readme)

spec = r'''# Binary YouTube Reader — Canonical Specification

## 1. Authority

This document defines the current semantic and interaction contract. `IMPLEMENTATION.md` explains how the contract is realized. Historical behavior is not normative.

## 2. Primitive and ordered space

The primitive is a temporal Address `t` inside video duration `[0, D]`.

- **Current** is the committed Address from which semantic operators act.
- **Cursor** is a transient physical player position.
- **Range** is the sole hard admissible extent.
- **Resolution** is the current scale of discrimination.
- **Neighborhood** is the left/current/right structure at that Resolution.
- **Interval** is the last committed movement extent.
- **Pin** is a retained Address.
- **Section** is a retained explicit Extent whose endpoints are Pins.
- **Guide** is the video-specific collection of Pins and Sections.
- **Field Span** is the live Tail-to-Lead physical extent.

At rest, Cursor and Current coincide. Observation may separate them temporarily; Cursor is never stored in Session.

## 3. Global invariants

```text
Range.start ≤ Current ≤ Range.end
Range is the only hard Field boundary
linked Reach ⇒ backward Reach = forward Reach
0.25s ≤ each Reach ≤ 300s
Center is the only audible player
Tail and Lead never commit Current directly
Return restores semantic checkpoints, not transient transport
```

A null operation creates no history entry. A transient player event cannot privately redefine semantic state.

## 4. Semantic operators

### Go

Commits Current to a bounded Address. Direct timeline placement, Pin selection, source selection, and midpoint actions are projections of Go.

### Refine Backward / Forward

Selects one directional child of the current Neighborhood, commits its midpoint as Current, and increases Resolution.

### Reopen

Preserves Current and restores Range-level Resolution. Reopen broadens availability; it is not Return.

### Step Backward / Forward

Moves from Current by the corresponding directional Reach and clamps to Range. A committed movement derives an Interval. Rapid repeated Steps coalesce into one transaction.

### Return

Restores the complete previous semantic checkpoint: Range, Resolution, Current, Interval, Focus, Reach, and Guide when changed by that transaction.

### Focus / Leave Focus

Focus installs a Section as Range. Leave Focus restores the containing Range. Only explicit Range operations change Range.

### Pin Current / Save Section

Pin Current retains an Address. Save Section retains an explicit Interval or Held Field Span, reusing coincident endpoint Pins.

## 5. Observation and traversal

Transport has one kind at a time:

```text
idle | context | continue | skim | loop
```

- **Context** observes a bounded window around Current and restores Cursor to Current.
- **Continue** traverses forward through Range and commits actual movement on settlement.
- **Skim** traverses toward the forward refinement target at a supported boosted rate, then hands off to Continue.
- **Loop** repeats an immutable captured Interval or Field Span and restores Current when stopped.

Semantic operators may interrupt transport. Observational transport restores Current unless replaced by an immediate Go; committing transport records only movement already manifested.

## 6. Step Field

```text
Tail   ← Current →   Lead
slower     1×        faster
muted   audible      muted
```

Field targets are:

```text
Tail target = max(Range Start, Current − Backward Reach)
Lead target = min(Range End, Current + Forward Reach)
```

Resolution never clips the Field.

Field phases are:

```text
Off → Coincident → Unfolding → Partially Held → Held
                         ↘ Suspended ↗
```

A forming side resolves through Go to its observed Cursor. A Held side resolves through directional Step to its semantic target.

Tail accepts supported rates below `1×`; Lead accepts supported rates above `1×`. Requested and actual rates remain distinct. Missing directional rates produce an unavailable side. Autoplay rejection produces a blocked side.

Changing rate is kinetic and preserves Field geometry. Enabling/disabling the Field or hiding/showing a pane is structural and re-establishes it.

## 7. Transport authority

Application Continue is the authoritative three-pane start gesture:

```text
settle prior transport
→ establish Continue
→ prepare available Tail and Lead
→ request side playback
→ start Center
→ verify actual states
```

Native Center Play remains supported but side activation is best effort because browser policy may treat later side-player requests differently.

With Step Field disabled, the application is observationally equivalent to the stable single-player reader.

## 8. Persistence

Guide data is stored per video. Preferences store Context duration, directional Reach, last edited Reach side, Field response, and pane visibility.

Legacy scalar `stepSeconds` is accepted only at the persistence migration boundary and becomes equal linked directional Reach before entering Session. Runtime Field APIs accept directional Reach only.

Actual rates, buffering, blocked state, Cursors, and Field phases are runtime-only.

## 9. Interface grammar

Desktop navigation preserves three columns:

```text
Backward | shared spine | Forward
```

The shared spine contains Reopen, Return, Step Reach settings, Pin Current, and Pins access. Directional actions remain on their corresponding sides.

On compact screens, Guide becomes an off-canvas sheet. On phones, Center, Tail, and Lead stack vertically; side-player viewports retain the minimum dimensions needed for IFrame capability reporting.

All visible controls, statuses, code, and documentation use the same vocabulary.

## 10. Non-contracts

The following are not current contracts:

- scalar runtime Step size;
- Resolution as a Field boundary;
- fixed immutable Tail/Lead rates;
- native Center Play as the sole transport authority;
- side Cursors as semantic history;
- implicit retention of Field Span;
- chronological documentation that competes with the current specification.
'''
write("SPEC.md", spec)

implementation = r'''# Binary YouTube Reader — Canonical Implementation

## 1. Architecture rule

The repository implements one semantic system through explicit ownership boundaries:

```text
user intention
→ settle incompatible transient state
→ Session transaction or observation transport
→ derive physical effects
→ execute through adapters
→ render one truthful projection
```

No presentation component owns semantic truth. No player callback directly mutates Guide or Return history.

## 2. State ownership

`session.js` owns immutable semantic state and Return history:

```js
{
  duration,
  range,
  resolution,
  resolutionBasis,
  focus,
  interval,
  stepReach: { backward, forward, linked },
  guide
}
```

`transport.js` owns transient Context, Continue, Skim, and Loop values. `app.js` composes transactions, persistence, lifecycle, and adapter effects. `view.js` projects state into DOM. `step-field.js` owns muted Tail/Lead execution state but cannot commit semantic state directly.

## 3. Module boundaries

| Module | Responsibility |
|---|---|
| `range-geometry.js` | pure Range, Resolution, Neighborhood, Step, and preview geometry |
| `session.js` | immutable semantic transactions and Return history |
| `transport.js` | transient observation and traversal values |
| `youtube.js` | sole raw YouTube IFrame API adapter and readiness boundary |
| `step-field-geometry.js` | pure Field targets, phases, constraints, Reach validation, and response policy |
| `step-field.js` | muted Tail/Lead execution and Field presentation state |
| `guide.js` | Pins, Sections, Focus references, migration, and validation |
| `source-field.js` | normalized external temporal records |
| `view.js` | DOM projection and control enablement |
| `app.js` | composition root, persistence, lifecycle, and dependency wiring |

Dependencies point toward pure kernels and adapters. A module must not bypass an owner to reproduce its logic privately.

## 4. Canonical normalization

Session owns persisted Reach normalization:

```text
linked = true ⇒ backward = forward
0.25s ≤ backward, forward ≤ 300s
```

Step Field execution receives already directional Reach and rejects malformed or unequal linked objects. Legacy scalar migration exists only in `app.js` preference loading.

Field response defaults and validation are owned by `step-field-geometry.js` and reused by both the composition root and execution controller:

```js
{ tailRate: 0.5, leadRate: 2 }
```

Tail must be below `1×`; Lead must be above `1×`. Player-specific availability is resolved later against each adapter snapshot.

## 5. Step Field lifecycle

The semantic key contains video, Current, Range, and directional Reach. A change to those values invalidates physical geometry.

Rate changes are kinetic and do not force re-establishment. Field enablement and pane visibility changes are structural and do.

Side players are created lazily only when the API is ready, the Field is enabled, and the corresponding pane is visible. They are always muted and removed from the accessibility tree.

Application Continue prepares side players before starting Center. Native Center Play is reconciled afterward and side activation remains best effort under autoplay policy.

## 6. Interface system

Styles are loaded in increasing specificity:

1. `styles.css` — tokens, global controls, shell, panels, Navigation, Guide, and authoritative responsive layout.
2. `step-field.css` — pane geometry, local pane controls, collapse behavior, and mobile stacking.
3. `field-grammar.css` — Field phase cues, object-local actions, transport bar, and final interaction-state overrides.

Wide-desktop layout is defined only in `styles.css`. Later files must not redefine the application grid.

Shared sizing tokens are:

```css
--control-height: 40px;
--compact-control-height: 32px;
--touch: 48px;
```

Desktop prioritizes density and alignment. Coarse pointers receive explicit `48px` targets, including controls whose component selectors load after the global rule.

The Navigation deck preserves Backward / shared spine / Forward. The state strip uses responsive auto-fit columns. Settings popovers are bounded and scroll internally rather than overflowing the viewport.

## 7. Persistence

Guide schema remains video-specific under `binary-youtube-reader:v5:<videoId>`. Earlier Guide versions are read and sanitized without mutating their original keys.

Preferences are stored separately. Active Session Reach becomes the default for the next video; Return updates that default when it restores Reach.

Runtime-only player and Field state is never persisted.

## 8. Verification boundaries

`npm test` covers pure kernels, state transitions, fuzz invariants, regressions, Field geometry, response policy, and UI contracts.

`npm run audit` checks DOM references, accessible names, vocabulary, documentation authority, CSS ownership, adapter boundaries, and version consistency.

`npm run check` runs syntax, tests, audits, integration, and smoke paths.

Automated checks cannot prove browser autoplay behavior, per-video rate availability, buffering, fullscreen, or device layout. Those remain in `VALIDATION.md`.

## 9. Change discipline

A change is complete only when:

1. the owning module contains the behavior;
2. dependent modules consume that owner rather than duplicate it;
3. tests state the invariant, not merely the current text shape;
4. canonical documentation is updated in the same change;
5. `npm run check` passes;
6. browser/device-dependent behavior is recorded against the manual matrix.

Do not add compatibility fallbacks inside runtime kernels. Normalize legacy data once at the migration boundary.

Do not add a new mode when an existing operator and operand can express the behavior compositionally.
'''
write("IMPLEMENTATION.md", implementation)

development = r'''# Development Guide

## 1. Start here

Read in this order:

1. `README.md` for the product surface.
2. `SPEC.md` for semantic invariants.
3. `IMPLEMENTATION.md` for ownership and module boundaries.
4. `VALIDATION.md` before changing browser/player behavior.

Serve the static application through HTTP:

```bash
python3 -m http.server 8000
```

Run the repository gate:

```bash
npm run check
```

Node 20 or newer is required. The application has no build step and no runtime package dependency.

## 2. Where changes belong

- Change temporal mathematics in `range-geometry.js`.
- Change semantic transactions or Return behavior in `session.js`.
- Change transient observation values in `transport.js`.
- Change raw IFrame interaction only in `youtube.js`.
- Change Field mathematics or response validation in `step-field-geometry.js`.
- Change Tail/Lead execution in `step-field.js`.
- Change retained structure in `guide.js`.
- Change DOM projection in `view.js`.
- Compose user actions, persistence, and lifecycle in `app.js`.

When a rule appears in two modules, identify its owner and remove the duplicate.

## 3. Semantic change protocol

Before editing, state:

- the operator being changed;
- its operand;
- its owner;
- whether it is semantic, transient, physical, retained, or presentational;
- which existing invariant constrains it.

Then add or update the smallest pure test first. Integration and smoke tests should confirm wiring, not replace kernel tests.

## 4. UI change protocol

The UI mirrors operator geometry; it is not an independent taxonomy.

- Backward controls remain left.
- Shared controls remain on the spine.
- Forward controls remain right.
- Object-local settings stay with the object they modify.
- One visible control must not imply authority it does not possess.
- Disabled controls must remain legible enough to explain unavailable state.
- Every interactive element needs an explicit accessible name and a visible focus state.
- Coarse-pointer targets must be at least `48px` unless a larger invisible hit area is provided.

Desktop is the primary dense layout. Mobile may stack and disclose, but must preserve every operation and remain usable without a keyboard.

## 5. Player and asynchronous work

Never read or construct `YT.Player` outside `youtube.js`. Use normalized adapter state.

Treat player commands as requests, not facts. Verify reported state after play, pause, placement, and rate changes. Keep requested and actual rates separate.

Autoplay rejection, buffering, delayed placement, and unavailable rates are ordinary runtime states, not exceptional semantic states.

## 6. Persistence and migrations

Do not broaden runtime APIs to accept historical schemas. Read legacy records at the persistence boundary, normalize once, and pass canonical data inward.

Guide migrations must salvage valid independent records. Preference migration must preserve current behavior without creating Session history.

## 7. Test map

- `tests.mjs` — Range and Session fundamentals.
- `transport-tests.mjs` — transient transport values.
- `source-field-tests.mjs` — external source normalization.
- `fuzz-tests.mjs` — deterministic long-run invariants.
- `v5.2-regression-tests.mjs` — stable reader interaction contracts.
- `step-field-tests.mjs` — Field phases and execution wiring.
- `field-grammar-tests.mjs` — operator/Field interaction grammar.
- `field-bounds-tests.mjs` — Range-only Field boundaries and suspension.
- `field-coherence-tests.mjs` — directional Reach, response, persistence, and UI coherence.
- `integration-check.mjs` — DOM, accessibility, vocabulary, and module wiring.
- `project-audit.mjs` — documentation, CSS ownership, adapter boundary, and repository hygiene.
- smoke files — startup and high-level interaction paths.

## 8. Completion standard

A branch is ready for review when `npm run check` passes and the PR states which `VALIDATION.md` scenarios were exercised. Keep browser-dependent items explicit; do not claim automated proof of IFrame behavior.
'''
write("DEVELOPMENT.md", development)

validation = r'''# Validation Matrix

## 1. Automated gate

Run:

```bash
npm run check
```

The gate covers syntax, pure geometry, Session/Return, Guide integrity, transport, source normalization, deterministic fuzz, stable-reader regressions, Step Field phases and bounds, directional Reach, response policy, DOM/accessibility contracts, documentation consistency, startup, interaction, Context, and metadata paths.

A passing gate is necessary but not sufficient for release.

## 2. Desktop browser matrix

Use at least two ordinary videos with different durations and reported playback-rate sets.

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
'''
write("VALIDATION.md", validation)

# ---------------------------------------------------------------------------
# Repository audit executable.
# ---------------------------------------------------------------------------

project_audit = r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`./${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("index.html");
const styles = read("styles.css");
const fieldCss = read("step-field.css");
const grammarCss = read("field-grammar.css");
const app = read("app.js");
const field = read("step-field.js");
const fieldGeometry = read("step-field-geometry.js");
const youtube = read("youtube.js");
const docs = Object.fromEntries([
  "README.md", "SPEC.md", "IMPLEMENTATION.md", "DEVELOPMENT.md", "VALIDATION.md"
].map(path => [path, read(path)]));

assert.equal(pkg.version, "5.6.0");
assert.equal(docs["SPEC.md"].startsWith("# Binary YouTube Reader — Canonical Specification\n"), true);
assert.equal(docs["IMPLEMENTATION.md"].startsWith("# Binary YouTube Reader — Canonical Implementation\n"), true);
for (const name of ["SPEC.md", "IMPLEMENTATION.md", "DEVELOPMENT.md", "VALIDATION.md"]) {
  assert.match(docs["README.md"], new RegExp(`\\`${name.replace(".", "\\.")}\\``), `README must link ${name}`);
}

const canonicalText = [html, ...Object.values(docs)].join("\n");
assert.doesNotMatch(canonicalText, /Step size/i, "Visible and canonical vocabulary must use Reach.");
assert.doesNotMatch(canonicalText, /Canonical (Specification|Implementation) v\d/i, "Canonical documents must not embed stale release authority.");

assert.match(styles, /--control-height:\s*40px/);
assert.match(styles, /--compact-control-height:\s*32px/);
assert.match(styles, /--touch:\s*48px/);
assert.equal((styles.match(/@media \(min-width: 1221px\)/g) || []).length, 1, "Desktop layout must have one owner.");
assert.doesNotMatch(fieldCss, /@media \(min-width: 1221px\)/, "Step Field CSS must not override application layout.");
for (const dead of ["observation-dock", "context-control", "compact-select", "observation-button", "skim-speed", "rate-setting", "fixed-rate"]) {
  assert.equal(`${styles}\n${fieldCss}\n${grammarCss}`.includes(dead), false, `Dead CSS selector remains: ${dead}`);
}
assert.match(grammarCss, /@media \(pointer: coarse\)[\s\S]*\.field-transport[\s\S]*min-height: var\(--touch\)/);
assert.match(fieldCss, /@media \(pointer: coarse\)[\s\S]*\.pane-collapse[\s\S]*height: var\(--touch\)/);

assert.doesNotMatch(app, /const DEFAULT_FIELD_RESPONSE/, "Field response default must have one owner.");
assert.match(fieldGeometry, /export const DEFAULT_FIELD_RESPONSE/);
assert.match(fieldGeometry, /export function normalizeFieldResponse/);
assert.doesNotMatch(fieldGeometry, /stepSeconds/, "Runtime Field geometry must accept directional Reach only.");
assert.doesNotMatch(field, /globalThis\.YT/, "Step Field must use the YouTube adapter readiness boundary.");
assert.match(youtube, /export function isYouTubeApiReady/);
assert.equal((`${app}\n${field}\n${fieldGeometry}`.match(/new\s+(?:globalThis\.)?YT\.Player/g) || []).length, 0);
assert.equal((youtube.match(/new\s+globalThis\.YT\.Player/g) || []).length, 1);

assert.match(pkg.scripts.audit, /integration-check\.mjs/);
assert.match(pkg.scripts.audit, /project-audit\.mjs/);
assert.match(pkg.scripts.check, /npm run audit/);

console.log("Project audit passed: canonical docs, CSS ownership, touch geometry, adapter boundaries, and version contracts are coherent.");
'''
write("project-audit.mjs", project_audit)

pkg = json.loads(read("package.json"))
pkg["version"] = "5.6.0"
pkg["scripts"]["audit"] = "node integration-check.mjs && node project-audit.mjs"
pkg["scripts"]["check"] = pkg["scripts"]["check"].replace(
    "npm test && node integration-check.mjs &&",
    "npm test && npm run audit &&"
)
write("package.json", json.dumps(pkg, indent=2) + "\n")

# Extend coherence tests with the newly centralized code contract.
coherence = read("field-coherence-tests.mjs")
coherence = coherence.replace(
    "  fieldPreferenceRequiresEstablish,\n  createStepFieldController",
    "  fieldPreferenceRequiresEstablish,\n  createStepFieldController,\n  normalizeFieldResponse",
    1
)
coherence = coherence.replace(
    "assert.equal(fieldPreferenceRequiresEstablish({ stepFieldEnabled: false }), true);",
    '''assert.equal(fieldPreferenceRequiresEstablish({ stepFieldEnabled: false }), true);
assert.deepEqual(normalizeFieldResponse({ tailRate: 0.75, leadRate: 1.5 }), { tailRate: 0.75, leadRate: 1.5 });
assert.deepEqual(normalizeFieldResponse({ tailRate: 2, leadRate: 0.5 }), { tailRate: 0.5, leadRate: 2 });''',
    1
)
coherence = coherence.replace(
    '  assert.match(implementation, /^# Binary YouTube Reader v5\\.5\\.2/m);',
    '  assert.match(implementation, /^# Binary YouTube Reader — Canonical Implementation/m);',
    1
)
coherence = coherence.replace('console.log("Field coherence v5.5.2 tests passed.");', 'console.log("Field coherence tests passed.");', 1)
write("field-coherence-tests.mjs", coherence)

# Update integration ownership assertions.
integration = read("integration-check.mjs")
integration = integration.replace(
    'const youtubeSource = readFileSync(new URL("./youtube.js", import.meta.url), "utf8");',
    'const youtubeSource = readFileSync(new URL("./youtube.js", import.meta.url), "utf8");\nconst fieldGeometrySource = readFileSync(new URL("./step-field-geometry.js", import.meta.url), "utf8");',
    1
)
integration = integration.replace(
    'assert.match(youtubeSource, /place\\(address, allowSeekAhead = true\\)/, "The YouTube adapter must expose placement rather than seek vocabulary.");',
    'assert.match(youtubeSource, /place\\(address, allowSeekAhead = true\\)/, "The YouTube adapter must expose placement rather than seek vocabulary.");\nassert.match(youtubeSource, /isYouTubeApiReady/, "YouTube readiness must be owned by the adapter.");\nassert.doesNotMatch(fieldGeometrySource, /stepSeconds/, "Step Field geometry must receive directional Reach only.");',
    1
)
write("integration-check.mjs", integration)

# Successful workflow commits only product and canonical project files.
for path in [
    ".github/stabilize-repository-v5.6.0.py",
    ".github/workflows/stabilize-repository-v5.6.0.yml"
]:
    target = ROOT / path
    if target.exists():
        target.unlink()
