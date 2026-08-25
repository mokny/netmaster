import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashNasPassword } from "@/lib/nas-auth";
import { pushNasPasswordToGateway } from "@/lib/nas-gateway-client";
import { requireRole, handleApiError } from "@/lib/api-helpers";

const SELECT = {
  id: true,
  email: true,
  name: true,
  canCreatePublicLinks: true,
  mustChangePassword: true,
  totpEnabled: true,
  createdAt: true,
  quotaBytes: true,
  memberships: {
    select: {
      share: {
        select: { usedBytes: true, _count: { select: { members: true } } },
      },
    },
  },
} as const;

// Nutzung für die User-Quota = Summe usedBytes aller Freigaben, bei denen
// dieser User das einzige Mitglied ist (siehe Schema-Kommentar an
// NasUser.quotaBytes).
function withPrivateUsedBytes<T extends { memberships: { share: { usedBytes: bigint; _count: { members: number } } }[]; quotaBytes: bigint | null }>(
  user: T
) {
  const { memberships, quotaBytes, ...rest } = user;
  const privateUsedBytes = memberships
    .filter((m) => m.share._count.members === 1)
    .reduce((sum, m) => sum + m.share.usedBytes, BigInt(0));
  return { ...rest, quotaBytes: quotaBytes?.toString() ?? null, privateUsedBytes: privateUsedBytes.toString() };
}

export async function GET() {
  try {
    await requireRole("ADMIN");
    const nasUsers = await prisma.nasUser.findMany({
      orderBy: { createdAt: "asc" },
      select: SELECT,
    });
    return NextResponse.json({ nasUsers: nasUsers.map(withPrivateUsedBytes) });
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
    const canCreatePublicLinks = body.canCreatePublicLinks !== false;
    const quotaBytes =
      typeof body.quotaBytes === "number" && body.quotaBytes > 0
        ? BigInt(Math.floor(body.quotaBytes))
        : null;

    if (!email || !name || password.length < 8) {
      return NextResponse.json(
        { error: "E-Mail, Name und Passwort (min. 8 Zeichen) erforderlich" },
        { status: 400 }
      );
    }

    const existing = await prisma.nasUser.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "E-Mail wird bereits verwendet" }, { status: 409 });
    }

    const nasUser = await prisma.nasUser.create({
      data: {
        email,
        name,
        canCreatePublicLinks,
        quotaBytes,
        passwordHash: await hashNasPassword(password),
        mustChangePassword: true,
      },
      select: SELECT,
    });
    await pushNasPasswordToGateway(nasUser.email, password);

    return NextResponse.json({ nasUser: withPrivateUsedBytes(nasUser) }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
