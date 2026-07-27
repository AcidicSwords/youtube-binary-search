from pathlib import Path

ROOT = Path.cwd()


def read(name):
    return (ROOT / name).read_text()


def write(name, text):
    (ROOT / name).write_text(text)


def function_block(text, name):
    start = text.index(f"function {name}(")
    next_start = text.find("\nfunction ", start + 1)
    return start, len(text) if next_start < 0 else next_start


# Canonical directional Reach.
session = read("session.js")
session = session.replace(
    "export const MIN_RANGE_SECONDS = 0.25;\n",
    "export const MIN_RANGE_SECONDS = 0.25;\nexport const MIN_STEP_REACH_SECONDS = 0.25;\nexport const MAX_STEP_REACH_SECONDS = 300;\n",
    1
)
start = session.index("export function normalizeStepReach(")
end = session.index("\nexport function copy(", start)
normalizer = '''function normalizeReachSeconds(value, fallback) {
  const fallbackValue = Number.isFinite(Number(fallback)) ? Number(fallback) : 10;
  const candidate = Number(value);
  return clamp(
    Number.isFinite(candidate) && candidate > 0 ? candidate : fallbackValue,
    MIN_STEP_REACH_SECONDS,
    MAX_STEP_REACH_SECONDS
  );
}

export function normalizeStepReach(value, fallback = DEFAULT_STEP_REACH) {
  const fallbackSource = Number.isFinite(Number(fallback))
    ? { backward: Number(fallback), forward: Number(fallback), linked: true }
    : fallback && typeof fallback === "object"
      ? fallback
      : DEFAULT_STEP_REACH;
  const fallbackBackward = normalizeReachSeconds(fallbackSource.backward, 10);
  const fallbackForward = normalizeReachSeconds(fallbackSource.forward, fallbackBackward);

  if (Number.isFinite(Number(value))) {
    const reach = normalizeReachSeconds(value, fallbackForward);
    return { backward: reach, forward: reach, linked: true };
  }

  const source = value && typeof value === "object" ? value : fallbackSource;
  const linked = source.linked !== false;
  let backward = normalizeReachSeconds(source.backward, fallbackBackward);
  let forward = normalizeReachSeconds(source.forward, fallbackForward);

  // Linked Reach has one value. Forward is used only to salvage malformed
  // persisted objects; normal UI linking supplies equal directional values.
  if (linked) {
    const reach = Number.isFinite(Number(source.forward))
      ? normalizeReachSeconds(source.forward, fallbackForward)
      : normalizeReachSeconds(source.backward, fallbackBackward);
    backward = reach;
    forward = reach;
  }

  return { backward, forward, linked };
}'''
session = session[:start] + normalizer + session[end:]
write("session.js", session)


# One preference lifecycle across Return, reload, and video replacement.
app = read("app.js")
anchor = "const NATIVE_POSITION_TOLERANCE_SECONDS = 0.25;\n"
addition = '''const NATIVE_POSITION_TOLERANCE_SECONDS = 0.25;
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

function normalizeLastStepReachEdited(value) {
  return value === "backward" ? "backward" : "forward";
}
'''
if app.count(anchor) != 1:
    raise RuntimeError("app constants anchor")
app = app.replace(anchor, addition, 1)

start, end = function_block(app, "readPreferences")
read_preferences = '''function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null");
    const legacyStep = Number.isFinite(Number(value?.stepSeconds))
      ? Number(value.stepSeconds)
      : 10;
    return {
      contextSeconds: [0, 3, 5, 10].includes(Number(value?.contextSeconds))
        ? Number(value.contextSeconds)
        : 5,
      stepReach: normalizeStepReach(value?.stepReach ?? legacyStep),
      stepReachLastEdited: normalizeLastStepReachEdited(value?.stepReachLastEdited),
      fieldResponse: normalizeFieldResponse(value?.fieldResponse),
      stepFieldEnabled: value?.stepFieldEnabled !== false,
      tailVisible: value?.tailVisible !== false,
      leadVisible: value?.leadVisible !== false
    };
  } catch {
    return {
      contextSeconds: 5,
      stepReach: normalizeStepReach(10),
      stepReachLastEdited: "forward",
      fieldResponse: { ...DEFAULT_FIELD_RESPONSE },
      stepFieldEnabled: true,
      tailVisible: true,
      leadVisible: true
    };
  }
}
'''
app = app[:start] + read_preferences + app[end:]
app = app.replace(
    '  lastStepReachEdited: "forward",',
    "  lastStepReachEdited: preferences.stepReachLastEdited,",
    1
)
app = app.replace(
    "  fieldResponse: { ...preferences.fieldResponse },",
    "  fieldResponse: normalizeFieldResponse(preferences.fieldResponse),",
    1
)

