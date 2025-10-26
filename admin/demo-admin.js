// admin/demo-admin.js
// DEMO: панель тестера, чек‑лист достижений, DEMO‑заявки и автосценарий.
// Полностью совместим с вашим admin.html: те же id, тексты и эндпоинты.
// Все публичные функции экспортируются на window с идентичными именами.

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
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ——— Состояние ———
let __demoHiddenById = new Map();
let scenarioInterval = null;

// ——— DEMO: чек‑лист достижений ———
function setDemoHiddenMap(items) {
  __demoHiddenById = new Map(items.map(x => [String(x.id), !!x.hidden]));
}

function renderDemoAchList(items) {
  const box = document.getElementById('demo-ach-box');
  if (!box) return;

  const sorted = [...items].sort((a, b) => {
    if (!!a.hidden !== !!b.hidden) return a.hidden ? 1 : -1; // видимые первыми
    if ((a.tier || 0) !== (b.tier || 0)) return (a.tier || 0) - (b.tier || 0);
    return String(a.title || a.id).localeCompare(String(b.title || b.id), 'ru');
  });

  const visible = sorted.filter(x => !x.hidden);
  const secret = sorted.filter(x => x.hidden);

  const rows = (arr) => arr.map(a => `
    <div class="ach-row">
      <label class="checkbox-container">
        <input type="checkbox" data-ach="${escapeHtml(String(a.id))}" onchange="updateDemoCountsAndLevel()">
        <span>${escapeHtml(a.title || a.id)} <span class="ach-id">(${escapeHtml(String(a.id))})</span></span>
      </label>
      <span class="muted">${a.tier ? 'tier:'+a.tier : ''}</span>
    </div>
  `).join('');

  box.innerHTML = `
    <div class="group-title">Видимые</div>
    ${rows(visible) || '<div class="muted">—</div>'}
    <div class="group-title">Секретные</div>
    ${rows(secret) || '<div class="muted">—</div>'}
  `;

  // бейджи
  const total = items.length;
  const visibleBadge = document.getElementById('demo-visible-badge');
  const secretBadge = document.getElementById('demo-secret-badge');
  const totalEl = document.getElementById('demo-total');
  if (totalEl) totalEl.textContent = String(total);
  if (visibleBadge) visibleBadge.textContent = `Видимых: ${visible.length}`;
  if (secretBadge) secretBadge.textContent = `Секретных: ${secret.length}`;

  updateDemoCountsAndLevel();
}

function getCheckedIds() {
  return Array.from(document.querySelectorAll('#demo-ach-box input[type="checkbox"][data-ach]'))
    .filter(c => c.checked)
    .map(c => c.getAttribute('data-ach'));
}
function markAll(mark) {
  const boxes = document.querySelectorAll('#demo-ach-box input[type="checkbox"][data-ach]');
  boxes.forEach(b => { b.checked = !!mark; });
  updateDemoCountsAndLevel();
}
function markAllVisible(mark) {
  const boxes = document.querySelectorAll('#demo-ach-box input[type="checkbox"][data-ach]');
  boxes.forEach(b => {
    const id = b.getAttribute('data-ach');
    const isHidden = __demoHiddenById.get(String(id));
    if (!isHidden) b.checked = !!mark;
  });
  updateDemoCountsAndLevel();
}
function markAllSecret(mark) {
  const boxes = document.querySelectorAll('#demo-ach-box input[type="checkbox"][data-ach]');
  boxes.forEach(b => {
    const id = b.getAttribute('data-ach');
    const isHidden = __demoHiddenById.get(String(id));
    if (isHidden) b.checked = !!mark;
  });
  updateDemoCountsAndLevel();
}
function preset5() {
  const ids = [];
  const boxes = Array.from(document.querySelectorAll('#demo-ach-box input[type="checkbox"][data-ach]'));
  for (const b of boxes) {
    const id = b.getAttribute('data-ach');
    const isHidden = __demoHiddenById.get(String(id));
    if (!isHidden) ids.push(b);
    if (ids.length >= 5) break;
  }
  markAll(false);
  ids.forEach(b => b.checked = true);
  updateDemoCountsAndLevel();
}
function presetFirstPrize() { markAll(false); markAllVisible(true); }
function presetSecondPrize() { markAll(true); }

