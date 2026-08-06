// Pure Step Field geometry, phase, and response-policy helpers.
import { EPSILON, clamp } from "./range-geometry.js";
import { PANORAMA_SIDE_STEP } from "./transport.js";

export const PANORAMA_STATE = Object.freeze({
  OFF: "off",
  COINCIDENT: "coincident",
  UNFOLDING: "unfolding",
  PARTIAL: "partially-held",
  HELD: "held",
  SUSPENDED: "suspended"
});

export const FIELD_REACH_TOLERANCE = 0.16;
// Retained only to migrate a legacy saved side-rate pair into one symmetric
// cycling rate. Nothing at runtime configures the two sides independently.
export const DEFAULT_FIELD_RESPONSE = Object.freeze({ tailRate: 0.5, leadRate: 2 });

// Field Cycle: bounded expansion and contraction during ordinary Center
// playback. The relation is symmetric, so one cycling-rate pair is configured
// rather than two conceptually independent side rates.
export const PANORAMA_DIRECTION = Object.freeze({
  EXPANDING: "expanding",
  CONTRACTING: "contracting"
});

export const PANORAMA_SIDE_RATE_STEPS = Object.freeze([0.25, 0.5, 0.75]);
export const DEFAULT_PANORAMA_CYCLE = Object.freeze({
  inner: 0.25,
  outer: 2.5,
  rate: 0.25
});
const BREATH_BOUND_TOLERANCE = 0.02;

// The configured relation is 0 < x < y. A pair that collapses has no cycle to
// describe, so the inner offset is pushed strictly inside the outer one rather
// than being accepted as equal.
export function normalizePanoramaCycle(value = DEFAULT_PANORAMA_CYCLE) {
  const rawOuter = Number(value?.outer);
  const outer = Number.isFinite(rawOuter) && rawOuter > 0
    ? rawOuter
    : DEFAULT_PANORAMA_CYCLE.outer;
  const rawInner = Number(value?.inner);
  const requestedInner = Number.isFinite(rawInner) && rawInner > 0
    ? rawInner
    : DEFAULT_PANORAMA_CYCLE.inner;
  const inner = requestedInner < outer ? requestedInner : outer / 2;
  const rawRate = Number(value?.rate);
  const rate = Number.isFinite(rawRate) && rawRate > 0 && rawRate < 1
    ? rawRate
    : DEFAULT_PANORAMA_CYCLE.rate;
  return { inner, outer, rate };
}

// The sides sit one playback-rate step either side of Center, and the step is
// an interval on the ladder rather than a fraction of Center.
//
// This used to scale with Center — tail = C·(1−r), lead = C·(1+r) — which is
// identical at 1x and wrong everywhere else: the gap between Center and a side
// would grow with Center, so the cycle would open faster the faster you
// played, and the cycle would last a different number of seconds at every rate.
// Because the ladder is evenly spaced, an additive step keeps the difference
// fixed at exactly one rung, which is what makes the cycle take the same nine
// seconds at every Center rate the Panorama can hold.
export function panoramaSideRates(rate, centerRate = 1) {
  const step = normalizePanoramaCycle({ rate }).rate;
  const center = Number.isFinite(centerRate) && centerRate > 0 ? centerRate : 1;
  return {
    center,
    tailRate: Math.max(0, center - step),
    leadRate: center + step
  };
}

// Because a side differs from Center by exactly one rung, the offset between
// them opens at that many source-seconds per real second — whatever Center is
// doing. The cycle is therefore measured against the wall clock, not against
// elapsed Center source time.
export const BREATH_DRIFT_RATE = PANORAMA_SIDE_STEP;

