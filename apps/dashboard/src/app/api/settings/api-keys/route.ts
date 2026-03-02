import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ALLOWED_KEY_NAMES,
  type ApiKeyName,
  listApiKeys,
  setApiKey,
  deleteApiKey,
} from "@/lib/api-keys";

export const dynamic = "force-dynamic";

// ── 공통 보안 검증 ────────────────────────────────────────────
function verifyRequest(req: NextRequest): NextResponse | null {
  // 1. 세션 쿠키 검증
  const session = req.cookies.get("sym_session");
  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. CSRF: Origin/Referer이 앱 URL과 일치하는지 확인 (Same-Site 보완)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
    if (!origin.startsWith(appUrl)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return null; // 검증 통과
}

function getActor(req: NextRequest): string {
  // sym_session 쿠키 값을 actor로 사용 (단순 식별용)
  return req.cookies.get("sym_session")?.value ?? "unknown";
}

// key_name 화이트리스트 Zod schema
const KeyNameSchema = z.enum([...ALLOWED_KEY_NAMES] as [ApiKeyName, ...ApiKeyName[]]);

// ── GET /api/settings/api-keys — 마스킹된 목록 ─────────────────
export async function GET(req: NextRequest) {
  const denied = verifyRequest(req);
  if (denied) return denied;

  try {
    const list = await listApiKeys();
    return NextResponse.json(list);
  } catch (err) {
    console.error("[api/settings/api-keys] GET error:", err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// ── POST /api/settings/api-keys — 키 저장 ─────────────────────
export async function POST(req: NextRequest) {
  const denied = verifyRequest(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const schema = z.object({
    name: KeyNameSchema,
    value: z.string().min(1, "값이 비어있습니다"),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await setApiKey(parsed.data.name as ApiKeyName, parsed.data.value, getActor(req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/settings/api-keys] POST error:", err);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}

// ── DELETE /api/settings/api-keys?name=XXX — 키 삭제 ──────────
export async function DELETE(req: NextRequest) {
  const denied = verifyRequest(req);
  if (denied) return denied;

  const name = req.nextUrl.searchParams.get("name");
  const parsed = KeyNameSchema.safeParse(name);
  if (!parsed.success) {
    return NextResponse.json({ error: "유효하지 않은 키 이름" }, { status: 400 });
  }

  try {
    await deleteApiKey(parsed.data as ApiKeyName, getActor(req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/settings/api-keys] DELETE error:", err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
