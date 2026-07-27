from pathlib import Path

ROOT = Path.cwd()


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f"Expected one exact match in {path}, found {text.count(old)}")
    target.write_text(text.replace(old, new, 1))


# Keep each response control on the object it changes.
replace_once(
    "index.html",
    '''                <span id="tail-meta" class="step-pane-meta">—</span>
                <button id="tail-collapse" class="pane-collapse" type="button" aria-label="Hide Tail" title="Hide Tail">×</button>''',
    '''                <span id="tail-meta" class="step-pane-meta">—</span>
                <label class="pane-rate-setting" for="tail-rate-select">
                  <span class="sr-only">Tail playback rate</span>
                  <select id="tail-rate-select" aria-label="Tail playback rate" disabled><option value="0.5">0.5×</option></select>
                </label>
                <button id="tail-collapse" class="pane-collapse" type="button" aria-label="Hide Tail" title="Hide Tail">×</button>'''
)
replace_once(
    "index.html",
    '''                <span id="lead-meta" class="step-pane-meta">—</span>
                <button id="lead-collapse" class="pane-collapse" type="button" aria-label="Hide Lead" title="Hide Lead">×</button>''',
    '''                <span id="lead-meta" class="step-pane-meta">—</span>
                <label class="pane-rate-setting" for="lead-rate-select">
                  <span class="sr-only">Lead playback rate</span>
                  <select id="lead-rate-select" aria-label="Lead playback rate" disabled><option value="2">2×</option></select>
                </label>
                <button id="lead-collapse" class="pane-collapse" type="button" aria-label="Hide Lead" title="Hide Lead">×</button>'''
)
replace_once(
    "index.html",
    '''                  <fieldset>
                    <legend>Response</legend>
                    <label class="rate-setting" for="tail-rate-select">
                      <span>Tail rate</span>
                      <select id="tail-rate-select" disabled><option value="0.5">0.5×</option></select>
                    </label>
                    <div class="fixed-rate"><span>Center rate</span><strong>1×</strong></div>
                    <label class="rate-setting" for="lead-rate-select">
                      <span>Lead rate</span>
                      <select id="lead-rate-select" disabled><option value="2">2×</option></select>
                    </label>
                  </fieldset>
''',
    ""
)

# Compact object-local controls and a valid narrow-screen IFrame viewport.
replace_once(
    "step-field.css",
    '''.step-pane-meta {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #c0cad6;
  font: 600 0.65rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
''',
    '''.step-pane-meta {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #c0cad6;
  font: 600 0.65rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-rate-setting {
  display: inline-flex;
  align-items: center;
  pointer-events: auto;
}

.pane-rate-setting select {
  width: 74px;
  min-width: 74px;
  min-height: 25px;
  height: 25px;
  padding: 0 1.3rem 0 0.42rem;
  border-color: rgba(116, 134, 157, 0.62);
  background: rgba(17, 23, 32, 0.9);
  font-size: 0.65rem;
}
'''
)
replace_once(
    "step-field.css",
    '''  .step-field,
  .step-field.tail-collapsed,
  .step-field.lead-collapsed,
  .step-field.tail-collapsed.lead-collapsed {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px;
    padding: 6px;
  }

  .step-pane-center {
    grid-column: 1 / -1;
    grid-row: 1;
  }

  .tail-pane { grid-column: 1; grid-row: 2; }
  .lead-pane { grid-column: 2; grid-row: 2; }
''',
    '''  .step-field,
  .step-field.tail-collapsed,
  .step-field.lead-collapsed,
  .step-field.tail-collapsed.lead-collapsed {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 6px;
  }

  .step-pane-center {
    grid-column: 1;
    grid-row: 1;
  }

  .tail-pane { grid-column: 1; grid-row: 2; }
  .lead-pane { grid-column: 1; grid-row: 3; }
  .step-pane-side .player-wrap {
    min-height: 200px;
    aspect-ratio: auto;
  }
'''
)
replace_once(
    "step-field.css",
    '''  .step-pane-role { font-size: 0.6rem; }
  .step-pane-meta { font-size: 0.58rem; }
}
''',
    '''  .step-pane-role { font-size: 0.6rem; }
  .step-pane-meta { font-size: 0.58rem; }
}

@media (pointer: coarse) {
  .step-pane-bar { min-height: 52px; }
  .pane-rate-setting select {
    width: 84px;
    min-width: 84px;
    min-height: 44px;
    height: 44px;
    font-size: 16px;
  }
}
'''
)

