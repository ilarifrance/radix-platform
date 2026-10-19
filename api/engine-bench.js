// Temporary: runs one precision bench case on this preview (Vercel-protected), never in production.
// Lives only on a throwaway branch used for the before/after comparison Francesco approved on 2026-10-19.
const { CASES, score } = require("../tools/engine-bench/cases");
module.exports = async (req, res) => {
  if (process.env.VERCEL_ENV !== "preview") return res.status(404).json({ error: "not found" });
  const c = CASES.find((x) => x.id === String(req.query.case || ""));
  if (!c) return res.status(400).json({ error: "case?", ids: CASES.map((x) => x.id) });
  const engine = req.query.engine === "legacy" ? "legacy" : undefined;
  require("./_auth").getSessionUser = () => ({ uid: "bench" });
  const chat = require("./chat.js");
  let out, code = 200;
  const t0 = Date.now();
  await chat({ method: "POST", headers: {}, query: {}, body: { role: c.role, project: c.project, engine, messages: [{ role: "user", content: c.ask }] } },
    { status(n) { code = n; return this; }, json(b) { out = b; return this; }, setHeader() {} });
  const text = (out && out.reply) || "";
  res.status(200).json({ case: c.id, asked: engine || "new", answered: out && out.engine, code, ms: Date.now() - t0, usage: out && out.usage, result: score(c, text), text: text.slice(0, 3000), error: out && out.error });
};
