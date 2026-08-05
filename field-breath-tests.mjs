import assert from "node:assert/strict";
import {
  BREATH_PHASE,
  BREATH_RATE_STEPS,
  DEFAULT_FIELD_BREATH,
  normalizeFieldBreath,
  breathRatePair,
  breathTargetOffset,
  breathRateFromResponse,
  effectiveBreathBounds,
  createBreathRuntime,
  breathSideRate,
  advanceBreath,
  holdBreath,
  resumeBreath,
  rebaseBreath,
  restartBreath
} from "./step-field-geometry.js";

const breath = { inner: 2, outer: 10, rate: 0.5 };
const bothOperational = {
  tail: { operational: true, available: 1000 },
  lead: { operational: true, available: 1000 }
};

// The breath opens against the wall clock, so a step here is one real second
// rather than one second of elapsed Center source time. That is the whole point
// of the change: at 1.5x, a source second is not a second.
let clock = 0;
function run(runtime, steps, options = {}) {
  let state = runtime;
  const seen = [];
  for (let index = 0; index < steps; index += 1) {
    clock += (options.seconds ?? 1) * 1000;
    state = advanceBreath(state, {
      breath: options.breath || breath,
      now: clock,
      sides: options.sides || bothOperational
    });
    seen.push(state);
  }
  return { state, seen };
}
function begin(configured = breath) {
  const started = resumeBreath(createBreathRuntime(configured, clock), configured);
  return { ...started, startedAt: clock, startingOffset: configured.inner, offset: configured.inner };
}

// Configuration
{
  assert.deepEqual(
    DEFAULT_FIELD_BREATH,
    { inner: 0.25, outer: 2.5, rate: 0.25 },
    "The shipped Field is a conservative local horizon."
  );
  assert.deepEqual(
    breathRatePair(DEFAULT_FIELD_BREATH.rate),
    { center: 1, tailRate: 0.75, leadRate: 1.25 }
  );
  assert.deepEqual(normalizeFieldBreath({ inner: 3, outer: 12, rate: 0.25 }),
    { inner: 3, outer: 12, rate: 0.25 });
  assert.ok(normalizeFieldBreath({ inner: 30, outer: 12 }).inner < 12,
    "The inner offset can never reach or exceed the outer offset.");
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

  // The step either side of Center is an interval on the rate ladder, not a
  // fraction of Center. Scaling it -- tail = C(1-z), lead = C(1+z) -- is
  // identical at 1x and wrong everywhere else: the gap between Center and a side
  // would grow with Center, so the Field would open faster the faster you played
  // and a breath would last a different number of seconds at every rate.
  assert.deepEqual(breathRatePair(0.5, 2), { center: 2, tailRate: 1.5, leadRate: 2.5 },
    "Changing Center rate moves the whole relation without changing its size.");
  for (const centerRate of [0.5, 0.75, 1, 1.25, 1.5, 1.75]) {
    const pair = breathRatePair(0.25, centerRate);
    assert.ok(
      Math.abs((pair.center - pair.tailRate) - 0.25) < 1e-9
      && Math.abs((pair.leadRate - pair.center) - 0.25) < 1e-9,
      `Both sides stay exactly one step from Center at ${centerRate}x.`
    );
  }
  // Symmetry survives a Center rate too low to hold the step below it: Tail
  // floors at 0 rather than going backwards, which is the one asymmetry the
  // ladder can force and the reason such a Center has no Panorama triplet.
  const narrow = breathRatePair(0.75, 0.5);
  assert.equal(narrow.tailRate, 0, "A step wider than Center cannot reverse Tail.");
  assert.equal(narrow.leadRate, 1.25);
  const wide = breathRatePair(0.75, 2);
  assert.ok(Math.abs((wide.center - wide.tailRate) - (wide.leadRate - wide.center)) < 1e-9,
    "Wherever both sides fit, the relation stays symmetric about Center.");
  assert.equal(breathRateFromResponse({ tailRate: 0.5, leadRate: 2 }), 0.75);
  assert.equal(breathRateFromResponse({ tailRate: 0.75, leadRate: 1.25 }), 0.25);
}

