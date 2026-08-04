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

  // The operator grammar is physical, not merely a DOM naming convention.
  // Measure the rendered square and every row/column before any journey uses
  // the matrix indirectly through keyboard routes.
  await page.click("#operator-toggle");
  await settle(180);
  const matrix = await page.evaluate(() => {
    const ids = [
      ["refine-backward", "reopen", "refine-forward"],
      ["step-backward", "switch-endpoint", "step-forward"],
      ["release", "tag", "focus-toggle"]
    ];
    const deck = document.querySelector(".navigation-deck").getBoundingClientRect();
    const cells = ids.map(row => row.map(id => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return {
        id,
        left: rect.left,
        top: rect.top,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height
      };
    }));
    return {
      deck: { width: deck.width, height: deck.height },
      childCount: document.querySelector(".navigation-deck").children.length,
      cells
    };
  });
  assert.ok(Math.abs(matrix.deck.width - matrix.deck.height) <= 1,
    `The rendered operator matrix is square (${matrix.deck.width}×${matrix.deck.height}).`);
  assert.equal(matrix.childCount, 9, "The matrix has no auto-placed tenth cell.");
  const flatCells = matrix.cells.flat();
  const groupByPixel = key => flatCells.reduce((groups, cell) => {
    const coordinate = Math.round(cell[key]);
    groups.set(coordinate, [...(groups.get(coordinate) || []), cell]);
    return groups;
  }, new Map());
  const rows = groupByPixel("top");
  const columns = groupByPixel("left");
  assert.equal(rows.size, 3, "The matrix has exactly three rendered row tops.");
  assert.equal(columns.size, 3, "The matrix has exactly three rendered column lefts.");
  assert.ok([...rows.values()].every(row => row.length === 3));
  assert.ok([...columns.values()].every(column => column.length === 3));
  assert.ok(Math.max(...flatCells.map(cell => cell.width))
    - Math.min(...flatCells.map(cell => cell.width)) <= 1,
  "Every matrix cell has the same rendered width.");
  assert.ok(Math.max(...flatCells.map(cell => cell.height))
    - Math.min(...flatCells.map(cell => cell.height)) <= 1,
  "Every matrix cell has the same rendered height.");
  for (let row = 0; row < 3; row += 1) {
    assert.ok(matrix.cells[row][0].x < matrix.cells[row][1].x
      && matrix.cells[row][1].x < matrix.cells[row][2].x,
    `Matrix row ${row + 1} follows QWE / ASD / RTF physical order.`);
  }
  for (let column = 0; column < 3; column += 1) {
    assert.ok(matrix.cells[0][column].y < matrix.cells[1][column].y
      && matrix.cells[1][column].y < matrix.cells[2][column].y,
    `Matrix column ${column + 1} follows QAR / WST / EDF physical order.`);
  }
  assert.equal(matrix.cells[2][1].id, "tag",
    "Tag physically occupies row 3, column 2.");
  assert.equal(await text("#tag-label"), "Tag as Pin");
  assert.match(await text("#tag-meta"), /^Current .* → Pin$/);
  assert.equal(await page.$eval("#tag", element => element.disabled), false,
    "Plain Tag is available without a Working Interval.");
  await page.hover("#tag");
  await settle(80);
  const pinTagPreview = await page.evaluate(() => ({
    pointHidden: document.getElementById("preview-current-marker").hidden,
    pointLeft: document.getElementById("preview-current-marker").style.left,
    currentLeft: document.getElementById("current-marker").style.left,
    intervalHidden: document.getElementById("action-preview-fill").hidden
  }));
  assert.deepEqual(pinTagPreview, {
    pointHidden: false,
    pointLeft: pinTagPreview.currentLeft,
    currentLeft: pinTagPreview.currentLeft,
    intervalHidden: true
  }, "Plain Tag previews Current as a point, never the Working Interval.");
  await page.mouse.move(0, 0);

  await page.click("#shift-layer-toggle");
  await settle(120);
  assert.equal(await text("#refine-backward-label"), "Local Refine Backward");
  assert.equal(await text("#refine-forward-label"), "Local Refine Forward");
  assert.equal(await text("#step-backward-label"), "Previous Pin");
  assert.equal(await text("#step-forward-label"), "Next Pin");
  assert.equal(await text("#tag-label"), "Tag as Section");
  assert.equal(await text("#tag-meta"), "No Working Interval");
  assert.equal(await page.$eval("#tag", element => element.disabled), true,
    "Shifted Tag refuses a missing Working Interval.");
  const shiftedMatrix = await page.evaluate(() => {
    const deck = document.querySelector(".navigation-deck").getBoundingClientRect();
    const cells = [...document.querySelector(".navigation-deck").children].map(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    return { width: deck.width, height: deck.height, cells };
  });
  assert.ok(Math.abs(shiftedMatrix.width - matrix.deck.width) <= 1
    && Math.abs(shiftedMatrix.height - matrix.deck.height) <= 1,
  "Shifted operator labels preserve the square matrix dimensions.");
  assert.ok(shiftedMatrix.cells.every((cell, index) =>
    Math.abs(cell.width - flatCells[index].width) <= 1
      && Math.abs(cell.height - flatCells[index].height) <= 1
  ), "Shifted labels do not resize a matrix cell.");
  await page.click("#shift-layer-toggle");
  await settle(80);
  await page.click("#guide-toggle");
  await settle(180);

  const centerAccess = await page.evaluate(() => {
    const player = document.querySelector(".center-player-wrap").getBoundingClientRect();
    const control = document.getElementById("center-transport-surface").getBoundingClientRect();
    const overlay = document.querySelector(".center-transport-overlay");
    const nativePoint = document.elementFromPoint(
      player.left + player.width * 0.18,
      player.bottom - Math.min(18, player.height * 0.08)
    );
    return {
      overlayPointerEvents: getComputedStyle(overlay).pointerEvents,
      controlFraction: (control.width * control.height) / (player.width * player.height),
      nativePointIsOverlay: nativePoint === overlay
        || nativePoint === document.getElementById("center-transport-surface")
        || document.getElementById("center-transport-surface").contains(nativePoint)
    };
  });
  assert.equal(centerAccess.overlayPointerEvents, "none");
  assert.ok(centerAccess.controlFraction < 0.08,
    "The parent Play control owns only its compact centered hit target.");
  assert.equal(centerAccess.nativePointIsOverlay, false,
    "The native control bar remains pointer-accessible while paused.");

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

  await page.click("#operator-toggle");
  await settle(120);
  assert.equal(await text("#tag-label"), "Tag as Pin",
    "An Interval never changes the plain Tag grammar.");
  await page.click("#shift-layer-toggle");
  await settle(80);
  assert.equal(await text("#tag-label"), "Tag as Section");
  assert.match(await text("#tag-meta"), /→ Section$/);
  assert.equal(await page.$eval("#tag", element => element.disabled), false,
    "Shifted Tag becomes available for a positive Working Interval.");
  await page.hover("#tag");
  await settle(80);
  assert.equal(await page.$eval("#action-preview-fill", element => element.hidden), false,
    "Shifted Tag previews the Working Interval extent.");
  await page.mouse.move(0, 0);
  await page.click("#shift-layer-toggle");
  await page.click("#guide-toggle");
  await settle(120);

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
  // The state that matters is the deliberate one. A Guide left open returns
  // open because wide happens to default open, which proves nothing; a Guide
  // deliberately closed must still be closed after a round trip.
  const guideOpen = () => page.getAttribute("#guide-toggle", "aria-expanded");
  const setGuide = async open => {
    if ((await guideOpen()) !== String(open)) {
      await page.click("#guide-toggle");
      await settle(150);
    }
  };
  const roundTrip = async () => {
    await page.setViewportSize({ width: 600, height: 900 });
    await settle(200);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await settle(200);
  };

  await setGuide(false);
  assert.equal(await guideOpen(), "false");
  await roundTrip();
  assert.equal(await guideOpen(), "false",
    "A Guide deliberately closed stays closed across a breakpoint round trip.");

  await setGuide(true);
  await roundTrip();
  assert.equal(await guideOpen(), "true",
    "and one deliberately open stays open.");

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
  await setGuide(true);
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
  // 9. A side panel does not keep the map's keyboard
  // ============================================================================
  // Whether a key belongs to the map was decided by the focused element's tag,
  // and INPUT, SELECT and TEXTAREA all counted. So a checkbox — which cannot
  // receive a character — swallowed every operator, and a <select> kept them
  // for as long as it held focus, which is until the reader clicks elsewhere:
  // it survives the rebuild its own edit causes. Setting a Section's Weight
  // silently disarmed the whole map, with nothing on screen to say why.
  //
  // The question is what the control does with the key, and only text can be
  // typed into. This needs a real focus model and real controls, so it can only
  // be asked here.
  const bypassState = () => page.getAttribute("#deformation-toggle", "aria-pressed");
  const weightSelect = await page.$("#sections-list [data-section-weight]");
  if (weightSelect) {
    const beforeCommit = await bypassState();
    await weightSelect.selectOption("2");
    await settle(500);
    await page.keyboard.press("x");
    await settle(250);
    assert.notEqual(await bypassState(), beforeCommit,
      "A committed Weight selection leaves the map's hotkeys alive.");
    await page.keyboard.press("x");
    await settle(250);

    // Space still opens the list rather than starting playback behind it: a
    // <select> gives up the letters it was hoarding, not the key it acts on.
    await (await page.$("#sections-list [data-section-weight]")).focus();
    const transportBeforeList = await text("#field-transport-state");
    await page.keyboard.press("Space");
    await settle(300);
    assert.equal(await text("#field-transport-state"), transportBeforeList,
      "Space on a focused selector belongs to the selector, not to playback.");
    await page.keyboard.press("Escape");
    await settle(250);
  }

  const visibility = await page.$("#sections-list input[type=checkbox]");
  if (visibility) {
    await visibility.focus();
    const beforeBox = await bypassState();
    await page.keyboard.press("x");
    await settle(250);
    assert.notEqual(await bypassState(), beforeBox,
      "A focused checkbox does not take a letter it cannot receive.");
    await page.keyboard.press("x");
    await settle(250);

    // It keeps Space, though: that is the one key it does answer to.
    const drawnBefore = await page.getAttribute("#sections-list input[type=checkbox]", "checked");
    const transportHeld = await text("#field-transport-state");
    await page.keyboard.press("Space");
    await settle(300);
    assert.equal(await text("#field-transport-state"), transportHeld,
      "and Space still belongs to the control, not to playback behind it.");
    if (drawnBefore !== null) await page.keyboard.press("Space");
    await settle(250);
  }

  const addressInput = await page.$("#sections-list [data-address-input]");
  if (addressInput) {
    await addressInput.focus();
    const beforeTyping = await bypassState();
    await page.keyboard.press("x");
    await settle(250);
    assert.equal(await bypassState(), beforeTyping,
      "A field the reader is typing into does keep the key.");
    // Escape hands the keyboard back without reaching for the pointer. This
    // used to throw out of the rebuild: replacing the focused node fired
    // `focusout` synchronously, and answering that with another render left the
    // outer pass holding children the inner pass had already discarded.
    await page.keyboard.press("Escape");
    await settle(250);
    await page.keyboard.press("x");
    await settle(250);
    assert.notEqual(await bypassState(), beforeTyping,
      "and Escape gives it back.");
    await page.keyboard.press("x");
    await settle(250);
  }

  // ============================================================================
  // 10. Nothing logged an error along the way
  // ============================================================================
  assert.deepEqual(failures, [],
    "The whole session runs without a page error or console error.");

  // Layout faults that only exist at a real viewport, each measured before it was
// fixed: a third Guide tab stranded on its own row; the controls rail hiding
// 1062px of expanded Parameters with no way to scroll to them; and the rail's
// min-height, distributed across the two rows it spans, pushing the Timeline
// 310px away from the viewer on a short window.
for (const [width, height] of [[1920, 1080], [1600, 720]]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(250);

  const tabRows = await page.evaluate(() => new Set(
    [...document.querySelector(".guide-tabs").children]
      .map(tab => Math.round(tab.getBoundingClientRect().top))
  ).size);
  assert.equal(tabRows, 1, `Every Guide tab shares one row at ${width}x${height}.`);

  const gap = await page.evaluate(() => {
    const status = document.getElementById("status").getBoundingClientRect();
    const timeline = document.getElementById("timeline-panel").getBoundingClientRect();
    return Math.round(timeline.top - status.bottom);
  });
  assert.ok(gap >= 0 && gap <= 40,
    `The Timeline sits directly under the viewer at ${width}x${height}, not ${gap}px away.`);

  await page.click("#operator-toggle");
  await page.waitForTimeout(200);
  const reachable = await page.evaluate(() => {
    document.querySelectorAll("#parameter-panel details").forEach(entry => { entry.open = true; });
    const rail = document.getElementById("command-workspace");
    const overflows = rail.scrollHeight > rail.clientHeight;
    const scrolls = ["auto", "scroll"].includes(getComputedStyle(rail).overflowY);
    const pageScrolls = document.documentElement.scrollHeight > window.innerHeight;
    return !overflows || scrolls || pageScrolls;
  });
  assert.ok(reachable,
    `Expanded Parameters must be reachable at ${width}x${height}, by the rail scrolling or the page.`);
  await page.click("#guide-toggle");
  await page.waitForTimeout(200);
}

console.log("Browser smoke passed: the physical QWE / ASD / RTF matrix is square with Tag at row 3 column 2 and remains stable under Shift; the centered parent Play control leaves native controls reachable; the app runs without error; a press lands on the Address drawn under it; focus and Space ownership remain exact; no reachable control is covered; responsive layouts do not overflow or change panel intent; dense structure stays bounded; Guide edits retain focus; a side panel keeps only the keys its controls can receive and hands the rest to the map; and compact controls remain reachable.");
} finally {
  await close();
}
