export const prerender = false;

import type { APIRoute } from 'astro';
import { destroySession } from '../../../lib/auth/session';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  await destroySession(cookies);
  return redirect('/portal/login');
};
