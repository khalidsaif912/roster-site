(function () {
  'use strict';

  var HOME_ICON_ID = 'chg-dot';
  var HOME_CARD_ID = 'chg-card';
  var HOME_BADGE_ID = 'chg-badge';
  var PAGE_BANNER_ID = 'chg-page-banner';

  function lang() {
    return localStorage.getItem('rosterLang') || 'en';
  }

  function t(key, l) {
    var ar = {
      changed: 'تم تعديل جدولك',
      details: 'عرض التفاصيل',
      dismiss: 'إخفاء',
      close: 'إغلاق',
      changedDays: 'أيام متغيرة',
      viewSchedule: 'فتح جدولي',
      noDetails: 'يوجد تحديث في جدولك.',
      updated: 'تحديث'
    };
    var en = {
      changed: 'Your schedule changed',
      details: 'View details',
      dismiss: 'Dismiss',
      close: 'Close',
      changedDays: 'changed days',
      viewSchedule: 'Open My Schedule',
      noDetails: 'Your roster has been updated.',
      updated: 'Update'
    };
    var dict = l === 'ar' ? ar : en;
    return dict[key] || key;
  }

  function getEmployeeId() {
    var fromUrl = new URLSearchParams(window.location.search).get('emp');
    if (fromUrl) return fromUrl.trim();

    var saved = localStorage.getItem('savedEmpId');
    if (saved) return saved.trim();

    return '';
  }

  function onHomePage() {
    var p = window.location.pathname || '';
    return /\/roster-site\/?$/.test(p) || /\/roster-site\/date\//.test(p);
  }

  function onMySchedulePage() {
    var p = window.location.pathname || '';
    return /\/roster-site\/my-schedules\/index\.html$/.test(p) || /\/roster-site\/my-schedules\/?$/.test(p);
  }

  function getBase() {
    return '/roster-site/';
  }

  function injectStyles() {
    if (document.getElementById('chg-styles')) return;

    var css = `
      #${HOME_ICON_ID}{
        position:fixed;
        left:12px;
        bottom:96px; /* أعلى من أيقونة الغياب */
        width:46px;
        height:46px;
        border-radius:14px;
        background:linear-gradient(135deg,#f59e0b,#ef4444);
        color:#fff;
        box-shadow:0 8px 24px rgba(0,0,0,.22);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:9997;
        cursor:pointer;
        border:2px solid rgba(255,255,255,.9);
        -webkit-tap-highlight-color:transparent;
      }

      #${HOME_ICON_ID}[hidden]{ display:none !important; }

      #${HOME_ICON_ID} .chg-dot-icon{
        font-size:20px;
        line-height:1;
      }

      #${HOME_BADGE_ID}{
        position:absolute;
        right:-8px;
        top:-8px;
        min-width:22px;
        height:22px;
        padding:0 6px;
        border-radius:999px;
        background:#7f1d1d;
        color:#fff;
        font-size:11px;
        font-weight:800;
        display:flex;
        align-items:center;
        justify-content:center;
        border:2px solid #fff;
        box-shadow:0 4px 10px rgba(0,0,0,.18);
      }

      #${HOME_CARD_ID}{
        position:fixed;
        left:12px;
        bottom:150px;
        width:min(320px, calc(100vw - 24px));
        background:#fff;
        border:1px solid rgba(15,23,42,.08);
        border-radius:18px;
        box-shadow:0 18px 40px rgba(15,23,42,.18);
        z-index:9998;
        overflow:hidden;
      }

      #${HOME_CARD_ID}[hidden]{ display:none !important; }

      .chg-card-head{
        padding:14px 14px 10px;
        background:linear-gradient(135deg,#fff7ed,#fef2f2);
        border-bottom:1px solid rgba(15,23,42,.06);
      }

      .chg-card-title{
        font-size:15px;
        font-weight:900;
        color:#7c2d12;
        margin:0 0 4px 0;
      }

      .chg-card-text{
        margin:0;
        font-size:13px;
        line-height:1.6;
        color:#475569;
      }

      .chg-card-body{
        padding:12px 14px;
      }

      .chg-days{
        margin:0;
        padding:0;
        list-style:none;
        display:flex;
        flex-direction:column;
        gap:8px;
      }

      .chg-day{
        background:#f8fafc;
        border:1px solid rgba(15,23,42,.06);
        border-radius:12px;
        padding:9px 10px;
      }

      .chg-day-date{
        font-size:12px;
        font-weight:800;
        color:#0f172a;
        margin-bottom:4px;
      }

      .chg-day-shifts{
        font-size:12px;
        color:#475569;
      }

      .chg-card-actions{
        display:flex;
        gap:8px;
        padding:0 14px 14px;
      }

      .chg-btn{
        flex:1;
        border:none;
        border-radius:12px;
        padding:11px 12px;
        font-size:13px;
        font-weight:800;
        cursor:pointer;
      }

      .chg-btn-primary{
        background:#1d4ed8;
        color:#fff;
      }

      .chg-btn-muted{
        background:#e2e8f0;
        color:#0f172a;
      }

      #${PAGE_BANNER_ID}{
        margin:14px 0;
        background:linear-gradient(135deg,#fff7ed,#fef2f2);
        border:1px solid #fdba74;
        border-radius:18px;
        padding:14px;
        box-shadow:0 8px 24px rgba(15,23,42,.08);
      }

      .chg-page-title{
        font-size:16px;
        font-weight:900;
        color:#9a3412;
        margin:0 0 6px 0;
      }

      .chg-page-text{
        margin:0 0 10px 0;
        color:#475569;
        font-size:13px;
        line-height:1.7;
      }

      .chg-page-list{
        margin:0;
        padding-left:18px;
        color:#334155;
        font-size:13px;
      }

      body.ar #${HOME_CARD_ID},
      body.ar #${PAGE_BANNER_ID}{
        direction:rtl;
      }

      body.ar .chg-card-actions{
        flex-direction:row-reverse;
      }
    `;

    var style = document.createElement('style');
    style.id = 'chg-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
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

  function dismissKey(empId, hash) {
    return 'chgDismissed_' + empId + '_' + (hash || 'none');
  }

  function isDismissed(empId, alert) {
    if (!alert) return true;
    return localStorage.getItem(dismissKey(empId, alert.change_hash)) === '1';
  }

  function markDismissed(empId, alert) {
    if (!alert) return;
    localStorage.setItem(dismissKey(empId, alert.change_hash), '1');
  }

  function myScheduleUrl(empId) {
    var base = getBase() + 'my-schedules/index.html';
    return empId ? base + '?emp=' + encodeURIComponent(empId) : base;
  }

  function shortDaysHtml(alert) {
    var days = (alert.days || []).slice(0, 3);
    if (!days.length) return '';

    return '<ul class="chg-days">' + days.map(function (d) {
      return (
        '<li class="chg-day">' +
          '<div class="chg-day-date">' + escapeHtml(d.date || '') + '</div>' +
          '<div class="chg-day-shifts">' +
            escapeHtml((d.old_shift_code || '-') + ' → ' + (d.new_shift_code || '-')) +
          '</div>' +
        '</li>'
      );
    }).join('') + '</ul>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureHomeUI(empId, alert, l) {
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

    var summaryText = (alert.summary && (l === 'ar' ? alert.summary.ar : alert.summary.en)) || t('noDetails', l);

    card.innerHTML =
      '<div class="chg-card-head">' +
        '<div class="chg-card-title">⚠️ ' + t('changed', l) + '</div>' +
        '<p class="chg-card-text">' + escapeHtml(summaryText) + '</p>' +
      '</div>' +
      '<div class="chg-card-body">' +
        shortDaysHtml(alert) +
      '</div>' +
      '<div class="chg-card-actions">' +
        '<button class="chg-btn chg-btn-primary" data-act="open">' + t('viewSchedule', l) + '</button>' +
        '<button class="chg-btn chg-btn-muted" data-act="dismiss">' + t('dismiss', l) + '</button>' +
      '</div>';

    icon.hidden = false;
    card.hidden = false;

    icon.onclick = function () {
      card.hidden = !card.hidden;
    };

    card.onclick = function (e) {
      var act = e.target && e.target.getAttribute('data-act');
      if (!act) return;

      if (act === 'open') {
        window.location.href = myScheduleUrl(empId);
      }

      if (act === 'dismiss') {
        markDismissed(empId, alert);
        card.hidden = true;
        icon.hidden = true;
      }
    };
  }

  function ensurePageBanner(empId, alert, l) {
    var holder =
      document.querySelector('.wrap') ||
      document.querySelector('main') ||
      document.body;

    var old = document.getElementById(PAGE_BANNER_ID);
    if (old) old.remove();

    var summaryText = (alert.summary && (l === 'ar' ? alert.summary.ar : alert.summary.en)) || t('noDetails', l);
    var box = document.createElement('div');
    box.id = PAGE_BANNER_ID;

    box.innerHTML =
      '<div class="chg-page-title">⚠️ ' + t('changed', l) + '</div>' +
      '<p class="chg-page-text">' + escapeHtml(summaryText) + '</p>' +
      (
        (alert.days || []).length
          ? '<ul class="chg-page-list">' + alert.days.slice(0, 6).map(function (d) {
              return '<li>' + escapeHtml((d.date || '') + ' — ' + (d.old_shift_code || '-') + ' → ' + (d.new_shift_code || '-')) + '</li>';
            }).join('') + '</ul>'
          : ''
      );

    holder.insertBefore(box, holder.firstChild);
  }

  function clearHomeUI() {
    var icon = document.getElementById(HOME_ICON_ID);
    var card = document.getElementById(HOME_CARD_ID);
    if (icon) icon.hidden = true;
    if (card) card.hidden = true;
  }

  function renderForEmployee(empId) {
    if (!empId) return;

    var l = lang();
    fetchJson(getBase() + 'schedules/' + encodeURIComponent(empId) + '.json')
      .then(function (data) {
        var alert = activeAlert(data);

        if (!alert || isDismissed(empId, alert)) {
          clearHomeUI();
          return;
        }

        if (onHomePage()) {
          ensureHomeUI(empId, alert, l);
        }

        if (onMySchedulePage()) {
          ensurePageBanner(empId, alert, l);
        }
      })
      .catch(function () {
        clearHomeUI();
      });
  }

  function boot() {
    injectStyles();
    var empId = getEmployeeId();
    if (empId) renderForEmployee(empId);
  }

  document.addEventListener('DOMContentLoaded', function () {
    boot();
    setTimeout(boot, 1200);
    setTimeout(boot, 3500);
  });
})();
