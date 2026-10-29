// A stand-in for the Claude Messages API in end-to-end tests: answers by what the system prompt asks for.
import { createServer } from "node:http";

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.url === "/health") return res.end("ok");
    const { system = "", messages = [], tools } = JSON.parse(raw || "{}");
    // The admins' assistant: asks for one tool, then answers from what it returned (src/lib/assistant).
    if (tools) {
      res.setHeader("content-type", "application/json");
      const last = messages.at(-1);
      const result = Array.isArray(last?.content) ? last.content.find((b) => b.type === "tool_result") : null;
      if (result) {
        const data = JSON.parse(result.content);
        const text = data.draft_id
          ? "I've drafted that. Check the card and tap Confirm."
          : data.count !== undefined
            ? `${data.count} children have no payment plan:\n${data.children.slice(0, 3).map((c) => `- ${c.child} (${c.group})`).join("\n")}\n[See them on Families](${data.link})`
            : `I couldn't do that: ${data.error ?? "no answer"}`;
        return res.end(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text }] }));
      }
      const asked = String(last?.content ?? "");
      const day = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
      const use = /add/i.test(asked)
        ? { name: "propose_add_sessions", input: { kind: "training", title: "Assistant training", groups: ["U7"], date: day, start: "17:00", end: "18:15", venue: "Bobby Moore Sports Hub" } }
        : /payment/i.test(asked)
          ? { name: "children_needing", input: { need: "payment" } }
          : null;
      if (!use) return res.end(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "I can't find that in the app." }] }));
      return res.end(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "fake-1", ...use }] }));
    }
    const said = String(messages[0]?.content ?? "");
    const child = said.match(/^Child's first name: (.+)$/m)?.[1];
    const text = system.includes("monthly progress report")
      ? `${child} has worked hard this month. Drafted from: ${said.split("\n")[1]}`
      : system.includes('{"title"')
      ? JSON.stringify({ title: "Pitch closed on Saturday", body: `Tidied: ${said.split("\n").pop()}` })
      : `Warm-up:\n- ${said.split("\n").pop()}`;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ content: [{ type: "text", text }] }));
  });
}).listen(3199);
