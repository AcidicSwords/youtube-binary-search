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
    '''        onReady: adapter => {
          side.ready = true;
          side.error = false;
          adapter.mute?.();
          runtime.forceEstablish = true;
        },''',
    '''        onReady: adapter => {
          side.ready = true;
          side.error = false;
          adapter.mute?.();
          const iframe = adapter.raw?.()?.getIframe?.();
          iframe?.setAttribute?.("tabindex", "-1");
          iframe?.setAttribute?.("aria-hidden", "true");
          runtime.forceEstablish = true;
        },''',
    "side iframe accessibility",
)
write("step-field.js", field)

tests = read("step-field-tests.mjs")
tests = replace_once(
    tests,
    '''  const app = readFileSync("app.js", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));''',
    '''  const app = readFileSync("app.js", "utf8");
  const fieldSource = readFileSync("step-field.js", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));''',
    "Step Field source fixture",
)
tests = replace_once(
    tests,
    '''  assert.match(app, /onStep:\s*performStep/);
  assert.doesNotMatch(app, /Recenter(?: Tail| Lead)?/i);''',
    '''  assert.match(app, /onStep:\s*performStep/);
  assert.doesNotMatch(app, /Recenter(?: Tail| Lead)?/i);
  assert.match(fieldSource, /setAttribute\?\.\("tabindex", "-1"\)/);
  assert.match(fieldSource, /setAttribute\?\.\("aria-hidden", "true"\)/);''',
    "side iframe accessibility checks",
)
write("step-field-tests.mjs", tests)

print("Applied Step Field side-iframe accessibility audit.")
