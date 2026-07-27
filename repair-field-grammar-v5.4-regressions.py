from pathlib import Path


def replace_once(path, before, after, label):
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor in {path}, found {count}")
    file.write_text(text.replace(before, after, 1), encoding="utf-8")


replace_once(
    "interaction-smoke.mjs",
    '''// Continue loops the active Range; Loop loops the current Interval.
byId.get("continue").click();
assert.equal(byId.get("continue-label").textContent, "Pause");
assert.equal(byId.get("continue")["aria-pressed"], "true");
fakePlayer.currentTime = 50;
intervalCallbacks[0]();
assert.equal(fakePlayer.currentTime, 25, "Continue must wrap Range End to Range Start.");
byId.get("continue").click();
assert.equal(byId.get("continue-label").textContent, "Continue");
assert.equal(
  byId.get("interval-label").textContent,
  "—",
  "Wrapped Continue must clear its non-contiguous Interval."
);
assert.equal(
  byId.get("loop").disabled,
  true,
  "Loop must be unavailable until a new contiguous Interval exists."
);''',
    '''// Continue traverses Range once; Loop is the sole repetition operator.
byId.get("continue").click();
assert.equal(byId.get("continue-label").textContent, "Pause");
assert.equal(byId.get("continue")["aria-pressed"], "true");
fakePlayer.currentTime = 50;
intervalCallbacks[0]();
assert.equal(fakePlayer.currentTime, 50, "Continue must settle at Range End without wrapping.");
assert.equal(byId.get("continue-label").textContent, "Continue");
assert.equal(byId.get("continue")["aria-pressed"], "false");
assert.match(
  byId.get("interval-label").textContent,
  /0:25\\.000–0:50\\.000/,
  "One-pass Continue must retain its contiguous movement Interval."
);
assert.equal(
  byId.get("loop").disabled,
  false,
  "Loop must be available for the settled Continue Interval."
);''',
    "one-pass Continue smoke",
)

replace_once(
    "interaction-smoke.mjs",
    '''// Establish a new contiguous Interval before testing Loop independently.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 375 });
assert.equal(byId.get("current-label").textContent, "0:37.500");
assert.match(byId.get("interval-label").textContent, /0:25\\.000–0:37\\.500/);''',
    '''// Establish a reverse contiguous Interval before testing Loop independently.
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 375 });
assert.equal(byId.get("current-label").textContent, "0:37.500");
assert.match(byId.get("interval-label").textContent, /0:37\\.500–0:50\\.000/);''',
    "post-Continue Interval smoke",
)

replace_once(
    "interaction-smoke.mjs",
    'assert.equal(fakePlayer.currentTime, 25, "Loop must restore the Interval start.");',
    'assert.equal(fakePlayer.currentTime, 37.5, "Loop must restore the active Interval start.");',
    "Loop start smoke",
)

