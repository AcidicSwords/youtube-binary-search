// Lexicon audit — the mechanical half of LEXICON.md.
//
// LEXICON.md is the normative naming authority; this file is the enforcement.
// It scans every product surface — source, UI, tests, and canonical docs — for
// terms LEXICON.md retired, and (as the migration completes) for cross-surface
// inconsistency in the terms it kept.
//
// It runs in two modes:
//
//   node lexicon-audit.mjs            report only; always exits 0
//   node lexicon-audit.mjs --strict   fails (exit 1) on any prohibited term
//
// During the lexicon overhaul the default is report-only, because the codebase
// is deliberately full of the old vocabulary until each phase migrates it. The
// final phase turns on --strict in the audit gate. Keeping the term data here,
// beside the scan, makes this the single structured source the audit checks
// against; LEXICON.md is its prose twin.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const STRICT = process.argv.includes("--strict");

// Surfaces the lexicon governs. Anything outside these extensions is not a
// product surface for naming purposes.
const SCANNED_EXTENSIONS = new Set([".js", ".mjs", ".css", ".html", ".md"]);

// Files that are allowed to name retired terms, because naming them is their
// job: the authority that lists them as forbidden, and this audit that hunts
// for them.
const EXEMPT_FILES = new Set(["LEXICON.md", "lexicon-audit.mjs"]);

const SKIP_DIRS = new Set(["node_modules", ".git"]);

// A retired term is a canonical phrase or identifier that LEXICON.md replaced.
// `pattern` matches its occurrences; `word` requires word boundaries (for terms
// that are ordinary English otherwise); `replacement` names what to use so the
// report is actionable. `caseInsensitive` is reserved for phrases that appear
// in prose and code both.
function term(pattern, replacement, options = {}) {
  return {
    pattern,
    replacement,
    word: options.word === true,
    caseInsensitive: options.caseInsensitive === true,
    category: options.category || "term"
  };
}

