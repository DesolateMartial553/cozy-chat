/* Cozy — the app itself: chat, saved on this phone, nothing leaves it but you and the model. */
'use strict';

/* ---------- state (localStorage only) ---------- */
const STORE = 'cozy-chat-v1';

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function titleOf(messages) {
  const first = messages.find(m => m.role === 'user');
  return first ? first.text.replace(/\s+/g, ' ').trim().slice(0, 48) : '';
}

const savedRaw = JSON.parse(localStorage.getItem(STORE) || '{}');
const state = {
  provider: savedRaw.provider || 'gemini',
  key: savedRaw.key || '',
  model: savedRaw.model || '',
  chats: Array.isArray(savedRaw.chats) ? savedRaw.chats : [],
  currentId: savedRaw.currentId || '',
  messages: [],
};
/* migration from the one-chat version: wrap its messages in a saved chat */
if (!state.chats.length && Array.isArray(savedRaw.messages) && savedRaw.messages.length) {
  state.chats = [{
    id: newId(), title: titleOf(savedRaw.messages),
    created: Date.now(), updated: Date.now(), messages: savedRaw.messages,
  }];
  state.currentId = state.chats[0].id;      // it becomes the chat she is in
}
state.chats.forEach(c => { c.messages = c.messages || []; });

/* keep max this many conversations, and never lose the one being used */
const MAX_CHATS = 40;

function currentChat() { return state.chats.find(c => c.id === state.currentId) || null; }
function ensureChat() {
  let c = currentChat();
  if (!c) {
    c = { id: newId(), title: '', created: Date.now(), updated: Date.now(), messages: [] };
    state.chats.unshift(c);
    state.currentId = c.id;
  }
  state.messages = c.messages;               // one array, shared
  return c;
}
function touchChat() {
  const c = ensureChat();
  c.updated = Date.now();
  if (!c.title) c.title = titleOf(c.messages);
}
function save() {
  if (currentChat()) currentChat().messages = state.messages;
  state.chats.sort((a, b) => b.updated - a.updated);
  while (state.chats.length > MAX_CHATS) {
    const old = state.chats.pop();            // pop drops the oldest (list is newest-first)
    if (old.id === state.currentId) { state.chats.unshift(old); break; }
  }
  localStorage.setItem(STORE, JSON.stringify({
    provider: state.provider, key: state.key, model: state.model,
    chats: state.chats, currentId: state.currentId,
  }));
}

