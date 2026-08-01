from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one occurrence, found {count}: {old[:90]!r}")
    write(path, text.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str, *, flags: int = 0) -> None:
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: regex did not match exactly once: {pattern[:100]!r}")
    write(path, next_text)


# ---------------------------------------------------------------------------
# guide.js — make Guide v8 complete at its schema boundary.
# ---------------------------------------------------------------------------

replace_once(
    "guide.js",
'''export function createGroup(guide, label = "", { id = null } = {}) {
  const group = {
    id: id || makeId("group"),
    label: String(label || "").trim(),
    visible: true,
    active: true,
    createdAt: now()
  };
  guide.groups.push(group);
  guide.updatedAt = now();
  return group;
}''',
'''export function createGroup(guide, label = "", { id = null } = {}) {
  const changedAt = now();
  const group = {
    id: id || makeId("group"),
    label: String(label || "").trim(),
    visible: true,
    active: true,
    createdAt: changedAt,
    updatedAt: changedAt
  };
  guide.groups.push(group);
  guide.updatedAt = changedAt;
  return group;
}'''
)

replace_once(
    "guide.js",
'''export function setGroupState(guide, groupId, changes = {}) {
  const group = guide.groups.find(entry => entry.id === groupId);
  if (!group) return null;
  if (typeof changes.visible === "boolean") group.visible = changes.visible;
  if (typeof changes.active === "boolean") group.active = changes.active;
  if (typeof changes.label === "string") group.label = changes.label.trim();
  guide.updatedAt = now();
  return group;
}''',
'''export function setGroupState(guide, groupId, changes = {}) {
  const group = guide.groups.find(entry => entry.id === groupId);
  if (!group) return null;
  if (typeof changes.visible === "boolean") group.visible = changes.visible;
  if (typeof changes.active === "boolean") group.active = changes.active;
  if (typeof changes.label === "string") group.label = changes.label.trim();
  const changedAt = now();
  group.updatedAt = changedAt;
  guide.updatedAt = changedAt;
  return group;
}'''
)

replace_once(
    "guide.js",
'''export function assignSectionGroup(guide, sectionId, groupId) {
  const section = guide.sections.find(entry => entry.id === sectionId);
  const group = guide.groups.find(entry => entry.id === groupId);
  if (!section || !group) return false;
  section.groupId = group.id;
  guide.updatedAt = now();
  return true;
}''',
'''export function assignSectionGroup(guide, sectionId, groupId) {
  const section = guide.sections.find(entry => entry.id === sectionId);
  const group = guide.groups.find(entry => entry.id === groupId);
  if (!section || !group) return false;
  const changedAt = now();
  section.groupId = group.id;
  section.updatedAt = changedAt;
  guide.updatedAt = changedAt;
  return true;
}'''
)

replace_once(
    "guide.js",
'''export function deleteGroup(guide, groupId) {
  if (groupId === DEFAULT_GROUP_ID) return false;
  const index = guide.groups.findIndex(group => group.id === groupId);
  if (index < 0) return false;
  guide.groups.splice(index, 1);
  for (const section of guide.sections) {
    if (section.groupId === groupId) section.groupId = DEFAULT_GROUP_ID;
  }
  guide.updatedAt = now();
  return true;
}''',
'''export function deleteGroup(guide, groupId) {
  if (groupId === DEFAULT_GROUP_ID) return false;
  const index = guide.groups.findIndex(group => group.id === groupId);
  if (index < 0) return false;
  const changedAt = now();
  guide.groups.splice(index, 1);
  for (const section of guide.sections) {
    if (section.groupId !== groupId) continue;
    section.groupId = DEFAULT_GROUP_ID;
    section.updatedAt = changedAt;
  }
  guide.updatedAt = changedAt;
  return true;
}'''
)