// The phase is canonical state, not an accumulation.
//
// Three players free-running and a per-tick sum of their progress drifts apart:
// iframe latency, a rate the adapter has not confirmed yet, and a browser that
// stopped scheduling timers in a background tab all quietly change how far the
// sum thinks the cycle has travelled. Recording when the current leg began and
// where it began means the intended offset can be recomputed exactly at any
// later moment, and the players are corrected toward it rather than consulted
// about it.
//
// It also gives the transitions their meaning for free. A Weight bucket change
// touches nothing here, so the cycle keeps its phase and still reaches maximum
// at the moment it was always going to. Only a genuine discontinuity — Panorama
// returning after an extreme rate, or a Range wrap — restarts the leg.
export function panoramaTargetOffset({
  direction = PANORAMA_DIRECTION.EXPANDING,
  startedAt = 0,
  startingOffset = 0,
  inner = DEFAULT_PANORAMA_CYCLE.inner,
  outer = DEFAULT_PANORAMA_CYCLE.outer,
  now = startedAt,
  driftRate = BREATH_DRIFT_RATE
} = {}) {
  const span = outer - inner;
  if (!(span > 0)) {
    return { offset: clamp(startingOffset, 0, Math.max(0, outer)), direction };
  }
  const elapsed = Math.max(0, (Number(now) - Number(startedAt)) || 0) / 1000;
  const travelled = Math.max(0, Number(driftRate) || 0) * elapsed;
  const from = clamp(startingOffset, inner, outer) - inner;
  // Distance along one full out-and-back lap, measured from the inner turn.
  const entered = direction === PANORAMA_DIRECTION.CONTRACTING ? (2 * span) - from : from;
  const lap = 2 * span;
  const position = ((entered + travelled) % lap + lap) % lap;
  // A turn reports the direction it is heading in, not the one it arrived by.
  // Both bounds give the same offset either way, so only the direction is at
  // stake -- and a Field sitting exactly at its outer bound is about to come
  // back, which is what the side rates must be told. Reading the outer turn as
  // still expanding made a leg resumed from a fully attained Hold depend on
  // whether the resume and the next tick landed in the same millisecond.
  return position < span
    ? { offset: inner + position, direction: PANORAMA_DIRECTION.EXPANDING }
    : { offset: inner + (lap - position), direction: PANORAMA_DIRECTION.CONTRACTING };
}

export function sideRateStepFromResponse(response = DEFAULT_FIELD_RESPONSE) {
  const { tailRate, leadRate } = normalizeFieldResponse(response);
  const symmetric = ((1 - tailRate) + (leadRate - 1)) / 2;
  return PANORAMA_SIDE_RATE_STEPS.reduce(
    (best, step) => (
      Math.abs(step - symmetric) < Math.abs(best - symmetric) ? step : best
    ),
    PANORAMA_SIDE_RATE_STEPS[0]
  );
}

// Effective bounds are Range-clipped, but the minimum offset is a law, not a
// preference: Tail must stay at least x behind Center and Lead at least x ahead.
// A side with less room than x therefore cannot cycle at all. It is marked
// non-operational, excluded from the synchronization barrier, and parked at
// whatever room remains — the inner offset is never silently reduced.
export function effectiveCycleBounds(cycle, available) {
  const { inner, outer } = normalizePanoramaCycle(cycle);
  const room = Number.isFinite(available) ? Math.max(0, available) : 0;
  const effectiveOuter = Math.min(outer, room);
  const operational = room >= inner - FIELD_REACH_TOLERANCE
    && effectiveOuter > inner - FIELD_REACH_TOLERANCE;
  return {
    inner,
    outer: effectiveOuter,
    // What the side may still display while it cannot cycle.
    parked: effectiveOuter,
    operational
  };
}

export function createPanoramaCycle(cycle = DEFAULT_PANORAMA_CYCLE, startedAt = 0) {
  const { inner } = normalizePanoramaCycle(cycle);
  return {
    phase: PANORAMA_DIRECTION.EXPANDING,
    held: true,
    startedAt,
    startingOffset: inner,
    offset: inner,
    sides: {
      tail: { offset: inner, waiting: false },
      lead: { offset: inner, waiting: false }
    }
  };
}

// A discontinuity: the source itself has jumped, or the Panorama is returning
// after Center played alone at an extreme rate and the sides hold positions that
// no longer relate to anything. Begin a fresh leg at the inner offset rather
// than restoring a stale relation.
export function restartPanoramaCycle(runtime, cycle = DEFAULT_PANORAMA_CYCLE, startedAt = 0) {
  const fresh = createPanoramaCycle(cycle, startedAt);
  return { ...fresh, held: Boolean(runtime?.held) };
}

