export const prerender = false;

import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { prisma } from '../../lib/db';
import { nextDocumentNumber } from '../../lib/documents';
import { isRateLimited } from '../../lib/auth/rate-limit';
import { notifyAdmins } from '../../lib/notify';

const PUBLISHER_EMAIL = 'chancepublishersltd@gmail.com';
const SENDER = 'Chance Publishers <hello@chancepublishers.com>';
const MIN_HUMAN_FILL_TIME_MS = 2500;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const data = await request.formData();

    const honeypot = String(data.get('website') || '').trim();
    const elapsedMs = Number(data.get('elapsedMs') || 0);
    if (honeypot || (elapsedMs > 0 && elapsedMs < MIN_HUMAN_FILL_TIME_MS)) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (isRateLimited(`launch-request:${clientAddress}`)) {
      return new Response(JSON.stringify({ ok: false, error: 'rate-limited' }), { status: 429 });
    }

    const fullName = String(data.get('fullName') || '').trim();
    const email = String(data.get('email') || '').trim();
    const phone = String(data.get('phone') || '').trim();
    const bookTitle = String(data.get('bookTitle') || '').trim();
    if (!fullName || !email || !phone || !bookTitle) {
      return new Response(JSON.stringify({ ok: false, error: 'missing-fields' }), { status: 400 });
    }

    const proposedLaunchDateRaw = String(data.get('proposedLaunchDate') || '');
    const expectedGuestsRaw = data.get('expectedGuests');
    const location = String(data.get('location') || '').trim() || null;
    const venueSecured = String(data.get('venueSecured') || 'no') === 'yes';
    const estimatedBudgetRaw = data.get('estimatedBudgetKes');
    const additionalInfo = String(data.get('additionalInfo') || '').trim() || null;
    const servicesRequested = data.getAll('services').map((s) => String(s));

    const launchNumber = await nextDocumentNumber('LR');

    await prisma.launchRequest.create({
      data: {
        launchNumber,
        fullName,
        email,
        phone,
        bookTitle,
        proposedLaunchDate: proposedLaunchDateRaw ? new Date(proposedLaunchDateRaw) : null,
        expectedGuests: expectedGuestsRaw ? Number(expectedGuestsRaw) : null,
        location,
        venueSecured,
        estimatedBudgetKes: estimatedBudgetRaw ? Number(estimatedBudgetRaw) : null,
        servicesRequested,
        additionalInfo,
      },
    });

    await notifyAdmins('LAUNCH_REQUEST_RECEIVED', `New launch request: ${bookTitle} (${fullName})`, '/portal/admin/launches');

    const apiKey = import.meta.env.RESEND_API_KEY;
    if (apiKey) {
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: SENDER,
        to: PUBLISHER_EMAIL,
        replyTo: email,
        subject: `New launch organisation request — ${bookTitle}`,
        text: `${launchNumber}\n\nName: ${fullName}\nEmail: ${email}\nPhone: ${phone}\nBook: ${bookTitle}\nProposed date: ${proposedLaunchDateRaw || 'Not specified'}\nExpected guests: ${expectedGuestsRaw || 'Not specified'}\nLocation: ${location || 'Not specified'}\nVenue secured: ${venueSecured ? 'Yes' : 'No'}\nEstimated budget: ${estimatedBudgetRaw ? `KSh ${estimatedBudgetRaw}` : 'Not specified'}\nServices requested: ${servicesRequested.join(', ') || 'None specified'}\n\nAdditional info:\n${additionalInfo || 'None'}`,
      }).catch((err) => console.error('launch-request: admin email failed', err));

      await resend.emails.send({
        from: SENDER,
        to: email,
        subject: 'Thank you for your launch enquiry — Chance Publishers',
        text: `Hello ${fullName},\n\nThank you for reaching out about launching "${bookTitle}". Our team has received your request and will follow up soon with a tailored quotation.\n\nWarm regards,\nChance Publishers`,
      }).catch((err) => console.error('launch-request: acknowledgement email failed', err));
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('launch-request error', err);
    return new Response(JSON.stringify({ ok: false, error: 'send-failed' }), { status: 500 });
  }
};