const $ = id => document.getElementById(String(id).replace(/^#/, ''));
const chat = $('chat'), input = $('input');

/* ---------- markdown-lite (safe: escape first, then add effects) ---------- */
function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"' }[c])); }
function mdLite(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .split('\n')
    .map(l => {
      if (/^#{1,3} /.test(l)) return `<h4>${l.replace(/^#{1,3} /, '')}</h4>`;
      if (/^[-•*] /.test(l))  return `<p>▸ ${l.slice(2)}</p>`;
      if (!l.trim())          return `<p class="br"></p>`;   // a small breath, not a whole blank line
      return `<p>${l}</p>`;
    })
    .join('');
}

/* ---------- rendering ---------- */
function renderGreeting() {
  const el = document.createElement('div');
  el.className = 'hello';
  el.innerHTML = `
    <div class="cat">  /\\_/\\
 ( ^.^ )
  > ^ <</div>
    <div class="greet">hello, you. ♡</div>
    <div class="sub">just us in here, princess</div>`;
  chat.appendChild(el);
}

function addMsg(role, text, live) {
  const wrap = document.createElement('div');
  wrap.className = `msg msg-${role}`;
  wrap.innerHTML = `
    <div class="roles">${role === 'user' ? '❯ you' : '✿ cozy'}</div>
    <div class="body"></div>`;
  const body = wrap.querySelector('.body');
  if (live) { body.classList.add('typing'); body.innerHTML = '<i></i>'; }
  else body.innerHTML = mdLite(text);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return body;
}

function renderAll() {
  chat.innerHTML = '';
  renderGreeting();
  state.messages.forEach(m => addMsg(m.role === 'user' ? 'user' : 'ai', m.text));
  if (!state.messages.length) notepadHint();
}

/* a first thing to try, shown as a reply line so the page never looks empty */
function notepadHint() {
  const body = addMsg('ai',
    '**Hello, lovely. Welcome to your little corner.** 💗\n\n'
    + '• **To keep me on your home screen:** tap `⋮` (top right in Chrome) → **Add to Home screen**. No app stores needed.\n\n'
    + '• **To chat for real:** tap **MENU › API key** and pop your key in. Until then, I am in practice mode and happy to keep you company.\n\n'
    + 'Type whatever you like in the box below whenever you are ready — and do not '
    + 'worry about keeping track: every chat keeps itself in MENU › Chats.');
  body.parentElement.dataset.hint = '1';
}

function flash(text, kind) {
  const f = $('flash');
  f.textContent = text;
  f.dataset.kind = kind || '';
  f.hidden = false;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { f.hidden = true; }, 6000);
}

/* ---------- sending ---------- */
let busy = false;

async function send() {
  const text = input.value.trim();
  if (!text || busy) return;

  if (!state.key && state.provider !== 'demo') { openMenu('key'); flash('One small thing before we chat — add your key (a minute, once).', 'warn'); return; }
  if (!state.model) {
    flash('Choosing a model for you…', 'warn');
    try { await pickDefaultModel(); } catch { openMenu('model'); return; }
  }

  if (chat.querySelector('[data-hint]')) { const h = chat.querySelector('[data-hint]'); h.remove(); }

  state.messages.push({ role: 'user', text });
  addMsg('user', text);
  input.value = ''; touchChat(); save();

  busy = true; $('btnSend').disabled = true;
  const body = addMsg('ai', '', true);
  const ctrl = new AbortController();
  const full = { role: 'ai', text: '' };
  body._live = { ctrl, full };

  try {
    const p = providerOf(state.provider);
    for await (const chunk of p.stream({
      key: state.key, model: state.model,
      history: state.messages.slice(-24), signal: ctrl.signal,
    })) {
      full.text += chunk;
      body.classList.remove('typing');
      body.innerHTML = mdLite(full.text) + '<i></i>';
      chat.scrollTop = chat.scrollHeight;
    }
    if (!full.text.trim()) full.text = '…it went quiet. Try again?';
    body.innerHTML = mdLite(full.text);
    state.messages.push(full); touchChat(); save();
  } catch (e) {
    if (e.name === 'AbortError') {
      body.innerHTML = mdLite(full.text || '(stopped)');
      if (full.text.trim()) { state.messages.push(full); save(); }
    } else {
      body.innerHTML = mdLite(full.text);
      flash(e.message || 'Something went wrong.', 'warn');
      if (e.message && /key|model/i.test(e.message)) openMenu('key');
    }
  } finally {
    busy = false; $('btnSend').disabled = false;
    input.focus();
    chat.scrollTop = chat.scrollHeight;
  }
}

async function pickDefaultModel() {
  const ids = await providerOf(state.provider).models(state.key);
  const pick = ids.find(m => /flash|mini|lite/i.test(m)) || ids[0];
  if (!pick) throw new Error('no models');
  state.model = pick; save();
  flash(`Model: ${state.model}`);
}

/* ---------- the menu sheet ---------- */
const sheetWrap = $('sheetWrap');

function closeSheet() { sheetWrap.hidden = true; }
function openSheet(view) { $('sheetBody').innerHTML = VIEWS[view](); postRender(); sheetWrap.hidden = false; }
function openMenu(view) { openSheet(view); }

function sheetFooter(view) {
  return `<button class="back" data-view="main">← back to menu</button>`;
}

const PROVIDER_NOTE = {
  gemini: 'Google gives a free key at <b>aistudio.google.com/apikey</b> (needs a Google account).',
  openrouter: 'OpenRouter gives free models; get a key at <b>openrouter.ai/keys</b>.',
  demo: 'No key needed — practice mode with two canned replies, to see how it feels.',
};

const VIEWS = {
  main() {
    const savedChats = state.chats.filter(c => c.messages.length).length;
    return `
      <button class="item" data-view="chats">  <span>Chats</span>       <b>${savedChats}</b></button>
      <button class="item" data-view="key">    <span>API key</span>    <b>${state.key ? 'saved ✓' : 'needed'}</b></button>
      <button class="item" data-view="model">  <span>Model</span>      <b>${state.model ? esc(state.model).slice(0, 18) : 'pick'}</b></button>
      <button class="item" data-view="about">  <span>About / help</span><b>?</b></button>
      <button class="item danger" data-act="delCurrent"> <span>Delete this chat</span> <b>x</b></button>
      <div class="note">Your chats and key live in this browser on this phone only.
        Everything you talk about is kept in <b>Chats</b>, so a new chat never loses an old one.</div>`;
  },

  chats() {
    const list = state.chats.filter(c => c.messages.length);
    const rows = list.map(c => {
      const title = c.title ? esc(c.title) : '<i>a quiet little chat</i>';
      const here = c.id === state.currentId ? ' <b>·now</b>' : '';
      return `<div class="chatrow">
        <button class="item grow" data-act="openChat" data-chat="${c.id}">
          <span>${title}${here}</span><b>${whenLabel(c.updated)}</b>
        </button>
        <button class="item del" data-act="delChat" data-chat="${c.id}" aria-label="delete this chat">✕</button>
      </div>`;
    }).join('');
    return `
      <div class="note">Everything you have talked about, kept here on your phone.
        Tap one to carry on where you left off.</div>
      ${rows || '<div class="note">Nothing saved yet — your first chat will appear here, and stay.</div>'}
      <div class="row"><button class="pill ok" data-act="newChat">+ a fresh chat</button></div>
      ${sheetFooter('chats')}`;
  },

  key() {
    return `
      <div class="field">
        <label>Provider</label>
        <select id="fProvider">
          <option value="gemini" ${state.provider === 'gemini' ? 'selected' : ''}>Gemini (Google AI Studio)</option>
          <option value="openrouter" ${state.provider === 'openrouter' ? 'selected' : ''}>OpenRouter (free models)</option>
          <option value="demo" ${state.provider === 'demo' ? 'selected' : ''}>Demo (no key, pretend)</option>
        </select>
      </div>
      <div class="note" id="providerNote">${PROVIDER_NOTE[state.provider]}</div>
      <div class="field">
        <label>API key (stays on your phone)</label>
        <input id="fKey" type="password" autocomplete="off" spellcheck="false" placeholder="paste the key here">
      </div>
      <div class="row">
        <button class="pill" id="btnTestKey">test</button>
        <button class="pill ok" id="btnSaveKey">save</button>
      </div>
      ${sheetFooter('key')}`;
  },

  model() {
    return `
      <div class="note">Tap “load”, then pick one. For Gemini, “flash” ones are quick and free.</div>
      <div class="row">
        <button class="pill ok" id="btnLoadModels">load the list</button>
        <button class="pill" data-view="main">close</button>
      </div>
      <div id="modelList"></div>
      ${sheetFooter('model')}`;
  },

  about() {
    return `
      <div class="note">
        <b>Cozy</b> — a tiny, private AI chat, made for someone dear. 💗<br><br>
        · <b>Keep it on your phone:</b> Tap the menu (three dots <b>⋮</b> top right in Chrome) and choose <b>“Add to Home screen”</b> or <b>“Install”</b>. It gets its own icon on your home screen.<br>
        · <b>How to set up:</b> It starts in practice mode. When you want the real AI, tap <b>MENU › API key</b> and paste the key set up for you.<br>
        · <b>Privacy:</b> Your chats stay saved on your phone. Nothing leaves unless you press send to the AI.<br>
        · <b>Everything is kept:</b> MENU › Chats holds your conversations — start a new one as often as you like, nothing old is lost.<br>
        · Made with love (and a fair few late nights), in Birmingham.
      </div>
      ${sheetFooter('about')}`;
  },
};

/* menu wiring: clicks in one place */
$('sheetBody').addEventListener('click', async (ev) => {
  const actPill = ev.target.closest('[data-act]');
  const viewBtn = ev.target.closest('[data-view]');
  if (viewBtn) { openSheet(viewBtn.dataset.view); return; }
  if (actPill && actPill.dataset.act === 'openChat') {
    openChatById(actPill.dataset.chat);
    return;
  }
  if (actPill && actPill.dataset.act === 'newChat') { startNewChat(); return; }
  if (actPill && actPill.dataset.act === 'delChat') {
    if (confirm('Let this chat go? It cannot be brought back.')) deleteChat(actPill.dataset.chat);
    else openSheet('chats');
    return;
  }
  if (actPill && actPill.dataset.act === 'delCurrent') {
    if (confirm('Let this chat go? It cannot be brought back.')) {
      deleteChat(state.currentId);
    }
    return;
  }
  if (actPill && actPill.dataset.act === 'pick') {
    state.model = actPill.dataset.model; save();
    flash(`Model: ${state.model}`);
    closeSheet();
    return;
  }
  if (ev.target.closest('#btnTestKey')) {
    const prv = $('#fProvider').value, key = $('#fKey').value.trim();
    if (!key) { flash('Paste a key first.', 'warn'); return; }
    const btn = ev.target.closest('#btnTestKey');
    btn.disabled = true; btn.textContent = 'checking…';
    const r = await testKey(prv, key);
    btn.disabled = false; btn.textContent = 'test';
    flash(r.ok ? `${r.msg} e.g. ${r.firstModel}` : r.msg, r.ok ? '' : 'warn');
    return;
  }
  if (ev.target.closest('#btnSaveKey')) {
    const prv = $('#fProvider').value, key = $('#fKey').value.trim();
    if (prv !== 'demo' && !key) { flash('Paste a key first.', 'warn'); return; }
    const btn = ev.target.closest('#btnSaveKey');
    const r = prv === 'demo' ? { ok: true } : await (async () => {
      btn.disabled = true; btn.textContent = 'checking…';
      const rr = await testKey(prv, key);
      btn.disabled = false; btn.textContent = 'save';
      return rr;
    })();
    if (!r.ok) { flash(r.msg, 'warn'); return; }       // a dead key never gets saved
    state.provider = prv;                // the saved key belongs to this provider
    state.key = key; state.model = '';
    save(); closeSheet();
    flash('Key saved safely. Choosing a quick model for you…');
    try { await pickDefaultModel(); } catch { openSheet('model'); }
    return;
  }
  if (ev.target.closest('#btnLoadModels')) {
    const list = $('sheetBody').querySelector('#modelList');
    if (!list) return;
    list.textContent = 'loading…';
    try {
      const ids = await providerOf(state.provider).models(state.key);
      list.innerHTML = ids.length
        ? ids.map(id => `<button class="item" data-act="pick" data-model="${esc(id)}"><span>${esc(id)}</span><b>pick</b></button>`).join('')
        : '<div class="note">None found. Check the key, or type the model name in MENU.</div>';
    } catch (e) { list.innerHTML = `<div class="note">${esc(e.message)}</div>`; }
  }
});

/* after a view is drawn, wire the provider <select> so its help note swaps at once */
function postRender() {
  const sel = $('sheetBody').querySelector('#fProvider');
  if (sel) sel.onchange = () => {
    const note = $('sheetBody').querySelector('#providerNote');
    if (note) note.innerHTML = PROVIDER_NOTE[sel.value];
  };
}

/* ---------- chats: open, start fresh, delete ---------- */
function whenLabel(ts) {
  const d = new Date(ts), now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function openChatById(id) {
  save();
  const c = state.chats.find(c => c.id === id);
  if (!c) return;
  state.currentId = id;
  state.messages = c.messages;
  save(); renderAll(); closeSheet();
}
function startNewChat() {
  save();
  const c = { id: newId(), title: '', created: Date.now(), updated: Date.now(), messages: [] };
  state.chats.unshift(c);
  state.currentId = c.id;
  state.messages = c.messages;
  save(); renderAll(); closeSheet(); input.focus();
  flash('A fresh page — the old chat is kept in MENU › Chats.');
}
function deleteChat(id) {
  const c = state.chats.find(c => c.id === id);
  state.chats = state.chats.filter(c => c.id !== id);
  if (state.currentId === id) {           // start a clean page after removing this one
    const fresh = { id: newId(), title: '', created: Date.now(), updated: Date.now(), messages: [] };
    state.chats.unshift(fresh);
    state.currentId = fresh.id;
    state.messages = fresh.messages;
    renderAll();
  }
  save();
  flash(c && c.title ? `“${c.title.slice(0, 24)}” is gone.` : 'Chat deleted.');
  if (!$('sheetWrap').hidden) openSheet('chats');
}

/* ---------- header buttons ---------- */
$('btnMenu').addEventListener('click', () => openSheet('main'));
$('btnNew').addEventListener('click', () => {
  if (!state.messages.length) return;      // already a clean page
  startNewChat();
});
document.querySelectorAll('[data-close]').forEach(el =>
  el.addEventListener('click', closeSheet));

/* ---------- composer ---------- */
$('composer').addEventListener('submit', (e) => { e.preventDefault(); send(); });

/* keyboard shortcut for desktop testing */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});

/* ---------- service worker (offline shell) ---------- */
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});   // file:// just skips it
}

/* ---------- start ---------- */
ensureChat();          // always have a (possibly empty) current chat
renderAll();
input.focus();
