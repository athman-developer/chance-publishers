export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';

export const POST: APIRoute = async ({ locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: null } });
  return redirect('/portal/account/2fa');
};
