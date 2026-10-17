// The checker. Runs on every plan after Claude writes it and before anyone sees it.
// Claude refers to facts as {{phone:entry-id}}; only this file turns them into values.

const FIELDS = ["phone", "address", "hours", "website", "name", "city"];
const PLACEHOLDER = /\{\{(\w+):([a-z0-9-]+)\}\}/g;

const norm = s => String(s ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

function entryText(e) {
  return norm([e.name, e.organization, e.description, e.eligibility, e.how_to_access, e.hours, e.cost, e.notes,
    e.source_quote, ...(e.services || []), ...(e.population || []), ...(e.languages || [])].join(" | "));
}

// Numbers Claude may repeat: the ones the client said, 9-1-1, and numbers printed in the entries this plan cites.
const NUM = /\d[\d,.\-]*/g;
function allowedNumbers(context, citedEntries) {
  const out = new Set(["9-1-1", "911"]);
  const add = t => (String(t).match(NUM) || []).forEach(n => { n = n.replace(/[,.\-]+$/, ""); out.add(n); out.add(n.replace(/-/g, "")); });
  add(context);
  for (const e of citedEntries) add([e.phone, e.hours, e.eligibility, e.description, e.notes, e.cost, e.source_quote, e.name, ...(e.services || [])].join(" "));
  return out;
}

// Removes digits Claude wrote itself, leaving {{placeholders}} untouched. Returns the cleaned text and what was removed.
function stripDigits(text, allowed) {
  const removed = [];
  const out = String(text).split(/(\{\{\w+:[a-z0-9-]+\}\})/g).map((part, i) => i % 2 ? part : part.replace(/\$?\d[\d,.\-]*\d|\$?\d/g, m => {
    const t = m.replace(/^\$/, "").replace(/[,.\-]+$/, "");
    if (allowed.has(t) || allowed.has(t.replace(/-/g, ""))) return m;
    removed.push(m);
    return "[number removed]";
  })).join("");
  return { out, removed };
}

function fill(text, byId, used, missing) {
  return String(text).replace(PLACEHOLDER, (_, field, id) => {
    const e = byId.get(id);
    if (!e || !FIELDS.includes(field)) { missing.push(`${field}:${id}`); return "[not on the checked list]"; }
    used.add(id);
    if (field === "address" && (e.referral_required || e.category === "safety")) return "(referral only, so no walk-ins; ask your case manager)";
    const v = e[field];
    if (v == null || v === "") return field === "phone" ? "(no public phone; ask staff)" : "(not listed; ask staff)";
    return String(v);
  });
}

export function checkPlan(plan, resources, context) {
  const byId = new Map(resources.map(r => [r.id, r]));
  const allText = JSON.stringify([plan.today_steps, plan.bring, plan.client_message]);
  const cited = new Set([...(plan.needs || []).flatMap(n => (n.options || []).map(o => o.entry_id)),
    ...[...allText.matchAll(PLACEHOLDER)].map(m => m[2])].filter(id => byId.has(id)));
  const allowed = allowedNumbers(context, [...cited].map(id => byId.get(id)));
  const used = new Set(), missing = [], dropped = [], removedDigits = [];

  const needs = (plan.needs || []).map(n => {
    const options = [];
    for (const o of n.options || []) {
      const e = byId.get(o.entry_id);
      if (!e) { dropped.push({ ...o, need: n.need, why: "This entry isn't on the checked list." }); continue; }
      if (!o.quote || !entryText(e).includes(norm(o.quote))) {
        dropped.push({ ...o, need: n.need, why: "The quote doesn't appear in this entry, so the reason can't be trusted." });
        continue;
      }
      const r = stripDigits(o.reason, allowed); removedDigits.push(...r.removed);
      used.add(e.id);
      options.push({
        ...o, reason: r.out,
        entry: {
          id: e.id, name: e.name, phone: e.phone, address: e.referral_required || e.category === "safety" ? null : e.address,
          city: e.city, hours: e.hours, website: e.website, source_url: e.source_url, verified_date: e.verified_date,
          confidence: e.confidence, referral_required: e.referral_required, notes: e.notes,
        },
      });
    }
    return { need: n.need, options };
  });

  // Client-facing text: strip Claude's own digits first, then fill placeholders from the data.
  const clean = t => { const r = stripDigits(t, allowed); removedDigits.push(...r.removed); return fill(r.out, byId, used, missing); };
  const today_steps = (plan.today_steps || []).map(clean);
  const bring = (plan.bring || []).map(clean);
  const client_message = clean(plan.client_message || "");

  const sources = [...used].map(id => byId.get(id)).map(e => ({
    id: e.id, name: e.name, verified_date: e.verified_date, confidence: e.confidence, source_url: e.source_url,
    call_first: e.confidence !== "high", notes: e.notes,
  }));

  return {
    needs, today_steps, bring, client_message,
    unknowns: plan.unknowns || [], ask_staff: plan.ask_staff || [],
    sources, check: { dropped, removed_digits: removedDigits, missing_placeholders: missing },
    reading_grade: readingGrade(client_message),
  };
}

// Flesch-Kincaid grade level, English only. Rough, but enough to keep messages simple.
export function readingGrade(text) {
  const words = String(text).match(/[A-Za-z']+/g) || [];
  if (words.length < 5) return null;
  const sentences = Math.max(1, (String(text).match(/[.!?]+/g) || []).length);
  const syl = w => { w = w.toLowerCase().replace(/e$/, ""); const m = w.match(/[aeiouy]+/g); return Math.max(1, m ? m.length : 1); };
  const syllables = words.reduce((s, w) => s + syl(w), 0);
  return Math.max(0, Math.round((0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59) * 10) / 10);
}
