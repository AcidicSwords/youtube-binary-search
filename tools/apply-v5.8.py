from pathlib import Path
import json
import re


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path, pattern, replacement, flags=0):
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, found {count}: {pattern}")
    write(path, next_text)


# ---------------------------------------------------------------------------
# Runtime: Automatic Context owns post-move observation; no explicit button.
# ---------------------------------------------------------------------------
replace_once(
    "app.js",
    '''  if (
    observe
    && state.contextSeconds > 0
    && !(state.stepFieldEnabled && (state.tailVisible || state.leadVisible))
    && result?.interval?.medium === "direct"
    && Number.isFinite(destination)
  ) {
    startContext(destination);
    return;
  }''',
    '''  if (observe && state.contextSeconds > 0 && Number.isFinite(destination)) {
    startContext(destination);
    return;
  }'''
)

replace_once(
    "app.js",
    '''function returnLastAction() {
  settleBeforeAction();
  const result = returnSession(state.session);
  if (!result.changed) {
    setStatus("There is no preceding state to Return to.");
    return;
  }
  state.session = result.session;
  persistPreferences();
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  persistPreferences();
  stepField?.invalidate();
  locateAddress(currentResolution().C);
  view.renderGuide();
  if (guidePersisted) setStatus(`Returned from ${result.label}.`);
  view.render();
}''',
    '''function returnLastAction() {
  settleBeforeAction();
  const departure = currentResolution().C;
  const result = returnSession(state.session);
  if (!result.changed) {
    setStatus("There is no preceding state to Return to.");
    return;
  }
  state.session = result.session;
  persistPreferences();
  const guidePersisted = result.guideChanged ? persistGuide() : true;
  persistPreferences();
  stepField?.invalidate();
  const destination = currentResolution().C;
  if (state.contextSeconds > 0 && Math.abs(destination - departure) > EPSILON) startContext(destination);
  else locateAddress(destination);
  view.renderGuide();
  if (guidePersisted) setStatus(`Returned from ${result.label}.`);
  view.render();
}'''
)

regex_once(
    "app.js",
    r'''\nfunction replayContext\(\) \{[\s\S]*?\n\}\n\nfunction openSectionCapture''',
    '''\nfunction openSectionCapture'''
)

replace_once(
    "app.js",
    '  elements["interval-state"].setAttribute("aria-expanded", String(kind === "interval"));',
    '  elements["interval-retain"].setAttribute("aria-expanded", String(kind === "interval"));'
)
replace_once(
    "app.js",
    '  elements["interval-state"].setAttribute("aria-expanded", "false");',
    '  elements["interval-retain"].setAttribute("aria-expanded", "false");'
)
replace_once(
    "app.js",
    'elements["context-action"].addEventListener("click", replayContext);\n',
    ''
)
replace_once(
    "app.js",
    'elements["interval-state"].addEventListener("click", () => openSectionCapture("interval"));',
    'elements["interval-retain"].addEventListener("click", () => openSectionCapture("interval"));'
)
replace_once(
    "app.js",
    '  else if (plain && key === "c") { event.preventDefault(); replayContext(); }\n',
    ''
)
replace_once(
    "app.js",
    '''elements["context-select"].addEventListener("change", event => {
  state.contextSeconds = Number(event.target.value || 0);
  persistPreferences();
  if (transportIs(TRANSPORT_KIND.CONTEXT) && state.contextSeconds === 0) {
    settleTransport();
    setStatus("Automatic Context turned off.");
  }
  view.render();
});''',
    '''elements["context-select"].addEventListener("change", event => {
  state.contextSeconds = Number(event.target.value || 0);
  persistPreferences();
  if (transportIs(TRANSPORT_KIND.CONTEXT)) settleTransport();
  setStatus(state.contextSeconds > 0
    ? `Automatic Context will play ${state.contextSeconds} seconds after each semantic move.`
    : "Automatic Context is off.");
  view.render();
});'''
)

