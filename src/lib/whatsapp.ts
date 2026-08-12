// Meta WhatsApp Cloud API service interface.
//
// Sandbox-ready scaffold. Not wired to a real Meta Business account yet —
// that requires real credentials (see .env.example: WHATSAPP_ACCESS_TOKEN,
// WHATSAPP_PHONE_NUMBER_ID). Until those are set, isWhatsAppConfigured()
// returns false and sendWhatsAppMessage() no-ops cleanly, same pattern as
// sms.ts and the Resend email helper.
//
// IMPORTANT — WhatsApp's 24-hour rule: Meta only allows free-form text
// messages (what this file sends) when the recipient messaged your business
// number within the last 24 hours. A business-initiated message outside
// that window — e.g. "your payment was verified", sent without the client
// texting first — will be REJECTED unless it uses a pre-approved message
// template (configured in Meta Business Manager, reviewed by Meta, can take
// a day or more the first time). During Meta's testing phase, messages to
// numbers added as test recipients work without this restriction. Before
// relying on this for real client notifications, either get a template
// approved or accept that recipients must have messaged first.

export function isWhatsAppConfigured(): boolean {
  return !!(import.meta.env.WHATSAPP_ACCESS_TOKEN && import.meta.env.WHATSAPP_PHONE_NUMBER_ID);
}

interface SendWhatsAppResult {
  ok: boolean;
  error?: string;
}

// Reuses the same Kenyan phone normalization as sms.ts — WhatsApp's API
// wants digits only, no leading +.
function normalizeForWhatsApp(phone: string): string | null {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 9 && digits.startsWith('7')) return `254${digits}`;
  if (digits.length === 10 && digits.startsWith('07')) return `254${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('254')) return digits;
  return null;
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<SendWhatsAppResult> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: 'WhatsApp is not yet configured for this site.' };
  }

  const to = normalizeForWhatsApp(phone);
  if (!to) {
    return { ok: false, error: 'Invalid phone number format.' };
  }

  try {
    const phoneNumberId = import.meta.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = import.meta.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = import.meta.env.WHATSAPP_API_VERSION || 'v20.0';

    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || 'WhatsApp send failed' };
    }
    return { ok: true };
  } catch (err) {
    console.error('WhatsApp send error', err);
    return { ok: false, error: 'Could not reach WhatsApp.' };
  }
}
