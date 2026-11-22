// Budget policy for future autonomous workers. No provider calls in this module.
// A monthly policy is not a guaranteed billing cap; use provider-side controls too.
export function validateBudgetPolicy(input) {
  if (!input || typeof input !== "object") throw Error("Missing policy");
  const { enabled, maxCallsPerDay, maxCallsPerMonth, maxEstimatedUsdPerMonth, worstCaseUsdPerCall } = input;
  if (enabled !== true && enabled !== false) throw Error("Invalid enabled flag");
  for (const value of [maxCallsPerDay,maxCallsPerMonth]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) throw Error("Invalid call quota");
  }
  for (const value of [maxEstimatedUsdPerMonth,worstCaseUsdPerCall]) {
    if (!Number.isFinite(value) || value < 0 || value > 10000) throw Error("Invalid spending limit");
  }
  return { enabled,maxCallsPerDay,maxCallsPerMonth,maxEstimatedUsdPerMonth,worstCaseUsdPerCall };
}
export function canReserveCall(policy, usage) {
  const p = validateBudgetPolicy(policy);
  if (!p.enabled || p.maxCallsPerDay === 0 || p.maxCallsPerMonth === 0 || p.worstCaseUsdPerCall <= 0) return false;
  if (!usage || !Number.isSafeInteger(usage.callsToday) || !Number.isSafeInteger(usage.callsThisMonth) || !Number.isFinite(usage.reservedEstimatedUsd)) return false;
  return usage.callsToday < p.maxCallsPerDay &&
    usage.callsThisMonth < p.maxCallsPerMonth &&
    usage.reservedEstimatedUsd + p.worstCaseUsdPerCall <= p.maxEstimatedUsdPerMonth;
}
