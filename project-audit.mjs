import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = path => readFileSync(new URL(`./${path}`, import.meta.url), "utf8")
  .replace(/\r\n?/g, "\n");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const has = (source, pattern, message) => {
  pattern.lastIndex = 0;
  check(pattern.test(source), message);
};
const lacks = (source, pattern, message) => {
  pattern.lastIndex = 0;
  check(!pattern.test(source), message);
};
const count = (source, pattern) => {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...source.matchAll(new RegExp(pattern.source, flags))].length;
};
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const canonicalNames = [
  "README.md",
  "PROJECT.md",
  "GLOSSARY.md",
  "SPEC.md",
  "IMPLEMENTATION.md",
  "INTERFACE.md",
  "DEVELOPMENT.md",
  "VALIDATION.md"
];
const docs = Object.fromEntries(canonicalNames.map(name => [name, read(name)]));
const pkg = JSON.parse(read("package.json"));
const html = read("index.html");
const app = read("app.js");
const view = read("view.js");
const styles = read("styles.css");
const session = read("session.js");
const projection = read("timeline-projection.js");
const workflow = read(".github/workflows/verify.yml");
const deployWorkflow = existsSync(new URL("./.github/workflows/deploy-pages.yml", import.meta.url))
  ? read(".github/workflows/deploy-pages.yml")
  : "";
const canonicalText = canonicalNames.map(name => docs[name]).join("\n");
const productText = [html, app, view, styles, session].join("\n");

// A completion release contains current law, not patch-delivery debris or a
// second retired implementation waiting to be rediscovered.
for (const retired of [
  ".v5.2-patch-backup",
  "BRANCH_INSTALL.md",
  "DELETE_FILES.txt",
  "MANUAL_SMOKE.md",
  "PATCHSET.md",
  "SHA256SUMS",
  "STABILIZATION_NOTES.md",
  "TEST_REPORT.md",
  "coherence.patch.gz.b64.00",
  "coherence.patch.gz.b64.01",
  "coherence.patch.gz.b64.02",
  "source-field.js",
  "source-field-tests.mjs",
  "structure.js",
  "traversal.js",
  "v5.2-regression-tests.mjs"
]) check(!existsSync(new URL(`./${retired}`, import.meta.url)), `Retired artifact remains: ${retired}.`);

check(pkg.name === "video-cartography", "package.json retains the canonical package name.");
check(pkg.version === "8.0.0", "Completion release is package version 8.0.0.");
check(pkg.private === true && pkg.type === "module", "The static private ES-module package boundary is explicit.");
check(pkg.scripts?.verify === "npm run check && npm run test:browser",
  "verify composes the DOM-free and Chromium gates.");
check(pkg.scripts?.audit === "node integration-check.mjs && node project-audit.mjs",
  "Both final-law gauges are part of check.");
// Everything that needs a real browser runs from one route, so there is no way
// to satisfy the release gate while skipping a suite that needs Chromium.
check(pkg.scripts?.["test:browser"] === "node browser-smoke.mjs && node ghost-smoke.mjs",
  "The browser proof has one package route covering every browser-backed suite.");
has(pkg.scripts?.check || "", /npm run test:semantic/, "The extended semantic state-space proof runs in check.");
has(pkg.scripts?.check || "", /npm run audit/, "The validation gauges run in check.");

// Reproducibility is a release law. Dependency selection happens once in the
// lockfile, both verification jobs install it exactly, and Chromium follows the
// resolved playwright-core version rather than another hand-written number.
const lockUrl = new URL("./package-lock.json", import.meta.url);
check(existsSync(lockUrl), "package-lock.json is committed.");
let lock = null;
if (existsSync(lockUrl)) {
  try {
    lock = JSON.parse(read("package-lock.json"));
  } catch {
    failures.push("package-lock.json is valid JSON.");
  }
}
if (lock) {
  check(lock.lockfileVersion === 3, "The lockfile uses the current npm lock format.");
  check(lock.name === pkg.name && lock.version === pkg.version,
    "Lockfile package identity/version matches package.json.");
  check(lock.packages?.[""]?.version === pkg.version,
    "Lockfile root package version matches package.json.");
  const declared = pkg.devDependencies?.["playwright-core"];
  const lockedRoot = lock.packages?.[""]?.devDependencies?.["playwright-core"];
  const resolved = lock.packages?.["node_modules/playwright-core"]?.version;
  check(Boolean(declared && resolved), "playwright-core is declared and resolved in the lockfile.");
  check(declared === lockedRoot, "Lockfile records the exact top-level Playwright declaration.");
  check(!/^[~^]/.test(declared || ""), "Top-level playwright-core is exact rather than a drifting range.");
  check(declared === resolved, "Top-level playwright-core matches the locked installed version.");
}
check(count(workflow, /^\s*- run:\s*npm ci(?:\s|$)/gm) === 2,
  "Both Verify jobs install with npm ci.");
