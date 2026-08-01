from __future__ import annotations

import base64
import hashlib
import subprocess
import tempfile
import zlib
from pathlib import Path

COMPRESSED_SHA256 = "0b276c1b29a9ed32693f70f40259c147a95bdb29ac5e131ccc4b26ced36ff138"
PATCH_SHA256 = "50b5e61e8e3f7f305e33eb07ab84de508d0967a1242f64a89885a76e172a7a72"
PARTS = 6


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def main() -> None:
    root = Path(__file__).resolve().parent
    encoded = "".join(
        (root / "coherence_patch" / f"part{index:02d}.txt").read_text(encoding="utf-8")
        for index in range(PARTS)
    )
    compressed = base64.b64decode(encoded, validate=True)
    if hashlib.sha256(compressed).hexdigest() != COMPRESSED_SHA256:
        raise RuntimeError("Compressed patch checksum mismatch")
    patch = zlib.decompress(compressed)
    if hashlib.sha256(patch).hexdigest() != PATCH_SHA256:
        raise RuntimeError("Patch checksum mismatch")

    with tempfile.NamedTemporaryFile(suffix=".patch", delete=False) as handle:
        handle.write(patch)
        patch_path = Path(handle.name)

    try:
        run("git", "apply", "--check", str(patch_path))
        run("git", "apply", str(patch_path))
    finally:
        patch_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
