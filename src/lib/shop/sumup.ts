import "server-only";

// SumUp online payments: a hosted checkout for an order's total. SumUp's page takes the card details;
// the app only ever learns whether the checkout was paid, by asking SumUp directly.
// https://developer.sumup.com/online-payments/checkouts/hosted-checkout

export function sumupConfigured(): boolean {
  return Boolean(process.env.SUMUP_API_KEY && process.env.SUMUP_MERCHANT_CODE);
}

const API = "https://api.sumup.com/v0.1/checkouts";

function headers() {
  return { Authorization: `Bearer ${process.env.SUMUP_API_KEY}`, "Content-Type": "application/json" };
}

export async function createCheckout(opts: {
  orderId: string;
  /** SumUp refuses a reference it has seen, so a retry adds a suffix after a dot (`<order id>.<suffix>`). */
  retry?: string;
  totalPence: number;
  description: string;
  redirectUrl: string;
  returnUrl: string;
}): Promise<{ id: string; url: string }> {
  const res = await fetch(API, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      checkout_reference: opts.retry ? `${opts.orderId}.${opts.retry}` : opts.orderId,
      amount: Number((opts.totalPence / 100).toFixed(2)),
      currency: "GBP",
      merchant_code: process.env.SUMUP_MERCHANT_CODE,
      description: opts.description.slice(0, 100),
      redirect_url: opts.redirectUrl,
      return_url: opts.returnUrl,
      hosted_checkout: { enabled: true },
    }),
  });
  if (!res.ok) throw new Error(`SumUp refused the checkout (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const body = (await res.json()) as { id?: string; hosted_checkout_url?: string };
  if (!body.id || !body.hosted_checkout_url) throw new Error("SumUp didn't return a payment page.");
  return { id: body.id, url: body.hosted_checkout_url };
}

/** The checkout as SumUp sees it: the only source of truth for whether an order was paid. */
export async function getCheckout(id: string): Promise<{ status: string; reference: string | null; amount: number | null } | null> {
  const res = await fetch(`${API}/${encodeURIComponent(id)}`, { headers: headers() });
  if (!res.ok) return null;
  const body = (await res.json()) as { status?: string; checkout_reference?: string; amount?: number };
  return { status: body.status ?? "UNKNOWN", reference: body.checkout_reference ?? null, amount: body.amount ?? null };
}
