from pathlib import Path
import json
import re


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace_once(content, before, after, label):
    count = content.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return content.replace(before, after, 1)


def regex_once(content, pattern, replacement, label):
    result, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Expected one {label} regex anchor, found {count}")
    return result


# ---------- index.html ----------
index = read("index.html")
index = replace_once(
    index,
    '  <link rel="stylesheet" href="step-field.css">',
    '  <link rel="stylesheet" href="step-field.css">\n  <link rel="stylesheet" href="field-grammar.css">',
    "Field grammar stylesheet",
)
index = replace_once(
    index,
    '''                <button id="step-field-toggle" class="field-toggle" type="button" aria-pressed="true" aria-label="Hide Step Field">
                  <span>Field</span><span id="step-field-meta">Ready</span>
                </button>''',
    '''                <button id="step-field-toggle" class="field-toggle" type="button" aria-pressed="true" aria-label="Hide Step Field">
                  <span>Field</span><span id="step-field-meta">Ready</span>
                </button>
                <button id="continue" class="field-transport" type="button" aria-keyshortcuts="Space" disabled>
                  <span id="continue-label">Continue</span><span id="continue-meta" class="control-meta">—</span>
                </button>''',
    "Center transport control",
)
index = regex_once(
    index,
    r'''\n\s*<div class="observation-dock" aria-label="Observation controls">.*?</div>\n\n\s*<div id="status"''',
    '\n\n          <div id="status"',
    "flat observation dock",
)
old_state_strip = '''            <div class="state-strip" aria-label="Current spatial state">
              <button id="range-state" class="state-chip state-button" type="button" aria-controls="range-tools" aria-expanded="false">
                <span>Range</span><strong id="range-label">—</strong>
              </button>
              <div class="state-chip"><span>Resolution</span><strong id="resolution-label">—</strong></div>
              <div class="state-chip current-state"><span>Current</span><strong id="current-label">—</strong></div>
              <button id="interval-state" class="state-chip state-button" type="button" aria-controls="section-capture" aria-expanded="false" aria-keyshortcuts="Shift+P" disabled>
                <span>Interval</span><strong id="interval-label">—</strong>
              </button>
              <button id="focused-state" class="state-chip state-button" type="button" aria-controls="guide-panel" disabled>
                <span>Section</span><strong id="focused-label">—</strong>
              </button>
            </div>'''
new_state_strip = '''            <div class="state-strip" aria-label="Current spatial state">
              <button id="range-state" class="state-chip state-button" type="button" aria-controls="range-tools" aria-expanded="false">
                <span>Range</span><strong id="range-label">—</strong>
              </button>

              <div class="state-chip object-state resolution-state">
                <div><span>Resolution</span><strong id="resolution-label">—</strong></div>
                <button id="skim" class="object-action" type="button" data-preview-action="skim" aria-keyshortcuts="F" disabled>
                  <span id="skim-label">Skim</span><span id="skim-meta" class="sr-only">—</span>
                </button>
              </div>

              <div class="state-chip object-state current-state">
                <div><span>Current</span><strong id="current-label">—</strong></div>
                <button id="context-action" class="object-action" type="button" data-preview-action="context" aria-keyshortcuts="C" disabled>
                  <span id="context-label">Context</span><span id="context-state" class="sr-only">5 s</span>
                </button>
              </div>

              <div class="state-chip object-state extent-state interval-state-group">
                <button id="interval-state" class="extent-value" type="button" aria-controls="section-capture" aria-expanded="false" aria-keyshortcuts="Shift+P" disabled>
                  <span>Interval</span><strong id="interval-label">—</strong>
                </button>
                <div class="extent-actions">
                  <button id="loop" class="extent-action" type="button" data-preview-action="loop" aria-keyshortcuts="L" disabled>
                    <span id="loop-label">Loop</span><span id="loop-meta" class="sr-only">—</span>
                  </button>
                </div>
              </div>

              <div id="field-span-state" class="state-chip object-state extent-state field-span-state" hidden>
                <div class="extent-value">
                  <span>Field Span</span><strong id="field-span-label">—</strong>
                </div>
                <div class="extent-actions">
                  <button id="field-span-loop" class="extent-action" type="button" disabled><span id="field-span-loop-label">Loop</span></button>
                  <button id="field-span-retain" class="extent-action" type="button" disabled>Retain</button>
                </div>
              </div>

              <button id="focused-state" class="state-chip state-button" type="button" aria-controls="guide-panel" disabled>
                <span>Section</span><strong id="focused-label">—</strong>
              </button>
            </div>'''
