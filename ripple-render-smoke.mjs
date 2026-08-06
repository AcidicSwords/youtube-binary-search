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
      insideTimeline: rect.left >= timeline.left - 1
        && rect.right <= timeline.right + 1
        && rect.top >= timeline.top - 1
        && rect.bottom <= timeline.bottom + 1
    };
  };
  return {
    currentLeft: current.style.left,
    address: {
      ...geometry(address),
      label: address.getAttribute("aria-label")
    },
    context: geometry(context),
    prospects: prospects.map(element => ({
      ...geometry(element),
      kind: element.dataset.kind,
      label: element.getAttribute("aria-label")
    }))
  };
});

try {
  await loadVideo(page);
  await page.evaluate(() => {
    const field = document.getElementById("context-duration");
    field.value = "5";
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const track = await boxOf(page, ".track");
  await page.keyboard.down("Shift");
  await page.mouse.click(
    track.x + track.width * 0.75,
    track.y + track.height / 2
  );
  await page.keyboard.up("Shift");
  await page.waitForTimeout(160);

  let drawn = await report();
  assert.equal(drawn.currentLeft, "0%",
    "Ripple observation does not move the rendered Current.");
  assert.equal(drawn.address.hidden, false);
  assert.ok(Math.abs(Number.parseFloat(drawn.address.left) - 75) < 0.2,
    `The Observation Address is drawn under the Shift-click (${drawn.address.left}).`);
  assert.equal(drawn.address.position, "absolute");
  assert.ok(drawn.address.width > 0 && drawn.address.height > 0);
  assert.ok(drawn.address.painted);
  assert.ok(drawn.address.insideTimeline);
  assert.match(drawn.address.label, /Current did not move and remains 0:00/);

  assert.equal(drawn.context.hidden, false);
  assert.equal(drawn.context.position, "absolute");
  assert.ok(drawn.context.width > 0 && drawn.context.height > 0);
  assert.ok(drawn.context.painted);
  assert.ok(drawn.context.insideTimeline);

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
  ), "Every prospect is painted, non-collapsed, contained, and accessibly distinct from Current.");

  await page.setViewportSize({ width: 680, height: 900 });
  await page.waitForTimeout(180);
  drawn = await report();
  assert.ok(drawn.address.insideTimeline
    && drawn.context.insideTimeline
    && drawn.prospects.every(marker => marker.insideTimeline),
  "Ripple channels remain inside the Timeline at the narrow responsive layout.");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(180);
  await mediaClockTo(page, 78);
  await page.waitForTimeout(180);
  drawn = await report();
  assert.equal(drawn.address.hidden, true,
    "The live Observation Address leaves presentation on completion.");
  assert.equal(drawn.context.hidden, true,
    "The live Context Window leaves presentation on completion.");
  assert.equal(drawn.prospects.length, 2,
    "Completed prospects stay painted for forward Ghost reading.");
  assert.equal(drawn.currentLeft, "0%");

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
  assert.equal(prospective.accepted, "0");
  assert.ok(
    Number(prospective.candidate) > 77 && Number(prospective.candidate) < 78,
    `Forward Ghost exposes the End Prospect as Candidate: ${JSON.stringify(prospective)}`
  );
  assert.match(prospective.status, /Ghost future.*Ripple End Prospect.*Current remains 0:00/);
  assert.equal(prospective.history, "Nothing to undo");
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
  assert.ok(settled.accepted > 77 && settled.accepted < 78);
  assert.equal(settled.history, "Go to Traversal Prospect");
  assert.deepEqual(settled.prospectKinds, ["ripple-start"],
    "Release consumes exactly the rendered End Prospect.");

  assert.deepEqual(failures, [],
    `Ripple rendered without console or page errors: ${failures.join(" | ")}`);

  console.log("Ripple render smoke passed: Observation Address, Context Window, Start Prospect, and End Prospect are distinct, painted, non-collapsed, accessible, responsive, completion-correct, and separate from Current; forward Ghost keeps the accepted marker fixed during Context recognition and release consumes only its canonical Go destination.");
} finally {
  await close();
}
