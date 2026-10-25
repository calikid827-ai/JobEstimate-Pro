import { planStudyHandlers } from "../../../../lib/plan-study/production"
export const runtime = "nodejs"
export const maxDuration = 120
export async function POST(req: Request, context: { params: Promise<{ studyId: string }> }) {
  return planStudyHandlers.steps(req, (await context.params).studyId)
}
