from pathlib import Path


def replace_once(path, old, new, label):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one {label}, found {count}")
    target.write_text(text.replace(old, new))


replace_once(
    "step-field-tests.mjs",
    '''  assert.match(fieldSource, /if \\(side\\.activated\\)[\\s\\S]*side\\.adapter\\?\\.place\\?\\.\\(target\\)[\\s\\S]*side\\.adapter\\?\\.pause\\?\\.\\(\\)[\\s\\S]*else[\\s\\S]*side\\.adapter\\?\\.cue\\?\\.\\(side\\.videoId, target\\)/,
    "Pre-activation placement may cue, but activated paused sides must seek and pause on their represented frame.");''',
    '''  assert.match(fieldSource, /if \\(!side\\.sourceReady\\)[\\s\\S]*side\\.adapter\\?\\.cue\\?\\.\\(side\\.videoId, target\\)[\\s\\S]*return true;[\\s\\S]*side\\.adapter\\?\\.place\\?\\.\\(target\\)[\\s\\S]*side\\.adapter\\?\\.pause\\?\\.\\(\\)/,
    "A source may be cued only while preparing; source-ready paused sides must seek and pause on their represented frame.");
  assert.match(fieldSource, /function beginStretch\\(side, center, snapshot,[\\s\\S]*if \\(play && side\\.sourceReady\\)[\\s\\S]*side\\.adapter\\?\\.play\\?\\.\\(\\)/,
    "Trusted side playback must start only after that side source has reached CUED readiness.");''',
    "stale parking assertion"
)

replace_once(
    "field-bounds-tests.mjs",
    '''      cue(_videoId, address) { commands.push(["cue", address]); time = address; },''',
    '''      cue(_videoId, address) {
        commands.push(["cue", address]);
        time = address;
        state = YOUTUBE_STATE.CUED;
        config.events.onStateChange?.(state);
      },''',
    "synchronous cue harness"
)