replace_once(
    "guide.js",
'''      if (source?.id === DEFAULT_GROUP_ID) {
        setGroupState(guide, DEFAULT_GROUP_ID, {
          visible: source.visible !== false,
          active: source.active !== false,
          label: String(source.label || "Map")
        });
      }''',
'''      if (source?.id === DEFAULT_GROUP_ID) {
        const group = setGroupState(guide, DEFAULT_GROUP_ID, {
          visible: typeof source.visible === "boolean" ? source.visible : true,
          active: typeof source.active === "boolean" ? source.active : true,
          label: String(source.label || "Map")
        });
        group.createdAt = Number(source.createdAt) || group.createdAt;
        group.updatedAt = Number(source.updatedAt) || group.createdAt;
      }'''
)

replace_once(
    "guide.js",
'''    group.visible = source.visible !== false;
    group.active = source.active !== false;
    group.createdAt = Number(source.createdAt) || group.createdAt;''',
'''    group.visible = typeof source.visible === "boolean" ? source.visible : true;
    group.active = typeof source.active === "boolean" ? source.active : true;
    group.createdAt = Number(source.createdAt) || group.createdAt;
    group.updatedAt = Number(source.updatedAt) || group.createdAt;'''
)

guide_tail = r'''export function validateGuide(guide, duration) {
  if (
    !guide
    || Number(guide.version) !== 8
    || !Array.isArray(guide.groups)
    || !Array.isArray(guide.pins)
    || !Array.isArray(guide.sections)
  ) return false;

  const end = Math.max(0, Number(duration) || 0);
  const ids = new Set();
  const groupIds = new Set();
  let defaultGroups = 0;

  for (const group of guide.groups) {
    if (
      !group?.id
      || ids.has(group.id)
      || typeof group.label !== "string"
      || typeof group.visible !== "boolean"
      || typeof group.active !== "boolean"
      || !Number.isFinite(group.createdAt)
      || !Number.isFinite(group.updatedAt)
    ) return false;
    if (group.id === DEFAULT_GROUP_ID) defaultGroups += 1;
    ids.add(group.id);
    groupIds.add(group.id);
  }
  if (defaultGroups !== 1) return false;

  for (const pin of guide.pins) {
    if (
      !pin?.id
      || ids.has(pin.id)
      || !Number.isFinite(pin.t)
      || pin.t < 0
      || pin.t > end
      || !Object.values(PIN_KIND).includes(pin.kind)
      || !Number.isFinite(pin.createdAt)
      || !Number.isFinite(pin.updatedAt)
    ) return false;
    ids.add(pin.id);
  }

  for (const section of guide.sections) {
    if (
      !section?.id
      || ids.has(section.id)
      || !section.startPinId
      || !section.endPinId
      || !section.groupId
      || !groupIds.has(section.groupId)
      || !isSectionWeight(section.weight)
      || !Number.isFinite(section.createdAt)
      || !Number.isFinite(section.updatedAt)
      || !resolveSection(guide, section)
    ) return false;
    ids.add(section.id);
  }
  return true;
}

/**
 * Recover the valid, canonical subset of a persisted Guide.
 * Corrupt entries are discarded independently so one malformed record does not
 * make the rest of the user's retained structure unreadable.
 */
export function sanitizeGuide(input, videoId, duration) {
  const end = Math.max(0, Number(duration) || 0);
  const source = input && Array.isArray(input.pins) && Array.isArray(input.sections)
    ? input
    : normalizeGuide(input, videoId);
  const preserveIndependentCoincidentPins = Number(source?.version) >= 7;
  const guide = createGuide(videoId);
  guide.groups = [];

  const idMap = new Map();
  const usedIds = new Set();
  const validGroupIds = new Set();

  const recoverGroup = (sourceGroup, forcedId = null) => {
    const id = forcedId || sourceGroup?.id;
    if (!id || usedIds.has(id)) return null;
    const createdAt = Number(sourceGroup?.createdAt) || now();
    const group = {
      id,
      label: String(
        sourceGroup?.label
        || (id === DEFAULT_GROUP_ID ? "Map" : "")
      ).trim(),
      visible: typeof sourceGroup?.visible === "boolean"
        ? sourceGroup.visible
        : true,
      active: typeof sourceGroup?.active === "boolean"
        ? sourceGroup.active
        : true,
      createdAt,
      updatedAt: Number(sourceGroup?.updatedAt) || createdAt
    };
    guide.groups.push(group);
    usedIds.add(id);
    validGroupIds.add(id);
    return group;
  };

  const sourceGroups = Array.isArray(source.groups) ? source.groups : [];
  recoverGroup(
    sourceGroups.find(group => group?.id === DEFAULT_GROUP_ID),
    DEFAULT_GROUP_ID
  );
  for (const sourceGroup of sourceGroups) {
    if (!sourceGroup?.id || sourceGroup.id === DEFAULT_GROUP_ID) continue;
    recoverGroup(sourceGroup);
  }

  for (const sourcePin of sortPins(source.pins || [])) {
    const address = Number(sourcePin?.t);
    if (
      !sourcePin?.id
      || usedIds.has(sourcePin.id)
      || !Number.isFinite(address)
      || address < 0
      || address > end
      || !Object.values(PIN_KIND).includes(sourcePin.kind)
    ) continue;

    const coincident = preserveIndependentCoincidentPins
      ? null
      : findPinAt(guide, address);
    if (coincident) {
      idMap.set(sourcePin.id, coincident.id);
      if (sourcePin.kind === PIN_KIND.EXPLICIT) coincident.kind = PIN_KIND.EXPLICIT;
      if (!coincident.label && String(sourcePin.label || "").trim()) {
        coincident.label = String(sourcePin.label).trim();
      }
      coincident.updatedAt = Math.max(
        Number(coincident.updatedAt) || 0,
        Number(sourcePin.updatedAt) || Number(sourcePin.createdAt) || 0
      );
      continue;
    }

    const createdAt = Number(sourcePin.createdAt) || now();
    const pin = {
      id: sourcePin.id,
      videoId,
      t: address,
      label: String(sourcePin.label || "").trim(),
      kind: sourcePin.kind,
      provenance: sourcePin.provenance || null,
      createdAt,
      updatedAt: Number(sourcePin.updatedAt) || createdAt
    };
    guide.pins.push(pin);
    idMap.set(sourcePin.id, pin.id);
    usedIds.add(pin.id);
  }
  guide.pins = sortPins(guide.pins);

  const sectionKeys = new Set();
  for (const sourceSection of source.sections || []) {
    if (!sourceSection?.id || usedIds.has(sourceSection.id)) continue;
    const firstPinId = idMap.get(sourceSection.startPinId);
    const secondPinId = idMap.get(sourceSection.endPinId);
    const label = String(sourceSection.label || "").trim();
    if (!firstPinId || !secondPinId || firstPinId === secondPinId) continue;

    const firstPin = getPin(guide, firstPinId);
    const secondPin = getPin(guide, secondPinId);
    if (!firstPin || !secondPin || Math.abs(firstPin.t - secondPin.t) <= EPSILON) continue;
    const [startPinId, endPinId] = firstPin.t < secondPin.t
      ? [firstPinId, secondPinId]
      : [secondPinId, firstPinId];
    const duplicateKey = sectionIdentityKey(startPinId, endPinId, label);
    if (sectionKeys.has(duplicateKey)) continue;

    const createdAt = Number(sourceSection.createdAt) || now();
    const section = {
      id: sourceSection.id,
      videoId,
      startPinId,
      endPinId,
      label,
      weight: normalizeSectionWeight(
        sourceSection.weight,
        sourceSection.collapsed === true ? 0.25 : DEFAULT_SECTION_WEIGHT
      ),
      groupId: validGroupIds.has(sourceSection.groupId)
        ? sourceSection.groupId
        : DEFAULT_GROUP_ID,
      provenance: sourceSection.provenance || null,
      createdAt,
      updatedAt: Number(sourceSection.updatedAt) || createdAt
    };
    const resolved = resolveSection({ ...guide, sections: [section] }, section);
    if (!resolved) continue;
    guide.sections.push(section);
    sectionKeys.add(duplicateKey);
    usedIds.add(section.id);
  }

  guide.updatedAt = Number(source.updatedAt) || now();
  return guide;
}
'''