index = replace_once(index, old_state_strip, new_state_strip, "object-local state strip")
index = replace_once(
    index,
    '<div id="action-preview-fill" class="action-preview-fill" hidden></div>',
    '<div id="action-preview-fill" class="action-preview-fill" hidden></div>\n                <div id="field-span-fill" class="field-span-fill" hidden></div>',
    "Field Span timeline projection",
)
index = replace_once(
    index,
    '<span class="eyebrow">Retain Interval</span>',
    '<span id="section-source-label" class="eyebrow capture-source">Retain Interval</span>',
    "capture source label",
)
observation_settings = '''
          <details id="observation-settings" class="tool-disclosure observation-settings">
            <summary><span>Observation settings</span><span>Context · Skim</span></summary>
            <div class="compact-settings">
              <label class="compact-setting" for="context-select">
                <span>Context duration</span>
                <select id="context-select" disabled>
                  <option value="0">Off</option>
                  <option value="3">3 s</option>
                  <option value="5" selected>5 s</option>
                  <option value="10">10 s</option>
                </select>
              </label>
              <label class="compact-setting" for="speed-select">
                <span>Skim rate</span>
                <select id="speed-select" disabled><option value="1">1×</option></select>
              </label>
            </div>
          </details>
'''
index = replace_once(
    index,
    '          <details id="shortcut-help" class="tool-disclosure shortcut-help">',
    observation_settings + '\n          <details id="shortcut-help" class="tool-disclosure shortcut-help">',
    "secondary observation settings",
)
write("index.html", index)


# ---------- transport.js ----------
transport = read("transport.js")
transport = regex_once(
    transport,
    r'''export function createLoopTransport\(\{ anchor, start, end \}\) \{.*?\n\}''',
    '''export function createLoopTransport({ anchor, start, end, source = "interval" }) {
  if (
    !Number.isFinite(anchor)
    || !Number.isFinite(start)
    || !Number.isFinite(end)
    || end - start <= EPSILON
  ) return idleTransport();

  return {
    kind: TRANSPORT_KIND.LOOP,
    phase: "starting",
    source,
    anchor: clamp(anchor, start, end),
    start,
    end,
    enteredWindow: false,
    startedAt: Date.now()
  };
}''',
    "generic Loop transport",
)
write("transport.js", transport)


# ---------- session.js ----------
session = read("session.js")
session = regex_once(
    session,
    r'''export function saveIntervalAsSection\(session, label\) \{.*?\n\}\n\nexport function renameGuidePin''',
    '''export function saveExtentAsSection(session, extent, label, provenance = "extent") {
  if (
    !extent
    || !Number.isFinite(extent.start)
    || !Number.isFinite(extent.end)
    || extent.end - extent.start <= EPSILON
  ) return unchanged(session, "no-extent");
  const text = String(label || "").trim();
  if (!text) return unchanged(session, "missing-title");

  const startPin = findPinAt(session.model.guide, extent.start);
  const endPin = findPinAt(session.model.guide, extent.end);
  const duplicate = startPin && endPin
    ? session.model.guide.sections.find(section =>
      section.startPinId === startPin.id
      && section.endPinId === endPin.id
      && section.label === text
    )
    : null;
  if (duplicate) {
    return unchanged(session, "duplicate-section", {
      value: { section: duplicate, created: false }
    });
  }

  return commit(session, "Save Section", draft => {
    const value = createSectionFromTimes(
      draft.guide,
      extent.start,
      extent.end,
      { label: text, provenance }
    );
    return { changed: true, guideChanged: true, value };
  }, { guideEdit: true });
}

export function saveIntervalAsSection(session, label) {
  if (!session.model.interval) return unchanged(session, "no-interval");
  return saveExtentAsSection(
    session,
    session.model.interval,
    label,
    `interval:${session.model.interval.operator}`
  );
}

export function renameGuidePin''',
    "generic Extent retention",
)
write("session.js", session)