function updateDemoCountsAndLevel() {
  const boxes = Array.from(document.querySelectorAll('#demo-ach-box input[type="checkbox"][data-ach]'));
  const checked = boxes.filter(b => b.checked);
  const checkedIds = checked.map(b => b.getAttribute('data-ach'));

  const total = boxes.length;
  const visibleTotal = Array.from(__demoHiddenById.values()).filter(v => !v).length;
  const secretTotal = total - visibleTotal;

  let visibleDone = 0, secretDone = 0;
  checkedIds.forEach(id => {
    if (__demoHiddenById.get(String(id))) secretDone++;
    else visibleDone++;
  });

  const checkedEl = document.getElementById('demo-checked');
  if (checkedEl) checkedEl.textContent = String(checked.length);

  const pill = document.getElementById('demo-level-pill');
  if (pill) pill.textContent = `Уровень: ${visibleDone} / ${visibleTotal}`;

  const hint = document.getElementById('demo-hint');
  if (hint) {
    if (visibleDone >= visibleTotal) {
      hint.textContent = secretDone > 0
        ? `Готово для 1-го приза. Секретные отмечены: ${secretDone} / ${secretTotal}`
        : 'Готово для 1-го приза (видимые: все).';
    } else {
      hint.textContent = 'Отметьте видимые достижения для 1-го приза или используйте пресет.';
    }
  }
}

// ——— DEMO: панель тестера ———
async function loadDemoPanel() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  if (!tg) return alert('Введите tg_id');

  // Настройки тестера
  const res = await fetch(`${API}/admin/demo/tester?tg=${encodeURIComponent(tg)}`, { headers: { ...authHeader() } });
  if (!ensureAuthedOrLogin(res)) return;
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) { alert('Не удалось загрузить'); return; }

  const modeInp = document.getElementById('demo-mode');
  const dnInp = document.getElementById('demo-dn');
  const hintEl = document.getElementById('demo-hint');
  if (modeInp) modeInp.checked = (d.tester?.mode === 'demo');
  if (dnInp) dnInp.value = d.tester?.displayNameDemo || 'VR Admin';
  if (hintEl) hintEl.textContent = d.hasDemo ? 'Демо-бэкап сохранён' : 'Демо-бэкап не настроен';

  // База достижений
  const base = await fetch(API + '/admin/ach/base', { headers: { ...authHeader() } }).then(r => r.json()).catch(() => ({}));
  const items = (base.items || []);
  setDemoHiddenMap(items);
  renderDemoAchList(items);

  // DEMO‑заявки (наглядность)
  try { await demoLoadClaims(); } catch(e){}

  // Статус сценария
  try { await refreshScenarioStatus(); } catch(e){}
}

async function saveDemoMode() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  const mode = document.getElementById('demo-mode')?.checked ? 'demo' : 'live';
  const displayNameDemo = document.getElementById('demo-dn')?.value.trim() || 'VR Admin';
  const res = await fetch(API + '/admin/demo/tester', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ tg, mode, displayNameDemo })
  });
  if (!ensureAuthedOrLogin(res)) return;
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) return alert('Не сохранено');
  alert('Сохранено');
}

