import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/lib/auth";

export async function POST() {
  await revokeCurrentSession();
  return NextResponse.json({ ok: true });
}