# ---------- step-field.js ----------
field = read("step-field.js")
field = regex_once(
    field,
    r'''\Aimport \{ EPSILON, clamp, stepTarget \} from "\./range-geometry\.js";.*?function defaultPreferences\(\) \{''',
    '''import { clamp } from "./range-geometry.js";
import { YOUTUBE_STATE, createYouTubePlayer } from "./youtube.js";
import {
  STEP_FIELD_PHASE,
  FIELD_REACH_TOLERANCE,
  deriveStepField,
  chooseNearestRate,
  chooseDirectionalRate,
  hasCenterDiscontinuity,
  resolveFieldPhase,
  sideActivationMode,
  deriveObservedField
} from "./step-field-geometry.js";

export {
  STEP_FIELD_PHASE,
  deriveStepField,
  chooseNearestRate,
  chooseDirectionalRate,
  hasCenterDiscontinuity,
  resolveFieldPhase,
  sideActivationMode,
  deriveObservedField
} from "./step-field-geometry.js";

const REACH_TOLERANCE = FIELD_REACH_TOLERANCE;
const DRIFT_TOLERANCE = 0.42;
const TAIL_RATE = 0.5;
const LEAD_RATE = 2;

function defaultPreferences() {''',
    "pure Field geometry extraction",
)
field = replace_once(
    field,
    '''  onStep = () => {},
  formatTime = value => String(value),''',
    '''  onStep = () => {},
  onSelect = null,
  onChange = () => {},
  formatTime = value => String(value),''',
    "Field callbacks",
)
field = replace_once(
    field,
    '''      heldDistance: 0,
      error: false''',
    '''      heldDistance: 0,
      rateAvailable: true,
      error: false''',
    "Tail rate availability",
)
field = replace_once(
    field,
    '''      heldDistance: 0,
      error: false''',
    '''      heldDistance: 0,
      rateAvailable: true,
      error: false''',
    "Lead rate availability",
)
field = replace_once(
    field,
    '''    suspended: false,
    forceEstablish: true''',
    '''    suspended: false,
    forceEstablish: true,
    field: null,
    fieldKey: ""''',
    "observed Field state",
)
field = replace_once(
    field,
    '''    elements["tail-step"]?.addEventListener?.("click", () => onStep("backward"));
    elements["lead-step"]?.addEventListener?.("click", () => onStep("forward"));''',
    '''    elements["tail-step"]?.addEventListener?.("click", () => selectSide("tail"));
    elements["lead-step"]?.addEventListener?.("click", () => selectSide("lead"));''',
    "actual side selection",
)
field = regex_once(
    field,
    r'''  function setSideRate\(side, requestedRate\) \{.*?\n  \}''',
    '''  function setSideRate(side, requestedRate) {
    side.adapter?.mute?.();
    const snapshot = readSide(side);
    const rate = requestedRate === 1
      ? 1
      : chooseDirectionalRate(snapshot.availableRates, requestedRate, side.role);
    side.rateAvailable = rate !== null;
    if (rate === null) {
      pauseSide(side);
      return false;
    }
    if (Math.abs(snapshot.rate - rate) > 0.001) side.adapter?.setRate?.(rate);
    return true;
  }''',
    "direction-preserving Field rates",
)
field = replace_once(
    field,
    '''    const snapshot = readSide(side);
    const rawOffset''',
    '''    side.adapter?.mute?.();
    const snapshot = readSide(side);
    const rawOffset''',
    "continuous side mute",
)
field = replace_once(
    field,
    '''    setSideRate(side, side.requestedRate);
    ensureSidePlaying(side);
    return { available: true, held: false, offset };''',
    '''    if (!setSideRate(side, side.requestedRate)) {
      return { available: false, held: false, offset, rateUnavailable: true };
    }
    ensureSidePlaying(side);
    return { available: true, held: false, offset };''',
    "unavailable directional rate",
)
publish_helpers = '''
  function publishField(targets, sideStates, centerTime, prefs, phase = runtime.phase) {
    const tailRead = readSide(sides.tail);
    const leadRead = readSide(sides.lead);
    const observed = deriveObservedField({
      targets,
      phase,
      centerAddress: centerTime,
      tailAddress: prefs.tailVisible && sides.tail.ready ? tailRead.time : centerTime,
      leadAddress: prefs.leadVisible && sides.lead.ready ? leadRead.time : centerTime,
      tailVisible: prefs.tailVisible,
      leadVisible: prefs.leadVisible,
      tailHeld: sideStates?.tail?.held,
      leadHeld: sideStates?.lead?.held
    });
    const key = JSON.stringify({
      phase: observed.phase,
      tail: Number(observed.tail.address.toFixed(2)),
      lead: Number(observed.lead.address.toFixed(2)),
      tailHeld: observed.tail.held,
      leadHeld: observed.lead.held,
      visible: [observed.tail.visible, observed.lead.visible]
    });
    runtime.field = observed;
    if (key !== runtime.fieldKey) {
      runtime.fieldKey = key;
      onChange?.(observed);
    }
    return observed;
  }

  function selectSide(role) {
    const observed = runtime.field;
    const side = observed?.[role];
    const mode = sideActivationMode(side, observed?.phase);
    if (!mode) return;
    const payload = {
      role,
      direction: role === "tail" ? "backward" : "forward",
      mode,
      phase: observed.phase,
      held: side.held,
      address: side.address,
      target: side.target,
      offset: side.offset,
      span: observed.span
    };
    if (typeof onSelect === "function") onSelect(payload);
    else onStep(payload.direction);
  }

'''
field = replace_once(
    field,
    '  function render(snapshot = getSnapshot?.(), live = null, sideStates = null) {',
    publish_helpers + '  function render(snapshot = getSnapshot?.(), live = null, sideStates = null) {',
    "Field publication helpers",
)
field = replace_once(
    field,
    '''      const button = elements[`${role}-step`];
      if (button) {
        button.disabled = !loaded || !prefs.stepFieldEnabled || !prefs[`${role}Visible`] || !target.available;
        button.setAttribute("aria-label", `${role === "tail" ? "Step Backward" : "Step Forward"} to ${formatTime(target.target)}. ${meta}.`);
      }''',
    '''      const button = elements[`${role}-step`];
      if (button) {
        const observedSide = runtime.field?.[role] || {
          ...sideState,
          address: centerTime,
          visible: prefs[`${role}Visible`],
          available: target.available
        };
        const mode = sideActivationMode(observedSide, runtime.phase);
        const action = mode === "step"
          ? role === "tail" ? "Step Backward" : "Step Forward"
          : mode === "go"
            ? role === "tail" ? "Go to visible Tail" : "Go to visible Lead"
            : role === "tail" ? "Tail is coincident" : "Lead is coincident";
        const destination = mode === "step" ? target.target : observedSide.address;
        button.disabled = !loaded || !prefs.stepFieldEnabled || !mode;
        button.dataset.action = mode || "none";
        button.setAttribute("aria-label", `${action}${Number.isFinite(destination) ? ` at ${formatTime(destination)}` : ""}. ${meta}.`);
      }''',
    "phase-sensitive side labels",
)
field = replace_once(
    field,
    '''      runtime.phase = prefs.stepFieldEnabled ? STEP_FIELD_PHASE.COINCIDENT : STEP_FIELD_PHASE.OFF;
      render(snapshot);''',
    '''      runtime.phase = prefs.stepFieldEnabled ? STEP_FIELD_PHASE.COINCIDENT : STEP_FIELD_PHASE.OFF;
      const targets = deriveStepField(snapshot.current || 0, snapshot.stepSeconds || 10, snapshot.range);
      publishField(targets, null, snapshot.current || 0, prefs, runtime.phase);
      render(snapshot);''',
    "unloaded Field publication",
)
field = replace_once(
    field,
    '''      runtime.suspended = false;
      render(snapshot);
      return;''',
    '''      runtime.suspended = false;
      const centerTime = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
      const targets = deriveStepField(centerTime, snapshot.stepSeconds, snapshot.range);
      publishField(targets, null, centerTime, prefs, runtime.phase);
      render(snapshot);
      return;''',
    "off Field publication",
)
field = replace_once(
    field,
    '''      runtime.suspended = true;
      render(snapshot);
      return;''',
    '''      runtime.suspended = true;
      const centerTime = clamp(Number(snapshot.center?.time ?? snapshot.current), snapshot.range.start, snapshot.range.end);
      const targets = deriveStepField(centerTime, snapshot.stepSeconds, snapshot.range);
      publishField(targets, null, centerTime, prefs, runtime.phase);
      render(snapshot);
      return;''',
    "suspended Field publication",
)
field = replace_once(
    field,
    '''    runtime.phase = resolveFieldPhase({
      enabled: prefs.stepFieldEnabled,
      suspended: false,
      sides: [
        { ...sideStates.tail, visible: prefs.tailVisible },
        { ...sideStates.lead, visible: prefs.leadVisible }
      ]
    });
    render(snapshot, live, sideStates);''',
    '''    runtime.phase = resolveFieldPhase({
      enabled: prefs.stepFieldEnabled,
      suspended: false,
      sides: [
        { ...sideStates.tail, visible: prefs.tailVisible },
        { ...sideStates.lead, visible: prefs.leadVisible }
      ]
    });
    publishField(live, sideStates, centerTime, prefs, runtime.phase);
    render(snapshot, live, sideStates);''',
    "live Field publication",
)
field = replace_once(
    field,
    '''      return {
        phase: runtime.phase,
        tailHeld: sides.tail.held,
        leadHeld: sides.lead.held,
        preferences: preferences()
      };''',
    '''      return {
        ...(runtime.field || {}),
        phase: runtime.phase,
        tailHeld: sides.tail.held,
        leadHeld: sides.lead.held,
        preferences: preferences()
      };''',
    "public Field snapshot",
)
write("step-field.js", field)


