import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/ai/actions", () => ({ draftWithAI: vi.fn() }));
const { WritingHelp } = await import("./WritingHelp");

const hint = "First names only. Don&#x27;t include children&#x27;s surnames.";

describe("WritingHelp", () => {
  it("asks for first names only beside the AI button", () => {
    const html = renderToStaticMarkup(<WritingHelp bodyId="body" kind="news" ai />);
    expect(html).toContain("Tidy up with AI");
    expect(html).toContain(hint);
    expect(html).toContain("text-ink-muted");
  });

  it("shows no hint when AI is off", () => {
    const html = renderToStaticMarkup(<WritingHelp bodyId="body" kind="news" ai={false} />);
    expect(html).not.toContain("First names only");
  });
});
