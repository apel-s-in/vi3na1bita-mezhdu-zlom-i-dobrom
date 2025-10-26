// admin/prizes-admin.js
// Небольшой изолированный модуль для вкладки "Призы" в админке.
// Ничего не ломает, добавляет недостающие функции и экспортирует их на window.

// ВАЖНО: ниже эндпоинт совпадает с тем, что у вас в admin.html.
// Если в будущем захотите, можно брать API с window.API, но его нет на window.
// Поэтому дублируем сюда ту же строку.
const API = 'https://vr-backend.apel-s-in.workers.dev';
const authKey = 'vr_admin_auth';

// Лёгкие хелперы (локальные, не конфликтуют с остальными)
function authHeader() {
  const tok = sessionStorage.getItem(authKey);
  return tok ? { Authorization: tok } : {};
}
function ensureAuthedOrLogin(res) {
  if (res.status === 401) {
    sessionStorage.removeItem(authKey);
    try {
      // если в странице уже есть guardApp — подсветит форму входа
      // но на случай отсутствия — перезагрузим страницу
      if (typeof window.guardApp === 'function') window.guardApp();
    } catch {}
    return false;
  }
  return true;
}
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ————— Рендер и взаимодействия —————
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
    const attrs = `data-id="${id}" data-title="${title}" data-short="${short}" data-long="${escapeHtml(it.long || '')}" data-img="${img}"`;
    return `
      <div class="row" ${attrs} onclick="editAdmPrize(this)">
        <div>
          <div><b>${title}</b> <span class="muted">(#${id})</span></div>
          <div class="muted">${short || '—'}</div>
        </div>
        <div class="muted" style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${img}</div>
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

// ————— Публичные функции (экспорт на window) —————

// Загрузка списка призов
async function loadPrizesAdmin() {
  try {
    const res = await fetch(API + '/admin/prizes', { headers: { ...authHeader() } });
    if (!ensureAuthedOrLogin(res)) return;
    const d = await res.json().catch(() => ({}));
    const items = Array.isArray(d?.items) ? d.items : [];
    paintPrizesList(items);
    // Не стираем редактор, чтобы не терять введённое — только при первой загрузке можно явно очищать
    // clearAdmPrizeEditor();
  } catch (e) {
    const box = document.getElementById('adm-prizes-list');
    if (box) box.innerHTML = '<div class="muted">Ошибка загрузки</div>';
  }
}

// Клик по элементу списка — предзаполняем редактор
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
    // Обновляем список и редактор под новый/актуальный id
    await loadPrizesAdmin();
    if (d.id) {
      document.getElementById('adm-prize-id').value = d.id;
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

// ————— Экспортируем на window для inline-обработчиков в admin.html —————
window.loadPrizesAdmin = loadPrizesAdmin;
window.savePrize = savePrize;
window.deletePrize = deletePrize;
window.editAdmPrize = editAdmPrize;           // клики по строкам в списке
window.clearAdmPrizeEditor = clearAdmPrizeEditor;

