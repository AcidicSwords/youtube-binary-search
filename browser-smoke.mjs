// What only a browser can answer.
//
// The DOM-free harness returns fixed geometry and knows nothing of stylesheets,
// so it cannot see whether a control is where it is drawn, whether one element
// covers another, whether focus survives a rebuild, or which handler a key
// actually reaches. Those are not gaps in coverage; they are outside what that
// harness can represent at all. This suite runs the page Chromium renders, with
// only the media adapter substituted.
//
// It stays small on purpose. Anything provable without a browser belongs in the
// suites that do not need one.
import assert from "node:assert/strict";
import { openApp, loadVideo, boxOf } from "./browser-harness.mjs";

const { page, close, failures } = await openApp();

const text = selector => page.textContent(selector);
const settle = (ms = 200) => page.waitForTimeout(ms);
const focusById = id => page.evaluate(target => {
  document.getElementById(target)?.focus();
}, id);
const activeId = () => page.evaluate(() => document.activeElement?.id || "");

try {
  await loadVideo(page);

  // ============================================================================
  // 1. The page loads and runs without error
  // ============================================================================
  assert.match(await text("#status"), /Loaded/,
    "The application initialises against a real document.");
  assert.equal(await text("#duration-time"), "1:40");

  // ============================================================================
  // 2. A press lands on the Address drawn under it
  // ============================================================================
  // Hit-testing converts a pointer position through the element's own rect.
  // The harness returns `{ left: 0, width: clientWidth }`, which makes that
  // conversion trivially correct by construction; only a real layout can show
  // that the map addresses what is under the finger.
  const timeline = await boxOf(page, "#timeline");
  const pressAt = async fraction => {
    await page.mouse.click(
      timeline.x + timeline.width * fraction,
      timeline.y + timeline.height * 0.3
    );
    await settle(120);
    return page.evaluate(() => document.getElementById("pin-current-position").textContent);
  };
  const quarter = await pressAt(0.25);
  const threeQuarters = await pressAt(0.75);
  const seconds = label => {
    const [, minutes, rest] = label.match(/(\d+):(\d+(?:\.\d+)?)/);
    return Number(minutes) * 60 + Number(rest);
  };
  assert.ok(Math.abs(seconds(quarter) - 25) < 3,
    `A press at one quarter of the drawn map lands near 0:25 (got ${quarter}).`);
  assert.ok(Math.abs(seconds(threeQuarters) - 75) < 3,
    `and at three quarters near 1:15 (got ${threeQuarters}).`);

  // ============================================================================
  // 3. A focused control owns Space
  // ============================================================================
  // Space is the reader's observation command, captured before a stale focus
  // could consume it -- which also took the key from the control the user had
  // deliberately focused. Pressing Space on a focused button started playback
  // while the button did nothing.
  await focusById("guide-toggle");
  assert.equal(await activeId(), "guide-toggle");
  const transportBefore = await text("#field-transport-state");
  const expandedBefore = await page.getAttribute("#guide-toggle", "aria-expanded");
  await page.keyboard.press("Space");
  await settle();
  assert.notEqual(
    await page.getAttribute("#guide-toggle", "aria-expanded"),
    expandedBefore,
    "Space activates the control that holds focus."
  );
  assert.equal(await text("#field-transport-state"), transportBefore,
    "and does not also start observation behind it.");

  // With focus on the reader background, Space is the reader's again.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Space");
  await settle(300);
  assert.notEqual(await text("#field-transport-state"), transportBefore,
    "With nothing focused, Space observes.");
  await page.keyboard.press("Space");
  await settle(300);

  // ============================================================================
  // 4. Nothing visible is covered by something else
  // ============================================================================
  // A control drawn in one place and pressed in another is invisible to every
  // suite without a layout engine. Controls inside a collapsed disclosure are
  // excluded: being unreachable is what collapsed means.
  const obstructed = await page.evaluate(() => {
    const found = [];
    const candidates = document.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), select:not([disabled])"
    );
    for (const element of candidates) {
      if (element.closest("details:not([open])")) continue;
      if (element.closest("[inert]") || element.closest("[hidden]")) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      if (element.offsetParent === null) continue;
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      if (!hit) { found.push([element.id || element.className, "nothing"]); continue; }
      if (element === hit || element.contains(hit) || hit.contains(element)) continue;
      found.push([element.id || element.className, hit.id || hit.className || hit.tagName]);
    }
    return found;
  });
  assert.deepEqual(obstructed, [],
    "Every reachable control receives a press at its own centre.");

  // ============================================================================
  // 5. The instrument does not scroll sideways, at any width
  // ============================================================================
  for (const width of [1440, 1100, 820, 600, 380]) {
    await page.setViewportSize({ width, height: 900 });
    await settle(160);
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth
    }));
    assert.ok(overflow.scroll <= overflow.client + 1,
      `At ${width}px the page must not scroll horizontally (${overflow.scroll} > ${overflow.client}).`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await settle(160);

  // ============================================================================
  // 6. A breakpoint does not decide whether a panel is open
  // ============================================================================
  // Presentation follows width. Intent does not: rotating a device or resizing
  // a window must not open or close the Guide on the reader's behalf.
  const guideOpen = () => page.getAttribute("#guide-toggle", "aria-expanded");
  const wideState = await guideOpen();
  await page.setViewportSize({ width: 600, height: 900 });
  await settle(200);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await settle(200);
  assert.equal(await guideOpen(), wideState,
    "Crossing the compact breakpoint and returning leaves the Guide as the reader left it.");

  // ============================================================================
  // 7. Dense structure does not move the rest of the page
  // ============================================================================
  // Overlap creates lanes. An unbounded band grew the Timeline by a lane each
  // time, so building structure displaced everything below it.
  const timelineHeight = () => page.$eval("#timeline", element =>
    element.getBoundingClientRect().height);
  const sparse = await timelineHeight();
  for (let index = 0; index < 10; index += 1) {
    const box = await boxOf(page, "#timeline");
    await page.mouse.click(box.x + box.width * (0.10 + index * 0.01), box.y + box.height * 0.3);
    await page.mouse.click(box.x + box.width * (0.80 - index * 0.01), box.y + box.height * 0.3);
    await page.evaluate(() => document.getElementById("section-capture")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    // Release lives in the operator matrix, which is genuinely not displayed
    // while the rail shows Guide. It is invoked directly rather than by opening
    // a panel this block is not about.
    await page.evaluate(() => document.getElementById("release").click());
    await settle(60);
  }
  assert.ok(Number(await text("#sections-list-count")) >= 10);
  const dense = await timelineHeight();
  assert.ok(dense - sparse < 200,
    `Ten overlapping Sections must not push the workspace down a screen (grew ${Math.round(dense - sparse)}px).`);

  // ============================================================================
  // 8. Guide editing keeps the control the reader is holding
  // ============================================================================
  // Guide rendering replaces whole lists. An increment control that repeats
  // while held is detached by the first rebuild, which ends the hold and drops
  // keyboard position -- a defect that requires a real focus model to observe.
  await page.click("#guide-tab-sections");
  await settle(120);
  const firstRow = await page.$("#sections-list [data-section-go]");
  await firstRow.click();
  await settle(200);
  const nudgeButton = await page.$("#sections-list [data-nudge-target]");
  if (nudgeButton) {
    await nudgeButton.focus();
    const heldId = await page.evaluate(() => {
      const element = document.activeElement;
      return element?.dataset?.nudgeTarget
        ? `${element.dataset.nudgeTarget}:${element.dataset.nudgeDirection || ""}`
        : null;
    });
    assert.ok(heldId, "An increment control can hold focus.");
    await page.keyboard.press("Enter");
    await settle(250);
    const stillHeld = await page.evaluate(() => {
      const element = document.activeElement;
      return element?.dataset?.nudgeTarget
        ? `${element.dataset.nudgeTarget}:${element.dataset.nudgeDirection || ""}`
        : null;
    });
    assert.equal(stillHeld, heldId,
      "and it still holds focus after the edit rebuilds the Guide.");
  }

  // ============================================================================
  // 9. Nothing logged an error along the way
  // ============================================================================
  assert.deepEqual(failures, [],
    "The whole session runs without a page error or console error.");

  console.log("Browser smoke passed: the app runs in Chromium without error; a press lands on the Address drawn under it; a focused control owns Space while the reader background still observes; no reachable control is covered by another; the page never scrolls sideways from 380px to 1440px; crossing the compact breakpoint does not open or close the Guide; ten overlapping Sections do not displace the workspace; and an increment control keeps focus through the rebuild its own edit causes.");
} finally {
  await close();
}
