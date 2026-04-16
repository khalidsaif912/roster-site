(function () {
  var BASE_PATH = '/roster-site';
  var ACK_PREFIX = 'rosterChangeAck:';
  var STYLE_ID = 'roster-change-alert-style';
  var initializedFor = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '' +
      '.rca-home-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 6px;border-radius:999px;background:#dc2626;color:#fff;font-size:10px;font-weight:800;line-height:1;position:absolute;top:-6px;right:-6px;box-shadow:0 4px 12px rgba(220,38,38,.35)}' +
      '.rca-home-chip{position:relative}' +
      '.rca-banner{position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top) + 12px);z-index:99998;background:linear-gradient(135deg,#991b1b,#dc2626);color:#fff;border-radius:18px;box-shadow:0 12px 30px rgba(15,23,42,.28);overflow:hidden}' +
      '.rca-banner-inner{padding:14px 14px 12px}' +
      '.rca-banner-title{font-size:15px;font-weight:900;letter-spacing:-.2px;margin:0 0 6px}' +
      '.rca-banner-text{font-size:13px;line-height:1.55;opacity:.96;margin:0}' +
      '.rca-banner-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}' +
      '.rca-btn{appearance:none;border:none;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:800;cursor:pointer}' +
      '.rca-btn-primary{background:#fff;color:#991b1b}' +
      '.rca-btn-secondary{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.2)}' +
      '.rca-list{display:none;margin-top:10px;padding:0;list-style:none;max-height:240px;overflow:auto}' +
      '.rca-list.open{display:block}' +
      '.rca-item{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 11px;margin-top:8px}' +
      '.rca-item-date{font-size:12px;font-weight:900;opacity:.92;margin-bottom:4px}' +
      '.rca-item-shift{font-size:13px;font-weight:700}' +
      '.rca-item-arrow{opacity:.85;padding:0 5px}' +
      '.rca-page-spacer{height:104px}' +
      '@media (max-width:600px){.rca-banner{left:10px;right:10px}.rca-home-badge{top:-4px;right:-4px}}';
    document.head.appendChild(style);
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function getLang() {
    if (document.body && document.body.classList.contains('ar')) return 'ar';
    var lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    return lang.indexOf('ar') === 0 ? 'ar' : 'en';
  }

  function t(key, lang) {
    var dict = {
      ar: {
        changed: 'يوجد تغيير في جدولك',
        details: 'عرض التغييرات',
        hide: 'إخفاء التفاصيل',
        ack: 'تم الاطلاع',
        go: 'اذهب إلى جدولي',
        badge: 'جديد',
        homeText: 'تم اكتشاف تغيير جديد في جدولك. افتح صفحة جدولي لرؤية الأيام المتغيرة.',
        noEmp: 'احفظ رقمك الوظيفي أولاً لإظهار التنبيه الشخصي.',
      },
      en: {
        changed: 'Your roster changed',
        details: 'Show changes',
        hide: 'Hide details',
        ack: 'Mark as seen',
        go: 'Open My Schedule',
        badge: 'New',
        homeText: 'A new change was detected in your roster. Open My Schedule to review the affected days.',
        noEmp: 'Save your employee ID first to enable personal alerts.',
      }
    };
    return (dict[lang] && dict[lang][key]) || dict.en[key] || key;
  }

  function getEmployeeId() {
    var fromUrl = new URLSearchParams(window.location.search).get('emp');
    if (fromUrl) return fromUrl.trim();
    var saved = localStorage.getItem('savedEmpId');
    if (saved) return saved.trim();
    var input = document.querySelector('input[name="emp"], input[name="employee"], input[type="search"], input[type="text"]');
    if (input && input.value && /^\d+$/.test(input.value.trim())) return input.value.trim();
    return '';
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function sortedActiveAlerts(data) {
    var alerts = Object.values((data && data.change_alerts) || {}).filter(function (item) {
      return item && item.is_active && item.change_hash && item.total_changed_days > 0;
    });
    alerts.sort(function (a, b) {
      return String(b.changed_at || '').localeCompare(String(a.changed_at || ''));
    });
    return alerts;
  }

  function getAckKey(empId, month) {
    return ACK_PREFIX + empId + ':' + month;
  }

  function isAcked(empId, alert) {
    return localStorage.getItem(getAckKey(empId, alert.month)) === alert.change_hash;
  }

  function markAcked(empId, alert) {
    localStorage.setItem(getAckKey(empId, alert.month), alert.change_hash);
  }

  function normalizeLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function formatDate(dateValue, lang) {
    try {
      var d = new Date(dateValue + 'T00:00:00');
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', {
        day: 'numeric', month: 'short'
      }).format(d);
    } catch (e) {
      return dateValue;
    }
  }

  function ensureHomeBadge(button, lang) {
    if (!button) return;
    button.classList.add('rca-home-chip');
    if (button.querySelector('.rca-home-badge')) return;
    var badge = document.createElement('span');
    badge.className = 'rca-home-badge';
    badge.textContent = t('badge', lang);
    button.appendChild(badge);
  }

  function removeHomeBadge() {
    document.querySelectorAll('.rca-home-badge').forEach(function (el) { el.remove(); });
  }

  function createBanner(empId, alert, lang, options) {
    if (document.getElementById('rosterChangeBanner')) return;

    var isHome = options && options.home;
    var banner = document.createElement('div');
    banner.id = 'rosterChangeBanner';
    banner.className = 'rca-banner';

    var summaryText = isHome ? t('homeText', lang) : ((alert.summary && (lang === 'ar' ? alert.summary.ar : alert.summary.en)) || t('changed', lang));

    var detailsHtml = (alert.days || []).map(function (item) {
      var dateText = formatDate(item.date, lang);
      var oldLabel = normalizeLabel(item.old_shift_label || item.old_shift_code || '—');
      var newLabel = normalizeLabel(item.new_shift_label || item.new_shift_code || '—');
      return '<li class="rca-item">' +
        '<div class="rca-item-date">' + dateText + '</div>' +
        '<div class="rca-item-shift">' + oldLabel + '<span class="rca-item-arrow">→</span>' + newLabel + '</div>' +
      '</li>';
    }).join('');

    banner.innerHTML = '' +
      '<div class="rca-banner-inner">' +
        '<div class="rca-banner-title">⚠️ ' + t('changed', lang) + '</div>' +
        '<p class="rca-banner-text">' + summaryText + '</p>' +
        '<div class="rca-banner-actions">' +
          (isHome
            ? '<button class="rca-btn rca-btn-primary" type="button" data-action="go">' + t('go', lang) + '</button>'
            : '<button class="rca-btn rca-btn-primary" type="button" data-action="details">' + t('details', lang) + '</button><button class="rca-btn rca-btn-secondary" type="button" data-action="ack">' + t('ack', lang) + '</button>') +
        '</div>' +
        (isHome ? '' : '<ul class="rca-list" id="rosterChangeList">' + detailsHtml + '</ul>') +
      '</div>';

    document.body.appendChild(banner);

    var spacer = document.createElement('div');
    spacer.id = 'rosterChangeSpacer';
    spacer.className = 'rca-page-spacer';
    var first = document.body.firstElementChild;
    if (first) {
      document.body.insertBefore(spacer, first);
    }

    banner.addEventListener('click', function (event) {
      var action = event.target && event.target.getAttribute('data-action');
      if (!action) return;
      if (action === 'go') {
        var url = BASE_PATH + '/my-schedules/index.html?emp=' + encodeURIComponent(empId);
        window.location.href = url;
        return;
      }
      if (action === 'ack') {
        markAcked(empId, alert);
        removeBanner();
        removeHomeBadge();
        return;
      }
      if (action === 'details') {
        var list = document.getElementById('rosterChangeList');
        if (!list) return;
        list.classList.toggle('open');
        event.target.textContent = list.classList.contains('open') ? t('hide', lang) : t('details', lang);
      }
    });
  }

  function removeBanner() {
    var banner = document.getElementById('rosterChangeBanner');
    if (banner) banner.remove();
    var spacer = document.getElementById('rosterChangeSpacer');
    if (spacer) spacer.remove();
  }

  function onHomePage() {
    return /\/roster-site\/(now\/)?$/.test(window.location.pathname) || /\/roster-site\/date\//.test(window.location.pathname);
  }

  function onMySchedulePage() {
    return /\/roster-site\/my-schedules\//.test(window.location.pathname);
  }

  function renderForEmployee(empId) {
    if (!empId || initializedFor === empId) return;
    initializedFor = empId;
    var lang = getLang();
    fetchJson(BASE_PATH + '/schedules/' + encodeURIComponent(empId) + '.json')
      .then(function (data) {
        var alert = sortedActiveAlerts(data).filter(function (item) {
          return !isAcked(empId, item);
        })[0];
        if (!alert) {
          removeHomeBadge();
          removeBanner();
          return;
        }

        if (onHomePage()) {
          ensureHomeBadge(document.getElementById('myScheduleBtn'), lang);
        }
        if (onMySchedulePage()) {
          createBanner(empId, alert, lang, { home: false });
        } else if (onHomePage()) {
          createBanner(empId, alert, lang, { home: true });
        }
      })
      .catch(function () {
        initializedFor = null;
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
