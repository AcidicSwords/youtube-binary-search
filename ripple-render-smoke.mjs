// Browser proof for Ripple's deliberately invisible Timeline behavior, the
// single Ghost presentation, and stable Panorama/Timeline layout.
import assert from "node:assert/strict";
import {
  openApp,
  loadVideo,
  boxOf,
  mediaClockTo
} from "./browser-harness.mjs";

const { page, close, failures } = await openApp();
const settle = milliseconds => page.waitForTimeout(milliseconds);

const timelineReport = () => page.evaluate(() => {
  const timeline = document.getElementById("timeline");
  const panel = document.getElementById("timeline-panel").getBoundingClientRect();
  const controls = document.querySelector(".center-panorama-controls").getBoundingClientRect();
  const button = document.getElementById("panorama-both-toggle").getBoundingClientRect();
  return {
    panel: { top: panel.top, height: panel.height },
    controls: { top: controls.top, height: controls.height },
    button: { top: button.top, height: button.height },
    childCount: timeline.children.length,
    childIdentity: [...timeline.children].map(element =>
      `${element.id || ""}:${element.className || ""}`
    ),
    forbiddenCount: document.querySelectorAll(
      "#ripple-address-marker, #ripple-context-window-fill, "
      + "#traversal-prospect-layer, [data-ripple-address], [data-traversal-prospect]"
    ).length,
    cursorHidden: document.getElementById("cursor-marker").hidden,
    cursorText: document.getElementById("cursor-time").textContent,
    currentText: document.getElementById("pin-current-position").textContent
  };
});

try {
  await loadVideo(page);
  await settle(180);

  await page.evaluate(() => {
    const field = document.getElementById("context-duration");
    field.value = "5";
    field.dispatchEvent(new Event("change", { bubbles: true }));
    document.activeElement?.blur();
  });
  await settle(120);

  const timeline = await boxOf(page, "#timeline");
  const beforeRipple = await timelineReport();
  await page.keyboard.down("Shift");
  await page.mouse.click(
    timeline.x + timeline.width * 0.75,
    timeline.y + timeline.height * 0.55
  );
  await page.keyboard.up("Shift");
  await settle(180);

  const duringRipple = await timelineReport();
  assert.equal(duringRipple.currentText, beforeRipple.currentText,
    "Ripple observation leaves accepted Current unchanged.");
  assert.equal(duringRipple.forbiddenCount, 0,
    "Ripple has no dedicated Timeline layer, marker, or prospect nodes.");
  assert.equal(duringRipple.childCount, beforeRipple.childCount,
    "Ripple creates no Timeline children.");
  assert.deepEqual(duringRipple.childIdentity, beforeRipple.childIdentity,
    "Ripple leaves the Timeline's rendered layer set untouched.");
  assert.equal(duringRipple.cursorHidden, true,
    "Ripple does not borrow the generic Cursor marker.");
  assert.match(duringRipple.cursorText.trim(), /—|â€”/,
    "Ripple does not write an Address into the Timeline Cursor readout.");
  assert.ok(Math.abs(duringRipple.panel.top - beforeRipple.panel.top) < 0.5,
    "Starting Ripple does not move the Timeline.");

  // Complete the shared Context window so its Start and End Addresses become
  // future entries in the same stream Ghost already reads.
  await mediaClockTo(page, 81);
  await settle(360);
  assert.match(await page.textContent("#status"), /Ripple added futures/);

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, -120);
  await settle(220);
  const ghostFuture = await page.evaluate(() => ({
    medium: document.getElementById("active-span-fill").dataset.medium,
    current: document.getElementById("pin-current-position").textContent,
    forbiddenCount: document.querySelectorAll(
      "[data-traversal-prospect], #traversal-prospect-layer"
    ).length,
    childCount: document.getElementById("timeline").children.length
  }));
  assert.equal(ghostFuture.medium, "ghost",
    "A future endpoint uses the same Ghost presentation as historical traversal.");
  assert.match(ghostFuture.current, /Ghost Candidate/);
  assert.equal(ghostFuture.forbiddenCount, 0,
    "Ghost does not reveal a second forward/prospect presentation.");
  assert.equal(ghostFuture.childCount, beforeRipple.childCount,
    "Ghosting through a Ripple future adds no Timeline layer.");

  await page.mouse.wheel(0, 120);
  await settle(160);
  await page.mouse.wheel(0, -120);
  await settle(160);
  assert.equal(
    await page.$eval("#active-span-fill", element => element.dataset.medium),
    "ghost",
    "Reversing across the history/future boundary stays one Ghost action."
  );
  await page.keyboard.up("g");
  await settle(260);

  // Freeze/Stretch changes wording and state, but its reserved control geometry
  // must keep the Timeline vertically stationary.
  await page.evaluate(() => {
    const field = document.getElementById("context-duration");
    field.value = "0";
    field.dispatchEvent(new Event("change", { bubbles: true }));
    document.activeElement?.blur();
  });
  await page.keyboard.press("Escape");
  await settle(180);
  await page.click("#center-transport-surface");
  await settle(180);
  const layoutSamples = [];
  const labels = new Set();
  for (let index = 0; index < 10; index += 1) {
    assert.equal(await page.isDisabled("#panorama-both-toggle"), false,
      "The combined Panorama control is available for the layout stress test.");
    await page.click("#panorama-both-toggle");
    await settle(90);
    labels.add((await page.textContent("#panorama-both-toggle-label")).trim());
    layoutSamples.push(await timelineReport());
  }
  const spread = values => Math.max(...values) - Math.min(...values);
  assert.ok(spread(layoutSamples.map(sample => sample.panel.top)) < 0.5,
    "The Timeline does not jump vertically while Freeze and Stretch alternate.");
  assert.ok(spread(layoutSamples.map(sample => sample.controls.height)) < 0.5,
    "The Panorama control row reserves one stable height.");
  assert.ok(spread(layoutSamples.map(sample => sample.button.height)) < 0.5,
    "The changing Freeze/Stretch button label cannot resize its row.");
  assert.deepEqual([...labels].sort(), ["Freeze Panorama", "Stretch Panorama"],
    "The geometry proof exercised both button states.");

  assert.deepEqual(failures, [],
    `Ripple and Panorama rendered without console or page errors: ${failures.join(" | ")}`);
  console.log("Ripple render smoke passed: Ripple leaves the Timeline unpainted, future and historical positions share one Ghost presentation, reversal is fluid, and Freeze/Stretch cannot move the Timeline.");
} finally {
  await close();
}
