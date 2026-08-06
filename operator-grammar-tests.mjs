import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPERATOR_MATRIX, operatorCells } from "./operator-grammar.js";

const source = file => readFileSync(new URL(file, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const html = source("./index.html");
const css = source("./styles.css");
const app = source("./app.js");
const view = source("./view.js");
const cells = operatorCells();
const ids = new Set(cells.map(cell => cell.id));

assert.deepEqual(
  OPERATOR_MATRIX.map(row => row.map(cell => cell.id)),
  [
    ["refine-backward", "reopen", "refine-forward"],
    ["step-backward", "switch-end", "step-forward"],
    ["release", "retain", "focus-toggle"]
  ]
);

const deck = html.match(/<div class="navigation-deck">([\s\S]*?)<\/div>\s*<div class="operator-auxiliary-actions">/)?.[1];
assert.ok(deck, "The nine operators must have one physical deck.");
const domOrder = [...deck.matchAll(/<button id="([^"]+)"/g)]
  .map(match => match[1])
  .filter(id => ids.has(id));
assert.deepEqual(domOrder, cells.map(cell => cell.id), "DOM order must be QWE / ASD / RTF.");
assert.equal(domOrder.length, 9, "The square contains exactly nine cells.");

for (const cell of cells) {
  const button = deck.match(new RegExp(
    '<button id="' + cell.id + '"[^>]*aria-keyshortcuts="([^"]+)"[^>]*>([\\s\\S]*?)<\\/button>'
  ));
  assert.ok(button, "Missing operator button " + cell.id + ".");
  assert.ok(
    button[1].split(/\s+/).some(token => token === cell.key),
    cell.id + " must advertise " + cell.key + "."
  );
  assert.match(button[2], new RegExp("<kbd>" + cell.key + "<\\/kbd>"));
  assert.match(css, new RegExp("#" + cell.id + " \\{ grid-area: " + cell.area + "; \\}"));
  if (cell.shifted) {
    assert.ok(
      view.includes(`? "${cell.shifted}"`),
      `${cell.id} must render its canonical shifted label ${cell.shifted}.`
    );
  }
}

const areaBlock = css.match(/\.navigation-deck \{[\s\S]*?grid-template-areas:\s*([\s\S]*?);/)?.[1];
assert.ok(areaBlock);
assert.deepEqual(
  [...areaBlock.matchAll(/"([^"]+)"/g)].map(match => match[1].trim().split(/\s+/)),
  OPERATOR_MATRIX.map(row => row.map(cell => cell.area))
);

for (const key of ["w", "q", "s", "e"]) {
  assert.match(
    app,
    new RegExp('spatialKey\\("' + key + '"\\)'),
    "Runtime is missing " + key.toUpperCase() + "."
  );
}
assert.match(app, /key === "r"[\s\S]*releaseActiveSpan\(\)/);
assert.match(app, /key === "t"[\s\S]*retainCurrentAsPin\(/);
assert.match(app, /key === "f"[\s\S]*focusOrUnfocus\(\)/);
assert.match(app, /shiftedSpatialKey\("a"\)[\s\S]*traverseToAdjacentPin\("backward"/);
assert.match(app, /shiftedSpatialKey\("d"\)[\s\S]*traverseToAdjacentPin\("forward"/);
assert.match(app, /event\.shiftKey[\s\S]*key === "t"[\s\S]*retainActiveSpanAsSection\(/);

const canonicalDocs = [
  source("./README.md"),
  source("./PROJECT.md"),
  source("./GLOSSARY.md"),
  source("./SPEC.md"),
  source("./INTERFACE.md")
].join("\n");
for (const cell of cells) {
  assert.ok(
    canonicalDocs.includes(cell.label) || (
      cell.id === "focus-toggle"
      && canonicalDocs.includes("Focus")
      && canonicalDocs.includes("Unfocus")
    ),
    "Canonical documents must name " + cell.label + "."
  );
}
assert.match(canonicalDocs, /Retain Pin/);
assert.match(canonicalDocs, /Retain Section/);

console.log("Operator grammar tests passed: QWE / ASD / RTF is identical in the fixture, DOM, keys, runtime branches, CSS areas, and canonical documentation.");
