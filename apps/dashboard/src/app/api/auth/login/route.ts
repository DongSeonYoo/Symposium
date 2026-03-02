import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { password } = await req.json() as { password: string };
  const appPassword = process.env.APP_PASSWORD;

  // APP_PASSWORD 미설정 시 개발 편의상 통과
  if (appPassword && password !== appPassword) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set("sym_session", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7일
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