// Holding rebases the leg onto the offset actually attained, so resuming
// continues from the relation on screen rather than from where an unheld cycle
// would have arrived.
export function rebasePanoramaCycle(runtime, startedAt = 0, startingOffset = null) {
  if (!runtime) return runtime;
  // The relation on screen is the one to continue from. A caller that knows
  // what the sides actually attained -- Hold and Stretch both do -- says so;
  // otherwise the phase's own last derived offset stands.
  const attained = Number.isFinite(startingOffset)
    ? startingOffset
    : Number.isFinite(runtime.offset)
      ? runtime.offset
      : runtime.startingOffset;
  return { ...runtime, startedAt, startingOffset: attained, offset: attained };
}

// A held or boundary-waiting side runs at Center rate so it follows Center
// while preserving its attained offset.
export function panoramaSideRate({
  role,
  phase,
  rate,
  waiting = false,
  held = false,
  centerRate = 1
}) {
  const pair = panoramaSideRates(rate, centerRate);
  if (held || waiting) return pair.center;
  const outward = phase !== PANORAMA_DIRECTION.CONTRACTING;
  if (role === "tail") return outward ? pair.tailRate : pair.leadRate;
  return outward ? pair.leadRate : pair.tailRate;
}

// Both sides share one offset, so they arrive at the bounds together by
// construction rather than by waiting for each other at a barrier. A side with
// no room is parked at whatever it has and excluded; it does not hold the other
// side back, and it does not stop the phase.
function sideAtOffset(offset, bounds, operational) {
  if (!operational) {
    return { offset: clamp(offset, 0, bounds.outer), waiting: false, excluded: true };
  }
  // A side "waits" only when it cannot follow the shared cycle -- its own
  // Range-clipped bound is nearer than the offset the phase is asking for. It
  // then sits at that bound and runs at Center rate. Being at the inner offset
  // is not waiting: that is simply where every leg begins.
  const held = clamp(offset, bounds.inner, bounds.outer);
  return {
    offset: held,
    waiting: Math.abs(held - offset) > BREATH_BOUND_TOLERANCE,
    excluded: false
  };
}

// One cycling step. The offset is derived from the shared phase against the
// wall clock, then clamped into each side's own Range-clipped bounds.
//
// It used to be accumulated: each tick added `centerDelta × rate`, where
// centerDelta is elapsed *Center source* time. That made the cycle speed
// proportional to the Center rate, so playing at 1.5x opened the Field half
// again as fast and a cycle lasted a different number of seconds at every rate.
// It also meant a tick that never ran — a background tab, a slow frame — was
// simply lost. Deriving from the phase fixes both: the drift is per real
// second, and a missed tick corrects itself on the next one.
export function advanceCycle(runtime, {
  cycle,
  now = 0,
  centerRate = 1,
  running = true,
  sides = {}
} = {}) {
  const configured = normalizePanoramaCycle(cycle);
  const state = runtime || createPanoramaCycle(configured, now);
  const bounds = {
    tail: effectiveCycleBounds(configured, sides.tail?.available),
    lead: effectiveCycleBounds(configured, sides.lead?.available)
  };
  const operational = {
    tail: Boolean(sides.tail?.operational) && bounds.tail.operational,
    lead: Boolean(sides.lead?.operational) && bounds.lead.operational
  };

  // The pair cycles as one relation, so the shared bound is the room the more
  // constrained operational side actually has.
  const participating = ["tail", "lead"].filter(role => operational[role]);
  const sharedOuter = participating.length
    ? Math.min(...participating.map(role => bounds[role].outer))
    : configured.outer;

  const frozen = state.held || !running;
  const derived = frozen
    ? {
      offset: clamp(
        Number.isFinite(state.offset) ? state.offset : configured.inner,
        0,
        Math.max(configured.inner, sharedOuter)
      ),
      direction: state.phase
    }
    : panoramaTargetOffset({
      direction: state.phase,
      startedAt: state.startedAt,
      startingOffset: state.startingOffset,
      inner: configured.inner,
      outer: sharedOuter,
      // The offset opens at exactly the rate difference between Center and a
      // side, which is the configured step. It is a constant only because the
      // default step is; a reader who widens the step widens the drift with it.
      driftRate: configured.rate,
      now
    });

  const next = {
    phase: derived.direction,
    held: Boolean(state.held),
    startedAt: state.startedAt,
    startingOffset: state.startingOffset,
    offset: derived.offset,
    sides: {}
  };
  for (const role of ["tail", "lead"]) {
    // A frozen cycle governs nothing: each side keeps whatever relation it was
    // established or held at, which can be far wider than the cycling bounds
    // because Step geometry placed it. Only a running cycle shares one offset.
    const target = frozen
      ? (Number.isFinite(state.sides?.[role]?.offset)
        ? state.sides[role].offset
        : derived.offset)
      : derived.offset;
    const placed = frozen
      ? {
        offset: clamp(target, 0, Math.max(bounds[role].outer, target)),
        waiting: false,
        excluded: !operational[role]
      }
      : sideAtOffset(target, bounds[role], operational[role]);
    next.sides[role] = {
      offset: placed.offset,
      waiting: frozen ? false : placed.waiting,
      excluded: placed.excluded,
      bounds: bounds[role]
    };
    next.sides[role].rate = panoramaSideRate({
      role,
      phase: next.phase,
      rate: configured.rate,
      waiting: next.sides[role].waiting || !operational[role],
      held: next.held,
      centerRate
    });
  }
  next.barrier = !frozen
    && participating.length > 0
    && participating.every(role => next.sides[role].waiting);
  return next;
}

