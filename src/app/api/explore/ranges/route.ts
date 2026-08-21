import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, handleApiError, ApiError } from "@/lib/api-helpers";

const CIDR_PATTERN = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;

export async function GET() {
  try {
    await requireSession();
    const ranges = await prisma.exploreRange.findMany({
      orderBy: [{ source: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ ranges });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("EDITOR");
    const body = await req.json();
    const cidr = String(body.cidr ?? "").trim();
    if (!CIDR_PATTERN.test(cidr)) {
      throw new ApiError(400, "Range muss im CIDR-Format vorliegen (z.B. 192.168.1.0/24)");
    }

    const range = await prisma.exploreRange.create({
      data: { cidr, source: "MANUAL", enabled: true },
    });
    return NextResponse.json({ range });
  } catch (err) {
    return handleApiError(err);
  }
}
