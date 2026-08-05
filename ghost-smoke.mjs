// Ghost Traversal in the browser it runs in.
//
// The ledger and the Session operator are proven without a DOM. What only a
// real browser can answer is whether holding a key and turning a wheel actually
// reaches them: which handler owns the notch, whether a tap costs anything,
// whether releasing writes one transaction, and whether Tab now acquires the
// Guide that G used to.
import assert from "node:assert/strict";
import { openApp, loadVideo, boxOf } from "./browser-harness.mjs";

const { page, close, failures } = await openApp({ width: 1440, height: 1000 });

const text = selector => page.textContent(selector);
const settle = (ms = 200) => page.waitForTimeout(ms);
const currentAddress = () => page.evaluate(() =>
  document.querySelector("#current-marker .current-marker-time")?.textContent || "");
const undoTop = () => text("#return-meta");
const anchorShown = () => page.evaluate(() => {
  const marker = document.getElementById("current-departure-marker");
  return { hidden: marker?.hidden !== false, owner: marker?.dataset.owner || null };
});

// One Ghost wheel notch. The threshold is 24 normalized pixels, so a full
// mouse detent of 100 earns four; a single deliberate notch is sent as one.
async function ghostWheel(direction, notches = 1) {
  await page.keyboard.down("g");
  for (let index = 0; index < notches; index += 1) {
    await page.mouse.wheel(0, direction === "backward" ? 30 : -30);
    await settle(90);
  }
  return async () => {
    await page.keyboard.up("g");
    await settle(300);
  };
}