// Hold alone stops the cycle. It preserves each attained offset, sets every
// held side to Center rate, and preserves the cycling direction so Stretch
// resumes from the attained relation.
export function holdCycle(runtime, cycle = DEFAULT_PANORAMA_CYCLE) {
  const state = runtime || createPanoramaCycle(cycle);
  return {
    ...state,
    held: true,
    sides: {
      tail: { ...state.sides.tail, waiting: false },
      lead: { ...state.sides.lead, waiting: false }
    }
  };
}

export function resumeCycle(runtime, cycle = DEFAULT_PANORAMA_CYCLE) {
  const state = runtime || createPanoramaCycle(cycle);
  return { ...state, held: false };
}

function normalizeFieldResponse(value = DEFAULT_FIELD_RESPONSE) {
  const tailRate = Number(value?.tailRate);
  const leadRate = Number(value?.leadRate);
  return {
    tailRate: Number.isFinite(tailRate) && tailRate > 0 && tailRate < 1
      ? tailRate
      : DEFAULT_FIELD_RESPONSE.tailRate,
    leadRate: Number.isFinite(leadRate) && leadRate > 1
      ? leadRate
      : DEFAULT_FIELD_RESPONSE.leadRate
  };
}

export function normalizeFieldReach(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Step Field requires directional Reach.");
  }
  const backward = Number(value.backward);
  const forward = Number(value.forward);
  const linked = value.linked !== false;
  if (!(Number.isFinite(backward) && backward > 0 && Number.isFinite(forward) && forward > 0)) {
    throw new TypeError("Step Field requires positive backward and forward Reach.");
  }
  if (linked && Math.abs(backward - forward) > EPSILON) {
    throw new TypeError("Linked Step Field Reach must be equal in both directions.");
  }
  return { backward, forward, linked };
}

function validateFieldInputs(current, stepReach, range) {
  if (!Number.isFinite(current)) {
    throw new TypeError("Step Field requires a finite Current.");
  }
  normalizeFieldReach(stepReach);
  if (
    !range
    || !Number.isFinite(range.start)
    || !Number.isFinite(range.end)
    || range.end < range.start
  ) {
    throw new TypeError("Step Field requires a valid Range.");
  }
}

export function deriveFieldBounds({ current, stepReach, range }) {
  const requested = normalizeFieldReach(stepReach);
  validateFieldInputs(current, requested, range);

  const center = clamp(current, range.start, range.end);
  // Field offsets are physical source-time relations. Timeline weighting does
  // not alter Tail/Lead placement or Hold/Stretch measurement.
  const backwardTarget = Math.max(range.start, center - requested.backward);
  const forwardTarget = Math.min(range.end, center + requested.forward);
  const backwardReach = Math.max(0, center - backwardTarget);
  const forwardReach = Math.max(0, forwardTarget - center);
  const tailConstrained = backwardReach < requested.backward - EPSILON;
  const leadConstrained = forwardReach < requested.forward - EPSILON;

  return {
    current: center,
    requestedReach: requested,
    tail: {
      target: backwardTarget,
      reach: backwardReach,
      constrained: tailConstrained
    },
    lead: {
      target: forwardTarget,
      reach: forwardReach,
      constrained: leadConstrained
    },
    envelope: {
      start: backwardTarget,
      end: forwardTarget
    },
    constraint: tailConstrained && leadConstrained
      ? "both"
      : tailConstrained
        ? "start"
        : leadConstrained
          ? "end"
          : "none"
  };
}