async function buildAndSaveDemoBackup() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  if (!tg) return alert('Введите tg_id');

  const now = Date.now();
  const checkedIds = getCheckedIds();

  // Заглушка для stats — строго как у вас
  const stats = {
    schema: 2,
    deviceHash: 'demo_device',
    createdAt: now,
    totals: { totalSeconds: 0, totalValidPlays: 0, totalFullPlays: 0 },
    perTrack: Array.from({ length: 16 }, () => ({
      validPlays: 0, fullPlays: 0, totalSeconds: 0, lastPlayedAt: 0,
      byHour: Array(24).fill(0), byWeekday: Array(7).fill(0)
    })),
    uniqueTracksPlayed: [],
    byDay: {},
    streak: { current: 0, max: 0, lastDay: null },
    likedCount: 0,
    achievements: {},
    lastMajorAchAt: 0,
    backups: { dates: [] },
    socialsVisited: {},
    sleepTimerStops: 0
  };
  checkedIds.forEach(id => { stats.achievements[id] = { unlockedAt: now, tier: 1 }; });

  // Подсчёты видимых/секретных
  const allIds = Array.from(__demoHiddenById.keys());
  const visibleTotal = allIds.filter(id => !__demoHiddenById.get(id)).length;
  const secretTotal = allIds.length - visibleTotal;
  const visibleDone = checkedIds.filter(id => !__demoHiddenById.get(id)).length;
  const secretDone = checkedIds.filter(id => __demoHiddenById.get(id)).length;

  const payload = {
    appVersion: 'demo',
    buildDate: new Date().toISOString().slice(0, 10),
    exportedAt: new Date().toISOString(),
    deviceHash: 'demo_device',
    profile: { displayName: document.getElementById('demo-dn')?.value.trim() || 'VR Admin', tgId: tg, tgUsername: null },
    favorites: [],
    knownDevices: ['demo_device'],
    achOverview: {
      normalTotal: visibleTotal,
      normalDone: visibleDone,
      secretTotal: secretTotal,
      secretDoneFromStart: secretDone,
      secretStartAt: secretDone ? now : null
    },
    stats,
    statsInsights: null
  };

  // checksum
  const checksum = await (async (s) => {
    const enc = new TextEncoder().encode(JSON.stringify(s));
    const h = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  })(payload);

  const file = { kind: 'vr_backup_v1', checksum, payload };

  const res = await fetch(API + '/admin/demo/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ tg, file })
  });
  if (!ensureAuthedOrLogin(res)) return;
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) return alert('Демо-бэкап не сохранён');

  const hintEl = document.getElementById('demo-hint');
  if (hintEl) hintEl.textContent = 'Демо-бэкап сохранён';
  updateDemoCountsAndLevel();
  alert('Демо‑бэкап сохранён. Откройте приложение под этим tg_id — прогресс загрузится автоматически.');
}

// ——— DEMO: заявки ———
async function demoLoadClaims() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  const device = document.getElementById('demo-device')?.value.trim();
  if (!tg) return alert('Введите tg_id');

  const url = new URL(`${API}/admin/demo/claims`);
  url.searchParams.set('tg', tg);
  if (device) url.searchParams.set('device', device);

  const res = await fetch(url, { headers:{ ...authHeader() } });
  if (!ensureAuthedOrLogin(res)) return;
  const d = await res.json().catch(()=> ({}));

  const box = document.getElementById('demo-claims-list');
  if (!res.ok || !d?.ok) { if (box) box.textContent = 'Ошибка'; return; }

  const items = d.items || [];
  if (!items.length) { if (box) box.textContent = 'Заявок нет'; return; }

  if (box) {
    box.innerHTML = items.map(c=>{
      const when = c.created_at ? new Date(c.created_at).toLocaleString() : '—';
      const devShort = (c.device_hash||'').slice(0,8);
      return `<div class="row" onclick="(function(){document.getElementById('demo-claim-id').value='${c.id}';document.getElementById('demo-device').value='${c.device_hash||''}';})()">
        <div>
          <div><b>#${c.id.slice(0,8)}</b> · dev:${devShort} · <span class="pill">${c.status}</span></div>
          <div class="muted">${when} · ${escapeHtml(c.prize_title||'')}</div>
        </div>
        <div class="muted">${c.tracking_code?('trk:'+escapeHtml(c.tracking_code)):'—'}</div>
      </div>`;
    }).join('');
  }
}