// Range clipping never reduces the minimum offset. x is a law, not a preference.
{
  const clipped = effectiveBreathBounds(breath, 4);
  assert.deepEqual({ inner: clipped.inner, outer: clipped.outer }, { inner: 2, outer: 4 });
  assert.equal(clipped.operational, true, "Room for x and more than x is breathable.");

  const tooTight = effectiveBreathBounds(breath, 1);
  assert.equal(tooTight.inner, 2, "The configured inner offset is never silently reduced.");
  assert.equal(tooTight.operational, false,
    "A side with less room than x cannot preserve the minimum offset and must not breathe.");
  assert.equal(tooTight.parked, 1, "It still shows the frame its remaining room allows.");

  assert.equal(effectiveBreathBounds(breath, 0).operational, false);
  assert.equal(effectiveBreathBounds(breath, 1000).operational, true);
}

// 0 < inner < outer is enforced, never merely clamped to equality.
{
  const collapsed = normalizeFieldBreath({ inner: 10, outer: 10, rate: 0.5 });
  assert.ok(collapsed.inner < collapsed.outer,
    "A collapsed pair must be pushed strictly inside the outer offset.");
  assert.ok(collapsed.inner > 0);
  const inverted = normalizeFieldBreath({ inner: 30, outer: 12 });
  assert.ok(inverted.inner < inverted.outer && inverted.inner > 0);
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
  let state = begin();
  state = run(state, 0).state || state;
  assert.equal(state.startingOffset, 2, "Breathing starts at the inner boundary.");
  const expanded = run(state, 4);
  state = expanded.state;
  assert.equal(state.sides.tail.offset, 4, "Offset grows by the configured fractional spread.");
  assert.equal(state.phase, BREATH_PHASE.EXPANDING);

  const phases = [];
  for (let index = 0; index < 80; index += 1) {
    const previous = state.phase;
    clock += 1000;
    state = advanceBreath(state, { breath, now: clock, sides: bothOperational });
    if (state.phase !== previous) phases.push(state.phase);
  }
  assert.equal(phases[0], BREATH_PHASE.CONTRACTING,
    "Reaching the outer boundary on every operational side begins contraction.");
  assert.equal(phases[1], BREATH_PHASE.EXPANDING, "The cycle repeats: x → expand → y → contract → x.");
  assert.ok(phases.length >= 3, "Breathing continues until Hold is deliberately chosen.");
}

// A turn reports the direction it is heading in, not the one it arrived by
{
  // Resuming a leg that already stands at the outer bound, with no time yet
  // elapsed, is the exact case a Stretch after a fully attained Hold produces.
  // The Field is at its maximum, so the only thing it can do next is come back,
  // and that is what the side rates must be told. Reading it as still expanding
  // made the answer depend on whether the resume and the tick that followed it
  // landed in the same millisecond -- which is not a question the geometry is
  // allowed to have an opinion about.
  const atOuter = breathTargetOffset({
    direction: BREATH_PHASE.EXPANDING,
    startedAt: 5000,
    startingOffset: breath.outer,
    inner: breath.inner,
    outer: breath.outer,
    now: 5000,
    driftRate: breath.rate
  });
  assert.deepEqual(atOuter, { offset: breath.outer, direction: BREATH_PHASE.CONTRACTING });

  // The inner turn is the mirror of it, and already reads this way: a
  // contraction that has arrived turns outward.
  const atInner = breathTargetOffset({
    direction: BREATH_PHASE.CONTRACTING,
    startedAt: 5000,
    startingOffset: breath.inner,
    inner: breath.inner,
    outer: breath.outer,
    now: 5000,
    driftRate: breath.rate
  });
  assert.deepEqual(atInner, { offset: breath.inner, direction: BREATH_PHASE.EXPANDING });

  // Nothing between the turns changes: an ordinary outward leg is still outward
  // right up to the bound.
  const midway = breathTargetOffset({
    direction: BREATH_PHASE.EXPANDING,
    startedAt: 0,
    startingOffset: breath.inner,
    inner: breath.inner,
    outer: breath.outer,
    now: 15000,
    driftRate: breath.rate
  });
  assert.deepEqual(midway, { offset: 9.5, direction: BREATH_PHASE.EXPANDING });
}

// Offsets always remain inside the effective bounds and never cross Center
{
  let state = begin();
  for (let index = 0; index < 400; index += 1) {
    clock += 700;
    state = advanceBreath(state, { breath, now: clock, sides: bothOperational });
    for (const role of ["tail", "lead"]) {
      assert.ok(state.sides[role].offset >= breath.inner - 1e-9,
        "Breathing must never reach or cross Center.");
      assert.ok(state.sides[role].offset <= breath.outer + 1e-9,
        "Breathing must stay within the configured outer offset.");
    }
  }
}

