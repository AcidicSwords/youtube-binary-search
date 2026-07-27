from pathlib import Path
import json


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace_once(content, before, after, label):
    count = content.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return content.replace(before, after, 1)


markup = '''          <div id="step-field" class="step-field field-off" data-phase="off" aria-label="Step Field">
            <section id="tail-pane" class="step-pane step-pane-side tail-pane" aria-label="Tail Step projection">
              <div class="step-pane-bar">
                <span class="step-pane-role">Tail</span>
                <span id="tail-meta" class="step-pane-meta">—</span>
                <button id="tail-collapse" class="pane-collapse" type="button" aria-label="Hide Tail" title="Hide Tail">×</button>
              </div>
              <div class="player-wrap"><div id="player-tail"></div></div>
              <button id="tail-step" class="step-pane-action" type="button" aria-label="Step Backward" disabled>
                <span class="sr-only">Step Backward</span>
              </button>
              <button id="tail-restore" class="step-pane-restore" type="button" aria-label="Show Tail" hidden>
                <span aria-hidden="true">←</span><span>Tail</span>
              </button>
            </section>

            <section class="step-pane step-pane-center" aria-label="Center video">
              <div class="step-pane-bar center-bar">
                <span class="step-pane-role">Center</span>
                <span id="center-meta" class="step-pane-meta">—</span>
                <button id="step-field-toggle" class="field-toggle" type="button" aria-pressed="true" aria-label="Hide Step Field">
                  <span>Field</span><span id="step-field-meta">Ready</span>
                </button>
              </div>
              <div class="player-wrap"><div id="player"></div></div>
            </section>

            <section id="lead-pane" class="step-pane step-pane-side lead-pane" aria-label="Lead Step projection">
              <div class="step-pane-bar">
                <span class="step-pane-role">Lead</span>
                <span id="lead-meta" class="step-pane-meta">—</span>
                <button id="lead-collapse" class="pane-collapse" type="button" aria-label="Hide Lead" title="Hide Lead">×</button>
              </div>
              <div class="player-wrap"><div id="player-lead"></div></div>
              <button id="lead-step" class="step-pane-action" type="button" aria-label="Step Forward" disabled>
                <span class="sr-only">Step Forward</span>
              </button>
              <button id="lead-restore" class="step-pane-restore" type="button" aria-label="Show Lead" hidden>
                <span>Lead</span><span aria-hidden="true">→</span>
              </button>
            </section>
          </div>'''

index = read("index.html")
index = replace_once(
    index,
    '  <link rel="stylesheet" href="styles.css">',
    '  <link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="step-field.css">',
    "Step Field stylesheet",
)
index = replace_once(
    index,
    '          <div class="player-wrap"><div id="player"></div></div>',
    markup,
    "Step Field markup",
)
write("index.html", index)

youtube = read("youtube.js")
youtube = replace_once(
    youtube,
    '''    setRate(rate) {
      rawPlayer?.setPlaybackRate(rate);
    },
    read() {''',
    '''    setRate(rate) {
      rawPlayer?.setPlaybackRate(rate);
    },
    mute() {
      rawPlayer?.mute?.();
    },
    unmute() {
      rawPlayer?.unMute?.();
    },
    destroy() {
      rawPlayer?.destroy?.();
      rawPlayer = null;
    },
    read() {''',
    "YouTube side-player methods",
)
write("youtube.js", youtube)