replace_regex(
    "guide.js",
    r'export function validateGuide\(guide, duration\) \{[\s\S]*\Z',
    guide_tail,
)

# ---------------------------------------------------------------------------
# session.js — validate retained extents at the semantic boundary and preserve
# Group mutation metadata through the shared primitive.
# ---------------------------------------------------------------------------

replace_once(
    "session.js",
'''  if (
    !extent
    || !Number.isFinite(extent.start)
    || !Number.isFinite(extent.end)
    || extent.end - extent.start <= EPSILON
  ) return unchanged(session, "no-extent");''',
'''  if (
    !extent
    || !Number.isFinite(extent.start)
    || !Number.isFinite(extent.end)
    || extent.end - extent.start <= EPSILON
  ) return unchanged(session, "no-extent");
  if (
    extent.start < -EPSILON
    || extent.end > session.model.duration + EPSILON
  ) return unchanged(session, "extent-out-of-bounds");'''
)

replace_once(
    "session.js",
'''  return commit(session, `Rename Group “${name}”`, draft => {
    const target = draft.guide.groups?.find(entry => entry.id === groupId);
    if (!target) return { changed: false, reason: "missing-group" };
    target.label = next;
    return { changed: true, guideChanged: true, value: target };
  }, { guideEdit: true });''',
'''  return commit(session, `Rename Group “${name}”`, draft => {
    const target = setGroupState(draft.guide, groupId, { label: next });
    if (!target) return { changed: false, reason: "missing-group" };
    return { changed: true, guideChanged: true, value: target };
  }, { guideEdit: true });'''
)

