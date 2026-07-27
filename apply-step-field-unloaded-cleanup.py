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


field = read("step-field.js")
field = replace_once(
    field,
    '''    const root = elements["step-field"];
    root.classList.toggle("field-off", !prefs.stepFieldEnabled);''',
    '''    const root = elements["step-field"];
    const fieldShown = loaded && prefs.stepFieldEnabled;
    root.classList.toggle("field-off", !fieldShown);''',
    "loaded Field visibility",
)
field = replace_once(
    field,
    '''    elements["step-field-toggle"]?.setAttribute?.("aria-pressed", String(prefs.stepFieldEnabled));
    elements["step-field-toggle"]?.setAttribute?.("aria-label", `${prefs.stepFieldEnabled ? "Hide" : "Show"} Step Field`);
    setText(elements["step-field-meta"], prefs.stepFieldEnabled
      ? runtime.phase === STEP_FIELD_PHASE.PARTIAL ? "Partial"
        : runtime.phase === STEP_FIELD_PHASE.HELD ? "Held"
          : runtime.phase === STEP_FIELD_PHASE.UNFOLDING ? "Unfolding"
            : runtime.phase === STEP_FIELD_PHASE.SUSPENDED ? "Suspended"
              : "Ready"
      : "Off");''',
    '''    if (elements["step-field-toggle"]) elements["step-field-toggle"].disabled = !loaded;
    elements["step-field-toggle"]?.setAttribute?.("aria-pressed", String(fieldShown));
    elements["step-field-toggle"]?.setAttribute?.("aria-label", `${fieldShown ? "Hide" : "Show"} Step Field`);
    setText(elements["step-field-meta"], !loaded
      ? "Load video"
      : prefs.stepFieldEnabled
        ? runtime.phase === STEP_FIELD_PHASE.PARTIAL ? "Partial"
          : runtime.phase === STEP_FIELD_PHASE.HELD ? "Held"
            : runtime.phase === STEP_FIELD_PHASE.UNFOLDING ? "Unfolding"
              : runtime.phase === STEP_FIELD_PHASE.SUSPENDED ? "Suspended"
                : "Ready"
        : "Off");''',
    "unloaded Field control",
)
field = replace_once(
    field,
    '''  function tick() {
    const prefs = preferences();
    ensurePlayers(prefs);
    const snapshot = getSnapshot?.();
    if (!snapshot || !snapshot.range) return;
    syncVideo(snapshot);''',
    '''  function tick() {
    const prefs = preferences();
    const snapshot = getSnapshot?.();
    if (!snapshot || !snapshot.range) return;
    if (snapshot.videoLoaded) ensurePlayers(prefs);
    syncVideo(snapshot);''',
    "lazy unloaded player creation",
)
write("step-field.js", field)

tests = read("step-field-tests.mjs")
tests = replace_once(
    tests,
    '''  assert.match(fieldSource, /setAttribute\?\.\("aria-hidden", "true"\)/);
  assert.match(css, /\.step-field\.field-off/);''',
    '''  assert.match(fieldSource, /setAttribute\?\.\("aria-hidden", "true"\)/);
  assert.match(fieldSource, /const fieldShown = loaded && prefs\.stepFieldEnabled/);
  assert.match(fieldSource, /if \(snapshot\.videoLoaded\) ensurePlayers\(prefs\)/);
  assert.match(css, /\.step-field\.field-off/);''',
    "unloaded Field checks",
)
write("step-field-tests.mjs", tests)

print("Applied unloaded Step Field cleanup.")
