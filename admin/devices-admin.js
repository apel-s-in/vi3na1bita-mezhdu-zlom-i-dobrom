// admin/devices-admin.js
// Вкладка "Устройства": поиск и список устройств, копирование device_hash.
// Полностью соответствует вашему текущему inline-коду. Экспортирует:
//   window.loadDevices, window.copyDeviceHash

const API = 'https://vr-backend.apel-s-in.workers.dev';
const authKey = 'vr_admin_auth';

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
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

// ——— API/DOM ———
async function loadDevices() {
  // Полностью повторяет вашу текущую реализацию
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  const q = document.getElementById('dev-q')?.value.trim() || '';
  const url = new URL(API + '/admin/devices');
  if (q) url.searchParams.set('q', q);
  url.searchParams.set('limit', '100');

  const res = await fetch(url, { headers:{ ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  const list = document.getElementById('devices-list');
  if (!data?.ok) { if (list) list.textContent = 'Ошибка'; return; }

  if (list) {
    list.innerHTML = (data.items||[]).map(d=>{
      const dt1 = d.first_seen ? new Date(d.first_seen).toLocaleString() : '—';
      const dt2 = d.last_seen ? new Date(d.last_seen).toLocaleString() : '—';
      const claimStat = `T:${d.claims_total||0} • p:${d.claims_pending||0} • a:${d.claims_approved||0} • s:${d.claims_shipped||0} • d:${d.claims_delivered||0} • r:${d.claims_rejected||0}`;
      const user = `${escapeHtml(d.user_name||'—')} ${d.tg_id?('· tg:'+String(d.tg_id)) : ''}`;
      const devShort = escapeHtml((d.device_hash||'').slice(0,12));
      const devFull = String(d.device_hash||'');
      return `<div class="row" onclick="copyDeviceHash('${devFull}')">
        <div>
          <div><b>dev:${devShort}…</b> · ${user}</div>
          <div class="muted">${dt1} → ${dt2}</div>
        </div>
        <div class="muted">${claimStat}</div>
      </div>`;
    }).join('');
  }

  const details = document.getElementById('devices-details');
  if (details) details.textContent = '—';
}

function copyDeviceHash(hash) {
  try { navigator.clipboard?.writeText(hash); } catch {}
  const box = document.getElementById('devices-details');
  if (box) box.textContent = `Скопировано: ${hash}`;
}

// ——— Экспорт на window ———
window.loadDevices = loadDevices;
window.copyDeviceHash = copyDeviceHash;

// ——— Необязательная автоинициализация ———
// Оставляем загрузку по клику на вкладку (switchTab('devices')).
// При желании можно раскомментировать:
// document.addEventListener('DOMContentLoaded', () => {
//   if (document.getElementById('devices-list')) loadDevices();
// });
