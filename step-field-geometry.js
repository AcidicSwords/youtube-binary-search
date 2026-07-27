import { EPSILON, clamp, stepTarget } from "./range-geometry.js";

export const STEP_FIELD_PHASE = Object.freeze({
  OFF: "off",
  COINCIDENT: "coincident",
  UNFOLDING: "unfolding",
  PARTIAL: "partially-held",
  HELD: "held",
  SUSPENDED: "suspended"
});

export const FIELD_REACH_TOLERANCE = 0.16;

export function deriveStepField(current, stepSeconds, range) {
  if (!Number.isFinite(current) || !Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new TypeError("Step Field requires a finite Current and positive Step size.");
  }
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new TypeError("Step Field requires a valid Range.");
  }

  const center = clamp(current, range.start, range.end);
  const tailTarget = stepTarget(center, stepSeconds, "backward", range);
  const leadTarget = stepTarget(center, stepSeconds, "forward", range);
  return {
    center,
    tail: {
      target: tailTarget,
      distance: center - tailTarget,
      available: tailTarget < center - EPSILON
    },
    lead: {
      target: leadTarget,
      distance: leadTarget - center,
      available: leadTarget > center + EPSILON
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
  const held = active.filter(side => side.held).length;
  if (held === active.length) return STEP_FIELD_PHASE.HELD;
  if (held > 0) return STEP_FIELD_PHASE.PARTIAL;
  if (active.some(side => side.offset > FIELD_REACH_TOLERANCE)) return STEP_FIELD_PHASE.UNFOLDING;
  return STEP_FIELD_PHASE.COINCIDENT;
}

export function sideActivationMode(side, phase) {
  if (!side?.visible || !side.available) return null;
  if (side.held && [STEP_FIELD_PHASE.HELD, STEP_FIELD_PHASE.PARTIAL].includes(phase)) return "step";
  if (side.offset > FIELD_REACH_TOLERANCE && Number.isFinite(side.address)) return "go";
  return null;
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
    center: { address: center },
    tail: {
      address: tail,
      target: targets.tail.target,
      targetDistance: targets.tail.distance,
      offset: tailOffset,
      available: targets.tail.available,
      visible: tailVisible,
      held: Boolean(tailHeld)
    },
    lead: {
      address: lead,
      target: targets.lead.target,
      targetDistance: targets.lead.distance,
      offset: leadOffset,
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
