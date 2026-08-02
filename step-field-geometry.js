// Pure Step Field geometry, phase, and response-policy helpers.
import { EPSILON, clamp } from "./range-geometry.js";

export const STEP_FIELD_PHASE = Object.freeze({
  OFF: "off",
  COINCIDENT: "coincident",
  UNFOLDING: "unfolding",
  PARTIAL: "partially-held",
  HELD: "held",
  SUSPENDED: "suspended"
});

export const FIELD_REACH_TOLERANCE = 0.16;
// Retained only to migrate a legacy saved side-rate pair into one symmetric
// breathing rate. Nothing at runtime configures the two sides independently.
export const DEFAULT_FIELD_RESPONSE = Object.freeze({ tailRate: 0.5, leadRate: 2 });

// Field Breath: bounded expansion and contraction during ordinary Center
// playback. The relation is symmetric, so one breathing-rate pair is configured
// rather than two conceptually independent side rates.
export const BREATH_PHASE = Object.freeze({
  EXPANDING: "expanding",
  CONTRACTING: "contracting"
});

export const BREATH_RATE_STEPS = Object.freeze([0.25, 0.5, 0.75]);
export const DEFAULT_FIELD_BREATH = Object.freeze({
  inner: 2.5,
  outer: 10,
  rate: 0.5
});
const BREATH_BOUND_TOLERANCE = 0.02;

// The configured relation is 0 < x < y. A pair that collapses has no breath to
// describe, so the inner offset is pushed strictly inside the outer one rather
// than being accepted as equal.
export function normalizeFieldBreath(value = DEFAULT_FIELD_BREATH) {
  const rawOuter = Number(value?.outer);
  const outer = Number.isFinite(rawOuter) && rawOuter > 0
    ? rawOuter
    : DEFAULT_FIELD_BREATH.outer;
  const rawInner = Number(value?.inner);
  const requestedInner = Number.isFinite(rawInner) && rawInner > 0
    ? rawInner
    : DEFAULT_FIELD_BREATH.inner;
  const inner = requestedInner < outer ? requestedInner : outer / 2;
  const rawRate = Number(value?.rate);
  const rate = Number.isFinite(rawRate) && rawRate > 0 && rawRate < 1
    ? rawRate
    : DEFAULT_FIELD_BREATH.rate;
  return { inner, outer, rate };
}

// The configured value is the symmetric fractional spread around Center. The
// inward phase temporarily exchanges the two side multipliers without
// rewriting the saved relation.
export function breathRatePair(rate, centerRate = 1) {
  const normalized = normalizeFieldBreath({ rate }).rate;
  const center = Number.isFinite(centerRate) && centerRate > 0 ? centerRate : 1;
  return {
    center,
    tailRate: center * (1 - normalized),
    leadRate: center * (1 + normalized)
  };
}

export function breathRateFromResponse(response = DEFAULT_FIELD_RESPONSE) {
  const { tailRate, leadRate } = normalizeFieldResponse(response);
  const symmetric = ((1 - tailRate) + (leadRate - 1)) / 2;
  return BREATH_RATE_STEPS.reduce(
    (best, step) => (
      Math.abs(step - symmetric) < Math.abs(best - symmetric) ? step : best
    ),
    BREATH_RATE_STEPS[0]
  );
}

// Effective bounds are Range-clipped, but the minimum offset is a law, not a
// preference: Tail must stay at least x behind Center and Lead at least x ahead.
// A side with less room than x therefore cannot breathe at all. It is marked
// non-operational, excluded from the synchronization barrier, and parked at
// whatever room remains — the inner offset is never silently reduced.
export function effectiveBreathBounds(breath, available) {
  const { inner, outer } = normalizeFieldBreath(breath);
  const room = Number.isFinite(available) ? Math.max(0, available) : 0;
  const effectiveOuter = Math.min(outer, room);
  const operational = room >= inner - FIELD_REACH_TOLERANCE
    && effectiveOuter > inner - FIELD_REACH_TOLERANCE;
  return {
    inner,
    outer: effectiveOuter,
    // What the side may still display while it cannot breathe.
    parked: effectiveOuter,
    operational
  };
}

export function createBreathRuntime(breath = DEFAULT_FIELD_BREATH) {
  const { inner } = normalizeFieldBreath(breath);
  return {
    phase: BREATH_PHASE.EXPANDING,
    held: true,
    sides: {
      tail: { offset: inner, waiting: false },
      lead: { offset: inner, waiting: false }
    }
  };
}

// A held or boundary-waiting side runs at Center rate so it follows Center
// while preserving its attained offset.
export function breathSideRate({
  role,
  phase,
  rate,
  waiting = false,
  held = false,
  centerRate = 1
}) {
  const pair = breathRatePair(rate, centerRate);
  if (held || waiting) return pair.center;
  const outward = phase !== BREATH_PHASE.CONTRACTING;
  if (role === "tail") return outward ? pair.tailRate : pair.leadRate;
  return outward ? pair.leadRate : pair.tailRate;
}

