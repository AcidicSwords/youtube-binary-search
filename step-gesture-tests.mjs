import assert from "node:assert/strict";
import { createStepGestureController } from "./step-gesture.js";

function fakeScheduler() {
  let nextId = 1;
  const pending = new Map();
  return {
    schedule(callback, delay) {
      const id = nextId;
      nextId += 1;
      pending.set(id, { callback, delay });
      return id;
    },
    cancel(id) {
      pending.delete(id);
    },
    runNext() {
      const entry = pending.entries().next().value;
      if (!entry) return false;
      const [id, task] = entry;
      pending.delete(id);
      task.callback();
      return task.delay;
    },
    count() {
      return pending.size;
    }
  };
}

{
  const scheduler = fakeScheduler();
  const performed = [];
  const finished = [];
  const active = [];
  const controller = createStepGestureController({
    perform: (selection, detail) => {
      performed.push({ ...selection, ...detail });
      return true;
    },
    finish: detail => finished.push(detail),
    onActiveChange: detail => active.push(detail.active),
    schedule: scheduler.schedule,
    cancelScheduled: scheduler.cancel,
    initialDelayMs: 250,
    repeatMs: 100
  });

  assert.equal(
    controller.begin("keyboard:ArrowRight", () => ({ direction: "forward", distance: 10 })),
    true
  );
  assert.equal(
    controller.begin("keyboard:ArrowRight", () => ({ direction: "forward", distance: 10 })),
    false,
    "Browser repeat keydowns must not create extra application Steps."
  );
  assert.equal(performed.length, 1);
  assert.equal(scheduler.runNext(), 250);
  assert.equal(scheduler.runNext(), 100);
  assert.equal(performed.length, 3);
  assert.equal(controller.end("keyboard:ArrowRight"), true);
  assert.equal(scheduler.count(), 0);
  assert.deepEqual(active, [true, false]);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].repeats, 2);
  assert.equal(finished[0].defer, false);
}

{
  const scheduler = fakeScheduler();
  let remaining = 2;
  const performed = [];
  const finished = [];
  const controller = createStepGestureController({
    perform: selection => {
      performed.push(selection);
      remaining -= 1;
      return remaining >= 0;
    },
    finish: detail => finished.push(detail),
    schedule: scheduler.schedule,
    cancelScheduled: scheduler.cancel
  });

  controller.begin("pointer:forward", () => ({ direction: "forward", distance: 5 }));
  scheduler.runNext();
  scheduler.runNext();
  assert.equal(scheduler.count(), 0, "A Range boundary must stop repeat scheduling.");
  assert.equal(controller.isActive("pointer:forward"), true, "Release still owns final settlement.");
  controller.end("pointer:forward", { observe: false });
  assert.equal(finished.length, 1);
  assert.equal(finished[0].observe, false);
  assert.equal(performed.length, 3);
}

{
  const scheduler = fakeScheduler();
  const finishes = [];
  const controller = createStepGestureController({
    perform: () => true,
    finish: detail => finishes.push(detail),
    schedule: scheduler.schedule,
    cancelScheduled: scheduler.cancel
  });
  controller.begin("left", () => ({ direction: "backward", distance: 1 }));
  controller.begin("right", () => ({ direction: "forward", distance: 1 }));
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].id, "left");
  assert.equal(finishes[0].observe, false);
  assert.equal(finishes[0].effect, false);
  controller.cancel({ finalize: false });
  assert.equal(finishes.length, 1, "An outer action may take over finalization without duplicating it.");
}

console.log("Step gesture tests passed: deterministic hold repeat, release batching, boundary stop, and takeover.");