# ---------------------------------------------------------------------------
# Step Field: prime muted side players before directional rates are discoverable.
# ---------------------------------------------------------------------------
replace_once(
    "step-field.js",
    'const DRIFT_TOLERANCE = 0.42;',
    'const DRIFT_TOLERANCE = 0.42;\nconst RATE_DISCOVERY_GRACE_MS = 2200;'
)
replace_once(
    "step-field.js",
    '''      rateAvailable: true,
      error: false''',
    '''      rateAvailable: true,
      rateProbeUntil: 0,
      error: false'''
)
replace_once(
    "step-field.js",
    '''      rateAvailable: true,
      error: false''',
    '''      rateAvailable: true,
      rateProbeUntil: 0,
      error: false'''
)
replace_once(
    "step-field.js",
    '''          side.error = false;
          adapter.mute?.();''',
    '''          side.error = false;
          side.rateProbeUntil = Date.now() + RATE_DISCOVERY_GRACE_MS;
          adapter.mute?.();'''
)
replace_once(
    "step-field.js",
    '''    side.rateAvailable = rate !== null;
    if (rate === null) {
      pauseSide(side);
      return false;
    }
    if (Math.abs(snapshot.rate - rate) > 0.001) side.adapter?.setRate?.(rate);
    side.actualRate = readSide(side).rate;
    return true;''',
    '''    side.rateAvailable = rate !== null;
    if (rate === null) {
      const discovering = Date.now() <= side.rateProbeUntil;
      if (!discovering) {
        pauseSide(side);
        return false;
      }
      if (Math.abs(snapshot.rate - 1) > 0.001) side.adapter?.setRate?.(1);
      side.actualRate = 1;
      return true;
    }
    side.rateProbeUntil = 0;
    if (Math.abs(snapshot.rate - rate) > 0.001) side.adapter?.setRate?.(rate);
    side.actualRate = readSide(side).rate;
    return true;'''
)
replace_once(
    "step-field.js",
    '''      if (!rates.length) {
        const option = document.createElement("option");
        option.value = "1";
        option.textContent = side.role === "tail" ? "No slow rate" : "No fast rate";
        select.appendChild(option);''',
    '''      if (!rates.length) {
        const option = document.createElement("option");
        option.value = "1";
        option.textContent = Date.now() <= side.rateProbeUntil
          ? "Checking rates…"
          : side.role === "tail" ? "No slow rate" : "No fast rate";
        select.appendChild(option);'''
)
replace_once(
    "step-field.js",
    '''      side.held = false;
      side.heldDistance = 0;
      side.adapter.mute?.();
      side.adapter.cue?.(snapshot.videoId, snapshot.current || 0);''',
    '''      side.held = false;
      side.heldDistance = 0;
      side.rateProbeUntil = Date.now() + RATE_DISCOVERY_GRACE_MS;
      side.adapter.mute?.();
      side.adapter.cue?.(snapshot.videoId, snapshot.current || 0);'''
)

# ---------------------------------------------------------------------------
# Markup: centred playback, explicit Last move retention, relational matrix.
# ---------------------------------------------------------------------------
replace_once(
    "index.html",
    'Continue controls Center and any available Tail and Lead panes. Context, Skim, and Loop use the current semantic operands.',
    'Continue controls Center and any available Tail and Lead panes. Automatic Context follows semantic movement; Skim and Loop use the current semantic operands.'
)
regex_once(
    "index.html",
    r'''\n\s*<button id="context-action"[\s\S]*?</button>''',
    ''
)
replace_once(
    "index.html",
    '''              <button id="interval-state" class="transport-readout operand-readout" type="button" aria-controls="section-capture" aria-expanded="false" aria-keyshortcuts="Shift+P" disabled>
                <span>Interval</span><strong id="interval-label">—</strong><em>Retain</em>
              </button>''',
    '''              <div id="interval-state" class="transport-readout interval-readout">
                <div><span>Last move</span><strong id="interval-label">—</strong></div>
                <button id="interval-retain" class="extent-action" type="button" aria-controls="section-capture" aria-expanded="false" aria-keyshortcuts="Shift+P" disabled>Save Section</button>
              </div>'''
)

