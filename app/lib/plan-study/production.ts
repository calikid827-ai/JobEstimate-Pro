import { createPlanStudyHandlers } from "./handlers"
import { SupabaseStudyStore } from "./supabase-store"
import { createStudyProvider } from "./provider"

// No environment flag, request field or browser choice can select synthetic services.
export const planStudyHandlers = createPlanStudyHandlers({ store: new SupabaseStudyStore(), provider: createStudyProvider() })
