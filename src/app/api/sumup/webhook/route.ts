import { confirmSumupPayment } from "@/lib/shop/payments";

// SumUp calls this when a checkout changes. The body is only a hint: we ask SumUp for the checkout
// ourselves and match the reference and amount before marking anything paid.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: unknown; payload?: { checkout_id?: unknown } };
    const id = typeof body.id === "string" ? body.id : typeof body.payload?.checkout_id === "string" ? body.payload.checkout_id : null;
    if (id && /^[\w-]{1,80}$/.test(id)) await confirmSumupPayment(id);
  } catch (error) {
    console.error("[shop] webhook:", error instanceof Error ? error.message : error);
  }
  // Always 200, so SumUp doesn't retry forever; the order page checks again anyway.
  return Response.json({ ok: true });
}
