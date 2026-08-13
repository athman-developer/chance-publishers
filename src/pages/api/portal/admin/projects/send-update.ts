export const prerender = false;

import type { APIRoute } from 'astro';
import { userHasRole } from '../../../../../lib/auth/session';
import { sendProjectUpdate } from '../../../../../lib/share-link';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const siteUrl = new URL(request.url).origin;

  const { results } = await sendProjectUpdate(projectId, siteUrl);
  const sent = [results.sms && 'sms', results.whatsapp && 'whatsapp', results.email && 'email'].filter(Boolean).join(',');

  return redirect(`/portal/admin/projects/${projectId}?updateSent=${sent || 'none'}`);
};