function advanceSide(side, { phase, bounds, delta, operational }) {
  if (!operational) {
    // Unavailable, collapsed, hidden or Range-clipped sides are excluded from
    // the synchronization barrier entirely.
    return { offset: clamp(side.offset, 0, bounds.outer), waiting: false, excluded: true };
  }
  if (side.waiting) {
    return {
      offset: clamp(side.offset, bounds.inner, bounds.outer),
      waiting: true,
      excluded: false
    };
  }
  if (phase === BREATH_PHASE.EXPANDING) {
    const offset = Math.min(bounds.outer, side.offset + delta);
    const reached = offset >= bounds.outer - BREATH_BOUND_TOLERANCE;
    return {
      offset: reached ? bounds.outer : offset,
      waiting: reached,
      excluded: false
    };
  }
  const offset = Math.max(bounds.inner, side.offset - delta);
  const reached = offset <= bounds.inner + BREATH_BOUND_TOLERANCE;
  return {
    offset: reached ? bounds.inner : offset,
    waiting: reached,
    excluded: false
  };
}

// One breathing step. `centerDelta` is elapsed Center source time; the offset
// changes by the configured fractional spread over that source interval.
export function advanceBreath(runtime, {
  breath,
  centerDelta = 0,
  centerRate = 1,
  sides = {}
} = {}) {
  const configured = normalizeFieldBreath(breath);
  const state = runtime || createBreathRuntime(configured);
  const bounds = {
    tail: effectiveBreathBounds(configured, sides.tail?.available),
    lead: effectiveBreathBounds(configured, sides.lead?.available)
  };
  const operational = {
    tail: Boolean(sides.tail?.operational) && bounds.tail.operational,
    lead: Boolean(sides.lead?.operational) && bounds.lead.operational
  };
  const delta = state.held
    ? 0
    : Math.max(0, Number(centerDelta) || 0) * configured.rate;

  const next = {
    phase: state.phase,
    held: Boolean(state.held),
    sides: {}
  };
  for (const role of ["tail", "lead"]) {
    const advanced = state.held
      ? {
        offset: clamp(
          state.sides[role].offset,
          0,
          bounds[role].outer
        ),
        waiting: state.sides[role].waiting,
        excluded: !operational[role]
      }
      : advanceSide(state.sides[role], {
        phase: state.phase,
        bounds: bounds[role],
        delta,
        operational: operational[role]
      });
    next.sides[role] = { offset: advanced.offset, waiting: advanced.waiting };
    next.sides[role].excluded = advanced.excluded;
  }

  const participating = ["tail", "lead"].filter(role => operational[role]);
  const barrier = participating.length > 0
    && participating.every(role => next.sides[role].waiting);
  if (!state.held && barrier) {
    next.phase = state.phase === BREATH_PHASE.EXPANDING
      ? BREATH_PHASE.CONTRACTING
      : BREATH_PHASE.EXPANDING;
    for (const role of ["tail", "lead"]) next.sides[role].waiting = false;
  }

  for (const role of ["tail", "lead"]) {
    next.sides[role].bounds = bounds[role];
    next.sides[role].rate = breathSideRate({
      role,
      phase: next.phase,
      rate: configured.rate,
      waiting: next.sides[role].waiting || !operational[role],
      held: next.held,
      centerRate
    });
  }
  next.barrier = barrier;
  return next;
}

// Hold alone stops the cycle. It preserves each attained offset, sets every
// held side to Center rate, and preserves the breathing direction so Stretch
// resumes from the attained relation.
export function holdBreath(runtime, breath = DEFAULT_FIELD_BREATH) {
  const state = runtime || createBreathRuntime(breath);
  return {
    ...state,
    held: true,
    sides: {
      tail: { ...state.sides.tail, waiting: false },
      lead: { ...state.sides.lead, waiting: false }
    }
  };
}

export function resumeBreath(runtime, breath = DEFAULT_FIELD_BREATH) {
  const state = runtime || createBreathRuntime(breath);
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

export function deriveStepField(current, stepReach, range) {
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
  if (!enabled) return STEP_FIELD_PHASE.OFF;
  if (suspended) return STEP_FIELD_PHASE.SUSPENDED;
  const active = (sides || []).filter(side => side.visible && side.available);
  if (!active.length) return STEP_FIELD_PHASE.COINCIDENT;
  if (active.every(side => !(side.offset > FIELD_REACH_TOLERANCE))) return STEP_FIELD_PHASE.COINCIDENT;
  const held = active.filter(side => side.held).length;
  if (held === active.length) return STEP_FIELD_PHASE.HELD;
  if (held > 0) return STEP_FIELD_PHASE.PARTIAL;
  return STEP_FIELD_PHASE.UNFOLDING;
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
      held: spanAvailable && phase === STEP_FIELD_PHASE.HELD
    }
  };
}
