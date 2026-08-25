import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireNasSession, handleNasApiError, NasApiError } from "@/lib/nas-api-helpers";
import { hashNasPassword, setNasSessionCookie } from "@/lib/nas-auth";
import { pushNasPasswordToGateway } from "@/lib/nas-gateway-client";

export async function PATCH(req: Request) {
  try {
    const session = await requireNasSession();
    const body = await req.json().catch(() => null);

    const data: { name?: string; email?: string; passwordHash?: string; mustChangePassword?: boolean } = {};

    if (typeof body?.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (typeof body?.email === "string" && body.email.trim()) {
      const email = body.email.trim().toLowerCase();
      const existing = await prisma.nasUser.findUnique({ where: { email } });
      if (existing && existing.id !== session.nasUserId) {
        throw new NasApiError(409, "EMAIL_IN_USE");
      }
      data.email = email;
    }

    let newPassword: string | null = null;
    if (typeof body?.password === "string" && body.password.length > 0) {
      if (body.password.length < 8) throw new NasApiError(400, "PASSWORD_TOO_SHORT");
      newPassword = body.password;
      data.passwordHash = await hashNasPassword(body.password);
      data.mustChangePassword = false;
    }

    const nasUser = await prisma.nasUser.update({ where: { id: session.nasUserId }, data });

    // JWT-Claims neu ausstellen (E-Mail/Name/mustChangePassword können sich
    // geändert haben) - sonst leitet proxy.ts mit dem alten Cookie falsch um.
    await setNasSessionCookie(session.nasSessionId, {
      nasSessionId: session.nasSessionId,
      nasUserId: nasUser.id,
      email: nasUser.email,
      name: nasUser.name,
      mustChangePassword: nasUser.mustChangePassword,
    });

    if (newPassword) {
      await pushNasPasswordToGateway(nasUser.email, newPassword);
    }

    return NextResponse.json({
      nasUser: { id: nasUser.id, email: nasUser.email, name: nasUser.name, mustChangePassword: nasUser.mustChangePassword },
    });
  } catch (err) {
    return handleNasApiError(err);
  }
}
