import "server-only";

// SumUp online payments: a hosted checkout for an order's total. SumUp's page takes the card details;
// the app only ever learns whether the checkout was paid, by asking SumUp directly.
// https://developer.sumup.com/online-payments/checkouts/hosted-checkout

export function sumupConfigured(): boolean {
  return Boolean(process.env.SUMUP_API_KEY && process.env.SUMUP_MERCHANT_CODE);
}

const API = "https://api.sumup.com/v0.1/checkouts";

/** How long a SumUp call may take. A checkout that can't be read in time counts as not paid. */
export const SUMUP_TIMEOUT_MS = 10_000;

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
    signal: AbortSignal.timeout(SUMUP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SumUp refused the checkout (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const body = (await res.json()) as { id?: string; hosted_checkout_url?: string };
  if (!body.id || !body.hosted_checkout_url) throw new Error("SumUp didn't return a payment page.");
  return { id: body.id, url: body.hosted_checkout_url };
}

/**
 * The checkout as SumUp sees it: the only source of truth for whether an order was paid. Null when SumUp can't be
 * asked (refused, unreachable or too slow), which every caller treats as not paid.
 */
export async function getCheckout(id: string): Promise<{ status: string; reference: string | null; amount: number | null } | null> {
  try {
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, { headers: headers(), signal: AbortSignal.timeout(SUMUP_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: string; checkout_reference?: string; amount?: number };
    return { status: body.status ?? "UNKNOWN", reference: body.checkout_reference ?? null, amount: body.amount ?? null };
  } catch (error) {
    console.error("[shop] SumUp checkout lookup:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Deactivates a checkout so its payment page can't take a card any more (when the parent chooses bank transfer
 * instead). Best-effort: true only if SumUp confirmed it; a refusal (e.g. it's already paid), an error or no answer in
 * 10 s is logged and returns false.
 */
export async function deactivateCheckout(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers(), signal: AbortSignal.timeout(SUMUP_TIMEOUT_MS) });
    if (!res.ok) console.error("[shop] SumUp didn't deactivate the checkout:", res.status);
    return res.ok;
  } catch (error) {
    console.error("[shop] SumUp deactivate:", error instanceof Error ? error.message : error);
    return false;
  }
}
