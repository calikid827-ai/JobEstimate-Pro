import { createProjectLibraryHandlers } from "../../../../lib/project-library/handlers"
import { SupabaseProjectLibraryStore } from "../../../../lib/project-library/supabase-store"

export const runtime = "nodejs"
export const maxDuration = 60
const handlers = createProjectLibraryHandlers({ store: new SupabaseProjectLibraryStore() })
export async function GET(req: Request, context: { params: Promise<{ projectId: string }> }) { return handlers.files(req, (await context.params).projectId) }
export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) { return handlers.files(req, (await context.params).projectId) }