export function derivePanorama(current, stepReach, range) {
  const bounds = deriveFieldBounds({ current, stepReach, range });
  return {
    center: bounds.current,
    requestedReach: bounds.requestedReach,
    constraint: bounds.constraint,
    envelope: bounds.envelope,
    tail: {
      target: bounds.tail.target,
      distance: bounds.tail.reach,
      reach: bounds.tail.reach,
      requestedReach: bounds.requestedReach.backward,
      constrained: bounds.tail.constrained,
      available: bounds.tail.reach > EPSILON
    },
    lead: {
      target: bounds.lead.target,
      distance: bounds.lead.reach,
      reach: bounds.lead.reach,
      requestedReach: bounds.requestedReach.forward,
      constrained: bounds.lead.constrained,
      available: bounds.lead.reach > EPSILON
    }
  };
}

export function chooseNearestRate(availableRates, requestedRate) {
  const rates = [...new Set(availableRates || [])]
    .filter(rate => Number.isFinite(rate) && rate > 0)
    .sort((a, b) => a - b);
  if (!rates.length) return 1;
  return rates.reduce((best, rate) => (
    Math.abs(rate - requestedRate) < Math.abs(best - requestedRate) ? rate : best
  ), rates[0]);
}

export function hasCenterDiscontinuity(previous, current, tolerance = 2.5) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return false;
  return current < previous - 0.75 || Math.abs(current - previous) > tolerance;
}

export function resolveFieldPhase({ enabled, suspended, sides }) {
  if (!enabled) return PANORAMA_STATE.OFF;
  if (suspended) return PANORAMA_STATE.SUSPENDED;
  const active = (sides || []).filter(side => side.visible && side.available);
  if (!active.length) return PANORAMA_STATE.COINCIDENT;
  if (active.every(side => !(side.offset > FIELD_REACH_TOLERANCE))) return PANORAMA_STATE.COINCIDENT;
  const held = active.filter(side => side.held).length;
  if (held === active.length) return PANORAMA_STATE.HELD;
  if (held > 0) return PANORAMA_STATE.PARTIAL;
  return PANORAMA_STATE.UNFOLDING;
}

export function deriveObservedField({
  targets,
  phase,
  centerAddress,
  tailAddress,
  leadAddress,
  tailVisible = true,
  leadVisible = true,
  tailHeld = false,
  leadHeld = false
}) {
  const center = Number.isFinite(centerAddress) ? centerAddress : targets.center;
  const tail = Number.isFinite(tailAddress) ? tailAddress : center;
  const lead = Number.isFinite(leadAddress) ? leadAddress : center;
  const tailOffset = Math.max(0, center - tail);
  const leadOffset = Math.max(0, lead - center);
  const tailActive = Boolean(tailVisible && targets.tail.available);
  const leadActive = Boolean(leadVisible && targets.lead.available);
  const spanAvailable = tailActive && leadActive && lead - tail > EPSILON;

  return {
    phase,
    constraint: targets.constraint || "none",
    envelope: targets.envelope || {
      start: targets.tail.target,
      end: targets.lead.target
    },
    center: { address: center },
    tail: {
      address: tail,
      target: targets.tail.target,
      requestedReach: targets.tail.requestedReach ?? targets.requestedReach ?? targets.tail.distance,
      effectiveReach: targets.tail.reach ?? targets.tail.distance,
      targetDistance: targets.tail.distance,
      offset: tailOffset,
      constrained: Boolean(targets.tail.constrained),
      available: targets.tail.available,
      visible: tailVisible,
      held: Boolean(tailHeld)
    },
    lead: {
      address: lead,
      target: targets.lead.target,
      requestedReach: targets.lead.requestedReach ?? targets.requestedReach ?? targets.lead.distance,
      effectiveReach: targets.lead.reach ?? targets.lead.distance,
      targetDistance: targets.lead.distance,
      offset: leadOffset,
      constrained: Boolean(targets.lead.constrained),
      available: targets.lead.available,
      visible: leadVisible,
      held: Boolean(leadHeld)
    },
    span: {
      start: tail,
      end: lead,
      duration: Math.max(0, lead - tail),
      available: spanAvailable,
      held: spanAvailable && phase === PANORAMA_STATE.HELD
    }
  };
}