# ---------- app.js ----------
app = read("app.js")
app = replace_once(
    app,
    '''  saveIntervalAsSection,
  renameGuidePin,''',
    '''  saveIntervalAsSection,
  saveExtentAsSection,
  renameGuidePin,''',
    "generic Extent retention import",
)
app = replace_once(
    app,
    '''  guideDialog: null
};''',
    '''  guideDialog: null,
  field: null,
  captureExtent: null,
  captureExtentKind: null
};''',
    "Field and capture state",
)
app = replace_once(
    app,
    '''    && state.contextSeconds > 0
    && result?.interval?.medium === "direct"''',
    '''    && state.contextSeconds > 0
    && !(state.stepFieldEnabled && (state.tailVisible || state.leadVisible))
    && result?.interval?.medium === "direct"''',
    "automatic Context suppression while Field is visible",
)
app = replace_once(
    app,
    '''function startLoop() {
  const loop = currentInterval();
  if (!loop) {
    setStatus("Establish an Interval before starting Loop.");
    return;
  }
  if (transportIs(TRANSPORT_KIND.LOOP)) {
    settleTransport();
    setStatus("Loop stopped.");
    return;
  }

  settleBeforeAction();
  state.transport = createLoopTransport({
    anchor: currentResolution().C,
    start: loop.start,
    end: loop.end
  });
  player.setRate(1);
  placePlayer(loop.start);
  if (Math.abs(safeCurrentTime() - loop.start) <= 0.25) state.transport.enteredWindow = true;
  player.play();
  setStatus(`Looping ${formatRange(loop)}.`);
  view.render();
}''',
    '''function startLoopExtent(extent, source = "interval", label = "Interval") {
  if (!extent || !(extent.end - extent.start > EPSILON)) {
    setStatus(`Establish a ${label} before starting Loop.`);
    return;
  }
  if (transportIs(TRANSPORT_KIND.LOOP)) {
    const sameSource = state.transport.source === source;
    settleTransport();
    if (sameSource) {
      setStatus("Loop stopped.");
      return;
    }
  }

  settleBeforeAction();
  state.transport = createLoopTransport({
    anchor: currentResolution().C,
    start: extent.start,
    end: extent.end,
    source
  });
  player.setRate(1);
  placePlayer(extent.start);
  if (Math.abs(safeCurrentTime() - extent.start) <= 0.25) state.transport.enteredWindow = true;
  player.play();
  setStatus(`Looping ${label} ${formatRange(extent)}.`);
  view.render();
}

function startLoop() {
  startLoopExtent(currentInterval(), "interval", "Interval");
}

function heldFieldSpan() {
  const span = state.field?.span;
  return span?.held && span.available ? { start: span.start, end: span.end } : null;
}

function startFieldSpanLoop() {
  startLoopExtent(heldFieldSpan(), "field-span", "Field Span");
}''',
    "Extent-driven Loop",
)
app = regex_once(
    app,
    r'''function saveCurrentIntervalAsSection\(event = null\) \{.*?\n\}''',
    '''function saveCurrentIntervalAsSection(event = null) {
  event?.preventDefault?.();
  const label = elements["section-label"].value.trim();
  const extent = state.captureExtent || currentInterval();
  const kind = state.captureExtentKind || "interval";
  if (!extent) return setStatus("Establish an Extent before saving a Section.", true);
  if (!label) return setStatus("A Section requires a title.", true);
  settleBeforeAction();
  const result = kind === "interval"
    ? saveIntervalAsSection(state.session, label)
    : saveExtentAsSection(state.session, extent, label, "field-span");
  if (!result.changed) {
    setStatus(
      result.reason === "duplicate-section"
        ? `Section “${label}” already exists for this Extent.`
        : "The Section could not be saved.",
      result.reason !== "duplicate-section"
    );
    return;
  }
  accept(result, { renderGuide: true, status: `Saved Section “${label}”.` });
  elements["section-label"].value = "";
  closeSectionCapture();
  selectGuideTab("sections");
  if (!compactGuideLayout()) openGuide("sections");
}''',
    "generic Section capture",
)
app = replace_once(
    app,
    '''function openSectionCapture() {
  if (!currentInterval()) {
    setStatus("Establish an Interval before saving a Section.");
    return false;
  }
  elements["section-capture"].hidden = false;
  elements["interval-state"].setAttribute("aria-expanded", "true");
  elements["section-label"].disabled = false;
  elements["section-label"].focus();
  view.render();
  return true;
}''',
    '''function openSectionCapture(kind = "interval") {
  const extent = kind === "field-span" ? heldFieldSpan() : currentInterval();
  if (!extent) {
    setStatus(`Establish a ${kind === "field-span" ? "Held Field Span" : "movement Interval"} before saving a Section.`);
    return false;
  }
  state.captureExtent = { start: extent.start, end: extent.end };
  state.captureExtentKind = kind;
  elements["section-capture"].hidden = false;
  elements["interval-state"].setAttribute("aria-expanded", String(kind === "interval"));
  elements["section-label"].disabled = false;
  elements["section-label"].focus();
  view.render();
  return true;
}''',
    "Extent capture opening",
)
app = replace_once(
    app,
    '''function closeSectionCapture() {
  elements["section-capture"].hidden = true;
  elements["interval-state"].setAttribute("aria-expanded", "false");
  elements["section-label"].value = "";
  view.render();
}''',
    '''function closeSectionCapture() {
  elements["section-capture"].hidden = true;
  elements["interval-state"].setAttribute("aria-expanded", "false");
  elements["section-label"].value = "";
  state.captureExtent = null;
  state.captureExtentKind = null;
  view.render();
}''',
    "Extent capture closing",
)
select_function = '''
function selectFieldSide(selection) {
  if (!state.videoLoaded || !selection || !Number.isFinite(selection.address)) return;
  if (selection.mode === "step") {
    performStep(selection.direction);
    return;
  }
  moveToAddress(selection.address, {
    operator: selection.role === "tail" ? "fieldTail" : "fieldLead",
    label: selection.role === "tail" ? "Go to Tail" : "Go to Lead",
    status: destination => `Current moved to visible ${selection.role === "tail" ? "Tail" : "Lead"} at ${formatTime(destination)}.`
  });
}

'''
app = replace_once(
    app,
    'function startSkim() {',
    select_function + 'function startSkim() {',
    "phase-sensitive Field selection routing",
)
app = replace_once(
    app,
    '''  state.transport = idleTransport();
  state.pendingStep = null;
  state.availableRates = snapshot.availableRates;''',
    '''  state.transport = idleTransport();
  state.pendingStep = null;
  state.field = null;
  state.captureExtent = null;
  state.captureExtentKind = null;
  state.availableRates = snapshot.availableRates;''',
    "Field reset on load",
)
app = replace_once(
    app,
    '''  if (name === YOUTUBE_STATE.ENDED && transportIs(TRANSPORT_KIND.CONTINUE)) {
    state.transport.wrapped = true;
    state.transport.crossedResolution = true;
    const preview = previewReopen(state.session, activeRange().start);
    if (preview.changed) state.session = preview.session;
    placePlayer(activeRange().start);
    player.play();
    setStatus(`Continued from the start of Range ${formatRange(activeRange())}.`);
  }''',
    '''  if (name === YOUTUBE_STATE.ENDED && transportIs(TRANSPORT_KIND.CONTINUE)) {
    settleTransport({ issuePause: false });
    setStatus("Continue reached Range End.");
  }''',
    "one-pass Continue end",
)
app = replace_once(
    app,
    '''    } else if (now >= activeRange().end - EPSILON) {
      transport.wrapped = true;
      transport.crossedResolution = true;
      const preview = previewReopen(state.session, activeRange().start);
      if (preview.changed) {
        state.session = preview.session;
        semanticChanged = true;
      }
      placePlayer(activeRange().start);
      player.setRate(1);
      player.play();
      setStatus(`Continued from the start of Range ${formatRange(activeRange())}.`);
    }''',
    '''    } else if (now >= activeRange().end - EPSILON) {
      settleTransport();
      setStatus("Continue reached Range End.");
      return;
    }''',
    "one-pass Continue boundary",
)
app = replace_once(
    app,
    '''    onStep: performStep,
    formatTime''',
    '''    onSelect: selectFieldSide,
    onChange: fieldState => {
      state.field = fieldState;
      view.render();
    },
    formatTime''',
    "Field controller integration",
)
app = replace_once(
    app,
    '''elements.loop.addEventListener("click", startLoop);
elements["speed-select"]''',
    '''elements.loop.addEventListener("click", startLoop);
elements["field-span-loop"].addEventListener("click", startFieldSpanLoop);
elements["field-span-retain"].addEventListener("click", () => openSectionCapture("field-span"));
elements["speed-select"]''',
    "Field Span actions",
)
app = replace_once(
    app,
    'elements["interval-state"].addEventListener("click", openSectionCapture);',
    'elements["interval-state"].addEventListener("click", () => openSectionCapture("interval"));',
    "Interval capture operand",
)
write("app.js", app)


