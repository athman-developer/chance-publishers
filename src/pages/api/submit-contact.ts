export const prerender = false;

import type { APIRoute } from 'astro';
import { Resend } from 'resend';

const PUBLISHER_EMAIL = 'chancepublishersltd@gmail.com';
const SENDER = 'Chance Publishers <hello@chancepublishers.com>';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.formData();
    const name = String(data.get('name') || 'Reader').trim();
    const email = String(data.get('email') || '').trim();
    const phone = String(data.get('phone') || 'Not provided').trim();
    const service = String(data.get('service') || 'Publishing consultation').trim();
    const message = String(data.get('message') || '').trim();

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ ok: false, error: 'missing-fields' }), { status: 400 });
    }

    const apiKey = import.meta.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Missing RESEND_API_KEY environment variable');
      return new Response(JSON.stringify({ ok: false, error: 'not-configured' }), { status: 500 });
    }
    const resend = new Resend(apiKey);

    const publisherEmail = await resend.emails.send({
      from: SENDER,
      to: PUBLISHER_EMAIL,
      replyTo: email,
      subject: `Publishing enquiry: ${service} — ${name}`,
      text: `A new enquiry was submitted through the website.\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nService: ${service}\n\nMessage:\n${message}`,
    });
    if (publisherEmail.error) throw new Error(publisherEmail.error.message);

    const authorEmail = await resend.emails.send({
      from: SENDER,
      to: email,
      subject: 'Thank you for reaching out to Chance Publishers',
      text: `Hello ${name},\n\nThank you for your message. Our publishing team has received it and will be in touch soon.\n\nWarm regards,\nChance Publishers`,
    });
    if (authorEmail.error) throw new Error(authorEmail.error.message);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('submit-contact error', err);
    return new Response(JSON.stringify({ ok: false, error: 'send-failed' }), { status: 500 });
  }
};
