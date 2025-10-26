// admin/logs-admin.js
// Модуль для вкладки "Логи" в админке.
// Ничего не ломает: добавляет функции и рендер, вешает публичные API на window.

const API = 'https://vr-backend.apel-s-in.workers.dev';
const authKey = 'vr_admin_auth';

const st = {
  busy: false,
  cursor: null,
  exhausted: false,
  items: [],
  totalHint: null, // если бэкенд вернёт total
  filter: {
    q: '',
    level: 'all' // all | info | warn | error | debug
  }
};

// ——— Helpers ———
function authHeader() {
  const tok = sessionStorage.getItem(authKey);
  return tok ? { Authorization: tok } : {};
}
function ensureAuthedOrLogin(res) {
  if (res.status === 401) {
    sessionStorage.removeItem(authKey);
    try { if (typeof window.guardApp === 'function') window.guardApp(); } catch {}
    return false;
  }
  return true;
}
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function fmtTs(ts) {
  // ts может быть миллисекундами или секундным UNIX
  let t = Number(ts);
  if (!Number.isFinite(t)) return '—';
  if (t < 10_000_000_000) t = t * 1000; // если секунды
  try {
    const d = new Date(t);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return '—';
  }
}
function levelBadge(level = 'info') {
  const l = String(level).toLowerCase();
  const color =
    l === 'error' ? '#ff4d4f' :
    l === 'warn'  ? '#faad14' :
    l === 'debug' ? '#8c8c8c' : '#1890ff';
  return `<span style="display:inline-block;min-width:48px;text-align:center;padding:2px 6px;border-radius:4px;background:${color}20;color:${color};border:1px solid ${color}40;">${escapeHtml(l)}</span>`;
}
function getDom() {
  return {
    list: document.getElementById('adm-logs-list'),
    moreBtn: document.getElementById('adm-logs-load-more'),
    total: document.getElementById('adm-logs-total'),
    q: document.getElementById('adm-logs-filter-q'),
    level: document.getElementById('adm-logs-filter-level'),
    empty: document.getElementById('adm-logs-empty'),
  };
}
function setBusy(on) {
  st.busy = !!on;
  const { moreBtn } = getDom();
  if (moreBtn) {
    moreBtn.disabled = !!on || st.exhausted;
    moreBtn.textContent = st.exhausted ? 'Больше нет' : on ? 'Загрузка…' : 'Загрузить ещё';
  }
}
function paintTotal() {
  const { total } = getDom();
  if (!total) return;
  const count = st.items.length;
  let extra = '';
  if (Number.isFinite(st.totalHint)) extra = ` из ~${st.totalHint}`;
  total.textContent = `${count}${extra}`;
}
function paintEmptyState() {
  const { list, empty } = getDom();
  if (!list) return;
  if (!st.items.length) {
    if (empty) empty.style.display = '';
    list.innerHTML = '';
  } else {
    if (empty) empty.style.display = 'none';
  }
}

// ——— Рендер одной записи ———
function buildRow(it) {
  const ts = fmtTs(it.ts);
  const level = levelBadge(it.level);
  const msg = escapeHtml(it.msg || it.message || '');
  const ip = escapeHtml(it.ip || '');
  const ua = escapeHtml(it.ua || '');
  const metaObj = it.meta || it.extra || null;

  const metaShort = metaObj ? escapeHtml(JSON.stringify(metaObj)) : '';
  const metaPretty = metaObj ? escapeHtml(JSON.stringify(metaObj, null, 2)) : '';

  const idAttr = it.id ? `data-id="${escapeHtml(String(it.id))}"` : '';
  return `
    <div class="row log-row" ${idAttr} onclick="toggleLogDetails(this)">
      <div style="min-width:180px" class="muted">${ts}</div>
      <div style="min-width:70px">${level}</div>
      <div style="flex:1 1 auto">${msg}</div>
      <div class="muted" style="min-width:110px;text-align:right">${escapeHtml(it.source || '')}</div>
    </div>
    <div class="log-row-details" style="display:none;padding:8px 12px;margin:-8px 0 8px 0;border-left:3px solid #eee;background:#fafafa;">
      ${ip ? `<div><b>IP:</b> <span class="muted">${ip}</span></div>` : ''}
      ${ua ? `<div><b>UA:</b> <span class="muted">${ua}</span></div>` : ''}
      ${metaObj ? `
        <div style="margin-top:6px">
          <b>Meta:</b>
          <pre style="margin:4px 0 0;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;">${metaPretty}</pre>
        </div>
        <details style="margin-top:6px;">
          <summary class="muted">JSON в одну строку</summary>
          <div class="muted" style="margin-top:4px;word-break:break-all;">${metaShort}</div>
        </details>
      ` : '<div class="muted">Нет дополнительных данных</div>'}
    </div>
  `;
}

function appendItems(items) {
  const { list } = getDom();
  if (!list) return;
  const html = items.map(buildRow).join('');
  list.insertAdjacentHTML('beforeend', html);
  paintEmptyState();
  paintTotal();
}

// ——— Загрузка ———
async function fetchLogs({ cursor = null, limit = 50, q = '', level = 'all' } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  if (q) params.set('q', q);
  if (level && level !== 'all') params.set('level', level);

  const url = `${API}/admin/logs?${params.toString()}`;
  const res = await fetch(url, { headers: { ...authHeader() } });
  if (!ensureAuthedOrLogin(res)) return { items: [], cursor: null, hasMore: false, total: null };

  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data?.items) ? data.items : [];
  const nextCursor = data?.nextCursor ?? data?.cursor ?? null;
  const hasMore = !!(data?.hasMore ?? (nextCursor && items.length > 0));
  const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : null;
  return { items, cursor: nextCursor, hasMore, total };
}