start, end = function_block(app, "persistPreferences")
persist = '''function persistPreferences() {
  try {
    preferences.stepReach = normalizeStepReach(
      model()?.stepReach ?? preferences.stepReach,
      preferences.stepReach
    );
    preferences.stepReachLastEdited = normalizeLastStepReachEdited(state.lastStepReachEdited);
    preferences.fieldResponse = normalizeFieldResponse(state.fieldResponse);
    preferences.contextSeconds = state.contextSeconds;
    preferences.stepFieldEnabled = state.stepFieldEnabled;
    preferences.tailVisible = state.tailVisible;
    preferences.leadVisible = state.leadVisible;

    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      contextSeconds: preferences.contextSeconds,
      stepReach: preferences.stepReach,
      stepReachLastEdited: preferences.stepReachLastEdited,
      fieldResponse: preferences.fieldResponse,
      stepFieldEnabled: preferences.stepFieldEnabled,
      tailVisible: preferences.tailVisible,
      leadVisible: preferences.leadVisible
    }));
  } catch (error) {
    console.warn("Could not save preferences:", error);
  }
}
'''
app = app[:start] + persist + app[end:]

start, end = function_block(app, "returnLastAction")
block = app[start:end]
needle = "state.session = result.session;"
if needle not in block:
    raise RuntimeError("Return session assignment")
block = block.replace(needle, needle + "\n  persistPreferences();", 1)
app = app[:start] + block + app[end:]

old = '''      if (Object.hasOwn(patch, "tailRate") && Number.isFinite(Number(patch.tailRate))) {
        state.fieldResponse.tailRate = Number(patch.tailRate);
      }
      if (Object.hasOwn(patch, "leadRate") && Number.isFinite(Number(patch.leadRate))) {
        state.fieldResponse.leadRate = Number(patch.leadRate);
      }
      persistPreferences();'''
new = '''      if (Object.hasOwn(patch, "tailRate") || Object.hasOwn(patch, "leadRate")) {
        state.fieldResponse = normalizeFieldResponse({ ...state.fieldResponse, ...patch });
      }
      persistPreferences();'''
if app.count(old) != 1:
    raise RuntimeError("Field response patch block")
app = app.replace(old, new, 1)
write("app.js", app)


# Rate changes are kinetic; visibility and enablement are structural.
field = read("step-field.js")
insert_at = field.index("\nexport function createStepFieldController(")
helper = '''
export function fieldPreferenceRequiresEstablish(patch) {
  return ["stepFieldEnabled", "tailVisible", "leadVisible"]
    .some(key => Object.hasOwn(patch || {}, key));
}
'''
field = field[:insert_at] + helper + field[insert_at:]
old = '''  function changePreferences(patch) {
    setPreferences?.(patch);
    runtime.forceEstablish = true;
  }'''
new = '''  function changePreferences(patch) {
    setPreferences?.(patch);
    if (fieldPreferenceRequiresEstablish(patch)) runtime.forceEstablish = true;
  }'''
if field.count(old) != 1:
    raise RuntimeError("changePreferences block")
field = field.replace(old, new, 1)
write("step-field.js", field)


# Clarify the primary three-player transport without adding visible instructions.
html = read("index.html")
old = '<button id="continue" class="field-transport" type="button" aria-keyshortcuts="Space" disabled>'
new = '<button id="continue" class="field-transport" type="button" aria-keyshortcuts="Space" aria-describedby="field-transport-help" title="Continue or pause Center and available Field panes" disabled>'
if html.count(old) != 1:
    raise RuntimeError("Continue button anchor")
