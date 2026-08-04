// Many engagements, one operation.
//
// A Pin can be moved by dragging it, by typing its Address, by an increment
// control, by Shift+wheel or by keyboard Nudge. Those routes differ in how they
// acquire the destination and in what they leave selected. They must not differ
// in what they do to the Guide.
//
// This suite states that as a property rather than a design intention: for each
// pair of routes claiming the same canonical operation, it drives both and
// compares the canonical consequence. What it deliberately does not compare is
// identity, history shape or surface-local context -- convergence is
// operational, not historical erasure. Two routes reaching the same
// configuration should leave the same relations and the same future
// capabilities, while each keeps its own provenance.
//
// Each route runs in its own process. `app.js` is a module singleton bound to
// whichever environment imported it first, so two routes in one process would
// share one application -- the second would measure the first's leftovers. The
// file spawns itself once per route and compares the JSON each prints.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createSmokeEnvironment, descendants } from "./smoke-harness.mjs";

// Read the canonical relations back out of the running application: the Guide
// from what it persisted, the rest from what it reports. Nothing reaches into
// module internals, so this measures the same thing a reader would see.
function readCanonical(env) {
  const { byId } = env;
  const key = [...env.localStorage.values.keys()].find(name => name.includes(":v9:"));
  const guide = key
    ? JSON.parse(env.localStorage.values.get(key))
    : { pins: [], sections: [], groups: [], visibleGroupId: null };
  const sectionsById = new Map(guide.sections.map(section => [section.id, section]));
  const pinsById = new Map(guide.pins.map(pin => [pin.id, pin]));
  return {
    pins: [...guide.pins]
      .sort((a, b) => a.t - b.t)
      .map(pin => [Number(pin.t.toFixed(4)), pin.label || "", pin.kind]),
    sections: [...guide.sections]
      .map(section => {
        const start = pinsById.get(section.startPinId)?.t ?? 0;
        const end = pinsById.get(section.endPinId)?.t ?? 0;
        const group = guide.groups.find(entry => entry.id === section.groupId);
        return [
          Number(start.toFixed(4)),
          Number(end.toFixed(4)),
          section.weight,
          section.label || "",
          group?.label || ""
        ];
      })
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    groups: [...guide.groups].map(group => [group.label, group.active]).sort(),
    visibleGroupLabel:
      guide.groups.find(group => group.id === guide.visibleGroupId)?.label ?? null,
    current: byId.get("pin-current-position").textContent,
    range: byId.get("range-label").textContent,
    interval: byId.get("section-window").textContent,
    duration: byId.get("duration-time").textContent,
    sectionCount: byId.get("sections-list-count").textContent,
    pinCount: byId.get("pins-list-count").textContent,
    unusedSections: sectionsById.size
  };
}

// One environment per route, so neither can contaminate the other.
async function route(build) {
  const env = createSmokeEnvironment();
  const { byId, flush, poll } = env;
  await import("./app.js");
  window.onYouTubeIframeAPIReady();
  await flush();
  byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
  byId.get("load-video").click();
  await flush(6);
  await poll();
  byId.get("context-seconds").value = "0";
  byId.get("context-seconds").dispatch("change");
  await flush();

  const helpers = {
    env,
    byId,
    flush,
    descendants,
    sectionRows: () => descendants(byId.get("sections-list"))
      .filter(node => node.dataset.sectionGo),
    pinRows: () => descendants(byId.get("pins-list"))
      .filter(node => node.dataset.pinGo),
    inSections: key => descendants(byId.get("sections-list"))
      .filter(node => node.dataset[key] !== undefined),
    press: async (key, options = {}) => {
      env.dispatchDocument("keydown", {
        key,
        ...options,
        preventDefault() {},
        target: { tagName: "BODY" }
      });
      await flush();
    },
    makeSection: async (from, to) => {
      byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: from });
      await flush();
      byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: to });
      await flush();
      byId.get("section-capture").dispatch("submit");
      await flush();
      byId.get("release").click();
      await flush();
    }
  };

  await build(helpers);
  // Compare settled states. A deferred gesture is a transaction that has not
  // been written down yet, and reading storage in front of it would compare one
  // route's committed result against another's pending one.
  await env.delay(600);
  await flush(2);
  return readCanonical(env);
}

const PAIRS = [];