async function loadLogsAdmin({ reset = true } = {}) {
  if (st.busy) return;
  setBusy(true);

  try {
    const { q, level } = st.filter;
    const cursor = reset ? null : st.cursor;
    const { items, cursor: nextCursor, hasMore, total } = await fetchLogs({ cursor, q, level, limit: 50 });

    if (reset) {
      st.items = [];
      st.cursor = null;
      st.exhausted = false;
      st.totalHint = total ?? null;
      const { list } = getDom();
      if (list) list.innerHTML = '';
    }

    st.items.push(...items);
    appendItems(items);

    st.cursor = nextCursor || null;
    st.exhausted = !hasMore;
    if (!hasMore) {
      const { moreBtn } = getDom();
      if (moreBtn) { moreBtn.disabled = true; moreBtn.textContent = 'Больше нет'; }
    }
  } catch (e) {
    const { list } = getDom();
    if (list) {
      if (!st.items.length) {
        list.innerHTML = '<div class="muted">Ошибка загрузки</div>';
      } else {
        list.insertAdjacentHTML('beforeend', '<div class="muted">Ошибка при догрузке</div>');
      }
    }
  } finally {
    setBusy(false);
  }
}

function loadMoreLogsAdmin() {
  if (st.exhausted || st.busy) return;
  loadLogsAdmin({ reset: false });
}

function setLogsFilter() {
  const { q, level } = getDom();
  st.filter.q = (q?.value || '').trim();
  st.filter.level = (level?.value || 'all');
  loadLogsAdmin({ reset: true });
}

// ——— Очистка и экспорт ———
async function clearLogsAdmin() {
  if (!confirm('Очистить все логи? Это действие необратимо.')) return;
  try {
    const res = await fetch(API + '/admin/logs/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() }
    });
    if (!ensureAuthedOrLogin(res)) return;
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d?.ok) {
      alert('Не удалось очистить: ' + (d?.error || res.status));
      return;
    }
    // Сброс локального состояния
    st.items = [];
    st.cursor = null;
    st.exhausted = true;
    const { list, total, empty, moreBtn } = getDom();
    if (list) list.innerHTML = '';
    if (total) total.textContent = '0';
    if (empty) empty.style.display = '';
    if (moreBtn) { moreBtn.disabled = true; moreBtn.textContent = 'Больше нет'; }
    alert('Логи очищены');
  } catch (e) {
    alert('Сеть недоступна');
  }
}

function toCsvRow(fields) {
  return fields.map(v => {
    const s = v == null ? '' : String(v);
    // Экранируем CSV-правилами
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }).join(',');
}

async function exportLogsAdmin() {
  if (st.busy) return;
  setBusy(true);

  try {
    // Выгрузим все страницы под текущий фильтр
    const { q, level } = st.filter;
    let cursor = null;
    let collected = [];
    let guard = 0;
    const MAX_PAGES = 200; // защитный предел
    const LIMIT = 200;     // крупнее для экспорта

    do {
      const { items, cursor: nextCursor } = await fetchLogs({ cursor, q, level, limit: LIMIT });
      collected.push(...items);
      cursor = nextCursor || null;
      guard++;
      if (!cursor) break;
    } while (guard < MAX_PAGES);

    if (!collected.length) {
      alert('Нет данных для экспорта');
      return;
    }

    const header = ['ts', 'ts_iso', 'level', 'message', 'ip', 'source', 'ua', 'meta_json'];
    const rows = [toCsvRow(header)];

    for (const it of collected) {
      const tsNum = Number(it.ts);
      const tsIso = Number.isFinite(tsNum) ? new Date(tsNum < 10_000_000_000 ? tsNum * 1000 : tsNum).toISOString() : '';
      const meta = it.meta || it.extra || null;
      const metaJson = meta ? JSON.stringify(meta) : '';
      rows.push(toCsvRow([
        it.ts ?? '',
        tsIso,
        (it.level || '').toLowerCase(),
        it.msg || it.message || '',
        it.ip || '',
        it.source || '',
        it.ua || '',
        metaJson
      ]));
    }

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.href = url;
    a.download = `logs_${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Ошибка экспорта');
  } finally {
    setBusy(false);
  }
}

// ——— Вспомогательная: сворачивание/разворачивание подробностей ———
function toggleLogDetails(rowEl) {
  if (!rowEl) return;
  const next = rowEl.nextElementSibling;
  if (!next || !next.classList.contains('log-row-details')) return;
  const show = next.style.display === 'none' || next.style.display === '';
  // Спрячем все открытые, если хотите режим "аккордеона"
  // document.querySelectorAll('.log-row-details').forEach(el => el.style.display = 'none');
  next.style.display = show ? 'block' : 'none';
}

// ——— Экспорт на window для inline-обработчиков ———
window.loadLogsAdmin = loadLogsAdmin;
window.loadMoreLogsAdmin = loadMoreLogsAdmin;
window.setLogsFilter = setLogsFilter;
window.clearLogsAdmin = clearLogsAdmin;
window.exportLogsAdmin = exportLogsAdmin;
window.toggleLogDetails = toggleLogDetails;

// ——— Автоинициализация (не навязчивая) ———
// Если вкладка "Логи" уже в DOM и есть список — можно сразу подгрузить первую страницу.
// Модуль не будет падать, если элементов нет.
document.addEventListener('DOMContentLoaded', () => {
  const { list } = getDom();
  if (list) {
    // Подхватим начальные значения фильтра, если есть поля
    const { q, level } = getDom();
    st.filter.q = (q?.value || '').trim();
    st.filter.level = (level?.value || 'all');
    loadLogsAdmin({ reset: true });
  }
});

