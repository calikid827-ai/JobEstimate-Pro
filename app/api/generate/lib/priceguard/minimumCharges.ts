// ./lib/priceguard/minimumCharges.ts

export const TRADE_MINIMUMS: Record<string, number> = {
  painting: 500,
  drywall: 450,
  electrical: 250,
  plumbing: 300,
  flooring: 600,
}

export function applyMinimumCharge(
  trade: string,
  total: number
): { total: number; applied: boolean; minimum: number | null } {

  const minimum = TRADE_MINIMUMS[trade]

  if (!minimum) {
    return { total, applied: false, minimum: null }
  }

  if (total < minimum) {
    return {
      total: minimum,
      applied: true,
      minimum
    }
  }

  return {
    total,
    applied: false,
    minimum
  }
}