lacks(`${workflow}\n${deployWorkflow}`, /\bnpm install\b/,
  "No CI workflow bypasses the lockfile with npm install.");
has(workflow, /playwright@"\$\(node -p 'require\("playwright-core\/package\.json"\)\.version'\)"/,
  "Chromium install follows the lock-resolved playwright-core version.");
lacks(workflow, /playwright@\d/, "CI carries no second hand-written Playwright version.");
if (deployWorkflow) {
  has(deployWorkflow, /\bnpm ci\b/, "The Pages verification job also uses the committed lockfile.");
  has(deployWorkflow, /\bnpm run verify\b/,
    "Pages deployment is gated by the complete browser-backed release command.");
  lacks(deployWorkflow, /^\s*- master\s*$/m,
    "Pages no longer advertises a nonexistent legacy branch.");
}

// Package gates execute every executable suite. A file that is not reachable
// from a script is not release evidence; a removed file cannot remain in docs.
const suiteNames = readdirSync(new URL("./", import.meta.url))
  .filter(name => name.endsWith(".mjs"))
  .filter(name => !name.endsWith("-harness.mjs"))
  .sort();
const packageScripts = Object.values(pkg.scripts || {}).join(" && ");
for (const suite of suiteNames) {
  check(packageScripts.includes(suite), `${suite} is reachable from a package gate.`);
}
const mappedSuites = [...docs["DEVELOPMENT.md"].matchAll(/^\s*-\s+`([^`]+\.mjs)`\s+[—-]/gm)]
  .map(match => match[1]);
for (const suite of suiteNames) {
  check(mappedSuites.filter(name => name === suite).length === 1,
    `DEVELOPMENT.md maps ${suite} exactly once.`);
}
for (const mapped of new Set(mappedSuites)) {
  check(suiteNames.includes(mapped), `DEVELOPMENT.md maps only existing suites (${mapped}).`);
}

// The grammar proof is data shared by tests, not a second UI implementation.
for (const fixture of ["operator-grammar.js", "operator-grammar-tests.mjs"]) {
  check(existsSync(new URL(`./${fixture}`, import.meta.url)), `${fixture} exists.`);
}
if (existsSync(new URL("./operator-grammar.js", import.meta.url))) {
  const grammar = read("operator-grammar.js");
  has(grammar, /\[\s*Object\.freeze\(\{ id: "refine-backward"[\s\S]*?id: "reopen"[\s\S]*?id: "refine-forward"/,
    "Grammar fixture states the QWE row.");
  has(grammar, /id: "step-backward"[\s\S]*?id: "switch-endpoint"[\s\S]*?id: "step-forward"/,
    "Grammar fixture states the ASD row.");
  has(grammar, /id: "release"[\s\S]*?id: "retain"[\s\S]*?id: "focus-toggle"/,
    "Grammar fixture states the RTF row.");
}
has(read("operator-grammar-tests.mjs"), /from "\.\/operator-grammar\.js"/,
  "The grammar proof imports the fixture.");

// Document identity and release authority.
has(docs["README.md"], /^# Video Cartography\s*$/m, "README has the product heading.");
has(docs["PROJECT.md"], /^# Video Cartography\s*$/m, "PROJECT has the stable product heading.");
has(docs["GLOSSARY.md"], /^# Video Cartography\s+—\s+Canonical Glossary\s*$/m,
  "GLOSSARY identifies itself as canonical.");
has(docs["SPEC.md"], /^# Video Cartography\s+—\s+Canonical Specification\s*$/m,
  "SPEC identifies itself as canonical.");
has(docs["IMPLEMENTATION.md"], /^# Video Cartography\s+—\s+Canonical Implementation\s*$/m,
  "IMPLEMENTATION identifies itself as canonical.");
has(docs["INTERFACE.md"], /^# Video Cartography\s+—\s+Interface Grammar\s*$/m,
  "INTERFACE identifies the UI grammar.");
for (const name of canonicalNames.slice(1)) {
  check(docs["README.md"].includes(`\`${name}\``), `README links ${name}.`);
}
has(docs["SPEC.md"], new RegExp(`package release \\*\\*${escapeRegExp(pkg.version)}\\*\\*`, "i"),
  "SPEC authority exactly matches the package release version.");
