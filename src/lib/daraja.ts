// Safaricom Daraja (M-Pesa) STK Push service interface.
//
// This is a sandbox-ready scaffold. It is intentionally NOT wired to a real
// M-Pesa till/paybill yet — that requires production credentials (see
// .env.example: DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORTCODE,
// DARAJA_PASSKEY, DARAJA_CALLBACK_URL, DARAJA_ENVIRONMENT). Until those are
// set, isDarajaConfigured() returns false and every call fails cleanly with
// a clear "not configured" result rather than a confusing runtime error.
//
// CRITICAL: initiateStkPush() only ever creates a PENDING payment record and
// asks Safaricom to prompt the customer's phone. It NEVER marks a payment
// VERIFIED itself — only handleDarajaCallback(), processing Safaricom's own
// server-to-server webhook, can do that. A frontend "STK push sent" success
// message must never be treated as proof of payment.

export function isDarajaConfigured(): boolean {
  return !!(
    import.meta.env.DARAJA_CONSUMER_KEY &&
    import.meta.env.DARAJA_CONSUMER_SECRET &&
    import.meta.env.DARAJA_SHORTCODE &&
    import.meta.env.DARAJA_PASSKEY
  );
}

interface StkPushResult {
  ok: boolean;
  error?: string;
  merchantRequestId?: string;
  checkoutRequestId?: string;
}

async function getDarajaAccessToken(): Promise<string> {
  const baseUrl =
    import.meta.env.DARAJA_ENVIRONMENT === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  const key = import.meta.env.DARAJA_CONSUMER_KEY;
  const secret = import.meta.env.DARAJA_CONSUMER_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error('Failed to obtain Daraja access token');
  const data = await res.json();
  return data.access_token;
}

// Initiates an STK push prompt on the customer's phone. Returns immediately
// with Safaricom's request IDs — the actual payment result arrives later via
// handleDarajaCallback().
export async function initiateStkPush(params: {
  phoneNumber: string; // 2547XXXXXXXX
  amountKes: number;
  accountReference: string; // e.g. invoice number
  transactionDesc: string;
}): Promise<StkPushResult> {
  if (!isDarajaConfigured()) {
    return { ok: false, error: 'M-Pesa payments are not yet configured for this site.' };
  }

  try {
    const baseUrl =
      import.meta.env.DARAJA_ENVIRONMENT === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';
    const shortcode = import.meta.env.DARAJA_SHORTCODE;
    const passkey = import.meta.env.DARAJA_PASSKEY;
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const accessToken = await getDarajaAccessToken();

    const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(params.amountKes),
        PartyA: params.phoneNumber,
        PartyB: shortcode,
        PhoneNumber: params.phoneNumber,
        CallBackURL: import.meta.env.DARAJA_CALLBACK_URL,
        AccountReference: params.accountReference,
        TransactionDesc: params.transactionDesc,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.ResponseCode !== '0') {
      return { ok: false, error: data.errorMessage || data.ResponseDescription || 'STK push failed' };
    }
    return { ok: true, merchantRequestId: data.MerchantRequestID, checkoutRequestId: data.CheckoutRequestID };
  } catch (err) {
    console.error('Daraja STK push error', err);
    return { ok: false, error: 'Could not reach M-Pesa. Please try again.' };
  }
}
