// Browser-only proof for Ripple's distinct visual channels. The DOM-free route
// suite owns acquisition and semantics; this suite owns painted geometry,
// responsive containment, and the rendered separation from Current.
import assert from "node:assert/strict";
import {
  openApp,
  loadVideo,
  boxOf,
  mediaClockTo
} from "./browser-harness.mjs";

const { page, close, failures } = await openApp();

const report = () => page.evaluate(() => {
  const timeline = document.getElementById("timeline").getBoundingClientRect();
  const current = document.getElementById("current-marker");
  const address = document.getElementById("ripple-address-marker");
  const context = document.getElementById("ripple-context-window-fill");
  const cursor = document.getElementById("cursor-marker");
  const activeSpan = document.getElementById("active-span-fill");
  const weightGradient = document.querySelector(".weight-gradient");
  const prospects = [...document.querySelectorAll("[data-traversal-prospect]")];
  const geometry = element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      hidden: element.hidden,
      left: element.style.left,
      width: rect.width,
      height: rect.height,
      position: style.position,
      painted: style.backgroundImage !== "none"
        || style.backgroundColor !== "rgba(0, 0, 0, 0)"
        || style.borderLeftWidth !== "0px",
      insideTimeline: rect.left >= timeline.left - 2
        && rect.right <= timeline.right + 2
        && rect.top >= timeline.top - 1
        && rect.bottom <= timeline.bottom + 1
    };
  };
  return {
    currentLeft: current.style.left,
    acceptedCurrent: current.dataset.acceptedAddress,
    cursor: geometry(cursor),
    activeSpan: geometry(activeSpan),
    weightGradient: geometry(weightGradient),
    address: {
      ...geometry(address),
      label: address.getAttribute("aria-label")
    },
    context: geometry(context),
    prospects: prospects.map(element => ({
      ...geometry(element),
      kind: element.dataset.kind,
      address: Number(element.dataset.address),
      label: element.getAttribute("aria-label")
    }))
  };
});

