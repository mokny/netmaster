import { NextResponse } from "next/server";
import { revokeCurrentNasSession } from "@/lib/nas-auth";

export async function POST() {
  await revokeCurrentNasSession();
  return NextResponse.json({ ok: true });
}
