import test from "node:test"
import assert from "node:assert/strict"

import { buildScopeQuantityReviewWarning } from "./scope-quantity-review"

const originalScope = "Paint and patch walls only in 5 bedrooms."
const noQuantities = "No explicit quantities detected (doors/rooms/sqft). Add quantities for stronger pricing protection."
const review = (scopeText: string, overrides: Partial<Parameters<typeof buildScopeQuantityReviewWarning>[0]> = {}) =>
  buildScopeQuantityReviewWarning({ scopeText, pricingSource: "ai", rooms: null, doors: null, measurements: null, ...overrides })

test("a measured bedroom floor does not establish wall area for the reported mixed scope", () => {
  const scopeText = "Paint and patch walls only in 5 bedrooms. Electrical rough-in."
  const measurements = {
    units: "ft" as const,
    rows: [{ label: "Bedroom floor", lengthFt: 20, heightFt: 10, qty: 1 }],
    totalSqft: 200,
  }
  assert.equal(
    review(scopeText, { measurements }),
    "5 bedrooms are specified. Confirm measured wall area and patch dimensions/extent before final approval."
  )
})

test("review retains the original shared five-bedroom count and unconfirmed wall and patch measurements", () => {
  assert.equal(
    review(originalScope),
    "5 bedrooms are specified. Confirm measured wall area and patch dimensions/extent before final approval."
  )
  assert.equal(originalScope, "Paint and patch walls only in 5 bedrooms.")
  assert.doesNotMatch(review(originalScope) ?? "", /10 bedrooms|No explicit quantities detected/)
})

test("review recognizes singular bedroom wall work without inventing patching", () => {
  assert.equal(
    review("Paint bedroom walls in 1 bedroom."),
    "1 bedroom is specified. Confirm measured wall area before final approval."
  )
})

test("review recognizes reversed shared operations and normalized whitespace once", () => {
  for (const scope of ["Patch and paint walls only in 5 bedrooms.", "PAINT  and PATCH   walls only in  5 BEDROOMS."]) {
    assert.equal(review(scope), review(originalScope))
    assert.match(review(scope) ?? "", /^5 bedrooms are specified\./)
  }
})

test("aggregate-only measurements do not establish wall area while generic quantity presence stays separate", () => {
  // The former expectation treated this aggregate as wall evidence without attribution.
  assert.equal(
    review(originalScope, { measurements: { totalSqft: 400 } }),
    "5 bedrooms are specified. Confirm measured wall area and patch dimensions/extent before final approval."
  )
  assert.equal(
    review("Paint bedroom walls in 1 bedroom.", { measurements: { totalSqft: 400 } }),
    "1 bedroom is specified. Confirm measured wall area before final approval."
  )
})

test("the same dimensions attributed to bedroom walls support wall-area presence but not patch extent", () => {
  const measurements = {
    units: "ft" as const,
    rows: [{ label: "Bedroom walls", lengthFt: 20, heightFt: 10, qty: 1 }],
    totalSqft: 200,
  }
  assert.equal(
    review("Paint and patch walls only in 5 bedrooms. Electrical rough-in.", { measurements }),
    "5 bedrooms are specified. Confirm patch dimensions/extent before final approval."
  )
  assert.equal(review("Paint bedroom walls in 1 bedroom.", { measurements }), null)
})

test("unattributed or ambiguous rows leave wall area unconfirmed", () => {
  for (const label of ["Bedroom", "", "Bedroom walls and floor"]) {
    const measurements = {
      units: "ft" as const,
      rows: [{ label, lengthFt: 20, heightFt: 10, qty: 1 }],
      totalSqft: 200,
    }
    assert.equal(
      review(originalScope, { measurements }),
      "5 bedrooms are specified. Confirm measured wall area and patch dimensions/extent before final approval.",
      label
    )
  }
})

test("invalid wall rows cannot borrow numeric support from a positive floor measurement", () => {
  const wall = { label: "Bedroom walls", lengthFt: 20, heightFt: 10, qty: 1 }
  for (const invalid of [
    { lengthFt: 0 }, { heightFt: 0 }, { lengthFt: -20 },
    { lengthFt: NaN }, { heightFt: Infinity }, { qty: 0 }, { qty: 1.5 },
    { lengthFt: 1001 }, { heightFt: 31 }, { qty: 501 },
  ]) {
    const measurements = {
      units: "ft" as const,
      rows: [
        { label: "Bedroom floor", lengthFt: 20, heightFt: 10, qty: 1 },
        { ...wall, ...invalid },
      ],
      totalSqft: 200,
    }
    assert.equal(
      review(originalScope, { measurements }),
      "5 bedrooms are specified. Confirm measured wall area and patch dimensions/extent before final approval."
    )
  }
})

