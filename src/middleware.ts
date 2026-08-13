import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from './lib/auth/session';

const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: '/portal/admin',
  ADMIN: '/portal/admin',
  EMPLOYEE: '/portal/employee',
  PARTNER: '/portal/employee',
  AUTHOR: '/portal/author',
};

function sectionFor(pathname: string): 'author' | 'employee' | 'admin' | null {
  if (pathname.startsWith('/portal/author')) return 'author';
  if (pathname.startsWith('/portal/employee')) return 'employee';
  if (pathname.startsWith('/portal/admin')) return 'admin';
  return null;
}

const SECTION_ROLES: Record<string, string[]> = {
  author: ['AUTHOR'],
  employee: ['EMPLOYEE', 'PARTNER', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'],
  admin: ['ADMIN', 'SUPER_ADMIN'],
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const isPortalArea = pathname.startsWith('/portal') || pathname.startsWith('/api/portal');
  if (!isPortalArea) return next();

  const auth = await getSessionUser(context.cookies);
  context.locals.user = auth?.user ?? null;
  context.locals.session = auth?.session ?? null;

  // API routes handle their own auth checks (return JSON/redirect as appropriate)
  // rather than being redirected here, since they're not page navigations.
  if (pathname.startsWith('/api/portal')) return next();

  const publicPaths = ['/portal/login', '/portal/register', '/portal/verify-email', '/portal/share/'];
  if (publicPaths.some((p) => pathname.startsWith(p))) return next();

  if (!auth) {
    return context.redirect(`/portal/login?next=${encodeURIComponent(pathname)}`);
  }

  if (pathname === '/portal' || pathname === '/portal/') {
    const primaryRole = auth.user.roles[0]?.role.key;
    return context.redirect(ROLE_HOME[primaryRole ?? ''] ?? '/portal/author');
  }

  const section = sectionFor(pathname);
  if (section) {
    const allowed = SECTION_ROLES[section];
    const hasAccess = auth.user.roles.some((r) => allowed.includes(r.role.key));
    if (!hasAccess) {
      return context.redirect(ROLE_HOME[auth.user.roles[0]?.role.key ?? ''] ?? '/portal/login');
    }
  }

  return next();
});
