(function () {
  "use strict";

  // ── DATA URL ──────────────────────────────────────────────────────────────
  var DATA_URL = (function () {
    var origin = location.origin;
    var base = location.pathname.includes("/roster-site/") ? origin + "/roster-site" : origin;
    return base + "/absence-data.json";
  })();

  var mState = { empName: "", absences: [], empId: "", hash: "" };

  // ── HELPERS ───────────────────────────────────────────────────────────────
  function norm(s) { return (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, " ").replace(/\s+/g, " ").trim(); }
  function nameMatch(a, b) {
    var na = norm(a), nb = norm(b);
    if (na === nb) return true;
    var wa = na.split(" ").filter(function (w) { return w.length > 3; });
    var wb = nb.split(" ").filter(function (w) { return w.length > 3; });
    return wa.length && wb.length && wa.filter(function (w) { return wb.indexOf(w) !== -1; }).length >= 2;
  }

  function findAbsences(empId, empName, records) {
    var results = [];
    var cleanName = (empName || "").replace(/-\s*\d+\s*$/, "").trim();
    records.forEach(function (rec) {
      var m = false;
      if (empId && rec.empNos && rec.empNos.indexOf(String(empId)) !== -1) {
        results.push({ date: rec.date, absentName: rec.names[rec.empNos.indexOf(String(empId))], section: rec.sections ? rec.sections[rec.empNos.indexOf(String(empId))] : "" });
        m = true;
      }
      if (!m && cleanName) {
        rec.names.forEach(function (n, idx) { if (nameMatch(cleanName, n)) results.push({ date: rec.date, absentName: n, section: rec.sections ? rec.sections[idx] : "" }); });
      }
    });
    return results;
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init() {
    var empId = localStorage.getItem("savedEmpId");
    if (!empId) return;

    var base = location.pathname.includes("/roster-site/") ? location.origin + "/roster-site/" : location.origin + "/";

    Promise.all([
      fetch(base + "schedules/" + empId + ".json").then(function (r) { return r.ok ? r.json() : null; }),
      fetch(DATA_URL + "?v=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }),
    ]).then(function (res) {
      var emp = res[0], absData = res[1];
      if (!emp || !emp.name || !absData || !absData.records) return;

      var absences = findAbsences(empId, emp.name, absData.records);
      if (!absences.length) return;

      mState = { empName: emp.name, absences: absences, empId: empId, hash: absences.map(function(a){return a.date}).join("|") };

      injectStyles();
      buildUI();
    }).catch(function () {});
  }

  // ── STYLES ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-premium-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-premium-styles";
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');

      /* ── Reset & Base ── */
      .abs-font * { box-sizing: border-box; margin: 0; padding: 0; }
      .abs-font { font-family: 'Tajawal', system-ui, sans-serif; direction: rtl; }

      /* ── Pulse Dot ── */
      #abs-dot {
        position: fixed;
        left: 16px;
        top: 16px;
        z-index: 999999;
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #ff3b30, #c0392b);
        border-radius: 50%;
        cursor: pointer;
        display: none;
        border: 3px solid #fff;
        box-shadow: 0 4px 20px rgba(255, 59, 48, 0.45);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        animation: absPulse 2.5s ease-in-out infinite;
      }
      #abs-dot::after {
        content: '⚠️';
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        line-height: 1;
      }
      #abs-dot::before {
        content: '';
        position: absolute;
        inset: -6px;
        border-radius: 50%;
        border: 2px solid rgba(255, 59, 48, 0.4);
        animation: ripple 2.5s ease-in-out infinite;
      }
      #abs-dot:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(255, 59, 48, 0.6); }
      @keyframes absPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.06); }
      }
      @keyframes ripple {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(1.6); opacity: 0; }
      }

      /* ── Overlay ── */
      #abs-overlay {
        position: fixed;
        inset: 0;
        background: rgba(10, 14, 26, 0.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        z-index: 1000000;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 0;
        opacity: 0;
        animation: overlayIn 0.35s ease forwards;
      }
      @media (min-width: 520px) {
        #abs-overlay { align-items: center; padding: 20px; }
      }
      @keyframes overlayIn { to { opacity: 1; } }

      /* ── Modal ── */
      #abs-modal {
        background: #fff;
        border-radius: 28px 28px 0 0;
        width: 100%;
        max-width: 480px;
        box-shadow: 0 -8px 60px rgba(0, 0, 0, 0.18);
        overflow: hidden;
        transform: translateY(100%);
        animation: slideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @media (min-width: 520px) {
        #abs-modal {
          border-radius: 28px;
          transform: translateY(20px) scale(0.97);
          animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          max-height: 90vh;
          overflow-y: auto;
        }
      }
      @keyframes slideUp { to { transform: translateY(0); } }
      @keyframes popIn { to { transform: translateY(0) scale(1); } }

      /* ── Modal Drag Handle (mobile) ── */
      #abs-modal::before {
        content: '';
        display: block;
        width: 44px;
        height: 5px;
        background: #e2e8f0;
        border-radius: 99px;
        margin: 12px auto 0;
      }
      @media (min-width: 520px) {
        #abs-modal::before { display: none; }
      }

      /* ── Header ── */
      .abs-head {
        padding: 20px 24px 0;
        text-align: center;
      }
      .abs-head-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #fff1f1;
        border: 1px solid #fecaca;
        color: #dc2626;
        font-size: 12px;
        font-weight: 800;
        padding: 6px 14px;
        border-radius: 99px;
        letter-spacing: 0.5px;
        margin-bottom: 14px;
        text-transform: uppercase;
      }
      .abs-head-badge span { font-size: 14px; }
      .abs-head h2 {
        font-size: 22px;
        font-weight: 900;
        color: #0f172a;
        line-height: 1.2;
        margin-bottom: 6px;
      }
      .abs-head p {
        font-size: 14px;
        color: #64748b;
        font-weight: 500;
        line-height: 1.5;
      }

      /* ── Divider ── */
      .abs-divider {
        height: 1px;
        background: linear-gradient(to right, transparent, #e2e8f0, transparent);
        margin: 20px 0;
      }

      /* ── Body ── */
      .abs-body { padding: 0 20px 28px; }

      /* ── Count Badge ── */
      .abs-count-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .abs-count-label {
        font-size: 13px;
        font-weight: 700;
        color: #475569;
      }
      .abs-count-pill {
        background: #dc2626;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        padding: 3px 10px;
        border-radius: 99px;
      }

      /* ── Absence List ── */
      .abs-list {
        max-height: 200px;
        overflow-y: auto;
        margin-bottom: 20px;
        padding-left: 2px;
        scrollbar-width: thin;
        scrollbar-color: #e2e8f0 transparent;
      }
      .abs-list::-webkit-scrollbar { width: 4px; }
      .abs-list::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }

      /* ── Absence Row ── */
      .ab-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        background: #fafafa;
        border: 1.5px solid #f1f5f9;
        border-radius: 14px;
        margin-bottom: 8px;
        transition: all 0.2s ease;
      }
      .ab-row:last-child { margin-bottom: 0; }
      .ab-row:hover { background: #fff5f5; border-color: #fecaca; transform: translateX(-2px); }
      .ab-row-icon {
        width: 38px;
        height: 38px;
        background: #fee2e2;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
      }
      .ab-row-info { flex: 1; min-width: 0; }
      .ab-date {
        font-size: 15px;
        font-weight: 800;
        color: #0f172a;
        display: block;
      }
      .ab-sub {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 500;
        margin-top: 1px;
        display: block;
      }
      .ab-status {
        background: #fff1f1;
        color: #dc2626;
        font-size: 11px;
        font-weight: 800;
        padding: 4px 10px;
        border-radius: 8px;
        border: 1px solid #fecaca;
        white-space: nowrap;
        flex-shrink: 0;
      }

      /* ── Checkbox ── */
      .abs-check-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px;
        background: #f8fafc;
        border: 1.5px solid #e8eef4;
        border-radius: 14px;
        cursor: pointer;
        margin-bottom: 16px;
        transition: all 0.2s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .abs-check-row:hover { background: #f1f5f9; border-color: #cbd5e1; }
      .abs-check-row input[type="checkbox"] {
        width: 20px;
        height: 20px;
        accent-color: #dc2626;
        cursor: pointer;
        flex-shrink: 0;
        margin-top: 1px;
      }
      .abs-check-text {
        font-size: 13px;
        color: #475569;
        font-weight: 600;
        line-height: 1.5;
        user-select: none;
      }

      /* ── Close Button ── */
      #abs-main-close {
        width: 100%;
        padding: 17px;
        border-radius: 16px;
        border: none;
        background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
        color: #fff;
        font-size: 16px;
        font-weight: 800;
        font-family: 'Tajawal', sans-serif;
        cursor: pointer;
        box-shadow: 0 8px 24px -4px rgba(220, 38, 38, 0.45);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        -webkit-tap-highlight-color: transparent;
        letter-spacing: 0.3px;
      }
      #abs-main-close:hover { transform: translateY(-2px); box-shadow: 0 12px 28px -6px rgba(220, 38, 38, 0.55); }
      #abs-main-close:active { transform: scale(0.97); box-shadow: 0 4px 12px -2px rgba(220, 38, 38, 0.4); }

      /* ── Sidebar ── */
      #abs-sb {
        position: fixed;
        right: -340px;
        left: auto;
        top: 0;
        height: 100%;
        width: min(320px, 88vw);
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: -8px 0 40px rgba(0, 0, 0, 0.12);
        transition: right 0.45s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 1000001;
        display: flex;
        flex-direction: column;
        border-left: 1px solid rgba(255, 255, 255, 0.6);
      }
      #abs-sb.open { right: 0; }

      .sb-header {
        padding: 20px 18px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #f1f5f9;
        background: #fff;
      }
      .sb-title {
        font-size: 16px;
        font-weight: 800;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sb-title-dot {
        width: 10px;
        height: 10px;
        background: #ef4444;
        border-radius: 50%;
        animation: absPulse 2s infinite;
      }
      .sb-close-icon {
        background: #f1f5f9;
        border: none;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #64748b;
        font-size: 16px;
        font-weight: 700;
        transition: all 0.2s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .sb-close-icon:hover { background: #fee2e2; color: #dc2626; transform: rotate(90deg); }

      .sb-content { padding: 18px; flex: 1; overflow-y: auto; }

      .sb-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 13px;
        background: #fff;
        border: 1.5px solid #f1f5f9;
        border-radius: 12px;
        margin-bottom: 8px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      }
      .sb-row-icon { font-size: 16px; }
      .sb-row-date { font-size: 14px; font-weight: 800; color: #0f172a; }
      .sb-row-badge { font-size: 11px; color: #dc2626; background: #fff1f1; border: 1px solid #fecaca; padding: 3px 8px; border-radius: 6px; font-weight: 700; margin-right: auto; }

      .sb-btn {
        width: 100%;
        padding: 15px;
        margin-top: 14px;
        border-radius: 14px;
        border: none;
        cursor: pointer;
        font-weight: 800;
        font-family: 'Tajawal', sans-serif;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .btn-restore {
        background: #0f172a;
        color: #fff;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.2);
      }
      .btn-restore:hover { background: #1e293b; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(15, 23, 42, 0.3); }
      .btn-restore:active { transform: scale(0.97); }

      /* ── Safe area support ── */
      @supports (padding-bottom: env(safe-area-inset-bottom)) {
        .abs-body { padding-bottom: calc(28px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(s);
  }

  // ── UI BUILDERS ──────────────────────────────────────────────────────────
  function buildUI() {
    // 1. Pulse Dot
    var dot = document.createElement("div");
    dot.id = "abs-dot";
    document.body.appendChild(dot);

    // 2. Sidebar
    var sb = document.createElement("div");
    sb.id = "abs-sb";
    sb.className = "abs-font";

    var sbRows = mState.absences.map(function(a) {
      return '<div class="sb-row">' +
        '<span class="sb-row-icon">📅</span>' +
        '<span class="sb-row-date">' + a.date + '</span>' +
        '<span class="sb-row-badge">غياب</span>' +
      '</div>';
    }).join("");

    sb.innerHTML =
      '<div class="sb-header">' +
        '<div class="sb-title"><div class="sb-title-dot"></div> تنبيه غياب</div>' +
        '<button class="sb-close-icon" id="sb-close-btn">✕</button>' +
      '</div>' +
      '<div class="sb-content">' +
        sbRows +
        '<button class="sb-btn btn-restore" id="sb-restore">🔄 استعادة النافذة</button>' +
      '</div>';
    document.body.appendChild(sb);

    // 3. Check dismissed state
    var isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;

    if (isDismissed) {
      dot.style.display = "block";
    } else {
      showMainModal();
    }

    // 4. Events
    dot.onclick = function() { sb.classList.add("open"); };
    document.getElementById("sb-close-btn").onclick = function() { sb.classList.remove("open"); };
    document.getElementById("sb-restore").onclick = function() {
      localStorage.removeItem("absDismissed_" + mState.empId);
      sb.classList.remove("open");
      document.getElementById("abs-dot").style.display = "none";
      setTimeout(showMainModal, 350);
    };
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    var count = mState.absences.length;
    var firstName = mState.empName.split(' ')[0];

    var rows = mState.absences.map(function(a) {
      return '<div class="ab-row">' +
        '<div class="ab-row-icon">📅</div>' +
        '<div class="ab-row-info">' +
          '<span class="ab-date">' + a.date + '</span>' +
          '<span class="ab-sub">غياب مسجل في السجل الرسمي</span>' +
        '</div>' +
        '<span class="ab-status">غياب</span>' +
      '</div>';
    }).join("");

    var ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";

    ov.innerHTML =
      '<div id="abs-modal">' +
        '<div class="abs-head">' +
          '<div class="abs-head-badge"><span>⚠️</span> تنبيه إداري</div>' +
          '<h2>لديك ' + count + (count === 1 ? ' يوم غياب' : ' أيام غياب') + ' مسجّل</h2>' +
          '<p>مرحباً <b>' + firstName + '</b>، يُرجى مراجعة سجل الحضور الخاص بك</p>' +
        '</div>' +
        '<div class="abs-divider"></div>' +
        '<div class="abs-body">' +
          '<div class="abs-count-row">' +
            '<span class="abs-count-label">التواريخ المسجّلة</span>' +
            '<span class="abs-count-pill">' + count + ' ' + (count === 1 ? 'يوم' : 'أيام') + '</span>' +
          '</div>' +
          '<div class="abs-list">' + rows + '</div>' +
          '<label class="abs-check-row">' +
            '<input type="checkbox" id="abs-hide-check">' +
            '<span class="abs-check-text">عدم إظهار هذه النافذة مجدداً وتحويلها لنقطة تنبيه صغيرة</span>' +
          '</label>' +
          '<button id="abs-main-close">حسناً، فهمت ✓</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);

    document.getElementById("abs-main-close").onclick = function() {
      var isChecked = document.getElementById("abs-hide-check").checked;
      ov.style.transition = "opacity 0.3s ease";
      ov.style.opacity = "0";
      document.getElementById("abs-modal").style.transition = "transform 0.3s cubic-bezier(0.4, 0, 1, 1)";
      document.getElementById("abs-modal").style.transform = "translateY(100%)";
      setTimeout(function() {
        if (isChecked) {
          localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
          document.getElementById("abs-dot").style.display = "block";
        }
        ov.remove();
      }, 320);
    };
  }

  // ── BOOT ──────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();
