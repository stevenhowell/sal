// Safety checks that run before any AI call. Plain code, so they can't drift.
// Replies here are written by people. Phone numbers come from data entries, never from a model.

const DANGER = [
  /\b(he|she|they)('ll| will| is going to| gonna)? (find|hurt|kill|get) me\b/i,
  /\bnot safe\b/i, /\bunsafe\b/i, /\bafraid (of|for) (him|her|them|my life)\b/i,
  /\b(hits|hit|beats|beat|hurts|hurt|chokes|choked) me\b/i, /\bdomestic violence\b/i,
  /\bcan'?t go back there\b/i, /\bin danger\b/i, /\bthreaten(ed|s|ing)? me\b/i,
  /\bme va a (encontrar|matar|pegar|hacer daño)\b/i, /\bno estoy segura?\b/i, /\bme pega\b/i,
  /\btengo miedo de (él|ella)\b/i, /\bpeligro\b/i, /\bviolencia doméstica\b/i,
];
const SELF_HARM = [
  /\b(kill|hurt) myself\b/i, /\bsuicid/i, /\bend (it all|my life)\b/i, /\bdon'?t want to (live|be alive)\b/i,
  /\bwant to die\b/i, /\bquitarme la vida\b/i, /\bmatarme\b/i, /\bno quiero vivir\b/i,
];
const MEDICAL = [
  /\b(pill|pills|medication|medications|medicine|meds|dose|dosage|prescription|insulin)\b/i,
  /\bcan i (just )?stop taking\b/i, /\bside effect/i, /\b(pastilla|pastillas|medicina|medicamento|dosis)\b/i,
];

export function checkSafety(text) {
  if (SELF_HARM.some(r => r.test(text))) return "self-harm";
  if (DANGER.some(r => r.test(text))) return "danger";
  if (MEDICAL.some(r => r.test(text))) return "medical";
  return null;
}

// entry(id) returns a checked resource; phone numbers are read from it, not typed here.
export function safetyReply(kind, lang, entry) {
  const es = lang.startsWith("es");
  if (kind === "danger") {
    const h = entry("national-domestic-violence-hotline");
    return {
      stop: true, alert: "Staff called to the room (simulated). The interview stopped and nothing is saved.",
      sources: [h.id],
      reply: es
        ? `Gracias por decírmelo. Tu seguridad es lo primero. Estoy llamando a alguien del equipo ahora mismo. Si estás en peligro en este momento, llama al 9-1-1. La línea nacional contra la violencia doméstica es ${h.phone}, a cualquier hora. No voy a guardar esta conversación.`
        : `Thank you for telling me. Your safety comes first. I'm getting a staff member to you right now. If you're in danger this minute, call 9-1-1. The National Domestic Violence Hotline is ${h.phone}, any time. I won't save this conversation.`,
    };
  }
  if (kind === "self-harm") {
    const h = entry("988-suicide-and-crisis-lifeline");
    return {
      stop: true, alert: "Staff called to the room (simulated). The interview stopped.",
      sources: [h.id],
      reply: es
        ? `Gracias por decírmelo. Estoy llamando a alguien del equipo ahora mismo. Puedes llamar o mandar un texto al ${h.phone} a cualquier hora. Si estás en peligro ahora, llama al 9-1-1.`
        : `Thank you for telling me. I'm getting a staff member to you right now. You can call or text ${h.phone} any time. If you're in danger right now, call 9-1-1.`,
    };
  }
  if (kind === "medical") {
    return {
      stop: false, alert: "Medical question passed to the nurse (simulated).", sources: [],
      reply: es
        ? "Esa es una buena pregunta para tu enfermera o tu administrador de caso. No puedo dar consejos médicos. Les voy a avisar. ¿Seguimos con tus próximos pasos?"
        : "That's a good question for your nurse or case manager. I can't give medical advice. I'll let them know. Shall we keep going with your next steps?",
    };
  }
  return null;
}
