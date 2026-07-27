from pathlib import Path
import re

ROOT = Path.cwd()
updated = 0
for path in ROOT.glob("*-tests.mjs"):
    text = path.read_text()
    def replace(match):
        global updated
        updated += 1
        current, reach = match.group(1), match.group(2)
        return f"deriveStepField({current}, {{ backward: {reach}, forward: {reach}, linked: true }}, "
    text = re.sub(r"deriveStepField\(([^,\n]+),\s*([0-9]+(?:\.[0-9]+)?),\s*", replace, text)
    path.write_text(text)

if updated == 0:
    raise RuntimeError("No scalar deriveStepField test calls found")

Path(".github/stabilize-repository-v5.6.0-fix.py").unlink()
