import { NextResponse } from "next/server";
import { getNasSession } from "@/lib/nas-auth";

export async function GET() {
  const session = await getNasSession();
  if (!session) return NextResponse.json({ nasUser: null }, { status: 401 });
  return NextResponse.json({ nasUser: session });
}