# Lock the mobile interaction and geometry into the repository gate.
replace_once(
    "field-coherence-tests.mjs",
    '''  const field = readFileSync("step-field.js", "utf8");
  const view = readFileSync("view.js", "utf8");''',
    '''  const field = readFileSync("step-field.js", "utf8");
  const fieldCss = readFileSync("step-field.css", "utf8");
  const view = readFileSync("view.js", "utf8");'''
)
replace_once(
    "field-coherence-tests.mjs",
    '''  assert.doesNotMatch(html, /id=["']continue["'][^>]*sr-only/);
''',
    '''  assert.doesNotMatch(html, /id=["']continue["'][^>]*sr-only/);
  assert.equal((html.match(/id=["']tail-rate-select["']/g) || []).length, 1);
  assert.equal((html.match(/id=["']lead-rate-select["']/g) || []).length, 1);
  assert.match(html, /id=["']tail-pane["'][\s\S]*id=["']tail-rate-select["'][\s\S]*id=["']tail-collapse["']/);
  assert.match(html, /id=["']lead-pane["'][\s\S]*id=["']lead-rate-select["'][\s\S]*id=["']lead-collapse["']/);
  assert.match(fieldCss, /\.pane-rate-setting[\s\S]*pointer-events: auto/);
  assert.match(fieldCss, /@media \(max-width: 680px\)[\s\S]*\.tail-pane \{ grid-column: 1; grid-row: 2; \}[\s\S]*\.lead-pane \{ grid-column: 1; grid-row: 3; \}[\s\S]*\.step-pane-side \.player-wrap \{[\s\S]*min-height: 200px/);
  assert.match(fieldCss, /@media \(pointer: coarse\)[\s\S]*\.pane-rate-setting select[\s\S]*min-height: 44px/);
'''
)
replace_once(
    "field-coherence-tests.mjs",
    'assert.match(implementation, /^# Binary YouTube Reader v5\\.5\\.1/m);',
    'assert.match(implementation, /^# Binary YouTube Reader v5\\.5\\.2/m);'
)
replace_once(
    "field-coherence-tests.mjs",
    'console.log("Field coherence v5.5 tests passed.");',
    'console.log("Field coherence v5.5.2 tests passed.");'
)

# Keep the canonical implementation and package version aligned with the fix.
replace_once(
    "IMPLEMENTATION.md",
    "# Binary YouTube Reader v5.5.1 — Canonical Implementation",
    "# Binary YouTube Reader v5.5.2 — Canonical Implementation"
)
replace_once(
    "IMPLEMENTATION.md",
    "Changing a rate is kinetic: it preserves Field geometry and changes subsequent motion. Visibility and Field-enabled changes are structural and re-establish the projection.",
    "Changing a rate is kinetic: it preserves Field geometry and changes subsequent motion. Visibility and Field-enabled changes are structural and re-establish the projection. Tail and Lead rate controls are object-local in their pane headers. On narrow coarse-pointer layouts, the side panes stack and retain a minimum 200 × 200 IFrame viewport so rate capability remains available to the player API."
)
replace_once(
    "package.json",
    '"version": "5.5.1"',
    '"version": "5.5.2"'
)

# The applicator is not part of the product tree.
for name in [
    ".github/mobile-field-rates-v5.5.2.py",
    ".github/workflows/mobile-field-rates-v5.5.2.yml"
]:
    path = ROOT / name
    if path.exists():
        path.unlink()
