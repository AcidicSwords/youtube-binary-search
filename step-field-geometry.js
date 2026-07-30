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
export const DEFAULT_FIELD_RESPONSE = Object.freeze({ tailRate: 0.5, leadRate: 2 });

export function normalizeFieldResponse(value = DEFAULT_FIELD_RESPONSE) {
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

export function chooseDirectionalRate(availableRates, requestedRate, role) {
  const rates = [...new Set(availableRates || [])]
    .filter(rate => Number.isFinite(rate) && rate > 0)
    .filter(rate => role === "tail" ? rate < 1 : role === "lead" ? rate > 1 : rate === 1)
    .sort((a, b) => a - b);
  if (!rates.length) return null;
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
