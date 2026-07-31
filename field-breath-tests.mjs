import assert from "node:assert/strict";
import {
  BREATH_PHASE,
  BREATH_RATE_STEPS,
  DEFAULT_FIELD_BREATH,
  normalizeFieldBreath,
  breathRatePair,
  breathRateFromResponse,
  effectiveBreathBounds,
  createBreathRuntime,
  breathSideRate,
  advanceBreath,
  holdBreath,
  resumeBreath
} from "./step-field-geometry.js";

const breath = { inner: 2, outer: 10, rate: 0.5 };
const bothOperational = {
  tail: { operational: true, available: 1000 },
  lead: { operational: true, available: 1000 }
};

function run(runtime, steps, options = {}) {
  let state = runtime;
  const seen = [];
  for (let index = 0; index < steps; index += 1) {
    state = advanceBreath(state, {
      breath: options.breath || breath,
      centerDelta: options.centerDelta ?? 1,
      sides: options.sides || bothOperational
    });
    seen.push(state);
  }
  return { state, seen };
}

// Configuration
{
  assert.deepEqual(normalizeFieldBreath({ inner: 3, outer: 12, rate: 0.25 }),
    { inner: 3, outer: 12, rate: 0.25 });
  assert.equal(normalizeFieldBreath({ inner: 30, outer: 12 }).inner, 12,
    "The inner offset can never exceed the outer offset.");
  assert.deepEqual(normalizeFieldBreath(null), DEFAULT_FIELD_BREATH);
  assert.equal(normalizeFieldBreath({ rate: 4 }).rate, DEFAULT_FIELD_BREATH.rate);

  // z < c < w with c − z = w − c
  for (const rate of BREATH_RATE_STEPS) {
    const pair = breathRatePair(rate);
    assert.ok(pair.tailRate < pair.center && pair.center < pair.leadRate);
    assert.ok(
      Math.abs((pair.center - pair.tailRate) - (pair.leadRate - pair.center)) < 1e-9,
      "The breathing rate pair must be symmetric about Center rate."
    );
  }
  assert.deepEqual(breathRatePair(0.25), { center: 1, tailRate: 0.75, leadRate: 1.25 });
  assert.equal(breathRateFromResponse({ tailRate: 0.5, leadRate: 2 }), 0.75);
  assert.equal(breathRateFromResponse({ tailRate: 0.75, leadRate: 1.25 }), 0.25);
}

// Range clipping
{
  const clipped = effectiveBreathBounds(breath, 4);
  assert.deepEqual({ inner: clipped.inner, outer: clipped.outer }, { inner: 2, outer: 4 });
  const tiny = effectiveBreathBounds(breath, 1);
  assert.deepEqual({ inner: tiny.inner, outer: tiny.outer }, { inner: 1, outer: 1 });
  assert.equal(effectiveBreathBounds(breath, 0).operational, false);
}

// Rate assignment per phase
{
  assert.equal(breathSideRate({ role: "tail", phase: BREATH_PHASE.EXPANDING, rate: 0.5 }), 0.5);
  assert.equal(breathSideRate({ role: "lead", phase: BREATH_PHASE.EXPANDING, rate: 0.5 }), 1.5);
  assert.equal(breathSideRate({ role: "tail", phase: BREATH_PHASE.CONTRACTING, rate: 0.5 }), 1.5,
    "Contraction exchanges the side rates so Tail catches Center.");
  assert.equal(breathSideRate({ role: "lead", phase: BREATH_PHASE.CONTRACTING, rate: 0.5 }), 0.5);
  assert.equal(breathSideRate({ role: "lead", phase: BREATH_PHASE.EXPANDING, rate: 0.5, waiting: true }), 1,
    "A side waiting at a breathing boundary runs at Center rate.");
  assert.equal(breathSideRate({ role: "tail", phase: BREATH_PHASE.EXPANDING, rate: 0.5, held: true }), 1);
}

// Expansion, barrier, contraction, and the full cycle
{
  let state = resumeBreath(createBreathRuntime(breath), breath);
  assert.equal(state.sides.tail.offset, 2, "Breathing starts at the inner boundary.");
  const expanded = run(state, 4);
  state = expanded.state;
  assert.equal(state.sides.tail.offset, 4, "Offset grows by the configured rate difference.");
  assert.equal(state.phase, BREATH_PHASE.EXPANDING);

  const phases = [];
  for (let index = 0; index < 80; index += 1) {
    const previous = state.phase;
    state = advanceBreath(state, { breath, centerDelta: 1, sides: bothOperational });
    if (state.phase !== previous) phases.push(state.phase);
  }
  assert.equal(phases[0], BREATH_PHASE.CONTRACTING,
    "Reaching the outer boundary on every operational side begins contraction.");
  assert.equal(phases[1], BREATH_PHASE.EXPANDING, "The cycle repeats: x → expand → y → contract → x.");
  assert.ok(phases.length >= 3, "Breathing continues until Hold is deliberately chosen.");
}

