// admin/main-admin.js
// Главный bootstrap для VR Admin: авторизация, навигация, автозагрузка.
// Импортирует модули вкладок, поднимает общие функции на window (needLogin, guardApp, adminLogin, switchTab).

// Импорт ВСЕХ модулей вкладок (они внутри сами прокидывают публичные API на window)
import './claims-admin.js';
import './logs-admin.js';
import './demo-admin.js';
import './prizes-admin.js';
import './feedback-admin.js';
import './devices-admin.js';
import './backups-admin.js';
import './stats-admin.js';

// Ключ Basic Auth, как у вас
const authKey = 'vr_admin_auth';

// Общие функции авторизации
function guardApp() {
  const authed = !!sessionStorage.getItem(authKey);
  document.querySelectorAll('header, main, .footer').forEach(el => {
    if (!el) return;
    el.style.display = authed ? '' : 'none';
  });
  const login = document.getElementById('login');
  if (login) login.style.display = authed ? 'none' : '';
  return authed;
}
function needLogin(show = true) {
  const has = !!sessionStorage.getItem(authKey);
  if (!has && show) guardApp();
  return !has;
}
function adminLogin() {
  const u = document.getElementById('adm-user')?.value.trim();
  const p = document.getElementById('adm-pass')?.value.trim();
  if (!u || !p) {
    const err = document.getElementById('login-err');
    if (err) err.textContent = 'Введите логин и пароль';
    return;
  }
  const token = 'Basic ' + btoa(u + ':' + p);
  sessionStorage.setItem(authKey, token);
  if (guardApp() && typeof window.loadClaims === 'function') window.loadClaims();
}

// Экспортируем общие функции на window (их вызывают модули при 401)
window.guardApp = guardApp;
window.needLogin = needLogin;
window.adminLogin = adminLogin;

// Переключение вкладок
function switchTab(tab) {
  const tabs = ['claims','devices','backups','logs','stats','demo','fb','prizes'];
  tabs.forEach(t => document.getElementById('tab-'+t)?.classList.toggle('active', tab===t));
  tabs.forEach(t => {
    const v = document.getElementById('view-'+t);
    if (v && v.style) v.style.display = (tab === t) ? '' : 'none';
  });

  // Вызовы загрузчиков соответствующих модулей (импортированы выше и прокинули API на window)
  if (tab === 'prizes'  && typeof window.loadPrizesAdmin === 'function') window.loadPrizesAdmin();
  if (tab === 'devices' && typeof window.loadDevices === 'function') window.loadDevices();
  if (tab === 'backups' && typeof window.loadBackups === 'function') window.loadBackups();
  if (tab === 'logs'    && typeof window.loadLogs === 'function') window.loadLogs();
  if (tab === 'stats') {
    if (typeof window.loadMetrics  === 'function') window.loadMetrics();
    if (typeof window.loadGsConfig === 'function') window.loadGsConfig();
  }
  if (tab === 'demo' && typeof window.loadDemoPanel === 'function') window.loadDemoPanel();
  if (tab === 'fb'   && typeof window.loadThreads === 'function') window.loadThreads();
}
window.switchTab = switchTab;

// Навешиваем обработчики вкладок и logout
function wireTabs() {
  document.getElementById('tab-claims')?.addEventListener('click', () => switchTab('claims'));
  document.getElementById('tab-devices')?.addEventListener('click', () => switchTab('devices'));
  document.getElementById('tab-backups')?.addEventListener('click', () => switchTab('backups'));
  document.getElementById('tab-logs')?.addEventListener('click', () => switchTab('logs'));
  document.getElementById('tab-stats')?.addEventListener('click', () => switchTab('stats'));
  document.getElementById('tab-demo')?.addEventListener('click', () => switchTab('demo'));
  document.getElementById('tab-fb')?.addEventListener('click', () => switchTab('fb'));
  document.getElementById('tab-prizes')?.addEventListener('click', () => switchTab('prizes'));
  document.getElementById('tab-logout')?.addEventListener('click', () => {
    sessionStorage.removeItem(authKey);
    guardApp();
    needLogin(true);
  });
}

// Keydown для Enter на форме логина
document.addEventListener('keydown', (e) => {
  const loginShown = document.getElementById('login')?.style.display !== 'none';
  if (!loginShown) return;
  if (e.key === 'Enter') adminLogin();
});

// Автологин-проверка и авто-открытие вкладок по URL
window.addEventListener('load', () => {
  wireTabs();

  if (needLogin(true)) return; // покажет форму входа
  guardApp();

  // Первая загрузка — как раньше: заявки
  if (typeof window.loadClaims === 'function') window.loadClaims();

  // Автоподстановка tg и автопереход на вкладку из URL
  try {
    const u = new URL(window.location.href);
    const tab = (u.searchParams.get('tab') || '').trim();
    const tg  = (u.searchParams.get('tg') || '').trim();
    if (tg) {
      const inp = document.getElementById('demo-tg');
      if (inp) inp.value = tg;
    }
    if (tab && document.getElementById('tab-' + tab)) {
      switchTab(tab);
      if (tab === 'demo' && typeof window.loadDemoPanel === 'function') {
        window.loadDemoPanel();
      }
    }
  } catch (e) {
    // no-op
  }
});