// A clipped side lowers the shared bound; it does not desynchronize the pair
{
  // Tail has room for x but not for y. The Field breathes as one relation, so
  // the pair turns around at the room the more constrained side actually has.
  // Letting the unclipped side run on to its own bound -- which is what a
  // per-side barrier did -- would leave Tail and Lead unequally displaced from
  // Center, which is the one relation the Panorama exists to hold.
  const asymmetric = {
    tail: { operational: true, available: 4 },
    lead: { operational: true, available: 1000 }
  };
  let state = begin();
  state = run(state, 4, { sides: asymmetric }).state;
  assert.equal(state.sides.tail.offset, 4, "A clipped side clamps exactly to its effective outer bound.");
  assert.equal(state.sides.lead.offset, 4,
    "and the unclipped side turns with it, so the two stay symmetric.");
  state = run(state, 1, { sides: asymmetric }).state;
  assert.equal(state.phase, BREATH_PHASE.CONTRACTING,
    "The shared bound is the clipped one, so contraction begins there.");

  let contracted = state;
  for (let index = 0; index < 12; index += 1) {
    clock += 1000;
    contracted = advanceBreath(contracted, { breath, now: clock, sides: asymmetric });
  }
  assert.equal(contracted.sides.tail.offset, contracted.sides.lead.offset,
    "Both sides remain equally displaced from Center throughout.");
}

// Sides that cannot hold the minimum offset are excluded from the barrier
{
  const oneSided = {
    // Room for less than x: excluded by the law, not by visibility.
    tail: { operational: true, available: 1 },
    lead: { operational: true, available: 1000 }
  };
  let state = begin();
  state = run(state, 30, { sides: oneSided }).state;
  assert.equal(state.phase, BREATH_PHASE.CONTRACTING,
    "A dormant side must not stall the Field at its outer boundary.");
  assert.equal(state.sides.tail.excluded, true,
    "A side without room for the configured inner offset must not stall the Field.");
}

// Hold preserves the attained relation and the resumption direction
{
  let state = begin();
  state = run(state, 6).state;
  const attained = state.sides.lead.offset;
  assert.ok(attained > breath.inner && attained < breath.outer, "Hold is taken mid-breath.");
  const held = holdBreath(state, breath);
  assert.equal(held.held, true);
  clock += 5000;
  const stillHeld = advanceBreath(held, { breath, now: clock, sides: bothOperational });
  assert.equal(stillHeld.sides.lead.offset, attained, "Hold preserves each attained offset.");
  assert.equal(stillHeld.sides.tail.rate, 1, "Every held side runs at Center rate.");
  assert.equal(stillHeld.phase, BREATH_PHASE.EXPANDING, "Hold preserves the breathing direction.");

  // Resuming rebases the leg onto the relation actually on screen, so the held
  // seconds cost nothing: the breath continues from where it stopped.
  const restarted = rebaseBreath(resumeBreath(stillHeld, breath), clock, attained);
  clock += 1000;
  const resumed = advanceBreath(restarted, { breath, now: clock, sides: bothOperational });
  assert.ok(resumed.sides.lead.offset > attained, "Stretch resumes from the attained relation.");
}

// Contraction direction is preserved across a Hold as well
{
  let state = begin();
  while (state.phase === BREATH_PHASE.EXPANDING) {
    clock += 1000;
    state = advanceBreath(state, { breath, now: clock, sides: bothOperational });
  }
  state = run(state, 2).state;
  assert.equal(state.phase, BREATH_PHASE.CONTRACTING);
  const held = holdBreath(state, breath);
  const restarted = rebaseBreath(
    resumeBreath(held, breath), clock, state.sides.tail.offset
  );
  clock += 1000;
  const resumed = advanceBreath(restarted, { breath, now: clock, sides: bothOperational });
  assert.equal(resumed.phase, BREATH_PHASE.CONTRACTING);
  assert.ok(resumed.sides.tail.offset < state.sides.tail.offset);
}

// A resumption must command the rates of the phase it is actually in. Using the
// outward pair unconditionally contradicts a preserved contracting phase.
{
  let state = begin();
  while (state.phase === BREATH_PHASE.EXPANDING) {
    clock += 1000;
    state = advanceBreath(state, { breath, now: clock, sides: bothOperational });
  }
  assert.equal(state.phase, BREATH_PHASE.CONTRACTING);
  for (const role of ["tail", "lead"]) {
    const resumed = breathSideRate({
      role,
      phase: state.phase,
      rate: breath.rate,
      waiting: state.sides[role].waiting,
      held: false
    });
    const outward = breathSideRate({
      role,
      phase: BREATH_PHASE.EXPANDING,
      rate: breath.rate
    });
    assert.notEqual(resumed, outward,
      `Resuming a contracting ${role} must not command the outward rate.`);
  }
  assert.equal(
    breathSideRate({ role: "tail", phase: state.phase, rate: breath.rate }),
    1.5,
    "A contracting Tail catches Center."
  );
}

