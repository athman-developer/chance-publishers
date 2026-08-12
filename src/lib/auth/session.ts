import type { AstroCookies } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../db';

export const SESSION_COOKIE = 'cp_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export async function createSession(userId: string, cookies: AstroCookies) {
  const csrfToken = randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: {
      userId,
      csrfToken,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    },
  });

  cookies.set(SESSION_COOKIE, session.id, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    expires: session.expiresAt,
  });

  return session;
}

export async function getSessionUser(cookies: AstroCookies) {
  const sessionId = cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
          authorProfile: true,
          employeeProfile: true,
          partnerProfile: true,
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    cookies.delete(SESSION_COOKIE, { path: '/' });
    return null;
  }

  return { session, user: session.user };
}

export async function destroySession(cookies: AstroCookies) {
  const sessionId = cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function userHasRole(user: { roles: { role: { key: string } }[] }, roleKey: string) {
  return user.roles.some((r) => r.role.key === roleKey);
}