// Offsets always remain inside the effective bounds and never cross Center
{
  let state = resumeBreath(createBreathRuntime(breath), breath);
  for (let index = 0; index < 400; index += 1) {
    state = advanceBreath(state, { breath, centerDelta: 0.7, sides: bothOperational });
    for (const role of ["tail", "lead"]) {
      assert.ok(state.sides[role].offset >= breath.inner - 1e-9,
        "Breathing must never reach or cross Center.");
      assert.ok(state.sides[role].offset <= breath.outer + 1e-9,
        "Breathing must stay within the configured outer offset.");
    }
  }
}

// Asynchronous boundary waiting
{
  const asymmetric = {
    tail: { operational: true, available: 4 },
    lead: { operational: true, available: 1000 }
  };
  let state = resumeBreath(createBreathRuntime(breath), breath);
  state = run(state, 5, { sides: asymmetric }).state;
  assert.equal(state.sides.tail.offset, 4, "A clipped side clamps exactly to its effective outer bound.");
  assert.equal(state.sides.tail.waiting, true, "It then waits at the boundary.");
  assert.equal(state.sides.tail.rate, 1, "A waiting side follows Center at Center rate.");
  assert.equal(state.phase, BREATH_PHASE.EXPANDING,
    "Contraction waits for every operational side to arrive.");
  assert.ok(state.sides.lead.offset < 10);

  while (state.phase === BREATH_PHASE.EXPANDING) {
    state = advanceBreath(state, { breath, centerDelta: 1, sides: asymmetric });
  }
  assert.equal(state.phase, BREATH_PHASE.CONTRACTING);
  assert.equal(state.sides.lead.offset, 10,
    "Contraction begins only once the unclipped side has also arrived.");
  assert.equal(state.sides.tail.waiting, false, "Contraction releases every boundary waiter at once.");
}

// Sides that are not operational are excluded from the barrier
{
  const oneSided = {
    tail: { operational: false, available: 0 },
    lead: { operational: true, available: 1000 }
  };
  let state = resumeBreath(createBreathRuntime(breath), breath);
  state = run(state, 30, { sides: oneSided }).state;
  assert.equal(state.phase, BREATH_PHASE.CONTRACTING,
    "A dormant side must not stall the Field at its outer boundary.");
  assert.equal(state.sides.tail.excluded, true);
}

// Hold preserves the attained relation and the resumption direction
{
  let state = resumeBreath(createBreathRuntime(breath), breath);
  state = run(state, 6).state;
  const attained = state.sides.lead.offset;
  assert.ok(attained > breath.inner && attained < breath.outer, "Hold is taken mid-breath.");
  const held = holdBreath(state, breath);
  assert.equal(held.held, true);
  const stillHeld = advanceBreath(held, { breath, centerDelta: 5, sides: bothOperational });
  assert.equal(stillHeld.sides.lead.offset, attained, "Hold preserves each attained offset.");
  assert.equal(stillHeld.sides.tail.rate, 1, "Every held side runs at Center rate.");
  assert.equal(stillHeld.phase, BREATH_PHASE.EXPANDING, "Hold preserves the breathing direction.");

  const resumed = advanceBreath(resumeBreath(stillHeld, breath), {
    breath,
    centerDelta: 1,
    sides: bothOperational
  });
  assert.ok(resumed.sides.lead.offset > attained, "Stretch resumes from the attained relation.");
}

// Contraction direction is preserved across a Hold as well
{
  let state = resumeBreath(createBreathRuntime(breath), breath);
  while (state.phase === BREATH_PHASE.EXPANDING) {
    state = advanceBreath(state, { breath, centerDelta: 1, sides: bothOperational });
  }
  state = run(state, 2).state;
  assert.equal(state.phase, BREATH_PHASE.CONTRACTING);
  const held = holdBreath(state, breath);
  const resumed = advanceBreath(resumeBreath(held, breath), {
    breath,
    centerDelta: 1,
    sides: bothOperational
  });
  assert.equal(resumed.phase, BREATH_PHASE.CONTRACTING);
  assert.ok(resumed.sides.tail.offset < state.sides.tail.offset);
}

console.log("Field Breath tests passed: symmetric rate pair, bounded expansion/contraction, Range clipping, asynchronous boundary waiting, exclusion, and deliberate Hold.");
