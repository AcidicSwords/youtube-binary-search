from pathlib import Path

# Keep existing tests aligned with the corrected visible unit. This changes only
# presentation expectations; every runtime route remains under the same tests.
root = Path(__file__).resolve().parents[1]
old = "10s manual"
new = "10 map units manual"
changed = 0
for path in root.glob("*.mjs"):
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if not count:
        continue
    path.write_text(text.replace(old, new), encoding="utf-8")
    changed += count
if changed < 2:
    raise RuntimeError(f"expected at least two stale {old!r} assertions, found {changed}")