// Grouped by migration phase, so a report reads as a to-do list against the
// plan. Exact code identifiers are matched verbatim; visible phrases are matched
// case-insensitively where they appear in both prose and code.
export const RETIRED_TERMS = [
  // Carry is a kept feature (Alt carries the Timeline Selection through a
  // traversal), so its identifiers are canonical, not retired. Its operand name
  // `selectedRetained` migrates to `timelineSelection` under Phase 3 like every
  // other reference to the acquired Timeline operand.

  // Phase 3 — Current Neighborhood
  term("Resolution", "Current Neighborhood", { word: true, category: "neighborhood" }),
  term("resolutionBasis", "neighborhoodBasis", { category: "neighborhood" }),
  term("RESOLUTION_BASIS", "NEIGHBORHOOD_BASIS", { category: "neighborhood" }),
  term("currentResolution", "currentNeighborhood", { category: "neighborhood" }),
  term("previewResolution", "previewNeighborhood", { category: "neighborhood" }),
  term("resolution-fill", "neighborhood-fill", { category: "neighborhood" }),
  term("resolution-start-marker", "neighborhood-backward-bound", { category: "neighborhood" }),
  term("resolution-end-marker", "neighborhood-forward-bound", { category: "neighborhood" }),
  term("resolution-state", "neighborhood-state", { category: "neighborhood" }),
  term("resolution-limit", "refinement-limit", { category: "neighborhood" }),

  // Phase 3 — Active Span
  term("Working Interval", "Active Span", { caseInsensitive: true, category: "active-span" }),
  term("No Interval", "No Active Span", { category: "active-span" }),
  term("working-section", "active-span", { category: "active-span" }),
  term("positiveWorkingInterval", "positiveActiveSpan", { category: "active-span" }),
  term("releaseWorkingInterval", "releaseActiveSpan", { category: "active-span" }),
  term("FOCUS_KIND.WORKING", "FOCUS_KIND.ACTIVE_SPAN", { category: "active-span" }),
  term("activeSide", "activeEnd", { category: "active-span" }),
  term("departureFrame", "departureNeighborhood", { category: "active-span" }),
  term("arrivalFrame", "arrivalNeighborhood", { category: "active-span" }),

  // Phase 3 — Switch End / Retain / selection
  term("Switch Endpoint", "Switch End", { caseInsensitive: true, category: "operator" }),
  term("switchEndpoint", "switchActiveEnd", { category: "operator" }),
  term("switchCurrentEndpoint", "switchActiveEnd", { category: "operator" }),
  term("switch-endpoint", "switch-end", { category: "operator" }),
  term("Tag as Pin", "Retain Pin", { caseInsensitive: true, category: "operator" }),
  term("Tag as Section", "Retain Section", { caseInsensitive: true, category: "operator" }),
  term("saveCurrentIntervalAsSection", "retainActiveSpanAsSection", { category: "operator" }),
  term("Guide Focus", "Guide Selection", { caseInsensitive: true, category: "selection" }),
  term("Acquired Timeline Operand", "Timeline Selection", { caseInsensitive: true, category: "selection" }),

  // Phase 4 — Weighting / Topography
  term("SECTION_WEIGHT_VALUES", "SECTION_WEIGHTING_VALUES", { category: "weighting" }),
  term("DEFAULT_SECTION_WEIGHT", "DEFAULT_SECTION_WEIGHTING", { word: true, category: "weighting" }),
  term("normalizeSectionWeight", "normalizeSectionWeighting", { word: true, category: "weighting" }),
  term("setSectionWeight", "setSectionWeighting", { word: true, category: "weighting" }),
  term("weightedSections", "weightContributors", { category: "weighting" }),
  term("weightAtSource", "effectiveWeightAtSource", { category: "weighting" }),
  term("group.active", "group.weightsEnabled", { category: "weighting" }),
  term("sectionIsActive", "sectionWeightIsUsed", { category: "weighting" }),
  term("visibleGroupId", "shownGroupId", { word: true, category: "weighting" }),
  term("visibleGroup", "shownGroup", { word: true, category: "weighting" }),
  term("groupIsVisible", "groupIsShown", { category: "weighting" }),
  term("Deformation", "Temporal Topography / Relax Weights", { word: true, category: "topography" }),
  term("deformationBypass", "weightRelaxation", { category: "topography" }),
  term("toggleDeformation", "toggleWeightRelaxation", { category: "topography" }),
  term("Straighten", "Relax Weights", { word: true, caseInsensitive: true, category: "topography" }),
  term("formatStretch\\b", "formatStretchFactor", { category: "topography" }),

  // Phase 5 — Panorama
  term("Panoramic Phase Field", "Panorama", { caseInsensitive: true, category: "panorama" }),
  term("Step Field", "Panorama", { caseInsensitive: true, category: "panorama" }),
  term("Field Frame", "Panorama Frame", { caseInsensitive: true, category: "panorama" }),
  term("Field Breath", "Panorama Cycle", { caseInsensitive: true, category: "panorama" }),
  term("Breath Rate", "Side Rate Step", { caseInsensitive: true, category: "panorama" }),
  term("Hold both", "Freeze Panorama", { category: "panorama" }),
  term("stepField", "panorama", { category: "panorama" }),
  term("STEP_FIELD_PHASE", "PANORAMA_STATE", { category: "panorama" }),
  term("BREATH_PHASE", "PANORAMA_DIRECTION", { category: "panorama" }),
  term("BREATH_RATE_STEPS", "PANORAMA_SIDE_RATE_STEPS", { category: "panorama" }),
  term("DEFAULT_FIELD_BREATH", "DEFAULT_PANORAMA_CYCLE", { category: "panorama" }),
  term("breathRatePair", "panoramaSideRates", { category: "panorama" }),
  term("holdPanorama", "freezePanorama", { category: "panorama" }),

  // Phase 6 — Traversal Trace / Ghost
  term("User Time", "Traversal Trace", { caseInsensitive: true, category: "trace" }),
  term("createUserTime", "createTraversalTrace", { category: "trace" }),
  term("userTime", "traversalTrace", { category: "trace" }),
  term("UNIT_KIND.SPAN", "UNIT_KIND.PASSAGE", { category: "trace" }),
  term("appendContinuousTraversal", "appendObservedPassages", { category: "trace" }),
  term("latestCursorAtAddress", "latestTracePositionAtAddress", { category: "trace" }),
  term("cursorIsValid", "tracePositionIsValid", { category: "trace" }),
  term("ghostResumeCursor", "ghostContinuation", { category: "trace" }),
  term("GHOST_INJECTION", "GHOST_RETURN", { category: "trace" }),
  term("ghost-injection", "ghost-return", { category: "trace" }),
  term("appendGhostInjection", "appendGhostReturn", { category: "trace" }),
  term("Ghost Injection", "Ghost Return", { category: "trace" }),
  term("Ghost Current", "Ghost Position", { caseInsensitive: true, category: "trace" }),

  // Phase 7 — Chapters
  term("parseCueList", "parseChapters", { category: "chapters" }),
  term("cueName", "chapterTitle", { category: "chapters" }),
  term("cuesOnTimeline", "chaptersShownOnTimeline", { category: "chapters" }),
  term("Cues", "Chapters", { word: true, category: "chapters" }),

  // Phase 8 / State & Settings
  term("Parameters", "State & Settings", { word: true, category: "surface" }),
  term("Step Reach", "Step Distance", { category: "surface" }),
  term("Dynamic Playback", "Textured Playback", { caseInsensitive: true, category: "playback" }),
  term("dynamicRatePolicy", "texturedRatePolicy", { category: "playback" }),
  term("desiredCenterRate", "texturedRateForWeight", { category: "playback" }),
  term("dynamic-weight-texture", "textured", { category: "playback" })
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (SCANNED_EXTENSIONS.has(extname(entry)) && !EXEMPT_FILES.has(basename(full))) {
      out.push(full);
    }
  }
  return out;
}

