import Anthropic from "@anthropic-ai/sdk";
import seed from "../challenges/2-finding-the-right-resource/data/oc-resources.seed.json";
import added from "../data/added.json";
import staff from "../data/ihh-staff.json";
import { checkSafety, safetyReply } from "./safety.js";
import { checkPlan, readingGrade } from "./check.js";
import { GREETING, INTERVIEW_SYSTEM, TURN_SCHEMA, planSystem, PLAN_SCHEMA } from "./prompts.js";

const RESOURCES = [...seed.resources, ...added.resources];
const BY_ID = new Map(RESOURCES.map(r => [r.id, r]));
const entry = id => BY_ID.get(id);
// Built once so the cached prefix is byte-identical on every request.
const PLAN_SYSTEM = planSystem(JSON.stringify(RESOURCES), JSON.stringify(staff.answers));

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8" },
});

function claude(env) {
  if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error("No Claude API key. Add ANTHROPIC_API_KEY to .dev.vars and restart."), { status: 503 });
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

function readJson(res) {
  if (res.stop_reason === "refusal") throw Object.assign(new Error("Claude declined this request."), { status: 422 });
  if (res.stop_reason === "max_tokens") throw Object.assign(new Error("Claude's answer was cut off."), { status: 502 });
  const text = res.content.find(b => b.type === "text")?.text;
  if (!text) throw Object.assign(new Error("Claude returned no answer."), { status: 502 });
  return JSON.parse(text);
}

// POST /api/turn  { history: [{who: "sal"|"client", text}], lang }
async function turn(req, env) {
  const { history = [], lang = "en" } = await req.json();
  const l = lang.startsWith("es") ? "es" : "en";
  if (!history.length) return json({ reply: GREETING[l], card_updates: [], ready_for_plan: false });

  const last = history[history.length - 1];
  const kind = last.who === "client" ? checkSafety(last.text) : null;
  if (kind) {
    const s = safetyReply(kind, l, entry);
    return json({ reply: s.reply, card_updates: kind === "medical" ? [] : [{ field: "other", value: "Safety concern raised" }],
      ready_for_plan: false, safety: { kind, stop: s.stop, alert: s.alert } });
  }

  const messages = [{ role: "user", content: "(The client has sat down. Sal greets them.)" }];
  for (const h of history) messages.push({ role: h.who === "sal" ? "assistant" : "user", content: h.text });
  // Keep interviews short: after 6 answers, Sal reads back what it heard; once that's confirmed, it hands off.
  const answers = history.filter(h => h.who === "client").length;
  const summarized = history.some(h => h.who === "sal" && /here's what i heard|esto es lo que escuché/i.test(h.text));
  if (summarized && answers >= 2) messages.push({ role: "system", content: "Sal already read back a summary. If the client agreed (even loosely, like 'yes' or 'that's right'), set ready_for_plan to true and say you'll find their next step now. If they corrected something, record it and set ready_for_plan to true." });
  else if (answers >= 6) messages.push({ role: "system", content: "You have enough. Read back the summary now, starting with \"Here's what I heard\" (Spanish: \"Esto es lo que escuché\"), and ask if it's right." });
  const t0 = Date.now();
  const res = await claude(env).messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 2000,
    system: INTERVIEW_SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: TURN_SCHEMA } },
    messages,
  });
  return json({ ...readJson(res), ms: Date.now() - t0 });
}

// POST /api/plan  { card, transcript, lang }
async function plan(req, env) {
  const { card = {}, transcript = "", lang = "en" } = await req.json();
  const context = JSON.stringify(card) + "\n" + transcript;
  const t0 = Date.now();
  const res = await claude(env).beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: PLAN_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: PLAN_SCHEMA } },
    messages: [{ role: "user", content: `Client language: ${lang}\n\nClient card:\n${JSON.stringify(card, null, 1)}\n\nInterview transcript:\n${transcript}` }],
  });
  const checked = checkPlan(readJson(res), RESOURCES, context);
  if (lang.startsWith("es")) checked.reading_grade = null;
  return json({ ...checked, ms: Date.now() - t0, usage: { cached: res.usage?.cache_read_input_tokens ?? 0 } });
}

// POST /api/speak  { text, lang }  → audio/mpeg in Grok's Lumen voice
async function speak(req, env) {
  if (!env.XAI_API_KEY) return json({ error: "No Grok key. Add XAI_API_KEY to .dev.vars to use the Lumen voice." }, 503);
  const { text = "", lang = "en" } = await req.json();
  const r = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: { authorization: `Bearer ${env.XAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 2000), voice_id: "lumen", language: lang.startsWith("es") ? "es-MX" : "en-US",
      output_format: { codec: "mp3", sample_rate: 24000 } }),
  });
  if (!r.ok) return json({ error: `Grok voice returned ${r.status}` }, 502);
  return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    try {
      if (req.method === "POST" && pathname === "/api/turn") return await turn(req, env);
      if (req.method === "POST" && pathname === "/api/plan") return await plan(req, env);
      if (req.method === "POST" && pathname === "/api/speak") return await speak(req, env);
      if (pathname === "/api/status") return json({ claude: !!env.ANTHROPIC_API_KEY, grok: !!env.XAI_API_KEY, resources: RESOURCES.length });
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);
      return json({ error: e.message || "Something went wrong." }, e.status || 500);
    }
  },
};

export { readingGrade };
