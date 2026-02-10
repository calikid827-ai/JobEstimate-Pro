// app/api/generate/sanity.flooringEngine.ts
// Run with: npx tsx app/api/generate/sanity.flooringEngine.ts

import { computeFlooringDeterministic } from "./lib/priceguard/flooringEngine"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`❌ ${name}`)
  console.log(`✅ ${name}`)
}

function run() {
  console.log("sanity.flooringEngine.ts starting…")

  {
    const r = computeFlooringDeterministic({
      scopeText: "Install 650 sqft LVP",
      stateMultiplier: 1.0,
      measurements: null,
    })
    assert("650 sqft LVP okForDeterministic", r.okForDeterministic === true)
    assert("650 sqft LVP okForVerified", r.okForVerified === true)
    assert("pricing total > 0", r.pricing.total > 0)
  }

  {
    const r = computeFlooringDeterministic({
      scopeText: "Install 650 sqft flooring",
      stateMultiplier: 1.0,
      measurements: null,
    })
    assert("650 sqft flooring okForDeterministic", r.okForDeterministic === true)
    assert("650 sqft flooring okForVerified false", r.okForVerified === false)
    assert("pricing total > 0", r.pricing.total > 0)
  }

  {
    const r = computeFlooringDeterministic({
      scopeText: "Install vinyl plank in living room",
      stateMultiplier: 1.0,
      measurements: null,
    })
    assert("no sqft okForDeterministic false", r.okForDeterministic === false)
  }

  {
    const r = computeFlooringDeterministic({
      scopeText: "Install laminate flooring",
      stateMultiplier: 1.0,
      measurements: { totalSqft: 500 },
    })
    assert("measurements okForDeterministic true", r.okForDeterministic === true)
    assert("measurements okForVerified true", r.okForVerified === true)
    assert("pricing total > 0", r.pricing.total > 0)
  }

  console.log("🎉 Flooring engine sanity tests passed.")
}

run()