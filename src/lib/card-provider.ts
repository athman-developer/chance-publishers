// Card payment provider interface — architecture only, no provider wired up
// yet. No card provider or credentials have been chosen (REQUIRES MANAGEMENT
// DECISION + REQUIRES CREDENTIAL — see docs/PORTAL_IMPLEMENTATION_PROGRESS.md).
//
// When a provider is chosen (e.g. Stripe, Flutterwave, Pesapal), implement
// this interface in a new file and swap it in below. Card numbers and CVVs
// must NEVER touch this codebase directly — always use the provider's
// hosted checkout/element and verify payment via their signed webhook, the
// same "never trust the frontend" rule the Daraja and cheque flows follow.

export interface CardProvider {
  isConfigured(): boolean;
  createCheckoutSession(params: {
    invoiceId: string;
    amountKes: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ ok: boolean; checkoutUrl?: string; error?: string }>;
}

export const cardProvider: CardProvider = {
  isConfigured() {
    return false;
  },
  async createCheckoutSession() {
    return { ok: false, error: 'Card payments are not yet available. Please use bank transfer, cash, or cheque.' };
  },
};
