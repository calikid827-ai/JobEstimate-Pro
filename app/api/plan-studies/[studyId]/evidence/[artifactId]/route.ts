import { planStudyHandlers } from "../../../../../lib/plan-study/production"
export const runtime = "nodejs"
export async function GET(req: Request, context: { params: Promise<{ studyId: string; artifactId: string }> }) {
  const { studyId, artifactId } = await context.params
  return planStudyHandlers.evidence(req, studyId, artifactId)
}