# ---------- view.js ----------
view = read("view.js")
view = replace_once(
    view,
    '''    const currentInterval = interval();
    const skimActive''',
    '''    const currentInterval = interval();
    const field = currentState.field;
    const fieldSpan = field?.span?.held && field.span.available
      ? { start: field.span.start, end: field.span.end }
      : null;
    const skimActive''',
    "Field Span projection state",
)
view = replace_once(
    view,
    '''    elements["interval-label"].textContent = currentInterval ? formatRange(currentInterval) : "—";
    elements["focused-label"]''',
    '''    elements["interval-label"].textContent = currentInterval ? formatRange(currentInterval) : "—";
    elements["field-span-label"].textContent = fieldSpan ? formatRange(fieldSpan) : "—";
    elements["field-span-state"].hidden = !fieldSpan;
    elements["focused-label"]''',
    "Field Span state label",
)
view = replace_once(
    view,
    '''    elements["section-window"].textContent = currentInterval ? formatRange(currentInterval) : "—";
    elements["step-setting-value"]''',
    '''    const captureExtent = currentState.captureExtent || currentInterval;
    const captureKind = currentState.captureExtentKind || "interval";
    elements["section-source-label"].textContent = captureKind === "field-span" ? "Retain Field Span" : "Retain Interval";
    elements["section-window"].textContent = captureExtent ? formatRange(captureExtent) : "—";
    elements["step-setting-value"]''',
    "generic capture presentation",
)
view = replace_once(
    view,
    '''    elements.loop.disabled = interactionLocked || !currentInterval;
    elements.skim.disabled''',
    '''    const loopSource = currentState.transport.source || "interval";
    const intervalLoopActive = loopActive && loopSource === "interval";
    const fieldLoopActive = loopActive && loopSource === "field-span";
    elements.loop.disabled = interactionLocked || (!currentInterval && !intervalLoopActive) || fieldLoopActive;
    elements["field-span-loop"].disabled = interactionLocked || (!fieldSpan && !fieldLoopActive) || intervalLoopActive;
    elements["field-span-retain"].disabled = interactionLocked || !fieldSpan;
    elements.skim.disabled''',
    "Extent-local Loop enablement",
)
view = replace_once(
    view,
    '''    elements["loop-label"].textContent = loopActive ? "Stop Loop" : "Loop";
    elements["continue-meta"]''',
    '''    elements["loop-label"].textContent = intervalLoopActive ? "Stop Loop" : "Loop";
    elements["field-span-loop-label"].textContent = fieldLoopActive ? "Stop Loop" : "Loop";
    elements["continue-meta"]''',
    "Extent-local Loop labels",
)
view = replace_once(
    view,
    '''      ["loop", loopActive]
    ]) {''',
    '''      ["loop", intervalLoopActive],
      ["field-span-loop", fieldLoopActive]
    ]) {''',
    "Extent-local active states",
)
view = replace_once(
    view,
    '''        "resolution-end-marker", "backward-target-marker", "forward-target-marker", "current-marker", "cursor-marker"
      ]) elements[id].hidden = true;
      elements["interval-fill"].hidden = true;''',
    '''        "resolution-end-marker", "backward-target-marker", "forward-target-marker", "current-marker", "cursor-marker"
      ]) elements[id].hidden = true;
      elements["interval-fill"].hidden = true;
      elements["field-span-fill"].hidden = true;''',
    "unloaded Field Span projection",
)
view = replace_once(
    view,
    '''    elements["interval-fill"].hidden = !currentInterval;
    if (currentInterval) setSegment(elements["interval-fill"], currentInterval.start, currentInterval.end);
    renderSectionPreview();''',
    '''    elements["interval-fill"].hidden = !currentInterval;
    if (currentInterval) setSegment(elements["interval-fill"], currentInterval.start, currentInterval.end);
    elements["field-span-fill"].hidden = !fieldSpan;
    if (fieldSpan) setSegment(elements["field-span-fill"], fieldSpan.start, fieldSpan.end);
    renderSectionPreview();''',
    "live Field Span projection",
)
write("view.js", view)


