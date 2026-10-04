import "server-only";

// Drafting help from Claude (Anthropic's Messages API). Staff only, and only ever a draft:
// the coach reads and edits the text before anything reaches parents.

// ANTHROPIC_API_URL only exists so the end-to-end tests can point at a stand-in.
const API = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function askClaude(system: string, user: string, maxTokens = 900): Promise<string> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Claude refused the request (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  if (!text) throw new Error("Claude returned no text.");
  return text;
}
