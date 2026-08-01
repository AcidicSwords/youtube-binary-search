from pathlib import Path

# Keep the existing interaction smoke test aligned with the corrected visible
# unit; this changes only the expected presentation, not the interaction.
path = Path(__file__).resolve().parents[1] / "interaction-smoke.mjs"
text = path.read_text(encoding="utf-8")
old = "10s manual"
new = "10 map units manual"
if text.count(old) != 1:
    raise RuntimeError(f"interaction-smoke.mjs: expected one {old!r} assertion")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