capture = '''            <form id="section-capture" class="capture-bar" hidden>
              <div>
                <span id="section-source-label" class="eyebrow capture-source">Retain Interval</span>
                <strong id="section-window">—</strong>
              </div>
              <label class="sr-only" for="section-label">Section title</label>
              <input id="section-label" type="text" maxlength="100" placeholder="Section title" disabled>
              <div class="capture-actions">
                <button id="save-section" class="primary" type="submit" disabled>Save Section</button>
                <button id="cancel-section" type="button">Cancel</button>
              </div>
            </form>

'''
replace_once("index.html", capture, "")
insert = '''          <form id="section-capture" class="capture-bar section-capture-bar" hidden>
            <div>
              <span id="section-source-label" class="eyebrow capture-source">Save Last Move</span>
              <strong id="section-window">—</strong>
            </div>
            <label class="sr-only" for="section-label">Section title</label>
            <input id="section-label" type="text" maxlength="100" placeholder="Name this Section" disabled>
            <div class="capture-actions">
              <button id="save-section" class="primary" type="submit" disabled>Save Section</button>
              <button id="cancel-section" type="button">Cancel</button>
            </div>
          </form>

'''
replace_once(
    "index.html",
    '          <div id="status" class="status" role="status" aria-live="polite">Load a YouTube video to begin.</div>',
    insert + '          <div id="status" class="status" role="status" aria-live="polite">Load a YouTube video to begin.</div>'
)
replace_once(
    "index.html",
    '<summary><span>Observation</span><span>Context · Skim</span></summary>',
    '<summary><span>Playback behaviour</span><span>Automatic Context · Skim</span></summary>'
)
replace_once(
    "index.html",
    '<span>Context duration</span>',
    '<span>Context after movement</span>'
)
replace_once("index.html", '<option value="3">3 s</option>', '<option value="3">3 s after move</option>')
replace_once("index.html", '<option value="5" selected>5 s</option>', '<option value="5" selected>5 s after move</option>')
replace_once("index.html", '<option value="10">10 s</option>', '<option value="10">10 s after move</option>')
replace_once("index.html", '                <span><kbd>C</kbd> Context</span>\n', '')
replace_once("index.html", '<span><kbd>⇧P</kbd> Save Section</span>', '<span><kbd>⇧P</kbd> Save Last Move</span>')

reopen = '''              <button id="reopen" class="nav-action reopen-action" type="button" data-preview-action="reopen" aria-keyshortcuts="W" disabled>
                <span class="action-name"><kbd>W</kbd> Reopen</span>
                <span id="reopen-meta" class="action-meta">—</span>
              </button>

'''
replace_once("index.html", reopen, "")
refine_forward = '''              <button id="refine-forward" class="nav-action primary direction forward" type="button" data-preview-action="forward" aria-keyshortcuts="D" disabled>
                <span class="action-name"><kbd>D</kbd> Refine Forward</span>
                <span id="forward-meta" class="action-meta">—</span>
              </button>'''
replace_once("index.html", refine_forward, reopen + refine_forward)
replace_once(
    "index.html",
    '<p>One spatial grammar: reopen, refine, step, return, and cross retained Pins.</p>',
    '<p>Three relational rows: refine the Neighborhood, move through Range, and traverse retained Pins.</p>'
)