async function demoSetShipped() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  let device = document.getElementById('demo-device')?.value.trim();
  const id = document.getElementById('demo-claim-id')?.value.trim();
  const tracking = document.getElementById('demo-tracking')?.value.trim();
  if (!tg || !id || !tracking) return alert('tg/claim/tracking');

  if (!device) {
    try {
      const url = new URL(`${API}/admin/demo/claims`);
      url.searchParams.set('tg', tg);
      const resList = await fetch(url, { headers:{ ...authHeader() } });
      if (!ensureAuthedOrLogin(resList)) return;
      const data = await resList.json().catch(()=> ({}));
      const it = (data.items||[]).find(x => x.id === id);
      if (it?.device_hash) device = it.device_hash;
    } catch(e){}
  }
  if (!device) return alert('Не удалось определить device_hash для этой заявки');

  const res = await fetch(`${API}/admin/demo/claim/tracking`, {
    method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ tg, device, id, tracking })
  });
  const d = await res.json().catch(()=> ({}));
  if (!res.ok || !d?.ok) return alert('Не удалось: '+(d?.error||res.status));
  alert('Статус: shipped');
  demoLoadClaims();
}

async function demoSetDelivered() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  let device = document.getElementById('demo-device')?.value.trim();
  const id = document.getElementById('demo-claim-id')?.value.trim();
  if (!tg || !id) return alert('tg/claim');

  if (!device) {
    try {
      const url = new URL(`${API}/admin/demo/claims`);
      url.searchParams.set('tg', tg);
      const resList = await fetch(url, { headers:{ ...authHeader() } });
      if (!ensureAuthedOrLogin(resList)) return;
      const data = await resList.json().catch(()=> ({}));
      const it = (data.items||[]).find(x => x.id === id);
      if (it?.device_hash) device = it.device_hash;
    } catch(e){}
  }
  if (!device) return alert('Не удалось определить device_hash для этой заявки');

  const res = await fetch(`${API}/admin/demo/claim/delivered`, {
    method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ tg, device, id })
  });
  const d = await res.json().catch(()=> ({}));
  if (!res.ok || !d?.ok) return alert('Не удалось: '+(d?.error||res.status));
  alert('Статус: delivered');
  demoLoadClaims();
}

async function resetDemoClaims() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  if (!tg) return;
  if (!confirm('Очистить DEMO‑заявки для этого tg_id?')) return;
  const res = await fetch(API + '/admin/demo/claims/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ tg })
  });
  if (!ensureAuthedOrLogin(res)) return;
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) return alert('Не очищено');
  alert('DEMO‑заявки очищены');
}

// ——— DEMO: автосценарий ———
async function startScenario() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  if (!tg) return alert('Введите tg_id');

  const speed = document.getElementById('scenario-speed')?.value;
  const autoClaimPrizes = !!document.getElementById('scenario-auto-prizes')?.checked;

  const res = await fetch(`${API}/admin/demo/scenario/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ tgId: tg, speed, autoClaimPrizes })
  });
  if (!ensureAuthedOrLogin(res)) return;

  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) return alert('Не удалось запустить: ' + (d?.error || res.status));

  alert('Автосценарий запущен! Откройте приложение для просмотра прогресса.');
  await refreshScenarioStatus();

  if (scenarioInterval) clearInterval(scenarioInterval);
  scenarioInterval = setInterval(refreshScenarioStatus, 2000);
}

async function pauseScenario() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  if (!tg) return alert('Введите tg_id');

  const res = await fetch(`${API}/admin/demo/scenario/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ tgId: tg, paused: true })
  });
  if (!ensureAuthedOrLogin(res)) return;

  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) return alert('Не удалось поставить на паузу');

  alert('Сценарий поставлен на паузу');
  refreshScenarioStatus();
}

