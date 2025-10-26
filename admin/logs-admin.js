// admin/logs-admin.js
// Полностью совместим с текущим admin.html: те же id, те же эндпоинты и формат данных.
// Экспортирует на window те же функции: loadLogs, exportLogs, deleteSelectedLogs, selectLog, toggleLogKey.

const API = 'https://vr-backend.apel-s-in.workers.dev';
const authKey = 'vr_admin_auth';

let __selectedLogKeys = new Set();

// ——— Helpers ———
function authHeader() {
  const tok = sessionStorage.getItem(authKey);
  return tok ? { 'Authorization': tok } : {};
}
function ensureAuthedOrLogin(res) {
  if (res.status === 401) {
    sessionStorage.removeItem(authKey);
    try {
      // ваш код: needLogin(true) -> покажет форму и спрячет интерфейс
      if (typeof window.needLogin === 'function') window.needLogin(true);
      else if (typeof window.guardApp === 'function') window.guardApp();
    } catch {}
    return false;
  }
  return true;
}
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function readDTLocal(id) {
  const v = document.getElementById(id)?.value;
  if (!v) return null;
  try { return new Date(v).toISOString(); } catch { return null; }
}

// ——— Основные функции ———
async function loadLogs() {
  // полностью повторяет вашу inline-реализацию
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  __selectedLogKeys = new Set();
  const type = document.getElementById('logs-type')?.value || '';
  const from = readDTLocal('logs-from');
  const to   = readDTLocal('logs-to');
  const pkey = (document.getElementById('logs-pkey')?.value || '').trim();
  const pop  = document.getElementById('logs-pop')?.value || '';
  const pval = (document.getElementById('logs-pval')?.value || '').trim();

  const url = new URL(API + '/admin/logs');
  if (type) url.searchParams.set('type', type);
  if (from) url.searchParams.set('from', from);
  if (to)   url.searchParams.set('to', to);
  if (pkey) url.searchParams.set('pkey', pkey);
  if (pop)  url.searchParams.set('pop',  pop);
  if (pval) url.searchParams.set('pval', pval);
  url.searchParams.set('limit', '100');

  const res = await fetch(url, { headers:{ ...authHeader() } });
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  const list = document.getElementById('logs-list');
  if (!data?.ok) { if (list) list.textContent = 'Ошибка'; return; }

  if (list) {
    list.innerHTML = (data.items||[]).map(l=>{
      const when = l.ts ? new Date(l.ts).toLocaleString() : '—';
      const payloadShort = escapeHtml(JSON.stringify(l.payload||{})).slice(0,120);
      return `<div class="row">
        <div onclick="selectLog('${l.key}')">
          <div><span class="pill">${escapeHtml(l.type||'log')}</span> <b>${when}</b></div>
          <div class="muted">${payloadShort}</div>
        </div>
        <div>
          <input type="checkbox" onchange="toggleLogKey('${l.key}', this.checked)">
        </div>
      </div>`;
    }).join('');
  }
  const details = document.getElementById('log-details');
  if (details) details.textContent = '';
}

function toggleLogKey(key, checked) {
  if (checked) __selectedLogKeys.add(key);
  else __selectedLogKeys.delete(key);
}

async function selectLog(key) {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  // ВАЖНО: как у вас — повторно грузим список по тем же фильтрам и ищем элемент по key
  const type = document.getElementById('logs-type')?.value || '';
  const from = readDTLocal('logs-from');
  const to   = readDTLocal('logs-to');
  const pkey = (document.getElementById('logs-pkey')?.value || '').trim();
  const pop  = document.getElementById('logs-pop')?.value || '';
  const pval = (document.getElementById('logs-pval')?.value || '').trim();

  const url = new URL(API + '/admin/logs');
  if (type) url.searchParams.set('type', type);
  if (from) url.searchParams.set('from', from);
  if (to)   url.searchParams.set('to', to);
  if (pkey) url.searchParams.set('pkey', pkey);
  if (pop)  url.searchParams.set('pop',  pop);
  if (pval) url.searchParams.set('pval', pval);
  url.searchParams.set('limit', '100');

  const resp = await fetch(url, { headers:{ ...authHeader() } });
  if (!ensureAuthedOrLogin(resp)) return;

  const data = await resp.json().catch(()=> ({}));
  const it = (data.items||[]).find(x => x.key === key);
  const details = document.getElementById('log-details');
  if (details) details.textContent = it ? JSON.stringify(it, null, 2) : 'Не найден';
}

async function deleteSelectedLogs() {
  if (!__selectedLogKeys.size) { alert('Не выбрано ни одного лога'); return; }
  if (!confirm(`Удалить ${__selectedLogKeys.size} логов?`)) return;

  const res = await fetch(API + '/admin/logs/delete', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ keys: Array.from(__selectedLogKeys) })
  });
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Ошибка удаления: ' + (data?.error||res.status)); return; }
  alert('Удалено');
  loadLogs();
}

async function exportLogs(fmt) {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  const type = document.getElementById('logs-type')?.value || '';
  const from = readDTLocal('logs-from');
  const to   = readDTLocal('logs-to');
  const pkey = (document.getElementById('logs-pkey')?.value || '').trim();
  const pop  = document.getElementById('logs-pop')?.value || '';
  const pval = (document.getElementById('logs-pval')?.value || '').trim();

  const url = new URL(API + '/admin/logs/export');
  url.searchParams.set('format', fmt || 'csv');
  if (type) url.searchParams.set('type', type);
  if (from) url.searchParams.set('from', from);
  if (to)   url.searchParams.set('to', to);
  if (pkey) url.searchParams.set('pkey', pkey);
  if (pop)  url.searchParams.set('pop',  pop);
  if (pval) url.searchParams.set('pval', pval);
  url.searchParams.set('limit', '20000');

  const res = await fetch(url, { headers:{ ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `logs-${new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')}.${fmt==='ndjson'?'ndjson':'csv'}`;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ——— Экспорт на window (для onclick в HTML) ———
window.loadLogs = loadLogs;
window.toggleLogKey = toggleLogKey;
window.selectLog = selectLog;
window.deleteSelectedLogs = deleteSelectedLogs;
window.exportLogs = exportLogs;