# ---------------------------------------------------------------------------
# Projection: remove explicit Context control and expose capture directly.
# ---------------------------------------------------------------------------
replace_once("view.js", '    elements["context-action"].disabled = interactionLocked || currentState.contextSeconds <= 0;\n', '')
replace_once("view.js", '    elements["interval-state"].disabled = interactionLocked || !currentInterval;', '    elements["interval-retain"].disabled = interactionLocked || !currentInterval;')
replace_once(
    "view.js",
    '''    elements["save-section"].disabled = interactionLocked
      || !currentInterval
      || !elements["section-label"].value.trim();''',
    '''    elements["save-section"].disabled = interactionLocked
      || !captureExtent
      || !elements["section-label"].value.trim();'''
)
replace_once("view.js", '    elements["context-label"].textContent = contextActive ? "Stop Context" : "Context";\n', '')
replace_once("view.js", '      ["context-action", contextActive],\n', '')
regex_once(
    "view.js",
    r'''\n    elements\["context-state"\]\.textContent = contextActive[\s\S]*?        : "Off";''',
    ''
)
replace_once(
    "view.js",
    '    elements["section-source-label"].textContent = captureKind === "field-span" ? "Retain Field Span" : "Retain Interval";',
    '    elements["section-source-label"].textContent = captureKind === "field-span" ? "Save Field Span" : "Save Last Move";'
)
replace_once("view.js", '    elements["loop-meta"].textContent = currentInterval ? formatRange(currentInterval) : "No Interval";', '    elements["loop-meta"].textContent = currentInterval ? formatRange(currentInterval) : "No Last move";')

# ---------------------------------------------------------------------------
# CSS: centre playback, explicit extent action, three relational operator rows.
# ---------------------------------------------------------------------------
replace_once(
    "styles.css",
    '''  grid-template-areas:
    ". reopen ."
    "refine-backward . refine-forward"
    "step-backward return step-forward"
    "pin-backward pin-current pin-forward";''',
    '''  grid-template-areas:
    "refine-backward reopen refine-forward"
    "step-backward return step-forward"
    "pin-backward pin-current pin-forward";'''
)
replace_once(
    "field-grammar.css",
    '''  grid-template-columns: auto minmax(320px, 1fr) auto;
  align-items: center;''',
    '''  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas: "readouts actions status";
  align-items: center;'''
)
replace_once(
    "field-grammar.css",
    '''.transport-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}''',
    '''.transport-actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  justify-self: center;
  gap: 6px;
}'''
)
replace_once(
    "field-grammar.css",
    '''.transport-readouts {
  display: flex;
  min-width: 0;
  align-items: stretch;
  justify-content: center;
  gap: 6px;
}''',
    '''.transport-readouts {
  grid-area: readouts;
  display: flex;
  min-width: 0;
  align-items: stretch;
  justify-content: flex-start;
  gap: 6px;
}'''
)
regex_once(
    "field-grammar.css",
    r'''\n\.operand-readout \{[\s\S]*?\n\}\n\n\.operand-readout em \{[\s\S]*?\n\}\n''',
    '''\n.interval-readout {
  display: flex;
  max-width: 360px;
  align-items: stretch;
  padding: 0;
}

.interval-readout > div {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
  align-content: center;
  padding: 5px 8px;
}

'''
)
replace_once(
    "field-grammar.css",
    '''.transport-status {
  display: grid;
  min-width: 190px;
  gap: 2px;
  justify-items: end;
}''',
    '''.transport-status {
  grid-area: status;
  display: grid;
  min-width: 190px;
  gap: 2px;
  justify-self: end;
  justify-items: end;
}'''
)
replace_once(
    "field-grammar.css",
    '''@media (max-width: 1120px) {
  .field-transport-bar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .transport-readouts {
    grid-column: 1 / -1;
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 1px;
  }
}''',
    '''.section-capture-bar {
  grid-template-columns: auto minmax(180px, 1fr) auto;
  align-items: center;
  border-width: 1px 0 0;
  border-radius: 0;
}

.section-capture-bar .capture-actions {
  display: flex;
}

@media (max-width: 1120px) {
  .field-transport-bar {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "actions actions"
      "readouts status";
  }

  .transport-readouts {
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 1px;
  }
}'''
)
replace_once(
    "field-grammar.css",
    '''  .field-transport-bar {
    grid-template-columns: minmax(0, 1fr);
    gap: 7px;
  }

  .transport-actions {
    display: grid;
    grid-template-columns: 1.25fr 1fr 1fr 1fr;
  }''',
    '''  .field-transport-bar {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "actions"
      "readouts"
      "status";
    gap: 7px;
  }

  .transport-actions {
    display: grid;
    width: 100%;
    grid-template-columns: 1.25fr 1fr 1fr;
  }'''
)
replace_once("field-grammar.css", '    grid-column: 1;\n    justify-content: flex-start;', '    justify-content: flex-start;')
replace_once(
    "field-grammar.css",
    '''  .transport-status {
    min-width: 0;
    justify-items: start;
  }
}''',
    '''  .transport-status {
    min-width: 0;
    justify-self: start;
    justify-items: start;
  }

  .section-capture-bar {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-capture-bar .capture-actions {
    display: grid;
  }
}'''
)

