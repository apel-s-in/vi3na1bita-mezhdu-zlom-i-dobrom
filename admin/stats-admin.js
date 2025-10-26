// admin/stats-admin.js
// Вкладка "Статистика/GS": сводка метрик, конфиг GS и монитор /event.
// Полностью соответствует вашему inline-коду: те же id, эндпоинты и логика.
// Экспортирует на window: loadMetrics, loadGsConfig, saveGsConfig, loadGsHealth.

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

// Сводная статистика
async function loadMetrics() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  const res = await fetch(API + '/admin/metrics/summary', { headers:{ ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  const box = document.getElementById('metrics-box');
  if (!data?.ok) { if (box) box.textContent = 'Ошибка'; return; }

  const byStatus = (data.claimsByStatus||[])
    .map(s=> `<div class="row"><div>${s.status}</div><div class="muted">${s.c}</div></div>`)
    .join('');

  if (box) {
    box.innerHTML = `
      <div class="row"><div>Пользователей</div><div class="muted">${data.users}</div></div>
      <div class="row"><div>Устройств</div><div class="muted">${data.devices}</div></div>
      <div class="row"><div>Заявок</div><div class="muted">${data.claims}</div></div>
      <div class="row"><div>Диалогов обратной связи</div><div class="muted">${data.feedback_threads}</div></div>
      <div class="row"><div>Сообщений</div><div class="muted">${data.feedback_messages}</div></div>
      <div class="row"><div><b>Заявки по статусам</b></div><div></div></div>
      ${byStatus || '<div class="muted">—</div>'}
    `;
  }
}

// GS Config
async function loadGsConfig() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  const res = await fetch(API + '/admin/gs/config', { headers:{ ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Ошибка конфигурации'); return; }

  const c = data.config || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  set('gs-master', c.masterEnabled);
  set('gs-send', c.sendEnabled);
  set('gs-ui', c.showUI);
  set('gs-ts', c.requireTurnstile);
  set('gs-mon', c.monitorEnabled);
  set('gs-cq', c.collectClientQueue);

  const monCard = document.getElementById('gs-health-card');
  if (monCard) monCard.style.display = c.monitorEnabled ? '' : 'none';
  if (c.monitorEnabled) loadGsHealth();
}

async function saveGsConfig() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  const body = {
    masterEnabled: !!document.getElementById('gs-master')?.checked,
    sendEnabled: !!document.getElementById('gs-send')?.checked,
    showUI: !!document.getElementById('gs-ui')?.checked,
    requireTurnstile: !!document.getElementById('gs-ts')?.checked,
    monitorEnabled: !!document.getElementById('gs-mon')?.checked,
    collectClientQueue: !!document.getElementById('gs-cq')?.checked
  };

  const res = await fetch(API + '/admin/gs/config', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify(body)
  });
  if (!ensureAuthedOrLogin(res)) return;

  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Не сохранено'); return; }
  alert('Сохранено');
  loadGsConfig();
}

// Монитор /event
async function loadGsHealth() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  const res = await fetch(API + '/admin/gs/health', { headers:{ ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;

  const d = await res.json().catch(()=> ({}));
  if (!res.ok || !d?.ok) { alert('Монитор недоступен'); return; }

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
  setText('m-ok',    d.okCount || 0);
  setText('m-403',   d.denied403 || 0);
  setText('m-429',   d.rateLimited || 0);
  setText('m-other', d.otherDenied || 0);
  setText('m-q-avg', d.queue?.avg ?? 0);
  setText('m-q-max', d.queue?.max ?? 0);
}

// Экспорт в window
window.loadMetrics = loadMetrics;
window.loadGsConfig = loadGsConfig;
window.saveGsConfig = saveGsConfig;
window.loadGsHealth = loadGsHealth;