app = read("app.js")
app = replace_once(
    app,
    '''import {
  YOUTUBE_STATE,
  createYouTubePlayer,
  parseYouTubeUrl
} from "./youtube.js";
import { createView } from "./view.js";''',
    '''import {
  YOUTUBE_STATE,
  createYouTubePlayer,
  parseYouTubeUrl
} from "./youtube.js";
import { createStepFieldController } from "./step-field.js";
import { createView } from "./view.js";''',
    "Step Field import",
)
app = replace_once(
    app,
    '''      stepSeconds: Number.isFinite(Number(value?.stepSeconds))
        ? clamp(Number(value.stepSeconds), 0.25, 300)
        : 10
    };
  } catch {
    return { contextSeconds: 5, stepSeconds: 10 };
  }''',
    '''      stepSeconds: Number.isFinite(Number(value?.stepSeconds))
        ? clamp(Number(value.stepSeconds), 0.25, 300)
        : 10,
      stepFieldEnabled: value?.stepFieldEnabled !== false,
      tailVisible: value?.tailVisible !== false,
      leadVisible: value?.leadVisible !== false
    };
  } catch {
    return {
      contextSeconds: 5,
      stepSeconds: 10,
      stepFieldEnabled: true,
      tailVisible: true,
      leadVisible: true
    };
  }''',
    "Step Field preferences",
)
app = replace_once(
    app,
    '''  stepSeconds: preferences.stepSeconds,
  contextSeconds: preferences.contextSeconds,
  dragHandle: null,''',
    '''  stepSeconds: preferences.stepSeconds,
  contextSeconds: preferences.contextSeconds,
  stepFieldEnabled: preferences.stepFieldEnabled,
  tailVisible: preferences.tailVisible,
  leadVisible: preferences.leadVisible,
  dragHandle: null,''',
    "Step Field state",
)
app = replace_once(
    app,
    "let player = null;\n",
    "let player = null;\nlet stepField = null;\n",
    "Step Field controller variable",
)
app = replace_once(
    app,
    '''      contextSeconds: state.contextSeconds,
      stepSeconds: state.stepSeconds
    }));''',
    '''      contextSeconds: state.contextSeconds,
      stepSeconds: state.stepSeconds,
      stepFieldEnabled: state.stepFieldEnabled,
      tailVisible: state.tailVisible,
      leadVisible: state.leadVisible
    }));''',
    "Step Field persistence",
)
app = replace_once(
    app,
    '''  player = createYouTubePlayer("player", {
    events: {
      onReady: () => {
        state.playerReady = true;
        setStatus("YouTube ready. Paste a link.");
        cuePendingVideo();
      },
      onStateChange: handlePlayerStateChange,
      onPlaybackRateChange: view.render,
      onAutoplayBlocked: handleAutoplayBlocked,
      onError: handlePlayerError
    }
  });
  if (pollTimer === null) pollTimer = window.setInterval(pollPlayer, POLL_MS);''',
    '''  player = createYouTubePlayer("player", {
    events: {
      onReady: () => {
        state.playerReady = true;
        setStatus("YouTube ready. Paste a link.");
        cuePendingVideo();
      },
      onStateChange: handlePlayerStateChange,
      onPlaybackRateChange: view.render,
      onAutoplayBlocked: handleAutoplayBlocked,
      onError: handlePlayerError
    }
  });
  stepField = createStepFieldController({
    document,
    getSnapshot: () => ({
      videoLoaded: state.videoLoaded,
      videoId: state.videoId,
      current: currentResolution()?.C || 0,
      range: activeRange(),
      stepSeconds: state.stepSeconds,
      transportKind: state.transport.kind,
      pendingStep: Boolean(state.pendingStep),
      dragging: Boolean(state.dragHandle),
      center: playerSnapshot(),
      playerState: state.playerState
    }),
    getPreferences: () => ({
      stepFieldEnabled: state.stepFieldEnabled,
      tailVisible: state.tailVisible,
      leadVisible: state.leadVisible
    }),
    setPreferences: patch => {
      if (Object.hasOwn(patch, "stepFieldEnabled")) state.stepFieldEnabled = Boolean(patch.stepFieldEnabled);
      if (Object.hasOwn(patch, "tailVisible")) state.tailVisible = Boolean(patch.tailVisible);
      if (Object.hasOwn(patch, "leadVisible")) state.leadVisible = Boolean(patch.leadVisible);
      persistPreferences();
    },
    onStep: performStep,
    formatTime
  });
  if (pollTimer === null) pollTimer = window.setInterval(pollPlayer, POLL_MS);''',
    "Step Field initialization",
)
app = replace_once(
    app,
    '''function pollPlayer() {
  if (!state.videoLoaded || !player || !state.playerReady) return;''',
    '''function pollPlayer() {
  stepField?.tick();
  if (!state.videoLoaded || !player || !state.playerReady) return;''',
    "Step Field polling",
)
write("app.js", app)

package = json.loads(read("package.json"))
package["version"] = "5.3.0"
if "step-field-tests.mjs" not in package["scripts"]["test"]:
    package["scripts"]["test"] += " && node step-field-tests.mjs"
if "node --check step-field.js" not in package["scripts"]["check"]:
    package["scripts"]["check"] = package["scripts"]["check"].replace(
        "node --check app.js &&",
        "node --check app.js && node --check step-field.js &&",
    )
write("package.json", json.dumps(package, indent=2) + "\n")

readme = read("README.md")
readme = readme.replace(
    "Version 5.1 is the audited spatial-reader build.",
    "Version 5.3 adds the audited Step Field projection to the spatial reader.",
)
step_field_readme = '''## Step Field

The optional Step Field projects the existing local Step relation through three synchronized panes:

```text
Tail | Center | Lead
```

Center remains the sole authoritative player and the only audible pane. Tail and Lead are smaller, muted, independently collapsible projections. They begin coincident with Current, unfold through differential playback while Continue is active, and hold at the existing Step distance. Selecting Tail or Lead executes the existing Step Backward or Step Forward operator; the Field creates no new Current, Interval, history, Pin, or Section semantics.

Context, Loop, Skim, pending Step gestures, and Range dragging suspend the side projections. Visibility is a presentation preference and does not enter Return history.

'''
if "## Step Field" not in readme:
    readme = replace_once(readme, "## Architecture", step_field_readme + "## Architecture", "README Step Field section")
write("README.md", readme)

implementation = read("IMPLEMENTATION.md")
implementation_note = '''

## v5.3 Step Field projection

`step-field.js` is a small physical projection layer around the existing Center player. It derives both side targets from `stepTarget(Current, Step Size, Range)`, owns only muted side-player synchronization and pane visibility, and never mutates Session.

```text
Session       semantic Current, Range, Resolution, Interval, Guide, Return
Transport     Context, Continue, Skim, Loop settlement
Step Field    Tail/Lead cursors, differential rates, hold and collapse state
View          existing semantic and timeline projection
```

The Center player remains authoritative. Side-player events cannot create Go, settle Transport, or update Current. The Field uses fixed conservative rates, exposes no separate distance setting, and adds only one Center-level toggle plus one collapse control per side.
'''
if "## v5.3 Step Field projection" not in implementation:
    implementation = implementation.rstrip() + implementation_note + "\n"
write("IMPLEMENTATION.md", implementation)

print("Applied compact Step Field v5.3 integration.")
