// Ghost Traversal in the browser it runs in.
//
// The ledger and the Session operator are proven without a DOM. What only a
// real browser can answer is whether holding a key and turning a wheel actually
// reaches them: which handler owns the notch, whether a tap costs anything,
// whether releasing writes one transaction, and whether Tab now acquires the
// Guide that G used to.
import assert from "node:assert/strict";
import {
  openApp,
  loadVideo,
  boxOf,
  mediaClockTo,
  mediaCommands,
  mediaCommandCount,
  mediaIsPlaying
} from "./browser-harness.mjs";

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

// How many moments the reader's path is currently offering. The recall reports
// it on every notch, which makes it the one place the ledger is visible from
// outside: "Ghost back · 0:32.61 · 7 of 8 · anchored at 0:44.89."
const pathTotal = status => Number(/ of (\d+) /.exec(status)?.[1] || 0);

// Watch a Context window through to its end. The substituted adapter has no
// clock of its own, so the window is played by moving its position the way a
// real player would, one poll at a time.
async function playWindowOut() {
  const from = await page.evaluate(() => Object.values(window.__players)[0].currentTime);
  for (const offset of [1, 2, 3, 4, 5]) {
    await mediaClockTo(page, from + offset);
    await settle(160);
  }
}

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

  // Pressed from where a reader actually is, not after a synthetic blur: the
  // focus left behind by clicking the map or a rail control must not swallow it.
  await page.mouse.click(timeline.x + timeline.width * 0.4, timeline.y + timeline.height * 0.55);
  await settle(320);
  await page.keyboard.press("i");
  await settle(250);
  assert.equal(await page.getAttribute("#guide-toggle", "aria-expanded"), "true",
    "I opens the Guide from wherever the reader left focus,");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("i");
  await settle(250);
  assert.equal(await page.getAttribute("#guide-toggle", "aria-expanded"), "false",
    "and puts it away again, the way O already works for Operators.");
  assert.equal(await page.getAttribute("#guide-toggle", "aria-keyshortcuts"), "I",
    "The control advertises the binding it actually has.");
  assert.match(await text("#guide-toggle"), /I/);

  // The physical key counts as well as the character. A layout where that key
  // does not produce "i" would otherwise have no Guide binding at all, and the
  // spatial cluster already matches this way.
  await page.evaluate(() => document.activeElement?.blur());
  const beforePhysical = await page.getAttribute("#guide-toggle", "aria-expanded");
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", {
    key: "ı", code: "KeyI", bubbles: true, cancelable: true
  })));
  await settle(250);
  assert.notEqual(await page.getAttribute("#guide-toggle", "aria-expanded"), beforePhysical,
    "The Guide answers the I key by position, not only by the character it prints.");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("i");
  await settle(250);

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
  assert.equal(await page.getAttribute("#active-span-fill", "data-medium"), "ghost",
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
  // Depth alone cannot say how much further there is to go, so the recall
  // reports its place in the whole path. Without that there is no way to tell a
  // working recall from one that has quietly run out.
  assert.match(reachedDuringGesture, /Ghost back ·/,
    "Ghost says which way it is reading,");
  assert.match(reachedDuringGesture, /\d+ of \d+/,
    "where in the reader's path it now is,");
  assert.match(reachedDuringGesture, /anchored at/,
    "and what it is measuring against.");

  // =========================================================================
  // 8. Ghost and ordinary operators interleave without losing the thread
  // =========================================================================
  // Recalling, acting on what was recalled, recalling again, acting again. Each
  // gesture must anchor on wherever the reader actually is, and every Address it
  // offers must be one they actually occupied -- an operator in between changes
  // the path but must never make the recall incoherent.
  await page.evaluate(() => {
    const toggle = document.getElementById("guide-toggle");
    if (toggle.getAttribute("aria-expanded") === "true") toggle.click();
    document.activeElement?.blur();
  });
  await settle(220);

  const occupied = new Set();
  const note = async () => { occupied.add(await currentAddress()); };
  for (const fraction of [0.10, 0.28, 0.46, 0.64, 0.82]) {
    await page.mouse.click(
      timeline.x + timeline.width * fraction,
      timeline.y + timeline.height * 0.55
    );
    await settle(330);
    await note();
  }

  for (const round of [1, 2, 3]) {
    const anchorAddress = await currentAddress();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down("g");
    const recalledHere = [];
    for (let notch = 0; notch < 2; notch += 1) {
      await page.mouse.wheel(0, 100);
      await settle(180);
      recalledHere.push(await currentAddress());
    }
    const duringStatus = await text("#status");
    await page.keyboard.up("g");
    await settle(320);

    for (const address of recalledHere) {
      assert.ok(occupied.has(address),
        `Round ${round}: Ghost only ever lands where the reader has been (${address}).`);
    }
    assert.match(duringStatus, /anchored at/,
      `Round ${round}: the recall names what it is anchored to.`);
    assert.ok(duringStatus.includes(anchorAddress),
      `Round ${round}: and it is anchored on wherever the reader actually was.`);

    // Act on what was recalled. The operator moves the reader on, which is a new
    // encounter and part of the path from here.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press(round % 2 ? "q" : "d");
    await settle(360);
    await note();
    assert.match(await undoTop(), /Refine|Step/,
      `Round ${round}: an ordinary operator still commits ordinarily after a recall.`);
  }

  // After all of that the reader is at the live end of their own path, so
  // forward has nowhere to go and says so rather than failing silently.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, -100);
  await settle(220);
  const forwardStatus = await text("#status");
  await page.keyboard.up("g");
  await settle(300);
  assert.match(forwardStatus, /most recent moment|Ghost on/,
    "At the live end, Ghosting forward reports the boundary instead of doing nothing.");

  // =========================================================================
  // 9. A landing is recorded; the search that found it is not
  // =========================================================================
  // Walk deliberately, recall back two moments, release. The stream must gain
  // the moment re-entered and nothing else -- then Ghosting backward from there
  // follows what led to the re-entry, which is the Anchor, not the scan.
  await page.evaluate(() => {
    const toggle = document.getElementById("guide-toggle");
    if (toggle.getAttribute("aria-expanded") === "true") toggle.click();
    document.activeElement?.blur();
  });
  await settle(220);
  const deliberate = [];
  for (const fraction of [0.14, 0.34, 0.54, 0.74]) {
    await page.mouse.click(
      timeline.x + timeline.width * fraction,
      timeline.y + timeline.height * 0.55
    );
    await settle(330);
    deliberate.push(await currentAddress());
  }
  const anchorAt = deliberate.at(-1);

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(180);
  await page.mouse.wheel(0, 100);
  await settle(180);
  const landedAt = await currentAddress();
  await page.keyboard.up("g");
  await settle(320);
  assert.equal(landedAt, deliberate[1],
    "Two detents back from the fourth stop lands on the second.");
  assert.equal(await currentAddress(), landedAt, "and releasing keeps it.");

  // Backward from the injected landing follows the live stream: the Anchor is
  // what led here, not the moment scanned through on the way.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(200);
  const afterLanding = await currentAddress();
  await page.keyboard.up("g");
  await settle(320);
  assert.equal(afterLanding, anchorAt,
    "Backward from a re-entered moment asks what led to it, so the Anchor comes first.");
  assert.notEqual(afterLanding, deliberate[2],
    "and never the moment the scan merely passed through.");

  // =========================================================================
  // 10. Sub-threshold input costs nothing
  // =========================================================================
  // Arming is free and staying armed is free. A trackpad twitch under the
  // threshold must not settle Playback, capture an Anchor, or write anything.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Space");
  await settle(500);
  const playingBefore = await text("#field-transport-state");
  const currentBefore = await currentAddress();
  const undoBeforeTwitch = await undoTop();

  await page.keyboard.down("g");
  await page.mouse.wheel(0, 6);
  await settle(150);
  await page.mouse.wheel(0, 6);
  await settle(150);
  assert.equal((await anchorShown()).hidden, true,
    "A twitch below the threshold captures no Anchor,");
  await page.keyboard.up("g");
  await settle(300);
  assert.equal(await undoTop(), undoBeforeTwitch, "writes no history,");
  assert.equal(await text("#field-transport-state"), playingBefore,
    "and does not settle what was already running.");
  await page.keyboard.press("Space");
  await settle(400);

  // =========================================================================
  // 11. Context plays through the recall
  // =========================================================================
  // The stop condition for a recall is recognition, and a still frame is a poor
  // thing to recognise a moment from. With Context on, each candidate plays --
  // and it is the same window following the wheel, not a new observation torn
  // down and rebuilt at every notch.
  await page.evaluate(() => {
    document.getElementById("context-seconds").value = "4";
    document.getElementById("context-seconds").dispatchEvent(new Event("change", { bubbles: true }));
    document.activeElement?.blur();
  });
  await settle(260);

  // Walk somewhere with Context on and let the window play out, so the path
  // contains a watched span and not only jumps.
  await page.mouse.click(timeline.x + timeline.width * 0.5, timeline.y + timeline.height * 0.55);
  await settle(360);
  await playWindowOut();

  // A recall with Context on plays where it lands.
  const beforeRecall = await mediaCommandCount(page);
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(300);
  const firstNotch = await mediaCommands(page, beforeRecall);
  assert.equal(await mediaIsPlaying(page), true,
    "With Context on, a recalled moment plays instead of sitting as a still frame.");
  assert.ok(firstNotch.some(command => command[0] === "place")
    && firstNotch.some(command => command[0] === "play"),
    "The first candidate opens a window: it is placed and started.");

  // The next candidate, with that window still running, retargets it. A fresh
  // `play` here would mean the window was torn down and rebuilt, which is what
  // makes a scan stutter instead of sweep.
  const beforeRetarget = await mediaCommandCount(page);
  await page.mouse.wheel(0, 100);
  await settle(300);
  const secondNotch = await mediaCommands(page, beforeRetarget);
  assert.ok(secondNotch.some(command => command[0] === "place"),
    "The next candidate moves the window,");
  assert.ok(!secondNotch.some(command => command[0] === "play"),
    "but reuses the one already playing rather than starting another.");

  // Escape abandons the whole scan, including whatever it was playing.
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  assert.equal(await mediaIsPlaying(page), false,
    "Escape stops the Context along with everything else the scan did.");

  // What the scan swept past is not something the reader watched. A candidate
  // window that ran out mid-gesture must leave the path exactly as it found it,
  // so a fresh gesture from the same Anchor offers exactly the same moments.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const pathBefore = pathTotal(await text("#status"));
  await playWindowOut();
  await page.mouse.wheel(0, 100);
  await settle(280);
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const pathAfter = pathTotal(await text("#status"));
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  assert.ok(pathBefore > 0, "The path has moments to recall,");
  assert.equal(pathAfter, pathBefore,
    "and a Context window the scan ran through is not one of them: it was swept past, not watched.");

  // Released with the window still running, the reader is watching. That one is
  // an observation, and it joins the path.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const heldTotal = pathTotal(await text("#status"));
  await page.keyboard.up("g");
  await settle(340);
  assert.equal(await mediaIsPlaying(page), true,
    "Releasing keeps the landing playing rather than cutting it off,");
  await playWindowOut();

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const watchedTotal = pathTotal(await text("#status"));
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  // The injection contributes exactly one new moment -- its landing -- so any
  // growth beyond that is the span the reader actually watched.
  assert.ok(watchedTotal - heldTotal > 1,
    "and the window watched to its end joins the path as watched source time.");

  // Back off, so nothing downstream inherits a playing window.
  await page.evaluate(() => {
    document.getElementById("context-seconds").value = "0";
    document.getElementById("context-seconds").dispatchEvent(new Event("change", { bubbles: true }));
    document.activeElement?.blur();
  });
  await settle(300);

  // With Context off the recall is silent again: a frame-by-frame scan.
  await page.mouse.click(timeline.x + timeline.width * 0.3, timeline.y + timeline.height * 0.55);
  await settle(340);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(300);
  assert.equal(await mediaIsPlaying(page), false,
    "With Context off, recall stays the silent scan it was.");
  await page.keyboard.up("g");
  await settle(320);

  // =========================================================================
  // 12. A forward scan settled mid-way lands once
  // =========================================================================
  // Backward is the easy direction to get right, because running out is
  // obvious. Forward has somewhere to go for a while, so a scan that stops
  // short of the live end is the case where a search could quietly be written
  // as a path. Walk deliberately, go back several moments, then come forward
  // and stop in the middle: the path must gain that one moment and nothing it
  // passed through on the way.
  await page.evaluate(() => document.activeElement?.blur());
  const walked = [];
  for (const fraction of [0.12, 0.3, 0.48, 0.66, 0.84]) {
    await page.mouse.click(
      timeline.x + timeline.width * fraction,
      timeline.y + timeline.height * 0.55
    );
    await settle(330);
    walked.push(await currentAddress());
  }

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  for (let index = 0; index < 4; index += 1) {
    await page.mouse.wheel(0, 100);
    await settle(170);
  }
  const beforeForward = pathTotal(await text("#status"));
  await page.keyboard.up("g");
  await settle(340);
  assert.equal(await currentAddress(), walked[0],
    "Four moments back from the fifth stop is the first.");

  // Forward from there, stopping two short of where the scan could still go.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, -100);
  await settle(200);
  await page.mouse.wheel(0, -100);
  await settle(200);
  const settledMidway = await currentAddress();
  await page.keyboard.up("g");
  await settle(340);
  assert.equal(await currentAddress(), settledMidway,
    "A forward scan settles where it stopped, not where it could have reached.");
  assert.notEqual(settledMidway, walked.at(-1),
    "and stopping short is a landing in its own right, not a run to the live end.");

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const afterForward = pathTotal(await text("#status"));
  const backFromLanding = await currentAddress();
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  // Two gestures, two landings, two new moments: the backward scan's four
  // candidates and the forward scan's two are search and cost nothing.
  assert.equal(afterForward - beforeForward, 2,
    "Two settled gestures add exactly two moments, whatever they scanned through.");
  assert.equal(backFromLanding, walked[0],
    "and backward from the landing follows what led there, which is the Anchor.");

  // =========================================================================
  // 13. An ordinary Step ends the historical pattern
  // =========================================================================
  // The resume cursor exists so that Ghosting forward out of a re-entered
  // moment can replay what originally followed it. That offer is only good
  // while the reader is still standing there. Moving of their own accord --
  // any operator at all -- makes the next recall start from where they now
  // actually are, on the live stream.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(200);
  await page.mouse.wheel(0, 100);
  await settle(200);
  const reEntered = await currentAddress();
  await page.keyboard.up("g");
  await settle(340);

  // Straight forward from the re-entry resumes the historical successors: the
  // reader has not moved, so the offer still stands.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, -100);
  await settle(280);
  const historicalNext = await currentAddress();
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  assert.equal(await currentAddress(), reEntered, "Escape leaves the re-entry intact.");

  // Now step out and straight back. Standing on the same Address again is the
  // one case that separates the law from the safety net: a cursor is also
  // rejected when the reader has moved off it, so a reader who walked away
  // would look right either way. Coming back makes the address match again, and
  // only the Step having genuinely ended the pattern keeps the old offer down.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("d");
  await settle(420);
  const steppedTo = await currentAddress();
  assert.notEqual(steppedTo, reEntered, "An ordinary Step moves the reader,");
  await page.keyboard.press("a");
  await settle(420);
  assert.equal(await currentAddress(), reEntered,
    "and stepping back puts them on the same Address they were recalled to.");

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, -100);
  await settle(280);
  const afterStepForward = await text("#status");
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  // Those two Steps are the newest thing in the path, so its live end is here.
  // Forward therefore has nowhere left to go -- which is what a withdrawn offer
  // looks like from outside. A retained cursor would still be replaying the old
  // moment's successors, from a place the reader has since left and returned to
  // by a route of their own.
  assert.match(afterStepForward, /most recent moment/,
    "so the historical successors it was offering are no longer on the table.");
  assert.ok(historicalNext && historicalNext !== reEntered,
    "The offer really existed before the Step: forward had somewhere to go.");

  // =========================================================================
  // 14. Dragging Current is one movement, not every frame it passed
  // =========================================================================
  // The drag places Center at every candidate under the pointer, and the reader
  // sees each one. None of it is a moment they went to: the gesture is a search
  // for a place, exactly like a Ghost scan, and only the release is an arrival.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const beforeDrag = pathTotal(await text("#status"));
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  const dragOrigin = await currentAddress();

  const marker = await boxOf(page, "#current-marker");
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await page.mouse.down();
  // Deliberately slow and across a lot of ground, so a sampled implementation
  // would have plenty of positions to record.
  for (const fraction of [0.3, 0.42, 0.55, 0.68, 0.8]) {
    await page.mouse.move(
      timeline.x + timeline.width * fraction,
      timeline.y + timeline.height * 0.55,
      { steps: 8 }
    );
    await settle(120);
  }
  await page.mouse.up();
  await settle(420);
  const dragLanding = await currentAddress();
  assert.notEqual(dragLanding, dragOrigin, "The drag moved the reader,");

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const afterDrag = pathTotal(await text("#status"));
  const dragPredecessor = await currentAddress();
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  assert.equal(afterDrag - beforeDrag, 1,
    "but records one moment, not the ground it was dragged across.");
  assert.equal(dragPredecessor, dragOrigin,
    "so the moment before the landing is where the drag began.");

  // =========================================================================
  // 15. Undo is a route the reader took
  // =========================================================================
  // Semantic history and user time are different orders, and traversing one
  // moves through the other. An Undo that puts the reader somewhere else is a
  // movement like any other: they now occupy that Address, and the moment they
  // came from is the one they were just in. Left unwritten, Ghost answered
  // "what led here" with whatever led here the first time -- the past, rather
  // than what actually just happened.
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.click(timeline.x + timeline.width * 0.22, timeline.y + timeline.height * 0.55);
  await settle(360);
  const beforeUndo = await currentAddress();

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("z");
  await settle(420);
  const undoneTo = await currentAddress();
  assert.notEqual(undoneTo, beforeUndo, "Undo moved the reader,");

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const afterUndoBack = await currentAddress();
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  assert.equal(afterUndoBack, beforeUndo,
    "so the moment that led here is where they were standing before the Undo.");

  // Redo is the same movement in the other direction and writes its own.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("c");
  await settle(420);
  assert.equal(await currentAddress(), beforeUndo, "Redo puts them back,");

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const afterRedoBack = await currentAddress();
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  assert.equal(afterRedoBack, undoneTo,
    "and what led there is where the Undo had left them.");

  // Undoing something that moves nobody writes nothing. The test is the
  // Address, here as everywhere else -- a Weight or a name changes the world
  // without changing where the reader is standing.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const beforeInert = pathTotal(await text("#status"));
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("[");
  await settle(320);
  await page.keyboard.press("z");
  await settle(420);

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("g");
  await page.mouse.wheel(0, 100);
  await settle(280);
  const afterInert = pathTotal(await text("#status"));
  await page.keyboard.press("Escape");
  await page.keyboard.up("g");
  await settle(340);
  assert.equal(afterInert, beforeInert,
    "An Undo that moves nobody adds no moment to the path.");

  // =========================================================================
  // 16. Nothing logged an error along the way
  // =========================================================================
  assert.deepEqual(failures, [], `Console/page errors: ${failures.join(" | ")}`);
  console.log("Ghost smoke passed: the Guide is on I while Tab stays the browser's and G no longer touches either; holding G moves nothing, writes no history and draws no Anchor; a wheel notch recalls an earlier moment behind a fixed Anchor and an ordinary Working Interval; releasing writes one transaction that one Undo reverses; Escape cancels exactly; Ghost owns the wheel only while G is held; one detent recalls exactly one moment; the recall says where in the path it is and what it is anchored to; Ghost interleaves with ordinary operators without ever landing where the reader has not been; releasing records the moment re-entered rather than the search that found it, so backward from it asks what led there; input below the threshold costs nothing at all; and with Context on the recall plays where it lands, one window following the wheel rather than a new one at every notch, with only the window still running when the gesture ended joining the path; a forward scan settled short of the live end lands exactly once; stepping out and back onto a re-entered moment does not revive the offer the Step withdrew; dragging Current records one movement rather than the ground it crossed; and an Undo that moves the reader is itself a route they took, while one that moves nobody writes nothing.");
} finally {
  await close();
}
