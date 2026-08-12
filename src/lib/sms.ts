// Africa's Talking SMS service interface.
//
// Sandbox-ready scaffold. Not wired to a real Africa's Talking account yet —
// that requires real credentials (see .env.example: AFRICASTALKING_USERNAME,
// AFRICASTALKING_API_KEY, AFRICASTALKING_SENDER_ID). Until those are set,
// isSmsConfigured() returns false and sendSms() no-ops cleanly instead of
// throwing, the same graceful pattern used for Resend email and Daraja.
//
// SMS never drives business logic — it's a courtesy notification sent
// alongside an already-committed in-app notification (see notify() in
// notify.ts), never a substitute for it.

export function isSmsConfigured(): boolean {
  return !!(import.meta.env.AFRICASTALKING_USERNAME && import.meta.env.AFRICASTALKING_API_KEY);
}

interface SendSmsResult {
  ok: boolean;
  error?: string;
}

// Normalizes a Kenyan phone number to Africa's Talking's expected +254 format.
// Accepts 07XXXXXXXX/01XXXXXXXX, 7XXXXXXXX/1XXXXXXXX, 254..., or +254...
// (01X covers Safaricom/Airtel's newer number ranges, e.g. 0110-0115.)
export function normalizeKenyanPhone(phone: string): string | null {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) return `+254${digits}`;
  if (digits.length === 10 && digits.startsWith('0') && (digits[1] === '7' || digits[1] === '1')) return `+254${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('254')) return `+${digits}`;
  return null;
}

export async function sendSms(phone: string, message: string): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    return { ok: false, error: 'SMS is not yet configured for this site.' };
  }

  const to = normalizeKenyanPhone(phone);
  if (!to) {
    return { ok: false, error: 'Invalid phone number format.' };
  }

  try {
    const baseUrl =
      import.meta.env.AFRICASTALKING_ENVIRONMENT === 'production'
        ? 'https://api.africastalking.com'
        : 'https://api.sandbox.africastalking.com';
    const username = import.meta.env.AFRICASTALKING_USERNAME;
    const apiKey = import.meta.env.AFRICASTALKING_API_KEY;
    const senderId = import.meta.env.AFRICASTALKING_SENDER_ID;

    const body = new URLSearchParams({ username, to, message });
    if (senderId) body.set('from', senderId);

    const res = await fetch(`${baseUrl}/version1/messaging`, {
      method: 'POST',
      headers: {
        apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const data = await res.json();
    const recipient = data?.SMSMessageData?.Recipients?.[0];
    if (!res.ok || !recipient || !['Success', 'Sent', 'Queued'].includes(recipient.status)) {
      return { ok: false, error: recipient?.status || data?.SMSMessageData?.Message || 'SMS send failed' };
    }
    return { ok: true };
  } catch (err) {
    console.error('Africa\'s Talking SMS error', err);
    return { ok: false, error: 'Could not reach the SMS provider.' };
  }
}
