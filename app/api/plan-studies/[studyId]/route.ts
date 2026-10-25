import { planStudyHandlers } from "../../../lib/plan-study/production"
export const runtime = "nodejs"
export async function GET(req: Request, context: { params: Promise<{ studyId: string }> }) {
  return planStudyHandlers.study(req, (await context.params).studyId)
}