# ---------- package.json ----------
package = json.loads(read("package.json"))
package["version"] = "5.4.0"
if "field-grammar-tests.mjs" not in package["scripts"]["test"]:
    package["scripts"]["test"] += " && node field-grammar-tests.mjs"
if "node --check step-field-geometry.js" not in package["scripts"]["check"]:
    package["scripts"]["check"] = package["scripts"]["check"].replace(
        "node --check step-field.js &&",
        "node --check step-field.js && node --check step-field-geometry.js &&",
    )
write("package.json", json.dumps(package, indent=2) + "\n")


# ---------- documentation ----------
readme = read("README.md")
readme = replace_once(
    readme,
    "Version 5.3 adds the audited Step Field projection to the spatial reader.",
    "Version 5.4 integrates the Step Field as a complete Address-and-Extent grammar rather than a parallel playback system.",
    "README version statement",
)
readme = replace_once(
    readme,
    '''Center remains the sole authoritative player and the only audible pane. Tail and Lead are smaller, muted, independently collapsible projections. They begin coincident with Current, unfold through differential playback while Continue is active, and hold at the existing Step distance. Selecting Tail or Lead executes the existing Step Backward or Step Forward operator; the Field creates no new Current, Interval, history, Pin, or Section semantics.

Context, Loop, Skim, pending Step gestures, and Range dragging suspend the side projections. Visibility is a presentation preference and does not enter Return history.''',
    '''Center remains the sole authoritative player and the only audible pane. Tail and Lead are smaller, muted, independently collapsible projections. They begin coincident with Current, unfold through differential playback while Continue is active, and hold at the existing Step distance. Once Held, all active panes continue at `1×`, so the completed relation slides through the source as one field.

A forming side is an actual visible Cursor and selects through Go. A Held side coincides with its Step Target and selects through Step. The actual Tail-to-Lead relation is Field Span: a transient Extent that may be looped or retained as a Section without becoming another Current, Interval, or Return history. Context belongs to Current, Skim to the Forward Target, and Loop to an explicit Extent. Context, Loop, Skim, pending Step gestures, and Range dragging suspend the side projections. Visibility is a presentation preference and does not enter Return history.''',
    "README canonical Field grammar",
)
readme = replace_once(
    readme,
    '''transport.js       transient Context, Continue, Skim, and Loop execution
step-field.js      transient Tail/Center/Lead projection and side-player synchronization''',
    '''transport.js       transient Context, Continue, Skim, and Extent-driven Loop execution
step-field-geometry.js pure Field targets, actual offsets, Span, phases, and side-selection mode
step-field.js      transient Tail/Center/Lead player synchronization''',
    "README Field architecture",
)
write("README.md", readme)

implementation = read("IMPLEMENTATION.md")
implementation += '''

## v5.4 Field grammar

The Step Field is now a physical Address-and-Extent projection rather than a second playback grammar.

```text
Coincident → Unfolding → Partially Held → Held
```

During Unfolding, a side pane exposes an actual Cursor and selects through `Go`. At Held, that Cursor equals the existing Step Target and selects through `Step`. Actual Tail and Lead Cursors derive `Field Span`; it may supply `Loop` or `Save Section`, but it never enters Session as Current, Interval, or physical history.

Observation controls are attached to their operands:

```text
Current        → Context
Forward Target → Skim
Interval       → Loop / Save Section
Field Span     → Loop / Save Section
Center         → Continue / Pause
```

`step-field-geometry.js` owns pure derivation. `step-field.js` owns side-player execution. Directional rate selection cannot silently round Tail or Lead to `1×`, side mute is reasserted continuously, and Continue stops at Range End rather than wrapping the Field across a discontinuity.
'''
write("IMPLEMENTATION.md", implementation)

print("Applied v5.4 Field grammar integration.")