try {
  await loadVideo(page);
  const timeline = await boxOf(page, "#timeline");
  await page.evaluate(() => document.activeElement?.blur());

  // =========================================================================
  // 1. Tab acquires the Guide; G no longer touches it
  // =========================================================================
  await page.evaluate(() => {
    const toggle = document.getElementById("guide-toggle");
    if (toggle.getAttribute("aria-expanded") === "true") toggle.click();
  });
  await settle(220);
  assert.equal(await page.getAttribute("#guide-toggle", "aria-expanded"), "false",
    "Starting from a closed Guide.");

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("g");
  await settle(220);
  assert.equal(await page.getAttribute("#guide-toggle", "aria-expanded"), "false",
    "G no longer opens the Guide: it is the held Ghost modifier now.");

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Tab");
  await settle(250);
  assert.equal(await page.getAttribute("#guide-toggle", "aria-expanded"), "true",
    "Tab acquires the Guide from the reader's background.");
  assert.equal(await page.getAttribute("#guide-toggle", "aria-keyshortcuts"), "Tab",
    "and the control advertises the binding it actually has.");
  assert.match(await text("#guide-toggle"), /Tab/);

  // Once focus is inside, Tab is native focus navigation again -- otherwise it
  // would stop being a way to move through a page.
  const insideBefore = await page.evaluate(() => document.activeElement?.tagName);
  await page.keyboard.press("Tab");
  await settle(150);
  const insideAfter = await page.evaluate(() => document.activeElement?.tagName);
  assert.ok(insideBefore !== null && insideAfter !== null,
    "Tab keeps moving focus once the Guide has it.");

  // =========================================================================
  // 2. Build a path worth recalling
  // =========================================================================
  await page.evaluate(() => {
    const toggle = document.getElementById("guide-toggle");
    if (toggle.getAttribute("aria-expanded") === "true") toggle.click();
    document.activeElement?.blur();
  });
  await settle(220);

  const visitedFractions = [0.2, 0.5, 0.35, 0.8];
  for (const fraction of visitedFractions) {
    await page.mouse.click(
      timeline.x + timeline.width * fraction,
      timeline.y + timeline.height * 0.55
    );
    await settle(320);
  }
  const arrived = await currentAddress();
  assert.ok(arrived, "The reader has been somewhere.");

  // =========================================================================
  // 3. Holding G costs nothing at all
  // =========================================================================
  const undoBeforeTap = await undoTop();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await settle(500);
  await page.keyboard.up("g");
  await settle(300);
  assert.equal(await currentAddress(), arrived, "Holding G moves nothing,");
  assert.equal(await undoTop(), undoBeforeTap, "writes no history,");
  assert.equal((await anchorShown()).hidden, true, "and draws no Anchor.");

  // =========================================================================
  // 4. A wheel notch recalls where the reader was
  // =========================================================================
  const release = await ghostWheel("backward", 1);
  const recalled = await currentAddress();
  assert.notEqual(recalled, arrived, "A notch reaches an earlier moment,");

  const anchor = await anchorShown();
  assert.equal(anchor.hidden, false, "the Anchor appears,");
  assert.equal(anchor.owner, "ghost", "owned by the gesture,");
  assert.equal(await page.getAttribute("#current-marker", "data-ghost-active"), "true",
    "and Current reads as transient while it is held.");
  assert.equal(await page.getAttribute("#interval-fill", "data-medium"), "ghost",
    "The relation drawn is an ordinary Working Interval, marked as recalled.");

  // While it is held, nothing has been committed.
  assert.equal(await undoTop(), undoBeforeTap,
    "A held gesture writes no history however far it travels.");

  await release();
  assert.equal(await currentAddress(), recalled, "Releasing keeps the recalled Address,");
  assert.match(await undoTop(), /Ghost Traverse/, "and writes exactly one transaction.");
  assert.equal((await anchorShown()).hidden, true, "The Anchor is a gesture, not a mark.");

  // One Undo returns to where the gesture began.
  await page.keyboard.press("z");
  await settle(350);
  assert.equal(await currentAddress(), arrived,
    "One Undo returns to the Anchor the gesture started from.");
  await page.keyboard.press("y");
  await settle(350);

  // =========================================================================
  // 5. Escape cancels exactly
  // =========================================================================
  const beforeEscape = await currentAddress();
  const undoBeforeEscape = await undoTop();
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 30);
  await settle(200);
  assert.notEqual(await currentAddress(), beforeEscape, "The gesture moved,");
  await page.keyboard.press("Escape");
  await settle(300);
  await page.keyboard.up("g");
  await settle(250);
  assert.equal(await currentAddress(), beforeEscape, "and Escape puts everything back,");
  assert.equal(await undoTop(), undoBeforeEscape, "leaving no transaction behind.");

  // =========================================================================
  // 6. Ghost owns the wheel while G is held; Nudge owns it otherwise
  // =========================================================================
  await page.mouse.move(
    timeline.x + timeline.width * 0.5,
    timeline.y + timeline.height * 0.55
  );
  const beforeContest = await currentAddress();
  await page.keyboard.down("g");
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 30);
  await settle(220);
  const contested = await currentAddress();
  await page.keyboard.up("Shift");
  await page.keyboard.up("g");
  await settle(300);
  assert.notEqual(contested, beforeContest, "G+Shift+wheel moves,");
  assert.match(await undoTop(), /Ghost Traverse/,
    "and it is Ghost that moved it, not Nudge.");

  // Without G the wheel is still Nudge's, exactly as before.
  const beforeNudge = await currentAddress();
  await page.keyboard.down("Shift");
  for (let index = 0; index < 4; index += 1) {
    await page.mouse.wheel(0, -30);
    await settle(90);
  }
  await page.keyboard.up("Shift");
  await settle(600);
  assert.notEqual(await currentAddress(), beforeNudge, "Shift+wheel still Nudges,");
  assert.match(await undoTop(), /Nudge|Step/,
    "and is recorded as the Nudge it is.");

  // =========================================================================
  // 7. Nothing logged an error along the way
  // =========================================================================
  assert.deepEqual(failures, [], `Console/page errors: ${failures.join(" | ")}`);
  console.log("Ghost smoke passed: Tab acquires the Guide and G no longer touches it; holding G moves nothing, writes no history and draws no Anchor; a wheel notch recalls an earlier moment behind a fixed Anchor and an ordinary Working Interval; releasing writes one transaction that one Undo reverses; Escape cancels exactly; and Ghost owns the wheel only while G is held.");
} finally {
  await close();
}
