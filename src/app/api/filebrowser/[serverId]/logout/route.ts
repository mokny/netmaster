import { NextResponse } from "next/server";
import { destroyFbSession } from "@/lib/filebrowser/session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  await destroyFbSession(serverId);
  return NextResponse.json({ ok: true });
}
