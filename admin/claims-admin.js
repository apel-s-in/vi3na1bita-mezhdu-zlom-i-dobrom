// admin/claims-admin.js
// Модуль для вкладки "Заявки" + VIP-кошелёк. Полностью совместим с текущей разметкой admin.html.
// Все публичные функции закрепляются на window с теми же именами, что и в inline-скрипте.

const API = 'https://vr-backend.apel-s-in.workers.dev';
const authKey = 'vr_admin_auth';

// Локальные состояния — один источник истины внутри модуля
let currentClaim = null;
let currentClaimUserId = null; // user_id выбранной заявки (для VIP)
let currentClaimTgId = null;   // tg_id выбранной заявки (для VIP)
let pageSize = 50;
let currentOffset = 0;

// ——— Helpers ———
function authHeader() {
  const tok = sessionStorage.getItem(authKey);
  return tok ? { 'Authorization': tok } : {};
}
function ensureAuthedOrLogin(res) {
  if (res.status === 401) {
    sessionStorage.removeItem(authKey);
    try { if (typeof window.needLogin === 'function') window.needLogin(true); else if (typeof window.guardApp === 'function') window.guardApp(); } catch {}
    return false;
  }
  return true;
}
function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function readDateInput(id) {
  const v = document.getElementById(id)?.value;
  if (!v) return null;
  try {
    const dt = new Date(v);
    if (id === 'claims-to') dt.setHours(23,59,59,999);
    return dt.toISOString();
  } catch { return null; }
}

// ——— Пагинация ———
function resetPaging() {
  currentOffset = 0;
  const lbl = document.getElementById('claims-page-label');
  if (lbl) lbl.textContent = '1';
}
function nextPage() {
  currentOffset += pageSize;
  loadClaims();
}
function prevPage() {
  currentOffset = Math.max(0, currentOffset - pageSize);
  const curPage = Math.floor(currentOffset / pageSize) + 1;
  const lbl = document.getElementById('claims-page-label');
  if (lbl) lbl.textContent = String(curPage);
  loadClaims();
}

