import { Resend } from 'resend';

// Shared Resend wrapper — same graceful no-op pattern as sms.ts/whatsapp.ts.
// Individual routes (register, contact, launch-request) still send their own
// richer HTML where needed; this is for simple transactional text emails
// like payment confirmations.

export function isEmailConfigured(): boolean {
  return !!import.meta.env.RESEND_API_KEY;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: 'Email is not yet configured for this site.' };
  }

  try {
    const resend = new Resend(import.meta.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Chance Publishers <manuscripts@chancepublishers.com>',
      to,
      subject,
      text,
    });
    return { ok: true };
  } catch (err) {
    console.error('sendEmail error', err);
    return { ok: false, error: 'Could not send email.' };
  }
}
