// Which model answers each agent, and the request body for it. Two levels: «precise» for the agents that
// plan, decide or check facts (strategy, orchestrators, accounting, legal, market analysis, project plans),
// «standard» for writing in volume (copy, social, video, web pages). Both reason before answering; the depth
// is set by `effort`. The previous engine stays available as «legacy»: it answers again when the newer
// models decline a request, and RADIX_ENGINE=legacy puts every agent back on it without a code change.
// The model names can be changed from the environment (RADIX_MODEL_PRECISE, RADIX_MODEL_STANDARD,
// RADIX_MODEL_LEGACY). Pure functions: no network here, the tests run them as they are.
"use strict";

const DEFAULTS = {
  precise: "claude-opus-5-5",
  standard: "claude-sonnet-5-5",
  legacy: "claude-sonnet-4-5-20250929",
};

// Agents whose mistakes cost the most: they plan, decide, give numbers or check what the others wrote.
const PRECISE = new Set([
  "marketing-orchestrator",
  "strategist",
  "brand-strategist",
  "analytics",
  "partner",
  "commercialista-senior",
  "commercialista-operativo",
  "contabilita",
  "lavoro-paghe",
  "legal-orchestrator",
  "legal-gdpr",
  "legal-contracts",
  "legal-banking",
  "legal-risk-analyst",
  "comm-orchestrator",
  "comm-market-analyst",
  "pm-planner",
  "fact-checker",
]);

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

// Room for the reasoning on top of the answer: it counts in the same token limit.
const THINKING_ROOM = 16000;
const MAX_OUTPUT = 64000;

const CONTINUE_NOTE =
  "Il testo qui sopra si è interrotto per limite di lunghezza. Riprendi esattamente dal punto in cui si ferma: " +
  "non ripetere niente di quello già scritto, nessuna introduzione o commento, e se l'ultima frase è a metà " +
  "completala partendo dalla parola successiva.";

function models(env) {
  const e = env || {};
  return {
    precise: e.RADIX_MODEL_PRECISE || DEFAULTS.precise,
    standard: e.RADIX_MODEL_STANDARD || DEFAULTS.standard,
    legacy: e.RADIX_MODEL_LEGACY || DEFAULTS.legacy,
  };
}

// Level for one agent: its own `tier` field wins, then the PRECISE list, then «standard».
function tierFor(key, agent, env) {
  if (env && env.RADIX_ENGINE === "legacy") return "legacy";
  const t = agent && agent.tier;
  if (t === "precise" || t === "standard" || t === "legacy") return t;
  return PRECISE.has(key) ? "precise" : "standard";
}

function effortFor(tier, agent) {
  const e = agent && agent.effort;
  if (EFFORTS.includes(e)) return e;
  return tier === "precise" ? "high" : "medium";
}

// The newer models do not accept a reply that starts from a half-written assistant message. The old
// continuation (the text written so far sent as the last message) becomes that text plus a short request
// to go on from where it stopped, so the browser can still join the parts as before.
function continuationSafe(messages) {
  const list = (messages || []).map((m) => ({ role: m.role, content: m.content }));
  const last = list[list.length - 1];
  if (last && last.role === "assistant") {
    if (typeof last.content === "string") last.content = last.content.replace(/\s+$/, "");
    list.push({ role: "user", content: CONTINUE_NOTE });
  }
  return list;
}

function toolsFor(agent, tier, base) {
  if (agent.tools === false) return null;
  const search = { ...base.search, max_uses: agent.searchUses || base.search.max_uses };
  // The newer models get the search that filters results before reading them.
  if (tier !== "legacy") search.type = "web_search_20260209";
  return agent.tools === "search" ? [search] : [search, base.fetch];
}

// Request body for the Messages API. `tools` = { search, fetch } definitions from chat.js.
function requestBody({ key, agent, messages, system, env, tools, tier: forced }) {
  const tier = forced || tierFor(key, agent, env);
  const model = models(env)[tier];
  const answer = agent.maxTokens || 1024;
  const t = toolsFor(agent, tier, tools);
  const body = { model, system: system || agent.system };
  if (tier === "legacy") {
    body.max_tokens = answer;
    body.temperature = typeof agent.temperature === "number" ? agent.temperature : 0.6;
    body.messages = (messages || []).map((m) => ({ role: m.role, content: m.content }));
  } else {
    body.max_tokens = Math.min(answer + THINKING_ROOM, MAX_OUTPUT);
    body.thinking = { type: "adaptive" };
    body.output_config = { effort: effortFor(tier, agent) };
    body.messages = continuationSafe(messages);
  }
  if (t) body.tools = t;
  return { tier, model, body };
}

module.exports = { DEFAULTS, PRECISE, CONTINUE_NOTE, models, tierFor, effortFor, continuationSafe, requestBody };
