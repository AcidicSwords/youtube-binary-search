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

print("Updated interaction smoke for one-pass Continue.")