replace_once(
    "context-smoke.mjs",
    '''fakePlayer.deferNextPlacement = true;
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
assert.equal(byId.get("current-label").textContent, "0:50.000", "Direct placement must commit semantic Current immediately.");
assert.equal(fakePlayer.currentTime, 0, "A delayed player placement may temporarily leave the physical Cursor behind.");
assert.equal(fakePlayer.pendingPlacement, 49, "Five-second Context should request one second of pre-roll.");
await delay();
assert.equal(byId.get("context-state").textContent, "0:49.000–0:54.000");
assert.equal(byId.get("context-label").textContent, "Stop Context");
assert.equal(byId.get("current-marker").style.left, "50%", "Semantic Current must remain fixed during Context.");
assert.equal(byId.get("cursor-marker").hidden, false);

intervalCallbacks[0]();
await delay();
assert.notEqual(byId.get("context-state").textContent, "5 s", "Context must not terminate against a stale pre-placement Cursor.");
fakePlayer.applyPendingPlacement();
intervalCallbacks[0]();
fakePlayer.currentTime = 54;
intervalCallbacks[0]();
await delay();
assert.equal(fakePlayer.currentTime, 50, "Context must return the physical playhead to semantic Current.");
assert.equal(byId.get("current-label").textContent, "0:50.000");
assert.equal(byId.get("cursor-marker").hidden, true, "Observation Cursor collapses back into Current when Context ends.");
assert.match(byId.get("interval-label").textContent, /0:00\\.000–0:50\\.000/, "Context must preserve the movement Interval.");''',
    '''fakePlayer.deferNextPlacement = true;
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 500 });
assert.equal(byId.get("current-label").textContent, "0:50.000", "Direct placement must commit semantic Current immediately.");
assert.equal(fakePlayer.currentTime, 0, "A delayed player placement may temporarily leave the physical Cursor behind.");
assert.equal(fakePlayer.pendingPlacement, 50, "A visible Field must suppress automatic Context and place the destination itself.");
assert.equal(byId.get("context-state").textContent, "5 s");
assert.equal(byId.get("context-label").textContent, "Context");
fakePlayer.applyPendingPlacement();
intervalCallbacks[0]();
await delay();
assert.equal(fakePlayer.currentTime, 50);

fakePlayer.deferNextPlacement = true;
byId.get("context-action").click();
assert.equal(fakePlayer.pendingPlacement, 49, "Explicit five-second Context should request one second of pre-roll.");
await delay();
assert.equal(byId.get("context-state").textContent, "0:49.000–0:54.000");
assert.equal(byId.get("context-label").textContent, "Stop Context");
assert.equal(byId.get("current-marker").style.left, "50%", "Semantic Current must remain fixed during Context.");
assert.equal(byId.get("cursor-marker").hidden, false);

intervalCallbacks[0]();
await delay();
assert.notEqual(byId.get("context-state").textContent, "5 s", "Context must not terminate against a stale pre-placement Cursor.");
fakePlayer.applyPendingPlacement();
intervalCallbacks[0]();
fakePlayer.currentTime = 54;
intervalCallbacks[0]();
await delay();
assert.equal(fakePlayer.currentTime, 50, "Context must return the physical playhead to semantic Current.");
assert.equal(byId.get("current-label").textContent, "0:50.000");
assert.equal(byId.get("cursor-marker").hidden, true, "Observation Cursor collapses back into Current when Context ends.");
assert.match(byId.get("interval-label").textContent, /0:00\\.000–0:50\\.000/, "Context must preserve the movement Interval.");''',
    "Field-visible explicit Context smoke",
)

replace_once(
    "context-smoke.mjs",
    '''byId.get("context-select").value = "5";
byId.get("context-select").dispatch("change");
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 750 });
assert.equal(byId.get("current-label").textContent, "1:15.000");
assert.equal(fakePlayer.currentTime, 74, "A new move must replace the previous Context without returning to the old anchor.");
await delay();
await delay();
assert.equal(byId.get("context-state").textContent, "1:14.000–1:19.000", "Delayed internal PAUSED events must not stop the replacement Context.");''',
    '''byId.get("context-select").value = "5";
byId.get("context-select").dispatch("change");
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 250 });
byId.get("context-action").click();
await delay();
byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 750 });
assert.equal(byId.get("current-label").textContent, "1:15.000");
assert.equal(fakePlayer.currentTime, 75, "A new move must stop explicit Context without returning to the old anchor.");
assert.equal(byId.get("context-label").textContent, "Context");
byId.get("context-action").click();
assert.equal(fakePlayer.currentTime, 74, "Explicit replacement Context must begin at its pre-roll Address.");
await delay();
await delay();
assert.equal(byId.get("context-state").textContent, "1:14.000–1:19.000", "Delayed internal PAUSED events must not stop explicit replacement Context.");''',
    "explicit Context replacement smoke",
)

replace_once(
    "context-smoke.mjs",
    'console.log("Context smoke passed: automatic observation, restoration, interruption, Return isolation, Off preference, delayed Loop startup, and startup Pause.");',
    'console.log("Context smoke passed: Field-visible suppression, explicit observation, restoration, interruption, Return isolation, Off preference, delayed Loop startup, and startup Pause.");',
    "Context smoke completion text",
)

print("Updated v5.4 interaction and Context regressions.")
