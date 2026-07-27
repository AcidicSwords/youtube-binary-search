from pathlib import Path

path = Path("field-coherence-tests.mjs")
text = path.read_text()
old = '  assert.match(fieldCss, /@media \\(pointer: coarse\\)[\\s\\S]*\\.pane-rate-setting select[\\s\\S]*min-height: 44px/);'
new = '  assert.match(fieldCss, /@media \\(pointer: coarse\\)[\\s\\S]*\\.pane-rate-setting select[\\s\\S]*min-height: var\\(--touch\\)/);'
if text.count(old) != 1:
    raise RuntimeError("Touch regression anchor")
path.write_text(text.replace(old, new, 1))
Path(".github/stabilize-repository-v5.6.0-fix2.py").unlink()
