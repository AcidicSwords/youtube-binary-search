from pathlib import Path

path = Path("project-audit.mjs")
text = path.read_text()
old = '  assert.match(docs["README.md"], new RegExp(`\\`${name.replace(".", "\\\\.")}\\``), `README must link ${name}`);'
new = '  assert.equal(docs["README.md"].includes("`" + name + "`"), true, `README must link ${name}`);'
if text.count(old) != 1:
    raise RuntimeError("README documentation-map assertion anchor")
path.write_text(text.replace(old, new, 1))
Path(".github/stabilize-repository-v5.6.0-fix4.py").unlink()
