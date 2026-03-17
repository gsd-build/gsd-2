import { collectInspectData } from "../../../../src/web/inspect-service.ts"
import { resolveProjectCwd } from "../../../../src/web/bridge-service.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  try {
    const projectCwd = resolveProjectCwd(request);
    const payload = await collectInspectData(projectCwd)
    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  }
}
