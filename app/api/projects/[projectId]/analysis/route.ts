import { createProjectAnalysisHandlers } from "../../../../lib/project-analysis/handlers"
import { createProjectAnalysisProvider } from "../../../../lib/project-analysis/provider"
import { SupabaseProjectAnalysisStore } from "../../../../lib/project-analysis/supabase-store"
import { SupabaseProjectLibraryStore } from "../../../../lib/project-library/supabase-store"

export const runtime = "nodejs"
export const maxDuration = 120
const handlers = createProjectAnalysisHandlers({ library: new SupabaseProjectLibraryStore(), analyses: new SupabaseProjectAnalysisStore(), provider: createProjectAnalysisProvider() })
export async function GET(req: Request, context: { params: Promise<{ projectId: string }> }) { return handlers.analysis(req, (await context.params).projectId) }
export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) { return handlers.analysis(req, (await context.params).projectId) }
