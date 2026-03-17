import { collectBootPayload, resolveProjectCwd } from "../../../../src/web/bridge-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const projectCwd = resolveProjectCwd(request);
  const { projectDetection: _projectDetection, ...bootPayload } = await collectBootPayload(projectCwd);

  return Response.json(bootPayload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
