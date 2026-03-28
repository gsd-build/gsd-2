import { setPassword } from "../../../../../src/web/web-password-storage.ts";
import { getOrCreateSessionSecret } from "../../../../../src/web/web-session-auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // ── Parse and validate request body ───────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const { password } = body as Record<string, unknown>;

  if (!password || typeof password !== "string" || password.length < 4) {
    return Response.json({ error: "password_too_short" }, { status: 400 });
  }

  // ── Hash password and rotate session secret ────────────────────────
  await setPassword(password);

  // ── Update running process env so proxy.ts picks up the new secret (review concern #1) ──
  const newSecret = await getOrCreateSessionSecret();
  process.env.GSD_WEB_SESSION_SECRET = newSecret;

  return Response.json({ ok: true });
}