# ---------------------------------------------------------------------------
# app.js — use the v8 persistence boundary, clear source-local interface state,
# route every Group edit through accept(), respect visible operands, and bridge
# source-space Field addresses into Timeline-space Step distances.
# ---------------------------------------------------------------------------

replace_once(
    "app.js",
'''  resolveSection,
  previousPin,
  nextPin,''',
'''  resolveSection,
  orderedPins,
  previousPin,
  nextPin,'''
)

replace_once(
    "app.js",
'''const STORAGE_V7_PREFIX = "binary-youtube-reader:v7:";''',
'''const STORAGE_V8_PREFIX = "binary-youtube-reader:v8:";
const STORAGE_V7_PREFIX = "binary-youtube-reader:v7:";'''
)

replace_once(
    "app.js",
'''function storageKey(prefix = STORAGE_V7_PREFIX) {''',
'''function storageKey(prefix = STORAGE_V8_PREFIX) {'''
)

replace_once(
    "app.js",
'''  const candidates = [
    [STORAGE_V7_PREFIX, raw => normalizeGuide(raw, state.videoId)],''',
'''  const candidates = [
    [STORAGE_V8_PREFIX, raw => normalizeGuide(raw, state.videoId)],
    [STORAGE_V7_PREFIX, raw => normalizeGuide(raw, state.videoId)],'''
)

replace_once(
    "app.js",
'''function clearMetadataRetry() {
  if (metadataTimer !== null) clearTimeout(metadataTimer);
  metadataTimer = null;
}

function initializeVideo() {''',
'''function clearMetadataRetry() {
  if (metadataTimer !== null) clearTimeout(metadataTimer);
  metadataTimer = null;
}

// Cues, selections, previews, and gesture accumulators have meaning only inside
// the source that produced them. Reset them as one boundary operation before a
// different video is cued so no route can carry an Address or retained identity
// across source identity.
function resetSourceScopedState() {
  state.cues = [];
  state.cuesOnTimeline = false;
  if (elements["cue-source"]) elements["cue-source"].value = "";
  state.selectedRetained = null;
  state.selectedPinIds = [];
  state.deformWeightMemory.clear();
  state.shiftLayer = false;
  state.shiftKeyHeld = false;
  state.guideDrag = null;
  state.guideClickSuppressed = false;
  state.currentDrag = null;
  state.directFrame = null;
  if (state.nudgeGesture?.timer) window.clearTimeout(state.nudgeGesture.timer);
  state.nudgeGesture = null;
  state.field = null;
  view.setPreviewAction(null);
  view.setPreviewSection(null);
}

function initializeVideo() {'''
)

