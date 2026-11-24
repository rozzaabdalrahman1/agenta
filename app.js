import { MODELS, buildRequest, readStream, explainHttpError } from './api.js';
import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
let chats = store.get('chats', []);
let currentId = store.get('currentId', null);
let settings = { mode: 'byok', proxyUrl: '', system: '', maxTokens: 4096, model: MODELS[0].id, remember: false, ...store.get('settings', {}) };
let abort = null;

function getKey() { return sessionStorage.getItem('apiKey') || localStorage.getItem('apiKey') || ''; }
function saveSettings() { store.set('settings', settings); }
function saveChats() { store.set('chats', chats); store.set('currentId', currentId); }
function current() { return chats.find((c) => c.id === currentId); }

function newChat() {
  const c = { id: crypto.randomUUID(), title: 'New chat', messages: [] };
  chats.unshift(c); currentId = c.id; saveChats(); render();
}

function renderList() {
  const ul = $('chatList'); ul.textContent = '';
  for (const c of chats) {
    const li = document.createElement('li');
    if (c.id === currentId) li.className = 'active';
    const s = document.createElement('span'); s.textContent = c.title; s.dir = 'auto';
    const del = document.createElement('button'); del.textContent = '✕'; del.setAttribute('aria-label', 'Delete chat');
    del.onclick = (e) => { e.stopPropagation(); chats = chats.filter((x) => x.id !== c.id); if (currentId === c.id) currentId = chats[0]?.id ?? null; if (!currentId) newChat(); else { saveChats(); render(); } };
    li.onclick = () => { currentId = c.id; saveChats(); render(); $('sidebar').classList.remove('open'); };
    li.append(s, del); ul.append(li);
  }
}

function addCopyButtons(el) {
  el.querySelectorAll('pre').forEach((pre) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'copy'; b.textContent = 'Copy';
    b.onclick = () => { navigator.clipboard.writeText(pre.querySelector('code').textContent); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); };
    pre.append(b);
  });
}

function msgEl(role, text) {
  const d = document.createElement('div'); d.className = `msg ${role}`; d.dir = 'auto';
  if (role === 'assistant') { d.innerHTML = renderMarkdown(text); addCopyButtons(d); } else d.textContent = text;
  return d;
}

function renderMessages() {
  const box = $('messages'); box.textContent = '';
  const c = current();
  if (!c || !c.messages.length) {
    const e = document.createElement('div'); e.className = 'empty';
    e.innerHTML = '<h2>How can I help?</h2><p>Ask anything, in any language.</p>'; box.append(e);
  } else c.messages.forEach((m) => box.append(msgEl(m.role, m.content)));
  box.scrollTop = box.scrollHeight;
  $('chatTitle').textContent = c?.title ?? 'Claude Chat';
}
function render() { renderList(); renderMessages(); }

function setBusy(b) { $('send').hidden = b; $('stop').hidden = !b; $('input').disabled = b; }

async function send(text) {
  const c = current(); if (!c) return;
  c.messages.push({ role: 'user', content: text });
  if (c.messages.length === 1) c.title = text.slice(0, 40);
  saveChats(); render();
  const box = $('messages');
  const out = msgEl('assistant', ''); box.append(out);
  let acc = '';
  setBusy(true); abort = new AbortController();
  try {
    const { url, init } = buildRequest({ ...settings, apiKey: getKey(), model: $('modelSelect').value, system: settings.system, maxTokens: settings.maxTokens, messages: c.messages.map(({ role, content }) => ({ role, content })) });
    const res = await fetch(url, { ...init, signal: abort.signal });
    if (!res.ok) throw new Error(await explainHttpError(res));
    const stop = await readStream(res, (t) => { acc += t; out.innerHTML = renderMarkdown(acc); box.scrollTop = box.scrollHeight; });
    if (stop === 'max_tokens') acc += '\n\n*(Reply cut off: raise "Max output tokens" in Settings.)*';
  } catch (e) {
    if (e.name !== 'AbortError') { out.className = 'msg error'; out.textContent = e.message; if (!acc) { c.messages.pop(); setBusy(false); abort = null; saveChats(); $('input').value = text; return; } }
  }
  if (acc) { c.messages.push({ role: 'assistant', content: acc }); }
  else if (c.messages.at(-1)?.role === 'user') c.messages.pop();
  saveChats(); setBusy(false); abort = null; render(); $('input').focus();
}

// --- wiring ---
for (const m of MODELS) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; $('modelSelect').append(o); }
$('modelSelect').value = settings.model;
$('modelSelect').onchange = () => { settings.model = $('modelSelect').value; saveSettings(); };
$('newChat').onclick = newChat;
$('toggleSidebar').onclick = () => $('sidebar').classList.toggle('open');
$('stop').onclick = () => abort?.abort();
$('composer').onsubmit = (e) => { e.preventDefault(); const t = $('input').value.trim(); if (!t) return; $('input').value = ''; $('input').style.height = 'auto'; send(t); };
$('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('composer').requestSubmit(); } });
$('input').addEventListener('input', () => { const i = $('input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 200) + 'px'; });

function syncSettingsUi() {
  $('mode').value = settings.mode; $('proxyUrl').value = settings.proxyUrl; $('systemPrompt').value = settings.system;
  $('maxTokens').value = settings.maxTokens; $('remember').checked = settings.remember; $('apiKey').value = getKey();
  $('byokBox').hidden = settings.mode !== 'byok'; $('proxyBox').hidden = settings.mode !== 'proxy';
}
$('mode').onchange = () => { $('byokBox').hidden = $('mode').value !== 'byok'; $('proxyBox').hidden = $('mode').value !== 'proxy'; };
$('openSettings').onclick = () => { syncSettingsUi(); $('settings').showModal(); };
$('settings').addEventListener('close', () => {
  settings.mode = $('mode').value; settings.proxyUrl = $('proxyUrl').value.trim(); settings.system = $('systemPrompt').value;
  settings.maxTokens = Math.max(256, Math.min(64000, Number($('maxTokens').value) || 4096)); settings.remember = $('remember').checked;
  const key = $('apiKey').value.trim();
  sessionStorage.removeItem('apiKey'); localStorage.removeItem('apiKey');
  if (key) (settings.remember ? localStorage : sessionStorage).setItem('apiKey', key);
  saveSettings();
});
$('clearAll').onclick = () => { if (confirm('Delete all chats?')) { chats = []; newChat(); } };

if (!chats.length || !current()) { if (chats.length) currentId = chats[0].id; else newChat(); }
render();
if (settings.mode === 'byok' && !getKey() && !settings.proxyUrl) $('openSettings').click();
