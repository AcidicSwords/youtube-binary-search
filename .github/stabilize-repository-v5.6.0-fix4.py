from pathlib import Path

path = Path("project-audit.mjs")
lines = path.read_text().splitlines()
prefix = '  assert.match(docs["README.md"], new RegExp('
replacement = '  assert.equal(docs["README.md"].includes("`" + name + "`"), true, `README must link ${name}`);'
matches = [index for index, line in enumerate(lines) if line.startswith(prefix)]
if len(matches) != 1:
    raise RuntimeError(f"README documentation-map assertion anchor: {len(matches)} matches")
lines[matches[0]] = replacement
path.write_text("\n".join(lines) + "\n")
Path(".github/stabilize-repository-v5.6.0-fix4.py").unlink()