try {
  await loadVideo(page);
  await page.keyboard.press("e");
  await page.waitForTimeout(140);
  await page.keyboard.press("Shift+t");
  await page.waitForTimeout(180);
  const weighting = page.locator("[data-section-weighting]").first();
  await weighting.selectOption("2");
  await page.waitForTimeout(180);

  // A retained-object Shift-click belongs to that object, never bare Timeline
  // Ripple acquisition.
  const retainedPin = page.locator(".timeline-pin").first();
  await page.keyboard.down("Shift");
  await retainedPin.click();
  await page.keyboard.up("Shift");
  await page.waitForTimeout(120);
  assert.equal(await page.$eval("#ripple-address-marker", element => element.hidden), true);
  assert.equal(await page.locator("[data-traversal-prospect]").count(), 0);
  await page.keyboard.press("f");
  await page.waitForTimeout(160);
  const focusedRangeEnd = Number(
    await page.getAttribute("#range-end-handle", "aria-valuenow")
  );
  assert.ok(focusedRangeEnd < 100,
    "The browser proof acquires Ripple inside a focused Range.");

  await page.evaluate(() => {
    const field = document.getElementById("context-duration");
    field.value = "5";
    field.dispatchEvent(new Event("change", { bubbles: true }));
    document.activeElement?.blur();
  });

  const beforeRipple = await report();
  assert.equal(beforeRipple.activeSpan.hidden, false,
    "The retained weighted setup has an existing Active Span.");
  assert.ok(beforeRipple.activeSpan.width > 0 && beforeRipple.activeSpan.painted);
  assert.ok(beforeRipple.weightGradient.width > 0 && beforeRipple.weightGradient.painted);

  const track = await boxOf(page, ".track");
  const rippleFraction = 0.98;
  await page.keyboard.down("Shift");
  await page.mouse.click(
    track.x + track.width * rippleFraction,
    track.y + track.height / 2
  );
  await page.keyboard.up("Shift");
  await page.waitForTimeout(160);

  let drawn = await report();
  assert.equal(drawn.currentLeft, beforeRipple.currentLeft,
    "Ripple observation does not move the rendered Current.");
  assert.equal(drawn.address.hidden, false);
  assert.ok(Math.abs(Number.parseFloat(drawn.address.left) - rippleFraction * 100) < 0.2,
    `The Observation Address is drawn under the Shift-click (${drawn.address.left}).`);
  assert.equal(drawn.address.position, "absolute");
  assert.ok(drawn.address.width > 0 && drawn.address.height > 0);
  assert.ok(drawn.address.painted);
  assert.ok(drawn.address.insideTimeline);
  assert.match(drawn.address.label, /Current did not move and remains/);

  assert.equal(drawn.context.hidden, false);
  assert.equal(drawn.context.position, "absolute");
  assert.ok(drawn.context.width > 0 && drawn.context.height > 0);
  assert.ok(drawn.context.painted);
  assert.ok(drawn.context.insideTimeline);
  assert.equal(drawn.cursor.hidden, false,
    "Cursor shows the moving observation independently of Current.");
  assert.ok(drawn.cursor.insideTimeline);
  assert.deepEqual(
    {
      hidden: drawn.activeSpan.hidden,
      left: drawn.activeSpan.left,
      width: drawn.activeSpan.width,
      painted: drawn.activeSpan.painted
    },
    {
      hidden: beforeRipple.activeSpan.hidden,
      left: beforeRipple.activeSpan.left,
      width: beforeRipple.activeSpan.width,
      painted: beforeRipple.activeSpan.painted
    },
    "Ripple visuals do not collapse or displace the existing Active Span."
  );
  assert.equal(drawn.weightGradient.width, beforeRipple.weightGradient.width);
  assert.equal(drawn.weightGradient.painted, true,
    "Ripple leaves the weighted Timeline atmosphere painted.");

  assert.deepEqual(
    drawn.prospects.map(marker => marker.kind),
    ["ripple-end", "ripple-start"],
    "End and Start prospects retain their distinct newest-first channels."
  );
  assert.ok(drawn.prospects.every(marker =>
    marker.position === "absolute"
    && marker.width > 0
    && marker.height > 0
    && marker.painted
    && marker.insideTimeline
    && /Current did not move/.test(marker.label)
  ), `Every prospect is painted, non-collapsed, contained, and accessibly distinct from Current: ${JSON.stringify(drawn.prospects)}`);
  const completedEndAddress = drawn.prospects
    .find(marker => marker.kind === "ripple-end").address;
  assert.ok(Math.abs(completedEndAddress - focusedRangeEnd) < 0.05,
    "Ripple independently clips its Context End to the focused Range.");

  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.waitForTimeout(80);
  const accessibleModes = await report();
  assert.ok(
    accessibleModes.address.painted
    && accessibleModes.context.painted
    && accessibleModes.prospects.every(marker => marker.painted),
    "Ripple channels remain visible under reduced motion and forced high contrast."
  );
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });

  await page.setViewportSize({ width: 680, height: 900 });
  await page.waitForTimeout(180);
  drawn = await report();
  assert.ok(drawn.address.insideTimeline
    && drawn.context.insideTimeline
    && drawn.prospects.every(marker => marker.insideTimeline),
  "Ripple channels remain inside the Timeline at the narrow responsive layout.");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(180);
  await mediaClockTo(page, completedEndAddress + 0.5);
  await page.waitForTimeout(180);
  drawn = await report();
  assert.equal(drawn.address.hidden, true,
    "The live Observation Address leaves presentation on completion.");
  assert.equal(drawn.context.hidden, true,
    "The live Context Window leaves presentation on completion.");
  assert.equal(drawn.prospects.length, 2,
    "Completed prospects stay painted for forward Ghost reading.");
  assert.equal(drawn.currentLeft, beforeRipple.currentLeft);

  await page.evaluate(() => {
    const toggle = document.getElementById("guide-toggle");
    if (toggle.getAttribute("aria-expanded") === "true") toggle.click();
    document.activeElement?.blur();
  });
  const compactTimeline = await boxOf(page, "#timeline");
  await page.mouse.move(
    compactTimeline.x + compactTimeline.width / 2,
    compactTimeline.y + compactTimeline.height / 2
  );
  const historyBeforeProspect = await page.textContent("#return-meta");
  await page.keyboard.down("g");
  await page.mouse.wheel(0, -30);
  await page.waitForTimeout(160);
  const prospective = await page.evaluate(() => ({
    accepted: document.getElementById("current-marker").dataset.acceptedAddress,
    candidate: document.getElementById("current-marker").dataset.ghostCandidate,
    status: document.getElementById("status").textContent,
    history: document.getElementById("return-meta").textContent,
    prospectCount: document.querySelectorAll("[data-traversal-prospect]").length,
    playing: Object.values(window.__players)[0].state === 1
  }));
  assert.equal(prospective.accepted, beforeRipple.acceptedCurrent);
  assert.ok(
    Math.abs(Number(prospective.candidate) - completedEndAddress) < 0.05,
    `Forward Ghost exposes the End Prospect as Candidate: ${JSON.stringify(prospective)}`
  );
  assert.match(prospective.status, /Ghost future.*Ripple End Prospect.*Current remains/);
  assert.equal(prospective.history, historyBeforeProspect);
  assert.equal(prospective.prospectCount, 2);
  assert.equal(prospective.playing, true,
    "Prospect recognition reuses automatic Context while Current stays accepted.");

  await page.keyboard.up("g");
  await page.waitForTimeout(160);
  const settled = await page.evaluate(() => ({
    accepted: Number(document.getElementById("current-marker").dataset.acceptedAddress),
    history: document.getElementById("return-meta").textContent,
    prospectKinds: [...document.querySelectorAll("[data-traversal-prospect]")]
      .map(element => element.dataset.kind)
  }));
  assert.ok(Math.abs(settled.accepted - completedEndAddress) < 0.05);
  assert.equal(settled.history, "Go to Traversal Prospect");
  assert.deepEqual(settled.prospectKinds, ["ripple-start"],
    "Release consumes exactly the rendered End Prospect.");

  const acceptedAfterGo = settled.accepted;
  const trackAfterSettlement = await boxOf(page, ".track");
  await page.keyboard.down("Shift");
  await page.mouse.click(
    trackAfterSettlement.x + trackAfterSettlement.width * 0.35,
    trackAfterSettlement.y + trackAfterSettlement.height / 2
  );
  await page.keyboard.up("Shift");
  await page.waitForTimeout(120);
  assert.equal(await page.$eval("#ripple-address-marker", element => element.hidden), false);
  assert.equal(await page.locator("[data-traversal-prospect]").count(), 3);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(140);
  assert.equal(
    Number(await page.getAttribute("#current-marker", "data-accepted-address")),
    acceptedAfterGo,
    "Escape restores the accepted Current after a rendered Ripple."
  );
  assert.equal(await page.locator("[data-traversal-prospect]").count(), 1,
    "Escape removes only the uncompleted batch.");

  await page.keyboard.down("Shift");
  await page.mouse.click(
    trackAfterSettlement.x + trackAfterSettlement.width * 0.4,
    trackAfterSettlement.y + trackAfterSettlement.height / 2
  );
  await page.keyboard.up("Shift");
  await page.waitForTimeout(100);
  await loadVideo(page, "https://youtu.be/AAAAAAAAAAA?t=10");
  await page.waitForTimeout(120);
  assert.equal(await page.locator("[data-traversal-prospect]").count(), 0,
    "Source replacement clears completed and uncompleted prospects.");
  assert.equal(await page.$eval("#ripple-address-marker", element => element.hidden), true);

  assert.deepEqual(failures, [],
    `Ripple rendered without console or page errors: ${failures.join(" | ")}`);

  console.log("Ripple render smoke passed: bare and retained-object Shift ownership, weighted inversion, Cursor/Current separation, Observation Address, Context Window and endpoint projection, existing-layer non-collapse, responsive/reduced-motion/high-contrast accessibility, forward Ghost recognition and canonical settlement, Escape restoration, and source replacement.");
} finally {
  await close();
}