async function resetScenario() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  if (!tg) return alert('Введите tg_id');

  if (!confirm('Сбросить автосценарий и весь прогресс?')) return;

  const res = await fetch(`${API}/admin/demo/scenario/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ tgId: tg })
  });
  if (!ensureAuthedOrLogin(res)) return;

  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) return alert('Не удалось сбросить');

  if (scenarioInterval) {
    clearInterval(scenarioInterval);
    scenarioInterval = null;
  }

  alert('Сценарий сброшен');
  await refreshScenarioStatus();
  loadDemoPanel();
}

async function refreshScenarioStatus() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = document.getElementById('demo-tg')?.value.trim();
  if (!tg) return;

  const res = await fetch(`${API}/admin/demo/scenario/status?tgId=${encodeURIComponent(tg)}`, {
    headers: { ...authHeader() }
  });
  if (!ensureAuthedOrLogin(res)) return;

  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) return;

  const statusEl = document.getElementById('scenario-status');
  const stageEl = document.getElementById('scenario-stage');
  const achEl = document.getElementById('scenario-achievements');
  const hintEl = document.getElementById('scenario-hint');

  if (d.hasScenario && d.hasProgress) {
    if (statusEl) {
      statusEl.textContent = d.paused ? 'на паузе' : 'запущен';
      statusEl.className = d.paused ? 'badge' : 'badge ok';
    }

    if (stageEl) {
      if (d.currentStage) {
        stageEl.textContent = `${d.currentStage} (${(d.currentStageIndex ?? 0) + 1}/${d.totalStages ?? 0})`;
      } else {
        stageEl.textContent = 'завершён';
      }
    }

    if (achEl) achEl.textContent = `${(d.completedAchievements || []).length}`;

    // Обновим настройки
    const speedSel = document.getElementById('scenario-speed');
    const autoSel = document.getElementById('scenario-auto-prizes');
    if (speedSel && d.settings?.speed !== undefined) speedSel.value = String(d.settings.speed);
    if (autoSel && d.settings?.autoClaimPrizes !== undefined) autoSel.checked = d.settings.autoClaimPrizes;

    if (hintEl) {
      if (d.currentStage === 'stage2_claim_first' || d.currentStage === 'stage4_claim_second') {
        hintEl.textContent = '⚠️ Требуется действие: выберите приз в приложении';
        hintEl.style.color = '#ffb84d';
      } else if ((d.currentStageIndex ?? 0) >= (d.totalStages ?? 0)) {
        hintEl.textContent = '✅ Сценарий завершён. Можно сбросить для повторного прохождения.';
        hintEl.style.color = '#6df59a';
      } else {
        hintEl.textContent = 'Автосценарий последовательно выполняет все достижения с настраиваемой скоростью.';
        hintEl.style.color = '';
      }
    }
  } else {
    if (statusEl) { statusEl.textContent = 'не запущен'; statusEl.className = 'badge'; }
    if (stageEl) stageEl.textContent = '—';
    if (achEl) achEl.textContent = '0';
    if (hintEl) {
      hintEl.textContent = 'Автосценарий последовательно выполняет все достижения с настраиваемой скоростью.';
      hintEl.style.color = '';
    }
  }
}

// ——— Обёртка switchTab: стопим интервал при уходе с DEMO ———
(function wrapSwitchTab() {
  const orig = window.switchTab;
  if (typeof orig === 'function') {
    window.switchTab = function(tab) {
      if (scenarioInterval) {
        clearInterval(scenarioInterval);
        scenarioInterval = null;
      }
      return orig.call(this, tab);
    };
  }
})();

// ——— Экспорт функций на window (для onclick в HTML) ———
window.renderDemoAchList = renderDemoAchList;
window.getCheckedIds = getCheckedIds;
window.markAll = markAll;
window.setDemoHiddenMap = setDemoHiddenMap;
window.markAllVisible = markAllVisible;
window.markAllSecret = markAllSecret;
window.preset5 = preset5;
window.presetFirstPrize = presetFirstPrize;
window.presetSecondPrize = presetSecondPrize;
window.updateDemoCountsAndLevel = updateDemoCountsAndLevel;

window.loadDemoPanel = loadDemoPanel;
window.saveDemoMode = saveDemoMode;
window.buildAndSaveDemoBackup = buildAndSaveDemoBackup;

window.demoLoadClaims = demoLoadClaims;
window.demoSetShipped = demoSetShipped;
window.demoSetDelivered = demoSetDelivered;
window.resetDemoClaims = resetDemoClaims;

window.startScenario = startScenario;
window.pauseScenario = pauseScenario;
window.resetScenario = resetScenario;
window.refreshScenarioStatus = refreshScenarioStatus;
