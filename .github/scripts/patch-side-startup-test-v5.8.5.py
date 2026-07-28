from pathlib import Path

path = Path("step-field-tests.mjs")
text = path.read_text()
old = '''  assert.match(fieldSource, /if \\(side\\.activated\\)[\\s\\S]*side\\.adapter\\?\\.place\\?\\.\\(target\\)[\\s\\S]*side\\.adapter\\?\\.pause\\?\\.\\(\\)[\\s\\S]*else[\\s\\S]*side\\.adapter\\?\\.cue\\?\\.\\(side\\.videoId, target\\)/,
    "Pre-activation placement may cue, but activated paused sides must seek and pause on their represented frame.");'''
new = '''  assert.match(fieldSource, /if \\(!side\\.sourceReady\\)[\\s\\S]*side\\.adapter\\?\\.cue\\?\\.\\(side\\.videoId, target\\)[\\s\\S]*return true;[\\s\\S]*side\\.adapter\\?\\.place\\?\\.\\(target\\)[\\s\\S]*side\\.adapter\\?\\.pause\\?\\.\\(\\)/,
    "A source may be cued only while preparing; source-ready paused sides must seek and pause on their represented frame.");
  assert.match(fieldSource, /function beginStretch\\(side, center, snapshot,[\\s\\S]*if \\(play && side\\.sourceReady\\)[\\s\\S]*side\\.adapter\\?\\.play\\?\\.\\(\\)/,
    "Trusted side playback must start only after that side source has reached CUED readiness.");'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"step-field-tests.mjs: expected one stale parking assertion, found {count}")
path.write_text(text.replace(old, new))
