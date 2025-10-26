// admin/prizes-admin.js
// Модуль админки для вкладки "Призы": список, редактирование, сохранение, удаление.
// Полностью совместим с вашим admin.html: те же id и семантика.
// Функции экспортируются на window: loadPrizesAdmin, savePrize, deletePrize, editAdmPrize, clearAdmPrizeEditor.

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
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// ——— Рендер списка ———
function paintPrizesList(items = []) {
  const box = document.getElementById('adm-prizes-list');
  if (!box) return;

  if (!items.length) {
    box.innerHTML = '<div class="muted">Пока нет ни одного приза</div>';
    return;
  }

  box.innerHTML = items.map(it => {
    const id = escapeHtml(it.id || '');
    const title = escapeHtml(it.title || '');
    const short = escapeHtml(it.short || '');
    const img = escapeHtml(it.img || '');
    // Для предзаполнения редактора сохраним все нужные поля как data-атрибуты
    const attrs = [
      ['data-id', id],
      ['data-title', title],
      ['data-short', short],
      ['data-long', escapeHtml(it.long || '')],
      ['data-img', img]
    ].map(([k,v]) => `${k}="${v}"`).join(' ');

    return `
      <div class="row" ${attrs} onclick="editAdmPrize(this)">
        <div>
          <div><b>${title || '(без названия)'}</b> <span class="muted">${id ? `(#${id})` : ''}</span></div>
          <div class="muted">${short || '—'}</div>
        </div>
        <div class="muted" style="max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${img}</div>
      </div>
    `;
  }).join('');
}

function fillEditorFromAttrs(el) {
  const id = el.getAttribute('data-id') || '';
  const title = el.getAttribute('data-title') || '';
  const short = el.getAttribute('data-short') || '';
  const longTxt = el.getAttribute('data-long') || '';
  const img = el.getAttribute('data-img') || '';

  const fId = document.getElementById('adm-prize-id');
  const fTitle = document.getElementById('adm-prize-title');
  const fShort = document.getElementById('adm-prize-short');
  const fLong = document.getElementById('adm-prize-long');
  const fImg = document.getElementById('adm-prize-img');

  if (fId) fId.value = id;
  if (fTitle) fTitle.value = title;
  if (fShort) fShort.value = short;
  if (fLong) fLong.value = longTxt;
  if (fImg) fImg.value = img;
}

function clearAdmPrizeEditor() {
  const fId = document.getElementById('adm-prize-id');
  const fTitle = document.getElementById('adm-prize-title');
  const fShort = document.getElementById('adm-prize-short');
  const fLong = document.getElementById('adm-prize-long');
  const fImg = document.getElementById('adm-prize-img');

  if (fId) fId.value = '';
  if (fTitle) fTitle.value = '';
  if (fShort) fShort.value = '';
  if (fLong) fLong.value = '';
  if (fImg) fImg.value = '';
}

// ——— API ———

// Список призов
async function loadPrizesAdmin() {
  try {
    const res = await fetch(API + '/admin/prizes', { headers: { ...authHeader() } });
    if (!ensureAuthedOrLogin(res)) return;
    const d = await res.json().catch(() => ({}));
    const items = Array.isArray(d?.items) ? d.items : [];
    paintPrizesList(items);
    // Редактор не очищаем, чтобы не потерять ввод
  } catch (e) {
    const box = document.getElementById('adm-prizes-list');
    if (box) box.innerHTML = '<div class="muted">Ошибка загрузки</div>';
  }
}

// Клик по строке — предзаполнить редактор
function editAdmPrize(rowEl) {
  if (!rowEl) return;
  fillEditorFromAttrs(rowEl);
}

// Сохранение (create/update)
async function savePrize() {
  const id = (document.getElementById('adm-prize-id')?.value || '').trim();
  const title = (document.getElementById('adm-prize-title')?.value || '').trim();
  const short = (document.getElementById('adm-prize-short')?.value || '').trim();
  const longTxt = (document.getElementById('adm-prize-long')?.value || '').trim();
  const img = (document.getElementById('adm-prize-img')?.value || '').trim();

  if (!title) { alert('Укажите название'); return; }
  if (!img)   { alert('Укажите URL картинки (img/...)'); return; }

  try {
    const res = await fetch(API + '/admin/prize/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ id, title, short, long: longTxt, img })
    });
    if (!ensureAuthedOrLogin(res)) return;
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d?.ok) {
      alert('Не сохранено: ' + (d?.error || res.status));
      return;
    }
    alert('Сохранено');

    // Обновим список и подставим актуальный id (если создан новый)
    await loadPrizesAdmin();
    if (d.id) {
      const fId = document.getElementById('adm-prize-id');
      if (fId) fId.value = d.id;
    }
  } catch (e) {
    alert('Сеть недоступна');
  }
}

// Удаление
async function deletePrize() {
  const id = (document.getElementById('adm-prize-id')?.value || '').trim();
  if (!id) { alert('Сначала выберите приз (или укажите ID)'); return; }
  if (!confirm(`Удалить приз "${id}"?`)) return;

  try {
    const res = await fetch(API + '/admin/prize/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ id })
    });
    if (!ensureAuthedOrLogin(res)) return;
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d?.ok) {
      alert('Не удалено: ' + (d?.error || res.status));
      return;
    }
    alert('Удалено');
    clearAdmPrizeEditor();
    await loadPrizesAdmin();
  } catch (e) {
    alert('Сеть недоступна');
  }
}

// ——— Экспорт в window для inline onclick ———
window.loadPrizesAdmin = loadPrizesAdmin;
window.savePrize = savePrize;
window.deletePrize = deletePrize;
window.editAdmPrize = editAdmPrize;
window.clearAdmPrizeEditor = clearAdmPrizeEditor;

// ——— Необязательная автоинициализация ———
// Если список присутствует в DOM (вкладка открыта), можно подгрузить его при загрузке страницы.
// Безопасно: если элементов нет — ничего не делаем.
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('adm-prizes-list');
  if (box) {
    loadPrizesAdmin();
  }
});
