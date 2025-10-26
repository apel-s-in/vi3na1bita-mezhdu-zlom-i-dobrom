// admin/backups-admin.js
// Вкладка "Бэкапы": список бэкапов и просмотр содержимого (read-only).
// Полностью соответствует вашему inline-коду: те же id, эндпоинты и поведение.
// Экспортирует на window: loadBackups, viewBackup.

const API = 'https://vr-backend.apel-s-in.workers.dev';
const authKey = 'vr_admin_auth';

// Helpers
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
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

// API/DOM
async function loadBackups() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  const res = await fetch(API + '/admin/backups/list', { headers:{ ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  const list = document.getElementById('backups-list');
  if (!data?.ok) { if (list) list.textContent = 'Ошибка'; return; }

  if (list) {
    list.innerHTML = (data.items||[]).map(b=>{
      const when = b.exportedAt ? new Date(b.exportedAt).toLocaleString() : '—';
      const devShort = escapeHtml((b.device||'').slice(0,12));
      const checksum = escapeHtml(b.checksum || '');
      return `<div class="row">
        <div>
          <div><b>dev:${devShort}…</b></div>
          <div class="muted">${when}</div>
        </div>
        <div class="flex">
          <div class="muted" style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${checksum}</div>
          <button class="btn" onclick="viewBackup('${b.device}')">Открыть</button>
        </div>
      </div>`;
    }).join('');
  }
  const pre = document.getElementById('backup-viewer');
  if (pre) pre.textContent = '';
}

async function viewBackup(device) {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  const url = new URL(API + '/admin/backup/get');
  url.searchParams.set('device', device);

  const res = await fetch(url, { headers:{ ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  const pre = document.getElementById('backup-viewer');
  if (!data?.ok) { if (pre) pre.textContent = 'Ошибка'; return; }
  if (pre) pre.textContent = JSON.stringify(data.backup, null, 2);
}

// Экспорт в window
window.loadBackups = loadBackups;
window.viewBackup = viewBackup;
