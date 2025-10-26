// admin/feedback-admin.js
// Модуль вкладки "Обратная связь": список тредов, открытие, статусы, сообщения, ответ.
// Полностью совместим с текущим admin.html. Экспортирует на window:
//   loadThreads, openThread, toggleThreadStatus, loadMessages, sendReply

const API = 'https://vr-backend.apel-s-in.workers.dev';
const authKey = 'vr_admin_auth';

let currentThread = null;

// ——— Helpers ———
function authHeader() {
  const tok = sessionStorage.getItem(authKey);
  return tok ? { Authorization: tok } : {};
}
function ensureAuthedOrLogin(res) {
  if (res.status === 401) {
    sessionStorage.removeItem(authKey);
    try {
      if (typeof window.needLogin === 'function') window.needLogin(true);
      else if (typeof window.guardApp === 'function') window.guardApp();
    } catch {}
    return false;
  }
  return true;
}
function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ——— API/DOM ———
async function loadThreads() {
  // соответствие вашей inline-реализации
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const q = document.getElementById('fb-q')?.value.trim() || '';
  const url = new URL(API + '/admin/feedback/threads');
  if (q) url.searchParams.set('q', q);
  url.searchParams.set('limit','100');

  const res = await fetch(url, { headers:{ ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  const list = document.getElementById('thread-list');
  if (!data?.ok) { if (list) list.textContent = 'Ошибка'; return; }

  if (list) {
    list.innerHTML = (data.items||[]).map(t=>{
      const dt = t.last_message_at ? new Date(t.last_message_at).toLocaleString() : '—';
      const st = t.status || 'open';
      return `<div class="row" onclick="openThread('${t.id}','${t.code}','${st}')">
        <div>
          <div><b>#${t.code}</b> · ${escapeHtml(t.user_name||'Пользователь')} · <span class="pill">${escapeHtml(st)}</span></div>
          <div class="muted">dev:${escapeHtml((t.device_hash||'').slice(0,8))} · ${t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</div>
        </div>
        <div class="muted">${dt}</div>
      </div>`;
    }).join('');
  }

  const head = document.getElementById('thread-head');
  if (head) head.textContent = 'Выберите тред слева';
  const msgs = document.getElementById('msg-list');
  if (msgs) msgs.innerHTML = '';
  currentThread = null;
}

async function openThread(id, code, status='open') {
  currentThread = { id, code, status };
  const head = document.getElementById('thread-head');
  if (head) {
    head.innerHTML = `Диалог <b>#${escapeHtml(code)}</b> · <span class="pill">${escapeHtml(status)}</span>
      <button class="btn" style="margin-left:8px" onclick="toggleThreadStatus()">${status==='closed'?'Открыть':'Закрыть'}</button>`;
  }
  await loadMessages();
}

async function toggleThreadStatus() {
  if (!currentThread) return;
  const next = currentThread.status === 'closed' ? 'open' : 'closed';
  const res = await fetch(API + '/admin/feedback/close', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ threadId: currentThread.id, status: next })
  });
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Ошибка: '+(data?.error||res.status)); return; }

  currentThread.status = next;
  // перерисуем заголовок и перезагрузим сообщения
  openThread(currentThread.id, currentThread.code, currentThread.status);
}

async function loadMessages() {
  if (!currentThread) return;
  const url = new URL(API + '/admin/feedback/messages');
  url.searchParams.set('thread', currentThread.id);

  const res = await fetch(url, { headers:{ ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  const list = document.getElementById('msg-list');
  if (!data?.ok) { if (list) list.textContent = 'Ошибка'; return; }

  if (list) {
    list.innerHTML = (data.items||[]).map(m=>{
      const dt = m.created_at ? new Date(m.created_at).toLocaleString() : '—';
      const cls = m.sender==='admin' ? 'msg admin' : 'msg user';
      return `<div class="${cls}"><div>${escapeHtml(m.text)}</div><div class="muted" style="font-size:.8em;margin-top:4px">${dt}</div></div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
  }
}

async function sendReply() {
  const inp = document.getElementById('fb-reply');
  const text = (inp?.value || '').trim();
  if (!text || !currentThread) return;

  const res = await fetch(API+'/admin/feedback/reply', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ threadId: currentThread.id, text })
  });
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Не отправлено: '+(data?.error||res.status)); return; }

  if (inp) inp.value = '';
  loadMessages();
}

// ——— Экспорт на window ———
window.loadThreads = loadThreads;
window.openThread = openThread;
window.toggleThreadStatus = toggleThreadStatus;
window.loadMessages = loadMessages;
window.sendReply = sendReply;

// Необязательная автоинициализация: если список тредов уже на странице, можно подтянуть по DOMContentLoaded.
// Оставляем выключенной, так как у вас загрузка идёт при switchTab('fb').
// document.addEventListener('DOMContentLoaded', () => {
//   const box = document.getElementById('thread-list');
//   if (box) loadThreads();
// });
