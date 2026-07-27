#!/usr/bin/env python3
"""Transactional installer for Binary YouTube Reader Field grammar v5.4."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request

RAW_ROOT = (
    "https://raw.githubusercontent.com/AcidicSwords/youtube-binary-search/"
    "feature/field-grammar-v5.4/"
)

# Git blob SHAs pin the package to the reviewed branch content.
ASSETS = {
    "apply-field-grammar-v5.4.py": "044853eaf7f735b7562897fab0d2ea37f83d5171",
    "step-field-geometry.js": "027c060ad2bb83352f3a05683b03421c30275eb4",
    "field-grammar.css": "359b7aa8c1b6e3fc5f5b35c09cfcb0dc7418a9e0",
    "field-grammar-tests.mjs": "2bcc2b363e3b92385effed37ee4032b80f83c981",
    "apply-field-grammar-v5.4-transport-fix.py": "dc9a0b7ade7533d4b4cd11bcf67e9d24f5f46bdc",
}

TOUCHED = [
    "index.html",
    "transport.js",
    "session.js",
    "step-field.js",
    "app.js",
    "view.js",
    "package.json",
    "README.md",
    "IMPLEMENTATION.md",
    "step-field-geometry.js",
    "field-grammar.css",
    "field-grammar-tests.mjs",
]

REQUIRED_BASE = [
    "package.json",
    "index.html",
    "app.js",
    "session.js",
    "transport.js",
    "view.js",
    "step-field.js",
    "range-geometry.js",
]


class InstallError(RuntimeError):
    pass


def run(command: list[str], cwd: Path, *, check: bool = True) -> subprocess.CompletedProcess:
    print("+", " ".join(command))
    return subprocess.run(command, cwd=cwd, text=True, check=check)


def git_blob_sha(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("utf-8")
    return hashlib.sha1(header + data).hexdigest()


def download_asset(name: str) -> bytes:
    url = RAW_ROOT + name
    print(f"Downloading {url}")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "binary-youtube-reader-field-grammar-v5.4"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read()
    actual = git_blob_sha(data)
    expected = ASSETS[name]
    if actual != expected:
        raise InstallError(
            f"{name} failed integrity verification: expected Git blob {expected}, got {actual}."
        )
    return data


def locate_repo(requested: str | None) -> Path:
    candidate = Path(requested or os.getcwd()).expanduser().resolve()
    if candidate.is_file():
        candidate = candidate.parent
    if (candidate / "package.json").exists():
        return candidate
    raise InstallError(
        f"{candidate} is not the Binary YouTube Reader repository root "
        "(package.json was not found)."
    )


def assert_base(repo: Path) -> None:
    missing = [name for name in REQUIRED_BASE if not (repo / name).exists()]
    if missing:
        raise InstallError("Required base files are missing: " + ", ".join(missing))

    package = (repo / "package.json").read_text(encoding="utf-8")
    if '"name": "binary-youtube-reader"' not in package:
        raise InstallError("package.json does not identify Binary YouTube Reader.")

    # The applicator is intentionally anchored to the audited v5.3 Step Field branch.
    if '"version": "5.3.0"' not in package:
        raise InstallError(
            "This package expects Binary YouTube Reader v5.3.0. "
            "Create the branch from feature/step-field-v5.3-final."
        )


def assert_clean_worktree(repo: Path, allow_dirty: bool) -> None:
    if allow_dirty:
        return
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=repo,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0 and result.stdout.strip():
        raise InstallError(
            "The Git worktree is not clean. Commit/stash changes first, "
            "or pass --allow-dirty after making your own backup."
        )


def back_up(repo: Path, backup: Path) -> dict[str, bool]:
    existed: dict[str, bool] = {}
    for relative in TOUCHED:
        source = repo / relative
        existed[relative] = source.exists()
        if source.exists():
            target = backup / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    return existed


def restore(repo: Path, backup: Path, existed: dict[str, bool]) -> None:
    print("Restoring the pre-installation tree.")
    for relative in TOUCHED:
        destination = repo / relative
        if existed.get(relative):
            source = backup / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        elif destination.exists():
            destination.unlink()
    for helper in [
        "apply-field-grammar-v5.4.py",
        "apply-field-grammar-v5.4-transport-fix.py",
    ]:
        applicator = repo / helper
        if applicator.exists():
            applicator.unlink()


def install(repo: Path, *, skip_tests: bool, allow_dirty: bool) -> None:
    assert_base(repo)
    assert_clean_worktree(repo, allow_dirty)

    with tempfile.TemporaryDirectory(prefix="field-grammar-v5.4-") as temp:
        backup = Path(temp) / "backup"
        backup.mkdir()
        existed = back_up(repo, backup)

        try:
            for name in ASSETS:
                (repo / name).write_bytes(download_asset(name))

            run([sys.executable, "-m", "py_compile", "apply-field-grammar-v5.4.py"], repo)
            run(["node", "--check", "step-field-geometry.js"], repo)
            run(["node", "--check", "field-grammar-tests.mjs"], repo)
            run([sys.executable, "apply-field-grammar-v5.4.py"], repo)
            run([sys.executable, "apply-field-grammar-v5.4-transport-fix.py"], repo)

            if not skip_tests:
                run(["npm", "run", "check"], repo)

            for helper in [
                "apply-field-grammar-v5.4.py",
                "apply-field-grammar-v5.4-transport-fix.py",
            ]:
                applicator = repo / helper
                if applicator.exists():
                    applicator.unlink()

        except Exception:
            restore(repo, backup, existed)
            raise

    print()
    print("Field grammar v5.4 installed and verified.")
    print("Review the branch, then commit the resulting changes.")
    subprocess.run(["git", "status", "--short"], cwd=repo, text=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Install the coherent Step Field grammar into a clean branch based on "
            "feature/step-field-v5.3-final."
        )
    )
    parser.add_argument("--repo", help="Repository root; defaults to the current directory.")
    parser.add_argument(
        "--skip-tests",
        action="store_true",
        help="Apply without npm run check. Not recommended.",
    )
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Permit a dirty Git worktree. The installer still backs up touched files.",
    )
    args = parser.parse_args()

    try:
        install(
            locate_repo(args.repo),
            skip_tests=args.skip_tests,
            allow_dirty=args.allow_dirty,
        )
    except (InstallError, OSError, subprocess.CalledProcessError) as error:
        print(f"Installation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
