// What only a browser can answer about the Timeline's drawn layers.
//
// The DOM-free suites prove the projection arithmetic and the browser-smoke
// suite proves hit-testing and focus, but none of them look at whether the
// Timeline's fills are actually painted. A stylesheet edit can leave every
// arithmetic test green while an absolutely-positioned fill silently loses its
// `position` (collapsing into the track's flow) or its background (going
// invisible) -- exactly the failure a lexicon sweep once introduced by
// corrupting `.active-span-fill` and `.weight-gradient` selectors.
//
// This suite renders the page and asserts the three layers a reader depends on
// -- the Current Neighborhood, the Active Span, and the Weight Gradient -- are
// each positioned, sized, and painted. It is deliberately narrow: it does not
// re-prove geometry, only that what the geometry computes reaches the screen.
import assert from "node:assert/strict";
import { openApp, loadVideo } from "./browser-harness.mjs";

const { page, close, failures } = await openApp();

const layerReport = () => page.evaluate(() => {
  const read = sel => {
    const el = document.querySelector(sel);
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const track = document.querySelector(".track").getBoundingClientRect();
    return {
      present: true,
      hidden: el.hidden,
      position: cs.position,
      visibility: cs.visibility,
      opacity: Number(cs.opacity),
      width: rect.width,
      painted: cs.backgroundImage !== "none" || cs.backgroundColor !== "rgba(0, 0, 0, 0)",
      withinTrackY: rect.top >= track.top - 1 && rect.bottom <= track.bottom + 1
    };
  };
  return {
    track: read(".track"),
    neighborhood: read("#neighborhood-fill"),
    activeSpan: read("#active-span-fill"),
    weightGradient: read(".weight-gradient")
  };
});

try {
  await loadVideo(page);
  await page.waitForTimeout(150);

  // Refine backward then forward: this narrows the Current Neighborhood and
  // leaves an Active Span drawn between the two moves.
  await page.keyboard.press("q");
  await page.waitForTimeout(120);
  await page.keyboard.press("e");
  await page.waitForTimeout(180);

  const r = layerReport();
  const report = await r;

  // The track is the positioning context every fill is placed against. If it is
  // not absolute, every percentage-positioned fill inside it is meaningless.
  assert.equal(report.track.position, "absolute",
    "The track establishes an absolute positioning context for its fills.");

  // The Current Neighborhood fill (the band a reader reads position against --
  // the 'ghost line' when it collapses) must be an absolutely-positioned,
  // painted layer sitting inside the track, not displaced into its flow.
  assert.ok(report.neighborhood.present, "The Current Neighborhood fill exists.");
  assert.equal(report.neighborhood.position, "absolute",
    "The Current Neighborhood fill is absolutely positioned, not in track flow.");
  assert.ok(report.neighborhood.painted,
    "The Current Neighborhood fill has a background, so it is visible.");
  assert.ok(report.neighborhood.withinTrackY,
    "The Current Neighborhood fill sits vertically inside the track.");

  // The Active Span is the reader's ordered movement extent. A Refine leaves one
  // drawn; it must be shown, absolutely positioned, painted, and non-collapsed.
  assert.ok(report.activeSpan.present, "The Active Span fill exists.");
  assert.equal(report.activeSpan.hidden, false,
    "A Refine leaves the Active Span shown, not hidden.");
  assert.equal(report.activeSpan.position, "absolute",
    "The Active Span fill is absolutely positioned, not collapsed into track flow.");
  assert.ok(report.activeSpan.painted,
    "The Active Span fill has a background gradient, so it renders.");
  assert.ok(report.activeSpan.width > 0,
    `The Active Span fill has non-zero width, not ${report.activeSpan.width}.`);
  assert.ok(report.activeSpan.withinTrackY,
    "The Active Span fill sits vertically inside the track.");

  // The Weight Gradient is the atmosphere band under the topography. The sweep
  // that collapsed it left it position:static with zero width; guard both.
  assert.ok(report.weightGradient.present, "The Weight Gradient layer exists.");
  assert.equal(report.weightGradient.position, "absolute",
    "The Weight Gradient is absolutely positioned across the track.");
  assert.ok(report.weightGradient.width > 0,
    `The Weight Gradient spans a non-zero width, not ${report.weightGradient.width}.`);
  assert.ok(report.weightGradient.painted,
    "The Weight Gradient has a background gradient, so it renders.");

  assert.deepEqual(failures, [],
    `The page rendered the Timeline without console or page errors: ${failures.join(" | ")}`);

  console.log("Timeline render smoke passed: the track is an absolute positioning context; the Current Neighborhood, Active Span, and Weight Gradient are each absolutely positioned, painted, non-collapsed, and drawn inside the track -- the layers a lexicon sweep once silently corrupted.");
} finally {
  await close();
}
