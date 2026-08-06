// Browser proof for the Panorama states whose semantics and coupled selectors
// are intentionally renamed in 9.1. Arithmetic suites protect the state
// machine; this suite protects the final visual correspondence.
import assert from "node:assert/strict";
import { openApp, loadVideo } from "./browser-harness.mjs";

const { page, close, failures } = await openApp();

const phaseReport = async phase => {
  await page.$eval("#panorama", (source, value) => {
    if (!window.__panoramaPhaseProbe) {
      const root = source.cloneNode(true);
      root.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
      root.removeAttribute("id");
      root.style.position = "fixed";
      root.style.left = "-200vw";
      root.style.width = `${source.getBoundingClientRect().width}px`;
      document.body.appendChild(root);
      window.__panoramaPhaseProbe = root;
    }
    window.__panoramaPhaseProbe.dataset.phase = value;
  }, phase);
  await page.waitForTimeout(600);
  return page.evaluate(() => {
  const root = window.__panoramaPhaseProbe;
  const aura = getComputedStyle(root, "::before");
  const sides = [...root.querySelectorAll(".step-pane-side")].map(element => {
    const style = getComputedStyle(element);
    return {
      opacity: Number(style.opacity),
      transform: style.transform,
      visible: style.display !== "none" && style.visibility !== "hidden"
    };
  });
  return {
    phase: root.dataset.phase,
    auraOpacity: Number(aura.opacity),
    sides
  };
  });
};

try {
  await loadVideo(page);
  await page.waitForTimeout(180);

  const initial = await page.evaluate(() => {
    const root = document.getElementById("panorama");
    const fill = document.querySelector(".panorama-window-fill");
    const fillStyle = getComputedStyle(fill);
    const fillRect = fill.getBoundingClientRect();
    return {
      phase: root.dataset.phase,
      windowPresent: Boolean(fill),
      windowPosition: fillStyle.position,
      windowPainted: fillStyle.backgroundImage !== "none"
        || fillStyle.backgroundColor !== "rgba(0, 0, 0, 0)",
      windowWidth: fillRect.width
    };
  });

  assert.equal(initial.windowPresent, true, "The Panorama Window layer exists.");
  assert.equal(initial.windowPosition, "absolute",
    "The Panorama Window is projected as an absolute Timeline layer.");
  assert.equal(initial.windowPainted, true,
    "The Panorama Window has a visible paint channel.");
  const unfolding = await phaseReport("unfolding");
  const partial = await phaseReport("partially-frozen");
  const frozen = await phaseReport("frozen");
  assert.ok(unfolding.auraOpacity > frozen.auraOpacity,
    "Stretching has a stronger visual aura than the stable Panorama.");
  assert.ok(partial.auraOpacity > frozen.auraOpacity,
    "A partially frozen Panorama remains visibly in transition.");
  assert.ok(frozen.sides.every(side => side.visible && side.opacity > 0),
    "Both stable side panes remain visible.");

  await page.click("#center-transport-surface");
  await page.waitForTimeout(80);
  assert.equal(
    await page.$eval("#panorama", element => element.classList.contains("is-cycling")),
    true,
    "Panorama playback stretches the Cycle without replacing the Panorama."
  );
  await page.click("#panorama-both-toggle");
  await page.waitForTimeout(80);
  assert.equal(
    await page.$eval("#panorama", element => element.classList.contains("is-cycling")),
    false,
    "Freeze removes cycling while preserving the projected Panorama."
  );
  assert.ok(
    await page.$eval(".panorama-window-fill", element => element.getBoundingClientRect().width) > 0,
    "A frozen two-sided Panorama projects a positive Window."
  );

  assert.deepEqual(failures, [],
    `The Panorama rendered without console or page errors: ${failures.join(" | ")}`);

  console.log("Panorama render smoke passed: stable, partial, and stretching phases remain visually distinct; Freeze/Stretch toggles cycling; and the frozen Panorama Window remains positioned and painted.");
} finally {
  await close();
}