replace_once(
    "app.js",
'''  state.videoLoaded = false;
  state.videoId = null;
  state.dragHandle = null;''',
'''  state.videoLoaded = false;
  state.videoId = null;
  resetSourceScopedState();
  state.dragHandle = null;'''
)

replace_once(
    "app.js",
'''  return sourceGuide.pins
    .filter(pin =>''',
'''  return orderedPins(sourceGuide)
    .filter(pin =>'''
)

old_group_handlers = '''elements["sections-list"].addEventListener("change", event => {
  const move = event.target.closest?.("[data-section-group]");
  if (move) {
    settleBeforeAction();
    const moved = assignGuideSectionGroup(
      state.session,
      move.dataset.sectionGroup,
      move.value
    );
    if (!moved.changed) return view.renderGuide();
    state.session = moved.session;
    view.renderGuide();
    view.render();
    return setStatus(`${moved.session.history.at(-1)?.label || "Section moved"}.`);
  }
  const toggle = event.target.closest?.("[data-group-toggle]");
  if (!toggle) return;
  const key = toggle.dataset.groupState;
  if (key !== "visible" && key !== "active") return;
  settleBeforeAction();
  const result = setGuideGroupState(state.session, toggle.dataset.groupToggle, {
    [key]: toggle.checked === true
  });
  if (!result.changed) return view.renderGuide();
  state.session = result.session;
  view.renderGuide();
  view.render();
  setStatus(`${result.session.history.at(-1)?.label || "Group updated"}.`);
});'''

new_group_handlers = '''elements["sections-list"].addEventListener("change", event => {
  const move = event.target.closest?.("[data-section-group]");
  if (move) {
    settleBeforeAction();
    const moved = assignGuideSectionGroup(
      state.session,
      move.dataset.sectionGroup,
      move.value
    );
    if (!moved.changed) return view.renderGuide();
    return accept(moved, {
      effect: false,
      renderGuide: true,
      status: `${moved.session.history.at(-1)?.label || "Section moved"}.`
    });
  }
  const toggle = event.target.closest?.("[data-group-toggle]");
  if (!toggle) return;
  const key = toggle.dataset.groupState;
  if (key !== "visible" && key !== "active") return;
  settleBeforeAction();
  const result = setGuideGroupState(state.session, toggle.dataset.groupToggle, {
    [key]: toggle.checked === true
  });
  if (!result.changed) return view.renderGuide();
  accept(result, {
    effect: false,
    renderGuide: true,
    status: `${result.session.history.at(-1)?.label || "Group updated"}.`
  });
});'''
replace_once("app.js", old_group_handlers, new_group_handlers)

replace_once(
    "app.js",
'''  const created = createGuideGroup(state.session, `Group ${(guide().groups?.length || 1)}`);
  if (!created.changed) return;
  state.session = created.session;
  view.renderGuide();
  view.render();
  setStatus("Added a Group. Move Sections into it from their Group control.");''',
'''  const created = createGuideGroup(state.session, `Group ${(guide().groups?.length || 1)}`);
  if (!created.changed) return;
  accept(created, {
    effect: false,
    renderGuide: true,
    status: "Added a Group. Move Sections into it from their Group control."
  });'''
)

replace_once(
    "app.js",
'''  setStatus(
    result.stepReach.mode === STEP_REACH_MODE.ADAPTIVE
      ? `${label}: 1/${Math.round(1 / result.stepReach.fraction)} of active Range (${effective.forward.toFixed(2)}s lateral).`
      : `${label}: ${result.stepReach.forward}s.`
  );''',
'''  setStatus(
    result.stepReach.mode === STEP_REACH_MODE.ADAPTIVE
      ? `${label}: 1/${Math.round(1 / result.stepReach.fraction)} of active Range (${effective.forward.toFixed(2)} map units).`
      : `${label}: ${result.stepReach.forward} map units.`
  );'''
)

