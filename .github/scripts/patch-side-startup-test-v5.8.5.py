from pathlib import Path

checks = {
    "field-runtime-tests.mjs": [
        "deferredCue = false",
        "delayedPlay = false",
        "ratesAfterPlay = null",
        "Trusted Play must not re-cue Tail",
        "Temporary 1× availability must not collapse Tail"
    ],
    "field-bounds-tests.mjs": [
        "state = YOUTUBE_STATE.CUED;",
        "Stretch snaps Tail to Current."
    ],
    "step-field-tests.mjs": [
        "A source may be cued only while preparing",
        "Trusted side playback must start only after that side source has reached CUED readiness"
    ],
    "project-audit.mjs": [
        'assert.equal(pkg.version, "5.8.5");'
    ]
}

for path, markers in checks.items():
    text = Path(path).read_text()
    for marker in markers:
        if marker not in text:
            raise SystemExit(f"{path}: missing v5.8.5 validation marker: {marker}")