# ---------------------------------------------------------------------------
# Automated contracts.
# ---------------------------------------------------------------------------
replace_once("project-audit.mjs", 'assert.equal(pkg.version, "5.7.0");', 'assert.equal(pkg.version, "5.8.0");')
replace_once(
    "project-audit.mjs",
    'assert.match(html, /transport-actions[\\s\\S]*id="continue"[\\s\\S]*id="context-action"[\\s\\S]*id="skim"[\\s\\S]*id="loop"/, "Playback and observation actions must share one dock.");',
    'assert.match(html, /transport-actions[\\s\\S]*id="continue"[\\s\\S]*id="skim"[\\s\\S]*id="loop"/, "Playback actions must share one centred dock.");\nassert.doesNotMatch(html, /id="context-action"/, "Context is an automatic movement mode, not a playback button.");\nassert.match(html, /id="interval-state"[\\s\\S]*id="interval-retain"[\\s\\S]*Save Section/, "Last move retention must be explicit and local.");'
)
replace_once(
    "project-audit.mjs",
    'assert.match(styles, /grid-template-areas:[\\s\\S]*"\\. reopen \\."[\\s\\S]*"refine-backward \\. refine-forward"[\\s\\S]*"step-backward return step-forward"[\\s\\S]*"pin-backward pin-current pin-forward"/);',
    'assert.match(styles, /grid-template-areas:[\\s\\S]*"refine-backward reopen refine-forward"[\\s\\S]*"step-backward return step-forward"[\\s\\S]*"pin-backward pin-current pin-forward"/);'
)
replace_once(
    "integration-check.mjs",
    '''assert.match(styles, /grid-template-areas:[\s\S]*"\. reopen \."[\s\S]*"refine-backward \. refine-forward"[\s\S]*"step-backward return step-forward"[\s\S]*"pin-backward pin-current pin-forward"/,
  "Navigation CSS must preserve the operator-only spatial matrix.");''',
    '''assert.match(styles, /grid-template-areas:[\s\S]*"refine-backward reopen refine-forward"[\s\S]*"step-backward return step-forward"[\s\S]*"pin-backward pin-current pin-forward"/,
  "Navigation CSS must preserve three relational operator rows.");'''
)
replace_once(
    "integration-check.mjs",
    '  "leave-section"\n',
    '  "leave-section",\n  "interval-retain"\n'
)