lacks(docs["SPEC.md"], /normative for v(?!8\.0\.0\b)\d/i,
  "SPEC contains no stale normative release version.");

// Each canonical document has a distinct job and states the final behavior at
// that altitude. These checks bind to law-bearing terms, not patch history.
for (const section of [
  /## Load and play/,
  /## Panoramic Phase Field/,
  /## Temporal Topography/,
  /## Active Span and operators/,
  /## Guide and direct manipulation/,
  /## Shortcuts/,
  /## Run locally/
]) has(docs["README.md"], section, `README includes user orientation ${section}.`);
has(docs["README.md"], /ordinary YouTube player[\s\S]*?(?:captions|settings)[\s\S]*?fullscreen/i,
  "README preserves ordinary player capability.");
has(docs["README.md"], /npm ci[\s\S]*?npm run verify/,
  "README gives reproducible setup and the complete release gate.");
check(docs["README.md"].split("\n").length <= 240,
  "README remains a concise user orientation rather than a second specification.");

for (const law of [
  /source time is authoritative/i,
  /Timeline Space is positive[\s\S]*invertible/i,
  /contiguous Active Span residue/i,
  /one semantic consequence has one implementation/i,
  /ordinary video-player capability/i,
  /advanced mechanism.*optional/i
]) has(docs["PROJECT.md"], law, `PROJECT states design law ${law}.`);
has(docs["PROJECT.md"], /Q\s+Refine Backward[\s\S]*W\s+Reopen[\s\S]*E\s+Refine Forward[\s\S]*R\s+Release[\s\S]*T\s+Tag[\s\S]*F\s+Focus/,
  "PROJECT states exact QWE / ASD / RTF.");
has(docs["PROJECT.md"], /Toggle Deformation[\s\S]*transient[\s\S]*source-scoped/i,
  "PROJECT explains optional deformation comparison without editing Weight.");

for (const entry of [
  "Tag",
  "Deformation Bypass / Toggle Deformation",
  "Drawn Group",
  "Release",
  "Dynamic Playback",
  "Load Generation",
  "Source-transition boundary",
  "Guide Recovery"
]) {
  has(docs["GLOSSARY.md"], new RegExp(`^\\s*- \\*\\*${escapeRegExp(entry)}\\*\\*\\s+—`, "mi"),
    `GLOSSARY defines ${entry}.`);
}
has(docs["GLOSSARY.md"], /Drawn Group[\s\S]{0,240}?At most one Group is drawn[\s\S]{0,100}?no Group/i,
  "Glossary defines zero-or-one drawn Group.");
has(docs["GLOSSARY.md"], /Release[\s\S]{0,300}?Active Span[\s\S]{0,120}?acquired Timeline operand[\s\S]{0,220}?preserves Current/i,
  "Glossary defines Release's exact cleared and preserved dimensions.");
has(docs["GLOSSARY.md"], /Dynamic Playback[\s\S]{0,400}?Section Weight[\s\S]{0,200}?playback-rate step/i,
  "Glossary qualifies the optional dynamic Weight read-through as one rate step per octave.");