replace_once(
    "app.js",
'''const sideStep = role => event => {
  const selection = stepField?.getStepSelection?.(role) || null;
  return selection
    ? {
        ...selection,
        carryRetained: event?.altKey === true || state.carryModifier
      }
    : null;
};''',
'''const sideStep = role => event => {
  const selection = stepField?.getStepSelection?.(role) || null;
  if (!selection || !Number.isFinite(selection.address) || !currentResolution()) {
    return null;
  }
  // The Field presents an exact source Address; Step consumes Timeline Space.
  // Convert at the application boundary so activating a visible phase lands on
  // that phase under neutral, compressed, expanded, and overlapping terrain.
  const distance = timelineProjection().timelineDistance(
    currentResolution().C,
    selection.address
  );
  if (!(distance > EPSILON)) return null;
  return {
    ...selection,
    distance,
    carryRetained: event?.altKey === true || state.carryModifier
  };
};'''
)

# ---------------------------------------------------------------------------
# Presentation-only corrections: describe the operation and unit actually used.
# ---------------------------------------------------------------------------

replace_once(
    "index.html",
'''aria-label="Current; drag to Go, Shift-drag for precision"''',
'''aria-label="Current; drag to Step, Shift-drag for precision"'''
)
replace_once(
    "index.html",
'''<summary><span>Movement distance</span><span id="step-size-summary">10 s manual</span></summary>''',
'''<summary><span>Movement distance</span><span id="step-size-summary">10 map units manual</span></summary>'''
)
replace_once(
    "index.html",
'''                    <span>s</span>
                  </span>
                </label>
                <div class="adaptive-step-presets"''',
'''                    <span>map units</span>
                  </span>
                </label>
                <div class="adaptive-step-presets"'''
)

replace_once(
    "view.js",
'''      const label = contextObservation
        ? "Set Current Here"
        : ordinaryPlayback''',
'''      const label = contextObservation
        ? "Stop Context and Play"
        : ordinaryPlayback'''
)

replace_once(
    "view.js",
'''      : `${formatDuration(configuredReach.forward)} manual`;''',
'''      : `${Number(Number(configuredReach.forward).toFixed(3))} map units manual`;'''
)

# Keep canonical documents and source assertions aligned with the corrected
# operation names without performing a broad terminology rewrite.
for path in [
    "SPEC.md",
    "INTERFACE.md",
    "IMPLEMENTATION.md",
    "README.md",
    "PROJECT.md",
    "VALIDATION.md",
    "integration-check.mjs",
    "project-audit.mjs",
    "startup-smoke.mjs",
    "interaction-smoke.mjs",
]:
    target = ROOT / path
    if not target.exists():
        continue
    text = target.read_text(encoding="utf-8")
    text = text.replace("Current; drag to Go, Shift-drag for precision",
                        "Current; drag to Step, Shift-drag for precision")
    text = text.replace("Set Current Here", "Stop Context and Play")
    target.write_text(text, encoding="utf-8")

# ---------------------------------------------------------------------------
# Regression suite: pure semantic tests plus static composition-root guards.
# ---------------------------------------------------------------------------

tests = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_GROUP_ID,
  PIN_KIND,
  assignSectionGroup,
  createGroup,
  createGuide,
  createSectionFromTimes,
  deleteGroup,
  ensurePin,
  orderedPins,
  sanitizeGuide,
  setGroupState,
  validateGuide
} from "./guide.js";
import {
  createSession,
  saveExtentAsSection,
  step
} from "./session.js";
import { projectionForModel } from "./timeline-projection.js";

const clone = value => structuredClone(value);