function compile(entry) {
  const flags = entry.caseInsensitive ? "gi" : "g";
  const body = entry.word ? `\\b(?:${entry.pattern})\\b` : entry.pattern;
  return new RegExp(body, flags);
}

const files = walk(ROOT);
const perTerm = new Map();
const perFile = new Map();
let total = 0;

for (const file of files) {
  // A line ending in a `lexicon-allow` marker is a deliberate, documented use of
  // an old key -- the migration reads that must name a retired field to upgrade
  // a saved Guide, and the tests that feed one. Those are correct, so they are
  // exempt; every other occurrence is a defect.
  const text = readFileSync(file, "utf8")
    .split("\n")
    .filter(line => !line.includes("lexicon-allow"))
    .join("\n");
  const relative = file.slice(ROOT.length);
  for (const entry of RETIRED_TERMS) {
    const matches = text.match(compile(entry));
    if (!matches?.length) continue;
    total += matches.length;
    perTerm.set(entry.pattern, (perTerm.get(entry.pattern) || 0) + matches.length);
    perFile.set(relative, (perFile.get(relative) || 0) + matches.length);
  }
}

const byCount = (a, b) => b[1] - a[1];

console.log(`Lexicon audit — ${STRICT ? "STRICT" : "report only"}`);
console.log(`Scanned ${files.length} product-surface files.`);
console.log(`Retired-term occurrences remaining: ${total}\n`);

if (total > 0) {
  console.log("By term (top 25):");
  for (const [pattern, count] of [...perTerm.entries()].sort(byCount).slice(0, 25)) {
    const entry = RETIRED_TERMS.find(candidate => candidate.pattern === pattern);
    console.log(`  ${String(count).padStart(5)}  ${pattern}  →  ${entry.replacement}`);
  }
  console.log("\nBy file (top 20):");
  for (const [file, count] of [...perFile.entries()].sort(byCount).slice(0, 20)) {
    console.log(`  ${String(count).padStart(5)}  ${file}`);
  }
}

if (STRICT && total > 0) {
  console.error(`\nLexicon audit FAILED: ${total} retired-term occurrences remain.`);
  process.exit(1);
}

console.log(`\nLexicon audit ${total === 0 ? "clean" : "reported (report-only mode)"}.`);
