import { NextResponse } from "next/server";
import { destroyFbSession } from "@/lib/filebrowser/session";

export async function POST() {
  await destroyFbSession();
  return NextResponse.json({ ok: true });
}
