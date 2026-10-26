/* Cozy — talking to the AI models (no build tools, no framework).
   Two providers, both free-ish and browser-CORS-friendly:
   gemini      Google AI Studio key           https://aistudio.google.com/apikey
   openrouter  OpenRouter key (free models)   https://openrouter.ai/keys          */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/* The warm persona. Kept short on purpose. */
const SYSTEM_PROMPT = [
  'You are Cozy, a warm and encouraging personal assistant on someone\u2019s phone.',
  'Talk in clear, friendly British English \u2014 like a kind friend who is good at research.',
  'Be honest: if you are not sure, say so; never invent facts, prices or links.',
  'Keep answers tight and easy to read on a small phone: short paragraphs and bullet lists.',
  'Money in pounds sterling unless told otherwise.',
].join('\n');

function friendlyError(status, raw) {
  const msg = (raw && raw.message) ? raw.message : '';
  if (status === 400 || status === 401 || status === 403)
    return 'That key was not accepted. Check it (and the provider) in MENU > API key.';
  if (status === 404)
    return 'That model name is not available on your key. Pick another in MENU > Model.';
  if (status === 429)
    return 'Tiny pause needed \u2014 the free tier is busy right now. Try again in a minute.';
  if (status >= 500)
    return 'The provider hiccupped (their side, not yours). Try again in a moment.';
  return msg ? `Could not reach the model: ${msg}` : 'Could not reach the model just now.';
}

async function readError(res) {
  try {
    const j = await res.json();
    return friendlyError(res.status, j.error || j);
  } catch {
    return friendlyError(res.status, null);
  }
}

/* ---------- streaming parsers (SSE) ---------- */
async function* sseChunks(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
}

/* ---------- Gemini ---------- */
async function* geminiStream({ key, model, history, signal }) {
  const contents = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }));
  const res = await fetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
    {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.8, maxOutputTokens: 1200 },
      }),
    }
  );
  if (!res.ok || !res.body) throw new Error(await readError(res));
  for await (const data of sseChunks(res)) {
    if (data === '[DONE]') return;
    try {
      const j = JSON.parse(data);
      const parts = j.candidates?.[0]?.content?.parts || [];
      const text = parts.map(p => p.text || '').join('');
      if (text) yield text;
      if (j.promptFeedback?.blockReason)
        yield `\n(the model did not reply: ${j.promptFeedback.blockReason})`;
    } catch { /* partial line, ignore */ }
  }
}

async function geminiModels(key) {
  const res = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(key)}&pageSize=100`);
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json();
  return (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .sort();
}

/* ---------- OpenRouter ---------- */
async function* openrouterStream({ key, model, history, signal }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
  ];
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST', signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 1200 }),
  });
  if (!res.ok || !res.body) throw new Error(await readError(res));
  for await (const data of sseChunks(res)) {
    if (data === '[DONE]') return;
    try {
      const j = JSON.parse(data);
      const text = j.choices?.[0]?.delta?.content || '';
      if (text) yield text;
      if (j.error) { yield `\n${j.error.message || 'the model stopped early'}`; return; }
    } catch { /* partial line, ignore */ }
  }
}

async function openrouterModels(key) {
  const res = await fetch(`${OPENROUTER_BASE}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json();
  return (j.data || []).map(m => m.id).filter(id => id.endsWith(':free')).sort();
}

/* ---------- Demo provider: no key, no network — she can play before setting one up ---------- */
const DEMO_REPLIES = [
  'Not really an answer yet — this is the **demo model**, the practice one.\n\nAdd a real key in MENU > API key and I will genuinely answer. But hello! I am very pleased you are here. 💗',
  'Hello there! Still demo mode, I am afraid — I only know a couple of lines.\n\nThe real me appears as soon as you add a key in MENU > API key.',
];
function demoStream({ history }) {
  const last = history.filter(m => m.role === 'user').pop();
  const reply = last && last.text
    ? DEMO_REPLIES[(last.text.length + history.length) % DEMO_REPLIES.length]
    : DEMO_REPLIES[0];
  const words = reply.replace(/\*\*/g, '').split(/(\s+)/);
  let i = 0;
  return (async function* () {
    for (const w of words) {
      if (!w) continue;
      yield w;
      await new Promise(r => setTimeout(r, 18));
    }
  })();
}
const demoModels = async () => ['cozy-demo'];

/* ---------- the one switch used by app.js ---------- */
function providerOf(name) {
  if (name === 'demo') return { stream: demoStream, models: demoModels };
  return name === 'openrouter'
    ? { stream: openrouterStream, models: openrouterModels }
    : { stream: geminiStream, models: geminiModels };
}

/* quick key check used by the key screen */
async function testKey(provider, key) {
  try {
    const ids = await providerOf(provider).models(key);
    if (!ids.length) return { ok: false, msg: 'The key works, but no usable models came back. Try the other provider.' };
    return { ok: true, msg: 'Key works.', firstModel: ids[0] };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}