html = html.replace(old, new, 1)
old = '          <div class="field-transport-bar" aria-label="Field transport">\n'
new = '          <div class="field-transport-bar" aria-label="Field transport">\n            <span id="field-transport-help" class="sr-only">Continue controls Center and any available Tail and Lead panes. Native Center controls remain available.</span>\n'
if html.count(old) != 1:
    raise RuntimeError("Field transport bar anchor")
html = html.replace(old, new, 1)
write("index.html", html)


# Regression and documentation coherence contracts.
tests = read("field-coherence-tests.mjs")
tests = tests.replace(
    '  normalizeStepReach\n} from "./session.js";',
    '  normalizeStepReach,\n  MIN_STEP_REACH_SECONDS,\n  MAX_STEP_REACH_SECONDS\n} from "./session.js";',
    1
)
tests = tests.replace(
    '  deriveFieldBounds,\n  chooseDirectionalRate\n} from "./step-field.js";',
    '  deriveFieldBounds,\n  chooseDirectionalRate,\n  fieldPreferenceRequiresEstablish,\n  createStepFieldController\n} from "./step-field.js";',
    1
)
anchor = '''assert.deepEqual(normalizeDirectionalReach({
  backward: 5,
  forward: 15,
  linked: false
}), {
  backward: 5,
  forward: 15,
  linked: false
});
'''
addition = anchor + '''assert.deepEqual(normalizeStepReach({ backward: 5, forward: 15, linked: true }), {
  backward: 15,
  forward: 15,
  linked: true
}, "Linked Reach is one canonical value.");
assert.deepEqual(normalizeStepReach({ backward: 0.01, forward: 900, linked: false }), {
  backward: MIN_STEP_REACH_SECONDS,
  forward: MAX_STEP_REACH_SECONDS,
  linked: false
}, "Reach normalization owns the same bounds as the UI.");
assert.equal(fieldPreferenceRequiresEstablish({ tailRate: 0.75 }), false);
assert.equal(fieldPreferenceRequiresEstablish({ leadRate: 1.5 }), false);
assert.equal(fieldPreferenceRequiresEstablish({ tailVisible: false }), true);
assert.equal(fieldPreferenceRequiresEstablish({ stepFieldEnabled: false }), true);
'''
if tests.count(anchor) != 1:
    raise RuntimeError("normalization test anchor")
tests = tests.replace(anchor, addition, 1)

compat = '''{
  const originalYT = globalThis.YT;
  globalThis.YT = { Player() {} };
  let created = 0;
  const element = () => ({
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    dataset: {},
    classList: { toggle() {} },
    addEventListener() {},
    setAttribute() {},
    replaceChildren() {},
    appendChild() {}
  });
  const elements = new Map();
  const document = {
    hidden: false,
    createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  };
  const controller = createStepFieldController({
    document,
    getSnapshot: () => ({
      videoLoaded: true,
      videoId: "single-player-contract",
      current: 50,
      range: { start: 0, end: 100 },
      stepReach: { backward: 10, forward: 10, linked: true },
      transportKind: "continue",
      center: { time: 50, rate: 1, state: 1, availableRates: [0.5, 1, 2] }
    }),
    getPreferences: () => ({
      stepFieldEnabled: false,
      tailVisible: true,
      leadVisible: true,
      tailRate: 0.5,
      leadRate: 2
    }),
    createPlayer: () => { created += 1; return null; }
  });
  controller.tick();
  assert.equal(controller.play(), false);
  assert.equal(created, 0, "Disabling Step Field preserves the single-player reader boundary.");
  globalThis.YT = originalYT;
}

'''
marker = 'assert.equal(chooseDirectionalRate([1], 2, "lead"), null);\n\n'
if tests.count(marker) != 1:
    raise RuntimeError("rate test marker")
tests = tests.replace(marker, marker + compat, 1)
old = '''  const field = readFileSync("step-field.js", "utf8");
  const view = readFileSync("view.js", "utf8");'''
