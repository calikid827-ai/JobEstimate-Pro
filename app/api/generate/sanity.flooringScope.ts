// app/api/generate/sanity.flooringScope.ts
// Run with: npx tsx app/api/generate/sanity.flooringScope.ts
// (or temporarily import and call runFlooringScopeSanityTests() in route.ts)

console.log("sanity.flooringScope.ts starting…")

type FlooringType = "lvp" | "laminate" | "tile" | "hardwood" | "carpet" | null

function hasFlooringWord(s: string) {
  return /\b(floor|flooring|lvp|vinyl\s*plank|luxury\s*vinyl|laminate|tile|porcelain|ceramic|hardwood|engineered\s*wood|carpet)\b/i.test(
    s
  )
}

function detectFlooringType(s: string): FlooringType {
  const t = s.toLowerCase()
  if (/\b(lvp|vinyl\s*plank|luxury\s*vinyl)\b/.test(t)) return "lvp"
  if (/\b(laminate)\b/.test(t)) return "laminate"
  if (/\b(tile|porcelain|ceramic)\b/.test(t)) return "tile"
  if (/\b(hardwood|engineered\s*wood)\b/.test(t)) return "hardwood"
  if (/\b(carpet)\b/.test(t)) return "carpet"
  return null
}

function sqftCount(s: string): number | null {
  // Matches: "650 sqft", "650 sq ft", "650 square feet", "650 sf"
  const m = s.match(/\b(\d{2,6})\s*(sq\.?\s*ft|sqft|square\s*feet|sf)\b/i)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function hasDemoLanguage(s: string) {
  return /\b(demo|demolition|remove|removal|rip\s*out|tear\s*out|pull\s*up|dispose|haul\s*away)\b/i.test(
    s
  )
}

/**
 * "Flooring deterministic OK" intent:
 * - Must be flooring-related
 * - Must have explicit sqft (v1)
 * - Flooring type is strongly preferred; if missing, allow but NOT "Verified"
 *
 * Returns:
 * - okForDeterministic: can compute deterministic pricing
 * - okForVerified: allowed to return pricingSource="merged" (PriceGuard™ Verified)
 */
function evaluateFlooringScope(scopeChange: string) {
  const s = scopeChange.toLowerCase()

  if (!hasFlooringWord(s)) {
    return { okForDeterministic: false, okForVerified: false }
  }

  const sqft = sqftCount(s)
  const type = detectFlooringType(s)

  // v1 rule: without sqft, do NOT deterministic price
  if (sqft === null) {
    return { okForDeterministic: false, okForVerified: false }
  }

  // deterministic is OK if sqft exists
  const okForDeterministic = true

  // Verified only if sqft + explicit type
  const okForVerified = type !== null

  return { okForDeterministic, okForVerified }
}

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`❌ ${name}`)
  console.log(`✅ ${name}`)
}

export function runFlooringScopeSanityTests() {
  // 1) Verified: sqft + type
  assert(
    'verified: "Install 650 sqft LVP"',
    evaluateFlooringScope("Install 650 sqft LVP").okForVerified === true
  )

  // 2) Deterministic OK but NOT verified: sqft present, type missing
  assert(
    'not verified (type missing): "Install 650 sqft flooring"',
    evaluateFlooringScope("Install 650 sqft flooring").okForDeterministic === true &&
      evaluateFlooringScope("Install 650 sqft flooring").okForVerified === false
  )

  // 3) NOT deterministic: no sqft
  assert(
    'not deterministic: "Install vinyl plank in living room"',
    evaluateFlooringScope("Install vinyl plank in living room").okForDeterministic === false
  )

  // 4) Verified with demo language (still verified — demo is just an add-on)
  assert(
    'verified + demo: "Remove existing laminate and install 500 sq ft laminate"',
    evaluateFlooringScope("Remove existing laminate and install 500 sq ft laminate")
      .okForVerified === true
  )

  // 5) Not flooring at all
  assert(
    'not flooring: "Replace two faucets"',
    evaluateFlooringScope("Replace two faucets").okForDeterministic === false
  )

  console.log("🎉 Flooring scope sanity tests passed.")
}
  if (require.main === module) runFlooringScopeSanityTests()
