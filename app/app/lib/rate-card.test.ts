import test from "node:test"
import assert from "node:assert/strict"

import {
  buildRateCard,
  getRateCardApplyPayload,
  getStarterRateCard,
  normalizeRateCard,
  RATE_CARD_KEY,
} from "./rate-card"

test("normalizeRateCard stores safe contractor defaults only", () => {
  const rateCard = normalizeRateCard(
    {
      updatedAt: 10,
      markupPct: 32,
      tax: {
        enabled: true,
        rate: 8.25,
      },
      deposit: {
        enabled: true,
        type: "fixed",
        value: 750,
      },
      referenceDefaults: {
        tradeLabel: "Interior repaint",
        laborRateNote: "Crew rate reference only.",
        materialAllowanceNote: "Standard paint allowance reference.",
        minimumChargeNote: "$1,500 minimum reference.",
      },
      result: "Generated customer proposal should not persist here.",
      pricing: { total: 9000 },
      laborTotals: { hours: 42 },
      photos: ["data:image/png;base64,abc"],
      plans: ["plan.pdf"],
      approvalLink: "https://example.com/approve",
      invoice: { id: "inv_1" },
    },
    99
  )

  assert.deepEqual(rateCard, {
    updatedAt: 10,
    markupPct: 32,
    tax: {
      enabled: true,
      rate: 8.25,
    },
    deposit: {
      enabled: true,
      type: "fixed",
      value: 750,
    },
    referenceDefaults: {
      tradeLabel: "Interior repaint",
      laborRateNote: "Crew rate reference only.",
      materialAllowanceNote: "Standard paint allowance reference.",
      minimumChargeNote: "$1,500 minimum reference.",
    },
  })
  assert.equal((rateCard as Record<string, unknown>).pricing, undefined)
  assert.equal((rateCard as Record<string, unknown>).result, undefined)
  assert.equal((rateCard as Record<string, unknown>).photos, undefined)
})

test("normalizeRateCard clamps unsafe numeric defaults", () => {
  const percentDeposit = normalizeRateCard({
    markupPct: 999,
    tax: {
      enabled: true,
      rate: 55,
    },
    deposit: {
      enabled: true,
      type: "percent",
      value: 140,
    },
  })

  assert.equal(percentDeposit.markupPct, 500)
  assert.equal(percentDeposit.tax.rate, 25)
  assert.equal(percentDeposit.deposit.value, 100)

  const fixedDeposit = normalizeRateCard({
    markupPct: -10,
    tax: {
      enabled: true,
      rate: -4,
    },
    deposit: {
      enabled: true,
      type: "fixed",
      value: -500,
    },
  })

  assert.equal(fixedDeposit.markupPct, 0)
  assert.equal(fixedDeposit.tax.rate, 0)
  assert.equal(fixedDeposit.deposit.value, 0)
})

test("getStarterRateCard returns starter editable pricing defaults", () => {
  assert.deepEqual(getStarterRateCard(123), {
    updatedAt: 123,
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
  })
})

test("buildRateCard updates timestamp and preserves normalized safe fields", () => {
  const built = buildRateCard(
    {
      updatedAt: 1,
      markupPct: 28,
      tax: {
        enabled: true,
        rate: 7.5,
      },
      deposit: {
        enabled: true,
        type: "percent",
        value: 35,
      },
      referenceDefaults: {
        tradeLabel: "Bathroom tile",
        laborRateNote: "",
        materialAllowanceNote: "",
        minimumChargeNote: "",
      },
    },
    500
  )

  assert.equal(built.updatedAt, 500)
  assert.equal(built.markupPct, 28)
  assert.deepEqual(built.deposit, {
    enabled: true,
    type: "percent",
    value: 35,
  })
})

test("getRateCardApplyPayload returns only client-editable pricing defaults", () => {
  const rateCard = normalizeRateCard({
    markupPct: 30,
    tax: {
      enabled: true,
      rate: 8,
    },
    deposit: {
      enabled: true,
      type: "percent",
      value: 40,
    },
    referenceDefaults: {
      tradeLabel: "Painting",
      laborRateNote: "Reference only.",
      materialAllowanceNote: "Reference only.",
      minimumChargeNote: "Reference only.",
    },
    laborTotals: { hours: 10 },
    pricingAuthority: "rate-card",
  })

  assert.deepEqual(getRateCardApplyPayload(rateCard), {
    markupPct: 30,
    tax: {
      enabled: true,
      rate: 8,
    },
    deposit: {
      enabled: true,
      type: "percent",
      value: 40,
    },
  })
})

test("RATE_CARD_KEY uses the V1 localStorage namespace", () => {
  assert.equal(RATE_CARD_KEY, "jobestimatepro_rate_card_v1")
})