new = '''  const field = readFileSync("step-field.js", "utf8");
  const view = readFileSync("view.js", "utf8");
  const implementation = readFileSync("IMPLEMENTATION.md", "utf8");
  const readme = readFileSync("README.md", "utf8");'''
if tests.count(old) != 1:
    raise RuntimeError("static test reads")
tests = tests.replace(old, new, 1)
insert = '''  assert.match(app, /stepReachLastEdited: preferences\.stepReachLastEdited/);
  assert.match(app, /preferences\.stepReach = normalizeStepReach/);
  assert.match(implementation, /^# Binary YouTube Reader v5\.5\.1/m);
  assert.doesNotMatch(implementation, /sole visible Continue\/Pause authority/);
  assert.doesNotMatch(implementation, /^# Binary YouTube Reader v5\.1/m);
  assert.doesNotMatch(readme, /Step Size/);
  assert.match(readme, /Application Continue/);
'''
marker = '  assert.match(view, /session\\.model\\.stepReach/);\n'
if tests.count(marker) != 1:
    raise RuntimeError("static assertion marker")
tests = tests.replace(marker, marker + insert, 1)
write("field-coherence-tests.mjs", tests)


implementation = r'''# Binary YouTube Reader v5.5.1 — Canonical Implementation

## 1. Design rule

Binary YouTube Reader is one temporal navigation system, not a collection of independent playback features.

```text
Address → Current inside Range
Current + Resolution → Neighborhood
movement → Interval
explicit Address → Pin
explicit Extent → Section
Section → Range through Focus
```

The three-pane Step Field projects that model physically. It does not create a second semantic timeline.

The design target is Vim-like compositional depth: a compact set of precise operators, stable operands, and predictable composition. Depth comes from combining operators, not from adding modes with overlapping meanings.

## 2. Canonical objects

| Object | Meaning | Owner |
|---|---|---|
| Address | A time in the video | geometry |
| Current | The committed semantic Address | Session |
| Cursor | A transient player position | transport/player |
| Range | The only hard admissible time domain | Session |
| Resolution | The current semantic scale | Session |
| Neighborhood | The left/current/right structure at Resolution | Session |
| Interval | The last committed movement extent | Session |
| Pin | A retained Address | Guide |
| Section | A retained explicit Extent | Guide |
| Field Span | The live Tail-to-Lead physical extent | Step Field |

Current and Cursor are deliberately distinct. Physical playback may move a Cursor without committing Current until transport settlement.

## 3. Operators

### Semantic navigation

| Operator | Operand | Result |
|---|---|---|
| Refine Backward / Forward | Neighborhood side | commits the selected child Current and Resolution |
| Reopen | Resolution | returns to Range-level Resolution |
| Step Backward / Forward | directional Reach | commits bounded movement and Interval |
| Return | Session history | restores one complete semantic checkpoint |
| Go | Address | commits direct placement through Session |

### Observation and traversal

| Operator | Operand | Result |
|---|---|---|
| Context | Current | bounded observation; restores Current on settlement |
| Continue | Current through Range | continuous traversal; commits settlement Cursor |
| Skim | forward Range remainder | accelerated traversal followed by Continue |
| Loop | captured Interval or Field Span | observes immutable captured boundaries |

### Retention and scope

| Operator | Operand | Result |
|---|---|---|
| Pin Current | Current | creates or reuses a Pin |
| Save Section | Interval or Field Span | retains one explicit Extent |
| Focus | Section | installs that Section as Range |
| Leave Focus | focused Range | restores the preceding Range |

No operator privately redefines another operator's operand.

## 4. Semantic state and ownership

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

Directional Reach is semantic because it changes Step destinations and Field targets. It is included in Session snapshots and restored by Return.

```text
linked = true  ⇒  backward = forward
0.25s ≤ backward, forward ≤ 300s
```

Malformed persisted values are normalized before entering Session. If an invalid linked object contains unequal values, Forward is the deterministic salvage source; normal UI linking always supplies equal values.

Tail and Lead playback rates are physical preferences. They affect formation kinetics, not semantic destinations, and are not Returnable.

## 5. Step Field

```text
Tail   ← Current →   Lead
slower     1×        faster
muted   audible      muted
```

Center remains authoritative for sound, native media controls, semantic settlement, and transport reconciliation. Tail and Lead cannot commit Current directly.

### Geometry

```text
Tail target = max(Range Start, Current − Backward Reach)
Lead target = min(Range End, Current + Forward Reach)
```

Resolution does not clip the Field. Range is its only hard boundary.

### Phases

```text
Off → Coincident → Unfolding → Partially Held → Held
                         ↘ Suspended ↗
```

A forming side resolves through Go to its observed Cursor. A Held side resolves through directional Step to the semantic target.

### Response

Each side reads its own available rate set. Tail accepts rates below 1×; Lead accepts rates above 1×. Requested and actual rates remain distinct. Missing directional rates produce an unavailable side; autoplay rejection produces a blocked side.

Changing a rate is kinetic: it preserves Field geometry and changes subsequent motion. Visibility and Field-enabled changes are structural and re-establish the projection.

## 6. Transport authority

**Application Continue** is the authoritative three-pane start gesture:

```text
settle prior transport
→ establish Continue
→ prepare available Tail and Lead
→ request side playback
→ start Center
→ verify actual states
```

Native Center Play remains supported. Its later application event makes side activation best effort under browser autoplay policy. The interface reports partial or blocked state rather than treating both paths as physically identical.

When Step Field is disabled, Continue and every stable single-player operator remain valid. No side player is created, and the reader is observationally equivalent to the pre-Field application.

## 7. Suspension and settlement

Context, Skim, Loop, pending Step, Range manipulation, and document hiding suspend or settle the Field according to transport ownership. Continue permits differential formation.

Range mutation, Focus, Leave Focus, Refine, Return, and committed movement invalidate stale side geometry and derive a new Field from the resulting semantic model.

Loop captures scalar boundaries once. Later Field or Range changes cannot mutate its active extent.

## 8. Persistence and migration

```js
{
  contextSeconds,
  stepReach,
  stepReachLastEdited,
  fieldResponse,
  stepFieldEnabled,
  tailVisible,
  leadVisible
}
```

Legacy `stepSeconds` migrates to equal linked Reach. Active Session Reach becomes the default for the next loaded video. Return updates that default when it restores a preceding Reach.

Guide data remains video-specific. Actual rates, buffering, blocked state, Cursors, and Field phases are runtime-only.

## 9. Module boundaries

| Module | Responsibility |
|---|---|
| `range-geometry.js` | pure Range, Resolution, Neighborhood, Step, and preview geometry |
| `session.js` | immutable semantic transactions and Return history |
| `transport.js` | transient Context, Continue, Skim, and Loop values |
| `youtube.js` | the only raw IFrame API boundary |
| `step-field-geometry.js` | pure Field targets, phases, constraints, and rate selection |
| `step-field.js` | muted Tail/Lead execution and Field presentation state |
| `guide.js` | Pins, Sections, Focus references, migration, and validation |
| `source-field.js` | normalized external temporal records |
| `view.js` | presentation and control enablement only |
| `app.js` | operator composition, lifecycle, persistence, and dependency wiring |

```text
user intention
→ settle incompatible transient state
→ Session transaction or observation transport
→ derive physical effects
→ execute through adapters
→ render one truthful state
```

## 10. Interface grammar

The interface mirrors the operator geometry:

```text
Backward | shared spine | Forward
```

```text
W / A / S / D = Reopen / Refine Backward / Return / Refine Forward
← / →         = Step Backward / Step Forward
[ / ]         = decrease / increase linked Reach preset
Space         = Continue / Pause
C             = Context
F             = Skim
L             = Loop
P             = Pin Current
Shift+P       = Save Section
Shift+← / →   = previous / next Pin
```

Inputs suspend global shortcuts. Space does not double-activate a focused native button or summary. Code, controls, statuses, and documentation use the same vocabulary.

## 11. Verification

`npm run check` covers runtime syntax, geometry, Guide, Session, transport, source normalization, 25,000 deterministic semantic operations, stable-reader regressions, Step Field grammar and bounds, directional Reach and response coherence, DOM/accessibility/layout integration, and startup/interaction/Context/metadata smoke paths.

A real-browser IFrame pass remains mandatory before merge. It must exercise multiple videos, per-video rates, buffering, native controls, Application Continue, autoplay blocking, hidden panes, fullscreen, and video replacement.

## 12. Retired contracts

The following are historical, not current:

- one scalar Step size;
- fixed Tail 0.5× and Lead 2× as unchangeable behavior;
- Resolution as a physical Field boundary;
- native Center Play as the sole application transport control;
- side Cursors as semantic history;
- Field Span as an implicit Session Interval;
- cumulative version notes that contradict current architecture.

Documentation states the current system. Git history retains implementation chronology.
'''
write("IMPLEMENTATION.md", implementation)


