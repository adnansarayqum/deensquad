import { clientIpFrom } from "@/lib/auth/ip";
import { windowCounter } from "@/lib/calendar/feed";
import { confirmSumupPayment } from "@/lib/shop/payments";

// SumUp calls this when a checkout changes. SumUp doesn't sign its webhooks, so the body is only a hint: nothing in
// it is trusted. We act only on a checkout id an order is still awaiting payment on, ask SumUp for that checkout
// ourselves (with the club's key) and mark the order paid only when SumUp says PAID and its reference and amount
// match the order (`confirmSumupPayment`). A small body and a per-address limit keep anyone from using this address
// to make the app call SumUp over and over.

const MAX_BODY_BYTES = 16 * 1024;
/** SumUp sends a handful per payment; this is far above that. */
const perAddress = windowCounter(60, 60 * 60 * 1000);

export async function POST(request: Request) {
  const ok = Response.json({ ok: true });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  if (!perAddress.hit(clientIpFrom(request.headers) ?? "unknown")) return Response.json({ error: "too many" }, { status: 429 });
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return Response.json({ error: "too large" }, { status: 413 });
    const body = JSON.parse(text) as { id?: unknown; payload?: { checkout_id?: unknown } };
    const id = typeof body.id === "string" ? body.id : typeof body.payload?.checkout_id === "string" ? body.payload.checkout_id : null;
    if (id && /^[\w-]{1,80}$/.test(id)) await confirmSumupPayment(id);
  } catch (error) {
    console.error("[shop] webhook:", error instanceof Error ? error.message : error);
  }
  // Always 200 otherwise, so SumUp doesn't retry forever; the order page checks again anyway.
  return ok;
}