// ——— Загрузка списка заявок ———
async function loadClaims() {
  // завязка на глобальный needLogin/guardApp, как в inline-скрипте
  if (typeof window.needLogin === 'function' && window.needLogin()) return;

  const st = document.getElementById('claims-status')?.value || '';
  const from = readDateInput('claims-from');
  const to = readDateInput('claims-to');

  const url = new URL(API + '/admin/claims');
  if (st) url.searchParams.set('status', st);
  if (from) url.searchParams.set('from', from);
  if (to) url.searchParams.set('to', to);
  url.searchParams.set('limit', String(pageSize));
  url.searchParams.set('offset', String(currentOffset));

  const res = await fetch(url, { headers: { ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;
  const data = await res.json().catch(()=> ({}));
  const list = document.getElementById('claims-list');
  if (!data?.ok) { if (list) list.textContent = 'Ошибка загрузки'; return; }

  const items = data.items || [];
  const curPage = Math.floor(currentOffset / pageSize) + 1;
  const lbl = document.getElementById('claims-page-label');
  if (lbl) lbl.textContent = String(curPage);

  if (list) {
    list.innerHTML = items.map(c=>{
      const dt = new Date(c.created_at).toLocaleString();
      const stClass = `status-${c.status}`;
      const tgShort = c.tg_id ? ` · tg:${String(c.tg_id).slice(0,8)}…` : '';
      const attrs = `data-user="${escapeHtml(c.user_id||'')}" data-tg="${escapeHtml(c.tg_id||'')}"`;
      return `<div class="row" ${attrs} onclick="selectClaim('${c.id}', this)">
        <div>
          <div><span class="pill ${stClass}">${c.status}</span> <b>${escapeHtml(c.user_name||'Пользователь')}</b></div>
          <div class="muted">#${c.id.slice(0,8)} · dev:${(c.device_hash||'').slice(0,8)}${tgShort} · lvl:${c.level} · cyc:${c.cycle}</div>
        </div>
        <div class="muted">${dt}</div>
      </div>`;
    }).join('');
  }

  if (items.length === 0 && currentOffset > 0) prevPage();

  const det = document.getElementById('claim-details');
  if (det) det.textContent = 'Ничего не выбрано';
  const act = document.getElementById('claim-actions');
  if (act) act.style.display = 'none';
  currentClaim = null;
}

// ——— Выбор заявки + загрузка деталей ———
async function selectClaim(id, rowEl) {
  const el = document.getElementById('claim-details');
  if (el) el.innerHTML = `Заявка <b>#${id}</b><br><span class="muted">Статус меняется кнопками ниже</span>`;
  currentClaim = id;

  // Сохраняем user_id и tg_id для блока VIP
  try {
    currentClaimUserId = rowEl?.getAttribute('data-user') || null;
    currentClaimTgId = rowEl?.getAttribute('data-tg') || null;
    // автоподставим в поля формы VIP
    const fTg = document.getElementById('vip-tg'); if (fTg && currentClaimTgId) fTg.value = currentClaimTgId;
    const fUid = document.getElementById('vip-user-id'); if (fUid && currentClaimUserId) fUid.value = currentClaimUserId;
  } catch(e){}

  const act = document.getElementById('claim-actions');
  if (act) act.style.display = '';
  loadClaimMeta();
  loadClaimEvents();
}

async function loadClaimMeta() {
  if (!currentClaim) return;
  const metaBox = document.getElementById('claim-meta');
  try {
    const url = new URL(API + '/admin/claim/meta/get');
    url.searchParams.set('id', currentClaim);
    const res = await fetch(url, { headers:{ ...authHeader() }});
    if (!ensureAuthedOrLogin(res)) return;
    const data = await res.json().catch(()=> ({}));
    if (!res.ok || !data?.ok) { if (metaBox) metaBox.textContent = 'Мета недоступна'; return; }
    const m = data.meta || {};
    const fColor = document.getElementById('adm-color');
    const fTags  = document.getElementById('adm-tags');
    const fNote  = document.getElementById('adm-note');
    const fDue   = document.getElementById('adm-due');

    if (fColor) fColor.value = m.color || '';
    if (fTags) fTags.value = (Array.isArray(m.tags) ? m.tags.join(', ') : '');
    if (fNote) fNote.value = m.note || '';
    if (fDue) {
      if (m.dueAt) {
        const dt = new Date(m.dueAt);
        const iso = dt.toISOString().slice(0,16);
        fDue.value = iso;
      } else fDue.value = '';
    }
    if (metaBox) {
      metaBox.innerHTML = `dev/tg и прочие данные в списке слева · <span class="muted">модиф.: ${m.updatedAt?new Date(m.updatedAt).toLocaleString():'—'}</span>`;
    }
  } catch {
    if (metaBox) metaBox.textContent = 'Ошибка загрузки мета';
  }
}

async function saveClaimMeta() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  if (!currentClaim) return;
  const color = document.getElementById('adm-color')?.value || '';
  const tags = (document.getElementById('adm-tags')?.value || '').split(',').map(s=>s.trim()).filter(Boolean);
  const note = document.getElementById('adm-note')?.value || '';
  const dueStr = document.getElementById('adm-due')?.value || '';
  let dueAt = null; try { if (dueStr) dueAt = new Date(dueStr).getTime(); } catch(e){}
  const res = await fetch(API + '/admin/claim/meta/set', {
    method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ id: currentClaim, color, tags, note, dueAt })
  });
  if (!ensureAuthedOrLogin(res)) return;
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Мета не сохранена: '+(data?.error||res.status)); return; }
  alert('Мета сохранена'); loadClaimMeta();
}

async function loadClaimEvents() {
  if (!currentClaim) return;
  const box = document.getElementById('claim-events');
  try {
    const url = new URL(API + '/admin/claim/events');
    url.searchParams.set('id', currentClaim);
    const res = await fetch(url, { headers:{ ...authHeader() }});
    if (!ensureAuthedOrLogin(res)) return;
    const data = await res.json().catch(()=> ({}));
    if (!res.ok || !data?.ok) { if (box) box.textContent = 'История недоступна'; return; }
    const items = data.items || [];
    if (!items.length) { if (box) box.textContent = 'Пусто'; return; }
    if (box) {
      box.innerHTML = items.map(ev=>{
        const dt = new Date(ev.at).toLocaleString();
        return `<div class="row"><div><b>${ev.type}</b></div><div class="muted">${dt}</div></div>`;
      }).join('');
    }
  } catch { if (box) box.textContent = 'Ошибка истории'; }
}

async function deleteClaim() {
  if (!currentClaim) return;
  if (!confirm('Удалить эту заявку без возможности восстановления?')) return;
  const res = await fetch(API + '/admin/claim/delete', {
    method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader() }, body: JSON.stringify({ id: currentClaim })
  });
  if (!ensureAuthedOrLogin(res)) return;
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Не удалось удалить: '+(data?.error||res.status)); return; }
  alert('Удалено'); currentClaim = null; const act = document.getElementById('claim-actions'); if (act) act.style.display = 'none'; loadClaims();
}

