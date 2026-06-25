import { RATE_CARD_KEY } from "./constants"

export { RATE_CARD_KEY }

export type RateCardDepositType = "percent" | "fixed"

export type RateCardReferenceDefaults = {
  tradeLabel: string
  laborRateNote: string
  materialAllowanceNote: string
  minimumChargeNote: string
}

export type RateCard = {
  updatedAt: number
  markupPct: number
  tax: {
    enabled: boolean
    rate: number
  }
  deposit: {
    enabled: boolean
    type: RateCardDepositType
    value: number
  }
  referenceDefaults: RateCardReferenceDefaults
}

export type RateCardApplyPayload = Pick<RateCard, "markupPct" | "tax" | "deposit">

export const STARTER_RATE_CARD: RateCard = {
  updatedAt: 0,
  markupPct: 20,
  tax: {
    enabled: false,
    rate: 7.75,
  },
  deposit: {
    enabled: false,
    type: "percent",
    value: 25,
  },
  referenceDefaults: {
    tradeLabel: "",
    laborRateNote: "",
    materialAllowanceNote: "",
    minimumChargeNote: "",
  },
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength)
}

function normalizeDepositType(value: unknown): RateCardDepositType {
  return value === "fixed" ? "fixed" : "percent"
}

export function getStarterRateCard(now = Date.now()): RateCard {
  return {
    ...STARTER_RATE_CARD,
    updatedAt: now,
    tax: { ...STARTER_RATE_CARD.tax },
    deposit: { ...STARTER_RATE_CARD.deposit },
    referenceDefaults: { ...STARTER_RATE_CARD.referenceDefaults },
  }
}

export function normalizeRateCard(value: unknown, now = Date.now()): RateCard {
  if (!value || typeof value !== "object") return getStarterRateCard(now)

  const source = value as Record<string, unknown>
  const tax = source.tax && typeof source.tax === "object"
    ? (source.tax as Record<string, unknown>)
    : {}
  const deposit = source.deposit && typeof source.deposit === "object"
    ? (source.deposit as Record<string, unknown>)
    : {}
  const referenceDefaults =
    source.referenceDefaults && typeof source.referenceDefaults === "object"
      ? (source.referenceDefaults as Record<string, unknown>)
      : {}

  const depositType = normalizeDepositType(deposit.type)
  const depositValue =
    depositType === "percent"
      ? clampNumber(deposit.value, STARTER_RATE_CARD.deposit.value, 0, 100)
      : clampNumber(deposit.value, STARTER_RATE_CARD.deposit.value, 0, 1000000)

  const updatedAt = Number(source.updatedAt)

  return {
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now,
    markupPct: clampNumber(source.markupPct, STARTER_RATE_CARD.markupPct, 0, 500),
    tax: {
      enabled: tax.enabled === true,
      rate: clampNumber(tax.rate, STARTER_RATE_CARD.tax.rate, 0, 25),
    },
    deposit: {
      enabled: deposit.enabled === true,
      type: depositType,
      value: depositValue,
    },
    referenceDefaults: {
      tradeLabel: normalizeText(referenceDefaults.tradeLabel, 80),
      laborRateNote: normalizeText(referenceDefaults.laborRateNote, 200),
      materialAllowanceNote: normalizeText(referenceDefaults.materialAllowanceNote, 200),
      minimumChargeNote: normalizeText(referenceDefaults.minimumChargeNote, 200),
    },
  }
}

export function buildRateCard(input: RateCard, now = Date.now()): RateCard {
  return normalizeRateCard(
    {
      ...input,
      updatedAt: now,
    },
    now
  )
}

export function getRateCardApplyPayload(rateCard: RateCard): RateCardApplyPayload {
  const normalized = normalizeRateCard(rateCard)

  return {
    markupPct: normalized.markupPct,
    tax: { ...normalized.tax },
    deposit: { ...normalized.deposit },
  }
}
