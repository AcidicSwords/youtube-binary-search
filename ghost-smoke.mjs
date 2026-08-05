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

// One Ghost wheel notch. Any single turn past the threshold recalls exactly one
// occurrence, whatever the device reports for a detent.
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
  // 1. The Guide is on I; G no longer touches it
  // =========================================================================
  // Tab was tried and rejected: it belongs to the browser, and a page that
  // captures it stops being navigable by keyboard at all. I sits beside O,
  // where Operators already is.
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
  await page.keyboard.press("i");
  await settle(250);
  assert.equal(await page.getAttribute("#guide-toggle", "aria-expanded"), "true",
    "I opens the Guide,");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("i");
  await settle(250);
  assert.equal(await page.getAttribute("#guide-toggle", "aria-expanded"), "false",
    "and puts it away again, the way O already works for Operators.");
  assert.equal(await page.getAttribute("#guide-toggle", "aria-keyshortcuts"), "I",
    "The control advertises the binding it actually has.");
  assert.match(await text("#guide-toggle"), /I/);

  // Tab stays the browser's. A page that captures it stops being navigable by
  // keyboard at all, which is a worse trade than any shortcut is worth.
  await page.evaluate(() => document.activeElement?.blur());
  const beforeTab = await page.getAttribute("#guide-toggle", "aria-expanded");
  await page.keyboard.press("Tab");
  await settle(250);
  assert.equal(await page.getAttribute("#guide-toggle", "aria-expanded"), beforeTab,
    "Tab does not act on the Guide: it is left to the browser.");
  assert.equal(
    await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    false,
    "and nothing here cancels it, so native focus order still works."
  );
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("i");
  await settle(250);

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
  // 7. One turn of the wheel is one occurrence
  // =========================================================================
  // Nudge carries its wheel remainder because four Nudges is four frames. An
  // occurrence is not a quantum -- it is a place the reader has been, and the
  // stop condition is recognising one. A mouse detent reports about 100px
  // against a 24px threshold, so sharing Nudge's arithmetic recalled four
  // moments per detent and made it impossible to stop where it clicked.
  await page.evaluate(() => {
    const toggle = document.getElementById("guide-toggle");
    if (toggle.getAttribute("aria-expanded") === "true") toggle.click();
    document.activeElement?.blur();
  });
  await settle(220);
  const path = [];
  for (const fraction of [0.12, 0.42, 0.28, 0.66]) {
    await page.mouse.click(
      timeline.x + timeline.width * fraction,
      timeline.y + timeline.height * 0.55
    );
    await settle(340);
    path.push(await currentAddress());
  }

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  const stepped = [];
  for (let notch = 0; notch < 3; notch += 1) {
    // A full mouse detent, not a trickle: this is the size that used to move
    // four occurrences at once.
    await page.mouse.wheel(0, 100);
    await settle(180);
    stepped.push(await currentAddress());
  }
  const reachedDuringGesture = await text("#status");
  await page.keyboard.up("g");
  await settle(300);

  assert.deepEqual(stepped, [path[2], path[1], path[0]],
    "Each detent recalls exactly one earlier moment, in the reader's own order.");
  assert.equal(new Set(stepped).size, stepped.length, "and never skips one.");

  // A recall is otherwise almost silent -- Current moves and an Interval
  // appears, which many operators do -- so it says how deep it is and what it
  // is anchored to. Without that there is no way to tell a Ghost from a Go.
  assert.match(reachedDuringGesture, /Ghost 3 moments back/,
    "Ghost says how far back through its own path the reader now is,");
  assert.match(reachedDuringGesture, /anchored at/,
    "and what it is measuring against.");

  // =========================================================================
  // 8. Nothing logged an error along the way
  // =========================================================================
  assert.deepEqual(failures, [], `Console/page errors: ${failures.join(" | ")}`);
  console.log("Ghost smoke passed: the Guide is on I while Tab stays the browser's and G no longer touches either; holding G moves nothing, writes no history and draws no Anchor; a wheel notch recalls an earlier moment behind a fixed Anchor and an ordinary Working Interval; releasing writes one transaction that one Undo reverses; Escape cancels exactly; Ghost owns the wheel only while G is held; one detent recalls exactly one moment; and the recall says how deep it is and what it is anchored to.");
} finally {
  await close();
}
