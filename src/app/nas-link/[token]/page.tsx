import { prisma } from "@/lib/prisma";
import { NasPublicLinkView } from "@/components/nas/nas-public-link-view";

export default async function NasPublicLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await prisma.nasShareLink.findUnique({ where: { token } });

  const notFound = !link || (link.expiresAt && link.expiresAt < new Date());

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <NasPublicLinkView
        token={token}
        notFound={Boolean(notFound)}
        requiresPassword={Boolean(link?.passwordHash)}
        fileName={link ? link.path.split("/").pop() ?? link.path : ""}
      />
    </div>
  );
}
