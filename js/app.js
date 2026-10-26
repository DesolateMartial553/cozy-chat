/* Cozy — the app itself: chat, saved on this phone, nothing leaves it but you and the model. */
'use strict';

/* ---------- state (localStorage only) ---------- */
const STORE = 'cozy-chat-v1';
const state = Object.assign(
  { provider: 'gemini', key: '', model: '', messages: [] },
  JSON.parse(localStorage.getItem(STORE) || '{}')
);
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }

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
    <div class="greet">hello, you.</div>
    <div class="sub">a quiet place to think · everything stays on your phone</div>`;
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
    '**So, how is your day going?**\n\n'
    + 'I can help with plans, recipes, homework questions, gift ideas, '
    + 'or anything you fancy looking up. Tap a message and just speak in your own words.');
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

  if (!state.key && state.provider !== 'demo') { openMenu('key'); flash('Add your API key first — one tap, once.', 'warn'); return; }
  if (!state.model) {
    flash('Choosing a model for you…', 'warn');
    try { await pickDefaultModel(); } catch { openMenu('model'); return; }
  }

  if (chat.querySelector('[data-hint]')) { const h = chat.querySelector('[data-hint]'); h.remove(); }

  state.messages.push({ role: 'user', text });
  addMsg('user', text);
  input.value = ''; save();

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
    state.messages.push(full); save();
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
    return `
      <button class="item" data-view="key">    <span>API key</span>    <b>${state.key ? 'saved ✓' : 'needed'}</b></button>
      <button class="item" data-view="model">  <span>Model</span>      <b>${state.model ? esc(state.model).slice(0, 18) : 'pick'}</b></button>
      <button class="item" data-view="about">  <span>About / help</span><b>?</b></button>
      <button class="item danger" data-act="clear"> <span>Clear the chat</span> <b>x</b></button>
      <div class="note">Everything (chat + key) lives in this browser on this phone only.
        Backup = none; clearing the app\'s site data resets Cozy.</div>`;
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
        <b>Cozy</b> — a tiny, private AI chat for a phone.<br><br>
        · Your chat and your key are saved only on this phone.<br>
        · The AI provider sees your messages (it answers them), nothing else sees them.<br>
        · To put Cozy on your home screen: <b>⋮ menu → “Add to Home screen”</b> in Chrome.<br>
        · To upload a photo of something you want discussed — not yet! Ask the person who built this.<br>
        · Built with love, in Birmingham.
      </div>
      ${sheetFooter('about')}`;
  },
};

/* menu wiring: clicks in one place */
$('sheetBody').addEventListener('click', async (ev) => {
  const actPill = ev.target.closest('[data-act]');
  const viewBtn = ev.target.closest('[data-view]');
  if (viewBtn) { openSheet(viewBtn.dataset.view); return; }
  if (actPill && actPill.dataset.act === 'clear') {
    if (confirm('Clear the whole chat? (This cannot be undone.)')) {
      state.messages = []; save(); renderAll(); closeSheet();
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
    flash('Key saved. Choosing a quick model…');
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

/* ---------- header buttons ---------- */
$('btnMenu').addEventListener('click', () => openSheet('main'));
$('btnNew').addEventListener('click', () => {
  if (!state.messages.length) return;
  state.messages = []; save(); renderAll();
  $('barTitle').textContent = 'cozy ✿';
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
renderAll();
input.focus();
