from pathlib import Path

path = Path("field-coherence-tests.mjs")
text = path.read_text()
old = '''  assert.match(field, /tailRate: 0\.5/);
  assert.match(field, /leadRate: 2/);'''
new = '''  assert.match(field, /DEFAULT_FIELD_RESPONSE/);
  assert.doesNotMatch(field, /tailRate: 0\.5/);
  assert.doesNotMatch(field, /leadRate: 2/);'''
if text.count(old) != 1:
    raise RuntimeError("Field response ownership assertion anchor")
path.write_text(text.replace(old, new, 1))
Path(".github/stabilize-repository-v5.6.0-fix3.py").unlink()
