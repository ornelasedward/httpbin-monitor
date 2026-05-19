import type { PrismaClient } from '@prisma/client';

export async function getRecentDataFingerprint(prisma: PrismaClient): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.response.count({
    where: { timestamp: { gte: since } },
  });
  return Math.round(count / 5) * 5;
}
