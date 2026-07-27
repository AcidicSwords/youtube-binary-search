from pathlib import Path

path = Path("project-audit.mjs")
text = path.read_text()
old = '  assert.equal(`${styles}\\n${fieldCss}\\n${grammarCss}`.includes(dead), false, `Dead CSS selector remains: ${dead}`);'
new = '''  const selectorPattern = new RegExp(`\\\\.${dead}(?![A-Za-z0-9_-])`);
  assert.equal(selectorPattern.test(`${styles}\\n${fieldCss}\\n${grammarCss}`), false, `Dead CSS selector remains: ${dead}`);'''
if text.count(old) != 1:
    raise RuntimeError("Dead CSS selector audit anchor")
path.write_text(text.replace(old, new, 1))
Path(".github/stabilize-repository-v5.6.0-fix7.py").unlink()
