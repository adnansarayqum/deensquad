// A stand-in for the Claude Messages API in end-to-end tests: answers by what the system prompt asks for.
import { createServer } from "node:http";

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.url === "/health") return res.end("ok");
    const { system = "", messages = [] } = JSON.parse(raw || "{}");
    const said = String(messages[0]?.content ?? "");
    const text = system.includes('{"title"')
      ? JSON.stringify({ title: "Pitch closed on Saturday", body: `Tidied: ${said.split("\n").pop()}` })
      : `Warm-up:\n- ${said.split("\n").pop()}`;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ content: [{ type: "text", text }] }));
  });
}).listen(3199);
