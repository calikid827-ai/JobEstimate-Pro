// app/api/generate/sanity.paintScope.ts
// Run with: npx tsx app/api/generate/sanity.paintScope.ts
// (or temporarily import and call runPaintScopeSanityTests() in route.ts)

function hasPaintWord(s: string) {
  return /\b(?:paint|painting|repaint|prime|primer)\b/i.test(s)
}

function doorCount(s: string): number | null {
  const m = s.match(/\b(\d{1,4})\s+doors?\b/i)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * "Doors-only" intent:
 * - Must mention paint + explicit door count
 * - Allowed: trim, casing, frames, door frames, jambs, baseboards (around doors)
 * - NOT allowed: rooms/walls/ceilings or named rooms (hallway, living room, etc)
 */
function looksLikeDoorsOnly(scopeChange: string) {
  const s = scopeChange.toLowerCase()

  if (!hasPaintWord(s)) return false
  if (doorCount(s) === null) return false

  // Room-ish words should kick it OUT of doors-only
  const hasRoomLanguage =
    /\brooms?\b/.test(s) ||
    /\b(hallway|living\s*room|bed(room)?|kitchen|bath(room)?|dining|office|closet|stair|entry)\b/.test(s)

  if (hasRoomLanguage) return false

  // Walls/ceilings should kick it OUT of doors-only
  const hasWallCeilingLanguage = /\b(walls?|ceilings?)\b/.test(s)
  if (hasWallCeilingLanguage) return false

  // Trim is allowed ONLY if it’s clearly door-associated language
  // (we allow generic "trim" here because you said "doors + trim" should still be doors-only)
  // If you later want "trim" to mean baseboards/whole-house trim, tighten this rule.
  const disallowedTrimContext =
    /\btrim\b/.test(s) && /\b(walls?|rooms?|ceilings?)\b/.test(s)

  if (disallowedTrimContext) return false

  return true
}

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`❌ ${name}`)
  console.log(`✅ ${name}`)
}

export function runPaintScopeSanityTests() {
  // Test 1: doors-only basic
  assert(
    'doors-only: "Paint 13 doors"',
    looksLikeDoorsOnly("Paint 13 doors") === true
  )

  // Test 2: doors-only with trim (your desired behavior)
  assert(
    'doors-only: "Paint 4 doors and trim"',
    looksLikeDoorsOnly("Paint 4 doors and trim") === true
  )

    // Test 2b: doors-only with casing/frames
  assert(
    'doors-only: "Paint 6 doors and casing"',
    looksLikeDoorsOnly("Paint 6 doors and casing") === true
  )

  // Test 3: NOT doors-only if rooms are present (your desired behavior)
  assert(
    'NOT doors-only: "Paint 4 doors and hallway and living room"',
    looksLikeDoorsOnly("Paint 4 doors and hallway and living room") === false
  )

  console.log("🎉 Paint scope sanity tests passed.")
}

// If you run this file directly:
if (require.main === module) runPaintScopeSanityTests()