// The law is a log-compressed texture, not a correction of the map. Naming it as
// an inverse would advertise a relation the implementation does not provide --
// W = 4 plays at 0.5x, not 0.25x -- and would set the reader up to read the
// Panorama as a cancellation of deformation rather than a reading of it.
lacks(canonicalText, /\binverse of (?:the )?(?:effective |cumulative )?Weight\b|\binverse-Weight\b|\bnormalized playback\b|\bconstant Timeline velocity\b/i,
  "No canonical document describes dynamic playback as inverting the map.");
lacks(html, /rate the inverse of the map|inverse of (?:the )?weight/i,
  "and no visible control does either.");
lacks(docs["GLOSSARY.md"], /^\s*- \*\*Cue\*\*[^\n]*not[^\n]*projected/im,
  "Glossary does not contradict the projection used to draw optional Cues.");

for (const law of [
  /### 3\.3 Subtractive Active Span/,
  /### 4\.3 One effective projection/,
  /### 4\.4 Deformation-bypass law/,
  /### 5\.1 Exact matrix/,
  /### 5\.7 Release/,
  /### 5\.8 Tag/,
  /### 8\.2 Explicit Playback ownership/,
  /### 9\.3 Recovery result/,
  /### 10\.1 Generation-owned loading/,
  /### 10\.2 One source-transition boundary/
]) has(docs["SPEC.md"], law, `SPEC contains final law ${law}.`);
has(docs["SPEC.md"], /density at source Address[^\n]*product of weights[\s\S]*?Timeline\(t\)\s*=\s*integral/i,
  "SPEC defines positive compositional Timeline density.");
has(docs["SPEC.md"], /observationPolicy:\s*"panorama" \| "center-only"[\s\S]*ratePolicy:[\s\S]*actualRate:/,
  "SPEC separates observation, rate policy, and confirmed actual rate.");
has(docs["SPEC.md"], /unreadableHigherPriorityRecords[\s\S]*quarantineSucceeded[\s\S]*safeToRewriteCurrent/,
  "SPEC defines the complete non-destructive Guide recovery result.");

for (const implementationLaw of [
  /## Ownership/,
  /## Operator routes/,
  /## One effective projection/,
  /### Deformation bypass/,
  /## Persistence and recovery/,
  /## Source-generation boundary/,
  /## Nudge and direct manipulation/,
  /## Playback and media authority/,
  /## Field Frame and Field Breath/
]) has(docs["IMPLEMENTATION.md"], implementationLaw,
  `IMPLEMENTATION describes ${implementationLaw}.`);
has(docs["IMPLEMENTATION.md"], /projection\.weightContributors|effective contributors/i,
  "IMPLEMENTATION says atmosphere consumes effective projection contributors.");
has(docs["IMPLEMENTATION.md"], /Guide persistence is source-keyed under version 10/i,
  "IMPLEMENTATION names the exact current Guide persistence version.");
has(docs["IMPLEMENTATION.md"], /rejects?[^\n]*outside[^\n]*Range/i,
  "IMPLEMENTATION says exact Address input rejects rather than clamps.");
has(docs["IMPLEMENTATION.md"], /One wheel handler/i,
  "IMPLEMENTATION states one shared wheel accumulator route.");

for (const interfaceLaw of [
  /## Panorama/,
  /## Temporal Topography/,
  /## Operators/,
  /### Tag/,
  /### Toggle Deformation/,
  /## Guide/,
  /### Sections/,
  /### Pins/,
  /### Cues/,
  /## Parameters/,
  /## Keyboard and modifier reference/
]) has(docs["INTERFACE.md"], interfaceLaw, `INTERFACE describes ${interfaceLaw}.`);
has(docs["INTERFACE.md"], /physical square[\s\S]{0,100}?QWE \/ ASD \/ RTF/i,
  "INTERFACE states the physical matrix geometry.");
has(docs["INTERFACE.md"], /Toggle Deformation[\s\S]{0,420}?(?:outside|below) the square|(?:outside|below) the square[\s\S]{0,420}?Toggle Deformation/i,
  "INTERFACE places X as an Operators auxiliary action.");
has(docs["INTERFACE.md"], /At most one Group[\s\S]{0,180}?(?:none|no\s+Group)/i,
  "INTERFACE states zero-or-one drawn Group.");
