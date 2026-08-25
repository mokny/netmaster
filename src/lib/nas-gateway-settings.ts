import { prisma } from "@/lib/prisma";

// Singleton analog zu ExploreSettings/VapidKeys - siehe Schema-Kommentar an
// NasGatewaySettings.
export async function getOrCreateNasGatewaySettings() {
  const existing = await prisma.nasGatewaySettings.findFirst();
  if (existing) return existing;
  return prisma.nasGatewaySettings.create({ data: {} });
}