# Context smoke tracks Center separately from side players and validates automatic behaviour.
replace_once(
    "context-smoke.mjs",
    '''let fakePlayer = null;
class DelayedPlayer {
  constructor(_id, config) {''',
    '''let fakePlayer = null;
const players = new Map();
class DelayedPlayer {
  constructor(id, config) {'''
)
replace_once(
    "context-smoke.mjs",
    '''    this.pendingPlacement = null;
    fakePlayer = this;
    setTimeout(() => this.events.onReady?.(), 0);''',
    '''    this.pendingPlacement = null;
    players.set(id, this);
    if (id === "player") fakePlayer = this;
    setTimeout(() => this.events.onReady?.(), 0);'''
)
replace_once("context-smoke.mjs", '  getAvailablePlaybackRates() { return [1, 1.5, 2]; }', '  getAvailablePlaybackRates() { return [0.5, 1, 1.5, 2]; }')
regex_once(
    "context-smoke.mjs",
    r'''fakePlayer\.deferNextPlacement = true;[\s\S]*?assert\.equal\(fakePlayer\.currentTime, 50\);\n\n// Loop startup''',
    '''fakePlayer.deferNextPlacement = true;
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
assert.equal(byId.get("current-label").textContent, "0:50.000", "Movement commits semantic Current immediately.");
assert.equal(fakePlayer.pendingPlacement, 49, "Enabled Context must automatically request one second of pre-roll after movement.");
assert.equal(byId.has("context-action"), false, "Automatic Context must not retain a redundant playback button.");
assert.equal(byId.get("current-marker").style.left, "50%", "Semantic Current remains fixed during automatic Context.");
fakePlayer.applyPendingPlacement();
intervalCallbacks[0]();
fakePlayer.currentTime = 54;
intervalCallbacks[0]();
await delay();
assert.equal(fakePlayer.currentTime, 50, "Automatic Context restores the physical playhead to semantic Current.");
assert.match(byId.get("interval-label").textContent, /0:00\.000–0:50\.000/, "Context preserves the movement Interval.");

byId.get("context-select").value = "0";
byId.get("context-select").dispatch("change");
await delay();
const playsBeforeOff = fakePlayer.commands.filter(command => command[0] === "play").length;
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
await delay();
const playsAfterOff = fakePlayer.commands.filter(command => command[0] === "play").length;
assert.equal(playsAfterOff, playsBeforeOff, "Context Off must leave moves paused at their destination.");
assert.equal(fakePlayer.currentTime, 25);

const tailPlayer = players.get("player-tail");
const leadPlayer = players.get("player-lead");
assert.ok(tailPlayer && leadPlayer, "Step Field side players must be created for the loaded video.");
byId.get("continue").click();
await delay();
intervalCallbacks[0]();
assert.ok(tailPlayer.commands.some(command => command[0] === "play"), "Continue must start the muted Tail player.");
assert.ok(leadPlayer.commands.some(command => command[0] === "play"), "Continue must start the muted Lead player.");
byId.get("continue").click();
await delay();

// Loop startup''',
    flags=re.M
)
replace_once(
    "context-smoke.mjs",
    'console.log("Context smoke passed: Field-visible suppression, explicit observation, restoration, interruption, Return isolation, Off preference, delayed Loop startup, and startup Pause.");',
    'console.log("Context smoke passed: automatic post-move observation, restoration, Off preference, side-player Continue, delayed Loop startup, and startup Pause.");'
)

# Source-level regression coverage for the priming boundary and new UI ownership.
replace_once(
    "step-field-tests.mjs",
    '  assert.match(fieldSource, /const fieldShown = loaded && prefs\\.stepFieldEnabled/);',
    '  assert.match(fieldSource, /const fieldShown = loaded && prefs\\.stepFieldEnabled/);\n  assert.match(fieldSource, /RATE_DISCOVERY_GRACE_MS/);\n  assert.match(fieldSource, /rateProbeUntil/);\n  assert.match(fieldSource, /const discovering = Date\\.now\\(\\) <= side\\.rateProbeUntil/);'
)
replace_once(
    "step-field-tests.mjs",
    '  assert.match(layoutCss, /@media \\(min-width: 1221px\\)/);',
    '  assert.match(layoutCss, /@media \\(min-width: 1221px\\)/);\n  assert.match(layoutCss, /"refine-backward reopen refine-forward"/);\n  assert.doesNotMatch(html, /id=["\']context-action["\']/);\n  assert.match(html, /id=["\']interval-retain["\']/);'
)

# Package and docs.
pkg = json.loads(read("package.json"))
pkg["version"] = "5.8.0"
write("package.json", json.dumps(pkg, indent=2) + "\n")