has(docs["INTERFACE.md"], /actual surviving Group|real (?:destination|heir)|destination Group/i,
  "INTERFACE reports the real Group deletion destination.");

has(docs["DEVELOPMENT.md"], /npm ci[\s\S]*?complete release gate[\s\S]*?npm run verify/i,
  "DEVELOPMENT gives locked setup and the complete release gate.");
has(docs["DEVELOPMENT.md"], /npm run check[^\n]*(?:not complete|necessary but not complete)/i,
  "DEVELOPMENT explicitly limits the fast gate.");
for (const heading of [
  /### Matrix and Tag/,
  /### Effective projection and deformation bypass/,
  /### Playback and ordinary-player integrity/,
  /### Source and Guide integrity/,
  /### Groups, modifiers, Nudge, and Step reversal/,
  /### Field/,
  /### Documentation and gauges/
]) has(docs["VALIDATION.md"], heading, `VALIDATION includes ${heading}.`);
has(docs["VALIDATION.md"], /npm ci[\s\S]*?npm run verify/,
  "VALIDATION starts from the reproducible complete release gate.");
for (const journey of ["ordinary player", "operator comprehension", "retain and compose", "deformation comparison", "Field", "source and recovery integrity"]) {
  has(docs["VALIDATION.md"], new RegExp(`### Journey [A-F] — ${escapeRegExp(journey)}`, "i"),
    `VALIDATION retains manual journey ${journey}.`);
}

// Retired language is a build failure because it advertises a parallel law.
// Technical helpers such as normalizeGuide remain valid; only product operation
// grammar is excluded here.
const retiredLanguage = [
  [/\bShift\s*\+\s*P\b|\bShift\+P\b|<kbd>\s*P\s*<\/kbd>|`P`\s+(?:Tag|Pin|save|retain)/i,
    "P/Shift+P is advertised as a product binding."],
  [/\b(?:Shift|Alt)\s*\+\s*X\b|\b(?:Shift|Alt)\+X\b/i,
    "A retired X modifier is advertised."],
  [/^#{1,6}\s+Normalize\b|\bNormalize\s+(?:button|control|operator|action|operation)\b|\bX\s+normalizes?\b/im,
    "Normalize remains a product-facing operation."],
  [/\bWorking Section\b/i, "Pre-retention UI still says Working Section."],
  [/\bRelease\s*[\/-]\s*Deform\s*[\/-]\s*Focus\b|\bRelease, Deform, and Focus\b/i,
    "The obsolete bottom-row trichotomy remains."],
  [/\bexactly one (?:visible|drawn|on[- ]Timeline) Group\b/i,
    "A canonical document forbids the valid no-Group-drawn state."],
  [/\bDeform\b/i, "Deform remains named as a current operator."],
  [/\bShift\+X\b|\bAlt\+X\b/i, "An obsolete Weight chord remains."],
  [/Timeline (?:header )?(?:Normalize|normalization) (?:button|control|action)/i,
    "A Timeline Normalize control remains documented."]
];
for (const [pattern, message] of retiredLanguage) lacks(canonicalText, pattern, message);
lacks(productText, /\bWorking Section\b|toggleNormalize\b|state\.normalize\b|timeline-normalize|#retain\s*\{\s*grid-area:\s*deform/i,
  "Product source contains no retired Normalize/Working Section/matrix seam.");
lacks(html, /<kbd>\s*P\s*<\/kbd>|Shift\s*\+\s*P|Shift\s*\+\s*X|Alt\s*\+\s*X|>\s*Normalize\s*</i,
  "Visible controls advertise no retired binding or Normalize label.");

// Keyboard ownership is a question about the keystroke, not about the tag. The
// tag test made a checkbox swallow every operator and let a selector keep them
// for as long as it held focus, so working in a side panel disarmed the map.
// EPSILON is the semantic tolerance between two Addresses, so only source-time
// quantities may be measured against it. A Timeline length compared to it
// silently acquires a Weight threshold: under compression a real movement is a
// short Timeline distance, and every Nudge inside a compressed Section was
// refused at ρ > EPSILON / reach.
lacks(session, /timelineDistance\([^)]*\)\s*<=?\s*EPSILON/,
  "No Timeline length is measured against the Address tolerance.");
