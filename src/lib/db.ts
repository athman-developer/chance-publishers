import { PrismaClient } from '@prisma/client';

// Reuse the client across hot-reloads/warm Netlify Function invocations
// instead of exhausting Neon connections on every request.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (import.meta.env.DEV) globalForPrisma.prisma = prisma;