replace_once("README.md", 'lets Refine, Reopen, Step, Return, Continue, Context, Skim, Loop, Pin, Section, and Focus act on it predictably.', 'lets Refine, Reopen, Step, Return, Continue, automatic Context, Skim, Loop, Pin, Section, and Focus act on it predictably.')
replace_once("README.md", 'Application Continue is the authoritative three-pane start gesture; native Center controls remain available.', 'Application Continue is the authoritative three-pane start gesture; it primes muted side players before applying their reported directional rates. Native Center controls remain available.')
replace_once("README.md", 'C             = Context\n', '')
replace_once("README.md", 'Shift+P       = Save Section', 'Shift+P       = Save Last Move as Section')
replace_once("README.md", '## Keyboard\n', 'Automatic Context is configured in Parameters. When enabled, every semantic move plays a bounded window around the new Current and restores Center when the window ends.\n\n## Keyboard\n')

interface = read("INTERFACE.md")
interface = interface.replace('| Context | Observes around Current and restores it | Bounded local review would require semantic movement |\n', '')
interface = interface.replace('| Interval readout and Retain affordance | Identifies the last committed movement Extent and opens Section capture | Loop/retention operands would be implicit and unrecoverable from the interface |', '| Last move readout and Save Section | Identifies the last committed movement Extent and opens a local naming form | Loop/retention operands would be implicit and Section creation would be undiscoverable |')
interface = interface.replace('| Context duration | Defines the Context observation window | Context would have an unexplained fixed duration |', '| Automatic Context | Defines whether and how long a bounded observation runs after every semantic move | Local review would require a separate command after each move |')
interface = interface.replace('| Section capture | Names and confirms retention of an explicit Extent | Retention would create unlabeled or accidental structure |\n', '')
interface = interface.replace('''        W
     A     D
     ←  S  →
    ⇧←  P  ⇧→''', ''' A  |  W  |  D
 ←  |  S  |  →
⇧←  |  P  |  ⇧→''')
interface = interface.replace('The centered matrix is the complete direct spatial command surface:', 'The centered matrix is the complete direct spatial command surface. Rows express operator relation rather than keyboard shape:')
interface = interface.replace('Pane headers are outside the video image. Controls never compete with YouTube titles, captions, or native overlays.', 'Pane headers are outside the video image. Controls never compete with YouTube titles, captions, or native overlays. Continue primes each muted side player at 1× while playback-rate capabilities are discovered, then applies the selected directional rate.')
interface = interface.replace('The playback dock is attached directly to the media because its effects are physical and time-dependent.', 'The playback dock is attached directly to the media because its effects are physical and time-dependent. Its action group is centred beneath Center; Context is absent because it is an automatic movement preference, not a playback command.')
write("INTERFACE.md", interface)

for path in ["IMPLEMENTATION.md", "SPEC.md", "VALIDATION.md"]:
    text = read(path)
    addition = '''\n\n## v5.8 interaction clarification\n\n- Context is a preference, not an explicit playback operator. When its duration is non-zero, every semantic movement that changes Current starts bounded Context automatically and restores Center to Current when observation ends.\n- Application Continue primes muted Tail and Lead players at 1× during YouTube playback-rate discovery, then applies supported directional rates. A genuinely unsupported direction settles as unavailable after the discovery grace period.\n- The visible movement extent is labelled Last move and exposes an explicit Save Section action with its naming form adjacent to playback.\n- The operator matrix uses three relational rows: Refine Backward / Reopen / Refine Forward; Step Backward / Return / Step Forward; Pin Backward / Pin Current / Pin Forward. Keyboard bindings remain shortcuts rather than layout authority.\n'''
    if '## v5.8 interaction clarification' not in text:
        text += addition
    write(path, text)

# Ensure removed control references do not survive in runtime/UI contracts.
for path in ["index.html", "app.js", "view.js", "project-audit.mjs"]:
    text = read(path)
    if 'context-action' in text:
        raise SystemExit(f"{path}: context-action remains after v5.8 transformation")

print("Applied v5.8 automatic Context, side playback priming, retention, and operator-row corrections.")