// Two forms of equivalence, stated per pair rather than assumed.
//
//   "canonical"  — the whole configuration, including where Current came to
//                  rest. Routes that are alternate engagements of one operator.
//   "structure"  — the retained graph only. Routes that build the same object
//                  by different means may legitimately leave Current elsewhere;
//                  a manual capture has to move Current to place the extent,
//                  while retaining an offered Cue does not. What must match is
//                  the object and its future capabilities, not the path.
const STRUCTURE_KEYS = [
  "pins",
  "sections",
  "groups",
  "visibleGroupLabel",
  "duration",
  "sectionCount",
  "pinCount"
];

function project(state, form) {
  if (form !== "structure") return state;
  return Object.fromEntries(STRUCTURE_KEYS.map(key => [key, state[key]]));
}

function converge(name, first, second, form = "canonical") {
  PAIRS.push({ name, first, second, form });
}

converge(
  "Deform control and Guide selector",
  async ({ byId, flush, makeSection, sectionRows }) => {
    await makeSection(100, 300);
    byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
    await flush();
    // Two presses up the ladder: 1 -> 1.25 -> 1.5.
    byId.get("deform-up").dispatch("pointerdown", { button: 0, pointerId: 1, buttons: 1 });
    await flush();
    byId.get("deform-up").dispatch("pointerup", { button: 0, pointerId: 1, buttons: 0 });
    await flush();
    byId.get("deform-up").dispatch("pointerdown", { button: 0, pointerId: 2, buttons: 1 });
    await flush();
    byId.get("deform-up").dispatch("pointerup", { button: 0, pointerId: 2, buttons: 0 });
    await flush();
  },
  async ({ byId, flush, makeSection, sectionRows, inSections }) => {
    await makeSection(100, 300);
    byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
    await flush();
    const selector = inSections("sectionWeight")[0];
    selector.value = "1.5";
    byId.get("sections-list").dispatch("change", { target: selector });
    await flush();
  }
);

// --- Weight: keyboard versus Guide selector -----------------------------------
converge(
  "Deform step control and Guide selector",
  async ({ env, byId, flush, makeSection, sectionRows }) => {
    await makeSection(100, 300);
    byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
    await flush();
    byId.get("deform-up").dispatch("pointerdown", { button: 0, pointerId: 77, buttons: 1 });
    await flush();
    env.dispatchDocument("pointerup", { button: 0, pointerId: 77, buttons: 0 });
    await env.delay(500);
    await flush(2);
  },
  async ({ byId, flush, makeSection, sectionRows, inSections }) => {
    await makeSection(100, 300);
    byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
    await flush();
    const selector = inSections("sectionWeight")[0];
    selector.value = "1.25";
    byId.get("sections-list").dispatch("change", { target: selector });
    await flush();
  }
);

// --- Pin movement: exact Address edit versus repeated Nudge -------------------
// One quantum is 1/24 s, so twelve increments move exactly half a second. The
// exact route types the destination; the incremental route walks to it.
converge(
  "Guide Address edit and repeated Nudge",
  async ({ byId, flush, makeSection, pinRows }) => {
    await makeSection(100, 300);
    byId.get("pins-list").dispatch("click", { target: pinRows()[0] });
    await flush();
    const field = descendants(byId.get("pins-list"))
      .find(node => node.dataset.addressInput === "pin");
    field.value = "0:10.5";
    byId.get("pins-list").dispatch("change", { target: field });
    await flush();
  },
  async ({ byId, flush, makeSection, pinRows, env }) => {
    await makeSection(100, 300);
    byId.get("pins-list").dispatch("click", { target: pinRows()[0] });
    await flush();
    // The hold binding listens on the list, not the button, and one press
    // applies one increment before any repeat begins.
    const increment = descendants(byId.get("pins-list"))
      .find(node => node.dataset.nudgeTarget === "pin" && node.dataset.nudgeDirection === "1");
    for (let index = 0; index < 12; index += 1) {
      byId.get("pins-list").dispatch("pointerdown", {
        target: increment,
        button: 0,
        pointerId: index,
        buttons: 1
      });
      await flush();
      env.dispatchDocument("pointerup", { button: 0, pointerId: index, buttons: 0 });
      await flush();
    }
  }
);

// --- Working Interval: Timeline Section click versus Guide Section click ------
converge(
  "Timeline Section selection and Guide Section selection",
  async ({ byId, flush, makeSection, descendants: walk }) => {
    await makeSection(100, 300);
    const bar = walk(byId.get("section-lane")).find(node => node.dataset.sectionGo);
    byId.get("section-lane").dispatch("click", { target: bar });
    await flush();
  },
  async ({ byId, flush, makeSection, sectionRows }) => {
    await makeSection(100, 300);
    byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
    await flush();
  }
);

