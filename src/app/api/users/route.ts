import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireRole, handleApiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return NextResponse.json({ users });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");
    const role = ["ADMIN", "EDITOR", "VIEWER"].includes(body.role)
      ? body.role
      : "VIEWER";

    if (!email || !name || password.length < 8) {
      return NextResponse.json(
        { error: "E-Mail, Name und Passwort (min. 8 Zeichen) erforderlich" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "E-Mail wird bereits verwendet" },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: { email, name, role, passwordHash: await hashPassword(password) },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
