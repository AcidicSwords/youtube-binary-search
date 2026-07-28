import json
from pathlib import Path

pkg = json.loads(Path("package.json").read_text())
if pkg.get("version") != "5.8.5":
    raise SystemExit(f"Expected v5.8.5 product tree, found {pkg.get('version')}")

source = Path("step-field.js").read_text()
required = [
    "sourceReady: false",
    "ratesKnown: false",
    "pendingPlay: false",
    "if (name === YOUTUBE_STATE.CUED)",
    "if (play && side.sourceReady)",
    "if (rate === null && !side.ratesKnown)",
    "side.adapter.cue?.(snapshot.videoId, snapshot.current)"
]
for marker in required:
    if marker not in source:
        raise SystemExit(f"Missing v5.8.5 runtime marker: {marker}")

if "if (side.activated) side.adapter?.place?.(center);" in source:
    raise SystemExit("Old cue/play startup race remains in beginStretch")