async function updateClaim(next) {
  if (!currentClaim) return;
  const reason = (document.getElementById('claim-reason')?.value || '').trim();
  const res = await fetch(API+'/admin/claim/update', {
    method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ id: currentClaim, status: next, reason: (next==='rejected'?reason:null) })
  });
  if (!ensureAuthedOrLogin(res)) return;
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Ошибка: '+(data?.error||res.status)); return; }
  alert('Готово: '+next); loadClaims();
}

async function setTracking() {
  if (!currentClaim) return;
  const tracking = (document.getElementById('claim-tracking')?.value || '').trim();
  if (!tracking) { alert('Введите трек‑номер'); return; }
  const res = await fetch(API+'/admin/claim/tracking', {
    method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ id: currentClaim, tracking })
  });
  if (!ensureAuthedOrLogin(res)) return;
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Ошибка: '+(data?.error||res.status)); return; }
  alert('Статус: shipped, трек установлен'); loadClaims();
}

async function markDelivered() {
  if (!currentClaim) return;
  const res = await fetch(API+'/admin/claim/delivered', {
    method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ id: currentClaim })
  });
  if (!ensureAuthedOrLogin(res)) return;
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) { alert('Ошибка: '+(data?.error||res.status)); return; }
  alert('Статус: delivered'); loadClaims();
}

async function exportClaimsCSV() {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const st  = document.getElementById('claims-status')?.value || '';
  const from= readDateInput('claims-from');
  const to  = readDateInput('claims-to');

  const url = new URL(API + '/admin/claims/export');
  if (st) url.searchParams.set('status', st);
  if (from) url.searchParams.set('from', from);
  if (to) url.searchParams.set('to', to);

  const res = await fetch(url, { headers: { ...authHeader() }});
  if (!ensureAuthedOrLogin(res)) return;
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `claims-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ——— Admin VIP wallet ops ———
async function adminVipAdjust(sign = 1) {
  if (typeof window.needLogin === 'function' && window.needLogin()) return;
  const tg = (document.getElementById('vip-tg')?.value || '').trim();
  const userId = (document.getElementById('vip-user-id')?.value || '').trim();
  const deltaStr = (document.getElementById('vip-delta')?.value || '').trim();
  const reason = (document.getElementById('vip-reason')?.value || '').trim() || (sign>0?'bonus':'penalty');
  const msg = document.getElementById('vip-tx-msg');

  let delta = Number(deltaStr);
  if (!Number.isFinite(delta) || delta === 0) {
    if (msg) msg.textContent = 'Укажите ненулевое число для Δ коины';
    return;
  }
  delta = Math.abs(delta) * (sign >= 0 ? 1 : -1);

  if (!tg && !userId) {
    if (msg) msg.textContent = 'Укажите tg_id или user_id';
    return;
  }

  try {
    const body = { delta, reason };
    if (userId) body.userId = userId;
    else body.tgId = tg;

    const res = await fetch(API + '/admin/vip/tx', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', ...authHeader() },
      body: JSON.stringify(body)
    });
    const d = await res.json().catch(()=> ({}));
    if (!res.ok || !d?.ok) {
      if (msg) msg.textContent = 'Ошибка: ' + (d?.error || res.status);
      return;
    }
    if (msg) msg.textContent = `Готово. Баланс: ${d.balance}`;
    alert('Операция выполнена. Новый баланс: ' + d.balance);
  } catch (e) {
    if (msg) msg.textContent = 'Сеть недоступна';
  }
}
function quickVipBonus(val) {
  const inp = document.getElementById('vip-delta');
  if (inp) inp.value = String(val);
  adminVipAdjust(1);
}

// ——— Экспорт на window (важно: имена совпадают с HTML onclick) ———
window.resetPaging = resetPaging;
window.nextPage = nextPage;
window.prevPage = prevPage;

window.loadClaims = loadClaims;
window.selectClaim = selectClaim;

window.loadClaimMeta = loadClaimMeta;
window.saveClaimMeta = saveClaimMeta;
window.loadClaimEvents = loadClaimEvents;

window.deleteClaim = deleteClaim;
window.updateClaim = updateClaim;
window.setTracking = setTracking;
window.markDelivered = markDelivered;
window.exportClaimsCSV = exportClaimsCSV;

window.adminVipAdjust = adminVipAdjust;
window.quickVipBonus = quickVipBonus;