test("a valid wall row remains supported alongside a separate floor row without assigning the aggregate to walls", () => {
  const measurements = {
    units: "ft" as const,
    rows: [
      { label: "Bedroom floor", lengthFt: 20, heightFt: 10, qty: 1 },
      { label: "Bedroom walls", lengthFt: 20, heightFt: 10, qty: 1 },
    ],
    totalSqft: 400,
  }
  const warning = review(originalScope, { measurements })
  assert.equal(warning, "5 bedrooms are specified. Confirm patch dimensions/extent before final approval.")
  assert.doesNotMatch(warning ?? "", /200|400|sqft/)
})

test("quantity review leaves the scope and complete measurement payload unchanged", () => {
  const args = {
    scopeText: "Paint and patch walls only in 5 bedrooms. Electrical rough-in.",
    pricingSource: "ai" as const,
    rooms: null,
    doors: null,
    measurements: {
      units: "ft" as const,
      rows: [
        { label: "Bedroom floor", lengthFt: 20, heightFt: 10, qty: 1 },
        { label: "Bedroom walls", lengthFt: 0, heightFt: 10, qty: 1 },
      ],
      totalSqft: 200,
    },
  }
  const before = structuredClone(args)
  assert.equal(
    buildScopeQuantityReviewWarning(args),
    "5 bedrooms are specified. Confirm measured wall area and patch dimensions/extent before final approval."
  )
  assert.deepEqual(args, before)
})

test("explicit wall square footage remains known in bedroom review", () => {
  assert.equal(
    review("Paint and patch walls only in 5 bedrooms. Measured wall area is 400 sqft."),
    "5 bedrooms are specified. Confirm patch dimensions/extent before final approval."
  )
  const measurements = {
    units: "ft" as const,
    rows: [{ label: "Bedroom floor", lengthFt: 20, heightFt: 10, qty: 1 }],
    totalSqft: 200,
  }
  assert.equal(
    review("Paint and patch walls only in 5 bedrooms. Measured wall area is 400 sqft.", { measurements }),
    "5 bedrooms are specified. Confirm patch dimensions/extent before final approval."
  )
})

test("missing count and unrelated bedroom references do not supply room-count support", () => {
  for (const scope of [
    "Paint and patch bedroom walls.",
    "Paint walls in bedroom 5.",
    "Paint the hallway of a 5-bedroom house.",
    "Paint kitchen walls. The 5 bedrooms are excluded.",
    "Paint kitchen walls. Patch walls in 5 bedrooms by others.",
    "Do not paint and patch walls only in 5 bedrooms.",
  ]) assert.equal(review(scope), noQuantities, scope)
})

test("a door count beside bedrooms stays a caller-supplied door fact rather than a bedroom count", () => {
  assert.equal(review("Paint 5 doors in bedrooms.", { doors: 5 }), null)
  assert.equal(review("Paint 5 doors in bedrooms."), noQuantities)
})

test("invalid exact-count tokens do not become confirmed bedroom totals", () => {
  for (const quantity of ["0", "-5", "+5", "1.5", "1-5", "1–5", "1 to 5", "05", "5/6", "5..0", "9007199254740993"]) {
    assert.equal(review(`Paint walls in ${quantity} bedrooms.`), noQuantities, quantity)
  }
})

test("existing caller-parsed room, guest-room, door, and measured-area controls remain unchanged", () => {
  assert.equal(review("Paint walls in 5 rooms.", { rooms: 5 }), null)
  assert.equal(review("Paint walls in 5 guest rooms.", { rooms: 5 }), null)
  assert.equal(review("Paint 5 doors.", { doors: 5 }), null)
  assert.equal(review("Paint 400 sqft of walls.", { measurements: { totalSqft: 400 } }), null)
})

test("deterministic and merged pricing retain the existing absence of AI quantity review", () => {
  assert.equal(review(originalScope, { pricingSource: "deterministic" }), null)
  assert.equal(review(originalScope, { pricingSource: "merged" }), null)
})
