(function () {
  'use strict';

  var HOME_ICON_ID = 'chg-dot';
  var HOME_CARD_ID = 'chg-card';
  var HOME_BADGE_ID = 'chg-badge';
  var PAGE_BANNER_ID = 'chg-page-banner';
  var STYLE_ID = 'chg-styles';

  function getLang() {
    return localStorage.getItem('rosterLang') || 'en';
  }

  function t(key, lang) {
    var dict = {
      ar: {
        changed: 'تم تعديل جدولك',
        details: 'عرض التفاصيل',
        dismiss: 'عدم الإظهار',
        minimize: 'تصغير',
        close: 'إغلاق',
        changedDays: 'أيام متغيرة',
        viewSchedule: 'فتح جدولي',
        noDetails: 'يوجد تحديث في جدولك.',
        updated: 'تحديث',
        changedToday: 'تم تعديل هذا اليوم',
        changedDates: 'الأيام المتغيرة'
      },
      en: {
        changed: 'Your schedule changed',
        details: 'View details',
        dismiss: 'Hide',
        minimize: 'Minimize',
        close: 'Close',
        changedDays: 'changed days',
        viewSchedule: 'Open My Schedule',
        noDetails: 'Your roster has been updated.',
        updated: 'Update',
        changedToday: 'This day was changed',
        changedDates: 'Changed dates'
      }
    };
    return (dict[lang] && dict[lang][key]) || key;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getEmployeeId() {
    var fromUrl = new URLSearchParams(window.location.search).get('emp');
    if (fromUrl && /^\d+$/.test(fromUrl.trim())) return fromUrl.trim();

    var saved = localStorage.getItem('savedEmpId');
    if (saved && /^\d+$/.test(saved.trim())) return saved.trim();

    return '';
  }

  function getBase() {
    return '/roster-site/';
  }

  function onHomePage() {
    var path = window.location.pathname || '';
    return /\/roster-site\/?$/.test(path) || /\/roster-site\/date\//.test(path);
  }

  function onMySchedulePage() {
    var path = window.location.pathname || '';
    return /\/roster-site\/my-schedules\/index\.html$/.test(path) || /\/roster-site\/my-schedules\/?$/.test(path);
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function activeAlert(data) {
    var alerts = (data && data.change_alerts) || {};
    var keys = Object.keys(alerts).sort().reverse();
    for (var i = 0; i < keys.length; i++) {
      var a = alerts[keys[i]];
      if (a && a.is_active) return a;
    }
    return null;
  }

  function dismissKey(empId, alert) {
    return 'chgDismissed_' + empId + '_' + ((alert && alert.change_hash) || 'none');
  }

  function minimizeKey(empId, alert) {
    return 'chgMinimized_' + empId + '_' + ((alert && alert.change_hash) || 'none');
  }

  function isDismissed(empId, alert) {
    return localStorage.getItem(dismissKey(empId, alert)) === '1';
  }

  function isMinimized(empId, alert) {
    return localStorage.getItem(minimizeKey(empId, alert)) === '1';
  }

  function markDismissed(empId, alert) {
    localStorage.setItem(dismissKey(empId, alert), '1');
    localStorage.removeItem(minimizeKey(empId, alert));
  }

  function markMinimized(empId, alert) {
    localStorage.setItem(minimizeKey(empId, alert), '1');
  }

  function clearMinimized(empId, alert) {
    localStorage.removeItem(minimizeKey(empId, alert));
  }

  function myScheduleUrl(empId) {
    var base = getBase() + 'my-schedules/index.html';
    return empId ? base + '?emp=' + encodeURIComponent(empId) : base;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${HOME_ICON_ID} {
        position: fixed;
        left: 12px;
        bottom: 98px;
        width: 48px;
        height: 48px;
        border-radius: 16px;
        border: 2px solid rgba(255,255,255,.95);
        background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 26px rgba(0,0,0,.22);
        z-index: 9998;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      #${HOME_ICON_ID}[hidden] {
        display: none !important;
      }

      #${HOME_ICON_ID} .chg-dot-icon {
        font-size: 20px;
        line-height: 1;
      }

      #${HOME_BADGE_ID} {
        position: absolute;
        right: -8px;
        top: -8px;
        min-width: 22px;
        height: 22px;
        padding: 0 6px;
        border-radius: 999px;
        background: #7f1d1d;
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #fff;
        box-shadow: 0 4px 10px rgba(0,0,0,.18);
      }

      #${HOME_CARD_ID} {
        position: fixed;
        left: 12px;
        bottom: 154px;
        width: min(330px, calc(100vw - 24px));
        background: #fff;
        border: 1px solid rgba(15,23,42,.08);
        border-radius: 18px;
        box-shadow: 0 18px 40px rgba(15,23,42,.18);
        z-index: 9999;
        overflow: hidden;
      }

      #${HOME_CARD_ID}[hidden] {
        display: none !important;
      }

      .chg-card-head {
        padding: 14px 14px 10px;
        background: linear-gradient(135deg, #fff7ed, #fef2f2);
        border-bottom: 1px solid rgba(15,23,42,.06);
      }

      .chg-card-title {
        font-size: 15px;
        font-weight: 900;
        color: #9a3412;
        margin: 0 0 4px 0;
      }

      .chg-card-text {
        margin: 0;
        font-size: 13px;
        line-height: 1.7;
        color: #475569;
      }

      .chg-card-body {
        padding: 12px 14px;
      }

      .chg-days {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .chg-day {
        background: #f8fafc;
        border: 1px solid rgba(15,23,42,.06);
        border-radius: 12px;
        padding: 9px 10px;
      }

      .chg-day-date {
        font-size: 12px;
        font-weight: 800;
        color: #0f172a;
        margin-bottom: 4px;
      }

      .chg-day-shifts {
        font-size: 12px;
        color: #475569;
      }

      .chg-card-actions {
        display: flex;
        gap: 8px;
        padding: 0 14px 14px;
      }

      .chg-btn {
        flex: 1;
        border: none;
        border-radius: 12px;
        padding: 11px 10px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      .chg-btn-primary {
        background: #1d4ed8;
        color: #fff;
      }

      .chg-btn-muted {
        background: #e2e8f0;
        color: #0f172a;
      }

      #${PAGE_BANNER_ID} {
        margin: 14px 0;
        background: linear-gradient(135deg, #fff7ed, #fef2f2);
        border: 1px solid #fdba74;
        border-radius: 18px;
        padding: 14px;
        box-shadow: 0 8px 24px rgba(15,23,42,.08);
      }

      .chg-page-title {
        font-size: 16px;
        font-weight: 900;
        color: #9a3412;
        margin: 0 0 6px 0;
      }

      .chg-page-text {
        margin: 0 0 10px 0;
        color: #475569;
        font-size: 13px;
        line-height: 1.7;
      }

      .chg-page-list {
        margin: 0;
        padding-left: 18px;
        color: #334155;
        font-size: 13px;
      }

      .chg-changed-day {
        border: 2px solid #dc2626 !important;
        box-shadow: 0 0 0 3px rgba(220,38,38,.12);
        border-radius: 12px !important;
        position: relative;
      }

      .chg-changed-day::after {
        content: "!";
        position: absolute;
        top: 6px;
        right: 6px;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: #dc2626;
        color: #fff;
        font-size: 11px;
        font-weight: 900;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(220,38,38,.25);
      }

      body.ar #${HOME_CARD_ID},
      body.ar #${PAGE_BANNER_ID} {
        direction: rtl;
      }

      body.ar .chg-card-actions {
        flex-direction: row-reverse;
      }

      body.ar .chg-page-list {
        padding-right: 18px;
        padding-left: 0;
      }

      body.ar .chg-changed-day::after {
        right: auto;
        left: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  function shortDaysHtml(alert) {
    var days = (alert.days || []).slice(0, 3);
    if (!days.length) return '';

    return '<ul class="chg-days">' + days.map(function (item) {
      var oldCode = item.old_shift_code || '-';
      var newCode = item.new_shift_code || '-';
      return (
        '<li class="chg-day">' +
          '<div class="chg-day-date">' + escapeHtml(item.date || '') + '</div>' +
          '<div class="chg-day-shifts">' + escapeHtml(oldCode + ' → ' + newCode) + '</div>' +
        '</li>'
      );
    }).join('') + '</ul>';
  }

  function clearHomeUI() {
    var icon = document.getElementById(HOME_ICON_ID);
    var card = document.getElementById(HOME_CARD_ID);
    if (icon) icon.hidden = true;
    if (card) card.hidden = true;
  }

  function ensureHomeUI(empId, alert, lang) {
    var icon = document.getElementById(HOME_ICON_ID);
    if (!icon) {
      icon = document.createElement('button');
      icon.id = HOME_ICON_ID;
      icon.type = 'button';
      icon.innerHTML =
        '<span class="chg-dot-icon">🔄</span>' +
        '<span id="' + HOME_BADGE_ID + '">' + escapeHtml(String(alert.total_changed_days || 0)) + '</span>';
      document.body.appendChild(icon);
    } else {
      var badge = icon.querySelector('#' + HOME_BADGE_ID);
      if (badge) badge.textContent = String(alert.total_changed_days || 0);
    }

    var card = document.getElementById(HOME_CARD_ID);
    if (!card) {
      card = document.createElement('div');
      card.id = HOME_CARD_ID;
      document.body.appendChild(card);
    }

    var summaryText = (alert.summary && (lang === 'ar' ? alert.summary.ar : alert.summary.en)) || t('noDetails', lang);

    card.innerHTML =
      '<div class="chg-card-head">' +
        '<div class="chg-card-title">⚠️ ' + t('changed', lang) + '</div>' +
        '<p class="chg-card-text">' + escapeHtml(summaryText) + '</p>' +
      '</div>' +
      '<div class="chg-card-body">' +
        shortDaysHtml(alert) +
      '</div>' +
      '<div class="chg-card-actions">' +
        '<button class="chg-btn chg-btn-primary" data-act="open">' + t('viewSchedule', lang) + '</button>' +
        '<button class="chg-btn chg-btn-muted" data-act="minimize">' + t('minimize', lang) + '</button>' +
        '<button class="chg-btn chg-btn-muted" data-act="dismiss">' + t('dismiss', lang) + '</button>' +
      '</div>';

    icon.hidden = false;
    card.hidden = isMinimized(empId, alert);

    icon.onclick = function () {
      clearMinimized(empId, alert);
      card.hidden = !card.hidden;
    };

    card.onclick = function (e) {
      var act = e.target && e.target.getAttribute('data-act');
      if (!act) return;

      if (act === 'open') {
        window.location.href = myScheduleUrl(empId);
        return;
      }

      if (act === 'minimize') {
        markMinimized(empId, alert);
        card.hidden = true;
        icon.hidden = false;
        return;
      }

      if (act === 'dismiss') {
        markDismissed(empId, alert);
        card.hidden = true;
        icon.hidden = true;
      }
    };
  }

  function ensurePageBanner(alert, lang) {
    var holder =
      document.querySelector('.wrap') ||
      document.querySelector('main') ||
      document.body;

    var old = document.getElementById(PAGE_BANNER_ID);
    if (old) old.remove();

    var summaryText = (alert.summary && (lang === 'ar' ? alert.summary.ar : alert.summary.en)) || t('noDetails', lang);
    var box = document.createElement('div');
    box.id = PAGE_BANNER_ID;

    box.innerHTML =
      '<div class="chg-page-title">⚠️ ' + t('changed', lang) + '</div>' +
      '<p class="chg-page-text">' + escapeHtml(summaryText) + '</p>' +
      (
        (alert.days || []).length
          ? '<ul class="chg-page-list">' + alert.days.map(function (item) {
              var oldCode = item.old_shift_code || '-';
              var newCode = item.new_shift_code || '-';
              return '<li>' + escapeHtml((item.date || '') + ' — ' + oldCode + ' → ' + newCode) + '</li>';
            }).join('') + '</ul>'
          : ''
      );

    holder.insertBefore(box, holder.firstChild);
  }

  function highlightChangedDays(alert) {
    if (!alert || !alert.days || !alert.days.length) return;

    var changedDates = {};
    alert.days.forEach(function (item) {
      if (item && item.date) changedDates[item.date] = true;
    });

    // 1) الأفضل: عناصر تحمل data-date
    var dataDateNodes = document.querySelectorAll('[data-date]');
    dataDateNodes.forEach(function (el) {
      var d = (el.getAttribute('data-date') || '').trim();
      if (changedDates[d]) {
        el.classList.add('chg-changed-day');
        el.setAttribute('title', t('changedToday', getLang()));
      }
    });

    // 2) fallback: ابحث في النصوص إذا الصفحة لا تستخدم data-date
    var possibleDayCards = document.querySelectorAll('.dayCard, .day-card, .schedule-day, .calendar-day, .monthDay, .month-day, .day');
    possibleDayCards.forEach(function (el) {
      if (el.classList.contains('chg-changed-day')) return;

      var txt = (el.textContent || '').trim();
      for (var dateKey in changedDates) {
        if (!Object.prototype.hasOwnProperty.call(changedDates, dateKey)) continue;
        var shortDate = dateKey.slice(8); // DD
        var fullDate = dateKey;
        if (txt.indexOf(fullDate) !== -1 || txt.indexOf(shortDate) !== -1) {
          el.classList.add('chg-changed-day');
          el.setAttribute('title', t('changedToday', getLang()));
          break;
        }
      }
    });
  }

var lastRenderedEmpId = '';
var lastRenderedHash = '';

function renderForEmployee(empId) {
  if (!empId) return;

  var lang = getLang();
  var url = getBase() + 'schedules/' + encodeURIComponent(empId) + '.json';

  fetchJson(url)
    .then(function (data) {
      var currentEmpId = getEmployeeId();
      if (!currentEmpId || currentEmpId !== empId) return;

      var alert = activeAlert(data);

      if (!alert || !alert.is_active) {
        if (currentEmpId === empId) {
          clearHomeUI();
        }
        return;
      }

      lastRenderedEmpId = empId;
      lastRenderedHash = alert.change_hash || '';

      if (isDismissed(empId, alert)) {
        clearHomeUI();
        return;
      }

      if (onHomePage()) {
        ensureHomeUI(empId, alert, lang);
      }

      if (onMySchedulePage()) {
        ensurePageBanner(alert, lang);
        setTimeout(function () { highlightChangedDays(alert); }, 300);
        setTimeout(function () { highlightChangedDays(alert); }, 1200);
        setTimeout(function () { highlightChangedDays(alert); }, 2500);
      }
    })
    .catch(function (err) {
      console.warn('change-alert fetch failed:', err);
      // لا تمسح الواجهة هنا حتى لا يختفي التنبيه بعد ظهوره
    });
}

function boot() {
  injectStyles();
  var empId = getEmployeeId();
  if (!empId) return;
  renderForEmployee(empId);
}

  document.addEventListener('DOMContentLoaded', function () {
    boot();
    setTimeout(boot, 1200);
    setTimeout(boot, 3500);
  });
})();