// A valid v8 Guide round-trips every retained dimension of Group membership.
{
  const source = createGuide("video-a");
  const terrain = createGroup(source, "Terrain", { id: "group-terrain" });
  const section = createSectionFromTimes(source, 10, 30, {
    id: "section-terrain",
    label: "Terrain Section",
    weight: 2,
    groupId: terrain.id
  }).section;
  setGroupState(source, terrain.id, { visible: false, active: true });

  const recovered = sanitizeGuide(clone(source), "video-a", 60);
  assert.equal(validateGuide(recovered, 60), true);
  assert.equal(recovered.groups.length, 2);
  assert.deepEqual(
    recovered.groups.map(group => ({
      id: group.id,
      label: group.label,
      visible: group.visible,
      active: group.active
    })),
    source.groups.map(group => ({
      id: group.id,
      label: group.label,
      visible: group.visible,
      active: group.active
    }))
  );
  assert.equal(
    recovered.sections.find(item => item.id === section.id)?.groupId,
    terrain.id
  );
}

// Corrupt membership is repaired to Map; malformed Groups cannot invalidate the
// rest of a recoverable Guide.
{
  const source = createGuide("video-b");
  const section = createSectionFromTimes(source, 5, 15, {
    id: "section-repair"
  }).section;
  section.groupId = "group-missing";
  source.groups.push({
    id: "",
    label: "Broken",
    visible: "yes",
    active: true,
    createdAt: 1,
    updatedAt: 1
  });

  const recovered = sanitizeGuide(source, "video-b", 30);
  assert.equal(validateGuide(recovered, 30), true);
  assert.equal(recovered.sections[0].groupId, DEFAULT_GROUP_ID);
  assert.equal(recovered.groups.some(group => group.id === ""), false);
}

// Validation covers the complete v8 partition, not only Pins and Sections.
{
  const valid = createGuide("video-c");
  createSectionFromTimes(valid, 1, 2, { id: "section-valid" });
  assert.equal(validateGuide(valid, 10), true);

  const noGroups = clone(valid);
  delete noGroups.groups;
  assert.equal(validateGuide(noGroups, 10), false);

  const duplicateGroup = clone(valid);
  duplicateGroup.groups.push(clone(duplicateGroup.groups[0]));
  assert.equal(validateGuide(duplicateGroup, 10), false);

  const malformedState = clone(valid);
  malformedState.groups[0].active = "true";
  assert.equal(validateGuide(malformedState, 10), false);

  const invalidMembership = clone(valid);
  invalidMembership.sections[0].groupId = "missing";
  assert.equal(validateGuide(invalidMembership, 10), false);
}

// Every Group mutation updates the retained object it changes.
{
  const guide = createGuide("video-d");
  const group = createGroup(guide, "A", { id: "group-a" });
  const section = createSectionFromTimes(guide, 2, 8, {
    id: "section-a"
  }).section;

  group.updatedAt = 1;
  guide.updatedAt = 1;
  setGroupState(guide, group.id, { visible: false });
  assert.ok(group.updatedAt > 1);
  assert.equal(guide.updatedAt, group.updatedAt);

  section.updatedAt = 1;
  guide.updatedAt = 1;
  assignSectionGroup(guide, section.id, group.id);
  assert.ok(section.updatedAt > 1);
  assert.equal(section.groupId, group.id);
  assert.equal(guide.updatedAt, section.updatedAt);

  section.updatedAt = 1;
  guide.updatedAt = 1;
  deleteGroup(guide, group.id);
  assert.equal(section.groupId, DEFAULT_GROUP_ID);
  assert.ok(section.updatedAt > 1);
  assert.equal(guide.updatedAt, section.updatedAt);
}

// Retention rejects source-impossible extents at the Session boundary.
{
  const session = createSession({ duration: 60, current: 0 });
  const negative = saveExtentAsSection(
    session,
    { start: -1, end: 5 },
    "negative"
  );
  assert.equal(negative.changed, false);
  assert.equal(negative.reason, "extent-out-of-bounds");

  const overflow = saveExtentAsSection(
    session,
    { start: 55, end: 61 },
    "overflow"
  );
  assert.equal(overflow.changed, false);
  assert.equal(overflow.reason, "extent-out-of-bounds");

  const valid = saveExtentAsSection(
    session,
    { start: 0, end: 60 },
    "whole"
  );
  assert.equal(valid.changed, true);
  assert.equal(validateGuide(valid.session.model.guide, 60), true);
}