readme = r'''# Binary YouTube Reader

Binary YouTube Reader is a spatial-temporal interface for navigating long YouTube videos through a small composable operator set.

The reader keeps one semantic model—Current inside Range at a Resolution—and lets Refine, Step, Continue, Context, Skim, Loop, Return, Pin, Section, and Focus act on it predictably. The three-pane Step Field adds Tail and Lead projections without replacing the stable Center-player grammar.

## Run

Serve the repository as a static site and open `index.html` through that server. The YouTube IFrame API requires a normal browser origin and network access.

```bash
npm test
npm run check
```

Node 20 or newer is required for repository checks.

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

## Operators

| Operator | Effect |
|---|---|
| Refine Backward / Forward | select one side of the current Neighborhood |
| Reopen | return to Range-level Resolution |
| Step Backward / Forward | move by configured directional Reach |
| Return | restore one complete semantic checkpoint |
| Continue | traverse forward and commit on settlement |
| Context | observe around Current without committing movement |
| Skim | accelerate toward the forward boundary, then Continue |
| Loop | repeat a captured Interval or Held Field Span |
| Pin Current | retain an Address |
| Save Section | retain an explicit Extent |
| Focus / Leave Focus | install or restore Range scope |

The operators compose. Focus changes Range; Refine discriminates inside it; Step moves by directional Reach; Continue traverses from the resulting Current; Return restores the preceding semantic state.

## Step Field

```text
Tail   ← Current →   Lead
slower     1×        faster
muted   audible      muted
```

Backward and Forward Reach can be linked or independent. Tail and Lead rates are selected from the actual rates available to each YouTube player.

**Application Continue** is the authoritative three-pane start control. Native Center controls remain available, but browser policy may allow Center while blocking a side player; the Field reports blocked or unavailable sides explicitly.

Center is always the only audible and semantic player. Disabling Step Field preserves the original single-player reader and does not create side players.

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

## Persistence

Guide records are stored per video. Reader preferences include directional Reach, the last edited Reach side, Tail and Lead response preferences, Field visibility, and observation settings. Legacy scalar `stepSeconds` migrates to equal linked Reach.

Current Session Reach becomes the default for the next video. Return restores Reach with Session and updates that default.

## Architecture

The code separates pure geometry, immutable semantic transactions, transient transport, YouTube adapters, Step Field execution, Guide retention, and presentation. `IMPLEMENTATION.md` is the canonical architecture and operational matrix.

## Validation status

The automated suite covers the stable pre-Field reader, directional Reach, Field bounds, response selection, persistence contracts, accessibility, integration, startup, and interaction smoke paths.

A real desktop-browser pass with actual YouTube videos is still required before merge. It must verify per-video rates, simultaneous playback, buffering, native controls, autoplay blocking, hidden panes, fullscreen, and video replacement.
'''
write("README.md", readme)

package = read("package.json")
if '"version": "5.5.0"' not in package:
    raise RuntimeError("package version")
write("package.json", package.replace('"version": "5.5.0"', '"version": "5.5.1"', 1))

# Successful workflow commits only the product tree.
for name in [
    ".github/workflows/consolidate-field-coherence-v5.5.1.yml",
    ".github/workflows/field-coherence-consolidation-v5.5.1-run.yml",
    ".github/consolidate-field-coherence-v5.5.1.py"
]:
    path = ROOT / name
    if path.exists():
        path.unlink()
