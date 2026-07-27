from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace_once(content, before, after, label):
    count = content.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return content.replace(before, after, 1)


step_field = read("step-field.js")
step_field = replace_once(
    step_field,
    '''  function ensurePlayers() {
    createSide("tail");
    createSide("lead");
  }''',
    '''  function ensurePlayers(prefs) {
    if (!prefs.stepFieldEnabled) return;
    if (prefs.tailVisible) createSide("tail");
    if (prefs.leadVisible) createSide("lead");
  }''',
    "lazy side-player creation",
)
step_field = replace_once(
    step_field,
    '''  function tick() {
    ensurePlayers();
    const snapshot = getSnapshot?.();
    if (!snapshot || !snapshot.range) return;
    syncVideo(snapshot);

    const prefs = preferences();''',
    '''  function tick() {
    const prefs = preferences();
    ensurePlayers(prefs);
    const snapshot = getSnapshot?.();
    if (!snapshot || !snapshot.range) return;
    syncVideo(snapshot);''',
    "preference-aware Step Field polling",
)
write("step-field.js", step_field)

readme = read("README.md")
old_interface = '''## Interface

On wide desktop screens, the interface forms three adjacent working zones:

```text
Video + temporal map | Navigation grammar | Guide
```

This keeps the principal mouse paths short:

- observation remains directly beneath the video;
- Navigation remains beside the video and above the fold;
- Pins and Sections remain immediately beside Navigation in the sticky Guide;
- backward operations align on the left, shared operations on the centre spine, and forward operations on the right.

The central Navigation spine is:

```text
Reopen
Return
Step size
Pin Current
Pins
```

On mobile, the same grammar is preserved while Guide becomes an off-canvas sheet. Controls suppress accidental double-tap zoom without disabling intentional page zoom, and the timeline preserves vertical page scrolling.
'''
new_interface = '''## Interface

On wide desktop screens, the Guide remains the only side rail while the reader uses the available width for the Step Field:

```text
Step Field                         | Guide
Observation                        | Guide
Temporal map | Navigation grammar  | Guide
Secondary tools                    | Guide
```

Center is larger and authoritative. Tail and Lead are smaller, visually separated, muted, and independently collapsible. The Field adds only one compact Center-level toggle and one collapse control per side; existing Step buttons and Arrow keys remain the labelled and repeatable forms of the same operators.

Backward operations remain left, shared operations remain on the centre spine, and Forward operations remain right. On mobile, Center occupies the first full row and the optional side projections become compact cards beneath it while Guide remains an off-canvas sheet. Controls suppress accidental double-tap zoom without disabling intentional page zoom, and the timeline preserves vertical page scrolling.
'''
readme = replace_once(readme, old_interface, new_interface, "README interface section")
readme = replace_once(
    readme,
    '''transport.js       transient Context, Continue, Skim, and Loop execution
youtube.js         sole raw YouTube IFrame adapter''',
    '''transport.js       transient Context, Continue, Skim, and Loop execution
step-field.js      transient Tail/Center/Lead projection and side-player synchronization
youtube.js         sole raw YouTube IFrame adapter''',
    "README architecture list",
)
write("README.md", readme)

tests = '''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STEP_FIELD_PHASE,
  deriveStepField,
  chooseNearestRate,
  hasCenterDiscontinuity,
  resolveFieldPhase
} from "./step-field.js";

{
  const field = deriveStepField(50, 10, { start: 0, end: 100 });
  assert.deepEqual(field, {
    center: 50,
    tail: { target: 40, distance: 10, available: true },
    lead: { target: 60, distance: 10, available: true }
  });
}

{
  const field = deriveStepField(4, 10, { start: 0, end: 12 });
  assert.equal(field.tail.target, 0);
  assert.equal(field.tail.distance, 4);
  assert.equal(field.lead.target, 12);
  assert.equal(field.lead.distance, 8);
}

assert.equal(chooseNearestRate([0.25, 0.5, 1, 1.5, 2], 0.5), 0.5);
assert.equal(chooseNearestRate([1, 1.25, 1.5], 2), 1.5);
assert.equal(chooseNearestRate([], 2), 1);

assert.equal(hasCenterDiscontinuity(10, 10.1), false);
assert.equal(hasCenterDiscontinuity(10, 6), true);
assert.equal(hasCenterDiscontinuity(10, 13), true);

assert.equal(resolveFieldPhase({ enabled: false, suspended: false, sides: [] }), STEP_FIELD_PHASE.OFF);
assert.equal(resolveFieldPhase({ enabled: true, suspended: true, sides: [] }), STEP_FIELD_PHASE.SUSPENDED);
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: false, offset: 2 },
    { visible: true, available: true, held: false, offset: 3 }
  ]
}), STEP_FIELD_PHASE.UNFOLDING);
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 10 },
    { visible: true, available: true, held: false, offset: 6 }
  ]
}), STEP_FIELD_PHASE.PARTIAL);
assert.equal(resolveFieldPhase({
  enabled: true,
  suspended: false,
  sides: [
    { visible: true, available: true, held: true, offset: 10 },
    { visible: true, available: true, held: true, offset: 10 }
  ]
}), STEP_FIELD_PHASE.HELD);

{
  const html = readFileSync("index.html", "utf8");
  const css = readFileSync("step-field.css", "utf8");
  const app = readFileSync("app.js", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  for (const id of [
    "step-field", "player-tail", "player", "player-lead", "tail-step", "lead-step",
    "tail-collapse", "lead-collapse", "tail-restore", "lead-restore", "step-field-toggle"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing Step Field DOM id: ${id}`);
  }

  assert.match(app, /createStepFieldController/);
  assert.match(app, /onStep:\s*performStep/);
  assert.doesNotMatch(app, /Recenter(?: Tail| Lead)?/i);
  assert.match(css, /\.step-field\.field-off/);
  assert.match(css, /tail-collapsed/);
  assert.match(css, /lead-collapsed/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(min-width: 1221px\)/);
  assert.match(packageJson.scripts.check, /step-field\.js/);
  assert.match(packageJson.scripts.test, /step-field-tests\.mjs/);
}

console.log("All Step Field tests passed.");
'''
write("step-field-tests.mjs", tests)

print("Applied final Step Field resource and documentation audit.")