lacks(view, /timelineDistance\([^)]*\)\s*<=?\s*EPSILON/,
  "and the presentation layer does not confuse the two spaces either.");
// Which segment a coordinate lies in has an exact answer. Widening a segment by
// the Address tolerance swallowed segments shorter than it and, in Timeline
// space, was not a source quantity at all -- so the forward map and its inverse
// chose different segments and x(s) stopped being invertible.
lacks(projection, /segment\.(?:end|timelineEnd)\s*\+\s*EPSILON/,
  "Segment lookup is exact in both spaces, so the projection stays invertible.");

has(app, /function ownsKeyboard\(element\)/,
  "Keyboard ownership is asked as one question in one place.");
check(count(app, /const editing = ownsKeyboard\(activeElement\)/) === 2,
  "Both keyboard paths ask it: neither decides from the focused element's tag.");

for (const [name, text] of Object.entries(docs)) {
  for (const line of text.split("\n")) {
    if (!line.includes("npm run check")) continue;
    check(
      !/(?:required|complete|release)\s+(?:automated\s+)?(?:gate|proof)/i.test(line)
        || /not complete|alone does not|necessary but not complete/i.test(line),
      `${name} must not present npm run check as complete release proof.`
    );
  }
}

// Visual and CSS debris checks belong in the repository audit because empty or
// dead rules are not runtime behavior and should be deleted, not tested around.
lacks(styles, /@media[^\{]*\{\s*\}/, "No empty media query remains.");
lacks(styles, /\.timeline-normalize\b|grid-area:\s*deform\b|\.deform-action\b/,
  "No dead Normalize/Deform control CSS remains.");
has(styles, /\.timeline-pin\.retained-selected::before\s*\{[^}]*outline:/,
  "Acquired Pin identity uses its own outline channel.");
has(styles, /\.timeline-pin\.section-endpoint-pin\.extent-selected::before\s*\{[^}]*box-shadow:/,
  "Working-Interval endpoint relation remains visible beside acquisition.");
has(styles, /\.timeline-pin\.snap-target\.snap-armed::before\s*\{[^}]*outline:/,
  "Transient armed snap state has a separate outline/glow channel.");

// One colour, one meaning. A Section's colour is its identity and nothing else;
// deformation is drawn in the deformation colours. Two Sections may never look
// alike, which a fixed palette of six could not promise — it repeated on the
// seventh, and a repeat reads as a relationship.
has(view, /function sectionColor\(sectionId\)/,
  "A Section is coloured by its own identity.");
// The angle only spreads when walked over a sequence. Applied to a hash it is
// just an arbitrary hue, and arbitrary hues clump.
has(view, /GOLDEN_ANGLE_DEGREES\s*=\s*137\.5[\s\S]*index \* GOLDEN_ANGLE_DEGREES\) % 360/,
  "Hues are walked by the golden angle over the Guide's order, so no two Sections collide.");
lacks(view, /charCodeAt/,
  "and no colour is drawn from a hash, which would clump however it is mixed.");
check(count(view, /const WEIGHT_COLORS = \{/) === 1,
  "Exactly one deformation colour table exists.");
has(view, /rgba\(WEIGHT_COLORS\.compressed[\s\S]*rgba\(WEIGHT_COLORS\.expanded/,
  "and the atmosphere is built from it.");
lacks(styles, /\.section-item\.(?:compressed|expanded)\s*\{[^}]*--section-color/,
  "Deformation tints never borrow the Section's identity colour.");
has(styles, /\.timeline-key\.key-sections i \{[^}]*linear-gradient\([\s\S]*hsl\(/,
  "The Section key samples the hue sequence rather than naming one Section's colour.");

if (failures.length) {
  console.error(`Project audit failed (${failures.length}):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Project audit passed: lockfile and npm-ci CI, package/spec authority, exact suite map, final operator and projection language, playback/source/Guide laws, Field defaults, and canonical documents form one release contract."
  );
}