// A Weight bucket change is not a discontinuity
{
  // Center crossing into another Weight bucket changes the triplet, and nothing
  // else. The sides still differ from Center by one rung, so the offset still
  // opens at the same speed and still reaches maximum at the moment it was
  // always going to. Restarting here -- which a per-rate breath would have to do
  // -- would make the Field twitch at every Section boundary.
  clock = 0;
  let state = begin();
  state = run(state, 4).state;                       // four real seconds in
  const midOffset = state.sides.tail.offset;
  const deadline = state.startedAt + ((breath.outer - breath.inner) / breath.rate) * 1000;
  assert.ok(midOffset > breath.inner && midOffset < breath.outer, "Taken mid-breath.");

  // The bucket changes: Center moves 1x -> 0.75x -> 1.25x. Nothing touches the
  // phase, so the same call with a different centerRate continues the same leg.
  for (const centerRate of [0.75, 1.25]) {
    clock += 1000;
    const before = state;
    state = advanceBreath(state, { breath, now: clock, centerRate, sides: bothOperational });
    assert.equal(state.startedAt, before.startedAt, "The leg is not restarted.");
    assert.equal(state.startingOffset, before.startingOffset, "nor rebased.");
    assert.equal(state.phase, BREATH_PHASE.EXPANDING, "and it keeps its direction.");
    assert.ok(state.sides.tail.offset > before.sides.tail.offset,
      "The offset continues from where it was.");
    assert.equal(state.sides.tail.offset, state.sides.lead.offset,
      "Both sides remain symmetric across the change.");
    // The sides still sit exactly one rung either side of the new Center.
    assert.ok(Math.abs((centerRate - state.sides.tail.rate) - breath.rate) < 1e-9);
    assert.ok(Math.abs((state.sides.lead.rate - centerRate) - breath.rate) < 1e-9);
  }

  // The originally scheduled arrival is unchanged by either crossing.
  clock = deadline;
  state = advanceBreath(state, { breath, now: clock, centerRate: 1.25, sides: bothOperational });
  assert.equal(state.sides.tail.offset, breath.outer,
    "Maximum arrives when it was always going to, whatever the buckets did.");
}

// Panorama returning after an extreme rate begins again at the inner offset
{
  // While Center plays alone the sides hold positions that stop describing
  // anything. Restoring that stale relation would put Tail and Lead somewhere
  // unrelated to Center; a fresh inner-offset leg keeps all three locally
  // related. This is the only resumption that discards phase.
  clock = 0;
  let state = begin();
  state = run(state, 6).state;
  assert.ok(state.sides.tail.offset > breath.inner, "The Field was open when Panorama was lost.");
  // The leg it was on genuinely started somewhere other than the inner offset,
  // so a restart is something that can be observed rather than assumed.
  state = rebaseBreath(state, clock, state.sides.tail.offset);
  assert.ok(state.startingOffset > breath.inner);

  clock += 30000;
  const resumed = restartBreath(state, breath, clock);
  assert.equal(resumed.startingOffset, breath.inner, "It resumes at the inner offset,");
  assert.equal(resumed.startedAt, clock, "on a fresh leg,");
  assert.equal(resumed.phase, BREATH_PHASE.EXPANDING, "expanding outward.");

  clock += ((breath.outer - breath.inner) / breath.rate) * 1000;
  const reopened = advanceBreath(resumed, { breath, now: clock, sides: bothOperational });
  assert.equal(reopened.sides.tail.offset, breath.outer,
    "and takes the full outward duration from there, exactly as any other leg.");
}

console.log("Field Breath tests passed: one-rung side steps that keep the breath the same length at every Center rate, a wall-clock phase, turns that report the direction they are heading in, bounded expansion/contraction, Range clipping that lowers the shared bound rather than desynchronizing the pair, exclusion, deliberate Hold, phase-aware resumption, Weight-bucket crossings that keep both phase and deadline, and a fresh inner-offset leg when Panorama returns.");
