export const prerender = false;

import type { APIRoute } from 'astro';
import { Resend } from 'resend';

const PUBLISHER_EMAIL = 'chancepublishersltd@gmail.com';
const SENDER = 'Chance Publishers <manuscripts@chancepublishers.com>';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.formData();
    const name = String(data.get('name') || 'New Author').trim();
    const email = String(data.get('email') || '').trim();
    const message = String(data.get('message') || '').trim();
    const file = data.get('manuscript');

    if (!name || !email) {
      return new Response(JSON.stringify({ ok: false, error: 'missing-fields' }), { status: 400 });
    }

    const apiKey = import.meta.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Missing RESEND_API_KEY environment variable');
      return new Response(JSON.stringify({ ok: false, error: 'not-configured' }), { status: 500 });
    }
    const resend = new Resend(apiKey);

    const attachments = [];
    let fileName = '';
    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name;
      attachments.push({ filename: file.name, content: buffer });
    }

    const publisherEmail = await resend.emails.send({
      from: SENDER,
      to: PUBLISHER_EMAIL,
      replyTo: email,
      subject: `Manuscript Submission — ${name}`,
      text: `A new manuscript was submitted through the website.\n\nName: ${name}\nEmail: ${email}\nManuscript file: ${fileName || 'Not attached'}\n\nAbout the book:\n${message || 'Not provided'}`,
      attachments,
    });
    if (publisherEmail.error) throw new Error(publisherEmail.error.message);

    const authorEmail = await resend.emails.send({
      from: SENDER,
      to: email,
      subject: 'Thank you for sending your manuscript',
      text: `Hello ${name},\n\nThank you for sending your manuscript. Our editorial team will review it and get back to you with feedback as soon as possible.\n\nWarm regards,\nChance Publishers`,
    });
    if (authorEmail.error) throw new Error(authorEmail.error.message);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('submit-manuscript error', err);
    return new Response(JSON.stringify({ ok: false, error: 'send-failed' }), { status: 500 });
  }
};