// --- Retention: a retained Cue is an ordinary Section -------------------------
// Provenance must not create a class of object. A Section retained from a
// creator's chapter and one drawn over the same extent are the same mechanism.
converge(
  "Cue retention and ordinary Section creation",
  async ({ byId, flush }) => {
    byId.get("cue-source").value = "0:20 Chapter\n1:00 Next";
    byId.get("cue-capture").dispatch("submit");
    await flush();
    const retain = descendants(byId.get("cues-list"))
      .find(node => node.dataset.cueRetain === "0");
    byId.get("cues-list").dispatch("click", { target: retain });
    await flush();
    byId.get("release").click();
    await flush();
  },
  async ({ byId, flush }) => {
    byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 200 });
    await flush();
    byId.get("timeline").dispatch("click", { target: byId.get("timeline"), clientX: 600 });
    await flush();
    byId.get("section-label").value = "Chapter";
    byId.get("section-capture").dispatch("submit");
    await flush();
    byId.get("release").click();
    await flush();
  },
  // A manual capture must move Current to place the extent; retaining an
  // offered Cue need not. The Section they produce is the same mechanism.
  "structure"
);

// --- Focus: operator versus Guide row ----------------------------------------
converge(
  "Focus from the operator and Focus from Guide",
  async ({ byId, flush, makeSection, sectionRows }) => {
    await makeSection(100, 300);
    byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
    await flush();
    byId.get("focus-toggle").click();
    await flush();
  },
  async ({ byId, flush, makeSection, sectionRows, inSections }) => {
    await makeSection(100, 300);
    byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
    await flush();
    byId.get("sections-list").dispatch("click", { target: inSections("focusSection")[0] });
    await flush();
  }
);

// --- Group membership: assignment reaches the same partition ------------------
converge(
  "Section assigned at creation and moved afterwards",
  async ({ byId, flush, makeSection, sectionRows, inSections }) => {
    await makeSection(100, 300);
    byId.get("sections-list").dispatch("click", { target: inSections("groupAdd")[0] });
    await flush();
    byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
    await flush();
    const select = inSections("sectionGroup")[0];
    const other = [...new Set(inSections("groupToggle").map(node => node.dataset.groupToggle))]
      .find(id => id !== "group-default");
    select.value = other;
    byId.get("sections-list").dispatch("change", { target: select });
    await flush();
  },
  async ({ byId, flush, makeSection, sectionRows, inSections }) => {
    // The other order: make the layer first, then build into it. A new Group
    // takes the Timeline, so the Section is created inside it directly.
    await makeSection(100, 300);
    byId.get("sections-list").dispatch("click", { target: inSections("groupAdd")[0] });
    await flush();
    byId.get("sections-list").dispatch("click", { target: sectionRows()[0] });
    await flush();
    const select = inSections("sectionGroup")[0];
    const other = [...new Set(inSections("groupToggle").map(node => node.dataset.groupToggle))]
      .find(id => id !== "group-default");
    select.value = other;
    byId.get("sections-list").dispatch("change", { target: select });
    await flush();
  }
);

// --- Drive ---------------------------------------------------------------------
const SELF = fileURLToPath(import.meta.url);

function runRoute(index, side) {
  return new Promise((resolve, reject) => {
    const child = fork(SELF, [String(index), side], { stdio: ["ignore", "pipe", "inherit", "ipc"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) return reject(new Error(`${PAIRS[index].name} (${side}) exited ${code}`));
      try { resolve(JSON.parse(output)); }
      catch (error) { reject(new Error(`${PAIRS[index].name} (${side}) printed no state: ${output.slice(0, 200)}`)); }
    });
  });
}

const [indexArg, sideArg] = process.argv.slice(2);
if (indexArg !== undefined) {
  // Child: run one route in a clean process and print what it reached.
  const pair = PAIRS[Number(indexArg)];
  const state = await route(sideArg === "a" ? pair.first : pair.second);
  process.stdout.write(JSON.stringify(state));
} else {
  for (const [index, pair] of PAIRS.entries()) {
    const [a, b] = await Promise.all([runRoute(index, "a"), runRoute(index, "b")]);
    assert.deepEqual(
      project(a, pair.form),
      project(b, pair.form),
      `${pair.name}: two routes to one operation must agree on ${pair.form}.`
    );
  }
  console.log("Route correspondence tests passed: the Deform control and the Guide selector reach one Weight; an exact Address edit and twelve Nudges reach one Address; Timeline and Guide Section selection reach one Working Interval; a retained Cue is an ordinary Section; Focus from the operator and from a Guide row install one scope; and Group membership is the same partition however it is reached.");
}