// Map visibility defines map operands; standalone landmarks remain reachable.
{
  const guide = createGuide("video-e");
  const hidden = createGroup(guide, "Hidden", { id: "group-hidden" });
  const section = createSectionFromTimes(guide, 10, 20, {
    id: "section-hidden",
    groupId: hidden.id
  }).section;
  const standalone = ensurePin(guide, 30, {
    id: "pin-standalone",
    kind: PIN_KIND.EXPLICIT
  }).pin;
  setGroupState(guide, hidden.id, { visible: false });

  const visibleIds = orderedPins(guide).map(pin => pin.id);
  assert.equal(visibleIds.includes(section.startPinId), false);
  assert.equal(visibleIds.includes(section.endPinId), false);
  assert.equal(visibleIds.includes(standalone.id), true);
}

// The Field-to-Step bridge is exact across deformed and overlapping terrain:
// map distance to the displayed source Address lands on that Address.
{
  const guide = createGuide("video-f");
  createSectionFromTimes(guide, 0, 30, {
    id: "section-expanded",
    weight: 2
  });
  createSectionFromTimes(guide, 15, 45, {
    id: "section-compressed",
    weight: 0.5
  });
  const session = createSession({
    duration: 60,
    current: 10,
    guide
  });
  const projection = projectionForModel(session.model);
  const target = 40;
  const distance = projection.timelineDistance(
    session.model.resolution.C,
    target
  );
  const moved = step(session, "forward", distance);
  assert.equal(moved.changed, true);
  assert.ok(Math.abs(moved.session.model.resolution.C - target) < 1e-6);
}

// Composition-root guards ensure alternate routes retain the same owner.
{
  const app = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const view = fs.readFileSync(new URL("./view.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

  assert.ok(app.includes('const STORAGE_V8_PREFIX = "binary-youtube-reader:v8:";'));
  assert.ok(
    app.indexOf("[STORAGE_V8_PREFIX") < app.indexOf("[STORAGE_V7_PREFIX")
  );
  assert.ok(app.includes("resetSourceScopedState();"));
  assert.ok(app.includes("state.cues = [];"));
  assert.ok(app.includes("return orderedPins(sourceGuide)"));
  assert.ok(app.includes("timelineProjection().timelineDistance("));
  assert.ok(app.includes("selection.address"));
  assert.ok(app.includes("accept(moved, {"));
  assert.ok(app.includes("accept(result, {"));
  assert.ok(app.includes("accept(created, {"));
  assert.equal(app.includes("state.session = moved.session;"), false);

  assert.ok(view.includes('"Stop Context and Play"'));
  assert.ok(html.includes("Current; drag to Step, Shift-drag for precision"));
  assert.ok(html.includes("map units"));
}

console.log("stabilization invariants passed");
'''
write("stabilization-tests.mjs", tests)

package = json.loads(read("package.json"))
if "node stabilization-tests.mjs" not in package["scripts"]["test"]:
    package["scripts"]["test"] += " && node stabilization-tests.mjs"
write("package.json", json.dumps(package, indent=2) + "\n")

notes = '''# Stabilization Patch

Base: `5c8a5f1340671fea2cfd60a8d7ecf536a5636d3c`

This patch deliberately changes no project theory and introduces no new
interaction family. It closes invariant failures at existing boundaries:

- Guide v8 is persisted under a v8 key and migrated non-destructively from
  earlier keys.
- Groups and Section membership survive normalization, sanitization, reload,
  Undo, and all ordinary Guide-edit routes.
- Source-local Cues, selections, previews, and gesture state cannot cross into a
  different video.
- retained extents are rejected when they lie outside the loaded source.
- hidden map Pins are not map snap operands.
- activating a Field side lands on the source Address visibly presented there,
  with Timeline Space conversion performed by the application.
- Current drag, Context transition, and Step Reach units are labelled according
  to their existing operations.

Validation is part of the archive build. The complete existing `npm run check`
must pass, followed by the added cross-boundary stabilization tests.
'''
write("STABILIZATION_NOTES.md", notes)
