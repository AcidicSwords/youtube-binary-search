from pathlib import Path
import re

names = [
    "observation-dock",
    "context-control",
    "compact-select",
    "observation-button",
    "skim-speed",
    "rate-setting",
    "fixed-rate"
]
removed = 0
for filename in ["styles.css", "step-field.css", "field-grammar.css"]:
    path = Path(filename)
    text = path.read_text()
    for name in names:
        pattern = rf"\n\s*\.{re.escape(name)}[^{{]*\{{[^{{}}]*\}}"
        text, count = re.subn(pattern, "", text)
        removed += count
    path.write_text(text)

if removed == 0:
    raise RuntimeError("No residual dead CSS rules found")
Path(".github/stabilize-repository-v5.6.0-fix6.py").unlink()
